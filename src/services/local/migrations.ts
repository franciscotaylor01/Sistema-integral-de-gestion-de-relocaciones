import { withCatalogSeed } from '@/data/catalogSeed'
import { withReceivablesSeed } from '@/data/receivablesSeed'
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

/** v6 → v7: attachments metadata, payment terms on demo open POs and a demo reconciled invoice. Nothing is reinterpreted. */
function v6ToV7(data: Omit<Dataset, 'attachments'>): Dataset {
  return withReceivablesSeed({ ...data, schemaVersion: 7, attachments: [] })
}

/**
 * v7 → v8: suppliers, advances, cost closure and general expenses. Purely additive:
 * historical payments keep their behaviour (unallocated remainders stay as advances
 * without project, flagged for review); no payment, advance, closure or payment state
 * is inferred.
 */
function v7ToV8(data: Omit<Dataset, 'settlementBatches'>): Omit<Dataset, 'settlementBatches'> {
  return { ...data, schemaVersion: 8 }
}

/** v8 → v9: grouped settlements collection. No batch, payment or deduction is generated from history. */
function v8ToV9(data: Omit<Dataset, 'settlementBatches'>): Dataset {
  return { ...data, schemaVersion: 9, settlementBatches: [] }
}

/**
 * v9 → v10: grouped settlements switch to the pro-rata model. Batches already
 * confirmed (or released) keep their recorded "ordered" compensation exactly as
 * they were — never reinterpreted. Drafts commit nothing yet, so they adopt the
 * new model.
 */
function v9ToV10(data: Omit<Dataset, 'tariffImports' | 'communications' | 'documentTemplates' | 'initialDocuments' | 'poImports' | 'poReviews'>): Omit<Dataset, 'tariffImports' | 'communications' | 'documentTemplates' | 'initialDocuments' | 'poImports' | 'poReviews'> {
  return {
    ...data,
    schemaVersion: 10,
    settlementBatches: (data.settlementBatches ?? []).map((b) => (b.allocationMode ? b : { ...b, allocationMode: b.status === 'draft' ? 'pro-rata' : 'ordered' })),
  }
}

/** v10 → v11: tariff import history (empty). Nothing else changes. */
function v10ToV11(data: Omit<Dataset, 'tariffImports' | 'communications' | 'documentTemplates' | 'initialDocuments' | 'poImports' | 'poReviews'>): Omit<Dataset, 'communications' | 'documentTemplates' | 'initialDocuments' | 'poImports' | 'poReviews'> {
  return { ...data, schemaVersion: 11, tariffImports: [] }
}

/** v11 → v12: commercial communications history (empty). Quotations gain optional fields only. */
function v11ToV12(data: Omit<Dataset, 'communications' | 'documentTemplates' | 'initialDocuments' | 'poImports' | 'poReviews'>): Omit<Dataset, 'documentTemplates' | 'initialDocuments' | 'poImports' | 'poReviews'> {
  return { ...data, schemaVersion: 12, communications: [] }
}

/** v12 → v13: document template library and initial documents (empty). Existing documents untouched. */
function v12ToV13(data: Omit<Dataset, 'documentTemplates' | 'initialDocuments' | 'poImports' | 'poReviews'>): Omit<Dataset, 'poImports' | 'poReviews'> {
  return { ...data, schemaVersion: 13, documentTemplates: [], initialDocuments: [] }
}

/** v13 → v14: PO document import history (empty). Existing POs are untouched. */
function v13ToV14(data: Omit<Dataset, 'poImports' | 'poReviews'>): Omit<Dataset, 'poReviews'> {
  return { ...data, schemaVersion: 14, poImports: [] }
}

/** v14 → v15: PO vs quotation review decisions (empty). */
function v14ToV15(data: Omit<Dataset, 'poReviews'>): Dataset {
  return { ...data, schemaVersion: 15, poReviews: [] }
}

const steps: Record<number, (data: never) => unknown> = {
  2: v2ToV3 as (data: never) => unknown,
  3: v3ToV4 as (data: never) => unknown,
  4: v4ToV5 as (data: never) => unknown,
  5: v5ToV6 as (data: never) => unknown,
  6: v6ToV7 as (data: never) => unknown,
  7: v7ToV8 as (data: never) => unknown,
  8: v8ToV9 as (data: never) => unknown,
  9: v9ToV10 as (data: never) => unknown,
  10: v10ToV11 as (data: never) => unknown,
  11: v11ToV12 as (data: never) => unknown,
  12: v12ToV13 as (data: never) => unknown,
  13: v13ToV14 as (data: never) => unknown,
  14: v14ToV15 as (data: never) => unknown,
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
