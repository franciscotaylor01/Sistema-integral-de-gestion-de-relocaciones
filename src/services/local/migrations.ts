import { buildCommercialSeed, withCommercial } from '@/data/seed'
import { priceListsToEntries } from '@/domain/commercial/legacy'
import type { Dataset } from '@/domain/dataset'
import type { Client, PriceList } from '@/types/domain'

/*
 * Versioned storage migrations. Each step upgrades the persisted dataset by
 * one schema version, keeping the user's changes. Unknown older versions are
 * not migrated (the store re-seeds safely instead).
 */

type V2Client = Omit<Client, 'policy' | 'billingAddress' | 'notes'> & { priceLists?: PriceList[] }
type V2Dataset = Omit<Dataset, 'schemaVersion' | 'clients' | 'priceEntries' | 'quotations' | 'purchaseOrders'> & { schemaVersion: 2; clients: V2Client[] }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** v2 (Phase 2) → v3 (Phase 3): client commercial policies, price rules, quotations and POs. */
function v2ToV3(data: V2Dataset): Dataset {
  const legacy = data.clients.flatMap((c) => (Array.isArray(c.priceLists) ? priceListsToEntries(c.id, c.priceLists, '2026-01-05T09:00:00') : []))
  const clients = data.clients.map(({ priceLists: _drop, ...c }) => withCommercial(c))
  const commercial = buildCommercialSeed({ clients, projects: data.projects, services: data.services }, legacy)
  return { ...data, schemaVersion: 3, clients, ...commercial }
}

const steps: Record<number, (data: never) => unknown> = {
  2: v2ToV3 as (data: never) => unknown,
}

/** Returns the migrated dataset, or undefined if `data` cannot be upgraded. */
export function migrateDataset(data: unknown, fromVersion: number, targetVersion: number): unknown {
  let current = data
  for (let v = fromVersion; v < targetVersion; v++) {
    const step = steps[v]
    if (!step || !isObj(current) || !Array.isArray(current.clients) || !Array.isArray(current.projects) || !Array.isArray(current.services)) return undefined
    try {
      current = step(current as never)
    } catch {
      return undefined
    }
  }
  return current
}
