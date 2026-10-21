import { assertCostsOpen } from './costControl'
import type { CostCategory, CurrencyCode, PaymentCondition, SupplierObligation } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from './audit'
import { buildCost, validateCost } from './costs'
import { financeIndex } from './derive'
import { cmpMoney, isMoney } from './money'
import { exceedsAgreement } from './suppliers'

export interface ObligationInput {
  supplierId: string
  reference: string
  projectId?: string
  serviceId?: string
  agreementId?: string
  category: CostCategory
  description: string
  issueDate: string
  dueDate: string
  currency: CurrencyCode | ''
  amount: number
  paymentCondition: PaymentCondition
  clientInvoiceId?: string
  notes?: string
  approve?: boolean
}

export function validateObligation(ds: Dataset, input: ObligationInput, today: string, obligationId?: string): Record<string, string> {
  const f: Record<string, string> = {}
  const supplier = findById(ds.suppliers, input.supplierId)
  if (!supplier) f.supplierId = 'Elegí el proveedor.'
  else if (!supplier.active && !obligationId) f.supplierId = 'El proveedor está inactivo.'
  if (!input.reference.trim()) f.reference = 'Ingresá el número del comprobante del proveedor.'
  else if (
    ds.obligations.some(
      (o) => o.id !== obligationId && o.supplierId === input.supplierId && o.lifecycle !== 'cancelled' && o.reference.trim().toUpperCase() === input.reference.trim().toUpperCase(),
    )
  ) {
    f.reference = 'Ese comprobante ya está registrado para el proveedor.'
  }
  const costFields = validateCost(
    ds,
    {
      scope: input.projectId ? 'project' : 'company',
      projectId: input.projectId,
      serviceId: input.serviceId,
      supplierId: input.supplierId,
      category: input.category,
      description: input.description,
      currency: input.currency,
      amount: input.amount,
      date: input.issueDate,
    },
    today,
  )
  if (costFields.projectId) f.projectId = costFields.projectId
  if (costFields.serviceId) f.serviceId = costFields.serviceId
  if (costFields.category) f.category = costFields.category
  if (costFields.description) f.description = costFields.description
  if (costFields.currency) f.currency = costFields.currency
  if (costFields.amount) f.amount = costFields.amount
  if (costFields.date) f.issueDate = costFields.date
  if (!isIsoDate(input.dueDate)) f.dueDate = 'Fecha inválida.'
  else if (isIsoDate(input.issueDate) && input.dueDate < input.issueDate) f.dueDate = 'El vencimiento no puede ser anterior a la emisión.'
  if (input.paymentCondition === 'after-client-collection') {
    const inv = input.clientInvoiceId ? findById(ds.invoices, input.clientInvoiceId) : undefined
    if (!inv || inv.lifecycle === 'cancelled' || (input.projectId && inv.projectId !== input.projectId)) {
      f.clientInvoiceId = 'Elegí la factura del cliente (del mismo proyecto) cuyo cobro habilita el pago.'
    }
  }
  if (input.agreementId) {
    const agreement = findById(ds.agreements, input.agreementId)
    if (!agreement || agreement.supplierId !== input.supplierId) f.agreementId = 'El acuerdo no corresponde al proveedor.'
    else if (input.currency && agreement.currency !== input.currency) f.currency = `El acuerdo está en ${agreement.currency}.`
    else if (isMoney(input.amount) && exceedsAgreement(ds, agreement, input.amount, obligationId)) f.amount = `Supera el monto acordado (${agreement.currency} ${agreement.agreedAmount}).`
  }
  return f
}

/**
 * Registers what is owed to a supplier (its invoice). The backing incurred
 * cost is recorded with it; payments are separate records.
 */
