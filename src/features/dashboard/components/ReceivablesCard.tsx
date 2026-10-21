import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { CurrencyFlag } from '@/components/ui/Flag'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { DEMO_TODAY } from '@/config/brand'
import { receivableRows, receivablesSummary } from '@/domain/finance/receivables'
import { receivableColumns } from '@/features/finance/components/receivableColumns'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { currencyEntries } from '@/lib/money'

/** Accounts receivable at a glance, derived from issued invoices, collections and withholdings. */
export function ReceivablesCard({ workspace: ws }: { workspace: Workspace }) {
  const s = receivablesSummary(ws.dataset, DEMO_TODAY)
  const rows = receivableRows(ws.dataset, DEMO_TODAY)
    .filter((r) => r.status !== 'cancelled' && r.status !== 'reconciled')
    .slice(0, 7)
  return (
    <Card aria-labelledby="ar-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="ar-title"
        title="Cuentas por cobrar"
        description="Facturas emitidas: facturado − cobros − retenciones documentadas, por moneda. Incluye datos de demostración."
        action={
          <Link to="/finanzas?vista=cobranzas" className="flex items-center gap-[4px] text-[13.5px] font-medium text-ink-secondary underline-offset-4 hover:underline">
            Ver cobranzas
            <ArrowUpRight aria-hidden className="size-[15px]" strokeWidth={2} />
          </Link>
        }
      />
      <div className="mt-[16px] grid grid-cols-1 gap-[16px] xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-[12px]">
          <div className="rounded-tile bg-surface-muted p-[14px]">
            <p className="text-[13px] text-ink-secondary">Pendiente de cobro</p>
            <ul className="mt-[8px] flex flex-col gap-[4px]">
              {currencyEntries(s.pendingByCurrency).length === 0 && <li className="text-[14px] text-muted">Sin saldos pendientes.</li>}
              {currencyEntries(s.pendingByCurrency).map(([c, v]) => (
                <li key={c} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-[6px] text-[13.5px] font-medium">
                    <CurrencyFlag currency={c} className="size-[16px]" />
                    {c}
                  </span>
                  <span className="tabular text-[16px] font-semibold tracking-[-0.01em]">{formatMoney(v, c)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-[8px] text-[12.5px]">
              <span className={s.overdueCount ? 'font-medium text-danger' : 'text-muted'}>
                {s.overdueCount} vencidas{currencyEntries(s.overdueByCurrency).length > 0 && ` · ${currencyEntries(s.overdueByCurrency).map(([c, v]) => formatMoney(v, c)).join(' · ')}`}
              </span>
              <span className="text-muted"> · {s.upcoming.length} vencen en 30 días</span>
            </p>
          </div>
          <div className="rounded-tile bg-surface-muted p-[14px]">
            <p className="text-[13px] text-ink-secondary">Cobros esperados por fecha</p>
            <ul className="mt-[6px] flex flex-col gap-[3px] text-[13px]">
              {s.expectedByDate.length === 0 && <li className="text-muted">Sin vencimientos en los próximos 30 días.</li>}
              {s.expectedByDate.slice(0, 5).map((e) => (
                <li key={`${e.date}-${e.currency}`} className="flex justify-between gap-2">
                  <span className="tabular">{formatDate(e.date)}</span>
                  <span className="tabular font-medium">{formatMoney(e.amount, e.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-tile bg-surface-muted p-[14px]">
            <p className="text-[13px] text-ink-secondary">Últimas cobranzas</p>
            <ul className="mt-[6px] flex flex-col gap-[3px] text-[13px]">
              {s.recentReceipts.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="tabular">{formatDate(r.date)}</span> <span className="text-muted">· {ws.clientById.get(r.clientId)?.name}</span>
                  </span>
                  <span className="tabular shrink-0 font-medium">{formatMoney(r.amount, r.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="min-w-0 xl:col-span-2">
          <DataTable
            caption="Cuentas por cobrar por vencimiento"
            rows={rows}
            getRowId={(r) => r.invoice.id}
            minWidth={760}
            dense
            columns={receivableColumns(ws, { compact: true })}
            empty={<EmptyState title="Sin cuentas por cobrar" />}
          />
        </div>
      </div>
    </Card>
  )
}
