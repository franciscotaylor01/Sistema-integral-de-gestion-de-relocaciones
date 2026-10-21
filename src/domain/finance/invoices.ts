import { getServiceType } from '@/config/serviceCatalog'
import type { CurrencyCode, Invoice, InvoiceKind, InvoiceLine, TaxComponent } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import { projectCommercial } from '../commercial/traceability'
import { effectivePolicy } from '../commercial/catalog'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from './audit'
import { financeIndex, invoiceTotals, lineSubtotal } from './derive'
import { addMoney, cmpMoney, isMoney, isQuantity, subMoney } from './money'
import { nextNumber } from './numbering'

/** Net amount already invoiced per service and currency (drafts included, cancelled excluded). */
export function billedByService(ds: Pick<Dataset, 'invoices'>, projectId: string, excludeInvoiceId?: string): Map<string, Partial<Record<CurrencyCode, number>>> {
  const map = new Map<string, Partial<Record<CurrencyCode, number>>>()
  for (const inv of ds.invoices) {
    if (inv.projectId !== projectId || inv.lifecycle === 'cancelled' || inv.id === excludeInvoiceId) continue
    for (const l of inv.lines) {
      if (!l.serviceId || l.reimbursable) continue
      const cur = map.get(l.serviceId) ?? {}
      cur[inv.currency] = addMoney(cur[inv.currency] ?? 0, lineSubtotal(l))
      map.set(l.serviceId, cur)
    }
  }
  return map
}

export interface Billable {
  serviceId: string
  eligible: boolean
  /** Reasons the service cannot be invoiced yet (policy, approval, PO, milestone). */
  missing: string[]
  eligibleAmount: Partial<Record<CurrencyCode, number>>
  billed: Partial<Record<CurrencyCode, number>>
  remaining: Partial<Record<CurrencyCode, number>>
  quotationId?: string
  purchaseOrderId?: string
}

/**
 * What can still be invoiced per service: the amount the client policy makes
 * eligible (approval, PO, billing milestone) minus what is already invoiced.
 * This is what prevents billing the same amount twice.
 */
export function billableByService(ds: Dataset, projectId: string, today: string, excludeInvoiceId?: string): Map<string, Billable> {
  const project = findById(ds.projects, projectId)
  const out = new Map<string, Billable>()
  if (!project) return out
  const commercial = projectCommercial(ds, project, today)
  const billed = billedByService(ds, projectId, excludeInvoiceId)
  for (const [serviceId, c] of commercial) {
    const b = billed.get(serviceId) ?? {}
    const remaining: Partial<Record<CurrencyCode, number>> = {}
    if (c.eligibility.eligible) {
      for (const [cur, v] of Object.entries(c.eligibility.amount) as [CurrencyCode, number][]) {
        const r = subMoney(v, b[cur] ?? 0)
        if (cmpMoney(r, 0) > 0) remaining[cur] = r
      }
    }
    const approvedQuote = [...c.quotations].reverse().find((q) => ds.quotations.find((x) => x.id === q.id)?.status === 'approved' && !ds.quotations.find((x) => x.id === q.id)?.supersededById)
    out.set(serviceId, {
      serviceId,
      eligible: c.eligibility.eligible,
      missing: c.eligibility.missing,
      eligibleAmount: c.eligibility.amount,
      billed: b,
      remaining,
      quotationId: approvedQuote?.id,
      purchaseOrderId: c.purchaseOrders[0]?.id,
    })
  }
  return out
}

export interface InvoiceLineInput {
  id?: string
  serviceId?: string
  quotationId?: string
  purchaseOrderId?: string
  description: string
  quantity: number
  unitPrice: number
  reimbursable?: boolean
  serviceItemId?: string
  openOrderId?: string
  certificateId?: string
}

const qty = (n: number) => Math.round(n * 1000) / 1000
const unitKey = (l: { certificateId?: string; serviceId?: string; serviceItemId?: string }) => `${l.certificateId ?? ''}|${l.serviceId ?? ''}|${l.serviceItemId ?? ''}`

