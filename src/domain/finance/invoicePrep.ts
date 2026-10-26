import { getServiceType } from '@/config/serviceCatalog'
import type { CurrencyCode, Invoice, PriceUnit } from '@/types/domain'
import { findById } from '../collections'
import type { Dataset } from '../dataset'
import { effectivePolicy } from '../commercial/catalog'
import { authorizedUnits, comparePoWithQuotation, isSettled, type UnavailableItem } from '../commercial/poComparison'
import { projectCommercial } from '../commercial/traceability'
import { invoiceTotals, lineSubtotal } from './derive'
import { computeDueDate, resolvePaymentTerms } from './terms'

/*
 * Phase 5.0C.3 — assisted invoice preparation. Organises everything Eugenia
 * copies into the external fiscal system, in the order it is loaded there,
 * with the origin of each datum. Nothing fiscal is computed or invented:
 * data SIGR does not have is flagged "pendiente en el sistema fiscal".
 */

export type PrepStatus = 'ok' | 'missing' | 'fiscal'

export interface PrepField {
  label: string
  value?: string
  /** Where the value comes from ("Ficha fiscal del cliente", "OC 4500… importada y validada"…). */
  source: string
  status: PrepStatus
  note?: string
}

export interface PrepBlock {
  key: 'issuer' | 'receiver' | 'voucher' | 'references' | 'lines' | 'amounts' | 'confirmation'
  title: string
  fields: PrepField[]
}

export interface PrepLine {
  index: number
  description: string
  /** Project-specific scope (quotation line details) when available. */
  details?: string
  quantity: number
  unit?: PriceUnit
  unitPrice: number
  subtotal: number
  currency: CurrencyCode
  /** Commercial origin of the line (OC, certificate, quotation, comparison basis). */
  origins: string[]
}

export interface InvoicePreparation {
  blocks: PrepBlock[]
  lines: PrepLine[]
  /** Concepts of the project that cannot be billed now, with the reason. */
  unavailable: UnavailableItem[]
  /** Fields the user must complete in the external fiscal system. */
  fiscalPending: string[]
  missing: string[]
}

const FISCAL = 'Se completa en el sistema fiscal (ARCA)'
const ok = (label: string, value: string | undefined, source: string, note?: string): PrepField => (value ? { label, value, source, status: 'ok', note } : { label, source, status: 'missing', note: note ?? 'No registrado en SIGR: no se inventa.' })
const fiscal = (label: string, note?: string): PrepField => ({ label, source: FISCAL, status: 'fiscal', note })
const dmy = (iso: string) => iso.split('-').reverse().join('/')

