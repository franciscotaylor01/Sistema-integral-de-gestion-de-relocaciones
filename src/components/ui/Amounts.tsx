import type { Amounts } from '@/domain/commercial/money'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'

/** Amounts per currency, one per line — never added across currencies. */
export function AmountsText({ amounts, className, empty = '—', inline }: { amounts: Amounts; className?: string; empty?: string; inline?: boolean }) {
  const entries = CURRENCY_ORDER.filter((c) => (amounts[c] ?? 0) !== 0).map((c) => [c, amounts[c] ?? 0] as const)
  if (entries.length === 0) return <span className={cn('text-muted', className)}>{empty}</span>
  return (
    <span className={cn('tabular', inline ? 'inline' : 'flex flex-col', className)}>
      {entries.map(([c, v], i) => (
        <span key={c}>
          {inline && i > 0 && ' · '}
          {formatCurrency(v, c)}
        </span>
      ))}
    </span>
  )
}
