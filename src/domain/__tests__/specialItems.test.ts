import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { certifiableUnits, createCertificate } from '@/domain/commercial/certificates'
import { addSpecialItem, approveSpecialItem, removeSpecialItem, setServiceDescription, specialItemStatus, updateSpecialItem, type SpecialItemInput } from '@/domain/commercial/specialItems'
import { approveQuotation, createQuotationFromProject, quotationTotals, sendQuotation, updateQuotationDraft } from '@/domain/commercial/quotations'
import { projectCommercial } from '@/domain/commercial/traceability'
import { suggestInvoiceLines } from '@/domain/finance/invoices'
import { createProject } from '@/domain/projects'
import { updateService, updateServiceItems } from '@/domain/services'
import { readDataset, writeDataset, type StorageLike } from '@/services/local/storage'
import { fieldsOf, projectInput, seed, testContext } from './helpers'

const special = (o: Partial<SpecialItemInput> = {}): SpecialItemInput => ({ name: 'Visitas extra zona norte', description: 'Dos jornadas adicionales con chofer', quantity: 2, unit: 'session', unitPrice: 300, currency: 'USD', reason: 'Pedido del beneficiario', ...o })

/** Nordvik (OC por proyecto + cotización obligatoria) with a housing service priced from the tariff (USD 4.500). */
function nordvik() {
  const ctx = testContext()
  const r = createProject(seed(), projectInput({ services: [{ typeId: 'housing', ownerId: 'stf_04', startDate: '2026-11-01', dueDate: '2026-12-20' }] }), 'sp-nv', ctx)
  const housing = r.ds.services.find((s) => s.projectId === r.projectId)!
  return { ctx, ds: r.ds, projectId: r.projectId, housing }
}
const svc = (ds: Dataset, id: string) => ds.services.find((s) => s.id === id)!
const proj = (ds: Dataset, id: string) => ds.projects.find((p) => p.id === id)!

describe('service descriptions', () => {
  it('belong to the project service, keep history and reach new quotations as a snapshot', () => {
    const { ctx, ds: d0, projectId, housing } = nordvik()
    let ds = setServiceDescription(d0, housing.id, 'Búsqueda en zona norte, hasta tres habitaciones, con coordinación de visitas', ctx)
    ds = setServiceDescription(ds, housing.id, 'Zona norte, tres habitaciones', ctx)
    const s = svc(ds, housing.id)
    expect(s.description).toBe('Zona norte, tres habitaciones')
    expect(s.descriptionHistory?.map((h) => h.previous)).toEqual([undefined, 'Búsqueda en zona norte, hasta tres habitaciones, con coordinación de visitas'])
    expect(s.price).toBe(4500) // prices untouched
    expect(ds.catalogItems).toEqual(d0.catalogItems)
    expect(setServiceDescription(ds, housing.id, 'Zona norte, tres habitaciones', ctx)).toBe(ds) // no-op

    const q = createQuotationFromProject(ds, projectId, ctx)
    expect(q.quotation.lines[0]).toMatchObject({ details: 'Zona norte, tres habitaciones', unitPrice: 4500 })
    ds = approveQuotation(sendQuotation(q.ds, q.quotation.id, ctx), q.quotation.id, { approvedBy: 'Cliente', approvedAt: '2026-10-19' }, ctx)
    ds = setServiceDescription(ds, housing.id, 'Cambio posterior', ctx)
    expect(ds.quotations.find((x) => x.id === q.quotation.id)!.lines[0].details).toBe('Zona norte, tres habitaciones')
    expect(fieldsOf(() => setServiceDescription(ds, housing.id, 'x'.repeat(601), ctx))).toHaveProperty('description')
  })
})

