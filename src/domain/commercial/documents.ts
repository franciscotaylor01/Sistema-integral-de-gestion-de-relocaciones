import { getServiceType } from '@/config/serviceCatalog'
import type { CommercialCommunication, CurrencyCode, PriceUnit, Quotation, QuotationLine, QuotationParty, TariffSnapshotRow } from '@/types/domain'
import { logActivity } from '../activity'
import { findById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { logActivityGlobal } from './activity'
import { effectivePolicy, isServiceOffered } from './catalog'
import { addAmount, type Amounts } from './money'
import { isPendingVersion } from './pricing'
import { lineTotal, quotationParty, quotationStage, quotationTotals, sendQuotation, type QuotationStage } from './quotations'

/*
 * Phase 5.0B — commercial documents. Pure models of what a quotation or a
 * tariff sheet shows (rendered to PDF / email in the UI) and the manual record
 * of their sending. Nothing here sends anything, and nothing is invented: a
 * missing datum stays empty and the document says it is not informed.
 */

export interface DocumentLine {
  description: string
  details?: string
  quantity: number
  unit: PriceUnit
  unitPrice: number
  currency: CurrencyCode
  total: number
  special: boolean
}

export interface DocumentGroup {
  key: string
  label: string
  /** Project-specific description of the service (quotation line details). */
  details?: string
  lines: DocumentLine[]
  subtotal: Amounts
}

export interface QuotationDocument {
  quotationId: string
  number: string
  version: number
  stage: QuotationStage
  issueDate: string
  validUntil: string
  /** Frozen recipient data once prepared/sent; current data for drafts. */
  party: QuotationParty
  groups: DocumentGroup[]
  totals: Amounts
  conditions: string[]
  notes?: string
  sentAt?: string
  approvedAt?: string
  approvedBy?: string
  fileName: string
}

const unitWord: Record<PriceUnit, string> = { service: 'servicio', person: 'persona', family: 'grupo familiar', hour: 'hora', month: 'mes', session: 'sesión', document: 'documento' }
export const unitName = (u: PriceUnit) => unitWord[u]

function toLine(l: QuotationLine): DocumentLine {
  return { description: l.description, details: l.serviceItemId ? l.details : undefined, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, currency: l.currency, total: lineTotal(l), special: Boolean(l.serviceItemId) }
}

/** Conditions stated from the client's policy and the quotation itself (never invented). */
function conditionsOf(ds: Dataset, q: Quotation): string[] {
  const client = findById(ds.clients, q.clientId)
  const project = findById(ds.projects, q.projectId)
  const out = [`Validez de la propuesta: hasta el ${q.validUntil.split('-').reverse().join('/')}.`, 'Importes expresados en la moneda indicada en cada línea; no se aplica conversión entre monedas.']
  if (!client) return out
  const policy = effectivePolicy(client, project)
  if (client.paymentTermsDays > 0) out.push(`Condición de pago: ${client.paymentTermsDays} días desde la factura.`)
  if (policy.poMode === 'project') out.push('La facturación requiere orden de compra del cliente para los servicios aprobados.')
  if (policy.poMode === 'open') out.push('Los servicios se facturan contra la OC abierta vigente; los ítems no incluidos en ella requieren aprobación comercial explícita.')
  if (policy.requiresCertificate) out.push('La facturación requiere certificado de servicio aprobado por el cliente.')
  if (q.lines.some((l) => l.serviceItemId)) out.push('Los subservicios especiales son exclusivos de este proyecto y no modifican el tarifario vigente.')
  return out
}

export function quotationDocument(ds: Dataset, quotationId: string, today: string): QuotationDocument {
  const q = findById(ds.quotations, quotationId)
  if (!q) throw new DomainError('La cotización no existe.')
  const groups = new Map<string, DocumentGroup>()
  for (const l of q.lines) {
    const key = l.serviceId ?? 'extra'
    let g = groups.get(key)
    if (!g) {
      g = { key, label: l.serviceId ? getServiceType(l.serviceTypeId).label : 'Ítems adicionales', lines: [], subtotal: {} }
      groups.set(key, g)
    }
    if (l.details && !l.serviceItemId && !g.details) g.details = l.details
    g.lines.push(toLine(l))
    g.subtotal = addAmount(g.subtotal, l.currency, lineTotal(l))
  }
  const party = q.issuedTo ?? quotationParty(ds, q)
  return {
    quotationId: q.id,
    number: q.number,
    version: q.version,
    stage: quotationStage(q, today),
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    party,
    groups: [...groups.values()],
    totals: quotationTotals(q.lines),
    conditions: conditionsOf(ds, q),
    notes: q.notes,
    sentAt: q.sentAt,
    approvedAt: q.approvedAt,
    approvedBy: q.approvedBy,
    fileName: `${q.number}-v${q.version}${party.projectCode ? `-${party.projectCode}` : ''}.pdf`,
  }
}

/* ───────────── Approved tariff sheet ───────────── */

export interface TariffSheetGroup {
  serviceTypeId: string
  label: string
  rows: TariffSnapshotRow[]
}

export interface TariffSheet {
  clientId: string
  clientName: string
  legalName?: string
  date: string
  requiresApproval: boolean
  groups: TariffSheetGroup[]
  /** Prices left out: pending versions, or unapproved prices when approval is mandatory. */
  excluded: number
  /** Overlapping rules for the same item/market/currency/tier: left out until resolved in the tariff. */
  conflicts: { label: string; count: number }[]
  fileName: string
}

/**
 * Tariff in force on `date` for the client's offered services. Pending
 * versions never appear; when the client requires commercial approval only
 * approved prices are listed.
 */
export function tariffSheet(ds: Dataset, clientId: string, date: string): TariffSheet {
  const client = findById(ds.clients, clientId)
  if (!client) throw new DomainError('El cliente no existe.')
  const requiresApproval = Boolean(client.policy.requiresPriceApproval)
  let excluded = 0
  const inForce = ds.priceEntries.filter((e) => {
    if (e.clientId !== clientId || !e.active || e.supersededById || e.validFrom > date || (e.validTo && e.validTo < date) || !isServiceOffered(client, e.serviceTypeId)) return false
    if (isPendingVersion(e) || (requiresApproval && !e.approvedAt)) {
      excluded++
      return false
    }
    return true
  })
  // Overlapping rules would show two prices for the same thing: they are reported, not listed.
  const keyOf = (e: (typeof inForce)[number]) => [e.serviceTypeId, e.itemId ?? '', e.market, e.currency, e.minQuantity].join('|')
  const byKey = new Map<string, typeof inForce>()
  for (const e of inForce) byKey.set(keyOf(e), [...(byKey.get(keyOf(e)) ?? []), e])
  const conflicts: TariffSheet['conflicts'] = []
  const groups: TariffSheetGroup[] = []
  for (const e of inForce) {
    const same = byKey.get(keyOf(e))!
    if (same.length > 1) {
      if (same[0] === e) conflicts.push({ label: `${getServiceType(e.serviceTypeId).label}${e.itemId ? ` — ${findById(ds.catalogItems, e.itemId)?.name ?? e.itemId}` : ''} (${e.currency})`, count: same.length })
      continue
    }
    const item = e.itemId ? findById(ds.catalogItems, e.itemId) : undefined
    const label = getServiceType(e.serviceTypeId).label
    let g = groups.find((x) => x.serviceTypeId === e.serviceTypeId)
    if (!g) groups.push((g = { serviceTypeId: e.serviceTypeId, label, rows: [] }))
    g.rows.push({
      priceEntryId: e.id,
      serviceTypeId: e.serviceTypeId,
      itemId: e.itemId,
      name: item?.name ?? (e.itemId ? e.itemId : `${label} (servicio completo)`),
      unit: e.unit,
      market: e.market,
      currency: e.currency,
      unitPrice: e.unitPrice,
      minQuantity: e.minQuantity,
      validFrom: e.validFrom,
      validTo: e.validTo,
      approvalRef: e.approvedAt ? (e.approvalRef ?? 'Aprobado') : undefined,
    })
  }
  const order = (id: string) => ds.catalogItems.findIndex((i) => i.id === id)
  for (const g of groups) g.rows.sort((a, b) => (a.itemId ? order(a.itemId) : -1) - (b.itemId ? order(b.itemId) : -1) || a.market.localeCompare(b.market) || a.minQuantity - b.minQuantity)
  const slug = client.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')
  return { clientId, clientName: client.name, legalName: client.legalName || undefined, date, requiresApproval, groups, excluded, conflicts, fileName: `Tarifario-${slug}-${date}.pdf` }
}

/* ───────────── Manual sending records ───────────── */

export interface CommunicationInput {
  subject: string
  body: string
  recipients?: string
  sentAt: string
  reference?: string
}

function validateCommunication(input: CommunicationInput, today: string): Record<string, string> {
  const f: Record<string, string> = {}
  if (!input.subject.trim()) f.subject = 'Ingresá el asunto.'
  if (!input.body.trim()) f.body = 'Ingresá el cuerpo del email.'
  if (!isIsoDate(input.sentAt)) f.sentAt = 'Fecha inválida.'
  else if (input.sentAt > today) f.sentAt = 'No puede ser una fecha futura.'
  if ((input.recipients?.length ?? 0) > 300) f.recipients = 'Máximo 300 caracteres.'
  if ((input.reference?.length ?? 0) > 200) f.reference = 'Máximo 200 caracteres.'
  return f
}

function record(input: CommunicationInput, ctx: DomainContext, extra: Pick<CommercialCommunication, 'kind' | 'clientId'> & Partial<CommercialCommunication>): CommercialCommunication {
  return {
    id: ctx.newId('com'),
    subject: input.subject.trim(),
    body: input.body.trim(),
    recipients: input.recipients?.trim() || undefined,
    sentAt: input.sentAt,
    reference: input.reference?.trim() || undefined,
    registeredAt: ctx.now(),
    registeredBy: ctx.actorId,
    ...extra,
  }
}

/**
 * Registers that the user sent the quotation by email (outside SIGR). A draft
 * (or ready) quotation becomes "sent" with that date and reference; an already
 * sent one only gets a new communication (e.g. a reminder).
 */
export function registerQuotationSent(ds: Dataset, quotationId: string, input: CommunicationInput, requestId: string, ctx: DomainContext): { ds: Dataset; communicationId: string; duplicate: boolean } {
  const prior = ds.requests[requestId]
  if (prior) return { ds, communicationId: prior, duplicate: true }
  const q = findById(ds.quotations, quotationId)
  if (!q) throw new DomainError('La cotización no existe.')
  const f = validateCommunication(input, ctx.today())
  if (Object.keys(f).length) throw new DomainError('Revisá el registro de envío.', f)
  if (q.status === 'rejected' || q.status === 'approved' || q.supersededById) throw new DomainError('Solo se registran envíos de cotizaciones en borrador, preparadas o enviadas.')
  let next = ds
  if (q.status === 'draft') next = sendQuotation(ds, quotationId, ctx, { sentAt: input.sentAt, reference: input.reference })
  else if (input.sentAt < (q.sentAt ?? q.issueDate)) throw new DomainError('Revisá el registro de envío.', { sentAt: 'No puede ser anterior al primer envío.' })
  const doc = quotationDocument(next, quotationId, ctx.today())
  const com = record(input, ctx, { kind: 'quotation', clientId: q.clientId, projectId: q.projectId, quotationId, documentName: doc.fileName })
  next = { ...next, communications: [...next.communications, com], requests: { ...next.requests, [requestId]: com.id } }
  if (q.status !== 'draft') {
    next = logActivity(next, { projectId: q.projectId, kind: 'commercial', message: `Nuevo envío registrado de ${q.number} v${q.version}${com.reference ? ` (ref. ${com.reference})` : ''}.` }, ctx)
  }
  return { ds: next, communicationId: com.id, duplicate: false }
}

/** Registers a manual sending of the approved tariff, with a snapshot of the prices sent. */
export function registerTariffSent(ds: Dataset, clientId: string, input: CommunicationInput, requestId: string, ctx: DomainContext): { ds: Dataset; communicationId: string; duplicate: boolean } {
  const prior = ds.requests[requestId]
  if (prior) return { ds, communicationId: prior, duplicate: true }
  const f = validateCommunication(input, ctx.today())
  if (Object.keys(f).length) throw new DomainError('Revisá el registro de envío.', f)
  const sheet = tariffSheet(ds, clientId, input.sentAt)
  const rows = sheet.groups.flatMap((g) => g.rows)
  if (!rows.length) throw new DomainError('El cliente no tiene precios vigentes para enviar.')
  const com = record(input, ctx, { kind: 'tariff', clientId, documentName: sheet.fileName, tariffSnapshot: rows })
  const next: Dataset = { ...ds, communications: [...ds.communications, com], requests: { ...ds.requests, [requestId]: com.id } }
  return {
    ds: logActivityGlobal(next, `Tarifario enviado a ${sheet.clientName} (${rows.length} precios${com.reference ? `, ref. ${com.reference}` : ''}).`, ctx, clientId),
    communicationId: com.id,
    duplicate: false,
  }
}
