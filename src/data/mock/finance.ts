import type { CurrencyIndicator } from '@/types/domain'
import type { LegacyInvoice, LegacyPayable, LegacyPayment } from './seedTypes'

/*
 * Fictional financial records — demo data only. Every KPI, chart and balance
 * in the UI is derived from these records, so screens stay consistent.
 * No tax or exchange-rate logic is applied.
 */

export const mockInvoices: LegacyInvoice[] = [
  // USD
  { id: 'inv_01', number: 'FA-0001-00001812', clientId: 'cli_nordvik', projectId: 'prj_0143', issueDate: '2026-04-20', dueDate: '2026-06-04', currency: 'USD', amount: 9300, collected: 9300, status: 'paid' },
  { id: 'inv_02', number: 'FA-0001-00001820', clientId: 'cli_lumen', projectId: 'prj_0139', issueDate: '2026-05-28', dueDate: '2026-06-27', currency: 'USD', amount: 11400, collected: 11400, status: 'paid' },
  { id: 'inv_03', number: 'FA-0001-00001826', clientId: 'cli_nordvik', projectId: 'prj_0143', issueDate: '2026-06-12', dueDate: '2026-07-27', currency: 'USD', amount: 13500, collected: 13500, status: 'paid' },
  { id: 'inv_04', number: 'FA-0001-00001831', clientId: 'cli_kestrel', projectId: 'prj_0149', issueDate: '2026-07-08', dueDate: '2026-08-22', currency: 'USD', amount: 7400, collected: 7400, status: 'paid' },
  { id: 'inv_05', number: 'FA-0001-00001839', clientId: 'cli_nordvik', projectId: 'prj_0143', issueDate: '2026-08-31', dueDate: '2026-10-15', currency: 'USD', amount: 4100, collected: 4100, status: 'paid' },
  { id: 'inv_06', number: 'FA-0001-00001844', clientId: 'cli_kestrel', projectId: 'prj_0149', issueDate: '2026-09-04', dueDate: '2026-10-19', currency: 'USD', amount: 8000, collected: 8000, status: 'paid' },
  { id: 'inv_07', number: 'FA-0001-00001849', clientId: 'cli_andes', projectId: 'prj_0155', issueDate: '2026-09-25', dueDate: '2026-10-25', currency: 'USD', amount: 10300, collected: 0, status: 'issued' },
  { id: 'inv_08', number: 'FA-0001-00001853', clientId: 'cli_kestrel', projectId: 'prj_0157', issueDate: '2026-10-05', dueDate: '2026-11-19', currency: 'USD', amount: 3400, collected: 0, status: 'issued' },
  { id: 'inv_09', number: 'FA-0001-00001855', clientId: 'cli_andes', projectId: 'prj_0155', issueDate: '2026-10-12', dueDate: '2026-11-11', currency: 'USD', amount: 9800, collected: 0, status: 'issued' },
  { id: 'inv_10', number: 'FA-0001-00001858', clientId: 'cli_nordvik', projectId: 'prj_0158', issueDate: '2026-10-19', dueDate: '2026-12-03', currency: 'USD', amount: 1300, collected: 0, status: 'draft' },
  // EUR
  { id: 'inv_11', number: 'FA-0001-00001821', clientId: 'cli_brightwater', projectId: 'prj_0137', issueDate: '2026-05-08', dueDate: '2026-06-07', currency: 'EUR', amount: 8100, collected: 8100, status: 'paid' },
  { id: 'inv_12', number: 'FA-0001-00001825', clientId: 'cli_helvion', projectId: 'prj_0146', issueDate: '2026-06-05', dueDate: '2026-08-04', currency: 'EUR', amount: 5000, collected: 5000, status: 'paid' },
  { id: 'inv_13', number: 'FA-0001-00001830', clientId: 'cli_helvion', projectId: 'prj_0151', issueDate: '2026-07-03', dueDate: '2026-09-01', currency: 'EUR', amount: 10400, collected: 10400, status: 'paid' },
  { id: 'inv_14', number: 'FA-0001-00001833', clientId: 'cli_brightwater', projectId: 'prj_0137', issueDate: '2026-07-10', dueDate: '2026-08-09', currency: 'EUR', amount: 12400, collected: 12400, status: 'paid' },
  { id: 'inv_15', number: 'FA-0001-00001836', clientId: 'cli_helvion', projectId: 'prj_0151', issueDate: '2026-08-01', dueDate: '2026-09-30', currency: 'EUR', amount: 7400, collected: 0, status: 'overdue' },
  { id: 'inv_16', number: 'FA-0001-00001837', clientId: 'cli_helvion', projectId: 'prj_0152', issueDate: '2026-08-06', dueDate: '2026-10-05', currency: 'EUR', amount: 8800, collected: 8800, status: 'paid' },
  { id: 'inv_17', number: 'FA-0001-00001841', clientId: 'cli_helvion', projectId: 'prj_0146', issueDate: '2026-09-02', dueDate: '2026-11-01', currency: 'EUR', amount: 7200, collected: 3600, status: 'partially-paid' },
  { id: 'inv_18', number: 'FA-0001-00001845', clientId: 'cli_helvion', projectId: 'prj_0152', issueDate: '2026-09-10', dueDate: '2026-11-09', currency: 'EUR', amount: 3800, collected: 1900, status: 'partially-paid' },
  // ARS
  { id: 'inv_19', number: 'FA-0001-00001838', clientId: 'cli_pampa', projectId: 'prj_0147', issueDate: '2026-08-18', dueDate: '2026-09-17', currency: 'ARS', amount: 5200000, collected: 0, status: 'overdue' },
  { id: 'inv_20', number: 'FA-0001-00001846', clientId: 'cli_pampa', projectId: 'prj_0154', issueDate: '2026-09-15', dueDate: '2026-10-15', currency: 'ARS', amount: 5400000, collected: 5400000, status: 'paid' },
  { id: 'inv_21', number: 'FA-0001-00001854', clientId: 'cli_pampa', projectId: 'prj_0154', issueDate: '2026-10-09', dueDate: '2026-11-08', currency: 'ARS', amount: 8600000, collected: 0, status: 'issued' },
]

