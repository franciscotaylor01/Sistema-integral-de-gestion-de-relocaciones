import { getServiceType } from '@/config/serviceCatalog'
import type { PaymentTerms } from '@/types/domain'
import { validTerms } from '../finance/terms'
import type { CatalogItem, Client, CommercialPolicy, CurrencyCode, OpenOrderItem, OpenOrderStatus, OpenPurchaseOrder, PoMode, PriceUnit, ProjectRecord, ServiceItem } from '@/types/domain'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { isMoney, isQuantity, mulMoney, addMoney } from '../finance/money'
import { logActivityGlobal } from './activity'
import { resolvePrice } from './pricing'

/*
 * Phase 4.6 — hierarchical catalog (main service → billable sub-services),
 * open purchase orders by client/province and the effective commercial
 * policy of a project (client policy + explicit project exception).
 */

const DEFAULT_POLICY: CommercialPolicy = { requiresPurchaseOrder: true, requiresApprovedQuote: true, billingMilestone: 'service-completed', quoteValidityDays: 30 }

export interface EffectivePolicy extends CommercialPolicy {
  poMode: PoMode
  requiresCertificate: boolean
  /** True when a project exception overrides the client policy. */
  exception: boolean
}

export function effectivePolicy(client: Pick<Client, 'policy'> | undefined, project?: Pick<ProjectRecord, 'commercialException'>): EffectivePolicy {
  const p = client?.policy ?? DEFAULT_POLICY
  const ex = project?.commercialException
  const poMode = ex?.poMode ?? p.poMode ?? (p.requiresPurchaseOrder ? 'project' : 'none')
  const requiresCertificate = ex?.requiresCertificate ?? p.requiresCertificate ?? false
  return { ...p, poMode, requiresCertificate, requiresPurchaseOrder: poMode !== 'none', exception: Boolean(ex) }
}

export const isServiceOffered = (client: Pick<Client, 'offeredServices'> | undefined, typeId: string) => !client?.offeredServices || client.offeredServices.includes(typeId)

/* ───────────── Catalog items (sub-services) ───────────── */

export interface CatalogItemInput {
  serviceTypeId: string
  name: string
  description?: string
  unit: PriceUnit
  active: boolean
}

function validateItem(ds: Dataset, input: CatalogItemInput, id?: string): Record<string, string> {
  const f: Record<string, string> = {}
  if (!getServiceType(input.serviceTypeId).workflowTemplateId) f.serviceTypeId = 'Elegí el servicio principal.'
  if (!input.name.trim()) f.name = 'Ingresá el nombre del subservicio.'
  else if (ds.catalogItems.some((i) => i.id !== id && i.serviceTypeId === input.serviceTypeId && i.name.trim().toLowerCase() === input.name.trim().toLowerCase()))
    f.name = 'Ya existe un subservicio con ese nombre en este servicio.'
  if ((input.description?.length ?? 0) > 300) f.description = 'Máximo 300 caracteres.'
  return f
}

export function createCatalogItem(ds: Dataset, input: CatalogItemInput, ctx: DomainContext): { ds: Dataset; itemId: string } {
  const f = validateItem(ds, input)
  if (Object.keys(f).length) throw new DomainError('Revisá el subservicio.', f)
  const item: CatalogItem = { id: ctx.newId('itm'), serviceTypeId: input.serviceTypeId, name: input.name.trim(), description: input.description?.trim() || undefined, unit: input.unit, active: input.active, createdAt: ctx.now() }
  const next = logActivityGlobal({ ...ds, catalogItems: [...ds.catalogItems, item] }, `Subservicio creado: ${getServiceType(item.serviceTypeId).label} → ${item.name}.`, ctx)
  return { ds: next, itemId: item.id }
}

