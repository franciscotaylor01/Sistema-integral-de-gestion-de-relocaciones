import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { batchDifferences, batchFinancials, batchSummaryText, cancelBatch, confirmBatch, createBatch, sharedExpenseInfo, type BatchInput } from '@/domain/finance/batches'
import { closeProjectCosts } from '@/domain/finance/costControl'
import { recordCost, type CostInput } from '@/domain/finance/costs'
import { recordExchangeRate } from '@/domain/finance/fx'
import { addFiscalAdjustment, createSettlement, settlementFinancials } from '@/domain/finance/settlements'
import { advanceInfo, recordSupplierPayment } from '@/domain/finance/supplierPayments'
import { readDataset, type StorageLike } from '@/services/local/storage'
import { fieldsOf, seed, testContext } from './helpers'

const TODAY = '2026-10-19'
const F = 'sup_florencia'
const fin = (ds: Dataset, id: string) => settlementFinancials(ds, ds.settlements.find((s) => s.id === id)!, TODAY)

function withShared(ds: Dataset, amount = 1000, partnerPct = 30, ownerPct = 70, description = 'Estudio contable Cris') {
  const input: CostInput = { scope: 'company', category: 'general-expense', description, currency: 'USD', amount, date: '2026-10-01', overheadCategory: 'Servicios profesionales', sharing: { partnerSupplierId: F, partnerPct, ownerPct, reference: 'Factura Cris 0001' } }
  let n = 0
  return recordCost(ds, input, { ...testContext(), newId: (prefix: string) => `${prefix}_${description.replace(/\W/g, '')}_${++n}` })
}
const batch = (o: Partial<BatchInput> = {}): BatchInput => ({
  supplierId: F,
  currency: 'USD',
  date: TODAY,
  lines: [
    { settlementId: 'set_0143', amount: 1000 },
    { settlementId: 'set_0152', amount: 1000 },
  ],
  deductions: [],
  rates: [{ from: 'EUR', rate: '1.087', date: TODAY, source: 'Cotización acordada por email (demo)' }],
  adjustments: [],
  ...o,
})

describe('participation per project (35%) and base', () => {
  it('applies the preliminary 35% where no explicit rule exists; explicit rules are kept', () => {
    const ctx = testContext()
    let ds = seed()
    ds = createSettlement(ds, { projectId: 'prj_0149', supplierId: F, currency: 'USD', release: 'after-collection' }, 'n1', ctx).ds
    const s = ds.settlements.at(-1)!
    const f = fin(ds, s.id)
    expect(f.pctLabel).toBe('35% (regla preliminar)')
    expect(f.partnerShare).toBe(Math.round(f.base * 35) / 100)
    expect(fin(ds, 'set_0143')).toMatchObject({ pctLabel: '20%', partnerShare: 3240 }) // historical explicit rule untouched
  })

  it('withholdings on collections are not costs; partner invoices are not deducted twice', () => {
    const ctx = testContext()
    let ds = seed()
    const pv = ds.projects.filter((p) => p.openOrderId === 'oca_pv_nqn').sort((a, b) => a.code.localeCompare(b.code))[0]
    ds = createSettlement(ds, { projectId: pv.id, supplierId: F, currency: 'ARS', release: 'after-collection' }, 'pv', ctx).ds
    const f = fin(ds, ds.settlements.at(-1)!.id)
    expect(f.netRevenue).toBe(1890000) // commercial net; the 290.000 of withholdings are not subtracted
    expect(f.base).toBe(f.netRevenue - f.directCosts)
    expect(fin(seed(), 'set_0139').directCosts).toBe(0) // linked partner invoice = participation, not cost
  })

  it('documented fiscal adjustments reduce the base; never computed from assumed rates', () => {
    const ctx = testContext()
    let ds = seed()
    expect(fieldsOf(() => addFiscalAdjustment(ds, 'set_0152', { date: TODAY, concept: 'IIBB s/ DDJJ', amount: 200, reason: '' }, ctx))).toHaveProperty('reason')
    ds = addFiscalAdjustment(ds, 'set_0152', { date: TODAY, concept: 'IIBB s/ DDJJ', amount: 200, reference: 'DDJJ 09/2026', reason: 'Según liquidación del contador' }, ctx)
    expect(fin(ds, 'set_0152')).toMatchObject({ fiscalAdjustments: 200, base: 9600, partnerShare: 3360 })
  })
})

