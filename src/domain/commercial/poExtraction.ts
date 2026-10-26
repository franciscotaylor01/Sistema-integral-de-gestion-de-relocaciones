import { AR_PROVINCES } from '@/config/provinces'
import { activeServiceTypes, getServiceType } from '@/config/serviceCatalog'
import type { CurrencyCode, DocProvenance, ImportFieldStatus, PaymentTerms, PriceUnit, ProjectRecord } from '@/types/domain'
import type { Cell } from '@/lib/xlsx'
import { findById } from '../collections'
import type { Dataset } from '../dataset'
import { isIsoDate } from '../errors'
import { matchService, norm, parsePrice, recognizeCurrency, recognizeUnit, SERVICE_SYNONYMS, similarity } from './tariffImport'

/*
 * Phase 5.0C.1 — purchase-order extraction, decoupled from the UI. Readers
 * (PDF text, xlsx, pasted email) turn a document into text lines and tables
 * with their provenance; this module recognises PO fields and item lines and
 * proposes correspondences with the project's services. Nothing is invented:
 * unknown data stays "not found" and doubtful data asks for confirmation.
 */

/** Where a datum comes from in the original document. */
export type Provenance = DocProvenance

export interface DocLine {
  text: string
  source: Provenance
}

export interface DocTable {
  sheet: string
  headerRow: number
  header: Cell[]
  rows: { cells: Cell[]; source: Provenance }[]
}

/** A document as read locally (or by a future server-side processor). */
export interface PoDocument {
  kind: 'pdf' | 'xlsx' | 'text'
  fileName?: string
  /** "ok": readable text; "requires-processor": scanned / undecodable — needs OCR/AI; "failed": unreadable. */
  status: 'ok' | 'requires-processor' | 'failed'
  reason?: string
  lines: DocLine[]
  tables: DocTable[]
}

export type FieldStatus = ImportFieldStatus

export type PoFieldKey = 'poNumber' | 'client' | 'taxId' | 'province' | 'issueDate' | 'validTo' | 'currency' | 'paymentTerms' | 'projectRef' | 'quotationRef' | 'total' | 'adminRefs'

export interface ExtractedField {
  key: PoFieldKey
  /** Value as written in the document. */
  raw?: string
  /** Normalised value for SIGR (ISO date, currency code, number as string, days…). */
  value?: string
  source?: Provenance
  status: FieldStatus
  note?: string
}

export interface LineCandidate {
  serviceId: string
  catalogItemId?: string
  /** Project special sub-service (service item id). */
  serviceItemId?: string
  label: string
  score: number
}

export interface ExtractedLine {
  id: string
  /** Original text of the row, kept verbatim. */
  raw: string
  description: string
  quantity?: number
  unit?: PriceUnit
  unitPrice?: number
  amount?: number
  currency?: CurrencyCode
  source: Provenance
  status: FieldStatus
  note?: string
  match?: LineCandidate
  candidates: LineCandidate[]
}

export interface PoExtraction {
  fields: ExtractedField[]
  lines: ExtractedLine[]
}

export const FIELD_LABELS: Record<PoFieldKey, { label: string; sigr: string; required?: boolean }> = {
  poNumber: { label: 'Número de OC', sigr: 'Número oficial de OC', required: true },
  client: { label: 'Cliente / razón social', sigr: 'Cliente del proyecto' },
  taxId: { label: 'Dato fiscal', sigr: 'Identificación fiscal (solo verificación)' },
  province: { label: 'Provincia', sigr: 'Provincia del proyecto (verificación)' },
  issueDate: { label: 'Fecha de emisión', sigr: 'Fecha de emisión', required: true },
  validTo: { label: 'Vigencia', sigr: 'Vigencia (notas)' },
  currency: { label: 'Moneda', sigr: 'Moneda de la OC', required: true },
  paymentTerms: { label: 'Condición de pago', sigr: 'Plazo de pago (días)' },
  projectRef: { label: 'Referencia al proyecto', sigr: 'Proyecto (verificación)' },
  quotationRef: { label: 'Cotización', sigr: 'Cotización aprobada' },
  total: { label: 'Total', sigr: 'Monto autorizado', required: true },
  adminRefs: { label: 'Referencias administrativas', sigr: 'Notas de la OC' },
}

