import { Link } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { Flag } from '@/components/ui/Flag'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { serviceStatusMeta} from '@/config/catalogs'
import { projectPath } from '@/config/navigation'
import { currentStageLabel, serviceProgress } from '@/features/projects/selectors'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { daysUntil, formatRelativeDays } from '@/lib/dates'
import { formatPercent } from '@/lib/format'
import type { Person, Project, ProjectService, ServiceStatus } from '@/types/domain'
import { getServiceType } from '@/config/serviceCatalog'

export interface ServiceRow {
  service: ProjectService
  project: Project
  assignee: Person | undefined
}

const COLUMNS: ServiceStatus[] = ['not-started', 'in-progress', 'waiting', 'blocked', 'completed']

export function ServiceCard({ row, workspace }: { row: ServiceRow; workspace: Workspace }) {
  const { service: s, project: p, assignee } = row
  const owner = workspace.staffById.get(s.ownerId)
  const pct = serviceProgress(s)
  const days = daysUntil(s.dueDate)
  return (
    <Link
      to={`${projectPath(p.id)}?tab=servicios`}
      className="block rounded-[14px] bg-surface p-[12px] transition-[box-shadow,transform] duration-300 ease-soft hover:-translate-y-0.5 hover:shadow-pill active:translate-y-0 active:scale-[0.99] active:duration-100"
    >
      <div className="flex items-center gap-[10px]">
        <ServiceChip type={s.type} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{getServiceType(s.type).label}</span>
      </div>
      <p className="mt-[8px] truncate text-[13px] text-ink-secondary">
        <span className="tabular font-medium text-ink">{p.code}</span> · {assignee?.name}
      </p>
      <p className="mt-[2px] flex items-center gap-[6px] truncate text-[12px] text-muted">
        <Flag country={p.destination.country} className="size-[13px]" />
        {p.destination.city} · {currentStageLabel(s)}
      </p>
      <div className="mt-[10px] flex items-center gap-[8px]">
        <ProgressBar
          value={pct}
          size="sm"
          className="flex-1"
          label={`Avance de ${getServiceType(s.type).label} en ${p.code}`}
          valueText={formatPercent(pct)}
          tone={s.status === 'blocked' ? 'danger' : s.status === 'completed' ? 'success' : 'accent'}
        />
        <span className="tabular text-[11.5px] text-muted">{formatPercent(pct)}</span>
      </div>
      <div className="mt-[10px] flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-[6px]">
          {owner && <Avatar name={owner.name} className="size-[22px] [&>span]:text-[9px]" />}
          <span className="truncate text-[12px] text-muted">{owner?.name.split(' ')[0]}</span>
        </span>
        {s.status !== 'completed' && (
          <span className={cn('shrink-0 text-[12px] font-medium', days < 0 ? 'text-danger' : days <= 7 ? 'text-warning' : 'text-ink-secondary')}>
            {formatRelativeDays(s.dueDate)}
          </span>
        )}
      </div>
    </Link>
  )
}

/** Status columns (no drag & drop in Phase 1); scrolls horizontally on small screens. */
export function ServiceBoard({ rows, workspace }: { rows: ServiceRow[]; workspace: Workspace }) {
  return (
    <div className="scrollbar-none relative -mx-[2px] overflow-x-auto px-[2px] pb-[2px]">
      <div className="grid min-w-[1080px] grid-cols-5 gap-[12px]">
        {COLUMNS.map((status) => {
          const items = rows.filter((r) => r.service.status === status).sort((a, b) => a.service.dueDate.localeCompare(b.service.dueDate))
          return (
            <section key={status} aria-label={serviceStatusMeta[status].label} className="flex flex-col rounded-panel bg-surface-muted p-[8px]">
              <header className="flex items-center justify-between px-[6px] pb-[8px] pt-[4px]">
                <StatusBadge meta={serviceStatusMeta[status]} className="text-[13.5px]" />
                <span className="tabular rounded-full bg-surface px-[8px] py-[1px] text-[12px] font-medium text-ink-secondary">{items.length}</span>
              </header>
              <div className="flex flex-col gap-[8px]">
                {items.length === 0 ? (
                  <p className="rounded-[14px] border border-dashed border-line-strong px-[12px] py-[18px] text-center text-[12.5px] text-muted">Sin servicios</p>
                ) : (
                  items.map((r) => <ServiceCard key={r.service.id} row={r} workspace={workspace} />)
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
