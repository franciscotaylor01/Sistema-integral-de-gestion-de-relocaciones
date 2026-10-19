import { brand } from '@/config/brand'
import type { CurrencyCode } from '@/types/domain'

const cache = new Map<string, Intl.NumberFormat>()

function numberFormat(key: string, options: Intl.NumberFormatOptions) {
  let fmt = cache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(brand.locale, options)
    cache.set(key, fmt)
  }
  return fmt
}

/** "USD 9.300" — ISO code display avoids ambiguity between USD and ARS "$". */
export function formatCurrency(value: number, currency: CurrencyCode, options: { decimals?: number } = {}): string {
  const decimals = options.decimals ?? 0
  return numberFormat(`c:${currency}:${decimals}`, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** "USD 77,4 mil", "ARS 19,4 M" — for KPI tiles and chart axes. */
export function formatCompactCurrency(value: number, currency: CurrencyCode): string {
  return numberFormat(`cc:${currency}`, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    notation: 'compact',
    maximumFractionDigits: 1,
  })
    .format(value)
    .replace(/\bK\b/, 'k')
}

/** es-AR mixes "5 K" and "10 k"; normalise to lowercase. */
export function formatCompactNumber(value: number): string {
  return numberFormat('n:compact', { notation: 'compact', maximumFractionDigits: 1 }).format(value).replace(/\bK\b/, 'k')
}

export function formatNumber(value: number, decimals = 0): string {
  return numberFormat(`n:${decimals}`, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

export function formatPercent(value: number, decimals = 0): string {
  return `${formatNumber(value, decimals)}%`
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Buenos días'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}