export function invoicePreparation(ds: Dataset, invoiceId: string, today: string): InvoicePreparation {
  const inv = findById(ds.invoices, invoiceId) as Invoice
  const project = findById(ds.projects, inv.projectId)!
  const client = findById(ds.clients, inv.clientId)
  const issuer = findById(ds.legalEntities, inv.issuerId)
  const policy = effectivePolicy(client, project)
  const contact = client?.contacts.find((c) => c.primary) ?? client?.contacts[0]

  // References actually used by the lines (never guessed from the project).
  const poIds = [...new Set(inv.lines.map((l) => l.purchaseOrderId).filter(Boolean))] as string[]
  const pos = poIds.map((id) => findById(ds.purchaseOrders, id)).filter(Boolean)
  const openIds = [...new Set(inv.lines.map((l) => l.openOrderId).filter(Boolean))] as string[]
  const quoteIds = [...new Set([...inv.lines.map((l) => l.quotationId), ...pos.map((p) => p!.quotationId)].filter(Boolean))] as string[]
  const certIds = [...new Set(inv.lines.map((l) => l.certificateId).filter(Boolean))] as string[]
  const importOf = (poId: string) => ds.poImports.filter((i) => i.poId === poId).sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))[0]

  const issuerBlock: PrepBlock = {
    key: 'issuer',
    title: 'Emisor',
    fields: [
      ok('Entidad emisora', issuer?.name, 'Entidad emisora (SIGR)'),
      ok('Identificación fiscal del emisor', issuer?.taxId, 'Entidad emisora (SIGR)', issuer && !issuer.taxId ? 'No cargada en SIGR: verificala en el sistema fiscal.' : undefined),
      fiscal('Punto de venta'),
    ],
  }
  const receiverBlock: PrepBlock = {
    key: 'receiver',
    title: 'Receptor / cliente',
    fields: [
      ok('Razón social', client?.legalName, 'Ficha fiscal del cliente'),
      ok('Identificación fiscal', client?.taxId, 'Ficha fiscal del cliente'),
      ok('Domicilio de facturación', client?.billingAddress, 'Ficha fiscal del cliente'),
      fiscal('Condición frente al IVA', 'SIGR no la registra.'),
      ok('Contacto de facturación', contact ? [contact.name, contact.email].filter(Boolean).join(' · ') : undefined, 'Contactos del cliente'),
    ],
  }

  const terms = resolvePaymentTerms(ds, inv)
  const termsSource = terms ? { 'purchase-order': `OC ${pos[0]?.clientPoNumber ?? ''}`.trim(), 'open-order': 'OC abierta', client: 'Condición del cliente', manual: 'Condición manual' }[terms.source] : 'Sin condición registrada'
  const voucherBlock: PrepBlock = {
    key: 'voucher',
    title: 'Comprobante',
    fields: [
      { label: 'Tipo de comprobante (propuesto)', value: inv.kind === 'foreign' ? 'Invoice (entidad del exterior)' : `Factura ${inv.kind}`, source: 'Borrador SIGR', status: 'ok', note: 'Verificalo según la condición fiscal del cliente.' },
      { label: 'Moneda', value: inv.currency, source: `Proyecto ${project.code}`, status: 'ok' },
      fiscal('Fecha de emisión', 'La define el comprobante; se registra al confirmar.'),
      fiscal('Concepto del comprobante', 'Productos / servicios según el sistema fiscal.'),
      terms
        ? { label: 'Condición de pago', value: `${terms.days} días ${terms.dayType === 'business' ? 'hábiles' : 'corridos'}`, source: termsSource, status: 'ok' }
        : ok('Condición de pago', undefined, 'OC / cliente', 'Sin condición en la OC ni en el cliente: se pedirá al confirmar.'),
      terms ? { label: 'Vencimiento estimado', value: dmy(computeDueDate(today, terms)), source: 'Calculado si se emite hoy', status: 'ok', note: 'Se recalcula con la fecha real de emisión.' } : fiscal('Vencimiento', 'Sin condición de pago.'),
    ],
  }

  const comparison = comparePoWithQuotation(ds, project.id)
  const references: PrepField[] = [ok('Proyecto', `${project.code} · ${findById(ds.people, project.beneficiaryId)?.name ?? ''}`.trim(), 'Proyecto')]
  for (const po of pos) {
    const imp = importOf(po!.id)
    references.push({
      label: 'Orden de compra',
      value: `${po!.clientPoNumber} (${po!.internalNumber})`,
      source: imp ? `Importada de ${imp.source.fileName ?? 'texto de email'} y validada el ${dmy(imp.confirmedAt.slice(0, 10))}` : 'OC registrada manualmente',
      status: 'ok',
    })
  }
  for (const id of openIds) references.push({ label: 'OC abierta', value: findById(ds.openOrders, id)?.number, source: 'OC abierta del cliente', status: 'ok' })
  if (policy.poMode === 'project' && !pos.length && inv.lines.some((l) => l.serviceId && !l.reimbursable)) references.push(ok('Orden de compra', undefined, 'Política del cliente', 'El cliente exige OC y ninguna línea la referencia.'))
  for (const id of quoteIds) {
    const q = findById(ds.quotations, id)
    if (q) references.push({ label: 'Cotización', value: `${q.number} v${q.version}`, source: q.approvedAt ? `Aprobada el ${dmy(q.approvedAt)}` : 'Cotización', status: 'ok' })
  }
  for (const id of certIds) {
    const c = findById(ds.certificates, id)
    if (c) references.push({ label: 'Certificado aprobado', value: c.externalNumber ? `${c.externalNumber} (${c.number})` : c.number, source: c.approvedAt ? `Aprobado el ${dmy(c.approvedAt)}` : 'Certificado', status: 'ok' })
  }
  if (policy.requiresCertificate && !certIds.length) references.push(ok('Certificado aprobado', undefined, 'Política del cliente', 'El cliente exige certificado aprobado.'))
  if (comparison.applicable) {
    // Concept rows decide what is billable; totals and payment terms are informative.
    const pending = comparison.rows.filter((r) => r.kind === 'item' && !isSettled(r)).length
    const other = comparison.rows.filter((r) => r.kind !== 'item' && !isSettled(r)).map((r) => r.label)
    references.push({
      label: 'Comparación OC vs. cotización',
      value: pending ? `${pending} concepto(s) sin resolver` : 'Conceptos resueltos',
      source: 'Comparación OC vs. cotización',
      status: pending ? 'missing' : 'ok',
      note: [pending ? 'Los conceptos afectados no se facturan.' : undefined, other.length ? `Con diferencias informativas: ${other.join(', ')}.` : undefined].filter(Boolean).join(' ') || undefined,
    })
  }

  // Lines with their origin; details come from the quotation snapshot of the service.
  const units = authorizedUnits(ds, project.id).byService
  const lines: PrepLine[] = inv.lines.map((l, index) => {
    const service = l.serviceId ? findById(ds.services, l.serviceId) : undefined
    const quote = quoteIds.map((id) => findById(ds.quotations, id)).find((q) => q?.lines.some((x) => x.serviceId === l.serviceId))
    const ql = quote?.lines.find((x) => x.serviceId === l.serviceId && (x.serviceItemId ?? '') === (l.serviceItemId && service?.items?.find((i) => i.id === l.serviceItemId)?.special ? l.serviceItemId : ''))
    const item = l.serviceItemId ? service?.items?.find((i) => i.id === l.serviceItemId) : undefined
    const unit = l.serviceId ? units.get(l.serviceId)?.find((u) => (u.serviceItemId ?? '') === (item?.special ? item.id : '')) : undefined
    const po = l.purchaseOrderId ? findById(ds.purchaseOrders, l.purchaseOrderId) : undefined
    const cert = l.certificateId ? findById(ds.certificates, l.certificateId) : undefined
    const origins = [
      l.reimbursable ? 'Reintegro de gastos' : undefined,
      unit ? `${unit.basis} · ${unit.refs.join(', ')}` : po ? `OC ${po.clientPoNumber}` : undefined,
      l.openOrderId ? `OC abierta ${findById(ds.openOrders, l.openOrderId)?.number ?? ''}`.trim() : undefined,
      cert ? `Certificado ${cert.externalNumber ?? cert.number}` : undefined,
      quote ? `Cotización ${quote.number} v${quote.version}` : undefined,
      item?.special ? 'Subservicio especial del proyecto' : undefined,
    ].filter(Boolean) as string[]
    return { index, description: l.description, details: ql?.details, quantity: l.quantity, unit: unit?.unit ?? item?.unit ?? ql?.unit, unitPrice: l.unitPrice, subtotal: lineSubtotal(l), currency: inv.currency, origins }
  })

  const t = invoiceTotals(inv)
  const amounts: PrepBlock = {
    key: 'amounts',
    title: 'Importes y resumen',
    fields: [
      { label: 'Subtotal comercial', value: String(t.subtotal), source: 'Suma de las líneas', status: 'ok' },
      ...inv.taxes.map((x) => ({ label: x.label, value: `${x.ratePct} %`, source: 'Cargado manualmente en el borrador', status: 'ok' as const, note: 'SIGR no determina impuestos.' })),
      { label: 'Total comercial', value: String(t.total), source: 'Borrador SIGR', status: 'ok' },
      fiscal('IVA y alícuotas', 'SIGR no los calcula sin reglas fiscales confirmadas.'),
      fiscal('Percepciones / otros tributos'),
      ...(inv.currency !== 'ARS' ? [fiscal('Tipo de cambio', 'Lo define el comprobante.')] : []),
      fiscal('CAE / número de comprobante', 'Se registra al confirmar la emisión externa.'),
    ],
  }

  // Concepts of the project not available for billing now, with the reason.
  const commercial = projectCommercial(ds, project, today)
  const unavailable: UnavailableItem[] = [...authorizedUnits(ds, project.id).unavailable]
  for (const s of ds.services.filter((x) => x.projectId === project.id)) {
    const c = commercial.get(s.id)
    if (!c || c.eligibility.eligible || unavailable.some((u) => u.serviceId === s.id && !u.serviceItemId)) continue
    unavailable.push({ serviceId: s.id, label: getServiceType(s.typeId).label, reason: c.eligibility.missing.join(' · ') || 'Sin monto facturable.' })
  }

  const blocks = [issuerBlock, receiverBlock, voucherBlock, { key: 'references' as const, title: 'Referencias de OC y certificado', fields: references }, { key: 'lines' as const, title: 'Conceptos y líneas', fields: [] }, amounts, { key: 'confirmation' as const, title: 'Confirmación de emisión externa', fields: [] }]
  return {
    blocks,
    lines,
    unavailable,
    fiscalPending: blocks.flatMap((b) => b.fields.filter((f) => f.status === 'fiscal').map((f) => f.label)),
    missing: blocks.flatMap((b) => b.fields.filter((f) => f.status === 'missing').map((f) => f.label)),
  }
}

