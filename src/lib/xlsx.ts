/*
 * Minimal local .xlsx reader (no dependency). An .xlsx file is a ZIP of XML
 * parts: we read the ZIP central directory, inflate entries with the
 * platform's DecompressionStream ("deflate-raw") and parse the workbook,
 * shared strings and sheet XML. Cell values only (no formulas evaluation,
 * styles or merged-cell expansion). Runs fully in the browser.
 */

export type Cell = string | number | boolean | null

export interface Sheet {
  name: string
  /** Dense rows (index 0 = Excel row 1); missing cells are null. */
  rows: Cell[][]
}

export const XLSX_MAX_BYTES = 5 * 1024 * 1024

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  offset: number
}

function readEntries(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('El archivo no es un .xlsx válido (ZIP sin directorio).')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const entries: ZipEntry[] = []
  const dec = new TextDecoder()
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Directorio ZIP dañado.')
    const method = dv.getUint16(p + 10, true)
    const compressedSize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const offset = dv.getUint32(p + 42, true)
    entries.push({ name: dec.decode(buf.subarray(p + 46, p + 46 + nameLen)), method, compressedSize, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function entryText(buf: Uint8Array, e: ZipEntry): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error('Entrada ZIP dañada.')
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true)
  const data = buf.subarray(start, start + e.compressedSize)
  if (e.method === 0) return new TextDecoder().decode(data)
  if (e.method !== 8) throw new Error('Compresión no soportada en el .xlsx.')
  const stream = new Blob([data.slice() as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return await new Response(stream).text()
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, g: string) => (g[0] === '#' ? String.fromCodePoint(g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)) : (ENT[g] ?? m)))
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]
const texts = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decodeXml(m[1])).join('')

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export const columnLetter = (i: number): string => {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function parseSheet(xml: string, shared: string[]): Cell[][] {
  const rows: Cell[][] = []
  for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const r = Number(attr(rm[1], 'r') ?? rows.length + 1) - 1
    const row: Cell[] = []
    for (const cm of rm[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ref = attr(cm[1], 'r')
      const idx = ref ? colIndex(ref) : row.length
      const t = attr(cm[1], 't')
      const body = cm[2] ?? ''
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1]
      let value: Cell = null
      if (t === 's') value = v !== undefined ? (shared[Number(v)] ?? '') : null
      else if (t === 'inlineStr') value = texts(body)
      else if (t === 'str') value = v !== undefined ? decodeXml(v) : null
      else if (t === 'b') value = v === '1'
      else if (v !== undefined) value = Number.isFinite(Number(v)) ? Number(v) : decodeXml(v)
      row[idx] = value
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null
    rows[r] = row
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = []
  return rows
}

/** Reads every sheet of an .xlsx file locally. */
export async function readXlsx(data: ArrayBuffer): Promise<Sheet[]> {
  if (data.byteLength > XLSX_MAX_BYTES) throw new Error('El archivo supera 5 MB.')
  const buf = new Uint8Array(data)
  const entries = readEntries(buf)
  const get = async (name: string) => {
    const e = entries.find((x) => x.name === name)
    return e ? entryText(buf, e) : undefined
  }
  const wb = await get('xl/workbook.xml')
  if (!wb) throw new Error('El archivo no es un libro de Excel (.xlsx).')
  const rels = (await get('xl/_rels/workbook.xml.rels')) ?? ''
  const relTarget = new Map([...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [attr(m[1], 'Id') ?? '', attr(m[1], 'Target') ?? '']))
  const sst = await get('xl/sharedStrings.xml')
  const shared = sst ? [...sst.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => texts(m[1])) : []
  const sheets: Sheet[] = []
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)) {
    const name = decodeXml(attr(m[1], 'name') ?? `Hoja ${sheets.length + 1}`)
    const rid = attr(m[1], 'r:id') ?? ''
    let target = relTarget.get(rid) ?? `worksheets/sheet${sheets.length + 1}.xml`
    target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    const xml = await get(target)
    sheets.push({ name, rows: xml ? parseSheet(xml, shared) : [] })
  }
  return sheets
}

/** Excel serial date → ISO date (1900 system). */
export function excelDateToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 10)
}
