import { COMMERCIAL_AUTHORIZERS } from '@/config/commercial'
import { getServiceType } from '@/config/serviceCatalog'
import type { CurrencyCode, PriceUnit, Quotation, QuotationLine, QuotationStatus } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { addDays } from '../dates'
import { DomainError, isIsoDate } from '../errors'
import { mulMoney } from '../finance/money'
import { addAmount, round2, type Amounts } from './money'
import { resolvePrice } from './pricing'

/** Sent quotations past their validity are expired (derived, no write needed). */
export function effectiveStatus(q: Pick<Quotation, 'status' | 'validUntil'>, today: string): QuotationStatus {
  return q.status === 'sent' && q.validUntil < today ? 'expired' : q.status
}

export const lineTotal = (l: Pick<QuotationLine, 'quantity' | 'unitPrice'>) => mulMoney(l.unitPrice, l.quantity)

/** Totals per currency — never summed across currencies. */
export function quotationTotals(lines: Pick<QuotationLine, 'quantity' | 'unitPrice' | 'currency'>[]): Amounts {
  return lines.reduce<Amounts>((acc, l) => addAmount(acc, l.currency, lineTotal(l)), {})
}

export const isAuthorizer = (actorId: string) => COMMERCIAL_AUTHORIZERS.includes(actorId)

function nextQuotationNumber(ds: Dataset, today: string): string {
  const year = today.slice(0, 4)
  const max = ds.quotations.reduce((m, q) => {
    const match = /^COT-\d{4}-(\d{4,})$/.exec(q.number)
    return match ? Math.max(m, Number(match[1])) : m
  }, 0)
  return `COT-${year}-${String(max + 1).padStart(4, '0')}`
}

/**
 * Builds a draft from the project's contracted services, suggesting prices
 * from the client's tariff. Ambiguous or missing tariffs are left for review.
 */
export function createQuotationFromProject(ds: Dataset, projectId: string, ctx: DomainContext): { ds: Dataset; quotation: Quotation } {
  const project = findById(ds.projects, projectId)
  if (!project) throw new DomainError('El proyecto no existe.')
  const client = findById(ds.clients, project.clientId)
  if (!client) throw new DomainError('El cliente del proyecto no existe.')
  const draft = ds.quotations.find((q) => q.projectId === projectId && q.status === 'draft')
  if (draft) throw new DomainError(`Ya existe el borrador ${draft.number} v${draft.version} para este proyecto. Continuá editándolo.`)
  const services = ds.services.filter((s) => s.projectId === projectId)
  if (services.length === 0) throw new DomainError('El proyecto no tiene servicios para cotizar.')

  const today = ctx.today()
  const lines: QuotationLine[] = services.map((s) => {
    const type = getServiceType(s.typeId)
    const quantity = 1
    const res = resolvePrice(ds, { clientId: client.id, serviceTypeId: s.typeId, market: project.destination.country, currency: project.currency, date: today, quantity })
    const base = { id: ctx.newId('ql'), serviceId: s.id, serviceTypeId: s.typeId, description: `${type.label} — ${project.destination.city}`, quantity, currency: project.currency }
    if (res.status === 'unique') {
      return { ...base, unit: res.entry.unit, unitPrice: res.entry.unitPrice, priceSource: 'price-list' as const, priceEntryId: res.entry.id, suggestedUnitPrice: res.entry.unitPrice }
    }
    return {
      ...base,
      unit: 'service' as PriceUnit,
      unitPrice: 0,
      priceSource: 'manual' as const,
      notes: res.status === 'ambiguous' ? `Tarifa ambigua: ${res.candidates.length} reglas aplican. Elegí una.` : 'Sin tarifa vigente: ingresá el precio.',
    }
  })

  const quotation: Quotation = {
    id: ctx.newId('quo'),
    number: nextQuotationNumber(ds, today),
    version: 1,
    projectId,
    clientId: client.id,
    status: 'draft',
    issueDate: today,
    validUntil: addDays(today, client.policy.quoteValidityDays),
    lines,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  let next: Dataset = { ...ds, quotations: [...ds.quotations, quotation] }
  next = logActivity(next, { projectId, kind: 'commercial', message: `Borrador de cotización ${quotation.number} creado con ${lines.length} líneas.` }, ctx)
  return { ds: next, quotation }
}

export interface QuotationLineInput {
  id?: string
  serviceId?: string
  serviceTypeId: string
  description: string
  quantity: number
  unit: PriceUnit
  unitPrice: number
  currency: CurrencyCode
  priceEntryId?: string
  suggestedUnitPrice?: number
  adjustmentReason?: string
  notes?: string
}

export interface QuotationDraftInput {
  issueDate: string
  validUntil: string
  notes?: string
  lines: QuotationLineInput[]
}

export function validateQuotationDraft(ds: Dataset, quotation: Quotation, input: QuotationDraftInput, actorId: string): Record<string, string> {
  const f: Record<string, string> = {}
  if (!isIsoDate(input.issueDate)) f.issueDate = 'Fecha inválida.'
  if (!isIsoDate(input.validUntil)) f.validUntil = 'Fecha inválida.'
  if (isIsoDate(input.issueDate) && isIsoDate(input.validUntil) && input.validUntil < input.issueDate) f.validUntil = 'Debe ser posterior a la emisión.'
  if (input.lines.length === 0) f.lines = 'La cotización necesita al menos una línea.'
  const services = new Set(ds.services.filter((s) => s.projectId === quotation.projectId).map((s) => s.id))
  input.lines.forEach((l, i) => {
    if (l.serviceId && !services.has(l.serviceId)) f[`lines.${i}.serviceId`] = 'El servicio no pertenece al proyecto.'
    if (!l.description.trim()) f[`lines.${i}.description`] = 'Ingresá una descripción.'
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) f[`lines.${i}.quantity`] = 'Cantidad mayor a cero.'
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) f[`lines.${i}.unitPrice`] = 'Precio inválido.'
    const adjusted = l.suggestedUnitPrice !== undefined && round2(l.unitPrice) !== round2(l.suggestedUnitPrice)
    if (adjusted && !l.adjustmentReason?.trim()) f[`lines.${i}.adjustmentReason`] = 'Indicá el motivo del ajuste sobre la tarifa.'
    if (adjusted && !isAuthorizer(actorId)) f[`lines.${i}.unitPrice`] = 'No tenés autorización para ajustar precios de tarifa.'
  })
  if ((input.notes?.length ?? 0) > 2000) f.notes = 'Máximo 2000 caracteres.'
  return f
}

