/*
 * Minimal local PDF text extractor (no dependency), for PDFs with selectable
 * text. It reads indirect objects (including compressed object streams),
 * inflates FlateDecode streams with the platform's DecompressionStream,
 * decodes fonts through ToUnicode CMaps or WinAnsi/Latin encodings and
 * rebuilds text lines from the text positioning operators.
 *
 * Limits (reported, never hidden): scanned/image-only PDFs have no text
 * (OCR required), encrypted PDFs are not read, CID fonts without a ToUnicode
 * map cannot be decoded. Glyph widths are estimated, so column gaps are
 * approximate.
 */

export interface PdfTextLine {
  page: number
  /** 1-based line number within the page (top to bottom). */
  line: number
  text: string
}

export interface PdfTextResult {
  status: 'text' | 'no-text' | 'unsupported'
  reason?: string
  pages: number
  lines: PdfTextLine[]
}

export const PDF_MAX_BYTES = 5 * 1024 * 1024

type Name = { n: string }
type Str = { s: string }
type Ref = { r: number }
type V = number | boolean | null | Name | Str | Ref | V[] | Map<string, V> | { op: string }
type Dict = Map<string, V>

const isName = (v: unknown): v is Name => typeof v === 'object' && v !== null && 'n' in v
const isRef = (v: unknown): v is Ref => typeof v === 'object' && v !== null && 'r' in v
const isStr = (v: unknown): v is Str => typeof v === 'object' && v !== null && 's' in v
const isDict = (v: unknown): v is Dict => v instanceof Map

/* ───────────── Tokenizer / object parser ───────────── */

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])
const DELIM = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%'])

class Lexer {
  pos: number
  readonly s: string
  constructor(s: string, pos = 0) {
    this.s = s
    this.pos = pos
  }
  skip() {
    const s = this.s
    while (this.pos < s.length) {
      const c = s.charCodeAt(this.pos)
      if (WS.has(c)) this.pos++
      else if (s[this.pos] === '%') while (this.pos < s.length && s[this.pos] !== '\n' && s[this.pos] !== '\r') this.pos++
      else break
    }
  }
  /** Next value or operator; undefined at end. */
  next(): V | undefined {
    this.skip()
    const s = this.s
    if (this.pos >= s.length) return undefined
    const c = s[this.pos]
    if (c === '<' && s[this.pos + 1] === '<') {
      this.pos += 2
      const d: Dict = new Map()
      for (;;) {
        this.skip()
        if (s[this.pos] === '>' && s[this.pos + 1] === '>') {
          this.pos += 2
          return d
        }
        const k = this.next()
        if (k === undefined) return d
        if (!isName(k)) continue
        const v = this.value()
        d.set(k.n, v ?? null)
      }
    }
    if (c === '<') {
      const end = s.indexOf('>', this.pos)
      const hex = s.slice(this.pos + 1, end < 0 ? s.length : end).replace(/[^0-9a-fA-F]/g, '')
      this.pos = end < 0 ? s.length : end + 1
      const h = hex.length % 2 ? hex + '0' : hex
      let out = ''
      for (let i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16))
      return { s: out }
    }
    if (c === '[') {
      this.pos++
      const arr: V[] = []
      for (;;) {
        this.skip()
        if (s[this.pos] === ']' || this.pos >= s.length) {
          this.pos++
          return arr
        }
        const v = this.value()
        if (v === undefined) return arr
        arr.push(v)
      }
    }
    if (c === '(') return { s: this.literal() }
    if (c === '/') {
      let i = this.pos + 1
      while (i < s.length && !WS.has(s.charCodeAt(i)) && !DELIM.has(s[i])) i++
      const raw = s.slice(this.pos + 1, i).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      this.pos = i
      return { n: raw }
    }
    if (c === ']' || c === '>' || c === ')' || c === '{' || c === '}') {
      this.pos++
      return this.next()
    }
    let i = this.pos
    while (i < s.length && !WS.has(s.charCodeAt(i)) && !DELIM.has(s[i])) i++
    const tok = s.slice(this.pos, i || this.pos + 1)
    this.pos = i > this.pos ? i : this.pos + 1
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) return Number(tok)
    if (tok === 'true') return true
    if (tok === 'false') return false
    if (tok === 'null') return null
    return { op: tok }
  }
  /** A value, folding "n g R" into a reference. */
  value(): V | undefined {
    const v = this.next()
    if (typeof v === 'number' && Number.isInteger(v)) {
      const save = this.pos
      const g = this.next()
      if (typeof g === 'number') {
        const r = this.next()
        if (r && typeof r === 'object' && 'op' in r && r.op === 'R') return { r: v }
      }
      this.pos = save
    }
    return v
  }
  literal(): string {
    const s = this.s
    let depth = 0
    let out = ''
    this.pos++
    while (this.pos < s.length) {
      const c = s[this.pos++]
      if (c === '\\') {
        const e = s[this.pos++]
        const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }
        if (e in map) out += map[e]
        else if (/[0-7]/.test(e)) {
          let oct = e
          while (oct.length < 3 && /[0-7]/.test(s[this.pos])) oct += s[this.pos++]
          out += String.fromCharCode(parseInt(oct, 8) & 0xff)
        } else if (e === '\r') {
          if (s[this.pos] === '\n') this.pos++
        } else if (e !== '\n') out += e
      } else if (c === '(') {
        depth++
        out += c
      } else if (c === ')') {
        if (depth === 0) break
        depth--
        out += c
      } else out += c
    }
    return out
  }
}

