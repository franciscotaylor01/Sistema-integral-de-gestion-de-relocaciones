import { describe, expect, it } from 'vitest'
import { mockInvoices, mockPayables } from '@/data/mock'
import { correctExchangeRate, recordExchangeRate } from '@/domain/finance/fx'
import { invoiceFinancials, obligationFinancials, receiptUnallocated } from '@/domain/finance/derive'
import { billableByService, cancelInvoice, createInvoiceDraft, issueInvoice, suggestInvoiceLines, type InvoiceInput } from '@/domain/finance/invoices'
import { addMoney, mulMoney, percentOf, subMoney } from '@/domain/finance/money'
import { approveObligation, cancelObligation, createObligation, type ObligationInput } from '@/domain/finance/obligations'
import { applyReceiptCredit, recordReceipt, reverseReceipt, type ReceiptInput } from '@/domain/finance/receipts'
import { companyExpenses, projectResults } from '@/domain/finance/results'
import { recordSupplierPayment, reverseSupplierPayment, type SupplierPaymentInput } from '@/domain/finance/supplierPayments'
import { createAgreement } from '@/domain/finance/suppliers'
import { recordCost, voidCost } from '@/domain/finance/costs'
import type { Dataset } from '@/domain/dataset'
import { fieldsOf, seed, testContext } from './helpers'

const TODAY = '2026-10-19'
const inv = (ds: Dataset, id: string) => invoiceFinancials(ds, ds.invoices.find((i) => i.id === id)!, TODAY)
const ob = (ds: Dataset, id: string) => obligationFinancials(ds, ds.obligations.find((o) => o.id === id)!, TODAY)

describe('decimal-safe money', () => {
  it('adds, multiplies and applies rates on integer cents', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3)
    expect(subMoney(1000, 999.99)).toBe(0.01)
    expect(mulMoney(19.99, 3)).toBe(59.97)
    expect(mulMoney(3, 0.333)).toBe(1) // 0.999 rounds once, half away from zero
    expect(mulMoney(100, 0.125)).toBe(12.5)
    expect(percentOf(1000, 21)).toBe(210)
    expect(percentOf(33.33, 10.5)).toBe(3.5)
  })
})

describe('migrated Phase 1 records keep their history', () => {
  it('derived collected / paid equal the original stored values', () => {
    const ds = seed()
    for (const legacy of mockInvoices) expect(inv(ds, legacy.id).paid).toBe(legacy.status === 'draft' ? 0 : legacy.collected)
    for (const legacy of mockPayables) expect(ob(ds, legacy.id).paid).toBe(legacy.paid)
    expect(inv(ds, 'inv_15')).toMatchObject({ status: 'overdue', outstanding: 7400, daysOverdue: 19 })
    expect(inv(ds, 'inv_17').status).toBe('partially-paid')
    expect(inv(ds, 'inv_01').status).toBe('paid')
    // Lines are mapped onto services (prj_0143: 9300 = immigration 5000 + housing 4300).
    expect(ds.invoices.find((i) => i.id === 'inv_01')!.lines.map((l) => [l.serviceId, l.unitPrice])).toEqual([
      ['prj_0143_s1', 5000],
      ['prj_0143_s2', 4300],
    ])
  })
})