describe('shared general expenses', () => {
  it('per-record split (30/70 and others) validated to 100%; non-shared expenses never deduct', () => {
    const ds = seed()
    const a = withShared(ds)
    expect(sharedExpenseInfo(a.ds, a.ds.costs.find((c) => c.id === a.costId)!)).toEqual({ partnerPart: 300, deducted: 0, offset: 0, pending: 300 })
    const b = withShared(a.ds, 200, 50, 50, 'Hosting')
    expect(sharedExpenseInfo(b.ds, b.ds.costs.find((c) => c.id === b.costId)!)!.partnerPart).toBe(100)
    expect(fieldsOf(() => withShared(ds, 100, 30, 60))).toHaveProperty(['sharing.ownerPct'])
    const plain = ds.costs.find((c) => c.id === 'cost_gen_02')!
    expect(sharedExpenseInfo(ds, plain)).toBeUndefined()
    expect(fieldsOf(() => createBatch(ds, batch({ deductions: [{ costId: plain.id, amount: 10 }] }), 'x', testContext()))).toHaveProperty(['deductions.0.amount'])
  })
})

describe('grouped settlement', () => {
  function prepared(ack = true) {
    const ctx = testContext()
    const s = withShared(seed())
    let ds = s.ds
    const r = createBatch(ds, batch({ deductions: [{ costId: s.costId, amount: 300 }] }), 'b1', ctx)
    ds = confirmBatch(r.ds, r.batchId, { acknowledgeOpenCosts: ack }, ctx)
    return { ds, id: r.batchId, costId: s.costId, ctx }
  }

  it('multi-project selection, documented conversion and net with deductions', () => {
    const { ds, id } = prepared()
    const b = ds.settlementBatches.find((x) => x.id === id)!
    expect(b.lines.map((l) => [l.currency, l.amount, l.converted])).toEqual([
      ['USD', 1000, 1000],
      ['EUR', 1000, 1087],
    ])
    expect(b.lines[1].fx).toEqual({ from: 'EUR', to: 'USD', rate: '1.087', date: TODAY, source: 'Cotización acordada por email (demo)' })
    expect(batchFinancials(ds, b)).toMatchObject({ gross: 2087, deductions: 300, net: 1787, paid: 0, status: 'confirmed' })
    // Deductions stay independent: nothing is offset against a particular project.
    expect(b.allocationMode).toBe('pro-rata')
    expect(b.compensation).toEqual([])
    expect(batchSummaryText(ds, b)).toMatch(/Neto liquidado: USD 1787.00/)
    expect(batchSummaryText(ds, b)).toMatch(/30% Florencia \/ 70% Eugenia/)
  })

  it('requires conversion data for foreign currencies; later rates do not change the batch', () => {
    const ctx = testContext()
    const ds = seed()
    expect(fieldsOf(() => createBatch(ds, batch({ rates: [] }), 'r0', ctx))).toHaveProperty(['rates.EUR.rate'])
    expect(fieldsOf(() => createBatch(ds, batch({ rates: [{ from: 'EUR', rate: '1.087', date: TODAY, source: ' ' }] }), 'r1', ctx))).toHaveProperty(['rates.EUR.source'])
    const p = prepared()
    const later = recordExchangeRate(p.ds, { base: 'EUR', quote: 'USD', rate: '1.2', effectiveDate: TODAY, source: 'x' }, ctx).ds
    expect(later.settlementBatches.find((x) => x.id === p.id)!.lines[1].converted).toBe(1087)
  })

  it('open costs need explicit acknowledgement; the snapshot is kept and differences are only shown', () => {
    const ctx = testContext()
    const s = withShared(seed())
    const r = createBatch(s.ds, batch(), 'b2', ctx)
    expect(fieldsOf(() => confirmBatch(r.ds, r.batchId, { acknowledgeOpenCosts: false }, ctx))).toHaveProperty('acknowledgeOpenCosts')
    let ds = confirmBatch(r.ds, r.batchId, { acknowledgeOpenCosts: true }, ctx)
    const snap = ds.settlementBatches.find((x) => x.id === r.batchId)!.lines[0].snapshot!
    expect(snap).toMatchObject({ partnerShare: 3240, costsClosed: false })
    ds = recordCost(ds, { scope: 'project', projectId: 'prj_0143', category: 'other-direct', description: 'Costo tardío', currency: 'USD', amount: 500, date: TODAY }, ctx).ds
    const b = ds.settlementBatches.find((x) => x.id === r.batchId)!
    expect(b.lines[0].snapshot!.partnerShare).toBe(3240)
    expect(batchDifferences(ds, b, TODAY)).toEqual([{ lineId: b.lines[0].id, snapshotShare: 3240, currentShare: 3140, difference: -100 }])
    expect(ds.supplierPayments.filter((p) => p.batchAllocations?.length)).toHaveLength(0) // no automatic payments
    // With costs closed, no acknowledgement is needed.
    let closed = closeProjectCosts(closeProjectCosts(seed(), 'prj_0143', '', ctx), 'prj_0152', '', ctx)
    const r2 = createBatch(closed, batch(), 'b3', ctx)
    closed = confirmBatch(r2.ds, r2.batchId, { acknowledgeOpenCosts: false }, ctx)
    expect(closed.settlementBatches.at(-1)!.status).toBe('confirmed')
  })

  it('committed balances and deductions cannot be used twice; partial deduction leaves the rest pending', () => {
    const { ds, costId, ctx } = prepared()
    expect(fin(ds, 'set_0143')).toMatchObject({ committed: 1000, batchSettled: 0 }) // the project's share is not reduced by shared expenses
    expect(fieldsOf(() => createBatch(ds, batch({ lines: [{ settlementId: 'set_0143', amount: 2241 }], rates: [] }), 'b4', ctx))).toHaveProperty(['lines.0.amount']) // 3240 − 1000 committed
    expect(fieldsOf(() => createBatch(ds, batch({ deductions: [{ costId, amount: 1 }] }), 'b5', ctx))).toHaveProperty(['deductions.0.amount'])
    const s2 = withShared(ds, 2000, 40, 60, 'Asesoría legal')
    const r = createBatch(s2.ds, batch({ lines: [{ settlementId: 'set_0143', amount: 500 }], rates: [], deductions: [{ costId: s2.costId, amount: 500 }] }), 'b6', ctx)
    const ds2 = confirmBatch(r.ds, r.batchId, { acknowledgeOpenCosts: true }, ctx)
    expect(sharedExpenseInfo(ds2, ds2.costs.find((c) => c.id === s2.costId)!)).toEqual({ partnerPart: 800, deducted: 500, offset: 0, pending: 300 })
    expect(fieldsOf(() => createBatch(s2.ds, batch({ lines: [{ settlementId: 'set_0143', amount: 100 }], rates: [], deductions: [{ costId: s2.costId, amount: 800 }] }), 'b7', ctx))).toHaveProperty('deductions')
  })

  it('partial payment splits pro rata over participations and deductions; full payment closes everything exactly', () => {
    const init = prepared()
    const { id, ctx, costId } = init
    let ds = init.ds
    const b = ds.settlementBatches.find((x) => x.id === id)!
    const pay = (amount: number, ref: string) => recordSupplierPayment(ds, { supplierId: F, date: TODAY, currency: 'USD', amount, method: 'transfer', reference: ref, allocations: [], batchId: id }, ref, ctx)
    expect(fieldsOf(() => pay(1787.01, 'P0'))).toHaveProperty('amount')
    const p1 = pay(700, 'P1')
    ds = p1.ds
    const pm = ds.supplierPayments.find((x) => x.id === p1.paymentId)!
    // 700 / 1787 of each item; Σ participations − Σ deductions = cash paid.
    expect(pm.batchAllocations!.map((a) => [a.amount, a.originalAmount, a.originalCurrency])).toEqual([
      [391.72, 391.72, 'USD'],
      [425.8, 391.72, 'EUR'],
    ])
    expect(pm.batchDeductions!.map((d) => [d.costId, d.amount])).toEqual([[costId, 117.52]])
    expect(391.72 + 425.8 - 117.52).toBeCloseTo(700, 2)
    expect(advanceInfo(pm)).toBeUndefined() // fully explained: not an advance, not a cost
    expect(batchFinancials(ds, b)).toMatchObject({ paid: 700, outstanding: 1087, status: 'partially-paid' })
    expect(fin(ds, 'set_0143')).toMatchObject({ batchSettled: 391.72, committed: 608.28 })
    expect(fin(ds, 'set_0152')).toMatchObject({ batchSettled: 391.72, committed: 608.28 })
    expect(sharedExpenseInfo(ds, ds.costs.find((c) => c.id === costId)!)).toMatchObject({ deducted: 300, offset: 117.52, pending: 0 })
    // Idempotent resubmission does not pay twice.
    expect(recordSupplierPayment(ds, { supplierId: F, date: TODAY, currency: 'USD', amount: 700, method: 'transfer', reference: 'P1', allocations: [], batchId: id }, 'P1', ctx).duplicate).toBe(true)
    expect(fieldsOf(() => recordSupplierPayment(ds, { supplierId: F, date: TODAY, currency: 'EUR', amount: 10, method: 'transfer', allocations: [], batchId: id }, 'pe', ctx))).toHaveProperty('currency')
    ds = pay(1087, 'P2').ds
    expect(batchFinancials(ds, b)).toMatchObject({ paid: 1787, outstanding: 0, status: 'paid' })
    expect(fin(ds, 'set_0143')).toMatchObject({ batchSettled: 1000, committed: 0 }) // full share, not reduced by the shared expense
    expect(fin(ds, 'set_0152')).toMatchObject({ batchSettled: 1000, committed: 0 }) // exact in EUR, no residue
    expect(sharedExpenseInfo(ds, ds.costs.find((c) => c.id === costId)!)).toMatchObject({ deducted: 300, offset: 300, pending: 0 })
    expect(() => cancelBatch(ds, id, 'error', ctx)).toThrow(/pagos registrados/)
    // History identifies the participation paid and the expense deducted by each payment.
    const h = ds.settlementBatches.find((x) => x.id === id)!.history
    expect(h[1].detail).toMatch(/participación REL-2026-0143 USD 391.72 · participación REL-2026-0152 USD 425.8 · deducción «Estudio contable Cris» −USD 117.52/)
  })

  it('several partial payments reconcile to the cent; a reversed payment frees its parts again', async () => {
    const { reverseSupplierPayment } = await import('@/domain/finance/supplierPayments')
    const init = prepared()
    const { id, ctx } = init
    let ds = init.ds
    const pay = (amount: number, ref: string) => recordSupplierPayment(ds, { supplierId: F, date: TODAY, currency: 'USD', amount, method: 'transfer', reference: ref, allocations: [], batchId: id }, ref, ctx)
    for (const [i, v] of [333.33, 333.33, 333.33].entries()) ds = pay(v, `R${i}`).ds
    const last = pay(787.01, 'R3')
    ds = last.ds
    const b = ds.settlementBatches.find((x) => x.id === id)!
    expect(batchFinancials(ds, b).outstanding).toBe(0)
    expect(fin(ds, 'set_0143').batchSettled).toBe(1000)
    expect(fin(ds, 'set_0152').batchSettled).toBe(1000)
    ds = reverseSupplierPayment(ds, last.paymentId, 'Transferencia rechazada', ctx)
    expect(batchFinancials(ds, b)).toMatchObject({ paid: 999.99, outstanding: 787.01, status: 'partially-paid' })
    expect(fin(ds, 'set_0143').committed + fin(ds, 'set_0143').batchSettled).toBe(1000)
  })

  it('legacy "ordered" batches keep their recorded compensation and line payments', () => {
    const init = prepared()
    const { id, ctx } = init
    // A batch confirmed before the change: compensation against the first line, as recorded.
    let ds: Dataset = { ...init.ds, settlementBatches: init.ds.settlementBatches.map((b) => (b.id === id ? { ...b, allocationMode: 'ordered' as const, compensation: [{ lineId: b.lines[0].id, amount: 300 }] } : b)) }
    const b = ds.settlementBatches.find((x) => x.id === id)!
    expect(fin(ds, 'set_0143')).toMatchObject({ batchSettled: 300, committed: 700 })
    expect(fieldsOf(() => recordSupplierPayment(ds, { supplierId: F, date: TODAY, currency: 'USD', amount: 100, method: 'transfer', allocations: [], batchId: id }, 'x', ctx))).toHaveProperty('batchId')
    ds = recordSupplierPayment(ds, { supplierId: F, date: TODAY, currency: 'USD', amount: 700, method: 'transfer', allocations: [], batchAllocations: [{ batchId: id, lineId: b.lines[0].id, amount: 700 }] }, 'legacy', ctx).ds
    expect(batchFinancials(ds, b)).toMatchObject({ paid: 700, status: 'partially-paid' })
    expect(fin(ds, 'set_0143')).toMatchObject({ batchSettled: 1000, committed: 0 })
  })

  it('a batch without payments can be released, freeing its commitments; history is kept', () => {
    const { ds, id, ctx, costId } = prepared()
    const next = cancelBatch(ds, id, 'Imputación incorrecta', ctx)
    const b = next.settlementBatches.find((x) => x.id === id)!
    expect(b.status).toBe('cancelled')
    expect(b.history.map((h) => h.action)).toEqual(['Liquidación liberada', 'Liquidación confirmada', 'Borrador creado'])
    expect(fin(next, 'set_0143').committed).toBe(0)
    expect(sharedExpenseInfo(next, next.costs.find((c) => c.id === costId)!)!.pending).toBe(300)
  })

  it('v8 → v9 migration keeps every record and generates nothing', () => {
    const v9 = seed()
    const { settlementBatches: _b, ...data } = v9
    const mem: Record<string, string> = { 'sigr.demo.dataset': JSON.stringify({ schemaVersion: 8, savedAt: 'x', data: { ...data, schemaVersion: 8 } }) }
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    const { dataset, issue } = readDataset(storage)
    expect(issue).toBe('migrated')
    expect(dataset!.schemaVersion).toBe(15)
    expect(dataset!.settlementBatches).toEqual([])
    expect(dataset!.settlements).toEqual(v9.settlements)
    expect(dataset!.supplierPayments).toEqual(v9.supplierPayments)
  })
})

