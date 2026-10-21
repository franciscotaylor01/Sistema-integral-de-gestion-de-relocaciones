import type { CurrencyCode, Invoice, InvoiceFiscal, InvoiceKind, PaymentTerms } from '@/types/domain'
import { findById, replaceById } from '../collections'
import { businessStamp, type DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from './audit'
import { financeIndex, invoiceTotals } from './derive'
import { issueInvoice } from './invoices'
import { addMoney, cmpMoney, isMoney } from './money'
import { computeDueDate, resolvePaymentTerms, validTerms } from './terms'

/*
 * External fiscal emission (Phase 4.7). SIGR prepares the invoice; Eugenia
 * issues it in the external system (ARCA) and then confirms it here. Fiscal
 * amounts are entered as printed on the document — never computed.
 */

const KINDS: InvoiceKind[] = ['A', 'B', 'E', 'foreign']

export interface EmissionInput {
  voucherType: InvoiceKind
  pointOfSale: string
  number: string
  issueDate: string
  total: number
  currency: CurrencyCode | ''
  notes?: string
  reference?: string
  /** Only when neither the PO nor the client define a payment condition. */
  manualTerms?: PaymentTerms & { reason: string }
}

export const fiscalKey = (issuerId: string, f: Pick<InvoiceFiscal, 'voucherType' | 'pointOfSale' | 'number'>) => `${issuerId}|${f.voucherType}|${f.pointOfSale}|${f.number}`
export const formatFiscalNumber = (f: Pick<InvoiceFiscal, 'pointOfSale' | 'number'>) => `${f.pointOfSale}-${f.number}`

export function pushHistory(inv: Invoice, action: string, ctx: DomainContext, detail?: string): Invoice {
  return { ...inv, history: [{ id: ctx.newId('ivh'), date: businessStamp(ctx), actorId: ctx.actorId, action, detail }, ...(inv.history ?? [])] }
}

const normPos = (s: string) => s.trim().padStart(5, '0')
const normNum = (s: string) => s.trim().padStart(8, '0')

function validateFiscal(ds: Dataset, inv: Invoice, input: EmissionInput, today: string): Record<string, string> {
  const f: Record<string, string> = {}
  if (!KINDS.includes(input.voucherType)) f.voucherType = 'Elegí el tipo de comprobante.'
  if (!/^\d{1,5}$/.test(input.pointOfSale.trim())) f.pointOfSale = 'Punto de venta numérico (hasta 5 dígitos).'
  if (!/^\d{1,8}$/.test(input.number.trim())) f.number = 'Número numérico (hasta 8 dígitos).'
  if (!isIsoDate(input.issueDate)) f.issueDate = 'Fecha inválida.'
  else if (input.issueDate > today) f.issueDate = 'La emisión no puede ser futura.'
  if (!isMoney(input.total) || input.total <= 0) f.total = 'Importe total del comprobante mayor a 0 (hasta 2 decimales).'
  if (input.currency !== inv.currency) f.currency = `La factura está en ${inv.currency}: no se registran comprobantes en otra moneda sin conversión explícita.`
  if ((input.notes?.length ?? 0) > 1000) f.notes = 'Máximo 1000 caracteres.'
  if (!f.pointOfSale && !f.number && !f.voucherType) {
    const key = fiscalKey(inv.issuerId, { voucherType: input.voucherType, pointOfSale: normPos(input.pointOfSale), number: normNum(input.number) })
    const dup = ds.invoices.find((x) => x.id !== inv.id && x.lifecycle !== 'cancelled' && x.fiscal && fiscalKey(x.issuerId, x.fiscal) === key)
    if (dup) f.number = `Ese comprobante ya está registrado en ${dup.number} (mismo emisor, tipo y punto de venta).`
  }
  return f
}

function fiscalOf(inv: Invoice, input: EmissionInput, ctx: DomainContext): InvoiceFiscal {
  const t = invoiceTotals(inv)
  return {
    voucherType: input.voucherType,
    pointOfSale: normPos(input.pointOfSale),
    number: normNum(input.number),
    issueDate: input.issueDate,
    total: input.total,
    currency: inv.currency,
    notes: input.notes?.trim() || undefined,
    reference: input.reference?.trim() || undefined,
    confirmedAt: businessStamp(ctx),
    linesSnapshot: inv.lines.map((l) => ({ ...l })),
    commercialSubtotal: t.subtotal,
    commercialTotal: t.total,
  }
}

/** Marks a prepared invoice as issued, only after explicit confirmation of the external emission. */
export function confirmInvoiceEmission(ds: Dataset, invoiceId: string, input: EmissionInput, ctx: DomainContext): Dataset {
  const inv = findById(ds.invoices, invoiceId)
  if (!inv) throw new DomainError('La factura no existe.')
  if (inv.lifecycle !== 'draft') throw new DomainError('Solo se confirma la emisión de una factura preparada.')
  const f = validateFiscal(ds, inv, input, ctx.today())
  const resolved = resolvePaymentTerms(ds, inv)
  let terms = resolved
  if (!resolved) {
    const m = input.manualTerms
    if (!m || !validTerms(m)) f.terms = 'No hay condición de pago en la OC ni en el cliente: indicá plazo y tipo de días.'
    else if (!m.reason.trim()) f.termsReason = 'Documentá el origen de la condición manual.'
    else terms = { days: m.days, dayType: m.dayType, source: 'manual', reason: m.reason.trim() }
  }
  if (Object.keys(f).length) throw new DomainError('Revisá los datos de la emisión.', f)
  // Commercial rules (certificate, PO, double billing) are revalidated by the existing issue step.
  let next = issueInvoice(ds, invoiceId, undefined, ctx)
  const fiscal = fiscalOf(inv, input, ctx)
  const due = computeDueDate(fiscal.issueDate, terms!)
  next = {
    ...next,
    invoices: replaceById(next.invoices, invoiceId, (x) =>
      pushHistory(
        { ...x, issueDate: fiscal.issueDate, dueDate: due, externalRef: formatFiscalNumber(fiscal), fiscal, paymentTerms: { ...terms!, computedDueDate: due } },
        'Emisión externa confirmada',
        ctx,
        `${fiscal.voucherType} ${formatFiscalNumber(fiscal)} · ${fiscal.currency} ${fiscal.total} · vence ${due}`,
      ),
    ),
  }
  return appendAudit(next, { entity: 'invoice', entityId: invoiceId, action: 'confirm-emission', detail: `${formatFiscalNumber(fiscal)} ${fiscal.currency} ${fiscal.total}`, projectId: inv.projectId }, ctx)
}

const applied = (ds: Dataset, id: string) => {
  const idx = financeIndex(ds)
  return addMoney(idx.paidByInvoice.get(id) ?? 0, idx.withheldByInvoice.get(id) ?? 0)
}

/**
 * Historical invoices issued before Phase 4.7 have no fiscal data. They are not
 * reinterpreted: their fiscal data can be completed explicitly; due dates stay.
 */
export function recordFiscalData(ds: Dataset, invoiceId: string, input: EmissionInput, ctx: DomainContext): Dataset {
  const inv = findById(ds.invoices, invoiceId)
  if (!inv) throw new DomainError('La factura no existe.')
  if (inv.lifecycle !== 'issued' || inv.fiscal) throw new DomainError('Solo para facturas emitidas sin datos fiscales registrados.')
  const f = validateFiscal(ds, inv, input, ctx.today())
  if (!f.total && cmpMoney(input.total, applied(ds, invoiceId)) < 0) f.total = 'No puede ser menor a lo ya cobrado y retenido.'
  if (Object.keys(f).length) throw new DomainError('Revisá los datos fiscales.', f)
  const fiscal = fiscalOf(inv, input, ctx)
  const next = { ...ds, invoices: replaceById(ds.invoices, invoiceId, (x) => pushHistory({ ...x, fiscal, externalRef: formatFiscalNumber(fiscal) }, 'Datos fiscales registrados (factura histórica)', ctx, `${formatFiscalNumber(fiscal)} · ${fiscal.currency} ${fiscal.total}`)) }
  return appendAudit(next, { entity: 'invoice', entityId: invoiceId, action: 'record-fiscal', detail: formatFiscalNumber(fiscal), projectId: inv.projectId }, ctx)
}

/** Explicit, justified correction of fiscal data; previous values stay in the history. */
export function correctFiscalData(ds: Dataset, invoiceId: string, input: EmissionInput, reason: string, ctx: DomainContext): Dataset {
  const inv = findById(ds.invoices, invoiceId)
  if (!inv?.fiscal || inv.lifecycle !== 'issued') throw new DomainError('Solo se corrigen facturas emitidas con datos fiscales.')
  const f = validateFiscal(ds, inv, input, ctx.today())
  if (!f.total && cmpMoney(input.total, applied(ds, invoiceId)) < 0) f.total = 'No puede ser menor a lo ya cobrado y retenido.'
  if (!reason.trim()) f.reason = 'Indicá el motivo de la corrección.'
  if (Object.keys(f).length) throw new DomainError('Revisá la corrección.', f)
  const before = inv.fiscal
  const fiscal: InvoiceFiscal = { ...before, voucherType: input.voucherType, pointOfSale: normPos(input.pointOfSale), number: normNum(input.number), issueDate: input.issueDate, total: input.total, notes: input.notes?.trim() || undefined, reference: input.reference?.trim() || undefined }
  let terms = inv.paymentTerms
  let dueDate = inv.dueDate
  if (terms && fiscal.issueDate !== before.issueDate) {
    const computed = computeDueDate(fiscal.issueDate, terms)
    terms = { ...terms, computedDueDate: computed }
    if (!terms.exception) dueDate = computed
  }
  const detail = `${before.voucherType} ${formatFiscalNumber(before)} ${before.issueDate} ${before.currency} ${before.total} → ${fiscal.voucherType} ${formatFiscalNumber(fiscal)} ${fiscal.issueDate} ${fiscal.currency} ${fiscal.total}. Motivo: ${reason.trim()}`
  const next = { ...ds, invoices: replaceById(ds.invoices, invoiceId, (x) => pushHistory({ ...x, fiscal, paymentTerms: terms, dueDate, issueDate: fiscal.issueDate, externalRef: formatFiscalNumber(fiscal) }, 'Datos fiscales corregidos', ctx, detail)) }
  return appendAudit(next, { entity: 'invoice', entityId: invoiceId, action: 'correct-fiscal', detail, projectId: inv.projectId }, ctx)
}

/** Justified due-date exception. The PO and the original computed date are kept unchanged. */
export function changeInvoiceDueDate(ds: Dataset, invoiceId: string, dueDate: string, reason: string, ctx: DomainContext): Dataset {
  const inv = findById(ds.invoices, invoiceId)
  if (!inv || inv.lifecycle !== 'issued') throw new DomainError('Solo se modifica el vencimiento de una factura emitida.')
  const f: Record<string, string> = {}
  if (!isIsoDate(dueDate)) f.dueDate = 'Fecha inválida.'
  else if (dueDate < inv.issueDate) f.dueDate = 'No puede ser anterior a la emisión.'
  if (!reason.trim()) f.reason = 'Documentá el motivo de la excepción.'
  if (Object.keys(f).length) throw new DomainError('Revisá el vencimiento.', f)
  const terms = inv.paymentTerms ?? { days: 0, dayType: 'calendar' as const, source: 'manual' as const, computedDueDate: inv.dueDate }
  const next = {
    ...ds,
    invoices: replaceById(ds.invoices, invoiceId, (x) => pushHistory({ ...x, dueDate, paymentTerms: { ...terms, exception: { dueDate, reason: reason.trim(), date: ctx.today() } } }, 'Vencimiento modificado por excepción', ctx, `${inv.dueDate} → ${dueDate}. Motivo: ${reason.trim()}`)),
  }
  return appendAudit(next, { entity: 'invoice', entityId: invoiceId, action: 'due-exception', detail: `${inv.dueDate} → ${dueDate}: ${reason.trim()}`, projectId: inv.projectId }, ctx)
}

/** Terms that would apply if the invoice were confirmed now (for the preparation view). */
export function previewTerms(ds: Dataset, inv: Invoice) {
  return resolvePaymentTerms(ds, inv)
}

