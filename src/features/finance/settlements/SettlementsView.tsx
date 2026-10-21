import { HandCoins, Layers, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { CurrencyFlag } from '@/components/ui/Flag'
import { DateInput } from '@/components/ui/form'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { batchStatusMeta, settlementSignalMeta } from '@/config/finance'
import { batchPath, clientPath, settlementPath } from '@/config/navigation'
import { batchFinancials } from '@/domain/finance/batches'
import { isCostClosed } from '@/domain/finance/costControl'
import { addMoney } from '@/domain/finance/money'
import { settlementFinancials, type SettlementFinancials } from '@/domain/finance/settlements'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { matches } from '@/lib/search'
import type { CurrencyCode, ProjectSettlement, SettlementBatch } from '@/types/domain'
import { BatchModal } from './BatchModal'
import { NewSettlementModal } from './SettlementModals'

export interface SettlementRow {
  s: ProjectSettlement
  f: SettlementFinancials
}

const settlementRows = (ws: Workspace): SettlementRow[] => ws.settlements.map((s) => ({ s, f: settlementFinancials(ws.dataset, s, DEMO_TODAY) }))
const sumBy = (items: { currency: CurrencyCode; v: number }[]) => {
  const m = new Map<CurrencyCode, number>()
  for (const x of items) m.set(x.currency, addMoney(m.get(x.currency) ?? 0, x.v))
  return [...m.entries()]
}

/** "Resumen Flor": participations per project, multi-selection and grouped settlements. */
export function SettlementsView({ workspace: ws, currency, client, status, q = '' }: { workspace: Workspace; currency: CurrencyCode | ''; client: string; status: string; q?: string }) {
  const [creating, setCreating] = useState(false)
  const [batching, setBatching] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const all = useMemo(() => settlementRows(ws), [ws])
  const rows = all.filter(({ s, f }) => {
    const p = ws.projectById.get(s.projectId)
    if (from && (p?.startDate ?? '') < from) return false
    if (to && (p?.startDate ?? '') > to) return false
    return (!currency || s.currency === currency) && (!client || p?.clientId === client) && (!status || f.signal === status) && matches(q, p?.code, ws.clientById.get(p?.clientId ?? '')?.name, ws.personById.get(p?.beneficiaryId ?? '')?.name)
  })
  const sel = all.filter((r) => selected.includes(r.s.id))
  const selTotals = sumBy(sel.map((r) => ({ currency: r.s.currency, v: r.f.available })))
  const toggle = (id: string) => setSelected((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))
  const m = (r: SettlementRow, v: number | undefined) => (v === undefined ? <span className="text-[13px] text-muted">—</span> : formatMoney(v, r.s.currency))
  const totals = sumBy(rows.flatMap((r) => [{ currency: r.s.currency, v: r.f.partnerShare ?? 0 }]))
  const pending = sumBy(rows.map((r) => ({ currency: r.s.currency, v: r.f.shareOutstanding ?? 0 })))
  const batches = [...ws.settlementBatches].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <>
      <Card aria-labelledby="set-summary" className="px-[18px] pb-[18px] pt-[19px]">
        <SectionTitle
          id="set-summary"
          title="Resumen Flor"
          description="Participación de Florencia por proyecto: 35% de la base distribuible (regla preliminar) salvo reglas explícitas. Resultado operativo, por moneda y sin conversión."
          className="px-[2px]"
          action={
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Agregar proyecto
            </Button>
          }
        />
        <div className="mt-[16px] grid gap-[14px] md:grid-cols-2 xl:grid-cols-3">
          {totals.map(([c, v]) => (
            <article key={c} className="rounded-tile bg-surface-muted p-[16px] text-[13.5px]">
              <header className="flex items-center gap-[8px] text-[15px] font-semibold">
                <CurrencyFlag currency={c} className="size-[20px]" />
                {c}
              </header>
              <p className="mt-[8px] flex justify-between">
                <span className="text-ink-secondary">Participación acumulada</span>
                <span className="tabular font-semibold">{formatMoney(v, c)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-ink-secondary">Saldo pendiente</span>
                <span className="tabular font-semibold">{formatMoney(pending.find(([x]) => x === c)?.[1] ?? 0, c)}</span>
              </p>
            </article>
          ))}
        </div>
      </Card>

      <Card aria-labelledby="set-table" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle id="set-table" title="Participaciones por proyecto" description="Seleccioná saldos disponibles para liquidar en forma agrupada. Lo comprometido en liquidaciones confirmadas no se vuelve a ofrecer." />
        <div className="mt-[12px] flex flex-wrap items-center gap-[10px] text-[13px]">
          <span className="text-muted">Inicio del proyecto</span>
          <DateInput aria-label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} className="h-[38px] w-[160px]" />
          <DateInput aria-label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} className="h-[38px] w-[160px]" />
        </div>
        <DataTable<SettlementRow>
          className="mt-[14px]"
          caption="Participaciones de Florencia"
          rows={rows}
          getRowId={(r) => r.s.id}
          minWidth={1480}
          dense
          columns={[
            {
              id: 'sel',
              header: '',
              width: '44px',
              cell: (r) => (
                <input
                  type="checkbox"
                  aria-label={`Seleccionar ${ws.projectById.get(r.s.projectId)?.code}`}
                  className="size-[16px] accent-[var(--color-ink)]"
                  disabled={r.f.available <= 0}
                  checked={selected.includes(r.s.id)}
                  onChange={() => toggle(r.s.id)}
                />
              ),
            },
            {
              id: 'project',
              header: 'Proyecto',
              width: '150px',
              cell: (r) => {
                const p = ws.projectById.get(r.s.projectId)
                return (
                  <span className="block min-w-0">
                    <Link to={settlementPath(r.s.id)} className="tabular block font-medium underline-offset-4 hover:underline">
                      {p?.code}
                    </Link>
                    <Link to={clientPath(p?.clientId ?? '')} className="block truncate text-[12px] text-muted hover:underline">
                      {ws.clientById.get(p?.clientId ?? '')?.name}
                    </Link>
                  </span>
                )
              },
            },
            { id: 'cur', header: 'Moneda', width: '70px', cell: (r) => r.s.currency },
            { id: 'base', header: 'Base distribuible', className: 'tabular', cell: (r) => m(r, r.f.base) },
            {
              id: 'share',
              header: 'Participación',
              className: 'tabular font-medium',
              cell: (r) => (
                <span className="block">
                  {m(r, r.f.partnerShare)}
                  <span className="block text-[11.5px] font-normal text-muted">{r.f.pctLabel}</span>
                </span>
              ),
            },
            { id: 'paid', header: 'Liquidado / pagado', className: 'tabular text-success', cell: (r) => m(r, r.f.partnerPaid) },
            { id: 'committed', header: 'Comprometido', className: 'tabular', cell: (r) => m(r, r.f.committed) },
            { id: 'pending', header: 'Saldo pendiente', className: 'tabular font-semibold', cell: (r) => m(r, r.f.shareOutstanding) },
            { id: 'avail', header: 'Disponible', className: 'tabular', cell: (r) => m(r, r.f.available) },
            {
              id: 'costs',
              header: 'Costos',
              width: '120px',
              cell: (r) => (isCostClosed(ws.projectById.get(r.s.projectId)) ? <StatusBadge meta={{ label: 'Cerrados', tone: 'success' }} /> : <StatusBadge meta={{ label: 'Abiertos', tone: 'warning' }} />),
            },
            {
              id: 'status',
              header: 'Estado',
              width: '170px',
              cell: (r) => (
                <span className="block whitespace-normal">
                  <StatusBadge meta={settlementSignalMeta[r.f.signal]} />
                  <span className="mt-[2px] block text-[12px] leading-[1.35] text-muted">{r.f.signalNote}</span>
                </span>
              ),
            },
          ]}
          empty={<EmptyState icon={HandCoins} title="No hay participaciones que coincidan" />}
        />
        <div className="mt-[12px] flex flex-wrap items-center justify-between gap-[10px] rounded-panel bg-surface-muted px-[14px] py-[10px] text-[13.5px]">
          <span>
            <span className="font-medium">{sel.length} seleccionados</span>
            {selTotals.length > 0 && <span className="tabular text-ink-secondary"> · disponible {selTotals.map(([c, v]) => formatMoney(v, c)).join(' · ')}</span>}
          </span>
          <Button size="sm" disabled={!sel.length} onClick={() => setBatching(true)}>
            <Layers aria-hidden className="size-[15px]" strokeWidth={1.9} />
            Nueva liquidación agrupada
          </Button>
        </div>
      </Card>

      <Card aria-labelledby="batch-table" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle id="batch-table" title="Liquidaciones agrupadas" description="Confirmar una liquidación compromete los saldos; los pagos se registran aparte, imputados a sus proyectos." />
        <DataTable<SettlementBatch>
          className="mt-[14px]"
          caption="Liquidaciones agrupadas"
          rows={batches}
          getRowId={(b) => b.id}
          rowHref={(b) => batchPath(b.id)}
          minWidth={900}
          dense
          columns={[
            { id: 'num', header: 'Liquidación', width: '140px', className: 'tabular font-medium', cell: (b) => b.number },
            { id: 'date', header: 'Fecha', width: '110px', className: 'tabular', cell: (b) => formatDate(b.date) },
            { id: 'proj', header: 'Proyectos', width: '22%', cell: (b) => <span className="block truncate text-ink-secondary">{b.lines.map((l) => ws.projectById.get(l.projectId)?.code).join(', ')}</span> },
            { id: 'net', header: 'Neto', className: 'tabular font-medium', cell: (b) => formatMoney(batchFinancials(ws.dataset, b).net, b.currency) },
            { id: 'paid', header: 'Pagado', className: 'tabular text-success', cell: (b) => formatMoney(batchFinancials(ws.dataset, b).paid, b.currency) },
            { id: 'out', header: 'Saldo', className: cn('tabular'), cell: (b) => formatMoney(batchFinancials(ws.dataset, b).outstanding, b.currency) },
            { id: 'st', header: 'Estado', width: '160px', cell: (b) => <StatusBadge meta={batchStatusMeta[batchFinancials(ws.dataset, b).status]} /> },
          ]}
          empty={<EmptyState title="Sin liquidaciones agrupadas" description="Seleccioná proyectos arriba para preparar la primera." />}
        />
      </Card>
      <NewSettlementModal open={creating} onClose={() => setCreating(false)} workspace={ws} />
      <BatchModal open={batching} onClose={() => setBatching(false)} ws={ws} settlementIds={selected} />
    </>
  )
}