export const mockPayables: LegacyPayable[] = [
  { id: 'pay_01', reference: 'PRV-AT-7741', supplierId: 'sup_01', projectId: 'prj_0158', serviceId: 'prj_0158_s4', issueDate: '2026-10-05', dueDate: '2026-10-24', currency: 'USD', amount: 4600, paid: 0, status: 'scheduled' },
  { id: 'pay_02', reference: 'PRV-CN-0388', supplierId: 'sup_02', projectId: 'prj_0158', serviceId: 'prj_0158_s2', issueDate: '2026-10-10', dueDate: '2026-11-05', currency: 'USD', amount: 2600, paid: 0, status: 'pending-approval' },
  { id: 'pay_03', reference: 'PRV-MR-2210', supplierId: 'sup_04', projectId: 'prj_0155', serviceId: 'prj_0155_s2', issueDate: '2026-09-10', dueDate: '2026-09-30', currency: 'USD', amount: 2900, paid: 2900, status: 'paid' },
  { id: 'pay_04', reference: 'PRV-AC-1192', supplierId: 'sup_07', projectId: 'prj_0155', serviceId: 'prj_0155_s3', issueDate: '2026-09-28', dueDate: '2026-10-28', currency: 'USD', amount: 7100, paid: 3550, status: 'partially-paid' },
  { id: 'pay_05', reference: 'PRV-BM-5530', supplierId: 'sup_06', projectId: 'prj_0152', serviceId: 'prj_0152_s1', issueDate: '2026-09-10', dueDate: '2026-10-10', currency: 'EUR', amount: 2800, paid: 0, status: 'overdue' },
  { id: 'pay_06', reference: 'PRV-MH-0912', supplierId: 'sup_12', projectId: 'prj_0149', serviceId: 'prj_0149_s2', issueDate: '2026-09-22', dueDate: '2026-10-22', currency: 'USD', amount: 2100, paid: 0, status: 'scheduled' },
  { id: 'pay_07', reference: 'PRV-RG-3301', supplierId: 'sup_09', projectId: 'prj_0154', serviceId: 'prj_0154_s3', issueDate: '2026-10-01', dueDate: '2026-10-30', currency: 'ARS', amount: 6400000, paid: 0, status: 'scheduled' },
  { id: 'pay_08', reference: 'PRV-LS-0420', supplierId: 'sup_10', projectId: 'prj_0143', serviceId: 'prj_0143_s5', issueDate: '2026-07-25', dueDate: '2026-08-10', currency: 'USD', amount: 900, paid: 900, status: 'paid' },
  { id: 'pay_09', reference: 'PRV-AT-7612', supplierId: 'sup_01', projectId: 'prj_0143', serviceId: 'prj_0143_s3', issueDate: '2026-06-20', dueDate: '2026-07-05', currency: 'USD', amount: 9800, paid: 9800, status: 'paid' },
  { id: 'pay_10', reference: 'PRV-SK-0815', supplierId: 'sup_05', projectId: 'prj_0151', serviceId: 'prj_0151_s2', issueDate: '2026-10-01', dueDate: '2026-10-21', currency: 'EUR', amount: 3400, paid: 0, status: 'pending-approval' },
  { id: 'pay_11', reference: 'PRV-AT-7690', supplierId: 'sup_01', projectId: 'prj_0151', serviceId: 'prj_0151_s4', issueDate: '2026-09-15', dueDate: '2026-11-15', currency: 'EUR', amount: 10900, paid: 5450, status: 'partially-paid' },
  { id: 'pay_12', reference: 'PRV-IL-2044', supplierId: 'sup_03', projectId: 'prj_0161', serviceId: 'prj_0161_s1', issueDate: '2026-10-15', dueDate: '2026-11-02', currency: 'USD', amount: 2300, paid: 0, status: 'scheduled' },
  { id: 'pay_13', reference: 'PRV-NM-0671', supplierId: 'sup_11', projectId: 'prj_0160', serviceId: 'prj_0160_s1', issueDate: '2026-10-02', dueDate: '2026-10-20', currency: 'USD', amount: 2400, paid: 0, status: 'scheduled' },
  { id: 'pay_14', reference: 'PRV-EF-0233', supplierId: 'sup_08', projectId: 'prj_0160', serviceId: 'prj_0160_s3', issueDate: '2026-10-12', dueDate: '2026-11-10', currency: 'USD', amount: 1300, paid: 0, status: 'pending-approval' },
  { id: 'pay_15', reference: 'PRV-AL-0158', supplierId: 'sup_13', projectId: 'prj_0146', serviceId: 'prj_0146_s2', issueDate: '2026-07-10', dueDate: '2026-08-01', currency: 'EUR', amount: 2400, paid: 2400, status: 'paid' },
  { id: 'pay_16', reference: 'PRV-AT-7588', supplierId: 'sup_01', projectId: 'prj_0149', serviceId: 'prj_0149_s3', issueDate: '2026-08-20', dueDate: '2026-09-05', currency: 'USD', amount: 5600, paid: 5600, status: 'paid' },
  { id: 'pay_17', reference: 'PRV-CN-0371', supplierId: 'sup_02', projectId: 'prj_0154', serviceId: 'prj_0154_s2', issueDate: '2026-09-20', dueDate: '2026-10-05', currency: 'ARS', amount: 2200000, paid: 2200000, status: 'paid' },
]

