import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { recordReceipt } from '@/domain/finance/receipts'
import {
  addSettlementAdjustment,
  configureSettlement,
  confirmSettlement,
  createSettlement,
  linkSettlementObligation,
  recordSettlementRelease,
  settlementFinancials,
  unlinkSettlementObligation,
} from '@/domain/finance/settlements'
import { recordSupplierPayment } from '@/domain/finance/supplierPayments'
import { fieldsOf, seed, testContext } from './helpers'

const TODAY = '2026-10-19'
const fin = (ds: Dataset, id: string) => settlementFinancials(ds, ds.settlements.find((s) => s.id === id)!, TODAY)
const pct = (pct: number) => ({ rule: { method: 'percentage' as const, pct, components: [] }, release: 'after-collection' as const })

describe('settlement calculation', () => {
  it('derives base, shares and status from existing records (demo)', () => {
    const ds = seed()
    expect(fin(ds, 'set_0143')).toMatchObject({ netRevenue: 26900, directCosts: 10700, base: 16200, partnerShare: 3240, ownerShare: 12960, releasable: 3240, pendingPayment: 3240, signal: 'red' })
    expect(fin(ds, 'set_0139')).toMatchObject({ partnerShare: 500, partnerPaid: 500, signal: 'green' })
    expect(fin(ds, 'set_0158')).toMatchObject({ releasable: 400, partnerPaid: 400, shareOutstanding: 300, signal: 'yellow' })
    expect(fin(ds, 'set_0155')).toMatchObject({ collected: 0, releasable: 0, signal: 'gray' })
  })

  it('without a rule shows "Pendiente de configurar" and no amounts', () => {
    const f = fin(seed(), 'set_0152')
    expect(f.configured).toBe(false)
    expect(f.signalNote).toBe('Pendiente de configurar')
    expect(f.partnerShare).toBeUndefined()
    expect(f.releasable).toBeUndefined()
  })

  it('does not deduct the partner invoice twice', () => {
    const ds = seed()
    const linked = fin(ds, 'set_0139')
    expect(linked.directCosts).toBe(0) // the 500 Florencia cost is her share, not a direct cost
    const ctx = testContext()
    const unlinked = unlinkSettlementObligation(ds, 'set_0139', 'obl_flo_09', 'prueba', ctx)
    const f = fin(unlinked, 'set_0139')
    expect(f.directCosts).toBe(500)
    expect(f.unlinked.map((o) => o.id)).toEqual(['obl_flo_09'])
    expect(f.warnings.join(' ')).toMatch(/sin vincular/)
  })

  it('partial collections release the share proportionally, never all of it', () => {
    const ctx = testContext()
    let ds = configureSettlement(seed(), 'set_0152', pct(10), '', ctx)
    // EUR 9.800 base → share 980; 10.700 of 12.600 collected.
    expect(fin(ds, 'set_0152')).toMatchObject({ base: 9800, partnerShare: 980, releasable: 832.22 })
    ds = recordReceipt(ds, { clientId: 'cli_helvion', date: TODAY, currency: 'EUR', amount: 100, method: 'wire', reference: 'x', notes: '', allocations: [] }, 'r1', ctx).ds
    expect(fin(ds, 'set_0152').releasable).toBe(832.22) // unapplied credit does not release anything
  })

  it('red becomes green only when the releasable share is paid', () => {
    const ctx = testContext()
    let ds = seed()
    ds = createObligationFor(ds, ctx)
    ds = linkSettlementObligation(ds, 'set_0143', 'obl_t', ctx)
    expect(fin(ds, 'set_0143')).toMatchObject({ partnerInvoiced: 3240, directCosts: 10700, signal: 'red' })
    const pay = (amount: number, req: string) =>
      recordSupplierPayment(ds, { supplierId: 'sup_florencia', date: TODAY, currency: 'USD', amount, method: 'transfer', reference: req, notes: '', allocations: [{ obligationId: 'obl_t', amount }] }, req, ctx).ds
    ds = pay(1000, 'p1')
    expect(fin(ds, 'set_0143')).toMatchObject({ partnerPaid: 1000, pendingPayment: 2240, signal: 'red' })
    ds = pay(2240, 'p2')
    expect(fin(ds, 'set_0143')).toMatchObject({ pendingPayment: 0, signal: 'green' })
  })

  it('manual release is capped by the share and requires a reason', () => {
    const ctx = testContext()
    const ds = seed()
    expect(fieldsOf(() => recordSettlementRelease(ds, 'set_0158', { amount: 301, date: TODAY, reason: 'x' }, ctx))).toHaveProperty('amount')
    expect(fieldsOf(() => recordSettlementRelease(ds, 'set_0158', { amount: 100, date: TODAY, reason: ' ' }, ctx))).toHaveProperty('reason')
    const next = recordSettlementRelease(ds, 'set_0158', { amount: 300, date: TODAY, reason: 'Programa finalizado' }, ctx)
    expect(fin(next, 'set_0158')).toMatchObject({ releasable: 700, pendingPayment: 300, signal: 'red' })
  })

  it('adjustments are signed, justified and change the share', () => {
    const ctx = testContext()
    const ds = seed()
    expect(fieldsOf(() => addSettlementAdjustment(ds, 'set_0143', { amount: 100, date: TODAY, reason: '' }, ctx))).toHaveProperty('reason')
    const next = addSettlementAdjustment(ds, 'set_0143', { amount: -240, date: TODAY, reason: 'Descuento acordado' }, ctx)
    expect(fin(next, 'set_0143')).toMatchObject({ adjustments: -240, partnerShare: 3000, ownerShare: 13200 })
  })

  it('by-service components use each service base', () => {
    const ctx = testContext()
    const ds = configureSettlement(seed(), 'set_0143', { rule: { method: 'by-service', components: [{ id: '', serviceId: 'prj_0143_s1', method: 'percentage', pct: 10 }, { id: '', serviceId: 'prj_0143_s2', method: 'fixed', amount: 150 }] }, release: 'after-collection' }, 'Cambio a componentes', ctx)
    const f = fin(ds, 'set_0143')
    expect(f.configured).toBe(true)
    expect(f.partnerShare).toBeGreaterThan(150)
  })
})

