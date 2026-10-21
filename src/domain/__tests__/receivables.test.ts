import { describe, expect, it } from 'vitest'
import { withCatalogSeed } from '@/data/catalogSeed'
import { buildBaseSeedDataset } from '@/data/seed'
import type { Dataset } from '@/domain/dataset'
import { addAttachment, validateFile } from '@/domain/finance/attachments'
import { invoiceFinancials } from '@/domain/finance/derive'
import { changeInvoiceDueDate, confirmInvoiceEmission, correctFiscalData, type EmissionInput } from '@/domain/finance/emission'
import { createInvoiceDraft, suggestInvoiceLines } from '@/domain/finance/invoices'
import { addReceiptWithholdings, recordReceipt, type ReceiptInput } from '@/domain/finance/receipts'
import { receivableRows, receivablesSummary } from '@/domain/finance/receivables'
import { settlementFinancials } from '@/domain/finance/settlements'
import { addBusinessDays, addCalendarDays } from '@/domain/finance/terms'
import { readDataset, writeDataset, type StorageLike } from '@/services/local/storage'
import { fieldsOf, seed, testContext } from './helpers'

const TODAY = '2026-10-19'
/** Phase 4.6 data (approved certificate not yet invoiced). */
const base = () => withCatalogSeed(buildBaseSeedDataset())
const pvA = (ds: Dataset) => ds.projects.filter((p) => p.openOrderId === 'oca_pv_nqn').sort((a, b) => a.code.localeCompare(b.code))[0]
const fin = (ds: Dataset, id: string) => invoiceFinancials(ds, ds.invoices.find((i) => i.id === id)!, TODAY)
const emission = (o: Partial<EmissionInput> = {}): EmissionInput => ({ voucherType: 'A', pointOfSale: '3', number: '501', issueDate: '2026-10-16', total: 1890000, currency: 'ARS', ...o })

/** Prepared (draft) invoice for the approved certificate of the Petrovalle demo project. */
function prepared(ds: Dataset = withTerms(base())) {
  const p = pvA(ds)
  const ctx = testContext()
  const r = createInvoiceDraft(ds, { projectId: p.id, issuerId: 'le_relocare', kind: 'A', issueDate: TODAY, dueDate: TODAY, currency: 'ARS', lines: suggestInvoiceLines(ds, p.id, 'ARS', TODAY), taxes: [], externalRef: '', notes: '' }, 'prep', ctx)
  return { ds: r.ds, id: r.invoiceId, ctx, project: p }
}
const withTerms = (ds: Dataset): Dataset => ({ ...ds, openOrders: ds.openOrders.map((o) => (o.id === 'oca_pv_nqn' ? { ...o, paymentTerms: { days: 45, dayType: 'calendar' as const } } : o)) })
const receipt = (o: Partial<ReceiptInput>): ReceiptInput => ({ clientId: 'cli_petrovalle', date: TODAY, currency: 'ARS', amount: 0, method: 'transfer', reference: '', notes: '', allocations: [], ...o })

