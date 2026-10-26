import { describe, expect, it } from 'vitest'
import { activeServiceTypes } from '@/config/serviceCatalog'
import type { Dataset } from '@/domain/dataset'
import { resolveItemPrice } from '@/domain/commercial/catalog'
import { createClient } from '@/domain/commercial/clients'
import { approvePriceEntry, resolvePrice } from '@/domain/commercial/pricing'
import { rowKey, saveTariffGrid, tariffGrid } from '@/domain/commercial/tariffGrid'
import { readDataset, writeDataset, type StorageLike } from '@/services/local/storage'
import { fieldsOf, seed, testContext } from './helpers'

const TODAY = '2026-10-19'
const row = (ds: Dataset, clientId: string, serviceTypeId: string, itemId?: string) => tariffGrid(ds, clientId).flatMap((g) => g.rows).find((r) => r.key === rowKey(serviceTypeId, itemId))!
const priceOf = (ds: Dataset, clientId: string, serviceTypeId: string, itemId: string | undefined, currency: 'USD' | 'ARS' | 'EUR') => {
  const r = resolvePrice(ds, { clientId, serviceTypeId, itemId, market: 'AR', currency, date: TODAY, quantity: 1 })
  return r.status === 'unique' ? r.entry.unitPrice : r.status
}

function newClient() {
  const ctx = testContext()
  const r = createClient(
    seed(),
    { name: 'Cliente Demo Grid', legalName: 'Cliente Demo Grid S.A.', taxId: 'DEMO-GRID-1', industry: 'Servicios', country: 'AR', city: 'Córdoba', billingAddress: 'Córdoba', status: 'active', accountManagerId: 'stf_02', billingCurrency: 'ARS', currencies: ['ARS', 'USD'], paymentTermsDays: 30, requiresPurchaseOrder: false, requiresApprovedQuote: false, billingMilestone: 'service-started', quoteValidityDays: 30, contacts: [{ name: 'Ana Demo', role: 'RR. HH.', email: 'ana@demo.example', phone: '', primary: true }] },
    'grid-client',
    ctx,
  )
  return { ds: r.ds, clientId: r.clientId, ctx }
}

