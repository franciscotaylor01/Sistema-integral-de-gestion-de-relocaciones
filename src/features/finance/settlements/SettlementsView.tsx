import { HandCoins, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { CurrencyFlag } from '@/components/ui/Flag'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { settlementSignalMeta } from '@/config/finance'
import { clientPath, settlementPath } from '@/config/navigation'
import { addMoney } from '@/domain/finance/money'
import { settlementFinancials, type SettlementFinancials } from '@/domain/finance/settlements'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { matches } from '@/lib/search'
import type { CurrencyCode, ProjectSettlement } from '@/types/domain'
import { NewSettlementModal } from './SettlementModals'

export interface SettlementRow {
  s: ProjectSettlement
  f: SettlementFinancials
}

const settlementRows = (ws: Workspace): SettlementRow[] => ws.settlements.map((s) => ({ s, f: settlementFinancials(ws.dataset, s, DEMO_TODAY) }))

const PENDING = 'Pendiente de configurar'

export function SettlementsView({ workspace: ws, currency, client, status, q = '' }: { workspace: Workspace; currency: CurrencyCode | ''; client: string; status: string; q?: string }) {
  const [creating, setCreating] = useState(false)
  const all = useMemo(() => settlementRows(ws), [ws])
  const rows = all.filter(({ s, f }) => {
    const p = ws.projectById.get(s.projectId)
    return (!currency || s.currency === currency) && (!client || p?.clientId === client) && (!status || f.signal === status) && matches(q, p?.code, ws.clientById.get(p?.clientId ?? '')?.name, ws.personById.get(p?.beneficiaryId ?? '')?.name)
  })
  const totals = summarize(rows)
  const m = (r: SettlementRow, v: number | undefined) => (v === undefined ? <span className="text-[13px] text-muted">—</span> : formatMoney(v, r.s.currency))

  return (
    <>
      <Card aria-labelledby="set-summary" className="px-[18px] pb-[18px] pt-[19px]">
        <SectionTitle
          id="set-summary"
          title="Resumen Eugenia – Florencia"
          description="Resultado operativo antes de impuestos, por moneda y sin conversión. Solo incluye liquidaciones con distribución configurada."
          className="px-[2px]"
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Nueva liquidación
            </Button>
          }
        />
        {totals.length === 0 ? (
          <p className="mt-[14px] px-[2px] text-[14px] text-muted">Sin liquidaciones configuradas para los filtros elegidos.</p>
        ) : (
          <div className="mt-[18px] grid gap-[14px] md:grid-cols-2 xl:grid-cols-3">
            {totals.map((t) => (
              <article key={t.currency} aria-label={`Resumen en ${t.currency}`} className="rounded-tile bg-surface-muted p-[16px]">
                <header className="flex items-center gap-[8px] text-[15px] font-semibold">
                  <CurrencyFlag currency={t.currency} className="size-[20px]" />
                  {t.currency}
                </header>
                <dl className="mt-[12px] flex flex-col rounded-[14px] bg-surface px-[12px] text-[13.5px]">
                  {(
                    [
                      ['Participación Eugenia', t.owner],
                      ['Participación Florencia', t.partner],
                      ['Liquidable según cobros', t.releasable],
                      ['Facturado por Florencia', t.invoiced],
                      ['Pagado a Florencia', t.paid],
                      ['Pendiente de pago (liquidable)', t.pending],
                    ] as [string, number][]
                  ).map(([label, v], i) => (
                    <div key={label} className={cn('flex justify-between gap-3 py-[9px]', i < 5 && 'border-b border-line', i === 5 && v > 0 && 'text-danger')}>
                      <dt className={i === 5 && v > 0 ? undefined : 'text-ink-secondary'}>{label}</dt>
                      <dd className="tabular font-semibold">{formatMoney(v, t.currency)}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        )}
      </Card>
      <Card aria-labelledby="set-table" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle id="set-table" title="Liquidaciones por proyecto" description="Estado derivado de cobros, facturas y pagos registrados. Abrí una liquidación para ver el cálculo y configurarla." />
        <DataTable<SettlementRow>
          className="mt-[18px]"
          caption="Liquidaciones"
          rows={rows}
          getRowId={(r) => r.s.id}
          rowHref={(r) => settlementPath(r.s.id)}
          minWidth={1360}
          dense
          columns={[
            {
              id: 'project',
              header: 'Proyecto',
              width: '150px',
              cell: (r) => {
                const p = ws.projectById.get(r.s.projectId)
                return (
                  <span className="block min-w-0">
                    <span className="tabular block font-medium">{p?.code}</span>
                    <Link to={clientPath(p?.clientId ?? '')} className="block truncate text-[12px] text-muted hover:underline">
                      {ws.clientById.get(p?.clientId ?? '')?.name}
                    </Link>
                  </span>
                )
              },
            },
            { id: 'cur', header: 'Moneda', width: '76px', cell: (r) => r.s.currency },
            { id: 'base', header: 'Resultado base', className: 'tabular', cell: (r) => m(r, r.f.base) },
            { id: 'owner', header: 'Eugenia', className: 'tabular', cell: (r) => (r.f.configured ? m(r, r.f.ownerShare) : <span className="block whitespace-normal text-[12.5px] leading-[1.3] text-muted">{PENDING}</span>) },
            { id: 'partner', header: 'Florencia', className: 'tabular font-medium', cell: (r) => m(r, r.f.partnerShare) },
            { id: 'rel', header: 'Liquidable', className: 'tabular', cell: (r) => m(r, r.f.releasable) },
            { id: 'inv', header: 'Facturado F.', className: 'tabular text-ink-secondary', cell: (r) => m(r, r.f.partnerInvoiced) },
            { id: 'paid', header: 'Pagado F.', className: 'tabular text-success', cell: (r) => m(r, r.f.partnerPaid) },
            { id: 'pending', header: 'Saldo', className: 'tabular font-semibold', cell: (r) => (r.f.configured ? m(r, r.f.shareOutstanding) : '—') },
            {
              id: 'status',
              header: 'Estado',
              width: '200px',
              cell: (r) => (
                <span className="block whitespace-normal">
                  <StatusBadge meta={settlementSignalMeta[r.f.signal]} />
                  <span className="mt-[2px] block text-[12px] leading-[1.35] text-muted">{r.f.signalNote}</span>
                </span>
              ),
            },
          ]}
          empty={<EmptyState icon={HandCoins} title="No hay liquidaciones que coincidan" description="Creá una o ajustá los filtros." />}
        />
      </Card>
      <NewSettlementModal open={creating} onClose={() => setCreating(false)} workspace={ws} />
    </>
  )
}

interface Totals {
  currency: CurrencyCode
  owner: number
  partner: number
  releasable: number
  invoiced: number
  paid: number
  pending: number
}

function summarize(rows: SettlementRow[]): Totals[] {
  const map = new Map<CurrencyCode, Totals>()
  for (const { s, f } of rows) {
    if (!f.configured) continue
    const t = map.get(s.currency) ?? { currency: s.currency, owner: 0, partner: 0, releasable: 0, invoiced: 0, paid: 0, pending: 0 }
    t.owner = addMoney(t.owner, f.ownerShare!)
    t.partner = addMoney(t.partner, f.partnerShare!)
    t.releasable = addMoney(t.releasable, f.releasable!)
    t.invoiced = addMoney(t.invoiced, f.partnerInvoiced)
    t.paid = addMoney(t.paid, f.partnerPaid)
    t.pending = addMoney(t.pending, f.pendingPayment)
    map.set(s.currency, t)
  }
  return [...map.values()]
}
