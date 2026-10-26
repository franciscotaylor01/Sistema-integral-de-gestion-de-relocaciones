import { describe, expect, it } from 'vitest'
import { setProjectException } from '@/domain/commercial/catalog'
import { approveCertificate, createCertificate, submitCertificate } from '@/domain/commercial/certificates'
import { comparePoWithQuotation, reviewComparisonRow } from '@/domain/commercial/poComparison'
import type { Dataset } from '@/domain/dataset'
import { confirmInvoiceEmission } from '@/domain/finance/emission'
import { createInvoiceDraft, suggestInvoiceLines, type InvoiceInput } from '@/domain/finance/invoices'
import { XLSX_MIME } from '@/domain/finance/attachments'
import { createTemplate } from '@/domain/initialDocuments'
import { createProject } from '@/domain/projects'
import { billingQueue, certificateQueue, pendingInitialDocs, poQueue, projectsNeedingAttention, totalOf, workQueue } from '@/features/dashboard/selectors'
import { importPo, setup } from './commercialFixtures'
import { projectInput, seed, testContext } from './helpers'

const TODAY = '2026-10-19'
const CTX = testContext()
const draft = (projectId: string, lines: InvoiceInput['lines']): InvoiceInput => ({ projectId, issuerId: 'le_relocare', kind: 'A', issueDate: TODAY, dueDate: TODAY, currency: 'USD', lines, taxes: [] })
const rowsOf = (ds: Dataset, projectId: string) => billingQueue(ds, TODAY).filter((r) => r.projectId === projectId)

/** Imported PO identical to the quotation except 1 of 2 visits; the difference is accepted. */
function authorized() {
  const f = setup()
  const { ds: d1 } = importPo(f.ds, f.projectId, [
    { service: f.housing, qty: 1, price: 4500 },
    { service: f.housing, serviceItemId: f.visitsId, qty: 1, price: 300 },
    { service: f.schooling, qty: 1, price: 2400 },
  ], { quotation: f.quotation.number })
  const key = comparePoWithQuotation(d1, f.projectId).rows.find((r) => r.serviceItemId === f.visitsId)!.key
  return { ...f, ds: reviewComparisonRow(d1, f.projectId, key, { resolution: 'accepted', reason: 'OK', date: TODAY }, CTX) }
}

