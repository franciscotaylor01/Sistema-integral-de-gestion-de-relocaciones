import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { extractPo, FIELD_LABELS, type ExtractedField, type PoExtraction } from '@/domain/commercial/poExtraction'
import { confirmPoImport, duplicatePos, poInputFromReview, reviewProblems, type PoImportInput } from '@/domain/commercial/poImport'
import { approveQuotation, createQuotationFromProject, sendQuotation } from '@/domain/commercial/quotations'
import { addSpecialItem } from '@/domain/commercial/specialItems'
import { createProject } from '@/domain/projects'
import { XLSX_MIME } from '@/domain/finance/attachments'
import { PdfDocument } from '@/lib/pdf'
import { extractPdfText } from '@/lib/pdfText'
import { migrateDataset } from '@/services/local/migrations'
import { readDataset, writeDataset, type StorageLike } from '@/services/local/storage'
import { readPdfDocument, readXlsxDocument, remoteProvider, textDocument } from '@/services/extraction/poReaders'
import type { PoImportField, PoImportLine } from '@/types/domain'
import { makeXlsx } from './makeXlsx'
import { projectInput, seed, testContext } from './helpers'

/** Nordvik project (OC por proyecto) with housing (USD 4.500 + special 2 × 300) quoted and approved. */
function approvedProject() {
  const ctx = testContext()
  const r = createProject(seed(), projectInput({ services: [{ typeId: 'housing', ownerId: 'stf_04', startDate: '2026-11-01', dueDate: '2026-12-20' }] }), 'poi-p', ctx)
  const housing = r.ds.services.find((s) => s.projectId === r.projectId)!
  let ds = addSpecialItem(r.ds, housing.id, { name: 'Visitas extra fin de semana', quantity: 2, unit: 'session', unitPrice: 300, currency: 'USD', reason: 'Pedido del beneficiario' }, ctx).ds
  const q = createQuotationFromProject(ds, r.projectId, ctx)
  ds = approveQuotation(sendQuotation(q.ds, q.quotation.id, ctx), q.quotation.id, { approvedBy: 'Lena Berg', approvedAt: '2026-10-19' }, ctx)
  const project = ds.projects.find((p) => p.id === r.projectId)!
  return { ctx, ds, project, housing, quotation: ds.quotations.find((x) => x.id === q.quotation.id)! }
}

const EMAIL = (code: string, quote: string, currency = 'USD') => `De: compras@nordvik.example
Asunto: Orden de Compra 4500098765

Nordvik Energy B.V.
CUIT 30-71234567-9
Orden de Compra N° 4500098765
Fecha de emisión: 15/10/2026
Válida hasta: 31/03/2027
Moneda: ${currency}
Condición de pago: 45 días fecha factura
Referencia: Proyecto ${code} · Cotización ${quote}
Centro de costo: CC-4410 · Solicitud SAP 1100234

Ítem   Descripción   Cantidad   Unidad   Precio unitario   Importe
10   Servicio de búsqueda de vivienda   1   servicio   4.500,00   4.500,00
20   Visitas extra fin de semana   2   sesión   300,00   600,00
30   Gastos administrativos varios   1   servicio   150,00   150,00
Total ${currency} 5.250,00`

const fieldOf = (x: PoExtraction, k: string) => x.fields.find((f) => f.key === k) as ExtractedField

/** Reviewed input as the UI builds it: doubtful data confirmed, unmatched line excluded. */
function reviewed(projectId: string, x: PoExtraction, patch: Partial<PoImportInput> = {}): PoImportInput {
  const fields: PoImportField[] = x.fields.map((f) => ({ key: f.key, label: FIELD_LABELS[f.key].label, raw: f.raw, value: f.value, detected: f.value, source: f.source, status: f.status, confirmed: true, edited: false, note: f.note }))
  const lines: PoImportLine[] = x.lines.map((l) => ({
    raw: l.raw,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit,
    unitPrice: l.unitPrice,
    amount: l.amount,
    currency: l.currency,
    source: l.source,
    status: l.status,
    included: Boolean(l.match),
    serviceId: l.match?.serviceId,
    catalogItemId: l.match?.catalogItemId,
    serviceItemId: l.match?.serviceItemId,
    confirmed: true,
  }))
  const total = fields.find((f) => f.key === 'total')!
  const sum = lines.filter((l) => l.included).reduce((s, l) => s + (l.amount ?? 0), 0)
  total.value = String(sum)
  return { projectId, mode: 'create', source: { kind: 'text', text: EMAIL('', '') }, provider: 'local', fields, lines, receivedDate: '2026-10-19', ...patch }
}

