import type { LucideIcon } from 'lucide-react'
import { BookOpenCheck, Home, Stamp } from 'lucide-react'
import type {
  AlertSeverity,
  ClientStatus,
  CountryCode,
  DocumentKind,
  DocumentStatus,
  InvoiceStatus,
  ParticipantRole,
  PayableStatus,
  ProjectFinancialStatus,
  ProjectCategory,
  ProjectOperationalStatus,
  ServiceStatus,
  TaskStatus,
} from '@/types/domain'

/** Semantic color of a status, resolved to tokens by <StatusBadge>. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'

export interface StatusMeta {
  label: string
  tone: Tone
}

export const operationalStatusMeta: Record<ProjectOperationalStatus, StatusMeta> = {
  onboarding: { label: 'Inicio', tone: 'info' },
  'in-progress': { label: 'En curso', tone: 'accent' },
  'on-hold': { label: 'En pausa', tone: 'warning' },
  completed: { label: 'Finalizado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
}

export const financialStatusMeta: Record<ProjectFinancialStatus, StatusMeta> = {
  'to-quote': { label: 'A cotizar', tone: 'neutral' },
  quoted: { label: 'Cotizado', tone: 'info' },
  'po-received': { label: 'OC recibida', tone: 'info' },
  invoiced: { label: 'Facturado', tone: 'accent' },
  'partially-collected': { label: 'Cobro parcial', tone: 'warning' },
  collected: { label: 'Cobrado', tone: 'success' },
  overdue: { label: 'Vencido', tone: 'danger' },
}

export const serviceStatusMeta: Record<ServiceStatus, StatusMeta> = {
  'not-started': { label: 'Sin iniciar', tone: 'neutral' },
  'in-progress': { label: 'En curso', tone: 'accent' },
  waiting: { label: 'En espera', tone: 'info' },
  blocked: { label: 'Bloqueado', tone: 'danger' },
  completed: { label: 'Completado', tone: 'success' },
}

export const invoiceStatusMeta: Record<InvoiceStatus, StatusMeta> = {
  draft: { label: 'Preparada · sin emitir', tone: 'neutral' },
  issued: { label: 'Pendiente de cobro', tone: 'info' },
  'partially-paid': { label: 'Parcialmente conciliada', tone: 'warning' },
  paid: { label: 'Conciliada', tone: 'success' },
  overdue: { label: 'Vencida', tone: 'danger' },
  cancelled: { label: 'Anulada', tone: 'neutral' },
}

export const payableStatusMeta: Record<PayableStatus, StatusMeta> = {
  scheduled: { label: 'Programado', tone: 'info' },
  'pending-approval': { label: 'A aprobar', tone: 'warning' },
  'partially-paid': { label: 'Pago parcial', tone: 'warning' },
  paid: { label: 'Pagado', tone: 'success' },
  overdue: { label: 'Vencido', tone: 'danger' },
  cancelled: { label: 'Anulado', tone: 'neutral' },
  'awaiting-collection': { label: 'Espera cobro cliente', tone: 'accent' },
}

export const documentStatusMeta: Record<DocumentStatus, StatusMeta> = {
  valid: { label: 'Vigente', tone: 'success' },
  expiring: { label: 'Por vencer', tone: 'warning' },
  expired: { label: 'Vencido', tone: 'danger' },
  'in-review': { label: 'En revisión', tone: 'info' },
  missing: { label: 'Faltante', tone: 'neutral' },
}

export const clientStatusMeta: Record<ClientStatus, StatusMeta> = {
  active: { label: 'Activo', tone: 'success' },
  onboarding: { label: 'Alta en curso', tone: 'info' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
}

export const alertSeverityMeta: Record<AlertSeverity, StatusMeta> = {
  critical: { label: 'Crítica', tone: 'danger' },
  warning: { label: 'Atención', tone: 'warning' },
  info: { label: 'Info', tone: 'info' },
}

export const taskStatusMeta: Record<TaskStatus, StatusMeta> = {
  todo: { label: 'Pendiente', tone: 'neutral' },
  'in-progress': { label: 'En curso', tone: 'accent' },
  waiting: { label: 'Esperando a terceros', tone: 'info' },
  done: { label: 'Completada', tone: 'success' },
}

export const projectCategoryLabel: Record<ProjectCategory, string> = {
  'long-term': 'Asignación larga',
  'short-term': 'Asignación corta',
  permanent: 'Traslado permanente',
  repatriation: 'Repatriación',
}

/** @deprecated alias for Phase 1 call sites. */
export const relocationKindLabel = projectCategoryLabel

export const participantRoleLabel: Record<ParticipantRole, string> = {
  beneficiary: 'Beneficiario/a',
  spouse: 'Cónyuge',
  partner: 'Pareja',
  child: 'Hijo/a',
  dependent: 'Dependiente',
}

export const documentKindMeta: Record<DocumentKind, { label: string; icon: LucideIcon }> = {
  passport: { label: 'Pasaporte', icon: BookOpenCheck },
  visa: { label: 'Visa', icon: Stamp },
  'work-permit': { label: 'Permiso de trabajo', icon: Stamp },
  'residence-card': { label: 'Residencia', icon: Stamp },
  lease: { label: 'Contrato de alquiler', icon: Home },
  contract: { label: 'Contrato', icon: BookOpenCheck },
  certificate: { label: 'Certificado', icon: BookOpenCheck },
  insurance: { label: 'Seguro', icon: BookOpenCheck },
}

export const countryNames: Record<CountryCode, string> = {
  AR: 'Argentina',
  BR: 'Brasil',
  CL: 'Chile',
  CO: 'Colombia',
  MX: 'México',
  UY: 'Uruguay',
  US: 'Estados Unidos',
  CA: 'Canadá',
  ES: 'España',
  DE: 'Alemania',
  FR: 'Francia',
  NL: 'Países Bajos',
  GB: 'Reino Unido',
  CH: 'Suiza',
  JP: 'Japón',
}
