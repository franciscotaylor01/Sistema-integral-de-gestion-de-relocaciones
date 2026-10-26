import type { StatusMeta } from '@/config/catalogs'
import type { BillingState, CertificateRow, PoRow } from './selectors'

export const billingStateMeta: Record<BillingState, StatusMeta & { short: string; cell: string; param: string }> = {
  ready: { label: 'Listo para facturar', short: 'Listos', cell: 'Listo para facturar', tone: 'success', param: 'listos' },
  draft: { label: 'Factura preparada sin emitir', short: 'Preparadas', cell: 'Preparada sin emitir', tone: 'accent', param: 'borradores' },
  review: { label: 'Pendiente de revisión OC/cotización', short: 'Revisión OC', cell: 'Revisión OC/cotización', tone: 'danger', param: 'revision' },
  certificate: { label: 'Pendiente de certificado', short: 'Certificado', cell: 'Falta certificado', tone: 'info', param: 'certificado' },
  waiting: { label: 'Esperando OC o aprobación comercial', short: 'OC / aprobación', cell: 'Espera OC/aprobación', tone: 'warning', param: 'espera' },
  milestone: { label: 'Esperando hito de facturación', short: 'Hito', cell: 'Espera hito', tone: 'neutral', param: 'hito' },
}

export const stateFromParam = (p: string | null): BillingState | undefined =>
  (Object.entries(billingStateMeta) as [BillingState, (typeof billingStateMeta)[BillingState]][]).find(([, m]) => m.param === p)?.[0]

export const poKindMeta: Record<PoRow['kind'], StatusMeta> = {
  'po-review': { label: 'Diferencias OC importada', tone: 'danger' },
  'no-po': { label: 'Aprobada sin OC', tone: 'warning' },
  'quote-sent': { label: 'Cotización enviada', tone: 'info' },
}

export const certificateKindMeta: Record<CertificateRow['kind'], StatusMeta & { short: string }> = {
  'approved-unbilled': { label: 'Aprobado con importe por facturar', short: 'Aprobados por facturar', tone: 'success' },
  'to-generate': { label: 'Pendiente de generar', short: 'Por generar', tone: 'warning' },
  submitted: { label: 'Presentado, esperando aprobación', short: 'Presentados', tone: 'info' },
  draft: { label: 'Borrador sin presentar', short: 'En borrador', tone: 'neutral' },
}
