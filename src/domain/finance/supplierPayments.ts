import type { CurrencyCode, PaymentMethod, SupplierPayment } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import { businessStamp, type DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from './audit'
import { obligationFinancials, supplierPaymentUnallocated } from './derive'
import { addMoney, cmpMoney, isMoney, subMoney } from './money'
import { nextNumber } from './numbering'

export interface SupplierAllocationInput {
  obligationId: string
  amount: number
  /** Required when paying before the agreed condition (e.g. client collection) is met. */
  conditionOverride?: string
}

export interface SupplierPaymentInput {
  supplierId: string
  date: string
  currency: CurrencyCode | ''
  amount: number
  method: PaymentMethod
  reference?: string
  notes?: string
  allocations: SupplierAllocationInput[]
  /** Phase 4.8: every advance (unallocated remainder) belongs to a project. */
  projectId?: string
  serviceId?: string
  exchangeRateId?: string
}

function validateAllocations(ds: Dataset, supplierId: string, currency: CurrencyCode | '', allocations: SupplierAllocationInput[], available: number, today: string, f: Record<string, string>) {
  const seen = new Set<string>()
  allocations.forEach((a, i) => {
    if (seen.has(a.obligationId)) f[`allocations.${i}.obligationId`] = 'Obligación repetida.'
    seen.add(a.obligationId)
    const ob = findById(ds.obligations, a.obligationId)
    if (!ob || ob.supplierId !== supplierId) {
      f[`allocations.${i}.obligationId`] = 'La obligación no pertenece al proveedor.'
      return
    }
    if (ob.lifecycle !== 'approved') f[`allocations.${i}.obligationId`] = ob.lifecycle === 'cancelled' ? 'Obligación anulada.' : 'Aprobá la obligación antes de pagarla.'
    if (currency && ob.currency !== currency) f[`allocations.${i}.obligationId`] = `La obligación está en ${ob.currency}.`
    if (!isMoney(a.amount) || a.amount <= 0) {
      f[`allocations.${i}.amount`] = 'Monto mayor a cero (hasta 2 decimales).'
      return
    }
    const fin = obligationFinancials(ds, ob, today)
    if (cmpMoney(a.amount, fin.outstanding) > 0) f[`allocations.${i}.amount`] = `Supera el saldo pendiente (${ob.currency} ${fin.outstanding}).`
    if (!fin.conditionMet && !a.conditionOverride?.trim()) f[`allocations.${i}.conditionOverride`] = `${fin.conditionNote}. Para pagar antes, indicá el motivo.`
  })
  const total = addMoney(...allocations.filter((a) => isMoney(a.amount)).map((a) => a.amount))
  if (cmpMoney(total, available) > 0) f.allocations = `Las aplicaciones (${total}) superan el monto del pago (${available}).`
}

export function validateSupplierPayment(ds: Dataset, input: SupplierPaymentInput, today: string): Record<string, string> {
  const f: Record<string, string> = {}
  if (!ds.suppliers.some((s) => s.id === input.supplierId)) f.supplierId = 'Elegí el proveedor.'
  if (!isIsoDate(input.date)) f.date = 'Fecha inválida.'
  else if (input.date > today) f.date = 'No puede ser una fecha futura.'
  if (!input.currency) f.currency = 'Elegí la moneda.'
  if (!isMoney(input.amount) || input.amount <= 0) f.amount = 'Monto mayor a cero (hasta 2 decimales).'
  if ((input.reference?.length ?? 0) > 60) f.reference = 'Máximo 60 caracteres.'
  if (input.exchangeRateId && !ds.exchangeRates.some((r) => r.id === input.exchangeRateId)) f.exchangeRateId = 'Tipo de cambio inexistente.'
  validateAllocations(ds, input.supplierId, input.currency, input.allocations, isMoney(input.amount) ? input.amount : 0, today, f)
  // Any remainder is an advance: it must be tied to a specific project (confirmed rule).
  const allocated = addMoney(...input.allocations.filter((a) => isMoney(a.amount)).map((a) => a.amount))
  const remainder = isMoney(input.amount) ? subMoney(input.amount, allocated) : 0
  if (cmpMoney(remainder, 0) > 0 && !input.projectId) f.projectId = 'El importe no aplicado es un anticipo: elegí el proyecto al que corresponde.'
  if (input.projectId && !ds.projects.some((p) => p.id === input.projectId)) f.projectId = 'El proyecto no existe.'
  if (input.serviceId && !ds.services.some((s) => s.id === input.serviceId && s.projectId === input.projectId)) f.serviceId = 'El servicio no pertenece al proyecto.'
  return f
}

/** Records money paid to a supplier; an unallocated remainder is an explicit advance. */
export function recordSupplierPayment(ds: Dataset, input: SupplierPaymentInput, requestId: string, ctx: DomainContext): { ds: Dataset; paymentId: string; duplicate: boolean } {
  const existing = ds.requests[requestId]
  if (existing && ds.supplierPayments.some((p) => p.id === existing)) return { ds, paymentId: existing, duplicate: true }
  const fields = validateSupplierPayment(ds, input, ctx.today())
  if (Object.keys(fields).length) throw new DomainError('Revisá el pago.', fields)
  const hasAdvance = cmpMoney(subMoney(input.amount, addMoney(...input.allocations.map((a) => a.amount))), 0) > 0
  const payment: SupplierPayment = {
    id: ctx.newId('spay'),
    number: nextNumber(ds.supplierPayments.map((p) => p.number), 'PAG', ctx.today()),
    supplierId: input.supplierId,
    date: input.date,
    currency: input.currency as CurrencyCode,
    amount: input.amount,
    method: input.method,
    reference: input.reference?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    allocations: input.allocations.map((a) => ({ id: ctx.newId('spa'), obligationId: a.obligationId, amount: a.amount, conditionOverride: a.conditionOverride?.trim() || undefined, source: 'payment' as const, date: input.date })),
    projectId: hasAdvance ? input.projectId : undefined,
    serviceId: hasAdvance ? input.serviceId || undefined : undefined,
    history: [{ id: ctx.newId('sph'), date: businessStamp(ctx), action: hasAdvance ? 'Pago registrado con anticipo' : 'Pago registrado', detail: `${input.currency} ${input.amount}` }],
    fx: input.exchangeRateId ? { exchangeRateId: input.exchangeRateId } : undefined,
    status: 'recorded',
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  let next: Dataset = { ...ds, supplierPayments: [...ds.supplierPayments, payment], requests: { ...ds.requests, [requestId]: payment.id } }
  const supplier = findById(ds.suppliers, payment.supplierId)!
  next = appendAudit(next, { entity: 'supplier-payment', entityId: payment.id, action: 'record', detail: `${payment.number} a ${supplier.name}: ${payment.currency} ${payment.amount}` }, ctx)
  for (const a of payment.allocations) {
    const ob = findById(ds.obligations, a.obligationId)!
    if (ob.projectId) next = logActivity(next, { projectId: ob.projectId, kind: 'finance', message: `Pago ${payment.number} a ${supplier.name} (${ob.reference}): ${payment.currency} ${a.amount}${a.conditionOverride ? ` — pago anticipado: ${a.conditionOverride}` : ''}.` }, ctx)
  }
  if (payment.projectId) {
    const adv = advanceInfo(payment)
    if (adv) next = logActivity(next, { projectId: payment.projectId, serviceId: payment.serviceId, kind: 'finance', message: `Anticipo ${payment.number} a ${supplier.name}: ${payment.currency} ${adv.given} (dinero entregado, no es un costo).` }, ctx)
  }
  return { ds: next, paymentId: payment.id, duplicate: false }
}

/**
 * Applies (part of) an advance to obligations of the SAME supplier, project and
 * currency. It records no new cash outflow: the money left when the advance was paid.
 */
export function applySupplierAdvance(ds: Dataset, paymentId: string, allocations: SupplierAllocationInput[], ctx: DomainContext): Dataset {
  const p = findById(ds.supplierPayments, paymentId)
  if (!p) throw new DomainError('El pago no existe.')
  if (p.status !== 'recorded') throw new DomainError('El pago fue revertido.')
  if (!p.projectId) throw new DomainError('Este anticipo histórico no tiene proyecto: asignale el proyecto antes de aplicarlo.')
  const f: Record<string, string> = {}
  if (allocations.length === 0) f.allocations = 'Elegí al menos una obligación.'
  allocations.forEach((a, i) => {
    const ob = findById(ds.obligations, a.obligationId)
    if (ob && ob.projectId !== p.projectId) f[`allocations.${i}.obligationId`] = 'La obligación es de otro proyecto: los anticipos no se aplican entre proyectos.'
  })
  validateAllocations(ds, p.supplierId, p.currency, allocations, supplierPaymentUnallocated(p), ctx.today(), f)
  if (Object.keys(f).length) throw new DomainError('Revisá la aplicación del anticipo.', f)
  const total = addMoney(...allocations.map((a) => a.amount))
  const next: Dataset = {
    ...ds,
    supplierPayments: replaceById(ds.supplierPayments, paymentId, (x) => ({
      ...x,
      allocations: [...x.allocations, ...allocations.map((a) => ({ id: ctx.newId('spa'), obligationId: a.obligationId, amount: a.amount, conditionOverride: a.conditionOverride?.trim() || undefined, source: 'advance' as const, date: ctx.today() }))],
      history: [{ id: ctx.newId('sph'), date: businessStamp(ctx), action: 'Anticipo aplicado', detail: `${x.currency} ${total} a ${allocations.map((a) => findById(ds.obligations, a.obligationId)?.reference).join(', ')}` }, ...(x.history ?? [])],
    })),
  }
  return appendAudit(next, { entity: 'supplier-payment', entityId: paymentId, action: 'apply-advance', detail: `Anticipo aplicado: ${p.currency} ${total}` }, ctx)
}

/** Correction of an advance application: the record is kept as reversed and the advance becomes available again. */
export function revertAdvanceApplication(ds: Dataset, paymentId: string, allocationId: string, reason: string, ctx: DomainContext): Dataset {
  const p = findById(ds.supplierPayments, paymentId)
  const a = p?.allocations.find((x) => x.id === allocationId)
  if (!p || !a) throw new DomainError('La aplicación no existe.')
  if (a.source !== 'advance') throw new DomainError('Solo se corrigen aplicaciones de anticipos; para un pago, revertí el pago completo.')
  if (a.reversedAt) throw new DomainError('La aplicación ya fue corregida.')
  if (!reason.trim()) throw new DomainError('Indicá el motivo.', { reason: 'Indicá el motivo.' })
  const next: Dataset = {
    ...ds,
    supplierPayments: replaceById(ds.supplierPayments, paymentId, (x) => ({
      ...x,
      allocations: x.allocations.map((y) => (y.id === allocationId ? { ...y, reversedAt: ctx.today(), reversalReason: reason.trim() } : y)),
      history: [{ id: ctx.newId('sph'), date: businessStamp(ctx), action: 'Aplicación de anticipo corregida', detail: `${x.currency} ${a.amount}: ${reason.trim()}` }, ...(x.history ?? [])],
    })),
  }
  return appendAudit(next, { entity: 'supplier-payment', entityId: paymentId, action: 'revert-advance', detail: reason.trim() }, ctx)
}

/** Historical advances without project: assign one explicitly (never inferred). */
export function assignAdvanceProject(ds: Dataset, paymentId: string, projectId: string, serviceId: string | undefined, reason: string, ctx: DomainContext): Dataset {
  const p = findById(ds.supplierPayments, paymentId)
  if (!p) throw new DomainError('El pago no existe.')
  if (p.projectId) throw new DomainError('El anticipo ya tiene proyecto.')
  if (cmpMoney(supplierPaymentUnallocated(p), 0) <= 0) throw new DomainError('El pago no tiene saldo de anticipo.')
  const f: Record<string, string> = {}
  if (!ds.projects.some((x) => x.id === projectId)) f.projectId = 'Elegí el proyecto.'
  if (serviceId && !ds.services.some((s) => s.id === serviceId && s.projectId === projectId)) f.serviceId = 'El servicio no pertenece al proyecto.'
  if (!reason.trim()) f.reason = 'Indicá el motivo.'
  if (Object.keys(f).length) throw new DomainError('Revisá el anticipo.', f)
  const next: Dataset = {
    ...ds,
    supplierPayments: replaceById(ds.supplierPayments, paymentId, (x) => ({ ...x, projectId, serviceId, history: [{ id: ctx.newId('sph'), date: businessStamp(ctx), action: 'Proyecto del anticipo asignado', detail: reason.trim() }, ...(x.history ?? [])] })),
  }
  return appendAudit(next, { entity: 'supplier-payment', entityId: paymentId, action: 'assign-project', detail: reason.trim() }, ctx)
}

export type AdvanceStatus = 'unapplied' | 'partial' | 'applied'

export interface AdvanceInfo {
  /** Money handed over beyond what was applied when paying (the advance). */
  given: number
  applied: number
  available: number
  status: AdvanceStatus
}

/** Advance part of a supplier payment; undefined when the payment had no remainder. */
export function advanceInfo(p: SupplierPayment): AdvanceInfo | undefined {
  if (p.status !== 'recorded') return undefined
  const atPayment = addMoney(...p.allocations.filter((a) => a.source !== 'advance' && !a.reversedAt).map((a) => a.amount))
  const given = subMoney(p.amount, atPayment)
  if (cmpMoney(given, 0) <= 0) return undefined
  const applied = addMoney(...p.allocations.filter((a) => a.source === 'advance' && !a.reversedAt).map((a) => a.amount))
  const available = subMoney(given, applied)
  return { given, applied, available, status: cmpMoney(applied, 0) === 0 ? 'unapplied' : cmpMoney(available, 0) > 0 ? 'partial' : 'applied' }
}

/** Recorded payments that look duplicated (same supplier, date, currency, amount and reference). Flagged for review, never deleted. */
export function possibleDuplicatePayments(ds: Pick<Dataset, 'supplierPayments'>): Set<string> {
  const groups = new Map<string, string[]>()
  for (const p of ds.supplierPayments) {
    if (p.status !== 'recorded') continue
    const k = [p.supplierId, p.date, p.currency, p.amount, (p.reference ?? '').trim().toUpperCase()].join('|')
    groups.set(k, [...(groups.get(k) ?? []), p.id])
  }
  return new Set([...groups.values()].filter((g) => g.length > 1).flat())
}

/** Reversal keeps the payment for history and stops counting it. */
export function reverseSupplierPayment(ds: Dataset, paymentId: string, reason: string, ctx: DomainContext): Dataset {
  const p = findById(ds.supplierPayments, paymentId)
  if (!p) throw new DomainError('El pago no existe.')
  if (p.status === 'reversed') return ds
  if (!reason.trim()) throw new DomainError('Indicá el motivo de la reversión.', { reason: 'Indicá el motivo.' })
  const next: Dataset = { ...ds, supplierPayments: replaceById(ds.supplierPayments, paymentId, (x) => ({ ...x, status: 'reversed', reversedAt: ctx.today(), reversalReason: reason.trim() })) }
  return appendAudit(next, { entity: 'supplier-payment', entityId: paymentId, action: 'reverse', detail: reason.trim() }, ctx)
}
