import { ArrowUpRight, Mail, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { Flag } from '@/components/ui/Flag'
import { MetaBadge } from '@/components/ui/MetaBadge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Timeline } from '@/components/ui/Timeline'
import { countryNames, participantRoleLabel, serviceStatusMeta } from '@/config/catalogs'
import { getServiceType } from '@/config/serviceCatalog'
import { summarizeLedger } from '@/features/finance/selectors'
import { serviceProgress } from '@/domain/progress'
import { currentStage } from '@/domain/workflow'
import { sortTasks } from '@/features/tasks/selectors'
import { TaskList } from '@/features/tasks/TaskList'
import { TaskModal } from '@/features/tasks/TaskModal'
import { formatDateTime, formatShortDate } from '@/lib/dates'
import { formatCurrency, formatPercent } from '@/lib/format'
import { activityKindMeta } from '../activityMeta'
import type { ProjectContext } from '../projectContext'
import { projectBudget, projectEstimatedCost } from '../selectors'

type Tab = 'servicios' | 'operaciones' | 'finanzas' | 'actividad'

const linkButton =
  'group inline-flex items-center gap-[4px] rounded-full px-[10px] py-[5px] text-[13.5px] text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink'

export function OverviewTab({ ctx, onNavigate, onEdit }: { ctx: ProjectContext; onNavigate: (tab: Tab) => void; onEdit: () => void }) {
  const { project, beneficiary, family, workspace } = ctx
  const [taskId, setTaskId] = useState<string>()
  const ledger = summarizeLedger(workspace, ctx.invoices, ctx.obligations)
  const cur = project.currency
  const budget = projectBudget(project)
  const margin = budget - projectEstimatedCost(project)
  const openTasks = sortTasks(ctx.tasks.filter((t) => t.status !== 'done'))

  return (
    <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-3">
      <Card aria-labelledby="ov-people" className="px-[20px] pb-[18px] pt-[20px]">
        <SectionTitle
          id="ov-people"
          size="sm"
          title="Beneficiario y familia"
          action={
            <button type="button" onClick={onEdit} className={linkButton}>
              <Pencil aria-hidden className="size-[13px]" strokeWidth={2} />
              Editar
            </button>
          }
        />
        {beneficiary && (
          <>
            <div className="mt-[16px] flex items-center gap-[12px]">
              <Avatar name={beneficiary.name} className="size-[46px]" />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold">{beneficiary.name}</p>
                <p className="truncate text-[13.5px] text-muted">{beneficiary.jobTitle ?? 'Beneficiario/a principal'}</p>
              </div>
            </div>
            <dl className="mt-[16px] grid grid-cols-2 gap-[12px] rounded-panel bg-surface-muted p-[14px] text-[13.5px]">
              <div>
                <dt className="text-muted">Nacionalidad</dt>
                <dd className="mt-[3px] flex items-center gap-[7px] font-medium">
                  <Flag country={beneficiary.nationality} className="size-[16px]" />
                  {countryNames[beneficiary.nationality]}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted">Contacto</dt>
                <dd className="mt-[3px] truncate font-medium">
                  {beneficiary.email ? (
                    <a href={`mailto:${beneficiary.email}`} className="inline-flex items-center gap-[5px] hover:underline">
                      <Mail aria-hidden className="size-[13px]" strokeWidth={2} />
                      Email
                    </a>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-[18px] text-[13.5px] font-medium">
              Grupo familiar <span className="font-normal text-muted">· {family.length + 1} personas</span>
            </p>
            {family.length === 0 ? (
              <p className="mt-[8px] text-[13.5px] text-muted">Traslado individual, sin familiares.</p>
            ) : (
              <ul className="mt-[10px] flex flex-col gap-[8px]">
                {family.map(({ participant, person }) => (
                  <li key={participant.id} className="flex items-center gap-[10px]">
                    <Avatar name={person.name} className="size-[32px]" />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{person.name}</span>
                    <span className="shrink-0 text-[12.5px] text-muted">
                      {participantRoleLabel[participant.role]}
                      {person.age !== undefined && ` · ${person.age} años`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {project.notes && (
          <div className="mt-[18px] rounded-[14px] bg-surface-muted px-[14px] py-[11px]">
            <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-subtle">Notas del proyecto</p>
            <p className="mt-[4px] whitespace-pre-wrap text-[13.5px] leading-[1.5] text-ink-secondary">{project.notes}</p>
          </div>
        )}
      </Card>

      <Card aria-labelledby="ov-services" className="px-[20px] pb-[18px] pt-[20px] lg:col-span-2">
        <SectionTitle
          id="ov-services"
          title="Servicios del proyecto"
          description={`${project.services.length} servicios · avance calculado sobre etapas completadas`}
          action={
            <button type="button" onClick={() => onNavigate('servicios')} className={linkButton}>
              Gestionar
              <ArrowUpRight aria-hidden className="size-[14px]" strokeWidth={2} />
            </button>
          }
        />
        <ul className="mt-[16px] flex flex-col gap-[8px] rounded-panel bg-surface-muted p-[8px]">
          {project.services.map((s) => {
            const progress = serviceProgress(s, s.procedures)
            const active = currentStage(s.stages)
            const label = getServiceType(s.typeId).label
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onNavigate('servicios')}
                  className="grid w-full grid-cols-[auto_1fr] items-center gap-x-[12px] gap-y-[10px] rounded-[14px] bg-surface px-[14px] py-[12px] text-left transition-shadow duration-300 ease-soft hover:shadow-pill sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto]"
                >
                  <ServiceChip type={s.typeId} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-medium">{label}</span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {s.status === 'completed' ? 'Finalizado' : (active?.label ?? 'Sin iniciar')} · {workspace.staffById.get(s.ownerId)?.name}
                      {s.procedures.length > 0 && ` · ${s.procedures.length} trámites`}
                    </span>
                  </span>
                  <span className="col-span-2 flex items-center gap-[10px] sm:col-span-1">
                    <ProgressBar
                      value={progress.done}
                      max={progress.total || 1}
                      size="sm"
                      label={`Avance de ${label}`}
                      valueText={formatPercent(progress.pct)}
                      className="flex-1"
                      tone={s.status === 'blocked' ? 'danger' : s.status === 'completed' ? 'success' : 'accent'}
                    />
                    <span className="tabular w-[38px] text-right text-[12.5px] text-muted">{formatPercent(progress.pct)}</span>
                  </span>
                  <span className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end sm:gap-[2px]">
                    <StatusBadge meta={serviceStatusMeta[s.status]} className="text-[13px]" />
                    <span className="tabular text-[12px] text-subtle">vence {formatShortDate(s.dueDate)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card aria-labelledby="ov-tasks" className="px-[20px] pb-[18px] pt-[20px] lg:col-span-2">
        <SectionTitle
          id="ov-tasks"
          size="sm"
          title="Tareas abiertas"
          description={`${openTasks.length} pendientes en este proyecto`}
          action={
            <button type="button" onClick={() => onNavigate('operaciones')} className={linkButton}>
              Ver todas
              <ArrowUpRight aria-hidden className="size-[14px]" strokeWidth={2} />
            </button>
          }
        />
        <div className="mt-[14px] rounded-panel bg-surface-muted p-[8px]">
          <TaskList tasks={openTasks.slice(0, 5)} workspace={workspace} onOpen={setTaskId} showProject={false} emptyTitle="No hay tareas abiertas" />
        </div>
      </Card>

      <Card aria-labelledby="ov-finance" className="px-[20px] pb-[18px] pt-[20px]">
        <SectionTitle
          id="ov-finance"
          size="sm"
          title={
            <span className="flex items-center gap-[8px]">
              Resumen financiero <MetaBadge>Vista previa</MetaBadge>
            </span>
          }
          action={
            <button type="button" onClick={() => onNavigate('finanzas')} className={linkButton}>
              Finanzas
              <ArrowUpRight aria-hidden className="size-[14px]" strokeWidth={2} />
            </button>
          }
        />
        <dl className="mt-[14px] flex flex-col">
          {[
            { label: 'Presupuesto (referencia)', value: budget },
            { label: 'Facturado', value: ledger.invoiced[cur] ?? 0 },
            { label: 'Cobrado', value: ledger.collected[cur] ?? 0 },
            { label: 'Costos de proveedores', value: ledger.supplierCosts[cur] ?? 0 },
          ].map((f) => (
            <div key={f.label} className="flex items-center justify-between border-b border-line py-[10px] text-[14px] last:border-b-0">
              <dt className="text-ink-secondary">{f.label}</dt>
              <dd className="tabular font-medium">{formatCurrency(f.value, cur)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-[10px] flex items-center justify-between rounded-[14px] bg-success-soft px-[14px] py-[11px] text-success">
          <span className="text-[14px] font-medium">Margen estimado</span>
          <span className="tabular text-[14px] font-semibold">
            {formatCurrency(margin, cur)} · {formatPercent(budget ? (margin / budget) * 100 : 0)}
          </span>
        </div>
      </Card>

      <Card aria-labelledby="ov-activity" className="px-[20px] pb-[18px] pt-[20px] lg:col-span-3">
        <SectionTitle
          id="ov-activity"
          size="sm"
          title="Actividad reciente"
          action={
            <button type="button" onClick={() => onNavigate('actividad')} className={linkButton}>
              Ver todo
              <ArrowUpRight aria-hidden className="size-[14px]" strokeWidth={2} />
            </button>
          }
        />
        {ctx.activity.length === 0 ? (
          <p className="mt-[14px] text-[14px] text-muted">Todavía no hay actividad registrada.</p>
        ) : (
          <Timeline
            className="mt-[16px]"
            items={ctx.activity.slice(0, 5).map((e, i) => ({
              id: e.id,
              icon: activityKindMeta[e.kind].icon,
              title: e.message,
              meta: workspace.staffById.get(e.actorId)?.name,
              date: formatDateTime(e.date),
              highlight: i === 0,
            }))}
          />
        )}
      </Card>

      <TaskModal open={Boolean(taskId)} onClose={() => setTaskId(undefined)} workspace={workspace} taskId={taskId} />
    </div>
  )
}
