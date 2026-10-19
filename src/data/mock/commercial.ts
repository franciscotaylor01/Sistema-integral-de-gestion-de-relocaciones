import type { ClientCommercialSeed, PriceEntrySeed, PurchaseOrderSeed, QuotationSeed } from './seedTypes'

/* Fictional commercial data (Phase 3) — demo only, no real client records. */

export const mockClientCommercial: Record<string, ClientCommercialSeed> = {
  cli_nordvik: {
    billingAddress: 'Wilhelminakade 900, 3072 AP Rotterdam, Países Bajos',
    policy: { requiresPurchaseOrder: true, requiresApprovedQuote: true, billingMilestone: 'service-started', quoteValidityDays: 30 },
    notes: 'Las OC se emiten por proyecto desde Global Mobility; aceptan OC parciales.',
  },
  cli_andes: {
    billingAddress: 'Av. Apoquindo 4800, piso 12, Las Condes, Santiago, Chile',
    policy: { requiresPurchaseOrder: true, requiresApprovedQuote: true, billingMilestone: 'service-completed', quoteValidityDays: 20 },
  },
  cli_helvion: {
    billingAddress: 'Rheinstrasse 42, 4058 Basilea, Suiza',
    policy: { requiresPurchaseOrder: true, requiresApprovedQuote: true, billingMilestone: 'quote-approved', quoteValidityDays: 45 },
    notes: 'Facturación anticipada permitida una vez aprobada la cotización y recibida la OC.',
  },
  cli_kestrel: {
    billingAddress: '1200 Woodward Ave, Detroit, MI 48226, Estados Unidos',
    policy: { requiresPurchaseOrder: false, requiresApprovedQuote: true, billingMilestone: 'service-completed', quoteValidityDays: 30 },
    notes: 'No emite OC: la aprobación de la cotización por email es suficiente.',
  },
  cli_lumen: {
    billingAddress: 'Av. del Libertador 1000, piso 8, CABA, Argentina',
    policy: { requiresPurchaseOrder: false, requiresApprovedQuote: true, billingMilestone: 'quote-approved', quoteValidityDays: 10 },
  },
  cli_pampa: {
    billingAddress: 'Bv. San Juan 520, X5000 Córdoba, Argentina',
    policy: { requiresPurchaseOrder: true, requiresApprovedQuote: true, billingMilestone: 'service-started', quoteValidityDays: 15 },
  },
  cli_oceanic: {
    billingAddress: '25 Canada Square, London E14 5LQ, Reino Unido',
    policy: { requiresPurchaseOrder: true, requiresApprovedQuote: true, billingMilestone: 'service-completed', quoteValidityDays: 30 },
    notes: 'Cliente en alta: tarifario a negociar.',
  },
  cli_brightwater: {
    billingAddress: 'Leopoldstrasse 150, 80804 Múnich, Alemania',
    policy: { requiresPurchaseOrder: false, requiresApprovedQuote: false, billingMilestone: 'service-completed', quoteValidityDays: 30 },
  },
}

/** Price rules beyond the legacy lists: market-specific, quantity tiers and one deliberate overlap. */
export const mockExtraPriceEntries: PriceEntrySeed[] = [
  {
    id: 'tar_nv_housing_ar', clientId: 'cli_nordvik', serviceTypeId: 'housing', market: 'AR', currency: 'USD', unitPrice: 4500, unit: 'service',
    minQuantity: 1, validFrom: '2026-01-01', validTo: '2026-12-31', active: true, agreement: 'Adenda Argentina 2026', notes: 'Mercado de alquiler en Neuquén.',
  },
  {
    id: 'tar_nv_immigration_q4', clientId: 'cli_nordvik', serviceTypeId: 'immigration', market: 'ANY', currency: 'USD', unitPrice: 5400, unit: 'service',
    minQuantity: 1, validFrom: '2026-10-01', validTo: '2026-12-31', active: true, agreement: 'Adenda Q4 2026',
    notes: 'Se superpone con el tarifario corporativo: requiere revisión.',
  },
  {
    id: 'tar_hp_schooling_tier', clientId: 'cli_helvion', serviceTypeId: 'schooling', market: 'ANY', currency: 'EUR', unitPrice: 2100, unit: 'person',
    minQuantity: 2, validFrom: '2026-01-01', validTo: '2027-06-30', active: true, agreement: 'Global Mobility Agreement', notes: 'Desde 2 hijos, precio por niño.',
  },
  {
    id: 'tar_amg_moving_ca', clientId: 'cli_andes', serviceTypeId: 'moving', market: 'CA', currency: 'USD', unitPrice: 10500, unit: 'service',
    minQuantity: 1, validFrom: '2026-01-01', validTo: '2027-01-31', active: true, agreement: 'Acuerdo marco 2026', notes: 'Mudanzas transcontinentales a Canadá.',
  },
  {
    id: 'tar_kes_dni', clientId: 'cli_kestrel', serviceTypeId: 'pre-migration-talk', market: 'ANY', currency: 'USD', unitPrice: 600, unit: 'session',
    minQuantity: 1, validFrom: '2026-01-01', validTo: '2026-12-31', active: false, agreement: 'Tarifario USMCA', notes: 'Discontinuada.',
  },
]