describe('preparation and external emission', () => {
  it('a prepared invoice is not issued and generates no receivable; lines are broken down by sub-service', () => {
    const { ds, id } = prepared()
    const inv = ds.invoices.find((i) => i.id === id)!
    expect(inv.lifecycle).toBe('draft')
    expect(inv.fiscal).toBeUndefined()
    expect(fin(ds, id)).toMatchObject({ paid: 0, outstanding: 0 })
    expect(receivableRows(ds, TODAY).some((r) => r.invoice.id === id)).toBe(false)
    // Mandatory certificate: only approved certified items and quantities.
    expect(inv.lines.map((l) => [l.description, l.quantity])).toEqual([
      ['Housing — Búsqueda de vivienda', 1],
      ['Housing — Visitas a propiedades', 2],
      ['Migraciones — Residencia temporaria', 1],
    ])
    expect(inv.lines.every((l) => l.serviceItemId && l.certificateId)).toBe(true)
  })

  it('confirmation stores the fiscal snapshot, history and due date from the PO, counted from the issue date', () => {
    const init = prepared()
    const { id, ctx } = init
    let ds = init.ds
    ds = confirmInvoiceEmission(ds, id, emission(), ctx)
    const inv = ds.invoices.find((i) => i.id === id)!
    expect(inv).toMatchObject({ lifecycle: 'issued', issueDate: '2026-10-16', dueDate: '2026-11-30', externalRef: '00003-00000501' })
    expect(inv.fiscal).toMatchObject({ voucherType: 'A', pointOfSale: '00003', number: '00000501', total: 1890000, commercialSubtotal: 1890000 })
    expect(inv.fiscal!.linesSnapshot).toHaveLength(3)
    expect(inv.paymentTerms).toMatchObject({ days: 45, dayType: 'calendar', source: 'open-order', sourceRef: 'oca_pv_nqn', computedDueDate: '2026-11-30' })
    expect(inv.history![0].action).toBe('Emisión externa confirmada')
    expect(receivableRows(ds, TODAY).find((r) => r.invoice.id === id)).toMatchObject({ status: 'pending', outstanding: 1890000, daysToDue: 42 })
  })

  it('rejects future dates, other currencies and confirming twice', () => {
    const { ds, id, ctx } = prepared()
    const f = fieldsOf(() => confirmInvoiceEmission(ds, id, emission({ issueDate: '2026-10-20', currency: 'USD' }), ctx))
    expect(f).toHaveProperty('issueDate')
    expect(f).toHaveProperty('currency')
    const next = confirmInvoiceEmission(ds, id, emission(), ctx)
    expect(() => confirmInvoiceEmission(next, id, emission(), ctx)).toThrow(/preparada/)
  })

  it('fiscal number is unique per issuer, voucher type and point of sale', () => {
    const init = prepared()
    const { id, ctx } = init
    let ds = init.ds
    ds = confirmInvoiceEmission(ds, id, emission(), ctx)
    // inv_10 is a prepared Nordvik invoice (USD).
    const dup = fieldsOf(() => confirmInvoiceEmission(ds, 'inv_10', emission({ number: '00000501', currency: 'USD', total: 1300 }), ctx))
    expect(dup.number).toMatch(/ya está registrado/)
    const other = confirmInvoiceEmission(ds, 'inv_10', emission({ pointOfSale: '4', number: '501', currency: 'USD', total: 1300 }), ctx)
    expect(other.invoices.find((i) => i.id === 'inv_10')!.lifecycle).toBe('issued')
  })

  it('uses the client condition when the PO has none; manual terms only when nothing applies', () => {
    const ctx = testContext()
    let ds = seed()
    ds = confirmInvoiceEmission(ds, 'inv_10', emission({ currency: 'USD', total: 1300 }), ctx)
    const inv = ds.invoices.find((i) => i.id === 'inv_10')!
    expect(inv.paymentTerms).toMatchObject({ source: 'client', days: 45, dayType: 'calendar' })
    expect(inv.dueDate).toBe(addCalendarDays('2026-10-16', 45))
    let noTerms = seed()
    noTerms = { ...noTerms, clients: noTerms.clients.map((c) => (c.id === 'cli_nordvik' ? { ...c, paymentTermsDays: 0 } : c)) }
    expect(fieldsOf(() => confirmInvoiceEmission(noTerms, 'inv_10', emission({ currency: 'USD', total: 1300 }), ctx))).toHaveProperty('terms')
    const manual = confirmInvoiceEmission(noTerms, 'inv_10', emission({ currency: 'USD', total: 1300, manualTerms: { days: 10, dayType: 'business', reason: 'Acuerdo por email del 10/10' } }), ctx)
    expect(manual.invoices.find((i) => i.id === 'inv_10')).toMatchObject({ dueDate: '2026-10-30', paymentTerms: { source: 'manual', reason: 'Acuerdo por email del 10/10' } })
  })

  it('business days skip weekends only; calendar days do not', () => {
    expect(addBusinessDays('2026-10-16', 1)).toBe('2026-10-19') // Friday → Monday
    expect(addBusinessDays('2026-10-16', 10)).toBe('2026-10-30')
    expect(addCalendarDays('2026-10-16', 10)).toBe('2026-10-26')
  })

  it('due dates are a historical snapshot; exceptions are justified and keep the computed date', () => {
    const init = prepared()
    const { id, ctx } = init
    let ds = init.ds
    ds = confirmInvoiceEmission(ds, id, emission(), ctx)
    ds = { ...ds, openOrders: ds.openOrders.map((o) => (o.id === 'oca_pv_nqn' ? { ...o, paymentTerms: { days: 90, dayType: 'business' as const } } : o)) }
    expect(ds.invoices.find((i) => i.id === id)!.dueDate).toBe('2026-11-30')
    expect(fieldsOf(() => changeInvoiceDueDate(ds, id, '2026-12-15', ' ', ctx))).toHaveProperty('reason')
    ds = changeInvoiceDueDate(ds, id, '2026-12-15', 'Cliente pidió 15 días por cierre contable', ctx)
    const inv = ds.invoices.find((i) => i.id === id)!
    expect(inv).toMatchObject({ dueDate: '2026-12-15', paymentTerms: { computedDueDate: '2026-11-30', exception: { dueDate: '2026-12-15' } } })
    expect(ds.openOrders.find((o) => o.id === 'oca_pv_nqn')!.paymentTerms!.days).toBe(90) // the PO is never touched by the exception
  })

  it('fiscal corrections are explicit and traced', () => {
    const init = prepared()
    const { id, ctx } = init
    let ds = init.ds
    ds = confirmInvoiceEmission(ds, id, emission(), ctx)
    expect(fieldsOf(() => correctFiscalData(ds, id, emission({ number: '502' }), '', ctx))).toHaveProperty('reason')
    ds = correctFiscalData(ds, id, emission({ number: '502', issueDate: '2026-10-15' }), 'Número mal tipeado', ctx)
    const inv = ds.invoices.find((i) => i.id === id)!
    expect(inv).toMatchObject({ externalRef: '00003-00000502', dueDate: '2026-11-29' })
    expect(inv.history![0]).toMatchObject({ action: 'Datos fiscales corregidos' })
    expect(inv.history![0].detail).toMatch(/00000501.*→.*00000502/)
  })
})

