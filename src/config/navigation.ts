import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  FileStack,
  LayoutGrid,
  Settings,
  Truck,
  Wallet,
  Workflow,
} from 'lucide-react'
import type { ModuleItem, NavItem } from '@/types/navigation'

export const ROUTES = {
  dashboard: '/',
  projects: '/proyectos',
  newProject: '/proyectos/nuevo',
  tasks: '/tareas',
  clients: '/clientes',
  operations: '/operaciones',
  finance: '/finanzas',
  suppliers: '/proveedores',
  settings: '/configuracion',
  help: '/ayuda',
  profile: '/perfil',
} as const

export const projectPath = (id: string) => `${ROUTES.projects}/${id}`
export const clientPath = (id: string) => `${ROUTES.clients}/${id}`
export const invoicePath = (id: string) => `/facturas/${id}`
export const settlementPath = (id: string) => `/liquidaciones/${id}`
export const supplierPath = (id: string) => `${ROUTES.suppliers}/${id}`
export const quotationPath = (id: string) => `/cotizaciones/${id}`
export const purchaseOrderPath = (id: string) => `/ordenes-compra/${id}`

/** Primary top-bar sections (Phase 1). */
export const primaryNav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: ROUTES.dashboard, icon: LayoutGrid },
  { id: 'projects', label: 'Proyectos', path: ROUTES.projects, icon: BriefcaseBusiness },
  { id: 'clients', label: 'Clientes', path: ROUTES.clients, icon: Building2 },
  { id: 'operations', label: 'Operaciones', path: ROUTES.operations, icon: Workflow },
  { id: 'finance', label: 'Finanzas', path: ROUTES.finance, icon: Wallet },
]

/**
 * Icon-rail modules. Dashboard is the entry point; the rest are anticipated
 * modules that render a "coming soon" screen in Phase 1.
 */
export const railNav: ModuleItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: ROUTES.dashboard, icon: LayoutGrid, description: '' },
  {
    id: 'calendar',
    label: 'Calendario',
    path: '/calendario',
    icon: CalendarDays,
    description: 'Agenda unificada de llegadas, mudanzas, turnos consulares y vencimientos.',
  },
  {
    id: 'suppliers',
    label: 'Proveedores',
    path: ROUTES.suppliers,
    icon: Truck,
    description: 'Red de proveedores por país y servicio, tarifas, evaluaciones y cuentas a pagar.',
  },
  {
    id: 'documents',
    label: 'Documentos',
    path: '/documentos',
    icon: FileStack,
    description: 'Repositorio central de documentación migratoria y contractual con control de vencimientos.',
  },
  {
    id: 'reports',
    label: 'Reportes',
    path: '/reportes',
    icon: BarChart3,
    description: 'Reportes de gestión, resultados financieros por cliente y business intelligence.',
  },
]

export const settingsModule: ModuleItem = {
  id: 'settings',
  label: 'Configuración',
  path: ROUTES.settings,
  icon: Settings,
  description: 'Usuarios, roles y permisos, monedas, tarifarios base y parámetros de facturación.',
}
