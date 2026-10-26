import { Link } from 'react-router'
import { AmountsText } from '@/components/ui/Amounts'
import type { Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { purchaseOrderStatusMeta, quotationStageMeta } from '@/config/commercial'
import { clientPath, projectPath, purchaseOrderPath, quotationPath } from '@/config/navigation'
import { allocatedTotal } from '@/domain/commercial/purchaseOrders'
import { effectiveStatus, quotationStage, quotationTotals } from '@/domain/commercial/quotations'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { daysUntil, formatDate, formatRelativeDays } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import type { PurchaseOrder, Quotation } from '@/types/domain'

const link = 'underline-offset-4 hover:underline'

export function quotationColumns(ws: Workspace, opts: { withProject?: boolean; withClient?: boolean } = {}): Column<Quotation>[] {
  const cols: (Column<Quotation> | false)[] = [
    {
      id: 'number',
      header: 'Cotización',
      width: '168px',
      className: 'font-medium',
      cell: (q) => (
        <Link to={quotationPath(q.id)} className={cn('tabular', link)}>
          {q.number} <span className="text-muted">v{q.version}</span>
        </Link>
      ),
    },
    opts.withClient !== false && {
      id: 'client',
      header: 'Cliente',
      width: '15%',
      cell: (q) => (
        <Link to={clientPath(q.clientId)} className={cn('block truncate', link)}>
          {ws.clientById.get(q.clientId)?.name}
        </Link>
      ),
    },
    opts.withProject !== false && {
      id: 'project',
      header: 'Proyecto',
      width: '136px',
      cell: (q) => (
        <Link to={`${projectPath(q.projectId)}?tab=finanzas`} className={cn('tabular', link)}>
          {ws.projectById.get(q.projectId)?.code}
        </Link>
      ),
    },
    { id: 'issue', header: 'Emisión', width: '112px', className: 'tabular', cell: (q) => formatDate(q.issueDate) },
    {
      id: 'valid',
      header: 'Validez',
      width: '140px',
      cell: (q) => {
        const st = effectiveStatus(q, DEMO_TODAY)
        return (
          <span className="block">
            <span className="tabular block">{formatDate(q.validUntil)}</span>
            {st === 'sent' && (
              <span className={cn('block text-[12px]', daysUntil(q.validUntil) <= 7 ? 'text-warning' : 'text-muted')}>vence {formatRelativeDays(q.validUntil)}</span>
            )}
          </span>
        )
      },
    },
    { id: 'total', header: 'Total', width: '150px', className: 'font-medium', cell: (q) => <AmountsText amounts={quotationTotals(q.lines)} /> },
    {
      id: 'status',
      header: 'Estado',
      width: '150px',
      cell: (q) => (
        <span className="block">
          <StatusBadge meta={quotationStageMeta[quotationStage(q, DEMO_TODAY)]} />
          {q.supersededById && <span className="block text-[12px] text-muted">Reemplazada</span>}
        </span>
      ),
    },
  ]
  return cols.filter((c): c is Column<Quotation> => Boolean(c))
}

export function purchaseOrderColumns(ws: Workspace, opts: { withProject?: boolean; withClient?: boolean } = {}): Column<PurchaseOrder>[] {
  const cols: (Column<PurchaseOrder> | false)[] = [
    {
      id: 'number',
      header: 'OC del cliente',
      width: '170px',
      className: 'font-medium',
      cell: (po) => (
        <Link to={purchaseOrderPath(po.id)} className={cn('block', link)}>
          <span className="tabular block truncate">{po.clientPoNumber}</span>
          <span className="tabular block text-[12px] font-normal text-muted">{po.internalNumber}</span>
        </Link>
      ),
    },
    opts.withClient !== false && {
      id: 'client',
      header: 'Cliente',
      width: '15%',
      cell: (po) => (
        <Link to={clientPath(po.clientId)} className={cn('block truncate', link)}>
          {ws.clientById.get(po.clientId)?.name}
        </Link>
      ),
    },
    opts.withProject !== false && {
      id: 'project',
      header: 'Proyecto',
      width: '136px',
      cell: (po) => (
        <Link to={`${projectPath(po.projectId)}?tab=finanzas`} className={cn('tabular', link)}>
          {ws.projectById.get(po.projectId)?.code}
        </Link>
      ),
    },
    { id: 'received', header: 'Recepción', width: '112px', className: 'tabular', cell: (po) => formatDate(po.receivedDate) },
    { id: 'authorized', header: 'Autorizado', width: '140px', className: 'tabular font-medium', cell: (po) => formatCurrency(po.authorizedAmount, po.currency) },
    {
      id: 'allocated',
      header: 'Asignado',
      width: '150px',
      cell: (po) => {
        const free = po.authorizedAmount - allocatedTotal(po)
        return (
          <span className="block">
            <span className="tabular block">{formatCurrency(allocatedTotal(po), po.currency)}</span>
            {free > 0 && <span className="tabular block text-[12px] text-muted">{formatCurrency(free, po.currency)} sin asignar</span>}
          </span>
        )
      },
    },
    { id: 'services', header: 'Servicios', width: '92px', className: 'tabular', cell: (po) => po.allocations.length },
    {
      id: 'doc',
      header: 'Documento',
      width: '130px',
      cell: (po) => (po.documentLabel ? <StatusBadge meta={{ label: 'Vinculado', tone: 'success' }} /> : <span className="text-[13px] text-muted">Pendiente</span>),
    },
    { id: 'status', header: 'Estado', width: '110px', cell: (po) => <StatusBadge meta={purchaseOrderStatusMeta[po.status]} /> },
  ]
  return cols.filter((c): c is Column<PurchaseOrder> => Boolean(c))
}