describe('invoicing', () => {
  const base = (o: Partial<InvoiceInput> = {}): InvoiceInput => ({
    projectId: 'prj_0158',
    issuerId: 'le_relocare',
    kind: 'E',
    issueDate: TODAY,
    dueDate: '2026-12-03',
    currency: 'USD',
    lines: [{ serviceId: 'prj_0158_s2', quotationId: 'quo_11b', purchaseOrderId: 'po_08', description: 'Housing', quantity: 1, unitPrice: 4200 }],
    taxes: [],
    ...o,
  })

  it('computes what is still billable per service from policy, PO and prior invoices', () => {
    const b = billableByService(seed(), 'prj_0158', TODAY)
    expect(b.get('prj_0158_s1')!.remaining.USD).toBe(3900) // 5200 authorised − 1300 legacy draft
    expect(b.get('prj_0158_s2')!.remaining.USD).toBe(4200)
    expect(b.get('prj_0158_s3')!.eligible).toBe(false) // no PO yet
    const suggested = suggestInvoiceLines(seed(), 'prj_0158', 'USD', TODAY)
    expect(suggested.map((l) => [l.serviceId, l.unitPrice])).toEqual([
      ['prj_0158_s1', 3900],
      ['prj_0158_s2', 4200],
      ['prj_0158_s4', 12800],
    ])
  })

  it('prevents billing the same amount twice (drafts included)', () => {
    const ctx = testContext()
    const { ds } = createInvoiceDraft(seed(), base(), 'r1', ctx)
    const f = fieldsOf(() => createInvoiceDraft(ds, base({ lines: [{ ...base().lines[0], unitPrice: 1 }] }), 'r2', ctx))
    expect(f['lines.0.unitPrice']).toMatch(/Supera lo facturable/)
    // Same request id → same invoice, no duplicate.
    expect(createInvoiceDraft(ds, base(), 'r1', ctx).duplicate).toBe(true)
  })

  it('respects eligibility, PO policy, quantities and taxes', () => {
    const ds = seed()
    expect(fieldsOf(() => createInvoiceDraft(ds, base({ lines: [{ serviceId: 'prj_0158_s3', description: 'Schooling', quantity: 1, unitPrice: 100 }] }), 'x', testContext()))['lines.0.unitPrice']).toMatch(/no es facturable/)
    expect(fieldsOf(() => createInvoiceDraft(ds, base({ lines: [{ serviceId: 'prj_0158_s2', description: 'H', quantity: 1, unitPrice: 100 }] }), 'x', testContext()))['lines.0.purchaseOrderId']).toMatch(/exige OC/)
    expect(fieldsOf(() => createInvoiceDraft(ds, base({ lines: [{ description: 'x', quantity: 0, unitPrice: 10.123 }] }), 'x', testContext()))).toMatchObject({
      'lines.0.quantity': expect.any(String),
      'lines.0.unitPrice': expect.any(String),
      'lines.0.serviceId': expect.any(String),
    })
    const withTax = createInvoiceDraft(ds, base({ lines: [{ ...base().lines[0], quantity: 2, unitPrice: 2100 }], taxes: [{ label: 'IVA 21 %', ratePct: 21 }] }), 'tx', testContext())
    const f = invoiceFinancials(withTax.ds, withTax.ds.invoices.find((i) => i.id === withTax.invoiceId)!, TODAY)
    expect(f).toMatchObject({ subtotal: 4200, tax: 882, total: 5082, status: 'draft', paid: 0 })
  })

  it('issuing is not collecting; cancelling requires no receipts', () => {
    const ctx = testContext()
    const draft = createInvoiceDraft(seed(), base(), 'r', ctx)
    const { invoiceId } = draft
    const ds = issueInvoice(draft.ds, invoiceId, '0003-00000123', ctx)
    expect(inv(ds, invoiceId)).toMatchObject({ status: 'issued', paid: 0, outstanding: 4200 })
    const rec = recordReceipt(ds, receipt({ clientId: 'cli_nordvik', currency: 'USD', amount: 1000, allocations: [{ invoiceId, amount: 1000 }] }), 'p', ctx)
    expect(() => cancelInvoice(rec.ds, invoiceId, 'Error', ctx)).toThrow(/Revertí/)
    const reversed = reverseReceipt(rec.ds, rec.receiptId, 'Cargado por error', ctx)
    const cancelled = cancelInvoice(reversed, invoiceId, 'Emitida por error', ctx)
    expect(inv(cancelled, invoiceId).status).toBe('cancelled')
    // History preserved.
    expect(cancelled.receipts.find((r) => r.id === rec.receiptId)).toMatchObject({ status: 'reversed', allocations: [{ amount: 1000 }] })
    expect(cancelled.audit.map((a) => a.action)).toEqual(expect.arrayContaining(['issue', 'record', 'reverse', 'cancel']))
  })
})

const receipt = (o: Partial<ReceiptInput>): ReceiptInput => ({ clientId: 'cli_helvion', date: TODAY, currency: 'EUR', amount: 100, method: 'wire', allocations: [], ...o })

