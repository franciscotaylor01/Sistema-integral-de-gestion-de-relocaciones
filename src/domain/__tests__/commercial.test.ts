import { describe, expect, it } from 'vitest'
import { createClient, updateClient, type ClientInput } from '@/domain/commercial/clients'
import { createPriceEntry, resolvePrice, updatePriceEntry, type PriceEntryInput } from '@/domain/commercial/pricing'
import { availableToAuthorize, cancelPurchaseOrder, createPurchaseOrder, type PurchaseOrderInput } from '@/domain/commercial/purchaseOrders'
import {
  approveQuotation,
  createQuotationFromProject,
  createQuotationVersion,
  effectiveStatus,
  quotationTotals,
  rejectQuotation,
  sendQuotation,
  updateQuotationDraft,
  type QuotationDraftInput,
} from '@/domain/commercial/quotations'
import { projectCommercial } from '@/domain/commercial/traceability'
import { DomainError } from '@/domain/errors'
import { fieldsOf, seed, testContext } from './helpers'

const clientInput = (o: Partial<ClientInput> = {}): ClientInput => ({
  name: 'Aurora Biotech',
  legalName: 'Aurora Biotech S.A.',
  taxId: 'CUIT 30-71111111-1',
  industry: 'Biotecnología',
  country: 'AR',
  city: 'Rosario',
  billingAddress: 'Calle Falsa 123, Rosario',
  status: 'active',
  accountManagerId: 'stf_02',
  billingCurrency: 'USD',
  currencies: ['ARS'],
  paymentTermsDays: 30,
  requiresPurchaseOrder: false,
  requiresApprovedQuote: true,
  billingMilestone: 'service-completed',
  quoteValidityDays: 15,
  contacts: [{ name: 'Inés Paz', role: 'RR. HH.', email: 'ines@aurora.example', phone: '+54 341 555 0101', primary: true }],
  ...o,
})

const draftInput = (q: { issueDate: string; validUntil: string; lines: QuotationDraftInput['lines'] }): QuotationDraftInput => ({
  issueDate: q.issueDate,
  validUntil: q.validUntil,
  lines: q.lines.map((l) => ({ ...l })),
})

describe('clients', () => {
  it('creates and edits clients with a configurable PO policy', () => {
    const ctx = testContext()
    const { ds, clientId } = createClient(seed(), clientInput(), 'r1', ctx)
    const client = ds.clients.find((c) => c.id === clientId)!
    expect(client.policy.requiresPurchaseOrder).toBe(false)
    expect(client.currencies).toEqual(['USD', 'ARS'])
    const again = createClient(ds, clientInput(), 'r1', ctx)
    expect(again.duplicate).toBe(true)
    const edited = updateClient(ds, clientId, clientInput({ requiresPurchaseOrder: true, paymentTermsDays: 45 }), ctx)
    expect(edited.clients.find((c) => c.id === clientId)!.policy.requiresPurchaseOrder).toBe(true)
  })

  it('validates tax id uniqueness, emails and a single primary contact', () => {
    const f = fieldsOf(() =>
      createClient(
        seed(),
        clientInput({
          taxId: 'CUIT 30-71844512-6', // Lumen Fintech
          contacts: [
            { name: 'A', role: '', email: 'bad', phone: '' },
            { name: 'B', role: '', email: 'b@x.example', phone: '' },
          ],
        }),
        'r',
        testContext(),
      ),
    )
    expect(f.taxId).toMatch(/Ya existe/)
    expect(f['contacts.0.email']).toBeDefined()
    expect(f.contacts).toMatch(/principal/)
  })
})

