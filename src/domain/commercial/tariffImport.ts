import { activeServiceTypes, getServiceType } from '@/config/serviceCatalog'
import type { CurrencyCode, PriceUnit, TariffImport } from '@/types/domain'
import { findById } from '../collections'
import { businessStamp, type DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from '../finance/audit'
import { cmpMoney, isMoney } from '../finance/money'
import { excelDateToIso, type Cell } from '@/lib/xlsx'
import { CURRENCY_ORDER } from '@/lib/money'
import { createCatalogItem } from './catalog'
import { rowKey, saveTariffGrid, tariffGrid, type TariffRowChange } from './tariffGrid'

/*
 * Phase 5.0A — Excel tariff import. Pure functions: detect the header row and
 * column mapping, parse prices/currencies without guessing, match rows with the
 * SIGR catalog (exact / probable / ambiguous / none) and apply the confirmed
 * rows atomically through the quick-editor save (same validation & versioning).
 * Synonyms only PROPOSE matches; nothing is invented.
 */

export type ColumnRole = 'service' | 'item' | 'price' | 'currency' | 'unit' | 'validFrom' | 'validTo'
export type ColumnMapping = Partial<Record<ColumnRole, number>>

export const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9$€ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const HEADER_SYNONYMS: Record<ColumnRole, string[]> = {
  service: ['servicio', 'servicio principal', 'categoria', 'rubro', 'service', 'area', 'linea de servicio'],
  item: ['subservicio', 'sub servicio', 'item', 'concepto', 'detalle', 'descripcion', 'prestacion', 'sub service', 'subservice', 'description'],
  price: ['precio', 'importe', 'tarifa', 'valor', 'monto', 'price', 'fee', 'honorarios', 'honorario', 'precio unitario', 'costo'],
  currency: ['moneda', 'divisa', 'currency', 'mon'],
  unit: ['unidad', 'unit', 'um', 'u m', 'unidad de medida', 'por'],
  validFrom: ['vigencia', 'desde', 'vigente desde', 'valid from', 'inicio', 'fecha desde'],
  validTo: ['hasta', 'vigente hasta', 'valid to', 'fin', 'vencimiento', 'fecha hasta'],
}

function roleOf(header: Cell): ColumnRole | undefined {
  const h = norm(header)
  if (!h) return undefined
  for (const [role, syns] of Object.entries(HEADER_SYNONYMS) as [ColumnRole, string[]][]) if (syns.includes(h)) return role
  for (const [role, syns] of Object.entries(HEADER_SYNONYMS) as [ColumnRole, string[]][]) if (syns.some((s) => s.length > 3 && h.startsWith(s))) return role
  return undefined
}

/** Row (0-based) among the first 30 with the most recognisable headers (≥2), else 0. */
export function detectHeaderRow(rows: Cell[][]): number {
  let best = 0
  let score = 1
  rows.slice(0, 30).forEach((r, i) => {
    const s = new Set(r.map(roleOf).filter(Boolean)).size
    if (s > score) {
      score = s
      best = i
    }
  })
  return best
}

export function guessMapping(header: Cell[]): ColumnMapping {
  const m: ColumnMapping = {}
  header.forEach((h, i) => {
    const r = roleOf(h)
    if (r && m[r] === undefined) m[r] = i
  })
  return m
}

/* ───────────── Values ───────────── */

const CURRENCY_WORDS: [RegExp, CurrencyCode][] = [
  [/^(usd|us\$|u\$s|u\$d|dolar(es)?( estadounidenses?)?|dollars?)$/, 'USD'],
  [/^(eur|€|euros?)$/, 'EUR'],
  [/^(ars|pesos?( argentinos?)?|\$ ?ar)$/, 'ARS'],
  [/^(brl|reales?|r\$)$/, 'BRL'],
  [/^(mxn|pesos mexicanos)$/, 'MXN'],
  [/^(gbp|£|libras?)$/, 'GBP'],
  [/^(clp|pesos chilenos)$/, 'CLP'],
]

/** Recognised currency code; "$" alone is ambiguous (never assumed). */
export function recognizeCurrency(raw: Cell): CurrencyCode | 'ambiguous' | undefined {
  const t = String(raw ?? '').trim()
  if (!t) return undefined
  if (t === '$') return 'ambiguous'
  const up = t.toUpperCase()
  if ((CURRENCY_ORDER as string[]).includes(up)) return up as CurrencyCode
  const n = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  for (const [re, c] of CURRENCY_WORDS) if (re.test(n)) return c
  return undefined
}

export interface ParsedPrice {
  value?: number
  /** Currency embedded in the cell (e.g. "USD 1.500"). */
  currency?: CurrencyCode | 'ambiguous'
  /** Separator could mean thousands or decimals (e.g. "1,500"): needs confirmation. */
  ambiguous?: boolean
  error?: string
}

/** Parses "1.500,50", "1,500.50", "USD 1500", 1500 … without guessing silently. */
export function parsePrice(raw: Cell): ParsedPrice {
  if (raw === null || raw === '') return { error: 'Sin precio' }
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? { value: Math.round(raw * 100) / 100 } : { error: 'Precio inválido' }
  if (typeof raw === 'boolean') return { error: 'Precio inválido' }
  let s = raw.trim()
  let currency: ParsedPrice['currency']
  const m = /^([A-Za-z€£$]{1,4}\$?)\s*(.*)$/.exec(s) ?? /^(.*?)\s*([A-Za-z€£$]{1,4})$/.exec(s)
  if (m) {
    const [a, b] = /^[A-Za-z€£$]/.test(s) ? [m[1], m[2]] : [m[2], m[1]]
    const c = recognizeCurrency(a)
    if (c) {
      currency = c
      s = b.trim()
    }
  }
  s = s.replace(/\s/g, '')
  if (!/^[0-9.,]+$/.test(s)) return { error: `Precio no reconocido: «${raw}»`, currency }
  const dots = (s.match(/\./g) ?? []).length
  const commas = (s.match(/,/g) ?? []).length
  let value: number
  let ambiguous = false
  if (dots && commas) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    value = Number(dec === '.' ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.'))
  } else if (dots + commas === 1) {
    const sep = dots ? '.' : ','
    const after = s.length - s.indexOf(sep) - 1
    if (after === 3) {
      ambiguous = true // "1.500" / "1,500": most likely thousands, but must be confirmed
      value = Number(s.replace(sep, ''))
    } else value = Number(s.replace(sep, '.'))
  } else if (dots + commas > 1) {
    const sep = dots ? '.' : ','
    value = Number(s.split(sep).join(''))
  } else value = Number(s)
  if (!Number.isFinite(value) || value <= 0) return { error: 'Precio inválido', currency }
  return { value: Math.round(value * 100) / 100, currency, ambiguous }
}

const UNIT_WORDS: [RegExp, PriceUnit][] = [
  [/^(servicio|service|global|evento|caso)$/, 'service'],
  [/^(persona|person|pax|por persona|beneficiario)$/, 'person'],
  [/^(familia|family|grupo familiar)$/, 'family'],
  [/^(hora|hour|hr|hs|horas)$/, 'hour'],
  [/^(mes|month|mensual)$/, 'month'],
  [/^(sesion|session|visita|visitas|sesiones)$/, 'session'],
  [/^(documento|document|doc)$/, 'document'],
]
export const recognizeUnit = (raw: Cell): PriceUnit | undefined => {
  const n = norm(raw)
  for (const [re, u] of UNIT_WORDS) if (re.test(n)) return u
  return undefined
}

export function parseDate(raw: Cell): string | undefined | 'invalid' {
  if (raw === null || raw === '') return undefined
  if (typeof raw === 'number') return raw > 20000 && raw < 80000 ? excelDateToIso(raw) : 'invalid'
  const s = String(raw).trim()
  if (isIsoDate(s)) return s
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    return isIsoDate(iso) ? iso : 'invalid'
  }
  return 'invalid'
}

