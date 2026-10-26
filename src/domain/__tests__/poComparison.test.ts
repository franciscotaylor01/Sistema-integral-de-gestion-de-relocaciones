import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { certifiableUnits } from '@/domain/commercial/certificates'
import { setProjectException } from '@/domain/commercial/catalog'
import { comparePoWithQuotation, comparisonGate, reviewComparisonRow, reviewHistory, type ComparisonRow } from '@/domain/commercial/poComparison'
import { createPurchaseOrder } from '@/domain/commercial/purchaseOrders'
import { projectCommercial } from '@/domain/commercial/traceability'
import { suggestInvoiceLines } from '@/domain/finance/invoices'
import { migrateDataset } from '@/services/local/migrations'
import { readDataset, writeDataset, type StorageLike } from '@/services/local/storage'
import { fieldsOf, seed, testContext } from './helpers'
import { importPo, setup } from './commercialFixtures'

const rowsOf = (ds: Dataset, projectId: string) => comparePoWithQuotation(ds, projectId).rows
const byLabel = (rows: ComparisonRow[], label: string) => rows.find((r) => r.label === label)!
const project = (ds: Dataset, id: string) => ds.projects.find((p) => p.id === id)!

describe('PO vs quotation comparison', () => {
  it('1. identical PO: every row matches, nothing is blocked', () => {
    const { ds: d0, projectId, housing, schooling, visitsId } = setup()
    const { ds } = importPo(d0, projectId, [
      { service: housing, qty: 1, price: 4500 },
      { service: housing, serviceItemId: visitsId, qty: 2, price: 300 },
      { service: schooling, qty: 1, price: 2400 },
    ])
    const rows = rowsOf(ds, projectId)
    expect(rows.map((r) => [r.label, r.status])).toEqual([
      ['Housing', 'match'],
      ['Housing — Visitas extra fin de semana', 'match'],
      ['Schooling', 'match'],
      ['Total USD', 'match'],
    ])
    expect(comparisonGate(ds, projectId).blocked.size).toBe(0)
    const c = projectCommercial(ds, project(ds, projectId), '2026-10-19')
    expect(c.get(housing.id)!.eligibility.missing.join(' ')).not.toMatch(/OC vs\. cotización/)
  })

  it('2 & 6. PO missing a quoted service / partial quantities: not authorised and differences', () => {
    const { ds: d0, projectId, housing, schooling, visitsId } = setup()
    const { ds } = importPo(d0, projectId, [
      { service: housing, qty: 1, price: 4500 },
      { service: housing, serviceItemId: visitsId, qty: 1, price: 300 },
    ])
    const rows = rowsOf(ds, projectId)
    expect(byLabel(rows, 'Schooling')).toMatchObject({ status: 'not-authorized', differences: ['missing-in-po'] })
    expect(byLabel(rows, 'Housing — Visitas extra fin de semana')).toMatchObject({ status: 'difference', differences: ['qty-lower'] })
    expect(byLabel(rows, 'Total USD')).toMatchObject({ status: 'difference', differences: ['amount-lower'] })
    const gate = comparisonGate(ds, projectId)
    expect(gate.blocked.get(housing.id)).toMatch(/pendiente de revisión/)
    expect(gate.blocked.has(schooling.id)).toBe(false) // no PO amount: already "Falta OC"
    expect(projectCommercial(ds, project(ds, projectId), '2026-10-19').get(schooling.id)!.eligibility.missing).toContain('Falta OC del cliente')
  })

  it('3. item in the PO that was not quoted needs explicit review with evidence', () => {
    const { ds: d0, projectId, housing, visitsId } = setup({ specialAfterQuote: true })
    const { ds } = importPo(d0, projectId, [
      { service: housing, qty: 1, price: 4200 },
      { service: housing, serviceItemId: visitsId, qty: 1, price: 300 },
    ])
    const rows = rowsOf(ds, projectId)
    const extra = byLabel(rows, 'Housing — Visitas extra fin de semana')
    expect(extra).toMatchObject({ status: 'review', differences: ['not-quoted'] })
    expect(byLabel(rows, 'Housing')).toMatchObject({ differences: ['price-lower'] })
    const ctx = testContext()
    expect(fieldsOf(() => reviewComparisonRow(ds, projectId, extra.key, { resolution: 'accepted', reason: 'Pedido del cliente', date: '2026-10-19' }, ctx))).toHaveProperty('evidence')
  })

  it('4. price and quantity differences: lower is a difference, higher needs review', () => {
    const { ds: d0, projectId, housing, schooling, visitsId } = setup()
    const { ds } = importPo(d0, projectId, [
      { service: housing, qty: 1, price: 3900 },
      { service: housing, serviceItemId: visitsId, qty: 3, price: 300 },
      { service: schooling, qty: 1, price: 2400 },
    ])
    const rows = rowsOf(ds, projectId)
    expect(byLabel(rows, 'Housing')).toMatchObject({ status: 'difference', differences: ['price-lower'] })
    expect(byLabel(rows, 'Housing — Visitas extra fin de semana')).toMatchObject({ status: 'review', differences: ['qty-higher'] })
  })

  it('5. currency differences are reported, never converted', () => {
    const { ds: d0, projectId, housing, schooling, visitsId } = setup()
    const { ds: d1, poId } = importPo(d0, projectId, [
      { service: housing, qty: 1, price: 4500 },
      { service: housing, serviceItemId: visitsId, qty: 2, price: 300 },
      { service: schooling, qty: 1, price: 2400 },
    ])
    // Simulates a PO stated in EUR (e.g. registered under a documented exception): the comparison must flag it.
    const ds: Dataset = { ...d1, purchaseOrders: d1.purchaseOrders.map((p) => (p.id === poId ? { ...p, currency: 'EUR' } : p)) }
    const rows = rowsOf(ds, projectId)
    expect(byLabel(rows, 'Schooling')).toMatchObject({ status: 'review', differences: ['currency'], quote: { currency: 'USD', amount: 2400 }, po: { currency: 'EUR', amount: 2400 } })
    expect(rows.filter((r) => r.kind === 'total').map((r) => [r.label, r.differences])).toEqual([
      ['Total USD', ['missing-in-po']],
      ['Total EUR', ['currency']],
    ])
  })

  it('7. decisions: accept with evidence, documented exception, correction keeps history; exception policy skips comparison', () => {
    const { ds: d0, projectId, housing, visitsId } = setup()
    const { ds: d1 } = importPo(d0, projectId, [
      { service: housing, qty: 1, price: 4500 },
      { service: housing, serviceItemId: visitsId, qty: 1, price: 300 },
    ])
    const ctx = testContext()
    const row = byLabel(rowsOf(d1, projectId), 'Housing — Visitas extra fin de semana')
    let ds = reviewComparisonRow(d1, projectId, row.key, { resolution: 'accepted', reason: 'El cliente autoriza 1 visita', date: '2026-10-19', reference: 'Email compras 19/10' }, ctx)
    expect(byLabel(rowsOf(ds, projectId), row.label).review).toMatchObject({ resolution: 'accepted', reference: 'Email compras 19/10' })
    expect(comparisonGate(ds, projectId).blocked.has(housing.id)).toBe(false)
    // Later correction: previous decision kept and superseded.
    ds = reviewComparisonRow(ds, projectId, row.key, { resolution: 'exception', reason: 'Excepción aprobada por Dirección', evidence: 'Acta 12/2026', date: '2026-10-19' }, ctx)
    const hist = reviewHistory(ds, projectId, row.key)
    expect(hist.map((h) => [h.resolution, Boolean(h.supersededById)])).toEqual([
      ['exception', false],
      ['accepted', true],
    ])
    expect(hist[1].snapshot).toMatchObject({ status: 'difference', differences: ['Cantidad autorizada inferior'] })
    expect(ds.activity[0].message).toMatch(/corrige una resolución anterior/)
    // A documented project exception without PO: no comparison, no gate.
    const ex = setProjectException(ds, projectId, { poMode: 'none', reason: 'Proyecto piloto sin OC' }, ctx)
    expect(comparePoWithQuotation(ex, projectId)).toMatchObject({ applicable: false, reason: expect.stringMatching(/Excepción comercial/) })
    expect(comparisonGate(ex, projectId).blocked.size).toBe(0)
  })

  it('8. unauthorised concepts are not billable: pending blocks the service, rejected special item excluded', () => {
    const { ds: d0, projectId, housing, schooling, visitsId } = setup()
    const { ds: d1 } = importPo(d0, projectId, [
      { service: housing, qty: 1, price: 4500 },
      { service: housing, serviceItemId: visitsId, qty: 1, price: 300 },
      { service: schooling, qty: 1, price: 2400 },
    ])
    const p = project(d1, projectId)
    expect(projectCommercial(d1, p, '2026-10-19').get(housing.id)!.eligibility).toMatchObject({ eligible: false, missing: expect.arrayContaining([expect.stringMatching(/pendiente de revisión/)]) })
    expect(suggestInvoiceLines(d1, projectId, 'USD', '2026-10-19').some((l) => l.serviceId === housing.id)).toBe(false)
    expect(suggestInvoiceLines(d1, projectId, 'USD', '2026-10-19').some((l) => l.serviceId === schooling.id)).toBe(true)
    // Rejecting the special line: the service becomes billable without it.
    const row = byLabel(rowsOf(d1, projectId), 'Housing — Visitas extra fin de semana')
    const ds = reviewComparisonRow(d1, projectId, row.key, { resolution: 'rejected', reason: 'La OC no cubre la visita extra', date: '2026-10-19' }, testContext())
    expect(comparisonGate(ds, projectId).excludedItems.has(visitsId!)).toBe(true)
    expect(certifiableUnits(ds, projectId).some((u) => u.serviceItemId === visitsId)).toBe(false)
    expect(projectCommercial(ds, project(ds, projectId), '2026-10-19').get(housing.id)!.eligibility.missing.join(' ')).not.toMatch(/OC vs\./)
  })

  it('9. open POs: no per-project comparison and no regression', () => {
    const ds = seed()
    const pv = ds.projects.find((p) => p.openOrderId === 'oca_pv_nqn')!
    expect(comparePoWithQuotation(ds, pv.id)).toMatchObject({ applicable: false, reason: expect.stringMatching(/OC abierta/) })
    expect(comparisonGate(ds, pv.id).blocked.size).toBe(0)
    // Manual POs keep the previous behaviour.
    const manual = ds.purchaseOrders.find((p) => p.status === 'active')!
    expect(comparePoWithQuotation(ds, manual.projectId).applicable).toBe(false)
  })

  it('10. stale decisions when the PO changes; persistence and migration', () => {
    const { ds: d0, projectId, housing, visitsId } = setup()
    const { ds: d1, poId } = importPo(d0, projectId, [
      { service: housing, qty: 1, price: 4500 },
      { service: housing, serviceItemId: visitsId, qty: 1, price: 300 },
    ])
    const row = byLabel(rowsOf(d1, projectId), 'Housing — Visitas extra fin de semana')
    const ds = reviewComparisonRow(d1, projectId, row.key, { resolution: 'accepted', reason: 'OK', date: '2026-10-19' }, testContext())
    // The PO allocations are edited by hand afterwards: the decision no longer applies.
    const edited: Dataset = { ...ds, purchaseOrders: ds.purchaseOrders.map((p) => (p.id === poId ? { ...p, allocations: p.allocations.map((a) => ({ ...a, amount: a.amount - 100 })) } : p)) }
    const after = byLabel(rowsOf(edited, projectId), row.label)
    expect(after.differences).toContain('po-edited')
    expect(after.review).toBeUndefined()
    expect(after.staleReview?.resolution).toBe('accepted')

    const mem: Record<string, string> = {}
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    writeDataset(storage, ds, 'now')
    expect(readDataset(storage).dataset!.poReviews).toEqual(ds.poReviews)
    const { poReviews, ...v14 } = { ...seed(), schemaVersion: 14 }
    expect(poReviews).toEqual([])
    expect(migrateDataset(v14, 14, 15)).toMatchObject({ schemaVersion: 15, poReviews: [] })
  })

  it('11. manual POs coexist: their services stay out of the item comparison', () => {
    const { ctx, ds: d0, projectId, housing, schooling, visitsId, quotation } = setup()
    const manual = createPurchaseOrder(d0, { projectId, clientPoNumber: 'MAN-1', quotationId: quotation.id, issueDate: '2026-10-10', receivedDate: '2026-10-10', currency: 'USD', authorizedAmount: 2400, allocations: [{ serviceId: schooling.id, amount: 2400 }] }, 'man-1', ctx).ds
    const { ds } = importPo(manual, projectId, [
      { service: housing, qty: 1, price: 4500 },
      { service: housing, serviceItemId: visitsId, qty: 2, price: 300 },
    ], { quotation: quotation.number })
    const c = comparePoWithQuotation(ds, projectId)
    expect(c.manualPurchaseOrders.map((p) => p.clientPoNumber)).toEqual(['MAN-1'])
    expect(c.rows.map((r) => [r.label, r.status])).toEqual([
      ['Housing', 'match'],
      ['Housing — Visitas extra fin de semana', 'match'],
      ['Total USD', 'match'],
    ])
    expect(comparisonGate(ds, projectId).blocked.size).toBe(0)
  })
})
