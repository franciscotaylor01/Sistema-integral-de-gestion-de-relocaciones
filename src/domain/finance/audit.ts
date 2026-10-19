import type { AuditEvent } from '@/types/domain'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'

/** Append-only audit trail: financial records are corrected, never silently edited. */
export function appendAudit(ds: Dataset, event: Omit<AuditEvent, 'id' | 'date' | 'actorId'>, ctx: DomainContext): Dataset {
  return { ...ds, audit: [{ id: ctx.newId('aud'), date: ctx.now(), actorId: ctx.actorId, ...event }, ...ds.audit] }
}