describe('collections, withholdings and reconciliation', () => {
  const issued = () => {
    const p = prepared()
    return { ...p, ds: confirmInvoiceEmission(p.ds, p.id, emission(), p.ctx) }
  }

  it('two partial collections and IVA / Ganancias / IIBB withholdings reconcile the invoice', () => {
    const init = issued()
    const { id, ctx } = init
    let ds = init.ds
    ds = recordReceipt(ds, receipt({ amount: 1000000, reference: 'TRF-1', allocations: [{ invoiceId: id, amount: 1000000 }] }), 'r1', ctx).ds
    expect(receivableRows(ds, TODAY).find((r) => r.invoice.id === id)).toMatchObject({ status: 'partial', paid: 1000000, outstanding: 890000 })
    ds = recordReceipt(
      ds,
      receipt({
        amount: 600000,
        reference: 'TRF-2',
        allocations: [{ invoiceId: id, amount: 600000 }],
        withholdings: [
          { type: 'iva', invoiceId: id, amount: 120000, certificateRef: 'C-IVA-1' },
          { type: 'ganancias', invoiceId: id, amount: 100000 },
          { type: 'iibb', invoiceId: id, amount: 70000, jurisdiction: 'Neuquén' },
        ],
      }),
      'r2',
      ctx,
    ).ds
    const row = receivableRows(ds, TODAY).find((r) => r.invoice.id === id)!
    expect(row).toMatchObject({ status: 'reconciled', paid: 1600000, withheld: 290000, outstanding: 0, withheldByType: { iva: 120000, ganancias: 100000, iibb: 70000 } })
    // Withholdings are not cash: settlements (Phase 4.5) keep using deposited money only.
    expect(fin(ds, id).paid).toBe(1600000)
  })

  it("reproduces Eugenia's example exactly (USD, cents-safe)", () => {
    const ctx = testContext()
    let ds = seed()
    ds = confirmInvoiceEmission(ds, 'inv_10', emission({ currency: 'USD', total: 5000 }), ctx)
    ds = recordReceipt(
      ds,
      { clientId: 'cli_nordvik', date: TODAY, currency: 'USD', amount: 4200, method: 'wire', reference: 'W-5000', allocations: [{ invoiceId: 'inv_10', amount: 4200 }], withholdings: [
        { type: 'iva', invoiceId: 'inv_10', amount: 300 },
        { type: 'ganancias', invoiceId: 'inv_10', amount: 350 },
        { type: 'iibb', invoiceId: 'inv_10', amount: 150 },
      ] },
      'ex',
      ctx,
    ).ds
    expect(fin(ds, 'inv_10')).toMatchObject({ total: 5000, paid: 4200, withheld: 800, outstanding: 0, status: 'paid' })
  })

  it('detects over-application of collections and withholdings, also when withholdings arrive later', () => {
    const init = issued()
    const { id, ctx } = init
    let ds = init.ds
    const over = fieldsOf(() => recordReceipt(ds, receipt({ amount: 1800000, allocations: [{ invoiceId: id, amount: 1800000 }], withholdings: [{ type: 'iva', invoiceId: id, amount: 100000 }] }), 'o1', ctx))
    expect(over.withholdings).toMatch(/superan su saldo/)
    const r = recordReceipt(ds, receipt({ amount: 1800000, reference: 'TRF-9', allocations: [{ invoiceId: id, amount: 1800000 }] }), 'o2', ctx)
    ds = r.ds
    expect(fieldsOf(() => addReceiptWithholdings(ds, r.receiptId, [{ type: 'iibb', invoiceId: id, amount: 90000.01 }], ctx))).toHaveProperty('withholdings')
    ds = addReceiptWithholdings(ds, r.receiptId, [{ type: 'iibb', invoiceId: id, amount: 90000 }], ctx)
    expect(fin(ds, id).outstanding).toBe(0)
    expect(fieldsOf(() => addReceiptWithholdings(ds, r.receiptId, [{ type: 'other', invoiceId: id, amount: 0 }], ctx))).toHaveProperty('withholdings.0.amount')
  })

  it('a partially identified deposit keeps the unexplained difference pending, without inventing withholdings', () => {
    const init = issued()
    const { id, ctx } = init
    let ds = init.ds
    const r = recordReceipt(ds, receipt({ amount: 1700000, reference: 'TRF-P', allocations: [{ invoiceId: id, amount: 1600000 }] }), 'p1', ctx)
    ds = r.ds
    const rec = ds.receipts.find((x) => x.id === r.receiptId)!
    expect(rec.withholdings).toBeUndefined()
    expect(receivableRows(ds, TODAY).find((x) => x.invoice.id === id)).toMatchObject({ status: 'partial', outstanding: 290000 })
  })
})