/* ───────────── Matching ───────────── */

export const SERVICE_SYNONYMS: Record<string, string[]> = {
  immigration: ['migraciones', 'migracion', 'migratorio', 'migratorios', 'inmigracion', 'tramites migratorios'],
  housing: ['vivienda', 'alojamiento', 'busqueda de vivienda', 'home search'],
  schooling: ['colegios', 'escuelas', 'escolaridad', 'educacion', 'school search'],
  moving: ['mudanza', 'mudanzas', 'traslado de bienes', 'relocation move'],
  'intercultural-workshop': ['intercultural', 'taller intercultural', 'talleres', 'cross cultural'],
  'dual-career': ['carrera dual', 'dual career', 'acompanamiento de pareja'],
  'driving-license': ['licencia', 'licencia de conducir', 'registro de conducir', 'carnet de conducir'],
  'cuil-unification': ['cuil', 'unificacion cuil', 'unificacion de cuil'],
  apostille: ['apostilla', 'apostillas', 'legalizaciones'],
  'pre-migration-talk': ['charla', 'charla premigratoria', 'charlas premigratorias'],
  orientation: ['orientacion', 'orientation', 'tour de orientacion'],
  'settling-in': ['instalacion', 'settling in'],
  'tax-advisory': ['asesoria fiscal', 'asesoramiento impositivo', 'tax'],
  departure: ['salida', 'repatriacion', 'departure'],
}