describe('pricing', () => {
  const nordvik = { clientId: 'cli_nordvik', currency: 'USD' as const, date: '2026-10-19', quantity: 1 }

  it('prefers a market-specific rule over the general one (documented precedence)', () => {
    const r = resolvePrice(seed(), { ...nordvik, serviceTypeId: 'housing', market: 'AR' })
    expect(r.status).toBe('unique')
    if (r.status === 'unique') expect(r.entry.unitPrice).toBe(4500)
    const elsewhere = resolvePrice(seed(), { ...nordvik, serviceTypeId: 'housing', market: 'BR' })
    expect(elsewhere.status === 'unique' && elsewhere.entry.unitPrice).toBe(4200)
  })

  it('surfaces overlapping rules as ambiguous instead of choosing silently', () => {
    const r = resolvePrice(seed(), { ...nordvik, serviceTypeId: 'immigration', market: 'AR' })
    expect(r.status).toBe('ambiguous')
    expect(r.candidates.map((c) => c.unitPrice).sort()).toEqual([5200, 5400])
    // Before the Q4 addendum starts there is no ambiguity.
    expect(resolvePrice(seed(), { ...nordvik, date: '2026-09-15', serviceTypeId: 'immigration', market: 'AR' }).status).toBe('unique')
  })

  it('applies quantity tiers and validity dates', () => {
    const q = { clientId: 'cli_helvion', currency: 'EUR' as const, serviceTypeId: 'schooling', market: 'JP' as const, date: '2026-10-19' }
    const one = resolvePrice(seed(), { ...q, quantity: 1 })
    const two = resolvePrice(seed(), { ...q, quantity: 2 })
    expect(one.status === 'unique' && one.entry.unitPrice).toBe(2400)
    expect(two.status === 'unique' && two.entry.unitPrice).toBe(2100)
    expect(resolvePrice(seed(), { ...q, quantity: 1, date: '2028-01-01' }).status).toBe('none')
  })

  it('requires acknowledging overlaps when creating rules', () => {
    const input: PriceEntryInput = {
      clientId: 'cli_kestrel', serviceTypeId: 'housing', market: 'ANY', currency: 'USD', unitPrice: 3300, unit: 'service',
      minQuantity: 1, validFrom: '2026-06-01', validTo: '2026-12-31', active: true,
    }
    expect(fieldsOf(() => createPriceEntry(seed(), input, testContext())).overlap).toBe('overlap')
    const { ds } = createPriceEntry(seed(), input, testContext(), { acceptOverlap: true })
    expect(resolvePrice(ds, { clientId: 'cli_kestrel', serviceTypeId: 'housing', market: 'US', currency: 'USD', date: '2026-10-19', quantity: 1 }).status).toBe('ambiguous')
    expect(() => createPriceEntry(seed(), { ...input, unitPrice: 0, validTo: '2026-01-01' }, testContext())).toThrow(DomainError)
  })
})

