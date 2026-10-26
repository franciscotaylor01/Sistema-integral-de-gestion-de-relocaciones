import { BriefcaseBusiness, FileText, Mail, Pencil, Phone, ReceiptText, Users, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { BackLink } from '@/components/ui/BackLink'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Fact } from '@/components/ui/Fact'
import { CurrencyFlag, Flag } from '@/components/ui/Flag'
import { MetaBadge } from '@/components/ui/MetaBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { clientStatusMeta, countryNames } from '@/config/catalogs'
import { billingMilestoneLabel } from '@/config/commercial'
import { projectPath, purchaseOrderPath, quotationPath, ROUTES } from '@/config/navigation'
import { purchaseOrderColumns, quotationColumns } from '@/features/commercial/columns'
import { PriceEntriesPanel } from '@/features/pricing/PriceEntriesPanel'
import { TariffGrid } from '@/features/pricing/TariffGrid'
import { TariffSharing } from '@/features/pricing/TariffSharing'
import { CatalogPanel, OfferedServicesCard, OpenOrdersPanel } from '@/features/catalog/CatalogPanels'
import { ClientFormModal } from './components/ClientFormModal'
import { invoiceColumns } from '@/features/finance/components/ledgerColumns'
import { outstandingOf, summarizeLedger } from '@/features/finance/selectors'
import { projectColumns } from '@/features/projects/components/projectColumns'
import { isActiveProject } from '@/features/projects/selectors'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useWorkspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { currencyEntries } from '@/lib/money'
import { cardVariants, staggerVariants } from '@/lib/motion'

const TABS = ['empresa', 'contactos', 'proyectos', 'tarifario', 'oc-abiertas', 'comercial', 'facturas', 'saldos'] as const
type ClientTab = (typeof TABS)[number]
const isTab = (v: string | null): v is ClientTab => TABS.includes(v as ClientTab)

