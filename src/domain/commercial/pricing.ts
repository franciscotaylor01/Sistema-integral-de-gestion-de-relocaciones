import { getServiceType } from '@/config/serviceCatalog'
import type { CountryCode, CurrencyCode, PriceEntry, PriceMarket, PriceUnit } from '@/types/domain'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { logActivityGlobal } from './activity'

export interface PriceEntryInput {
  clientId: string
  serviceTypeId: string
  market: PriceMarket
  currency: CurrencyCode | ''
  unitPrice: number
  unit: PriceUnit
  minQuantity: number
  validFrom: string
  validTo?: string
  active: boolean
  agreement?: string
  notes?: string
}

const rangesOverlap = (aFrom: string, aTo: string | undefined, bFrom: string, bTo: string | undefined) =>
  aFrom <= (bTo ?? '9999-12-31') && bFrom <= (aTo ?? '9999-12-31')

/** Active rules that would compete with `entry` for the same quote line. */
export function findOverlaps(ds: Pick<Dataset, 'priceEntries'>, entry: Omit<PriceEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): PriceEntry[] {
  if (!entry.active) return []
  return ds.priceEntries.filter(
    (e) =>
      e.id !== entry.id &&
      e.active &&
      e.clientId === entry.clientId &&
      e.serviceTypeId === entry.serviceTypeId &&
      e.market === entry.market &&
      e.currency === entry.currency &&
      e.minQuantity === entry.minQuantity &&
      rangesOverlap(e.validFrom, e.validTo, entry.validFrom, entry.validTo),
  )
}

export function validatePriceEntry(ds: Dataset, input: PriceEntryInput): Record<string, string> {
  const f: Record<string, string> = {}
  if (!ds.clients.some((c) => c.id === input.clientId)) f.clientId = 'Elegí un cliente.'
  if (!getServiceType(input.serviceTypeId).workflowTemplateId) f.serviceTypeId = 'Elegí un servicio del catálogo.'
  if (!input.currency) f.currency = 'Elegí la moneda.'
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0) f.unitPrice = 'Ingresá un precio mayor a cero.'
  if (!Number.isInteger(input.minQuantity) || input.minQuantity < 1) f.minQuantity = 'Cantidad mínima: entero desde 1.'
  if (!isIsoDate(input.validFrom)) f.validFrom = 'Ingresá la fecha de inicio de vigencia.'
  if (input.validTo && !isIsoDate(input.validTo)) f.validTo = 'Fecha inválida.'
  if (isIsoDate(input.validFrom) && input.validTo && isIsoDate(input.validTo) && input.validTo < input.validFrom) {
    f.validTo = 'La vigencia no puede terminar antes de empezar.'
  }
  if ((input.notes?.length ?? 0) > 500) f.notes = 'Máximo 500 caracteres.'
  return f
}

function normalize(input: PriceEntryInput) {
  return {
    clientId: input.clientId,
    serviceTypeId: input.serviceTypeId,
    market: input.market,
    currency: input.currency as CurrencyCode,
    unitPrice: Math.round(input.unitPrice * 100) / 100,
    unit: input.unit,
    minQuantity: input.minQuantity,
    validFrom: input.validFrom,
    validTo: input.validTo || undefined,
    active: input.active,
    agreement: input.agreement?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  }
}

/**
 * Overlapping rules are allowed only when explicitly acknowledged, because
 * they make price suggestions ambiguous (the user will be asked to choose).
 */
export function createPriceEntry(ds: Dataset, input: PriceEntryInput, ctx: DomainContext, options: { acceptOverlap?: boolean } = {}): { ds: Dataset; entry: PriceEntry } {
  const fields = validatePriceEntry(ds, input)
  if (Object.keys(fields).length) throw new DomainError('Revisá la regla de precio.', fields)
  const entry: PriceEntry = { id: ctx.newId('tar'), ...normalize(input), createdAt: ctx.now(), updatedAt: ctx.now() }
  const overlaps = findOverlaps(ds, entry)
  if (overlaps.length && !options.acceptOverlap) {
    throw new DomainError(`Se superpone con ${overlaps.length} regla(s) vigente(s). Confirmá para guardarla igualmente.`, { overlap: 'overlap' })
  }
  let next: Dataset = { ...ds, priceEntries: [...ds.priceEntries, entry] }
  next = logActivityGlobal(next, `Nueva tarifa de ${getServiceType(entry.serviceTypeId).label}: ${entry.currency} ${entry.unitPrice}.`, ctx, entry.clientId)
  return { ds: next, entry }
}

/** Edits a rule. Approved quotations keep their own frozen prices. */
export function updatePriceEntry(ds: Dataset, entryId: string, input: PriceEntryInput, ctx: DomainContext, options: { acceptOverlap?: boolean } = {}): Dataset {
  const current = findById(ds.priceEntries, entryId)
  if (!current) throw new DomainError('La regla de precio no existe.')
  if (input.clientId !== current.clientId) throw new DomainError('No se puede mover una tarifa a otro cliente.')
  const fields = validatePriceEntry(ds, input)
  if (Object.keys(fields).length) throw new DomainError('Revisá la regla de precio.', fields)
  const updated: PriceEntry = { ...current, ...normalize(input), updatedAt: ctx.now() }
  const overlaps = findOverlaps(ds, updated)
  if (overlaps.length && !options.acceptOverlap) {
    throw new DomainError(`Se superpone con ${overlaps.length} regla(s) vigente(s). Confirmá para guardarla igualmente.`, { overlap: 'overlap' })
  }
  const next: Dataset = { ...ds, priceEntries: replaceById(ds.priceEntries, entryId, () => updated) }
  return logActivityGlobal(next, `Tarifa de ${getServiceType(updated.serviceTypeId).label} actualizada.`, ctx, updated.clientId)
}

export interface PriceQuery {
  clientId: string
  serviceTypeId: string
  market: CountryCode
  currency: CurrencyCode
  date: string
  quantity: number
}

export type PriceResolution =
  | { status: 'none'; candidates: [] }
  | { status: 'unique'; entry: PriceEntry; candidates: PriceEntry[]; rule: string }
  | { status: 'ambiguous'; candidates: PriceEntry[] }

/**
 * Finds the applicable price. Documented precedence:
 *   1. market-specific rules beat "any market" rules;
 *   2. the highest quantity tier not above the requested quantity wins.
 * Two rules tied on both criteria are ambiguous and returned for user review.
 */
export function resolvePrice(ds: Pick<Dataset, 'priceEntries'>, q: PriceQuery): PriceResolution {
  const applicable = ds.priceEntries.filter(
    (e) =>
      e.active &&
      e.clientId === q.clientId &&
      e.serviceTypeId === q.serviceTypeId &&
      e.currency === q.currency &&
      (e.market === q.market || e.market === 'ANY') &&
      e.validFrom <= q.date &&
      (!e.validTo || e.validTo >= q.date) &&
      e.minQuantity <= Math.max(1, q.quantity),
  )
  if (applicable.length === 0) return { status: 'none', candidates: [] }
  const specific = applicable.filter((e) => e.market === q.market)
  const pool = specific.length ? specific : applicable
  const topTier = Math.max(...pool.map((e) => e.minQuantity))
  const best = pool.filter((e) => e.minQuantity === topTier)
  if (best.length > 1) return { status: 'ambiguous', candidates: best }
  const reasons = [specific.length && applicable.length > specific.length ? 'regla específica del mercado sobre la general' : '', topTier > 1 ? `tramo desde ${topTier} unidades` : '']
  return { status: 'unique', entry: best[0], candidates: applicable, rule: reasons.filter(Boolean).join(' · ') }
}