describe('attachments, dashboard, migration and regressions', () => {
  it('validates attachment type and size and records references without claiming a file', () => {
    const { ds, id, ctx } = prepared()
    expect(validateFile('application/pdf', 1000)).toBeUndefined()
    expect(validateFile('application/x-msdownload', 1000)).toMatch(/Formato/)
    expect(validateFile('image/png', 6 * 1024 * 1024)).toMatch(/5 MB/)
    expect(fieldsOf(() => addAttachment(ds, { entity: 'invoice', entityId: id, name: 'x.exe', mime: 'application/x-msdownload', size: 10, storage: 'indexeddb' }, ctx))).toHaveProperty('file')
    expect(fieldsOf(() => addAttachment(ds, { entity: 'invoice', entityId: id, name: 'Factura', storage: 'reference' }, ctx))).toHaveProperty('reference')
    const r = addAttachment(ds, { entity: 'invoice', entityId: id, name: 'Factura ARCA', storage: 'reference', reference: 'Drive/Facturas/0003-501.pdf' }, ctx)
    expect(r.ds.attachments.at(-1)).toMatchObject({ storage: 'reference', mime: undefined, size: undefined })
    // Metadata persists with the dataset (files live in IndexedDB).
    const mem: Record<string, string> = {}
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    writeDataset(storage, r.ds, 'now')
    expect(readDataset(storage).dataset!.attachments.at(-1)!.reference).toBe('Drive/Facturas/0003-501.pdf')
  })

  it('dashboard: pending per currency (never mixed), overdue and upcoming dues', () => {
    const init = prepared()
    const { id, ctx } = init
    let ds = init.ds
    ds = confirmInvoiceEmission(ds, id, emission({ issueDate: '2026-09-01' }), ctx) // due 2026-10-16 → overdue
    const s = receivablesSummary(ds, TODAY)
    const rows = receivableRows(ds, TODAY).filter((r) => r.status !== 'cancelled')
    for (const c of ['USD', 'EUR', 'ARS'] as const) expect(s.pendingByCurrency[c] ?? 0).toBe(rows.filter((r) => r.currency === c).reduce((a, r) => Math.round((a + r.outstanding) * 100) / 100, 0))
    expect(s.overdueByCurrency.ARS).toBeGreaterThanOrEqual(1890000)
    expect(s.overdueCount).toBe(rows.filter((r) => r.status === 'overdue').length)
    expect(s.upcoming.every((r) => r.daysToDue >= 0 && r.daysToDue <= 30)).toBe(true)
  })

  it('v6 → v7 migration preserves everything and does not reinterpret historical invoices', () => {
    const v6 = base()
    const { attachments: _a, ...data } = v6
    const mem: Record<string, string> = { 'sigr.demo.dataset': JSON.stringify({ schemaVersion: 6, savedAt: 'x', data: { ...data, schemaVersion: 6 } }) }
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    const { dataset, issue } = readDataset(storage)
    expect(issue).toBe('migrated')
    expect(dataset!.schemaVersion).toBe(8)
    for (const inv of v6.invoices) expect(dataset!.invoices.find((i) => i.id === inv.id)).toEqual(inv)
    expect(dataset!.invoices.filter((i) => i.legacy && i.lifecycle === 'issued').every((i) => !i.fiscal)).toBe(true)
    expect(dataset!.attachments).toEqual([])
    expect(dataset!.openOrders.find((o) => o.id === 'oca_pv_nqn')!.paymentTerms).toEqual({ days: 45, dayType: 'calendar' })
    // Demo invoice (fictional) issued and reconciled with withholdings.
    const demo = dataset!.invoices.find((i) => i.notes === 'Datos de demostración.')!
    expect(receivableRows(dataset!, TODAY).find((r) => r.invoice.id === demo.id)).toMatchObject({ status: 'reconciled', withheld: 290000 })
  })

  it('Phase 4.5 settlements are unchanged', () => {
    const ds = seed()
    expect(settlementFinancials(ds, ds.settlements.find((s) => s.id === 'set_0143')!, TODAY)).toMatchObject({ collected: 26900, partnerShare: 3240, signal: 'red' })
  })
})
