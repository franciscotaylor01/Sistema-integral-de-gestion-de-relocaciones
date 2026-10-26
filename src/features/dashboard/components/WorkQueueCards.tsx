import { ArrowRight, BadgeCheck, FileClock, FileStack, Receipt, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AmountsText } from '@/components/ui/Amounts'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { StatTile } from '@/components/ui/StatTile'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { projectPath } from '@/config/navigation'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatCompactCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import type { Amounts } from '@/domain/commercial/money'
import { billingStateMeta, certificateKindMeta, poKindMeta, stateFromParam } from '../meta'
import { BILLING_ORDER, totalOf, type BillingRow, type BillingState, type CertificateRow, type PoRow, type WorkQueue } from '../selectors'

const VISIBLE = 8

function CompactAmounts({ amounts, onAccent }: { amounts: Amounts; onAccent?: boolean }) {
  const list = CURRENCY_ORDER.filter((c) => amounts[c])
  if (!list.length) return <span className={onAccent ? 'text-white/80' : 'text-muted'}>Sin importes</span>
  return <span className="tabular min-w-0 truncate">{list.map((c) => formatCompactCurrency(amounts[c]!, c)).join(' · ')}</span>
}

const ActionLink = ({ href, label }: { href: string; label: string }) => (
  <Link to={href} className="inline-flex items-center gap-[4px] whitespace-nowrap rounded-full bg-surface-muted px-[10px] py-[5px] text-[12.5px] font-medium text-ink hover:bg-surface-sunken">
    {label}
    <ArrowRight aria-hidden className="size-[13px]" strokeWidth={2} />
  </Link>
)

/* ───────────── KPIs ───────────── */

export function WorkKpis({ q }: { q: WorkQueue }) {
  const ready = q.billing.filter((r) => r.state === 'ready')
  const drafts = q.billing.filter((r) => r.state === 'draft')
  const certs = q.certificates.filter((r) => r.kind === 'to-generate' || r.kind === 'submitted' || r.kind === 'draft')
  const count = (v: number) => String(Math.round(v))
  return (
    <Card aria-label="Indicadores de trabajo" className="grid grid-cols-1 gap-[14px] p-[18px] min-[420px]:grid-cols-2 xl:grid-cols-4">
      <StatTile tone="accent" label="Listos para facturar" icon={Receipt} value={ready.length} format={count} to="/?bandeja=listos#facturacion" footer={<CompactAmounts amounts={totalOf(ready)} onAccent />} />
      <StatTile label="OC que requieren atención" icon={ShieldAlert} value={q.pos.length} format={count} to="/#ordenes" footer={<span className="text-muted">{q.pos.filter((r) => r.kind === 'po-review').length} con diferencias · {q.pos.filter((r) => r.kind === 'no-po').length} sin OC</span>} />
      <StatTile label="Certificados pendientes" icon={FileStack} value={certs.length} format={count} to="/#certificados" footer={<span className="text-muted">{q.certificates.filter((r) => r.kind === 'submitted').length} presentados · {q.certificates.filter((r) => r.kind === 'to-generate').length} por generar</span>} />
      <StatTile label="Facturas preparadas sin emitir" icon={FileClock} value={drafts.length} format={count} to="/?bandeja=borradores#facturacion" footer={<CompactAmounts amounts={totalOf(drafts)} />} />
    </Card>
  )
}

/* ───────────── 1. Billing ───────────── */

