import type { CurrencyCode, CustomerReceipt, Invoice, InvoiceStatus, PayableStatus, SupplierObligation, SupplierPayment } from '@/types/domain'
import type { Dataset } from '../dataset'
import { addMoney, cmpMoney, mulMoney, percentOf, subMoney } from './money'

/*
 * Derived financial views. Paid amounts, balances, overdue conditions and
 * display statuses are always computed from the underlying records
 * (invoices, receipts, obligations, payments) — never stored.
 */

const DAY = 86_400_000
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

export interface InvoiceTotals {
  subtotal: number
  taxes: { id: string; label: string; ratePct: number; amount: number }[]
  tax: number
  total: number
}

export function invoiceTotals(inv: Pick<Invoice, 'lines' | 'taxes'>): InvoiceTotals {
  const subtotal = addMoney(...inv.lines.map((l) => mulMoney(l.unitPrice, l.quantity)))
  const taxes = inv.taxes.map((t) => ({ ...t, amount: percentOf(subtotal, t.ratePct) }))
  const tax = addMoney(...taxes.map((t) => t.amount))
  return { subtotal, taxes, tax, total: addMoney(subtotal, tax) }
}

export const lineSubtotal = (l: { unitPrice: number; quantity: number }) => mulMoney(l.unitPrice, l.quantity)

export interface FinanceIndex {
  paidByInvoice: Map<string, number>
  /** Documented withholdings applied per invoice (recorded receipts only). */
  withheldByInvoice: Map<string, number>
  lastReceiptByInvoice: Map<string, string>
  paidByObligation: Map<string, number>
  lastPaymentByObligation: Map<string, string>
}

const indexCache = new WeakMap<object, FinanceIndex>()

/** Payments applied per invoice / obligation (recorded, non-reversed only). */
export function financeIndex(ds: Pick<Dataset, 'receipts' | 'supplierPayments'>): FinanceIndex {
  const cached = indexCache.get(ds)
  if (cached) return cached
  const idx: FinanceIndex = { paidByInvoice: new Map(), withheldByInvoice: new Map(), lastReceiptByInvoice: new Map(), paidByObligation: new Map(), lastPaymentByObligation: new Map() }
  for (const r of ds.receipts) {
    if (r.status !== 'recorded') continue
    for (const a of r.allocations) {
      idx.paidByInvoice.set(a.invoiceId, addMoney(idx.paidByInvoice.get(a.invoiceId) ?? 0, a.amount))
      if ((idx.lastReceiptByInvoice.get(a.invoiceId) ?? '') < a.date) idx.lastReceiptByInvoice.set(a.invoiceId, a.date)
    }
    for (const w of r.withholdings ?? []) {
      idx.withheldByInvoice.set(w.invoiceId, addMoney(idx.withheldByInvoice.get(w.invoiceId) ?? 0, w.amount))
      if ((idx.lastReceiptByInvoice.get(w.invoiceId) ?? '') < r.date) idx.lastReceiptByInvoice.set(w.invoiceId, r.date)
    }
  }
  for (const p of ds.supplierPayments) {
    if (p.status !== 'recorded') continue
    for (const a of p.allocations) {
      if (a.reversedAt) continue
      idx.paidByObligation.set(a.obligationId, addMoney(idx.paidByObligation.get(a.obligationId) ?? 0, a.amount))
      if ((idx.lastPaymentByObligation.get(a.obligationId) ?? '') < p.date) idx.lastPaymentByObligation.set(a.obligationId, p.date)
    }
  }
  indexCache.set(ds, idx)
  return idx
}

export interface InvoiceFinancials extends InvoiceTotals {
  /** Cash deposited and applied (bank collections). */
  paid: number
  /** Documented tax withholdings applied. */
  withheld: number
  /** Commercial total computed by SIGR (lines + user-entered taxes). */
  commercialTotal: number
  outstanding: number
  status: InvoiceStatus
  overdue: boolean
  daysOverdue: number
  lastPaymentDate?: string
}

