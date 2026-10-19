import { Link } from 'react-router'
import type { Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { invoiceStatusMeta, payableStatusMeta} from '@/config/catalogs'
import { clientPath, projectPath } from '@/config/navigation'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import type { Invoice, Payment, SupplierPayable } from '@/types/domain'
import { invoiceOutstanding, payableOutstanding } from '../selectors'
import { DueCell } from './DueCell'
import { getServiceType } from '@/config/serviceCatalog'

export function invoiceColumns(ws: Workspace, opts: { withClient?: boolean; withProject?: boolean } = {}): Column<Invoice>[] {
  const cols: (Column<Invoice> | false)[] = [
    { id: 'number', header: 'Factura', width: '172px', className: 'tabular font-medium', cell: (i) => i.number },
    opts.withClient !== false && {
      id: 'client',
      header: 'Cliente',
      width: '15%',
      cell: (i) => (
        <Link to={clientPath(i.clientId)} className="block truncate underline-offset-4 hover:underline">
          {ws.clientById.get(i.clientId)?.name}
        </Link>
      ),
    },
    opts.withProject !== false && {
      id: 'project',
      header: 'Proyecto',
      width: '136px',
      cell: (i) => (
        <Link to={`${projectPath(i.projectId)}?tab=finanzas`} className="tabular underline-offset-4 hover:underline">
          {ws.projectById.get(i.projectId)?.code}
        </Link>
      ),
    },
    { id: 'issue', header: 'Emisión', width: '112px', className: 'tabular', cell: (i) => formatDate(i.issueDate) },
    {
      id: 'due',
      header: 'Vencimiento',
      width: '140px',
      cell: (i) => <DueCell date={i.dueDate} open={invoiceOutstanding(i) > 0} />,
    },
    { id: 'amount', header: 'Importe', width: '128px', className: 'tabular font-medium', cell: (i) => formatCurrency(i.amount, i.currency) },
    {
      id: 'collected',
      header: 'Cobrado',
      width: '128px',
      className: 'tabular',
      cell: (i) => <span className={i.collected > 0 ? 'text-success' : 'text-muted'}>{formatCurrency(i.collected, i.currency)}</span>,
    },
    {
      id: 'balance',
      header: 'Saldo',
      width: '128px',
      className: 'tabular font-medium',
      cell: (i) => formatCurrency(invoiceOutstanding(i), i.currency),
    },
    { id: 'status', header: 'Estado', width: '124px', cell: (i) => <StatusBadge meta={invoiceStatusMeta[i.status]} /> },
  ]
  return cols.filter((c): c is Column<Invoice> => Boolean(c))
}

export function payableColumns(ws: Workspace, opts: { withProject?: boolean } = {}): Column<SupplierPayable>[] {
  const cols: (Column<SupplierPayable> | false)[] = [
    { id: 'ref', header: 'Comprobante', width: '128px', className: 'tabular font-medium', cell: (p) => p.reference },
    {
      id: 'supplier',
      header: 'Proveedor',
      width: '19%',
      cell: (p) => {
        const s = ws.supplierById.get(p.supplierId)
        return (
          <span className="block min-w-0">
            <span className="block truncate font-medium">{s?.name}</span>
            {s && <span className="block text-[12px] text-muted">{getServiceType(s.category).label}</span>}
          </span>
        )
      },
    },
    opts.withProject !== false && {
      id: 'project',
      header: 'Proyecto',
      width: '136px',
      cell: (p) => (
        <Link to={`${projectPath(p.projectId)}?tab=finanzas`} className="tabular underline-offset-4 hover:underline">
          {ws.projectById.get(p.projectId)?.code}
        </Link>
      ),
    },
    {
      id: 'due',
      header: 'Vencimiento',
      width: '140px',
      cell: (p) => <DueCell date={p.dueDate} open={payableOutstanding(p) > 0} />,
    },
    { id: 'amount', header: 'Importe', width: '132px', className: 'tabular font-medium', cell: (p) => formatCurrency(p.amount, p.currency) },
    {
      id: 'paid',
      header: 'Pagado',
      width: '132px',
      className: 'tabular',
      cell: (p) => <span className={p.paid > 0 ? 'text-success' : 'text-muted'}>{formatCurrency(p.paid, p.currency)}</span>,
    },
    {
      id: 'balance',
      header: 'Saldo',
      width: '132px',
      className: 'tabular font-medium',
      cell: (p) => formatCurrency(payableOutstanding(p), p.currency),
    },
    { id: 'status', header: 'Estado', width: '124px', cell: (p) => <StatusBadge meta={payableStatusMeta[p.status]} /> },
  ]
  return cols.filter((c): c is Column<SupplierPayable> => Boolean(c))
}

const methodLabel: Record<Payment['method'], string> = {
  transfer: 'Transferencia',
  wire: 'Transferencia internacional',
  check: 'Cheque',
  card: 'Tarjeta',
}

export function paymentColumns(ws: Workspace): Column<Payment>[] {
  const docLabel = (p: Payment) =>
    p.direction === 'incoming'
      ? ws.invoices.find((i) => i.id === p.documentId)?.number
      : ws.payables.find((x) => x.id === p.documentId)?.reference
  return [
    { id: 'date', header: 'Fecha', width: '120px', className: 'tabular', cell: (p) => formatDate(p.date) },
    {
      id: 'direction',
      header: 'Tipo',
      width: '120px',
      cell: (p) => (
        <StatusBadge
          meta={p.direction === 'incoming' ? { label: 'Cobro', tone: 'success' } : { label: 'Pago', tone: 'accent' }}
        />
      ),
    },
    { id: 'counterparty', header: 'Contraparte', width: '24%', cell: (p) => <span className="block truncate font-medium">{p.counterparty}</span> },
    { id: 'doc', header: 'Comprobante', width: '172px', className: 'tabular', cell: (p) => docLabel(p) },
    { id: 'method', header: 'Medio', width: '20%', cell: (p) => <span className="block truncate">{methodLabel[p.method]}</span> },
    {
      id: 'amount',
      header: 'Importe',
      width: '140px',
      className: 'tabular font-medium',
      cell: (p) => (
        <span className={p.direction === 'incoming' ? 'text-success' : 'text-ink'}>
          {p.direction === 'incoming' ? '+' : '−'} {formatCurrency(p.amount, p.currency)}
        </span>
      ),
    },
  ]
}