export function BillingQueueCard({ rows }: { rows: BillingRow[] }) {
  const [params, setParams] = useSearchParams()
  const filter = stateFromParam(params.get('bandeja'))
  const [expanded, setExpanded] = useState(false)
  const all = filter ? rows.filter((r) => r.state === filter) : rows
  const shown = expanded ? all : all.slice(0, VISIBLE)
  const setFilter = (s?: BillingState) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (s) next.set('bandeja', billingStateMeta[s].param)
        else next.delete('bandeja')
        return next
      },
      { replace: true, preventScrollReset: true },
    )
  const ready = rows.filter((r) => r.state === 'ready')
  return (
    <Card id="facturacion" aria-labelledby="billing-title" className="scroll-mt-[24px] px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="billing-title"
        title="Facturación pendiente"
        description="Qué falta facturar y qué lo impide. Calculado con las mismas reglas de facturabilidad de Finanzas (aprobación, OC, certificado, hito y comparación OC vs. cotización); los borradores ya reservan su importe."
      />
      <div className="mt-[14px] flex flex-wrap gap-[6px]" role="group" aria-label="Filtrar por estado">
        <button type="button" onClick={() => setFilter()} aria-pressed={!filter} className={cn('rounded-full px-[12px] py-[6px] text-[13px] font-medium', !filter ? 'bg-contrast text-on-contrast' : 'bg-surface-muted text-ink-secondary hover:text-ink')}>
          Todos <span className="tabular opacity-70">{rows.length}</span>
        </button>
        {BILLING_ORDER.map((s) => {
          const n = rows.filter((r) => r.state === s).length
          return (
            <button key={s} type="button" disabled={!n} onClick={() => setFilter(s)} aria-pressed={filter === s} className={cn('rounded-full px-[12px] py-[6px] text-[13px] font-medium disabled:opacity-40', filter === s ? 'bg-contrast text-on-contrast' : 'bg-surface-muted text-ink-secondary hover:text-ink')}>
              {billingStateMeta[s].short} <span className="tabular opacity-70">{n}</span>
            </button>
          )
        })}
      </div>
      {ready.length > 0 && !filter && (
        <p className="mt-[10px] text-[13px] text-ink-secondary">
          Listo para facturar: <AmountsText inline amounts={totalOf(ready)} className="font-semibold text-ink" /> en {ready.length} {ready.length === 1 ? 'concepto' : 'conceptos'} (por moneda, sin convertir).
        </p>
      )}
      <DataTable<BillingRow>
        className="mt-[14px]"
        caption="Facturación pendiente"
        rows={shown}
        getRowId={(r) => r.key}
        minWidth={1020}
        columns={[
          { id: 'state', header: 'Estado', width: '13%', cell: (r) => <StatusBadge meta={{ ...billingStateMeta[r.state], label: billingStateMeta[r.state].cell }} className="whitespace-normal!" /> },
          {
            id: 'project',
            header: 'Proyecto',
            width: '12%',
            cell: (r) => (
              <span className="block min-w-0">
                <Link to={projectPath(r.projectId)} className="tabular block font-medium hover:underline">
                  {r.projectCode}
                </Link>
                <span className="block truncate text-[12px] text-muted">{r.clientName}</span>
              </span>
            ),
          },
          {
            id: 'concept',
            header: 'Servicio / subservicios',
            width: '17%',
            cell: (r) => (
              <span className="block min-w-0 whitespace-normal">
                <span className="block font-medium">{r.concept}</span>
                {r.items.length > 0 && <span className="block text-[12px] leading-[1.35] text-muted">{r.items.join(' · ')}</span>}
              </span>
            ),
          },
          {
            id: 'refs',
            header: 'OC · certificado',
            width: '14%',
            cell: (r) => (
              <span className="block min-w-0 whitespace-normal text-[12.5px]">
                <span className="block">{r.po ?? <span className="text-muted">Sin OC</span>}</span>
                {r.certificate && <span className="block text-muted">Cert.: {r.certificate}</span>}
              </span>
            ),
          },
          {
            id: 'amount',
            header: 'Importe',
            width: '11%',
            cell: (r) => (
              <span className="block">
                <AmountsText amounts={r.amounts} className={r.state === 'ready' ? 'font-semibold' : undefined} />
                <span className="block text-[11.5px] text-muted">{r.state === 'ready' ? 'facturable' : r.state === 'draft' ? 'en borrador' : 'en espera'}</span>
              </span>
            ),
          },
          { id: 'reason', header: 'Motivo', width: '18%', cell: (r) => <span className="block whitespace-normal text-[12.5px] leading-[1.4] text-ink-secondary">{r.reason}</span> },
          { id: 'action', header: 'Acción siguiente', width: '15%', cell: (r) => <ActionLink href={r.action.href} label={r.action.label} /> },
        ]}
        empty={<EmptyState icon={BadgeCheck} title={filter ? 'Nada en este estado' : 'Sin facturación pendiente'} description={filter ? 'Probá con otro estado.' : 'No hay conceptos autorizados sin facturar ni bloqueos comerciales.'} />}
      />
      {all.length > VISIBLE && (
        <button type="button" onClick={() => setExpanded((x) => !x)} className="mt-[10px] rounded-full bg-surface-muted px-[12px] py-[6px] text-[13px] font-medium text-ink-secondary hover:text-ink">
          {expanded ? 'Ver menos' : `Ver todos (${all.length})`}
        </button>
      )}
    </Card>
  )
}

