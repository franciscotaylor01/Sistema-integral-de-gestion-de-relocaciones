import { DEMO_TODAY } from '@/config/brand'
import { monthKey, monthLabel } from '@/lib/dates'
import { sumByCurrency, type MoneyByCurrency } from '@/lib/money'
import type { CurrencyCode, Invoice, Payment, SupplierPayable } from '@/types/domain'

/** Drafts are not part of the receivables ledger. */
export const billedInvoices = (invoices: Invoice[]) => invoices.filter((i) => i.status !== 'draft')

export const invoiceOutstanding = (i: Invoice) => (i.status === 'draft' ? 0 : i.amount - i.collected)
export const payableOutstanding = (p: SupplierPayable) => p.amount - p.paid

export interface LedgerSummary {
  invoiced: MoneyByCurrency
  collected: MoneyByCurrency
  receivable: MoneyByCurrency
  overdueReceivable: MoneyByCurrency
  supplierCosts: MoneyByCurrency
  supplierPaid: MoneyByCurrency
  payable: MoneyByCurrency
  openInvoices: number
  overdueInvoices: number
  openPayables: number
}

export function summarizeLedger(invoices: Invoice[], payables: SupplierPayable[]): LedgerSummary {
  const billed = billedInvoices(invoices)
  const open = billed.filter((i) => invoiceOutstanding(i) > 0)
  const overdue = billed.filter((i) => i.status === 'overdue')
  const openPayables = payables.filter((p) => payableOutstanding(p) > 0)
  return {
    invoiced: sumByCurrency(billed, (i) => i.currency, (i) => i.amount),
    collected: sumByCurrency(billed, (i) => i.currency, (i) => i.collected),
    receivable: sumByCurrency(open, (i) => i.currency, invoiceOutstanding),
    overdueReceivable: sumByCurrency(overdue, (i) => i.currency, invoiceOutstanding),
    supplierCosts: sumByCurrency(payables, (p) => p.currency, (p) => p.amount),
    supplierPaid: sumByCurrency(payables, (p) => p.currency, (p) => p.paid),
    payable: sumByCurrency(openPayables, (p) => p.currency, payableOutstanding),
    openInvoices: open.length,
    overdueInvoices: overdue.length,
    openPayables: openPayables.length,
  }
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

/** Monthly invoiced (by issue date) and collected (by payment date) in one currency. */
export function monthlyCashflow(invoices: Invoice[], payments: Payment[], currency: CurrencyCode, months: string[]): CashflowPoint[] {
  return months.map((key) => ({
    key,
    month: monthLabel(key),
    invoiced: billedInvoices(invoices)
      .filter((i) => i.currency === currency && monthKey(i.issueDate) === key)
      .reduce((s, i) => s + i.amount, 0),
    collected: payments
      .filter((p) => p.direction === 'incoming' && p.currency === currency && monthKey(p.date) === key)
      .reduce((s, p) => s + p.amount, 0),
  }))
}

export interface AgingBucket {
  id: 'current' | 'd30' | 'd60' | 'd60plus'
  label: string
  count: number
  amounts: MoneyByCurrency
}

/** Receivables aging by days past due (relative to the demo "today"). */
export function receivablesAging(invoices: Invoice[], daysPastDue: (iso: string) => number): AgingBucket[] {
  const open = billedInvoices(invoices).filter((i) => invoiceOutstanding(i) > 0)
  const buckets: { id: AgingBucket['id']; label: string; test: (d: number) => boolean }[] = [
    { id: 'current', label: 'Al día', test: (d) => d <= 0 },
    { id: 'd30', label: '1–30 días', test: (d) => d > 0 && d <= 30 },
    { id: 'd60', label: '31–60 días', test: (d) => d > 30 && d <= 60 },
    { id: 'd60plus', label: 'Más de 60 días', test: (d) => d > 60 },
  ]
  return buckets.map((b) => {
    const items = open.filter((i) => b.test(daysPastDue(i.dueDate)))
    return { id: b.id, label: b.label, count: items.length, amounts: sumByCurrency(items, (i) => i.currency, invoiceOutstanding) }
  })
}
