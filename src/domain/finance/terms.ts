import type { Invoice, InvoicePaymentTerms, PaymentDayType, PaymentTerms } from '@/types/domain'
import { findById } from '../collections'
import type { Dataset } from '../dataset'

/*
 * Payment terms. Confirmed rule: the term counts from the invoice ISSUE date.
 * Business-day policy: only Saturdays and Sundays are skipped. Holidays are NOT
 * configured in SIGR yet, so they are not discounted.
 */

export const BUSINESS_DAY_POLICY = 'Días hábiles: se excluyen sábados y domingos. Los feriados no están configurados y no se descuentan.'

const parse = (iso: string) => new Date(`${iso}T12:00:00Z`)
const fmt = (d: Date) => d.toISOString().slice(0, 10)

export function addCalendarDays(iso: string, days: number): string {
  const d = parse(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return fmt(d)
}

export function addBusinessDays(iso: string, days: number): string {
  const d = parse(iso)
  let left = days
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return fmt(d)
}

export const computeDueDate = (issueDate: string, t: PaymentTerms) => (t.dayType === 'business' ? addBusinessDays(issueDate, t.days) : addCalendarDays(issueDate, t.days))

export function validTerms(t: Partial<PaymentTerms> | undefined): t is PaymentTerms {
  return !!t && typeof t.days === 'number' && Number.isInteger(t.days) && t.days >= 0 && t.days <= 365 && (t.dayType === 'calendar' || t.dayType === 'business')
}

export type ResolvedTerms = Omit<InvoicePaymentTerms, 'computedDueDate'>

/** Priority: 1) linked PO condition, 2) client commercial condition. Manual terms are the caller's fallback. */
export function resolvePaymentTerms(ds: Dataset, inv: Pick<Invoice, 'clientId' | 'lines'>): ResolvedTerms | undefined {
  for (const l of inv.lines) {
    if (l.openOrderId) {
      const o = findById(ds.openOrders, l.openOrderId)
      if (o && validTerms(o.paymentTerms)) return { ...o.paymentTerms, source: 'open-order', sourceRef: o.id }
    }
    if (l.purchaseOrderId) {
      const po = findById(ds.purchaseOrders, l.purchaseOrderId)
      if (po && validTerms(po.paymentTerms)) return { ...po.paymentTerms, source: 'purchase-order', sourceRef: po.id }
    }
  }
  const client = findById(ds.clients, inv.clientId)
  if (client && Number.isInteger(client.paymentTermsDays) && client.paymentTermsDays > 0)
    return { days: client.paymentTermsDays, dayType: (client.policy.paymentDayType ?? 'calendar') as PaymentDayType, source: 'client', sourceRef: client.id }
  return undefined
}