describe('special sub-services', () => {
  it('per-project PO: priced apart, never in the tariff or catalog, approved only through the quotation', () => {
    const { ctx, ds: d0, projectId, housing } = nordvik()
    const r = addSpecialItem(d0, housing.id, special(), ctx)
    let ds = r.ds
    const item = svc(ds, housing.id).items!.find((i) => i.id === r.itemId)!
    expect(item).toMatchObject({ source: 'special', catalogItemId: '', unitPrice: 300, quantity: 2, currency: 'USD', special: { reason: 'Pedido del beneficiario' } })
    expect(svc(ds, housing.id).price).toBe(5100) // 4.500 flat + 2 × 300, no duplication
    expect(ds.priceEntries).toEqual(d0.priceEntries)
    expect(ds.catalogItems).toEqual(d0.catalogItems)
    expect(specialItemStatus(ds, proj(ds, projectId), item)).toMatchObject({ approved: false, channel: 'quotation' })
    expect(() => approveSpecialItem(ds, housing.id, item.id, 'ACTA-1', ctx)).toThrow(/cotización/)
    expect(fieldsOf(() => addSpecialItem(ds, housing.id, special({ name: 'Otro', approvalRef: 'X' }), ctx))).toHaveProperty('approvalRef')

    // Editable while pending (draft lines follow the new price).
    const q = createQuotationFromProject(ds, projectId, ctx)
    expect(q.quotation.lines.map((l) => [l.priceSource, l.quantity, l.unitPrice, l.serviceItemId ?? null])).toEqual([
      ['price-list', 1, 4500, null],
      ['special', 2, 300, item.id],
    ])
    ds = updateSpecialItem(q.ds, housing.id, item.id, { ...special(), unitPrice: 350 }, ctx)
    const draft = ds.quotations.find((x) => x.id === q.quotation.id)!
    expect(draft.lines[1].unitPrice).toBe(350)
    expect(quotationTotals(draft.lines)).toEqual({ USD: 5200 })
    expect(svc(ds, housing.id).price).toBe(5200)
    // The quotation cannot change the special price silently.
    const input = { issueDate: draft.issueDate, validUntil: draft.validUntil, lines: draft.lines.map((l) => ({ ...l, unitPrice: l.serviceItemId ? 999 : l.unitPrice })) }
    expect(fieldsOf(() => updateQuotationDraft(ds, draft.id, input, ctx))).toHaveProperty(['lines.1.unitPrice'])

    ds = approveQuotation(sendQuotation(ds, draft.id, ctx), draft.id, { approvedBy: 'Cliente', approvedAt: '2026-10-19' }, ctx)
    const approved = svc(ds, housing.id).items![0]
    expect(specialItemStatus(ds, proj(ds, projectId), approved)).toMatchObject({ approved: true, label: expect.stringMatching(/^Aprobado en COT-/) })
    expect(() => updateSpecialItem(ds, housing.id, item.id, special(), ctx)).toThrow(/cotización/)
    expect(() => removeSpecialItem(ds, housing.id, item.id, ctx)).toThrow(/cotización/)
    expect(projectCommercial(ds, proj(ds, projectId), '2026-10-19').get(housing.id)!.approved).toEqual({ USD: 5200 })
  })

  it('validates name, quantity, price, currency (no conversion) and reason', () => {
    const { ctx, ds, housing } = nordvik()
    const f = fieldsOf(() => addSpecialItem(ds, housing.id, special({ name: ' ', quantity: 0, unitPrice: 0, currency: 'EUR', reason: '' }), ctx))
    expect(Object.keys(f).sort()).toEqual(['currency', 'name', 'quantity', 'reason', 'unitPrice'])
    expect(f.currency).toMatch(/USD/)
  })

  it('open PO: not authorised by the OC until an explicit approval; then certifiable and invoiceable', () => {
    const ctx = testContext()
    let ds = seed()
    const project = ds.projects.find((p) => p.openOrderId === 'oca_pv_nqn' && ds.people.find((x) => x.id === p.beneficiaryId)?.name === 'Tomás Herrera')!
    const housing = ds.services.find((s) => s.projectId === project.id && s.typeId === 'housing')!
    const imm = ds.services.find((s) => s.projectId === project.id && s.typeId === 'immigration')!
    const before = projectCommercial(ds, project, '2026-10-19').get(housing.id)!
    const r = addSpecialItem(ds, housing.id, special({ currency: 'ARS', unitPrice: 250000, quantity: 1, unit: 'service', name: 'Mudanza interna de depósito' }), ctx)
    ds = r.ds
    const item = svc(ds, housing.id).items!.find((i) => i.id === r.itemId)!
    expect(specialItemStatus(ds, project, item)).toMatchObject({ approved: false, channel: 'explicit', label: expect.stringMatching(/No autorizado por la OC abierta/) })
    // The rest of the service stays authorised by the OC; the special amount is not.
    const after = projectCommercial(ds, project, '2026-10-19').get(housing.id)!
    expect(after.stage).toBe('open-order')
    expect(after.authorized).toEqual(before.authorized)
    expect(certifiableUnits(ds, project.id).some((u) => u.serviceItemId === item.id)).toBe(false)
    expect(() => createCertificate(ds, { projectId: project.id, lines: [{ serviceId: housing.id, serviceItemId: item.id, quantity: 1 }] }, 'c-sp-1', ctx)).toThrow()

    expect(() => approveSpecialItem(ds, housing.id, item.id, 'ENM-OC-1', testContext('stf_02'))).toThrow(/autorización/)
    expect(fieldsOf(() => approveSpecialItem(ds, housing.id, item.id, ' ', ctx))).toHaveProperty('approvalRef')
    ds = approveSpecialItem(ds, housing.id, item.id, 'Enmienda OC 4500012345-A', ctx)
    const ok = svc(ds, housing.id).items!.find((i) => i.id === item.id)!
    expect(ok.special).toMatchObject({ approvalRef: 'Enmienda OC 4500012345-A', approvedBy: 'stf_01' })
    expect(projectCommercial(ds, project, '2026-10-19').get(housing.id)!.authorized).toEqual({ ARS: before.authorized.ARS! + 250000 })
    expect(certifiableUnits(ds, project.id).find((u) => u.serviceItemId === item.id)).toMatchObject({ unitPrice: 250000, contracted: 1, available: 1 })
    const c = createCertificate(ds, { projectId: project.id, lines: [{ serviceId: housing.id, serviceItemId: item.id, quantity: 1 }] }, 'c-sp-2', ctx)
    expect(c.ds.certificates.at(-1)!.lines[0]).toMatchObject({ serviceItemId: item.id, unitPrice: 250000 })
    // Approved prices cannot change; certified items cannot be removed.
    expect(() => updateSpecialItem(c.ds, housing.id, item.id, special({ currency: 'ARS' }), ctx)).toThrow(/aprobado/)
    expect(() => removeSpecialItem(c.ds, housing.id, item.id, ctx)).toThrow(/certificado/)

    // Another service, approved on creation (authorizer + reference).
    const r2 = addSpecialItem(ds, imm.id, special({ currency: 'ARS', unitPrice: 90000, quantity: 1, unit: 'person', name: 'Legalización extra', approvalRef: 'Email cliente 18/10' }), ctx)
    expect(specialItemStatus(r2.ds, project, svc(r2.ds, imm.id).items!.at(-1)!).approved).toBe(true)
    expect(fieldsOf(() => addSpecialItem(ds, imm.id, special({ currency: 'ARS', name: 'Y', approvalRef: 'Z' }), testContext('stf_02')))).toHaveProperty('approvalRef')
  })

  it('client without PO nor quotation requirement: no approval needed; invoice lines include it once', () => {
    const ctx = testContext()
    const p = createProject(seed(), projectInput({ clientId: 'cli_brightwater', services: [{ typeId: 'housing', ownerId: 'stf_04', startDate: '2026-11-01', dueDate: '2026-12-20', price: 1000 }] }), 'sp-bw', ctx)
    const project = proj(p.ds, p.projectId)
    const housing = p.ds.services.find((s) => s.projectId === p.projectId)!
    const r = addSpecialItem(p.ds, housing.id, special({ currency: project.currency }), ctx)
    const item = svc(r.ds, housing.id).items![0]
    expect(specialItemStatus(r.ds, project, item)).toMatchObject({ approved: true, channel: 'none' })
    expect(svc(r.ds, housing.id).price).toBe(1600)
    // Flat price + special item are certifiable/invoiceable separately, never twice.
    expect(certifiableUnits(r.ds, project.id).map((u) => [u.serviceItemId ?? null, u.unitPrice, u.contracted])).toEqual([
      [null, 1000, 1],
      [item.id, 300, 2],
    ])
    const done = { ...r.ds, services: r.ds.services.map((s) => (s.id === housing.id ? { ...s, status: 'completed' as const, completedAt: '2026-10-19' } : s)) }
    const lines = suggestInvoiceLines(done, project.id, project.currency, '2026-10-19')
    expect(lines.map((l) => [l.serviceItemId ?? null, l.quantity, l.unitPrice])).toEqual([
      [null, 1, 1000],
      [item.id, 2, 300],
    ])
  })

  it('catalog sub-service edits keep special items; itemised prices are not overwritten', () => {
    const ctx = testContext()
    let ds = seed()
    const project = ds.projects.find((p) => p.openOrderId === 'oca_pv_nqn' && ds.people.find((x) => x.id === p.beneficiaryId)?.name === 'Renata Quiroga')!
    const housing = ds.services.find((s) => s.projectId === project.id && s.typeId === 'housing')!
    ds = addSpecialItem(ds, housing.id, special({ currency: 'ARS', unitPrice: 50000, quantity: 1 }), ctx).ds
    ds = updateServiceItems(ds, housing.id, [{ catalogItemId: 'itm_housing_1', quantity: 1 }], ctx)
    const s = svc(ds, housing.id)
    expect(s.items!.map((i) => i.source)).toEqual(['open-order', 'special'])
    expect(s.price).toBe(900000 + 50000)
    expect(fieldsOf(() => updateService(ds, housing.id, { price: 1 }, ctx))).toHaveProperty('price')
    ds = removeSpecialItem(ds, housing.id, s.items![1].id, ctx)
    expect(svc(ds, housing.id)).toMatchObject({ price: 900000 })
    expect(svc(ds, housing.id).items).toHaveLength(1)
  })

  it('persists descriptions and special items', () => {
    const { ctx, ds: d0, housing } = nordvik()
    let ds = setServiceDescription(d0, housing.id, 'Zona norte', ctx)
    ds = addSpecialItem(ds, housing.id, special(), ctx).ds
    const mem: Record<string, string> = {}
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    writeDataset(storage, ds, 'now')
    const back = svc(readDataset(storage).dataset!, housing.id)
    expect(back).toMatchObject({ description: 'Zona norte', price: 5100 })
    expect(back.items![0].special?.reason).toBe('Pedido del beneficiario')
  })
})
