import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { findOpenOrderItem, resolveItemPrice, validateServiceItems } from '@/domain/commercial/catalog'
import { approveCertificate, certifiableUnits, createCertificate, rejectCertificate, submitCertificate } from '@/domain/commercial/certificates'
import { approvePriceEntry, createPriceEntry, resolvePrice, updatePriceEntry } from '@/domain/commercial/pricing'
import { projectCommercial } from '@/domain/commercial/traceability'
import { createInvoiceDraft, issueInvoice, suggestInvoiceLines, type InvoiceInput } from '@/domain/finance/invoices'
import { addService, updateServiceItems } from '@/domain/services'
import { fieldsOf, seed, testContext } from './helpers'
import { withCatalogSeed } from '@/data/catalogSeed'
import { buildBaseSeedDataset } from '@/data/seed'

/** Phase 4.6 data without the Phase 4.7 demo invoice (which bills the approved certificate). */
const seed46 = () => withCatalogSeed(buildBaseSeedDataset())

const TODAY = '2026-10-19'
const pvProjects = (ds: Dataset) => ds.projects.filter((p) => p.clientId === 'cli_petrovalle').sort((a, b) => a.code.localeCompare(b.code))
const svc = (ds: Dataset, projectId: string, typeId: string) => ds.services.find((s) => s.projectId === projectId && s.typeId === typeId)!
const invoiceInput = (ds: Dataset, projectId: string): InvoiceInput => ({
  projectId, issuerId: 'le_relocare', kind: 'A', issueDate: TODAY, dueDate: '2026-12-03', currency: 'ARS',
  lines: suggestInvoiceLines(ds, projectId, 'ARS', TODAY), taxes: [], externalRef: '', notes: '',
})

describe('hierarchical catalog and tariffs', () => {
  it('main services hold different sub-services; some have none', () => {
    const ds = seed()
    const by = (t: string) => ds.catalogItems.filter((i) => i.serviceTypeId === t).map((i) => i.name)
    expect(by('housing')).toEqual(['Búsqueda de vivienda', 'Visitas a propiedades', 'Asistencia con contrato', 'Inventario de ingreso'])
    expect(by('immigration')).toContain('DNI')
    expect(by('cuil-unification')).toEqual([])
    expect(new Set(ds.catalogItems.map((i) => i.serviceTypeId)).size).toBeGreaterThanOrEqual(9)
  })

  it('each client has its own item prices; service-level resolution ignores item prices', () => {
    const ds = seed()
    const q = { serviceTypeId: 'housing', itemId: 'itm_housing_1', market: 'AR' as const, date: TODAY, quantity: 1 }
    const pv = resolvePrice(ds, { ...q, clientId: 'cli_petrovalle', currency: 'ARS' })
    const nv = resolvePrice(ds, { ...q, clientId: 'cli_nordvik', currency: 'USD' })
    expect(pv.status === 'unique' && pv.entry.unitPrice).toBe(900000)
    expect(nv.status === 'unique' && nv.entry.unitPrice).toBe(1600)
    expect(resolvePrice(ds, { ...q, itemId: undefined, clientId: 'cli_petrovalle', currency: 'ARS' }).status).toBe('none')
  })

  it('approved prices keep history: an edit creates a new version and contracted prices do not move', () => {
    const ctx = testContext()
    let ds = seed()
    const prj = 'prj_0158' // Nordvik, PO per project
    ds = addService(ds, prj, { typeId: 'housing', ownerId: 'stf_02', startDate: '2026-10-19', dueDate: '2026-11-30', items: [{ catalogItemId: 'itm_housing_1', quantity: 1 }] }, ctx).ds
    const before = ds.services.at(-1)!
    expect(before.items![0]).toMatchObject({ unitPrice: 1600, source: 'tariff' })
    const entry = ds.priceEntries.find((e) => e.id === 'tar_nv_hou1')!
    ds = updatePriceEntry(ds, entry.id, { ...entry, unitPrice: 1700 }, ctx)
    const pending = ds.priceEntries.find((e) => e.supersedesId === 'tar_nv_hou1')!
    expect(pending.unitPrice).toBe(1700)
    expect(pending.approvedAt).toBeUndefined()
    const current = ds.priceEntries.find((e) => e.id === 'tar_nv_hou1')!
    expect(current).toMatchObject({ unitPrice: 1600, active: true })
    expect(current.supersededById).toBeUndefined()
    ds = approvePriceEntry(ds, pending.id, 'Acta 2026-11', ctx)
    const old = ds.priceEntries.find((e) => e.id === 'tar_nv_hou1')!
    expect(old).toMatchObject({ unitPrice: 1600, active: false, supersededById: pending.id })
    expect(ds.services.find((s) => s.id === before.id)!.items![0].unitPrice).toBe(1600)
    expect(() => approvePriceEntry(ds, 'tar_nv_hou1', 'x', ctx)).toThrow(/ya está aprobada/)
    // An item price must belong to its main service.
    expect(fieldsOf(() => createPriceEntry(ds, { clientId: 'cli_nordvik', serviceTypeId: 'housing', itemId: 'itm_moving_1', market: 'ANY', currency: 'USD', unitPrice: 10, unit: 'service', minQuantity: 1, validFrom: '2026-01-01', active: true }, ctx))).toHaveProperty('itemId')
  })
})

