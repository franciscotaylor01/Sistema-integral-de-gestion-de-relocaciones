import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { closeProjectCosts, projectCostControl, reopenProjectCosts } from '@/domain/finance/costControl'
import { markOverheadPaid, recordCost, type CostInput } from '@/domain/finance/costs'
import { obligationFinancials } from '@/domain/finance/derive'
import { createObligation, type ObligationInput } from '@/domain/finance/obligations'
import { projectResults } from '@/domain/finance/results'
import { settlementFinancials } from '@/domain/finance/settlements'
import { advanceInfo, applySupplierAdvance, possibleDuplicatePayments, recordSupplierPayment, revertAdvanceApplication, type SupplierPaymentInput } from '@/domain/finance/supplierPayments'
import { createSupplier } from '@/domain/finance/suppliers'
import { overheadSummary, paymentsForProject, projectRef, sortSuppliersNewestFirst } from '@/domain/finance/supplierViews'
import { readDataset, type StorageLike } from '@/services/local/storage'
import { fieldsOf, seed, testContext } from './helpers'

const TODAY = '2026-10-19'
const P = 'prj_0161' // USD project
const S = 'sup_florencia'
const ob = (ds: Dataset, id: string) => obligationFinancials(ds, ds.obligations.find((o) => o.id === id)!, TODAY)

function withHousing(ds: Dataset = seed(), amount = 1500, projectId = P): { ds: Dataset; obligationId: string } {
  const input: ObligationInput = { supplierId: S, reference: `HOU-${projectId}-${amount}`, projectId, category: 'supplier-fee', description: 'Housing', issueDate: TODAY, dueDate: '2026-11-19', currency: 'USD', amount, paymentCondition: 'due-date', approve: true }
  let n = 0
  const ctx = { ...testContext(), newId: (prefix: string) => `${prefix}_${projectId}_${amount}_${++n}` }
  return createObligation(ds, input, `ob-${projectId}-${amount}`, ctx)
}
const pay = (o: Partial<SupplierPaymentInput>): SupplierPaymentInput => ({ supplierId: S, date: TODAY, currency: 'USD', amount: 0, method: 'transfer', reference: '', notes: '', allocations: [], ...o })

describe('suppliers list and unified payments', () => {
  it('new suppliers come first, with a stable tie-break', () => {
    const ctx = testContext()
    const ds = createSupplier(seed(), { name: 'Zeta Mudanzas', kind: 'company', country: 'AR', preferredCurrency: 'ARS', categories: ['moving'], defaultPaymentCondition: 'due-date', active: true }, 'sup-new', ctx).ds
    const sorted = sortSuppliersNewestFirst(ds.suppliers)
    expect(sorted[0].name).toBe('Zeta Mudanzas')
    expect(sortSuppliersNewestFirst([...ds.suppliers].reverse()).map((s) => s.id)).toEqual(sorted.map((s) => s.id))
  })

  it('one operation, one collection: supplier, project and global views see the same payment; double submit records once', () => {
    const init = withHousing()
    const { obligationId } = init
    let ds = init.ds
    const ctx = testContext()
    const input = pay({ amount: 600, allocations: [{ obligationId, amount: 600 }] })
    const first = recordSupplierPayment(ds, input, 'same-click', ctx)
    const again = recordSupplierPayment(first.ds, input, 'same-click', ctx)
    expect(again.duplicate).toBe(true)
    ds = again.ds
    expect(ds.supplierPayments.filter((p) => p.allocations.some((a) => a.obligationId === obligationId))).toHaveLength(1)
    expect(paymentsForProject(ds, P).map((p) => p.id)).toContain(first.paymentId)
    expect(ds.supplierPayments.filter((p) => p.supplierId === S).map((p) => p.id)).toContain(first.paymentId)
    expect(ob(ds, obligationId)).toMatchObject({ paid: 600, outstanding: 900, status: 'partially-paid' })
    ds = recordSupplierPayment(ds, pay({ amount: 900, reference: 'T2', allocations: [{ obligationId, amount: 900 }] }), 'p2', ctx).ds
    expect(ob(ds, obligationId)).toMatchObject({ paid: 1500, outstanding: 0, status: 'paid' })
  })

  it('flags (never deletes) historical duplicates', () => {
    const ctx = testContext()
    let { ds } = withHousing()
    ds = recordSupplierPayment(ds, pay({ amount: 100, reference: 'DUP', projectId: P }), 'd1', ctx).ds
    ds = recordSupplierPayment(ds, pay({ amount: 100, reference: 'DUP', projectId: P }), 'd2', ctx).ds
    expect(possibleDuplicatePayments(ds).size).toBe(2)
    expect(ds.supplierPayments.filter((p) => p.reference === 'DUP')).toHaveLength(2)
  })

  it('project references resolve from ids; general expenses stay "Sin proyecto"', () => {
    const ds = seed()
    const o = ds.obligations.find((x) => x.id === 'obl_flo_14')!
    expect(projectRef(ds, o.projectId, o.serviceId)).toMatchObject({ code: 'REL-2026-0155', name: 'Diego Fuentes', client: 'Andes Minerals Group', service: 'Migraciones' })
    expect(projectRef(ds, ds.costs.find((c) => c.id === 'cost_gen_01')!.projectId)).toEqual({ general: true })
  })
})

