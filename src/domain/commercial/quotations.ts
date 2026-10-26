import { COMMERCIAL_AUTHORIZERS } from '@/config/commercial'
import { getServiceType } from '@/config/serviceCatalog'
import type { CurrencyCode, PriceUnit, Quotation, QuotationLine, QuotationParty, QuotationStatus } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { addDays } from '../dates'
import { DomainError, isIsoDate } from '../errors'
import { mulMoney } from '../finance/money'
import { addAmount, round2, type Amounts } from './money'
import { resolvePrice } from './pricing'
import { basePrice, regularItems, specialItemsOf } from './catalog'
import { specialLine } from './specialItems'

/** Sent quotations past their validity are expired (derived, no write needed). */
export function effectiveStatus(q: Pick<Quotation, 'status' | 'validUntil'>, today: string): QuotationStatus {
  return q.status === 'sent' && q.validUntil < today ? 'expired' : q.status
}

/** Display stage: drafts frozen for sending are "ready"; replaced approvals are "superseded". */
export type QuotationStage = QuotationStatus | 'ready' | 'superseded'

export function quotationStage(q: Pick<Quotation, 'status' | 'validUntil' | 'preparedAt' | 'supersededById'>, today: string): QuotationStage {
  if (q.supersededById) return 'superseded'
  if (q.status === 'draft' && q.preparedAt) return 'ready'
  return effectiveStatus(q, today)
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
  const lines: QuotationLine[] = services.flatMap((s): QuotationLine[] => {
    const type = getServiceType(s.typeId)
    // Phase 5.0B: project-specific special items get their own fixed lines (never inside the main line).
    const special: QuotationLine[] = specialItemsOf(s).map((i) => ({ id: ctx.newId('ql'), serviceId: s.id, serviceTypeId: s.typeId, currency: project.currency, priceSource: 'special' as const, ...specialLine(s, i) }))
    if (special.length && !regularItems(s).length && basePrice(s) === undefined) return special
    const quantity = 1
    const res = resolvePrice(ds, { clientId: client.id, serviceTypeId: s.typeId, market: project.destination.country, currency: project.currency, date: today, quantity })
    const base = { id: ctx.newId('ql'), serviceId: s.id, serviceTypeId: s.typeId, description: `${type.label} — ${project.destination.city}`, details: s.description, quantity, currency: project.currency }
    if (res.status === 'unique') {
      return [{ ...base, unit: res.entry.unit, unitPrice: res.entry.unitPrice, priceSource: 'price-list' as const, priceEntryId: res.entry.id, suggestedUnitPrice: res.entry.unitPrice }, ...special]
    }
    return [
      {
        ...base,
        unit: 'service' as PriceUnit,
        unitPrice: 0,
        priceSource: 'manual' as const,
        notes: res.status === 'ambiguous' ? `Tarifa ambigua: ${res.candidates.length} reglas aplican. Elegí una.` : 'Sin tarifa vigente: ingresá el precio.',
      },
      ...special,
    ]
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
  /** Phase 5.0B: service description (scope) shown on the quotation. */
  details?: string
  /** Phase 5.0B: special sub-service priced by the line. */
  serviceItemId?: string
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
    if ((l.details?.length ?? 0) > 600) f[`lines.${i}.details`] = 'Máximo 600 caracteres.'
    if (l.serviceItemId) {
      // Special items: price, quantity and currency come from the item, never changed silently here.
      const item = ds.services.find((s) => s.id === l.serviceId)?.items?.find((x) => x.id === l.serviceItemId && x.special)
      if (!item) f[`lines.${i}.serviceId`] = 'El subservicio especial no pertenece al servicio.'
      else if (round2(l.unitPrice) !== item.unitPrice || l.quantity !== item.quantity || l.currency !== (item.currency ?? l.currency))
        f[`lines.${i}.unitPrice`] = `Precio fijado por el subservicio especial (${item.quantity} × ${item.unitPrice}): modificalo desde el servicio.`
      return
    }
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
      priceSource: l.serviceItemId ? 'special' : l.suggestedUnitPrice === undefined ? 'manual' : adjusted ? 'adjusted' : 'price-list',
      priceEntryId: l.priceEntryId,
      suggestedUnitPrice: l.suggestedUnitPrice,
      adjustmentReason: adjusted ? l.adjustmentReason?.trim() : undefined,
      notes: l.notes?.trim() || undefined,
      details: l.details?.trim() || undefined,
      serviceItemId: l.serviceItemId || undefined,
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
  if (q.preparedAt) throw new DomainError('La cotización está preparada para envío: volvé a borrador para editarla.')
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

function assertSendable(q: Quotation, today: string, verb: string) {
  const problems = q.lines.map((l, i) => (l.unitPrice <= 0 ? `línea ${i + 1} sin precio` : '')).filter(Boolean)
  if (q.lines.length === 0 || problems.length) throw new DomainError(`No se puede ${verb}: ${problems.join(', ') || 'sin líneas'}.`)
  if (q.validUntil < today) throw new DomainError(`La validez ya venció. Actualizá la fecha antes de ${verb}.`)
}

/** Recipient data as of now (frozen on the quotation once prepared or sent). */
export function quotationParty(ds: Dataset, q: Pick<Quotation, 'clientId' | 'projectId'>): QuotationParty {
  const client = findById(ds.clients, q.clientId)
  const project = findById(ds.projects, q.projectId)
  const contact = client?.contacts.find((c) => c.primary) ?? client?.contacts[0]
  const manager = client ? findById(ds.staff, client.accountManagerId) : undefined
  const beneficiary = project ? findById(ds.people, project.beneficiaryId) : undefined
  return {
    clientName: client?.name ?? '',
    legalName: client?.legalName || undefined,
    taxId: client?.taxId || undefined,
    billingAddress: client?.billingAddress || undefined,
    contact: contact ? { name: contact.name, role: contact.role || undefined, email: contact.email || undefined } : undefined,
    projectCode: project?.code ?? '',
    beneficiary: beneficiary?.name,
    route: project ? `${project.origin.city} → ${project.destination.city}${project.province ? ` (${project.province})` : ''}` : undefined,
    accountManager: manager ? { name: manager.name, email: manager.email || undefined } : undefined,
  }
}

/** Phase 5.0B: freezes a draft for sending (content locked; still editable after "back to draft"). */
export function markQuotationReady(ds: Dataset, quotationId: string, ctx: DomainContext): Dataset {
  const q = requireQuotation(ds, quotationId)
  if (q.status !== 'draft') throw new DomainError('Solo se preparan borradores.')
  if (q.preparedAt) return ds
  assertSendable(q, ctx.today(), 'preparar')
  const next: Dataset = { ...ds, quotations: replaceById(ds.quotations, quotationId, (x) => ({ ...x, preparedAt: ctx.now(), preparedBy: ctx.actorId, issuedTo: quotationParty(ds, x) })) }
  return logActivity(next, { projectId: q.projectId, kind: 'commercial', message: `Cotización ${q.number} v${q.version} preparada para envío.` }, ctx)
}

export function reopenQuotationDraft(ds: Dataset, quotationId: string, ctx: DomainContext): Dataset {
  const q = requireQuotation(ds, quotationId)
  if (q.status !== 'draft' || !q.preparedAt) throw new DomainError('La cotización no está preparada para envío.')
  const next: Dataset = { ...ds, quotations: replaceById(ds.quotations, quotationId, (x) => ({ ...x, preparedAt: undefined, preparedBy: undefined, issuedTo: undefined })) }
  return logActivity(next, { projectId: q.projectId, kind: 'commercial', message: `Cotización ${q.number} v${q.version} vuelve a borrador.` }, ctx)
}

export interface SendInput {
  /** Date it was actually sent (manual record); defaults to today. */
  sentAt?: string
  reference?: string
}

/** Records that the quotation was sent (SIGR does not send it). Content becomes immutable. */
export function sendQuotation(ds: Dataset, quotationId: string, ctx: DomainContext, input: SendInput = {}): Dataset {
  const q = requireQuotation(ds, quotationId)
  if (q.status !== 'draft') throw new DomainError('Solo se envían borradores.')
  const sentAt = input.sentAt || ctx.today()
  if (!isIsoDate(sentAt)) throw new DomainError('Revisá la fecha de envío.', { sentAt: 'Fecha inválida.' })
  if (sentAt > ctx.today()) throw new DomainError('Revisá la fecha de envío.', { sentAt: 'No puede ser una fecha futura.' })
  if (sentAt < q.issueDate) throw new DomainError('Revisá la fecha de envío.', { sentAt: 'No puede ser anterior a la emisión.' })
  assertSendable(q, sentAt, 'enviar')
  let next: Dataset = {
    ...ds,
    quotations: replaceById(ds.quotations, quotationId, (x) => ({ ...x, status: 'sent', sentAt, sentRef: input.reference?.trim() || undefined, issuedTo: x.issuedTo ?? quotationParty(ds, x) })),
  }
  next = { ...next, projects: replaceById(next.projects, q.projectId, (p) => (p.financialStatus === 'to-quote' ? { ...p, financialStatus: 'quoted' } : p)) }
  return logActivity(next, { projectId: q.projectId, kind: 'commercial', message: `Cotización ${q.number} v${q.version} enviada al cliente${input.reference?.trim() ? ` (ref. ${input.reference.trim()})` : ''}.` }, ctx)
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
  /** Phase 5.0B: reference of the client's acceptance (email, signed copy…). */
  approvalRef?: string
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
  else if (q.sentAt && input.approvedAt < q.sentAt) f.approvedAt = 'No puede ser anterior al envío.'
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
      if (x.id === q.id) return { ...x, status: 'approved' as const, approvedAt: input.approvedAt, approvedBy: input.approvedBy.trim(), approvalRef: input.approvalRef?.trim() || undefined }
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
