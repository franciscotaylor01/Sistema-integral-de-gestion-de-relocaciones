import { CircleDollarSign, HandCoins, PiggyBank, ReceiptText, Truck } from 'lucide-react'
import { useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetaBadge } from '@/components/ui/MetaBadge'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatTile } from '@/components/ui/StatTile'
import { invoiceColumns, payableColumns } from '@/features/finance/components/ledgerColumns'
import { summarizeLedger } from '@/features/finance/selectors'
import { formatCompactCurrency, formatCurrency, formatPercent } from '@/lib/format'
import type { ProjectService } from '@/types/domain'
import { PreviewBanner } from '../components/PreviewBanner'
import type { ProjectContext } from '../projectContext'
import { projectBudget, projectEstimatedCost } from '../selectors'
import { getServiceType } from '@/config/serviceCatalog'

export function FinanceTab({ ctx }: { ctx: ProjectContext }) {
  const { project, workspace } = ctx
  const cur = project.currency
  const ledger = summarizeLedger(ctx.invoices, ctx.payables)
  const budget = projectBudget(project)
  const cost = projectEstimatedCost(project)
  const invoiced = ledger.invoiced[cur] ?? 0
  const format = useCallback((v: number) => formatCompactCurrency(Math.round(v), cur), [cur])

  return (
    <div className="flex flex-col gap-[24px]">
      <PreviewBanner>
        Cotizaciones, órdenes de compra, facturación y liquidaciones se habilitarán en la fase financiera. Los importes son datos ficticios de referencia.
      </PreviewBanner>
      <Card aria-label="Indicadores financieros del proyecto" className="grid grid-cols-1 gap-[14px] p-[18px] sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          tone="accent"
          label="Presupuesto"
          icon={PiggyBank}
          value={budget}
          format={format}
          footer={
            <>
              <MetaBadge onAccent>{project.services.length} servicios</MetaBadge>
            </>
          }
        />
        <StatTile
          label="Facturado"
          icon={ReceiptText}
          value={invoiced}
          format={format}
          footer={
            <>
              <MetaBadge>{formatPercent(budget ? (invoiced / budget) * 100 : 0)}</MetaBadge>
              <span>del presupuesto</span>
            </>
          }
        />
        <StatTile
          label="Cobrado"
          icon={HandCoins}
          value={ledger.collected[cur] ?? 0}
          format={format}
          footer={<span>{ctx.invoices.filter((i) => i.status === 'paid').length} facturas cobradas</span>}
        />
        <StatTile
          label="Por cobrar"
          icon={CircleDollarSign}
          value={ledger.receivable[cur] ?? 0}
          format={format}
          footer={
            ledger.overdueInvoices > 0 ? (
              <MetaBadge className="bg-danger-soft text-danger">{ledger.overdueInvoices} vencida</MetaBadge>
            ) : (
              <span>Sin vencidas</span>
            )
          }
        />
        <StatTile
          label="Costos de proveedores"
          icon={Truck}
          value={ledger.supplierCosts[cur] ?? 0}
          format={format}
          footer={<span>Pagado {formatCompactCurrency(ledger.supplierPaid[cur] ?? 0, cur)}</span>}
        />
      </Card>

      <Card aria-labelledby="pf-breakdown" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="pf-breakdown"
          title="Rentabilidad por servicio"
          description="Precio acordado contra costo estimado de proveedores. Estimación sin impuestos ni conversión."
        />
        <DataTable<ProjectService>
          className="mt-[18px]"
          caption="Rentabilidad estimada por servicio"
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
            { id: 'price', header: 'Precio', className: 'tabular', cell: (s) => formatCurrency(s.price ?? 0, cur) },
            { id: 'cost', header: 'Costo estimado', className: 'tabular', cell: (s) => formatCurrency(s.estimatedCost ?? 0, cur) },
            { id: 'margin', header: 'Margen', className: 'tabular font-medium', cell: (s) => formatCurrency((s.price ?? 0) - (s.estimatedCost ?? 0), cur) },
            {
              id: 'pct',
              header: '%',
              width: '90px',
              className: 'tabular text-success font-medium',
              cell: (s) => formatPercent(s.price ? ((s.price - (s.estimatedCost ?? 0)) / s.price) * 100 : 0),
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
              {formatCurrency(budget - cost, cur)} ({formatPercent(budget ? ((budget - cost) / budget) * 100 : 0)})
            </span>
          </span>
        </div>
      </Card>

      <Card aria-labelledby="pf-invoices" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle id="pf-invoices" title="Facturas al cliente" description={`${ctx.invoices.length} comprobantes emitidos para este proyecto`} />
        <DataTable
          className="mt-[18px]"
          caption="Facturas del proyecto"
          rows={ctx.invoices}
          getRowId={(i) => i.id}
          minWidth={900}
          columns={invoiceColumns(workspace, { withClient: false, withProject: false })}
          empty={<EmptyState icon={ReceiptText} title="Sin facturas" description="Este proyecto todavía no fue facturado." />}
        />
      </Card>

      <Card aria-labelledby="pf-payables" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle id="pf-payables" title="Obligaciones con proveedores" description="Comprobantes de proveedores imputados al proyecto" />
        <DataTable
          className="mt-[18px]"
          caption="Cuentas a pagar del proyecto"
          rows={ctx.payables}
          getRowId={(p) => p.id}
          minWidth={900}
          columns={payableColumns(workspace, { withProject: false })}
          empty={<EmptyState icon={Truck} title="Sin obligaciones registradas" description="Aún no hay comprobantes de proveedores." />}
        />
      </Card>
    </div>
  )
}