const low = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/* ───────────── Values ───────────── */

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DATE_RE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) de (\d{4})\b/

/** First date in a text (dd/mm/yyyy, yyyy-mm-dd or "15 de octubre de 2026"). */
export function findDate(text: string): { iso: string; raw: string } | undefined {
  const m = DATE_RE.exec(low(text))
  if (!m) return undefined
  let iso: string
  if (m[1]) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  else if (m[4]) iso = `${m[4]}-${m[5]}-${m[6]}`
  else iso = `${m[9]}-${String((m[8] === 'setiembre' ? 8 : MONTHS.indexOf(m[8])) + 1).padStart(2, '0')}-${m[7].padStart(2, '0')}`
  return isIsoDate(iso) ? { iso, raw: m[0] } : undefined
}

const CURRENCY_TOKEN = /(?:^|[\s(:])(usd|ars|eur|brl|mxn|gbp|clp|u\$s|us\$|u\$d|€|\$)(?=[\s\d)]|$)/i

/** Number tokens with their (optional) currency, e.g. "USD 4.500,00", "300,00", "1". */
const NUM_RE = /(?:(usd|ars|eur|brl|mxn|gbp|clp|u\$s|us\$|€|\$)\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/gi

interface NumToken {
  start: number
  value: number
  ambiguous: boolean
  currency?: CurrencyCode | 'ambiguous'
  raw: string
}

function numbers(text: string): NumToken[] {
  const out: NumToken[] = []
  for (const m of text.matchAll(NUM_RE)) {
    const p = parsePrice(m[2])
    if (p.value === undefined) continue
    out.push({ start: m.index!, value: p.value, ambiguous: Boolean(p.ambiguous), currency: m[1] ? recognizeCurrency(m[1]) : undefined, raw: m[0] })
  }
  return out
}

/* ───────────── Fields ───────────── */

interface Hit {
  raw: string
  value: string
  source: Provenance
  labelled: boolean
}

type Matcher = (text: string, l: string) => { raw: string; value: string; labelled?: boolean } | undefined

const after = (text: string, re: RegExp): string | undefined => {
  const m = re.exec(low(text))
  return m ? text.slice(m.index + m[0].length).replace(/^[\s:–—-]+/, '').trim() : undefined
}

const MATCHERS: Partial<Record<PoFieldKey, Matcher>> = {
  poNumber: (text, l) => {
    const m = /(?:orden de compra|purchase order|\bo\.?\s?c\.?(?=[\s:#n°º]|$)|\bp\.?\s?o\.?(?=[\s:#n°º]))\s*(?:n[°ºo]\.?\s*|nro\.?\s*|numero\s*|number\s*|no\.\s*|#\s*)?[:-]?\s*([a-z]{0,4}[-/]?\d[a-z0-9/.-]{2,})/i.exec(l)
    return m ? { raw: text.slice(m.index, m.index + m[0].length).trim(), value: m[1].toUpperCase().replace(/[.]$/, ''), labelled: true } : undefined
  },
  taxId: (text, l) => {
    const m = /\b(\d{2})-?(\d{8})-?(\d)\b/.exec(l)
    if (m && /(cuit|cuil|cdi|tax|vat|nif|rut|ruc|fiscal)/.test(l)) return { raw: m[0], value: `${m[1]}-${m[2]}-${m[3]}`, labelled: true }
    const g = /(?:cuit|tax id|vat|nif|rut|ruc|id(?:entificacion)? fiscal)\s*(?:n[°º]\s*)?[:-]?\s*([a-z0-9. -]{6,20}[0-9a-z])/i.exec(l)
    return g ? { raw: text.slice(g.index, g.index + g[0].length).trim(), value: g[1].toUpperCase().trim(), labelled: true } : undefined
  },
  issueDate: (text, l) => {
    if (/(valida hasta|vigencia|vence|vencimiento|valid until|hasta el|expir)/.test(l)) return undefined
    const d = findDate(text)
    return d ? { raw: d.raw, value: d.iso, labelled: /(fecha|emision|emitida|issue|date)/.test(l) } : undefined
  },
  validTo: (text, l) => {
    if (!/(valida hasta|vigencia|vence|vencimiento|valid until|hasta el|expir)/.test(l)) return undefined
    const all = [...low(text).matchAll(new RegExp(DATE_RE.source, 'g'))]
    const d = all.length ? findDate(all[all.length - 1][0]) : undefined
    return d ? { raw: d.raw, value: d.iso, labelled: true } : undefined
  },
  currency: (text) => {
    const v = after(text, /\b(moneda|currency|divisa)\b/)
    if (v !== undefined) {
      const c = recognizeCurrency(v.split(/[\s,;.]+/)[0]) ?? recognizeCurrency(v)
      return c ? { raw: v, value: c, labelled: true } : undefined
    }
    return undefined
  },
  paymentTerms: (text) => {
    const v = after(text, /(condicion(es)? de pago|plazo de pago|forma de pago|payment terms?)/)
    if (v === undefined || !v) return undefined
    const d = /(\d{1,3})\s*(dias|days|d\b)/.exec(low(v))
    return { raw: v, value: d ? `${d[1]}${/habiles|business/.test(low(v)) ? ' hábiles' : ''}` : '', labelled: Boolean(d) }
  },
  projectRef: (text) => {
    const m = /\bREL-\d{4}-\d{4}\b/i.exec(text)
    return m ? { raw: m[0], value: m[0].toUpperCase(), labelled: true } : undefined
  },
  quotationRef: (text) => {
    const m = /\bCOT-\d{4}-\d{4}\b/i.exec(text)
    return m ? { raw: m[0], value: m[0].toUpperCase(), labelled: true } : undefined
  },
  total: (text, l) => {
    if (!/\b(total|importe total|monto total|total amount|valor total)\b/.test(l) || /\b(sub ?total|iva|impuesto|neto)\b/.test(l)) return undefined
    const n = numbers(text).at(-1)
    return n ? { raw: text.trim(), value: String(n.value), labelled: !n.ambiguous } : undefined
  },
  adminRefs: (text, l) => (/(centro de costos?|cost center|solicitud|requisicion|pedido|\bsap\b|imputacion|contrato|orden interna|elemento pep|wbs)/.test(l) ? { raw: text.trim(), value: text.trim(), labelled: true } : undefined),
}

function collect(doc: PoDocument, key: PoFieldKey): Hit[] {
  const m = MATCHERS[key]
  if (!m) return []
  const hits: Hit[] = []
  for (const line of doc.lines) {
    const r = m(line.text, low(line.text))
    if (r) hits.push({ raw: r.raw, value: r.value, source: line.source, labelled: r.labelled ?? false })
  }
  return hits
}

function field(key: PoFieldKey, hits: Hit[], extra?: (f: ExtractedField) => ExtractedField): ExtractedField {
  if (!hits.length) return { key, status: 'missing' }
  const distinct = [...new Set(hits.map((h) => h.value))]
  const first = hits.find((h) => h.labelled) ?? hits[0]
  let f: ExtractedField = { key, raw: first.raw, value: first.value, source: first.source, status: first.labelled ? 'recognized' : 'confirm' }
  if (distinct.length > 1 && key !== 'adminRefs') f = { ...f, status: 'inconsistent', note: `El documento tiene valores distintos: ${distinct.join(' · ')}.` }
  if (key === 'adminRefs') f = { ...f, value: distinct.join(' · '), raw: hits.map((h) => h.raw).join(' · '), status: 'recognized' }
  if (key === 'paymentTerms' && !f.value) f = { ...f, status: 'confirm', note: 'No se reconoce un plazo en días: completalo.' }
  return extra ? extra(f) : f
}

/** Parses the confirmed payment-terms value ("45", "30 hábiles"). */
export function termsFromValue(v: string | undefined): PaymentTerms | undefined {
  const m = /^(\d{1,3})(\s*h[aá]biles)?$/i.exec((v ?? '').trim())
  return m ? { days: Number(m[1]), dayType: m[2] ? 'business' : 'calendar' } : undefined
}

/* ───────────── Item lines ───────────── */

const STOP = /^(sub ?total|total|iva|impuestos?|observaciones|notas|condiciones|importe total|monto total)\b/
const HEADER = (l: string) => /(descripcion|concepto|detalle|servicio|item|description)/.test(l) && /(cantidad|cant\b|qty|precio|unitario|importe|monto|amount|price)/.test(l)
const UNIT_TOKENS = /\b(servicios?|personas?|pax|familias?|grupo familiar|horas?|hs|mes(es)?|sesion(es)?|visitas?|documentos?|unidad(es)?|un\b|u\b|global|evento)\b/g

function parseRow(text: string, source: Provenance, id: string, docCurrency?: CurrencyCode): ExtractedLine | undefined {
  const t = text.replace(/^\s*(\d{1,4})(?:[.)-]|\s{2,}|\s(?=[A-Za-zÁÉÍÓÚáéíóúñÑ]))\s*/, '')
  const nums = numbers(t)
  if (!nums.length) return undefined
  // Description ends where only numbers, currencies and unit words remain.
  let cut = -1
  for (const n of nums) {
    const rest = low(t.slice(n.start)).replace(NUM_RE, ' ').replace(UNIT_TOKENS, ' ').replace(/[^a-z]/g, '')
    if (!rest) {
      cut = n.start
      break
    }
  }
  if (cut <= 0) return undefined
  const description = t.slice(0, cut).trim().replace(/[\s:–—-]+$/, '')
  if (!/[a-zA-Z]{3}/.test(description) || STOP.test(low(description))) return undefined
  const tail = nums.filter((n) => n.start >= cut)
  const unitWord = [...low(t.slice(cut)).matchAll(UNIT_TOKENS)][0]?.[0]
  const unit = unitWord ? recognizeUnit(unitWord.replace(/(es|s)$/, '').replace(/^visita$/, 'visitas')) ?? recognizeUnit(unitWord) : undefined
  const cur = tail.map((n) => n.currency).find((c) => c && c !== 'ambiguous') as CurrencyCode | undefined
  let quantity: number | undefined
  let unitPrice: number | undefined
  let amount: number | undefined
  let status: FieldStatus = 'recognized'
  let note: string | undefined
  if (tail.length >= 3) {
    quantity = tail[0].value
    unitPrice = tail[tail.length - 2].value
    amount = tail[tail.length - 1].value
  } else if (tail.length === 2) {
    quantity = tail[0].value
    amount = tail[1].value
    unitPrice = quantity ? Math.round((amount / quantity) * 100) / 100 : undefined
    status = 'confirm'
    note = 'Se interpretó cantidad e importe; confirmá el precio unitario.'
  } else {
    amount = tail[0].value
    status = 'confirm'
    note = 'Solo se encontró un importe: confirmá cantidad y precio.'
  }
  if (tail.some((n) => n.ambiguous)) {
    status = status === 'recognized' ? 'confirm' : status
    note = [note, 'Hay números con separador ambiguo (p. ej. «1.500»): confirmá.'].filter(Boolean).join(' ')
  }
  if (quantity !== undefined && unitPrice !== undefined && amount !== undefined && Math.abs(quantity * unitPrice - amount) > Math.max(0.01, amount * 0.001)) {
    status = 'inconsistent'
    note = `Cantidad × precio (${Math.round(quantity * unitPrice * 100) / 100}) no coincide con el importe (${amount}).`
  }
  if (tail.some((n) => n.currency === 'ambiguous') && !cur && !docCurrency) {
    status = status === 'recognized' ? 'confirm' : status
    note = [note, 'El símbolo «$» no identifica la moneda.'].filter(Boolean).join(' ')
  }
  return { id, raw: text.trim(), description, quantity, unit, unitPrice, amount, currency: cur, source, status, note, candidates: [] }
}

const TABLE_ROLES: Record<string, string[]> = {
  description: ['descripcion', 'concepto', 'detalle', 'servicio', 'item descripcion', 'description', 'prestacion', 'articulo'],
  quantity: ['cantidad', 'cant', 'qty', 'quantity', 'unidades'],
  unit: ['unidad', 'um', 'u m', 'unit', 'unidad de medida'],
  unitPrice: ['precio unitario', 'p unitario', 'precio unit', 'p unit', 'unit price', 'precio', 'valor unitario', 'tarifa'],
  amount: ['importe', 'total', 'subtotal', 'monto', 'amount', 'importe total', 'total linea', 'valor total'],
  currency: ['moneda', 'currency', 'divisa', 'mon'],
}

function tableRole(h: Cell): string | undefined {
  const n = norm(h)
  if (!n) return undefined
  for (const [role, syns] of Object.entries(TABLE_ROLES)) if (syns.includes(n)) return role
  for (const [role, syns] of Object.entries(TABLE_ROLES)) if (syns.some((s) => s.length > 3 && n.startsWith(s))) return role
  return undefined
}

/** Header row (0-based) of a PO items table: needs a description and a price or amount column. */
export function detectItemsHeader(rows: Cell[][]): { row: number; map: Record<string, number> } | undefined {
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const map: Record<string, number> = {}
    rows[r].forEach((h, i) => {
      const role = tableRole(h)
      if (role && map[role] === undefined) map[role] = i
    })
    if (map.description !== undefined && (map.unitPrice !== undefined || map.amount !== undefined)) return { row: r, map }
  }
  return undefined
}

const cellNumber = (c: Cell): { value?: number; ambiguous?: boolean } => {
  if (typeof c === 'number') return { value: c }
  const p = parsePrice(c)
  return { value: p.value, ambiguous: p.ambiguous }
}

function tableLines(t: DocTable, idOf: () => string): ExtractedLine[] {
  const map = detectItemsHeader([t.header])?.map
  if (!map) return []
  const out: ExtractedLine[] = []
  for (const r of t.rows) {
    const desc = String(r.cells[map.description] ?? '').trim()
    if (!desc) continue
    if (STOP.test(low(desc))) break
    const q = map.quantity !== undefined ? cellNumber(r.cells[map.quantity]) : {}
    const p = map.unitPrice !== undefined ? cellNumber(r.cells[map.unitPrice]) : {}
    const a = map.amount !== undefined ? cellNumber(r.cells[map.amount]) : {}
    if (q.value === undefined && p.value === undefined && a.value === undefined) continue
    const curRaw = map.currency !== undefined ? r.cells[map.currency] : undefined
    const c = curRaw ? recognizeCurrency(curRaw) : undefined
    let quantity = q.value
    let unitPrice = p.value
    let amount = a.value
    let status: FieldStatus = 'recognized'
    const notes: string[] = []
    if (quantity === undefined) {
      quantity = 1
      status = 'confirm'
      notes.push('Sin cantidad: se propone 1.')
    }
    if (unitPrice === undefined && amount !== undefined) unitPrice = Math.round((amount / quantity) * 100) / 100
    if (amount === undefined && unitPrice !== undefined) amount = Math.round(unitPrice * quantity * 100) / 100
    if (q.ambiguous || p.ambiguous || a.ambiguous) {
      status = 'confirm'
      notes.push('Separador numérico ambiguo: confirmá.')
    }
    if (a.value !== undefined && p.value !== undefined && Math.abs(quantity * p.value - a.value) > Math.max(0.01, a.value * 0.001)) {
      status = 'inconsistent'
      notes.push(`Cantidad × precio no coincide con el importe (${a.value}).`)
    }
    if (c === 'ambiguous') {
      status = status === 'recognized' ? 'confirm' : status
      notes.push('El símbolo «$» no identifica la moneda.')
    }
    out.push({
      id: idOf(),
      raw: r.cells.filter((x) => x !== null && x !== '').join(' | '),
      description: desc,
      quantity,
      unit: map.unit !== undefined ? recognizeUnit(r.cells[map.unit]) : undefined,
      unitPrice,
      amount,
      currency: c && c !== 'ambiguous' ? c : undefined,
      source: r.source,
      status,
      note: notes.join(' ') || undefined,
      candidates: [],
    })
  }
  return out
}

/* ───────────── Correspondences ───────────── */

/** Candidate project services / sub-services for an item text (never creates services). */
export function matchLine(ds: Pick<Dataset, 'services' | 'catalogItems'>, projectId: string, text: string): { best?: LineCandidate; candidates: LineCandidate[]; status: FieldStatus; note?: string } {
  const t = norm(text)
  const out: LineCandidate[] = []
  for (const s of ds.services.filter((x) => x.projectId === projectId)) {
    const label = getServiceType(s.typeId).label
    const items = [
      ...ds.catalogItems.filter((i) => i.serviceTypeId === s.typeId && i.active).map((i) => ({ catalogItemId: i.id, serviceItemId: undefined as string | undefined, name: i.name })),
      ...(s.items ?? []).filter((i) => i.special).map((i) => ({ catalogItemId: undefined as string | undefined, serviceItemId: i.id, name: i.name })),
    ]
    for (const it of items) {
      const n = norm(it.name)
      const score = n === t ? 1 : t.includes(n) && n.length >= 6 ? 0.95 : similarity(it.name, text)
      if (score >= 0.4) out.push({ serviceId: s.id, catalogItemId: it.catalogItemId, serviceItemId: it.serviceItemId, label: `${label} — ${it.name}`, score })
    }
    const words = [norm(label), ...(SERVICE_SYNONYMS[s.typeId] ?? [])]
    if (words.some((w) => w && (t === w || ` ${t} `.includes(` ${w} `)))) out.push({ serviceId: s.id, label, score: 0.75 })
  }
  out.sort((a, b) => b.score - a.score)
  const best = out[0]
  if (!best) {
    // Mentions a catalog service the project does not have? Report it (services are never created here).
    const typeId = activeServiceTypes().find((st) => [norm(st.label), ...(SERVICE_SYNONYMS[st.id] ?? [])].some((w) => w && ` ${t} `.includes(` ${w} `)))?.id ?? matchService(text).serviceTypeId
    return typeId
      ? { candidates: [], status: 'inconsistent', note: `Parece ${getServiceType(typeId).label}, que no está contratado en el proyecto: no se crean servicios automáticamente.` }
      : { candidates: [], status: 'missing', note: 'Sin correspondencia con los servicios del proyecto: elegí uno o excluí la línea.' }
  }
  const second = out.find((c) => c.serviceId !== best.serviceId || c.catalogItemId !== best.catalogItemId || c.serviceItemId !== best.serviceItemId)
  const clear = best.score >= 0.9 && (!second || second.score <= best.score - 0.15)
  return { best, candidates: out.slice(0, 6), status: clear ? 'recognized' : 'confirm', note: clear ? undefined : best.score < 0.9 ? 'Coincidencia probable: confirmá el servicio.' : 'Varias coincidencias posibles: elegí la correcta.' }
}

/* ───────────── Whole document ───────────── */

/** Recognises PO fields and lines, and checks them against the project (no data is changed). */
export function extractPo(ds: Dataset, projectId: string, doc: PoDocument): PoExtraction {
  const project = findById(ds.projects, projectId) as ProjectRecord | undefined
  const client = project ? findById(ds.clients, project.clientId) : undefined
  const text = doc.lines.map((l) => l.text).join('\n')
  const lt = low(text)

  const fields: ExtractedField[] = []
  fields.push(field('poNumber', collect(doc, 'poNumber')))

  // Client: the project's client must appear; another client's name is an inconsistency.
  const names = (c: { name: string; legalName: string }) => [c.name, c.legalName].filter(Boolean).map(low)
  const own = client ? names(client).find((n) => lt.includes(n)) : undefined
  const other = ds.clients.find((c) => c.id !== client?.id && names(c).some((n) => n.length > 4 && lt.includes(n)))
  const ownLine = own ? doc.lines.find((l) => low(l.text).includes(own)) : undefined
  if (own && ownLine) fields.push({ key: 'client', raw: ownLine.text.trim(), value: client!.name, source: ownLine.source, status: other ? 'inconsistent' : 'recognized', note: other ? `También menciona a ${other.name}.` : undefined })
  else if (other) fields.push({ key: 'client', raw: other.name, value: other.name, status: 'inconsistent', note: `El documento parece de ${other.name}, no de ${client?.name}.` })
  else fields.push({ key: 'client', status: 'missing', note: `No se encontró ${client?.name ?? 'el cliente'} en el documento: confirmá que corresponde.` })

  fields.push(
    field('taxId', collect(doc, 'taxId'), (f) => {
      if (f.status === 'missing' || !f.value) return f
      const digits = (s: string) => s.replace(/[^0-9a-z]/gi, '').toUpperCase()
      if (!client?.taxId) return { ...f, status: 'confirm', note: 'El cliente no tiene identificación fiscal registrada: no se modifica.' }
      return digits(client.taxId) === digits(f.value) ? f : { ...f, status: 'inconsistent', note: `Distinto del registrado (${client.taxId}): no se modifica el cliente.` }
    }),
  )

  const provHits: Hit[] = []
  for (const l of doc.lines) {
    const ll = low(l.text)
    for (const p of AR_PROVINCES) if (new RegExp(`\\b${low(p)}\\b`).test(ll)) provHits.push({ raw: p, value: p, source: l.source, labelled: /provincia|prov\./.test(ll) })
  }
  fields.push(
    field('province', provHits, (f) =>
      f.value && project?.province && f.value !== project.province ? { ...f, status: f.status === 'recognized' ? 'inconsistent' : f.status, note: `El proyecto es de ${project.province}.` } : f,
    ),
  )

  fields.push(field('issueDate', collect(doc, 'issueDate')))
  fields.push(field('validTo', collect(doc, 'validTo')))

  // Currency: explicit label, else currencies found in amounts. Never converted.
  let cur = field('currency', collect(doc, 'currency'))
  if (cur.status === 'missing') {
    const found: Hit[] = []
    for (const l of doc.lines) {
      const m = CURRENCY_TOKEN.exec(l.text)
      if (m) {
        const c = recognizeCurrency(m[1])
        if (c) found.push({ raw: m[1], value: c, source: l.source, labelled: false })
      }
    }
    for (const tb of doc.tables) {
      const map = detectItemsHeader([tb.header])?.map
      if (map?.currency !== undefined)
        for (const r of tb.rows) {
          const c = recognizeCurrency(r.cells[map.currency])
          if (c) found.push({ raw: String(r.cells[map.currency]), value: c, source: r.source, labelled: c !== 'ambiguous' })
        }
    }
    const real = found.filter((h) => h.value !== 'ambiguous')
    cur = real.length ? field('currency', real) : found.length ? { key: 'currency', raw: '$', source: found[0].source, status: 'confirm', note: '«$» no identifica la moneda: elegila.' } : cur
  }
  if (cur.value && project && cur.value !== project.currency) cur = { ...cur, status: 'inconsistent', note: [cur.note, `La moneda del proyecto es ${project.currency}: no se convierte automáticamente.`].filter(Boolean).join(' ') }
  fields.push(cur)

  fields.push(field('paymentTerms', collect(doc, 'paymentTerms')))
  fields.push(field('projectRef', collect(doc, 'projectRef'), (f) => (f.value && project && f.value !== project.code ? { ...f, status: 'inconsistent', note: `Este proyecto es ${project.code}.` } : f)))
  fields.push(
    field('quotationRef', collect(doc, 'quotationRef'), (f) => {
      if (!f.value) return f
      const q = ds.quotations.find((x) => x.projectId === projectId && x.number === f.value && x.status === 'approved' && !x.supersededById)
      return q ? { ...f, note: `v${q.version} aprobada.` } : { ...f, status: 'inconsistent', note: 'No hay una cotización aprobada vigente con ese número en el proyecto.' }
    }),
  )

  // Lines: tables (xlsx) first, else table-like text rows.
  let n = 0
  const idOf = () => `ln${++n}`
  let lines: ExtractedLine[] = doc.tables.flatMap((t) => tableLines(t, idOf))
  if (!lines.length) {
    const header = doc.lines.findIndex((l) => HEADER(low(l.text)))
    const body = header >= 0 ? doc.lines.slice(header + 1) : doc.lines
    const docCur = cur.value as CurrencyCode | undefined
    for (const l of body) {
      if (header >= 0 && STOP.test(low(l.text).trim())) break
      if (MATCHERS.total!(l.text, low(l.text)) || MATCHERS.poNumber!(l.text, low(l.text)) || findDate(l.text)) continue
      const r = parseRow(l.text, l.source, idOf(), docCur)
      if (r) lines.push(r)
    }
  }
  lines = lines.map((l) => {
    const m = matchLine(ds, projectId, l.description)
    const worst: FieldStatus[] = ['inconsistent', 'missing', 'confirm', 'recognized']
    const status = worst.find((s) => s === l.status || s === m.status) ?? 'recognized'
    const currencyIssue = l.currency && cur.value && l.currency !== cur.value
    return {
      ...l,
      match: m.best,
      candidates: m.candidates,
      status: currencyIssue ? 'inconsistent' : status,
      note: [l.note, m.note, currencyIssue ? `Moneda de la línea (${l.currency}) distinta de la OC (${cur.value}).` : undefined].filter(Boolean).join(' ') || undefined,
    }
  })

  // Total: stated vs sum of lines.
  let total = field('total', [...collect(doc, 'total'), ...tableTotals(doc)])
  const sum = Math.round(lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100
  if (total.status === 'missing' && sum > 0) total = { key: 'total', value: String(sum), status: 'confirm', note: 'Sin total en el documento: se propone la suma de las líneas.' }
  else if (total.value && lines.length && Math.abs(Number(total.value) - sum) > 0.01) total = { ...total, status: 'inconsistent', note: `La suma de las líneas es ${sum}.` }
  fields.push(total)
  fields.push(field('adminRefs', collect(doc, 'adminRefs')))
  return { fields, lines }
}

/** Total rows inside xlsx item tables ("Total" in the description column). */
function tableTotals(doc: PoDocument): Hit[] {
  const out: Hit[] = []
  for (const t of doc.tables) {
    const map = detectItemsHeader([t.header])?.map
    if (!map) continue
    for (const r of t.rows) {
      const d = low(String(r.cells[map.description] ?? ''))
      if (!/^total\b/.test(d)) continue
      const v = cellNumber(r.cells[map.amount ?? map.unitPrice ?? -1] ?? r.cells.findLast((c) => typeof c === 'number') ?? null)
      if (v.value !== undefined) out.push({ raw: r.cells.filter((c) => c !== null && c !== '').join(' | '), value: String(v.value), source: r.source, labelled: !v.ambiguous })
    }
  }
  return out
}

/** Human readable provenance: "oc.pdf · pág. 1, línea 12", "Hoja OC, fila 8". */
export function provenanceLabel(p?: Provenance): string {
  if (!p) return '—'
  const parts = [p.file, p.sheet ? `hoja ${p.sheet}` : undefined, p.page ? `pág. ${p.page}` : undefined, p.row ? `fila ${p.row}` : undefined, p.line ? `línea ${p.line}` : undefined, p.section].filter(Boolean)
  return parts.join(' · ') || '—'
}
