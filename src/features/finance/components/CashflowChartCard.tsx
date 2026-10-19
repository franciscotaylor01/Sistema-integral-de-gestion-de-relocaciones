import { useReducedMotion } from 'motion/react'
import { useId, useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { monthlyCashflow, recentMonths, type CashflowPoint } from '../selectors'
import { niceTicks } from '@/lib/chart'
import { formatCompactNumber, formatCurrency } from '@/lib/format'
import type { Workspace } from '@/hooks/useWorkspace'
import type { CurrencyCode } from '@/types/domain'

const RADIUS = 7
const MONTHS = 7
const CURRENCIES: CurrencyCode[] = ['USD', 'EUR', 'ARS']

interface SegmentProps {
  x?: number
  y?: number
  width?: number
  height?: number
}

/** Rounded bar segment — the Vertix profit/loss bar shape. */
function segment(fill: string) {
  return function Segment({ x = 0, y = 0, width = 0, height = 0 }: SegmentProps) {
    if (height <= 0 || width <= 0) return <g />
    return <rect x={x} y={y} width={width} height={height} rx={Math.min(RADIUS, width / 2)} ry={RADIUS} fill={fill} />
  }
}

function YTick({ y, payload }: { y?: number | string; payload?: { value: number } }) {
  return (
    <text x={0} y={Number(y)} dy={4} fill="var(--sg-subtle)" fontSize={13}>
      {formatCompactNumber(payload?.value ?? 0)}
    </text>
  )
}

function ChartTooltip({ active, payload, currency }: { active?: boolean; payload?: { payload: CashflowPoint }[]; currency: CurrencyCode }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="rounded-[14px] border border-line bg-surface px-[12px] py-[10px] shadow-card-hover">
      <p className="text-[12.5px] font-medium capitalize text-muted">{point.month}</p>
      <p className="mt-[6px] flex items-center gap-[8px] text-[13.5px]">
        <span aria-hidden className="size-[9px] rounded-[3px] bg-contrast" />
        Facturado <span className="tabular ml-auto pl-3 font-semibold">{formatCurrency(point.invoiced, currency)}</span>
      </p>
      <p className="mt-[4px] flex items-center gap-[8px] text-[13.5px]">
        <span aria-hidden className="size-[9px] rounded-[3px] bg-accent" />
        Cobrado <span className="tabular ml-auto pl-3 font-semibold">{formatCurrency(point.collected, currency)}</span>
      </p>
    </div>
  )
}

export function CashflowChartCard({ workspace }: { workspace: Workspace }) {
  const hatchId = `hatch-${useId().replace(/:/g, '')}`
  const animateBars = !useReducedMotion()
  const [currency, setCurrency] = useState<CurrencyCode>('USD')

  const data = useMemo(() => monthlyCashflow(workspace, currency, recentMonths(MONTHS)), [workspace, currency])
  const ticks = useMemo(() => niceTicks(Math.max(...data.flatMap((d) => [d.invoiced, d.collected])), 4), [data])
  const totals = data.reduce((acc, d) => ({ invoiced: acc.invoiced + d.invoiced, collected: acc.collected + d.collected }), { invoiced: 0, collected: 0 })

  const InvoicedShape = segment('var(--sg-contrast)')
  const CollectedShape = segment(`url(#${hatchId})`)

  return (
    <Card aria-labelledby="cashflow-title" className="flex flex-col px-[17px] pb-[15px] pt-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="cashflow-title" className="text-[19px] font-semibold leading-[1.3] tracking-[-0.01em]">
            Facturación y cobranzas
          </h2>
          <p className="mt-[6px] text-[14.5px] leading-[1.4] text-muted">Evolución mensual por moneda de origen</p>
        </div>
        <SegmentedControl
          label="Moneda del gráfico"
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={currency}
          onChange={setCurrency}
        />
      </div>

      <div className="mt-[17px] flex min-h-[290px] flex-1 flex-col rounded-panel bg-surface-muted px-[16px] pb-[8px] pt-[14px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold">Últimos {MONTHS} meses</h3>
          <ul className="flex items-center gap-[16px] text-[14px] text-ink-secondary" aria-label="Leyenda">
            <li className="flex items-center gap-[6px]">
              <span aria-hidden className="size-[10px] rounded-[3px] bg-contrast" />
              Facturado
            </li>
            <li className="flex items-center gap-[6px]">
              <span aria-hidden className="size-[10px] rounded-[3px] bg-accent" />
              Cobrado
            </li>
          </ul>
        </div>

        <div
          className="relative mt-[10px] min-h-[230px] flex-1"
          role="img"
          aria-label={`Facturado ${formatCurrency(totals.invoiced, currency)} y cobrado ${formatCurrency(totals.collected, currency)} en los últimos ${MONTHS} meses`}
        >
          {/* Absolute fill gives Recharts a definite size inside the flex panel. */}
          <div className="absolute inset-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart key={currency} data={data} margin={{ top: 14, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%" barGap={4}>
                <defs>
                  <pattern id={hatchId} patternUnits="userSpaceOnUse" width="4.5" height="4.5" patternTransform="rotate(45)">
                    <rect width="4.5" height="4.5" fill="var(--sg-accent)" />
                    <line x1="1" y1="0" x2="1" y2="4.5" stroke="var(--sg-accent-stripe)" strokeWidth="1.6" />
                  </pattern>
                </defs>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--sg-subtle)', fontSize: 13 }}
                  tickMargin={8}
                />
                <YAxis domain={[0, ticks[ticks.length - 1]]} ticks={ticks} axisLine={false} tickLine={false} tick={YTick} width={46} />
                <Tooltip
                  cursor={{ fill: 'var(--sg-surface-sunken)', fillOpacity: 0.7 }}
                  content={<ChartTooltip currency={currency} />}
                />
                <Bar
                  dataKey="invoiced"
                  name="Facturado"
                  shape={InvoicedShape}
                  isAnimationActive={animateBars}
                  animationBegin={150}
                  animationDuration={750}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="collected"
                  name="Cobrado"
                  shape={CollectedShape}
                  isAnimationActive={animateBars}
                  animationBegin={350}
                  animationDuration={750}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Card>
  )
}
