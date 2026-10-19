import { Pencil, Plus, Power, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Fact } from '@/components/ui/Fact'
import { CurrencyFlag } from '@/components/ui/Flag'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { countryNames } from '@/config/catalogs'
import { paymentConditionLabel, supplierKindLabel } from '@/config/finance'
import { projectPath, ROUTES } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { supplierAdvance } from '@/domain/finance/derive'
import { addMoney, subMoney } from '@/domain/finance/money'
import { agreementUsage } from '@/domain/finance/suppliers'
import type { SupplierInput } from '@/domain/finance/suppliers'
import { obligationColumns, supplierPaymentColumns } from '@/features/finance/components/ledgerColumns'
import { ObligationDetailModal, SupplierPaymentDetailModal, SupplierPaymentModal } from '@/features/finance/modals/PaymentModals'
import { AgreementModal, ObligationModal, SupplierFormModal } from '@/features/finance/modals/SupplierModals'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import { staggerVariants } from '@/lib/motion'
import type { CountryCode, CurrencyCode, ServiceTypeId, Supplier, SupplierAgreement } from '@/types/domain'

export function SupplierPage() {
  const { supplierId = '' } = useParams()
  const { workspace, loading } = useWorkspace()
  if (loading || !workspace) {
    return (
      <div className="pt-[5px]" aria-busy="true" aria-label="Cargando proveedor">
        <Skeleton className="h-[34px] w-[260px] rounded-full" />
        <Skeleton className="mt-[16px] h-[44px] w-[380px] max-w-full" />
        <Skeleton className="mt-[28px] h-[420px] rounded-card" />
      </div>
    )
  }
  const supplier = workspace.supplierById.get(supplierId)
  if (!supplier) return <NotFoundPage title="Proveedor no encontrado" />
  return <SupplierView key={supplier.id} supplier={supplier} workspace={workspace} />
}

interface Balance {
  currency: CurrencyCode
  obligations: number
  paid: number
  outstanding: number
  advance: number
}

function balances(ws: Workspace, supplierId: string): Balance[] {
  return CURRENCY_ORDER.map((currency) => {
    const b: Balance = { currency, obligations: 0, paid: 0, outstanding: 0, advance: supplierAdvance(ws.dataset, supplierId, currency) }
    for (const o of ws.obligations) {
      if (o.supplierId !== supplierId || o.currency !== currency || o.lifecycle === 'cancelled') continue
      const f = ws.obligationFin.get(o.id)!
      b.obligations = addMoney(b.obligations, o.amount)
      b.paid = addMoney(b.paid, f.paid)
      b.outstanding = addMoney(b.outstanding, f.outstanding)
    }
    return b
  }).filter((b) => b.obligations > 0 || b.advance > 0)
}

const toInput = (s: Supplier): SupplierInput => ({
  name: s.name,
  kind: s.kind,
  country: s.country,
  contactName: s.contactName,
  email: s.email,
  phone: s.phone,
  preferredCurrency: s.preferredCurrency,
  categories: s.categories,
  paymentDetails: s.paymentDetails,
  defaultPaymentCondition: s.defaultPaymentCondition,
  active: s.active,
  notes: s.notes,
})

