import { Link } from 'react-router'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { certificatePath, projectPath } from '@/config/navigation'
import { certificateFlow, certificateTotal } from '@/domain/commercial/certificates'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatMoney } from '@/lib/format'
import type { Certificate } from '@/types/domain'
import { certificateStatusMeta } from './meta'

const nextStep = (ws: Workspace, c: Certificate) => (c.status === 'rejected' ? undefined : certificateFlow(ws.dataset, c).find((s) => !s.done)?.label)

export function certificateColumns(ws: Workspace, withProject = true) {
  return [
    {
      id: 'number',
      header: 'Certificado',
      width: '170px',
      cell: (c: Certificate) => (
        <Link to={certificatePath(c.id)} className="block underline-offset-4 hover:underline">
          <span className="tabular block font-medium">{c.externalNumber ?? c.number}</span>
          <span className="tabular block text-[12px] text-muted">{c.externalNumber ? c.number : 'sin n.º oficial'}</span>
        </Link>
      ),
    },
    ...(withProject
      ? [
          {
            id: 'project',
            header: 'Proyecto',
            width: '150px',
            cell: (c: Certificate) => (
              <Link to={`${projectPath(c.projectId)}?tab=finanzas`} className="tabular block underline-offset-4 hover:underline">
                {ws.projectById.get(c.projectId)?.code}
                <span className="block truncate text-[12px] text-muted">{ws.clientById.get(c.clientId)?.name}</span>
              </Link>
            ),
          },
        ]
      : []),
    { id: 'oc', header: 'OC', width: '130px', cell: (c: Certificate) => <span className="tabular text-ink-secondary">{c.openOrderId ? ws.openOrders.find((o) => o.id === c.openOrderId)?.number : c.purchaseOrderId ? ws.purchaseOrderById.get(c.purchaseOrderId)?.clientPoNumber : '—'}</span> },
    { id: 'items', header: 'Ítems', width: '24%', cell: (c: Certificate) => <span className="block truncate text-[13px] text-ink-secondary">{c.lines.map((l) => `${l.description.split(' — ').at(-1)} ×${l.quantity}`).join(' · ')}</span> },
    { id: 'total', header: 'Importe', width: '140px', className: 'tabular font-medium', cell: (c: Certificate) => formatMoney(certificateTotal(c), c.currency) },
    {
      id: 'status',
      header: 'Estado',
      width: '210px',
      cell: (c: Certificate) => (
        <span className="block whitespace-normal">
          <StatusBadge meta={certificateStatusMeta[c.status]} />
          {nextStep(ws, c) && <span className="mt-[2px] block text-[12px] text-muted">Próximo: {nextStep(ws, c)}</span>}
        </span>
      ),
    },
  ]
}

