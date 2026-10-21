import type { BatchLine, CurrencyCode, SettlementBatch, SupplierPayment } from '@/types/domain'
import type { Dataset } from '../dataset'
import { addMoney, cmpMoney, fromCents, subMoney, sumMoney, toCents } from './money'

/*
 * Phase 4.9 — progress of grouped settlements, shared by the participation
 * calculation and the batch screens (no dependency on settlements.ts).
 *
 * Pro-rata model (current): participations (lines) and shared-expense
 * deductions are independent items. Each payment of the net is split
 * proportionally: Σ line parts − Σ deduction parts + adjustment part = cash.
 * Legacy "ordered" batches keep their recorded compensation untouched.
 */

const RATE = /^\d{1,9}(\.\d{1,8})?$/
export const validRate = (r: string) => RATE.test(r.trim()) && Number(r) > 0

export const isOrdered = (b: Pick<SettlementBatch, 'allocationMode'>) => b.allocationMode !== 'pro-rata'

/** amount × rate, rounded half-up to cents with integer arithmetic (BigInt-safe for ARS). */
export function convertAmount(amount: number, rate: string): number {
  const [i, d = ''] = rate.trim().split('.')
  const scale = 10n ** BigInt(d.length)
  const r = BigInt(i + d)
  const n = BigInt(toCents(amount)) * r
  const q = (n * 2n + (n >= 0n ? scale : -scale)) / (2n * scale)
  return fromCents(Number(q))
}

/** a × part / whole in cents, half-up (BigInt-safe). */
function prorate(a: number, part: number, whole: number): number {
  const w = BigInt(toCents(whole))
  if (w === 0n) return 0
  const n = BigInt(toCents(a)) * BigInt(toCents(part))
  const sign = n < 0n ? -1n : 1n
  const abs = n * sign
  return fromCents(Number(((abs * 2n + w) / (2n * w)) * sign))
}

/** Inverse of a line conversion for a partial amount: part × amount / converted. */
export function toLineCurrency(line: Pick<BatchLine, 'amount' | 'converted' | 'currency'>, part: number, batchCurrency: CurrencyCode): number {
  if (line.currency === batchCurrency || cmpMoney(line.converted, 0) === 0) return part
  return prorate(line.amount, part, line.converted)
}

const recorded = (ds: Pick<Dataset, 'supplierPayments'>, batchId: string): SupplierPayment[] =>
  ds.supplierPayments.filter((p) => p.status === 'recorded' && ((p.batchAllocations ?? []).some((a) => a.batchId === batchId) || (p.batchDeductions ?? []).some((d) => d.batchId === batchId)))

export interface LineProgress {
  /** Legacy only: deductions offset against this line at confirmation. */
  compensated: number
  /** Participation settled by payments (batch currency). */
  cash: number
  settled: number
  remaining: number
  /** Settled in the project currency. */
  settledOriginal: number
}

export function lineProgress(ds: Pick<Dataset, 'supplierPayments'>, batch: SettlementBatch): Map<string, LineProgress> {
  const out = new Map<string, LineProgress>()
  for (const l of batch.lines) out.set(l.id, { compensated: 0, cash: 0, settled: 0, remaining: l.converted, settledOriginal: 0 })
  if (batch.status !== 'confirmed') return out
  if (isOrdered(batch)) for (const c of batch.compensation) {
    const p = out.get(c.lineId)
    if (p) p.compensated = addMoney(p.compensated, c.amount)
  }
  const orig = new Map<string, number>()
  for (const pay of recorded(ds, batch.id)) {
    for (const a of pay.batchAllocations ?? []) {
      if (a.batchId !== batch.id) continue
      const p = out.get(a.lineId)
      if (!p) continue
      p.cash = addMoney(p.cash, a.amount)
      orig.set(a.lineId, addMoney(orig.get(a.lineId) ?? 0, a.originalAmount))
    }
  }
  for (const l of batch.lines) {
    const p = out.get(l.id)!
    p.settled = addMoney(p.compensated, p.cash)
    p.remaining = subMoney(l.converted, p.settled)
    p.settledOriginal = addMoney(toLineCurrency(l, p.compensated, batch.currency), orig.get(l.id) ?? 0)
  }
  return out
}

export interface DeductionProgress {
  /** Offset so far (batch currency). Legacy batches: fully offset at confirmation. */
  offset: number
  remaining: number
  offsetOriginal: number
}

