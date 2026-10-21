import { describe, expect, it } from 'vitest'
import { buildSeedDataset } from '@/data/seed'
import { SCHEMA_VERSION } from '@/domain/dataset'
import { projectInput } from '@/domain/__tests__/helpers'
import { createLocalDataSource } from './localDataSource'
import { isValidDataset, readDataset, STORAGE_KEY, writeDataset, type StorageLike } from './storage'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: (k) => {
      delete data[k]
    },
  }
}

describe('storage', () => {
  it('the seed dataset is valid and round-trips', () => {
    const ds = buildSeedDataset()
    expect(isValidDataset(ds)).toBe(true)
    const storage = memoryStorage()
    expect(writeDataset(storage, ds, 'now')).toBe(true)
    expect(readDataset(storage).dataset).toEqual(ds)
  })

  it('flags corrupted, outdated and inconsistent data', () => {
    expect(readDataset(memoryStorage({ [STORAGE_KEY]: '{oops' })).issue).toBe('corrupted')
    expect(readDataset(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, data: {} }) })).issue).toBe('outdated')
    expect(readDataset(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, data: { clients: 'nope' } }) })).issue).toBe('invalid')
    const broken = buildSeedDataset()
    broken.tasks = [{ ...broken.tasks[0], serviceId: 'missing' }]
    expect(readDataset(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: SCHEMA_VERSION, data: broken }) })).issue).toBe('invalid')
  })

  it('survives unavailable storage', () => {
    const failing: StorageLike = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    expect(readDataset(failing)).toEqual({})
    expect(writeDataset(failing, buildSeedDataset(), 'now')).toBe(false)
  })
})

describe('local data source', () => {
  it('persists changes across instances (browser refresh) and resets the demo', async () => {
    const storage = memoryStorage()
    const first = createLocalDataSource({ storage, latency: false })
    await first.loadDataset()
    const { projectId } = await first.createProject(projectInput(), 'req-1')

    const reloaded = createLocalDataSource({ storage, latency: false })
    const { dataset } = await reloaded.loadDataset()
    expect(dataset.projects.some((p) => p.id === projectId)).toBe(true)

    const { dataset: reset } = await reloaded.resetDemoData()
    expect(reset.projects.some((p) => p.id === projectId)).toBe(false)
    const again = await createLocalDataSource({ storage, latency: false }).loadDataset()
    expect(again.dataset.projects).toHaveLength(reset.projects.length)
  })

  it('re-seeds and reports when stored data is outdated', async () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, data: {} }) })
    const { dataset, issue } = await createLocalDataSource({ storage, latency: false }).loadDataset()
    expect(issue).toBe('outdated')
    expect(isValidDataset(dataset)).toBe(true)
  })
})

/** Rebuilds the persisted shape of an older schema from today's seed. */
async function legacyDataset(version: 2 | 3) {
  const mocks = await import('@/data/mock')
  const { createProject } = await import('@/domain/projects')
  const { testContext } = await import('@/domain/__tests__/helpers')
  const { buildBaseSeedDataset } = await import('@/data/seed')
  const v4 = buildBaseSeedDataset()
  const { ds, projectId } = createProject(v4, projectInput(), 'user-req', testContext())
  const {
    legalEntities: _le, invoices: _i, receipts: _r, collectionActions: _c, agreements: _a, costs: _co, obligations: _o, supplierPayments: _sp, exchangeRates: _fx, audit: _au, settlements: _st, catalogItems: _ci, openOrders: _oo, certificates: _ce, attachments: _at, suppliers: _s,
    ...rest
  } = ds
  const v3 = { ...rest, schemaVersion: 3, suppliers: mocks.mockSuppliers, invoices: mocks.mockInvoices, payables: mocks.mockPayables, payments: mocks.mockPayments }
  if (version === 3) return { data: v3, projectId, tasks: ds.tasks.length }
  const { priceEntries: _p, quotations: _q, purchaseOrders: _po, ...v2rest } = v3
  return { data: { ...v2rest, schemaVersion: 2, clients: mocks.mockClients }, projectId, tasks: ds.tasks.length }
}

describe('storage migrations', () => {
  it('v2 → v7 keeps Phase 2 data and adds commercial and finance records', async () => {
    const { data, projectId, tasks } = await legacyDataset(2)
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, savedAt: 'x', data }) })
    const { dataset, issue } = readDataset(storage)
    expect(issue).toBe('migrated')
    expect(dataset!.schemaVersion).toBe(8)
    expect(dataset!.projects.some((p) => p.id === projectId)).toBe(true)
    expect(dataset!.tasks.length).toBeGreaterThanOrEqual(tasks) // + tasks of the Phase 4.6 demo projects
    expect(dataset!.clients.every((c) => c.policy && !('priceLists' in c))).toBe(true)
    expect(dataset!.quotations.length).toBeGreaterThan(0)
    expect(JSON.parse(storage.data[STORAGE_KEY]).schemaVersion).toBe(8)
    expect(readDataset(storage).issue).toBeUndefined()
  })

  it('v3 → v7 converts flat finance records preserving collected and paid amounts', async () => {
    const { mockInvoices, mockPayables } = await import('@/data/mock')
    const { invoiceFinancials, obligationFinancials } = await import('@/domain/finance/derive')
    const { data } = await legacyDataset(3)
    // A user edit made in Phase 3 must survive.
    data.projects[0] = { ...data.projects[0], notes: 'Nota de Fase 3' }
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 3, savedAt: 'x', data }) })
    const { dataset, issue } = readDataset(storage)
    expect(issue).toBe('migrated')
    const ds = dataset!
    expect(ds.projects[0].notes).toBe('Nota de Fase 3')
    expect('payables' in ds || 'payments' in ds).toBe(false)
    for (const legacy of mockInvoices) {
      const inv = ds.invoices.find((i) => i.id === legacy.id)!
      expect(invoiceFinancials(ds, inv, '2026-10-19').paid).toBe(legacy.status === 'draft' ? 0 : legacy.collected)
      expect(invoiceFinancials(ds, inv, '2026-10-19').total).toBe(legacy.amount)
    }
    for (const legacy of mockPayables) {
      expect(obligationFinancials(ds, ds.obligations.find((o) => o.id === legacy.id)!, '2026-10-19').paid).toBe(legacy.paid)
    }
    expect(ds.costs.every((c) => !c.projectId || ds.projects.some((p) => p.id === c.projectId))).toBe(true)
  })

  it('v4 → v7 adds settlements without touching existing finance records', async () => {
    const v5 = buildSeedDataset()
    const { settlements: _s, ...v4 } = v5
    const data = { ...v4, schemaVersion: 4, projects: v4.projects.map((p, i) => (i === 0 ? { ...p, notes: 'Nota de Fase 4' } : p)) }
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 4, savedAt: 'x', data }) })
    const { dataset, issue } = readDataset(storage)
    expect(issue).toBe('migrated')
    expect(dataset!.schemaVersion).toBe(8)
    expect(dataset!.projects[0].notes).toBe('Nota de Fase 4')
    expect(dataset!.settlements.length).toBeGreaterThan(0)
    expect(JSON.stringify([dataset!.invoices, dataset!.receipts, dataset!.obligations, dataset!.supplierPayments])).toBe(JSON.stringify([v4.invoices, v4.receipts, v4.obligations, v4.supplierPayments]))
  })
})