export const mockQuotationSeeds: QuotationSeed[] = [
  { id: 'quo_01', number: 'COT-2026-0001', version: 1, projectId: 'prj_0143', status: 'approved', issueDate: '2026-03-20', validUntil: '2026-04-19', sentAt: '2026-03-20', approvedAt: '2026-03-28', approvedBy: 'Sanne Visser (Nordvik)' },
  { id: 'quo_02', number: 'COT-2026-0002', version: 1, projectId: 'prj_0139', status: 'approved', issueDate: '2026-03-02', validUntil: '2026-03-12', sentAt: '2026-03-02', approvedAt: '2026-03-06', approvedBy: 'Florencia Ledesma (Lumen)' },
  { id: 'quo_03', number: 'COT-2026-0003', version: 1, projectId: 'prj_0137', status: 'approved', issueDate: '2026-02-05', validUntil: '2026-03-07', sentAt: '2026-02-05', approvedAt: '2026-02-10', approvedBy: 'Katrin Vogel (Brightwater)' },
  { id: 'quo_04', number: 'COT-2026-0004', version: 1, projectId: 'prj_0146', status: 'approved', issueDate: '2026-05-20', validUntil: '2026-07-04', sentAt: '2026-05-20', approvedAt: '2026-05-25', approvedBy: 'Anna Keller (Helvion)' },
  { id: 'quo_05', number: 'COT-2026-0005', version: 1, projectId: 'prj_0149', status: 'approved', issueDate: '2026-06-05', validUntil: '2026-07-05', sentAt: '2026-06-05', approvedAt: '2026-06-10', approvedBy: 'Rachel Owens (Kestrel)' },
  { id: 'quo_06', number: 'COT-2026-0006', version: 1, projectId: 'prj_0151', status: 'approved', issueDate: '2026-06-20', validUntil: '2026-08-04', sentAt: '2026-06-20', approvedAt: '2026-06-25', approvedBy: 'Anna Keller (Helvion)' },
  { id: 'quo_07', number: 'COT-2026-0007', version: 1, projectId: 'prj_0152', status: 'approved', issueDate: '2026-07-10', validUntil: '2026-08-24', sentAt: '2026-07-10', approvedAt: '2026-07-15', approvedBy: 'Lea Frei (Helvion)' },
  { id: 'quo_08', number: 'COT-2026-0008', version: 1, projectId: 'prj_0147', status: 'approved', issueDate: '2026-07-25', validUntil: '2026-08-09', sentAt: '2026-07-25', approvedAt: '2026-08-05', approvedBy: 'Gustavo Correa (Pampa)' },
  { id: 'quo_09', number: 'COT-2026-0009', version: 1, projectId: 'prj_0155', status: 'approved', issueDate: '2026-08-04', validUntil: '2026-08-24', sentAt: '2026-08-04', approvedAt: '2026-08-08', approvedBy: 'Paula Valenzuela (Andes)' },
  { id: 'quo_10', number: 'COT-2026-0010', version: 1, projectId: 'prj_0154', status: 'approved', issueDate: '2026-08-18', validUntil: '2026-09-02', sentAt: '2026-08-18', approvedAt: '2026-08-22', approvedBy: 'Gustavo Correa (Pampa)' },
  // Versioning: v1 approved, then replaced by an approved v2 with a lower moving price.
  { id: 'quo_11a', number: 'COT-2026-0011', version: 1, projectId: 'prj_0158', status: 'approved', issueDate: '2026-08-20', validUntil: '2026-09-19', sentAt: '2026-08-20', approvedAt: '2026-08-25', approvedBy: 'Sanne Visser (Nordvik)', supersededById: 'quo_11b', prices: { prj_0158_s4: 13500 } },
  { id: 'quo_11b', number: 'COT-2026-0011', version: 2, previousVersionId: 'quo_11a', projectId: 'prj_0158', status: 'approved', issueDate: '2026-09-02', validUntil: '2026-10-02', sentAt: '2026-09-02', approvedAt: '2026-09-05', approvedBy: 'Sanne Visser (Nordvik)', notes: 'Mudanza renegociada con Atlas Movers.' },
  { id: 'quo_12', number: 'COT-2026-0012', version: 1, projectId: 'prj_0157', status: 'approved', issueDate: '2026-09-10', validUntil: '2026-10-10', sentAt: '2026-09-10', approvedAt: '2026-09-18', approvedBy: 'Rachel Owens (Kestrel)' },
  { id: 'quo_13', number: 'COT-2026-0013', version: 1, projectId: 'prj_0160', status: 'approved', issueDate: '2026-09-15', validUntil: '2026-10-05', sentAt: '2026-09-15', approvedAt: '2026-09-18', approvedBy: 'Paula Valenzuela (Andes)' },
  // Rejected, then a new version waiting for the client.
  { id: 'quo_14a', number: 'COT-2026-0014', version: 1, projectId: 'prj_0159', status: 'rejected', issueDate: '2026-10-01', validUntil: '2026-10-31', sentAt: '2026-10-01', rejectionReason: 'La mudanza supera el presupuesto aprobado por el cliente.', prices: { prj_0159_s3: 12500 } },
  { id: 'quo_14b', number: 'COT-2026-0014', version: 2, previousVersionId: 'quo_14a', projectId: 'prj_0159', status: 'sent', issueDate: '2026-10-08', validUntil: '2026-11-07', sentAt: '2026-10-08' },
  // Sent but past its validity → shown as expired.
  { id: 'quo_15', number: 'COT-2026-0015', version: 1, projectId: 'prj_0161', status: 'sent', issueDate: '2026-10-07', validUntil: '2026-10-17', sentAt: '2026-10-07' },
  { id: 'quo_16', number: 'COT-2026-0016', version: 1, projectId: 'prj_0162', status: 'draft', issueDate: '2026-10-19', validUntil: '2026-11-18', notes: 'Pendiente de tarifario con Oceanic.' },
]