/** Quantities already invoiced per (certificate, service, item) — drafts included, cancelled excluded. */
export function billedQuantities(ds: Pick<Dataset, 'invoices'>, projectId: string, excludeInvoiceId?: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const inv of ds.invoices) {
    if (inv.projectId !== projectId || inv.lifecycle === 'cancelled' || inv.id === excludeInvoiceId) continue
    for (const l of inv.lines) if (l.serviceId && !l.reimbursable) out.set(unitKey(l), qty((out.get(unitKey(l)) ?? 0) + l.quantity))
  }
  return out
}

export interface TaxInput {
  id?: string
  label: string
  ratePct: number
}

export interface InvoiceInput {
  projectId: string
  issuerId: string
  kind: InvoiceKind
  issueDate: string
  dueDate: string
  currency: CurrencyCode | ''
  lines: InvoiceLineInput[]
  taxes: TaxInput[]
  externalRef?: string
  notes?: string
}

export function validateInvoice(ds: Dataset, input: InvoiceInput, today: string, invoiceId?: string): Record<string, string> {
  const f: Record<string, string> = {}
  const project = findById(ds.projects, input.projectId)
  if (!project) return { projectId: 'El proyecto no existe.' }
  const client = findById(ds.clients, project.clientId)
  const policy = effectivePolicy(client, project)
  const billedQty = billedQuantities(ds, project.id, invoiceId)
  const thisQty = new Map<string, number>()
  if (!ds.legalEntities.some((e) => e.id === input.issuerId)) f.issuerId = 'Elegí la entidad emisora.'
  if (!isIsoDate(input.issueDate)) f.issueDate = 'Fecha inválida.'
  if (!isIsoDate(input.dueDate)) f.dueDate = 'Fecha inválida.'
  if (isIsoDate(input.issueDate) && isIsoDate(input.dueDate) && input.dueDate < input.issueDate) f.dueDate = 'El vencimiento no puede ser anterior a la emisión.'
  if (!input.currency) f.currency = 'Elegí la moneda.'
  if (input.lines.length === 0) f.lines = 'La factura necesita al menos una línea.'
  if ((input.externalRef?.length ?? 0) > 40) f.externalRef = 'Máximo 40 caracteres.'
  if ((input.notes?.length ?? 0) > 2000) f.notes = 'Máximo 2000 caracteres.'

  const billable = billableByService(ds, project.id, today, invoiceId)
  const perService = new Map<string, number>()
  input.lines.forEach((l, i) => {
    const k = (x: string) => `lines.${i}.${x}`
    if (!l.description.trim()) f[k('description')] = 'Ingresá una descripción.'
    if (!isQuantity(l.quantity)) f[k('quantity')] = 'Cantidad mayor a cero (hasta 3 decimales).'
    if (!isMoney(l.unitPrice) || l.unitPrice <= 0) f[k('unitPrice')] = 'Precio mayor a cero (hasta 2 decimales).'
    if (!l.serviceId) {
      if (!l.reimbursable) f[k('serviceId')] = 'Elegí el servicio facturado o marcá la línea como reintegro de gastos.'
      return
    }
    const service = findById(ds.services, l.serviceId)
    if (!service || service.projectId !== project.id) {
      f[k('serviceId')] = 'El servicio no pertenece al proyecto.'
      return
    }
    if (l.quotationId) {
      const q = findById(ds.quotations, l.quotationId)
      if (!q || q.projectId !== project.id || q.status !== 'approved' || !q.lines.some((x) => x.serviceId === l.serviceId)) f[k('quotationId')] = 'Elegí una cotización aprobada que incluya el servicio.'
    }
    if (policy.poMode === 'open' && !l.reimbursable) {
      if (!project.openOrderId || l.openOrderId !== project.openOrderId) f[k('purchaseOrderId')] = 'Indicá la OC abierta del proyecto.'
    } else if (l.purchaseOrderId) {
      const po = findById(ds.purchaseOrders, l.purchaseOrderId)
      if (!po || po.projectId !== project.id || po.status !== 'active' || !po.allocations.some((a) => a.serviceId === l.serviceId)) f[k('purchaseOrderId')] = 'Elegí una OC vigente que autorice el servicio.'
    } else if (policy.poMode === 'project' && !l.reimbursable) {
      f[k('purchaseOrderId')] = 'Este cliente exige OC: indicá la OC que autoriza el servicio.'
    }
    // Phase 4.6: sub-service breakdown, certificate and quantity controls (no double billing).
    if (!l.reimbursable && isQuantity(l.quantity)) {
      const item = l.serviceItemId ? service.items?.find((i) => i.id === l.serviceItemId) : undefined
      if (l.serviceItemId && !item) f[k('serviceId')] = 'El subservicio no pertenece al servicio.'
      if (item && isMoney(l.unitPrice) && cmpMoney(l.unitPrice, item.unitPrice) !== 0) f[k('unitPrice')] = `Precio contratado de ${item.name}: ${item.unitPrice}.`
      let allowed: number | undefined = item?.quantity
      if (policy.requiresCertificate) {
        const cert = l.certificateId ? findById(ds.certificates, l.certificateId) : undefined
        const cl = cert?.lines.find((x) => x.serviceId === l.serviceId && (x.serviceItemId ?? '') === (l.serviceItemId ?? ''))
        if (!cert || cert.projectId !== project.id || cert.status !== 'approved' || !cl) {
          f[k('certificateId')] = 'Este cliente exige certificado aprobado: indicá el certificado que incluye el ítem.'
          allowed = undefined
        } else allowed = cl.quantity
      }
      const key = unitKey(l)
      thisQty.set(key, qty((thisQty.get(key) ?? 0) + l.quantity))
      if (allowed !== undefined && !f[k('certificateId')]) {
        const left = qty(allowed - (billedQty.get(key) ?? 0))
        if (thisQty.get(key)! > left) f[k('quantity')] = `Supera la cantidad ${policy.requiresCertificate ? 'certificada' : 'contratada'} pendiente de facturar (${Math.max(0, left)}).`
      }
    }
    if (l.reimbursable || !isMoney(l.unitPrice) || !isQuantity(l.quantity)) return
    perService.set(l.serviceId, addMoney(perService.get(l.serviceId) ?? 0, lineSubtotal(l)))
    const b = billable.get(l.serviceId)
    const label = getServiceType(service.typeId).label
    if (b && !b.eligible) f[k('unitPrice')] = `${label} todavía no es facturable: ${b.missing.join(' · ')}.`
    else if (input.currency) {
      const remaining = b?.remaining[input.currency] ?? 0
      if (cmpMoney(perService.get(l.serviceId)!, remaining) > 0) {
        f[k('unitPrice')] = `Supera lo facturable de ${label}: disponible ${input.currency} ${remaining} (evita facturar dos veces el mismo monto).`
      }
    }
  })
  input.taxes.forEach((t, i) => {
    if (!t.label.trim()) f[`taxes.${i}.label`] = 'Indicá el concepto.'
    if (typeof t.ratePct !== 'number' || !Number.isFinite(t.ratePct) || t.ratePct < 0 || t.ratePct > 100) f[`taxes.${i}.ratePct`] = 'Alícuota entre 0 y 100.'
  })
  return f
}

