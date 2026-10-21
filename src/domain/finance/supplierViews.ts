import type { CostRecord, CurrencyCode, Supplier, SupplierPayment } from '@/types/domain'
import { getServiceType } from '@/config/serviceCatalog'
import { findById } from '../collections'
import type { Dataset } from '../dataset'
import { addMoney } from './money'

/*
 * Phase 4.8 shared read models: every supplier/cost screen reads the same
 * collection through these selectors, so all views show the same movements.
 */

/** Newest first (creation date desc); suppliers without creation date last; ties by name then id. */
export function sortSuppliersNewestFirst(list: Supplier[]): Supplier[] {
  return [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/** Payments related to a project: applied to its obligations, or advances given for it. */
export function paymentsForProject(ds: Pick<Dataset, 'supplierPayments' | 'obligations'>, projectId: string): SupplierPayment[] {
  const obIds = new Set(ds.obligations.filter((o) => o.projectId === projectId).map((o) => o.id))
  return ds.supplierPayments.filter((p) => p.projectId === projectId || p.allocations.some((a) => obIds.has(a.obligationId)))
}

/** Projects a payment relates to (advance project + projects of applied obligations), stable order. */
export function projectsOfPayment(ds: Pick<Dataset, 'obligations'> & Partial<Pick<Dataset, 'settlements'>>, p: SupplierPayment): string[] {
  const ids = [
    p.projectId,
    ...p.allocations.map((a) => findById(ds.obligations, a.obligationId)?.projectId),
    ...(p.batchAllocations ?? []).map((a) => (ds.settlements ? findById(ds.settlements, a.settlementId)?.projectId : undefined)),
  ].filter((x): x is string => Boolean(x))
  return [...new Set(ids)]
}

export interface ProjectRef {
  general: boolean
  projectId?: string
  code?: string
  /** Human label: beneficiary of the relocation. */
  name?: string
  client?: string
  service?: string
}

/** Reference resolved from stable ids; general (indirect) expenses are never attached to a project. */
export function projectRef(ds: Pick<Dataset, 'projects' | 'people' | 'clients' | 'services'>, projectId?: string, serviceId?: string): ProjectRef {
  if (!projectId) return { general: true }
  const p = findById(ds.projects, projectId)
  if (!p) return { general: false, projectId, code: projectId }
  const svc = serviceId ? findById(ds.services, serviceId) : undefined
  return {
    general: false,
    projectId,
    code: p.code,
    name: findById(ds.people, p.beneficiaryId)?.name,
    client: findById(ds.clients, p.clientId)?.name,
    service: svc ? getServiceType(svc.typeId).label : undefined,
  }
}

export interface OverheadSummary {
  /** period → currency → amount */
  byMonth: { period: string; currency: CurrencyCode; total: number; paid: number; pending: number }[]
  byCategory: { category: string; currency: CurrencyCode; total: number }[]
  byCurrency: { currency: CurrencyCode; total: number; paid: number; pending: number; unknown: number }[]
}

export const overheadCategoryOf = (c: CostRecord) => c.overheadCategory?.trim() || 'Sin categoría'
export const periodOf = (c: CostRecord) => c.period ?? c.date.slice(0, 7)

/** General (company) expenses per month, category and currency. Currencies are never added together. */
export function overheadSummary(costs: CostRecord[]): OverheadSummary {
  const month = new Map<string, OverheadSummary['byMonth'][number]>()
  const cat = new Map<string, OverheadSummary['byCategory'][number]>()
  const cur = new Map<CurrencyCode, OverheadSummary['byCurrency'][number]>()
  for (const c of costs) {
    if (c.scope !== 'company' || c.status !== 'incurred') continue
    const mk = `${periodOf(c)}|${c.currency}`
    const m = month.get(mk) ?? { period: periodOf(c), currency: c.currency, total: 0, paid: 0, pending: 0 }
    const k = `${overheadCategoryOf(c)}|${c.currency}`
    const g = cat.get(k) ?? { category: overheadCategoryOf(c), currency: c.currency, total: 0 }
    const u = cur.get(c.currency) ?? { currency: c.currency, total: 0, paid: 0, pending: 0, unknown: 0 }
    m.total = addMoney(m.total, c.amount)
    g.total = addMoney(g.total, c.amount)
    u.total = addMoney(u.total, c.amount)
    if (c.paymentStatus === 'paid') {
      m.paid = addMoney(m.paid, c.amount)
      u.paid = addMoney(u.paid, c.amount)
    } else if (c.paymentStatus === 'pending') {
      m.pending = addMoney(m.pending, c.amount)
      u.pending = addMoney(u.pending, c.amount)
    } else u.unknown = addMoney(u.unknown, c.amount)
    month.set(mk, m)
    cat.set(k, g)
    cur.set(c.currency, u)
  }
  return {
    byMonth: [...month.values()].sort((a, b) => b.period.localeCompare(a.period) || a.currency.localeCompare(b.currency)),
    byCategory: [...cat.values()].sort((a, b) => a.category.localeCompare(b.category) || a.currency.localeCompare(b.currency)),
    byCurrency: [...cur.values()],
  }
}