/** Plain-text summary in loading order (to copy or download). */
export function preparationText(p: InvoicePreparation, header: string): string {
  const out = [header, 'Resumen preparatorio — no es un comprobante fiscal.', '']
  p.blocks.forEach((b, i) => {
    out.push(`${i + 1}. ${b.title.toUpperCase()}`)
    if (b.key === 'lines') {
      for (const l of p.lines) out.push(`- ${l.description}${l.details ? ` (${l.details})` : ''} | ${l.quantity} × ${l.unitPrice} = ${l.subtotal} ${l.currency}${l.origins.length ? ` | ${l.origins.join('; ')}` : ''}`)
    } else if (b.key === 'confirmation') {
      out.push('- Emitir el comprobante en el sistema fiscal y registrar en SIGR: número, fecha, importe y comprobante.')
    } else
      for (const f of b.fields) out.push(`- ${f.label}: ${f.status === 'fiscal' ? '[COMPLETAR EN EL SISTEMA FISCAL]' : f.status === 'missing' ? '[FALTA EN SIGR]' : f.value} (${f.source})`)
    out.push('')
  })
  if (p.unavailable.length) {
    out.push('NO DISPONIBLE PARA FACTURAR')
    for (const u of p.unavailable) out.push(`- ${u.label}: ${u.reason}`)
  }
  return out.join('\n').trim()
}
