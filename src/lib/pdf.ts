/*
 * Minimal PDF 1.4 writer (no dependencies): A4 pages, the standard Helvetica
 * fonts with WinAnsi encoding (Spanish accents, €, dashes), text, lines and
 * filled rectangles. Coordinates are in points from the top-left corner.
 * Streams are left uncompressed so documents stay small, simple and testable.
 */

export const A4 = { width: 595.28, height: 841.89 }

export type Rgb = [number, number, number]

export interface TextStyle {
  size?: number
  bold?: boolean
  color?: Rgb
  align?: 'left' | 'right' | 'center'
}

// Helvetica / Helvetica-Bold advance widths (1/1000 em) for ASCII 32–126.
const W_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611,
  778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556,
  556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611,
  778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611,
  611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

/** Unicode → WinAnsi (cp1252) for the characters outside Latin-1. */
const CP1252: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 }
const SPECIAL_W: Record<number, number> = { 0x80: 556, 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0xa0: 278, 0xb7: 278, 0xba: 365, 0xaa: 370, 0xb0: 400 }

/** Characters the standard fonts cannot draw are replaced by close equivalents. */
const FALLBACK: Record<string, string> = { '→': '->', '←': '<-', '×': 'x', '≤': '<=', '≥': '>=', ' ': ' ', ' ': ' ' }

function encodeChar(ch: string): number {
  const fb = FALLBACK[ch]
  if (fb) return fb.charCodeAt(0)
  const code = ch.codePointAt(0)!
  if (code < 128 || (code >= 0xa0 && code <= 0xff)) return code
  return CP1252[ch] ?? 0x3f // '?'
}

function normalize(text: string): string {
  return [...text].map((ch) => FALLBACK[ch] ?? ch).join('')
}

function charWidth(code: number, bold: boolean): number {
  if (code >= 32 && code <= 126) return (bold ? W_BOLD : W_REG)[code - 32]
  if (SPECIAL_W[code] !== undefined) return SPECIAL_W[code]
  // Accented Latin-1 letters: width of their base letter.
  const base = String.fromCharCode(code).normalize('NFD')[0].charCodeAt(0)
  if (base >= 32 && base <= 126) return (bold ? W_BOLD : W_REG)[base - 32]
  return 556
}

export function textWidth(text: string, size: number, bold = false): number {
  let w = 0
  for (const ch of normalize(text)) w += charWidth(encodeChar(ch), bold)
  return (w * size) / 1000
}

/** Greedy word wrap; very long words are split. Explicit newlines are kept. */
export function wrapText(text: string, maxWidth: number, size: number, bold = false): string[] {
  const out: string[] = []
  for (const para of text.split(/\r?\n/)) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (textWidth(candidate, size, bold) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) out.push(line)
      let rest = word
      while (textWidth(rest, size, bold) > maxWidth && rest.length > 1) {
        let n = rest.length - 1
        while (n > 1 && textWidth(rest.slice(0, n), size, bold) > maxWidth) n--
        out.push(rest.slice(0, n))
        rest = rest.slice(n)
      }
      line = rest
    }
    out.push(line)
  }
  return out
}

const num = (n: number) => (Math.round(n * 100) / 100).toString()
const rgb = (c: Rgb) => c.map((v) => num(v)).join(' ')

function pdfString(text: string): string {
  let s = ''
  for (const ch of normalize(text)) {
    const code = encodeChar(ch)
    if (code === 0x28 || code === 0x29 || code === 0x5c) s += '\\' + String.fromCharCode(code)
    else if (code < 32 || code > 126) s += '\\' + code.toString(8).padStart(3, '0')
    else s += String.fromCharCode(code)
  }
  return `(${s})`
}

export class PdfDocument {
  private pages: string[][] = []
  private current: string[] = []
  readonly width = A4.width
  readonly height = A4.height

  private readonly info: { title?: string; author?: string }

  constructor(info: { title?: string; author?: string } = {}) {
    this.info = info
    this.addPage()
  }

  addPage() {
    this.current = []
    this.pages.push(this.current)
  }

  get pageCount() {
    return this.pages.length
  }

  /** Draw on a given page (0-based), e.g. for "page x of y" footers. */
  onPage(index: number, draw: () => void) {
    const prev = this.current
    this.current = this.pages[index]
    draw()
    this.current = prev
  }

  text(x: number, y: number, text: string, style: TextStyle = {}) {
    const size = style.size ?? 10
    const bold = style.bold ?? false
    const w = textWidth(text, size, bold)
    const left = style.align === 'right' ? x - w : style.align === 'center' ? x - w / 2 : x
    // y is the top of the line box; the baseline sits ~0.8 em below.
    const baseline = this.height - (y + size * 0.8)
    this.current.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(style.color ?? [0.1, 0.1, 0.12])} rg ${num(left)} ${num(baseline)} Td ${pdfString(text)} Tj ET`)
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: { width?: number; color?: Rgb } = {}) {
    this.current.push(`${num(opts.width ?? 0.6)} w ${rgb(opts.color ?? [0.82, 0.82, 0.85])} RG ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`)
  }

  rect(x: number, y: number, w: number, h: number, fill: Rgb) {
    this.current.push(`${rgb(fill)} rg ${num(x)} ${num(this.height - y - h)} ${num(w)} ${num(h)} re f`)
  }

  toBytes(): Uint8Array {
    const objects: string[] = []
    const add = (body: string) => objects.push(body) // object number = index + 1
    add('<< /Type /Catalog /Pages 2 0 R >>')
    add('') // pages placeholder (2)
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    const kids: number[] = []
    for (const ops of this.pages) {
      const stream = ops.join('\n')
      add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
      const contentRef = objects.length
      add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`)
      kids.push(objects.length)
    }
    objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
    add(`<< /Producer (SIGR) /Title ${pdfString(this.info.title ?? '')} /Author ${pdfString(this.info.author ?? '')} >>`)
    const infoRef = objects.length

    // Every byte is < 256, so string length equals byte length.
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
    const offsets: number[] = []
    objects.forEach((body, i) => {
      offsets.push(out.length)
      out += `${i + 1} 0 obj\n${body}\nendobj\n`
    })
    const xref = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoRef} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    const bytes = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
    return bytes
  }
}