export type MatchKind = 'exact' | 'probable' | 'ambiguous' | 'none'

export interface ServiceMatch {
  kind: MatchKind
  serviceTypeId?: string
  candidates: string[]
}

export function matchService(text: Cell): ServiceMatch {
  const t = norm(text)
  if (!t) return { kind: 'none', candidates: [] }
  const types = activeServiceTypes()
  const exact = types.filter((s) => norm(s.label) === t || norm(s.id.replace(/-/g, ' ')) === t)
  if (exact.length === 1) return { kind: 'exact', serviceTypeId: exact[0].id, candidates: [exact[0].id] }
  const syn = Object.entries(SERVICE_SYNONYMS).filter(([, ws]) => ws.includes(t)).map(([id]) => id)
  const partial = types.filter((s) => t.includes(norm(s.label)) || norm(s.label).includes(t)).map((s) => s.id)
  const cands = [...new Set([...syn, ...partial])]
  if (cands.length === 1) return { kind: 'probable', serviceTypeId: cands[0], candidates: cands }
  return { kind: cands.length ? 'ambiguous' : 'none', candidates: cands }
}

const tokens = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 2).map((w) => w.replace(/(es|s)$/, '')))
export function similarity(a: string, b: string): number {
  const A = tokens(a)
  const B = tokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return (2 * inter) / (A.size + B.size)
}

export interface ItemMatch {
  kind: MatchKind
  itemId?: string
  candidates: string[]
}

export function matchItem(ds: Pick<Dataset, 'catalogItems'>, serviceTypeId: string, text: Cell): ItemMatch {
  const items = ds.catalogItems.filter((i) => i.serviceTypeId === serviceTypeId && i.active)
  const t = norm(text)
  if (!t) return { kind: 'none', candidates: [] }
  const exact = items.filter((i) => norm(i.name) === t)
  if (exact.length === 1) return { kind: 'exact', itemId: exact[0].id, candidates: [exact[0].id] }
  const scored = items.map((i) => ({ id: i.id, s: similarity(i.name, t) })).filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s)
  if (!scored.length) return { kind: 'none', candidates: [] }
  if (scored.length > 1 && scored[1].s === scored[0].s) return { kind: 'ambiguous', candidates: scored.filter((x) => x.s === scored[0].s).map((x) => x.id) }
  return { kind: 'probable', itemId: scored[0].id, candidates: scored.map((x) => x.id) }
}

/* ───────────── Review ───────────── */

export interface ParsedRow {
  /** Excel row number (1-based). */
  sourceRow: number
  serviceText: string
  itemText: string
  priceRaw: string
  price: ParsedPrice
  currencyRaw: string
  currency?: CurrencyCode | 'ambiguous'
  unit?: PriceUnit
  unitRaw: string
  validFrom?: string | 'invalid'
  validTo?: string | 'invalid'
}

const str = (c: Cell) => (c === null || c === undefined ? '' : String(c).trim())

/**
 * Data rows after the header. A blank service cell inherits the previous one
 * (grouped layouts); rows with only a service and no price are group headers.
 */
