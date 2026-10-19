import { ArrowLeftRight, FilterX, ReceiptText, Truck } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { CurrencyFlag } from '@/components/ui/Flag'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchField } from '@/components/ui/SearchField'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { financialStatusMeta, invoiceStatusMeta, payableStatusMeta } from '@/config/catalogs'
import { projectPath } from '@/config/navigation'
import { projectBudget, projectEstimatedCost } from '@/features/projects/selectors'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { daysUntil } from '@/lib/dates'
import { formatCurrency, formatPercent } from '@/lib/format'
import { currencyEntries, CURRENCY_ORDER } from '@/lib/money'
import { cardVariants, staggerVariants } from '@/lib/motion'
import { matches } from '@/lib/search'
import type { CurrencyCode, InvoiceStatus, PayableStatus, Project } from '@/types/domain'
import { CashflowChartCard } from './components/CashflowChartCard'
import { CurrencyIndicators } from './components/CurrencyIndicators'
import { CurrencyLedgerCard } from './components/CurrencyLedgerCard'
import { invoiceColumns, payableColumns, paymentColumns } from './components/ledgerColumns'
import { invoiceOutstanding, payableOutstanding, receivablesAging, summarizeLedger } from './selectors'

const VIEWS = ['resumen', 'facturas', 'cobranzas', 'proveedores', 'pagos', 'costos'] as const
type View = (typeof VIEWS)[number]
const isView = (v: string | null): v is View => VIEWS.includes(v as View)

export function FinancePage() {
  const { workspace, loading } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const viewParam = params.get('vista')
  const view: View = isView(viewParam) ? viewParam : 'resumen'
  const currency = (params.get('moneda') ?? '') as CurrencyCode | ''
  const status = params.get('estado') ?? ''
  const direction = params.get('direccion') ?? ''
  const q = params.get('q') ?? ''

  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  /* Switching view keeps the currency filter, resets view-specific ones. */
  const setView = (v: View) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams()
        if (v !== 'resumen') next.set('vista', v)
        const m = prev.get('moneda')
        if (m) next.set('moneda', m)
        return next
      },
      { replace: true },
    )

  const usedCurrencies = useMemo(
    () => CURRENCY_ORDER.filter((c) => workspace?.invoices.some((i) => i.currency === c) || workspace?.payables.some((p) => p.currency === c)),
    [workspace],
  )
  const hasFilters = Boolean(currency || status || direction || q)

  return (
    <div className="pt-[5px]">
      <PageHeader
        title="Finanzas"
        description="Facturación, cobranzas y obligaciones con proveedores por moneda de origen. Sin cálculos impositivos ni de tipo de cambio."
      />

      {loading || !workspace ? (
        <div className="mt-[34px] flex flex-col gap-[24px]" aria-busy="true" aria-label="Cargando finanzas">
          <Skeleton className="h-[46px] w-full rounded-full" />
          <Skeleton className="h-[54px] w-[640px] max-w-full rounded-full" />
          <Skeleton className="h-[420px] rounded-card" />
        </div>
      ) : (
        <>
          <motion.div variants={cardVariants} className="mt-[28px]">
            <CurrencyIndicators items={workspace.currencyIndicators} />
          </motion.div>

          <motion.div variants={cardVariants} className="mt-[22px]">
            <Tabs
              label="Vistas de finanzas"
              idPrefix="finance-tabs"
              value={view}
              onChange={setView}
              items={[
                { value: 'resumen', label: 'Resumen' },
                { value: 'facturas', label: 'Facturas', count: workspace.invoices.length },
                { value: 'cobranzas', label: 'Cuentas por cobrar', count: workspace.invoices.filter((i) => invoiceOutstanding(i) > 0).length },
                { value: 'proveedores', label: 'Proveedores', count: workspace.payables.filter((p) => payableOutstanding(p) > 0).length },
                { value: 'pagos', label: 'Pagos', count: workspace.payments.length },
                { value: 'costos', label: 'Costos por proyecto' },
              ]}
            />
          </motion.div>

          <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
            {view !== 'resumen' && (
              <SearchField value={q} onChange={(v) => setParam('q', v)} label="Buscar en finanzas" placeholder="Comprobante, cliente, proveedor…" />
            )}
            <FilterSelect
              size="sm"
              label="Moneda"
              allLabel="Todas"
              value={currency}
              onChange={(v) => setParam('moneda', v)}
              options={usedCurrencies.map((c) => ({ value: c, label: c, icon: <CurrencyFlag currency={c} className="size-[16px]" /> }))}
            />
            {view === 'facturas' && (
              <FilterSelect
                size="sm"
                label="Estado"
                value={status}
                onChange={(v) => setParam('estado', v)}
                options={(Object.keys(invoiceStatusMeta) as InvoiceStatus[]).map((s) => ({ value: s, label: invoiceStatusMeta[s].label }))}
              />
            )}
            {view === 'proveedores' && (
              <FilterSelect
                size="sm"
                label="Estado"
                value={status}
                onChange={(v) => setParam('estado', v)}
                options={(Object.keys(payableStatusMeta) as PayableStatus[]).map((s) => ({ value: s, label: payableStatusMeta[s].label }))}
              />
            )}
            {view === 'pagos' && (
              <FilterSelect
                size="sm"
                label="Tipo"
                value={direction}
                onChange={(v) => setParam('direccion', v)}
                options={[
                  { value: 'incoming', label: 'Cobros' },
                  { value: 'outgoing', label: 'Pagos a proveedores' },
                ]}
              />
            )}
            {hasFilters && (
              <Button variant="secondary" size="sm" onClick={() => setView(view)}>
                <FilterX aria-hidden className="size-[15px]" strokeWidth={2} />
                Limpiar
              </Button>
            )}
          </div>

          <div className="mt-[20px]">
            <TabPanel idPrefix="finance-tabs" activeValue={view}>
              <motion.div variants={staggerVariants} initial="hidden" animate="show" className="flex flex-col gap-[24px]">
                {view === 'resumen' && <SummaryView workspace={workspace} currency={currency} currencies={usedCurrencies} />}
                {view === 'facturas' && <InvoicesView workspace={workspace} currency={currency} status={status} q={q} />}
                {view === 'cobranzas' && <ReceivablesView workspace={workspace} currency={currency} q={q} />}
                {view === 'proveedores' && <PayablesView workspace={workspace} currency={currency} status={status} q={q} />}
                {view === 'pagos' && <PaymentsView workspace={workspace} currency={currency} direction={direction} q={q} />}
                {view === 'costos' && <CostsView workspace={workspace} currency={currency} q={q} />}
              </motion.div>
            </TabPanel>
          </div>
        </>
      )}
    </div>
  )
}

