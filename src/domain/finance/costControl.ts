import type { CostClosure, CurrencyCode, ProjectRecord } from '@/types/domain'
import { findById, replaceById } from '../collections'
import { businessStamp, type DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError } from '../errors'
import { appendAudit } from './audit'
import { obligationFinancials } from './derive'
import { addMoney, cmpMoney } from './money'
import { advanceInfo } from './supplierPayments'

/*
 * Phase 4.8 — project cost control. Categories overlap (an obligation creates
 * its cost; a payment settles an obligation; an applied advance is part of a
 * payment), so each figure is shown on its own and never added to the others.
 */

export const isCostClosed = (p: Pick<ProjectRecord, 'costClosure'> | undefined) => p?.costClosure?.status === 'closed'

/** Guard for new direct costs: a closed project must be reopened explicitly first. */
export function assertCostsOpen(ds: Dataset, projectId: string | undefined) {
  if (!projectId) return
  const p = findById(ds.projects, projectId)
  if (isCostClosed(p)) throw new DomainError(`Los costos de ${p!.code} están cerrados: reabrilos (con motivo) antes de registrar un costo nuevo.`, { costClosure: 'Costos cerrados' })
}

function setClosure(ds: Dataset, projectId: string, closure: CostClosure, detail: string, ctx: DomainContext): Dataset {
  const next = { ...ds, projects: replaceById(ds.projects, projectId, (p) => ({ ...p, costClosure: closure, updatedAt: ctx.now() })) }
  return appendAudit(next, { entity: 'cost', entityId: projectId, action: closure.status === 'closed' ? 'close-costs' : 'reopen-costs', detail, projectId }, ctx)
}

/** A person confirms all known costs are registered. Never automatic; does not mean obligations are paid. */
export function closeProjectCosts(ds: Dataset, projectId: string, notes: string, ctx: DomainContext): Dataset {
  const p = findById(ds.projects, projectId)
  if (!p) throw new DomainError('El proyecto no existe.')
  if (isCostClosed(p)) throw new DomainError('Los costos ya están cerrados.')
  const history = [{ id: ctx.newId('cch'), date: businessStamp(ctx), action: 'Costos cerrados', reason: notes.trim() || undefined }, ...(p.costClosure?.history ?? [])]
  return setClosure(ds, projectId, { status: 'closed', closedAt: ctx.today(), notes: notes.trim() || undefined, history }, notes.trim() || 'Cierre de costos', ctx)
}

export function reopenProjectCosts(ds: Dataset, projectId: string, reason: string, ctx: DomainContext): Dataset {
  const p = findById(ds.projects, projectId)
  if (!p) throw new DomainError('El proyecto no existe.')
  if (!isCostClosed(p)) throw new DomainError('Los costos ya están abiertos.')
  if (!reason.trim()) throw new DomainError('Documentá el motivo de la reapertura.', { reason: 'Indicá el motivo.' })
  const history = [{ id: ctx.newId('cch'), date: businessStamp(ctx), action: 'Costos reabiertos', reason: reason.trim() }, ...(p.costClosure?.history ?? [])]
  return setClosure(ds, projectId, { status: 'open', history }, `Reapertura: ${reason.trim()}`, ctx)
}

export interface CostControlRow {
  currency: CurrencyCode
  /** Incurred direct costs (includes the cost behind each obligation). */
  directCosts: number
  /** Approved (confirmed) obligations. */
  obligations: number
  /** Cash actually paid to suppliers for this project (payments + advances handed over). */
  cashOut: number
  advancesGiven: number
  advancesApplied: number
  advancesAvailable: number
  /** Outstanding on approved obligations. */
  pending: number
}

export interface ProjectCostControl {
  closed: boolean
  closure?: CostClosure
  rows: CostControlRow[]
  /** Outstanding per supplier and currency. */
  pendingBySupplier: { supplierId: string; currency: CurrencyCode; pending: number }[]
  /** Advances of this project not yet applied. */
  unappliedAdvances: { paymentId: string; supplierId: string; currency: CurrencyCode; available: number }[]
}

/** Reusable project cost position (also for future settlement rules). */
export function projectCostControl(ds: Dataset, projectId: string, today: string): ProjectCostControl {
  const project = findById(ds.projects, projectId)
  const rows = new Map<CurrencyCode, CostControlRow>()
  const row = (c: CurrencyCode) => {
    let r = rows.get(c)
    if (!r) rows.set(c, (r = { currency: c, directCosts: 0, obligations: 0, cashOut: 0, advancesGiven: 0, advancesApplied: 0, advancesAvailable: 0, pending: 0 }))
    return r
  }
  for (const c of ds.costs) if (c.projectId === projectId && c.status === 'incurred') row(c.currency).directCosts = addMoney(row(c.currency).directCosts, c.amount)
  const obligations = ds.obligations.filter((o) => o.projectId === projectId && o.lifecycle !== 'cancelled')
  const obIds = new Set(obligations.map((o) => o.id))
  const pendingBy = new Map<string, { supplierId: string; currency: CurrencyCode; pending: number }>()
  for (const o of obligations) {
    if (o.lifecycle !== 'approved') continue
    const f = obligationFinancials(ds, o, today)
    const r = row(o.currency)
    r.obligations = addMoney(r.obligations, o.amount)
    r.pending = addMoney(r.pending, f.outstanding)
    if (cmpMoney(f.outstanding, 0) > 0) {
      const k = `${o.supplierId}|${o.currency}`
      const e = pendingBy.get(k) ?? { supplierId: o.supplierId, currency: o.currency, pending: 0 }
      e.pending = addMoney(e.pending, f.outstanding)
      pendingBy.set(k, e)
    }
  }
  const unapplied: ProjectCostControl['unappliedAdvances'] = []
  for (const p of ds.supplierPayments) {
    if (p.status !== 'recorded') continue
    const r = row(p.currency)
    // Cash: amounts applied at payment time to this project's obligations…
    for (const a of p.allocations) if (a.source !== 'advance' && !a.reversedAt && obIds.has(a.obligationId)) r.cashOut = addMoney(r.cashOut, a.amount)
    // …plus the advance handed over for this project (applications add no cash).
    const adv = advanceInfo(p)
    if (adv && p.projectId === projectId) {
      r.cashOut = addMoney(r.cashOut, adv.given)
      r.advancesGiven = addMoney(r.advancesGiven, adv.given)
      r.advancesApplied = addMoney(r.advancesApplied, adv.applied)
      r.advancesAvailable = addMoney(r.advancesAvailable, adv.available)
      if (cmpMoney(adv.available, 0) > 0) unapplied.push({ paymentId: p.id, supplierId: p.supplierId, currency: p.currency, available: adv.available })
    }
  }
  return {
    closed: isCostClosed(project),
    closure: project?.costClosure,
    rows: [...rows.values()].filter((r) => Object.values(r).some((v) => typeof v === 'number' && v !== 0)),
    pendingBySupplier: [...pendingBy.values()],
    unappliedAdvances: unapplied,
  }
}
