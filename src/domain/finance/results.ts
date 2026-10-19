import type { CurrencyCode, ProjectRecord } from '@/types/domain'
import { projectCommercial } from '../commercial/traceability'
import type { Dataset } from '../dataset'
import { invoiceFinancials, obligationFinancials } from './derive'
import { addMoney, cmpMoney, subMoney } from './money'

type PerCurrency<T> = Partial<Record<CurrencyCode, T>>

export interface MarginResult {
  /** Present only when the bases exist in that currency. */
  amount?: number
  pct?: number
  /** Why the margin could not be computed ("Sin datos suficientes"). */
  note?: string
}

export interface CurrencyResult {
  currency: CurrencyCode
  /** Commercially agreed (approved quotations, or agreed prices when quotes are optional). */
  agreed: number
  /** Issued invoices — net of taxes (revenue basis) and gross (receivable basis). */
  invoicedNet: number
  invoicedGross: number
  collected: number
  receivable: number
  overdueReceivable: number
  /** Planning estimates on services (not costs). */
  estimatedCost: number
  /** Actually incurred direct costs (cost records). */
  actualCost: number
  obligations: number
  supplierPaid: number
  supplierUnpaid: number
  /** Estimate: agreed − estimated cost. */
  estimatedMargin: MarginResult
  /** Operational margin on invoiced revenue: invoiced net − actual direct costs (before taxes & overhead). */
  operationalMargin: MarginResult
  /** Cash: collected − paid to suppliers. Not accounting profit. */
  cashNet: number
}

const pct = (part: number, base: number) => (cmpMoney(base, 0) > 0 ? Math.round((part / base) * 1000) / 10 : undefined)

/**
 * Financial results of one project, one block per currency. Amounts in
 * different currencies are never added together.
 */
export function projectResults(ds: Dataset, project: ProjectRecord, today: string): CurrencyResult[] {
  const acc = new Map<CurrencyCode, Omit<CurrencyResult, 'estimatedMargin' | 'operationalMargin' | 'cashNet' | 'currency'>>()
  const get = (c: CurrencyCode) => {
    let r = acc.get(c)
    if (!r) {
      r = { agreed: 0, invoicedNet: 0, invoicedGross: 0, collected: 0, receivable: 0, overdueReceivable: 0, estimatedCost: 0, actualCost: 0, obligations: 0, supplierPaid: 0, supplierUnpaid: 0 }
      acc.set(c, r)
    }
    return r
  }

  for (const c of projectCommercial(ds, project, today).values()) {
    const basis = Object.keys(c.approved).length ? c.approved : {}
    for (const [cur, v] of Object.entries(basis) as [CurrencyCode, number][]) get(cur).agreed = addMoney(get(cur).agreed, v)
  }
  const client = ds.clients.find((c) => c.id === project.clientId)
  for (const s of ds.services.filter((x) => x.projectId === project.id)) {
    if (s.estimatedCost) get(project.currency).estimatedCost = addMoney(get(project.currency).estimatedCost, s.estimatedCost)
    // Clients without mandatory quotes: the agreed service price is the commercial basis.
    if (client && !client.policy.requiresApprovedQuote && s.price && !ds.quotations.some((q) => q.projectId === project.id && q.status === 'approved' && q.lines.some((l) => l.serviceId === s.id))) {
      get(project.currency).agreed = addMoney(get(project.currency).agreed, s.price)
    }
  }
  for (const inv of ds.invoices.filter((i) => i.projectId === project.id && i.lifecycle === 'issued')) {
    const f = invoiceFinancials(ds, inv, today)
    const r = get(inv.currency)
    r.invoicedNet = addMoney(r.invoicedNet, f.subtotal)
    r.invoicedGross = addMoney(r.invoicedGross, f.total)
    r.collected = addMoney(r.collected, f.paid)
    r.receivable = addMoney(r.receivable, f.outstanding)
    if (f.overdue) r.overdueReceivable = addMoney(r.overdueReceivable, f.outstanding)
  }
  for (const cost of ds.costs.filter((x) => x.projectId === project.id && x.status === 'incurred')) {
    get(cost.currency).actualCost = addMoney(get(cost.currency).actualCost, cost.amount)
  }
  for (const ob of ds.obligations.filter((o) => o.projectId === project.id && o.lifecycle !== 'cancelled')) {
    const f = obligationFinancials(ds, ob, today)
    const r = get(ob.currency)
    r.obligations = addMoney(r.obligations, ob.amount)
    r.supplierPaid = addMoney(r.supplierPaid, f.paid)
    r.supplierUnpaid = addMoney(r.supplierUnpaid, f.outstanding)
  }

  return [...acc.entries()].map(([currency, r]) => {
    const estimatedMargin: MarginResult =
      cmpMoney(r.agreed, 0) > 0 && cmpMoney(r.estimatedCost, 0) > 0
        ? { amount: subMoney(r.agreed, r.estimatedCost), pct: pct(subMoney(r.agreed, r.estimatedCost), r.agreed) }
        : { note: 'Sin datos suficientes (falta valor acordado o costo estimado en esta moneda)' }
    const operationalMargin: MarginResult =
      cmpMoney(r.invoicedNet, 0) > 0
        ? { amount: subMoney(r.invoicedNet, r.actualCost), pct: pct(subMoney(r.invoicedNet, r.actualCost), r.invoicedNet) }
        : { note: cmpMoney(r.actualCost, 0) > 0 ? 'Sin facturación en esta moneda: hay costos pero no ingresos para comparar' : 'Sin datos suficientes' }
    return { currency, ...r, estimatedMargin, operationalMargin, cashNet: subMoney(r.collected, r.supplierPaid) }
  })
}

/** General company expenses (never mixed into project results), per currency. */
export function companyExpenses(ds: Pick<Dataset, 'costs'>): PerCurrency<number> {
  const out: PerCurrency<number> = {}
  for (const c of ds.costs.filter((x) => x.scope === 'company' && x.status === 'incurred')) out[c.currency] = addMoney(out[c.currency] ?? 0, c.amount)
  return out
}
