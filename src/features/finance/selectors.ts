import { DEMO_TODAY } from '@/config/brand'
import { addMoney, cmpMoney } from '@/domain/finance/money'
import type { Workspace } from '@/hooks/useWorkspace'
import { daysUntil, monthKey, monthLabel } from '@/lib/dates'
import type { MoneyByCurrency } from '@/lib/money'
import type { CurrencyCode, Invoice, SupplierObligation } from '@/types/domain'

/*
 * Read-side aggregates for finance screens. Every figure is derived from the
 * Phase 4 records through the workspace's precomputed views (invoiceFin,
 * obligationFin) — nothing is read from stored totals.
 */

const add = (m: MoneyByCurrency, c: CurrencyCode, v: number) => {
  m[c] = addMoney(m[c] ?? 0, v)
}

/** Issued invoices (drafts and cancelled ones are not part of receivables). */
export const issuedInvoices = (invoices: Invoice[]) => invoices.filter((i) => i.lifecycle === 'issued')

export const outstandingOf = (ws: Workspace, i: Invoice) => ws.invoiceFin.get(i.id)?.outstanding ?? 0
export const obligationOutstanding = (ws: Workspace, o: SupplierObligation) => ws.obligationFin.get(o.id)?.outstanding ?? 0

export interface LedgerSummary {
  invoiced: MoneyByCurrency
  collected: MoneyByCurrency
  receivable: MoneyByCurrency
  overdueReceivable: MoneyByCurrency
  /** Supplier obligations (amount owed, not yet necessarily paid). */
  supplierCosts: MoneyByCurrency
  supplierPaid: MoneyByCurrency
  payable: MoneyByCurrency
  openInvoices: number
  overdueInvoices: number
  openPayables: number
}

export function summarizeLedger(ws: Workspace, invoices: Invoice[] = ws.invoices, obligations: SupplierObligation[] = ws.obligations): LedgerSummary {
  const s: LedgerSummary = { invoiced: {}, collected: {}, receivable: {}, overdueReceivable: {}, supplierCosts: {}, supplierPaid: {}, payable: {}, openInvoices: 0, overdueInvoices: 0, openPayables: 0 }
  for (const inv of issuedInvoices(invoices)) {
    const f = ws.invoiceFin.get(inv.id)!
    add(s.invoiced, inv.currency, f.total)
    add(s.collected, inv.currency, f.paid)
    if (cmpMoney(f.outstanding, 0) > 0) {
      add(s.receivable, inv.currency, f.outstanding)
      s.openInvoices++
    }
    if (f.overdue) {
      add(s.overdueReceivable, inv.currency, f.outstanding)
      s.overdueInvoices++
    }
  }
  for (const ob of obligations.filter((o) => o.lifecycle !== 'cancelled')) {
    const f = ws.obligationFin.get(ob.id)!
    add(s.supplierCosts, ob.currency, ob.amount)
    add(s.supplierPaid, ob.currency, f.paid)
    if (cmpMoney(f.outstanding, 0) > 0) {
      add(s.payable, ob.currency, f.outstanding)
      s.openPayables++
    }
  }
  return s
}

export interface CashflowPoint {
  key: string
  month: string
  invoiced: number
  collected: number
}

/** Last `count` month keys ending at the demo "today". */
export function recentMonths(count: number): string[] {
  const [y, m] = DEMO_TODAY.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - (count - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

/** Monthly invoiced (issued totals by issue date) and collected (receipt allocations by date) in one currency. */
export function monthlyCashflow(ws: Workspace, currency: CurrencyCode, months: string[]): CashflowPoint[] {
  const invoiced = new Map<string, number>()
  const collected = new Map<string, number>()
  for (const inv of issuedInvoices(ws.invoices).filter((i) => i.currency === currency)) {
    const k = monthKey(inv.issueDate)
    invoiced.set(k, addMoney(invoiced.get(k) ?? 0, ws.invoiceFin.get(inv.id)!.total))
  }
  for (const r of ws.receipts.filter((x) => x.status === 'recorded' && x.currency === currency)) {
    for (const a of r.allocations) collected.set(monthKey(a.date), addMoney(collected.get(monthKey(a.date)) ?? 0, a.amount))
  }
  return months.map((key) => ({ key, month: monthLabel(key), invoiced: invoiced.get(key) ?? 0, collected: collected.get(key) ?? 0 }))
}

export interface AgingBucket {
  id: 'current' | 'd30' | 'd60' | 'd60plus'
  label: string
  count: number
  amounts: MoneyByCurrency
}

/** Open receivables by days past due. */
export function receivablesAging(ws: Workspace, invoices: Invoice[] = ws.invoices): AgingBucket[] {
  const buckets: (AgingBucket & { test: (d: number) => boolean })[] = [
    { id: 'current', label: 'Al día', count: 0, amounts: {}, test: (d) => d <= 0 },
    { id: 'd30', label: '1–30 días', count: 0, amounts: {}, test: (d) => d > 0 && d <= 30 },
    { id: 'd60', label: '31–60 días', count: 0, amounts: {}, test: (d) => d > 30 && d <= 60 },
    { id: 'd60plus', label: 'Más de 60 días', count: 0, amounts: {}, test: (d) => d > 60 },
  ]
  for (const inv of issuedInvoices(invoices)) {
    const out = outstandingOf(ws, inv)
    if (cmpMoney(out, 0) <= 0) continue
    const b = buckets.find((x) => x.test(-daysUntil(inv.dueDate)))!
    b.count++
    add(b.amounts, inv.currency, out)
  }
  return buckets.map(({ test: _t, ...b }) => b)
}

/** Outstanding owed to one supplier, per currency (active obligations only). */
export function supplierBalances(ws: Workspace, supplierId: string): MoneyByCurrency {
  const out: MoneyByCurrency = {}
  for (const o of ws.obligations) {
    if (o.supplierId !== supplierId || o.lifecycle === 'cancelled') continue
    const v = obligationOutstanding(ws, o)
    if (cmpMoney(v, 0) > 0) add(out, o.currency, v)
  }
  return out
}