/* ───────────── Document structure ───────────── */

interface PdfObject {
  value: V
  stream?: string
}

const toLatin1 = (b: Uint8Array) => {
  let out = ''
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return out
}
const fromLatin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)

async function inflate(data: string): Promise<string> {
  const stream = new Blob([fromLatin1(data)]).stream().pipeThrough(new DecompressionStream('deflate'))
  return toLatin1(new Uint8Array(await new Response(stream).arrayBuffer()))
}

function readObjects(src: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>()
  const re = /(\d+)\s+(\d+)\s+obj\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const num = Number(m[1])
    const lex = new Lexer(src, re.lastIndex)
    const value = lex.value() ?? null
    lex.skip()
    let stream: string | undefined
    if (src.startsWith('stream', lex.pos)) {
      let start = lex.pos + 6
      if (src[start] === '\r') start++
      if (src[start] === '\n') start++
      const len = isDict(value) ? value.get('Length') : undefined
      // Trust a direct /Length only when "endstream" follows it; otherwise search for the keyword.
      const exact = typeof len === 'number' && src.startsWith('endstream', skipWs(src, start + len))
      let end = exact ? start + (len as number) : src.indexOf('endstream', start)
      if (end < 0) end = src.length
      stream = exact ? src.slice(start, end) : src.slice(start, end).replace(/\r?\n$/, '')
      re.lastIndex = end + 9
    } else re.lastIndex = lex.pos
    objects.set(num, { value, stream })
  }
  return objects
}

function skipWs(s: string, i: number) {
  while (i < s.length && WS.has(s.charCodeAt(i))) i++
  return i
}

class PdfDoc {
  readonly objects: Map<number, PdfObject>
  private decoded = new Map<number, string>()

  constructor(objects: Map<number, PdfObject>) {
    this.objects = objects
  }

  resolve(v: V | undefined, depth = 0): V | undefined {
    if (isRef(v) && depth < 20) return this.resolve(this.objects.get(v.r)?.value, depth + 1)
    return v
  }
  dict(v: V | undefined): Dict | undefined {
    const r = this.resolve(v)
    return isDict(r) ? r : undefined
  }
  async streamOf(ref: V | undefined): Promise<string | undefined> {
    if (!isRef(ref)) return undefined
    if (this.decoded.has(ref.r)) return this.decoded.get(ref.r)
    const o = this.objects.get(ref.r)
    if (!o?.stream || !isDict(o.value)) return undefined
    const data = await decodeStream(o.value, o.stream)
    if (data !== undefined) this.decoded.set(ref.r, data)
    return data
  }
}

async function decodeStream(dict: Dict, raw: string): Promise<string | undefined> {
  const f = dict.get('Filter')
  const filters = (Array.isArray(f) ? f : f ? [f] : []).filter(isName).map((x) => x.n)
  let data = raw
  for (const name of filters) {
    if (name === 'FlateDecode' || name === 'Fl') {
      try {
        data = await inflate(data)
      } catch {
        return undefined
      }
    } else if (name === 'ASCIIHexDecode' || name === 'AHx') {
      const h = data.replace(/[^0-9a-fA-F]/g, '')
      data = h.replace(/(..)/g, (x) => String.fromCharCode(parseInt(x, 16)))
    } else return undefined // images (DCT/JBIG2/CCITT) or unsupported filters
  }
  return data
}

