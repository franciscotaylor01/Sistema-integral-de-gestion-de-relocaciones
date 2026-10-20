import type {
  CollectionAction,
  CostRecord,
  ExchangeRate,
  LegalEntity,
  ProjectSettlement,
  Supplier,
  SupplierAgreement,
  SupplierObligation,
  SupplierPayment,
} from '@/types/domain'

/*
 * Phase 4 fictional finance data. Florencia is modelled as a professional
 * service provider who invoices Relocare for her work on specific services;
 * payments to her are ordinary supplier payments (not profit distributions).
 */

export const mockLegalEntities: LegalEntity[] = [
  // Tax id intentionally empty: real fiscal identifiers must be entered by Relocare.
  { id: 'le_relocare', name: 'Relocare (entidad emisora — demo)', country: 'AR', defaultCurrency: 'USD' },
]

export const mockFlorencia: Supplier = {
  id: 'sup_florencia',
  name: 'Florencia — Servicios profesionales',
  kind: 'professional',
  country: 'AR',
  contactName: 'Florencia',
  email: 'florencia@consultora.example',
  preferredCurrency: 'USD',
  categories: ['immigration', 'orientation', 'settling-in', 'intercultural-workshop'],
  paymentDetails: 'Datos bancarios a completar (demo)',
  defaultPaymentCondition: 'due-date',
  active: true,
  notes: 'Factura a Relocare por su trabajo en proyectos. Las reglas avanzadas de liquidación se definirán tras validar el proceso real.',
}

const T = '2026-09-01T10:00:00'

export const mockAgreements: SupplierAgreement[] = [
  { id: 'agr_flo_01', supplierId: 'sup_florencia', projectId: 'prj_0158', serviceId: 'prj_0158_s5', description: 'Programa de orientación — familia Vermeulen', currency: 'USD', agreedAmount: 700, paymentCondition: 'due-date', createdAt: T },
  { id: 'agr_flo_02', supplierId: 'sup_florencia', projectId: 'prj_0155', serviceId: 'prj_0155_s1', description: 'Coordinación migratoria — Diego Fuentes', currency: 'USD', agreedAmount: 800, paymentCondition: 'after-client-collection', notes: 'Acordado: se paga cuando Andes Minerals abona la factura.', createdAt: T },
  { id: 'agr_flo_03', supplierId: 'sup_florencia', projectId: 'prj_0152', serviceId: 'prj_0152_s4', description: 'Instalación en São Paulo — familia Baumann', currency: 'EUR', agreedAmount: 600, paymentCondition: 'due-date', createdAt: T },
  { id: 'agr_flo_04', supplierId: 'sup_florencia', projectId: 'prj_0161', serviceId: 'prj_0161_s1', description: 'Asesoramiento migratorio — Agustina Méndez', currency: 'USD', agreedAmount: 900, paymentCondition: 'due-date', createdAt: T },
]

const flo = (o: Omit<SupplierObligation, 'supplierId' | 'lifecycle' | 'createdAt' | 'createdBy'>): SupplierObligation => ({
  ...o,
  supplierId: 'sup_florencia',
  lifecycle: 'approved',
  createdAt: `${o.issueDate}T10:00:00`,
  createdBy: 'stf_05',
})

const floCost = (id: string, projectId: string, serviceId: string, description: string, currency: 'USD' | 'EUR', amount: number, date: string): CostRecord => ({
  id,
  scope: 'project',
  projectId,
  serviceId,
  supplierId: 'sup_florencia',
  category: 'professional-services',
  description,
  currency,
  amount,
  date,
  status: 'incurred',
  createdAt: `${date}T10:00:00`,
  createdBy: 'stf_05',
})

