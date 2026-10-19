import type { Project, ProjectService, ServiceStatus, ServiceType, WorkflowStage } from '@/types/domain'

/* Fictional relocation projects — demo data only. */

/** Default workflow per service type (will become a configurable table). */
const stageTemplates: Record<ServiceType, string[]> = {
  immigration: ['Relevamiento de requisitos', 'Documentación', 'Legalizaciones', 'Presentación', 'Resolución', 'Residencia emitida'],
  housing: ['Brief de necesidades', 'Preselección', 'Visitas', 'Negociación', 'Firma de contrato', 'Entrega de llaves'],
  schooling: ['Relevamiento', 'Visitas a colegios', 'Aplicación', 'Admisión', 'Inscripción'],
  moving: ['Cotización', 'Inventario', 'Embalaje', 'Tránsito', 'Aduana', 'Entrega'],
  orientation: ['Agenda', 'Tour de ciudad', 'Trámites locales', 'Cierre'],
  'settling-in': ['Servicios del hogar', 'Cuenta bancaria', 'Registro local', 'Cierre'],
  'tax-advisory': ['Diagnóstico', 'Planificación', 'Presentaciones', 'Cierre'],
  departure: ['Fin de contrato', 'Inspección', 'Bajas de servicios', 'Cierre'],
}

const DAY = 86_400_000

function interpolateDate(start: string, end: string, fraction: number): string {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  return new Date(a + Math.round(((b - a) * fraction) / DAY) * DAY).toISOString().slice(0, 10)
}

interface ServiceSeed {
  type: ServiceType
  status: ServiceStatus
  owner: string
  /** Number of completed workflow stages. */
  done: number
  due: string
  price: number
  cost: number
  supplier?: string
}

function buildServices(projectId: string, start: string, seeds: ServiceSeed[]): ProjectService[] {
  return seeds.map((s, i) => {
    const labels = stageTemplates[s.type]
    const done = s.status === 'completed' ? labels.length : s.done
    const stages: WorkflowStage[] = labels.map((label, j) => ({
      id: `${projectId}_s${i + 1}_st${j + 1}`,
      label,
      status: j < done ? 'done' : j === done && s.status !== 'not-started' ? 'current' : 'pending',
      date: interpolateDate(start, s.due, (j + 1) / labels.length),
    }))
    return {
      id: `${projectId}_s${i + 1}`,
      projectId,
      type: s.type,
      status: s.status,
      ownerId: s.owner,
      supplierId: s.supplier,
      dueDate: s.due,
      stages,
      price: s.price,
      estimatedCost: s.cost,
    }
  })
}

type ProjectSeed = Omit<Project, 'services'> & { services: ServiceSeed[] }