function toLines(input: QuotationLineInput[], ctx: DomainContext): QuotationLine[] {
  return input.map((l) => {
    const adjusted = l.suggestedUnitPrice !== undefined && round2(l.unitPrice) !== round2(l.suggestedUnitPrice)
    return {
      id: l.id ?? ctx.newId('ql'),
      serviceId: l.serviceId || undefined,
      serviceTypeId: l.serviceTypeId,
      description: l.description.trim(),
      quantity: round2(l.quantity),
      unit: l.unit,
      unitPrice: round2(l.unitPrice),
      currency: l.currency,
      priceSource: l.suggestedUnitPrice === undefined ? 'manual' : adjusted ? 'adjusted' : 'price-list',
      priceEntryId: l.priceEntryId,
      suggestedUnitPrice: l.suggestedUnitPrice,
      adjustmentReason: adjusted ? l.adjustmentReason?.trim() : undefined,
      notes: l.notes?.trim() || undefined,
    }
  })
}

function requireQuotation(ds: Dataset, id: string): Quotation {
  const q = findById(ds.quotations, id)
  if (!q) throw new DomainError('La cotización no existe.')
  return q
}

/** Only drafts are editable; sent/approved quotations require a new version. */
export function updateQuotationDraft(ds: Dataset, quotationId: string, input: QuotationDraftInput, ctx: DomainContext): Dataset {
  const q = requireQuotation(ds, quotationId)
  if (q.status !== 'draft') throw new DomainError('Solo se pueden editar borradores. Creá una nueva versión.')
  const fields = validateQuotationDraft(ds, q, input, ctx.actorId)
  if (Object.keys(fields).length) throw new DomainError('Revisá la cotización.', fields)
  return {
    ...ds,
    quotations: replaceById(ds.quotations, quotationId, (x) => ({
      ...x,
      issueDate: input.issueDate,
      validUntil: input.validUntil,
      notes: input.notes?.trim() || undefined,
      lines: toLines(input.lines, ctx),
    })),
  }
}

