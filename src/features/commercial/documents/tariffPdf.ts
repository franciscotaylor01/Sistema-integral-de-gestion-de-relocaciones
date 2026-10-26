import { unitName, type TariffSheet } from '@/domain/commercial/documents'
import { formatMoney } from '@/lib/format'
import { PdfDocument, wrapText } from '@/lib/pdf'
import { C, dmy, Flow, footers, infoBox, issuerHeader, M } from './layout'

const COL = { name: M.left + 8, unit: 262, market: 340, validity: 392, price: M.right - 8 }

/** Tariff in force for a client: approved prices only when the client requires approval; pending versions never. */
export function tariffPdf(sheet: TariffSheet, generatedOn: string, contact?: string): Uint8Array {
  const pdf = new PdfDocument({ title: `Tarifario ${sheet.clientName}`, author: 'Relocare' })
  const f = new Flow(pdf)
  issuerHeader(f, 'Tarifario de servicios de relocación', [
    { label: 'Vigente al', value: dmy(sheet.date) },
    { label: 'Precios', value: sheet.requiresApproval ? 'Aprobados' : 'Vigentes' },
  ])
  f.y += infoBox(pdf, M.left, f.y, M.right - M.left, 'Cliente', [
    ['Cliente', sheet.clientName],
    ['Razón social', sheet.legalName],
    ['Contacto', contact],
  ]) + 18

  const header = () => {
    pdf.rect(M.left, f.y, M.right - M.left, 20, C.ink)
    const s = { size: 8.5, bold: true, color: [1, 1, 1] as [number, number, number] }
    pdf.text(COL.name, f.y + 6, 'Servicio / subservicio', s)
    pdf.text(COL.unit, f.y + 6, 'Unidad', s)
    pdf.text(COL.market, f.y + 6, 'Mercado', s)
    pdf.text(COL.validity, f.y + 6, 'Vigencia', s)
    pdf.text(COL.price, f.y + 6, 'Precio', { ...s, align: 'right' })
    f.y += 26
  }
  header()
  f.setPageHeader(header)
  if (!sheet.groups.length) f.paragraph('Sin precios vigentes para informar.', { size: 9, color: C.muted })
  for (const g of sheet.groups) {
    f.ensure(40)
    pdf.rect(M.left, f.y - 4, M.right - M.left, 18, C.soft)
    pdf.text(COL.name, f.y, g.label, { size: 10, bold: true })
    f.y += 18
    for (const r of g.rows) {
      const name = wrapText(`${r.name}${r.minQuantity > 1 ? ` (desde ${r.minQuantity})` : ''}`, COL.unit - COL.name - 10, 9)
      f.ensure(name.length * 12 + 8)
      const top = f.y
      pdf.text(COL.unit, top, unitName(r.unit), { size: 8.5, color: C.muted })
      pdf.text(COL.market, top, r.market === 'ANY' ? 'Todos' : r.market, { size: 8.5, color: C.muted })
      pdf.text(COL.validity, top, `${dmy(r.validFrom)}${r.validTo ? ` – ${dmy(r.validTo)}` : ' – sin fin'}`, { size: 8.5, color: C.muted })
      pdf.text(COL.price, top, formatMoney(r.unitPrice, r.currency), { size: 9, bold: true, align: 'right' })
      for (const t of name) {
        pdf.text(COL.name, f.y, t, { size: 9 })
        f.y += 12
      }
      f.y += 4
      pdf.line(COL.name, f.y - 2, M.right, f.y - 2, { width: 0.4 })
    }
    f.y += 8
  }
  f.setPageHeader(undefined)
  f.sectionTitle('Notas')
  f.paragraph('•  Precios por unidad, en la moneda indicada; no se aplica conversión entre monedas.', { size: 9 })
  if (sheet.requiresApproval) f.paragraph('•  Se incluyen solo precios con aprobación comercial registrada.', { size: 9 })
  f.paragraph('•  Las actualizaciones pendientes de aprobación no forman parte de este tarifario.', { size: 9 })
  footers(pdf, `Tarifario ${sheet.clientName}`, generatedOn)
  return pdf.toBytes()
}
