import { brand } from '@/config/brand'
import { wrapText, type PdfDocument, type Rgb, type TextStyle } from '@/lib/pdf'

/** Sober palette for printed documents (independent of the UI theme). */
export const C = {
  ink: [0.1, 0.1, 0.12] as Rgb,
  muted: [0.42, 0.43, 0.47] as Rgb,
  line: [0.85, 0.85, 0.88] as Rgb,
  soft: [0.955, 0.955, 0.965] as Rgb,
  accent: [0.83, 0.36, 0.2] as Rgb,
}

export const M = { left: 40, right: 555.28, top: 40, bottom: 790 }

/** Vertical flow with automatic page breaks and a repeated page header. */
export class Flow {
  y = M.top
  readonly doc: PdfDocument
  private onNewPage?: () => void

  constructor(doc: PdfDocument) {
    this.doc = doc
  }

  setPageHeader(fn: (() => void) | undefined) {
    this.onNewPage = fn
  }

  /** Starts a new page when `h` points do not fit. */
  ensure(h: number) {
    if (this.y + h <= M.bottom) return
    this.doc.addPage()
    this.y = M.top
    this.onNewPage?.()
  }

  text(x: number, text: string, style: TextStyle = {}) {
    this.doc.text(x, this.y, text, style)
  }

  /** Wrapped paragraph at the cursor; advances the cursor. */
  paragraph(text: string, opts: { x?: number; width?: number; size?: number; bold?: boolean; color?: Rgb; gap?: number } = {}) {
    const size = opts.size ?? 9.5
    const x = opts.x ?? M.left
    const lines = wrapText(text, opts.width ?? M.right - x, size, opts.bold)
    for (const l of lines) {
      this.ensure(size * 1.35)
      this.doc.text(x, this.y, l, { size, bold: opts.bold, color: opts.color ?? C.ink })
      this.y += size * 1.35
    }
    this.y += opts.gap ?? 0
  }

  rule(color: Rgb = C.line) {
    this.doc.line(M.left, this.y, M.right, this.y, { color })
  }

  sectionTitle(title: string) {
    this.ensure(40)
    this.y += 6
    this.doc.text(M.left, this.y, title.toUpperCase(), { size: 8.5, bold: true, color: C.muted })
    this.y += 14
  }
}

/** Issuer block: only the brand name (no fiscal data is invented). */
export function issuerHeader(f: Flow, docTitle: string, rightLines: { label: string; value: string }[]) {
  const d = f.doc
  d.rect(M.left, f.y, 4, 34, C.accent)
  d.text(M.left + 14, f.y, brand.clientName, { size: 20, bold: true })
  d.text(M.left + 14, f.y + 24, docTitle, { size: 10, color: C.muted })
  let y = f.y
  for (const l of rightLines) {
    d.text(M.right - 120, y, l.label, { size: 8.5, color: C.muted, align: 'right' })
    d.text(M.right, y, l.value, { size: 9, bold: true, align: 'right' })
    y += 13
  }
  f.y = Math.max(f.y + 46, y + 8)
  f.rule()
  f.y += 16
}

export const infoBoxHeight = (w: number, rows: [string, string | undefined][]) => 26 + rows.reduce((n, [, v]) => n + wrapText(v ?? 'No informado', w - 100, 9).length, 0) * 12.5 + 6

/** Labelled info box with wrapped rows. Returns its height. */
export function infoBox(d: PdfDocument, x: number, y: number, w: number, title: string, rows: [string, string | undefined][], minHeight = 0): number {
  const lineH = 12.5
  const lines: { label: string; text: string; missing: boolean }[] = []
  for (const [label, value] of rows) {
    const wrapped = wrapText(value ?? 'No informado', w - 100, 9)
    wrapped.forEach((t, i) => lines.push({ label: i === 0 ? label : '', text: t, missing: value === undefined }))
  }
  const h = Math.max(minHeight, 26 + lines.length * lineH + 6)
  d.rect(x, y, w, h, C.soft)
  d.text(x + 12, y + 10, title.toUpperCase(), { size: 8, bold: true, color: C.muted })
  lines.forEach((l, i) => {
    const yy = y + 26 + i * lineH
    if (l.label) d.text(x + 12, yy, l.label, { size: 8.5, color: C.muted })
    d.text(x + 88, yy, l.text, { size: 9, color: l.missing ? C.muted : C.ink })
  })
  return h
}

/** "Página x de y" and document reference on every page. */
export function footers(d: PdfDocument, reference: string, generatedOn: string) {
  const total = d.pageCount
  for (let i = 0; i < total; i++) {
    d.onPage(i, () => {
      d.line(M.left, 806, M.right, 806)
      d.text(M.left, 812, `${brand.clientName} · ${reference} · Generado con ${brand.productName} el ${generatedOn}`, { size: 7.5, color: C.muted })
      d.text(M.right, 812, `Página ${i + 1} de ${total}`, { size: 7.5, color: C.muted, align: 'right' })
    })
  }
}

export const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')