export const mockPurchaseOrderSeeds: PurchaseOrderSeed[] = [
  { id: 'po_01', internalNumber: 'OCI-2026-0001', clientPoNumber: 'PO-NV-2026-0311', projectId: 'prj_0143', quotationId: 'quo_01', issueDate: '2026-03-30', receivedDate: '2026-03-31', authorizedAmount: 26900, allocations: { prj_0143_s1: 5000, prj_0143_s2: 4300, prj_0143_s3: 13500, prj_0143_s4: 2500, prj_0143_s5: 1600 }, documentLabel: 'PO-NV-2026-0311.pdf' },
  { id: 'po_02', internalNumber: 'OCI-2026-0002', clientPoNumber: 'HP-PO-884010', projectId: 'prj_0146', quotationId: 'quo_04', issueDate: '2026-05-27', receivedDate: '2026-05-28', authorizedAmount: 12200, allocations: { prj_0146_s1: 4700, prj_0146_s2: 3800, prj_0146_s3: 1200, prj_0146_s4: 2500 } },
  { id: 'po_03', internalNumber: 'OCI-2026-0003', clientPoNumber: 'HP-PO-887455', projectId: 'prj_0151', quotationId: 'quo_06', issueDate: '2026-06-27', receivedDate: '2026-06-29', authorizedAmount: 27200, allocations: { prj_0151_s1: 5600, prj_0151_s2: 4800, prj_0151_s3: 2600, prj_0151_s4: 14200 } },
  // Partial: settling-in still pending authorisation.
  { id: 'po_04', internalNumber: 'OCI-2026-0004', clientPoNumber: 'HP-PO-889120', projectId: 'prj_0152', quotationId: 'quo_07', issueDate: '2026-07-16', receivedDate: '2026-07-17', authorizedAmount: 11100, allocations: { prj_0152_s1: 4900, prj_0152_s2: 3900, prj_0152_s3: 2300 } },
  // Partial: only the migration service authorised so far.
  { id: 'po_05', internalNumber: 'OCI-2026-0005', clientPoNumber: 'OC-PAMPA-2231', projectId: 'prj_0147', quotationId: 'quo_08', issueDate: '2026-08-06', receivedDate: '2026-08-08', authorizedAmount: 5200000, allocations: { prj_0147_s1: 5200000 } },
  { id: 'po_06', internalNumber: 'OCI-2026-0006', clientPoNumber: 'OC-AMG-55406', projectId: 'prj_0155', quotationId: 'quo_09', issueDate: '2026-08-10', receivedDate: '2026-08-11', authorizedAmount: 22500, allocations: { prj_0155_s1: 5800, prj_0155_s2: 4500, prj_0155_s3: 9800, prj_0155_s4: 2400 } },
  { id: 'po_07', internalNumber: 'OCI-2026-0007', clientPoNumber: 'OC-PAMPA-2307', projectId: 'prj_0154', quotationId: 'quo_10', issueDate: '2026-08-24', receivedDate: '2026-08-25', authorizedAmount: 14000000, allocations: { prj_0154_s1: 1900000, prj_0154_s2: 3500000, prj_0154_s3: 8600000 } },
  // Partial: schooling and orientation pending.
  { id: 'po_08', internalNumber: 'OCI-2026-0008', clientPoNumber: 'PO-NV-2026-0712', projectId: 'prj_0158', quotationId: 'quo_11b', issueDate: '2026-09-08', receivedDate: '2026-09-10', authorizedAmount: 22200, allocations: { prj_0158_s1: 5200, prj_0158_s2: 4200, prj_0158_s4: 12800 }, documentLabel: 'PO-NV-2026-0712 firmada.pdf' },
  { id: 'po_09', internalNumber: 'OCI-2026-0009', clientPoNumber: 'OC-AMG-55821', projectId: 'prj_0160', quotationId: 'quo_13', issueDate: '2026-09-20', receivedDate: '2026-09-22', authorizedAmount: 9600, allocations: { prj_0160_s1: 4100, prj_0160_s2: 3400, prj_0160_s3: 2100 } },
]
