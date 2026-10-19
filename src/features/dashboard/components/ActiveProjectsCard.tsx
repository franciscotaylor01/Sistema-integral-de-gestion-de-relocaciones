import { Card } from '@/components/ui/Card'
import { PillLink } from '@/components/ui/PillLink'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { isActiveProject } from '@/features/projects/selectors'
import type { Project } from '@/types/domain'

/** Vertix "Monthly Spending Limit" card: active portfolio and workflow completion. */
export function ActiveProjectsCard({ projects }: { projects: Project[] }) {
  const active = projects.filter(isActiveProject)
  const services = active.flatMap((p) => p.services)
  // Progress counts workflow stages of services and of their procedures.
  const stages = services.flatMap((s) => [...s.stages, ...s.procedures.flatMap((p) => p.stages)])
  const done = stages.filter((s) => s.status === 'done').length
  const blocked = services.filter((s) => s.status === 'blocked').length
  const running = services.filter((s) => s.status === 'in-progress').length

  return (
    <Card aria-labelledby="active-title" className="px-[20px] pb-[18px] pt-[18px]">
      <div className="flex h-[34px] items-center justify-between gap-3">
        <h2 id="active-title" className="text-[16px] font-medium leading-[1.3]">
          Proyectos activos
        </h2>
        <PillLink to="/proyectos?estado=activos">Ver</PillLink>
      </div>
      <p className="mt-[10px] flex items-baseline gap-[8px]">
        <span className="tabular text-[31px] font-semibold leading-none tracking-[-0.02em]">{active.length}</span>
        <span className="text-[13.5px] text-muted">con {services.length} servicios</span>
      </p>
      <ProgressBar
        className="mt-[18px]"
        value={done}
        max={stages.length}
        label="Avance de etapas en proyectos activos"
        valueText={`${done} de ${stages.length} etapas completadas`}
      />
      <div className="mt-[12px] flex items-baseline justify-between text-[12.5px]">
        <span>
          <span className="tabular font-semibold">{running}</span> <span className="text-muted">servicios en curso</span>
        </span>
        <span>
          <span className="tabular font-semibold text-danger">{blocked}</span> <span className="text-muted">bloqueados</span>
        </span>
      </div>
    </Card>
  )
}
