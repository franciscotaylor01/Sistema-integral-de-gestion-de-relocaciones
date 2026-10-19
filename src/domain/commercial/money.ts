import type { CurrencyCode } from '@/types/domain'
import { addMoney, fromCents, subMoney, toCents } from '../finance/money'

/** Amounts per currency. Never summed across currencies (no conversion policy yet). */
export type Amounts = Partial<Record<CurrencyCode, number>>

/** Normalises to cents precision (decimal-safe, see finance/money.ts). */
export const round2 = (n: number) => fromCents(toCents(n))

export function addAmount(acc: Amounts, currency: CurrencyCode, amount: number): Amounts {
  return { ...acc, [currency]: addMoney(acc[currency] ?? 0, amount) }
}

export function sumAmounts(...list: Amounts[]): Amounts {
  return list.reduce<Amounts>((acc, a) => {
    let next = acc
    for (const [c, v] of Object.entries(a) as [CurrencyCode, number][]) next = addAmount(next, c, v)
    return next
  }, {})
}

export function subtractAmounts(a: Amounts, b: Amounts): Amounts {
  const out: Amounts = { ...a }
  for (const [c, v] of Object.entries(b) as [CurrencyCode, number][]) out[c] = subMoney(out[c] ?? 0, v)
  return out
}

export const amountOf = (a: Amounts, c: CurrencyCode) => a[c] ?? 0
export const hasAmount = (a: Amounts) => Object.values(a).some((v) => toCents(v ?? 0) > 0)