export const mockExtraCosts: CostRecord[] = [
  floCost('cost_flo_12', 'prj_0158', 'prj_0158_s5', 'Honorarios orientación — Florencia', 'USD', 700, '2026-09-25'),
  floCost('cost_flo_14', 'prj_0155', 'prj_0155_s1', 'Honorarios coordinación migratoria — Florencia', 'USD', 800, '2026-10-01'),
  floCost('cost_flo_15', 'prj_0152', 'prj_0152_s4', 'Honorarios instalación (1.ª parte) — Florencia', 'EUR', 300, '2026-10-12'),
  { id: 'cost_flo_09', scope: 'project', projectId: 'prj_0139', supplierId: 'sup_florencia', category: 'professional-services', description: 'Participación acordada — Florencia', currency: 'USD', amount: 500, date: '2026-08-20', status: 'incurred', createdAt: '2026-08-20T10:00:00', createdBy: 'stf_05' },
  // Direct project cost paid on the spot (no supplier obligation).
  { id: 'cost_dir_01', scope: 'project', projectId: 'prj_0158', serviceId: 'prj_0158_s1', category: 'migration', description: 'Tasas de legalización y courier', currency: 'USD', amount: 185.4, date: '2026-09-18', status: 'incurred', createdAt: '2026-09-18T15:00:00', createdBy: 'stf_03' },
  { id: 'cost_dir_02', scope: 'project', projectId: 'prj_0154', serviceId: 'prj_0154_s3', category: 'moving', description: 'Depósito aduanero en Paso de los Libres', currency: 'ARS', amount: 386500, date: '2026-10-11', status: 'incurred', createdAt: '2026-10-11T11:00:00', createdBy: 'stf_06' },
  // General company expenses — never part of project results.
  { id: 'cost_gen_01', scope: 'company', category: 'general-expense', description: 'Alquiler de oficina — octubre', currency: 'ARS', amount: 1250000, date: '2026-10-01', status: 'incurred', createdAt: '2026-10-01T09:00:00', createdBy: 'stf_05' },
  { id: 'cost_gen_02', scope: 'company', category: 'general-expense', description: 'Licencias de software', currency: 'USD', amount: 349.99, date: '2026-10-03', status: 'incurred', createdAt: '2026-10-03T09:00:00', createdBy: 'stf_05' },
]

export const mockExtraObligations: SupplierObligation[] = [
  flo({ id: 'obl_flo_12', reference: 'FLO-C-0012', projectId: 'prj_0158', serviceId: 'prj_0158_s5', costId: 'cost_flo_12', agreementId: 'agr_flo_01', description: 'Honorarios orientación — Florencia', issueDate: '2026-09-25', dueDate: '2026-10-10', currency: 'USD', amount: 700, paymentCondition: 'due-date' }),
  flo({ id: 'obl_flo_14', reference: 'FLO-C-0014', projectId: 'prj_0155', serviceId: 'prj_0155_s1', costId: 'cost_flo_14', agreementId: 'agr_flo_02', description: 'Honorarios coordinación migratoria — Florencia', issueDate: '2026-10-01', dueDate: '2026-10-31', currency: 'USD', amount: 800, paymentCondition: 'after-client-collection', clientInvoiceId: 'inv_07' }),
  flo({ id: 'obl_flo_09', reference: 'FLO-C-0009', projectId: 'prj_0139', costId: 'cost_flo_09', description: 'Participación acordada — Florencia', issueDate: '2026-08-20', dueDate: '2026-09-04', currency: 'USD', amount: 500, paymentCondition: 'due-date' }),
  flo({ id: 'obl_flo_15', reference: 'FLO-C-0015', projectId: 'prj_0152', serviceId: 'prj_0152_s4', costId: 'cost_flo_15', agreementId: 'agr_flo_03', description: 'Honorarios instalación (1.ª parte) — Florencia', issueDate: '2026-10-12', dueDate: '2026-10-27', currency: 'EUR', amount: 300, paymentCondition: 'due-date' }),
]

export const mockExtraSupplierPayments: SupplierPayment[] = [
  {
    id: 'spay_flo_01', number: 'PAG-2026-0101', supplierId: 'sup_florencia', date: '2026-10-05', currency: 'USD', amount: 400, method: 'transfer',
    reference: 'TRF 88213', notes: 'Pago parcial acordado.', allocations: [{ id: 'spa_flo_01', obligationId: 'obl_flo_12', amount: 400 }],
    status: 'recorded', createdAt: '2026-10-05T16:00:00', createdBy: 'stf_05',
  },
  {
    id: 'spay_flo_02', number: 'PAG-2026-0088', supplierId: 'sup_florencia', date: '2026-09-02', currency: 'USD', amount: 500, method: 'transfer',
    reference: 'TRF 87410', allocations: [{ id: 'spa_flo_02', obligationId: 'obl_flo_09', amount: 500 }],
    status: 'recorded', createdAt: '2026-09-02T16:00:00', createdBy: 'stf_05',
  },
]

/*
 * Phase 4.5 fictional settlements (Eugenia–Florencia). Rules are demo
 * placeholders to be validated with them: no split is assumed by default.
 */
