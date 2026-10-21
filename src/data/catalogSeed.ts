import type { Dataset } from '@/domain/dataset'
import type { DomainContext } from '@/domain/context'
import { createProject } from '@/domain/projects'
import { approveCertificate, createCertificate, submitCertificate } from '@/domain/commercial/certificates'
import type { CatalogItem, Client, OpenPurchaseOrder, PriceEntry, PriceUnit } from '@/types/domain'

/*
 * Phase 4.6 fictional demo data: a hierarchical catalog for every main
 * service, item tariffs that differ per client, a client working with open
 * POs by province and certificates ("Petrovalle Energía" is fictional).
 */

const T = '2026-01-10T09:00:00'
const item = (serviceTypeId: string, n: number, name: string, unit: PriceUnit = 'service', description?: string): CatalogItem => ({
  id: `itm_${serviceTypeId}_${n}`,
  serviceTypeId,
  name,
  description,
  unit,
  active: true,
  createdAt: T,
})

export const seedCatalogItems: CatalogItem[] = [
  item('immigration', 1, 'Residencia temporaria', 'person'),
  item('immigration', 2, 'DNI', 'person'),
  item('immigration', 3, 'Permiso de trabajo', 'person'),
  item('immigration', 4, 'Visa de ingreso', 'person'),
  item('housing', 1, 'Búsqueda de vivienda', 'service', 'Preselección de propiedades según perfil'),
  item('housing', 2, 'Visitas a propiedades', 'session'),
  item('housing', 3, 'Asistencia con contrato', 'service'),
  item('housing', 4, 'Inventario de ingreso', 'service'),
  item('schooling', 1, 'Búsqueda de colegios', 'family'),
  item('schooling', 2, 'Gestión de admisión', 'person'),
  item('moving', 1, 'Relevamiento de mudanza', 'service'),
  item('moving', 2, 'Mudanza puerta a puerta', 'service'),
  item('moving', 3, 'Almacenaje', 'month'),
  item('intercultural-workshop', 1, 'Taller individual', 'session'),
  item('intercultural-workshop', 2, 'Taller familiar', 'session'),
  item('dual-career', 1, 'Sesión de coaching', 'session'),
  item('dual-career', 2, 'Revisión de CV', 'document'),
  item('driving-license', 1, 'Canje de licencia', 'person'),
  item('apostille', 1, 'Apostilla por documento', 'document'),
  item('pre-migration-talk', 1, 'Charla individual', 'session'),
  item('pre-migration-talk', 2, 'Charla grupal', 'session'),
  // Unificación de CUIL has no sub-services: it is billed as a single line.
]

const PV = 'cli_petrovalle'

const petrovalle: Client = {
  id: PV,
  name: 'Petrovalle Energía',
  legalName: 'Petrovalle Energía S.A. (demo)',
  taxId: 'DEMO-PV-0001',
  industry: 'Energía',
  headquarters: { country: 'AR', city: 'Buenos Aires' },
  billingAddress: 'Buenos Aires (dirección ficticia)',
  status: 'active',
  accountManagerId: 'stf_02',
  billingCurrency: 'ARS',
  currencies: ['ARS'],
  paymentTermsDays: 45,
  clientSince: '2026-02-01',
  contacts: [{ id: 'ct_pv_1', name: 'Lucía Ferraro', role: 'Movilidad', email: 'l.ferraro@petrovalle.example', phone: '+54 11 5555 0101', primary: true }],
  policy: { requiresPurchaseOrder: true, requiresApprovedQuote: false, billingMilestone: 'service-started', quoteValidityDays: 30, poMode: 'open', requiresCertificate: true },
  offeredServices: ['immigration', 'housing', 'schooling', 'moving', 'intercultural-workshop', 'cuil-unification'],
  notes: 'Cliente ficticio: trabaja con OC abiertas por provincia y certificados en su portal de proveedores.',
}

const price = (id: string, clientId: string, serviceTypeId: string, itemId: string | undefined, currency: PriceEntry['currency'], unitPrice: number, unit: PriceUnit): PriceEntry => ({
  id,
  clientId,
  serviceTypeId,
  itemId,
  market: 'ANY',
  currency,
  unitPrice,
  unit,
  minQuantity: 1,
  validFrom: '2026-01-01',
  active: true,
  agreement: 'Tarifario 2026 (demo)',
  approvedAt: T,
  approvedBy: 'stf_01',
  approvalRef: 'Acta comercial 2026-01 (demo)',
  createdAt: T,
  updatedAt: T,
})