/** The service type of an item never changes (projects reference it). */
export function updateCatalogItem(ds: Dataset, id: string, input: CatalogItemInput, ctx: DomainContext): Dataset {
  const cur = findById(ds.catalogItems, id)
  if (!cur) throw new DomainError('El subservicio no existe.')
  const f = validateItem(ds, { ...input, serviceTypeId: cur.serviceTypeId }, id)
  if (Object.keys(f).length) throw new DomainError('Revisá el subservicio.', f)
  const next = { ...ds, catalogItems: replaceById(ds.catalogItems, id, (i) => ({ ...i, name: input.name.trim(), description: input.description?.trim() || undefined, unit: input.unit, active: input.active })) }
  return logActivityGlobal(next, `Subservicio actualizado: ${input.name.trim()}.`, ctx)
}

export function setOfferedServices(ds: Dataset, clientId: string, typeIds: string[], ctx: DomainContext): Dataset {
  const client = findById(ds.clients, clientId)
  if (!client) throw new DomainError('El cliente no existe.')
  if (!typeIds.length) throw new DomainError('Elegí al menos un servicio.', { offeredServices: 'Elegí al menos un servicio.' })
  const next = { ...ds, clients: replaceById(ds.clients, clientId, (c) => ({ ...c, offeredServices: [...new Set(typeIds)] })) }
  return logActivityGlobal(next, `Servicios ofrecidos a ${client.name} actualizados (${typeIds.length}).`, ctx, clientId)
}

/* ───────────── Open purchase orders ───────────── */

export interface OpenOrderInput {
  number: string
  clientId: string
  province: string
  currency: CurrencyCode | ''
  validFrom: string
  validTo?: string
  conditions?: string
  items: Omit<OpenOrderItem, 'id'>[]
  /** Phase 4.7: payment condition stated on the open PO. */
  paymentTerms?: PaymentTerms
}

export const openOrderLive = (o: OpenPurchaseOrder, date: string) => o.status === 'active' && o.validFrom <= date && (!o.validTo || o.validTo >= date)

export function findOpenOrderItem(o: OpenPurchaseOrder, serviceTypeId: string, catalogItemId?: string): OpenOrderItem | undefined {
  return o.items.find((i) => i.serviceTypeId === serviceTypeId && (i.catalogItemId ?? '') === (catalogItemId ?? ''))
}

export function validateOpenOrder(ds: Dataset, input: OpenOrderInput, id?: string): Record<string, string> {
  const f: Record<string, string> = {}
  if (!input.number.trim()) f.number = 'Ingresá el número oficial de la OC.'
  else if (ds.openOrders.some((o) => o.id !== id && o.clientId === input.clientId && o.status !== 'cancelled' && o.number.trim().toLowerCase() === input.number.trim().toLowerCase()))
    f.number = 'Ya existe una OC con ese número para el cliente.'
  if (!ds.clients.some((c) => c.id === input.clientId)) f.clientId = 'Elegí el cliente.'
  if (!input.province.trim()) f.province = 'Indicá la provincia.'
  if (!input.currency) f.currency = 'Elegí la moneda.'
  if (!isIsoDate(input.validFrom)) f.validFrom = 'Fecha inválida.'
  if (input.validTo && (!isIsoDate(input.validTo) || input.validTo < input.validFrom)) f.validTo = 'La vigencia no puede terminar antes de empezar.'
  if (!input.items.length) f.items = 'Autorizá al menos un servicio o subservicio.'
  if (input.paymentTerms && !validTerms(input.paymentTerms)) f.paymentTerms = 'Plazo entre 0 y 365 días.'
  const seen = new Set<string>()
  input.items.forEach((it, i) => {
    const key = `${it.serviceTypeId}|${it.catalogItemId ?? ''}`
    const ci = it.catalogItemId ? findById(ds.catalogItems, it.catalogItemId) : undefined
    if (!getServiceType(it.serviceTypeId).workflowTemplateId) f[`items.${i}.serviceTypeId`] = 'Servicio inválido.'
    else if (it.catalogItemId && (!ci || ci.serviceTypeId !== it.serviceTypeId)) f[`items.${i}.catalogItemId`] = 'El subservicio no pertenece al servicio.'
    else if (seen.has(key)) f[`items.${i}.catalogItemId`] = 'Ítem repetido.'
    seen.add(key)
    if (!isMoney(it.unitPrice) || it.unitPrice <= 0) f[`items.${i}.unitPrice`] = 'Precio mayor a 0.'
  })
  return f
}

