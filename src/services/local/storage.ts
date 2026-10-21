import { SCHEMA_VERSION, type Dataset } from '@/domain/dataset'
import { migrateDataset } from './migrations'

/*
 * Browser persistence for the fictional demo dataset only. Never store real
 * client records or personal documents here. Stored data is versioned and
 * validated; anything invalid or outdated is discarded and re-seeded.
 */

export const STORAGE_KEY = 'sigr.demo.dataset'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface Envelope {
  schemaVersion: number
  savedAt: string
  data: Dataset
}

export type LoadIssue = 'corrupted' | 'outdated' | 'invalid' | 'migrated'

const COLLECTIONS = [
  'staff', 'clients', 'suppliers', 'people', 'participants', 'projects', 'services', 'procedures',
  'tasks', 'activity', 'documents', 'currencyIndicators', 'alerts',
  'priceEntries', 'quotations', 'purchaseOrders',
  'legalEntities', 'invoices', 'receipts', 'collectionActions', 'agreements', 'costs', 'obligations', 'supplierPayments', 'exchangeRates', 'audit', 'settlements', 'catalogItems', 'openOrders', 'certificates', 'attachments', 'settlementBatches',
] as const

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const str = (x: unknown) => typeof x === 'string' && x.length > 0

/** Structural and referential checks so a tampered or partial store cannot crash the UI. */
export function isValidDataset(x: unknown): x is Dataset {
  if (!isObj(x) || x.schemaVersion !== SCHEMA_VERSION || !isObj(x.requests)) return false
  if (!COLLECTIONS.every((k) => Array.isArray(x[k]))) return false
  const d = x as unknown as Dataset
  const ids = (list: { id: string }[]) => new Set(list.map((i) => i.id))
  if (![...d.projects, ...d.services, ...d.procedures, ...d.tasks, ...d.people, ...d.participants].every((r) => isObj(r) && str(r.id))) return false
  const projects = ids(d.projects)
  const services = ids(d.services)
  const people = ids(d.people)
  const clients = ids(d.clients)
  const stagesOk = (s: unknown) => Array.isArray(s) && s.every((st) => isObj(st) && str(st.id) && str(st.label) && ['pending', 'current', 'done'].includes(st.status as string))
  return (
    d.projects.every((p) => str(p.code) && str(p.clientId) && people.has(p.beneficiaryId) && str(p.startDate) && str(p.targetDate)) &&
    d.services.every((s) => projects.has(s.projectId) && str(s.typeId) && stagesOk(s.stages) && Array.isArray(s.notes)) &&
    d.procedures.every((p) => services.has(p.serviceId) && people.has(p.personId) && stagesOk(p.stages) && Array.isArray(p.notes)) &&
    d.tasks.every((t) => projects.has(t.projectId) && services.has(t.serviceId) && str(t.title)) &&
    d.participants.every((p) => projects.has(p.projectId) && people.has(p.personId)) &&
    d.clients.every((c) => isObj(c) && str(c.id) && isObj(c.policy) && Array.isArray(c.contacts)) &&
    d.priceEntries.every((e) => clients.has(e.clientId) && str(e.serviceTypeId) && typeof e.unitPrice === 'number') &&
    d.quotations.every((q) => projects.has(q.projectId) && str(q.number) && Array.isArray(q.lines)) &&
    d.purchaseOrders.every((po) => projects.has(po.projectId) && clients.has(po.clientId) && Array.isArray(po.allocations) && po.allocations.every((a) => services.has(a.serviceId))) &&
    validFinance(d, projects, clients)
  )
}

const money = (x: unknown) => typeof x === 'number' && Number.isFinite(x)

