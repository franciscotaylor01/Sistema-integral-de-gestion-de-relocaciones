import type { CurrencyCode } from '@/types/domain'

/** Amounts grouped per currency. Values are never converted between currencies. */
export type MoneyByCurrency = Partial<Record<CurrencyCode, number>>

export function sumByCurrency<T>(items: T[], currency: (item: T) => CurrencyCode, amount: (item: T) => number): MoneyByCurrency {
  const out: MoneyByCurrency = {}
  for (const item of items) {
    const c = currency(item)
    out[c] = (out[c] ?? 0) + amount(item)
  }
  return out
}

/** Stable currency order for display: reporting currency first, then by code. */
export const CURRENCY_ORDER: CurrencyCode[] = ['USD', 'EUR', 'ARS', 'BRL', 'MXN', 'GBP', 'CLP']

export function currencyEntries(money: MoneyByCurrency): [CurrencyCode, number][] {
  return CURRENCY_ORDER.filter((c) => money[c] !== undefined).map((c) => [c, money[c] ?? 0])
}
