import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { taskStatusMeta } from '@/config/catalogs'
import { projectPath } from '@/config/navigation'
import { getProcedureType } from '@/config/procedureCatalog'
import { getServiceType } from '@/config/serviceCatalog'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import type { TaskStatus } from '@/types/domain'

export interface TaskPreset {
  projectId?: string
  serviceId?: string
  procedureId?: string
  stageId?: string
}

interface TaskModalProps {
  open: boolean
  onClose: () => void
  workspace: Workspace
  /** Edit an existing task… */
  taskId?: string
  /** …or create one, optionally pre-linked (links become fixed). */
  preset?: TaskPreset
}

export function TaskModal(props: TaskModalProps) {
  const task = props.taskId ? props.workspace.taskById.get(props.taskId) : undefined
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={task ? 'Detalle de la tarea' : 'Nueva tarea'}
      description={task ? undefined : 'Toda tarea queda vinculada a un proyecto y a uno de sus servicios.'}
      size="md"
    >
      {props.open && <TaskForm key={props.taskId ?? 'new'} {...props} />}
    </Modal>
  )
}

const STATUSES: TaskStatus[] = ['todo', 'in-progress', 'waiting', 'done']

function TaskForm({ onClose, workspace: ws, taskId, preset = {} }: TaskModalProps) {
  const actions = useActions()
  const user = useCurrentUser()
  const { run, busy, errors, formError } = useCommand()
  const task = taskId ? ws.taskById.get(taskId) : undefined

  const [projectId, setProjectId] = useState(task?.projectId ?? preset.projectId ?? '')
  const [serviceId, setServiceId] = useState(task?.serviceId ?? preset.serviceId ?? '')
  const [procedureId, setProcedureId] = useState(task?.procedureId ?? preset.procedureId ?? '')
  const [stageId, setStageId] = useState(task?.stageId ?? preset.stageId ?? '')
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [ownerId, setOwnerId] = useState(task?.ownerId ?? user?.id ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo')
  const [waitingOn, setWaitingOn] = useState(task?.waitingOn ?? '')

  const linksFixed = Boolean(task) || Boolean(preset.serviceId)
  const project = ws.projectById.get(projectId)
  const services = project?.services ?? []
  const service = ws.serviceById.get(serviceId)
  const procedures = service?.procedures ?? []
  const stages = (procedureId ? ws.procedureById.get(procedureId)?.stages : service?.stages) ?? []
  const openProjects = ws.projects.filter((p) => p.operationalStatus !== 'cancelled').sort((a, b) => b.code.localeCompare(a.code))

  const save = async () => {
    const fields = { title, description, ownerId: ownerId || user?.id || '', dueDate, status, waitingOn }
    const ok = task
      ? await run(() => actions.updateTask(task.id, fields), { title: 'Tarea actualizada' })
      : await run(
          () => actions.createTask({ ...fields, projectId, serviceId, procedureId: procedureId || undefined, stageId: stageId || undefined }),
          { title: 'Tarea creada', description: title },
        )
    if (ok) onClose()
  }

  const procedure = procedureId ? ws.procedureById.get(procedureId) : undefined
  const linkTrail = [
    service && getServiceType(service.typeId).label,
    procedure && `${getProcedureType(procedure.typeId).label} · ${ws.personById.get(procedure.personId)?.name ?? ''}`,
    stages.find((s) => s.id === stageId)?.label,
  ]
    .filter(Boolean)
    .join(' › ')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="flex flex-col gap-[14px]"
    >
      <FormError message={formError} />

      {linksFixed && project ? (
        <div className="rounded-[14px] bg-surface-muted px-[14px] py-[11px] text-[13.5px]">
          <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-subtle">Vinculada a</p>
          <p className="mt-[4px] font-medium">
            {project.code} · {ws.personById.get(project.beneficiaryId)?.name}
          </p>
          <p className="mt-[2px] text-ink-secondary">
            {linkTrail}
          </p>
          <Link
            to={`${projectPath(project.id)}?tab=servicios`}
            onClick={onClose}
            className="mt-[8px] inline-flex items-center gap-[4px] text-[13px] font-medium text-ink-secondary underline-offset-4 hover:text-ink hover:underline"
          >
            Ir al servicio
            <ArrowUpRight aria-hidden className="size-[13px]" strokeWidth={2} />
          </Link>
        </div>
      ) : (
        <div className="grid gap-[14px] sm:grid-cols-2">
          <Field label="Proyecto" required error={errors.projectId}>
            {(p) => (
              <SelectInput
                {...p}
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value)
                  setServiceId('')
                  setProcedureId('')
                  setStageId('')
                }}
              >
                <option value="">Elegí un proyecto</option>
                {openProjects.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.code} · {ws.personById.get(pr.beneficiaryId)?.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Servicio" required error={errors.serviceId}>
            {(p) => (
              <SelectInput
                {...p}
                value={serviceId}
                disabled={!project}
                onChange={(e) => {
                  setServiceId(e.target.value)
                  setProcedureId('')
                  setStageId('')
                }}
              >
                <option value="">{project ? 'Elegí un servicio' : 'Primero elegí un proyecto'}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getServiceType(s.typeId).label}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          {procedures.length > 0 && (
            <Field label="Trámite (opcional)" error={errors.procedureId}>
              {(p) => (
                <SelectInput
                  {...p}
                  value={procedureId}
                  onChange={(e) => {
                    setProcedureId(e.target.value)
                    setStageId('')
                  }}
                >
                  <option value="">Sin trámite específico</option>
                  {procedures.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {getProcedureType(pr.typeId).label} · {ws.personById.get(pr.personId)?.name}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
          )}
          {stages.length > 0 && (
            <Field label="Etapa (opcional)" error={errors.stageId}>
              {(p) => (
                <SelectInput {...p} value={stageId} onChange={(e) => setStageId(e.target.value)}>
                  <option value="">Sin etapa específica</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
          )}
        </div>
      )}

      <Field label="Título" required error={errors.title}>
        {(p) => <TextInput {...p} data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ej.: Pedir turno en RENAPER" />}
      </Field>
      <Field label="Descripción">{(p) => <TextArea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />}</Field>
      <div className="grid gap-[14px] sm:grid-cols-3">
        <Field label="Responsable" required error={errors.ownerId}>
          {(p) => (
            <SelectInput {...p} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {ws.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.id === user?.id ? ' (yo)' : ''}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Vencimiento" error={errors.dueDate}>
          {(p) => <DateInput {...p} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
        </Field>
        <Field label="Estado">
          {(p) => (
            <SelectInput {...p} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {taskStatusMeta[s].label}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
      </div>
      {status === 'waiting' && (
        <Field label="Esperando a" required error={errors.waitingOn} hint="Consulado, cliente, proveedor, familia…">
          {(p) => <TextInput {...p} value={waitingOn} onChange={(e) => setWaitingOn(e.target.value)} maxLength={80} />}
        </Field>
      )}
      {task && (
        <p className="text-[12.5px] text-muted">
          Creada el {formatDate(task.createdAt)} por {ws.staffById.get(task.createdBy)?.name ?? '—'}
          {task.completedAt && ` · completada el ${formatDate(task.completedAt)}`}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : task ? 'Guardar cambios' : 'Crear tarea'}
        </Button>
      </div>
    </form>
  )
}
