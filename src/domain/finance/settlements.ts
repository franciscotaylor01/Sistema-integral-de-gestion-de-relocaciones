import type { CurrencyCode, ProjectSettlement, SettlementConfirmation, SettlementRelease, SettlementRule, SupplierObligation } from '@/types/domain'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from './audit'
import { invoiceFinancials, lineSubtotal, obligationFinancials } from './derive'
import { addMoney, cmpMoney, fromCents, isMoney, minMoney, percentOf, subMoney, sumMoney, toCents } from './money'

/*
 * Eugenia–Florencia settlements. Every figure is derived from the existing
 * invoices, receipts, costs, obligations and supplier payments; a settlement
 * only stores the agreed rule, explicit links and its audit trail.
 * Results are operational (before taxes) and per currency.
 */

export type SettlementSignal = 'green' | 'red' | 'yellow' | 'gray'

export interface SettlementFinancials {
  configured: boolean
  /** Issued invoices of the project in this currency, net of taxes. */
  netRevenue: number
  grossInvoiced: number
  collected: number
  /** Incurred direct costs, excluding the partner's own linked invoices (never deducted twice). */
  directCosts: number
  base: number
  adjustments: number
  partnerShare?: number
  ownerShare?: number
  releasable?: number
  partnerInvoiced: number
  partnerPaid: number
  /** Releasable but not yet paid. */
  pendingPayment: number
  /** Share not yet paid (regardless of release). */
  shareOutstanding?: number
  partnerOverdue: boolean
  linked: SupplierObligation[]
  /** Partner obligations on this project/currency not yet linked to any settlement. */
  unlinked: SupplierObligation[]
  signal: SettlementSignal
  signalNote: string
  warnings: string[]
}

const PCT = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 100 && Math.round(n * 100) === n * 100

/** amount × part / whole, in cents, BigInt-safe for large ARS amounts. */
function prorate(amount: number, part: number, whole: number): number {
  const w = BigInt(toCents(whole))
  if (w <= 0n) return 0
  const n = BigInt(toCents(amount)) * BigInt(toCents(part))
  return fromCents(Number((n * 2n + w) / (2n * w)))
}