describe('open purchase orders', () => {
  it('authorises specific sub-services; unauthorised ones are rejected', () => {
    const ds = seed()
    const order = ds.openOrders.find((o) => o.id === 'oca_pv_nqn')!
    expect(findOpenOrderItem(order, 'housing', 'itm_housing_3')).toBeDefined()
    expect(findOpenOrderItem(order, 'housing', 'itm_housing_4')).toBeUndefined()
    const [a] = pvProjects(ds)
    const f = validateServiceItems(ds, a, 'housing', [{ catalogItemId: 'itm_housing_4', quantity: 1 }], TODAY)
    expect(f['items.0.catalogItemId']).toMatch(/no está autorizado/)
  })

  it('a project stores only the contracted items, with correct quantities and frozen prices', () => {
    const ds = seed()
    const [a] = pvProjects(ds)
    const housing = svc(ds, a.id, 'housing')
    expect(housing.items!.map((i) => [i.name, i.quantity, i.unitPrice, i.source])).toEqual([
      ['Búsqueda de vivienda', 1, 900000, 'open-order'],
      ['Visitas a propiedades', 3, 120000, 'open-order'],
      ['Asistencia con contrato', 1, 450000, 'open-order'],
    ])
    expect(housing.price).toBe(1710000) // items total — never main price + items
    expect(svc(ds, a.id, 'immigration').price).toBe(1860000)
    expect(svc(ds, a.id, 'cuil-unification')).toMatchObject({ price: 150000, items: undefined }) // single commercial line
  })

  it('is reused by several projects without consuming any balance', () => {
    const ds = seed()
    const projects = pvProjects(ds)
    expect(projects).toHaveLength(2)
    expect(projects.every((p) => p.openOrderId === 'oca_pv_nqn')).toBe(true)
    for (const p of projects) for (const c of projectCommercial(ds, p, TODAY).values()) expect(c.stage).toBe('open-order')
  })

  it('projects with per-project POs keep the Phase 3 behaviour', () => {
    const ds = seed()
    const stages = [...projectCommercial(ds, ds.projects.find((p) => p.id === 'prj_0158')!, TODAY).values()].map((c) => c.stage)
    expect(stages).toContain('authorized')
    expect(stages).not.toContain('open-order')
  })

  it('quantities cannot drop below what is already certified', () => {
    const ctx = testContext()
    const ds = seed()
    const [a] = pvProjects(ds)
    const housing = svc(ds, a.id, 'housing')
    const items = housing.items!.map((i) => ({ catalogItemId: i.catalogItemId, quantity: i.catalogItemId === 'itm_housing_2' ? 1 : i.quantity }))
    expect(fieldsOf(() => updateServiceItems(ds, housing.id, items, ctx))).toHaveProperty('items.1.quantity')
  })
})

