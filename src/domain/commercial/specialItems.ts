import { getServiceType } from '@/config/serviceCatalog'
import type { CurrencyCode, PriceUnit, ProjectRecord, Quotation, ServiceItem, ServiceRecord } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError } from '../errors'
import { addMoney, cmpMoney, isMoney, isQuantity, subMoney } from '../finance/money'
import { basePrice, effectivePolicy, itemsTotal, regularItems, specialItemsOf, type EffectivePolicy } from './catalog'
import { isAuthorizer } from './quotations'
import { comparisonGate } from './poComparison'

/*
 * Phase 5.0B — project-specific scope: a free description per contracted
 * service and special sub-services that exist only in one project. Special
 * items never touch the catalog or the client's tariff, and they are not
 * billable until the commercial approval the client's policy requires.
 */

const MAX_DESCRIPTION = 600

/* ───────────── Service description ───────────── */

/** Sets the project-specific description of a service; the previous text is kept in its history. */
export function setServiceDescription(ds: Dataset, serviceId: string, text: string, ctx: DomainContext): Dataset {
  const service = findById(ds.services, serviceId)
  if (!service) throw new DomainError('El servicio no existe.')
  const value = text.trim() || undefined
  if ((value?.length ?? 0) > MAX_DESCRIPTION) throw new DomainError('Revisá la descripción.', { description: `Máximo ${MAX_DESCRIPTION} caracteres.` })
  if (value === service.description) return ds
  const next: Dataset = {
    ...ds,
    services: replaceById(ds.services, serviceId, (s) => ({
      ...s,
      description: value,
      descriptionHistory: [...(s.descriptionHistory ?? []), { previous: s.description, at: ctx.now(), by: ctx.actorId }],
    })),
  }
  const label = getServiceType(service.typeId).label
  return logActivity(next, { projectId: service.projectId, serviceId, kind: 'service', message: value ? `Descripción de ${label} actualizada.` : `Descripción de ${label} eliminada.` }, ctx)
}

/* ───────────── Approval of special sub-services ───────────── */

/** How a special item gets approved: explicit reference, an approved quotation, or not required. */
export type SpecialApprovalChannel = 'explicit' | 'quotation' | 'none'

export function specialApprovalChannel(policy: EffectivePolicy): SpecialApprovalChannel {
  // An open PO only authorises its own items: anything else needs an explicit commercial approval.
  if (policy.poMode === 'open') return 'explicit'
  if (policy.requiresApprovedQuote) return 'quotation'
  if (policy.poMode === 'project' || policy.requiresPriceApproval) return 'explicit'
  return 'none'
}

export interface SpecialStatus {
  approved: boolean
  channel: SpecialApprovalChannel
  label: string
}

/** Approved, non-superseded quotation that prices the special item exactly as contracted. */
function approvingQuotation(ds: Pick<Dataset, 'quotations'>, projectId: string, item: ServiceItem): Quotation | undefined {
  return ds.quotations.find(
    (q) =>
      q.projectId === projectId &&
      q.status === 'approved' &&
      !q.supersededById &&
      q.lines.some((l) => l.serviceItemId === item.id && cmpMoney(l.unitPrice, item.unitPrice) === 0 && l.quantity === item.quantity && l.currency === (item.currency ?? l.currency)),
  )
}

export function specialItemStatus(ds: Pick<Dataset, 'clients' | 'quotations'>, project: ProjectRecord, item: ServiceItem): SpecialStatus {
  const channel = specialApprovalChannel(effectivePolicy(findById(ds.clients, project.clientId), project))
  if (item.special?.approvalRef) return { approved: true, channel, label: `Aprobado · ${item.special.approvalRef}` }
  if (channel === 'none') return { approved: true, channel, label: 'No requiere aprobación (política del cliente)' }
  if (channel === 'quotation') {
    const q = approvingQuotation(ds, project.id, item)
    return q ? { approved: true, channel, label: `Aprobado en ${q.number} v${q.version}` } : { approved: false, channel, label: 'Pendiente: incluilo en una cotización y registrá su aprobación' }
  }
  return {
    approved: false,
    channel,
    label: project.openOrderId ? 'No autorizado por la OC abierta: requiere aprobación o modificación comercial' : 'Pendiente de aprobación comercial',
  }
}