const seeds: ProjectSeed[] = [
  {
    id: 'prj_0162', code: 'REL-2026-0162', clientId: 'cli_oceanic', assigneeId: 'asg_12', kind: 'long-term',
    origin: { country: 'GB', city: 'Londres' }, destination: { country: 'AR', city: 'Buenos Aires' },
    ownerId: 'stf_02', operationalStatus: 'onboarding', financialStatus: 'to-quote', currency: 'USD',
    startDate: '2026-10-16', targetDate: '2027-02-28',
    services: [
      { type: 'housing', status: 'not-started', owner: 'stf_04', done: 0, due: '2027-01-20', price: 4100, cost: 2600 },
      { type: 'immigration', status: 'not-started', owner: 'stf_03', done: 0, due: '2027-02-15', price: 4600, cost: 2700 },
      { type: 'schooling', status: 'not-started', owner: 'stf_04', done: 0, due: '2027-02-01', price: 2400, cost: 1500 },
      { type: 'orientation', status: 'not-started', owner: 'stf_02', done: 0, due: '2027-02-28', price: 1300, cost: 600 },
    ],
  },
  {
    id: 'prj_0161', code: 'REL-2026-0161', clientId: 'cli_lumen', assigneeId: 'asg_05', kind: 'long-term',
    origin: { country: 'AR', city: 'Buenos Aires' }, destination: { country: 'ES', city: 'Madrid' },
    ownerId: 'stf_03', operationalStatus: 'onboarding', financialStatus: 'quoted', currency: 'USD',
    startDate: '2026-10-14', targetDate: '2027-01-31',
    services: [
      { type: 'immigration', status: 'in-progress', owner: 'stf_03', done: 1, due: '2026-12-20', price: 3800, cost: 2300, supplier: 'sup_03' },
      { type: 'housing', status: 'not-started', owner: 'stf_04', done: 0, due: '2027-01-15', price: 3600, cost: 2200 },
      { type: 'tax-advisory', status: 'not-started', owner: 'stf_05', done: 0, due: '2027-01-31', price: 2200, cost: 1200 },
    ],
  },
  {
    id: 'prj_0160', code: 'REL-2026-0160', clientId: 'cli_andes', assigneeId: 'asg_08', kind: 'long-term',
    origin: { country: 'CL', city: 'Antofagasta' }, destination: { country: 'AR', city: 'San Juan' },
    ownerId: 'stf_04', operationalStatus: 'in-progress', financialStatus: 'po-received', currency: 'USD',
    startDate: '2026-09-22', targetDate: '2026-12-18', purchaseOrder: 'OC-AMG-55821',
    services: [
      { type: 'immigration', status: 'in-progress', owner: 'stf_03', done: 3, due: '2026-11-20', price: 4100, cost: 2400, supplier: 'sup_11' },
      { type: 'housing', status: 'in-progress', owner: 'stf_04', done: 2, due: '2026-10-30', price: 3400, cost: 2100, supplier: 'sup_02' },
      { type: 'schooling', status: 'in-progress', owner: 'stf_04', done: 2, due: '2026-11-10', price: 2100, cost: 1300, supplier: 'sup_08' },
    ],
  },
  {
    id: 'prj_0159', code: 'REL-2026-0159', clientId: 'cli_nordvik', assigneeId: 'asg_16', kind: 'short-term',
    origin: { country: 'NL', city: 'Rotterdam' }, destination: { country: 'BR', city: 'Macaé' },
    ownerId: 'stf_04', operationalStatus: 'in-progress', financialStatus: 'quoted', currency: 'USD',
    startDate: '2026-10-01', targetDate: '2027-01-15',
    services: [
      { type: 'immigration', status: 'blocked', owner: 'stf_03', done: 1, due: '2026-11-25', price: 4900, cost: 2900, supplier: 'sup_06' },
      { type: 'housing', status: 'waiting', owner: 'stf_04', done: 1, due: '2026-12-10', price: 4000, cost: 2500 },
      { type: 'moving', status: 'not-started', owner: 'stf_06', done: 0, due: '2027-01-10', price: 11800, cost: 8600, supplier: 'sup_01' },
    ],
  },
  {
    id: 'prj_0158', code: 'REL-2026-0158', clientId: 'cli_nordvik', assigneeId: 'asg_01', kind: 'long-term',
    origin: { country: 'NL', city: 'Rotterdam' }, destination: { country: 'AR', city: 'Neuquén' },
    ownerId: 'stf_02', operationalStatus: 'in-progress', financialStatus: 'po-received', currency: 'USD',
    startDate: '2026-09-01', targetDate: '2026-12-15', purchaseOrder: 'PO-NV-2026-0712',
    services: [
      { type: 'immigration', status: 'in-progress', owner: 'stf_03', done: 3, due: '2026-11-05', price: 5200, cost: 3100, supplier: 'sup_11' },
      { type: 'housing', status: 'in-progress', owner: 'stf_04', done: 3, due: '2026-10-28', price: 4200, cost: 2600, supplier: 'sup_02' },
      { type: 'schooling', status: 'waiting', owner: 'stf_04', done: 2, due: '2026-11-15', price: 2400, cost: 1500, supplier: 'sup_08' },
      { type: 'moving', status: 'in-progress', owner: 'stf_06', done: 3, due: '2026-11-30', price: 12800, cost: 9200, supplier: 'sup_01' },
      { type: 'orientation', status: 'completed', owner: 'stf_02', done: 4, due: '2026-09-20', price: 1300, cost: 600 },
    ],
  },
  {
    id: 'prj_0157', code: 'REL-2026-0157', clientId: 'cli_kestrel', assigneeId: 'asg_10', kind: 'long-term',
    origin: { country: 'MX', city: 'Monterrey' }, destination: { country: 'US', city: 'Detroit' },
    ownerId: 'stf_02', operationalStatus: 'in-progress', financialStatus: 'invoiced', currency: 'USD',
    startDate: '2026-09-15', targetDate: '2026-12-20',
    services: [
      { type: 'immigration', status: 'in-progress', owner: 'stf_03', done: 2, due: '2026-10-30', price: 3400, cost: 1900 },
      { type: 'housing', status: 'not-started', owner: 'stf_04', done: 0, due: '2026-12-01', price: 3000, cost: 1900 },
      { type: 'orientation', status: 'not-started', owner: 'stf_02', done: 0, due: '2026-12-20', price: 1100, cost: 500 },
    ],
  },
  {
    id: 'prj_0155', code: 'REL-2026-0155', clientId: 'cli_andes', assigneeId: 'asg_02', kind: 'long-term',
    origin: { country: 'CL', city: 'Santiago' }, destination: { country: 'CA', city: 'Toronto' },
    ownerId: 'stf_06', operationalStatus: 'in-progress', financialStatus: 'invoiced', currency: 'USD',
    startDate: '2026-08-12', targetDate: '2026-12-01', purchaseOrder: 'OC-AMG-55406',
    services: [
      { type: 'immigration', status: 'blocked', owner: 'stf_03', done: 3, due: '2026-10-25', price: 5800, cost: 3400 },
      { type: 'housing', status: 'completed', owner: 'stf_04', done: 6, due: '2026-09-25', price: 4500, cost: 2900, supplier: 'sup_04' },
      { type: 'moving', status: 'in-progress', owner: 'stf_06', done: 4, due: '2026-11-08', price: 9800, cost: 7100, supplier: 'sup_07' },
      { type: 'tax-advisory', status: 'not-started', owner: 'stf_05', done: 0, due: '2026-12-01', price: 2400, cost: 1300 },
    ],
  },
  {
    id: 'prj_0154', code: 'REL-2026-0154', clientId: 'cli_pampa', assigneeId: 'asg_13', kind: 'repatriation',
    origin: { country: 'BR', city: 'São Paulo' }, destination: { country: 'AR', city: 'Rosario' },
    ownerId: 'stf_03', operationalStatus: 'in-progress', financialStatus: 'partially-collected', currency: 'ARS',
    startDate: '2026-08-25', targetDate: '2026-11-20',
    services: [
      { type: 'departure', status: 'completed', owner: 'stf_03', done: 4, due: '2026-09-30', price: 1900000, cost: 900000 },
      { type: 'housing', status: 'completed', owner: 'stf_04', done: 6, due: '2026-10-10', price: 3500000, cost: 2200000, supplier: 'sup_02' },
      { type: 'moving', status: 'in-progress', owner: 'stf_06', done: 4, due: '2026-10-31', price: 8600000, cost: 6400000, supplier: 'sup_09' },
    ],
  },
  {
    id: 'prj_0152', code: 'REL-2026-0152', clientId: 'cli_helvion', assigneeId: 'asg_03', kind: 'long-term',
    origin: { country: 'CH', city: 'Basilea' }, destination: { country: 'BR', city: 'São Paulo' },
    ownerId: 'stf_03', operationalStatus: 'in-progress', financialStatus: 'partially-collected', currency: 'EUR',
    startDate: '2026-07-20', targetDate: '2026-11-30', purchaseOrder: 'HP-PO-889120',
    services: [
      { type: 'immigration', status: 'in-progress', owner: 'stf_03', done: 4, due: '2026-11-10', price: 4900, cost: 2800, supplier: 'sup_06' },
      { type: 'housing', status: 'completed', owner: 'stf_04', done: 6, due: '2026-08-30', price: 3900, cost: 2500 },
      { type: 'schooling', status: 'completed', owner: 'stf_04', done: 5, due: '2026-08-25', price: 2300, cost: 1400 },
      { type: 'settling-in', status: 'in-progress', owner: 'stf_02', done: 2, due: '2026-10-31', price: 1500, cost: 800 },
    ],
  },
  {
    id: 'prj_0151', code: 'REL-2026-0151', clientId: 'cli_helvion', assigneeId: 'asg_09', kind: 'long-term',
    origin: { country: 'CH', city: 'Basilea' }, destination: { country: 'JP', city: 'Tokio' },
    ownerId: 'stf_06', operationalStatus: 'in-progress', financialStatus: 'overdue', currency: 'EUR',
    startDate: '2026-07-01', targetDate: '2026-11-30', purchaseOrder: 'HP-PO-887455',
    services: [
      { type: 'immigration', status: 'completed', owner: 'stf_03', done: 6, due: '2026-09-15', price: 5600, cost: 3300 },
      { type: 'housing', status: 'in-progress', owner: 'stf_04', done: 4, due: '2026-10-27', price: 4800, cost: 3400, supplier: 'sup_05' },
      { type: 'schooling', status: 'blocked', owner: 'stf_04', done: 2, due: '2026-10-31', price: 2600, cost: 1700 },
      { type: 'moving', status: 'in-progress', owner: 'stf_06', done: 3, due: '2026-11-20', price: 14200, cost: 10900, supplier: 'sup_01' },
    ],
  },
  {
    id: 'prj_0149', code: 'REL-2026-0149', clientId: 'cli_kestrel', assigneeId: 'asg_04', kind: 'long-term',
    origin: { country: 'US', city: 'Detroit' }, destination: { country: 'MX', city: 'Monterrey' },
    ownerId: 'stf_02', operationalStatus: 'in-progress', financialStatus: 'collected', currency: 'USD',
    startDate: '2026-06-15', targetDate: '2026-10-31',
    services: [
      { type: 'immigration', status: 'completed', owner: 'stf_03', done: 6, due: '2026-08-15', price: 3600, cost: 2000 },
      { type: 'housing', status: 'in-progress', owner: 'stf_04', done: 5, due: '2026-10-22', price: 3200, cost: 2100, supplier: 'sup_12' },
      { type: 'moving', status: 'completed', owner: 'stf_06', done: 6, due: '2026-09-10', price: 7400, cost: 5600, supplier: 'sup_01' },
      { type: 'orientation', status: 'completed', owner: 'stf_02', done: 4, due: '2026-09-25', price: 1200, cost: 500 },
    ],
  },
  {
    id: 'prj_0147', code: 'REL-2026-0147', clientId: 'cli_pampa', assigneeId: 'asg_06', kind: 'long-term',
    origin: { country: 'AR', city: 'Córdoba' }, destination: { country: 'BR', city: 'Curitiba' },
    ownerId: 'stf_04', operationalStatus: 'on-hold', financialStatus: 'overdue', currency: 'ARS',
    startDate: '2026-08-01', targetDate: '2026-12-20',
    services: [
      { type: 'immigration', status: 'waiting', owner: 'stf_03', done: 2, due: '2026-11-15', price: 5200000, cost: 3100000, supplier: 'sup_06' },
      { type: 'housing', status: 'not-started', owner: 'stf_04', done: 0, due: '2026-12-05', price: 4400000, cost: 2700000 },
      { type: 'moving', status: 'not-started', owner: 'stf_06', done: 0, due: '2026-12-20', price: 9800000, cost: 7300000, supplier: 'sup_09' },
    ],
  },
  {
    id: 'prj_0146', code: 'REL-2026-0146', clientId: 'cli_helvion', assigneeId: 'asg_14', kind: 'short-term',
    origin: { country: 'DE', city: 'Fráncfort' }, destination: { country: 'CO', city: 'Bogotá' },
    ownerId: 'stf_03', operationalStatus: 'in-progress', financialStatus: 'partially-collected', currency: 'EUR',
    startDate: '2026-06-01', targetDate: '2026-11-15', purchaseOrder: 'HP-PO-884010',
    services: [
      { type: 'immigration', status: 'in-progress', owner: 'stf_03', done: 5, due: '2026-10-29', price: 4700, cost: 2700 },
      { type: 'housing', status: 'completed', owner: 'stf_04', done: 6, due: '2026-07-20', price: 3800, cost: 2400, supplier: 'sup_13' },
      { type: 'orientation', status: 'completed', owner: 'stf_02', done: 4, due: '2026-07-31', price: 1200, cost: 500 },
      { type: 'tax-advisory', status: 'in-progress', owner: 'stf_05', done: 2, due: '2026-11-15', price: 2500, cost: 1400 },
    ],
  },
  {
    id: 'prj_0143', code: 'REL-2026-0143', clientId: 'cli_nordvik', assigneeId: 'asg_07', kind: 'long-term',
    origin: { country: 'NL', city: 'Rotterdam' }, destination: { country: 'US', city: 'Houston' },
    ownerId: 'stf_06', operationalStatus: 'completed', financialStatus: 'collected', currency: 'USD',
    startDate: '2026-04-02', targetDate: '2026-08-30', purchaseOrder: 'PO-NV-2026-0311',
    services: [
      { type: 'immigration', status: 'completed', owner: 'stf_03', done: 6, due: '2026-06-10', price: 5000, cost: 2900 },
      { type: 'housing', status: 'completed', owner: 'stf_04', done: 6, due: '2026-06-30', price: 4300, cost: 2700 },
      { type: 'moving', status: 'completed', owner: 'stf_06', done: 6, due: '2026-07-15', price: 13500, cost: 9800, supplier: 'sup_01' },
      { type: 'schooling', status: 'completed', owner: 'stf_04', done: 5, due: '2026-08-10', price: 2500, cost: 1500 },
      { type: 'settling-in', status: 'completed', owner: 'stf_02', done: 4, due: '2026-08-30', price: 1600, cost: 900, supplier: 'sup_10' },
    ],
  },
  {
    id: 'prj_0139', code: 'REL-2026-0139', clientId: 'cli_lumen', assigneeId: 'asg_11', kind: 'permanent',
    origin: { country: 'AR', city: 'Buenos Aires' }, destination: { country: 'UY', city: 'Montevideo' },
    ownerId: 'stf_04', operationalStatus: 'completed', financialStatus: 'collected', currency: 'USD',
    startDate: '2026-03-10', targetDate: '2026-05-30',
    services: [
      { type: 'immigration', status: 'completed', owner: 'stf_03', done: 6, due: '2026-05-15', price: 2600, cost: 1500 },
      { type: 'housing', status: 'completed', owner: 'stf_04', done: 6, due: '2026-04-20', price: 3200, cost: 2000 },
      { type: 'moving', status: 'completed', owner: 'stf_06', done: 6, due: '2026-05-10', price: 5600, cost: 4100 },
    ],
  },
  {
    id: 'prj_0137', code: 'REL-2026-0137', clientId: 'cli_brightwater', assigneeId: 'asg_15', kind: 'long-term',
    origin: { country: 'DE', city: 'Múnich' }, destination: { country: 'AR', city: 'Buenos Aires' },
    ownerId: 'stf_06', operationalStatus: 'completed', financialStatus: 'collected', currency: 'EUR',
    startDate: '2026-02-16', targetDate: '2026-06-30',
    services: [
      { type: 'immigration', status: 'completed', owner: 'stf_03', done: 6, due: '2026-05-20', price: 4400, cost: 2500 },
      { type: 'housing', status: 'completed', owner: 'stf_04', done: 6, due: '2026-04-15', price: 3700, cost: 2300 },
      { type: 'moving', status: 'completed', owner: 'stf_06', done: 6, due: '2026-05-05', price: 11200, cost: 8300 },
      { type: 'orientation', status: 'completed', owner: 'stf_02', done: 4, due: '2026-06-30', price: 1200, cost: 500 },
    ],
  },
]

export const mockProjects: Project[] = seeds.map(({ services, ...project }) => ({
  ...project,
  services: buildServices(project.id, project.startDate, services),
}))
