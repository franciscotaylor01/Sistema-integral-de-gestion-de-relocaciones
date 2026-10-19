import { projectPath } from '@/config/navigation'
import type { Workspace } from '@/hooks/useWorkspace'
import { daysUntil } from '@/lib/dates'
import { getServiceType } from '@/config/serviceCatalog'

export const DEADLINE_HORIZON_DAYS = 21

export interface Deadline {
  id: string
  title: string
  detail: string
  date: string
  href: string
  kind: 'service' | 'document'
}

export function collectDeadlines(ws: Workspace, horizon = DEADLINE_HORIZON_DAYS): Deadline[] {
  const services: Deadline[] = ws.projects.flatMap((p) =>
    p.services
      .filter((s) => s.status !== 'completed' && daysUntil(s.dueDate) >= 0 && daysUntil(s.dueDate) <= horizon)
      .map((s) => ({
        id: s.id,
        title: `${getServiceType(s.type).label} · ${ws.personById.get(p.beneficiaryId)?.name ?? ''}`,
        detail: p.code,
        date: s.dueDate,
        href: `${projectPath(p.id)}?tab=servicios`,
        kind: 'service' as const,
      })),
  )
  const documents: Deadline[] = ws.documents
    .filter((d) => d.expiresAt && daysUntil(d.expiresAt) >= 0 && daysUntil(d.expiresAt) <= horizon * 2)
    .map((d) => ({
      id: d.id,
      title: `Vence ${d.name.toLowerCase()} · ${d.holder}`,
      detail: ws.projectById.get(d.projectId)?.code ?? '',
      date: d.expiresAt as string,
      href: `${projectPath(d.projectId)}?tab=documentos`,
      kind: 'document' as const,
    }))
  return [...services, ...documents].sort((a, b) => a.date.localeCompare(b.date))
}