export function invoiceFinancials(ds: Pick<Dataset, 'receipts' | 'supplierPayments'>, inv: Invoice, today: string): InvoiceFinancials {
  const computed = invoiceTotals(inv)
  // Once the external emission is confirmed, the fiscal total is what the client owes.
  const totals = { ...computed, total: inv.fiscal?.total ?? computed.total }
  const idx = financeIndex(ds)
  const paid = inv.lifecycle === 'issued' ? (idx.paidByInvoice.get(inv.id) ?? 0) : 0
  const withheld = inv.lifecycle === 'issued' ? (idx.withheldByInvoice.get(inv.id) ?? 0) : 0
  const outstanding = inv.lifecycle === 'issued' ? subMoney(subMoney(totals.total, paid), withheld) : 0
  const overdue = inv.lifecycle === 'issued' && cmpMoney(outstanding, 0) > 0 && inv.dueDate < today
  let status: InvoiceStatus = inv.lifecycle
  if (inv.lifecycle === 'issued') {
    if (cmpMoney(outstanding, 0) <= 0) status = 'paid'
    else if (overdue) status = 'overdue'
    else if (cmpMoney(addMoney(paid, withheld), 0) > 0) status = 'partially-paid'
  }
  return {
    ...totals,
    commercialTotal: computed.total,
    paid,
    withheld,
    outstanding,
    status,
    overdue,
    daysOverdue: overdue ? daysBetween(inv.dueDate, today) : 0,
    lastPaymentDate: financeIndex(ds).lastReceiptByInvoice.get(inv.id),
  }
}

export const receiptAllocated = (r: Pick<CustomerReceipt, 'allocations'>) => addMoney(...r.allocations.map((a) => a.amount))
/** Unallocated remainder of a receipt: an explicit client credit / advance. */
export const receiptUnallocated = (r: CustomerReceipt) => (r.status === 'recorded' ? subMoney(r.amount, receiptAllocated(r)) : 0)

export const supplierPaymentAllocated = (p: Pick<SupplierPayment, 'allocations'>) => addMoney(...p.allocations.filter((a) => !a.reversedAt).map((a) => a.amount))
/** Unallocated remainder of a supplier payment: an explicit supplier advance. */
export const supplierPaymentUnallocated = (p: SupplierPayment) => (p.status === 'recorded' ? subMoney(p.amount, supplierPaymentAllocated(p)) : 0)

export interface ObligationFinancials {
  paid: number
  outstanding: number
  status: PayableStatus
  overdue: boolean
  daysOverdue: number
  /** Whether the agreed payment condition is met today. */
  conditionMet: boolean
  conditionNote?: string
  lastPaymentDate?: string
}

export function obligationFinancials(ds: Pick<Dataset, 'receipts' | 'supplierPayments' | 'invoices'>, ob: SupplierObligation, today: string): ObligationFinancials {
  const idx = financeIndex(ds)
  const paid = ob.lifecycle === 'cancelled' ? 0 : (idx.paidByObligation.get(ob.id) ?? 0)
  const outstanding = ob.lifecycle === 'cancelled' ? 0 : subMoney(ob.amount, paid)
  let conditionMet = true
  let conditionNote: string | undefined
  if (ob.paymentCondition === 'after-client-collection') {
    const inv = ds.invoices.find((i) => i.id === ob.clientInvoiceId)
    const fin = inv ? invoiceFinancials(ds, inv, today) : undefined
    conditionMet = fin?.status === 'paid'
    conditionNote = conditionMet ? 'Factura del cliente cobrada' : `Se paga al cobrar ${inv?.number ?? 'la factura del cliente'}`
  }
  const overdue = ob.lifecycle === 'approved' && conditionMet && cmpMoney(outstanding, 0) > 0 && ob.dueDate < today
  let status: PayableStatus
  if (ob.lifecycle === 'cancelled') status = 'cancelled'
  else if (ob.lifecycle === 'pending-approval') status = 'pending-approval'
  else if (cmpMoney(outstanding, 0) <= 0) status = 'paid'
  else if (!conditionMet) status = 'awaiting-collection'
  else if (overdue) status = 'overdue'
  else if (cmpMoney(paid, 0) > 0) status = 'partially-paid'
  else status = 'scheduled'
  return { paid, outstanding, status, overdue, daysOverdue: overdue ? daysBetween(ob.dueDate, today) : 0, conditionMet, conditionNote, lastPaymentDate: idx.lastPaymentByObligation.get(ob.id) }
}

/** Unallocated client receipts per currency (credit in favour of the client). */
export function clientCredit(ds: Pick<Dataset, 'receipts'>, clientId: string, currency: CurrencyCode): number {
  return addMoney(...ds.receipts.filter((r) => r.clientId === clientId && r.currency === currency).map(receiptUnallocated))
}

export function supplierAdvance(ds: Pick<Dataset, 'supplierPayments'>, supplierId: string, currency: CurrencyCode): number {
  return addMoney(...ds.supplierPayments.filter((p) => p.supplierId === supplierId && p.currency === currency).map(supplierPaymentUnallocated))
}