export function sendQuotation(ds: Dataset, quotationId: string, ctx: DomainContext): Dataset {
  const q = requireQuotation(ds, quotationId)
  if (q.status !== 'draft') throw new DomainError('Solo se envían borradores.')
  const problems = q.lines.map((l, i) => (l.unitPrice <= 0 ? `línea ${i + 1} sin precio` : '')).filter(Boolean)
  if (q.lines.length === 0 || problems.length) throw new DomainError(`No se puede enviar: ${problems.join(', ') || 'sin líneas'}.`)
  if (q.validUntil < ctx.today()) throw new DomainError('La validez ya venció. Actualizá la fecha antes de enviar.')
  let next: Dataset = { ...ds, quotations: replaceById(ds.quotations, quotationId, (x) => ({ ...x, status: 'sent', sentAt: ctx.today() })) }
  next = { ...next, projects: replaceById(next.projects, q.projectId, (p) => (p.financialStatus === 'to-quote' ? { ...p, financialStatus: 'quoted' } : p)) }
  return logActivity(next, { projectId: q.projectId, kind: 'commercial', message: `Cotización ${q.number} v${q.version} enviada al cliente.` }, ctx)
}

/** Approved amount per service and currency from approved, non-superseded versions. */
export function approvedAmountsByService(ds: Pick<Dataset, 'quotations'>, projectId: string, excludeQuotationId?: string): Map<string, Amounts> {
  const map = new Map<string, Amounts>()
  for (const q of ds.quotations) {
    if (q.projectId !== projectId || q.status !== 'approved' || q.supersededById || q.id === excludeQuotationId) continue
    for (const l of q.lines) if (l.serviceId) map.set(l.serviceId, addAmount(map.get(l.serviceId) ?? {}, l.currency, lineTotal(l)))
  }
  return map
}

export interface ApprovalInput {
  approvedBy: string
  approvedAt: string
}

/**
 * Registers the client's approval. The line snapshot becomes immutable, an
 * earlier approved version of the same quotation is superseded, and the new
 * amounts may not fall below what purchase orders already authorise.
 */
export function approveQuotation(ds: Dataset, quotationId: string, input: ApprovalInput, ctx: DomainContext): Dataset {
  const q = requireQuotation(ds, quotationId)
  if (!isAuthorizer(ctx.actorId)) throw new DomainError('No tenés autorización para registrar aprobaciones.')
  const status = effectiveStatus(q, ctx.today())
  if (status === 'expired') throw new DomainError('La cotización está vencida. Creá una nueva versión.')
  if (status !== 'sent') throw new DomainError('Solo se aprueban cotizaciones enviadas.')
  const f: Record<string, string> = {}
  if (!input.approvedBy.trim()) f.approvedBy = 'Indicá quién aprobó del lado del cliente.'
  if (!isIsoDate(input.approvedAt)) f.approvedAt = 'Fecha inválida.'
  else if (input.approvedAt > ctx.today()) f.approvedAt = 'No puede ser una fecha futura.'
  if (Object.keys(f).length) throw new DomainError('Revisá los datos de aprobación.', f)

  const previous = ds.quotations.filter((x) => x.number === q.number && x.status === 'approved' && !x.supersededById && x.id !== q.id)
  // New approved amounts (this version + other approved quotations of the project).
  const others = approvedAmountsByService({ quotations: ds.quotations.filter((x) => !previous.includes(x)) }, q.projectId)
  const mine = new Map<string, Amounts>()
  for (const l of q.lines) if (l.serviceId) mine.set(l.serviceId, addAmount(mine.get(l.serviceId) ?? {}, l.currency, lineTotal(l)))
  const authorized = authorizedByService(ds, q.projectId)
  const shortfalls: string[] = []
  for (const [serviceId, auth] of authorized) {
    for (const [cur, amount] of Object.entries(auth) as [CurrencyCode, number][]) {
      const cap = (others.get(serviceId)?.[cur] ?? 0) + (mine.get(serviceId)?.[cur] ?? 0)
      if (amount > cap + 0.001) shortfalls.push(getServiceType(findById(ds.services, serviceId)?.typeId ?? '').label)
    }
  }
  if (shortfalls.length) {
    throw new DomainError(`La nueva versión aprueba menos de lo ya autorizado por OC en: ${[...new Set(shortfalls)].join(', ')}. Ajustá las OC primero.`)
  }

  let next: Dataset = {
    ...ds,
    quotations: ds.quotations.map((x) => {
      if (x.id === q.id) return { ...x, status: 'approved' as const, approvedAt: input.approvedAt, approvedBy: input.approvedBy.trim() }
      if (previous.includes(x)) return { ...x, supersededById: q.id }
      return x
    }),
  }
  // Link the approved quotation to its services (financial references).
  const serviceIds = new Set(q.lines.map((l) => l.serviceId).filter(Boolean))
  next = { ...next, services: next.services.map((s) => (serviceIds.has(s.id) ? { ...s, financial: { ...s.financial, quotationId: q.id } } : s)) }
  return logActivity(
    next,
    {
      projectId: q.projectId,
      kind: 'commercial',
      message: `Cotización ${q.number} v${q.version} aprobada por ${input.approvedBy.trim()}${previous.length ? ` (reemplaza a v${previous.map((p) => p.version).join(', v')})` : ''}.`,
    },
    ctx,
  )
}

