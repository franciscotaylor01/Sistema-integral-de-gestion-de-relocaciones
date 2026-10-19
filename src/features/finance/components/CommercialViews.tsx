import { FileSignature, Hourglass, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AmountsText } from '@/components/ui/Amounts'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { CurrencyFlag } from '@/components/ui/Flag'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { DEMO_TODAY } from '@/config/brand'
import { quotationStatusMeta } from '@/config/commercial'
import { clientPath, projectPath, quotationPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { sumAmounts, type Amounts } from '@/domain/commercial/money'
import { effectiveStatus, quotationTotals } from '@/domain/commercial/quotations'
import { projectCommercial, type ServiceCommercial } from '@/domain/commercial/traceability'
import { purchaseOrderColumns, quotationColumns } from '@/features/commercial/columns'
import { PurchaseOrderModal } from '@/features/commercial/PurchaseOrderModal'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import { matches } from '@/lib/search'
import type { CurrencyCode, Project, ProjectService, QuotationStatus } from '@/types/domain'

interface Props {
  workspace: Workspace
  currency: CurrencyCode | ''
  client: string
  q?: string
}

interface Row {
  project: Project
  service: ProjectService
  c: ServiceCommercial
}

/** Commercial position of every service in every open project. */
function useCommercialRows(ws: Workspace): Row[] {
  return useMemo(
    () =>
      ws.projects
        .filter((p) => p.operationalStatus !== 'cancelled')
        .flatMap((project) => {
          const map = projectCommercial(ws.dataset, project, DEMO_TODAY)
          return project.services.map((service) => ({ project, service, c: map.get(service.id)! }))
        }),
    [ws],
  )
}

const keep = (a: Amounts, currency: CurrencyCode | ''): Amounts => (currency ? { [currency]: a[currency] ?? 0 } : a)

export function CommercialOverview({ workspace: ws, currency, client }: Props) {
  const rows = useCommercialRows(ws).filter((r) => !client || r.project.clientId === client)
  const quotations = ws.quotations.filter((q) => !client || q.clientId === client)
  const totals = {
    approved: sumAmounts(...rows.map((r) => r.c.approved)),
    authorized: sumAmounts(...rows.map((r) => r.c.authorized)),
    pending: sumAmounts(...rows.map((r) => r.c.pendingAuthorization)),
    eligible: sumAmounts(...rows.map((r) => (r.c.eligibility.eligible ? r.c.eligibility.amount : {}))),
    open: sumAmounts(
      ...quotations.filter((q) => effectiveStatus(q, DEMO_TODAY) === 'sent').map((q) => quotationTotals(q.lines)),
    ),
  }
  const currencies = CURRENCY_ORDER.filter((c) => (!currency || c === currency) && Object.values(totals).some((t) => (t[c] ?? 0) > 0))
  const counts = (s: QuotationStatus) => quotations.filter((q) => effectiveStatus(q, DEMO_TODAY) === s && !q.supersededById).length
  const pipeline: { status: QuotationStatus; label: string }[] = [
    { status: 'draft', label: 'Borradores' },
    { status: 'sent', label: 'Enviadas' },
    { status: 'expired', label: 'Vencidas' },
    { status: 'approved', label: 'Aprobadas' },
    { status: 'rejected', label: 'Rechazadas' },
  ]

  return (
    <>
      <Card aria-labelledby="com-pipeline" className="px-[18px] pb-[18px] pt-[19px]">
        <SectionTitle id="com-pipeline" title="Embudo de cotizaciones" description="Versiones vigentes por estado" className="px-[2px]" />
        <div className="mt-[16px] grid grid-cols-2 gap-[10px] sm:grid-cols-3 xl:grid-cols-5">
          {pipeline.map((p) => (
            <Link
              key={p.status}
              to={`/finanzas?vista=cotizaciones&estado=${p.status}`}
              className="rounded-tile bg-surface-muted px-[16px] py-[14px] transition-[box-shadow,transform] duration-300 ease-soft hover:-translate-y-0.5 hover:shadow-pill"
            >
              <span className={cn('tabular block text-[28px] font-semibold leading-none', p.status === 'expired' && counts(p.status) > 0 && 'text-warning')}>{counts(p.status)}</span>
              <span className="mt-[8px] block text-[13.5px] text-ink-secondary">{p.label}</span>
            </Link>
          ))}
        </div>
      </Card>
      <Card aria-labelledby="com-position" className="px-[18px] pb-[18px] pt-[19px]">
        <SectionTitle
          id="com-position"
          title="Posición comercial por moneda"
          description="Cotizado en curso, aprobado, autorizado por OC, pendiente de OC y facturable. Sin conversión entre monedas."
          className="px-[2px]"
        />
        {currencies.length === 0 ? (
          <EmptyState title="Sin movimientos comerciales" />
        ) : (
          <div className="mt-[16px] grid gap-[14px] md:grid-cols-2 xl:grid-cols-3">
            {currencies.map((c) => (
              <article key={c} aria-label={`Posición comercial en ${c}`} className="rounded-tile bg-surface-muted p-[16px]">
                <p className="flex items-center gap-[8px] text-[15px] font-semibold">
                  <CurrencyFlag currency={c} className="size-[20px]" />
                  {c}
                </p>
                <dl className="mt-[12px] flex flex-col rounded-[14px] bg-surface px-[12px]">
                  {[
                    ['Cotizaciones enviadas', totals.open[c] ?? 0, ''],
                    ['Aprobado', totals.approved[c] ?? 0, ''],
                    ['Autorizado por OC', totals.authorized[c] ?? 0, 'text-success'],
                    ['Pendiente de OC', totals.pending[c] ?? 0, 'text-warning'],
                    ['Facturable hoy', totals.eligible[c] ?? 0, ''],
                  ].map(([label, value, tone], i, arr) => (
                    <div key={label as string} className={cn('flex items-center justify-between py-[9px] text-[13.5px]', i < arr.length - 1 && 'border-b border-line')}>
                      <dt className="text-ink-secondary">{label}</dt>
                      <dd className={cn('tabular font-semibold', tone as string)}>{formatCurrency(value as number, c)}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}

export function QuotationsView({ workspace: ws, currency, client, status, q = '' }: Props & { status: string }) {
  const rows = ws.quotations
    .filter((x) => (!client || x.clientId === client) && (!status || effectiveStatus(x, DEMO_TODAY) === status))
    .filter((x) => !currency || x.lines.some((l) => l.currency === currency))
    .filter((x) => matches(q, x.number, ws.clientById.get(x.clientId)?.name, ws.projectById.get(x.projectId)?.code))
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.version - a.version)
  return (
    <Card aria-labelledby="fin-quotes" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="fin-quotes"
        title="Cotizaciones"
        description={`${rows.length} versiones${status ? ` · ${quotationStatusMeta[status as QuotationStatus].label.toLowerCase()}` : ''}`}
      />
      <DataTable
        className="mt-[18px]"
        caption="Cotizaciones"
        rows={rows}
        getRowId={(x) => x.id}
        rowHref={(x) => quotationPath(x.id)}
        minWidth={1080}
        columns={quotationColumns(ws)}
        empty={<EmptyState icon={FileSignature} title="No hay cotizaciones que coincidan" description="Ajustá la búsqueda o los filtros." />}
      />
    </Card>
  )
}

export function PurchaseOrdersView({ workspace: ws, currency, client, status, q = '' }: Props & { status: string }) {
  const rows = ws.purchaseOrders
    .filter((p) => (!client || p.clientId === client) && (!status || p.status === status) && (!currency || p.currency === currency))
    .filter((p) => matches(q, p.clientPoNumber, p.internalNumber, ws.clientById.get(p.clientId)?.name, ws.projectById.get(p.projectId)?.code))
    .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
  return (
    <Card aria-labelledby="fin-pos" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle id="fin-pos" title="Órdenes de compra" description={`Autorizado: ${summarize(rows.filter((p) => p.status === 'active').map((p) => ({ [p.currency]: p.authorizedAmount })))}`} />
      <DataTable
        className="mt-[18px]"
        caption="Órdenes de compra"
        rows={rows}
        getRowId={(p) => p.id}
        rowHref={(p) => `/ordenes-compra/${p.id}`}
        minWidth={1180}
        columns={purchaseOrderColumns(ws)}
        empty={<EmptyState icon={ShieldCheck} title="No hay órdenes de compra que coincidan" />}
      />
    </Card>
  )
}

const summarize = (list: Amounts[]) => {
  const total = sumAmounts(...list)
  const parts = CURRENCY_ORDER.filter((c) => (total[c] ?? 0) > 0).map((c) => formatCurrency(total[c] ?? 0, c))
  return parts.length ? parts.join(' · ') : '—'
}

/** Approved work waiting for the client's PO (only clients whose policy requires one). */
export function PendingAuthorizationView({ workspace: ws, currency, client, q = '' }: Props) {
  const [poFor, setPoFor] = useState<Project>()
  const rows = useCommercialRows(ws)
    .filter((r) => Object.values(keep(r.c.pendingAuthorization, currency)).some((v) => (v ?? 0) > 0))
    .filter((r) => !client || r.project.clientId === client)
    .filter((r) => matches(q, r.project.code, ws.clientById.get(r.project.clientId)?.name, getServiceType(r.service.typeId).label))
  return (
    <Card aria-labelledby="fin-pending" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="fin-pending"
        title="Pendiente de autorización"
        description={`Trabajo aprobado sin OC: ${summarize(rows.map((r) => keep(r.c.pendingAuthorization, currency)))}`}
      />
      <DataTable<Row>
        className="mt-[18px]"
        caption="Servicios aprobados pendientes de OC"
        rows={rows}
        getRowId={(r) => r.service.id}
        rowHref={(r) => `${projectPath(r.project.id)}?tab=finanzas`}
        minWidth={1080}
        columns={[
          {
            id: 'project',
            header: 'Proyecto',
            width: '136px',
            cell: (r) => (
              <Link to={`${projectPath(r.project.id)}?tab=finanzas`} className="tabular font-medium underline-offset-4 hover:underline">
                {r.project.code}
              </Link>
            ),
          },
          {
            id: 'client',
            header: 'Cliente',
            width: '16%',
            cell: (r) => (
              <Link to={clientPath(r.project.clientId)} className="block truncate underline-offset-4 hover:underline">
                {ws.clientById.get(r.project.clientId)?.name}
              </Link>
            ),
          },
          {
            id: 'service',
            header: 'Servicio',
            width: '19%',
            cell: (r) => (
              <span className="flex items-center gap-[10px]">
                <ServiceChip type={r.service.typeId} />
                <span className="truncate font-medium">{getServiceType(r.service.typeId).label}</span>
              </span>
            ),
          },
          { id: 'approved', header: 'Aprobado', width: '13%', cell: (r) => <AmountsText amounts={keep(r.c.approved, currency)} /> },
          { id: 'authorized', header: 'Autorizado', width: '13%', cell: (r) => <AmountsText amounts={keep(r.c.authorized, currency)} /> },
          { id: 'pending', header: 'Pendiente', width: '13%', className: 'font-semibold text-warning', cell: (r) => <AmountsText amounts={keep(r.c.pendingAuthorization, currency)} /> },
          {
            id: 'action',
            header: <span className="sr-only">Acciones</span>,
            width: '130px',
            cell: (r) => (
              <Button size="sm" variant="outline" className="h-[32px] px-[12px] text-[13px]" onClick={() => setPoFor(r.project)}>
                Registrar OC
              </Button>
            ),
          },
        ]}
        empty={<EmptyState icon={Hourglass} title="Nada pendiente de autorización" description="Todo el trabajo aprobado está cubierto por OC." />}
      />
      {poFor && <PurchaseOrderModal open onClose={() => setPoFor(undefined)} workspace={ws} project={poFor} />}
    </Card>
  )
}
