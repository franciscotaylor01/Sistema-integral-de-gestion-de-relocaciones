import { validTerms } from '../finance/terms'
import { getServiceType } from '@/config/serviceCatalog'
import type { CurrencyCode, PurchaseOrder, PaymentTerms } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { round2, type Amounts } from './money'
import { approvedAmountsByService, authorizedByService } from './quotations'
import { agreedPrice } from './specialItems'

export interface AllocationInput {
  serviceId: string
  amount: number
  notes?: string
}

export interface PurchaseOrderInput {
  projectId: string
  clientPoNumber: string
  quotationId?: string
  issueDate: string
  receivedDate: string
  currency: CurrencyCode | ''
  authorizedAmount: number
  allocations: AllocationInput[]
  notes?: string
  /** Phase 4.7: payment condition stated on the PO. */
  paymentTerms?: PaymentTerms
}

/**
 * Maximum a service may be authorised in a currency: its approved quotation
 * amount; when the client does not require an approved quote, the agreed
 * service price is accepted as the commercial basis.
 */
export function serviceCaps(ds: Dataset, projectId: string): Map<string, Amounts> {
  const project = findById(ds.projects, projectId)
  const client = project ? findById(ds.clients, project.clientId) : undefined
  const approved = approvedAmountsByService(ds, projectId)
  const caps = new Map<string, Amounts>()
  for (const s of ds.services.filter((x) => x.projectId === projectId)) {
    const a = approved.get(s.id)
    if (a && Object.keys(a).length) caps.set(s.id, a)
    else if (client && !client.policy.requiresApprovedQuote && project) {
      const price = agreedPrice(ds, project, s)
      if (price) caps.set(s.id, { [project.currency]: price })
    }
  }
  return caps
}

/** Amount still available to authorise per service in a currency (excluding one PO when editing). */
export function availableToAuthorize(ds: Dataset, projectId: string, currency: CurrencyCode, excludePoId?: string): Map<string, number> {
  const caps = serviceCaps(ds, projectId)
  const authorized = authorizedByService(ds, projectId, excludePoId)
  const out = new Map<string, number>()
  for (const [serviceId, cap] of caps) {
    const c = cap[currency] ?? 0
    if (c > 0) out.set(serviceId, round2(c - (authorized.get(serviceId)?.[currency] ?? 0)))
  }
  return out
}

const samePoNumber = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase()

