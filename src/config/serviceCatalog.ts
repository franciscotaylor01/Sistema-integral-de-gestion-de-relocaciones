import type { LucideIcon } from 'lucide-react'
import {
  Car,
  Compass,
  GraduationCap,
  Home,
  IdCard,
  KeyRound,
  Landmark,
  Link2,
  MessagesSquare,
  PlaneTakeoff,
  Rocket,
  ScrollText,
  Stamp,
  Truck,
  Users,
  WalletCards,
} from 'lucide-react'
import type { ServiceTypeId } from '@/types/domain'

/*
 * Service catalog — configurable list of services Relocare sells. Each entry
 * points to its workflow template; migration-type services may contain
 * procedures. Add, rename or deactivate entries here (future: DB table).
 */

export interface ServiceCatalogEntry {
  id: ServiceTypeId
  label: string
  description: string
  icon: LucideIcon
  /** Gradient chip, same treatment as the Vertix activity categories. */
  bg: string
  workflowTemplateId: string
  /** Procedure types that can be opened inside this service. */
  procedureTypes?: string[]
  /** Suggest picking a supplier. */
  usesSupplier?: boolean
  /** Inactive entries stay readable on existing services but cannot be added. */
  active: boolean
}

export const serviceCatalog: ServiceCatalogEntry[] = [
  {
    id: 'immigration',
    label: 'Migraciones',
    description: 'Visas, permisos de trabajo y residencias, con trámites por persona.',
    icon: Stamp,
    bg: 'linear-gradient(160deg,#f0a07c,#d65e38)',
    workflowTemplateId: 'wf-immigration',
    procedureTypes: ['residence', 'work-visa', 'dni', 'tie', 'apostille', 'cuil', 'driving-license'],
    usesSupplier: true,
    active: true,
  },
  { id: 'dni', label: 'DNI', description: 'Tramitación del DNI para extranjeros en Argentina.', icon: IdCard, bg: 'linear-gradient(160deg,#7aa7ff,#3d6fe0)', workflowTemplateId: 'wf-dni', active: true },
  { id: 'tie', label: 'TIE', description: 'Tarjeta de Identidad de Extranjero (España).', icon: WalletCards, bg: 'linear-gradient(160deg,#f5b36b,#dc7f2a)', workflowTemplateId: 'wf-tie', active: true },
  { id: 'housing', label: 'Housing', description: 'Búsqueda de vivienda, negociación y firma de contrato.', icon: Home, bg: 'linear-gradient(160deg,#5ea4ff,#2f6fe8)', workflowTemplateId: 'wf-housing', usesSupplier: true, active: true },
  { id: 'schooling', label: 'Schooling', description: 'Búsqueda de colegios, admisión e inscripción.', icon: GraduationCap, bg: 'linear-gradient(160deg,#a68bff,#6d4fe0)', workflowTemplateId: 'wf-schooling', usesSupplier: true, active: true },
  { id: 'moving', label: 'Mudanzas', description: 'Mudanza internacional puerta a puerta.', icon: Truck, bg: 'linear-gradient(160deg,#5c5a60,#232126)', workflowTemplateId: 'wf-moving', usesSupplier: true, active: true },
  { id: 'intercultural-workshop', label: 'Talleres interculturales', description: 'Talleres de adaptación cultural para la familia.', icon: Users, bg: 'linear-gradient(160deg,#6fd3c1,#1f9e8a)', workflowTemplateId: 'wf-intercultural', usesSupplier: true, active: true },
  { id: 'dual-career', label: 'Dual career', description: 'Acompañamiento de carrera para la pareja.', icon: Rocket, bg: 'linear-gradient(160deg,#f28fb8,#cf4a83)', workflowTemplateId: 'wf-dual-career', active: true },
  { id: 'driving-license', label: 'Licencia de conducir', description: 'Canje u obtención de licencia en destino.', icon: Car, bg: 'linear-gradient(160deg,#8fb6c9,#4a7f99)', workflowTemplateId: 'wf-driving-license', active: true },
  { id: 'cuil-unification', label: 'Unificación de CUIL', description: 'Unificación de CUIL ante ANSES.', icon: Link2, bg: 'linear-gradient(160deg,#9fc46b,#5f9227)', workflowTemplateId: 'wf-cuil', active: true },
  { id: 'apostille', label: 'Apostillas', description: 'Legalización y apostilla de documentos.', icon: ScrollText, bg: 'linear-gradient(160deg,#d5a26f,#a96b2c)', workflowTemplateId: 'wf-apostille', usesSupplier: true, active: true },
  { id: 'pre-migration-talk', label: 'Charla premigratoria', description: 'Sesión informativa previa al traslado.', icon: MessagesSquare, bg: 'linear-gradient(160deg,#b9a5f5,#7b62d6)', workflowTemplateId: 'wf-pre-migration', active: true },
  { id: 'orientation', label: 'Orientación', description: 'Programa de orientación en la ciudad de destino.', icon: Compass, bg: 'linear-gradient(160deg,#5fd0a0,#22a06b)', workflowTemplateId: 'wf-orientation', active: true },
  { id: 'settling-in', label: 'Instalación', description: 'Servicios del hogar, banco y registros locales.', icon: KeyRound, bg: 'linear-gradient(160deg,#f3c46b,#d9962a)', workflowTemplateId: 'wf-settling-in', usesSupplier: true, active: true },
  { id: 'tax-advisory', label: 'Asesoría fiscal', description: 'Asesoramiento impositivo de origen y destino.', icon: Landmark, bg: 'linear-gradient(160deg,#7cc6d9,#2f8fa8)', workflowTemplateId: 'wf-tax-advisory', active: true },
  { id: 'departure', label: 'Salida / repatriación', description: 'Cierre de la asignación y regreso.', icon: PlaneTakeoff, bg: 'linear-gradient(160deg,#f08ca6,#d24a6c)', workflowTemplateId: 'wf-departure', active: true },
]

const byId = new Map(serviceCatalog.map((s) => [s.id, s]))

const fallback = (id: string): ServiceCatalogEntry => ({
  id,
  label: id,
  description: '',
  icon: Stamp,
  bg: 'linear-gradient(160deg,#a8a6aa,#6f6c72)',
  workflowTemplateId: '',
  active: false,
})

/** Catalog entry for a service type; unknown ids degrade gracefully. */
export function getServiceType(id: ServiceTypeId): ServiceCatalogEntry {
  return byId.get(id) ?? fallback(id)
}

export const activeServiceTypes = () => serviceCatalog.filter((s) => s.active)