describe('project advances', () => {
  it('requires supplier and project; can exist without any obligation; is money given, not a cost', () => {
    const ctx = testContext()
    const ds0 = seed()
    expect(fieldsOf(() => recordSupplierPayment(ds0, pay({ amount: 500 }), 'a0', ctx))).toHaveProperty('projectId')
    expect(fieldsOf(() => recordSupplierPayment(ds0, pay({ supplierId: '', amount: 500, projectId: P }), 'a1', ctx))).toHaveProperty('supplierId')
    const costsBefore = ds0.costs.length
    const r = recordSupplierPayment(ds0, pay({ amount: 500, reference: 'ADV-1', projectId: P }), 'a2', ctx)
    const p = r.ds.supplierPayments.find((x) => x.id === r.paymentId)!
    expect(advanceInfo(p)).toEqual({ given: 500, applied: 0, available: 500, status: 'unapplied' })
    expect(r.ds.costs).toHaveLength(costsBefore)
  })

  it("Eugenia's example: obligation 1.500, advance 500 applied → pending 1.000, cash out 500 (not 1.000)", () => {
    const ctx = testContext()
    const init = withHousing()
    const { obligationId } = init
    let ds = init.ds
    const base = projectCostControl(ds, P, TODAY).rows.find((x) => x.currency === 'USD')!
    const r = recordSupplierPayment(ds, pay({ amount: 500, reference: 'ADV-H', projectId: P }), 'adv', ctx)
    ds = applySupplierAdvance(r.ds, r.paymentId, [{ obligationId, amount: 500 }], ctx)
    expect(ob(ds, obligationId)).toMatchObject({ paid: 500, outstanding: 1000 })
    const usd = projectCostControl(ds, P, TODAY).rows.find((x) => x.currency === 'USD')!
    expect(usd).toMatchObject({ advancesGiven: 500, advancesApplied: 500, advancesAvailable: 0 })
    expect(usd.cashOut - base.cashOut).toBe(500) // one cash outflow, not 1.000
    expect(base.pending - usd.pending).toBe(500)
    expect(usd.directCosts).toBe(base.directCosts) // applying the advance adds no cost
    expect(advanceInfo(ds.supplierPayments.find((p) => p.id === r.paymentId)!)!.status).toBe('applied')
  })

  it('partial and total application; cannot exceed the available advance or the obligation balance', () => {
    const ctx = testContext()
    const init = withHousing(undefined, 300)
    const { obligationId } = init
    let ds = init.ds
    const r = recordSupplierPayment(ds, pay({ amount: 500, reference: 'ADV-P', projectId: P }), 'advp', ctx)
    ds = applySupplierAdvance(r.ds, r.paymentId, [{ obligationId, amount: 200 }], ctx)
    expect(advanceInfo(ds.supplierPayments.find((p) => p.id === r.paymentId)!)!).toMatchObject({ applied: 200, available: 300, status: 'partial' })
    expect(fieldsOf(() => applySupplierAdvance(ds, r.paymentId, [{ obligationId, amount: 150 }], ctx))).toHaveProperty('allocations.0.amount') // only 100 left on the obligation
    ds = applySupplierAdvance(ds, r.paymentId, [{ obligationId, amount: 100 }], ctx)
    expect(ob(ds, obligationId).outstanding).toBe(0)
    // Another obligation cannot take more than the 200 still available.
    const second = withHousing(ds, 1000)
    expect(fieldsOf(() => applySupplierAdvance(second.ds, r.paymentId, [{ obligationId: second.obligationId, amount: 201 }], ctx))).toHaveProperty('allocations')
  })

  it('blocks applying across projects, suppliers or currencies', () => {
    const ctx = testContext()
    let { ds } = withHousing()
    const other = withHousing(ds, 400, 'prj_0158')
    ds = other.ds
    const r = recordSupplierPayment(ds, pay({ amount: 500, reference: 'ADV-X', projectId: P }), 'advx', ctx)
    ds = r.ds
    expect(fieldsOf(() => applySupplierAdvance(ds, r.paymentId, [{ obligationId: other.obligationId, amount: 100 }], ctx))).toHaveProperty('allocations.0.obligationId')
    const otherSupplier = ds.obligations.find((o) => o.supplierId !== S && o.lifecycle === 'approved' && o.projectId === P)
    if (otherSupplier) expect(fieldsOf(() => applySupplierAdvance(ds, r.paymentId, [{ obligationId: otherSupplier.id, amount: 1 }], ctx))).toHaveProperty('allocations.0.obligationId')
    const eur = recordSupplierPayment(ds, pay({ currency: 'EUR', amount: 50, reference: 'ADV-E', projectId: P }), 'adve', ctx)
    const usdOb = ds.obligations.find((o) => o.reference === `HOU-${P}-1500`)!
    expect(fieldsOf(() => applySupplierAdvance(eur.ds, eur.paymentId, [{ obligationId: usdOb.id, amount: 10 }], ctx))).toHaveProperty('allocations.0.obligationId')
  })

  it('corrections keep the history and free the amount again', () => {
    const ctx = testContext()
    const init = withHousing()
    const { obligationId } = init
    let ds = init.ds
    const r = recordSupplierPayment(ds, pay({ amount: 500, reference: 'ADV-C', projectId: P }), 'advc', ctx)
    ds = applySupplierAdvance(r.ds, r.paymentId, [{ obligationId, amount: 500 }], ctx)
    const alloc = ds.supplierPayments.find((p) => p.id === r.paymentId)!.allocations.find((a) => a.source === 'advance')!
    ds = revertAdvanceApplication(ds, r.paymentId, alloc.id, 'Aplicado al servicio equivocado', ctx)
    const p = ds.supplierPayments.find((x) => x.id === r.paymentId)!
    expect(p.allocations).toHaveLength(1)
    expect(p.allocations[0].reversedAt).toBe(TODAY)
    expect(advanceInfo(p)!.available).toBe(500)
    expect(ob(ds, obligationId).outstanding).toBe(1500)
    expect(p.history!.map((h) => h.action)).toEqual(['Aplicación de anticipo corregida', 'Anticipo aplicado', 'Pago registrado con anticipo'])
  })
})