describe('quick tariff editor', () => {
  it('a new client sees the whole catalog, all unset; services without sub-services are one line', () => {
    const { ds, clientId } = newClient()
    const groups = tariffGrid(ds, clientId)
    expect(groups.map((g) => g.serviceTypeId)).toEqual(activeServiceTypes().map((t) => t.id))
    expect(groups.flatMap((g) => g.rows).every((r) => r.status === 'unset')).toBe(true)
    const cuil = groups.find((g) => g.serviceTypeId === 'cuil-unification')!
    expect(cuil.rows).toHaveLength(1)
    expect(cuil.rows[0].itemId).toBeUndefined()
    expect(groups.find((g) => g.serviceTypeId === 'housing')!.rows.map((r) => r.name)).toEqual(['Búsqueda de vivienda', 'Visitas a propiedades', 'Asistencia con contrato', 'Inventario de ingreso'])
  })

  it('saves several prices in different currencies at once; service total comes from items only', () => {
    const { ds: d0, clientId, ctx } = newClient()
    const ds = saveTariffGrid(d0, clientId, {
      changes: [
        { key: rowKey('housing', 'itm_housing_1'), unitPrice: 800000, currency: 'ARS', active: true },
        { key: rowKey('housing', 'itm_housing_2'), unitPrice: 100000, currency: 'ARS', active: true },
        { key: rowKey('immigration', 'itm_immigration_1'), unitPrice: 950, currency: 'USD', active: true },
        { key: rowKey('cuil-unification'), unitPrice: 120000, currency: 'ARS', active: true },
      ],
    }, ctx)
    expect(priceOf(ds, clientId, 'housing', 'itm_housing_1', 'ARS')).toBe(800000)
    expect(priceOf(ds, clientId, 'immigration', 'itm_immigration_1', 'USD')).toBe(950)
    expect(priceOf(ds, clientId, 'cuil-unification', undefined, 'ARS')).toBe(120000)
    const housing = tariffGrid(ds, clientId).find((g) => g.serviceTypeId === 'housing')!
    expect(housing.itemsTotal).toEqual({ ARS: 900000 })
    expect(row(ds, clientId, 'housing', 'itm_housing_1').status).toBe('pending') // new prices await approval
  })

  it('validates per row and saves nothing when any row is wrong', () => {
    const { ds, clientId, ctx } = newClient()
    const f = fieldsOf(() =>
      saveTariffGrid(ds, clientId, {
        changes: [
          { key: rowKey('housing', 'itm_housing_1'), unitPrice: 800000, currency: 'ARS', active: true },
          { key: rowKey('housing', 'itm_housing_2'), unitPrice: 0, currency: 'ARS', active: true },
          { key: rowKey('housing', 'itm_housing_3'), unitPrice: 10, currency: '', active: true },
        ],
      }, ctx),
    )
    expect(Object.keys(f).sort()).toEqual([`rows.${rowKey('housing', 'itm_housing_2')}.unitPrice`, `rows.${rowKey('housing', 'itm_housing_3')}.currency`])
  })

  it('editing an approved price creates a pending version that does not replace it; editing again updates the pending one', () => {
    const ctx = testContext()
    let ds = seed()
    const k = rowKey('housing', 'itm_housing_1')
    expect(row(ds, 'cli_nordvik', 'housing', 'itm_housing_1')).toMatchObject({ status: 'approved', approved: { unitPrice: 1600 } })
    ds = saveTariffGrid(ds, 'cli_nordvik', { changes: [{ key: k, unitPrice: 1700, currency: 'USD', active: true }] }, ctx)
    let r = row(ds, 'cli_nordvik', 'housing', 'itm_housing_1')
    expect(r).toMatchObject({ status: 'pending', approved: { unitPrice: 1600 }, pending: { unitPrice: 1700, supersedesId: 'tar_nv_hou1' } })
    expect(priceOf(ds, 'cli_nordvik', 'housing', 'itm_housing_1', 'USD')).toBe(1600)
    ds = saveTariffGrid(ds, 'cli_nordvik', { changes: [{ key: k, unitPrice: 1750, currency: 'USD', active: true }] }, ctx)
    r = row(ds, 'cli_nordvik', 'housing', 'itm_housing_1')
    expect(ds.priceEntries.filter((e) => e.supersedesId === 'tar_nv_hou1')).toHaveLength(1)
    expect(r.pending!.unitPrice).toBe(1750)
    ds = approvePriceEntry(ds, r.pending!.id, 'Acta 11/2026', ctx)
    r = row(ds, 'cli_nordvik', 'housing', 'itm_housing_1')
    expect(r).toMatchObject({ status: 'approved', approved: { unitPrice: 1750 }, previousVersions: 1 })
    expect(priceOf(ds, 'cli_nordvik', 'housing', 'itm_housing_1', 'USD')).toBe(1750)
  })

  it('project snapshots and open-PO prices are untouched; deactivation is a status, not a new version', () => {
    const ctx = testContext()
    let ds = seed()
    const before = JSON.stringify(ds.services.map((s) => s.items))
    const pv = ds.projects.find((p) => p.openOrderId === 'oca_pv_nqn')!
    ds = saveTariffGrid(ds, 'cli_petrovalle', { changes: [{ key: rowKey('housing', 'itm_housing_1'), unitPrice: 999999, currency: 'ARS', active: true }] }, ctx)
    expect(JSON.stringify(ds.services.map((s) => s.items))).toBe(before)
    expect(resolveItemPrice(ds, pv, 'housing', 'itm_housing_1', TODAY)).toMatchObject({ unitPrice: 900000, source: 'open-order' })
    const n = ds.priceEntries.length
    ds = saveTariffGrid(ds, 'cli_petrovalle', { changes: [{ key: rowKey('housing', 'itm_housing_4'), unitPrice: 200000, currency: 'ARS', active: false }] }, ctx)
    expect(ds.priceEntries.length).toBe(n)
    expect(row(ds, 'cli_petrovalle', 'housing', 'itm_housing_4').status).toBe('inactive')
    expect(priceOf(ds, 'cli_petrovalle', 'housing', 'itm_housing_4', 'ARS')).toBe('none')
  })

  it('persists after reload and keeps the global catalog and existing entries', () => {
    const { ds: d0, clientId, ctx } = newClient()
    const ds = saveTariffGrid(d0, clientId, { changes: [{ key: rowKey('schooling', 'itm_schooling_1'), unitPrice: 300, currency: 'EUR', active: true }], offeredServices: ['schooling', 'housing'] }, ctx)
    const mem: Record<string, string> = {}
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    writeDataset(storage, ds, 'now')
    const back = readDataset(storage).dataset!
    expect(row(back, clientId, 'schooling', 'itm_schooling_1').editable).toMatchObject({ unitPrice: 300, currency: 'EUR' })
    expect(back.clients.find((c) => c.id === clientId)!.offeredServices).toEqual(['schooling', 'housing'])
    expect(back.catalogItems).toEqual(d0.catalogItems)
    expect(back.priceEntries.filter((e) => e.clientId !== clientId)).toEqual(d0.priceEntries.filter((e) => e.clientId !== clientId))
  })
})