/** Catalog items are always billable; special ones only once approved. */
export function isBillableItem(ds: Pick<Dataset, 'clients' | 'quotations'> & Partial<Dataset>, project: ProjectRecord, item: ServiceItem): boolean {
  if (!item.special) return true
  if (!specialItemStatus(ds, project, item).approved) return false
  // Phase 5.0C.2: an imported PO that leaves it out (or a rejected difference) means it is not authorised.
  if (ds.purchaseOrders && ds.poImports && ds.poReviews && ds.projects && ds.services) return !comparisonGate(ds as Dataset, project.id).excludedItems.has(item.id)
  return true
}

/** Agreed service price excluding special items still pending approval. */
export function agreedPrice(ds: Pick<Dataset, 'clients' | 'quotations'> & Partial<Dataset>, project: ProjectRecord, s: ServiceRecord): number | undefined {
  const pending = specialItemsOf(s).filter((i) => !isBillableItem(ds, project, i))
  if (!pending.length || s.price === undefined) return s.price
  const v = subMoney(s.price, itemsTotal(pending))
  return v > 0 ? v : undefined
}

/** Units that can be certified or invoiced: catalog items (or the flat price) plus approved special items. */
export function billableUnits(ds: Pick<Dataset, 'clients' | 'quotations'> & Partial<Dataset>, project: ProjectRecord, s: ServiceRecord): { serviceItemId?: string; name?: string; unitPrice: number; quantity: number }[] {
  const regular = regularItems(s)
  const base = regular.length ? undefined : basePrice(s)
  return [
    ...(regular.length ? regular.map((i) => ({ serviceItemId: i.id, name: i.name, unitPrice: i.unitPrice, quantity: i.quantity })) : base ? [{ unitPrice: base, quantity: 1 }] : []),
    ...specialItemsOf(s)
      .filter((i) => isBillableItem(ds, project, i))
      .map((i) => ({ serviceItemId: i.id, name: i.name, unitPrice: i.unitPrice, quantity: i.quantity })),
  ]
}

/* ───────────── Special sub-service commands ───────────── */

export interface SpecialItemInput {
  name: string
  description?: string
  quantity: number
  unit: PriceUnit
  unitPrice: number
  currency: CurrencyCode | ''
  reason: string
  /** Explicit commercial approval reference (when the client's policy accepts it). */
  approvalRef?: string
}

function context(ds: Dataset, serviceId: string) {
  const service = findById(ds.services, serviceId)
  if (!service) throw new DomainError('El servicio no existe.')
  const project = findById(ds.projects, service.projectId)
  if (!project) throw new DomainError('El proyecto no existe.')
  return { service, project }
}

function validate(ds: Dataset, project: ProjectRecord, service: ServiceRecord, input: SpecialItemInput, actorId: string, id?: string): Record<string, string> {
  const f: Record<string, string> = {}
  const name = input.name.trim()
  if (!name) f.name = 'Ingresá el nombre del subservicio especial.'
  else if (name.length > 120) f.name = 'Máximo 120 caracteres.'
  else if ((service.items ?? []).some((i) => i.id !== id && i.name.trim().toLowerCase() === name.toLowerCase())) f.name = 'Ya existe un subservicio con ese nombre en este servicio.'
  if ((input.description?.length ?? 0) > 500) f.description = 'Máximo 500 caracteres.'
  if (!isQuantity(input.quantity)) f.quantity = 'Cantidad mayor a 0.'
  if (!isMoney(input.unitPrice) || input.unitPrice <= 0) f.unitPrice = 'Ingresá un precio mayor a 0.'
  if (!input.currency) f.currency = 'Elegí la moneda.'
  else if (input.currency !== project.currency) f.currency = `Debe ser la moneda del proyecto (${project.currency}): no se convierte.`
  if (!input.reason.trim()) f.reason = 'Indicá el motivo o la justificación.'
  else if (input.reason.length > 500) f.reason = 'Máximo 500 caracteres.'
  if (input.approvalRef?.trim()) {
    const channel = specialApprovalChannel(effectivePolicy(findById(ds.clients, project.clientId), project))
    if (channel === 'quotation') f.approvalRef = 'Este cliente aprueba por cotización: incluilo en una cotización y registrá su aprobación.'
    else if (channel === 'none') f.approvalRef = 'Este cliente no exige aprobación para subservicios especiales.'
    else if (!isAuthorizer(actorId)) f.approvalRef = 'No tenés autorización para registrar aprobaciones comerciales.'
  }
  return f
}

