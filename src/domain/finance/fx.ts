import type { CurrencyCode, ExchangeRate } from '@/types/domain'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from './audit'

export interface ExchangeRateInput {
  base: CurrencyCode | ''
  quote: CurrencyCode | ''
  rate: string
  effectiveDate: string
  source: string
  notes?: string
}

const RATE = /^\d{1,9}(\.\d{1,8})?$/

export function validateRate(input: ExchangeRateInput): Record<string, string> {
  const f: Record<string, string> = {}
  if (!input.base) f.base = 'Elegí la moneda origen.'
  if (!input.quote) f.quote = 'Elegí la moneda destino.'
  if (input.base && input.base === input.quote) f.quote = 'Las monedas deben ser distintas.'
  const rate = input.rate.trim().replace(',', '.')
  if (!RATE.test(rate) || Number(rate) <= 0) f.rate = 'Cotización positiva, con punto decimal (hasta 8 decimales).'
  if (!isIsoDate(input.effectiveDate)) f.effectiveDate = 'Fecha inválida.'
  if (!input.source.trim()) f.source = 'Indicá la fuente de la cotización.'
  return f
}

/** Records a rate for reference. SIGR does not convert or consolidate with it yet. */
export function recordExchangeRate(ds: Dataset, input: ExchangeRateInput, ctx: DomainContext): { ds: Dataset; rateId: string } {
  const f = validateRate(input)
  if (Object.keys(f).length) throw new DomainError('Revisá el tipo de cambio.', f)
  const rate: ExchangeRate = {
    id: ctx.newId('fx'),
    base: input.base as CurrencyCode,
    quote: input.quote as CurrencyCode,
    rate: input.rate.trim().replace(',', '.'),
    effectiveDate: input.effectiveDate,
    source: input.source.trim(),
    notes: input.notes?.trim() || undefined,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  const next: Dataset = { ...ds, exchangeRates: [rate, ...ds.exchangeRates] }
  return { ds: appendAudit(next, { entity: 'exchange-rate', entityId: rate.id, action: 'record', detail: `${rate.base}/${rate.quote} ${rate.rate} (${rate.effectiveDate})` }, ctx), rateId: rate.id }
}

/** Manual adjustment: a new record supersedes the old one; history is preserved. */
export function correctExchangeRate(ds: Dataset, rateId: string, newRate: string, reason: string, ctx: DomainContext): { ds: Dataset; rateId: string } {
  const old = findById(ds.exchangeRates, rateId)
  if (!old) throw new DomainError('El tipo de cambio no existe.')
  if (old.supersededById) throw new DomainError('Este tipo de cambio ya fue corregido.')
  if (!reason.trim()) throw new DomainError('Indicá el motivo del ajuste.', { reason: 'Indicá el motivo.' })
  const { ds: withNew, rateId: newId } = recordExchangeRate(ds, { base: old.base, quote: old.quote, rate: newRate, effectiveDate: old.effectiveDate, source: old.source, notes: `Ajuste: ${reason.trim()}` }, ctx)
  const next: Dataset = {
    ...withNew,
    exchangeRates: withNew.exchangeRates.map((r) => (r.id === newId ? { ...r, supersedesId: old.id } : r)),
  }
  return { ds: { ...next, exchangeRates: replaceById(next.exchangeRates, old.id, (r) => ({ ...r, supersededById: newId })) }, rateId: newId }
}