export function parseRows(rows: Cell[][], headerRow: number, map: ColumnMapping): ParsedRow[] {
  const out: ParsedRow[] = []
  let lastService = ''
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? []
    const get = (role: ColumnRole) => (map[role] === undefined ? null : (r[map[role]!] ?? null))
    const service = str(get('service'))
    const item = str(get('item'))
    const priceCell = get('price')
    if (!service && !item && (priceCell === null || priceCell === '')) continue
    if (service) lastService = service
    if (service && !item && (priceCell === null || priceCell === '')) continue // group header
    const price = parsePrice(priceCell)
    const currencyRaw = str(get('currency'))
    out.push({
      sourceRow: i + 1,
      serviceText: service || lastService,
      itemText: item,
      priceRaw: str(priceCell),
      price,
      currencyRaw,
      currency: currencyRaw ? (recognizeCurrency(currencyRaw) ?? 'ambiguous') : price.currency,
      unitRaw: str(get('unit')),
      unit: recognizeUnit(get('unit')),
      validFrom: parseDate(get('validFrom')),
      validTo: parseDate(get('validTo')),
    })
  }
  return out
}

/** Manual decisions on a row. itemId '' = whole service; 'new' = create a sub-service named newItemName. */
export interface RowOverride {
  excluded?: boolean
  serviceTypeId?: string
  itemId?: string
  newItemName?: string
  price?: number
  currency?: CurrencyCode
  /** Explicit confirmation of probable matches / ambiguous number format. */
  confirmed?: boolean
}

export type ReviewStatus = 'ready' | 'review' | 'error' | 'duplicate' | 'excluded'
export type ReviewAction = 'create' | 'update' | 'unchanged'

export interface ReviewRow {
  parsed: ParsedRow
  serviceMatch: ServiceMatch
  itemMatch?: ItemMatch
  serviceTypeId?: string
  /** undefined = unresolved; '' = whole service; 'new' = sub-service to create. */
  itemId?: string
  newItemName?: string
  unitPrice?: number
  currency?: CurrencyCode
  status: ReviewStatus
  action?: ReviewAction
  messages: string[]
}

