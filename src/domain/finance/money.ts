/*
 * Decimal-safe money arithmetic. Amounts are persisted as numbers with at most
 * two decimals (major units), but every calculation runs on integer cents so
 * results never drift (0.1 + 0.2 === 0.3). Quantities allow three decimals and
 * rates four; products are rounded half away from zero, once.
 */

const SCALE = 100

/** Major units → integer cents. */
export const toCents = (amount: number): number => Math.round(amount * SCALE)
/** Integer cents → major units. */
export const fromCents = (cents: number): number => cents / SCALE

/** True for finite amounts with at most two decimals. */
export function isMoney(amount: unknown, options: { allowNegative?: boolean } = {}): amount is number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return false
  if (!options.allowNegative && amount < 0) return false
  return Math.abs(amount * SCALE - Math.round(amount * SCALE)) < 1e-6
}

export function isQuantity(q: unknown): q is number {
  return typeof q === 'number' && Number.isFinite(q) && q > 0 && Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-6
}

/** Integer division rounding half away from zero. */
function divRound(numerator: number, denominator: number): number {
  const sign = Math.sign(numerator) * Math.sign(denominator)
  const n = Math.abs(numerator)
  const d = Math.abs(denominator)
  return sign * Math.floor((2 * n + d) / (2 * d))
}

export function addMoney(...amounts: number[]): number {
  return fromCents(amounts.reduce((sum, a) => sum + toCents(a), 0))
}

export function subMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b))
}

/** unitPrice × quantity (quantity up to 3 decimals). */
export function mulMoney(unitPrice: number, quantity: number): number {
  return fromCents(divRound(toCents(unitPrice) * Math.round(quantity * 1000), 1000))
}

/** amount × ratePct / 100 (rate up to 4 decimals, e.g. 21 or 10.5). */
export function percentOf(amount: number, ratePct: number): number {
  return fromCents(divRound(toCents(amount) * Math.round(ratePct * 10000), 1_000_000))
}

export const cmpMoney = (a: number, b: number) => toCents(a) - toCents(b)
export const minMoney = (a: number, b: number) => (cmpMoney(a, b) <= 0 ? a : b)
export const sumMoney = <T>(items: T[], pick: (item: T) => number) => addMoney(...items.map(pick))