/** Financial records must reference existing records and carry numeric amounts. */
function validFinance(d: Dataset, projects: Set<string>, clients: Set<string>): boolean {
  const invoices = new Set(d.invoices.map((i) => i.id))
  const suppliers = new Set(d.suppliers.map((s) => s.id))
  const obligations = new Set(d.obligations.map((o) => o.id))
  const costs = new Set(d.costs.map((c) => c.id))
  return (
    d.invoices.every((i) => str(i.id) && projects.has(i.projectId) && clients.has(i.clientId) && Array.isArray(i.lines) && Array.isArray(i.taxes) && i.lines.every((l) => money(l.unitPrice) && money(l.quantity))) &&
    d.receipts.every((r) => clients.has(r.clientId) && money(r.amount) && Array.isArray(r.allocations) && r.allocations.every((a) => invoices.has(a.invoiceId) && money(a.amount))) &&
    d.costs.every((c) => str(c.id) && money(c.amount) && (!c.projectId || projects.has(c.projectId))) &&
    d.obligations.every((o) => suppliers.has(o.supplierId) && costs.has(o.costId) && money(o.amount) && (!o.projectId || projects.has(o.projectId))) &&
    d.supplierPayments.every((p) => suppliers.has(p.supplierId) && money(p.amount) && Array.isArray(p.allocations) && p.allocations.every((a) => obligations.has(a.obligationId) && money(a.amount))) &&
    d.suppliers.every((s) => str(s.id) && Array.isArray(s.categories)) &&
    d.receipts.every((r) => !r.withholdings || (Array.isArray(r.withholdings) && r.withholdings.every((w) => invoices.has(w.invoiceId) && money(w.amount)))) &&
    d.settlementBatches.every((b) => str(b.id) && suppliers.has(b.supplierId) && Array.isArray(b.lines) && b.lines.every((l) => d.settlements.some((x) => x.id === l.settlementId) && money(l.amount) && money(l.converted)) && Array.isArray(b.deductions) && Array.isArray(b.history)) &&
    d.attachments.every((a) => str(a.id) && str(a.entityId) && (a.storage === 'indexeddb' || a.storage === 'reference')) &&
    d.catalogItems.every((i) => str(i.id) && str(i.serviceTypeId)) &&
    d.openOrders.every((o) => str(o.id) && clients.has(o.clientId) && Array.isArray(o.items)) &&
    d.certificates.every((c) => str(c.id) && projects.has(c.projectId) && Array.isArray(c.lines) && Array.isArray(c.history)) &&
    d.settlements.every((s) => str(s.id) && projects.has(s.projectId) && suppliers.has(s.supplierId) && Array.isArray(s.obligationIds) && s.obligationIds.every((o) => obligations.has(o)) && Array.isArray(s.adjustments) && Array.isArray(s.releases) && Array.isArray(s.confirmations) && Array.isArray(s.history))
  )
}

export function readDataset(storage: StorageLike | undefined): { dataset?: Dataset; issue?: LoadIssue } {
  if (!storage) return {}
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return {}
  }
  if (raw === null) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { issue: 'corrupted' }
  }
  if (!isObj(parsed) || !('data' in parsed)) return { issue: 'corrupted' }
  const version = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0
  if (version === SCHEMA_VERSION) return isValidDataset(parsed.data) ? { dataset: parsed.data } : { issue: 'invalid' }
  if (version < SCHEMA_VERSION && version >= 2) {
    const migrated = migrateDataset(parsed.data, version, SCHEMA_VERSION)
    if (isValidDataset(migrated)) {
      // Persist the upgrade so it runs once.
      writeDataset(storage, migrated, new Date().toISOString())
      return { dataset: migrated, issue: 'migrated' }
    }
    return { issue: 'invalid' }
  }
  return { issue: 'outdated' }
}

/** Returns false when storage is unavailable or full; the app keeps working in memory. */
export function writeDataset(storage: StorageLike | undefined, dataset: Dataset, savedAt: string): boolean {
  if (!storage) return false
  try {
    const envelope: Envelope = { schemaVersion: SCHEMA_VERSION, savedAt, data: dataset }
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

export function clearDataset(storage: StorageLike | undefined): void {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function browserStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  } catch {
    return undefined
  }
}
