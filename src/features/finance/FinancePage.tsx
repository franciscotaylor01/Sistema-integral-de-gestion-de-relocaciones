import { ArrowLeftRight, Building2, FilterX, HandCoins, Plus, ReceiptText, Truck, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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
import { DEMO_TODAY } from '@/config/brand'
import { invoiceStatusMeta, payableStatusMeta } from '@/config/catalogs'
import { purchaseOrderStatusMeta, quotationStatusMeta } from '@/config/commercial'
import { settlementSignalMeta, supplierKindLabel } from '@/config/finance'
import { clientPath, projectPath, supplierPath } from '@/config/navigation'
import { hasAmount } from '@/domain/commercial/money'
import { projectCommercial } from '@/domain/commercial/traceability'
import { receiptUnallocated } from '@/domain/finance/derive'
import { addMoney } from '@/domain/finance/money'
import type { SettlementSignal } from '@/domain/finance/settlements'
import { companyExpenses, projectResults, type CurrencyResult } from '@/domain/finance/results'
import { useActions } from '@/hooks/useActions'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { formatCurrency, formatMoney } from '@/lib/format'
import { currencyEntries, CURRENCY_ORDER, type MoneyByCurrency } from '@/lib/money'
import { cardVariants, staggerVariants } from '@/lib/motion'
import { matches } from '@/lib/search'
import type { CurrencyCode, InvoiceStatus, PayableStatus, Project, PurchaseOrderStatus, QuotationStatus, Supplier } from '@/types/domain'
import { CashflowChartCard } from './components/CashflowChartCard'
import { CommercialOverview, PendingAuthorizationView, PurchaseOrdersView, QuotationsView } from './components/CommercialViews'
import { CurrencyIndicators } from './components/CurrencyIndicators'
import { CurrencyLedgerCard } from './components/CurrencyLedgerCard'
import { ExchangeRatesPanel } from './components/ExchangeRatesPanel'
import { costColumns, invoiceColumns, obligationColumns, receiptColumns, supplierPaymentColumns } from './components/ledgerColumns'
import { INSUFFICIENT, MarginValue } from './components/ResultBlocks'
import { NewInvoiceModal } from './modals/NewInvoiceModal'
import { ObligationDetailModal, SupplierPaymentDetailModal, SupplierPaymentModal } from './modals/PaymentModals'
import { ReceiptDetailModal, RecordReceiptModal } from './modals/ReceiptModals'
import { CostModal, ObligationModal, SupplierFormModal } from './modals/SupplierModals'
import { SettlementsView } from './settlements/SettlementsView'
import { sortSuppliersNewestFirst } from '@/domain/finance/supplierViews'
import { advanceInfo } from '@/domain/finance/supplierPayments'
import { AdvancesView, OverheadsView } from './components/SupplierFinanceViews'
import { receivableColumns, receivableStatusMeta } from './components/receivableColumns'
import { receivableRows, type ReceivableStatus } from '@/domain/finance/receivables'
import { OpenOrdersPanel } from '@/features/catalog/CatalogPanels'
import { certificateColumns } from '@/features/catalog/certificateColumns'
import { certificateStatusMeta } from '@/features/catalog/meta'
import type { CertificateStatus } from '@/types/domain'
import { obligationOutstanding, outstandingOf, receivablesAging, summarizeLedger, supplierBalances } from './selectors'

const VIEWS = ['resumen', 'facturas', 'cobranzas', 'proveedores', 'anticipos', 'pagos', 'costos', 'gastos-generales', 'resultados', 'liquidaciones', 'comercial', 'cotizaciones', 'ordenes', 'oc-abiertas', 'certificados', 'pendientes'] as const
type View = (typeof VIEWS)[number]
const isView = (v: string | null): v is View => VIEWS.includes(v as View)
const COMMERCIAL_VIEWS: View[] = ['cobranzas', 'comercial', 'cotizaciones', 'ordenes', 'pendientes', 'oc-abiertas', 'certificados']
const SEARCHABLE: View[] = ['anticipos', 'gastos-generales', 'liquidaciones', 'facturas', 'cobranzas', 'proveedores', 'pagos', 'costos', 'resultados', 'cotizaciones', 'ordenes', 'pendientes']

export function FinancePage() {
  const { workspace, loading } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const viewParam = params.get('vista')
  const view: View = isView(viewParam) ? viewParam : 'resumen'
  const currency = (params.get('moneda') ?? '') as CurrencyCode | ''
  const status = params.get('estado') ?? ''
  const scope = params.get('ambito') ?? ''
  const q = params.get('q') ?? ''
  const client = params.get('cliente') ?? ''
  const pendingCount = useMemo(() => {
    if (!workspace) return 0
    return workspace.projects.reduce((n, p) => n + [...projectCommercial(workspace.dataset, p, DEMO_TODAY).values()].filter((c) => hasAmount(c.pendingAuthorization)).length, 0)
  }, [workspace])

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
    () =>
      CURRENCY_ORDER.filter(
        (c) => workspace?.invoices.some((i) => i.currency === c) || workspace?.obligations.some((o) => o.currency === c) || workspace?.costs.some((x) => x.currency === c),
      ),
    [workspace],
  )
  const hasFilters = Boolean(currency || status || scope || q || client || params.get('venc'))

  return (
    <div className="pt-[5px]">
      <PageHeader
        title="Finanzas"
        description="Facturación, cobranzas, proveedores, pagos y resultados por moneda de origen. Sin cálculos impositivos ni conversión de monedas."
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
                { value: 'cobranzas', label: 'Cobranzas', count: workspace.invoices.filter((i) => i.lifecycle === 'issued' && outstandingOf(workspace, i) > 0).length },
                { value: 'proveedores', label: 'Proveedores', count: workspace.obligations.filter((o) => obligationOutstanding(workspace, o) > 0 && o.lifecycle !== 'cancelled').length },
                { value: 'anticipos', label: 'Anticipos', count: workspace.supplierPayments.filter((p) => advanceInfo(p)?.status !== undefined && advanceInfo(p)!.available > 0).length },
                { value: 'pagos', label: 'Cobros y pagos', count: workspace.receipts.length + workspace.supplierPayments.length },
                { value: 'costos', label: 'Costos y gastos' },
                { value: 'gastos-generales', label: 'Gastos generales' },
                { value: 'resultados', label: 'Resultados por proyecto' },
                { value: 'liquidaciones', label: 'Liquidaciones', count: workspace.settlements.length },
                { value: 'comercial', label: 'Comercial' },
                { value: 'cotizaciones', label: 'Cotizaciones', count: workspace.quotations.length },
                { value: 'ordenes', label: 'Órdenes de compra', count: workspace.purchaseOrders.filter((p) => p.status === 'active').length },
                { value: 'pendientes', label: 'Pendiente de OC', count: pendingCount },
                { value: 'oc-abiertas', label: 'OC abiertas', count: workspace.openOrders.length },
                { value: 'certificados', label: 'Certificados', count: workspace.certificates.length },
              ]}
            />
          </motion.div>

          <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
            {SEARCHABLE.includes(view) && <SearchField value={q} onChange={(v) => setParam('q', v)} label="Buscar en finanzas" placeholder="Comprobante, cliente, proveedor…" />}
            <FilterSelect
              size="sm"
              label="Moneda"
              allLabel="Todas"
              value={currency}
              onChange={(v) => setParam('moneda', v)}
              options={usedCurrencies.map((c) => ({ value: c, label: c, icon: <CurrencyFlag currency={c} className="size-[16px]" /> }))}
            />
            {(COMMERCIAL_VIEWS.includes(view) || view === 'liquidaciones') && (
              <FilterSelect size="sm" label="Cliente" value={client} onChange={(v) => setParam('cliente', v)} options={workspace.clients.map((c) => ({ value: c.id, label: c.name }))} />
            )}
            {view === 'cotizaciones' && (
              <FilterSelect
                size="sm"
                label="Estado"
                value={status}
                onChange={(v) => setParam('estado', v)}
                options={(Object.keys(quotationStatusMeta) as QuotationStatus[]).map((s) => ({ value: s, label: quotationStatusMeta[s].label }))}
              />
            )}
            {view === 'ordenes' && (
              <FilterSelect
                size="sm"
                label="Estado"
                value={status}
                onChange={(v) => setParam('estado', v)}
                options={(Object.keys(purchaseOrderStatusMeta) as PurchaseOrderStatus[]).map((s) => ({ value: s, label: purchaseOrderStatusMeta[s].label }))}
              />
            )}
            {view === 'cobranzas' && (
              <>
                <FilterSelect
                  size="sm"
                  label="Estado"
                  value={status}
                  onChange={(v) => setParam('estado', v)}
                  options={(Object.keys(receivableStatusMeta) as ReceivableStatus[]).map((s) => ({ value: s, label: receivableStatusMeta[s].label }))}
                />
                <FilterSelect
                  size="sm"
                  label="Vencimiento"
                  value={params.get('venc') ?? ''}
                  onChange={(v) => setParam('venc', v)}
                  options={[
                    { value: 'overdue', label: 'Vencidas' },
                    { value: '7', label: 'Próximos 7 días' },
                    { value: '30', label: 'Próximos 30 días' },
                  ]}
                />
              </>
            )}
            {view === 'certificados' && (
              <FilterSelect
                size="sm"
                label="Estado"
                value={status}
                onChange={(v) => setParam('estado', v)}
                options={(Object.keys(certificateStatusMeta) as CertificateStatus[]).map((s) => ({ value: s, label: certificateStatusMeta[s].label }))}
              />
            )}
            {view === 'liquidaciones' && (
              <FilterSelect
                size="sm"
                label="Estado"
                value={status}
                onChange={(v) => setParam('estado', v)}
                options={(Object.keys(settlementSignalMeta) as SettlementSignal[]).map((s) => ({ value: s, label: settlementSignalMeta[s].label }))}
              />
            )}
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
                value={status}
                onChange={(v) => setParam('estado', v)}
                options={[
                  { value: 'incoming', label: 'Cobros de clientes' },
                  { value: 'outgoing', label: 'Pagos a proveedores' },
                ]}
              />
            )}
            {view === 'costos' && (
              <FilterSelect
                size="sm"
                label="Ámbito"
                value={scope}
                onChange={(v) => setParam('ambito', v)}
                options={[
                  { value: 'project', label: 'Costos de proyectos' },
                  { value: 'company', label: 'Gastos generales' },
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
                {view === 'cobranzas' && <ReceivablesView workspace={workspace} currency={currency} q={q} client={client} status={status} due={params.get('venc') ?? ''} />}
                {view === 'proveedores' && <SuppliersView workspace={workspace} currency={currency} status={status} q={q} />}
                {view === 'anticipos' && <AdvancesView ws={workspace} currency={currency} q={q} />}
                {view === 'gastos-generales' && <OverheadsView ws={workspace} currency={currency} q={q} />}
                {view === 'pagos' && <PaymentsView workspace={workspace} currency={currency} direction={status} q={q} />}
                {view === 'costos' && <CostsView workspace={workspace} currency={currency} scope={scope} q={q} />}
                {view === 'resultados' && <ResultsView workspace={workspace} currency={currency} q={q} />}
                {view === 'liquidaciones' && <SettlementsView workspace={workspace} currency={currency} client={client} status={status} q={q} />}
                {view === 'comercial' && <CommercialOverview workspace={workspace} currency={currency} client={client} />}
                {view === 'cotizaciones' && <QuotationsView workspace={workspace} currency={currency} client={client} status={status} q={q} />}
                {view === 'ordenes' && <PurchaseOrdersView workspace={workspace} currency={currency} client={client} status={status} q={q} />}
                {view === 'oc-abiertas' && <OpenOrdersPanel workspace={workspace} client={client ? workspace.clientById.get(client) : undefined} />}
                {view === 'certificados' && <CertificatesView workspace={workspace} client={client} status={status} q={q} />}
                {view === 'pendientes' && <PendingAuthorizationView workspace={workspace} currency={currency} client={client} q={q} />}
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

const joinMoney = (m: MoneyByCurrency) => currencyEntries(m).map(([c, v]) => formatCurrency(v, c, { decimals: 2 })).join(' · ') || '—'

function SummaryView({ workspace, currency, currencies }: ViewProps & { currencies: CurrencyCode[] }) {
  const ledger = summarizeLedger(workspace)
  const shown = currency ? [currency] : currencies
  const general = companyExpenses(workspace.dataset)
  return (
    <>
      <Card aria-labelledby="fin-position" className="px-[18px] pb-[18px] pt-[19px]">
        <SectionTitle id="fin-position" title="Posición por moneda" description="Facturado, cobrado, obligaciones y pagos. Cada moneda se presenta por separado." className="px-[2px]" />
        <div className="mt-[18px] grid gap-[14px] md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <CurrencyLedgerCard key={c} currency={c} ledger={ledger} />
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-[24px] xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <CashflowChartCard workspace={workspace} />
        </div>
        <AgingCard workspace={workspace} currency={currency} />
      </div>
      <Card aria-labelledby="fin-general" className="px-[20px] pb-[18px] pt-[20px]">
        <SectionTitle
          id="fin-general"
          size="sm"
          title="Gastos generales de la empresa"
          description="Separados de los costos de proyectos. No se imputan a ningún resultado por proyecto."
          action={
            <Link to="/finanzas?vista=costos&ambito=company" className="text-[13.5px] font-medium text-ink-secondary underline-offset-4 hover:underline">
              Ver detalle
            </Link>
          }
        />
        <p className="tabular mt-[12px] text-[17px] font-semibold">{joinMoney(general)}</p>
      </Card>
      <ExchangeRatesPanel workspace={workspace} />
    </>
  )
}

function AgingCard({ workspace, currency }: ViewProps) {
  const invoices = currency ? workspace.invoices.filter((i) => i.currency === currency) : workspace.invoices
  const buckets = receivablesAging(workspace, invoices)
  return (
    <Card aria-labelledby="fin-aging" className="h-full px-[20px] pb-[18px] pt-[20px]">
      <SectionTitle id="fin-aging" size="sm" title="Antigüedad de saldos" description="Cuentas por cobrar según días de atraso" />
      <ul className="mt-[16px] flex flex-col gap-[8px]">
        {buckets.map((b) => (
          <li key={b.id}>
            <Link to="/finanzas?vista=cobranzas" className="flex items-start justify-between gap-3 rounded-[14px] bg-surface-muted px-[14px] py-[11px] transition-colors hover:bg-surface-sunken">
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

const invoiceMatches = (ws: Workspace, q: string) => (i: Workspace['invoices'][number]) =>
  matches(q, i.number, i.externalRef, ws.clientById.get(i.clientId)?.name, ws.projectById.get(i.projectId)?.code)

function InvoicesView({ workspace: ws, currency, status, q = '' }: ViewProps & { status: string }) {
  const [creating, setCreating] = useState(false)
  const rows = ws.invoices
    .filter((i) => (!currency || i.currency === currency) && (!status || ws.invoiceFin.get(i.id)?.status === status) && invoiceMatches(ws, q)(i))
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number))
  const ledger = summarizeLedger(ws, rows, [])
  return (
    <Card aria-labelledby="fin-invoices" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="fin-invoices"
        title="Facturas"
        description={`${rows.length} comprobantes · emitido ${joinMoney(ledger.invoiced)}`}
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
            Nueva factura
          </Button>
        }
      />
      <DataTable
        className="mt-[18px]"
        caption="Facturas"
        rows={rows}
        getRowId={(i) => i.id}
        minWidth={1180}
        columns={invoiceColumns(ws)}
        empty={<EmptyState icon={ReceiptText} title="No hay facturas que coincidan" description="Ajustá la búsqueda o los filtros." />}
      />
      <NewInvoiceModal open={creating} onClose={() => setCreating(false)} workspace={ws} />
    </Card>
  )
}

function ReceivablesView({ workspace: ws, currency, q = '', client, status, due }: ViewProps & { client: string; status: string; due: string }) {
  const [recording, setRecording] = useState(false)
  const [receiptId, setReceiptId] = useState<string>()
  const rows = receivableRows(ws.dataset, DEMO_TODAY).filter((r) => {
    const i = r.invoice
    if (currency && r.currency !== currency) return false
    if (client && i.clientId !== client) return false
    if (status ? r.status !== status : r.status === 'cancelled' || r.status === 'reconciled') return false
    if (due === 'overdue' && r.daysToDue >= 0) return false
    if (due === '7' && (r.daysToDue < 0 || r.daysToDue > 7)) return false
    if (due === '30' && (r.daysToDue < 0 || r.daysToDue > 30)) return false
    return invoiceMatches(ws, q)(i)
  })
  const pending: MoneyByCurrency = {}
  for (const r of rows) if (r.status !== 'cancelled') pending[r.currency] = addMoney(pending[r.currency] ?? 0, r.outstanding)
  const credits = ws.receipts.filter((r) => receiptUnallocated(r) > 0 && (!currency || r.currency === currency) && (!client || r.clientId === client))
  return (
    <>
      <AgingStrip workspace={ws} currency={currency} />
      <Card aria-labelledby="fin-receivables" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="fin-receivables"
          title="Cobranzas · pendientes de cobro"
          description={`Solo facturas con emisión registrada. Saldo = facturado − cobros − retenciones documentadas. Pendiente: ${joinMoney(pending)}`}
          action={
            <Button size="sm" onClick={() => setRecording(true)}>
              <HandCoins aria-hidden className="size-[15px]" strokeWidth={2} />
              Registrar cobro
            </Button>
          }
        />
        <DataTable
          className="mt-[18px]"
          caption="Cuentas por cobrar"
          rows={rows}
          getRowId={(r) => r.invoice.id}
          minWidth={1400}
          dense
          columns={receivableColumns(ws)}
          empty={<EmptyState icon={ReceiptText} title="Sin cuentas por cobrar para los filtros elegidos" description="Usá el filtro Estado para ver facturas conciliadas o anuladas." />}
        />
      </Card>
      {credits.length > 0 && (
        <Card aria-labelledby="fin-credits" className="px-[19px] pb-[19px] pt-[19px]">
          <SectionTitle id="fin-credits" title="Cobros sin aplicar" description="Saldos a favor o diferencias pendientes de conciliar. Pueden aplicarse a facturas del mismo cliente y moneda." />
          <DataTable className="mt-[18px]" caption="Cobros con saldo sin aplicar" rows={credits} getRowId={(r) => r.id} minWidth={900} columns={receiptColumns(ws, { onOpen: setReceiptId })} />
        </Card>
      )}
      <RecordReceiptModal open={recording} onClose={() => setRecording(false)} workspace={ws} clientId={client || undefined} />
      <ReceiptDetailModal receiptId={receiptId} onClose={() => setReceiptId(undefined)} workspace={ws} />
    </>
  )
}

function AgingStrip({ workspace, currency }: ViewProps) {
  const invoices = currency ? workspace.invoices.filter((i) => i.currency === currency) : workspace.invoices
  const buckets = receivablesAging(workspace, invoices)
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

function SuppliersView({ workspace: ws, currency, status, q = '' }: ViewProps & { status: string }) {
  const [dialog, setDialog] = useState<'supplier' | 'obligation' | null>(null)
  const [obligationId, setObligationId] = useState<string>()
  const [payFor, setPayFor] = useState<string>()
  const suppliers = sortSuppliersNewestFirst(ws.suppliers).filter((s) => matches(q, s.name, s.contactName, ...s.categories))
  const rows = ws.obligations
    .filter(
      (o) =>
        (!currency || o.currency === currency) &&
        (!status || ws.obligationFin.get(o.id)?.status === status) &&
        matches(q, o.reference, o.description, ws.supplierById.get(o.supplierId)?.name, o.projectId ? ws.projectById.get(o.projectId)?.code : undefined),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const ledger = summarizeLedger(ws, [], rows)
  return (
    <>
      <Card aria-labelledby="fin-suppliers" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="fin-suppliers"
          title="Proveedores"
          description={`${ws.suppliers.filter((s) => s.active).length} activos · saldo adeudado por moneda`}
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog('supplier')}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Nuevo proveedor
            </Button>
          }
        />
        <DataTable<Supplier>
          className="mt-[18px]"
          caption="Proveedores"
          rows={suppliers}
          getRowId={(s) => s.id}
          rowHref={(s) => supplierPath(s.id)}
          minWidth={900}
          dense
          columns={[
            {
              id: 'name',
              header: 'Proveedor',
              width: '30%',
              cell: (s) => (
                <span className="block min-w-0">
                  <span className={s.active ? 'block truncate font-medium' : 'block truncate font-medium text-muted'}>{s.name}</span>
                  <span className="block truncate text-[12px] text-muted">{supplierKindLabel[s.kind]}</span>
                </span>
              ),
            },
            { id: 'country', header: 'País', width: '90px', cell: (s) => s.country },
            { id: 'cur', header: 'Moneda pref.', width: '110px', cell: (s) => s.preferredCurrency },
            { id: 'owed', header: 'Saldo adeudado', className: 'tabular font-medium', cell: (s) => joinMoney(supplierBalances(ws, s.id)) },
            { id: 'active', header: 'Estado', width: '120px', cell: (s) => <StatusBadge meta={s.active ? { label: 'Activo', tone: 'success' } : { label: 'Inactivo', tone: 'neutral' }} /> },
          ]}
          empty={<EmptyState icon={Building2} title="Sin proveedores" />}
        />
      </Card>
      <Card aria-labelledby="fin-obligations" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="fin-obligations"
          title="Obligaciones con proveedores"
          description={`Pendiente de pago: ${joinMoney(ledger.payable)}`}
          action={
            <Button size="sm" onClick={() => setDialog('obligation')}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Registrar obligación
            </Button>
          }
        />
        <DataTable
          className="mt-[18px]"
          caption="Cuentas a pagar"
          rows={rows}
          getRowId={(o) => o.id}
          minWidth={1180}
          columns={obligationColumns(ws, { onOpen: setObligationId })}
          empty={<EmptyState icon={Truck} title="No hay obligaciones que coincidan" description="Ajustá la búsqueda o los filtros." />}
        />
      </Card>
      <SupplierFormModal open={dialog === 'supplier'} onClose={() => setDialog(null)} />
      <ObligationModal open={dialog === 'obligation'} onClose={() => setDialog(null)} workspace={ws} />
      <ObligationDetailModal obligationId={obligationId} onClose={() => setObligationId(undefined)} workspace={ws} onPay={(id) => { setObligationId(undefined); setPayFor(id) }} />
      <SupplierPaymentModal open={Boolean(payFor)} onClose={() => setPayFor(undefined)} workspace={ws} obligationId={payFor} />
    </>
  )
}

function PaymentsView({ workspace: ws, currency, direction, q = '' }: ViewProps & { direction: string }) {
  const [dialog, setDialog] = useState<'receipt' | 'payment' | null>(null)
  const [receiptId, setReceiptId] = useState<string>()
  const [paymentId, setPaymentId] = useState<string>()
  const receipts = ws.receipts
    .filter((r) => (!currency || r.currency === currency) && matches(q, r.number, r.reference, ws.clientById.get(r.clientId)?.name))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
  const payments = ws.supplierPayments
    .filter((p) => (!currency || p.currency === currency) && matches(q, p.number, p.reference, ws.supplierById.get(p.supplierId)?.name))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
  return (
    <>
      {direction !== 'outgoing' && (
        <Card aria-labelledby="fin-receipts" className="px-[19px] pb-[19px] pt-[19px]">
          <SectionTitle
            id="fin-receipts"
            title="Cobros de clientes"
            description="Dinero recibido y su aplicación a facturas. Las reversiones se conservan en el historial."
            action={
              <Button size="sm" onClick={() => setDialog('receipt')}>
                <HandCoins aria-hidden className="size-[15px]" strokeWidth={2} />
                Registrar cobro
              </Button>
            }
          />
          <DataTable
            className="mt-[18px]"
            caption="Cobros"
            rows={receipts}
            getRowId={(r) => r.id}
            minWidth={980}
            columns={receiptColumns(ws, { onOpen: setReceiptId })}
            empty={<EmptyState icon={ArrowLeftRight} title="Sin cobros" description="No hay cobros para los filtros elegidos." />}
          />
        </Card>
      )}
      {direction !== 'incoming' && (
        <Card aria-labelledby="fin-spayments" className="px-[19px] pb-[19px] pt-[19px]">
          <SectionTitle
            id="fin-spayments"
            title="Pagos a proveedores"
            description="Pagos totales o parciales aplicados a obligaciones aprobadas. Los anticipos quedan como saldo a favor."
            action={
              <Button size="sm" onClick={() => setDialog('payment')}>
                <Wallet aria-hidden className="size-[15px]" strokeWidth={2} />
                Registrar pago
              </Button>
            }
          />
          <DataTable
            className="mt-[18px]"
            caption="Pagos a proveedores"
            rows={payments}
            getRowId={(p) => p.id}
            minWidth={980}
            columns={supplierPaymentColumns(ws, { onOpen: setPaymentId })}
            empty={<EmptyState icon={ArrowLeftRight} title="Sin pagos" description="No hay pagos para los filtros elegidos." />}
          />
        </Card>
      )}
      <RecordReceiptModal open={dialog === 'receipt'} onClose={() => setDialog(null)} workspace={ws} />
      <SupplierPaymentModal open={dialog === 'payment'} onClose={() => setDialog(null)} workspace={ws} />
      <ReceiptDetailModal receiptId={receiptId} onClose={() => setReceiptId(undefined)} workspace={ws} />
      <SupplierPaymentDetailModal paymentId={paymentId} onClose={() => setPaymentId(undefined)} workspace={ws} />
    </>
  )
}

function CostsView({ workspace: ws, currency, scope, q = '' }: ViewProps & { scope: string }) {
  const actions = useActions()
  const { notify } = useToast()
  const [adding, setAdding] = useState<'project' | 'company' | null>(null)
  const [voiding, setVoiding] = useState<string>()
  const rows = ws.costs
    .filter(
      (c) =>
        (!currency || c.currency === currency) &&
        (!scope || c.scope === scope) &&
        matches(q, c.description, c.projectId ? ws.projectById.get(c.projectId)?.code : undefined, c.supplierId ? ws.supplierById.get(c.supplierId)?.name : undefined),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
  const total = (s: 'project' | 'company') => {
    const m: MoneyByCurrency = {}
    for (const c of rows) if (c.scope === s && c.status === 'incurred') m[c.currency] = addMoney(m[c.currency] ?? 0, c.amount)
    return m
  }
  return (
    <>
      <Card aria-label="Totales de costos" className="grid gap-[14px] p-[18px] sm:grid-cols-2">
        {(['project', 'company'] as const).map((s) => (
          <div key={s} className="rounded-tile bg-surface-muted p-[16px]">
            <p className="text-[14px] text-ink-secondary">{s === 'project' ? 'Costos reales de proyectos' : 'Gastos generales de la empresa'}</p>
            <p className="tabular mt-[12px] text-[18px] font-semibold tracking-[-0.01em]">{joinMoney(total(s))}</p>
          </div>
        ))}
      </Card>
      <Card aria-labelledby="fin-costs" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="fin-costs"
          title="Costos y gastos registrados"
          description="Costos reales (no estimaciones). Los gastos generales no se imputan a proyectos."
          action={
            <div className="flex flex-wrap gap-[8px]">
              <Button size="sm" variant="outline" onClick={() => setAdding('company')}>
                <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
                Gasto general
              </Button>
              <Button size="sm" onClick={() => setAdding('project')}>
                <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
                Costo de proyecto
              </Button>
            </div>
          }
        />
        <DataTable
          className="mt-[18px]"
          caption="Costos y gastos"
          rows={rows}
          getRowId={(c) => c.id}
          minWidth={1080}
          columns={costColumns(ws, { onVoid: setVoiding })}
          empty={<EmptyState title="Sin costos para los filtros elegidos" />}
        />
      </Card>
      <CostModal open={adding !== null} onClose={() => setAdding(null)} workspace={ws} scope={adding ?? 'project'} />
      <ConfirmDialog
        open={Boolean(voiding)}
        onClose={() => setVoiding(undefined)}
        title="Anular costo"
        tone="danger"
        confirmLabel="Anular"
        reasonLabel="Motivo"
        message="El registro se conserva como anulado y deja de computar en resultados."
        onConfirm={async (reason) => {
          await actions.voidCost(voiding!, reason)
          notify({ title: 'Costo anulado' })
        }}
      />
    </>
  )
}

interface ResultRow extends CurrencyResult {
  key: string
  project: Project
}

function ResultsView({ workspace: ws, currency, q = '' }: ViewProps) {
  const rows: ResultRow[] = ws.projects
    .filter((p) => matches(q, p.code, ws.clientById.get(p.clientId)?.name, ws.personById.get(p.beneficiaryId)?.name))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .flatMap((p) => projectResults(ws.dataset, p, DEMO_TODAY).map((r) => ({ ...r, key: `${p.id}:${r.currency}`, project: p })))
    .filter((r) => !currency || r.currency === currency)
  const m = (r: ResultRow, v: number) => formatMoney(v, r.currency)
  return (
    <Card aria-labelledby="fin-results" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="fin-results"
        title="Resultados por proyecto"
        description={`Una fila por proyecto y moneda. Margen operativo = facturado neto − costo real directo, antes de impuestos y gastos generales. Si faltan bases se indica "${INSUFFICIENT}".`}
      />
      <DataTable<ResultRow>
        className="mt-[18px]"
        caption="Resultados por proyecto y moneda"
        rows={rows}
        getRowId={(r) => r.key}
        rowHref={(r) => `${projectPath(r.project.id)}?tab=finanzas`}
        minWidth={1440}
        dense
        columns={[
          {
            id: 'project',
            header: 'Proyecto',
            width: '150px',
            cell: (r) => (
              <span className="block min-w-0">
                <span className="tabular block font-medium">{r.project.code}</span>
                <Link to={clientPath(r.project.clientId)} className="block truncate text-[12px] text-muted hover:underline">
                  {ws.clientById.get(r.project.clientId)?.name}
                </Link>
              </span>
            ),
          },
          {
            id: 'cur',
            header: 'Moneda',
            width: '84px',
            cell: (r) => (
              <span className="flex items-center gap-[6px]">
                <CurrencyFlag currency={r.currency} className="size-[16px]" />
                {r.currency}
              </span>
            ),
          },
          { id: 'agreed', header: 'Acordado', className: 'tabular', cell: (r) => m(r, r.agreed) },
          { id: 'inv', header: 'Facturado neto', className: 'tabular', cell: (r) => m(r, r.invoicedNet) },
          { id: 'col', header: 'Cobrado', className: 'tabular text-success', cell: (r) => m(r, r.collected) },
          { id: 'rec', header: 'Por cobrar', className: 'tabular', cell: (r) => m(r, r.receivable) },
          { id: 'est', header: 'Costo est.', className: 'tabular text-ink-secondary', cell: (r) => m(r, r.estimatedCost) },
          { id: 'act', header: 'Costo real', className: 'tabular', cell: (r) => m(r, r.actualCost) },
          { id: 'unpaid', header: 'Impago prov.', className: 'tabular', cell: (r) => m(r, r.supplierUnpaid) },
          { id: 'op', header: 'Margen operativo', width: '190px', cell: (r) => <MarginValue margin={r.operationalMargin} currency={r.currency} /> },
        ]}
        empty={<EmptyState title="Sin proyectos para los filtros elegidos" />}
      />
    </Card>
  )
}

function CertificatesView({ workspace: ws, client, status, q = '' }: { workspace: Workspace; client: string; status: string; q?: string }) {
  const rows = ws.certificates
    .filter((c) => (!client || c.clientId === client) && (!status || c.status === status) && matches(q, c.number, c.externalNumber, ws.projectById.get(c.projectId)?.code, ws.clientById.get(c.clientId)?.name))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <Card aria-labelledby="fin-certs" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle id="fin-certs" title="Certificados" description="Certificados registrados por proyecto: cliente → OC → proyecto → ítems → certificado → factura. Se generan en el portal del cliente; SIGR registra el flujo." />
      <DataTable className="mt-[18px]" caption="Certificados" rows={rows} getRowId={(c) => c.id} minWidth={1120} columns={certificateColumns(ws)} empty={<EmptyState title="Sin certificados para los filtros elegidos" />} />
    </Card>
  )
}