const settlement = (s: Pick<ProjectSettlement, 'id' | 'projectId' | 'currency' | 'release' | 'obligationIds'> & Partial<ProjectSettlement>): ProjectSettlement => ({
  supplierId: 'sup_florencia',
  releases: [],
  adjustments: [],
  confirmations: [],
  history: [{ id: `${s.id}_h1`, date: '2026-09-01T10:00:00', actorId: 'stf_01', action: s.rule ? 'Distribución configurada' : 'Liquidación creada' }],
  createdAt: '2026-09-01T10:00:00',
  createdBy: 'stf_01',
  ...s,
})

export const mockSettlements: ProjectSettlement[] = [
  // Fully collected project, fixed share invoiced and paid → green.
  settlement({ id: 'set_0139', projectId: 'prj_0139', currency: 'USD', release: 'after-collection', obligationIds: ['obl_flo_09'], rule: { method: 'fixed', amount: 500, components: [] } }),
  // Collected project, % share not yet invoiced nor paid → red.
  settlement({ id: 'set_0143', projectId: 'prj_0143', currency: 'USD', release: 'after-collection', obligationIds: [], rule: { method: 'percentage', pct: 20, components: [] } }),
  // Released by another agreed condition, partially paid → yellow.
  settlement({
    id: 'set_0158', projectId: 'prj_0158', currency: 'USD', release: 'manual', releaseNote: 'Se habilita por etapas del programa de orientación.', obligationIds: ['obl_flo_12'],
    rule: { method: 'fixed', amount: 700, components: [] },
    releases: [{ id: 'setr_0158_1', date: '2026-10-01', amount: 400, reason: 'Primera etapa del programa completada', actorId: 'stf_01' }],
  }),
  // Per-service share, pays after client collection.
  settlement({
    id: 'set_0155', projectId: 'prj_0155', currency: 'USD', release: 'after-collection', obligationIds: ['obl_flo_14'],
    rule: { method: 'by-service', components: [{ id: 'setc_0155_1', serviceId: 'prj_0155_s1', method: 'fixed', amount: 800 }] },
  }),
  // No agreed rule yet → "Pendiente de configurar".
  settlement({ id: 'set_0152', projectId: 'prj_0152', currency: 'EUR', release: 'after-collection', obligationIds: ['obl_flo_15'] }),
]

export const mockCollectionActions: CollectionAction[] = [
  { id: 'col_01', invoiceId: 'inv_15', clientId: 'cli_helvion', date: '2026-10-01T10:30:00', actorId: 'stf_05', kind: 'email', text: 'Recordatorio enviado a Marco Brunner (Finance Controller).' },
  { id: 'col_02', invoiceId: 'inv_15', clientId: 'cli_helvion', date: '2026-10-10T15:00:00', actorId: 'stf_05', kind: 'promise', text: 'Llamada con Finanzas de Helvion: confirman pago en la próxima corrida.', promisedDate: '2026-10-25' },
  { id: 'col_03', invoiceId: 'inv_19', clientId: 'cli_pampa', date: '2026-10-02T11:00:00', actorId: 'stf_01', kind: 'call', text: 'Tesorería de Pampa Agritech pide reprogramar; proyecto en pausa hasta regularizar.' },
]

export const mockExchangeRates: ExchangeRate[] = [
  { id: 'fx_01', base: 'USD', quote: 'ARS', rate: '1440.00', effectiveDate: '2026-10-01', source: 'Carga manual (demo)', supersededById: 'fx_02', createdAt: '2026-10-01T09:00:00', createdBy: 'stf_05' },
  { id: 'fx_02', base: 'USD', quote: 'ARS', rate: '1445.50', effectiveDate: '2026-10-01', source: 'Carga manual (demo)', notes: 'Ajuste: se había cargado el valor de apertura.', supersedesId: 'fx_01', createdAt: '2026-10-01T11:20:00', createdBy: 'stf_05' },
  { id: 'fx_03', base: 'USD', quote: 'ARS', rate: '1452.50', effectiveDate: '2026-10-15', source: 'Carga manual (demo)', createdAt: '2026-10-15T09:00:00', createdBy: 'stf_05' },
  { id: 'fx_04', base: 'EUR', quote: 'USD', rate: '1.087', effectiveDate: '2026-10-15', source: 'Carga manual (demo)', createdAt: '2026-10-15T09:05:00', createdBy: 'stf_05' },
]
