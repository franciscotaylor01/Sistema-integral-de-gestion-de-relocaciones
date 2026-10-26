/** Test-only: builds a real .xlsx (ZIP + SpreadsheetML) with shared strings, optionally deflated. */
type V = string | number | null

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const col = (i: number) => {
  let s = ''
  let n = i + 1
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function makeXlsx(sheets: { name: string; rows: V[][] }[], opts: { deflate?: boolean } = {}): Promise<ArrayBuffer> {
  const shared: string[] = []
  const si = (s: string) => {
    let i = shared.indexOf(s)
    if (i < 0) i = shared.push(s) - 1
    return i
  }
  const files: [string, string][] = []
  sheets.forEach((sh, n) => {
    const rows = sh.rows
      .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === null ? '' : typeof v === 'number' ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${si(v)}</v></c>`)).join('')}</row>`)
      .join('')
    files.push([`xl/worksheets/sheet${n + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`])
  })
  files.unshift(
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`],
    ['xl/sharedStrings.xml', ''],
  )
  files[3][1] = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const [name, text] of files) {
    const raw = enc.encode(text)
    const data = opts.deflate ? await deflate(raw) : raw
    const nameB = enc.encode(name)
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true)
    lh.setUint16(8, opts.deflate ? 8 : 0, true)
    lh.setUint32(14, crc32(raw), true)
    lh.setUint32(18, data.length, true)
    lh.setUint32(22, raw.length, true)
    lh.setUint16(26, nameB.length, true)
    parts.push(new Uint8Array(lh.buffer), nameB, data)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true)
    ch.setUint16(4, 20, true)
    ch.setUint16(6, 20, true)
    ch.setUint16(10, opts.deflate ? 8 : 0, true)
    ch.setUint32(16, crc32(raw), true)
    ch.setUint32(20, data.length, true)
    ch.setUint32(24, raw.length, true)
    ch.setUint16(28, nameB.length, true)
    ch.setUint32(42, offset, true)
    central.push(new Uint8Array(ch.buffer), nameB)
    offset += 30 + nameB.length + data.length
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0))
  let p = 0
  for (const b of all) {
    out.set(b, p)
    p += b.length
  }
  return out.buffer
}