/** Adds the objects stored inside compressed object streams (PDF 1.5+). */
async function expandObjectStreams(doc: PdfDoc) {
  for (const [num, o] of [...doc.objects]) {
    if (!isDict(o.value) || !isName(o.value.get('Type')) || (o.value.get('Type') as Name).n !== 'ObjStm') continue
    const data = await doc.streamOf({ r: num })
    if (!data) continue
    const n = Number(o.value.get('N'))
    const first = Number(o.value.get('First'))
    const head = new Lexer(data)
    const pairs: [number, number][] = []
    for (let i = 0; i < n; i++) pairs.push([Number(head.next()), Number(head.next())])
    for (const [objNum, off] of pairs) if (!doc.objects.has(objNum)) doc.objects.set(objNum, { value: new Lexer(data, first + off).value() ?? null })
  }
}

/* ───────────── Fonts ───────────── */

const CP1252: Record<number, string> = { 0x80: '€', 0x82: '‚', 0x84: '„', 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x99: '™' }
const DIACRITIC: Record<string, string> = { acute: '́', grave: '̀', circumflex: '̂', dieresis: '̈', tilde: '̃', cedilla: '̧', ring: '̊' }
const GLYPHS: Record<string, string> = { space: ' ', period: '.', comma: ',', colon: ':', semicolon: ';', hyphen: '-', slash: '/', parenleft: '(', parenright: ')', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', at: '@', degree: '°', ordmasculine: 'º', ordfeminine: 'ª', Euro: '€', endash: '–', emdash: '—', quotesingle: "'", quotedbl: '"', underscore: '_', plus: '+', equal: '=', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' }

function glyphToChar(name: string): string | undefined {
  if (GLYPHS[name]) return GLYPHS[name]
  if (name.length === 1) return name
  const m = /^([A-Za-z])(acute|grave|circumflex|dieresis|tilde|cedilla|ring)$/.exec(name)
  if (m) return (m[1] + DIACRITIC[m[2]]).normalize('NFC')
  const u = /^uni([0-9A-F]{4})$/.exec(name)
  return u ? String.fromCharCode(parseInt(u[1], 16)) : undefined
}

interface Font {
  bytes: 1 | 2
  cmap?: Map<number, string>
  differences?: Map<number, string>
  /** CID font without ToUnicode: codes cannot be turned into text. */
  undecodable: boolean
}

function utf16(hex: string): string {
  let out = ''
  for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode((hex.charCodeAt(i) << 8) | hex.charCodeAt(i + 1))
  return out
}
const codeOf = (s: string) => [...s].reduce((n, c) => n * 256 + c.charCodeAt(0), 0)

function parseCMap(data: string): { map: Map<number, string>; bytes: 1 | 2 } {
  const map = new Map<number, string>()
  let bytes: 1 | 2 = 1
  const lex = new Lexer(data)
  const stack: V[] = []
  let mode = ''
  for (let t = lex.next(); t !== undefined; t = lex.next()) {
    if (t && typeof t === 'object' && 'op' in t) {
      const op = t.op
      if (op === 'begincodespacerange' || op === 'beginbfchar' || op === 'beginbfrange') {
        mode = op
        stack.length = 0
      } else if (op === 'endcodespacerange') {
        const lo = stack.find(isStr)
        if (lo && lo.s.length === 2) bytes = 2
        mode = ''
      } else if (op === 'endbfchar') {
        for (let i = 0; i + 1 < stack.length; i += 2) {
          const a = stack[i]
          const b = stack[i + 1]
          if (isStr(a) && isStr(b)) map.set(codeOf(a.s), utf16(b.s))
        }
        mode = ''
      } else if (op === 'endbfrange') {
        for (let i = 0; i + 2 < stack.length; i += 3) {
          const lo = stack[i]
          const hi = stack[i + 1]
          const dst = stack[i + 2]
          if (!isStr(lo) || !isStr(hi)) continue
          const a = codeOf(lo.s)
          const b = Math.min(codeOf(hi.s), a + 0xffff)
          if (Array.isArray(dst)) dst.forEach((d, k) => isStr(d) && map.set(a + k, utf16(d.s)))
          else if (isStr(dst)) {
            const base = utf16(dst.s)
            for (let c = a; c <= b; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - a)))
          }
        }
        mode = ''
      }
      continue
    }
    if (mode) stack.push(t)
  }
  return { map, bytes }
}

async function loadFont(doc: PdfDoc, ref: V | undefined): Promise<Font> {
  const d = doc.dict(ref)
  if (!d) return { bytes: 1, undecodable: false }
  const subtype = isName(d.get('Subtype')) ? (d.get('Subtype') as Name).n : ''
  const tu = await doc.streamOf(d.get('ToUnicode'))
  const cm = tu ? parseCMap(tu) : undefined
  if (subtype === 'Type0') return { bytes: 2, cmap: cm?.map, undecodable: !cm }
  const enc = doc.resolve(d.get('Encoding'))
  let differences: Map<number, string> | undefined
  if (isDict(enc) && Array.isArray(enc.get('Differences'))) {
    differences = new Map()
    let code = 0
    for (const x of enc.get('Differences') as V[]) {
      if (typeof x === 'number') code = x
      else if (isName(x)) {
        const ch = glyphToChar(x.n)
        if (ch) differences.set(code, ch)
        code++
      }
    }
  }
  return { bytes: cm?.bytes ?? 1, cmap: cm?.map, differences, undecodable: false }
}

