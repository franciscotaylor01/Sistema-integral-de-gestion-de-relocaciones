import { CurrencyFlag } from '@/components/ui/Flag'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { formatNumber } from '@/lib/format'
import type { CurrencyIndicator } from '@/types/domain'

/** Reference quotes strip. Display only — never used to convert amounts. */
export function CurrencyIndicators({ items }: { items: CurrencyIndicator[] }) {
  return (
    <div aria-label="Cotizaciones referenciales" role="region">
      <ul className="scrollbar-none relative flex gap-[10px] overflow-x-auto pb-[2px]">
        {items.map((c) => (
          <li key={c.pair} className="flex h-[46px] shrink-0 items-center gap-[10px] rounded-full bg-surface pl-[8px] pr-[12px] shadow-pill">
            <span className="flex -space-x-[6px]">
              <CurrencyFlag currency={c.base} className="size-[22px] ring-2 ring-surface" />
              <CurrencyFlag currency={c.quote} className="size-[22px] ring-2 ring-surface" />
            </span>
            <span className="text-[13.5px] font-medium">{c.pair}</span>
            <span className="tabular text-[14px] font-semibold">{formatNumber(c.rate, c.rate < 10 ? 3 : 2)}</span>
            <TrendBadge value={c.changePct} />
          </li>
        ))}
      </ul>
      <p className="mt-[8px] px-[4px] text-[12px] text-subtle">Cotizaciones referenciales y ficticias. No se aplican conversiones en esta fase.</p>
    </div>
  )
}
