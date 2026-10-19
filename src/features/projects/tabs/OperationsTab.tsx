import { CheckCircle2, CircleDashed, CircleDot, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Tabs } from '@/components/ui/Tabs'
import { Timeline } from '@/components/ui/Timeline'
import { documentStatusMeta, serviceStatusMeta } from '@/config/catalogs'
import { getProcedureType } from '@/config/procedureCatalog'
import { getServiceType } from '@/config/serviceCatalog'
import { sortTasks, taskBucket } from '@/features/tasks/selectors'
import { TaskList } from '@/features/tasks/TaskList'
import { TaskModal } from '@/features/tasks/TaskModal'
import { daysUntil, formatDate, formatRelativeDays } from '@/lib/dates'
import type { ServiceStatus, ServiceType, StageStatus } from '@/types/domain'
import type { ProjectContext } from '../projectContext'

interface PlanItem {
  id: string
  label: string
  type: ServiceType
  context: string
  status: StageStatus
  date?: string
}

interface Blocker {
  id: string
  type: ServiceType
  title: string
  owner?: string
  status: ServiceStatus
}

type TaskView = 'open' | 'waiting' | 'done'
const stageIcon = { done: CheckCircle2, current: CircleDot, pending: CircleDashed } as const

/** Work plan across services and procedures, project tasks, blockers and documents. */
export function OperationsTab({ ctx }: { ctx: ProjectContext }) {
  const { project, workspace } = ctx
  const [view, setView] = useState<TaskView>('open')
  const [taskId, setTaskId] = useState<string>()
  const [creating, setCreating] = useState(false)

  const plan: PlanItem[] = project.services.flatMap((s) => [
    ...s.stages.map((st) => ({ id: st.id, label: st.label, type: s.typeId, context: getServiceType(s.typeId).label, status: st.status, date: st.completedAt ?? st.dueDate })),
    ...s.procedures.flatMap((p) =>
      p.stages.map((st) => ({
        id: st.id,
        label: st.label,
        type: s.typeId,
        context: `${getProcedureType(p.typeId).label} · ${workspace.personById.get(p.personId)?.name ?? ''}`,
        status: st.status,
        date: st.completedAt ?? st.dueDate,
      })),
    ),
  ])
  const current = plan.filter((p) => p.status === 'current').sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const upcoming = plan.filter((p) => p.status === 'pending').sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).slice(0, 6)

  const blockers: Blocker[] = [
    ...project.services
      .filter((s) => s.status === 'blocked' || s.status === 'waiting')
      .map((s) => ({ id: s.id, type: s.typeId, title: getServiceType(s.typeId).label, owner: workspace.staffById.get(s.ownerId)?.name, status: s.status })),
    ...project.services.flatMap((s) =>
      s.procedures
        .filter((p) => p.status === 'blocked' || p.status === 'waiting')
        .map((p) => ({
          id: p.id,
          type: s.typeId,
          title: `${getProcedureType(p.typeId).label} · ${workspace.personById.get(p.personId)?.name ?? ''}`,
          owner: workspace.staffById.get(p.ownerId)?.name,
          status: p.status,
        })),
    ),
  ]
  const docAlerts = ctx.documents.filter((d) => d.status !== 'valid' && d.status !== 'in-review')

  const tasks = sortTasks(ctx.tasks)
  const byView: Record<TaskView, typeof tasks> = {
    open: tasks.filter((t) => t.status !== 'done' && t.status !== 'waiting'),
    waiting: tasks.filter((t) => taskBucket(t) === 'waiting'),
    done: tasks.filter((t) => t.status === 'done'),
  }

  const toEntry = (p: PlanItem) => ({
    id: p.id,
    icon: stageIcon[p.status],
    highlight: p.status === 'current',
    title: (
      <span className="inline-flex flex-wrap items-center gap-[8px]">
        <ServiceChip type={p.type} />
        <span className="font-medium">{p.label}</span>
      </span>
    ),
    meta: p.context,
    date: p.date ? `${formatDate(p.date)} · ${formatRelativeDays(p.date)}` : '—',
  })

  return (
    <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-[24px] lg:col-span-2">
        <Card aria-labelledby="ops-tasks" className="px-[20px] pb-[20px] pt-[20px]">
          <SectionTitle
            id="ops-tasks"
            title="Tareas del proyecto"
            description="Vinculadas a cada servicio, trámite y etapa"
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
                Nueva tarea
              </Button>
            }
          />
          <Tabs
            className="mt-[16px]"
            size="sm"
            label="Filtro de tareas"
            idPrefix="project-tasks"
            value={view}
            onChange={setView}
            items={[
              { value: 'open', label: 'Abiertas', count: byView.open.length },
              { value: 'waiting', label: 'Esperando a terceros', count: byView.waiting.length },
              { value: 'done', label: 'Completadas', count: byView.done.length },
            ]}
          />
          <div className="mt-[14px] rounded-panel bg-surface-muted p-[8px]">
            <TaskList tasks={byView[view]} workspace={workspace} onOpen={setTaskId} showProject={false} emptyTitle="Sin tareas en esta vista" />
          </div>
        </Card>

        <Card aria-labelledby="ops-plan" className="px-[20px] pb-[20px] pt-[20px]">
          <SectionTitle id="ops-plan" title="Plan de trabajo" description="Etapas en curso y próximas de todos los servicios y trámites" />
          <h3 className="mt-[20px] text-[13px] font-medium uppercase tracking-[0.06em] text-subtle">En curso</h3>
          {current.length === 0 ? <p className="mt-[8px] text-[14px] text-muted">No hay etapas en curso.</p> : <Timeline className="mt-[12px]" items={current.map(toEntry)} />}
          <h3 className="mt-[24px] text-[13px] font-medium uppercase tracking-[0.06em] text-subtle">Próximas etapas</h3>
          {upcoming.length === 0 ? (
            <p className="mt-[8px] text-[14px] text-muted">Todas las etapas planificadas están completas.</p>
          ) : (
            <Timeline className="mt-[12px]" items={upcoming.map(toEntry)} />
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-[24px]">
        <Card aria-labelledby="ops-blockers" className="px-[20px] pb-[18px] pt-[20px]">
          <SectionTitle id="ops-blockers" size="sm" title="Bloqueos y esperas" />
          {blockers.length === 0 ? (
            <p className="mt-[12px] text-[14px] text-muted">Sin bloqueos activos.</p>
          ) : (
            <ul className="mt-[14px] flex flex-col gap-[8px]">
              {blockers.map((b) => (
                <li key={b.id} className="flex items-center gap-[12px] rounded-[14px] bg-surface-muted px-[12px] py-[10px]">
                  <ServiceChip type={b.type} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{b.title}</span>
                    <span className="block truncate text-[12px] text-muted">{b.owner}</span>
                  </span>
                  <StatusBadge meta={serviceStatusMeta[b.status]} className="text-[13px]" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="ops-docs" className="px-[20px] pb-[18px] pt-[20px]">
          <SectionTitle id="ops-docs" size="sm" title="Documentación a resolver" />
          {docAlerts.length === 0 ? (
            <p className="mt-[12px] text-[14px] text-muted">Toda la documentación está vigente o en revisión.</p>
          ) : (
            <ul className="mt-[14px] flex flex-col gap-[8px]">
              {docAlerts.map((d) => (
                <li key={d.id} className="rounded-[14px] bg-surface-muted px-[12px] py-[10px]">
                  <p className="flex items-center justify-between gap-3">
                    <span className="truncate text-[14px] font-medium">{d.name}</span>
                    <StatusBadge meta={documentStatusMeta[d.status]} className="shrink-0 text-[12.5px]" />
                  </p>
                  <p className="mt-[2px] text-[12px] text-muted">
                    {d.holder}
                    {d.expiresAt && ` · ${daysUntil(d.expiresAt) < 0 ? 'venció' : 'vence'} ${formatRelativeDays(d.expiresAt)}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <TaskModal open={Boolean(taskId)} onClose={() => setTaskId(undefined)} workspace={workspace} taskId={taskId} />
      <TaskModal open={creating} onClose={() => setCreating(false)} workspace={workspace} preset={{ projectId: project.id }} />
    </div>
  )
}
