import type { CollectionActionKind, CurrencyCode, CustomerReceipt, PaymentMethod, Withholding, WithholdingType } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import { businessStamp, type DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from './audit'
import { invoiceFinancials, receiptUnallocated } from './derive'
import { addMoney, cmpMoney, isMoney } from './money'
import { nextNumber } from './numbering'

export interface AllocationInput {
  invoiceId: string
  amount: number
}

export interface ReceiptInput {
  clientId: string
  date: string
  currency: CurrencyCode | ''
  amount: number
  method: PaymentMethod
  reference?: string
  notes?: string
  allocations: AllocationInput[]
  /** Documented withholdings (entered as received; never computed). */
  withholdings?: WithholdingInput[]
  exchangeRateId?: string
}

export interface WithholdingInput {
  type: WithholdingType
  invoiceId: string
  amount: number
  jurisdiction?: string
  certificateRef?: string
  notes?: string
}

const WH_TYPES: WithholdingType[] = ['iva', 'ganancias', 'iibb', 'other']

/**
 * Withholdings must target issued invoices of the same client and currency. Cash
 * allocations plus withholdings can never exceed an invoice's balance.
 */
function validateWithholdings(ds: Dataset, clientId: string, currency: CurrencyCode | '', items: WithholdingInput[], allocations: AllocationInput[], today: string, f: Record<string, string>) {
  const perInvoice = new Map<string, number>()
  for (const a of allocations) if (isMoney(a.amount)) perInvoice.set(a.invoiceId, addMoney(perInvoice.get(a.invoiceId) ?? 0, a.amount))
  items.forEach((w, i) => {
    const k = (x: string) => `withholdings.${i}.${x}`
    if (!WH_TYPES.includes(w.type)) f[k('type')] = 'Elegí el tipo.'
    const inv = findById(ds.invoices, w.invoiceId)
    if (!inv || inv.clientId !== clientId) f[k('invoiceId')] = 'Elegí una factura del cliente.'
    else if (inv.lifecycle !== 'issued') f[k('invoiceId')] = 'Solo facturas emitidas.'
    else if (currency && inv.currency !== currency) f[k('invoiceId')] = `La factura está en ${inv.currency}.`
    if (!isMoney(w.amount) || w.amount <= 0) f[k('amount')] = 'Importe mayor a cero (hasta 2 decimales), según el certificado recibido.'
    if ((w.jurisdiction?.length ?? 0) > 60) f[k('jurisdiction')] = 'Máximo 60 caracteres.'
    if ((w.certificateRef?.length ?? 0) > 60) f[k('certificateRef')] = 'Máximo 60 caracteres.'
    if (inv && isMoney(w.amount)) perInvoice.set(inv.id, addMoney(perInvoice.get(inv.id) ?? 0, w.amount))
  })
  for (const [invoiceId, total] of perInvoice) {
    const inv = findById(ds.invoices, invoiceId)
    if (!inv || inv.lifecycle !== 'issued') continue
    const outstanding = invoiceFinancials(ds, inv, today).outstanding
    if (cmpMoney(total, outstanding) > 0) f[items.length ? 'withholdings' : 'allocations'] = `Cobros y retenciones aplicados a ${inv.number} (${total}) superan su saldo (${inv.currency} ${outstanding}).`
  }
}

const buildWithholdings = (items: WithholdingInput[], ctx: DomainContext): Withholding[] =>
  items.map((w) => ({
    id: ctx.newId('ret'),
    type: w.type,
    invoiceId: w.invoiceId,
    amount: w.amount,
    jurisdiction: w.jurisdiction?.trim() || undefined,
    certificateRef: w.certificateRef?.trim() || undefined,
    notes: w.notes?.trim() || undefined,
    createdAt: businessStamp(ctx),
  }))

/** Allocations must target issued invoices of the client in the same currency, within their balance. */
function validateAllocations(ds: Dataset, clientId: string, currency: CurrencyCode | '', allocations: AllocationInput[], available: number, today: string, f: Record<string, string>) {
  const seen = new Set<string>()
  allocations.forEach((a, i) => {
    const k = `allocations.${i}.amount`
    if (seen.has(a.invoiceId)) f[`allocations.${i}.invoiceId`] = 'Factura repetida.'
    seen.add(a.invoiceId)
    const inv = findById(ds.invoices, a.invoiceId)
    if (!inv || inv.clientId !== clientId) {
      f[`allocations.${i}.invoiceId`] = 'La factura no pertenece al cliente.'
      return
    }
    if (inv.lifecycle !== 'issued') f[`allocations.${i}.invoiceId`] = 'Solo se cobran facturas emitidas.'
    if (currency && inv.currency !== currency) f[`allocations.${i}.invoiceId`] = `La factura está en ${inv.currency}: no se aplican cobros de otra moneda.`
    if (!isMoney(a.amount) || a.amount <= 0) {
      f[k] = 'Monto mayor a cero (hasta 2 decimales).'
      return
    }
    const outstanding = invoiceFinancials(ds, inv, today).outstanding
    if (cmpMoney(a.amount, outstanding) > 0) f[k] = `Supera el saldo de ${inv.number} (${inv.currency} ${outstanding}).`
  })
  const total = addMoney(...allocations.filter((a) => isMoney(a.amount)).map((a) => a.amount))
  if (cmpMoney(total, available) > 0) f.allocations = `Las aplicaciones (${total}) superan el monto disponible (${available}).`
}

export function validateReceipt(ds: Dataset, input: ReceiptInput, today: string): Record<string, string> {
  const f: Record<string, string> = {}
  if (!ds.clients.some((c) => c.id === input.clientId)) f.clientId = 'Elegí el cliente.'
  if (!isIsoDate(input.date)) f.date = 'Fecha inválida.'
  else if (input.date > today) f.date = 'No puede ser una fecha futura.'
  if (!input.currency) f.currency = 'Elegí la moneda.'
  if (!isMoney(input.amount) || input.amount <= 0) f.amount = 'Monto mayor a cero (hasta 2 decimales).'
  if ((input.reference?.length ?? 0) > 60) f.reference = 'Máximo 60 caracteres.'
  if (input.exchangeRateId && !ds.exchangeRates.some((r) => r.id === input.exchangeRateId)) f.exchangeRateId = 'Tipo de cambio inexistente.'
  if (input.reference?.trim() && ds.receipts.some((r) => r.status === 'recorded' && r.clientId === input.clientId && r.reference?.trim().toUpperCase() === input.reference?.trim().toUpperCase())) {
    f.reference = 'Ya hay un cobro registrado con esta referencia para el cliente.'
  }
  validateAllocations(ds, input.clientId, input.currency, input.allocations, isMoney(input.amount) ? input.amount : 0, today, f)
  validateWithholdings(ds, input.clientId, input.currency, input.withholdings ?? [], input.allocations, today, f)
  return f
}

/** Records money received. Any unallocated remainder stays as explicit client credit. */
export function recordReceipt(ds: Dataset, input: ReceiptInput, requestId: string, ctx: DomainContext): { ds: Dataset; receiptId: string; duplicate: boolean } {
  const existing = ds.requests[requestId]
  if (existing && ds.receipts.some((r) => r.id === existing)) return { ds, receiptId: existing, duplicate: true }
  const fields = validateReceipt(ds, input, ctx.today())
  if (Object.keys(fields).length) throw new DomainError('Revisá el cobro.', fields)
  const receipt: CustomerReceipt = {
    id: ctx.newId('rec'),
    number: nextNumber(ds.receipts.map((r) => r.number), 'REC', ctx.today()),
    clientId: input.clientId,
    date: input.date,
    currency: input.currency as CurrencyCode,
    amount: input.amount,
    method: input.method,
    reference: input.reference?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    allocations: input.allocations.map((a) => ({ id: ctx.newId('ra'), invoiceId: a.invoiceId, amount: a.amount, date: input.date })),
    withholdings: input.withholdings?.length ? buildWithholdings(input.withholdings, ctx) : undefined,
    fx: input.exchangeRateId ? { exchangeRateId: input.exchangeRateId } : undefined,
    status: 'recorded',
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  let next: Dataset = { ...ds, receipts: [...ds.receipts, receipt], requests: { ...ds.requests, [requestId]: receipt.id } }
  next = appendAudit(next, { entity: 'receipt', entityId: receipt.id, action: 'record', detail: `${receipt.number}: ${receipt.currency} ${receipt.amount}, aplicado a ${receipt.allocations.length} factura(s)` }, ctx)
  for (const a of receipt.allocations) {
    const inv = findById(ds.invoices, a.invoiceId)!
    next = logActivity(next, { projectId: inv.projectId, kind: 'finance', message: `Cobro ${receipt.number} aplicado a ${inv.number}: ${receipt.currency} ${a.amount}.` }, ctx)
  }
  return { ds: next, receiptId: receipt.id, duplicate: false }
}

/** Applies part of a receipt's unallocated credit to invoices. */
export function applyReceiptCredit(ds: Dataset, receiptId: string, allocations: AllocationInput[], ctx: DomainContext): Dataset {
  const r = findById(ds.receipts, receiptId)
  if (!r) throw new DomainError('El cobro no existe.')
  if (r.status !== 'recorded') throw new DomainError('El cobro fue revertido.')
  const f: Record<string, string> = {}
  if (allocations.length === 0) f.allocations = 'Elegí al menos una factura.'
  validateAllocations(ds, r.clientId, r.currency, allocations, receiptUnallocated(r), ctx.today(), f)
  if (Object.keys(f).length) throw new DomainError('Revisá la aplicación del saldo a favor.', f)
  let next: Dataset = {
    ...ds,
    receipts: replaceById(ds.receipts, receiptId, (x) => ({ ...x, allocations: [...x.allocations, ...allocations.map((a) => ({ id: ctx.newId('ra'), invoiceId: a.invoiceId, amount: a.amount, date: ctx.today() }))] })),
  }
  next = appendAudit(next, { entity: 'receipt', entityId: receiptId, action: 'apply-credit', detail: `Saldo a favor aplicado a ${allocations.length} factura(s)` }, ctx)
  for (const a of allocations) {
    const inv = findById(ds.invoices, a.invoiceId)!
    next = logActivity(next, { projectId: inv.projectId, kind: 'finance', message: `Saldo a favor de ${r.number} aplicado a ${inv.number}: ${r.currency} ${a.amount}.` }, ctx)
  }
  return next
}

/** Reversal keeps the record (and its allocations) for history; it stops counting as paid. */
export function reverseReceipt(ds: Dataset, receiptId: string, reason: string, ctx: DomainContext): Dataset {
  const r = findById(ds.receipts, receiptId)
  if (!r) throw new DomainError('El cobro no existe.')
  if (r.status === 'reversed') return ds
  if (!reason.trim()) throw new DomainError('Indicá el motivo de la reversión.', { reason: 'Indicá el motivo.' })
  let next: Dataset = { ...ds, receipts: replaceById(ds.receipts, receiptId, (x) => ({ ...x, status: 'reversed', reversedAt: ctx.today(), reversalReason: reason.trim() })) }
  next = appendAudit(next, { entity: 'receipt', entityId: receiptId, action: 'reverse', detail: reason.trim() }, ctx)
  for (const projectId of new Set(r.allocations.map((a) => findById(ds.invoices, a.invoiceId)?.projectId).filter(Boolean) as string[])) {
    next = logActivity(next, { projectId, kind: 'finance', message: `Cobro ${r.number} revertido: ${reason.trim()}` }, ctx)
  }
  return next
}

export interface CollectionActionInput {
  invoiceId: string
  kind: CollectionActionKind
  text: string
  promisedDate?: string
}

export function addCollectionAction(ds: Dataset, input: CollectionActionInput, ctx: DomainContext): Dataset {
  const inv = findById(ds.invoices, input.invoiceId)
  if (!inv) throw new DomainError('La factura no existe.')
  const f: Record<string, string> = {}
  if (!input.text.trim()) f.text = 'Describí la gestión realizada.'
  if (input.text.length > 1000) f.text = 'Máximo 1000 caracteres.'
  if (input.promisedDate && !isIsoDate(input.promisedDate)) f.promisedDate = 'Fecha inválida.'
  if (Object.keys(f).length) throw new DomainError('Revisá la gestión de cobranza.', f)
  const action = { id: ctx.newId('col'), invoiceId: inv.id, clientId: inv.clientId, date: ctx.now(), actorId: ctx.actorId, kind: input.kind, text: input.text.trim(), promisedDate: input.promisedDate || undefined }
  const next: Dataset = { ...ds, collectionActions: [action, ...ds.collectionActions] }
  return logActivity(next, { projectId: inv.projectId, kind: 'finance', message: `Gestión de cobranza (${inv.number}): ${action.text}${action.promisedDate ? ` · promesa de pago ${action.promisedDate}` : ''}` }, ctx)
}

/** Adds withholdings documented later (e.g. the detail arrives by email after the deposit). */
export function addReceiptWithholdings(ds: Dataset, receiptId: string, items: WithholdingInput[], ctx: DomainContext): Dataset {
  const r = findById(ds.receipts, receiptId)
  if (!r) throw new DomainError('El cobro no existe.')
  if (r.status !== 'recorded') throw new DomainError('No se agregan retenciones a un cobro revertido.')
  if (!items.length) throw new DomainError('Cargá al menos una retención.')
  const f: Record<string, string> = {}
  validateWithholdings(ds, r.clientId, r.currency, items, [], ctx.today(), f)
  if (Object.keys(f).length) throw new DomainError('Revisá las retenciones.', f)
  const added = buildWithholdings(items, ctx)
  const next: Dataset = { ...ds, receipts: replaceById(ds.receipts, receiptId, (x) => ({ ...x, withholdings: [...(x.withholdings ?? []), ...added] })) }
  return appendAudit(next, { entity: 'receipt', entityId: receiptId, action: 'withholdings', detail: added.map((w) => `${w.type} ${w.amount}`).join(', ') }, ctx)
}