export function ClientDetailPage() {
  const { clientId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { workspace, loading } = useWorkspace()
  const tabParam = params.get('tab')
  const tab: ClientTab = isTab(tabParam) ? tabParam : 'empresa'
  const [editing, setEditing] = useState(false)

  const data = useMemo(() => {
    const client = workspace?.clientById.get(clientId)
    if (!workspace || !client) return undefined
    const projects = workspace.projects.filter((p) => p.clientId === client.id).sort((a, b) => b.startDate.localeCompare(a.startDate))
    const invoices = workspace.invoices.filter((i) => i.clientId === client.id).sort((a, b) => b.issueDate.localeCompare(a.issueDate))
    return { client, projects, invoices, ledger: summarizeLedger(workspace, invoices, []) }
  }, [workspace, clientId])

  if (loading) {
    return (
      <div className="pt-[5px]" aria-busy="true" aria-label="Cargando cliente">
        <Skeleton className="h-[34px] w-[220px] rounded-full" />
        <Skeleton className="mt-[16px] h-[44px] w-[320px] max-w-full" />
        <Skeleton className="mt-[28px] h-[54px] w-[600px] max-w-full rounded-full" />
        <Skeleton className="mt-[20px] h-[280px] w-full rounded-card" />
      </div>
    )
  }
  if (!workspace || !data) return <NotFoundPage title="Cliente no encontrado" description={`No existe un cliente con el identificador “${clientId}”.`} />

  const { client, projects, invoices, ledger } = data
  const manager = workspace.staffById.get(client.accountManagerId)
  const openInvoices = invoices.filter((i) => outstandingOf(workspace, i) > 0)

  const setTab = (value: ClientTab) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'empresa') next.delete('tab')
        else next.set('tab', value)
        return next
      },
      { replace: true },
    )

  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-[10px]">
            <BackLink to={ROUTES.clients} label="Clientes" />
            <StatusBadge variant="soft" meta={clientStatusMeta[client.status]} />
          </div>
        }
        title={client.name}
        description={
          <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
            <span>{client.legalName}</span>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span className="inline-flex items-center gap-[7px]">
              <Flag country={client.headquarters.country} className="size-[17px]" />
              {client.headquarters.city}, {countryNames[client.headquarters.country]}
            </span>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span>{client.industry}</span>
          </span>
        }
        actions={
          <Button onClick={() => setEditing(true)}>
            <Pencil aria-hidden className="size-[16px]" strokeWidth={1.9} />
            Editar cliente
          </Button>
        }
      />

      <motion.div variants={cardVariants} className="mt-[28px]">
        <Tabs
          label="Secciones del cliente"
          idPrefix="client-tabs"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'empresa', label: 'Empresa' },
            { value: 'contactos', label: 'Contactos', count: client.contacts.length },
            { value: 'proyectos', label: 'Proyectos', count: projects.length },
            { value: 'tarifario', label: 'Tarifario', count: workspace.priceEntries.filter((e) => e.clientId === client.id).length },
            { value: 'oc-abiertas', label: 'OC abiertas', count: workspace.openOrders.filter((o) => o.clientId === client.id).length },
            { value: 'comercial', label: 'Cotizaciones y OC', count: workspace.quotations.filter((q) => q.clientId === client.id).length + workspace.purchaseOrders.filter((p) => p.clientId === client.id).length },
            { value: 'facturas', label: 'Facturas', count: invoices.length },
            { value: 'saldos', label: 'Saldos', count: openInvoices.length },
          ]}
        />
      </motion.div>

      <div className="mt-[20px]">
        <TabPanel idPrefix="client-tabs" activeValue={tab}>
          <motion.div variants={staggerVariants} initial="hidden" animate="show" className="flex flex-col gap-[24px]">
            {tab === 'empresa' && (
              <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-3">
                <Card aria-labelledby="cl-company" className="px-[20px] pb-[20px] pt-[20px] lg:col-span-2">
                  <SectionTitle id="cl-company" title="Datos de la empresa" />
                  <dl className="mt-[18px] grid grid-cols-1 gap-x-6 gap-y-5 rounded-panel bg-surface-muted px-[16px] py-[16px] sm:grid-cols-2 xl:grid-cols-3">
                    <Fact label="Razón social">{client.legalName}</Fact>
                    <Fact label="Identificación fiscal">
                      <span className="tabular">{client.taxId}</span>
                    </Fact>
                    <Fact label="Industria">{client.industry}</Fact>
                    <Fact label="Sede">
                      {client.headquarters.city}, {countryNames[client.headquarters.country]}
                    </Fact>
                    <Fact label="Cliente desde">{formatDate(client.clientSince)}</Fact>
                    <Fact label="Ejecutivo de cuenta">{manager?.name}</Fact>
                    <Fact label="Condición de pago">{client.paymentTermsDays} días</Fact>
                    <Fact label="Moneda de facturación">
                      <span className="inline-flex items-center gap-[7px]">
                        <CurrencyFlag currency={client.billingCurrency} className="size-[16px]" />
                        {client.billingCurrency}
                      </span>
                    </Fact>
                    <Fact label="Monedas operadas">
                      <span className="inline-flex flex-wrap items-center gap-[6px]">
                        {client.currencies.map((c) => (
                          <MetaBadge key={c} className="gap-[5px]">
                            <CurrencyFlag currency={c} className="size-[12px]" />
                            {c}
                          </MetaBadge>
                        ))}
                      </span>
                    </Fact>
                    <Fact label="Dirección de facturación" className="sm:col-span-2 xl:col-span-3">
                      <span className="whitespace-normal">{client.billingAddress}</span>
                    </Fact>
                  </dl>
                  <h3 className="mt-[20px] text-[15px] font-semibold">Política comercial</h3>
                  <dl className="mt-[10px] grid grid-cols-1 gap-x-6 gap-y-4 rounded-panel bg-surface-muted px-[16px] py-[16px] sm:grid-cols-2 xl:grid-cols-4">
                    <Fact label="Orden de compra">{client.policy.requiresPurchaseOrder ? 'Obligatoria' : 'No requerida'}</Fact>
                    <Fact label="Cotización aprobada">{client.policy.requiresApprovedQuote ? 'Obligatoria' : 'No requerida'}</Fact>
                    <Fact label="Hito de facturación">
                      <span className="whitespace-normal">{billingMilestoneLabel[client.policy.billingMilestone]}</span>
                    </Fact>
                    <Fact label="Validez de cotizaciones">{client.policy.quoteValidityDays} días</Fact>
                  </dl>
                  {client.notes && (
                    <div className="mt-[16px] rounded-[14px] bg-surface-muted px-[14px] py-[11px]">
                      <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-subtle">Notas</p>
                      <p className="mt-[4px] whitespace-pre-wrap text-[14px] leading-[1.5] text-ink-secondary">{client.notes}</p>
                    </div>
                  )}
                </Card>
                <Card aria-labelledby="cl-glance" className="px-[20px] pb-[20px] pt-[20px]">
                  <SectionTitle id="cl-glance" size="sm" title="Resumen de la cuenta" />
                  <dl className="mt-[14px] flex flex-col">
                    {[
                      ['Proyectos activos', String(projects.filter(isActiveProject).length)],
                      ['Proyectos totales', String(projects.length)],
                      ['Facturas emitidas', String(invoices.filter((i) => i.lifecycle === 'issued').length)],
                      ['Facturas vencidas', String(ledger.overdueInvoices)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between border-b border-line py-[10px] text-[14px] last:border-b-0">
                        <dt className="text-ink-secondary">{label}</dt>
                        <dd className="tabular font-semibold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-[14px] text-[13px] font-medium">Saldo por cobrar</p>
                  <ul className="mt-[8px] flex flex-col gap-[6px]">
                    {currencyEntries(ledger.receivable).length === 0 ? (
                      <li className="text-[14px] text-muted">Sin saldos pendientes</li>
                    ) : (
                      currencyEntries(ledger.receivable).map(([c, v]) => (
                        <li key={c} className="flex items-center justify-between rounded-[12px] bg-surface-muted px-[12px] py-[9px] text-[14px]">
                          <span className="flex items-center gap-[8px]">
                            <CurrencyFlag currency={c} className="size-[16px]" />
                            {c}
                          </span>
                          <span className="tabular font-semibold">{formatCurrency(v, c)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </Card>
              </div>
            )}

            {tab === 'contactos' && (
              <Card aria-labelledby="cl-contacts" className="px-[20px] pb-[20px] pt-[20px]">
                <SectionTitle
                  id="cl-contacts"
                  title="Contactos"
                  description="Personas de referencia en la empresa cliente"
                  action={
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      <Pencil aria-hidden className="size-[14px]" strokeWidth={1.9} />
                      Editar contactos
                    </Button>
                  }
                />
                {client.contacts.length === 0 ? (
                  <EmptyState icon={Users} title="Sin contactos" />
                ) : (
                  <ul className="mt-[18px] grid gap-[12px] md:grid-cols-2 xl:grid-cols-3">
                    {client.contacts.map((ct) => (
                      <li key={ct.id} className="rounded-panel bg-surface-muted p-[14px]">
                        <div className="flex items-center gap-[12px]">
                          <Avatar name={ct.name} className="size-[42px] bg-surface" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold">{ct.name}</p>
                            <p className="truncate text-[13px] text-muted">{ct.role}</p>
                          </div>
                          {ct.primary && <MetaBadge className="bg-accent-soft text-accent-strong">Principal</MetaBadge>}
                        </div>
                        <div className="mt-[12px] flex flex-col gap-[6px] text-[13.5px]">
                          <a href={`mailto:${ct.email}`} className="flex items-center gap-[8px] text-ink-secondary hover:text-ink hover:underline">
                            <Mail aria-hidden className="size-[14px]" strokeWidth={1.9} />
                            {ct.email}
                          </a>
                          <a href={`tel:${ct.phone.replace(/\s/g, '')}`} className="tabular flex items-center gap-[8px] text-ink-secondary hover:text-ink hover:underline">
                            <Phone aria-hidden className="size-[14px]" strokeWidth={1.9} />
                            {ct.phone}
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === 'proyectos' && (
              <Card aria-labelledby="cl-projects" className="px-[19px] pb-[19px] pt-[19px]">
                <SectionTitle id="cl-projects" title="Proyectos del cliente" />
                <DataTable
                  className="mt-[18px]"
                  caption={`Proyectos de ${client.name}`}
                  rows={projects}
                  getRowId={(p) => p.id}
                  rowHref={(p) => projectPath(p.id)}
                  minWidth={1000}
                  columns={projectColumns(workspace, ['code', 'assignee', 'route', 'services', 'owner', 'operational', 'financial', 'start'])}
                  empty={<EmptyState icon={BriefcaseBusiness} title="Sin proyectos" description="Este cliente todavía no tiene relocaciones." />}
                />
              </Card>
            )}

            {tab === 'tarifario' && (
              <>
                <TariffGrid workspace={workspace} client={client} />
                <TariffSharing workspace={workspace} client={client} />
                <OfferedServicesCard key={(client.offeredServices ?? []).join()} workspace={workspace} client={client} />
                <PriceEntriesPanel workspace={workspace} client={client} />
                <CatalogPanel workspace={workspace} client={client} />
              </>
            )}
            {tab === 'oc-abiertas' && <OpenOrdersPanel workspace={workspace} client={client} />}

            {tab === 'comercial' && (
              <>
                <Card aria-labelledby="cl-quotes" className="px-[19px] pb-[19px] pt-[19px]">
                  <SectionTitle id="cl-quotes" title="Cotizaciones" description="Todas las versiones emitidas para los proyectos del cliente" />
                  <DataTable
                    className="mt-[18px]"
                    caption={`Cotizaciones de ${client.name}`}
                    rows={workspace.quotations.filter((q) => q.clientId === client.id).sort((a, b) => b.issueDate.localeCompare(a.issueDate))}
                    getRowId={(q) => q.id}
                    rowHref={(q) => quotationPath(q.id)}
                    minWidth={900}
                    columns={quotationColumns(workspace, { withClient: false })}
                    empty={<EmptyState icon={FileText} title="Sin cotizaciones" />}
                  />
                </Card>
                <Card aria-labelledby="cl-pos" className="px-[19px] pb-[19px] pt-[19px]">
                  <SectionTitle
                    id="cl-pos"
                    title="Órdenes de compra"
                    description={client.policy.requiresPurchaseOrder ? 'Este cliente exige OC antes de facturar.' : 'Este cliente no exige OC para facturar.'}
                  />
                  <DataTable
                    className="mt-[18px]"
                    caption={`Órdenes de compra de ${client.name}`}
                    rows={workspace.purchaseOrders.filter((p) => p.clientId === client.id).sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))}
                    getRowId={(p) => p.id}
                    rowHref={(p) => purchaseOrderPath(p.id)}
                    minWidth={1000}
                    columns={purchaseOrderColumns(workspace, { withClient: false })}
                    empty={<EmptyState icon={FileText} title="Sin órdenes de compra" />}
                  />
                </Card>
              </>
            )}

            {tab === 'facturas' && (
              <Card aria-labelledby="cl-invoices" className="px-[19px] pb-[19px] pt-[19px]">
                <SectionTitle id="cl-invoices" title="Facturas" description="Comprobantes emitidos al cliente" />
                <DataTable
                  className="mt-[18px]"
                  caption={`Facturas de ${client.name}`}
                  rows={invoices}
                  getRowId={(i) => i.id}
                  minWidth={960}
                  columns={invoiceColumns(workspace, { withClient: false })}
                  empty={<EmptyState icon={ReceiptText} title="Sin facturas" />}
                />
              </Card>
            )}

            {tab === 'saldos' && (
              <>
                <Card aria-label="Saldos por moneda" className="grid gap-[14px] p-[18px] sm:grid-cols-2 xl:grid-cols-4">
                  {currencyEntries(ledger.invoiced).map(([c, v]) => {
                    const receivable = ledger.receivable[c] ?? 0
                    const overdue = ledger.overdueReceivable[c] ?? 0
                    return (
                      <div key={c} className="rounded-tile bg-surface-muted p-[16px]">
                        <p className="flex items-center gap-[8px] text-[14px] font-semibold">
                          <CurrencyFlag currency={c} className="size-[18px]" /> {c}
                        </p>
                        <p className="tabular mt-[14px] text-[24px] font-semibold tracking-[-0.02em]">{formatCurrency(receivable, c)}</p>
                        <p className="mt-[2px] text-[13px] text-muted">por cobrar de {formatCurrency(v, c)} facturados</p>
                        <p className={cn('mt-[10px] text-[12.5px] font-medium', overdue ? 'text-danger' : 'text-success')}>
                          {overdue ? `${formatCurrency(overdue, c)} vencido` : 'Sin deuda vencida'}
                        </p>
                      </div>
                    )
                  })}
                  {currencyEntries(ledger.invoiced).length === 0 && (
                    <EmptyState icon={Wallet} title="Sin movimientos" className="sm:col-span-2 xl:col-span-4" />
                  )}
                </Card>
                <Card aria-labelledby="cl-open" className="px-[19px] pb-[19px] pt-[19px]">
                  <SectionTitle id="cl-open" title="Facturas pendientes de cobro" />
                  <DataTable
                    className="mt-[18px]"
                    caption="Facturas abiertas"
                    rows={openInvoices}
                    getRowId={(i) => i.id}
                    minWidth={960}
                    columns={invoiceColumns(workspace, { withClient: false })}
                    empty={<EmptyState icon={Wallet} title="Cuenta al día" description="No hay saldos pendientes." />}
                  />
                </Card>
              </>
            )}
          </motion.div>
        </TabPanel>
      </div>
      <ClientFormModal open={editing} onClose={() => setEditing(false)} workspace={workspace} client={client} />
    </div>
  )
}
