import type { BatchDeduction, BatchLine, CostRecord, CurrencyCode, FxConversion, SettlementBatch } from '@/types/domain'
import { findById, replaceById } from '../collections'
import { businessStamp, type DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from './audit'
import { batchCashPaid, convertAmount, deductionProgress, isOrdered, lineProgress, validRate } from './batchProgress'
import { isCostClosed } from './costControl'
import { addMoney, cmpMoney, isMoney, minMoney, percentOf, subMoney, sumMoney } from './money'
import { nextNumber } from './numbering'
import { settlementFinancials } from './settlements'

/*
 * Phase 4.9 — grouped settlements to the partner (Florencia). A batch commits
 * project participation balances, deducts the partner's part of shared general
 * expenses and records documented conversions. Confirming it is NOT a payment:
 * money leaves only through supplier payments allocated to its lines.
 */

/* ───────────── Shared general expenses ───────────── */

export interface SharingInput {
  partnerSupplierId: string
  partnerPct: number
  ownerPct: number
  reference?: string
}

const PCT2 = (n: number) => Number.isFinite(n) && Math.round(n * 100) === n * 100

export function validateSharing(ds: Pick<Dataset, 'suppliers'>, s: SharingInput): Record<string, string> {
  const f: Record<string, string> = {}
  if (!ds.suppliers.some((x) => x.id === s.partnerSupplierId)) f['sharing.partnerSupplierId'] = 'Elegí la socia (proveedora).'
  if (!PCT2(s.partnerPct) || s.partnerPct <= 0 || s.partnerPct >= 100) f['sharing.partnerPct'] = 'Porcentaje entre 0,01 y 99,99.'
  if (!PCT2(s.ownerPct) || s.ownerPct <= 0 || s.ownerPct >= 100) f['sharing.ownerPct'] = 'Porcentaje entre 0,01 y 99,99.'
  if (!f['sharing.partnerPct'] && !f['sharing.ownerPct'] && Math.round((s.partnerPct + s.ownerPct) * 100) !== 10000) f['sharing.ownerPct'] = 'Los porcentajes deben sumar 100%.'
  return f
}

export interface SharedExpenseInfo {
  /** Partner part of the expense, in its currency. */
  partnerPart: number
  /** Committed as a deduction in confirmed batches (cannot be deducted again). */
  deducted: number
  /** Effectively offset through payments of those batches. */
  offset: number
  pending: number
}

/** Three distinct events: the expense is registered, it is paid (Phase 4.8), and the partner part is deducted here. */
export function sharedExpenseInfo(ds: Pick<Dataset, 'settlementBatches'> & Partial<Pick<Dataset, 'supplierPayments'>>, cost: CostRecord): SharedExpenseInfo | undefined {
  if (!cost.sharing || cost.status !== 'incurred') return undefined
  const partnerPart = percentOf(cost.amount, cost.sharing.partnerPct)
  const confirmed = (ds.settlementBatches ?? []).filter((b) => b.status === 'confirmed')
  const deducted = sumMoney(confirmed.flatMap((b) => b.deductions.filter((d) => d.costId === cost.id)), (d) => d.amount)
  let offset = 0
  if (ds.supplierPayments) for (const b of confirmed) {
    const prog = deductionProgress({ supplierPayments: ds.supplierPayments }, b)
    for (const d of b.deductions) if (d.costId === cost.id) offset = addMoney(offset, prog.get(d.id)!.offsetOriginal)
  }
  return { partnerPart, deducted, offset, pending: subMoney(partnerPart, deducted) }
}

/** Changes the split of an expense while nothing of it has been deducted yet (the effective % is stored per record). */
export function setCostSharing(ds: Dataset, costId: string, sharing: SharingInput | null, ctx: DomainContext): Dataset {
  const cost = findById(ds.costs, costId)
  if (!cost || cost.scope !== 'company') throw new DomainError('Solo los gastos generales pueden compartirse.')
  const info = sharedExpenseInfo(ds, cost)
  if (info && cmpMoney(info.deducted, 0) > 0) throw new DomainError('Ya se dedujo parte de este gasto: su distribución no se modifica.')
  if (sharing) {
    const f = validateSharing(ds, sharing)
    if (Object.keys(f).length) throw new DomainError('Revisá la distribución.', f)
  }
  const next: Dataset = { ...ds, costs: replaceById(ds.costs, costId, (c) => ({ ...c, sharing: sharing ? { ...sharing, reference: sharing.reference?.trim() || undefined } : undefined })) }
  return appendAudit(next, { entity: 'cost', entityId: costId, action: 'sharing', detail: sharing ? `Compartido ${sharing.partnerPct}/${sharing.ownerPct}` : 'No compartido' }, ctx)
}

/* ───────────── Batches ───────────── */

export interface FxInput {
  from: CurrencyCode
  rate: string
  date: string
  source: string
}

export interface BatchInput {
  supplierId: string
  currency: CurrencyCode | ''
  date: string
  lines: { settlementId: string; amount: number }[]
  deductions: { costId: string; amount: number }[]
  /** One documented rate per foreign currency used (units of the batch currency per 1 unit). */
  rates: FxInput[]
  adjustments: { concept: string; amount: number; reference?: string }[]
  notes?: string
}

export interface BatchTotals {
  gross: number
  deductions: number
  adjustments: number
  /** Deductions minus adjustments: offset against project lines. */
  offset: number
  net: number
}

export function batchTotals(b: Pick<SettlementBatch, 'lines' | 'deductions' | 'adjustments'>): BatchTotals {
  const gross = sumMoney(b.lines, (l) => l.converted)
  const deductions = sumMoney(b.deductions, (d) => d.converted)
  const adjustments = sumMoney(b.adjustments, (a) => a.amount)
  const offset = subMoney(deductions, adjustments)
  return { gross, deductions, adjustments, offset, net: subMoney(gross, offset) }
}

function fxFor(input: BatchInput, from: CurrencyCode): FxConversion | undefined {
  const r = input.rates.find((x) => x.from === from)
  return r ? { from, to: input.currency as CurrencyCode, rate: r.rate.trim().replace(',', '.'), date: r.date, source: r.source.trim() } : undefined
}

function build(ds: Dataset, input: BatchInput, ctx: DomainContext, excludeId?: string): { lines: BatchLine[]; deductions: BatchDeduction[]; f: Record<string, string> } {
  const f: Record<string, string> = {}
  const cur = input.currency as CurrencyCode
  if (!ds.suppliers.some((s) => s.id === input.supplierId)) f.supplierId = 'Elegí la socia.'
  if (!input.currency) f.currency = 'Elegí la moneda de la liquidación.'
  if (!isIsoDate(input.date) || input.date > ctx.today()) f.date = 'Fecha inválida o futura.'
  if (!input.lines.length) f.lines = 'Elegí al menos un saldo de proyecto.'
  const used = new Set<CurrencyCode>()
  const seen = new Set<string>()
  const lines: BatchLine[] = []
  input.lines.forEach((l, i) => {
    const s = findById(ds.settlements, l.settlementId)
    if (!s || s.supplierId !== input.supplierId) return void (f[`lines.${i}.amount`] = 'Participación inexistente o de otra socia.')
    if (seen.has(s.id)) return void (f[`lines.${i}.amount`] = 'Proyecto repetido.')
    seen.add(s.id)
    const fin = settlementFinancials(ds, s, ctx.today())
    if (!isMoney(l.amount) || l.amount <= 0) f[`lines.${i}.amount`] = 'Importe mayor a 0.'
    else if (cmpMoney(l.amount, fin.available) > 0) f[`lines.${i}.amount`] = `Supera el saldo disponible (${s.currency} ${fin.available}); lo comprometido en otra liquidación confirmada no se reutiliza.`
    if (s.currency !== cur) used.add(s.currency)
    const fx = s.currency === cur ? undefined : fxFor(input, s.currency)
    lines.push({ id: ctx.newId('bl'), settlementId: s.id, projectId: s.projectId, currency: s.currency, amount: l.amount, converted: fx && validRate(fx.rate) && isMoney(l.amount) ? convertAmount(l.amount, fx.rate) : isMoney(l.amount) ? l.amount : 0, fx })
  })
  const deductions: BatchDeduction[] = []
  const seenCost = new Set<string>()
  input.deductions.forEach((d, i) => {
    const c = findById(ds.costs, d.costId)
    const info = c && sharedExpenseInfo({ settlementBatches: ds.settlementBatches.filter((b) => b.id !== excludeId) }, c)
    if (!c || !info || c.sharing!.partnerSupplierId !== input.supplierId) return void (f[`deductions.${i}.amount`] = 'Gasto no compartido con esta socia.')
    if (seenCost.has(c.id)) return void (f[`deductions.${i}.amount`] = 'Gasto repetido.')
    seenCost.add(c.id)
    if (!isMoney(d.amount) || d.amount <= 0) f[`deductions.${i}.amount`] = 'Importe mayor a 0.'
    else if (cmpMoney(d.amount, info.pending) > 0) f[`deductions.${i}.amount`] = `Supera lo pendiente de deducir (${c.currency} ${info.pending}): no se descuenta dos veces.`
    if (c.currency !== cur) used.add(c.currency)
    const fx = c.currency === cur ? undefined : fxFor(input, c.currency)
    deductions.push({ id: ctx.newId('bd'), costId: c.id, currency: c.currency, amount: d.amount, converted: fx && validRate(fx.rate) && isMoney(d.amount) ? convertAmount(d.amount, fx.rate) : isMoney(d.amount) ? d.amount : 0, fx, partnerPct: c.sharing!.partnerPct, ownerPct: c.sharing!.ownerPct })
  })
  for (const c of used) {
    const r = input.rates.find((x) => x.from === c)
    if (!r || !validRate(r.rate.replace(',', '.'))) f[`rates.${c}.rate`] = `Registrá el tipo de cambio ${c}→${input.currency} (manual).`
    else {
      if (!isIsoDate(r.date)) f[`rates.${c}.date`] = 'Fecha del tipo de cambio.'
      if (!r.source.trim()) f[`rates.${c}.source`] = 'Indicá la referencia o fuente.'
    }
  }
  input.adjustments.forEach((a, i) => {
    if (!a.concept.trim()) f[`adjustments.${i}.concept`] = 'Documentá el concepto.'
    if (!isMoney(a.amount, { allowNegative: true }) || a.amount === 0) f[`adjustments.${i}.amount`] = 'Importe distinto de 0.'
  })
  if (!Object.keys(f).length) {
    const t = batchTotals({ lines, deductions, adjustments: input.adjustments.map((a, i) => ({ id: String(i), ...a })) })
    if (cmpMoney(t.offset, 0) < 0) f.adjustments = 'Un ajuste a favor no puede superar las deducciones: registralo como ajuste del proyecto.'
    else if (cmpMoney(t.net, 0) < 0) f.deductions = `Las deducciones superan los saldos seleccionados en ${input.currency} ${subMoney(t.offset, t.gross)}: deducí parcialmente; el resto queda pendiente para la próxima liquidación.`
  }
  return { lines, deductions, f }
}

export function createBatch(ds: Dataset, input: BatchInput, requestId: string, ctx: DomainContext): { ds: Dataset; batchId: string; duplicate: boolean } {
  const prior = ds.requests[requestId]
  if (prior && ds.settlementBatches.some((b) => b.id === prior)) return { ds, batchId: prior, duplicate: true }
  const { lines, deductions, f } = build(ds, input, ctx)
  if (Object.keys(f).length) throw new DomainError('Revisá la liquidación.', f)
  const batch: SettlementBatch = {
    id: ctx.newId('liq'),
    number: nextNumber(ds.settlementBatches.map((b) => b.number), 'LIQ', ctx.today()),
    supplierId: input.supplierId,
    currency: input.currency as CurrencyCode,
    date: input.date,
    status: 'draft',
    lines,
    deductions,
    adjustments: input.adjustments.map((a) => ({ id: ctx.newId('ba'), concept: a.concept.trim(), amount: a.amount, reference: a.reference?.trim() || undefined })),
    compensation: [],
    allocationMode: 'pro-rata',
    notes: input.notes?.trim() || undefined,
    createdAt: businessStamp(ctx),
    history: [{ id: ctx.newId('bh'), date: businessStamp(ctx), action: 'Borrador creado' }],
  }
  const next: Dataset = { ...ds, settlementBatches: [...ds.settlementBatches, batch], requests: { ...ds.requests, [requestId]: batch.id } }
  return { ds: appendAudit(next, { entity: 'settlement', entityId: batch.id, action: 'batch-draft', detail: batch.number }, ctx), batchId: batch.id, duplicate: false }
}

export function updateBatchDraft(ds: Dataset, id: string, input: BatchInput, ctx: DomainContext): Dataset {
  const b = findById(ds.settlementBatches, id)
  if (!b || b.status !== 'draft') throw new DomainError('Solo se edita un borrador.')
  const { lines, deductions, f } = build(ds, { ...input, supplierId: b.supplierId }, ctx, id)
  if (Object.keys(f).length) throw new DomainError('Revisá la liquidación.', f)
  return {
    ...ds,
    settlementBatches: replaceById(ds.settlementBatches, id, (x) => ({
      ...x,
      currency: input.currency as CurrencyCode,
      date: input.date,
      lines,
      deductions,
      adjustments: input.adjustments.map((a) => ({ id: ctx.newId('ba'), concept: a.concept.trim(), amount: a.amount, reference: a.reference?.trim() || undefined })),
      notes: input.notes?.trim() || undefined,
      history: [{ id: ctx.newId('bh'), date: businessStamp(ctx), action: 'Borrador modificado' }, ...x.history],
    })),
  }
}

/** Projects of the batch whose costs are still open (a confirmation requires explicit acknowledgement). */
export const openCostProjects = (ds: Dataset, b: Pick<SettlementBatch, 'lines'>) => [...new Set(b.lines.map((l) => l.projectId))].filter((pid) => !isCostClosed(findById(ds.projects, pid)))

/**
 * Commits the balances and freezes the calculation snapshot. Later costs or
 * rate changes never alter it; differences are shown, not applied.
 */
export function confirmBatch(ds: Dataset, id: string, input: { acknowledgeOpenCosts: boolean }, ctx: DomainContext): Dataset {
  const b = findById(ds.settlementBatches, id)
  if (!b || b.status !== 'draft') throw new DomainError('Solo se confirma un borrador.')
  const input2: BatchInput = {
    supplierId: b.supplierId,
    currency: b.currency,
    date: b.date,
    lines: b.lines.map((l) => ({ settlementId: l.settlementId, amount: l.amount })),
    deductions: b.deductions.map((d) => ({ costId: d.costId, amount: d.amount })),
    rates: [...b.lines, ...b.deductions].filter((x) => x.fx).map((x) => ({ from: x.fx!.from, rate: x.fx!.rate, date: x.fx!.date, source: x.fx!.source })),
    adjustments: b.adjustments,
  }
  const { f } = build(ds, input2, ctx, id)
  if (Object.keys(f).length) throw new DomainError('Los saldos cambiaron desde el borrador: revisalo antes de confirmar.', f)
  const open = openCostProjects(ds, b)
  if (open.length && !input.acknowledgeOpenCosts) throw new DomainError(`Hay ${open.length} proyecto(s) con costos abiertos: confirmá explícitamente que liquidás igual.`, { acknowledgeOpenCosts: 'Confirmación requerida' })
  const lines: BatchLine[] = b.lines.map((l) => {
    const fin = settlementFinancials(ds, findById(ds.settlements, l.settlementId)!, ctx.today())
    return { ...l, snapshot: { netRevenue: fin.netRevenue, directCosts: fin.directCosts, fiscalAdjustments: fin.fiscalAdjustments, base: fin.base, pctLabel: fin.pctLabel, partnerShare: fin.partnerShare ?? 0, partnerPaid: fin.partnerPaid, available: fin.available, costsClosed: isCostClosed(findById(ds.projects, l.projectId)) } }
  })
  // Participations and deductions stay independent items: nothing is offset against a
  // specific project. Payments split proportionally (see batchPaymentBreakdown).
  // Legacy "ordered" drafts (pre-change) keep the old compensation for consistency.
  const compensation: SettlementBatch['compensation'] = []
  if (isOrdered(b)) {
    let left = batchTotals(b).offset
    for (const l of lines) {
      if (cmpMoney(left, 0) <= 0) break
      const amount = minMoney(left, l.converted)
      compensation.push({ lineId: l.id, amount })
      left = subMoney(left, amount)
    }
  }
  const next: Dataset = {
    ...ds,
    settlementBatches: replaceById(ds.settlementBatches, id, (x) => ({
      ...x,
      lines,
      compensation,
      status: 'confirmed',
      confirmedAt: businessStamp(ctx),
      openCostsAcknowledged: open.length ? true : undefined,
      history: [{ id: ctx.newId('bh'), date: businessStamp(ctx), action: 'Liquidación confirmada', detail: `Neto ${x.currency} ${batchTotals(x).net}${open.length ? ` · con costos abiertos en ${open.length} proyecto(s)` : ''}` }, ...x.history],
    })),
  }
  return appendAudit(next, { entity: 'settlement', entityId: id, action: 'batch-confirm', detail: b.number }, ctx)
}

export interface BatchFinancials extends BatchTotals {
  paid: number
  outstanding: number
  status: 'draft' | 'confirmed' | 'partially-paid' | 'paid' | 'cancelled'
}

export function batchFinancials(ds: Pick<Dataset, 'supplierPayments'>, b: SettlementBatch): BatchFinancials {
  const t = batchTotals(b)
  const paid = isOrdered(b) ? sumMoney([...lineProgress(ds, b).values()], (p) => p.cash) : batchCashPaid(ds, b)
  const outstanding = b.status === 'confirmed' ? subMoney(t.net, paid) : t.net
  let status: BatchFinancials['status'] = b.status
  if (b.status === 'confirmed') status = cmpMoney(outstanding, 0) <= 0 ? 'paid' : cmpMoney(paid, 0) > 0 ? 'partially-paid' : 'confirmed'
  return { ...t, paid, outstanding, status }
}

/** Releases a batch (frees its commitments) only when no recorded payment uses it. The record is kept. */
export function cancelBatch(ds: Dataset, id: string, reason: string, ctx: DomainContext): Dataset {
  const b = findById(ds.settlementBatches, id)
  if (!b || b.status === 'cancelled') throw new DomainError('La liquidación no existe o ya fue liberada.')
  if (!reason.trim()) throw new DomainError('Indicá el motivo.', { reason: 'Indicá el motivo.' })
  if (ds.supplierPayments.some((p) => p.status === 'recorded' && (p.batchAllocations?.some((a) => a.batchId === id) || p.batchDeductions?.some((d) => d.batchId === id)))) throw new DomainError('Tiene pagos registrados: revertí primero esos pagos.')
  const next: Dataset = {
    ...ds,
    settlementBatches: replaceById(ds.settlementBatches, id, (x) => ({ ...x, status: 'cancelled', cancelledAt: ctx.today(), cancelReason: reason.trim(), history: [{ id: ctx.newId('bh'), date: businessStamp(ctx), action: b.status === 'draft' ? 'Borrador descartado' : 'Liquidación liberada', detail: reason.trim() }, ...x.history] })),
  }
  return appendAudit(next, { entity: 'settlement', entityId: id, action: 'batch-cancel', detail: reason.trim() }, ctx)
}

/** Current vs snapshot share per line: differences are shown for a future adjustment, never applied. */
export function batchDifferences(ds: Dataset, b: SettlementBatch, today: string): { lineId: string; snapshotShare: number; currentShare: number; difference: number }[] {
  if (b.status !== 'confirmed') return []
  return b.lines
    .filter((l) => l.snapshot)
    .map((l) => {
      const s = findById(ds.settlements, l.settlementId)
      const cur = s ? (settlementFinancials(ds, s, today).partnerShare ?? 0) : 0
      return { lineId: l.id, snapshotShare: l.snapshot!.partnerShare, currentShare: cur, difference: subMoney(cur, l.snapshot!.partnerShare) }
    })
    .filter((d) => cmpMoney(d.difference, 0) !== 0)
}

/** Plain-text receipt, reusable for future notifications (nothing is sent). */
export function batchSummaryText(ds: Dataset, b: SettlementBatch): string {
  const f = batchFinancials(ds, b)
  const m = (v: number, c: CurrencyCode = b.currency) => `${c} ${v.toFixed(2)}`
  const out = [`Liquidación ${b.number} · ${b.date} · ${findById(ds.suppliers, b.supplierId)?.name ?? ''}`, `Moneda: ${b.currency} · Estado: ${f.status}`, '', 'Proyectos incluidos:']
  for (const l of b.lines) {
    const p = findById(ds.projects, l.projectId)
    const snap = l.snapshot
    out.push(`- ${p?.code}: ${m(l.amount, l.currency)}${l.fx ? ` × ${l.fx.rate} (${l.fx.date}, ${l.fx.source}) = ${m(l.converted)}` : ''}${snap ? ` · base ${m(snap.base, l.currency)} · ${snap.pctLabel} · ajustes fiscales ${m(snap.fiscalAdjustments, l.currency)}${snap.costsClosed ? '' : ' · costos abiertos'}` : ''}`)
  }
  if (b.deductions.length) {
    out.push('', 'Gastos compartidos descontados:')
    for (const d of b.deductions) {
      const c = findById(ds.costs, d.costId)
      out.push(`- ${c?.description} (${d.partnerPct}% Florencia / ${d.ownerPct}% Eugenia): ${m(d.amount, d.currency)}${d.fx ? ` × ${d.fx.rate} = ${m(d.converted)}` : ''}`)
    }
  }
  if (b.adjustments.length) out.push('', 'Ajustes:', ...b.adjustments.map((a) => `- ${a.concept}: ${m(a.amount)}${a.reference ? ` (${a.reference})` : ''}`))
  out.push('', `Bruto: ${m(f.gross)} · Deducciones: ${m(f.deductions)} · Ajustes: ${m(f.adjustments)}`, `Neto liquidado: ${m(f.net)}`, `Pagado: ${m(f.paid)} · Saldo pendiente: ${m(f.outstanding)}`)
  const pays = ds.supplierPayments.filter((p) => p.status === 'recorded' && (p.batchAllocations ?? []).some((a) => a.batchId === b.id))
  if (pays.length) {
    out.push('', 'Pagos:')
    for (const p of pays) {
      out.push(`- ${p.number} ${p.date}: ${m(p.amount)}${p.reference ? ` (${p.reference})` : ''}`)
      for (const a of p.batchAllocations ?? []) out.push(`    participación ${findById(ds.projects, b.lines.find((l) => l.id === a.lineId)?.projectId ?? '')?.code}: ${m(a.amount)}${a.originalCurrency !== b.currency ? ` = ${m(a.originalAmount, a.originalCurrency)}` : ''}`)
      for (const d of p.batchDeductions ?? []) out.push(`    deducción ${findById(ds.costs, d.costId)?.description}: -${m(d.amount)}`)
      if (p.batchAdjustment) out.push(`    ajustes: ${m(p.batchAdjustment)}`)
    }
  }
  return out.join('\n')
}

export const batchCurrencies = (b: Pick<SettlementBatch, 'lines' | 'deductions'>) => [...new Set([...b.lines.map((l) => l.currency), ...b.deductions.map((d) => d.currency)])]