describe('quotations', () => {
  it('prepopulates lines from contracted services with tariff suggestions', () => {
    const ds = seed()
    const oceanic = createQuotationFromProject({ ...ds, quotations: [] }, 'prj_0162', testContext()).quotation // no tariff → manual lines
    expect(oceanic.lines).toHaveLength(4)
    expect(oceanic.lines.every((l) => l.priceSource === 'manual' && l.unitPrice === 0)).toBe(true)
    expect(() => createQuotationFromProject(ds, 'prj_0162', testContext())).toThrow(/Ya existe el borrador/)
    const { quotation } = createQuotationFromProject({ ...ds, quotations: ds.quotations.filter((x) => x.projectId !== 'prj_0161') }, 'prj_0161', testContext())
    expect(quotation.lines.map((l) => l.serviceId)).toEqual(['prj_0161_s1', 'prj_0161_s2', 'prj_0161_s3'])
    expect(quotation.lines[0]).toMatchObject({ unitPrice: 3800, priceSource: 'price-list', suggestedUnitPrice: 3800 })
    expect(quotation.number).toBe('COT-2026-0017')
  })

  it('leaves ambiguous tariffs unpriced for review and blocks sending', () => {
    const ds = seed()
    const clean = { ...ds, quotations: ds.quotations.filter((x) => x.projectId !== 'prj_0158'), purchaseOrders: [] }
    const { ds: d1, quotation } = createQuotationFromProject(clean, 'prj_0158', testContext())
    const imm = quotation.lines.find((l) => l.serviceTypeId === 'immigration')!
    expect(imm.unitPrice).toBe(0)
    expect(imm.notes).toMatch(/ambigua/)
    expect(quotation.lines.find((l) => l.serviceTypeId === 'housing')!.unitPrice).toBe(4500)
    expect(() => sendQuotation(d1, quotation.id, testContext())).toThrow(/sin precio/)
  })

  it('requires a reason and authorisation for price adjustments', () => {
    const ds = seed()
    const clean = { ...ds, quotations: ds.quotations.filter((x) => x.projectId !== 'prj_0161') }
    const { ds: d1, quotation } = createQuotationFromProject(clean, 'prj_0161', testContext())
    const input = draftInput(quotation)
    input.lines[0].unitPrice = 3500
    expect(fieldsOf(() => updateQuotationDraft(d1, quotation.id, input, testContext()))['lines.0.adjustmentReason']).toBeDefined()
    input.lines[0].adjustmentReason = 'Descuento por volumen'
    expect(fieldsOf(() => updateQuotationDraft(d1, quotation.id, input, testContext('stf_02')))['lines.0.unitPrice']).toMatch(/autorización/)
    const d2 = updateQuotationDraft(d1, quotation.id, input, testContext())
    expect(d2.quotations.find((q) => q.id === quotation.id)!.lines[0]).toMatchObject({ unitPrice: 3500, priceSource: 'adjusted' })
  })

  it('keeps approved snapshots when tariffs change, and versions supersede on approval', () => {
    const ds = seed()
    const clean = { ...ds, quotations: ds.quotations.filter((x) => x.projectId !== 'prj_0161') }
    const ctx = testContext()
    const created = createQuotationFromProject(clean, 'prj_0161', ctx)
    const quotation = created.quotation
    let d = created.ds
    d = sendQuotation(d, quotation.id, ctx)
    d = approveQuotation(d, quotation.id, { approvedBy: 'Florencia Ledesma', approvedAt: '2026-10-19' }, ctx)
    const approvedTotal = quotationTotals(d.quotations.find((q) => q.id === quotation.id)!.lines)
    expect(approvedTotal.USD).toBe(3800 + 3400 + 2200)

    // Tariff increases: the approved quotation is untouched.
    const entry = d.priceEntries.find((e) => e.clientId === 'cli_lumen' && e.serviceTypeId === 'immigration')!
    d = updatePriceEntry(d, entry.id, { ...entry, unitPrice: 4500 }, ctx)
    expect(quotationTotals(d.quotations.find((q) => q.id === quotation.id)!.lines).USD).toBe(approvedTotal.USD)

    // New version, approved → previous superseded but preserved.
    const v2 = createQuotationVersion(d, quotation.id, ctx)
    d = v2.ds
    expect(v2.quotation.version).toBe(2)
    d = sendQuotation(d, v2.quotation.id, ctx)
    d = approveQuotation(d, v2.quotation.id, { approvedBy: 'Florencia Ledesma', approvedAt: '2026-10-19' }, ctx)
    const v1 = d.quotations.find((q) => q.id === quotation.id)!
    expect(v1).toMatchObject({ status: 'approved', supersededById: v2.quotation.id })
    expect(quotationTotals(v1.lines).USD).toBe(approvedTotal.USD)
  })

  it('handles rejection, expiry and approval permissions', () => {
    const ds = seed()
    const expired = ds.quotations.find((q) => q.id === 'quo_15')!
    expect(effectiveStatus(expired, '2026-10-19')).toBe('expired')
    expect(() => approveQuotation(ds, 'quo_15', { approvedBy: 'X', approvedAt: '2026-10-19' }, testContext())).toThrow(/vencida/)
    expect(() => approveQuotation(ds, 'quo_14b', { approvedBy: 'X', approvedAt: '2026-10-19' }, testContext('stf_03'))).toThrow(/autorización/)
    expect(() => rejectQuotation(ds, 'quo_14b', ' ', testContext())).toThrow()
    const rejected = rejectQuotation(ds, 'quo_14b', 'Sin presupuesto', testContext())
    expect(rejected.quotations.find((q) => q.id === 'quo_14b')!.status).toBe('rejected')
  })

  it('blocks approving a version below what POs already authorise', () => {
    const ctx = testContext()
    // prj_0155: approved quo_09 fully authorised by po_06 (moving 9800).
    const version = createQuotationVersion(seed(), 'quo_09', ctx)
    const quotation = version.quotation
    let ds = version.ds
    const input = draftInput(quotation)
    const moving = input.lines.findIndex((l) => l.serviceTypeId === 'moving')
    input.lines[moving].unitPrice = 9000
    input.lines[moving].adjustmentReason = 'Renegociación'
    ds = updateQuotationDraft(ds, quotation.id, input, ctx)
    ds = sendQuotation(ds, quotation.id, ctx)
    expect(() => approveQuotation(ds, quotation.id, { approvedBy: 'Paula', approvedAt: '2026-10-19' }, ctx)).toThrow(/menos de lo ya autorizado/)
  })
})