function decodeText(font: Font | undefined, s: string): string {
  if (!font) return [...s].map((c) => CP1252[c.charCodeAt(0)] ?? c).join('')
  if (font.undecodable) return ''
  let out = ''
  for (let i = 0; i < s.length; i += font.bytes) {
    const code = font.bytes === 2 ? (s.charCodeAt(i) << 8) | s.charCodeAt(i + 1) : s.charCodeAt(i)
    const ch = font.cmap?.get(code) ?? font.differences?.get(code) ?? (font.bytes === 1 ? (CP1252[code] ?? String.fromCharCode(code)) : '')
    out += ch
  }
  return out
}

/* ───────────── Content streams ───────────── */

type M = [number, number, number, number, number, number]
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]
const ID: M = [1, 0, 0, 1, 0, 0]

interface Frag {
  x: number
  y: number
  end: number
  size: number
  text: string
}

async function runContent(doc: PdfDoc, data: string, resources: Dict | undefined, ctm0: M, frags: Frag[], depth: number, stats: { undecodable: number }) {
  const fontsDict = doc.dict(resources?.get('Font'))
  const xobjects = doc.dict(resources?.get('XObject'))
  const fonts = new Map<string, Font>()
  const lex = new Lexer(data)
  const ops: V[] = []
  let ctm = ctm0
  const stack: M[] = []
  let tm: M = ID
  let tlm: M = ID
  let font: Font | undefined
  let size = 10
  let leading = 0
  const emit = (raw: string) => {
    const text = decodeText(font, raw)
    if (font?.undecodable) stats.undecodable += raw.length
    const m = mul(tm, ctm)
    const scale = Math.hypot(m[2], m[3]) || 1
    const eff = size * scale
    const width = text.length * eff * 0.5
    if (text) frags.push({ x: m[4], y: m[5], end: m[4] + width, size: eff, text })
    tm = mul([1, 0, 0, 1, text.length * size * 0.5, 0], tm)
  }
  const nextLine = () => {
    tlm = mul([1, 0, 0, 1, 0, -leading], tlm)
    tm = tlm
  }
  for (let t = lex.next(); t !== undefined; t = lex.next()) {
    if (!(t && typeof t === 'object' && 'op' in t)) {
      ops.push(t)
      continue
    }
    const op = t.op
    const n = (i: number) => Number(ops[ops.length - i] ?? 0)
    switch (op) {
      case 'q':
        stack.push(ctm)
        break
      case 'Q':
        ctm = stack.pop() ?? ctm0
        break
      case 'cm':
        ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], ctm)
        break
      case 'BT':
        tm = tlm = ID
        break
      case 'Tf': {
        const name = ops[ops.length - 2]
        size = n(1) || size
        if (isName(name)) {
          if (!fonts.has(name.n)) fonts.set(name.n, await loadFont(doc, fontsDict?.get(name.n)))
          font = fonts.get(name.n)
        }
        break
      }
      case 'TL':
        leading = n(1)
        break
      case 'Td':
        tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm)
        tm = tlm
        break
      case 'TD':
        leading = -n(1)
        tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm)
        tm = tlm
        break
      case 'Tm':
        tlm = tm = [n(6), n(5), n(4), n(3), n(2), n(1)]
        break
      case 'T*':
        nextLine()
        break
      case 'Tj': {
        const s = ops[ops.length - 1]
        if (isStr(s)) emit(s.s)
        break
      }
      case "'":
      case '"': {
        nextLine()
        const s = ops[ops.length - 1]
        if (isStr(s)) emit(s.s)
        break
      }
      case 'TJ': {
        const arr = ops[ops.length - 1]
        if (Array.isArray(arr))
          for (const x of arr) {
            if (isStr(x)) emit(x.s)
            else if (typeof x === 'number') {
              // Large negative kerning is a word gap.
              if (x < -200) emit(' ')
              else tm = mul([1, 0, 0, 1, (-x / 1000) * size, 0], tm)
            }
          }
        break
      }
      case 'Do': {
        const name = ops[ops.length - 1]
        const ref = isName(name) ? xobjects?.get(name.n) : undefined
        const x = doc.dict(ref)
        if (depth < 3 && x && isName(x.get('Subtype')) && (x.get('Subtype') as Name).n === 'Form') {
          const content = await doc.streamOf(ref)
          const mtx = x.get('Matrix')
          const fm: M = Array.isArray(mtx) && mtx.length === 6 ? (mtx.map(Number) as M) : ID
          if (content) await runContent(doc, content, doc.dict(x.get('Resources')) ?? resources, mul(fm, ctm), frags, depth + 1, stats)
        }
        break
      }
    }
    ops.length = 0
  }
}