export function settlementFinancials(ds: Dataset, s: ProjectSettlement, today: string): SettlementFinancials {
  const cur = s.currency
  const warnings: string[] = []
  const invoices = ds.invoices.filter((i) => i.projectId === s.projectId && i.currency === cur && i.lifecycle === 'issued')
  let netRevenue = 0
  let grossInvoiced = 0
  let collected = 0
  for (const inv of invoices) {
    const f = invoiceFinancials(ds, inv, today)
    netRevenue = addMoney(netRevenue, f.subtotal)
    grossInvoiced = addMoney(grossInvoiced, f.total)
    collected = addMoney(collected, f.paid)
  }

  const linked = s.obligationIds.map((id) => findById(ds.obligations, id)).filter((o): o is SupplierObligation => Boolean(o) && o!.lifecycle !== 'cancelled')
  const linkedCosts = new Set(linked.map((o) => o.costId))
  const linkedElsewhere = new Set(ds.settlements.flatMap((x) => x.obligationIds))
  const unlinked = ds.obligations.filter((o) => o.supplierId === s.supplierId && o.projectId === s.projectId && o.currency === cur && o.lifecycle !== 'cancelled' && !linkedElsewhere.has(o.id))
  const costs = ds.costs.filter((c) => c.projectId === s.projectId && c.currency === cur && c.status === 'incurred' && !linkedCosts.has(c.id))
  const directCosts = sumMoney(costs, (c) => c.amount)
  const base = subMoney(netRevenue, directCosts)

  let partnerInvoiced = 0
  let partnerPaid = 0
  let partnerOverdue = false
  for (const o of linked) {
    const f = obligationFinancials(ds, o, today)
    partnerInvoiced = addMoney(partnerInvoiced, o.amount)
    partnerPaid = addMoney(partnerPaid, f.paid)
    if (f.overdue) partnerOverdue = true
  }
  if (unlinked.length) warnings.push(`${unlinked.length} comprobante(s) de la prestadora en este proyecto sin vincular: hoy se descuentan como costo directo.`)

  const adjustments = sumMoney(s.adjustments, (a) => a.amount)
  const share = ruleShare(ds, s, base, linkedCosts, warnings)
  const common = { netRevenue, grossInvoiced, collected, directCosts, base, adjustments, partnerInvoiced, partnerPaid, partnerOverdue, linked, unlinked, warnings }

  if (share === undefined) {
    return { ...common, configured: false, pendingPayment: 0, signal: 'gray', signalNote: 'Pendiente de configurar' }
  }
  let partnerShare = addMoney(share, adjustments)
  if (cmpMoney(partnerShare, 0) < 0) {
    warnings.push('Los ajustes dejan la participación en negativo; se toma 0.')
    partnerShare = 0
  }
  const ownerShare = subMoney(base, partnerShare)
  if (cmpMoney(ownerShare, 0) < 0) warnings.push('La participación de la prestadora supera el resultado base registrado.')
  const releasable =
    s.release === 'after-collection'
      ? minMoney(prorate(partnerShare, collected, grossInvoiced), partnerShare)
      : minMoney(sumMoney(s.releases, (r) => r.amount), partnerShare)
  const pendingPayment = cmpMoney(releasable, partnerPaid) > 0 ? subMoney(releasable, partnerPaid) : 0
  const shareOutstanding = cmpMoney(partnerShare, partnerPaid) > 0 ? subMoney(partnerShare, partnerPaid) : 0
  if (cmpMoney(partnerPaid, partnerShare) > 0) warnings.push('Lo pagado a la prestadora supera su participación calculada.')
  if (cmpMoney(partnerInvoiced, partnerShare) > 0) warnings.push('Lo facturado por la prestadora supera su participación calculada.')

  let signal: SettlementSignal
  let signalNote: string
  if (cmpMoney(pendingPayment, 0) > 0) {
    signal = 'red'
    signalNote = partnerOverdue ? 'Fondos cobrados habilitan el pago y hay saldo vencido' : 'Fondos cobrados habilitan el pago y queda saldo pendiente'
  } else if (cmpMoney(partnerShare, 0) > 0 && cmpMoney(partnerPaid, partnerShare) >= 0) {
    signal = 'green'
    signalNote = 'Participación pagada totalmente'
  } else if (cmpMoney(releasable, 0) === 0 && cmpMoney(partnerPaid, 0) === 0) {
    signal = 'gray'
    signalNote = cmpMoney(partnerShare, 0) === 0 ? 'Sin participación a liquidar' : 'Todavía no liquidable'
  } else {
    signal = 'yellow'
    signalNote = cmpMoney(partnerPaid, 0) > 0 ? 'Pagada parcialmente; resto pendiente de condiciones' : 'Pendiente de cumplir condiciones'
  }
  return { ...common, configured: true, partnerShare, ownerShare, releasable, pendingPayment, shareOutstanding, signal, signalNote }
}

/** Partner share from the rule (before adjustments); undefined when no valid rule exists. */
function ruleShare(ds: Dataset, s: ProjectSettlement, base: number, excludedCosts: Set<string>, warnings: string[]): number | undefined {
  const r = s.rule
  if (!r) return undefined
  if (r.method === 'fixed') return isMoney(r.amount) && r.amount > 0 ? r.amount : undefined
  if (r.method === 'percentage') {
    if (!PCT(r.pct)) return undefined
    if (cmpMoney(base, 0) <= 0) {
      warnings.push('El resultado base no es positivo: la participación porcentual es 0.')
      return 0
    }
    return percentOf(base, r.pct)
  }
  if (!r.components.length) return undefined
  let total = 0
  for (const c of r.components) {
    if (c.method === 'fixed') {
      if (!isMoney(c.amount) || c.amount <= 0) return undefined
      total = addMoney(total, c.amount)
      continue
    }
    if (!PCT(c.pct)) return undefined
    const sb = serviceBase(ds, s, c.serviceId, excludedCosts)
    if (cmpMoney(sb, 0) > 0) total = addMoney(total, percentOf(sb, c.pct))
    else warnings.push('Algún servicio tiene resultado base no positivo: su componente porcentual es 0.')
  }
  return total
}