describe('settlement rules and history', () => {
  it('validates distributions and never assumes a split', () => {
    const ctx = testContext()
    const ds = seed()
    expect(fieldsOf(() => configureSettlement(ds, 'set_0152', pct(0), '', ctx))).toHaveProperty('pct')
    expect(fieldsOf(() => configureSettlement(ds, 'set_0152', pct(100.5), '', ctx))).toHaveProperty('pct')
    expect(fieldsOf(() => configureSettlement(ds, 'set_0152', { rule: { method: 'by-service', components: [] }, release: 'after-collection' }, '', ctx))).toHaveProperty('components')
    expect(fieldsOf(() => configureSettlement(ds, 'set_0152', { ...pct(10), release: 'manual' }, '', ctx))).toHaveProperty('releaseNote')
  })

  it('changing a configured rule requires a reason and is logged', () => {
    const ctx = testContext()
    const ds = seed()
    expect(fieldsOf(() => configureSettlement(ds, 'set_0143', pct(25), '', ctx))).toHaveProperty('reason')
    const next = configureSettlement(ds, 'set_0143', pct(25), 'Nuevo acuerdo de octubre', ctx)
    const s = next.settlements.find((x) => x.id === 'set_0143')!
    expect(s.history[0]).toMatchObject({ action: 'Distribución modificada', reason: 'Nuevo acuerdo de octubre', date: '2026-10-19T10:00:00' })
    expect(next.audit[0]).toMatchObject({ entity: 'settlement', entityId: 'set_0143' })
  })

  it('confirmed snapshots are preserved when the rule changes later', () => {
    const ctx = testContext()
    let ds = confirmSettlement(seed(), 'set_0143', 'Cierre septiembre', ctx)
    ds = configureSettlement(ds, 'set_0143', pct(30), 'Renegociado', ctx)
    const s = ds.settlements.find((x) => x.id === 'set_0143')!
    expect(s.confirmations).toHaveLength(1)
    expect(s.confirmations[0]).toMatchObject({ partnerShare: 3240, base: 16200 })
    expect(fin(ds, 'set_0143').partnerShare).toBe(4860)
    expect(() => confirmSettlement(ds, 'set_0152', '', ctx)).toThrow(/pendiente de configurar/)
  })

  it('links only matching obligations, once, without touching payments', () => {
    const ctx = testContext()
    const ds = seed()
    expect(() => linkSettlementObligation(ds, 'set_0143', 'obl_flo_12', ctx)).toThrow(/otro proyecto/)
    expect(() => linkSettlementObligation(ds, 'set_0158', 'obl_flo_12', ctx)).toThrow(/ya está vinculada/)
    const before = JSON.stringify([ds.invoices, ds.receipts, ds.supplierPayments, ds.obligations])
    const next = unlinkSettlementObligation(ds, 'set_0158', 'obl_flo_12', 'Error de carga', ctx)
    expect(JSON.stringify([next.invoices, next.receipts, next.supplierPayments, next.obligations])).toBe(before)
  })

  it('one settlement per project, partner and currency; currencies stay separate', () => {
    const ctx = testContext()
    const ds = seed()
    expect(fieldsOf(() => createSettlement(ds, { projectId: 'prj_0143', supplierId: 'sup_florencia', currency: 'USD', release: 'after-collection' }, 'a', ctx))).toHaveProperty('currency')
    const { ds: next, settlementId } = createSettlement(ds, { projectId: 'prj_0143', supplierId: 'sup_florencia', currency: 'EUR', release: 'after-collection' }, 'b', ctx)
    const f = settlementFinancials(next, next.settlements.find((s) => s.id === settlementId)!, TODAY)
    expect(f).toMatchObject({ netRevenue: 0, collected: 0, configured: false })
    expect(createSettlement(next, { projectId: 'prj_0143', supplierId: 'sup_florencia', currency: 'EUR', release: 'after-collection' }, 'b', ctx).duplicate).toBe(true)
  })
})

/** Adds an approved Florencia obligation (USD 3.240) on prj_0143 with id "obl_t". */
function createObligationFor(ds: Dataset, ctx: ReturnType<typeof testContext>): Dataset {
  const cost = { id: 'cost_t', scope: 'project' as const, projectId: 'prj_0143', supplierId: 'sup_florencia', category: 'professional-services' as const, description: 'x', currency: 'USD' as const, amount: 3240, date: TODAY, status: 'incurred' as const, createdAt: ctx.now(), createdBy: 'stf_01' }
  const ob = { id: 'obl_t', supplierId: 'sup_florencia', reference: 'FLO-T', projectId: 'prj_0143', costId: 'cost_t', description: 'x', issueDate: TODAY, dueDate: '2026-11-19', currency: 'USD' as const, amount: 3240, paymentCondition: 'due-date' as const, lifecycle: 'approved' as const, createdAt: ctx.now(), createdBy: 'stf_01' }
  return { ...ds, costs: [...ds.costs, cost], obligations: [...ds.obligations, ob] }
}
