import type { Project, ProjectService } from '@/types/domain'

export const ACTIVE_PROJECT_STATUSES = ['onboarding', 'in-progress', 'on-hold'] as const

export function isActiveProject(p: Project): boolean {
  return (ACTIVE_PROJECT_STATUSES as readonly string[]).includes(p.operationalStatus)
}

export function serviceProgress(s: ProjectService): number {
  if (s.stages.length === 0) return 0
  return Math.round((s.stages.filter((st) => st.status === 'done').length / s.stages.length) * 100)
}

/** Share of all workflow stages completed across the project's services. */
export function projectProgress(p: Project): number {
  const stages = p.services.flatMap((s) => s.stages)
  if (stages.length === 0) return 0
  return Math.round((stages.filter((st) => st.status === 'done').length / stages.length) * 100)
}

export function projectBudget(p: Project): number {
  return p.services.reduce((sum, s) => sum + s.price, 0)
}

export function projectEstimatedCost(p: Project): number {
  return p.services.reduce((sum, s) => sum + s.estimatedCost, 0)
}

/** Current workflow stage label of a service, or a summary when not running. */
export function currentStageLabel(s: ProjectService): string {
  const current = s.stages.find((st) => st.status === 'current')
  if (current) return current.label
  if (s.status === 'completed') return 'Finalizado'
  return s.stages[0]?.label ?? '—'
}