/** Net invoiced on a service's lines minus its own direct costs (same currency). */
export function serviceBase(ds: Dataset, s: ProjectSettlement, serviceId: string, excludedCosts: Set<string>): number {
  let net = 0
  for (const inv of ds.invoices) {
    if (inv.projectId !== s.projectId || inv.currency !== s.currency || inv.lifecycle !== 'issued') continue
    for (const l of inv.lines) if (l.serviceId === serviceId && !l.reimbursable) net = addMoney(net, lineSubtotal(l))
  }
  const cost = sumMoney(
    ds.costs.filter((c) => c.serviceId === serviceId && c.currency === s.currency && c.status === 'incurred' && !excludedCosts.has(c.id)),
    (c) => c.amount,
  )
  return subMoney(net, cost)
}

/* ───────────────────────── Commands ───────────────────────── */

export interface SettlementInput {
  projectId: string
  supplierId: string
  currency: CurrencyCode | ''
  release: SettlementRelease
  releaseNote?: string
  notes?: string
}

const must = (ds: Dataset, id: string) => {
  const s = findById(ds.settlements, id)
  if (!s) throw new DomainError('La liquidación no existe.')
  return s
}

function log(ds: Dataset, s: ProjectSettlement, action: string, ctx: DomainContext, reason?: string): Dataset {
  const entry = { id: ctx.newId('seth'), date: ctx.now(), actorId: ctx.actorId, action, reason: reason?.trim() || undefined }
  const next: Dataset = { ...ds, settlements: replaceById(ds.settlements, s.id, (x) => ({ ...x, history: [entry, ...x.history] })) }
  return appendAudit(next, { entity: 'settlement', entityId: s.id, action, detail: reason?.trim() ? `${action}: ${reason.trim()}` : action, projectId: s.projectId }, ctx)
}

