import type { StatusMeta } from '@/config/catalogs'
import type { CertificateStatus, OpenOrderStatus, PoMode } from '@/types/domain'

export const poModeLabel: Record<PoMode, string> = {
  open: 'OC abierta por cliente / provincia',
  project: 'OC por proyecto',
  none: 'Sin OC obligatoria',
}

export const openOrderStatusMeta: Record<OpenOrderStatus, StatusMeta> = {
  active: { label: 'Vigente', tone: 'success' },
  suspended: { label: 'Suspendida', tone: 'warning' },
  expired: { label: 'Vencida', tone: 'neutral' },
  cancelled: { label: 'Anulada', tone: 'neutral' },
}

export const certificateStatusMeta: Record<CertificateStatus, StatusMeta> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  submitted: { label: 'Presentado', tone: 'info' },
  approved: { label: 'Aprobado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
}