describe('collections', () => {
  it('supports partial, multiple and multi-invoice receipts', () => {
    const ctx = testContext()
    // inv_15 (7400 overdue) and inv_17 (3600 outstanding) are both Helvion EUR.
    let { ds } = recordReceipt(seed(), receipt({ amount: 2000, reference: 'SWIFT-1', allocations: [{ invoiceId: 'inv_15', amount: 2000 }] }), 'a', ctx)
    expect(inv(ds, 'inv_15')).toMatchObject({ status: 'overdue', paid: 2000, outstanding: 5400 })
    ;({ ds } = recordReceipt(ds, receipt({ amount: 9000, reference: 'SWIFT-2', allocations: [{ invoiceId: 'inv_15', amount: 5400 }, { invoiceId: 'inv_17', amount: 3600 }] }), 'b', ctx))
    expect(inv(ds, 'inv_15').status).toBe('paid')
    expect(inv(ds, 'inv_17').status).toBe('paid')
  })

  it('blocks over-allocation, cross-currency and duplicate references', () => {
    const ds = seed()
    expect(fieldsOf(() => recordReceipt(ds, receipt({ amount: 8000, allocations: [{ invoiceId: 'inv_15', amount: 7400.01 }] }), 'x', testContext()))['allocations.0.amount']).toMatch(/Supera el saldo/)
    expect(fieldsOf(() => recordReceipt(ds, receipt({ amount: 100, allocations: [{ invoiceId: 'inv_15', amount: 200 }] }), 'x', testContext())).allocations).toMatch(/superan/)
    expect(fieldsOf(() => recordReceipt(ds, receipt({ currency: 'USD', allocations: [{ invoiceId: 'inv_15', amount: 100 }] }), 'x', testContext()))['allocations.0.invoiceId']).toMatch(/EUR/)
    const first = recordReceipt(ds, receipt({ reference: 'TRX-9', allocations: [] }), 'r1', testContext())
    expect(fieldsOf(() => recordReceipt(first.ds, receipt({ reference: 'trx-9' }), 'r2', testContext())).reference).toMatch(/Ya hay un cobro/)
  })

  it('keeps unallocated amounts as explicit client credit and applies it later', () => {
    const ctx = testContext()
    const { ds, receiptId } = recordReceipt(seed(), receipt({ amount: 1000, allocations: [] }), 'c', ctx)
    expect(receiptUnallocated(ds.receipts.find((r) => r.id === receiptId)!)).toBe(1000)
    const applied = applyReceiptCredit(ds, receiptId, [{ invoiceId: 'inv_15', amount: 600 }], ctx)
    expect(inv(applied, 'inv_15').paid).toBe(600)
    expect(fieldsOf(() => applyReceiptCredit(applied, receiptId, [{ invoiceId: 'inv_15', amount: 500 }], ctx)).allocations).toMatch(/superan/)
  })
})

describe('supplier costs, obligations and payments', () => {
  const obligation = (o: Partial<ObligationInput> = {}): ObligationInput => ({
    supplierId: 'sup_02',
    reference: 'CN-0500',
    projectId: 'prj_0158',
    serviceId: 'prj_0158_s2',
    category: 'supplier-fee',
    description: 'Comisión inmobiliaria',
    issueDate: '2026-10-15',
    dueDate: '2026-10-30',
    currency: 'USD',
    amount: 1500,
    paymentCondition: 'due-date',
    ...o,
  })
  const payment = (o: Partial<SupplierPaymentInput>): SupplierPaymentInput => ({ supplierId: 'sup_02', date: TODAY, currency: 'USD', amount: 500, method: 'transfer', allocations: [], ...o })

  it('records the incurred cost with the obligation; payments are separate', () => {
    const ctx = testContext()
    const created = createObligation(seed(), obligation(), 'o1', ctx)
    const { obligationId } = created
    let ds = created.ds
    const o = ds.obligations.find((x) => x.id === obligationId)!
    expect(ds.costs.find((c) => c.id === o.costId)).toMatchObject({ status: 'incurred', amount: 1500, projectId: 'prj_0158' })
    expect(ob(ds, obligationId).status).toBe('pending-approval')
    expect(fieldsOf(() => recordSupplierPayment(ds, payment({ allocations: [{ obligationId, amount: 500 }] }), 'p', ctx))['allocations.0.obligationId']).toMatch(/Aprobá/)
    ds = approveObligation(ds, obligationId, ctx)
    ;({ ds } = recordSupplierPayment(ds, payment({ allocations: [{ obligationId, amount: 500 }] }), 'p1', ctx))
    ;({ ds } = recordSupplierPayment(ds, payment({ amount: 700, allocations: [{ obligationId, amount: 700 }] }), 'p2', ctx))
    expect(ob(ds, obligationId)).toMatchObject({ status: 'partially-paid', paid: 1200, outstanding: 300 })
    expect(fieldsOf(() => recordSupplierPayment(ds, payment({ amount: 400, allocations: [{ obligationId, amount: 400 }] }), 'p3', ctx))['allocations.0.amount']).toMatch(/Supera el saldo/)
    expect(() => cancelObligation(ds, obligationId, 'error', ctx)).toThrow(/revertí/)
    expect(() => createObligation(ds, obligation({ reference: 'cn-0500' }), 'o2', ctx)).toThrow()
  })

  it('makes "pay after client collection" explicit and overridable only with a reason', () => {
    const ds = seed()
    expect(ob(ds, 'obl_flo_14')).toMatchObject({ status: 'awaiting-collection', conditionMet: false })
    const p = { supplierId: 'sup_florencia', date: TODAY, currency: 'USD' as const, amount: 800, method: 'transfer' as const, allocations: [{ obligationId: 'obl_flo_14', amount: 800 }] }
    expect(fieldsOf(() => recordSupplierPayment(ds, p, 'x', testContext()))['allocations.0.conditionOverride']).toMatch(/cobrar/)
    const paid = recordSupplierPayment(ds, { ...p, allocations: [{ obligationId: 'obl_flo_14', amount: 800, conditionOverride: 'Autorizado por Dirección' }] }, 'y', testContext()).ds
    expect(ob(paid, 'obl_flo_14').status).toBe('paid')
    // Collecting the client invoice releases the condition.
    const collected = recordReceipt(ds, { clientId: 'cli_andes', date: TODAY, currency: 'USD', amount: 10300, method: 'wire', allocations: [{ invoiceId: 'inv_07', amount: 10300 }] }, 'z', testContext()).ds
    expect(ob(collected, 'obl_flo_14').conditionMet).toBe(true)
  })

  it("tracks Florencia's agreed, invoiced, paid and outstanding amounts", () => {
    const ds = seed()
    expect(ob(ds, 'obl_flo_12')).toMatchObject({ paid: 400, outstanding: 300 })
    expect(fieldsOf(() => createObligation(ds, { ...obligation(), supplierId: 'sup_florencia', reference: 'FLO-X', agreementId: 'agr_flo_01', serviceId: 'prj_0158_s5', amount: 1 }, 'f', testContext())).amount).toMatch(/acordado/)
    const { ds: d2 } = createAgreement(ds, { supplierId: 'sup_florencia', projectId: 'prj_0160', description: 'Taller intercultural', currency: 'USD', agreedAmount: 450, paymentCondition: 'after-client-collection' }, testContext())
    expect(d2.agreements.at(-1)).toMatchObject({ agreedAmount: 450, paymentCondition: 'after-client-collection' })
    const reversed = reverseSupplierPayment(ds, 'spay_flo_01', 'Transferencia rechazada', testContext())
    expect(ob(reversed, 'obl_flo_12').paid).toBe(0)
    expect(reversed.supplierPayments.find((p) => p.id === 'spay_flo_01')!.status).toBe('reversed')
  })

  it('keeps general company expenses out of project results', () => {
    const ctx = testContext()
    expect(() => recordCost(seed(), { scope: 'company', projectId: 'prj_0158', category: 'general-expense', description: 'x', currency: 'USD', amount: 1, date: TODAY }, ctx)).toThrow()
    const { ds, costId } = recordCost(seed(), { scope: 'company', category: 'general-expense', description: 'Seguro', currency: 'USD', amount: 120, date: TODAY }, ctx)
    expect(companyExpenses(ds).USD).toBe(addMoney(349.99, 120))
    expect(() => voidCost(ds, 'cost_pay_01', 'x', ctx)).toThrow(/obligación/)
    expect(voidCost(ds, costId, 'Duplicado', ctx).costs.find((c) => c.id === costId)!.status).toBe('void')
  })
})

