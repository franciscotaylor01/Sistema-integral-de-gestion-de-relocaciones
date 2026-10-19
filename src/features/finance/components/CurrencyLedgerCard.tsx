import { CurrencyFlag } from '@/components/ui/Flag'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/lib/cn'
import { formatCurrency, formatPercent } from '@/lib/format'
import type { CurrencyCode } from '@/types/domain'
import type { LedgerSummary } from '../selectors'

/** One currency's position: receivables side and supplier side, never converted. */
export function CurrencyLedgerCard({ currency, ledger }: { currency: CurrencyCode; ledger: LedgerSummary }) {
  const v = (m: Partial<Record<CurrencyCode, number>>) => m[currency] ?? 0
  const invoiced = v(ledger.invoiced)
  const collected = v(ledger.collected)
  const costs = v(ledger.supplierCosts)
  const paid = v(ledger.supplierPaid)
  const overdue = v(ledger.overdueReceivable)

  const rows: { label: string; value: number; tone?: string }[] = [
    { label: 'Facturado', value: invoiced },
    { label: 'Cobrado', value: collected, tone: 'text-success' },
    { label: 'Por cobrar', value: v(ledger.receivable) },
    { label: 'Costos de proveedores', value: costs },
    { label: 'Pagado a proveedores', value: paid },
    { label: 'Por pagar', value: v(ledger.payable) },
  ]

  return (
    <article aria-label={`Posición en ${currency}`} className="flex flex-col rounded-tile bg-surface-muted p-[16px] transition-shadow duration-300 ease-soft hover:shadow-pill">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-[8px] text-[15px] font-semibold">
          <CurrencyFlag currency={currency} className="size-[20px]" />
          {currency}
        </span>
        {overdue > 0 && (
          <span className="rounded-full bg-danger-soft px-[9px] py-[2px] text-[12px] font-medium text-danger">
            {formatCurrency(overdue, currency)} vencido
          </span>
        )}
      </header>
      <dl className="mt-[12px] flex flex-col rounded-[14px] bg-surface px-[12px]">
        {rows.map((r, i) => (
          <div key={r.label} className={cn('flex items-center justify-between py-[9px] text-[13.5px]', i < rows.length - 1 && 'border-b border-line', i === 3 && 'border-t border-line-strong')}>
            <dt className="text-ink-secondary">{r.label}</dt>
            <dd className={cn('tabular font-semibold', r.tone)}>{formatCurrency(r.value, currency)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-[14px] flex flex-col gap-[10px] text-[12px] text-muted">
        <div>
          <p className="mb-[6px] flex justify-between">
            Cobrado / facturado <span className="tabular font-medium text-ink">{formatPercent(invoiced ? (collected / invoiced) * 100 : 0)}</span>
          </p>
          <ProgressBar size="sm" value={collected} max={invoiced || 1} label={`Cobranza en ${currency}`} tone="success" />
        </div>
        <div>
          <p className="mb-[6px] flex justify-between">
            Pagado / costos <span className="tabular font-medium text-ink">{formatPercent(costs ? (paid / costs) * 100 : 0)}</span>
          </p>
          <ProgressBar size="sm" value={paid} max={costs || 1} label={`Pagos a proveedores en ${currency}`} tone="contrast" />
        </div>
      </div>
    </article>
  )
}