describe('extraction from email text', () => {
  it('recognises fields, lines and correspondences with provenance', () => {
    const { ds, project, quotation } = approvedProject()
    const x = extractPo(ds, project.id, textDocument(EMAIL(project.code, quotation.number)))
    expect(fieldOf(x, 'poNumber')).toMatchObject({ value: '4500098765', status: 'recognized', source: { section: 'Texto del email', line: 2 } })
    expect(fieldOf(x, 'client')).toMatchObject({ value: 'Nordvik Energy', status: 'recognized' })
    // The client's recorded tax id differs: reported, never applied.
    expect(fieldOf(x, 'taxId')).toMatchObject({ value: '30-71234567-9', status: 'inconsistent' })
    expect(fieldOf(x, 'issueDate')).toMatchObject({ value: '2026-10-15', status: 'recognized' })
    expect(fieldOf(x, 'validTo')).toMatchObject({ value: '2027-03-31', status: 'recognized' })
    expect(fieldOf(x, 'currency')).toMatchObject({ value: 'USD', status: 'recognized' })
    expect(fieldOf(x, 'paymentTerms')).toMatchObject({ value: '45', status: 'recognized' })
    expect(fieldOf(x, 'projectRef')).toMatchObject({ value: project.code, status: 'recognized' })
    expect(fieldOf(x, 'quotationRef')).toMatchObject({ value: quotation.number, status: 'recognized' })
    expect(fieldOf(x, 'adminRefs').value).toMatch(/CC-4410/)
    // Stated total 5.250 = sum of the three lines.
    expect(fieldOf(x, 'total')).toMatchObject({ value: '5250', status: 'recognized' })
    expect(x.lines.map((l) => [l.description, l.quantity, l.unit, l.unitPrice, l.amount, l.status])).toEqual([
      ['Servicio de búsqueda de vivienda', 1, 'service', 4500, 4500, 'recognized'],
      ['Visitas extra fin de semana', 2, 'session', 300, 600, 'recognized'],
      ['Gastos administrativos varios', 1, 'service', 150, 150, 'missing'],
    ])
    // "Servicio de búsqueda de vivienda" contains the catalog sub-service name → recognised.
    expect(x.lines[0].match).toMatchObject({ catalogItemId: 'itm_housing_1' })
    expect(x.lines[1].match).toMatchObject({ serviceItemId: expect.any(String) }) // the special sub-service
    expect(x.lines[2].match).toBeUndefined()
    expect(x.lines[0].raw).toMatch(/^10 {3}Servicio de búsqueda/)
  })

  it('missing fields stay "not found"; a different currency is flagged, never converted', () => {
    const { ds, project } = approvedProject()
    const x = extractPo(ds, project.id, textDocument('Hola, adjunto el pedido.\nServicio de vivienda   1   2.000,00   2.000,00\nGracias'))
    for (const k of ['poNumber', 'issueDate', 'currency', 'projectRef', 'quotationRef', 'paymentTerms']) expect(fieldOf(x, k).status).toBe('missing')
    expect(fieldOf(x, 'total')).toMatchObject({ value: '2000', status: 'confirm' })
    const ars = extractPo(ds, project.id, textDocument(EMAIL(project.code, 'COT-2026-9999', 'ARS')))
    expect(fieldOf(ars, 'currency')).toMatchObject({ value: 'ARS', status: 'inconsistent', note: expect.stringMatching(/no se convierte/) })
    expect(fieldOf(ars, 'quotationRef').status).toBe('inconsistent')
    // "$" alone is not a currency.
    const peso = extractPo(ds, project.id, textDocument('OC N° 778899\nFecha: 01/10/2026\nVivienda   1   $ 1.000   $ 1.000\nTotal $ 1.000'))
    expect(fieldOf(peso, 'currency').status).toBe('confirm')
  })

  it('ambiguous items need a choice; services not contracted are not created', () => {
    const { ds, project } = approvedProject()
    const x = extractPo(ds, project.id, textDocument('OC 123456\nDescripción   Cantidad   Precio   Importe\nVisitas   1   100,00   100,00\nMudanza internacional   1   9.000,00   9.000,00\nTotal 9.100,00'))
    const [visits, moving] = x.lines
    expect(visits.status).not.toBe('recognized')
    expect(moving).toMatchObject({ status: 'inconsistent', note: expect.stringMatching(/Mudanzas.*no está contratado/) })
    expect(ds.services.filter((s) => s.projectId === project.id)).toHaveLength(1)
  })
})