export function rejectQuotation(ds: Dataset, quotationId: string, reason: string, ctx: DomainContext): Dataset {
  const q = requireQuotation(ds, quotationId)
  const status = effectiveStatus(q, ctx.today())
  if (status !== 'sent' && status !== 'expired') throw new DomainError('Solo se rechazan cotizaciones enviadas.')
  if (!reason.trim()) throw new DomainError('Indicá el motivo del rechazo.', { reason: 'Indicá el motivo.' })
  const next: Dataset = {
    ...ds,
    quotations: replaceById(ds.quotations, quotationId, (x) => ({ ...x, status: 'rejected', rejectedAt: ctx.today(), rejectionReason: reason.trim() })),
  }
  return logActivity(next, { projectId: q.projectId, kind: 'commercial', message: `Cotización ${q.number} v${q.version} rechazada: ${reason.trim()}` }, ctx)
}

/** New draft version copied from any non-draft version; the original stays untouched. */
export function createQuotationVersion(ds: Dataset, quotationId: string, ctx: DomainContext): { ds: Dataset; quotation: Quotation } {
  const q = requireQuotation(ds, quotationId)
  if (q.status === 'draft') throw new DomainError('Este borrador todavía es editable.')
  const versions = ds.quotations.filter((x) => x.number === q.number)
  if (versions.some((x) => x.status === 'draft')) throw new DomainError('Ya existe un borrador de esta cotización.')
  const client = findById(ds.clients, q.clientId)
  const today = ctx.today()
  const quotation: Quotation = {
    id: ctx.newId('quo'),
    number: q.number,
    version: Math.max(...versions.map((x) => x.version)) + 1,
    previousVersionId: q.id,
    projectId: q.projectId,
    clientId: q.clientId,
    status: 'draft',
    issueDate: today,
    validUntil: addDays(today, client?.policy.quoteValidityDays ?? 30),
    lines: q.lines.map((l) => ({ ...l, id: ctx.newId('ql') })),
    notes: q.notes,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  let next: Dataset = { ...ds, quotations: [...ds.quotations, quotation] }
  next = logActivity(next, { projectId: q.projectId, kind: 'commercial', message: `Nueva versión ${quotation.number} v${quotation.version} creada a partir de v${q.version}.` }, ctx)
  return { ds: next, quotation }
}

/** Drafts can be discarded; issued versions are kept for traceability. */
export function discardQuotationDraft(ds: Dataset, quotationId: string, ctx: DomainContext): Dataset {
  const q = requireQuotation(ds, quotationId)
  if (q.status !== 'draft') throw new DomainError('Solo se pueden descartar borradores.')
  const next: Dataset = { ...ds, quotations: ds.quotations.filter((x) => x.id !== quotationId) }
  return logActivity(next, { projectId: q.projectId, kind: 'commercial', message: `Borrador ${q.number} v${q.version} descartado.` }, ctx)
}

/** PO-authorised amount per service and currency (active POs only). */
export function authorizedByService(ds: Pick<Dataset, 'purchaseOrders'>, projectId: string, excludePoId?: string): Map<string, Amounts> {
  const map = new Map<string, Amounts>()
  for (const po of ds.purchaseOrders) {
    if (po.projectId !== projectId || po.status !== 'active' || po.id === excludePoId) continue
    for (const a of po.allocations) map.set(a.serviceId, addAmount(map.get(a.serviceId) ?? {}, po.currency, a.amount))
  }
  return map
}
