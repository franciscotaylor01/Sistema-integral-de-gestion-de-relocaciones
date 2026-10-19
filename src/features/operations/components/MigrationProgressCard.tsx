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
import { getProcedureType } from '@/config/procedureCatalog'
import { stageProgress } from '@/domain/workflow'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatPercent } from '@/lib/format'
import type { ServiceStatus, WorkflowStage } from '@/types/domain'
import type { ServiceRow } from './ServiceBoard'

interface Row {
  id: string
  projectId: string
  code: string
  country: keyof typeof countryNames
  person?: string
  label: string
  owner?: string
  status: ServiceStatus
  stages: WorkflowStage[]
}

/**
 * Migration procedures across active projects (DNI, TIE, residencia…), each
 * with its stage stepper. Migration services without procedures are listed too.
 */
export function MigrationProgressCard({ rows, workspace }: { rows: ServiceRow[]; workspace: Workspace }) {
  const items: Row[] = rows.flatMap(({ service: s, project: p, assignee }) =>
    s.procedures.length
      ? s.procedures.map((pr) => ({
          id: pr.id,
          projectId: p.id,
          code: p.code,
          country: p.destination.country,
          person: workspace.personById.get(pr.personId)?.name,
          label: getProcedureType(pr.typeId).label,
          owner: workspace.staffById.get(pr.ownerId)?.name,
          status: pr.status,
          stages: pr.stages,
        }))
      : [
          {
            id: s.id,
            projectId: p.id,
            code: p.code,
            country: p.destination.country,
            person: assignee?.name,
            label: 'Servicio de migraciones',
            owner: workspace.staffById.get(s.ownerId)?.name,
            status: s.status,
            stages: s.stages,
          },
        ],
  )
  const sorted = items.filter((i) => i.status !== 'completed').sort((a, b) => stageProgress(a.stages).pct - stageProgress(b.stages).pct)

  return (
    <Card aria-labelledby="migration-title" className="h-full px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle id="migration-title" title="Trámites migratorios" description="Visas, residencias, DNI y TIE en curso, por persona" />
      {sorted.length === 0 ? (
        <EmptyState icon={Stamp} title="Sin trámites activos" />
      ) : (
        <ul className="mt-[18px] flex flex-col gap-[10px] rounded-panel bg-surface-muted p-[8px]">
          {sorted.map((r) => (
            <li key={r.id}>
              <Link
                to={`${projectPath(r.projectId)}?tab=servicios`}
                className="block rounded-[14px] bg-surface px-[14px] py-[13px] transition-[box-shadow] duration-300 ease-soft hover:shadow-pill"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-[10px]">
                    <Flag country={r.country} className="size-[20px]" labelled />
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-medium">
                        {r.label} · {r.person}
                      </span>
                      <span className="block truncate text-[12.5px] text-muted">
                        {r.code} · {countryNames[r.country]} · {r.owner}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-[12px]">
                    <span className="tabular text-[13px] font-medium">{formatPercent(stageProgress(r.stages).pct)}</span>
                    <StatusBadge variant="soft" meta={serviceStatusMeta[r.status]} />
                  </span>
                </div>
                <StageStepper stages={r.stages} className="mt-[14px]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
