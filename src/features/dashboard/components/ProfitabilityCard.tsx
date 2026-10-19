import { ArrowUpRight, Plus } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { Link } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CurrencyFlag } from '@/components/ui/Flag'
import { MetaBadge } from '@/components/ui/MetaBadge'
import { brand } from '@/config/brand'
import { ROUTES } from '@/config/navigation'
import { isActiveProject, projectBudget, projectEstimatedCost } from '@/features/projects/selectors'
import { cn } from '@/lib/cn'
import { formatCompactCurrency, formatCompactNumber, formatCurrency, formatPercent } from '@/lib/format'
import { currencyEntries, sumByCurrency } from '@/lib/money'
import type { CurrencyCode, Project } from '@/types/domain'

interface MarginRow {
  currency: CurrencyCode
  budget: number
  margin: number
  pct: number
}

/**
 * Vertix "Total Balance" card, repurposed for the estimated margin of the
 * active portfolio (agreed prices minus expected supplier costs).
 */
export function ProfitabilityCard({ projects }: { projects: Project[] }) {
  const { notify } = useToast()
  const { active, rows } = useMemo(() => {
    const active = projects.filter(isActiveProject)
    const budget = sumByCurrency(active, (p) => p.currency, projectBudget)
    const cost = sumByCurrency(active, (p) => p.currency, projectEstimatedCost)
    const rows: MarginRow[] = currencyEntries(budget).map(([currency, b]) => {
      const margin = b - (cost[currency] ?? 0)
      return { currency, budget: b, margin, pct: b > 0 ? (margin / b) * 100 : 0 }
    })
    return { active, rows }
  }, [projects])
  const main = rows.find((r) => r.currency === brand.reportingCurrency) ?? rows[0]
  const mainCurrency = main?.currency ?? brand.reportingCurrency
  const formatMain = useCallback((v: number) => formatCurrency(Math.round(v), mainCurrency), [mainCurrency])

  return (
    <Card aria-labelledby="profit-title" className="flex flex-col px-[17px] pb-[15px] pt-[15px]">
      <div className="flex h-[34px] items-center justify-between gap-3">
        <h2 id="profit-title" className="text-[15px] text-ink-secondary">
          Rentabilidad estimada
        </h2>
        <span className="flex h-[34px] items-center gap-[7px] rounded-full border border-line bg-surface pl-[10px] pr-[12px] text-[14px] font-medium shadow-pill">
          {main && <CurrencyFlag currency={main.currency} className="size-[18px]" />}
          {main?.currency}
        </span>
      </div>

      <p className="tabular mt-[12px] text-[31px] font-semibold leading-[1.2] tracking-[-0.02em]">
        {main ? <AnimatedNumber value={main.margin} format={formatMain} /> : '—'}
      </p>

      <div className="mt-[8px] flex flex-wrap items-center gap-[10px]">
        {main && <MetaBadge className="bg-success-soft text-success">Margen {formatPercent(main.pct)}</MetaBadge>}
        <span className="text-[13.5px] text-subtle">
          cartera activa · {active.length} proyectos
        </span>
      </div>

      <div className="mt-[20px] grid grid-cols-2 gap-[14px]">
        <Button
          variant="primary"
          className="px-3"
          onClick={() =>
            notify({ title: 'Alta de proyectos en preparación', description: 'El formulario de nuevo proyecto llegará con la integración de datos.' })
          }
        >
          <Plus aria-hidden className="size-[17px]" strokeWidth={2} />
          Nuevo proyecto
        </Button>
        <ButtonLink to={ROUTES.projects} variant="secondary" className="px-3">
          <ArrowUpRight aria-hidden className="size-[17px]" strokeWidth={2} />
          Proyectos
        </ButtonLink>
      </div>

      <div className="mt-[21px] flex flex-1 flex-col rounded-panel bg-surface-muted px-[12px] pb-[12px] pt-[11px]">
        <p className="flex items-center gap-[8px] px-[2px] text-[14px]">
          <span className="font-semibold">Margen por moneda</span>
          <span aria-hidden className="h-[13px] w-px bg-line-strong" />
          <span className="text-muted">Sin conversión</span>
        </p>
        <div className={cn('mt-[11px] grid flex-1 gap-[12px]', rows.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {rows.slice(0, 3).map((r) => (
            <Link
              key={r.currency}
              to={`/finanzas?vista=costos&moneda=${r.currency}`}
              aria-label={`Margen estimado en ${r.currency}: ${formatCurrency(r.margin, r.currency)}`}
              className="relative min-w-0 rounded-[14px] bg-surface px-[10px] pb-[11px] pt-[13px] transition-[box-shadow,transform] duration-300 ease-soft hover:-translate-y-0.5 hover:shadow-pill active:translate-y-0 active:scale-[0.985] active:duration-100"
            >
              <span className="flex items-center gap-[8px]">
                <CurrencyFlag currency={r.currency} className="size-[18px]" />
                <span className="text-[14px] font-semibold">{r.currency}</span>
              </span>
              <span className="tabular mt-[15px] block truncate text-[14.5px] font-semibold leading-[1.2] tracking-[-0.01em]">
                {formatCompactNumber(r.margin)}
              </span>
              <span className="mt-[3px] block truncate text-[10px] leading-[1.3] text-subtle">
                de {formatCompactCurrency(r.budget, r.currency)}
              </span>
              <span className="mt-[9px] block text-[12px] font-medium leading-[1.3] text-success">{formatPercent(r.pct)} margen</span>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  )
}
