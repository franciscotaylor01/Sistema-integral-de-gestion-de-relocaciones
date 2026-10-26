import { Pencil, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { AmountsText } from '@/components/ui/Amounts'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { commercialStageMeta } from '@/config/commercial'
import { hasAmount } from '@/domain/commercial/money'
import { projectCommercial } from '@/domain/commercial/traceability'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Fact } from '@/components/ui/Fact'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { getServiceType } from '@/config/serviceCatalog'
import { serviceProgress } from '@/domain/progress'
import { currentStage } from '@/domain/workflow'
import { sortTasks } from '@/features/tasks/selectors'
import { TaskList } from '@/features/tasks/TaskList'
import { NotesPanel } from '@/features/workflows/NotesPanel'
import { WorkflowPanel } from '@/features/workflows/WorkflowPanel'
import { WorkStatusControl } from '@/features/workflows/WorkStatusControl'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { daysUntil, formatDate, formatRelativeDays } from '@/lib/dates'
import { formatCurrency, formatPercent } from '@/lib/format'
import type { Project, ProjectDocument, ProjectService } from '@/types/domain'
import { ServiceScope } from '@/features/catalog/SpecialItems'
import { ProcedureCard } from './ProcedureCard'

type Section = 'workflow' | 'procedures' | 'tasks' | 'notes'

interface ServiceCardProps {
  service: ProjectService
  project: Project
  workspace: Workspace
  documents: ProjectDocument[]
  onEdit: () => void
  onAddProcedure: () => void
  onEditProcedure: (procedureId: string) => void
  onNewTask: () => void
  onOpenTask: (taskId: string) => void
}