describe('purchase orders', () => {
  const base = (o: Partial<PurchaseOrderInput> = {}): PurchaseOrderInput => ({
    projectId: 'prj_0158',
    clientPoNumber: 'PO-NV-2026-0800',
    quotationId: 'quo_11b',
    issueDate: '2026-10-15',
    receivedDate: '2026-10-16',
    currency: 'USD',
    authorizedAmount: 3700,
    allocations: [
      { serviceId: 'prj_0158_s3', amount: 2400 },
      { serviceId: 'prj_0158_s5', amount: 1300 },
    ],
    ...o,
  })

  it('authorises remaining approved work with partial allocations', () => {
    const ds = seed()
    expect(availableToAuthorize(ds, 'prj_0158', 'USD').get('prj_0158_s3')).toBe(2400)
    const before = projectCommercial(ds, ds.projects.find((p) => p.id === 'prj_0158')!, '2026-10-19')
    expect(before.get('prj_0158_s3')!.pendingAuthorization.USD).toBe(2400)
    const { ds: d1 } = createPurchaseOrder(ds, base({ authorizedAmount: 3000, allocations: [{ serviceId: 'prj_0158_s3', amount: 2400 }] }), 'po-r1', testContext())
    const after = projectCommercial(d1, d1.projects.find((p) => p.id === 'prj_0158')!, '2026-10-19')
    expect(after.get('prj_0158_s3')!.stage).toBe('authorized')
    expect(after.get('prj_0158_s5')!.stage).toBe('approved')
  })

  it('prevents over-allocation per service and beyond the PO amount', () => {
    const ds = seed()
    const f1 = fieldsOf(() => createPurchaseOrder(ds, base({ allocations: [{ serviceId: 'prj_0158_s3', amount: 2500 }] }), 'x', testContext()))
    expect(f1['allocations.0.amount']).toMatch(/Supera lo disponible/)
    const f2 = fieldsOf(() => createPurchaseOrder(ds, base({ authorizedAmount: 1000 }), 'x', testContext()))
    expect(f2.allocations).toMatch(/superan el monto autorizado/)
    // Already fully authorised service.
    const f3 = fieldsOf(() => createPurchaseOrder(ds, base({ allocations: [{ serviceId: 'prj_0158_s1', amount: 1 }] }), 'x', testContext()))
    expect(f3['allocations.0.amount']).toMatch(/Supera/)
  })

  it('rejects duplicate client PO numbers and duplicate submissions', () => {
    const ds = seed()
    expect(fieldsOf(() => createPurchaseOrder(ds, base({ clientPoNumber: 'po-nv-2026-0712' }), 'x', testContext())).clientPoNumber).toMatch(/ya tiene/)
    const ctx = testContext()
    const a = createPurchaseOrder(ds, base(), 'same', ctx)
    const b = createPurchaseOrder(a.ds, base(), 'same', ctx)
    expect(b.duplicate).toBe(true)
    expect(b.ds.purchaseOrders).toHaveLength(a.ds.purchaseOrders.length)
  })

  it('cancelling a PO releases its authorisation', () => {
    const ds = cancelPurchaseOrder(seed(), 'po_08', 'Reemplazada por OC unificada', testContext())
    expect(availableToAuthorize(ds, 'prj_0158', 'USD').get('prj_0158_s1')).toBe(5200)
    expect(() => cancelPurchaseOrder(seed(), 'po_08', '', testContext())).toThrow()
  })
})

describe('commercial traceability & invoice eligibility', () => {
  const status = (projectId: string, serviceId: string) => {
    const ds = seed()
    return projectCommercial(ds, ds.projects.find((p) => p.id === projectId)!, '2026-10-19').get(serviceId)!
  }

  it('does not make a service invoiceable just because a PO was received', () => {
    // Andes requires completion: PO fully authorises it, but the service is in progress.
    const s = status('prj_0160', 'prj_0160_s1')
    expect(s.stage).toBe('authorized')
    expect(s.eligibility.eligible).toBe(false)
    expect(s.eligibility.missing.join()).toMatch(/completarse/)
  })

  it('handles clients without a mandatory PO', () => {
    // Kestrel: no PO required, billing on completion.
    const done = status('prj_0149', 'prj_0149_s1')
    expect(done.stage).toBe('approved-no-po')
    expect(done.eligibility).toMatchObject({ eligible: true, amount: { USD: 3600 } })
    expect(done.pendingAuthorization).toEqual({})
    const running = status('prj_0149', 'prj_0149_s2')
    expect(running.eligibility.eligible).toBe(false)
  })

  it('eligible amount is capped by the PO for PO-required clients', () => {
    // Helvion bills on approval; settling-in approved but not authorised.
    expect(status('prj_0152', 'prj_0152_s1').eligibility).toMatchObject({ eligible: true, amount: { EUR: 4900 } })
    const pending = status('prj_0152', 'prj_0152_s4')
    expect(pending.stage).toBe('approved')
    expect(pending.eligibility.missing).toContain('Falta OC del cliente')
  })
})