export function validatePurchaseOrder(ds: Dataset, input: PurchaseOrderInput, ctx: DomainContext, poId?: string): Record<string, string> {
  const f: Record<string, string> = {}
  const project = findById(ds.projects, input.projectId)
  if (!project) return { projectId: 'El proyecto no existe.' }
  if (input.paymentTerms && !validTerms(input.paymentTerms)) f.paymentTerms = 'Plazo entre 0 y 365 días.'
  if (!input.clientPoNumber.trim()) f.clientPoNumber = 'Ingresá el número de OC del cliente.'
  else if (
    ds.purchaseOrders.some((po) => po.id !== poId && po.clientId === project.clientId && po.status === 'active' && samePoNumber(po.clientPoNumber, input.clientPoNumber))
  ) {
    f.clientPoNumber = 'Este cliente ya tiene una OC vigente con ese número.'
  }
  if (input.quotationId) {
    const q = findById(ds.quotations, input.quotationId)
    if (!q || q.projectId !== project.id || q.status !== 'approved') f.quotationId = 'Elegí una cotización aprobada del proyecto.'
  }
  if (!isIsoDate(input.issueDate)) f.issueDate = 'Fecha inválida.'
  if (!isIsoDate(input.receivedDate)) f.receivedDate = 'Fecha inválida.'
  if (isIsoDate(input.issueDate) && isIsoDate(input.receivedDate) && input.receivedDate < input.issueDate) {
    f.receivedDate = 'La recepción no puede ser anterior a la emisión.'
  }
  if (isIsoDate(input.receivedDate) && input.receivedDate > ctx.today()) f.receivedDate = 'No puede ser una fecha futura.'
  if (!input.currency) f.currency = 'Elegí la moneda.'
  if (!Number.isFinite(input.authorizedAmount) || input.authorizedAmount <= 0) f.authorizedAmount = 'Ingresá un monto autorizado mayor a cero.'
  if (input.allocations.length === 0) f.allocations = 'Asigná el monto a al menos un servicio.'

  if (input.currency) {
    const available = availableToAuthorize(ds, project.id, input.currency, poId)
    const seen = new Set<string>()
    input.allocations.forEach((a, i) => {
      if (seen.has(a.serviceId)) f[`allocations.${i}.serviceId`] = 'Servicio repetido en la OC.'
      seen.add(a.serviceId)
      const service = findById(ds.services, a.serviceId)
      if (!service || service.projectId !== project.id) {
        f[`allocations.${i}.serviceId`] = 'El servicio no pertenece al proyecto.'
        return
      }
      if (!Number.isFinite(a.amount) || a.amount <= 0) {
        f[`allocations.${i}.amount`] = 'Monto mayor a cero.'
        return
      }
      const max = available.get(a.serviceId)
      if (max === undefined) f[`allocations.${i}.amount`] = `${getServiceType(service.typeId).label} no tiene montos aprobados en ${input.currency}.`
      else if (round2(a.amount) > max + 0.001) f[`allocations.${i}.amount`] = `Supera lo disponible para autorizar (${input.currency} ${max}).`
    })
    const total = round2(input.allocations.reduce((s, a) => s + (Number.isFinite(a.amount) ? a.amount : 0), 0))
    if (Number.isFinite(input.authorizedAmount) && total > round2(input.authorizedAmount) + 0.001) {
      f.allocations = `Las asignaciones (${input.currency} ${total}) superan el monto autorizado de la OC.`
    }
  }
  if ((input.notes?.length ?? 0) > 2000) f.notes = 'Máximo 2000 caracteres.'
  return f
}

function nextInternalNumber(ds: Dataset, today: string): string {
  const year = today.slice(0, 4)
  const max = ds.purchaseOrders.reduce((m, po) => {
    const match = /^OCI-\d{4}-(\d{4,})$/.exec(po.internalNumber)
    return match ? Math.max(m, Number(match[1])) : m
  }, 0)
  return `OCI-${year}-${String(max + 1).padStart(4, '0')}`
}

const cleanAllocations = (list: AllocationInput[], ctx: DomainContext) =>
  list.map((a) => ({ id: ctx.newId('poa'), serviceId: a.serviceId, amount: round2(a.amount), notes: a.notes?.trim() || undefined }))

