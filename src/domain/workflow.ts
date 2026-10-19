import { getWorkflowTemplate, type StageTemplate } from '@/config/workflowTemplates'
import type { WorkflowStage } from '@/types/domain'
import type { DomainContext } from './context'
import { addDays, daysBetween } from './dates'
import { DomainError } from './errors'

/**
 * Pure operations on a stage list. Invariant: at most one stage is `current`,
 * and it is the active step of the workflow.
 */

/** Spreads due dates across [start, due] proportionally to stage weights. */
export function scheduleStages(templates: StageTemplate[], startDate: string, dueDate: string): string[] {
  const total = templates.reduce((s, t) => s + (t.weight ?? 1), 0)
  const span = Math.max(0, daysBetween(startDate, dueDate))
  let acc = 0
  return templates.map((t) => {
    acc += t.weight ?? 1
    return addDays(startDate, Math.round((span * acc) / total))
  })
}

export function instantiateStages(
  templateId: string,
  startDate: string,
  dueDate: string,
  ctx: DomainContext,
  options: { activateFirst?: boolean } = {},
): WorkflowStage[] {
  const template = getWorkflowTemplate(templateId)
  if (!template) throw new DomainError(`No existe la plantilla de workflow "${templateId}".`)
  const dates = scheduleStages(template.stages, startDate, dueDate)
  return template.stages.map((st, i) => ({
    id: ctx.newId('stg'),
    key: st.key,
    label: st.label,
    status: options.activateFirst && i === 0 ? 'current' : 'pending',
    dueDate: dates[i],
  }))
}

export interface StageProgress {
  done: number
  total: number
  pct: number
}

export function stageProgress(stages: WorkflowStage[]): StageProgress {
  const done = stages.filter((s) => s.status === 'done').length
  return { done, total: stages.length, pct: stages.length ? Math.round((done / stages.length) * 100) : 0 }
}

export const currentStage = (stages: WorkflowStage[]) => stages.find((s) => s.status === 'current')
export const allStagesDone = (stages: WorkflowStage[]) => stages.length > 0 && stages.every((s) => s.status === 'done')

function requireStage(stages: WorkflowStage[], stageId: string): number {
  const idx = stages.findIndex((s) => s.id === stageId)
  if (idx < 0) throw new DomainError('La etapa no pertenece a este workflow.')
  return idx
}

/**
 * Marks a stage done. If no stage remains current, the next pending stage after
 * it becomes current. Returns the newly activated stage, if any.
 */
export function completeStage(stages: WorkflowStage[], stageId: string, today: string): { stages: WorkflowStage[]; activated?: WorkflowStage } {
  const idx = requireStage(stages, stageId)
  if (stages[idx].status === 'done') return { stages }
  let next = stages.map((s, i) => (i === idx ? { ...s, status: 'done' as const, completedAt: today } : s))
  if (currentStage(next)) return { stages: next }
  const following = next.findIndex((s, i) => i > idx && s.status === 'pending')
  const target = following >= 0 ? following : next.findIndex((s) => s.status === 'pending')
  if (target < 0) return { stages: next }
  next = next.map((s, i) => (i === target ? { ...s, status: 'current' as const } : s))
  return { stages: next, activated: next[target] }
}

/** Makes a stage the active one (reopening it if it was done). */
export function setCurrentStage(stages: WorkflowStage[], stageId: string): WorkflowStage[] {
  const idx = requireStage(stages, stageId)
  return stages.map((s, i) => {
    if (i === idx) return { ...s, status: 'current' as const, completedAt: undefined }
    if (s.status === 'current') return { ...s, status: 'pending' as const }
    return s
  })
}

export interface StagePatch {
  label?: string
  dueDate?: string
  ownerId?: string
  notes?: string
}

export function updateStage(stages: WorkflowStage[], stageId: string, patch: StagePatch): WorkflowStage[] {
  const idx = requireStage(stages, stageId)
  if (patch.label !== undefined && !patch.label.trim()) throw new DomainError('La etapa necesita un nombre.', { label: 'Ingresá un nombre.' })
  return stages.map((s, i) =>
    i === idx
      ? {
          ...s,
          ...patch,
          label: patch.label?.trim() ?? s.label,
          notes: patch.notes !== undefined ? patch.notes.trim() || undefined : s.notes,
          ownerId: patch.ownerId !== undefined ? patch.ownerId || undefined : s.ownerId,
        }
      : s,
  )
}

export interface NewStageInput {
  label: string
  dueDate?: string
  ownerId?: string
  /** Insert after this stage; appended at the end when omitted. */
  afterStageId?: string
}

/** Adds a custom stage. It becomes current only if the workflow has no active stage and is not finished. */
export function addStage(stages: WorkflowStage[], input: NewStageInput, ctx: DomainContext): { stages: WorkflowStage[]; stage: WorkflowStage } {
  const label = input.label.trim()
  if (!label) throw new DomainError('La etapa necesita un nombre.', { label: 'Ingresá un nombre.' })
  const stage: WorkflowStage = {
    id: ctx.newId('stg'),
    key: `custom-${ctx.newId('k').slice(-8)}`,
    label,
    status: 'pending',
    dueDate: input.dueDate || undefined,
    ownerId: input.ownerId || undefined,
  }
  const at = input.afterStageId ? requireStage(stages, input.afterStageId) + 1 : stages.length
  const next = [...stages.slice(0, at), stage, ...stages.slice(at)]
  return { stages: next, stage }
}

/** Closes every open stage (used when a service/procedure is marked completed). */
export function closeAllStages(stages: WorkflowStage[], today: string): WorkflowStage[] {
  return stages.map((s) => (s.status === 'done' ? s : { ...s, status: 'done' as const, completedAt: today }))
}

/** Reopens the last stage so work can resume. */
export function reopenLastStage(stages: WorkflowStage[]): WorkflowStage[] {
  if (stages.length === 0) return stages
  return setCurrentStage(stages, stages[stages.length - 1].id)
}
