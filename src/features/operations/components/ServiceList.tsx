import { DataTable } from '@/components/ui/DataTable'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { serviceStatusMeta} from '@/config/catalogs'
import { projectPath } from '@/config/navigation'
import { currentStageLabel, serviceProgress } from '@/features/projects/selectors'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { daysUntil, formatDate, formatRelativeDays } from '@/lib/dates'
import { formatPercent } from '@/lib/format'
import type { ServiceRow } from './ServiceBoard'
import { getServiceType } from '@/config/serviceCatalog'

export function ServiceList({ rows, workspace }: { rows: ServiceRow[]; workspace: Workspace }) {
  const sorted = [...rows].sort((a, b) => a.service.dueDate.localeCompare(b.service.dueDate))
  return (
    <DataTable
      caption="Servicios de proyectos activos"
      rows={sorted}
      getRowId={(r) => r.service.id}
      rowHref={(r) => `${projectPath(r.project.id)}?tab=servicios`}
      minWidth={1080}
      columns={[
        {
          id: 'service',
          header: 'Servicio',
          width: '18%',
          cell: ({ service: s }) => (
            <span className="flex items-center gap-[10px]">
              <ServiceChip type={s.type} />
              <span className="truncate font-medium">{getServiceType(s.type).label}</span>
            </span>
          ),
        },
        {
          id: 'project',
          header: 'Proyecto',
          width: '20%',
          cell: ({ project: p, assignee }) => (
            <span className="block min-w-0">
              <span className="tabular block font-medium">{p.code}</span>
              <span className="block truncate text-[12px] text-muted">{assignee?.name}</span>
            </span>
          ),
        },
        { id: 'stage', header: 'Etapa actual', width: '17%', cell: ({ service: s }) => <span className="block truncate">{currentStageLabel(s)}</span> },
        {
          id: 'progress',
          header: 'Avance',
          width: '14%',
          cell: ({ service: s }) => {
            const pct = serviceProgress(s)
            return (
              <span className="flex items-center gap-[8px]">
                <ProgressBar value={pct} size="sm" className="flex-1" label="Avance" valueText={formatPercent(pct)} tone={s.status === 'blocked' ? 'danger' : 'accent'} />
                <span className="tabular w-[34px] text-right text-[12.5px] text-muted">{formatPercent(pct)}</span>
              </span>
            )
          },
        },
        { id: 'owner', header: 'Responsable', width: '13%', cell: ({ service: s }) => <span className="block truncate">{workspace.staffById.get(s.ownerId)?.name}</span> },
        {
          id: 'due',
          header: 'Vencimiento',
          width: '12%',
          cell: ({ service: s }) => {
            const days = daysUntil(s.dueDate)
            return (
              <span className="block">
                <span className="tabular block">{formatDate(s.dueDate)}</span>
                {s.status !== 'completed' && (
                  <span className={cn('block text-[12px]', days < 0 ? 'text-danger' : days <= 7 ? 'text-warning' : 'text-muted')}>
                    {formatRelativeDays(s.dueDate)}
                  </span>
                )}
              </span>
            )
          },
        },
        { id: 'status', header: 'Estado', width: '11%', cell: ({ service: s }) => <StatusBadge meta={serviceStatusMeta[s.status]} /> },
      ]}
    />
  )
}
