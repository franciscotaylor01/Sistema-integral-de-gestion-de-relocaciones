import { logActivity } from '../activity'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'

/**
 * Commercial events attached to every project of a client (client-level
 * changes have no single project). When no project exists the event is
 * still accepted but not shown in any project timeline.
 */
export function logActivityGlobal(ds: Dataset, message: string, ctx: DomainContext, clientId?: string): Dataset {
  if (!clientId) return ds
  const projects = ds.projects.filter((p) => p.clientId === clientId && p.operationalStatus !== 'completed' && p.operationalStatus !== 'cancelled')
  return projects.reduce((acc, p) => logActivity(acc, { projectId: p.id, kind: 'commercial', message }, ctx), ds)
}