describe('certificates', () => {
  it('one certificate covers items of several services; certification can be partial', () => {
    const ds = seed()
    const [a] = pvProjects(ds)
    const certs = ds.certificates.filter((c) => c.projectId === a.id)
    const approved = certs.find((c) => c.status === 'approved')!
    expect(new Set(approved.lines.map((l) => l.serviceId)).size).toBe(2)
    const units = new Map(certifiableUnits(ds, a.id).map((u) => [u.description, u]))
    expect(units.get('Housing — Visitas a propiedades')).toMatchObject({ contracted: 3, certified: 2, available: 1 })
    expect(units.get('Migraciones — DNI')).toMatchObject({ certified: 2, approved: 0, available: 0 })
  })

  it('prevents certifying the same quantity twice unless an explicit correction is given', () => {
    const ctx = testContext()
    const ds = seed()
    const [a] = pvProjects(ds)
    const h = svc(ds, a.id, 'housing')
    const line = { serviceId: h.id, serviceItemId: h.items![0].id, quantity: 1 }
    expect(fieldsOf(() => createCertificate(ds, { projectId: a.id, lines: [line] }, 'x1', ctx))).toHaveProperty('lines.0.quantity')
    expect(createCertificate(ds, { projectId: a.id, lines: [line], correctionReason: 'Recertificación pedida por el cliente' }, 'x2', ctx).certificateId).toBeTruthy()
  })

  it('follows draft → submitted → approved; rejection frees the quantities', () => {
    const ctx = testContext()
    let ds = seed()
    const [a] = pvProjects(ds)
    const draft = ds.certificates.find((c) => c.projectId === a.id && c.status === 'draft')!
    expect(() => approveCertificate(ds, draft.id, { date: TODAY }, ctx)).toThrow(/presentado/)
    expect(fieldsOf(() => submitCertificate(ds, draft.id, { externalNumber: 'CERT-PV-778812', date: TODAY }, ctx))).toHaveProperty('externalNumber')
    ds = rejectCertificate(ds, draft.id, 'Ítem mal cargado', ctx)
    expect(certifiableUnits(ds, a.id).find((u) => u.description === 'Migraciones — DNI')!.available).toBe(2)
  })
})

