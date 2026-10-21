import type { CurrencyCode, CustomerReceipt, Invoice, WithholdingType } from '@/types/domain'
import type { Dataset } from '../dataset'
import { invoiceFinancials } from './derive'
import { addMoney, cmpMoney } from './money'

/*
 * Accounts receivable (Phase 4.7). Only invoices whose emission was registered
 * generate receivables. Per invoice and currency:
 *   TOTAL FACTURADO − COBROS BANCARIOS − RETENCIONES DOCUMENTADAS = SALDO COMERCIAL
 */

export type ReceivableStatus = 'pending' | 'partial' | 'reconciled' | 'overdue' | 'cancelled'

export interface ReceivableRow {
  invoice: Invoice
  currency: CurrencyCode
  total: number
  paid: number
  withheld: number
  withheldByType: Partial<Record<WithholdingType, number>>
  outstanding: number
  /** Days until due (negative = days overdue). */
  daysToDue: number
  status: ReceivableStatus
  openOrderIds: string[]
  purchaseOrderIds: string[]
  certificateIds: string[]
}

const DAY = 86_400_000
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY)
const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))]

export function receivableRow(ds: Dataset, inv: Invoice, today: string): ReceivableRow {
  const f = invoiceFinancials(ds, inv, today)
  const withheldByType: ReceivableRow['withheldByType'] = {}
  for (const r of ds.receipts) {
    if (r.status !== 'recorded') continue
    for (const w of r.withholdings ?? []) if (w.invoiceId === inv.id) withheldByType[w.type] = addMoney(withheldByType[w.type] ?? 0, w.amount)
  }
  let status: ReceivableStatus
  if (inv.lifecycle === 'cancelled') status = 'cancelled'
  else if (cmpMoney(f.outstanding, 0) <= 0) status = 'reconciled'
  else if (f.overdue) status = 'overdue'
  else if (cmpMoney(addMoney(f.paid, f.withheld), 0) > 0) status = 'partial'
  else status = 'pending'
  return {
    invoice: inv,
    currency: inv.currency,
    total: f.total,
    paid: f.paid,
    withheld: f.withheld,
    withheldByType,
    outstanding: f.outstanding,
    daysToDue: days(today, inv.dueDate),
    status,
    openOrderIds: uniq(inv.lines.map((l) => l.openOrderId)),
    purchaseOrderIds: uniq(inv.lines.map((l) => l.purchaseOrderId)),
    certificateIds: uniq(inv.lines.map((l) => l.certificateId)),
  }
}

/** Issued invoices (and issued-then-cancelled ones) as receivables. Drafts never appear. */
export function receivableRows(ds: Dataset, today: string): ReceivableRow[] {
  return ds.invoices
    .filter((i) => i.lifecycle === 'issued' || (i.lifecycle === 'cancelled' && Boolean(i.issuedAt)))
    .map((i) => receivableRow(ds, i, today))
    .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate))
}

export interface ReceivablesSummary {
  pendingByCurrency: Partial<Record<CurrencyCode, number>>
  overdueByCurrency: Partial<Record<CurrencyCode, number>>
  overdueCount: number
  /** Open invoices due within `horizon` days. */
  upcoming: ReceivableRow[]
  /** Expected collections by due date and currency (open balances). */
  expectedByDate: { date: string; currency: CurrencyCode; amount: number }[]
  recentReceipts: CustomerReceipt[]
}

export function receivablesSummary(ds: Dataset, today: string, horizon = 30): ReceivablesSummary {
  const rows = receivableRows(ds, today).filter((r) => r.status !== 'cancelled' && cmpMoney(r.outstanding, 0) > 0)
  const s: ReceivablesSummary = { pendingByCurrency: {}, overdueByCurrency: {}, overdueCount: 0, upcoming: [], expectedByDate: [], recentReceipts: [] }
  const expected = new Map<string, { date: string; currency: CurrencyCode; amount: number }>()
  for (const r of rows) {
    s.pendingByCurrency[r.currency] = addMoney(s.pendingByCurrency[r.currency] ?? 0, r.outstanding)
    if (r.status === 'overdue') {
      s.overdueCount++
      s.overdueByCurrency[r.currency] = addMoney(s.overdueByCurrency[r.currency] ?? 0, r.outstanding)
    } else if (r.daysToDue <= horizon) {
      s.upcoming.push(r)
      const k = `${r.invoice.dueDate}|${r.currency}`
      const e = expected.get(k) ?? { date: r.invoice.dueDate, currency: r.currency, amount: 0 }
      e.amount = addMoney(e.amount, r.outstanding)
      expected.set(k, e)
    }
  }
  s.expectedByDate = [...expected.values()].sort((a, b) => a.date.localeCompare(b.date))
  s.recentReceipts = ds.receipts.filter((r) => r.status === 'recorded').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
  return s
}