function toLines(frags: Frag[], page: number): PdfTextLine[] {
  const sorted = [...frags].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Frag[][] = []
  for (const f of sorted) {
    const row = rows.at(-1)
    if (row && Math.abs(row[0].y - f.y) <= Math.max(2, f.size * 0.35)) row.push(f)
    else rows.push([f])
  }
  return rows
    .map((r) => {
      r.sort((a, b) => a.x - b.x)
      let text = ''
      let prevEnd = -Infinity
      for (const f of r) {
        const gap = f.x - prevEnd
        if (text && gap > f.size * 1.6) text += '   '
        else if (text && gap > f.size * 0.15 && !text.endsWith(' ') && !f.text.startsWith(' ')) text += ' '
        text += f.text
        prevEnd = Math.max(prevEnd, f.end)
      }
      // NFKC turns typographic ligatures (ﬁ, ﬂ) and compatibility spaces into plain text.
      return text.normalize('NFKC').replace(/\s+$/, '')
    })
    .filter((t) => t.trim())
    .map((text, i) => ({ page, line: i + 1, text }))
}

/** Extracts text lines from a PDF. Never pretends success on scanned or protected files. */
export async function extractPdfText(data: ArrayBuffer): Promise<PdfTextResult> {
  if (data.byteLength > PDF_MAX_BYTES) return { status: 'unsupported', reason: 'El archivo supera 5 MB.', pages: 0, lines: [] }
  const src = toLatin1(new Uint8Array(data))
  if (!src.startsWith('%PDF-')) return { status: 'unsupported', reason: 'El archivo no es un PDF.', pages: 0, lines: [] }
  if (/\/Encrypt\s/.test(src)) return { status: 'unsupported', reason: 'El PDF está protegido (cifrado): no se puede leer localmente.', pages: 0, lines: [] }
  const doc = new PdfDoc(readObjects(src))
  await expandObjectStreams(doc)

  // Page tree from the catalog (inherited resources); fallback: every /Page object.
  const pages: { dict: Dict; resources?: Dict }[] = []
  const walk = (ref: V | undefined, inherited: Dict | undefined, depth: number) => {
    const d = doc.dict(ref)
    if (!d || depth > 30) return
    const res = doc.dict(d.get('Resources')) ?? inherited
    const type = isName(d.get('Type')) ? (d.get('Type') as Name).n : ''
    if (type === 'Pages' || Array.isArray(d.get('Kids'))) for (const k of (d.get('Kids') as V[]) ?? []) walk(k, res, depth + 1)
    else if (type === 'Page') pages.push({ dict: d, resources: res })
  }
  const catalog = [...doc.objects.values()].find((o) => isDict(o.value) && isName(o.value.get('Type')) && (o.value.get('Type') as Name).n === 'Catalog')
  if (catalog && isDict(catalog.value)) walk(catalog.value.get('Pages'), undefined, 0)
  if (!pages.length)
    for (const o of doc.objects.values()) if (isDict(o.value) && isName(o.value.get('Type')) && (o.value.get('Type') as Name).n === 'Page') pages.push({ dict: o.value, resources: doc.dict(o.value.get('Resources')) })

  const stats = { undecodable: 0 }
  const lines: PdfTextLine[] = []
  for (let i = 0; i < pages.length; i++) {
    const c = pages[i].dict.get('Contents')
    const refs = Array.isArray(c) ? c : [c]
    let content = ''
    for (const r of refs) content += ((await doc.streamOf(r as V)) ?? '') + '\n'
    const frags: Frag[] = []
    await runContent(doc, content, pages[i].resources, ID, frags, 0, stats)
    lines.push(...toLines(frags, i + 1))
  }
  const chars = lines.reduce((n, l) => n + (l.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0), 0)
  if (chars < 20) {
    return {
      status: 'no-text',
      reason: stats.undecodable ? 'El PDF usa fuentes sin mapa de caracteres: el texto no se puede leer localmente.' : 'El PDF no tiene texto seleccionable (posiblemente escaneado): requiere OCR.',
      pages: pages.length,
      lines,
    }
  }
  return { status: 'text', pages: pages.length, lines }
}