describe('itemised invoicing with mandatory certificate', () => {
  it('suggests one line per approved certified item and blocks billing it twice', () => {
    const ctx = testContext()
    let ds = seed46()
    const [a] = pvProjects(ds)
    const input = invoiceInput(ds, a.id)
    expect(input.lines.map((l) => [l.description, l.quantity, l.unitPrice])).toEqual([
      ['Housing — Búsqueda de vivienda', 1, 900000],
      ['Housing — Visitas a propiedades', 2, 120000],
      ['Migraciones — Residencia temporaria', 1, 750000],
    ])
    expect(input.lines.every((l) => l.certificateId && l.serviceItemId && l.openOrderId === 'oca_pv_nqn')).toBe(true)
    const r = createInvoiceDraft(ds, input, 'i1', ctx)
    ds = issueInvoice(r.ds, r.invoiceId, '', ctx)
    expect(invoiceInput(ds, a.id).lines).toEqual([]) // nothing left to bill until the next approval
    const again = { ...input, lines: [input.lines[1]] }
    expect(fieldsOf(() => createInvoiceDraft(ds, again, 'i2', ctx))).toHaveProperty('lines.0.unitPrice')
  })

  it('requires an approved certificate: uncertified services or lines without certificate are rejected', () => {
    const ctx = testContext()
    const ds = seed46()
    const [a] = pvProjects(ds)
    const cuil = svc(ds, a.id, 'cuil-unification')
    const base = invoiceInput(ds, a.id)
    const f = fieldsOf(() => createInvoiceDraft(ds, { ...base, lines: [{ serviceId: cuil.id, openOrderId: 'oca_pv_nqn', description: 'CUIL', quantity: 1, unitPrice: 150000 }] }, 'i3', ctx))
    expect(f['lines.0.unitPrice']).toMatch(/certificado aprobado/)
    const noCert = { ...base.lines[0], certificateId: undefined }
    expect(fieldsOf(() => createInvoiceDraft(ds, { ...base, lines: [noCert] }, 'i4', ctx))).toHaveProperty('lines.0.certificateId')
  })

  it('without certification, item quantities beyond the contract cannot be billed', () => {
    const ctx = testContext()
    let ds = seed46()
    ds = { ...ds, clients: ds.clients.map((c) => (c.id === 'cli_petrovalle' ? { ...c, policy: { ...c.policy, requiresCertificate: false } } : c)) }
    const [a] = pvProjects(ds)
    const h = svc(ds, a.id, 'housing')
    const visits = h.items![1]
    const line = { serviceId: h.id, serviceItemId: visits.id, openOrderId: 'oca_pv_nqn', description: 'Visitas', quantity: 4, unitPrice: visits.unitPrice }
    expect(fieldsOf(() => createInvoiceDraft(ds, { ...invoiceInput(ds, a.id), lines: [line] }, 'i5', ctx))).toHaveProperty('lines.0.quantity')
  })
})

describe('project exception', () => {
  it('overrides the policy for one project without touching the client', async () => {
    const { setProjectException, effectivePolicy } = await import('@/domain/commercial/catalog')
    const ctx = testContext()
    const ds0 = seed()
    const [a] = pvProjects(ds0)
    expect(fieldsOf(() => setProjectException(ds0, a.id, { requiresCertificate: false, reason: ' ' }, ctx))).toHaveProperty('reason')
    const ds = setProjectException(ds0, a.id, { requiresCertificate: false, reason: 'Acuerdo puntual con Movilidad' }, ctx)
    const client = ds.clients.find((c) => c.id === 'cli_petrovalle')!
    expect(client.policy.requiresCertificate).toBe(true)
    expect(effectivePolicy(client, ds.projects.find((p) => p.id === a.id)).requiresCertificate).toBe(false)
    expect(effectivePolicy(client, pvProjects(ds)[1]).requiresCertificate).toBe(true)
  })
})

