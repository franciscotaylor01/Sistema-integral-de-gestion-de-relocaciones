import { Link } from 'react-router'
import type { Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { invoiceStatusMeta, payableStatusMeta } from '@/config/catalogs'
import { costCategoryLabel, paymentMethodLabel } from '@/config/finance'
import { clientPath, invoicePath, projectPath, supplierPath } from '@/config/navigation'
import { receiptUnallocated, supplierPaymentUnallocated } from '@/domain/finance/derive'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import type { CostRecord, CustomerReceipt, Invoice, SupplierObligation, SupplierPayment } from '@/types/domain'
import { DueCell } from './DueCell'
import { ProjectRef } from './ProjectRef'
import { advanceInfo, possibleDuplicatePayments } from '@/domain/finance/supplierPayments'
import { projectsOfPayment } from '@/domain/finance/supplierViews'
import { advanceStatusMeta } from '@/config/finance'

const link = 'underline-offset-4 hover:underline'
const money = (v: number, c: Invoice['currency']) => formatCurrency(v, c, { decimals: 2 })

export function invoiceColumns(ws: Workspace, opts: { withClient?: boolean; withProject?: boolean } = {}): Column<Invoice>[] {
  const cols: (Column<Invoice> | false)[] = [
    {
      id: 'number',
      header: 'Factura',
      width: '160px',
      className: 'font-medium',
      cell: (i) => (
        <Link to={invoicePath(i.id)} className={cn('block', link)}>
          <span className="tabular block">{i.number}</span>
          {i.externalRef && <span className="tabular block text-[12px] font-normal text-muted">Ext. {i.externalRef}</span>}
        </Link>
      ),
    },
    opts.withClient !== false && {
      id: 'client',
      header: 'Cliente',
      width: '15%',
      cell: (i) => (
        <Link to={clientPath(i.clientId)} className={cn('block truncate', link)}>
          {ws.clientById.get(i.clientId)?.name}
        </Link>
      ),
    },
    opts.withProject !== false && {
      id: 'project',
      header: 'Proyecto',
      width: '136px',
      cell: (i) => (
        <Link to={`${projectPath(i.projectId)}?tab=finanzas`} className={cn('tabular', link)}>
          {ws.projectById.get(i.projectId)?.code}
        </Link>
      ),
    },
    { id: 'issue', header: 'Emisión', width: '112px', className: 'tabular', cell: (i) => formatDate(i.issueDate) },
    { id: 'due', header: 'Vencimiento', width: '140px', cell: (i) => <DueCell date={i.dueDate} open={i.lifecycle === 'issued' && (ws.invoiceFin.get(i.id)?.outstanding ?? 0) > 0} /> },
    { id: 'total', header: 'Total', width: '140px', className: 'tabular font-medium', cell: (i) => money(ws.invoiceFin.get(i.id)!.total, i.currency) },
    {
      id: 'collected',
      header: 'Cobrado',
      width: '130px',
      className: 'tabular',
      cell: (i) => {
        const paid = ws.invoiceFin.get(i.id)!.paid
        return <span className={paid > 0 ? 'text-success' : 'text-muted'}>{money(paid, i.currency)}</span>
      },
    },
    { id: 'balance', header: 'Saldo', width: '130px', className: 'tabular font-medium', cell: (i) => money(ws.invoiceFin.get(i.id)!.outstanding, i.currency) },
    {
      id: 'status',
      header: 'Estado',
      width: '130px',
      cell: (i) => {
        const f = ws.invoiceFin.get(i.id)!
        return (
          <span className="block">
            <StatusBadge meta={invoiceStatusMeta[f.status]} />
            {f.overdue && <span className="block text-[12px] text-danger">{f.daysOverdue} días de atraso</span>}
          </span>
        )
      },
    },
  ]
  return cols.filter((c): c is Column<Invoice> => Boolean(c))
}

export function obligationColumns(ws: Workspace, opts: { withProject?: boolean; withSupplier?: boolean; onOpen?: (id: string) => void } = {}): Column<SupplierObligation>[] {
  const cols: (Column<SupplierObligation> | false)[] = [
    {
      id: 'ref',
      header: 'Comprobante',
      width: '140px',
      className: 'tabular font-medium',
      cell: (o) =>
        opts.onOpen ? (
          <button type="button" onClick={() => opts.onOpen!(o.id)} className={cn('text-left', link)}>
            {o.reference}
          </button>
        ) : (
          o.reference
        ),
    },
    opts.withSupplier !== false && {
      id: 'supplier',
      header: 'Proveedor',
      width: '19%',
      cell: (o) => (
        <Link to={supplierPath(o.supplierId)} className={cn('block truncate font-medium', link)}>
          {ws.supplierById.get(o.supplierId)?.name}
        </Link>
      ),
    },
    opts.withProject !== false && {
      id: 'project',
      header: 'Proyecto',
      width: '18%',
      cell: (o) => <ProjectRef ws={ws} projectId={o.projectId} serviceId={o.serviceId} />,
    },
    { id: 'due', header: 'Vencimiento', width: '140px', cell: (o) => <DueCell date={o.dueDate} open={(ws.obligationFin.get(o.id)?.outstanding ?? 0) > 0 && o.lifecycle === 'approved'} /> },
    { id: 'amount', header: 'Importe', width: '132px', className: 'tabular font-medium', cell: (o) => money(o.amount, o.currency) },
    {
      id: 'paid',
      header: 'Pagado',
      width: '132px',
      className: 'tabular',
      cell: (o) => {
        const paid = ws.obligationFin.get(o.id)!.paid
        return <span className={paid > 0 ? 'text-success' : 'text-muted'}>{money(paid, o.currency)}</span>
      },
    },
    { id: 'balance', header: 'Saldo', width: '132px', className: 'tabular font-medium', cell: (o) => money(ws.obligationFin.get(o.id)!.outstanding, o.currency) },
    {
      id: 'status',
      header: 'Estado',
      width: '150px',
      cell: (o) => {
        const f = ws.obligationFin.get(o.id)!
        return (
          <span className="block" title={f.conditionNote}>
            <StatusBadge meta={payableStatusMeta[f.status]} />
            {f.status === 'awaiting-collection' && <span className="block truncate text-[12px] text-muted">{f.conditionNote}</span>}
          </span>
        )
      },
    },
  ]
  return cols.filter((c): c is Column<SupplierObligation> => Boolean(c))
}

export function receiptColumns(ws: Workspace, opts: { onOpen?: (id: string) => void } = {}): Column<CustomerReceipt>[] {
  return [
    {
      id: 'number',
      header: 'Cobro',
      width: '164px',
      className: 'tabular font-medium',
      cell: (r) =>
        opts.onOpen ? (
          <button type="button" onClick={() => opts.onOpen!(r.id)} className={link}>
            {r.number}
          </button>
        ) : (
          r.number
        ),
    },
    { id: 'date', header: 'Fecha', width: '112px', className: 'tabular', cell: (r) => formatDate(r.date) },
    { id: 'client', header: 'Cliente', width: '17%', cell: (r) => <span className="block truncate">{ws.clientById.get(r.clientId)?.name}</span> },
    {
      id: 'invoices',
      header: 'Aplicado a',
      width: '20%',
      cell: (r) => (
        <span className="block truncate text-[13.5px]">
          {r.allocations.length ? r.allocations.map((a) => ws.invoiceById.get(a.invoiceId)?.number).join(', ') : <span className="text-muted">Sin aplicar</span>}
        </span>
      ),
    },
    { id: 'method', header: 'Medio', width: '14%', cell: (r) => <span className="block truncate text-ink-secondary">{paymentMethodLabel[r.method]}</span> },
    { id: 'amount', header: 'Importe', width: '140px', className: 'tabular font-medium', cell: (r) => <span className="text-success">{money(r.amount, r.currency)}</span> },
    {
      id: 'status',
      header: 'Estado',
      width: '150px',
      cell: (r) => {
        const free = receiptUnallocated(r)
        return r.status === 'reversed' ? (
          <StatusBadge meta={{ label: 'Revertido', tone: 'neutral' }} />
        ) : free > 0 ? (
          <span className="block">
            <StatusBadge meta={{ label: 'Saldo a favor', tone: 'warning' }} />
            <span className="tabular block text-[12px] text-muted">{money(free, r.currency)}</span>
          </span>
        ) : (
          <StatusBadge meta={{ label: 'Aplicado', tone: 'success' }} />
        )
      },
    },
  ]
}

export function supplierPaymentColumns(ws: Workspace, opts: { onOpen?: (id: string) => void } = {}): Column<SupplierPayment>[] {
  const dupes = possibleDuplicatePayments(ws.dataset)
  return [
    {
      id: 'number',
      header: 'Pago',
      width: '164px',
      className: 'tabular font-medium',
      cell: (p) =>
        opts.onOpen ? (
          <button type="button" onClick={() => opts.onOpen!(p.id)} className={link}>
            {p.number}
          </button>
        ) : (
          p.number
        ),
    },
    { id: 'date', header: 'Fecha', width: '112px', className: 'tabular', cell: (p) => formatDate(p.date) },
    {
      id: 'supplier',
      header: 'Proveedor',
      width: '19%',
      cell: (p) => (
        <Link to={supplierPath(p.supplierId)} className={cn('block truncate', link)}>
          {ws.supplierById.get(p.supplierId)?.name}
        </Link>
      ),
    },
    {
      id: 'project',
      header: 'Proyecto',
      width: '17%',
      cell: (p) => {
        const ids = projectsOfPayment(ws.dataset, p)
        return ids.length ? (
          <span className="flex flex-col gap-[2px]">
            {ids.map((id) => (
              <ProjectRef key={id} ws={ws} projectId={id} serviceId={id === p.projectId ? p.serviceId : undefined} compact />
            ))}
          </span>
        ) : (
          <span className="text-[12.5px] text-warning">Sin proyecto (revisar)</span>
        )
      },
    },
    {
      id: 'obligations',
      header: 'Aplicado a',
      width: '14%',
      cell: (p) => (
        <span className="block truncate text-[13.5px]">
          {p.batchAllocations?.length
            ? `Liquidación ${ws.settlementBatches.find((b) => b.id === p.batchAllocations![0].batchId)?.number ?? ''}`
            : p.allocations.filter((a) => !a.reversedAt).length
              ? p.allocations.filter((a) => !a.reversedAt).map((a) => ws.obligationById.get(a.obligationId)?.reference).join(', ')
              : <span className="text-muted">Anticipo</span>}
        </span>
      ),
    },
    { id: 'method', header: 'Medio', width: '14%', cell: (p) => <span className="block truncate text-ink-secondary">{paymentMethodLabel[p.method]}</span> },
    { id: 'amount', header: 'Importe', width: '140px', className: 'tabular font-medium', cell: (p) => money(p.amount, p.currency) },
    {
      id: 'status',
      header: 'Estado',
      width: '140px',
      cell: (p) => {
        const free = supplierPaymentUnallocated(p)
        const adv = advanceInfo(p)
        const dup = dupes.has(p.id) && <span className="mt-[2px] block text-[11.5px] font-medium text-warning">Posible duplicado</span>
        return p.status === 'reversed' ? (
          <StatusBadge meta={{ label: 'Revertido', tone: 'neutral' }} />
        ) : adv ? (
          <span className="block">
            <StatusBadge meta={advanceStatusMeta[adv.status]} />
            {free > 0 && <span className="tabular block text-[12px] text-muted">Sin aplicar {money(free, p.currency)}</span>}
            {dup}
          </span>
        ) : (
          <span className="block">
            <StatusBadge meta={{ label: 'Aplicado', tone: 'success' }} />
            {dup}
          </span>
        )
      },
    },
  ]
}

export function costColumns(ws: Workspace, opts: { withProject?: boolean; onVoid?: (id: string) => void } = {}): Column<CostRecord>[] {
  const cols: (Column<CostRecord> | false)[] = [
    { id: 'date', header: 'Fecha', width: '112px', className: 'tabular', cell: (c) => formatDate(c.date) },
    {
      id: 'description',
      header: 'Concepto',
      width: '26%',
      cell: (c) => (
        <span className="block min-w-0">
          <span className={cn('block truncate font-medium', c.status === 'void' && 'text-muted line-through')}>{c.description}</span>
          <span className="block truncate text-[12px] text-muted">{costCategoryLabel[c.category]}</span>
        </span>
      ),
    },
    opts.withProject !== false && {
      id: 'project',
      header: 'Proyecto',
      width: '18%',
      cell: (c) => <ProjectRef ws={ws} projectId={c.projectId} serviceId={c.serviceId} />,
    },
    { id: 'supplier', header: 'Proveedor', width: '17%', cell: (c) => <span className="block truncate text-ink-secondary">{c.supplierId ? ws.supplierById.get(c.supplierId)?.name : '—'}</span> },
    { id: 'amount', header: 'Importe', width: '140px', className: 'tabular font-medium', cell: (c) => money(c.amount, c.currency) },
    {
      id: 'status',
      header: 'Estado',
      width: '170px',
      cell: (c) => {
        const linked = ws.obligations.find((o) => o.costId === c.id && o.lifecycle !== 'cancelled')
        if (c.status === 'void') return <StatusBadge meta={{ label: 'Anulado', tone: 'neutral' }} />
        return (
          <span className="flex items-center gap-[8px]">
            <StatusBadge meta={{ label: linked ? 'Con obligación' : 'Incurrido', tone: 'info' }} />
            {!linked && opts.onVoid && (
              <button type="button" onClick={() => opts.onVoid!(c.id)} className="rounded-full px-[8px] py-[2px] text-[12px] text-muted hover:bg-surface-muted hover:text-ink">
                Anular
              </button>
            )}
          </span>
        )
      },
    },
  ]
  return cols.filter((c): c is Column<CostRecord> => Boolean(c))
}