describe('xlsx and PDF readers', () => {
  it('reads an Excel PO: header data as lines, items table with sheet/row provenance', async () => {
    const { ds, project, quotation } = approvedProject()
    const buf = await makeXlsx(
      [
        {
          name: 'OC',
          rows: [
            ['Orden de compra', '4500098765'],
            ['Fecha de emisión', 46310],
            ['Moneda', 'USD'],
            ['Proyecto', project.code],
            ['Cotización', quotation.number],
            [null],
            ['Descripción', 'Cantidad', 'Unidad', 'Precio unitario', 'Importe'],
            ['Búsqueda de vivienda', 1, 'servicio', 4500, 4500],
            ['Visitas extra fin de semana', 2, 'sesión', 300, 600],
            ['Total', null, null, null, 5100],
          ],
        },
      ],
      { deflate: true },
    )
    const doc = await readXlsxDocument(buf, 'oc.xlsx')
    expect(doc.status).toBe('ok')
    const x = extractPo(ds, project.id, doc)
    expect(fieldOf(x, 'poNumber')).toMatchObject({ value: '4500098765', source: { file: 'oc.xlsx', sheet: 'OC', row: 1 } })
    expect(fieldOf(x, 'issueDate').value).toBe('2026-10-15')
    expect(fieldOf(x, 'total')).toMatchObject({ value: '5100', status: 'recognized' })
    expect(x.lines.map((l) => [l.description, l.quantity, l.unitPrice, l.amount, l.source.row])).toEqual([
      ['Búsqueda de vivienda', 1, 4500, 4500, 8],
      ['Visitas extra fin de semana', 2, 300, 600, 9],
    ])
  })

  it('reads a PDF with selectable text (plain and compressed CID font with ToUnicode)', async () => {
    const pdf = new PdfDocument()
    pdf.text(40, 40, 'Orden de Compra N° 4500098765', { size: 12, bold: true })
    pdf.text(40, 60, 'Fecha de emisión: 15/10/2026')
    pdf.text(40, 80, 'Búsqueda de vivienda   1   servicio   4.500,00   4.500,00')
    const plain = await readPdfDocument(pdf.toBytes().slice().buffer, 'oc.pdf')
    expect(plain.status).toBe('ok')
    expect(plain.lines.map((l) => l.text)).toEqual(['Orden de Compra N° 4500098765', 'Fecha de emisión: 15/10/2026', 'Búsqueda de vivienda   1   servicio   4.500,00   4.500,00'])
    expect(plain.lines[1].source).toEqual({ file: 'oc.pdf', page: 1, line: 2 })

    // Hand-made PDF: Type0 font, 2-byte codes, ToUnicode CMap and FlateDecode content (like browser/ERP output).
    const deflate = async (s: string) => {
      const out = await new Response(new Blob([Uint8Array.from(s, (c) => c.charCodeAt(0))]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()
      return String.fromCharCode(...new Uint8Array(out))
    }
    const text = 'OC 4500012345 Total USD 980'
    const codes = [...text].map((_, i) => (i + 1).toString(16).padStart(4, '0'))
    const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange ${codes.length} beginbfchar ${[...text].map((c, i) => `<${codes[i]}> <${c.charCodeAt(0).toString(16).padStart(4, '0')}>`).join(' ')} endbfchar endcmap end end`
    const content = await deflate(`BT /F1 11 Tf 1 0 0 1 50 700 Tm <${codes.join('')}> Tj ET`)
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /DescendantFonts [] /ToUnicode 6 0 R >>',
      `<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n${content}\nendstream`,
      `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`,
    ]
    const src = `%PDF-1.7\n${objs.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join('')}trailer\n<< /Root 1 0 R >>\n%%EOF`
    const r = await extractPdfText(Uint8Array.from(src, (c) => c.charCodeAt(0)).buffer)
    expect(r).toMatchObject({ status: 'text', pages: 1 })
    expect(r.lines[0].text).toBe(text)
  })

  it('does not fake extraction for scanned or invalid PDFs; the remote processor is not configured', async () => {
    const scanned = new PdfDocument()
    scanned.rect(40, 40, 400, 300, [0.9, 0.9, 0.9])
    const doc = await readPdfDocument(scanned.toBytes().slice().buffer, 'scan.pdf')
    expect(doc).toMatchObject({ status: 'requires-processor', reason: expect.stringMatching(/OCR/) })
    expect((await readPdfDocument(new TextEncoder().encode('hola').buffer, 'x.pdf')).status).toBe('failed')
    expect(remoteProvider.available).toBe(false)
    await expect(remoteProvider.read({})).rejects.toThrow(/servidor/)
  })
})

describe('confirmation and registration', () => {
  it('requires human review, registers the PO through the commercial flow and keeps the import trace', () => {
    const { ctx, ds, project, quotation, housing } = approvedProject()
    const x = extractPo(ds, project.id, textDocument(EMAIL(project.code, quotation.number)))
    const input = reviewed(project.id, x, { source: { kind: 'pdf', fileName: 'OC 4500098765.pdf', file: { attachmentId: 'att_po1', mime: 'application/pdf', size: 50_000 } } })
    // Without confirmation of the doubtful data nothing is registered.
    const unconfirmed = { ...input, fields: input.fields.map((f) => ({ ...f, confirmed: false })) }
    expect(Object.keys(reviewProblems(unconfirmed)).length).toBeGreaterThan(0)
    expect(() => confirmPoImport(ds, unconfirmed, 'imp-0', ctx)).toThrow(/sin revisar/)

    const po = poInputFromReview(ds, input)
    expect(po).toMatchObject({ clientPoNumber: '4500098765', quotationId: quotation.id, issueDate: '2026-10-15', currency: 'USD', authorizedAmount: 5100, paymentTerms: { days: 45, dayType: 'calendar' }, allocations: [{ serviceId: housing.id, amount: 5100 }] })
    const r = confirmPoImport(ds, input, 'imp-1', ctx)
    const created = r.ds.purchaseOrders.find((p) => p.id === r.poId)!
    expect(created).toMatchObject({ status: 'active', clientPoNumber: '4500098765', documentLabel: 'OC 4500098765.pdf', quotationId: quotation.id })
    expect(created.notes).toMatch(/CC-4410/)
    expect(r.ds.attachments.find((a) => a.id === 'att_po1')).toMatchObject({ entity: 'purchase-order', entityId: r.poId })
    const rec = r.ds.poImports.find((i) => i.id === r.importId)!
    expect(rec).toMatchObject({ poId: r.poId, mode: 'create', source: { kind: 'pdf', attachmentId: 'att_po1' } })
    expect(rec.lines.find((l) => !l.included)?.raw).toMatch(/Gastos administrativos/)
    expect(rec.warnings.join(' ')).toMatch(/Dato fiscal/)
    expect(r.ds.clients.find((c) => c.id === project.clientId)!.taxId).toBe(ds.clients.find((c) => c.id === project.clientId)!.taxId) // fiscal data untouched
    expect(confirmPoImport(r.ds, input, 'imp-1', ctx).duplicate).toBe(true)

    // Same number again: detected; creating is refused, updating needs explicit consent.
    expect(duplicatePos(r.ds, project.clientId, ' 4500098765 ')).toHaveLength(1)
    expect(() => confirmPoImport(r.ds, input, 'imp-2', ctx)).toThrow(/ya tiene la OC 4500098765/)
    const upd = { ...input, mode: 'update' as const, targetPoId: r.poId }
    expect(() => confirmPoImport(r.ds, upd, 'imp-3', ctx)).toThrow(/Confirmá explícitamente/)
    const lower = { ...upd, overwriteConfirmed: true, lines: upd.lines.map((l) => (l.serviceItemId ? { ...l, included: false } : l)), fields: upd.fields.map((f) => (f.key === 'total' ? { ...f, value: '4500' } : f)) }
    const u = confirmPoImport(r.ds, lower, 'imp-3', ctx)
    expect(u.ds.purchaseOrders.find((p) => p.id === r.poId)).toMatchObject({ authorizedAmount: 4500 })
    expect(u.ds.purchaseOrders.filter((p) => p.clientPoNumber === '4500098765')).toHaveLength(1)
    expect(u.ds.poImports).toHaveLength(2)
  })

  it('amounts above the approved quotation are refused by the existing PO rules', () => {
    const { ctx, ds, project, quotation } = approvedProject()
    const x = extractPo(ds, project.id, textDocument(EMAIL(project.code, quotation.number)))
    const input = reviewed(project.id, x)
    const more = { ...input, lines: input.lines.map((l, i) => (i === 0 ? { ...l, amount: 9000, unitPrice: 9000 } : l)), fields: input.fields.map((f) => (f.key === 'total' ? { ...f, value: '9600' } : f)) }
    expect(() => confirmPoImport(ds, more, 'imp-x', ctx)).toThrow(/Revisá la orden de compra/)
  })

  it('open-PO clients keep their open orders; data persists and migrates', () => {
    const { ctx, ds, project, quotation } = approvedProject()
    const before = ds.openOrders
    const r = confirmPoImport(ds, reviewed(project.id, extractPo(ds, project.id, textDocument(EMAIL(project.code, quotation.number)))), 'imp-p', ctx)
    expect(r.ds.openOrders).toEqual(before)
    const mem: Record<string, string> = {}
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    writeDataset(storage, r.ds, 'now')
    expect(readDataset(storage).dataset!.poImports).toEqual(r.ds.poImports)
    const { poImports, ...v13 } = { ...seed(), schemaVersion: 13 }
    expect(poImports).toEqual([])
    const out = migrateDataset(v13, 13, 14) as Dataset
    expect(out).toMatchObject({ schemaVersion: 14, poImports: [] })
    expect(out.purchaseOrders).toEqual(v13.purchaseOrders)
    void XLSX_MIME
  })
})