export function buildReview(ds: Dataset, clientId: string, parsed: ParsedRow[], overrides: Record<number, RowOverride> = {}): ReviewRow[] {
  const grid = new Map(tariffGrid(ds, clientId).flatMap((g) => g.rows).map((r) => [r.key, r]))
  const seen = new Map<string, number>()
  return parsed.map((p) => {
    const o = overrides[p.sourceRow] ?? {}
    const messages: string[] = []
    let blocking = false
    /** Missing decision: must be corrected (choose service/item/currency). */
    let unresolved = false
    /** Proposal that only needs an explicit confirmation (probable match, number format…). */
    let needsConfirm = false
    // Service: explicit choice > match; an exact item name in exactly one service can suggest it.
    let serviceMatch = matchService(p.serviceText)
    if (serviceMatch.kind === 'none' && p.itemText) {
      const hits = ds.catalogItems.filter((i) => i.active && norm(i.name) === norm(p.itemText))
      if (hits.length === 1) serviceMatch = { kind: 'probable', serviceTypeId: hits[0].serviceTypeId, candidates: [hits[0].serviceTypeId] }
    }
    const serviceTypeId = o.serviceTypeId ?? serviceMatch.serviceTypeId
    if (!serviceTypeId) {
      unresolved = true
      messages.push(serviceMatch.kind === 'ambiguous' ? `Servicio ambiguo: ${serviceMatch.candidates.map((c) => getServiceType(c).label).join(' / ')}` : `Servicio no reconocido: «${p.serviceText || '—'}»`)
    } else if (!o.serviceTypeId && serviceMatch.kind === 'probable') {
      needsConfirm = true
      messages.push(`Coincidencia probable de servicio: ${getServiceType(serviceTypeId).label}`)
    }
    // Item.
    let itemMatch: ItemMatch | undefined
    let itemId: string | undefined
    let newItemName: string | undefined
    if (serviceTypeId) {
      const hasItems = ds.catalogItems.some((i) => i.serviceTypeId === serviceTypeId && i.active)
      itemMatch = p.itemText ? matchItem(ds, serviceTypeId, p.itemText) : undefined
      if (o.itemId !== undefined) {
        itemId = o.itemId
        if (o.itemId === 'new') {
          newItemName = (o.newItemName ?? p.itemText).trim()
          // Never duplicate catalog items: an existing sub-service with that name is reused.
          const existing = ds.catalogItems.find((i) => i.serviceTypeId === serviceTypeId && norm(i.name) === norm(newItemName))
          if (existing) {
            itemId = existing.id
            newItemName = undefined
            messages.push(`El subservicio «${existing.name}» ya existe: se usa el del catálogo.`)
          } else if (!newItemName) {
            blocking = true
            messages.push('Indicá el nombre del subservicio nuevo.')
          } else messages.push(`Se creará el subservicio «${newItemName}» (aprobado por vos).`)
        }
      } else if (!hasItems) itemId = '' // single-line service
      else if (!p.itemText) {
        itemId = ''
        needsConfirm = true
        messages.push('Sin subservicio: se usará el servicio completo (confirmá o elegí un subservicio).')
      } else if (itemMatch?.kind === 'exact') itemId = itemMatch.itemId
      else if (itemMatch?.kind === 'probable') {
        itemId = itemMatch.itemId
        needsConfirm = true
        messages.push(`Coincidencia probable de subservicio: ${ds.catalogItems.find((i) => i.id === itemId)?.name}`)
      } else {
        unresolved = true
        messages.push(itemMatch?.kind === 'ambiguous' ? 'Subservicio ambiguo: elegí cuál corresponde.' : `Subservicio no encontrado: «${p.itemText}» (elegí uno o aprobá crearlo).`)
      }
    }
    // Price & currency: never invented.
    const unitPrice = o.price ?? p.price.value
    if (unitPrice === undefined || !isMoney(unitPrice) || unitPrice <= 0) {
      blocking = true
      messages.push(p.price.error ?? 'Precio inválido')
    } else if (p.price.ambiguous && o.price === undefined) {
      needsConfirm = true
      messages.push(`Formato de número ambiguo «${p.priceRaw}»: confirmá ${unitPrice}.`)
    }
    const currency = o.currency ?? (p.currency && p.currency !== 'ambiguous' ? p.currency : undefined)
    if (!currency) {
      unresolved = true
      messages.push(p.currency === 'ambiguous' ? `Moneda no reconocida «${p.currencyRaw || '$'}»: elegila.` : 'Sin moneda: elegila (no se asume ninguna).')
    }
    if (p.validFrom === 'invalid' || p.validTo === 'invalid') messages.push('Vigencia no reconocida: se ignora.')
    const review = unresolved || (needsConfirm && !o.confirmed)

    let status: ReviewStatus = o.excluded ? 'excluded' : blocking ? 'error' : review ? 'review' : 'ready'
    let action: ReviewAction | undefined
    if (status === 'ready' && serviceTypeId && itemId !== undefined) {
      const key = itemId === 'new' ? `new|${serviceTypeId}|${norm(newItemName)}` : rowKey(serviceTypeId, itemId || undefined)
      if (seen.has(key)) {
        status = 'duplicate'
        messages.push(`Duplicado de la fila ${seen.get(key)} del archivo: excluí una.`)
      } else {
        seen.set(key, p.sourceRow)
        const g = itemId === 'new' ? undefined : grid.get(key)
        action = !g?.editable ? 'create' : cmpMoney(g.editable.unitPrice, unitPrice!) === 0 && g.editable.currency === currency ? 'unchanged' : 'update'
      }
    }
    return { parsed: p, serviceMatch, itemMatch, serviceTypeId, itemId, newItemName, unitPrice, currency, status, action, messages }
  })
}

export const reviewCounts = (rows: ReviewRow[]) => ({
  create: rows.filter((r) => r.status === 'ready' && r.action === 'create').length,
  update: rows.filter((r) => r.status === 'ready' && r.action === 'update').length,
  unchanged: rows.filter((r) => r.status === 'ready' && r.action === 'unchanged').length,
  excluded: rows.filter((r) => r.status === 'excluded').length,
  review: rows.filter((r) => r.status === 'review').length,
  error: rows.filter((r) => r.status === 'error' || r.status === 'duplicate').length,
})

/* ───────────── Apply ───────────── */

export interface TariffImportInput {
  file: { name: string; size: number; hash?: string; attachmentId?: string }
  sheetName: string
  headerRow: number
  rows: ReviewRow[]
}

/**
 * Applies the import only when every non-excluded row is ready. New sub-services
 * are created first (explicitly approved), then prices go through the
 * quick-editor save: new prices stay pending approval; approved prices are
 * versioned, never overwritten. Unchanged rows write nothing.
 */
