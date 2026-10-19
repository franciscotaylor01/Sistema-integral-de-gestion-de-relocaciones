import type { LucideIcon } from 'lucide-react'
import { CircleDollarSign, FileText, Flag, MessageSquareText, Workflow } from 'lucide-react'
import type { ActivityKind } from '@/types/domain'

export const activityKindMeta: Record<ActivityKind, { label: string; icon: LucideIcon }> = {
  status: { label: 'Estado', icon: Flag },
  document: { label: 'Documentación', icon: FileText },
  finance: { label: 'Finanzas', icon: CircleDollarSign },
  note: { label: 'Nota', icon: MessageSquareText },
  service: { label: 'Servicio', icon: Workflow },
}