export const mockPayments: LegacyPayment[] = [
  // Incoming — client collections
  { id: 'pin_01', direction: 'incoming', date: '2026-05-20', documentId: 'inv_01', counterparty: 'Nordvik Energy', method: 'wire', currency: 'USD', amount: 9300 },
  { id: 'pin_02', direction: 'incoming', date: '2026-06-18', documentId: 'inv_02', counterparty: 'Lumen Fintech', method: 'transfer', currency: 'USD', amount: 11400 },
  { id: 'pin_03', direction: 'incoming', date: '2026-07-24', documentId: 'inv_03', counterparty: 'Nordvik Energy', method: 'wire', currency: 'USD', amount: 13500 },
  { id: 'pin_04', direction: 'incoming', date: '2026-08-20', documentId: 'inv_04', counterparty: 'Kestrel Automotive', method: 'wire', currency: 'USD', amount: 7400 },
  { id: 'pin_05', direction: 'incoming', date: '2026-10-08', documentId: 'inv_05', counterparty: 'Nordvik Energy', method: 'wire', currency: 'USD', amount: 4100 },
  { id: 'pin_06', direction: 'incoming', date: '2026-10-15', documentId: 'inv_06', counterparty: 'Kestrel Automotive', method: 'wire', currency: 'USD', amount: 8000 },
  { id: 'pin_07', direction: 'incoming', date: '2026-06-03', documentId: 'inv_11', counterparty: 'Brightwater Consulting', method: 'wire', currency: 'EUR', amount: 8100 },
  { id: 'pin_08', direction: 'incoming', date: '2026-07-29', documentId: 'inv_12', counterparty: 'Helvion Pharma', method: 'wire', currency: 'EUR', amount: 5000 },
  { id: 'pin_09', direction: 'incoming', date: '2026-08-27', documentId: 'inv_13', counterparty: 'Helvion Pharma', method: 'wire', currency: 'EUR', amount: 10400 },
  { id: 'pin_10', direction: 'incoming', date: '2026-08-07', documentId: 'inv_14', counterparty: 'Brightwater Consulting', method: 'wire', currency: 'EUR', amount: 12400 },
  { id: 'pin_11', direction: 'incoming', date: '2026-09-30', documentId: 'inv_16', counterparty: 'Helvion Pharma', method: 'wire', currency: 'EUR', amount: 8800 },
  { id: 'pin_12', direction: 'incoming', date: '2026-10-06', documentId: 'inv_17', counterparty: 'Helvion Pharma', method: 'wire', currency: 'EUR', amount: 3600 },
  { id: 'pin_13', direction: 'incoming', date: '2026-10-10', documentId: 'inv_18', counterparty: 'Helvion Pharma', method: 'wire', currency: 'EUR', amount: 1900 },
  { id: 'pin_14', direction: 'incoming', date: '2026-10-16', documentId: 'inv_20', counterparty: 'Pampa Agritech', method: 'transfer', currency: 'ARS', amount: 5400000 },
  // Outgoing — supplier payments
  { id: 'pout_01', direction: 'outgoing', date: '2026-09-29', documentId: 'pay_03', counterparty: 'Maple Relocation Partners', method: 'wire', currency: 'USD', amount: 2900 },
  { id: 'pout_02', direction: 'outgoing', date: '2026-10-14', documentId: 'pay_04', counterparty: 'Andino Cargo', method: 'wire', currency: 'USD', amount: 3550 },
  { id: 'pout_03', direction: 'outgoing', date: '2026-08-08', documentId: 'pay_08', counterparty: 'Lone Star Settling', method: 'card', currency: 'USD', amount: 900 },
  { id: 'pout_04', direction: 'outgoing', date: '2026-07-03', documentId: 'pay_09', counterparty: 'Atlas Movers International', method: 'wire', currency: 'USD', amount: 9800 },
  { id: 'pout_05', direction: 'outgoing', date: '2026-10-03', documentId: 'pay_11', counterparty: 'Atlas Movers International', method: 'wire', currency: 'EUR', amount: 5450 },
  { id: 'pout_06', direction: 'outgoing', date: '2026-07-30', documentId: 'pay_15', counterparty: 'Andes Living Bogotá', method: 'wire', currency: 'EUR', amount: 2400 },
  { id: 'pout_07', direction: 'outgoing', date: '2026-09-04', documentId: 'pay_16', counterparty: 'Atlas Movers International', method: 'wire', currency: 'USD', amount: 5600 },
  { id: 'pout_08', direction: 'outgoing', date: '2026-10-05', documentId: 'pay_17', counterparty: 'Casa Nueva Propiedades', method: 'transfer', currency: 'ARS', amount: 2200000 },
]

/** Reference quotes for display only — fictional and never used for conversion. */
export const mockCurrencyIndicators: CurrencyIndicator[] = [
  { pair: 'USD/ARS', base: 'USD', quote: 'ARS', rate: 1452.5, changePct: 0.8 },
  { pair: 'EUR/USD', base: 'EUR', quote: 'USD', rate: 1.087, changePct: -0.3 },
  { pair: 'USD/BRL', base: 'USD', quote: 'BRL', rate: 5.42, changePct: 0.4 },
  { pair: 'USD/MXN', base: 'USD', quote: 'MXN', rate: 18.35, changePct: -0.6 },
  { pair: 'GBP/USD', base: 'GBP', quote: 'USD', rate: 1.271, changePct: 0.2 },
  { pair: 'USD/CLP', base: 'USD', quote: 'CLP', rate: 942.1, changePct: 0.5 },
]
