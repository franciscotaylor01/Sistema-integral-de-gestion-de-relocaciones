import { getProcedureType } from '@/config/procedureCatalog'
import { getServiceType } from '@/config/serviceCatalog'
import type { Procedure, ServiceRecord, ServiceStatus, WorkflowStage } from '@/types/domain'
import { logActivity } from './activity'
import { findById, replaceById } from './collections'
import type { DomainContext } from './context'
import type { Dataset } from './dataset'
import { DomainError } from './errors'
import { spawnStageTasks } from './tasks'
import {
  addStage,
  allStagesDone,
  closeAllStages,
  completeStage,
  currentStage,
  reopenLastStage,
  setCurrentStage,
  updateStage,
  type NewStageInput,
  type StagePatch,
} from './workflow'

/**
 * Services and procedures share the same operational shape (workflow, owner,
 * status, notes). These operations work on either through a `WorkScope`.
 */
export type WorkScope = { kind: 'service'; id: string } | { kind: 'procedure'; id: string }
export type WorkItem = ServiceRecord | Procedure

export function getWorkItem(ds: Dataset, scope: WorkScope): WorkItem {
  const item = scope.kind === 'service' ? findById(ds.services, scope.id) : findById(ds.procedures, scope.id)
  if (!item) throw new DomainError(scope.kind === 'service' ? 'El servicio no existe.' : 'El trámite no existe.')
  return item
}

function setWorkItem(ds: Dataset, scope: WorkScope, update: (item: WorkItem) => WorkItem): Dataset {
  if (scope.kind === 'service') {
    return { ...ds, services: replaceById(ds.services, scope.id, (s) => update(s) as ServiceRecord) }
  }
  return { ...ds, procedures: replaceById(ds.procedures, scope.id, (p) => update(p) as Procedure) }
}

/** "Migraciones" or "Trámite DNI · Erik Vermeulen" — for activity messages. */
export function workItemLabel(ds: Dataset, scope: WorkScope): string {
  const item = getWorkItem(ds, scope)
  if (scope.kind === 'service') return getServiceType((item as ServiceRecord).typeId).label
  const p = item as Procedure
  const person = findById(ds.people, p.personId)
  return `trámite ${getProcedureType(p.typeId).label}${person ? ` · ${person.name}` : ''}`
}

function activityRefs(scope: WorkScope, item: WorkItem) {
  return scope.kind === 'service'
    ? { projectId: item.projectId, serviceId: item.id }
    : { projectId: item.projectId, serviceId: (item as Procedure).serviceId, procedureId: item.id }
}

function touchProject(ds: Dataset, projectId: string, ctx: DomainContext): Dataset {
  return { ...ds, projects: replaceById(ds.projects, projectId, (p) => ({ ...p, updatedAt: ctx.now() })) }
}

/** First real progress moves a project out of "Inicio". */
function promoteProject(ds: Dataset, projectId: string, ctx: DomainContext): Dataset {
  const project = findById(ds.projects, projectId)
  if (!project || project.operationalStatus !== 'onboarding') return ds
  const next = { ...ds, projects: replaceById(ds.projects, projectId, (p) => ({ ...p, operationalStatus: 'in-progress' as const })) }
  return logActivity(next, { projectId, kind: 'status', message: 'El proyecto pasó a «En curso» al registrarse el primer avance.' }, ctx)
}

function withActivated(ds: Dataset, scope: WorkScope, activated: WorkflowStage | undefined, ctx: DomainContext): Dataset {
  return activated ? spawnStageTasks(ds, scope, activated, ctx) : ds
}

export type StageAction =
  | { type: 'complete'; stageId: string }
  | { type: 'activate'; stageId: string }
  | { type: 'update'; stageId: string; patch: StagePatch }
  | { type: 'add'; input: NewStageInput }

export function applyStageAction(ds: Dataset, scope: WorkScope, action: StageAction, ctx: DomainContext): Dataset {
  const item = getWorkItem(ds, scope)
  const label = workItemLabel(ds, scope)
  const refs = activityRefs(scope, item)
  const locked = item.status === 'completed'

  if (locked && action.type !== 'update') {
    throw new DomainError('Este workflow está completado. Reabrilo para modificar sus etapas.')
  }

  let next = ds
  switch (action.type) {
    case 'complete': {
      const stage = item.stages.find((s) => s.id === action.stageId)
      const { stages, activated } = completeStage(item.stages, action.stageId, ctx.today())
      next = setWorkItem(next, scope, (it) => ({ ...it, stages, status: it.status === 'not-started' ? 'in-progress' : it.status }))
      next = logActivity(next, { ...refs, kind: 'service', message: `Etapa «${stage?.label}» completada en ${label}.` }, ctx)
      next = withActivated(next, scope, activated, ctx)
      next = promoteProject(next, item.projectId, ctx)
      break
    }
    case 'activate': {
      const stages = setCurrentStage(item.stages, action.stageId)
      const stage = stages.find((s) => s.id === action.stageId)
      next = setWorkItem(next, scope, (it) => ({ ...it, stages, status: it.status === 'not-started' ? 'in-progress' : it.status }))
      next = logActivity(next, { ...refs, kind: 'service', message: `Etapa actual de ${label}: «${stage?.label}».` }, ctx)
      next = withActivated(next, scope, stage, ctx)
      next = promoteProject(next, item.projectId, ctx)
      break
    }
    case 'update': {
      const stages = updateStage(item.stages, action.stageId, action.patch)
      const stage = stages.find((s) => s.id === action.stageId)
      next = setWorkItem(next, scope, (it) => ({ ...it, stages }))
      next = logActivity(next, { ...refs, kind: 'service', message: `Etapa «${stage?.label}» actualizada en ${label}.` }, ctx)
      break
    }
    case 'add': {
      const { stages, stage } = addStage(item.stages, action.input, ctx)
      next = setWorkItem(next, scope, (it) => ({ ...it, stages }))
      next = logActivity(next, { ...refs, kind: 'service', message: `Nueva etapa «${stage.label}» agregada a ${label}.` }, ctx)
      break
    }
  }
  return touchProject(next, item.projectId, ctx)
}

