import type { DocLine, DocTable, PoDocument } from '@/domain/commercial/poExtraction'
import { detectItemsHeader } from '@/domain/commercial/poExtraction'
import { extractPdfText } from '@/lib/pdfText'
import { excelDateToIso, readXlsx, type Cell } from '@/lib/xlsx'

/*
 * Phase 5.0C.1 — document readers and extraction providers. The local
 * provider reads PDFs with selectable text, .xlsx and pasted email text in
 * the browser. Anything that needs OCR or advanced interpretation goes to a
 * future server-side provider: it is declared here but not configured, and
 * SIGR never stores API keys in the browser.
 */

export interface PoSource {
  file?: File
  text?: string
}

export interface PoExtractionProvider {
  id: 'local' | 'remote'
  label: string
  available: boolean
  unavailableReason?: string
  read(source: PoSource): Promise<PoDocument>
}

const PDF = 'application/pdf'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const kindOf = (f: File): 'pdf' | 'xlsx' | undefined =>
  f.type === PDF || /\.pdf$/i.test(f.name) ? 'pdf' : f.type === XLSX || /\.xlsx$/i.test(f.name) ? 'xlsx' : undefined

export async function readPdfDocument(data: ArrayBuffer, fileName: string): Promise<PoDocument> {
  const r = await extractPdfText(data)
  const lines: DocLine[] = r.lines.map((l) => ({ text: l.text, source: { file: fileName, page: l.page, line: l.line } }))
  if (r.status === 'text') return { kind: 'pdf', fileName, status: 'ok', lines, tables: [] }
  return { kind: 'pdf', fileName, status: r.status === 'no-text' ? 'requires-processor' : 'failed', reason: r.reason, lines, tables: [] }
}

const asText = (c: Cell, label: string) => {
  if (typeof c === 'number' && /(fecha|vigencia|vence|valid|date|emision|hasta)/i.test(label) && c > 20000 && c < 80000) return excelDateToIso(c).split('-').reverse().join('/')
  return String(c)
}

export async function readXlsxDocument(data: ArrayBuffer, fileName: string): Promise<PoDocument> {
  let sheets
  try {
    sheets = await readXlsx(data)
  } catch (e) {
    return { kind: 'xlsx', fileName, status: 'failed', reason: e instanceof Error ? e.message : 'No se pudo leer el Excel.', lines: [], tables: [] }
  }
  const lines: DocLine[] = []
  const tables: DocTable[] = []
  for (const sh of sheets) {
    const head = detectItemsHeader(sh.rows)
    let tableEnd = -1
    if (head) {
      const rows: DocTable['rows'] = []
      for (let r = head.row + 1; r < sh.rows.length; r++) {
        const cells = sh.rows[r] ?? []
        if (cells.every((c) => c === null || c === '')) {
          if (rows.length) break
          continue
        }
        rows.push({ cells, source: { file: fileName, sheet: sh.name, row: r + 1 } })
        tableEnd = r
      }
      tables.push({ sheet: sh.name, headerRow: head.row + 1, header: sh.rows[head.row], rows })
    }
    // Everything outside the items table is read as "label value" lines (header data, totals, notes).
    sh.rows.forEach((cells, r) => {
      if (head && r >= head.row && r <= tableEnd) return
      const values = (cells ?? []).filter((c) => c !== null && c !== '')
      if (!values.length) return
      const label = String(values[0])
      lines.push({ text: values.map((c, i) => (i === 0 ? String(c) : asText(c, label))).join('   '), source: { file: fileName, sheet: sh.name, row: r + 1 } })
    })
    // Table rows also count as text lines for totals and references inside the table.
    for (const t of tables.filter((x) => x.sheet === sh.name)) for (const row of t.rows) lines.push({ text: row.cells.filter((c) => c !== null && c !== '').map(String).join('   '), source: row.source })
  }
  const empty = !lines.length && !tables.some((t) => t.rows.length)
  return { kind: 'xlsx', fileName, status: empty ? 'failed' : 'ok', reason: empty ? 'El Excel no tiene datos legibles.' : undefined, lines, tables }
}

export function textDocument(text: string): PoDocument {
  const lines: DocLine[] = text
    .split(/\r?\n/)
    .map((t, i) => ({ text: t.replace(/\t/g, '   ').trimEnd(), source: { section: 'Texto del email', line: i + 1 } }))
    .filter((l) => l.text.trim())
  const ok = text.replace(/\s/g, '').length >= 20
  return { kind: 'text', status: ok ? 'ok' : 'failed', reason: ok ? undefined : 'El texto es demasiado corto para reconocer una OC.', lines, tables: [] }
}

export const localProvider: PoExtractionProvider = {
  id: 'local',
  label: 'Lectura local (PDF con texto, Excel, email)',
  available: true,
  async read({ file, text }) {
    if (text !== undefined) return textDocument(text)
    if (!file) throw new Error('Elegí un archivo o pegá el texto.')
    const kind = kindOf(file)
    const data = await file.arrayBuffer()
    if (kind === 'pdf') return readPdfDocument(data, file.name)
    if (kind === 'xlsx') return readXlsxDocument(data, file.name)
    return { kind: 'text', fileName: file.name, status: 'failed', reason: 'Formato no admitido: subí un PDF, un Excel .xlsx o pegá el texto.', lines: [], tables: [] }
  },
}

/**
 * Placeholder for a future secure extraction API (OCR / AI). It must run on a
 * server that holds the credentials; the browser would only send the file to
 * SIGR's own backend. Not configured in this phase.
 */
export const remoteProvider: PoExtractionProvider = {
  id: 'remote',
  label: 'Procesador IA/OCR (servidor)',
  available: false,
  unavailableReason: 'No configurado: requiere un servicio de extracción en el servidor de SIGR. Las claves de API nunca se guardan en el navegador.',
  async read() {
    throw new Error(this.unavailableReason)
  },
}
