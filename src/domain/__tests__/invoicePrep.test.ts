import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { setProjectException } from '@/domain/commercial/catalog'
import { approveCertificate, certifiableUnits, createCertificate, submitCertificate } from '@/domain/commercial/certificates'
import { reviewComparisonRow, comparePoWithQuotation } from '@/domain/commercial/poComparison'
import { invoiceFinancials } from '@/domain/finance/derive'
import { confirmInvoiceEmission } from '@/domain/finance/emission'
import { invoicePreparation, preparationText } from '@/domain/finance/invoicePrep'
import { createInvoiceDraft, suggestInvoiceLines, validateInvoice, type InvoiceInput, type InvoiceLineInput } from '@/domain/finance/invoices'
import { readDataset, writeDataset, type StorageLike } from '@/services/local/storage'
import { createPurchaseOrder } from '@/domain/commercial/purchaseOrders'
import { approveQuotation, createQuotationFromProject, sendQuotation, updateQuotationDraft } from '@/domain/commercial/quotations'
import { importPo, setup } from './commercialFixtures'
import { fieldsOf, seed, testContext } from './helpers'

const TODAY = '2026-10-19'
/** One context for the whole suite: fresh contexts would reuse ids (inv_t1…). */
const CTX = testContext()
const draft = (projectId: string, lines: InvoiceLineInput[]): InvoiceInput => ({ projectId, issuerId: 'le_relocare', kind: 'A', issueDate: TODAY, dueDate: TODAY, currency: 'USD', lines, taxes: [], notes: '', externalRef: '' })
const emission = (total: number) => ({ voucherType: 'A' as const, pointOfSale: '3', number: '1201', issueDate: TODAY, total, currency: 'USD' as const })

/** Imported PO with the special line at 1 of 2 visits (difference accepted) and schooling identical. */
function authorizedProject() {
  const f = setup()
  const { ds: d1, poId } = importPo(
    f.ds,
    f.projectId,
    [
      { service: f.housing, qty: 1, price: 4500 },
      { service: f.housing, serviceItemId: f.visitsId, qty: 1, price: 300 },
      { service: f.schooling, qty: 1, price: 2400 },
    ],
    { terms: '60', quotation: f.quotation.number },
  )
  const row = comparePoWithQuotation(d1, f.projectId).rows.find((r) => r.serviceItemId === f.visitsId)!
  const ds = reviewComparisonRow(d1, f.projectId, row.key, { resolution: 'accepted', reason: 'El cliente autoriza 1 visita', date: TODAY, reference: 'Email compras' }, CTX)
  return { ...f, ds, poId, rowKey: row.key }
}