describe('cost closure and general expenses', () => {
  const cost = (o: Partial<CostInput> = {}): CostInput => ({ scope: 'project', projectId: P, category: 'other-direct', description: 'Tasas', currency: 'USD', amount: 80, date: TODAY, ...o })

  it('close / reopen with history; closed blocks new direct costs but not unpaid obligations', () => {
    const ctx = testContext()
    const init = withHousing()
    const { obligationId } = init
    let ds = init.ds
    ds = closeProjectCosts(ds, P, 'Todos los costos conocidos cargados', ctx)
    const ctl = projectCostControl(ds, P, TODAY)
    expect(ctl.closed).toBe(true)
    expect(ob(ds, obligationId).outstanding).toBe(1500) // closed ≠ paid
    expect(() => recordCost(ds, cost(), ctx)).toThrow(/cerrados/)
    expect(() => withHousing(ds, 99)).toThrow(/cerrados/)
    // Paying an existing obligation is still allowed.
    ds = recordSupplierPayment(ds, pay({ amount: 100, reference: 'C1', allocations: [{ obligationId, amount: 100 }] }), 'c1', ctx).ds
    expect(fieldsOf(() => reopenProjectCosts(ds, P, ' ', ctx))).toHaveProperty('reason')
    ds = reopenProjectCosts(ds, P, 'Llegó factura de mudanza', ctx)
    ds = recordCost(ds, cost(), ctx).ds
    const p = ds.projects.find((x) => x.id === P)!
    expect(p.costClosure!.history.map((h) => h.action)).toEqual(['Costos reabiertos', 'Costos cerrados'])
    expect(p.costClosure).not.toHaveProperty('closedBy')
  })

  it('general expenses by month and currency, paid on the same record, never touching project results', () => {
    const ctx = testContext()
    let ds = seed()
    const results = JSON.stringify(ds.projects.map((p) => projectResults(ds, p, TODAY)))
    const g = (o: Partial<CostInput>) => recordCost(ds, { scope: 'company', category: 'general-expense', description: 'Software', currency: 'USD', amount: 100, date: '2026-09-10', overheadCategory: 'Software', ...o }, ctx)
    ds = g({}).ds
    ds = g({ description: 'Comisión bancaria', overheadCategory: 'Comisiones bancarias', amount: 12.5, currency: 'ARS', date: '2026-10-02' }).ds
    const r = g({ description: 'Contador', overheadCategory: 'Honorarios administrativos', amount: 300, date: '2026-10-05' })
    ds = markOverheadPaid(r.ds, r.costId, { date: TODAY, reference: 'TRF-77' }, ctx)
    expect(() => markOverheadPaid(ds, r.costId, { date: TODAY }, ctx)).toThrow(/ya figura/)
    const count = ds.costs.filter((c) => c.description === 'Contador').length
    expect(count).toBe(1)
    const s = overheadSummary(ds.costs)
    // Seed already has USD 349.99 (Oct, no payment state recorded): totals add per currency only.
    expect(s.byMonth.find((m) => m.period === '2026-10' && m.currency === 'USD')).toMatchObject({ total: 649.99, paid: 300, pending: 0 })
    expect(s.byMonth.find((m) => m.period === '2026-09' && m.currency === 'USD')).toMatchObject({ total: 100, pending: 100 })
    expect(s.byMonth.find((m) => m.period === '2026-10' && m.currency === 'ARS')!.total).toBe(1250012.5)
    expect(s.byCategory.find((c) => c.category === 'Software')!.total).toBe(100)
    expect(JSON.stringify(ds.projects.map((p) => projectResults(ds, p, TODAY)))).toBe(results)
  })
})