export function deductionProgress(ds: Pick<Dataset, 'supplierPayments'>, batch: SettlementBatch): Map<string, DeductionProgress> {
  const out = new Map<string, DeductionProgress>()
  for (const d of batch.deductions) {
    const legacyDone = batch.status === 'confirmed' && isOrdered(batch)
    out.set(d.id, { offset: legacyDone ? d.converted : 0, remaining: legacyDone ? 0 : d.converted, offsetOriginal: legacyDone ? d.amount : 0 })
  }
  if (batch.status !== 'confirmed' || isOrdered(batch)) return out
  for (const pay of recorded(ds, batch.id)) {
    for (const x of pay.batchDeductions ?? []) {
      if (x.batchId !== batch.id) continue
      const p = out.get(x.deductionId)
      if (!p) continue
      p.offset = addMoney(p.offset, x.amount)
      p.remaining = subMoney(p.remaining, x.amount)
      p.offsetOriginal = addMoney(p.offsetOriginal, x.originalAmount)
    }
  }
  return out
}

/** Cash paid against a batch (reversed payments excluded). */
export const batchCashPaid = (ds: Pick<Dataset, 'supplierPayments'>, batch: SettlementBatch) => sumMoney(recorded(ds, batch.id), (p) => p.amount)

export interface PaymentBreakdown {
  lines: { lineId: string; amount: number; originalAmount: number }[]
  deductions: { deductionId: string; amount: number; originalAmount: number }[]
  adjustment: number
}

/**
 * Pro-rata split of a cash payment over the batch items still open.
 * Paying the full outstanding closes every item exactly; otherwise each item
 * receives cash/outstanding of its remaining balance and the cent residue (if
 * any) goes to the largest participation line — deterministic and verifiable.
 */
export function batchPaymentBreakdown(ds: Pick<Dataset, 'supplierPayments'>, batch: SettlementBatch, cash: number): PaymentBreakdown {
  const lp = lineProgress(ds, batch)
  const dp = deductionProgress(ds, batch)
  const adjTotal = sumMoney(batch.adjustments, (a) => a.amount)
  const paid = batchCashPaid(ds, batch)
  const net = subMoney(subMoney(sumMoney(batch.lines, (l) => l.converted), sumMoney(batch.deductions, (d) => d.converted)), -adjTotal)
  const outstanding = subMoney(net, paid)
  // Adjustment part already settled by earlier payments.
  const adjPaid = sumMoney(recorded(ds, batch.id), (p) => p.batchAdjustment ?? 0)
  const adjRemaining = subMoney(adjTotal, adjPaid)
  const full = cmpMoney(cash, outstanding) === 0
  const share = (remaining: number) => (full ? remaining : prorate(remaining, cash, outstanding))
  const lines = batch.lines.map((l) => {
    const rem = lp.get(l.id)!.remaining
    const amount = share(rem)
    const origRemaining = subMoney(l.amount, lp.get(l.id)!.settledOriginal)
    return { lineId: l.id, amount, originalAmount: full ? origRemaining : toLineCurrency(l, amount, batch.currency) }
  })
  const deductions = batch.deductions.map((d) => {
    const rem = dp.get(d.id)!.remaining
    const amount = share(rem)
    const origRemaining = subMoney(d.amount, dp.get(d.id)!.offsetOriginal)
    return { deductionId: d.id, amount, originalAmount: full ? origRemaining : d.currency === batch.currency ? amount : prorate(d.amount, amount, d.converted) }
  })
  const adjustment = share(adjRemaining)
  const residue = subMoney(cash, addMoney(subMoney(sumMoney(lines, (l) => l.amount), sumMoney(deductions, (d) => d.amount)), adjustment))
  if (cmpMoney(residue, 0) !== 0 && lines.length) {
    const i = lines.reduce((best, l, j) => (l.amount > lines[best].amount ? j : best), 0)
    const l = batch.lines[i]
    lines[i] = { ...lines[i], amount: addMoney(lines[i].amount, residue), originalAmount: toLineCurrency(l, addMoney(lines[i].amount, residue), batch.currency) }
  }
  return { lines: lines.filter((l) => cmpMoney(l.amount, 0) !== 0), deductions: deductions.filter((d) => cmpMoney(d.amount, 0) !== 0), adjustment }
}

/** For a project participation: settled through batches and still committed (confirmed, unpaid) — project currency. */
export function settlementBatchProgress(ds: Pick<Dataset, 'settlementBatches' | 'supplierPayments'>, settlementId: string): { settled: number; committed: number } {
  let settled = 0
  let committed = 0
  for (const b of ds.settlementBatches ?? []) {
    if (b.status !== 'confirmed') continue
    const prog = lineProgress(ds, b)
    for (const l of b.lines) {
      if (l.settlementId !== settlementId) continue
      const p = prog.get(l.id)!
      settled = addMoney(settled, p.settledOriginal)
      const left = subMoney(l.amount, p.settledOriginal)
      if (cmpMoney(left, 0) > 0) committed = addMoney(committed, left)
    }
  }
  return { settled, committed }
}