function SupplierView({ supplier: s, workspace: ws }: { supplier: Supplier; workspace: Workspace }) {
  const actions = useActions()
  const { run, busy } = useCommand()
  const [dialog, setDialog] = useState<'edit' | 'agreement' | 'obligation' | 'payment' | null>(null)
  const [obligationId, setObligationId] = useState<string>()
  const [paymentId, setPaymentId] = useState<string>()
  const [payFor, setPayFor] = useState<string>()
  const obligations = ws.obligations.filter((o) => o.supplierId === s.id).sort((a, b) => b.issueDate.localeCompare(a.issueDate))
  const payments = ws.supplierPayments.filter((p) => p.supplierId === s.id).sort((a, b) => b.date.localeCompare(a.date))
  const agreements = ws.agreements.filter((a) => a.supplierId === s.id)
  const bal = balances(ws, s.id)
  const close = () => setDialog(null)

  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-[10px]">
            <BackLink to={ROUTES.suppliers} label="Proveedores" />
            <StatusBadge variant="soft" meta={s.active ? { label: 'Activo', tone: 'success' } : { label: 'Inactivo', tone: 'neutral' }} />
          </div>
        }
        title={s.name}
        description={`${supplierKindLabel[s.kind]} · ${countryNames[s.country as CountryCode] ?? s.country} · moneda preferida ${s.preferredCurrency}`}
        actions={
          <>
            <Button variant="outline" disabled={busy} onClick={() => run(() => actions.updateSupplier(s.id, { ...toInput(s), active: !s.active }), { title: s.active ? 'Proveedor desactivado' : 'Proveedor activado' })}>
              <Power aria-hidden className="size-[16px]" strokeWidth={1.9} />
              {s.active ? 'Desactivar' : 'Activar'}
            </Button>
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Editar
            </Button>
            <Button onClick={() => setDialog('payment')}>
              <Wallet aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Registrar pago
            </Button>
          </>
        }
      />

      <motion.div variants={staggerVariants} initial="hidden" animate="show" className="mt-[28px] grid grid-cols-1 gap-[24px] xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-[24px] xl:col-span-2">
          <Card aria-labelledby="sup-balance" className="px-[18px] pb-[18px] pt-[19px]">
            <SectionTitle id="sup-balance" title="Saldos por moneda" description="Obligaciones, pagado y pendiente. Sin conversión entre monedas." className="px-[2px]" />
            {bal.length === 0 ? (
              <p className="mt-[14px] px-[2px] text-[14px] text-muted">Sin obligaciones registradas.</p>
            ) : (
              <div className="mt-[16px] grid gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
                {bal.map((b) => (
                  <article key={b.currency} aria-label={`Saldo en ${b.currency}`} className="rounded-tile bg-surface-muted p-[16px]">
                    <header className="flex items-center gap-[8px] text-[15px] font-semibold">
                      <CurrencyFlag currency={b.currency} className="size-[20px]" />
                      {b.currency}
                    </header>
                    <dl className="mt-[12px] flex flex-col rounded-[14px] bg-surface px-[12px] text-[13.5px]">
                      {(
                        [
                          ['Obligaciones', b.obligations],
                          ['Pagado acumulado', b.paid],
                          ['Pendiente', b.outstanding],
                          ...(b.advance > 0 ? [['Anticipo sin aplicar', b.advance]] : []),
                        ] as [string, number][]
                      ).map(([label, v], i, arr) => (
                        <div key={label} className={i < arr.length - 1 ? 'flex justify-between border-b border-line py-[9px]' : 'flex justify-between py-[9px]'}>
                          <dt className="text-ink-secondary">{label}</dt>
                          <dd className="tabular font-semibold">{formatCurrency(v, b.currency, { decimals: 2 })}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </Card>

          <Card aria-labelledby="sup-agreements" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle
              id="sup-agreements"
              title="Acuerdos por servicio"
              description="Montos pactados por trabajo. Las obligaciones registradas consumen el acuerdo; no se puede superar."
              action={
                <Button size="sm" variant="outline" onClick={() => setDialog('agreement')}>
                  <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
                  Nuevo acuerdo
                </Button>
              }
            />
            <DataTable<SupplierAgreement>
              className="mt-[18px]"
              caption="Acuerdos con el proveedor"
              rows={agreements}
              getRowId={(a) => a.id}
              minWidth={1040}
              dense
              columns={[
                {
                  id: 'desc',
                  header: 'Acuerdo',
                  width: '30%',
                  cell: (a) => {
                    const svc = a.serviceId ? ws.serviceById.get(a.serviceId) : undefined
                    return (
                      <span className="block min-w-0">
                        <span className="block truncate font-medium">{a.description}</span>
                        <span className="block truncate text-[12px] text-muted">{svc ? getServiceType(svc.typeId).label : 'Proyecto completo'}</span>
                      </span>
                    )
                  },
                },
                {
                  id: 'project',
                  header: 'Proyecto',
                  width: '130px',
                  cell: (a) => (
                    <Link to={`${projectPath(a.projectId)}?tab=finanzas`} className="tabular underline-offset-4 hover:underline">
                      {ws.projectById.get(a.projectId)?.code}
                    </Link>
                  ),
                },
                { id: 'agreed', header: 'Acordado', className: 'tabular font-medium', cell: (a) => formatCurrency(a.agreedAmount, a.currency, { decimals: 2 }) },
                { id: 'used', header: 'Obligado', className: 'tabular', cell: (a) => formatCurrency(agreementUsage(ws.dataset, a.id), a.currency, { decimals: 2 }) },
                { id: 'left', header: 'Disponible', className: 'tabular text-ink-secondary', cell: (a) => formatCurrency(subMoney(a.agreedAmount, agreementUsage(ws.dataset, a.id)), a.currency, { decimals: 2 }) },
                { id: 'cond', header: 'Condición', width: '19%', cell: (a) => <span className="block whitespace-normal text-[13px] text-ink-secondary">{paymentConditionLabel[a.paymentCondition]}</span> },
              ]}
              empty={<EmptyState title="Sin acuerdos" description="Registrá el monto pactado por cada servicio." />}
            />
          </Card>

          <Card aria-labelledby="sup-obligations" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle
              id="sup-obligations"
              title="Facturas y obligaciones"
              description="Comprobantes del proveedor, con fechas, estado y saldo"
              action={
                <Button size="sm" variant="outline" onClick={() => setDialog('obligation')}>
                  <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
                  Registrar obligación
                </Button>
              }
            />
            <DataTable
              className="mt-[18px]"
              caption="Obligaciones del proveedor"
              rows={obligations}
              getRowId={(o) => o.id}
              minWidth={1000}
              columns={obligationColumns(ws, { withSupplier: false, onOpen: setObligationId })}
              empty={<EmptyState title="Sin obligaciones" />}
            />
          </Card>

          <Card aria-labelledby="sup-payments" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="sup-payments" title="Pagos" description="Historial completo, incluidas las reversiones." />
            <DataTable
              className="mt-[18px]"
              caption="Pagos al proveedor"
              rows={payments}
              getRowId={(p) => p.id}
              minWidth={1100}
              columns={supplierPaymentColumns(ws, { onOpen: setPaymentId })}
              empty={<EmptyState icon={Wallet} title="Sin pagos" />}
            />
          </Card>
        </div>

        <div className="flex flex-col gap-[24px]">
          <Card aria-labelledby="sup-data" className="px-[20px] pb-[20px] pt-[20px]">
            <SectionTitle id="sup-data" size="sm" title="Datos del proveedor" />
            <dl className="mt-[14px] grid grid-cols-2 gap-x-4 gap-y-[14px]">
              <Fact label="Contacto">{s.contactName ?? '—'}</Fact>
              <Fact label="Teléfono">{s.phone ?? '—'}</Fact>
              <Fact label="Email" className="col-span-2">
                <span className="truncate">{s.email ?? '—'}</span>
              </Fact>
              <Fact label="Condición de pago" className="col-span-2">
                {paymentConditionLabel[s.defaultPaymentCondition]}
              </Fact>
              <Fact label="Datos de pago" className="col-span-2">
                <span className="whitespace-normal font-normal text-ink-secondary">{s.paymentDetails || 'Sin cargar (placeholder de demo)'}</span>
              </Fact>
              {s.notes && (
                <Fact label="Notas" className="col-span-2">
                  <span className="whitespace-normal font-normal">{s.notes}</span>
                </Fact>
              )}
            </dl>
            {s.categories.length > 0 && (
              <div className="mt-[16px] flex flex-wrap gap-[6px]">
                {s.categories.map((c) => (
                  <span key={c} className="flex items-center gap-[6px] rounded-full bg-surface-muted py-[3px] pl-[4px] pr-[10px] text-[12.5px]">
                    <ServiceChip type={c as ServiceTypeId} />
                    {getServiceType(c as ServiceTypeId).label}
                  </span>
                ))}
              </div>
            )}
          </Card>
          {s.kind === 'professional' && (
            <Card className="px-[20px] pb-[18px] pt-[18px] text-[13px] leading-[1.5] text-ink-secondary">
              Profesional independiente que factura a la empresa. Sus pagos son pagos a proveedor: no son distribuciones societarias ni participación en ganancias.
            </Card>
          )}
        </div>
      </motion.div>

      <SupplierFormModal open={dialog === 'edit'} onClose={close} supplier={s} />
      <AgreementModal supplier={dialog === 'agreement' ? s : undefined} onClose={close} workspace={ws} />
      <ObligationModal open={dialog === 'obligation'} onClose={close} workspace={ws} supplierId={s.id} />
      <SupplierPaymentModal open={dialog === 'payment'} onClose={close} workspace={ws} supplierId={s.id} />
      <SupplierPaymentModal open={Boolean(payFor)} onClose={() => setPayFor(undefined)} workspace={ws} supplierId={s.id} obligationId={payFor} />
      <SupplierPaymentDetailModal paymentId={paymentId} onClose={() => setPaymentId(undefined)} workspace={ws} />
      <ObligationDetailModal
        obligationId={obligationId}
        onClose={() => setObligationId(undefined)}
        workspace={ws}
        onPay={(id) => {
          setObligationId(undefined)
          setPayFor(id)
        }}
      />
    </div>
  )
}