describe('v9 → v10 migration', () => {
  it('confirmed batches stay "ordered" untouched; drafts adopt pro-rata', () => {
    const ctx = testContext()
    const s = withShared(seed())
    const r1 = createBatch(s.ds, batch({ deductions: [{ costId: s.costId, amount: 300 }] }), 'm1', ctx)
    let ds = confirmBatch(r1.ds, r1.batchId, { acknowledgeOpenCosts: true }, ctx)
    ds = createBatch(ds, batch({ lines: [{ settlementId: 'set_0143', amount: 100 }], rates: [] }), 'm2', ctx).ds
    // Simulate v9 records (no allocationMode; the confirmed one had an ordered compensation).
    const v9 = { ...ds, schemaVersion: 9, settlementBatches: ds.settlementBatches.map(({ allocationMode: _m, ...b }) => (b.status === 'confirmed' ? { ...b, compensation: [{ lineId: b.lines[0].id, amount: 300 }] } : b)) }
    const mem: Record<string, string> = { 'sigr.demo.dataset': JSON.stringify({ schemaVersion: 9, savedAt: 'x', data: v9 }) }
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    const out = readDataset(storage).dataset!
    expect(out.schemaVersion).toBe(15)
    const [confirmed, draft] = out.settlementBatches
    expect(confirmed).toMatchObject({ allocationMode: 'ordered', compensation: [{ amount: 300 }] })
    expect(draft.allocationMode).toBe('pro-rata')
    expect(fin(out, 'set_0143')).toMatchObject({ batchSettled: 300, committed: 700 }) // historical meaning preserved
  })
})
