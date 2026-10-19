import { CurrencyFlag } from '@/components/ui/Flag'
import type { CurrencyResult, MarginResult } from '@/domain/finance/results'
import { cn } from '@/lib/cn'
import { formatMoney, formatPercent } from '@/lib/format'

export const INSUFFICIENT = 'Sin datos suficientes'

export function MarginValue({ margin, currency, className }: { margin: MarginResult; currency: CurrencyResult['currency']; className?: string }) {
  if (margin.amount === undefined) return <span className={cn('text-[13px] text-muted', className)}>{margin.note ?? INSUFFICIENT}</span>
  return (
    <span className={cn('tabular font-semibold', margin.amount < 0 ? 'text-danger' : 'text-success', className)}>
      {formatMoney(margin.amount, currency)}
      {margin.pct !== undefined && <span className="ml-[6px] text-[12px] font-medium">({formatPercent(margin.pct)})</span>}
    </span>
  )
}

/** One card per currency: commercial, receivables, costs and supplier side. Never converted. */
export function CurrencyResultCard({ result: r }: { result: CurrencyResult }) {
  const m = (v: number) => formatMoney(v, r.currency)
  const groups: { title: string; rows: [string, React.ReactNode, string?][] }[] = [
    {
      title: 'Ingresos',
      rows: [
        ['Acordado', m(r.agreed)],
        ['Facturado (neto)', m(r.invoicedNet)],
        ['Facturado (total)', m(r.invoicedGross)],
        ['Cobrado', m(r.collected), 'text-success'],
        ['Por cobrar', m(r.receivable)],
        ...(r.overdueReceivable > 0 ? ([['Vencido', m(r.overdueReceivable), 'text-danger']] as [string, string, string][]) : []),
      ],
    },
    {
      title: 'Costos',
      rows: [
        ['Costo estimado', m(r.estimatedCost)],
        ['Costo real', m(r.actualCost)],
        ['Obligaciones', m(r.obligations)],
        ['Pagado a proveedores', m(r.supplierPaid)],
        ['Saldo impago', m(r.supplierUnpaid)],
      ],
    },
  ]
  return (
    <article aria-label={`Resultado en ${r.currency}`} className="flex flex-col rounded-tile bg-surface-muted p-[16px]">
      <header className="flex items-center gap-[8px] text-[15px] font-semibold">
        <CurrencyFlag currency={r.currency} className="size-[20px]" />
        {r.currency}
      </header>
      {groups.map((g) => (
        <div key={g.title} className="mt-[12px]">
          <p className="px-[2px] text-[12px] font-medium uppercase tracking-[0.04em] text-muted">{g.title}</p>
          <dl className="mt-[6px] flex flex-col rounded-[14px] bg-surface px-[12px]">
            {g.rows.map(([label, value, tone], i) => (
              <div key={label} className={cn('flex items-center justify-between gap-3 py-[8px] text-[13.5px]', i < g.rows.length - 1 && 'border-b border-line')}>
                <dt className="text-ink-secondary">{label}</dt>
                <dd className={cn('tabular font-semibold', tone)}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <dl className="mt-[12px] flex flex-col gap-[8px] rounded-[14px] bg-surface px-[12px] py-[10px] text-[13.5px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-secondary">Margen estimado</dt>
          <dd>
            <MarginValue margin={r.estimatedMargin} currency={r.currency} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-secondary">Margen operativo</dt>
          <dd>
            <MarginValue margin={r.operationalMargin} currency={r.currency} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-[8px]">
          <dt className="text-ink-secondary">Caja (cobrado − pagado)</dt>
          <dd className={cn('tabular font-semibold', r.cashNet < 0 && 'text-danger')}>{m(r.cashNet)}</dd>
        </div>
      </dl>
      <p className="mt-[10px] px-[2px] text-[12px] leading-[1.45] text-muted">
        Margen operativo = facturado neto − costo real directo, antes de impuestos y gastos generales. La caja no es resultado contable.
      </p>
    </article>
  )
}