describe('dashboard work queue', () => {
  it('1 & 12. ready rows come from the billing rules: PO-authorised amounts, sub-services, per currency', () => {
    const { ds, projectId } = authorized()
    const rows = rowsOf(ds, projectId)
    expect(rows.map((r) => [r.state, r.concept, r.amounts])).toEqual([
      ['ready', 'Housing', { USD: 4800 }],
      ['ready', 'Schooling', { USD: 2400 }],
    ])
    expect(rows[0].items).toContain('Visitas extra fin de semana')
    expect(rows[0].po).toBe('4500098765')
    // Totals are never added across currencies.
    const all = totalOf(billingQueue(seed(), TODAY).filter((r) => r.state === 'ready'))
    expect(Object.keys(all).sort()).toEqual(['EUR', 'USD'])
  })

  it('2. PO blockers: approved without PO → waiting rows and a PO pending row', () => {
    const { ds, projectId } = setup()
    expect(rowsOf(ds, projectId).every((r) => r.state === 'waiting' && /Falta OC/.test(r.reason))).toBe(true)
    const po = poQueue(ds, TODAY).find((r) => r.projectId === projectId)!
    expect(po).toMatchObject({ kind: 'no-po', status: 'Aprobada sin OC', amounts: { USD: 7500 }, action: { label: 'Registrar o importar OC' } })
  })

  it('3. certificate blockers through the certificate lifecycle', () => {
    const f = authorized()
    let ds = setProjectException(f.ds, f.projectId, { requiresCertificate: true, reason: 'Acuerdo' }, CTX)
    expect(rowsOf(ds, f.projectId).every((r) => r.state === 'certificate')).toBe(true)
    expect(certificateQueue(ds, TODAY).find((r) => r.projectId === f.projectId)).toMatchObject({ kind: 'to-generate' })
    const c = createCertificate(ds, { projectId: f.projectId, lines: [{ serviceId: f.schooling.id, quantity: 1 }] }, 'c1', CTX)
    ds = c.ds
    expect(certificateQueue(ds, TODAY).some((r) => r.key === c.certificateId && r.kind === 'draft')).toBe(true)
    ds = submitCertificate(ds, c.certificateId, { externalNumber: 'CERT-1', date: TODAY }, CTX)
    expect(certificateQueue(ds, TODAY).find((r) => r.key === c.certificateId)?.kind).toBe('submitted')
    ds = approveCertificate(ds, c.certificateId, { date: TODAY }, CTX)
    expect(certificateQueue(ds, TODAY).find((r) => r.key === c.certificateId)).toMatchObject({ kind: 'approved-unbilled', amounts: { USD: 2400 } })
    expect(rowsOf(ds, f.projectId).find((r) => r.concept === 'Schooling')).toMatchObject({ state: 'ready', certificate: 'CERT-1 · aprobado' })
  })

  it('4. imported PO differences: review rows and PO row until resolved', () => {
    const f = setup()
    const { ds } = importPo(f.ds, f.projectId, [
      { service: f.housing, qty: 1, price: 4500 },
      { service: f.housing, serviceItemId: f.visitsId, qty: 1, price: 300 },
      { service: f.schooling, qty: 1, price: 2400 },
    ])
    expect(rowsOf(ds, f.projectId).find((r) => r.concept === 'Housing')).toMatchObject({ state: 'review', action: { href: expect.stringMatching(/comparacion-oc$/) } })
    expect(poQueue(ds, TODAY).find((r) => r.projectId === f.projectId)).toMatchObject({ kind: 'po-review', status: 'Diferencias sin resolver' })
    const key = comparePoWithQuotation(ds, f.projectId).rows.find((r) => r.serviceItemId === f.visitsId)!.key
    const resolved = reviewComparisonRow(ds, f.projectId, key, { resolution: 'accepted', reason: 'OK', date: TODAY }, CTX)
    expect(poQueue(resolved, TODAY).some((r) => r.projectId === f.projectId && r.kind === 'po-review')).toBe(false)
    // The quoted visit the PO does not cover stays visible as approved without PO (existing rule, not hidden).
    expect(poQueue(resolved, TODAY).find((r) => r.projectId === f.projectId)).toMatchObject({ kind: 'no-po', amounts: { USD: 300 } })
  })

  it('5 & 6. prepared drafts reserve their amount (no double count); partial billing keeps the rest pending', () => {
    const { ds: d0, projectId, housing } = authorized()
    const before = totalOf(rowsOf(d0, projectId).filter((r) => r.state === 'ready'))
    const lines = suggestInvoiceLines(d0, projectId, 'USD', TODAY).filter((l) => l.serviceId === housing.id)
    const r = createInvoiceDraft(d0, draft(projectId, lines), 'inv-d', CTX)
    const rows = rowsOf(r.ds, projectId)
    expect(rows.map((x) => x.state)).toEqual(['ready', 'draft'])
    expect({ ...totalOf(rows.filter((x) => x.state === 'ready')) }).toEqual({ USD: 2400 })
    expect(totalOf(rows.filter((x) => x.state !== 'ready'))).toEqual({ USD: 4800 })
    expect(before).toEqual({ USD: 7200 })
    // Issued: the draft row disappears, schooling stays ready while the project is not finished.
    const issued = confirmInvoiceEmission(r.ds, r.invoiceId, { voucherType: 'A', pointOfSale: '1', number: '77', issueDate: TODAY, total: 4800, currency: 'USD' }, CTX)
    expect(rowsOf(issued, projectId).map((x) => [x.state, x.concept])).toEqual([['ready', 'Schooling']])
  })

  it('7 & 8. open POs and clients without PO never produce artificial PO pendings', () => {
    const ds = seed()
    const pos = poQueue(ds, TODAY)
    const projectOf = (id: string) => ds.projects.find((p) => p.id === id)!
    expect(pos.some((r) => projectOf(r.projectId).openOrderId)).toBe(false)
    const noPoClients = new Set(ds.clients.filter((c) => !c.policy.requiresPurchaseOrder).map((c) => c.id))
    expect(pos.some((r) => noPoClients.has(projectOf(r.projectId).clientId))).toBe(false)
    expect(billingQueue(ds, TODAY).filter((r) => noPoClients.has(projectOf(r.projectId).clientId)).some((r) => /Falta OC/.test(r.reason))).toBe(false)
  })

  it('9 & 10. operations: projects needing attention and pending initial documentation', () => {
    let ds = seed()
    const attention = projectsNeedingAttention(ds, TODAY)
    expect(attention.length).toBeGreaterThan(0)
    expect(attention.every((a) => a.reasons.every((r) => r.href.includes('?tab=')))).toBe(true)
    ds = createTemplate(ds, { name: 'Ficha', serviceTypeIds: ['housing'], active: true }, { attachmentId: 'att_f', fileName: 'Ficha.xlsx', mime: XLSX_MIME, size: 100 }, 't1', CTX).ds
    const p = createProject(ds, projectInput({ initialTemplateIds: [ds.documentTemplates[0].id] }), 'p1', CTX)
    expect(pendingInitialDocs(p.ds, TODAY).find((d) => d.projectId === p.projectId)).toMatchObject({ stage: 'pending-send', step: 'Enviar al beneficiario.', href: expect.stringMatching(/tab=documentos$/) })
  })

  it('11 & 13. every row links somewhere; cancelled projects are excluded', () => {
    const ds = seed()
    const q = workQueue(ds, TODAY)
    for (const r of [...q.billing, ...q.pos, ...q.certificates]) expect(r.action.href).toMatch(/^\//)
    const cancelled = new Set(ds.projects.filter((p) => p.operationalStatus === 'cancelled').map((p) => p.id))
    expect([...q.billing, ...q.pos, ...q.certificates].some((r) => cancelled.has(r.projectId))).toBe(false)
  })
})
