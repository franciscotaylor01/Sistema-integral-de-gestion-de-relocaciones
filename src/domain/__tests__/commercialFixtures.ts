import type { Dataset } from '@/domain/dataset'
import { confirmPoImport } from '@/domain/commercial/poImport'
import { approveQuotation, createQuotationFromProject, sendQuotation, updateQuotationDraft } from '@/domain/commercial/quotations'
import { addSpecialItem } from '@/domain/commercial/specialItems'
import { createProject } from '@/domain/projects'
import type { CurrencyCode, PoImportField, PoImportLine, ServiceRecord } from '@/types/domain'
import { projectInput, seed, testContext } from './helpers'

/* Shared fixtures for Phase 5.0C tests (PO import, comparison, invoicing). */

/**
 * Nordvik project (OC por proyecto): housing quoted at USD 4.500 (+ special 2 × 300 when `special`),
 * schooling quoted from the tariff at USD 2.400. Services are started so billing milestones are met.
 */
export function setup({ special = true, specialAfterQuote = false } = {}) {
  const ctx = testContext()
  const r = createProject(
    seed(),
    projectInput({
      startDate: '2026-10-01',
      services: [
        { typeId: 'housing', ownerId: 'stf_04', startDate: '2026-10-01', dueDate: '2026-12-20', startNow: true },
        { typeId: 'schooling', ownerId: 'stf_04', startDate: '2026-10-01', dueDate: '2027-02-01', startNow: true },
      ],
    }),
    'cmp-p',
    ctx,
  )
  let ds = r.ds
  const svc = (t: string) => ds.services.find((s) => s.projectId === r.projectId && s.typeId === t)!
  const housing = svc('housing')
  const schooling = svc('schooling')
  const addVisits = () => (ds = addSpecialItem(ds, housing.id, { name: 'Visitas extra fin de semana', quantity: 2, unit: 'session', unitPrice: 300, currency: 'USD', reason: 'Pedido del beneficiario' }, ctx).ds)
  if (special && !specialAfterQuote) addVisits()
  const q = createQuotationFromProject(ds, r.projectId, ctx)
  ds = updateQuotationDraft(q.ds, q.quotation.id, { issueDate: q.quotation.issueDate, validUntil: q.quotation.validUntil, lines: q.quotation.lines.map((l) => (l.unitPrice ? l : { ...l, unitPrice: 2000 })) }, ctx)
  ds = approveQuotation(sendQuotation(ds, q.quotation.id, ctx), q.quotation.id, { approvedBy: 'Lena Berg', approvedAt: '2026-10-19' }, ctx)
  if (specialAfterQuote) addVisits()
  const visits = ds.services.find((s) => s.id === housing.id)!.items?.find((i) => i.special)
  return { ctx, ds, projectId: r.projectId, housing, schooling, visitsId: visits?.id, quotation: ds.quotations.find((x) => x.id === q.quotation.id)! }
}

export interface L {
  service: ServiceRecord
  serviceItemId?: string
  qty: number
  price: number
  status?: PoImportLine['status']
}

/** Imports a PO with already-confirmed lines (as Eugenia leaves them after the 5.0C.1 review). */
export function importPo(ds: Dataset, projectId: string, lines: L[], o: { number?: string; currency?: CurrencyCode; terms?: string; requestId?: string; quotation?: string } = {}) {
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const f = (key: string, value?: string): PoImportField => ({ key, label: key, value, detected: value, status: value ? 'recognized' : 'missing', confirmed: true, edited: false })
  const fields = [f('poNumber', o.number ?? '4500098765'), f('issueDate', '2026-10-15'), f('currency', o.currency ?? 'USD'), f('total', String(total)), f('paymentTerms', o.terms), f('quotationRef', o.quotation)]
  const importLines: PoImportLine[] = lines.map((l, i) => ({ raw: `línea ${i + 1}`, description: `Item ${i + 1}`, quantity: l.qty, unit: l.serviceItemId ? 'session' : 'service', unitPrice: l.price, amount: l.qty * l.price, status: l.status ?? 'recognized', included: true, serviceId: l.service.id, serviceItemId: l.serviceItemId, confirmed: true, source: { section: 'Texto del email', line: i + 1 } }))
  return confirmPoImport(ds, { projectId, mode: 'create', source: { kind: 'text', text: 'OC' }, provider: 'local', fields, lines: importLines, receivedDate: '2026-10-19' }, o.requestId ?? 'imp', testContext())
}

