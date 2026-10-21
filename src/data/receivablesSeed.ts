import type { DomainContext } from '@/domain/context'
import type { Dataset } from '@/domain/dataset'
import { confirmInvoiceEmission } from '@/domain/finance/emission'
import { createInvoiceDraft, suggestInvoiceLines } from '@/domain/finance/invoices'
import { recordReceipt } from '@/domain/finance/receipts'

/*
 * Phase 4.7 demo data (fictional): payment terms on the demo open POs and one
 * invoice issued externally, collected with withholdings and fully reconciled.
 */

const TERMS: Record<string, { days: number; dayType: 'calendar' | 'business' }> = {
  oca_pv_nqn: { days: 45, dayType: 'calendar' },
  oca_pv_chu: { days: 30, dayType: 'business' },
}

export function withReceivablesSeed(ds: Dataset): Dataset {
  let next: Dataset = {
    ...ds,
    attachments: ds.attachments ?? [],
    openOrders: ds.openOrders.map((o) => (TERMS[o.id] && !o.paymentTerms ? { ...o, paymentTerms: TERMS[o.id] } : o)),
  }
  const project = next.projects.filter((p) => p.openOrderId === 'oca_pv_nqn').sort((a, b) => a.code.localeCompare(b.code))[0]
  if (!project || next.invoices.some((i) => i.projectId === project.id) || !next.legalEntities.some((e) => e.id === 'le_relocare')) return next
  if (!next.certificates.some((c) => c.projectId === project.id && c.status === 'approved')) return next
  let n = 0
  const clock = { day: '2026-10-05' }
  const ctx: DomainContext = { actorId: 'stf_01', now: () => `${clock.day}T11:00:00`, today: () => clock.day, newId: (p) => `${p}_p47_${++n}` }
  try {
    const lines = suggestInvoiceLines(next, project.id, project.currency, clock.day)
    if (!lines.length) return next
    const draft = createInvoiceDraft(
      next,
      { projectId: project.id, issuerId: 'le_relocare', kind: 'A', issueDate: clock.day, dueDate: clock.day, currency: project.currency, lines, taxes: [], notes: 'Datos de demostración.', externalRef: '' },
      'seed-p47-inv',
      ctx,
    )
    const total = lines.reduce((s, l) => s + Math.round(l.unitPrice * l.quantity * 100), 0) / 100
    next = confirmInvoiceEmission(draft.ds, draft.invoiceId, { voucherType: 'A', pointOfSale: '3', number: '125', issueDate: clock.day, total, currency: project.currency, notes: 'Comprobante ficticio de demostración.' }, ctx)
    clock.day = '2026-10-15'
    const iva = 120000
    const gan = 100000
    const iibb = 70000
    next = recordReceipt(
      next,
      {
        clientId: project.clientId,
        date: clock.day,
        currency: project.currency,
        amount: total - iva - gan - iibb,
        method: 'transfer',
        reference: 'TRF-DEMO-4471',
        notes: 'Demo: detalle de retenciones recibido por email.',
        allocations: [{ invoiceId: draft.invoiceId, amount: total - iva - gan - iibb }],
        withholdings: [
          { type: 'iva', invoiceId: draft.invoiceId, amount: iva, certificateRef: 'RET-IVA-DEMO-01' },
          { type: 'ganancias', invoiceId: draft.invoiceId, amount: gan, certificateRef: 'RET-GAN-DEMO-01' },
          { type: 'iibb', invoiceId: draft.invoiceId, amount: iibb, jurisdiction: 'Neuquén', certificateRef: 'RET-IIBB-DEMO-01' },
        ],
      },
      'seed-p47-rec',
      ctx,
    ).ds
  } catch {
    // Demo data is optional: if the user's data differs, nothing is added.
  }
  return next
}