describe('assisted invoice preparation', () => {
  it('1–3. prepared from the imported PO: authorised quantities, special sub-service and references', () => {
    const { ds: d0, projectId, housing, visitsId, quotation } = authorizedProject()
    const lines = suggestInvoiceLines(d0, projectId, 'USD', TODAY)
    // Accepted difference: 1 visit (PO), not the 2 quoted.
    expect(lines.map((l) => [l.serviceId === housing.id ? 'housing' : 'schooling', l.serviceItemId === visitsId ? 'visits' : 'base', l.quantity, l.unitPrice])).toEqual([
      ['housing', 'base', 1, 4500],
      ['housing', 'visits', 1, 300],
      ['schooling', 'base', 1, 2400],
    ])
    const r = createInvoiceDraft(d0, draft(projectId, lines), 'inv-1', CTX)
    const prep = invoicePreparation(r.ds, r.invoiceId, TODAY)
    expect(prep.blocks.map((b) => b.title)).toEqual(['Emisor', 'Receptor / cliente', 'Comprobante', 'Referencias de OC y certificado', 'Conceptos y líneas', 'Importes y resumen', 'Confirmación de emisión externa'])
    const refs = prep.blocks.find((b) => b.key === 'references')!.fields
    expect(refs.find((f) => f.label === 'Orden de compra')).toMatchObject({ value: expect.stringMatching(/^4500098765/), source: expect.stringMatching(/^Importada de .* y validada/) })
    expect(refs.find((f) => f.label === 'Cotización')?.value).toBe(`${quotation.number} v1`)
    expect(refs.find((f) => f.label === 'Comparación OC vs. cotización')).toMatchObject({ value: 'Conceptos resueltos', status: 'ok' })
    const visit = prep.lines.find((l) => l.description.includes('Visitas'))!
    expect(visit.origins.join(' ')).toMatch(/Diferencia aceptada · OC 4500098765/)
    expect(visit.origins).toContain('Subservicio especial del proyecto')
    expect(prep.blocks.find((b) => b.key === 'voucher')!.fields.find((f) => f.label === 'Condición de pago')).toMatchObject({ value: '60 días corridos', source: 'OC 4500098765' })
    // Asking for the quoted 2 visits is refused: the PO authorises 1.
    const over = draft(projectId, lines.map((l) => (l.serviceItemId === visitsId ? { ...l, quantity: 2 } : l)))
    expect(Object.values(validateInvoice(d0, over, TODAY)).join(' ')).toMatch(/Supera la cantidad/)
  })

  it('pending, rejected or stale differences are not offered and the reason is shown', () => {
    const f = setup()
    const { ds } = importPo(f.ds, f.projectId, [
      { service: f.housing, qty: 1, price: 4500 },
      { service: f.housing, serviceItemId: f.visitsId, qty: 1, price: 300 },
      { service: f.schooling, qty: 1, price: 2400 },
    ])
    expect(suggestInvoiceLines(ds, f.projectId, 'USD', TODAY).some((l) => l.serviceId === f.housing.id)).toBe(false)
    const key = comparePoWithQuotation(ds, f.projectId).rows.find((r) => r.serviceItemId === f.visitsId)!.key
    const rejected = reviewComparisonRow(ds, f.projectId, key, { resolution: 'rejected', reason: 'No se cubre la visita extra', date: TODAY }, CTX)
    const lines = suggestInvoiceLines(rejected, f.projectId, 'USD', TODAY)
    expect(lines.some((l) => l.serviceItemId === f.visitsId)).toBe(false)
    expect(lines.some((l) => l.serviceId === f.housing.id && !l.serviceItemId)).toBe(true)
    const r = createInvoiceDraft(rejected, draft(f.projectId, lines), 'inv-r', CTX)
    expect(invoicePreparation(r.ds, r.invoiceId, TODAY).unavailable).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Housing — Visitas extra fin de semana', reason: expect.stringMatching(/no autorizada/) })]))
  })

  it('stale authorisation after the PO changes is invalidated', () => {
    const { ds, projectId, poId, housing } = authorizedProject()
    const changed: Dataset = { ...ds, purchaseOrders: ds.purchaseOrders.map((p) => (p.id === poId ? { ...p, allocations: p.allocations.map((a) => (a.serviceId === housing.id ? { ...a, amount: a.amount - 100 } : a)) } : p)) }
    expect(suggestInvoiceLines(changed, projectId, 'USD', TODAY).some((l) => l.serviceId === housing.id)).toBe(false)
  })

  it('3b. certificate required: referenced when approved, reported when missing', () => {
    const { ds: d0, projectId, schooling } = authorizedProject()
    let ds = setProjectException(d0, projectId, { requiresCertificate: true, reason: 'Acuerdo con compras' }, CTX)
    expect(suggestInvoiceLines(ds, projectId, 'USD', TODAY)).toEqual([])
    const c = createCertificate(ds, { projectId, lines: [{ serviceId: schooling.id, quantity: 1 }] }, 'cert-1', CTX)
    ds = approveCertificate(submitCertificate(c.ds, c.certificateId, { externalNumber: 'CERT-NV-77', date: TODAY }, CTX), c.certificateId, { date: TODAY }, CTX)
    const lines = suggestInvoiceLines(ds, projectId, 'USD', TODAY)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ serviceId: schooling.id, certificateId: c.certificateId })
    const r = createInvoiceDraft(ds, draft(projectId, lines), 'inv-c', CTX)
    const refs = invoicePreparation(r.ds, r.invoiceId, TODAY).blocks.find((b) => b.key === 'references')!.fields
    expect(refs.find((f) => f.label === 'Certificado aprobado')).toMatchObject({ value: expect.stringMatching(/^CERT-NV-77/), status: 'ok' })
  })

  it('4–5 & 7–9. partial billing, no double billing, external emission, due date and receivables', () => {
    const { ds: d0, projectId, housing, schooling } = authorizedProject()
    // Bill only housing base while the rest stays pending (project not finished).
    const housingOnly = suggestInvoiceLines(d0, projectId, 'USD', TODAY).filter((l) => l.serviceId === housing.id && !l.serviceItemId)
    const r = createInvoiceDraft(d0, draft(projectId, housingOnly), 'inv-p', CTX)
    expect(r.ds.projects.find((p) => p.id === projectId)!.operationalStatus).not.toBe('completed')
    let ds = confirmInvoiceEmission(r.ds, r.invoiceId, emission(4500), CTX)
    const inv = ds.invoices.find((i) => i.id === r.invoiceId)!
    expect(inv).toMatchObject({ lifecycle: 'issued', externalRef: '00003-00001201', issueDate: TODAY, dueDate: '2026-12-18', paymentTerms: { days: 60, source: 'purchase-order' } })
    expect(invoiceFinancials(ds, inv, TODAY)).toMatchObject({ outstanding: 4500, paid: 0 })
    // Housing base no longer offered; schooling and the visit still are.
    const next = suggestInvoiceLines(ds, projectId, 'USD', TODAY)
    expect(next.some((l) => l.serviceId === housing.id && !l.serviceItemId)).toBe(false)
    expect(next.some((l) => l.serviceId === schooling.id)).toBe(true)
    // Billing housing again is refused.
    expect(Object.keys(validateInvoice(ds, draft(projectId, housingOnly), TODAY)).length).toBeGreaterThan(0)
    // The same fiscal number cannot be registered twice.
    const r2 = createInvoiceDraft(ds, draft(projectId, next), 'inv-p2', CTX)
    ds = r2.ds
    expect(fieldsOf(() => confirmInvoiceEmission(ds, r2.invoiceId, emission(2700), CTX))).toHaveProperty('number')
  })

  it('6. missing data is flagged, fiscal data is never computed', () => {
    const { ds: d0, projectId } = authorizedProject()
    const ds: Dataset = { ...d0, clients: d0.clients.map((c) => (c.id === 'cli_nordvik' ? { ...c, taxId: '', billingAddress: '' } : c)) }
    const r = createInvoiceDraft(ds, draft(projectId, suggestInvoiceLines(ds, projectId, 'USD', TODAY)), 'inv-m', CTX)
    const prep = invoicePreparation(r.ds, r.invoiceId, TODAY)
    expect(prep.missing).toEqual(expect.arrayContaining(['Identificación fiscal del emisor', 'Identificación fiscal', 'Domicilio de facturación']))
    expect(prep.fiscalPending).toEqual(expect.arrayContaining(['Punto de venta', 'Condición frente al IVA', 'IVA y alícuotas', 'CAE / número de comprobante', 'Tipo de cambio']))
    const text = preparationText(prep, 'FC')
    expect(text).toMatch(/Identificación fiscal: \[FALTA EN SIGR\]/)
    expect(text).toMatch(/IVA y alícuotas: \[COMPLETAR EN EL SISTEMA FISCAL\]/)
    expect(text).not.toMatch(/IVA 21/)
  })

  it('10. open-PO and manual-PO projects keep their previous behaviour; data persists', () => {
    let ds = seed()
    const pv = ds.projects.find((p) => p.openOrderId === 'oca_pv_nqn' && ds.people.find((x) => x.id === p.beneficiaryId)?.name === 'Tomás Herrera')!
    // The seed already invoiced its approved certificate: certify and approve another available unit.
    const unit = certifiableUnits(ds, pv.id).find((u) => u.available > 0 && !ds.certificates.some((c) => c.status === 'draft' && c.lines.some((l) => l.serviceItemId === u.serviceItemId)))!
    const c = createCertificate(ds, { projectId: pv.id, lines: [{ serviceId: unit.serviceId, serviceItemId: unit.serviceItemId, quantity: 1 }] }, 'cert-o', CTX)
    ds = approveCertificate(submitCertificate(c.ds, c.certificateId, { externalNumber: 'CERT-PV-9', date: TODAY }, CTX), c.certificateId, { date: TODAY }, CTX)
    const lines = suggestInvoiceLines(ds, pv.id, 'ARS', TODAY)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => l.openOrderId === 'oca_pv_nqn')).toBe(true)
    const r = createInvoiceDraft(ds, { ...draft(pv.id, lines), currency: 'ARS' }, 'inv-o', CTX)
    const refs = invoicePreparation(r.ds, r.invoiceId, TODAY).blocks.find((b) => b.key === 'references')!.fields
    expect(refs.some((f) => f.label === 'OC abierta')).toBe(true)
    expect(refs.some((f) => f.label === 'Comparación OC vs. cotización')).toBe(false)
    const mem: Record<string, string> = {}
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    writeDataset(storage, r.ds, 'now')
    expect(readDataset(storage).dataset!.invoices.find((i) => i.id === r.invoiceId)?.lines).toEqual(r.ds.invoices.find((i) => i.id === r.invoiceId)!.lines)
  })

  it('earlier billing under a manual PO does not consume the units of a new imported PO', () => {
    const f = setup({ special: false })
    // First round: manual PO + invoice for housing (quoted USD 4.500).
    let ds = createPurchaseOrder(f.ds, { projectId: f.projectId, clientPoNumber: 'MAN-1', quotationId: f.quotation.id, issueDate: TODAY, receivedDate: TODAY, currency: 'USD', authorizedAmount: 4500, allocations: [{ serviceId: f.housing.id, amount: 4500 }] }, 'man-1', CTX).ds
    const manualPo = ds.purchaseOrders.find((p) => p.clientPoNumber === 'MAN-1')!
    const first = suggestInvoiceLines(ds, f.projectId, 'USD', TODAY).filter((l) => l.serviceId === f.housing.id)
    expect(first[0]).toMatchObject({ purchaseOrderId: manualPo.id, quantity: 1 })
    const r1 = createInvoiceDraft(ds, draft(f.projectId, first), 'inv-m1', CTX)
    ds = confirmInvoiceEmission(r1.ds, r1.invoiceId, { ...emission(4500), number: '9001' }, CTX)
    // Second round: new approved quotation and an imported PO for the same service.
    const q2 = createQuotationFromProject(ds, f.projectId, CTX)
    ds = updateQuotationDraft(q2.ds, q2.quotation.id, { issueDate: q2.quotation.issueDate, validUntil: q2.quotation.validUntil, lines: q2.quotation.lines.filter((l) => l.serviceId === f.housing.id) }, CTX)
    ds = approveQuotation(sendQuotation(ds, q2.quotation.id, CTX), q2.quotation.id, { approvedBy: 'Lena Berg', approvedAt: TODAY }, CTX)
    ds = importPo(ds, f.projectId, [{ service: f.housing, qty: 1, price: 4500 }], { number: '4500777001', quotation: q2.quotation.number, requestId: 'imp-2' }).ds
    const imported = ds.purchaseOrders.find((p) => p.clientPoNumber === '4500777001')!
    const second = suggestInvoiceLines(ds, f.projectId, 'USD', TODAY).filter((l) => l.serviceId === f.housing.id)
    expect(second).toEqual([expect.objectContaining({ purchaseOrderId: imported.id, quantity: 1, unitPrice: 4500 })])
    expect(validateInvoice(ds, draft(f.projectId, second), TODAY)).toEqual({})
    // …and once billed, it is not offered a third time.
    const r2 = createInvoiceDraft(ds, draft(f.projectId, second), 'inv-m2', CTX)
    ds = confirmInvoiceEmission(r2.ds, r2.invoiceId, { ...emission(4500), number: '9002' }, CTX)
    expect(suggestInvoiceLines(ds, f.projectId, 'USD', TODAY).filter((l) => l.serviceId === f.housing.id)).toEqual([])
    expect(Object.keys(validateInvoice(ds, draft(f.projectId, second), TODAY)).length).toBeGreaterThan(0)
  })
})