/** Why a special item can no longer change: certified, invoiced or in an issued quotation. */
export function specialItemLock(ds: Pick<Dataset, 'certificates' | 'invoices' | 'quotations'>, itemId: string): string | undefined {
  if (ds.certificates.some((c) => c.status !== 'rejected' && c.lines.some((l) => l.serviceItemId === itemId))) return 'Ya está certificado.'
  if (ds.invoices.some((i) => i.lifecycle !== 'cancelled' && i.lines.some((l) => l.serviceItemId === itemId))) return 'Ya está facturado.'
  const q = ds.quotations.find((x) => x.status !== 'draft' && x.status !== 'rejected' && x.lines.some((l) => l.serviceItemId === itemId))
  if (q) return `Está en la cotización ${q.number} v${q.version}: creá una nueva versión para cambiarlo.`
  return undefined
}

/** Service price = base (catalog items or flat price) + special items. */
function repriced(service: ServiceRecord, items: ServiceItem[]): Pick<ServiceRecord, 'items' | 'price'> {
  const base = regularItems(service).length ? undefined : basePrice(service)
  const price = items.length || base !== undefined ? addMoney(itemsTotal(items), base ?? 0) : undefined
  return { items: items.length ? items : undefined, price }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function addSpecialItem(ds: Dataset, serviceId: string, input: SpecialItemInput, ctx: DomainContext): { ds: Dataset; itemId: string } {
  const { service, project } = context(ds, serviceId)
  if (project.operationalStatus === 'completed' || project.operationalStatus === 'cancelled') throw new DomainError('El proyecto está cerrado.')
  const f = validate(ds, project, service, input, ctx.actorId)
  if (Object.keys(f).length) throw new DomainError('Revisá el subservicio especial.', f)
  const ref = input.approvalRef?.trim()
  const item: ServiceItem = {
    id: ctx.newId('sit'),
    catalogItemId: '',
    name: input.name.trim(),
    unit: input.unit,
    quantity: input.quantity,
    unitPrice: round2(input.unitPrice),
    currency: project.currency,
    source: 'special',
    special: {
      description: input.description?.trim() || undefined,
      reason: input.reason.trim(),
      ...(ref ? { approvalRef: ref, approvedAt: ctx.today(), approvedBy: ctx.actorId } : {}),
      createdAt: ctx.now(),
      createdBy: ctx.actorId,
    },
  }
  const next: Dataset = { ...ds, services: replaceById(ds.services, serviceId, (s) => ({ ...s, ...repriced(s, [...(s.items ?? []), item]) })) }
  const label = getServiceType(service.typeId).label
  return {
    ds: logActivity(
      next,
      { projectId: project.id, serviceId, kind: 'commercial', message: `Subservicio especial en ${label}: ${item.name} ×${item.quantity} a ${project.currency} ${item.unitPrice}${ref ? ` (aprobado: ${ref})` : ''}.` },
      ctx,
    ),
    itemId: item.id,
  }
}

/** Only while pending and unused; draft quotation lines follow the new values. */
export function updateSpecialItem(ds: Dataset, serviceId: string, itemId: string, input: Omit<SpecialItemInput, 'approvalRef'>, ctx: DomainContext): Dataset {
  const { service, project } = context(ds, serviceId)
  const item = service.items?.find((i) => i.id === itemId && i.special)
  if (!item?.special) throw new DomainError('El subservicio especial no existe.')
  if (item.special.approvalRef) throw new DomainError('El subservicio ya está aprobado: su precio no se modifica. Agregá uno nuevo si cambió el alcance.')
  const lock = specialItemLock(ds, itemId)
  if (lock) throw new DomainError(`No se puede modificar: ${lock}`)
  const f = validate(ds, project, service, input, ctx.actorId, itemId)
  if (Object.keys(f).length) throw new DomainError('Revisá el subservicio especial.', f)
  const updated: ServiceItem = {
    ...item,
    name: input.name.trim(),
    unit: input.unit,
    quantity: input.quantity,
    unitPrice: round2(input.unitPrice),
    special: { ...item.special, description: input.description?.trim() || undefined, reason: input.reason.trim() },
  }
  let next: Dataset = { ...ds, services: replaceById(ds.services, serviceId, (s) => ({ ...s, ...repriced(s, (s.items ?? []).map((i) => (i.id === itemId ? updated : i))) })) }
  next = {
    ...next,
    quotations: next.quotations.map((q) =>
      q.status === 'draft' && q.lines.some((l) => l.serviceItemId === itemId)
        ? { ...q, lines: q.lines.map((l) => (l.serviceItemId === itemId ? { ...l, ...specialLine(service, updated) } : l)) }
        : q,
    ),
  }
  const changes = [item.unitPrice !== updated.unitPrice && `precio ${item.unitPrice} → ${updated.unitPrice}`, item.quantity !== updated.quantity && `cantidad ${item.quantity} → ${updated.quantity}`].filter(Boolean)
  return logActivity(next, { projectId: project.id, serviceId, kind: 'commercial', message: `Subservicio especial ${updated.name} actualizado${changes.length ? ` (${changes.join(', ')})` : ''}.` }, ctx)
}

/** Explicit commercial approval (open PO amendment, client document) — only where the policy accepts it. */
export function approveSpecialItem(ds: Dataset, serviceId: string, itemId: string, approvalRef: string, ctx: DomainContext): Dataset {
  const { service, project } = context(ds, serviceId)
  const item = service.items?.find((i) => i.id === itemId && i.special)
  if (!item?.special) throw new DomainError('El subservicio especial no existe.')
  const status = specialItemStatus(ds, project, item)
  if (status.approved) throw new DomainError('El subservicio ya está aprobado.')
  if (status.channel !== 'explicit') throw new DomainError('Este cliente aprueba por cotización: incluilo en una cotización y registrá su aprobación.')
  if (!isAuthorizer(ctx.actorId)) throw new DomainError('No tenés autorización para registrar aprobaciones comerciales.')
  if (!approvalRef.trim()) throw new DomainError('Indicá la referencia de aprobación.', { approvalRef: 'Indicá la referencia (acta, enmienda de OC, email del cliente).' })
  const special = { ...item.special, approvalRef: approvalRef.trim(), approvedAt: ctx.today(), approvedBy: ctx.actorId }
  const next: Dataset = { ...ds, services: replaceById(ds.services, serviceId, (s) => ({ ...s, items: s.items!.map((i) => (i.id === itemId ? { ...i, special } : i)) })) }
  return logActivity(next, { projectId: project.id, serviceId, kind: 'commercial', message: `Subservicio especial ${item.name} aprobado: ${special.approvalRef}.` }, ctx)
}

export function removeSpecialItem(ds: Dataset, serviceId: string, itemId: string, ctx: DomainContext): Dataset {
  const { service, project } = context(ds, serviceId)
  const item = service.items?.find((i) => i.id === itemId && i.special)
  if (!item) throw new DomainError('El subservicio especial no existe.')
  const lock = specialItemLock(ds, itemId)
  if (lock) throw new DomainError(`No se puede quitar: ${lock}`)
  let next: Dataset = { ...ds, services: replaceById(ds.services, serviceId, (s) => ({ ...s, ...repriced(s, (s.items ?? []).filter((i) => i.id !== itemId)) })) }
  next = { ...next, quotations: next.quotations.map((q) => (q.status === 'draft' && q.lines.some((l) => l.serviceItemId === itemId) ? { ...q, lines: q.lines.filter((l) => l.serviceItemId !== itemId) } : q)) }
  return logActivity(next, { projectId: project.id, serviceId, kind: 'commercial', message: `Subservicio especial ${item.name} quitado de ${getServiceType(service.typeId).label}.` }, ctx)
}

/** Quotation line fields for a special item (price and quantity fixed by the item). */
export function specialLine(service: Pick<ServiceRecord, 'typeId'>, item: ServiceItem) {
  return {
    description: `${getServiceType(service.typeId).label} — ${item.name}`,
    details: item.special?.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    suggestedUnitPrice: item.unitPrice,
    serviceItemId: item.id,
  }
}
