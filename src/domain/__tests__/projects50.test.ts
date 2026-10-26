import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { effectivePolicy } from '@/domain/commercial/catalog'
import { approvePriceEntry, createPriceEntry, updatePriceEntry } from '@/domain/commercial/pricing'
import { createProject, updateProject, type NewProjectInput } from '@/domain/projects'
import { readDataset, writeDataset, type StorageLike } from '@/services/local/storage'
import { fieldsOf, projectInput, seed, testContext } from './helpers'

const svc = (typeId: string, items?: { catalogItemId: string; quantity: number; unitPrice?: number }[]) => ({ typeId, ownerId: 'stf_02', startDate: '2026-11-01', dueDate: '2027-02-01', items })
const pv = (o: Partial<NewProjectInput>): NewProjectInput => projectInput({ clientId: 'cli_petrovalle', origin: { country: 'AR', city: 'Córdoba' }, destination: { country: 'AR', city: 'Comodoro Rivadavia' }, services: [], ...o })
const created = (r: { ds: Dataset; projectId: string }) => ({ ds: r.ds, p: r.ds.projects.find((x) => x.id === r.projectId)!, services: r.ds.services.filter((s) => s.projectId === r.projectId) })

describe('province selection', () => {
  it('per-project-PO and no-PO clients are never blocked by the province; it is stored when given', () => {
    const ctx = testContext()
    expect(effectivePolicy(seed().clients.find((c) => c.id === 'cli_kestrel')).poMode).toBe('none')
    const none = createProject(seed(), projectInput({ clientId: 'cli_kestrel' }), 'k1', ctx)
    expect(none.ds.projects.find((p) => p.id === none.projectId)!.province).toBeUndefined()
    const withProv = created(createProject(seed(), projectInput({ province: 'Córdoba' }), 'n1', ctx))
    expect(withProv.p.province).toBe('Córdoba')
    expect(fieldsOf(() => createProject(seed(), projectInput({ province: 'Atlántida' }), 'n2', ctx))).toHaveProperty('province')
  })

  it('open-PO clients need a province with a compatible OC in force (Neuquén vs Chubut)', () => {
    const ctx = testContext()
    expect(fieldsOf(() => createProject(seed(), pv({ services: [svc('housing', [{ catalogItemId: 'itm_housing_1', quantity: 1 }])] }), 'o1', ctx))).toHaveProperty('province')
    expect(fieldsOf(() => createProject(seed(), pv({ province: 'Mendoza', services: [svc('housing')] }), 'o2', ctx)).openOrderId).toMatch(/No hay OC abierta vigente/)
    expect(fieldsOf(() => createProject(seed(), pv({ province: 'Neuquén', openOrderId: 'oca_pv_chu', services: [svc('housing')] }), 'o3', ctx)).openOrderId).toMatch(/otra provincia/)
    const chu = created(createProject(seed(), pv({ province: 'Chubut', openOrderId: 'oca_pv_chu', services: [svc('housing', [{ catalogItemId: 'itm_housing_1', quantity: 1 }]), svc('moving', [{ catalogItemId: 'itm_moving_2', quantity: 1 }])] }), 'o4', ctx))
    expect(chu.p).toMatchObject({ province: 'Chubut', openOrderId: 'oca_pv_chu', currency: 'ARS' })
    // OC prices, not the tariff: Chubut housing 980.000 (Neuquén OC: 900.000).
    expect(chu.services.find((s) => s.typeId === 'housing')!.items![0]).toMatchObject({ unitPrice: 980000, currency: 'ARS', source: 'open-order', sourceRef: 'oca_pv_chu' })
    const nqn = created(createProject(seed(), pv({ province: 'Neuquén', openOrderId: 'oca_pv_nqn', services: [svc('housing', [{ catalogItemId: 'itm_housing_1', quantity: 1 }])] }), 'o5', ctx))
    expect(nqn.services[0].items![0].unitPrice).toBe(900000)
  })

  it('editing the province is allowed except when an open PO fixes it', () => {
    const ctx = testContext()
    const n = created(createProject(seed(), projectInput({}), 'e1', ctx))
    expect(updateProject(n.ds, n.p.id, { province: 'Mendoza' }, ctx).projects.find((x) => x.id === n.p.id)!.province).toBe('Mendoza')
    const o = created(createProject(seed(), pv({ province: 'Chubut', openOrderId: 'oca_pv_chu', services: [svc('moving', [{ catalogItemId: 'itm_moving_2', quantity: 1 }])] }), 'e2', ctx))
    expect(() => updateProject(o.ds, o.p.id, { province: 'Neuquén' }, ctx)).toThrow(/OC abierta/)
  })
})

