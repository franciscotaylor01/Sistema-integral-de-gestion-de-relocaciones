import { Link } from 'react-router'
import type { Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusMeta } from '@/config/catalogs'
import { certificatePath, clientPath, invoicePath, projectPath } from '@/config/navigation'
import type { ReceivableRow, ReceivableStatus } from '@/domain/finance/receivables'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/format'

export const receivableStatusMeta: Record<ReceivableStatus, StatusMeta> = {
  pending: { label: 'Pendiente', tone: 'info' },
  partial: { label: 'Parcialmente conciliada', tone: 'warning' },
  reconciled: { label: 'Conciliada', tone: 'success' },
  overdue: { label: 'Vencida', tone: 'danger' },
  cancelled: { label: 'Anulada', tone: 'neutral' },
}

const link = 'underline-offset-4 hover:underline'

export function dueLabel(r: ReceivableRow): { text: string; tone: string } {
  if (r.status === 'cancelled' || r.status === 'reconciled') return { text: '—', tone: 'text-muted' }
  if (r.daysToDue < 0) return { text: `${-r.daysToDue} días de atraso`, tone: 'text-danger' }
  if (r.daysToDue === 0) return { text: 'Vence hoy', tone: 'text-warning' }
  return { text: `Vence en ${r.daysToDue} días`, tone: r.daysToDue <= 7 ? 'text-warning' : 'text-muted' }
}

export function receivableColumns(ws: Workspace, opts: { compact?: boolean } = {}): Column<ReceivableRow>[] {
  const m = (r: ReceivableRow, v: number) => formatMoney(v, r.currency)
  const cols: (Column<ReceivableRow> | false)[] = [
    {
      id: 'client',
      header: 'Cliente',
      width: opts.compact ? '22%' : '13%',
      cell: (r) => (
        <Link to={clientPath(r.invoice.clientId)} className={cn('block truncate', link)}>
          {ws.clientById.get(r.invoice.clientId)?.name}
        </Link>
      ),
    },
    {
      id: 'project',
      header: 'Proyecto',
      width: '130px',
      cell: (r) => (
        <Link to={`${projectPath(r.invoice.projectId)}?tab=finanzas`} className={cn('tabular', link)}>
          {ws.projectById.get(r.invoice.projectId)?.code}
        </Link>
      ),
    },
    {
      id: 'invoice',
      header: 'Factura',
      width: '160px',
      cell: (r) => (
        <Link to={invoicePath(r.invoice.id)} className={cn('block', link)}>
          <span className="tabular block font-medium">{r.invoice.externalRef ?? r.invoice.number}</span>
          {!opts.compact && <span className="tabular block text-[12px] text-muted">{r.invoice.fiscal ? r.invoice.number : 'sin datos fiscales'}</span>}
        </Link>
      ),
    },
    !opts.compact && {
      id: 'refs',
      header: 'OC · certificado',
      width: '150px',
      cell: (r) => {
        const orders = [...r.openOrderIds.map((id) => ws.openOrders.find((o) => o.id === id)?.number), ...r.purchaseOrderIds.map((id) => ws.purchaseOrderById.get(id)?.clientPoNumber)].filter(Boolean)
        return (
          <span className="block text-[12.5px] leading-[1.4]">
            <span className="tabular block truncate text-ink-secondary">{orders.join(', ') || '—'}</span>
            {r.certificateIds.map((id) => {
              const c = ws.certificates.find((x) => x.id === id)
              return c ? (
                <Link key={id} to={certificatePath(id)} className={cn('tabular block truncate text-muted', link)}>
                  {c.externalNumber ?? c.number}
                </Link>
              ) : null
            })}
          </span>
        )
      },
    },
    !opts.compact && { id: 'issued', header: 'Emisión', width: '104px', className: 'tabular', cell: (r) => formatDate(r.invoice.issueDate) },
    {
      id: 'due',
      header: 'Vencimiento',
      width: '140px',
      cell: (r) => {
        const d = dueLabel(r)
        return (
          <span className="block">
            <span className="tabular block">{formatDate(r.invoice.dueDate)}</span>
            <span className={cn('block text-[12px]', d.tone)}>{d.text}</span>
          </span>
        )
      },
    },
    !opts.compact && { id: 'total', header: 'Facturado', width: '130px', className: 'tabular', cell: (r) => m(r, r.total) },
    !opts.compact && { id: 'paid', header: 'Cobros', width: '120px', className: 'tabular text-success', cell: (r) => m(r, r.paid) },
    !opts.compact && { id: 'withheld', header: 'Retenciones', width: '120px', className: 'tabular text-ink-secondary', cell: (r) => m(r, r.withheld) },
    { id: 'outstanding', header: 'Pendiente', width: '140px', className: 'tabular font-semibold', cell: (r) => <span className={r.status === 'overdue' ? 'text-danger' : undefined}>{m(r, r.outstanding)}</span> },
    { id: 'status', header: 'Estado', width: opts.compact ? '150px' : '170px', cell: (r) => <StatusBadge meta={receivableStatusMeta[r.status]} /> },
  ]
  return cols.filter((c): c is Column<ReceivableRow> => Boolean(c))
}