export function createObligation(ds: Dataset, input: ObligationInput, requestId: string, ctx: DomainContext): { ds: Dataset; obligationId: string; duplicate: boolean } {
  const existing = ds.requests[requestId]
  if (existing && ds.obligations.some((o) => o.id === existing)) return { ds, obligationId: existing, duplicate: true }
  const fields = validateObligation(ds, input, ctx.today())
  if (Object.keys(fields).length) throw new DomainError('Revisá la obligación.', fields)
  assertCostsOpen(ds, input.projectId)
  const cost = buildCost(
    {
      scope: input.projectId ? 'project' : 'company',
      projectId: input.projectId,
      serviceId: input.serviceId,
      supplierId: input.supplierId,
      category: input.category,
      description: input.description,
      currency: input.currency,
      amount: input.amount,
      date: input.issueDate,
    },
    ctx,
  )
  const obligation: SupplierObligation = {
    id: ctx.newId('obl'),
    reference: input.reference.trim(),
    supplierId: input.supplierId,
    projectId: input.projectId || undefined,
    serviceId: input.serviceId || undefined,
    costId: cost.id,
    agreementId: input.agreementId || undefined,
    description: input.description.trim(),
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: input.currency as CurrencyCode,
    amount: input.amount,
    paymentCondition: input.paymentCondition,
    clientInvoiceId: input.paymentCondition === 'after-client-collection' ? input.clientInvoiceId : undefined,
    lifecycle: input.approve ? 'approved' : 'pending-approval',
    notes: input.notes?.trim() || undefined,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  let next: Dataset = { ...ds, costs: [...ds.costs, cost], obligations: [...ds.obligations, obligation], requests: { ...ds.requests, [requestId]: obligation.id } }
  const supplier = findById(ds.suppliers, obligation.supplierId)!
  next = appendAudit(next, { entity: 'obligation', entityId: obligation.id, action: 'create', detail: `${supplier.name} ${obligation.reference}: ${obligation.currency} ${obligation.amount}`, projectId: obligation.projectId }, ctx)
  if (obligation.projectId) {
    next = logActivity(next, { projectId: obligation.projectId, serviceId: obligation.serviceId, kind: 'finance', message: `Obligación con ${supplier.name} registrada (${obligation.reference}): ${obligation.currency} ${obligation.amount}.` }, ctx)
  }
  return { ds: next, obligationId: obligation.id, duplicate: false }
}

export function approveObligation(ds: Dataset, obligationId: string, ctx: DomainContext): Dataset {
  const ob = findById(ds.obligations, obligationId)
  if (!ob) throw new DomainError('La obligación no existe.')
  if (ob.lifecycle !== 'pending-approval') throw new DomainError('Solo se aprueban obligaciones pendientes de aprobación.')
  const next: Dataset = { ...ds, obligations: replaceById(ds.obligations, obligationId, (o) => ({ ...o, lifecycle: 'approved' })) }
  return appendAudit(next, { entity: 'obligation', entityId: obligationId, action: 'approve', detail: ob.reference, projectId: ob.projectId }, ctx)
}

export interface ObligationTermsPatch {
  dueDate: string
  paymentCondition: PaymentCondition
  clientInvoiceId?: string
  notes?: string
}

/** Payment terms can change; amounts are corrected by cancelling and re-registering (auditable). */
export function updateObligationTerms(ds: Dataset, obligationId: string, patch: ObligationTermsPatch, ctx: DomainContext): Dataset {
  const ob = findById(ds.obligations, obligationId)
  if (!ob) throw new DomainError('La obligación no existe.')
  if (ob.lifecycle === 'cancelled') throw new DomainError('La obligación está anulada.')
  const f: Record<string, string> = {}
  if (!isIsoDate(patch.dueDate) || patch.dueDate < ob.issueDate) f.dueDate = 'Vencimiento inválido.'
  if (patch.paymentCondition === 'after-client-collection') {
    const inv = patch.clientInvoiceId ? findById(ds.invoices, patch.clientInvoiceId) : undefined
    if (!inv || inv.lifecycle === 'cancelled' || (ob.projectId && inv.projectId !== ob.projectId)) f.clientInvoiceId = 'Elegí la factura del cliente que habilita el pago.'
  }
  if (Object.keys(f).length) throw new DomainError('Revisá las condiciones.', f)
  const next: Dataset = {
    ...ds,
    obligations: replaceById(ds.obligations, obligationId, (o) => ({
      ...o,
      dueDate: patch.dueDate,
      paymentCondition: patch.paymentCondition,
      clientInvoiceId: patch.paymentCondition === 'after-client-collection' ? patch.clientInvoiceId : undefined,
      notes: patch.notes !== undefined ? patch.notes.trim() || undefined : o.notes,
    })),
  }
  return appendAudit(
    next,
    { entity: 'obligation', entityId: obligationId, action: 'update-terms', detail: `Vence ${patch.dueDate} · ${patch.paymentCondition === 'after-client-collection' ? 'pago tras cobro del cliente' : 'pago al vencimiento'}`, projectId: ob.projectId },
    ctx,
  )
}

/** Cancels an unpaid obligation and voids its cost. Paid obligations need payment reversal first. */
export function cancelObligation(ds: Dataset, obligationId: string, reason: string, ctx: DomainContext): Dataset {
  const ob = findById(ds.obligations, obligationId)
  if (!ob) throw new DomainError('La obligación no existe.')
  if (ob.lifecycle === 'cancelled') return ds
  if (!reason.trim()) throw new DomainError('Indicá el motivo.', { reason: 'Indicá el motivo.' })
  if (cmpMoney(financeIndex(ds).paidByObligation.get(obligationId) ?? 0, 0) > 0) throw new DomainError('Tiene pagos aplicados: revertí primero esos pagos.')
  let next: Dataset = {
    ...ds,
    obligations: replaceById(ds.obligations, obligationId, (o) => ({ ...o, lifecycle: 'cancelled', cancelReason: reason.trim() })),
    costs: replaceById(ds.costs, ob.costId, (c) => ({ ...c, status: 'void', voidReason: `Obligación ${ob.reference} anulada` })),
  }
  next = appendAudit(next, { entity: 'obligation', entityId: obligationId, action: 'cancel', detail: reason.trim(), projectId: ob.projectId }, ctx)
  if (ob.projectId) next = logActivity(next, { projectId: ob.projectId, kind: 'finance', message: `Obligación ${ob.reference} anulada: ${reason.trim()}` }, ctx)
  return next
}
