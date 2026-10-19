import type { CurrencyCode, PaymentMethod, SupplierPayment } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from './audit'
import { obligationFinancials, supplierPaymentUnallocated } from './derive'
import { addMoney, cmpMoney, isMoney } from './money'
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
  return f
}

/** Records money paid to a supplier; an unallocated remainder is an explicit advance. */
export function recordSupplierPayment(ds: Dataset, input: SupplierPaymentInput, requestId: string, ctx: DomainContext): { ds: Dataset; paymentId: string; duplicate: boolean } {
  const existing = ds.requests[requestId]
  if (existing && ds.supplierPayments.some((p) => p.id === existing)) return { ds, paymentId: existing, duplicate: true }
  const fields = validateSupplierPayment(ds, input, ctx.today())
  if (Object.keys(fields).length) throw new DomainError('Revisá el pago.', fields)
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
    allocations: input.allocations.map((a) => ({ id: ctx.newId('spa'), obligationId: a.obligationId, amount: a.amount, conditionOverride: a.conditionOverride?.trim() || undefined })),
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
  return { ds: next, paymentId: payment.id, duplicate: false }
}

export function applySupplierAdvance(ds: Dataset, paymentId: string, allocations: SupplierAllocationInput[], ctx: DomainContext): Dataset {
  const p = findById(ds.supplierPayments, paymentId)
  if (!p) throw new DomainError('El pago no existe.')
  if (p.status !== 'recorded') throw new DomainError('El pago fue revertido.')
  const f: Record<string, string> = {}
  if (allocations.length === 0) f.allocations = 'Elegí al menos una obligación.'
  validateAllocations(ds, p.supplierId, p.currency, allocations, supplierPaymentUnallocated(p), ctx.today(), f)
  if (Object.keys(f).length) throw new DomainError('Revisá la aplicación del anticipo.', f)
  const next: Dataset = {
    ...ds,
    supplierPayments: replaceById(ds.supplierPayments, paymentId, (x) => ({
      ...x,
      allocations: [...x.allocations, ...allocations.map((a) => ({ id: ctx.newId('spa'), obligationId: a.obligationId, amount: a.amount, conditionOverride: a.conditionOverride?.trim() || undefined }))],
    })),
  }
  return appendAudit(next, { entity: 'supplier-payment', entityId: paymentId, action: 'apply-advance', detail: `Anticipo aplicado a ${allocations.length} obligación(es)` }, ctx)
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