describe('project results', () => {
  it('derives revenue, collections, costs and margins per currency', () => {
    const ds = seed()
    const [usd] = projectResults(ds, ds.projects.find((p) => p.id === 'prj_0143')!, TODAY)
    expect(usd).toMatchObject({ currency: 'USD', agreed: 26900, invoicedNet: 26900, collected: 26900, receivable: 0, actualCost: 10700, supplierPaid: 10700, cashNet: 16200 })
    expect(usd.operationalMargin).toMatchObject({ amount: 16200, pct: 60.2 })
  })

  it('reports insufficient data instead of inventing a margin', () => {
    const ds = seed()
    const results = projectResults(ds, ds.projects.find((p) => p.id === 'prj_0162')!, TODAY)
    const usd = results.find((r) => r.currency === 'USD')!
    expect(usd.invoicedNet).toBe(0)
    expect(usd.operationalMargin.amount).toBeUndefined()
    expect(usd.operationalMargin.note).toMatch(/Sin datos/)
  })

  it('never mixes currencies', () => {
    const ds = seed()
    const results = projectResults(ds, ds.projects.find((p) => p.id === 'prj_0152')!, TODAY)
    expect(results.map((r) => r.currency)).toEqual(['EUR'])
  })
})

describe('exchange rates', () => {
  it('records rates and keeps correction history', () => {
    const ctx = testContext()
    const { ds, rateId } = recordExchangeRate(seed(), { base: 'USD', quote: 'ARS', rate: '1460,25', effectiveDate: TODAY, source: 'Carga manual' }, ctx)
    expect(ds.exchangeRates.find((r) => r.id === rateId)!.rate).toBe('1460.25')
    const corrected = correctExchangeRate(ds, rateId, '1461.00', 'Error de tipeo', ctx)
    expect(corrected.ds.exchangeRates.find((r) => r.id === rateId)!.supersededById).toBe(corrected.rateId)
    expect(() => recordExchangeRate(ds, { base: 'USD', quote: 'USD', rate: '-1', effectiveDate: TODAY, source: '' }, ctx)).toThrow()
  })
})
