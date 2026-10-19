import { DEMO_TODAY } from '@/config/brand'
import { getProcedureType } from '@/config/procedureCatalog'
import { getServiceType } from '@/config/serviceCatalog'
import type { Workspace } from '@/hooks/useWorkspace'
import type { Task } from '@/types/domain'

export type TaskBucket = 'upcoming' | 'overdue' | 'waiting' | 'done'

export function taskBucket(t: Task, today = DEMO_TODAY): TaskBucket {
  if (t.status === 'done') return 'done'
  if (t.status === 'waiting') return 'waiting'
  if (t.dueDate && t.dueDate < today) return 'overdue'
  return 'upcoming'
}

export const isOverdue = (t: Task, today = DEMO_TODAY) => taskBucket(t, today) === 'overdue'

/** Sort: overdue first by date, then by due date (no date last), then title. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.status === 'done' && b.status === 'done') return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.title.localeCompare(b.title)
  })
}

export interface TaskLinks {
  projectCode?: string
  beneficiary?: string
  service?: string
  procedure?: string
  stage?: string
}

/** Human labels of the records a task is attached to. */
export function taskLinks(ws: Workspace, t: Task): TaskLinks {
  const project = ws.projectById.get(t.projectId)
  const service = ws.serviceById.get(t.serviceId)
  const procedure = t.procedureId ? ws.procedureById.get(t.procedureId) : undefined
  const stages = procedure?.stages ?? service?.stages ?? []
  return {
    projectCode: project?.code,
    beneficiary: project ? ws.personById.get(project.beneficiaryId)?.name : undefined,
    service: service ? getServiceType(service.typeId).label : undefined,
    procedure: procedure
      ? `${getProcedureType(procedure.typeId).label} · ${ws.personById.get(procedure.personId)?.name ?? ''}`
      : undefined,
    stage: t.stageId ? stages.find((s) => s.id === t.stageId)?.label : undefined,
  }
}
