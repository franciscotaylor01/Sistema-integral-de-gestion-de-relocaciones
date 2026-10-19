import { CircleDollarSign, HandCoins, ReceiptText, Truck } from 'lucide-react'
import { useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { MetaBadge } from '@/components/ui/MetaBadge'
import { StatTile } from '@/components/ui/StatTile'
import { brand } from '@/config/brand'
import type { LedgerSummary } from '@/features/finance/selectors'
import { formatCompactCurrency, formatPercent } from '@/lib/format'
import { currencyEntries, type MoneyByCurrency } from '@/lib/money'

/** Amounts in currencies other than the reporting one, never converted. */
function OtherCurrencies({ money }: { money: MoneyByCurrency }) {
  const others = currencyEntries(money).filter(([c, v]) => c !== brand.reportingCurrency && v > 0)
  if (others.length === 0) return <span>Sin otras monedas</span>
  return (
    <span className="tabular min-w-0 truncate" title={others.map(([c, v]) => formatCompactCurrency(v, c)).join(' · ')}>
      + {others.map(([c, v]) => formatCompactCurrency(v, c)).join(' · ')}
    </span>
  )
}

export function KpiGrid({ ledger }: { ledger: LedgerSummary }) {
  const cur = brand.reportingCurrency
  const format = useCallback((v: number) => formatCompactCurrency(Math.round(v), cur), [cur])
  const invoiced = ledger.invoiced[cur] ?? 0
  const collected = ledger.collected[cur] ?? 0
  const collectedPct = invoiced > 0 ? (collected / invoiced) * 100 : 0

  return (
    <Card aria-label="Indicadores principales" className="grid grid-cols-1 gap-[14px] p-[18px] min-[420px]:grid-cols-2">
      <StatTile
        tone="accent"
        label="Total facturado"
        icon={ReceiptText}
        value={invoiced}
        format={format}
        to="/finanzas?vista=facturas"
        footer={
          <>
            <MetaBadge onAccent>{cur}</MetaBadge>
            <OtherCurrencies money={ledger.invoiced} />
          </>
        }
      />
      <StatTile
        label="Total cobrado"
        icon={HandCoins}
        value={collected}
        format={format}
        to="/finanzas?vista=pagos&direccion=incoming"
        footer={
          <>
            <MetaBadge className="bg-success-soft text-success">{formatPercent(collectedPct)}</MetaBadge>
            <span>de lo facturado</span>
          </>
        }
      />
      <StatTile
        label="Por cobrar"
        icon={CircleDollarSign}
        value={ledger.receivable[cur] ?? 0}
        format={format}
        to="/finanzas?vista=cobranzas"
        footer={
          <>
            <MetaBadge className={ledger.overdueInvoices ? 'bg-danger-soft text-danger' : undefined}>
              {ledger.overdueInvoices} vencidas
            </MetaBadge>
            <span>{ledger.openInvoices} facturas abiertas</span>
          </>
        }
      />
      <StatTile
        label="Costos proveedores"
        icon={Truck}
        value={ledger.supplierCosts[cur] ?? 0}
        format={format}
        to="/finanzas?vista=proveedores"
        footer={
          <>
            <MetaBadge>{formatCompactCurrency(ledger.payable[cur] ?? 0, cur)}</MetaBadge>
            <span>pendiente</span>
          </>
        }
      />
    </Card>
  )
}
