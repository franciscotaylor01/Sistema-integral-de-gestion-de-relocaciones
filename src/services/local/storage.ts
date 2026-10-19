import { SCHEMA_VERSION, type Dataset } from '@/domain/dataset'

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

export type LoadIssue = 'corrupted' | 'outdated' | 'invalid'

const COLLECTIONS = [
  'staff', 'clients', 'suppliers', 'people', 'participants', 'projects', 'services', 'procedures',
  'tasks', 'activity', 'documents', 'invoices', 'payables', 'payments', 'currencyIndicators', 'alerts',
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
  const stagesOk = (s: unknown) => Array.isArray(s) && s.every((st) => isObj(st) && str(st.id) && str(st.label) && ['pending', 'current', 'done'].includes(st.status as string))
  return (
    d.projects.every((p) => str(p.code) && str(p.clientId) && people.has(p.beneficiaryId) && str(p.startDate) && str(p.targetDate)) &&
    d.services.every((s) => projects.has(s.projectId) && str(s.typeId) && stagesOk(s.stages) && Array.isArray(s.notes)) &&
    d.procedures.every((p) => services.has(p.serviceId) && people.has(p.personId) && stagesOk(p.stages) && Array.isArray(p.notes)) &&
    d.tasks.every((t) => projects.has(t.projectId) && services.has(t.serviceId) && str(t.title)) &&
    d.participants.every((p) => projects.has(p.projectId) && people.has(p.personId))
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
  if (parsed.schemaVersion !== SCHEMA_VERSION) return { issue: 'outdated' }
  return isValidDataset(parsed.data) ? { dataset: parsed.data } : { issue: 'invalid' }
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