/** Registers a client PO. Idempotent per `requestId` (double submissions return the same PO). */
export function createPurchaseOrder(ds: Dataset, input: PurchaseOrderInput, requestId: string, ctx: DomainContext): { ds: Dataset; poId: string; duplicate: boolean } {
  const existing = ds.requests[requestId]
  if (existing && ds.purchaseOrders.some((p) => p.id === existing)) return { ds, poId: existing, duplicate: true }
  const fields = validatePurchaseOrder(ds, input, ctx)
  if (Object.keys(fields).length) throw new DomainError('Revisá la orden de compra.', fields)
  const project = findById(ds.projects, input.projectId)!
  const internalNumber = nextInternalNumber(ds, ctx.today())
  const po: PurchaseOrder = {
    id: ctx.newId('po'),
    internalNumber,
    clientPoNumber: input.clientPoNumber.trim(),
    clientId: project.clientId,
    projectId: project.id,
    quotationId: input.quotationId || undefined,
    issueDate: input.issueDate,
    receivedDate: input.receivedDate,
    currency: input.currency as CurrencyCode,
    authorizedAmount: round2(input.authorizedAmount),
    allocations: cleanAllocations(input.allocations, ctx),
    status: 'active',
    documentRef: `DOCREF-${internalNumber}`,
    notes: input.notes?.trim() || undefined,
    paymentTerms: input.paymentTerms,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  let next: Dataset = { ...ds, purchaseOrders: [...ds.purchaseOrders, po], requests: { ...ds.requests, [requestId]: po.id } }
  const linked = new Set(po.allocations.map((a) => a.serviceId))
  next = {
    ...next,
    projects: replaceById(next.projects, project.id, (p) =>
      p.financialStatus === 'to-quote' || p.financialStatus === 'quoted' ? { ...p, financialStatus: 'po-received' } : p,
    ),
    services: next.services.map((s) =>
      linked.has(s.id) ? { ...s, financial: { ...s.financial, purchaseOrderId: s.financial?.purchaseOrderId ?? po.id } } : s,
    ),
  }
  next = logActivity(
    next,
    {
      projectId: project.id,
      kind: 'commercial',
      message: `OC ${po.clientPoNumber} registrada (${po.internalNumber}) por ${po.currency} ${po.authorizedAmount}, asignada a ${po.allocations.length} servicio(s).`,
    },
    ctx,
  )
  return { ds: next, poId: po.id, duplicate: false }
}

export function updatePurchaseOrder(ds: Dataset, poId: string, input: PurchaseOrderInput, ctx: DomainContext): Dataset {
  const po = findById(ds.purchaseOrders, poId)
  if (!po) throw new DomainError('La orden de compra no existe.')
  if (po.status !== 'active') throw new DomainError('Una OC anulada no puede modificarse.')
  if (input.projectId !== po.projectId) throw new DomainError('No se puede mover una OC a otro proyecto.')
  const fields = validatePurchaseOrder(ds, input, ctx, poId)
  if (Object.keys(fields).length) throw new DomainError('Revisá la orden de compra.', fields)
  const next: Dataset = {
    ...ds,
    purchaseOrders: replaceById(ds.purchaseOrders, poId, (x) => ({
      ...x,
      clientPoNumber: input.clientPoNumber.trim(),
      quotationId: input.quotationId || undefined,
      issueDate: input.issueDate,
      receivedDate: input.receivedDate,
      currency: input.currency as CurrencyCode,
      authorizedAmount: round2(input.authorizedAmount),
      allocations: cleanAllocations(input.allocations, ctx),
      notes: input.notes?.trim() || undefined,
      paymentTerms: input.paymentTerms,
    })),
  }
  return logActivity(next, { projectId: po.projectId, kind: 'commercial', message: `OC ${input.clientPoNumber.trim()} actualizada.` }, ctx)
}

/** Cancelling releases the PO's authorisations. */
export function cancelPurchaseOrder(ds: Dataset, poId: string, reason: string, ctx: DomainContext): Dataset {
  const po = findById(ds.purchaseOrders, poId)
  if (!po) throw new DomainError('La orden de compra no existe.')
  if (po.status === 'cancelled') return ds
  if (!reason.trim()) throw new DomainError('Indicá el motivo de la anulación.', { reason: 'Indicá el motivo.' })
  const next: Dataset = { ...ds, purchaseOrders: replaceById(ds.purchaseOrders, poId, (x) => ({ ...x, status: 'cancelled', cancelReason: reason.trim() })) }
  return logActivity(next, { projectId: po.projectId, kind: 'commercial', message: `OC ${po.clientPoNumber} anulada: ${reason.trim()}` }, ctx)
}

/** Links the PO document by label; the stable `documentRef` never changes. */
export function linkPurchaseOrderDocument(ds: Dataset, poId: string, label: string, ctx: DomainContext): Dataset {
  const po = findById(ds.purchaseOrders, poId)
  if (!po) throw new DomainError('La orden de compra no existe.')
  const clean = label.trim()
  if (!clean) throw new DomainError('Indicá el nombre o referencia del documento.', { label: 'Indicá el documento.' })
  if (clean.length > 120) throw new DomainError('Máximo 120 caracteres.', { label: 'Máximo 120 caracteres.' })
  const next: Dataset = { ...ds, purchaseOrders: replaceById(ds.purchaseOrders, poId, (x) => ({ ...x, documentLabel: clean })) }
  return logActivity(next, { projectId: po.projectId, kind: 'document', message: `Documento vinculado a la OC ${po.clientPoNumber}: ${clean} (${po.documentRef}).` }, ctx)
}

export const allocatedTotal = (po: Pick<PurchaseOrder, 'allocations'>) => round2(po.allocations.reduce((s, a) => s + a.amount, 0))
