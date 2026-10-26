import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { applyTariffImport, buildReview, detectHeaderRow, guessMapping, matchService, parsePrice, parseRows, previousImport, recognizeCurrency, reviewCounts, type RowOverride } from '@/domain/commercial/tariffImport'
import { resolvePrice } from '@/domain/commercial/pricing'
import { readXlsx } from '@/lib/xlsx'
import { readDataset, writeDataset, type StorageLike } from '@/services/local/storage'
import { makeXlsx } from './makeXlsx'
import { fieldsOf, seed, testContext } from './helpers'

const C = 'cli_petrovalle'
const main = [
  ['Tarifario 2027 — Petrovalle (demo)', null, null, null, null, null],
  [null, null, null, null, null, null],
  ['Servicio', 'Subservicio', 'Precio', 'Moneda', 'Unidad', 'Vigencia desde'],
  ['Housing', null, null, null, null, null],
  [null, 'Búsqueda de vivienda', 950000, 'ARS', 'servicio', '01/01/2027'],
  [null, 'Visitas a propiedades', '130.000', 'pesos', 'visita', null],
  [null, 'Asistencia contrato', 480000, 'ARS', null, null],
  ['Migraciones', 'Residencia temporaria', 'USD 900', null, 'persona', null],
  ['Migraciones', 'DNI', 210, '€', null, null],
  ['CUIL', null, 160000, '$', null, null],
  ['Talleres', 'Taller familiar', 300, 'USD', null, null],
  ['Charla premigratoria', 'Charla', 100, 'USD', null, null],
  ['Housing', 'Búsqueda de vivienda', 951000, 'ARS', null, null],
  ['Mudanzas', 'Relevamiento de mudanza', 'abc', 'ARS', null, null],
  ['Mudanzas', 'Embalaje premium', 75000, 'ARS', null, null],
]

async function load(rows = main, opts: { other?: boolean } = {}) {
  const buf = await makeXlsx([...(opts.other ? [{ name: 'Notas', rows: [['sin datos']] }] : []), { name: 'Tarifas', rows }], { deflate: true })
  return readXlsx(buf)
}
async function review(ds: Dataset, overrides: Record<number, RowOverride> = {}, rows = main) {
  const sheet = (await load(rows)).at(-1)!
  const h = detectHeaderRow(sheet.rows)
  const parsed = parseRows(sheet.rows, h, guessMapping(sheet.rows[h]))
  return { h, parsed, rows: buildReview(ds, C, parsed, overrides) }
}
const bySrc = (rows: ReturnType<typeof buildReview>, n: number) => rows.find((r) => r.parsed.sourceRow === n)!
const input = (rows: ReturnType<typeof buildReview>, h: number) => ({ file: { name: 'tarifario-petrovalle.xlsx', size: 1234, hash: 'abc123' }, sheetName: 'Tarifas', headerRow: h, rows })

describe('xlsx reading and detection', () => {
  it('reads every sheet of a compressed .xlsx and detects the header row below title rows', async () => {
    const sheets = await load(main, { other: true })
    expect(sheets.map((s) => s.name)).toEqual(['Notas', 'Tarifas'])
    expect(detectHeaderRow(sheets[1].rows)).toBe(2)
    expect(guessMapping(sheets[1].rows[2])).toEqual({ service: 0, item: 1, price: 2, currency: 3, unit: 4, validFrom: 5 })
  })

  it('maps different headers (Spanish and English variants)', () => {
    expect(guessMapping(['Rubro', 'Concepto', 'Importe', 'Divisa'])).toEqual({ service: 0, item: 1, price: 2, currency: 3 })
    expect(guessMapping(['Service', 'Item', 'Fee', 'Currency', 'Valid from'])).toEqual({ service: 0, item: 1, price: 2, currency: 3, validFrom: 4 })
  })

  it('parses prices and currencies without guessing', () => {
    expect(parsePrice('1.500,50')).toEqual({ value: 1500.5, currency: undefined, ambiguous: false })
    expect(parsePrice('USD 900')).toMatchObject({ value: 900, currency: 'USD' })
    expect(parsePrice('130.000')).toMatchObject({ value: 130000, ambiguous: true })
    expect(parsePrice('abc').error).toBeTruthy()
    expect(recognizeCurrency('pesos')).toBe('ARS')
    expect(recognizeCurrency('€')).toBe('EUR')
    expect(recognizeCurrency('$')).toBe('ambiguous')
    expect(matchService('Talleres')).toMatchObject({ kind: 'probable', serviceTypeId: 'intercultural-workshop' })
  })
})

describe('review', () => {
  it('several services and sub-services, grouped layout, different currencies', async () => {
    const { rows } = await review(seed())
    expect(bySrc(rows, 5)).toMatchObject({ serviceTypeId: 'housing', itemId: 'itm_housing_1', unitPrice: 950000, currency: 'ARS', status: 'ready', action: 'update' })
    expect(bySrc(rows, 5).parsed.validFrom).toBe('2027-01-01')
    expect(bySrc(rows, 6)).toMatchObject({ itemId: 'itm_housing_2', currency: 'ARS', status: 'review' }) // "130.000" needs confirmation
    expect(bySrc(rows, 7)).toMatchObject({ itemId: 'itm_housing_3', status: 'review' }) // probable item match
    expect(bySrc(rows, 8)).toMatchObject({ serviceTypeId: 'immigration', itemId: 'itm_immigration_1', unitPrice: 900, currency: 'USD', status: 'ready' })
    expect(bySrc(rows, 9)).toMatchObject({ itemId: 'itm_immigration_2', currency: 'EUR', status: 'ready', action: 'update' }) // existing ARS price → new EUR version
    expect(bySrc(rows, 10)).toMatchObject({ serviceTypeId: 'cuil-unification', itemId: '', status: 'review' }) // "$" is not assumed
  })

  it('ambiguous and probable matches require a manual decision; duplicates and invalid rows are flagged', async () => {
    const { rows } = await review(seed())
    expect(bySrc(rows, 11)).toMatchObject({ serviceTypeId: 'intercultural-workshop', status: 'review' })
    expect(bySrc(rows, 12).messages.join()).toMatch(/Subservicio ambiguo/)
    expect(bySrc(rows, 13)).toMatchObject({ status: 'duplicate' })
    expect(bySrc(rows, 14)).toMatchObject({ status: 'error' })
    expect(bySrc(rows, 15).messages.join()).toMatch(/no encontrado/)
    expect(reviewCounts(rows)).toMatchObject({ error: 2 })
  })
})

