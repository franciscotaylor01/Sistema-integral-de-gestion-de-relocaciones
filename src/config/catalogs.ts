import type { LucideIcon } from 'lucide-react'
import {
  BookOpenCheck,
  Compass,
  GraduationCap,
  Home,
  KeyRound,
  Landmark,
  PlaneTakeoff,
  Stamp,
  Truck,
} from 'lucide-react'
import type {
  AlertSeverity,
  ClientStatus,
  CountryCode,
  DocumentKind,
  DocumentStatus,
  FamilyRelation,
  InvoiceStatus,
  PayableStatus,
  ProjectFinancialStatus,
  ProjectOperationalStatus,
  RelocationKind,
  ServiceStatus,
  ServiceType,
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
  draft: { label: 'Borrador', tone: 'neutral' },
  issued: { label: 'Emitida', tone: 'info' },
  'partially-paid': { label: 'Cobro parcial', tone: 'warning' },
  paid: { label: 'Cobrada', tone: 'success' },
  overdue: { label: 'Vencida', tone: 'danger' },
}

export const payableStatusMeta: Record<PayableStatus, StatusMeta> = {
  scheduled: { label: 'Programado', tone: 'info' },
  'pending-approval': { label: 'A aprobar', tone: 'warning' },
  'partially-paid': { label: 'Pago parcial', tone: 'warning' },
  paid: { label: 'Pagado', tone: 'success' },
  overdue: { label: 'Vencido', tone: 'danger' },
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

export interface ServiceTypeMeta {
  label: string
  icon: LucideIcon
  /** Gradient chip, same treatment as Vertix activity categories. */
  bg: string
}

export const serviceTypeMeta: Record<ServiceType, ServiceTypeMeta> = {
  immigration: { label: 'Migraciones', icon: Stamp, bg: 'linear-gradient(160deg,#f0a07c,#d65e38)' },
  housing: { label: 'Vivienda', icon: Home, bg: 'linear-gradient(160deg,#5ea4ff,#2f6fe8)' },
  schooling: { label: 'Escolaridad', icon: GraduationCap, bg: 'linear-gradient(160deg,#a68bff,#6d4fe0)' },
  moving: { label: 'Mudanza internacional', icon: Truck, bg: 'linear-gradient(160deg,#5c5a60,#232126)' },
  orientation: { label: 'Orientación', icon: Compass, bg: 'linear-gradient(160deg,#5fd0a0,#22a06b)' },
  'settling-in': { label: 'Instalación', icon: KeyRound, bg: 'linear-gradient(160deg,#f3c46b,#d9962a)' },
  'tax-advisory': { label: 'Asesoría fiscal', icon: Landmark, bg: 'linear-gradient(160deg,#7cc6d9,#2f8fa8)' },
  departure: { label: 'Salida / repatriación', icon: PlaneTakeoff, bg: 'linear-gradient(160deg,#f08ca6,#d24a6c)' },
}

export const relocationKindLabel: Record<RelocationKind, string> = {
  'long-term': 'Asignación larga',
  'short-term': 'Asignación corta',
  permanent: 'Traslado permanente',
  repatriation: 'Repatriación',
}

export const familyRelationLabel: Record<FamilyRelation, string> = {
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