/** One contracted service: own workflow, procedures, tasks, notes and lifecycle. */
export function ServiceCard({ service: s, project, workspace, documents, onEdit, onAddProcedure, onEditProcedure, onNewTask, onOpenTask }: ServiceCardProps) {
  const type = getServiceType(s.typeId)
  const supportsProcedures = (type.procedureTypes?.length ?? 0) > 0
  const [section, setSection] = useState<Section>('workflow')
  const progress = serviceProgress(s, s.procedures)
  const tasks = sortTasks(workspace.tasks.filter((t) => t.serviceId === s.id))
  const openTasks = tasks.filter((t) => t.status !== 'done')
  const days = daysUntil(s.dueDate)
  const issues = documents.filter((d) => d.serviceId === s.id && (d.status === 'expired' || d.status === 'missing'))
  const active = currentStage(s.stages)
  const prefix = `svc-${s.id}`
  const commercial = projectCommercial(workspace.dataset, project, DEMO_TODAY).get(s.id)!

  return (
    <Card aria-labelledby={`${s.id}-title`} className="px-[20px] pb-[20px] pt-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[12px]">
          <ServiceChip type={s.typeId} size="md" />
          <div className="min-w-0">
            <h2 id={`${s.id}-title`} className="truncate text-[17px] font-semibold tracking-[-0.01em]">
              {type.label}
            </h2>
            <p className="text-[13px] text-muted">
              {s.status === 'completed'
                ? `Completado el ${formatDate(s.completedAt ?? s.dueDate)}`
                : active
                  ? `Etapa actual: ${active.label}`
                  : 'Workflow sin iniciar'}{' '}
              · {formatPercent(progress.pct)} de avance{s.procedures.length > 0 && ' total (con trámites)'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-[6px]">
          <WorkStatusControl scope={{ kind: 'service', id: s.id }} status={s.status} stages={s.stages} noun="el servicio" />
          <Button size="sm" variant="outline" onClick={onEdit} className="h-[34px] px-[12px] text-[13px]">
            <Pencil aria-hidden className="size-[14px]" strokeWidth={1.9} />
            Editar
          </Button>
        </div>
      </div>

      <dl className="mt-[16px] grid grid-cols-2 gap-x-6 gap-y-4 rounded-panel bg-surface-muted px-[16px] py-[14px] md:grid-cols-4">
        <Fact label="Responsable">{workspace.staffById.get(s.ownerId)?.name}</Fact>
        <Fact label="Proveedor">{s.supplierId ? workspace.supplierById.get(s.supplierId)?.name : <span className="text-muted">Gestión interna</span>}</Fact>
        <Fact label="Vencimiento">
          <span className="tabular">{formatDate(s.dueDate)}</span>
          {s.status !== 'completed' && (
            <span className={cn('ml-[6px] text-[12.5px] font-normal', days < 0 ? 'text-danger' : days <= 7 ? 'text-warning' : 'text-muted')}>
              ({formatRelativeDays(s.dueDate)})
            </span>
          )}
        </Fact>
        <Fact label="Comercial">
          <Link to={`?tab=finanzas`} className="inline-flex items-center gap-[6px] hover:underline" title="Ver estado comercial">
            <StatusBadge meta={commercialStageMeta[commercial.stage]} className="text-[13.5px]" />
          </Link>
          {hasAmount(commercial.approved) ? (
            <span className="block text-[12.5px] font-normal text-muted">
              Aprobado <AmountsText inline amounts={commercial.approved} />
            </span>
          ) : (
            s.price !== undefined && <span className="tabular block text-[12.5px] font-normal text-muted">Ref. {formatCurrency(s.price, project.currency)}</span>
          )}
        </Fact>
      </dl>

      <ServiceScope service={s} project={project} ws={workspace} />

      {issues.length > 0 && (
        <div className="mt-[14px] rounded-[14px] bg-danger-soft px-[14px] py-[11px] text-[13.5px] text-danger">
          <span className="font-semibold">Bloqueo documental: </span>
          {issues.map((d) => `${d.name} de ${d.holder} (${d.status === 'expired' ? 'vencido' : 'faltante'})`).join(' · ')}
        </div>
      )}

      <div className="mt-[18px]">
        <Tabs
          size="sm"
          label={`Secciones de ${type.label}`}
          idPrefix={prefix}
          value={section}
          onChange={setSection}
          items={[
            { value: 'workflow', label: 'Workflow' },
            ...(supportsProcedures ? [{ value: 'procedures' as const, label: 'Trámites', count: s.procedures.length }] : []),
            { value: 'tasks', label: 'Tareas', count: openTasks.length },
            { value: 'notes', label: 'Notas', count: s.notes.length },
          ]}
        />
      </div>

      <div className="mt-[16px]">
        <TabPanel idPrefix={prefix} activeValue={section}>
          {section === 'workflow' && (
            <WorkflowPanel scope={{ kind: 'service', id: s.id }} stages={s.stages} status={s.status} workspace={workspace} onOpenTask={onOpenTask} />
          )}
          {section === 'procedures' && (
            <div className="flex flex-col gap-[10px]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13.5px] text-muted">Trámites por persona dentro de este servicio. Una persona puede tener varios a lo largo del tiempo.</p>
                {s.status !== 'completed' && (
                  <Button size="sm" variant="outline" onClick={onAddProcedure}>
                    <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
                    Nuevo trámite
                  </Button>
                )}
              </div>
              {s.procedures.length === 0 ? (
                <div className="rounded-panel bg-surface-muted p-[2px]">
                  <EmptyState title="Sin trámites" description="Iniciá un trámite de residencia, DNI, TIE, visa u otro para una persona del proyecto." className="py-8" />
                </div>
              ) : (
                <div className="flex flex-col gap-[10px] rounded-panel bg-surface-muted p-[8px]">
                  {s.procedures.map((p) => (
                    <ProcedureCard key={p.id} procedure={p} workspace={workspace} onEdit={() => onEditProcedure(p.id)} onOpenTask={onOpenTask} />
                  ))}
                </div>
              )}
            </div>
          )}
          {section === 'tasks' && (
            <div className="flex flex-col gap-[10px]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13.5px] text-muted">
                  {openTasks.length} abiertas · {tasks.length - openTasks.length} completadas
                </p>
                <Button size="sm" variant="outline" onClick={onNewTask}>
                  <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
                  Nueva tarea
                </Button>
              </div>
              <div className="rounded-panel bg-surface-muted p-[8px]">
                <TaskList
                  tasks={[...openTasks, ...tasks.filter((t) => t.status === 'done')]}
                  workspace={workspace}
                  onOpen={onOpenTask}
                  showProject={false}
                  emptyTitle="Sin tareas"
                  emptyDescription="Las tareas de cada etapa se crean al activarla; también podés agregar las tuyas."
                />
              </div>
            </div>
          )}
          {section === 'notes' && <NotesPanel scope={{ kind: 'service', id: s.id }} notes={s.notes} workspace={workspace} />}
        </TabPanel>
      </div>
    </Card>
  )
}