describe('apply', () => {
  const resolve: Record<number, RowOverride> = {
    6: { confirmed: true },
    7: { confirmed: true },
    10: { currency: 'ARS', confirmed: true },
    11: { confirmed: true },
    12: { itemId: 'itm_pre-migration-talk_2' },
    13: { excluded: true },
    14: { excluded: true },
    15: { itemId: 'new', newItemName: 'Embalaje premium' },
  }

  it('blocks everything while rows are unresolved (no partial changes)', async () => {
    const ds = seed()
    const { rows, h } = await review(ds)
    const before = JSON.stringify(ds.priceEntries)
    expect(() => applyTariffImport(ds, C, input(rows, h), 'imp0', testContext())).toThrow(/sin resolver/)
    expect(JSON.stringify(ds.priceEntries)).toBe(before)
  })

  it('imports confirmed rows: new prices pending, approved ones versioned, explicit new sub-service; history kept', async () => {
    const ctx = testContext()
    const ds0 = seed()
    const { rows, h } = await review(ds0, resolve)
    expect(reviewCounts(rows)).toMatchObject({ review: 0, error: 0, excluded: 2 })
    const r = applyTariffImport(ds0, C, input(rows, h), 'imp1', ctx)
    const ds = r.ds
    const imp = ds.tariffImports[0]
    expect(imp).toMatchObject({ fileName: 'tarifario-petrovalle.xlsx', sheetName: 'Tarifas', headerRow: 3, counts: { excluded: 2, newItems: 1 } })
    expect(ds.catalogItems.filter((i) => i.name === 'Embalaje premium')).toHaveLength(1)
    // Approved price stays in force; the import created a pending version.
    const approved = ds.priceEntries.find((e) => e.id === 'tar_pv_hou1')!
    expect(approved).toMatchObject({ unitPrice: 900000, active: true })
    const version = ds.priceEntries.find((e) => e.supersedesId === 'tar_pv_hou1')!
    expect(version).toMatchObject({ unitPrice: 950000, validFrom: '2027-01-01' })
    expect(version.approvedAt).toBeUndefined()
    const q = (itemId: string, currency: 'ARS' | 'USD' | 'EUR') => resolvePrice(ds, { clientId: C, serviceTypeId: 'housing', itemId, market: 'AR', currency, date: '2026-10-19', quantity: 1 })
    expect(q('itm_housing_1', 'ARS')).toMatchObject({ status: 'unique', entry: { unitPrice: 900000 } })
    // Original currency kept, no conversion.
    const eur = ds.priceEntries.find((e) => e.clientId === C && e.itemId === 'itm_immigration_2' && e.currency === 'EUR')!
    expect(eur.unitPrice).toBe(210)
    expect(eur.approvedAt).toBeUndefined()
    // Projects, open POs and invoices untouched.
    expect(ds.services).toEqual(ds0.services)
    expect(ds.openOrders).toEqual(ds0.openOrders)
    expect(ds.invoices).toEqual(ds0.invoices)
    expect(applyTariffImport(ds, C, input(rows, h), 'imp1', ctx).duplicate).toBe(true)
  })

  it('importing the same file again writes nothing new', async () => {
    const ctx = testContext()
    const first = applyTariffImport(seed(), C, input((await review(seed(), resolve)).rows, 2), 'a', ctx).ds
    const count = first.priceEntries.length
    const items = first.catalogItems.length
    expect(previousImport(first, C, 'abc123')).toBeDefined()
    const again = await review(first, { ...resolve, 15: { itemId: 'new', newItemName: 'Embalaje premium' } })
    expect(reviewCounts(again.rows)).toMatchObject({ create: 0, update: 0 })
    const second = applyTariffImport(first, C, input(again.rows, again.h), 'b', ctx).ds
    expect(second.priceEntries.length).toBe(count)
    expect(second.catalogItems.length).toBe(items)
    expect(second.tariffImports[0].counts).toMatchObject({ created: 0, updated: 0 })
  })

  it('creating sub-services requires explicit approval; history persists after reload', async () => {
    const ctx = testContext()
    const { rows, h } = await review(seed(), { ...resolve, 15: {} })
    expect(fieldsOf(() => applyTariffImport(seed(), C, input(rows, h), 'x', ctx))).toHaveProperty('rows.15')
    const ok = applyTariffImport(seed(), C, input((await review(seed(), resolve)).rows, h), 'y', ctx).ds
    const mem: Record<string, string> = {}
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    writeDataset(storage, ok, 'now')
    const back = readDataset(storage).dataset!
    expect(back.tariffImports).toEqual(ok.tariffImports)
    expect(back.priceEntries).toEqual(ok.priceEntries)
  })
})