export const seedItemPrices: PriceEntry[] = [
  price('tar_pv_hou1', PV, 'housing', 'itm_housing_1', 'ARS', 900000, 'service'),
  price('tar_pv_hou2', PV, 'housing', 'itm_housing_2', 'ARS', 120000, 'session'),
  price('tar_pv_hou3', PV, 'housing', 'itm_housing_3', 'ARS', 450000, 'service'),
  price('tar_pv_hou4', PV, 'housing', 'itm_housing_4', 'ARS', 200000, 'service'),
  price('tar_pv_imm1', PV, 'immigration', 'itm_immigration_1', 'ARS', 750000, 'person'),
  price('tar_pv_imm2', PV, 'immigration', 'itm_immigration_2', 'ARS', 180000, 'person'),
  price('tar_pv_cuil', PV, 'cuil-unification', undefined, 'ARS', 150000, 'person'),
  // Same sub-services, different tariff for another client.
  price('tar_nv_hou1', 'cli_nordvik', 'housing', 'itm_housing_1', 'USD', 1600, 'service'),
  price('tar_nv_hou2', 'cli_nordvik', 'housing', 'itm_housing_2', 'USD', 250, 'session'),
  price('tar_nv_hou3', 'cli_nordvik', 'housing', 'itm_housing_3', 'USD', 900, 'service'),
]

const oc = (id: string, number: string, province: string, items: OpenPurchaseOrder['items']): OpenPurchaseOrder => ({
  id,
  number,
  clientId: PV,
  province,
  currency: 'ARS',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  status: 'active',
  conditions: 'Precios fijos 2026. Pago a 45 días de factura con certificado aprobado.',
  items,
  documentRef: `DOCREF-${id}`,
  createdAt: T,
  createdBy: 'stf_01',
})

export const seedOpenOrders: OpenPurchaseOrder[] = [
  oc('oca_pv_nqn', '4500012345', 'Neuquén', [
    // Housing: three of the four catalog sub-services are authorised.
    { id: 'oci_nqn_1', serviceTypeId: 'housing', catalogItemId: 'itm_housing_1', unit: 'service', unitPrice: 900000 },
    { id: 'oci_nqn_2', serviceTypeId: 'housing', catalogItemId: 'itm_housing_2', unit: 'session', unitPrice: 120000 },
    { id: 'oci_nqn_3', serviceTypeId: 'housing', catalogItemId: 'itm_housing_3', unit: 'service', unitPrice: 450000 },
    { id: 'oci_nqn_4', serviceTypeId: 'immigration', catalogItemId: 'itm_immigration_1', unit: 'person', unitPrice: 750000 },
    { id: 'oci_nqn_5', serviceTypeId: 'immigration', catalogItemId: 'itm_immigration_2', unit: 'person', unitPrice: 180000 },
    { id: 'oci_nqn_6', serviceTypeId: 'cuil-unification', unit: 'person', unitPrice: 150000 },
  ]),
  oc('oca_pv_chu', '4500012399', 'Chubut', [
    { id: 'oci_chu_1', serviceTypeId: 'housing', catalogItemId: 'itm_housing_1', unit: 'service', unitPrice: 980000 },
    { id: 'oci_chu_2', serviceTypeId: 'moving', catalogItemId: 'itm_moving_2', unit: 'service', unitPrice: 2400000 },
  ]),
]

/** Deterministic demo clock; `day` advances so every record date is coherent. */
function seedCtx(): DomainContext & { day: string } {
  let n = 0
  const ctx = { day: '2026-09-20', actorId: 'stf_01', now: () => `${ctx.day}T10:00:00`, today: () => ctx.day, newId: (prefix: string) => `${prefix}_p46_${++n}` }
  return ctx
}

/**
 * Adds the Phase 4.6 records to a dataset that does not have them yet (seed and
 * v5 → v6 migration). Existing records are never modified.
 */
