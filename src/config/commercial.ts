import type { BillingMilestone, PriceUnit, PurchaseOrderStatus, QuotationStatus } from '@/types/domain'
import type { CommercialStage } from '@/domain/commercial/traceability'
import type { StatusMeta } from './catalogs'

/**
 * Staff allowed to adjust tariff prices and to register quotation approvals.
 * (Demo stand-in for roles/permissions; authentication arrives later.)
 */
export const COMMERCIAL_AUTHORIZERS = ['stf_01', 'stf_05']

export const quotationStatusMeta: Record<QuotationStatus, StatusMeta> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  sent: { label: 'Enviada', tone: 'info' },
  approved: { label: 'Aprobada', tone: 'success' },
  rejected: { label: 'Rechazada', tone: 'danger' },
  expired: { label: 'Vencida', tone: 'warning' },
}

export const purchaseOrderStatusMeta: Record<PurchaseOrderStatus, StatusMeta> = {
  active: { label: 'Vigente', tone: 'success' },
  cancelled: { label: 'Anulada', tone: 'neutral' },
}

export const billingMilestoneLabel: Record<BillingMilestone, string> = {
  'quote-approved': 'Al aprobarse la cotización',
  'service-started': 'Al iniciarse el servicio',
  'service-completed': 'Al completarse el servicio',
}

export const priceUnitLabel: Record<PriceUnit, string> = {
  service: 'por servicio',
  person: 'por persona',
  family: 'por grupo familiar',
  hour: 'por hora',
  month: 'por mes',
  session: 'por sesión',
  document: 'por documento',
}


export const commercialStageMeta: Record<CommercialStage, StatusMeta> = {
  'not-quoted': { label: 'Sin cotizar', tone: 'neutral' },
  quoted: { label: 'Cotizado', tone: 'info' },
  approved: { label: 'Aprobado · sin OC', tone: 'warning' },
  'partially-authorized': { label: 'OC parcial', tone: 'warning' },
  authorized: { label: 'Autorizado por OC', tone: 'success' },
  'approved-no-po': { label: 'Aprobado (no requiere OC)', tone: 'success' },
}
