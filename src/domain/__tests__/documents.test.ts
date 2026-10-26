import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { quotationDocument, registerQuotationSent, registerTariffSent, tariffSheet } from '@/domain/commercial/documents'
import { createPriceEntry, updatePriceEntry } from '@/domain/commercial/pricing'
import {
  approveQuotation,
  createQuotationFromProject,
  createQuotationVersion,
  markQuotationReady,
  quotationStage,
  reopenQuotationDraft,
  sendQuotation,
  updateQuotationDraft,
} from '@/domain/commercial/quotations'
import { addSpecialItem, setServiceDescription } from '@/domain/commercial/specialItems'
import { createProject } from '@/domain/projects'
import { quotationEmail, tariffEmail } from '@/features/commercial/documents/emails'
import { quotationPdf } from '@/features/commercial/documents/quotationPdf'
import { tariffPdf } from '@/features/commercial/documents/tariffPdf'
import { migrateDataset } from '@/services/local/migrations'
import { fieldsOf, projectInput, seed, testContext } from './helpers'

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('')

/** Structural check: header, trailer and every xref offset pointing at its object. */
function assertValidPdf(bytes: Uint8Array) {
  const s = latin1(bytes)
  expect(s.startsWith('%PDF-1.4')).toBe(true)
  expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
  const startxref = Number(/startxref\n(\d+)/.exec(s)![1])
  expect(s.slice(startxref, startxref + 4)).toBe('xref')
  const entries = [...s.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]))
  entries.forEach((off, i) => expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
  for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) expect(s.slice(m.index! + m[0].length + Number(m[1]), m.index! + m[0].length + Number(m[1]) + 10)).toBe('\nendstream')
  return s
}

/** Nordvik project (OC por proyecto) with a described housing service, a special item and a quotation draft. */
function quoted() {
  const ctx = testContext()
  const r = createProject(seed(), projectInput({ services: [{ typeId: 'housing', ownerId: 'stf_04', startDate: '2026-11-01', dueDate: '2026-12-20' }] }), 'doc-p', ctx)
  const housing = r.ds.services.find((s) => s.projectId === r.projectId)!
  let ds = setServiceDescription(r.ds, housing.id, 'Búsqueda en zona norte, hasta tres habitaciones, con coordinación de visitas', ctx)
  ds = addSpecialItem(ds, housing.id, { name: 'Visitas extra fin de semana', description: 'Con chofer', quantity: 2, unit: 'session', unitPrice: 300, currency: 'USD', reason: 'Pedido del beneficiario' }, ctx).ds
  const q = createQuotationFromProject(ds, r.projectId, ctx)
  return { ctx, ds: q.ds, q: q.quotation, projectId: r.projectId, housing }
}
const quote = (ds: Dataset, id: string) => ds.quotations.find((x) => x.id === id)!

describe('quotation document and PDF', () => {
  it('groups services with project descriptions, special sub-services, subtotals and totals per currency', () => {
    const { ds: d0, q } = quoted()
    const ctx = testContext()
    // Extra line in another currency: totals are kept apart.
    const ds = updateQuotationDraft(d0, q.id, { issueDate: q.issueDate, validUntil: q.validUntil, notes: 'Incluye coordinación con la escuela.', lines: [...q.lines, { serviceTypeId: 'orientation', description: 'Tour de orientación', quantity: 1, unit: 'service', unitPrice: 800, currency: 'EUR' }] }, ctx)
    const doc = quotationDocument(ds, q.id, '2026-10-19')
    expect(doc.party).toMatchObject({ clientName: 'Nordvik Energy', projectCode: expect.any(String), beneficiary: 'Ada Lindqvist' })
    expect(doc.groups.map((g) => g.label)).toEqual(['Housing', 'Ítems adicionales'])
    const h = doc.groups[0]
    expect(h.details).toMatch(/zona norte/)
    expect(h.lines.map((l) => [l.special, l.quantity, l.unitPrice, l.total])).toEqual([
      [false, 1, 4500, 4500],
      [true, 2, 300, 600],
    ])
    expect(h.subtotal).toEqual({ USD: 5100 })
    expect(doc.totals).toEqual({ USD: 5100, EUR: 800 })
    expect(doc.conditions.join(' ')).toMatch(/orden de compra/)
    expect(doc.stage).toBe('draft')

    const pdf = quotationPdf(doc, '19/10/2026')
    const s = assertValidPdf(pdf)
    for (const t of ['Relocare', q.number, 'Subtotal Housing', 'Total EUR', 'Total USD', 'Visitas extra fin de semana', 'Subservicio especial del proyecto', 'Borrador interno']) expect(s).toContain(t)
  })

  it('never invents missing client data', () => {
    const { ds: d0, q } = quoted()
    const ds = { ...d0, clients: d0.clients.map((c) => (c.id === 'cli_nordvik' ? { ...c, taxId: '', billingAddress: '', contacts: [] } : c)) }
    const doc = quotationDocument(ds, q.id, '2026-10-19')
    expect(doc.party.taxId).toBeUndefined()
    expect(doc.party.contact).toBeUndefined()
    expect(latin1(quotationPdf(doc, '19/10/2026'))).toContain('No informado')
    expect(quotationEmail(doc).body).toMatch(/^Estimado equipo de Nordvik Energy:/)
  })
})

