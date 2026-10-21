import { Link } from 'react-router'
import { projectPath } from '@/config/navigation'
import { projectRef } from '@/domain/finance/supplierViews'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'

/**
 * Project reference resolved by id: code (opens the project), beneficiary,
 * client and service. Without project: "Sin proyecto / Gasto general".
 */
export function ProjectRef({ ws, projectId, serviceId, compact, className }: { ws: Workspace; projectId?: string; serviceId?: string; compact?: boolean; className?: string }) {
  const r = projectRef(ws.dataset, projectId, serviceId)
  if (r.general) return <span className={cn('block text-[13px] text-muted', className)}>Sin proyecto / Gasto general</span>
  const sub = [r.name, compact ? undefined : r.client, r.service].filter(Boolean).join(' · ')
  return (
    <span className={cn('block min-w-0', className)}>
      <Link to={`${projectPath(r.projectId!)}?tab=finanzas`} className="tabular block truncate underline-offset-4 hover:underline">
        {r.code}
      </Link>
      {sub && <span className="block truncate text-[12px] text-muted">{sub}</span>}
    </span>
  )
}