export function createOpenOrder(ds: Dataset, input: OpenOrderInput, requestId: string, ctx: DomainContext): { ds: Dataset; openOrderId: string; duplicate: boolean } {
  const prior = ds.requests[requestId]
  if (prior) return { ds, openOrderId: prior, duplicate: true }
  const f = validateOpenOrder(ds, input)
  if (Object.keys(f).length) throw new DomainError('Revisá la OC abierta.', f)
  const id = ctx.newId('oca')
  const order: OpenPurchaseOrder = {
    id,
    number: input.number.trim(),
    clientId: input.clientId,
    province: input.province.trim(),
    currency: input.currency as CurrencyCode,
    validFrom: input.validFrom,
    validTo: input.validTo || undefined,
    status: 'active',
    conditions: input.conditions?.trim() || undefined,
    paymentTerms: input.paymentTerms,
    items: input.items.map((it) => ({ ...it, id: ctx.newId('oci'), catalogItemId: it.catalogItemId || undefined })),
    documentRef: `DOCREF-${id}`,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  const next = logActivityGlobal({ ...ds, openOrders: [...ds.openOrders, order], requests: { ...ds.requests, [requestId]: id } }, `OC abierta ${order.number} (${order.province}) registrada.`, ctx, order.clientId)
  return { ds: next, openOrderId: id, duplicate: false }
}

/** Approved item prices are kept: projects already contracted keep their frozen prices anyway. */
export function setOpenOrderStatus(ds: Dataset, id: string, status: OpenOrderStatus, ctx: DomainContext): Dataset {
  const o = findById(ds.openOrders, id)
  if (!o) throw new DomainError('La OC no existe.')
  return logActivityGlobal({ ...ds, openOrders: replaceById(ds.openOrders, id, (x) => ({ ...x, status })) }, `OC abierta ${o.number}: estado ${status}.`, ctx, o.clientId)
}

/* ───────────── Contracted items (project services) ───────────── */

export interface ServiceItemInput {
  catalogItemId: string
  quantity: number
  /** Manual price, used only when neither the open PO nor the tariff defines one. */
  unitPrice?: number
}

export interface ItemPrice {
  unitPrice: number
  unit: PriceUnit
  source: ServiceItem['source']
  sourceRef?: string
}

/** Price of a sub-service for a project: open PO first, then the client's tariff. */
export function resolveItemPrice(ds: Dataset, project: ProjectRecord, serviceTypeId: string, catalogItemId: string | undefined, date: string): ItemPrice | undefined {
  const order = project.openOrderId ? findById(ds.openOrders, project.openOrderId) : undefined
  const oi = order && findOpenOrderItem(order, serviceTypeId, catalogItemId)
  if (oi) return { unitPrice: oi.unitPrice, unit: oi.unit, source: 'open-order', sourceRef: order!.id }
  if (!catalogItemId) return undefined
  const res = resolvePrice(ds, { clientId: project.clientId, serviceTypeId, itemId: catalogItemId, market: project.destination.country, currency: project.currency, date, quantity: 1 })
  return res.status === 'unique' ? { unitPrice: res.entry.unitPrice, unit: res.entry.unit, source: 'tariff', sourceRef: res.entry.id } : undefined
}

/** Field errors for contracted items (prefix with "items."). */
export function validateServiceItems(ds: Dataset, project: ProjectRecord, typeId: string, items: ServiceItemInput[], date: string): Record<string, string> {
  const f: Record<string, string> = {}
  const client = findById(ds.clients, project.clientId)
  const policy = effectivePolicy(client, project)
  const order = project.openOrderId ? findById(ds.openOrders, project.openOrderId) : undefined
  const seen = new Set<string>()
  items.forEach((it, i) => {
    const ci = findById(ds.catalogItems, it.catalogItemId)
    if (!ci || ci.serviceTypeId !== typeId) f[`items.${i}.catalogItemId`] = 'Elegí un subservicio de este servicio.'
    else if (!ci.active) f[`items.${i}.catalogItemId`] = 'El subservicio está inactivo.'
    else if (seen.has(ci.id)) f[`items.${i}.catalogItemId`] = 'Subservicio repetido.'
    seen.add(it.catalogItemId)
    if (!isQuantity(it.quantity)) f[`items.${i}.quantity`] = 'Cantidad mayor a 0.'
    if (!ci) return
    if (policy.poMode === 'open') {
      if (!order || order.clientId !== project.clientId) f[`items.${i}.catalogItemId`] = 'Elegí la OC abierta del proyecto.'
      else if (!findOpenOrderItem(order, typeId, ci.id)) f[`items.${i}.catalogItemId`] = `${ci.name} no está autorizado en la OC ${order.number}.`
    }
    const price = resolveItemPrice(ds, project, typeId, ci.id, date)
    if (!price && !(isMoney(it.unitPrice) && it.unitPrice > 0)) f[`items.${i}.unitPrice`] = 'Sin precio en OC ni tarifario: ingresá un precio.'
  })
  return f
}

/** Builds contracted items freezing their current price (historical prices never change afterwards). */
export function buildServiceItems(ds: Dataset, project: ProjectRecord, typeId: string, items: ServiceItemInput[], date: string, ctx: DomainContext, keep: ServiceItem[] = []): ServiceItem[] {
  return items.map((it) => {
    const prev = keep.find((k) => k.catalogItemId === it.catalogItemId)
    const ci = findById(ds.catalogItems, it.catalogItemId)!
    if (prev) return { ...prev, quantity: it.quantity }
    const price = resolveItemPrice(ds, project, typeId, it.catalogItemId, date)
    return {
      id: ctx.newId('sit'),
      catalogItemId: ci.id,
      name: ci.name,
      unit: price?.unit ?? ci.unit,
      quantity: it.quantity,
      unitPrice: price?.unitPrice ?? Math.round((it.unitPrice ?? 0) * 100) / 100,
      source: price?.source ?? 'manual',
      sourceRef: price?.sourceRef,
    }
  })
}

export const itemsTotal = (items: ServiceItem[]) => addMoney(...items.map((i) => mulMoney(i.unitPrice, i.quantity)))
export const itemSubtotal = (i: Pick<ServiceItem, 'unitPrice' | 'quantity'>) => mulMoney(i.unitPrice, i.quantity)

/** Sets or removes an explicit project exception to the client policy (the client policy is untouched). */
export function setProjectException(ds: Dataset, projectId: string, exception: ProjectRecord['commercialException'] | null, ctx: DomainContext): Dataset {
  const p = findById(ds.projects, projectId)
  if (!p) throw new DomainError('El proyecto no existe.')
  if (exception && !exception.reason.trim()) throw new DomainError('Indicá el motivo de la excepción.', { reason: 'Indicá el motivo.' })
  if (exception && exception.poMode === undefined && exception.requiresCertificate === undefined) throw new DomainError('La excepción no cambia nada.', { poMode: 'Elegí qué cambia.' })
  const next = { ...ds, projects: replaceById(ds.projects, projectId, (x) => ({ ...x, commercialException: exception ? { ...exception, reason: exception.reason.trim() } : undefined, updatedAt: ctx.now() })) }
  return logActivityGlobal(next, exception ? `Excepción comercial en ${p.code}: ${exception.reason.trim()}.` : `Excepción comercial de ${p.code} eliminada.`, ctx, p.clientId)
}
