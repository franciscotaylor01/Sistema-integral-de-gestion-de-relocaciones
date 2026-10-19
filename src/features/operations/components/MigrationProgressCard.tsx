import { Stamp } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Flag } from '@/components/ui/Flag'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { StageStepper } from '@/components/ui/StageStepper'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { countryNames, serviceStatusMeta } from '@/config/catalogs'
import { projectPath } from '@/config/navigation'
import { serviceProgress } from '@/features/projects/selectors'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatPercent } from '@/lib/format'
import type { ServiceRow } from './ServiceBoard'

/** Migration procedures across active projects, each with its stage stepper. */
export function MigrationProgressCard({ rows, workspace }: { rows: ServiceRow[]; workspace: Workspace }) {
  const sorted = [...rows].sort((a, b) => serviceProgress(a.service) - serviceProgress(b.service))
  return (
    <Card aria-labelledby="migration-title" className="h-full px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle id="migration-title" title="Trámites migratorios" description="Avance de visas, permisos y residencias por beneficiario" />
      {sorted.length === 0 ? (
        <EmptyState icon={Stamp} title="Sin trámites activos" />
      ) : (
        <ul className="mt-[18px] flex flex-col gap-[10px] rounded-panel bg-surface-muted p-[8px]">
          {sorted.map(({ service: s, project: p, assignee }) => (
            <li key={s.id}>
              <Link
                to={`${projectPath(p.id)}?tab=servicios`}
                className="block rounded-[14px] bg-surface px-[14px] py-[13px] transition-[box-shadow] duration-300 ease-soft hover:shadow-pill"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-[10px]">
                    <Flag country={p.destination.country} className="size-[20px]" labelled />
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-medium">{assignee?.name}</span>
                      <span className="block truncate text-[12.5px] text-muted">
                        {p.code} · {countryNames[p.destination.country]} · {workspace.staffById.get(s.ownerId)?.name}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-[12px]">
                    <span className="tabular text-[13px] font-medium">{formatPercent(serviceProgress(s))}</span>
                    <StatusBadge variant="soft" meta={serviceStatusMeta[s.status]} />
                  </span>
                </div>
                <StageStepper stages={s.stages} className="mt-[14px]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