describe('fix: pending price versions', () => {
  const q = { clientId: 'cli_nordvik', serviceTypeId: 'housing', itemId: 'itm_housing_1', market: 'AR' as const, currency: 'USD' as const, date: TODAY, quantity: 1 }
  const priceOf = (ds: Dataset) => {
    const r = resolvePrice(ds, q)
    return r.status === 'unique' ? r.entry.unitPrice : r.status
  }

  it('the approved price stays in force until the new version is approved', () => {
    const ctx = testContext()
    let ds = seed()
    const entry = ds.priceEntries.find((e) => e.id === 'tar_nv_hou1')!
    ds = updatePriceEntry(ds, entry.id, { ...entry, unitPrice: 1700 }, ctx)
    expect(priceOf(ds)).toBe(1600)
    // New projects contracted meanwhile get the approved price.
    ds = addService(ds, 'prj_0158', { typeId: 'housing', ownerId: 'stf_02', startDate: TODAY, dueDate: '2026-11-30', items: [{ catalogItemId: 'itm_housing_1', quantity: 1 }] }, ctx).ds
    const contracted = ds.services.at(-1)!
    expect(contracted.items![0]).toMatchObject({ unitPrice: 1600, sourceRef: 'tar_nv_hou1' })
    // Only one pending version at a time.
    expect(() => updatePriceEntry(ds, entry.id, { ...entry, unitPrice: 1800 }, ctx)).toThrow(/pendiente de aprobación/)
    const pending = ds.priceEntries.find((e) => e.supersedesId === entry.id)!
    ds = approvePriceEntry(ds, pending.id, 'Acta 2026-11', ctx)
    expect(priceOf(ds)).toBe(1700)
    // The project snapshot is untouched by the approval.
    expect(ds.services.find((s) => s.id === contracted.id)!.items![0].unitPrice).toBe(1600)
  })

  it('open PO prices still prevail over any tariff version', () => {
    const ctx = testContext()
    let ds = seed()
    const entry = ds.priceEntries.find((e) => e.id === 'tar_pv_hou1')!
    ds = updatePriceEntry(ds, entry.id, { ...entry, unitPrice: 999999 }, ctx)
    ds = approvePriceEntry(ds, ds.priceEntries.find((e) => e.supersedesId === entry.id)!.id, 'x', ctx)
    const [a] = pvProjects(ds)
    expect(resolveItemPrice(ds, a, 'housing', 'itm_housing_1', TODAY)).toMatchObject({ unitPrice: 900000, source: 'open-order' })
  })

  it('unapproved entries without a previous approved version keep working (clients without approval workflow)', () => {
    const ctx = testContext()
    let ds = seed()
    ds = createPriceEntry(ds, { clientId: 'cli_nordvik', serviceTypeId: 'housing', itemId: 'itm_housing_4', market: 'ANY', currency: 'USD', unitPrice: 300, unit: 'service', minQuantity: 1, validFrom: '2026-01-01', active: true }, ctx).ds
    expect(resolvePrice(ds, { ...q, itemId: 'itm_housing_4' })).toMatchObject({ status: 'unique' })
  })
})

describe('fix: coherent certificate dates', () => {
  const ctxOn = (day: string) => ({ ...testContext(), now: () => `${day}T22:30:00`, today: () => day })

  it('seed certificates follow creation ≤ presentation ≤ approval', () => {
    for (const c of seed().certificates) {
      if (c.submittedAt) expect(c.submittedAt >= c.createdAt.slice(0, 10)).toBe(true)
      if (c.approvedAt) expect(c.approvedAt >= c.submittedAt!).toBe(true)
    }
  })

  it('creation uses the business date and later steps cannot go back in time', () => {
    let ds = seed()
    const [, b] = pvProjects(ds)
    const h = svc(ds, b.id, 'housing')
    const created = createCertificate(ds, { projectId: b.id, lines: [{ serviceId: h.id, serviceItemId: h.items![0].id, quantity: 1 }] }, 'd1', ctxOn('2026-10-10'))
    ds = created.ds
    const cert = ds.certificates.find((c) => c.id === created.certificateId)!
    expect(cert.createdAt.slice(0, 10)).toBe('2026-10-10')
    expect(cert.history[0].date.slice(0, 10)).toBe('2026-10-10')
    const ctx = ctxOn('2026-10-19')
    expect(fieldsOf(() => submitCertificate(ds, cert.id, { externalNumber: 'X-1', date: '2026-10-09' }, ctx))).toHaveProperty('date')
    expect(fieldsOf(() => submitCertificate(ds, cert.id, { externalNumber: 'X-1', date: '2026-10-25' }, ctx))).toHaveProperty('date')
    ds = submitCertificate(ds, cert.id, { externalNumber: 'X-1', date: '2026-10-12' }, ctx)
    expect(fieldsOf(() => approveCertificate(ds, cert.id, { date: '2026-10-11' }, ctx))).toHaveProperty('date')
    expect(fieldsOf(() => approveCertificate(ds, cert.id, { date: '2026-10-20' }, ctx))).toHaveProperty('date')
    ds = approveCertificate(ds, cert.id, { date: '2026-10-12' }, ctx)
    expect(ds.certificates.find((c) => c.id === cert.id)).toMatchObject({ status: 'approved', submittedAt: '2026-10-12', approvedAt: '2026-10-12' })
  })
})