describe('settlements compatibility and migration', () => {
  it('settlements are unchanged; an advance applied to a linked partner invoice counts once', () => {
    const ctx = testContext()
    let ds = seed()
    expect(settlementFinancials(ds, ds.settlements.find((s) => s.id === 'set_0143')!, TODAY)).toMatchObject({ partnerShare: 3240, directCosts: 10700 })
    const before = settlementFinancials(ds, ds.settlements.find((s) => s.id === 'set_0158')!, TODAY).partnerPaid
    const r = recordSupplierPayment(ds, pay({ amount: 300, reference: 'ADV-FLO', projectId: 'prj_0158' }), 'flo', ctx)
    ds = r.ds
    expect(settlementFinancials(ds, ds.settlements.find((s) => s.id === 'set_0158')!, TODAY).partnerPaid).toBe(before)
    ds = applySupplierAdvance(ds, r.paymentId, [{ obligationId: 'obl_flo_12', amount: 300 }], ctx)
    expect(settlementFinancials(ds, ds.settlements.find((s) => s.id === 'set_0158')!, TODAY).partnerPaid).toBe(before + 300)
  })

  it('v7 → v8 keeps every record and invents nothing', () => {
    const v8 = seed()
    const data = { ...v8, schemaVersion: 7 }
    const mem: Record<string, string> = { 'sigr.demo.dataset': JSON.stringify({ schemaVersion: 7, savedAt: 'x', data }) }
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    const { dataset, issue } = readDataset(storage)
    expect(issue).toBe('migrated')
    expect(dataset!.schemaVersion).toBe(10)
    const { schemaVersion: _a, settlementBatches, ...rest } = dataset!
    const { schemaVersion: _b, settlementBatches: _c, ...orig } = data
    expect(rest).toEqual(orig)
    expect(settlementBatches).toEqual([])
    expect(dataset!.projects.every((p) => !p.costClosure)).toBe(true)
  })
})
