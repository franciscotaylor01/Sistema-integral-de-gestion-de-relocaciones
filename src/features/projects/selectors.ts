import { projectProgress as domainProjectProgress, serviceProgress as domainServiceProgress } from '@/domain/progress'
import type { Project, ProjectService } from '@/types/domain'

export const ACTIVE_PROJECT_STATUSES = ['onboarding', 'in-progress', 'on-hold'] as const

export function isActiveProject(p: Project): boolean {
  return (ACTIVE_PROJECT_STATUSES as readonly string[]).includes(p.operationalStatus)
}

/** Percentage of completed workflow stages (service + its procedures). */
export function serviceProgress(s: ProjectService): number {
  return domainServiceProgress(s, s.procedures).pct
}

/** Percentage of completed workflow stages across all services and procedures. */
export function projectProgress(p: Project): number {
  return domainProjectProgress(p.services, p.services.flatMap((s) => s.procedures)).pct
}

export function projectBudget(p: Project): number {
  return p.services.reduce((sum, s) => sum + (s.price ?? 0), 0)
}

export function projectEstimatedCost(p: Project): number {
  return p.services.reduce((sum, s) => sum + (s.estimatedCost ?? 0), 0)
}

/** Current workflow stage label of a service, or a summary when not running. */
export function currentStageLabel(s: ProjectService): string {
  const current = s.stages.find((st) => st.status === 'current')
  if (current) return current.label
  if (s.status === 'completed') return 'Finalizado'
  return s.stages[0]?.label ?? '—'
}
