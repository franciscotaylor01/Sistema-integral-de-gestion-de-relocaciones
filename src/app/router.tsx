import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { railNav, ROUTES, settingsModule } from '@/config/navigation'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { SectionPlaceholder } from '@/features/sections/SectionPlaceholder'

/* Anticipated modules: routed now, implemented in later phases. */
const upcomingModules = [
  ...railNav.filter((m) => m.path !== ROUTES.dashboard && m.path !== ROUTES.suppliers),
  settingsModule,
  {
    id: 'help',
    label: 'Centro de ayuda',
    path: ROUTES.help,
    description: 'Guías de uso, preguntas frecuentes y contacto con soporte de Argen Labs.',
  },
  {
    id: 'profile',
    label: 'Mi perfil',
    path: ROUTES.profile,
    description: 'Datos personales, preferencias de notificación y seguridad de la cuenta.',
  },
].map((m) => ({
  path: m.path.slice(1),
  element: <SectionPlaceholder title={m.label} description={m.description} />,
}))

/* Feature screens are code-split per route. */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, lazy: () => import('@/features/dashboard/DashboardPage').then((m) => ({ Component: m.DashboardPage })) },
      { path: 'proyectos', lazy: () => import('@/features/projects/ProjectsPage').then((m) => ({ Component: m.ProjectsPage })) },
      { path: 'proyectos/nuevo', lazy: () => import('@/features/projects/new/NewProjectPage').then((m) => ({ Component: m.NewProjectPage })) },
      {
        path: 'proyectos/:projectId',
        lazy: () => import('@/features/projects/ProjectDetailPage').then((m) => ({ Component: m.ProjectDetailPage })),
      },
      { path: 'clientes', lazy: () => import('@/features/clients/ClientsPage').then((m) => ({ Component: m.ClientsPage })) },
      {
        path: 'clientes/:clientId',
        lazy: () => import('@/features/clients/ClientDetailPage').then((m) => ({ Component: m.ClientDetailPage })),
      },
      { path: 'operaciones', lazy: () => import('@/features/operations/OperationsPage').then((m) => ({ Component: m.OperationsPage })) },
      { path: 'cotizaciones/:quotationId', lazy: () => import('@/features/commercial/QuotationPage').then((m) => ({ Component: m.QuotationPage })) },
      { path: 'ordenes-compra/:poId', lazy: () => import('@/features/commercial/PurchaseOrderPage').then((m) => ({ Component: m.PurchaseOrderPage })) },
      { path: 'tareas', lazy: () => import('@/features/tasks/TasksPage').then((m) => ({ Component: m.TasksPage })) },
      { path: 'finanzas', lazy: () => import('@/features/finance/FinancePage').then((m) => ({ Component: m.FinancePage })) },
      { path: 'facturas/:invoiceId', lazy: () => import('@/features/finance/InvoicePage').then((m) => ({ Component: m.InvoicePage })) },
      { path: 'liquidaciones/:settlementId', lazy: () => import('@/features/finance/settlements/SettlementPage').then((m) => ({ Component: m.SettlementPage })) },
      { path: 'certificados/:certificateId', lazy: () => import('@/features/catalog/Certificates').then((m) => ({ Component: m.CertificatePage })) },
      { path: 'proveedores', lazy: () => import('@/features/suppliers/SuppliersPage').then((m) => ({ Component: m.SuppliersPage })) },
      { path: 'proveedores/:supplierId', lazy: () => import('@/features/suppliers/SupplierPage').then((m) => ({ Component: m.SupplierPage })) },
      ...upcomingModules,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