describe('quotation flow', () => {
  it('draft → ready (locked) → back to draft → ready → sent with date/ref → approved with ref; history kept', () => {
    const { ctx, ds: d0, q } = quoted()
    let ds = markQuotationReady(d0, q.id, ctx)
    expect(quotationStage(quote(ds, q.id), '2026-10-19')).toBe('ready')
    expect(quote(ds, q.id).issuedTo?.clientName).toBe('Nordvik Energy')
    const input = { issueDate: q.issueDate, validUntil: q.validUntil, lines: q.lines }
    expect(() => updateQuotationDraft(ds, q.id, input, ctx)).toThrow(/preparada/)
    ds = reopenQuotationDraft(ds, q.id, ctx)
    expect(quotationStage(quote(ds, q.id), '2026-10-19')).toBe('draft')
    ds = markQuotationReady(updateQuotationDraft(ds, q.id, input, ctx), q.id, ctx)

    expect(fieldsOf(() => sendQuotation(ds, q.id, ctx, { sentAt: '2026-10-25' }))).toHaveProperty('sentAt')
    ds = sendQuotation(ds, q.id, ctx, { sentAt: '2026-10-19', reference: 'Email a compras' })
    expect(quote(ds, q.id)).toMatchObject({ status: 'sent', sentAt: '2026-10-19', sentRef: 'Email a compras' })
    // Recipient data is frozen: later client edits do not alter the issued document.
    const renamed = { ...ds, clients: ds.clients.map((c) => (c.id === 'cli_nordvik' ? { ...c, name: 'Nordvik (renombrado)' } : c)) }
    expect(quotationDocument(renamed, q.id, '2026-10-19').party.clientName).toBe('Nordvik Energy')

    ds = approveQuotation(ds, q.id, { approvedBy: 'Lena Berg', approvedAt: '2026-10-19', approvalRef: 'Email 19/10 10:42' }, ctx)
    const approved = quote(ds, q.id)
    expect(approved).toMatchObject({ status: 'approved', approvalRef: 'Email 19/10 10:42' })
    const snapshot = JSON.stringify(approved)

    // A revision is a new traceable version; the approved one is untouched until the new one is approved.
    const v2 = createQuotationVersion(ds, q.id, ctx)
    expect(v2.quotation).toMatchObject({ version: 2, previousVersionId: q.id, status: 'draft' })
    expect(v2.quotation.preparedAt).toBeUndefined()
    expect(JSON.stringify(quote(v2.ds, q.id))).toBe(snapshot)
    let next = sendQuotation(v2.ds, v2.quotation.id, ctx)
    next = approveQuotation(next, v2.quotation.id, { approvedBy: 'Lena Berg', approvedAt: '2026-10-19' }, ctx)
    expect(quotationStage(quote(next, q.id), '2026-10-19')).toBe('superseded')
    expect(quote(next, q.id).lines).toEqual(approved.lines)
    expect(quotationDocument(next, q.id, '2026-10-19').stage).toBe('superseded')
  })

  it('prepared email: subject, body with services; registering the sending is explicit and idempotent', () => {
    const { ctx, ds: d0, q } = quoted()
    const ds = markQuotationReady(d0, q.id, ctx)
    const mail = quotationEmail(quotationDocument(ds, q.id, '2026-10-19'), 'Eugenia Ríos')
    expect(mail.subject).toBe(`Cotización ${q.number} v1 · ${quote(ds, q.id).issuedTo!.projectCode} · Nordvik Energy`)
    expect(mail.body).toMatch(/• Housing: USD\s5\.100 \(incluye subservicios especiales\)/)
    expect(mail.body).toMatch(/válida hasta el/)
    expect(mail.body).toMatch(/nos confirmes la aprobación/)
    expect(mail.body).not.toMatch(/enviad/i)
    // Preparing does not send anything.
    expect(quote(ds, q.id).status).toBe('draft')
    expect(ds.communications).toHaveLength(0)

    const input = { subject: mail.subject, body: mail.body, recipients: 'compras@nordvik.example', sentAt: '2026-10-19', reference: 'Gmail 19/10' }
    expect(fieldsOf(() => registerQuotationSent(ds, q.id, { ...input, sentAt: '2026-12-01' }, 'r1', ctx))).toHaveProperty('sentAt')
    const r = registerQuotationSent(ds, q.id, input, 'r1', ctx)
    expect(quote(r.ds, q.id)).toMatchObject({ status: 'sent', sentAt: '2026-10-19', sentRef: 'Gmail 19/10' })
    expect(r.ds.communications[0]).toMatchObject({ kind: 'quotation', quotationId: q.id, subject: mail.subject, recipients: 'compras@nordvik.example', documentName: expect.stringMatching(/\.pdf$/) })
    expect(registerQuotationSent(r.ds, q.id, input, 'r1', ctx)).toMatchObject({ duplicate: true, communicationId: r.communicationId })
    // A reminder on a sent quotation adds a communication without changing it.
    const again = registerQuotationSent(r.ds, q.id, { ...input, reference: 'Recordatorio' }, 'r2', ctx)
    expect(again.ds.communications).toHaveLength(2)
    expect(quote(again.ds, q.id).sentRef).toBe('Gmail 19/10')
  })
})