export function applyTariffImport(ds: Dataset, clientId: string, input: TariffImportInput, requestId: string, ctx: DomainContext): { ds: Dataset; importId: string; duplicate: boolean } {
  const prior = ds.requests[requestId]
  if (prior && ds.tariffImports.some((x) => x.id === prior)) return { ds, importId: prior, duplicate: true }
  if (!findById(ds.clients, clientId)) throw new DomainError('El cliente no existe.')
  // Re-check against the current data (the review may be stale).
  const rows = buildReview(
    ds,
    clientId,
    input.rows.map((r) => r.parsed),
    Object.fromEntries(input.rows.map((r) => [r.parsed.sourceRow, { excluded: r.status === 'excluded', serviceTypeId: r.serviceTypeId, itemId: r.itemId, newItemName: r.newItemName, price: r.unitPrice, currency: r.currency, confirmed: true }])),
  )
  const blocking = rows.filter((r) => r.status !== 'ready' && r.status !== 'excluded')
  if (blocking.length) throw new DomainError(`Hay ${blocking.length} fila(s) sin resolver: no se aplicó ningún cambio.`, Object.fromEntries(blocking.map((r) => [`rows.${r.parsed.sourceRow}`, r.messages.join(' ')])))
  const ready = rows.filter((r) => r.status === 'ready')
  if (!ready.length) throw new DomainError('No hay filas para importar.')

  let next = ds
  let newItems = 0
  const resolved = ready.map((r) => {
    if (r.itemId !== 'new') return { ...r, itemId: r.itemId || undefined }
    const existing = next.catalogItems.find((i) => i.serviceTypeId === r.serviceTypeId && norm(i.name) === norm(r.newItemName))
    if (existing) return { ...r, itemId: existing.id }
    const c = createCatalogItem(next, { serviceTypeId: r.serviceTypeId!, name: r.newItemName!, unit: r.parsed.unit ?? 'service', active: true }, ctx)
    next = c.ds
    newItems++
    return { ...r, itemId: c.itemId, action: 'create' as const }
  })
  const changes: TariffRowChange[] = resolved
    .filter((r) => r.action !== 'unchanged')
    .map((r) => ({
      key: rowKey(r.serviceTypeId!, r.itemId),
      unitPrice: r.unitPrice!,
      currency: r.currency!,
      active: true,
      unit: r.parsed.unit,
      validFrom: r.parsed.validFrom && r.parsed.validFrom !== 'invalid' ? r.parsed.validFrom : undefined,
      validTo: r.parsed.validTo && r.parsed.validTo !== 'invalid' ? r.parsed.validTo : undefined,
    }))
  if (changes.length) next = saveTariffGrid(next, clientId, { changes, agreement: `Importado de ${input.file.name}` }, ctx)

  const record: TariffImport = {
    id: ctx.newId('timp'),
    clientId,
    fileName: input.file.name,
    fileSize: input.file.size,
    fileHash: input.file.hash,
    attachmentId: input.file.attachmentId,
    sheetName: input.sheetName,
    headerRow: input.headerRow + 1,
    importedAt: businessStamp(ctx),
    actorId: ctx.actorId,
    counts: {
      created: resolved.filter((r) => r.action === 'create').length,
      updated: resolved.filter((r) => r.action === 'update').length,
      unchanged: resolved.filter((r) => r.action === 'unchanged').length,
      excluded: rows.filter((r) => r.status === 'excluded').length,
      newItems,
    },
    rows: resolved.map((r) => ({ sourceRow: r.parsed.sourceRow, serviceTypeId: r.serviceTypeId!, itemId: r.itemId, unitPrice: r.unitPrice!, currency: r.currency!, action: r.action! })),
  }
  next = { ...next, tariffImports: [record, ...next.tariffImports], requests: { ...next.requests, [requestId]: record.id } }
  next = appendAudit(next, { entity: 'tariff-import', entityId: record.id, action: 'import', detail: `${input.file.name}: ${record.counts.created} nuevos, ${record.counts.updated} actualizados, ${record.counts.unchanged} sin cambios` }, ctx)
  return { ds: next, importId: record.id, duplicate: false }
}

/** Earlier import of the same file content for this client (warning only). */
export const previousImport = (ds: Pick<Dataset, 'tariffImports'>, clientId: string, hash?: string) => (hash ? ds.tariffImports.find((x) => x.clientId === clientId && x.fileHash === hash) : undefined)
