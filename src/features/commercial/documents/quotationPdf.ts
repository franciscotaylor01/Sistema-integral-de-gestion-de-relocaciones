import { quotationStageMeta } from '@/config/commercial'
import { unitName, type QuotationDocument } from '@/domain/commercial/documents'
import type { Amounts } from '@/domain/commercial/money'
import { formatMoney, formatNumber } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import { PdfDocument, wrapText } from '@/lib/pdf'
import { C, dmy, Flow, footers, infoBox, infoBoxHeight, issuerHeader, M } from './layout'

export const amountsText = (a: Amounts) =>
  CURRENCY_ORDER.filter((c) => a[c] !== undefined)
    .map((c) => formatMoney(a[c]!, c))
    .join(' + ')

const qty = (n: number) => formatNumber(n, Number.isInteger(n) ? 0 : 2)

// Table columns (x positions).
const COL = { desc: M.left + 8, qty: 352, unit: 362, price: 478, total: M.right - 8 }
const DESC_W = COL.qty - COL.desc - 40

/** Professional quotation PDF built only from the quotation snapshot and recorded data. */
export function quotationPdf(doc: QuotationDocument, generatedOn: string): Uint8Array {
  const pdf = new PdfDocument({ title: `Cotización ${doc.number} v${doc.version}`, author: 'Relocare' })
  const f = new Flow(pdf)
  const stage = quotationStageMeta[doc.stage].label
  issuerHeader(f, 'Propuesta comercial de servicios de relocación', [
    { label: 'Cotización', value: `${doc.number} · v${doc.version}` },
    { label: 'Fecha de emisión', value: dmy(doc.issueDate) },
    { label: 'Válida hasta', value: dmy(doc.validUntil) },
    { label: 'Estado', value: stage },
  ])

  const p = doc.party
  const colW = (M.right - M.left - 12) / 2
  const contact = p.contact ? [p.contact.name, p.contact.role, p.contact.email].filter(Boolean).join(' · ') : undefined
  const clientRows: [string, string | undefined][] = [
    ['Cliente', p.clientName || undefined],
    ['Razón social', p.legalName],
    ['Id. fiscal', p.taxId],
    ['Facturación', p.billingAddress],
    ['Contacto', contact],
  ]
  const projectRows: [string, string | undefined][] = [
    ['Proyecto', p.projectCode || undefined],
    ['Beneficiario', p.beneficiary],
    ['Traslado', p.route],
    ['Responsable', p.accountManager ? [p.accountManager.name, p.accountManager.email].filter(Boolean).join(' · ') : undefined],
  ]
  const boxH = Math.max(infoBoxHeight(colW, clientRows), infoBoxHeight(colW, projectRows))
  const h1 = infoBox(pdf, M.left, f.y, colW, 'Cliente', clientRows, boxH)
  const h2 = infoBox(pdf, M.left + colW + 12, f.y, colW, 'Proyecto', projectRows, boxH)
  f.y += Math.max(h1, h2) + 18

  const tableHeader = () => {
    pdf.rect(M.left, f.y, M.right - M.left, 20, C.ink)
    const s = { size: 8.5, bold: true, color: [1, 1, 1] as [number, number, number] }
    pdf.text(COL.desc, f.y + 6, 'Servicio / subservicio', s)
    pdf.text(COL.qty, f.y + 6, 'Cant.', { ...s, align: 'right' })
    pdf.text(COL.unit, f.y + 6, 'Unidad', s)
    pdf.text(COL.price, f.y + 6, 'Precio unit.', { ...s, align: 'right' })
    pdf.text(COL.total, f.y + 6, 'Importe', { ...s, align: 'right' })
    f.y += 26
  }
  f.sectionTitle('Servicios cotizados')
  tableHeader()
  f.setPageHeader(tableHeader)

  for (const g of doc.groups) {
    f.ensure(48)
    pdf.rect(M.left, f.y - 4, M.right - M.left, 18, C.soft)
    pdf.text(COL.desc, f.y, g.label, { size: 10, bold: true })
    f.y += 18
    if (g.details) f.paragraph(g.details, { x: COL.desc, width: M.right - COL.desc - 8, size: 8.8, color: C.muted, gap: 3 })
    for (const l of g.lines) {
      const desc = wrapText(l.description, DESC_W, 9)
      const extra = [l.special ? 'Subservicio especial del proyecto' : '', l.details ?? ''].filter(Boolean)
      const extraLines = extra.flatMap((t) => wrapText(t, DESC_W, 8))
      f.ensure(desc.length * 12 + extraLines.length * 10.5 + 8)
      const top = f.y
      pdf.text(COL.qty, top, qty(l.quantity), { size: 9, align: 'right' })
      pdf.text(COL.unit, top, unitName(l.unit), { size: 8.5, color: C.muted })
      pdf.text(COL.price, top, formatMoney(l.unitPrice, l.currency), { size: 9, align: 'right' })
      pdf.text(COL.total, top, formatMoney(l.total, l.currency), { size: 9, bold: true, align: 'right' })
      for (const t of desc) {
        pdf.text(COL.desc, f.y, t, { size: 9 })
        f.y += 12
      }
      extraLines.forEach((t, i) => {
        pdf.text(COL.desc, f.y, t, { size: 8, color: l.special && i === 0 ? C.accent : C.muted })
        f.y += 10.5
      })
      f.y += 4
      pdf.line(COL.desc, f.y - 2, M.right, f.y - 2, { width: 0.4 })
    }
    f.ensure(18)
    pdf.text(COL.price, f.y + 1, `Subtotal ${g.label}`, { size: 8.5, color: C.muted, align: 'right' })
    pdf.text(COL.total, f.y, amountsText(g.subtotal), { size: 9.5, bold: true, align: 'right' })
    f.y += 22
  }
  f.setPageHeader(undefined)

  // Totals per currency (never summed across currencies).
  const currencies = CURRENCY_ORDER.filter((c) => doc.totals[c] !== undefined)
  f.ensure(30 + currencies.length * 18)
  const totalH = 14 + currencies.length * 18 + (currencies.length > 1 ? 12 : 0)
  pdf.rect(330, f.y, M.right - 330, totalH, C.soft)
  let ty = f.y + 9
  for (const c of currencies) {
    pdf.text(342, ty, `Total ${c}`, { size: 10, bold: true })
    pdf.text(M.right - 12, ty, formatMoney(doc.totals[c]!, c), { size: 11, bold: true, align: 'right' })
    ty += 18
  }
  if (currencies.length > 1) pdf.text(342, ty - 3, 'Monedas separadas: no se suman ni se convierten.', { size: 7.5, color: C.muted })
  f.y += totalH + 18

  f.sectionTitle('Condiciones comerciales')
  for (const c of doc.conditions) f.paragraph(`•  ${c}`, { size: 9, gap: 1 })
  if (doc.notes) {
    f.sectionTitle('Observaciones')
    f.paragraph(doc.notes, { size: 9 })
  }
  if (doc.stage === 'approved' && doc.approvedAt) {
    f.sectionTitle('Aprobación')
    f.paragraph(`Aprobada por el cliente el ${dmy(doc.approvedAt)}${doc.approvedBy ? ` (${doc.approvedBy})` : ''}.`, { size: 9 })
  }
  if (doc.stage === 'draft') {
    f.y += 6
    f.paragraph('Borrador interno: no constituye una propuesta enviada al cliente.', { size: 8.5, color: C.accent })
  }

  footers(pdf, `${doc.number} v${doc.version}`, generatedOn)
  return pdf.toBytes()
}