function buildLines(lines: InvoiceLineInput[], ctx: DomainContext): InvoiceLine[] {
  return lines.map((l) => ({
    id: l.id ?? ctx.newId('il'),
    serviceId: l.serviceId || undefined,
    quotationId: l.quotationId || undefined,
    purchaseOrderId: l.purchaseOrderId || undefined,
    description: l.description.trim(),
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    reimbursable: l.reimbursable || undefined,
    serviceItemId: l.serviceItemId || undefined,
    openOrderId: l.openOrderId || undefined,
    certificateId: l.certificateId || undefined,
  }))
}

const buildTaxes = (taxes: TaxInput[], ctx: DomainContext): TaxComponent[] => taxes.map((t) => ({ id: t.id ?? ctx.newId('tax'), label: t.label.trim(), ratePct: t.ratePct }))

export function createInvoiceDraft(ds: Dataset, input: InvoiceInput, requestId: string, ctx: DomainContext): { ds: Dataset; invoiceId: string; duplicate: boolean } {
  const existing = ds.requests[requestId]
  if (existing && ds.invoices.some((i) => i.id === existing)) return { ds, invoiceId: existing, duplicate: true }
  const fields = validateInvoice(ds, input, ctx.today())
  if (Object.keys(fields).length) throw new DomainError('Revisá la factura.', fields)
  const project = findById(ds.projects, input.projectId)!
  const invoice: Invoice = {
    id: ctx.newId('inv'),
    number: nextNumber(ds.invoices.map((i) => i.number), 'FC', ctx.today()),
    externalRef: input.externalRef?.trim() || undefined,
    issuerId: input.issuerId,
    kind: input.kind,
    clientId: project.clientId,
    projectId: project.id,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: input.currency as CurrencyCode,
    lines: buildLines(input.lines, ctx),
    taxes: buildTaxes(input.taxes, ctx),
    lifecycle: 'draft',
    notes: input.notes?.trim() || undefined,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
  let next: Dataset = { ...ds, invoices: [...ds.invoices, invoice], requests: { ...ds.requests, [requestId]: invoice.id } }
  next = appendAudit(next, { entity: 'invoice', entityId: invoice.id, action: 'create', detail: `Borrador ${invoice.number} por ${invoice.currency} ${invoiceTotals(invoice).total}`, projectId: project.id }, ctx)
  return { ds: next, invoiceId: invoice.id, duplicate: false }
}

export function updateInvoiceDraft(ds: Dataset, invoiceId: string, input: InvoiceInput, ctx: DomainContext): Dataset {
  const inv = findById(ds.invoices, invoiceId)
  if (!inv) throw new DomainError('La factura no existe.')
  if (inv.lifecycle !== 'draft') throw new DomainError('Solo se editan borradores. Las facturas emitidas se corrigen anulándolas.')
  if (input.projectId !== inv.projectId) throw new DomainError('No se puede mover la factura a otro proyecto.')
  const fields = validateInvoice(ds, input, ctx.today(), invoiceId)
  if (Object.keys(fields).length) throw new DomainError('Revisá la factura.', fields)
  const next: Dataset = {
    ...ds,
    invoices: replaceById(ds.invoices, invoiceId, (x) => ({
      ...x,
      issuerId: input.issuerId,
      kind: input.kind,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      currency: input.currency as CurrencyCode,
      lines: buildLines(input.lines, ctx),
      taxes: buildTaxes(input.taxes, ctx),
      externalRef: input.externalRef?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
    })),
  }
  return appendAudit(next, { entity: 'invoice', entityId: invoiceId, action: 'update', detail: 'Borrador actualizado', projectId: inv.projectId }, ctx)
}

/**
 * Confirms a demo invoice / records an externally issued one. It does NOT
 * authorise a fiscal document (no ARCA, no CAE). Caps are re-checked here.
 */
export function issueInvoice(ds: Dataset, invoiceId: string, externalRef: string | undefined, ctx: DomainContext): Dataset {
  const inv = findById(ds.invoices, invoiceId)
  if (!inv) throw new DomainError('La factura no existe.')
  if (inv.lifecycle !== 'draft') throw new DomainError('Solo se emiten borradores.')
  const fields = validateInvoice(ds, { ...inv, externalRef: externalRef ?? inv.externalRef }, ctx.today(), invoiceId)
  if (Object.keys(fields).length) throw new DomainError(Object.values(fields)[0], fields)
  let next: Dataset = {
    ...ds,
    invoices: replaceById(ds.invoices, invoiceId, (x) => ({ ...x, lifecycle: 'issued', issuedAt: ctx.today(), externalRef: externalRef?.trim() || x.externalRef })),
    projects: replaceById(ds.projects, inv.projectId, (p) =>
      ['to-quote', 'quoted', 'po-received'].includes(p.financialStatus) ? { ...p, financialStatus: 'invoiced' } : p,
    ),
  }
  const total = invoiceTotals(inv).total
  next = appendAudit(next, { entity: 'invoice', entityId: invoiceId, action: 'issue', detail: `${inv.number} emitida por ${inv.currency} ${total}`, projectId: inv.projectId }, ctx)
  return logActivity(next, { projectId: inv.projectId, kind: 'finance', message: `Factura ${inv.number} emitida por ${inv.currency} ${total}${externalRef ? ` (comprobante ${externalRef})` : ''}.` }, ctx)
}

/** Cancels a draft or an issued invoice without active receipts; the record is kept. */
export function cancelInvoice(ds: Dataset, invoiceId: string, reason: string, ctx: DomainContext): Dataset {
  const inv = findById(ds.invoices, invoiceId)
  if (!inv) throw new DomainError('La factura no existe.')
  if (inv.lifecycle === 'cancelled') return ds
  if (!reason.trim()) throw new DomainError('Indicá el motivo de la anulación.', { reason: 'Indicá el motivo.' })
  const paid = financeIndex(ds).paidByInvoice.get(invoiceId) ?? 0
  if (cmpMoney(paid, 0) > 0) throw new DomainError('La factura tiene cobros aplicados. Revertí primero esos cobros para poder anularla.')
  let next: Dataset = { ...ds, invoices: replaceById(ds.invoices, invoiceId, (x) => ({ ...x, lifecycle: 'cancelled', cancelledAt: ctx.today(), cancelReason: reason.trim() })) }
  next = appendAudit(next, { entity: 'invoice', entityId: invoiceId, action: 'cancel', detail: reason.trim(), projectId: inv.projectId }, ctx)
  return logActivity(next, { projectId: inv.projectId, kind: 'finance', message: `Factura ${inv.number} anulada: ${reason.trim()}` }, ctx)
}

/**
 * Proposed lines: every eligible service with an amount still to invoice,
 * broken down by contracted sub-service (and by approved certificate when the
 * client requires certification).
 */
export function suggestInvoiceLines(ds: Dataset, projectId: string, currency: CurrencyCode, today: string): InvoiceLineInput[] {
  const project = findById(ds.projects, projectId)
  if (!project) return []
  const policy = effectivePolicy(findById(ds.clients, project.clientId), project)
  const billable = billableByService(ds, projectId, today)
  const billedQty = billedQuantities(ds, projectId)
  const openOrderId = policy.poMode === 'open' ? project.openOrderId : undefined
  return ds.services
    .filter((s) => s.projectId === projectId)
    .flatMap((s) => {
      const b = billable.get(s.id)
      let remaining = b?.remaining[currency]
      if (!b || !remaining) return []
      const label = getServiceType(s.typeId).label
      const base = { serviceId: s.id, quotationId: b.quotationId, purchaseOrderId: openOrderId ? undefined : b.purchaseOrderId, openOrderId }
      type Unit = { serviceItemId?: string; certificateId?: string; name?: string; unitPrice: number; quantity: number }
      let units: Unit[]
      if (policy.requiresCertificate) {
        units = ds.certificates
          .filter((c) => c.projectId === projectId && c.status === 'approved' && c.currency === currency)
          .flatMap((c) => c.lines.filter((l) => l.serviceId === s.id).map((l) => ({ serviceItemId: l.serviceItemId, certificateId: c.id, name: s.items?.find((i) => i.id === l.serviceItemId)?.name, unitPrice: l.unitPrice, quantity: l.quantity })))
      } else if (s.items?.length) {
        units = s.items.map((i) => ({ serviceItemId: i.id, name: i.name, unitPrice: i.unitPrice, quantity: i.quantity }))
      } else {
        return [{ ...base, description: `${label} — ${project.code}`, quantity: 1, unitPrice: remaining }]
      }
      const out: InvoiceLineInput[] = []
      for (const u of units) {
        const left = qty(u.quantity - (billedQty.get(unitKey(u.certificateId ? { ...u, serviceId: s.id } : { serviceId: s.id, serviceItemId: u.serviceItemId })) ?? 0))
        const fit = Math.min(left, Math.floor((remaining / u.unitPrice) * 1000) / 1000)
        if (fit <= 0) continue
        out.push({ ...base, serviceItemId: u.serviceItemId, certificateId: u.certificateId, description: u.name ? `${label} — ${u.name}` : `${label} — ${project.code}`, quantity: fit, unitPrice: u.unitPrice })
        remaining = subMoney(remaining, lineSubtotal({ unitPrice: u.unitPrice, quantity: fit }))
      }
      return out
    })
}
