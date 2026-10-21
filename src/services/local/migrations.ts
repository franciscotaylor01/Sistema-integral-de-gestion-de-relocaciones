import { withCatalogSeed } from '@/data/catalogSeed'
import { buildCommercialSeed, buildFinanceSeed, buildSettlementSeed, withCommercial } from '@/data/seed'
import type { LegacyInvoice, LegacyPayable, LegacyPayment, LegacySupplier } from '@/data/mock/seedTypes'
import { priceListsToEntries } from '@/domain/commercial/legacy'
import type { Dataset } from '@/domain/dataset'
import type { Client, PriceList } from '@/types/domain'

/*
 * Versioned storage migrations. Each step upgrades the persisted dataset by
 * one schema version, keeping the user's changes. Unknown older versions are
 * not migrated (the store re-seeds safely instead).
 */

type V2Client = Omit<Client, 'policy' | 'billingAddress' | 'notes'> & { priceLists?: PriceList[] }

/** Phase 1–3 flat finance collections (replaced in v4). */
interface LegacyFinanceFields {
  suppliers: LegacySupplier[]
  invoices: LegacyInvoice[]
  payables: LegacyPayable[]
  payments: LegacyPayment[]
}

type FinanceV4Keys = 'legalEntities' | 'invoices' | 'receipts' | 'collectionActions' | 'agreements' | 'costs' | 'obligations' | 'supplierPayments' | 'exchangeRates' | 'audit' | 'suppliers'

type V3Dataset = Omit<Dataset, 'schemaVersion' | FinanceV4Keys> & LegacyFinanceFields & { schemaVersion: 3 }
type V2Dataset = Omit<V3Dataset, 'schemaVersion' | 'clients' | 'priceEntries' | 'quotations' | 'purchaseOrders'> & { schemaVersion: 2; clients: V2Client[] }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** v2 (Phase 2) → v3 (Phase 3): client commercial policies, price rules, quotations and POs. */
function v2ToV3(data: V2Dataset): V3Dataset {
  const legacy = data.clients.flatMap((c) => (Array.isArray(c.priceLists) ? priceListsToEntries(c.id, c.priceLists, '2026-01-05T09:00:00') : []))
  const clients = data.clients.map(({ priceLists: _drop, ...c }) => withCommercial(c))
  const commercial = buildCommercialSeed({ clients, projects: data.projects, services: data.services }, legacy)
  return { ...data, schemaVersion: 3, clients, ...commercial }
}

/**
 * v3 (Phase 3) → v4 (Phase 4): flat invoices/payables/payments become invoices
 * with lines, receipts, incurred costs, obligations and supplier payments.
 * Historical collected / paid amounts are preserved exactly.
 */
function v3ToV4(data: V3Dataset): Dataset {
  const { payables, payments, invoices, suppliers, ...rest } = data
  const finance = buildFinanceSeed(
    { clients: data.clients, projects: data.projects, services: data.services, quotations: data.quotations, purchaseOrders: data.purchaseOrders },
    { suppliers: suppliers ?? [], invoices: invoices ?? [], payables: payables ?? [], payments: payments ?? [] },
  )
  // Overdue-invoice / supplier alerts are now derived from records; drop the static Phase 1 copies.
  const alerts = (rest.alerts ?? []).filter((a) => a.id !== 'al_02' && a.id !== 'al_04')
  return { ...rest, alerts, schemaVersion: 4, ...finance }
}

/** v4 → v5: adds Eugenia–Florencia settlements (demo rules), keeping every existing record. */
function v4ToV5(data: Omit<Dataset, 'settlements'> & { settlements?: Dataset['settlements'] }): Dataset {
  return { ...data, schemaVersion: 5, settlements: data.settlements ?? buildSettlementSeed(data.projects, data.obligations ?? []) }
}

/** v5 → v6: hierarchical catalog, open POs and certificates (demo), keeping every existing record. */
function v5ToV6(data: Omit<Dataset, 'catalogItems' | 'openOrders' | 'certificates'>): Dataset {
  return withCatalogSeed({ ...data, schemaVersion: 6, catalogItems: [], openOrders: [], certificates: [] })
}

const steps: Record<number, (data: never) => unknown> = {
  2: v2ToV3 as (data: never) => unknown,
  3: v3ToV4 as (data: never) => unknown,
  4: v4ToV5 as (data: never) => unknown,
  5: v5ToV6 as (data: never) => unknown,
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