/* ───────────── 2. Purchase orders ───────────── */

export function PoQueueCard({ rows }: { rows: PoRow[] }) {
  return (
    <Card id="ordenes" aria-labelledby="po-title" className="scroll-mt-[24px] px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle id="po-title" title="Órdenes de compra pendientes" description="Solo clientes con OC por proyecto: las OC abiertas vigentes y los clientes sin OC no generan pendientes por proyecto." />
      <DataTable<PoRow>
        className="mt-[14px]"
        caption="OC pendientes"
        rows={rows}
        getRowId={(r) => r.key}
        minWidth={900}
        columns={[
          {
            id: 'client',
            header: 'Cliente / proyecto',
            width: '20%',
            cell: (r) => (
              <span className="block min-w-0">
                <span className="block truncate font-medium">{r.clientName}</span>
                <Link to={projectPath(r.projectId)} className="tabular text-[12px] text-muted hover:underline">
                  {r.projectCode}
                </Link>
              </span>
            ),
          },
          { id: 'ref', header: 'Número / referencia', width: '16%', cell: (r) => <span className="tabular block whitespace-normal text-[13px]">{r.reference}</span> },
          { id: 'status', header: 'Estado', width: '16%', cell: (r) => <StatusBadge meta={poKindMeta[r.kind]} /> },
          { id: 'date', header: 'Fecha', width: '10%', cell: (r) => <span className="tabular text-[13px]">{r.date ? formatDate(r.date) : '—'}</span> },
          { id: 'reason', header: 'Motivo', width: '24%', cell: (r) => <span className="block whitespace-normal text-[12.5px] leading-[1.4] text-ink-secondary">{r.reason}{r.amounts && <AmountsText inline amounts={r.amounts} className="ml-[4px] font-medium text-ink" />}</span> },
          { id: 'action', header: 'Próxima acción', width: '14%', cell: (r) => <ActionLink href={r.action.href} label={r.action.label} /> },
        ]}
        empty={<EmptyState icon={BadgeCheck} title="Sin OC pendientes" description="No hay cotizaciones aprobadas esperando OC ni OC importadas con diferencias." />}
      />
    </Card>
  )
}

/* ───────────── 3. Certificates and prepared invoices ───────────── */

export function CertificatesCard({ rows, drafts }: { rows: CertificateRow[]; drafts: BillingRow[] }) {
  const kinds = Object.keys(certificateKindMeta) as CertificateRow['kind'][]
  return (
    <Card id="certificados" aria-labelledby="cert-title" className="scroll-mt-[24px] px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle id="cert-title" title="Certificados y facturas preparadas" description="Para clientes que exigen certificado aprobado. No hace falta terminar el proyecto para facturar lo certificado." />
      <div className="mt-[14px] grid grid-cols-2 gap-[8px] md:grid-cols-5">
        {kinds.map((k) => (
          <div key={k} className="rounded-[14px] bg-surface-muted px-[12px] py-[10px]">
            <p className="text-[12.5px] text-ink-secondary">{certificateKindMeta[k].short}</p>
            <p className="tabular text-[22px] font-semibold">{rows.filter((r) => r.kind === k).length}</p>
          </div>
        ))}
        <Link to="/?bandeja=borradores#facturacion" className="rounded-[14px] bg-surface-muted px-[12px] py-[10px] hover:bg-surface-sunken">
          <p className="text-[12.5px] text-ink-secondary">Facturas sin emitir</p>
          <p className="tabular text-[22px] font-semibold">{drafts.length}</p>
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={BadgeCheck} className="py-6" title="Sin certificados pendientes" description="Ningún certificado espera generación, aprobación o facturación." />
      ) : (
        <ul className="mt-[12px] flex flex-col gap-[6px]">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-[6px] rounded-[14px] bg-surface-muted px-[12px] py-[9px] text-[13px]">
              <span className="min-w-0 flex-1 basis-[240px]">
                <StatusBadge meta={certificateKindMeta[r.kind]} />
                <span className="ml-[8px] font-medium">{r.reference}</span>
                <span className="block text-[12px] text-muted">
                  {r.projectCode} · {r.clientName}
                  {r.date ? ` · ${formatDate(r.date)}` : ''}
                </span>
              </span>
              <AmountsText inline amounts={r.amounts} className="font-semibold" />
              <ActionLink href={r.action.href} label={r.action.label} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