interface ViewProps {
  workspace: Workspace
  currency: CurrencyCode | ''
  q?: string
}

function SummaryView({ workspace, currency, currencies }: ViewProps & { currencies: CurrencyCode[] }) {
  const ledger = summarizeLedger(workspace.invoices, workspace.payables)
  const shown = currency ? [currency] : currencies
  return (
    <>
      <Card aria-labelledby="fin-position" className="px-[18px] pb-[18px] pt-[19px]">
        <SectionTitle
          id="fin-position"
          title="Posición por moneda"
          description="Facturado, cobrado, pagado y pendiente. Cada moneda se presenta por separado."
          className="px-[2px]"
        />
        <div className="mt-[18px] grid gap-[14px] md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <CurrencyLedgerCard key={c} currency={c} ledger={ledger} />
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-[24px] xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <CashflowChartCard invoices={workspace.invoices} payments={workspace.payments} />
        </div>
        <AgingCard workspace={workspace} currency={currency} />
      </div>
    </>
  )
}

function AgingCard({ workspace, currency }: ViewProps) {
  const invoices = currency ? workspace.invoices.filter((i) => i.currency === currency) : workspace.invoices
  const buckets = receivablesAging(invoices, (iso) => -daysUntil(iso))
  return (
    <Card aria-labelledby="fin-aging" className="h-full px-[20px] pb-[18px] pt-[20px]">
      <SectionTitle id="fin-aging" size="sm" title="Antigüedad de saldos" description="Cuentas por cobrar según días de atraso" />
      <ul className="mt-[16px] flex flex-col gap-[8px]">
        {buckets.map((b) => (
          <li key={b.id}>
            <Link
              to="/finanzas?vista=cobranzas"
              className="flex items-start justify-between gap-3 rounded-[14px] bg-surface-muted px-[14px] py-[11px] transition-colors hover:bg-surface-sunken"
            >
              <span>
                <span className="block text-[14px] font-medium">{b.label}</span>
                <span className="block text-[12px] text-muted">{b.count} facturas</span>
              </span>
              <span className="flex flex-col items-end gap-[2px]">
                {currencyEntries(b.amounts).length === 0 ? (
                  <span className="text-[13.5px] text-muted">—</span>
                ) : (
                  currencyEntries(b.amounts).map(([c, v]) => (
                    <span key={c} className={b.id === 'current' ? 'tabular text-[13.5px] font-semibold' : 'tabular text-[13.5px] font-semibold text-danger'}>
                      {formatCurrency(v, c)}
                    </span>
                  ))
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function InvoicesView({ workspace, currency, status, q = '' }: ViewProps & { status: string }) {
  const rows = workspace.invoices
    .filter(
      (i) =>
        (!currency || i.currency === currency) &&
        (!status || i.status === status) &&
        matches(q, i.number, workspace.clientById.get(i.clientId)?.name, workspace.projectById.get(i.projectId)?.code),
    )
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
  const ledger = summarizeLedger(rows, [])
  return (
    <Card aria-labelledby="fin-invoices" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="fin-invoices"
        title="Facturas emitidas"
        description={`${rows.length} comprobantes · facturado ${currencyEntries(ledger.invoiced).map(([c, v]) => formatCurrency(v, c)).join(' · ') || '—'}`}
      />
      <DataTable
        className="mt-[18px]"
        caption="Facturas"
        rows={rows}
        getRowId={(i) => i.id}
        rowHref={(i) => `${projectPath(i.projectId)}?tab=finanzas`}
        minWidth={1180}
        columns={invoiceColumns(workspace)}
        empty={<EmptyState icon={ReceiptText} title="No hay facturas que coincidan" description="Ajustá la búsqueda o los filtros." />}
      />
    </Card>
  )
}

function ReceivablesView({ workspace, currency, q = '' }: ViewProps) {
  const open = workspace.invoices
    .filter(
      (i) =>
        invoiceOutstanding(i) > 0 &&
        (!currency || i.currency === currency) &&
        matches(q, i.number, workspace.clientById.get(i.clientId)?.name, workspace.projectById.get(i.projectId)?.code),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return (
    <>
      <AgingStrip workspace={workspace} currency={currency} />
      <Card aria-labelledby="fin-receivables" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle id="fin-receivables" title="Cuentas por cobrar" description="Facturas con saldo pendiente, ordenadas por vencimiento" />
        <DataTable
          className="mt-[18px]"
          caption="Cuentas por cobrar"
          rows={open}
          getRowId={(i) => i.id}
          rowHref={(i) => `${projectPath(i.projectId)}?tab=finanzas`}
          minWidth={1180}
          columns={invoiceColumns(workspace)}
          empty={<EmptyState icon={ReceiptText} title="Sin saldos pendientes" description="Todas las facturas están cobradas." />}
        />
      </Card>
    </>
  )
}

function AgingStrip({ workspace, currency }: ViewProps) {
  const invoices = currency ? workspace.invoices.filter((i) => i.currency === currency) : workspace.invoices
  const buckets = receivablesAging(invoices, (iso) => -daysUntil(iso))
  return (
    <Card aria-label="Antigüedad de saldos" className="grid gap-[14px] p-[18px] sm:grid-cols-2 xl:grid-cols-4">
      {buckets.map((b) => (
        <div key={b.id} className="rounded-tile bg-surface-muted p-[16px]">
          <p className="flex items-center justify-between text-[14px] text-ink-secondary">
            {b.label}
            <span className="tabular rounded-full bg-surface px-[8px] py-[1px] text-[12px] font-medium">{b.count}</span>
          </p>
          <div className="mt-[14px] flex flex-col gap-[2px]">
            {currencyEntries(b.amounts).length === 0 ? (
              <p className="text-[22px] font-semibold text-subtle">—</p>
            ) : (
              currencyEntries(b.amounts).map(([c, v]) => (
                <p key={c} className={b.id === 'current' ? 'tabular text-[20px] font-semibold tracking-[-0.02em]' : 'tabular text-[20px] font-semibold tracking-[-0.02em] text-danger'}>
                  {formatCurrency(v, c)}
                </p>
              ))
            )}
          </div>
        </div>
      ))}
    </Card>
  )
}

function PayablesView({ workspace, currency, status, q = '' }: ViewProps & { status: string }) {
  const rows = workspace.payables
    .filter(
      (p) =>
        (!currency || p.currency === currency) &&
        (!status || p.status === status) &&
        matches(q, p.reference, workspace.supplierById.get(p.supplierId)?.name, workspace.projectById.get(p.projectId)?.code),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const ledger = summarizeLedger([], rows)
  return (
    <Card aria-labelledby="fin-payables" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="fin-payables"
        title="Obligaciones con proveedores"
        description={`Pendiente de pago: ${currencyEntries(ledger.payable).map(([c, v]) => formatCurrency(v, c)).join(' · ') || '—'}`}
      />
      <DataTable
        className="mt-[18px]"
        caption="Cuentas a pagar"
        rows={rows}
        getRowId={(p) => p.id}
        rowHref={(p) => `${projectPath(p.projectId)}?tab=finanzas`}
        minWidth={1120}
        columns={payableColumns(workspace)}
        empty={<EmptyState icon={Truck} title="No hay obligaciones que coincidan" description="Ajustá la búsqueda o los filtros." />}
      />
    </Card>
  )
}

function PaymentsView({ workspace, currency, direction, q = '' }: ViewProps & { direction: string }) {
  const rows = workspace.payments
    .filter((p) => (!currency || p.currency === currency) && (!direction || p.direction === direction) && matches(q, p.counterparty))
    .sort((a, b) => b.date.localeCompare(a.date))
  return (
    <Card aria-labelledby="fin-payments" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle id="fin-payments" title="Movimientos" description="Cobros de clientes y pagos a proveedores registrados" />
      <DataTable
        className="mt-[18px]"
        caption="Cobros y pagos"
        rows={rows}
        getRowId={(p) => p.id}
        minWidth={900}
        columns={paymentColumns(workspace)}
        empty={<EmptyState icon={ArrowLeftRight} title="Sin movimientos" description="No hay cobros ni pagos para los filtros elegidos." />}
      />
    </Card>
  )
}

function CostsView({ workspace, currency, q = '' }: ViewProps) {
  const rows = workspace.projects
    .filter(
      (p) =>
        (!currency || p.currency === currency) &&
        matches(q, p.code, workspace.clientById.get(p.clientId)?.name, workspace.personById.get(p.beneficiaryId)?.name),
    )
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
  const recorded = (p: Project) => workspace.payables.filter((x) => x.projectId === p.id).reduce((s, x) => s + x.amount, 0)
  const paid = (p: Project) => workspace.payables.filter((x) => x.projectId === p.id).reduce((s, x) => s + x.paid, 0)

  return (
    <Card aria-labelledby="fin-costs" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="fin-costs"
        title="Costos por proyecto"
        description="Presupuesto, costo estimado y costos ya registrados de proveedores, en la moneda de cada proyecto"
      />
      <DataTable
        className="mt-[18px]"
        caption="Costos por proyecto"
        rows={rows}
        getRowId={(p) => p.id}
        rowHref={(p) => `${projectPath(p.id)}?tab=finanzas`}
        minWidth={1180}
        columns={[
          { id: 'code', header: 'Proyecto', width: '132px', className: 'tabular font-medium', cell: (p) => p.code },
          { id: 'client', header: 'Cliente', width: '15%', cell: (p) => <span className="block truncate">{workspace.clientById.get(p.clientId)?.name}</span> },
          {
            id: 'cur',
            header: 'Moneda',
            width: '92px',
            cell: (p) => (
              <span className="flex items-center gap-[6px]">
                <CurrencyFlag currency={p.currency} className="size-[16px]" />
                {p.currency}
              </span>
            ),
          },
          { id: 'budget', header: 'Presupuesto', className: 'tabular', cell: (p) => formatCurrency(projectBudget(p), p.currency) },
          { id: 'est', header: 'Costo estimado', className: 'tabular', cell: (p) => formatCurrency(projectEstimatedCost(p), p.currency) },
          { id: 'rec', header: 'Costos registrados', className: 'tabular', cell: (p) => formatCurrency(recorded(p), p.currency) },
          { id: 'paid', header: 'Pagado', className: 'tabular text-ink-secondary', cell: (p) => formatCurrency(paid(p), p.currency) },
          {
            id: 'margin',
            header: 'Margen est.',
            width: '104px',
            className: 'tabular font-medium text-success',
            cell: (p) => {
              const b = projectBudget(p)
              return formatPercent(b ? ((b - projectEstimatedCost(p)) / b) * 100 : 0)
            },
          },
          { id: 'fin', header: 'Estado', width: '128px', cell: (p) => <StatusBadge meta={financialStatusMeta[p.financialStatus]} /> },
        ]}
        empty={<EmptyState title="Sin proyectos para los filtros elegidos" />}
      />
    </Card>
  )
}