describe('automatic prices', () => {
  it('per-project PO client: approved tariff; pending versions never used', () => {
    const ctx = testContext()
    let ds = seed()
    const e = ds.priceEntries.find((x) => x.id === 'tar_nv_hou1')!
    ds = updatePriceEntry(ds, e.id, { ...e, unitPrice: 1999 }, ctx) // pending version
    const r = created(createProject(ds, projectInput({ services: [svc('housing', [{ catalogItemId: 'itm_housing_1', quantity: 2 }, { catalogItemId: 'itm_housing_2', quantity: 3 }])] }), 'p1', ctx))
    const h = r.services[0]
    expect(h.items!.map((i) => [i.unitPrice, i.currency, i.source])).toEqual([
      [1600, 'USD', 'tariff'],
      [250, 'USD', 'tariff'],
    ])
    expect(h.price).toBe(1600 * 2 + 250 * 3) // service total = items only
  })

  it('clients with mandatory approval ignore unapproved prices; others keep using them', () => {
    const ctx = testContext()
    let ds = seed()
    ds = createPriceEntry(ds, { clientId: 'cli_nordvik', serviceTypeId: 'housing', itemId: 'itm_housing_4', market: 'ANY', currency: 'USD', unitPrice: 300, unit: 'service', minQuantity: 1, validFrom: '2026-01-01', active: true }, ctx).ds
    const input = projectInput({ services: [svc('housing', [{ catalogItemId: 'itm_housing_4', quantity: 1 }])] })
    expect(created(createProject(ds, input, 'a1', ctx)).services[0].items![0].unitPrice).toBe(300)
    const strict: Dataset = { ...ds, clients: ds.clients.map((c) => (c.id === 'cli_nordvik' ? { ...c, policy: { ...c.policy, requiresPriceApproval: true } } : c)) }
    expect(fieldsOf(() => createProject(strict, input, 'a2', ctx))).toHaveProperty(['services.0.items.0.unitPrice']) // not invented
    const id = strict.priceEntries.at(-1)!.id
    const approved = approvePriceEntry(strict, id, 'Acta', ctx)
    expect(created(createProject(approved, input, 'a3', ctx)).services[0].items![0].unitPrice).toBe(300)
  })

  it('no-PO client uses the applicable tariff in the chosen project currency; no conversion', () => {
    const ctx = testContext()
    let ds = seed()
    ds = createPriceEntry(ds, { clientId: 'cli_kestrel', serviceTypeId: 'schooling', itemId: 'itm_schooling_1', market: 'ANY', currency: 'MXN', unitPrice: 25000, unit: 'family', minQuantity: 1, validFrom: '2026-01-01', active: true }, ctx).ds
    const input = projectInput({ clientId: 'cli_kestrel', services: [svc('schooling', [{ catalogItemId: 'itm_schooling_1', quantity: 1 }])] })
    expect(fieldsOf(() => createProject(ds, input, 'm1', ctx))).toHaveProperty(['services.0.items.0.unitPrice']) // USD project: the MXN price is not converted
    const r = created(createProject(ds, { ...input, currency: 'MXN' }, 'm2', ctx))
    expect(r.p.currency).toBe('MXN')
    expect(r.services[0].items![0]).toMatchObject({ unitPrice: 25000, currency: 'MXN' })
    expect(fieldsOf(() => createProject(ds, { ...input, currency: 'EUR' }, 'm3', ctx))).toHaveProperty('currency')
  })

  it('missing prices are not invented; a manual price is explicit', () => {
    const ctx = testContext()
    const input = projectInput({ services: [svc('moving', [{ catalogItemId: 'itm_moving_1', quantity: 1 }])] })
    expect(fieldsOf(() => createProject(seed(), input, 'x1', ctx))['services.0.items.0.unitPrice']).toMatch(/Sin precio/)
    const r = created(createProject(seed(), projectInput({ services: [svc('moving', [{ catalogItemId: 'itm_moving_1', quantity: 1, unitPrice: 777 }])] }), 'x2', ctx))
    expect(r.services[0].items![0]).toMatchObject({ unitPrice: 777, source: 'manual' })
  })

  it('services without sub-services stay single-line; snapshots survive tariff changes and reloads', () => {
    const ctx = testContext()
    const r = created(createProject(seed(), pv({ province: 'Neuquén', openOrderId: 'oca_pv_nqn', services: [svc('cuil-unification'), svc('housing', [{ catalogItemId: 'itm_housing_2', quantity: 2 }])] }), 's1', ctx))
    let { ds, p } = r
    const services = r.services
    const cuil = services.find((s) => s.typeId === 'cuil-unification')!
    expect(cuil).toMatchObject({ price: 150000, items: undefined })
    const before = JSON.stringify(ds.services.filter((s) => s.projectId === p.id))
    const e = ds.priceEntries.find((x) => x.id === 'tar_pv_hou2')!
    ds = updatePriceEntry(ds, e.id, { ...e, unitPrice: 1 }, ctx)
    const pending = ds.priceEntries.find((x) => x.supersedesId === e.id)
    if (pending && !pending.approvedAt) ds = approvePriceEntry(ds, pending.id, 'Acta', ctx)
    expect(JSON.stringify(ds.services.filter((s) => s.projectId === p.id))).toBe(before)
    const mem: Record<string, string> = {}
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    writeDataset(storage, ds, 'now')
    const back = readDataset(storage).dataset!
    expect(back.projects.find((x) => x.id === p.id)!.province).toBe('Neuquén')
    expect(JSON.stringify(back.services.filter((s) => s.projectId === p.id))).toBe(before)
    p = back.projects.find((x) => x.id === p.id)!
    expect(p.openOrderId).toBe('oca_pv_nqn')
  })
})
