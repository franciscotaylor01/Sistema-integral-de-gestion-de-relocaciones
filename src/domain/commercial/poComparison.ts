import { getServiceType } from '@/config/serviceCatalog'
import type { ComparisonResolution, CurrencyCode, PoComparisonReview, PriceUnit, ProjectRecord, PurchaseOrder } from '@/types/domain'
import { logActivity } from '../activity'
import { findById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { cmpMoney } from '../finance/money'
import { effectivePolicy } from './catalog'
import { addAmount, type Amounts } from './money'
import { lineTotal } from './quotations'

/*
 * Phase 5.0C.2 — quotation vs imported purchase order. Compares the approved
 * quotation snapshot with the lines Eugenia confirmed when importing the PO
 * (never unconfirmed guesses) and lists every difference. Differences are
 * never accepted automatically: each one needs a recorded decision, and
 * services with pending or rejected differences are not billable.
 * Manual POs (no import) and open POs keep their previous behaviour.
 */

export type RowStatus = 'match' | 'difference' | 'not-authorized' | 'review'

export type DifferenceType =
  | 'missing-in-po'
  | 'not-quoted'
  | 'qty-lower'
  | 'qty-higher'
  | 'price-lower'
  | 'price-higher'
  | 'amount-lower'
  | 'amount-higher'
  | 'unit'
  | 'currency'
  | 'payment-terms'
  | 'uncertain'
  | 'po-edited'

export const DIFFERENCE_LABEL: Record<DifferenceType, string> = {
  'missing-in-po': 'Cotizado y ausente en la OC',
  'not-quoted': 'En la OC pero no cotizado',
  'qty-lower': 'Cantidad autorizada inferior',
  'qty-higher': 'Cantidad autorizada superior',
  'price-lower': 'Precio inferior',
  'price-higher': 'Precio superior',
  'amount-lower': 'Importe inferior',
  'amount-higher': 'Importe superior',
  unit: 'Unidad distinta',
  currency: 'Moneda diferente',
  'payment-terms': 'Condición de pago distinta',
  uncertain: 'Coincidencia incierta (confirmada manualmente)',
  'po-edited': 'La OC cambió después de la importación',
}

/** Differences that always need explicit review (they would authorise more than quoted, or are unclear). */
const NEEDS_REVIEW: DifferenceType[] = ['not-quoted', 'qty-higher', 'price-higher', 'amount-higher', 'currency', 'uncertain', 'po-edited']

export interface Side {
  description: string
  details?: string
  quantity?: number
  unit?: PriceUnit
  unitPrice?: number
  amount: number
  currency: CurrencyCode
  /** Where it comes from: "COT-2026-0017 v1", "OC 4500… · línea 11". */
  refs: string[]
  /** Imported POs behind the PO side (stable ids). */
  poIds?: string[]
}

export interface ComparisonRow {
  key: string
  kind: 'item' | 'total' | 'terms'
  serviceId?: string
  /** Special sub-service (stable id) when the row is one. */
  serviceItemId?: string
  label: string
  quote?: Side
  po?: Side
  differences: DifferenceType[]
  status: RowStatus
  signature: string
  /** Current decision, if any and still valid for these values. */
  review?: PoComparisonReview
  /** A decision exists but the compared data changed afterwards. */
  staleReview?: PoComparisonReview
}

export interface PoComparison {
  applicable: boolean
  reason?: string
  /** Imported POs compared (manual POs are listed apart). */
  purchaseOrders: PurchaseOrder[]
  manualPurchaseOrders: PurchaseOrder[]
  rows: ComparisonRow[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const equal = (a: number, b: number) => cmpMoney(a, b) === 0

function addSide(prev: Side | undefined, next: Side): Side {
  if (!prev) return next
  const sameUnit = prev.unit === next.unit && prev.unitPrice !== undefined && prev.unitPrice === next.unitPrice
  return {
    description: prev.description,
    details: prev.details ?? next.details,
    quantity: sameUnit && prev.quantity !== undefined && next.quantity !== undefined ? prev.quantity + next.quantity : undefined,
    unit: sameUnit ? prev.unit : undefined,
    unitPrice: sameUnit ? prev.unitPrice : undefined,
    amount: round2(prev.amount + next.amount),
    currency: prev.currency,
    refs: [...prev.refs, ...next.refs],
    poIds: prev.poIds || next.poIds ? [...new Set([...(prev.poIds ?? []), ...(next.poIds ?? [])])] : undefined,
  }
}

/** Rows status: the worst difference wins. */
function statusOf(diffs: DifferenceType[]): RowStatus {
  if (diffs.includes('missing-in-po')) return 'not-authorized'
  if (diffs.some((d) => NEEDS_REVIEW.includes(d))) return 'review'
  return diffs.length ? 'difference' : 'match'
}

function compareSides(q: Side | undefined, p: Side | undefined, uncertain: boolean): DifferenceType[] {
  if (q && !p) return ['missing-in-po']
  if (!q && p) return ['not-quoted', ...(uncertain ? (['uncertain'] as const) : [])]
  if (!q || !p) return []
  const d: DifferenceType[] = []
  if (q.currency !== p.currency) return ['currency']
  const both = (a?: number, b?: number) => a !== undefined && b !== undefined
  if (q.unit && p.unit && q.unit !== p.unit) d.push('unit')
  if (both(q.quantity, p.quantity) && q.quantity !== p.quantity) d.push(p.quantity! < q.quantity! ? 'qty-lower' : 'qty-higher')
  if (both(q.unitPrice, p.unitPrice) && !equal(q.unitPrice!, p.unitPrice!)) d.push(p.unitPrice! < q.unitPrice! ? 'price-lower' : 'price-higher')
  if (!equal(q.amount, p.amount) && !d.some((x) => x.startsWith('qty') || x.startsWith('price'))) d.push(p.amount < q.amount ? 'amount-lower' : 'amount-higher')
  if (uncertain) d.push('uncertain')
  return d
}

const signatureOf = (q?: Side, p?: Side, diffs: DifferenceType[] = []) =>
  JSON.stringify([q && [q.quantity, q.unit, q.unitPrice, q.amount, q.currency], p && [p.quantity, p.unit, p.unitPrice, p.amount, p.currency], diffs])

/** Imported active POs of the project with their latest import (the validated source of truth for lines). */
function importedPos(ds: Pick<Dataset, 'purchaseOrders' | 'poImports'>, projectId: string) {
  return ds.purchaseOrders
    .filter((p) => p.projectId === projectId && p.status === 'active')
    .map((po) => ({ po, imp: ds.poImports.filter((i) => i.poId === po.id).sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))[0] }))
}

type CompareDs = Pick<Dataset, 'projects' | 'clients' | 'services' | 'quotations' | 'purchaseOrders' | 'poImports' | 'poReviews'>

export function comparePoWithQuotation(ds: CompareDs, projectId: string): PoComparison {
  const project = findById(ds.projects, projectId) as ProjectRecord | undefined
  const empty = (reason: string): PoComparison => ({ applicable: false, reason, purchaseOrders: [], manualPurchaseOrders: [], rows: [] })
  if (!project) return empty('El proyecto no existe.')
  const client = findById(ds.clients, project.clientId)
  const policy = effectivePolicy(client, project)
  if (policy.poMode === 'open') return empty('El proyecto factura contra una OC abierta: sus precios autorizados no se comparan por proyecto.')
  if (policy.poMode === 'none') return empty(policy.exception ? 'Excepción comercial documentada: el proyecto no requiere OC.' : 'El cliente no trabaja con OC.')
  const pos = importedPos(ds, projectId)
  const imported = pos.filter((x) => x.imp)
  const manual = pos.filter((x) => !x.imp).map((x) => x.po)
  if (!imported.length) return { ...empty('No hay OC importadas y validadas para comparar.'), manualPurchaseOrders: manual }

  // Services authorised only by manual POs are outside this comparison (their PO was entered by hand).
  const importedServices = new Set(imported.flatMap((x) => x.imp!.lines.filter((l) => l.included && l.serviceId).map((l) => l.serviceId!)))
  const manualOnly = new Set(manual.flatMap((p) => p.allocations.map((a) => a.serviceId)).filter((id) => !importedServices.has(id)))
  const keyOf = (serviceId: string | undefined, serviceItemId?: string) => (serviceItemId ? `${serviceId}|${serviceItemId}` : `${serviceId}|base`)

  const quoteSide = new Map<string, Side>()
  const meta = new Map<string, { serviceId?: string; serviceItemId?: string; label: string }>()
  // The quotation each PO answers to (its reference); without references, every approved version in force.
  const referenced = new Set(imported.map((x) => x.po.quotationId).filter(Boolean))
  const approved = ds.quotations.filter((q) => q.projectId === projectId && q.status === 'approved' && !q.supersededById && (!referenced.size || referenced.has(q.id)))
  for (const q of approved)
    for (const l of q.lines) {
      if (l.serviceId && manualOnly.has(l.serviceId)) continue
      const mk = l.serviceId ? keyOf(l.serviceId, l.serviceItemId) : `extra|${l.id}`
      const key = `${mk}|${l.currency}`
      const side: Side = { description: l.description, details: l.details, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, amount: lineTotal(l), currency: l.currency, refs: [`${q.number} v${q.version}`] }
      quoteSide.set(key, addSide(quoteSide.get(key), side))
      if (!meta.has(mk)) meta.set(mk, { serviceId: l.serviceId, serviceItemId: l.serviceItemId, label: l.serviceItemId ? l.description : l.serviceId ? getServiceType(l.serviceTypeId).label : l.description })
    }

  const poSide = new Map<string, Side>()
  const uncertain = new Set<string>()
  const edited = new Set<string>()
  for (const { po, imp } of imported) {
    const perService = new Map<string, number>()
    imp!.lines.forEach((l) => {
      if (!l.included || !l.serviceId) return
      const mk = keyOf(l.serviceId, l.serviceItemId)
      const key = `${mk}|${po.currency}`
      const amount = l.amount ?? round2((l.unitPrice ?? 0) * (l.quantity ?? 0))
      perService.set(l.serviceId, round2((perService.get(l.serviceId) ?? 0) + amount))
      const where = [l.source?.page && `pág. ${l.source.page}`, l.source?.sheet && `hoja ${l.source.sheet}`, l.source?.row && `fila ${l.source.row}`, l.source?.line && `línea ${l.source.line}`].filter(Boolean).join(' ')
      poSide.set(key, addSide(poSide.get(key), { description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, amount, currency: po.currency, refs: [`OC ${po.clientPoNumber}${where ? ` · ${where}` : ''}`], poIds: [po.id] }))
      if (l.status !== 'recognized') uncertain.add(key)
      if (!meta.has(mk)) {
        const s = findById(ds.services, l.serviceId)
        const item = l.serviceItemId ? s?.items?.find((i) => i.id === l.serviceItemId) : undefined
        meta.set(mk, { serviceId: l.serviceId, serviceItemId: l.serviceItemId, label: item ? `${getServiceType(s!.typeId).label} — ${item.name}` : s ? getServiceType(s.typeId).label : l.description })
      }
    })
    // The PO allocations were edited by hand after importing: the confirmed lines no longer describe it.
    for (const a of po.allocations) if (!equal(perService.get(a.serviceId) ?? 0, a.amount)) for (const k of [...poSide.keys()].filter((k) => k.startsWith(`${a.serviceId}|`))) edited.add(k)
  }

  const reviews = ds.poReviews.filter((r) => r.projectId === projectId && !r.supersededById)
  const attach = (row: Omit<ComparisonRow, 'review' | 'staleReview'>): ComparisonRow => {
    const r = reviews.find((x) => x.rowKey === row.key)
    if (!r) return row
    return r.signature === row.signature ? { ...row, review: r } : { ...row, staleReview: r }
  }

  // Keys carry the currency; a concept quoted in one currency and ordered only in another becomes one "currency" row.
  const base = (k: string) => k.slice(0, k.lastIndexOf('|'))
  const pairs = new Map<string, { q?: string; p?: string }[]>()
  for (const k of new Set([...quoteSide.keys(), ...poSide.keys()])) pairs.set(base(k), [...(pairs.get(base(k)) ?? []), { q: quoteSide.has(k) ? k : undefined, p: poSide.has(k) ? k : undefined }])
  const rows: ComparisonRow[] = []
  for (const [b, list] of pairs) {
    const onlyQ = list.filter((x) => x.q && !x.p)
    const onlyP = list.filter((x) => x.p && !x.q)
    const merged = onlyQ.length === 1 && onlyP.length === 1 ? [{ q: onlyQ[0].q, p: onlyP[0].p }, ...list.filter((x) => x.q && x.p)] : list
    for (const { q: qk, p: pk } of merged) {
      const q = qk ? quoteSide.get(qk) : undefined
      const p = pk ? poSide.get(pk) : undefined
      const diffs = compareSides(q, p, Boolean(pk && uncertain.has(pk)))
      if (pk && edited.has(pk)) diffs.push('po-edited')
      const m = meta.get(b)!
      const key = merged.length > 1 ? (qk ?? pk)! : b
      rows.push(attach({ key, kind: 'item', serviceId: m.serviceId, serviceItemId: m.serviceItemId, label: m.label, quote: q, po: p, differences: diffs, status: statusOf(diffs), signature: signatureOf(q, p, diffs) }))
    }
  }

  // Totals per currency.
  let qt: Amounts = {}
  let pt: Amounts = {}
  for (const s of quoteSide.values()) qt = addAmount(qt, s.currency, s.amount)
  for (const { po } of imported) pt = addAmount(pt, po.currency, po.authorizedAmount)
  for (const cur of new Set([...Object.keys(qt), ...Object.keys(pt)]) as Set<CurrencyCode>) {
    const q: Side | undefined = qt[cur] !== undefined ? { description: `Total ${cur}`, amount: qt[cur]!, currency: cur, refs: approved.map((x) => `${x.number} v${x.version}`) } : undefined
    const p: Side | undefined = pt[cur] !== undefined ? { description: `Total ${cur}`, amount: pt[cur]!, currency: cur, refs: imported.map((x) => `OC ${x.po.clientPoNumber}`) } : undefined
    const diffs: DifferenceType[] = !q ? ['currency'] : !p ? ['missing-in-po'] : equal(q.amount, p.amount) ? [] : [p.amount < q.amount ? 'amount-lower' : 'amount-higher']
    rows.push(attach({ key: `total|${cur}`, kind: 'total', label: `Total ${cur}`, quote: q, po: p, differences: diffs, status: statusOf(diffs), signature: signatureOf(q, p, diffs) }))
  }

  // Payment terms: PO condition vs the client's agreed condition.
  for (const { po } of imported) {
    if (!po.paymentTerms || !client) continue
    const same = po.paymentTerms.days === client.paymentTermsDays && po.paymentTerms.dayType === 'calendar'
    const diffs: DifferenceType[] = same ? [] : ['payment-terms']
    const text = (d: number, business?: boolean) => `${d} días${business ? ' hábiles' : ''}`
    const q: Side = { description: text(client.paymentTermsDays), amount: 0, currency: po.currency, refs: ['Condición del cliente'] }
    const p: Side = { description: text(po.paymentTerms.days, po.paymentTerms.dayType === 'business'), amount: 0, currency: po.currency, refs: [`OC ${po.clientPoNumber}`] }
    rows.push(attach({ key: `terms|${po.id}`, kind: 'terms', label: `Condición de pago (OC ${po.clientPoNumber})`, quote: q, po: p, differences: diffs, status: statusOf(diffs), signature: signatureOf(q, p, diffs) }))
  }

  return { applicable: true, purchaseOrders: imported.map((x) => x.po), manualPurchaseOrders: manual, rows }
}

/** A row is settled when it matches or has a valid decision. */
export const isSettled = (r: ComparisonRow) => r.status === 'match' || Boolean(r.review)
export const isAuthorized = (r: ComparisonRow) => r.status === 'match' || r.review?.resolution === 'accepted' || r.review?.resolution === 'exception'

export interface ComparisonGate {
  /** Services that cannot be billed, with the reason. */
  blocked: Map<string, string>
  /** Special sub-services the PO does not authorise. */
  excludedItems: Set<string>
}

/** Billing consequences of the comparison (empty when it does not apply). */
export function comparisonGate(ds: CompareDs, projectId: string): ComparisonGate {
  const gate: ComparisonGate = { blocked: new Map(), excludedItems: new Set() }
  const c = comparePoWithQuotation(ds, projectId)
  if (!c.applicable) return gate
  for (const r of c.rows) {
    if (r.kind !== 'item' || !r.serviceId || isAuthorized(r)) continue
    if (r.serviceItemId && (r.status === 'not-authorized' || r.review?.resolution === 'rejected')) {
      gate.excludedItems.add(r.serviceItemId)
      continue
    }
    if (r.status === 'not-authorized' && !r.review) continue // no PO amount for it anyway
    gate.blocked.set(r.serviceId, r.review?.resolution === 'rejected' ? `No autorizado: ${r.label}` : `Diferencia OC vs. cotización pendiente de revisión (${r.label})`)
  }
  return gate
}

/* ───────────── Decisions ───────────── */

export interface ReviewInput {
  resolution: ComparisonResolution
  reason: string
  evidence?: string
  date: string
  reference?: string
}

export const RESOLUTION_LABEL: Record<ComparisonResolution, string> = {
  accepted: 'Aceptada (verificada)',
  rejected: 'No autorizada',
  exception: 'Excepción comercial documentada',
}

/** Records a decision on a row; an earlier decision is kept and marked as superseded. */
export function reviewComparisonRow(ds: Dataset, projectId: string, rowKey: string, input: ReviewInput, ctx: DomainContext): Dataset {
  const row = comparePoWithQuotation(ds, projectId).rows.find((r) => r.key === rowKey)
  if (!row) throw new DomainError('La fila de comparación no existe (¿cambió la OC?).')
  if (row.status === 'match' && input.resolution !== 'rejected') throw new DomainError('La fila coincide: no requiere resolución.')
  const f: Record<string, string> = {}
  if (!input.reason.trim()) f.reason = 'Indicá el motivo.'
  if (!isIsoDate(input.date)) f.date = 'Fecha inválida.'
  else if (input.date > ctx.today()) f.date = 'No puede ser una fecha futura.'
  // Authorising more (or something not quoted) needs evidence of the client's / commercial approval.
  if ((input.resolution === 'accepted' || input.resolution === 'exception') && row.status === 'review' && !input.evidence?.trim()) f.evidence = 'Indicá la evidencia de aprobación (email, acta, enmienda de OC).'
  if (Object.keys(f).length) throw new DomainError('Revisá la resolución.', f)
  const review: PoComparisonReview = {
    id: ctx.newId('pcr'),
    projectId,
    rowKey,
    signature: row.signature,
    snapshot: {
      label: row.label,
      status: row.status,
      differences: row.differences.map((d) => DIFFERENCE_LABEL[d]),
      quote: row.quote && `${row.quote.quantity ?? ''} ${row.quote.unitPrice ?? ''} ${row.quote.currency} ${row.quote.amount}`.trim(),
      po: row.po && `${row.po.quantity ?? ''} ${row.po.unitPrice ?? ''} ${row.po.currency} ${row.po.amount}`.trim(),
    },
    resolution: input.resolution,
    reason: input.reason.trim(),
    evidence: input.evidence?.trim() || undefined,
    date: input.date,
    reference: input.reference?.trim() || undefined,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  const previous = ds.poReviews.filter((r) => r.projectId === projectId && r.rowKey === rowKey && !r.supersededById)
  const next: Dataset = {
    ...ds,
    poReviews: [...ds.poReviews.map((r) => (previous.includes(r) ? { ...r, supersededById: review.id } : r)), review],
  }
  return logActivity(
    next,
    { projectId, kind: 'commercial', message: `OC vs. cotización — ${row.label}: ${RESOLUTION_LABEL[input.resolution].toLowerCase()}${previous.length ? ' (corrige una resolución anterior)' : ''}. Motivo: ${review.reason}.` },
    ctx,
  )
}

/** Every decision on a row, newest first (superseded ones included). */
export const reviewHistory = (ds: Pick<Dataset, 'poReviews'>, projectId: string, rowKey: string) =>
  ds.poReviews.filter((r) => r.projectId === projectId && r.rowKey === rowKey).reverse() // appended in order

/* ───────────── Authorised units for billing (Phase 5.0C.3) ───────────── */

export interface AuthorizedUnit {
  serviceId: string
  /** Special sub-service (stable id), absent for the service base. */
  serviceItemId?: string
  label: string
  /** Quantity, price and amount as the PO authorises them (not the quotation when they differ). */
  quantity: number
  unitPrice: number
  amount: number
  unit?: PriceUnit
  currency: CurrencyCode
  /** "Coincide", "Diferencia aceptada", "Excepción documentada". */
  basis: string
  refs: string[]
  /** Imported POs authorising the unit: billed quantities are counted against them only. */
  purchaseOrderIds: string[]
  review?: PoComparisonReview
}

export interface UnavailableItem {
  serviceId?: string
  serviceItemId?: string
  label: string
  reason: string
}

/**
 * Units effectively authorised by imported POs, straight from the comparison
 * rows and their (non stale) decisions. Pending, rejected, stale or missing
 * concepts are returned as unavailable with the reason. Manual and open POs
 * are not covered (`applicable: false` or services outside the comparison).
 */
export function authorizedUnits(ds: CompareDs, projectId: string): { applicable: boolean; byService: Map<string, AuthorizedUnit[]>; unavailable: UnavailableItem[] } {
  const c = comparePoWithQuotation(ds, projectId)
  const byService = new Map<string, AuthorizedUnit[]>()
  const unavailable: UnavailableItem[] = []
  if (!c.applicable) return { applicable: false, byService, unavailable }
  for (const r of c.rows) {
    if (r.kind !== 'item' || !r.serviceId) continue
    if (isAuthorized(r) && r.po) {
      const qty = r.po.quantity ?? 1
      const unit: AuthorizedUnit = {
        serviceId: r.serviceId,
        serviceItemId: r.serviceItemId,
        label: r.label,
        quantity: qty,
        unitPrice: r.po.unitPrice ?? round2(r.po.amount / qty),
        amount: r.po.amount,
        unit: r.po.unit,
        currency: r.po.currency,
        basis: r.status === 'match' ? 'Coincide con la cotización' : r.review?.resolution === 'exception' ? 'Excepción comercial documentada' : 'Diferencia aceptada',
        refs: r.po.refs,
        purchaseOrderIds: r.po.poIds ?? [],
        review: r.review,
      }
      byService.set(r.serviceId, [...(byService.get(r.serviceId) ?? []), unit])
      continue
    }
    const reason =
      r.status === 'not-authorized'
        ? 'Cotizado pero ausente en la OC: no autorizado.'
        : r.review?.resolution === 'rejected'
          ? `Diferencia no autorizada: ${r.review.reason}`
          : r.staleReview
            ? 'La OC o la cotización cambiaron después de la resolución: revisala de nuevo.'
            : `Diferencia pendiente de revisión: ${r.differences.map((d) => DIFFERENCE_LABEL[d].toLowerCase()).join(', ')}.`
    unavailable.push({ serviceId: r.serviceId, serviceItemId: r.serviceItemId, label: r.label, reason })
  }
  return { applicable: true, byService, unavailable }
}
