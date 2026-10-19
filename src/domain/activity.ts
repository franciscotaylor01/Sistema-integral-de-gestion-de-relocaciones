import type { ActivityEvent } from '@/types/domain'
import type { DomainContext } from './context'
import type { Dataset } from './dataset'

export type ActivityInput = Omit<ActivityEvent, 'id' | 'date' | 'actorId'>

/** Prepends an activity event (newest first). */
export function logActivity(ds: Dataset, event: ActivityInput, ctx: DomainContext): Dataset {
  const entry: ActivityEvent = { id: ctx.newId('evt'), date: ctx.now(), actorId: ctx.actorId, ...event }
  return { ...ds, activity: [entry, ...ds.activity] }
}