describe('tariff sheet', () => {
  it('excludes pending versions always and unapproved prices when approval is mandatory', () => {
    const ctx = testContext()
    let ds = seed()
    const e = ds.priceEntries.find((x) => x.id === 'tar_nv_hou1')!
    ds = updatePriceEntry(ds, e.id, { ...e, unitPrice: 1700 }, ctx) // pending version
    const nv = tariffSheet(ds, 'cli_nordvik', '2026-10-19')
    const rows = nv.groups.flatMap((g) => g.rows)
    expect(rows.find((r) => r.itemId === 'itm_housing_1')?.unitPrice).toBe(1600)
    expect(rows.some((r) => r.unitPrice === 1700)).toBe(false)
    expect(nv.excluded).toBeGreaterThanOrEqual(1)
    // Two overlapping immigration rules in the demo data: reported, never listed side by side.
    expect(nv.conflicts.map((c) => c.label)).toContain('Migraciones (USD)')
    expect(rows.some((r) => r.serviceTypeId === 'immigration' && !r.itemId)).toBe(false)

    // Petrovalle requires approval: a new unapproved price is left out.
    ds = createPriceEntry(ds, { clientId: 'cli_petrovalle', serviceTypeId: 'housing', itemId: 'itm_housing_4', market: 'ANY', currency: 'ARS', unitPrice: 77777, unit: 'service', minQuantity: 1, validFrom: '2026-01-01', active: true }, ctx, { acceptOverlap: true }).ds
    const pv = tariffSheet(ds, 'cli_petrovalle', '2026-10-19')
    expect(pv.requiresApproval).toBe(true)
    expect(pv.groups.flatMap((g) => g.rows).some((r) => r.unitPrice === 77777)).toBe(false)
    expect(pv.groups.flatMap((g) => g.rows).every((r) => r.approvalRef)).toBe(true)

    const pdf = tariffPdf(nv, '19/10/2026', 'Lena Berg')
    const s = assertValidPdf(pdf)
    expect(s).toContain('Nordvik Energy')
    const mail = tariffEmail(nv, { name: 'Lena Berg', email: 'lena@nordvik.example' })
    expect(mail.subject).toMatch(/^Tarifario Relocare · Nordvik Energy · vigente al 19\/10\/2026$/)
    expect(mail.body).toMatch(/^Hola Lena,/)
  })

  it('registers the sending with a snapshot that later price changes do not alter', () => {
    const ctx = testContext()
    let ds = seed()
    const input = { subject: 'Tarifario', body: 'Adjunto', sentAt: '2026-10-19', reference: 'Email 19/10' }
    const r = registerTariffSent(ds, 'cli_nordvik', input, 't1', ctx)
    const snap = r.ds.communications[0].tariffSnapshot!
    expect(snap.find((x) => x.priceEntryId === 'tar_nv_hou1')?.unitPrice).toBe(1600)
    ds = updatePriceEntry(r.ds, 'tar_nv_hou1', { ...r.ds.priceEntries.find((x) => x.id === 'tar_nv_hou1')!, unitPrice: 1900 }, ctx)
    expect(ds.communications[0].tariffSnapshot).toEqual(snap)
    expect(registerTariffSent(ds, 'cli_nordvik', input, 't1', ctx).duplicate).toBe(true)
    expect(fieldsOf(() => registerTariffSent(ds, 'cli_nordvik', { ...input, subject: '' }, 't2', ctx))).toHaveProperty('subject')
  })
})

describe('compatibility', () => {
  it('v11 data migrates to v12 with an empty communications history', () => {
    const { communications, ...v11 } = { ...seed(), schemaVersion: 11 }
    expect(communications).toEqual([])
    const out = migrateDataset(v11, 11, 12) as Dataset
    expect(out).toMatchObject({ schemaVersion: 12, communications: [] })
    expect(out.quotations).toEqual(v11.quotations)
  })
})
