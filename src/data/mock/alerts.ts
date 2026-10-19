import type { Alert, Notification } from '@/types/domain'

/* Fictional alerts and notifications — demo data only. */

export const mockAlerts: Alert[] = [
  {
    id: 'al_01', severity: 'critical', date: '2026-10-13',
    title: 'Pasaporte vencido — Pieter de Groot',
    description: 'REL-2026-0159 · El trámite migratorio a Brasil no puede avanzar hasta renovarlo.',
    href: '/proyectos/prj_0159?tab=documentos',
  },
  {
    id: 'al_02', severity: 'critical', date: '2026-10-01',
    title: 'Factura vencida — Helvion Pharma',
    description: 'FA-0001-00001836 · EUR 7.400 vencida el 30/09.',
    href: '/finanzas?vista=facturas&estado=overdue',
  },
  {
    id: 'al_03', severity: 'warning', date: '2026-10-16',
    title: 'Trámite migratorio bloqueado',
    description: 'REL-2026-0155 · Certificado de antecedentes vencido de Diego Fuentes.',
    href: '/proyectos/prj_0155?tab=servicios',
  },
  {
    id: 'al_04', severity: 'warning', date: '2026-10-11',
    title: 'Pago a proveedor vencido',
    description: 'BR Mobility Serviços · EUR 2.800 vencido el 10/10.',
    href: '/finanzas?vista=proveedores&estado=overdue',
  },
  {
    id: 'al_05', severity: 'warning', date: '2026-10-14',
    title: 'Escolaridad bloqueada — familia Meier',
    description: 'REL-2026-0151 · Falta el historial escolar traducido.',
    href: '/proyectos/prj_0151?tab=servicios',
  },
  {
    id: 'al_06', severity: 'info', date: '2026-10-16',
    title: 'Nuevo proyecto a cotizar',
    description: 'REL-2026-0162 · Oceanic Logistics — Londres → Buenos Aires.',
    href: '/proyectos/prj_0162',
  },
]

export const mockNotifications: Notification[] = [
  { id: 'nt_01', title: 'Cobro recibido', description: 'Pampa Agritech acreditó ARS 5.400.000.', date: '2026-10-16T14:05:00', href: '/proyectos/prj_0154?tab=finanzas', read: false },
  { id: 'nt_02', title: 'Documento para revisar', description: 'Contrato de locación — REL-2026-0158.', date: '2026-10-18T16:20:00', href: '/proyectos/prj_0158?tab=documentos', read: false },
  { id: 'nt_03', title: 'Trámite bloqueado', description: 'REL-2026-0155 requiere un nuevo certificado.', date: '2026-10-16T10:15:00', href: '/proyectos/prj_0155?tab=servicios', read: false },
  { id: 'nt_04', title: 'Cobro recibido', description: 'Kestrel Automotive acreditó USD 8.000.', date: '2026-10-15T10:00:00', href: '/proyectos/prj_0149?tab=finanzas', read: true },
  { id: 'nt_05', title: 'Nuevo cliente', description: 'Oceanic Logistics completó el alta inicial.', date: '2026-10-01T09:00:00', href: '/clientes/cli_oceanic', read: true },
]