export function createSettlement(ds: Dataset, input: SettlementInput, requestId: string, ctx: DomainContext): { ds: Dataset; settlementId: string; duplicate: boolean } {
  const prior = ds.requests[requestId]
  if (prior) return { ds, settlementId: prior, duplicate: true }
  const f: Record<string, string> = {}
  if (!ds.projects.some((p) => p.id === input.projectId)) f.projectId = 'Elegí el proyecto.'
  const sup = findById(ds.suppliers, input.supplierId)
  if (!sup) f.supplierId = 'Elegí la prestadora.'
  else if (!sup.active) f.supplierId = 'La prestadora está inactiva.'
  if (!input.currency) f.currency = 'Elegí la moneda.'
  if (input.release === 'manual' && !input.releaseNote?.trim()) f.releaseNote = 'Describí la condición acordada.'
  if (!f.projectId && ds.settlements.some((x) => x.projectId === input.projectId && x.supplierId === input.supplierId && x.currency === input.currency))
    f.currency = 'Ya existe una liquidación de esta prestadora para el proyecto en esa moneda.'
  if (Object.keys(f).length) throw new DomainError('Revisá la liquidación.', f)
  const s: ProjectSettlement = {
    id: ctx.newId('set'),
    projectId: input.projectId,
    supplierId: input.supplierId,
    currency: input.currency as CurrencyCode,
    release: input.release,
    releaseNote: input.releaseNote?.trim() || undefined,
    releases: [],
    adjustments: [],
    obligationIds: [],
    confirmations: [],
    history: [],
    notes: input.notes?.trim() || undefined,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  const next: Dataset = { ...ds, settlements: [...ds.settlements, s], requests: { ...ds.requests, [requestId]: s.id } }
  return { ds: log(next, s, 'Liquidación creada', ctx), settlementId: s.id, duplicate: false }
}

export function validateRule(ds: Dataset, projectId: string, rule: SettlementRule): Record<string, string> {
  const f: Record<string, string> = {}
  if (rule.method === 'percentage' && !PCT(rule.pct)) f.pct = 'Porcentaje entre 0,01 y 100 (hasta 2 decimales).'
  if (rule.method === 'fixed' && !(isMoney(rule.amount) && rule.amount > 0)) f.amount = 'Importe fijo mayor a 0.'
  if (rule.method === 'by-service') {
    if (!rule.components.length) f.components = 'Agregá al menos un componente por servicio.'
    const seen = new Set<string>()
    rule.components.forEach((c, i) => {
      const svc = findById(ds.services, c.serviceId)
      if (!svc || svc.projectId !== projectId) f[`components.${i}.serviceId`] = 'Elegí un servicio del proyecto.'
      else if (seen.has(c.serviceId)) f[`components.${i}.serviceId`] = 'Servicio repetido.'
      seen.add(c.serviceId)
      if (c.method === 'percentage' && !PCT(c.pct)) f[`components.${i}.value`] = 'Porcentaje inválido.'
      if (c.method === 'fixed' && !(isMoney(c.amount) && c.amount > 0)) f[`components.${i}.value`] = 'Importe inválido.'
    })
  }
  return f
}

/** Sets or changes the distribution rule. Changes after the first configuration require a reason. */
export function configureSettlement(
  ds: Dataset,
  id: string,
  input: { rule: SettlementRule; release: SettlementRelease; releaseNote?: string },
  reason: string,
  ctx: DomainContext,
): Dataset {
  const s = must(ds, id)
  const f = validateRule(ds, s.projectId, input.rule)
  if (input.release === 'manual' && !input.releaseNote?.trim()) f.releaseNote = 'Describí la condición acordada.'
  const firstTime = !s.rule
  if (!firstTime && !reason.trim()) f.reason = 'Indicá el motivo de la modificación.'
  if (Object.keys(f).length) throw new DomainError('Revisá la distribución.', f)
  const rule: SettlementRule = {
    method: input.rule.method,
    pct: input.rule.method === 'percentage' ? input.rule.pct : undefined,
    amount: input.rule.method === 'fixed' ? input.rule.amount : undefined,
    components: input.rule.method === 'by-service' ? input.rule.components.map((c) => ({ ...c, id: c.id || ctx.newId('setc') })) : [],
  }
  const next: Dataset = {
    ...ds,
    settlements: replaceById(ds.settlements, id, (x) => ({ ...x, rule, release: input.release, releaseNote: input.release === 'manual' ? input.releaseNote?.trim() : undefined })),
  }
  return log(next, s, firstTime ? 'Distribución configurada' : 'Distribución modificada', ctx, reason)
}

export function addSettlementAdjustment(ds: Dataset, id: string, input: { amount: number; date: string; reason: string }, ctx: DomainContext): Dataset {
  const s = must(ds, id)
  const f: Record<string, string> = {}
  if (!isMoney(input.amount, { allowNegative: true }) || input.amount === 0) f.amount = 'Importe distinto de 0 (negativo para reducir).'
  if (!isIsoDate(input.date)) f.date = 'Fecha inválida.'
  if (!input.reason.trim()) f.reason = 'Todo ajuste manual debe justificarse.'
  if (Object.keys(f).length) throw new DomainError('Revisá el ajuste.', f)
  const adj = { id: ctx.newId('seta'), date: input.date, amount: input.amount, reason: input.reason.trim(), actorId: ctx.actorId }
  const next: Dataset = { ...ds, settlements: replaceById(ds.settlements, id, (x) => ({ ...x, adjustments: [...x.adjustments, adj] })) }
  return log(next, s, `Ajuste ${input.amount > 0 ? '+' : ''}${input.amount} ${s.currency}`, ctx, input.reason)
}

/** Release under "another agreed condition": an explicit, dated, justified amount. */
export function recordSettlementRelease(ds: Dataset, id: string, input: { amount: number; date: string; reason: string }, ctx: DomainContext): Dataset {
  const s = must(ds, id)
  if (s.release !== 'manual') throw new DomainError('Esta liquidación se habilita por cobro del cliente; no admite habilitaciones manuales.')
  const fin = settlementFinancials(ds, s, ctx.today())
  const f: Record<string, string> = {}
  if (!fin.configured) throw new DomainError('Configurá la distribución antes de habilitar importes.')
  const room = subMoney(fin.partnerShare!, sumMoney(s.releases, (r) => r.amount))
  if (!isMoney(input.amount) || input.amount <= 0) f.amount = 'Importe mayor a 0.'
  else if (cmpMoney(input.amount, room) > 0) f.amount = `Supera la participación aún no habilitada (${room}).`
  if (!isIsoDate(input.date)) f.date = 'Fecha inválida.'
  if (!input.reason.trim()) f.reason = 'Indicá qué condición se cumplió.'
  if (Object.keys(f).length) throw new DomainError('Revisá la habilitación.', f)
  const rel = { id: ctx.newId('setr'), date: input.date, amount: input.amount, reason: input.reason.trim(), actorId: ctx.actorId }
  const next: Dataset = { ...ds, settlements: replaceById(ds.settlements, id, (x) => ({ ...x, releases: [...x.releases, rel] })) }
  return log(next, s, `Habilitado ${input.amount} ${s.currency}`, ctx, input.reason)
}

/** Links a partner invoice (obligation) so it counts as share payment instead of a direct cost. */
export function linkSettlementObligation(ds: Dataset, id: string, obligationId: string, ctx: DomainContext): Dataset {
  const s = must(ds, id)
  const o = findById(ds.obligations, obligationId)
  if (!o) throw new DomainError('La obligación no existe.')
  if (o.lifecycle === 'cancelled') throw new DomainError('La obligación está anulada.')
  if (o.supplierId !== s.supplierId) throw new DomainError('La obligación es de otro proveedor.')
  if (o.projectId !== s.projectId) throw new DomainError('La obligación es de otro proyecto.')
  if (o.currency !== s.currency) throw new DomainError('La obligación está en otra moneda.')
  if (ds.settlements.some((x) => x.obligationIds.includes(obligationId))) throw new DomainError('La obligación ya está vinculada a una liquidación.')
  const next: Dataset = { ...ds, settlements: replaceById(ds.settlements, id, (x) => ({ ...x, obligationIds: [...x.obligationIds, obligationId] })) }
  return log(next, s, `Vinculada ${o.reference}`, ctx)
}

export function unlinkSettlementObligation(ds: Dataset, id: string, obligationId: string, reason: string, ctx: DomainContext): Dataset {
  const s = must(ds, id)
  if (!s.obligationIds.includes(obligationId)) throw new DomainError('La obligación no está vinculada.')
  if (!reason.trim()) throw new DomainError('Indicá el motivo.', { reason: 'Indicá el motivo.' })
  const ref = findById(ds.obligations, obligationId)?.reference ?? obligationId
  const next: Dataset = { ...ds, settlements: replaceById(ds.settlements, id, (x) => ({ ...x, obligationIds: x.obligationIds.filter((o) => o !== obligationId) })) }
  return log(next, s, `Desvinculada ${ref}`, ctx, reason)
}

/** Freezes the current figures as an immutable historical record. */
export function confirmSettlement(ds: Dataset, id: string, note: string, ctx: DomainContext): Dataset {
  const s = must(ds, id)
  const f = settlementFinancials(ds, s, ctx.today())
  if (!f.configured) throw new DomainError('No se puede confirmar: la distribución está pendiente de configurar.')
  const snap: SettlementConfirmation = {
    id: ctx.newId('setk'),
    date: ctx.now(),
    actorId: ctx.actorId,
    netRevenue: f.netRevenue,
    directCosts: f.directCosts,
    base: f.base,
    partnerShare: f.partnerShare!,
    ownerShare: f.ownerShare!,
    releasable: f.releasable!,
    partnerInvoiced: f.partnerInvoiced,
    partnerPaid: f.partnerPaid,
    note: note.trim() || undefined,
  }
  const next: Dataset = { ...ds, settlements: replaceById(ds.settlements, id, (x) => ({ ...x, confirmations: [snap, ...x.confirmations] })) }
  return log(next, s, 'Liquidación confirmada', ctx, note)
}