export type OpenStatus = Exclude<ServiceStatus, 'completed'>

const statusLabel: Record<ServiceStatus, string> = {
  'not-started': 'Sin iniciar',
  'in-progress': 'En curso',
  waiting: 'En espera',
  blocked: 'Bloqueado',
  completed: 'Completado',
}

/** Changes the status of an open workflow (use completeWork / reopenWork for completion). */
export function setWorkStatus(ds: Dataset, scope: WorkScope, status: OpenStatus, ctx: DomainContext): Dataset {
  const item = getWorkItem(ds, scope)
  if (item.status === 'completed') throw new DomainError('Reabrí el workflow antes de cambiar su estado.')
  if (item.status === status) return ds
  let stages = item.stages
  let activated: WorkflowStage | undefined
  if (status === 'in-progress' && !currentStage(stages) && !allStagesDone(stages)) {
    const first = stages.find((s) => s.status === 'pending')
    if (first) {
      stages = setCurrentStage(stages, first.id)
      activated = stages.find((s) => s.id === first.id)
    }
  }
  let next = setWorkItem(ds, scope, (it) => ({ ...it, status, stages }))
  next = logActivity(
    next,
    { ...activityRefs(scope, item), kind: 'status', message: `${capitalize(workItemLabel(ds, scope))}: estado «${statusLabel[status]}».` },
    ctx,
  )
  next = withActivated(next, scope, activated, ctx)
  if (status === 'in-progress') next = promoteProject(next, item.projectId, ctx)
  return touchProject(next, item.projectId, ctx)
}

/** Marks a workflow completed. Open stages must be explicitly closed by the caller. */
export function completeWork(ds: Dataset, scope: WorkScope, ctx: DomainContext, options: { closeOpenStages?: boolean } = {}): Dataset {
  const item = getWorkItem(ds, scope)
  if (item.status === 'completed') return ds
  const open = item.stages.filter((s) => s.status !== 'done').length
  if (open > 0 && !options.closeOpenStages) {
    throw new DomainError(`Quedan ${open} etapas abiertas. Confirmá que querés cerrarlas para completar.`)
  }
  let next = setWorkItem(ds, scope, (it) => ({
    ...it,
    status: 'completed',
    completedAt: ctx.today(),
    stages: closeAllStages(it.stages, ctx.today()),
  }))
  next = logActivity(next, { ...activityRefs(scope, item), kind: 'status', message: `${capitalize(workItemLabel(ds, scope))} marcado como completado.` }, ctx)
  return touchProject(next, item.projectId, ctx)
}

/** Reopens a completed workflow: the last stage becomes current again. */
export function reopenWork(ds: Dataset, scope: WorkScope, reason: string, ctx: DomainContext): Dataset {
  const item = getWorkItem(ds, scope)
  if (item.status !== 'completed') throw new DomainError('Solo se pueden reabrir workflows completados.')
  const why = reason.trim()
  if (!why) throw new DomainError('Indicá el motivo de la reapertura.', { reason: 'Indicá el motivo.' })
  let next = setWorkItem(ds, scope, (it) => ({ ...it, status: 'in-progress', completedAt: undefined, stages: reopenLastStage(it.stages) }))
  next = logActivity(
    next,
    { ...activityRefs(scope, item), kind: 'status', message: `${capitalize(workItemLabel(ds, scope))} reabierto. Motivo: ${why}` },
    ctx,
  )
  return touchProject(next, item.projectId, ctx)
}

export function addWorkNote(ds: Dataset, scope: WorkScope, text: string, ctx: DomainContext): Dataset {
  const item = getWorkItem(ds, scope)
  const body = text.trim()
  if (!body) throw new DomainError('La nota está vacía.', { text: 'Escribí una nota.' })
  if (body.length > 2000) throw new DomainError('La nota supera los 2000 caracteres.', { text: 'Máximo 2000 caracteres.' })
  const note = { id: ctx.newId('note'), authorId: ctx.actorId, date: ctx.now(), text: body }
  let next = setWorkItem(ds, scope, (it) => ({ ...it, notes: [note, ...it.notes] }))
  next = logActivity(next, { ...activityRefs(scope, item), kind: 'note', message: `Nota en ${workItemLabel(ds, scope)}: ${body}` }, ctx)
  return touchProject(next, item.projectId, ctx)
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
