import { HandCoins, Plus, ReceiptText, Truck, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { DEMO_TODAY } from '@/config/brand'
import { getServiceType } from '@/config/serviceCatalog'
import { projectResults } from '@/domain/finance/results'
import { costColumns, invoiceColumns, obligationColumns, receiptColumns, supplierPaymentColumns } from '@/features/finance/components/ledgerColumns'
import { CurrencyResultCard, INSUFFICIENT } from '@/features/finance/components/ResultBlocks'
import { NewInvoiceModal } from '@/features/finance/modals/NewInvoiceModal'
import { ObligationDetailModal, SupplierPaymentDetailModal, SupplierPaymentModal } from '@/features/finance/modals/PaymentModals'
import { ReceiptDetailModal, RecordReceiptModal } from '@/features/finance/modals/ReceiptModals'
import { CostModal, ObligationModal } from '@/features/finance/modals/SupplierModals'
import { useActions } from '@/hooks/useActions'
import { formatCurrency, formatPercent } from '@/lib/format'
import type { ProjectService } from '@/types/domain'
import type { ProjectContext } from '../projectContext'
import { projectBudget, projectEstimatedCost } from '../selectors'
import { CommercialSection } from './CommercialSection'

type Dialog = 'invoice' | 'receipt' | 'cost' | 'obligation' | 'payment'

export function FinanceTab({ ctx }: { ctx: ProjectContext }) {
  const { project, workspace: ws } = ctx
  const actions = useActions()
  const { notify } = useToast()
  const cur = project.currency
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [receiptId, setReceiptId] = useState<string>()
  const [paymentId, setPaymentId] = useState<string>()
  const [obligationId, setObligationId] = useState<string>()
  const [payFor, setPayFor] = useState<string>()
  const [voiding, setVoiding] = useState<string>()

  const results = useMemo(() => projectResults(ws.dataset, project, DEMO_TODAY), [ws.dataset, project])
  const invoiceIds = new Set(ctx.invoices.map((i) => i.id))
  const obligationIds = new Set(ctx.obligations.map((o) => o.id))
  const receipts = ws.receipts.filter((r) => r.allocations.some((a) => invoiceIds.has(a.invoiceId))).sort((a, b) => b.date.localeCompare(a.date))
  const payments = ws.supplierPayments.filter((p) => p.allocations.some((a) => obligationIds.has(a.obligationId))).sort((a, b) => b.date.localeCompare(a.date))
  const costs = ws.costs.filter((c) => c.projectId === project.id).sort((a, b) => b.date.localeCompare(a.date))
  const invoices = [...ctx.invoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate))
  const budget = projectBudget(project)
  const estCost = projectEstimatedCost(project)
  const close = () => setDialog(null)

  return (
    <div className="flex flex-col gap-[24px]">
      <CommercialSection ctx={ctx} />

      <Card aria-labelledby="pf-results" className="px-[18px] pb-[18px] pt-[19px]">
        <SectionTitle id="pf-results" title="Resultado del proyecto" description="Acordado, facturado, cobrado, costos y pagos. Cada moneda por separado, sin conversión." className="px-[2px]" />
        {results.length === 0 ? (
          <p className="mt-[16px] px-[2px] text-[14px] text-muted">{INSUFFICIENT}: el proyecto todavía no tiene importes acordados, facturas ni costos.</p>
        ) : (
          <div className="mt-[18px] grid gap-[14px] md:grid-cols-2 xl:grid-cols-3">
            {results.map((r) => (
              <CurrencyResultCard key={r.currency} result={r} />
            ))}
          </div>
        )}
      </Card>

      <Card aria-labelledby="pf-invoices" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="pf-invoices"
          title="Facturas al cliente"
          description={`${ctx.invoices.length} comprobantes del proyecto`}
          action={
            <Button size="sm" onClick={() => setDialog('invoice')}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Nueva factura
            </Button>
          }
        />
        <DataTable
          className="mt-[18px]"
          caption="Facturas del proyecto"
          rows={invoices}
          getRowId={(i) => i.id}
          minWidth={980}
          columns={invoiceColumns(ws, { withClient: false, withProject: false })}
          empty={<EmptyState icon={ReceiptText} title="Sin facturas" description="Este proyecto todavía no fue facturado." />}
        />
      </Card>

      <Card aria-labelledby="pf-receipts" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="pf-receipts"
          title="Cobros"
          description="Cobros aplicados a facturas de este proyecto"
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog('receipt')}>
              <HandCoins aria-hidden className="size-[15px]" strokeWidth={2} />
              Registrar cobro
            </Button>
          }
        />
        <DataTable
          className="mt-[18px]"
          caption="Cobros del proyecto"
          rows={receipts}
          getRowId={(r) => r.id}
          minWidth={900}
          columns={receiptColumns(ws, { onOpen: setReceiptId })}
          empty={<EmptyState icon={HandCoins} title="Sin cobros" description="Todavía no se registraron cobros." />}
        />
      </Card>

      <Card aria-labelledby="pf-costs" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="pf-costs"
          title="Costos reales"
          description="Costos incurridos imputados al proyecto. Las obligaciones con proveedores generan su costo automáticamente."
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog('cost')}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Registrar costo
            </Button>
          }
        />
        <DataTable
          className="mt-[18px]"
          caption="Costos del proyecto"
          rows={costs}
          getRowId={(c) => c.id}
          minWidth={900}
          columns={costColumns(ws, { withProject: false, onVoid: setVoiding })}
          empty={<EmptyState title="Sin costos registrados" />}
        />
      </Card>

      <Card aria-labelledby="pf-obligations" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="pf-obligations"
          title="Obligaciones con proveedores"
          description="Comprobantes de proveedores imputados al proyecto"
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog('obligation')}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Registrar obligación
            </Button>
          }
        />
        <DataTable
          className="mt-[18px]"
          caption="Cuentas a pagar del proyecto"
          rows={ctx.obligations}
          getRowId={(o) => o.id}
          minWidth={1080}
          columns={obligationColumns(ws, { withProject: false, onOpen: setObligationId })}
          empty={<EmptyState icon={Truck} title="Sin obligaciones registradas" description="Aún no hay comprobantes de proveedores." />}
        />
      </Card>

      <Card aria-labelledby="pf-payments" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="pf-payments"
          title="Pagos a proveedores"
          description="Pagos aplicados a obligaciones de este proyecto"
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog('payment')}>
              <Wallet aria-hidden className="size-[15px]" strokeWidth={2} />
              Registrar pago
            </Button>
          }
        />
        <DataTable
          className="mt-[18px]"
          caption="Pagos del proyecto"
          rows={payments}
          getRowId={(p) => p.id}
          minWidth={900}
          columns={supplierPaymentColumns(ws, { onOpen: setPaymentId })}
          empty={<EmptyState icon={Wallet} title="Sin pagos" />}
        />
      </Card>

      <Card aria-labelledby="pf-breakdown" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle id="pf-breakdown" title="Estimación por servicio" description="Precio acordado contra costo estimado de planificación. No es un resultado real." />
        <DataTable<ProjectService>
          className="mt-[18px]"
          caption="Estimación por servicio"
          rows={project.services}
          getRowId={(s) => s.id}
          minWidth={640}
          dense
          columns={[
            {
              id: 'service',
              header: 'Servicio',
              width: '34%',
              cell: (s) => (
                <span className="flex items-center gap-[10px]">
                  <ServiceChip type={s.type} />
                  <span className="truncate font-medium">{getServiceType(s.type).label}</span>
                </span>
              ),
            },
            { id: 'price', header: 'Precio', className: 'tabular', cell: (s) => (s.price === undefined ? <span className="text-muted">—</span> : formatCurrency(s.price, cur)) },
            { id: 'cost', header: 'Costo estimado', className: 'tabular', cell: (s) => (s.estimatedCost === undefined ? <span className="text-muted">—</span> : formatCurrency(s.estimatedCost, cur)) },
            {
              id: 'margin',
              header: 'Margen est.',
              className: 'tabular font-medium',
              cell: (s) => (s.price === undefined || s.estimatedCost === undefined ? <span className="text-[13px] font-normal text-muted">{INSUFFICIENT}</span> : formatCurrency(s.price - s.estimatedCost, cur)),
            },
            {
              id: 'pct',
              header: '%',
              width: '90px',
              className: 'tabular text-success font-medium',
              cell: (s) => (s.price && s.estimatedCost !== undefined ? formatPercent(((s.price - s.estimatedCost) / s.price) * 100) : '—'),
            },
          ]}
        />
        <div className="mt-[12px] flex flex-wrap justify-end gap-x-6 gap-y-1 px-[6px] text-[14px]">
          <span className="text-muted">
            Total presupuesto <span className="tabular font-semibold text-ink">{formatCurrency(budget, cur)}</span>
          </span>
          <span className="text-muted">
            Margen estimado{' '}
            <span className="tabular font-semibold text-success">
              {formatCurrency(budget - estCost, cur)} ({formatPercent(budget ? ((budget - estCost) / budget) * 100 : 0)})
            </span>
          </span>
        </div>
      </Card>

      <NewInvoiceModal open={dialog === 'invoice'} onClose={close} workspace={ws} project={project} />
      <RecordReceiptModal open={dialog === 'receipt'} onClose={close} workspace={ws} clientId={project.clientId} />
      <CostModal open={dialog === 'cost'} onClose={close} workspace={ws} projectId={project.id} />
      <ObligationModal open={dialog === 'obligation'} onClose={close} workspace={ws} projectId={project.id} />
      <SupplierPaymentModal open={dialog === 'payment'} onClose={close} workspace={ws} />
      <SupplierPaymentModal open={Boolean(payFor)} onClose={() => setPayFor(undefined)} workspace={ws} obligationId={payFor} />
      <ReceiptDetailModal receiptId={receiptId} onClose={() => setReceiptId(undefined)} workspace={ws} />
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
      <ConfirmDialog
        open={Boolean(voiding)}
        onClose={() => setVoiding(undefined)}
        title="Anular costo"
        tone="danger"
        confirmLabel="Anular"
        reasonLabel="Motivo"
        message="El registro se conserva como anulado y deja de computar en el resultado."
        onConfirm={async (reason) => {
          await actions.voidCost(voiding!, reason)
          notify({ title: 'Costo anulado' })
        }}
      />
    </div>
  )
}