export function withCatalogSeed(ds: Dataset): Dataset {
  let next: Dataset = {
    ...ds,
    catalogItems: ds.catalogItems?.length ? ds.catalogItems : seedCatalogItems,
    openOrders: ds.openOrders ?? [],
    certificates: ds.certificates ?? [],
  }
  if (next.clients.some((c) => c.id === PV)) return next
  const clientsOk = next.clients.some((c) => c.id === 'cli_nordvik')
  next = {
    ...next,
    clients: [...next.clients, petrovalle],
    priceEntries: [...next.priceEntries, ...seedItemPrices.filter((p) => p.clientId === PV || clientsOk)],
    openOrders: [...next.openOrders, ...seedOpenOrders],
  }
  if (!next.staff.some((s) => s.id === 'stf_02')) return next
  // Demo idempotency keys must not short-circuit the demo creation.
  next = { ...next, requests: Object.fromEntries(Object.entries(next.requests).filter(([k]) => !k.startsWith('seed-p46-'))) }
  const ctx = seedCtx()
  const base = {
    clientId: PV,
    family: [],
    origin: { country: 'AR' as const, city: 'Buenos Aires' },
    destination: { country: 'AR' as const, city: 'Neuquén' },
    category: 'long-term' as const,
    ownerId: 'stf_02',
    startDate: '2026-09-01',
    targetDate: '2027-02-28',
    province: 'Neuquén',
    openOrderId: 'oca_pv_nqn',
  }
  const svc = (typeId: string, items?: { catalogItemId: string; quantity: number }[]) => ({ typeId, ownerId: 'stf_02', startDate: '2026-09-01', dueDate: '2027-01-31', startNow: true, items })
  const a = createProject(
    next,
    {
      ...base,
      beneficiary: { name: 'Tomás Herrera', nationality: 'CO', email: 't.herrera@petrovalle.example', jobTitle: 'Ingeniero de reservorios' },
      family: [{ name: 'Paula Herrera', role: 'spouse' }],
      services: [
        // Housing: only three of the catalog sub-services are contracted.
        svc('housing', [
          { catalogItemId: 'itm_housing_1', quantity: 1 },
          { catalogItemId: 'itm_housing_2', quantity: 3 },
          { catalogItemId: 'itm_housing_3', quantity: 1 },
        ]),
        svc('immigration', [
          { catalogItemId: 'itm_immigration_1', quantity: 2 },
          { catalogItemId: 'itm_immigration_2', quantity: 2 },
        ]),
        svc('cuil-unification'),
      ],
    },
    'seed-p46-a',
    ctx,
  )
  next = a.ds
  // The same open PO is reused by a second project, without consuming any balance.
  next = createProject(
    next,
    {
      ...base,
      startDate: '2026-10-01',
      beneficiary: { name: 'Renata Quiroga', nationality: 'CL', email: 'r.quiroga@petrovalle.example', jobTitle: 'Geóloga' },
      services: [{ ...svc('housing', [{ catalogItemId: 'itm_housing_1', quantity: 1 }, { catalogItemId: 'itm_housing_2', quantity: 2 }]), startDate: '2026-10-01' }],
    },
    'seed-p46-b',
    ctx,
  ).ds
  // Partial certification on project A: one approved certificate across two services, one still in draft.
  const services = next.services.filter((s) => s.projectId === a.projectId)
  const housing = services.find((s) => s.typeId === 'housing')!
  const imm = services.find((s) => s.typeId === 'immigration')!
  const line = (s: typeof housing, catalogItemId: string, quantity: number) => ({ serviceId: s.id, serviceItemId: s.items!.find((i) => i.catalogItemId === catalogItemId)!.id, quantity })
  const c1 = createCertificate(next, { projectId: a.projectId, lines: [line(housing, 'itm_housing_1', 1), line(housing, 'itm_housing_2', 2), line(imm, 'itm_immigration_1', 1)] }, 'seed-p46-c1', ctx)
  ctx.day = '2026-09-25'
  next = submitCertificate(c1.ds, c1.certificateId, { externalNumber: 'CERT-PV-778812', date: '2026-09-25' }, ctx)
  ctx.day = '2026-10-02'
  next = approveCertificate(next, c1.certificateId, { date: '2026-10-02' }, ctx)
  ctx.day = '2026-10-15'
  next = createCertificate(next, { projectId: a.projectId, lines: [line(imm, 'itm_immigration_2', 2)], notes: 'Pendiente de generar en el portal del cliente.' }, 'seed-p46-c2', ctx).ds
  return next
}
