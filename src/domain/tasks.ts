import { getWorkflowTemplate } from '@/config/workflowTemplates'
import type { Task, TaskStatus, WorkflowStage } from '@/types/domain'
import { logActivity } from './activity'
import { findById, replaceById } from './collections'
import type { DomainContext } from './context'
import type { Dataset } from './dataset'
import { DomainError, isIsoDate } from './errors'
import type { WorkScope } from './workItems'

export interface NewTaskInput {
  projectId: string
  serviceId: string
  procedureId?: string
  stageId?: string
  title: string
  description?: string
  ownerId: string
  dueDate?: string
  status?: TaskStatus
  waitingOn?: string
}

/** Every task must hang from a project and one of its services (and optionally a procedure / stage). */
function validateLinks(ds: Dataset, input: Pick<NewTaskInput, 'projectId' | 'serviceId' | 'procedureId' | 'stageId'>) {
  const project = findById(ds.projects, input.projectId)
  if (!project) throw new DomainError('La tarea debe pertenecer a un proyecto existente.', { projectId: 'Elegí un proyecto.' })
  const service = findById(ds.services, input.serviceId)
  if (!service || service.projectId !== project.id) {
    throw new DomainError('La tarea debe pertenecer a un servicio del proyecto.', { serviceId: 'Elegí un servicio del proyecto.' })
  }
  let stages: WorkflowStage[] = service.stages
  if (input.procedureId) {
    const procedure = findById(ds.procedures, input.procedureId)
    if (!procedure || procedure.serviceId !== service.id) {
      throw new DomainError('El trámite no pertenece al servicio elegido.', { procedureId: 'Elegí un trámite del servicio.' })
    }
    stages = procedure.stages
  }
  if (input.stageId && !stages.some((s) => s.id === input.stageId)) {
    throw new DomainError('La etapa no pertenece al workflow elegido.', { stageId: 'Elegí una etapa válida.' })
  }
}

function validateFields(ds: Dataset, input: { title?: string; ownerId?: string; dueDate?: string; status?: TaskStatus; waitingOn?: string }) {
  const fields: Record<string, string> = {}
  if (input.title !== undefined && !input.title.trim()) fields.title = 'Ingresá un título.'
  if (input.title && input.title.trim().length > 160) fields.title = 'Máximo 160 caracteres.'
  if (input.ownerId !== undefined && !ds.staff.some((s) => s.id === input.ownerId)) fields.ownerId = 'Elegí un responsable.'
  if (input.dueDate && !isIsoDate(input.dueDate)) fields.dueDate = 'Fecha inválida.'
  if (input.status === 'waiting' && !input.waitingOn?.trim()) fields.waitingOn = 'Indicá a quién se está esperando.'
  if (Object.keys(fields).length) throw new DomainError('Revisá los datos de la tarea.', fields)
}

export function createTask(ds: Dataset, input: NewTaskInput, ctx: DomainContext): { ds: Dataset; task: Task } {
  validateLinks(ds, input)
  validateFields(ds, input)
  const status = input.status ?? 'todo'
  const task: Task = {
    id: ctx.newId('tsk'),
    projectId: input.projectId,
    serviceId: input.serviceId,
    procedureId: input.procedureId || undefined,
    stageId: input.stageId || undefined,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    ownerId: input.ownerId,
    status,
    waitingOn: status === 'waiting' ? input.waitingOn?.trim() : undefined,
    dueDate: input.dueDate || undefined,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
    completedAt: status === 'done' ? ctx.today() : undefined,
  }
  let next: Dataset = { ...ds, tasks: [task, ...ds.tasks] }
  next = logActivity(
    next,
    { projectId: task.projectId, serviceId: task.serviceId, procedureId: task.procedureId, taskId: task.id, kind: 'task', message: `Tarea creada: ${task.title}.` },
    ctx,
  )
  return { ds: next, task }
}

export interface TaskPatch {
  title?: string
  description?: string
  ownerId?: string
  dueDate?: string
  status?: TaskStatus
  waitingOn?: string
}

const statusMessage: Record<TaskStatus, string> = {
  todo: 'volvió a pendiente',
  'in-progress': 'en curso',
  waiting: 'esperando a terceros',
  done: 'completada',
}

export function updateTask(ds: Dataset, taskId: string, patch: TaskPatch, ctx: DomainContext): Dataset {
  const task = findById(ds.tasks, taskId)
  if (!task) throw new DomainError('La tarea no existe.')
  const status = patch.status ?? task.status
  const waitingOn = patch.waitingOn !== undefined ? patch.waitingOn : task.waitingOn
  validateFields(ds, { ...patch, status, waitingOn })
  const updated: Task = {
    ...task,
    ...patch,
    title: patch.title !== undefined ? patch.title.trim() : task.title,
    description: patch.description !== undefined ? patch.description.trim() || undefined : task.description,
    dueDate: patch.dueDate !== undefined ? patch.dueDate || undefined : task.dueDate,
    status,
    waitingOn: status === 'waiting' ? waitingOn?.trim() : undefined,
    completedAt: status === 'done' ? (task.completedAt ?? ctx.today()) : undefined,
  }
  let next: Dataset = { ...ds, tasks: replaceById(ds.tasks, taskId, () => updated) }
  const refs = { projectId: task.projectId, serviceId: task.serviceId, procedureId: task.procedureId, taskId }
  const message =
    patch.status && patch.status !== task.status
      ? `Tarea «${updated.title}» ${statusMessage[status]}${status === 'waiting' ? ` (${updated.waitingOn})` : ''}.`
      : `Tarea «${updated.title}» actualizada.`
  next = logActivity(next, { ...refs, kind: 'task', message }, ctx)
  return next
}

/** Creates the template's default tasks for a stage that just became current (no duplicates). */
export function spawnStageTasks(ds: Dataset, scope: WorkScope, stage: WorkflowStage, ctx: DomainContext): Dataset {
  const item = scope.kind === 'service' ? findById(ds.services, scope.id) : findById(ds.procedures, scope.id)
  if (!item) return ds
  const template = getWorkflowTemplate(item.templateId)
  const titles = template?.stages.find((s) => s.key === stage.key)?.tasks ?? []
  if (titles.length === 0) return ds
  const serviceId = scope.kind === 'service' ? item.id : (item as { serviceId: string }).serviceId
  const procedureId = scope.kind === 'procedure' ? item.id : undefined
  const existing = new Set(ds.tasks.filter((t) => t.stageId === stage.id).map((t) => t.title))
  const created: Task[] = titles
    .filter((title) => !existing.has(title))
    .map((title) => ({
      id: ctx.newId('tsk'),
      projectId: item.projectId,
      serviceId,
      procedureId,
      stageId: stage.id,
      title,
      ownerId: stage.ownerId ?? item.ownerId,
      status: 'todo',
      dueDate: stage.dueDate,
      createdAt: ctx.now(),
      createdBy: ctx.actorId,
    }))
  return created.length ? { ...ds, tasks: [...created, ...ds.tasks] } : ds
}

/** Tasks still open (anything not done). */
export const isOpenTask = (t: Task) => t.status !== 'done'
