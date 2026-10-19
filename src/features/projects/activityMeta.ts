import type { LucideIcon } from 'lucide-react'
import { BriefcaseBusiness, CircleDollarSign, FileText, Flag, ListChecks, MessageSquareText, Stamp, Workflow } from 'lucide-react'
import type { ActivityKind } from '@/types/domain'

export const activityKindMeta: Record<ActivityKind, { label: string; icon: LucideIcon }> = {
  project: { label: 'Proyecto', icon: BriefcaseBusiness },
  status: { label: 'Estado', icon: Flag },
  service: { label: 'Servicio', icon: Workflow },
  procedure: { label: 'Trámite', icon: Stamp },
  task: { label: 'Tarea', icon: ListChecks },
  note: { label: 'Nota', icon: MessageSquareText },
  document: { label: 'Documentación', icon: FileText },
  finance: { label: 'Finanzas', icon: CircleDollarSign },
}
