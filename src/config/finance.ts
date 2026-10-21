import type { SettlementSignal } from '@/domain/finance/settlements'
import type { StatusMeta } from '@/config/catalogs'
import type { AdvanceStatus } from '@/domain/finance/supplierPayments'
import type { CollectionActionKind, CostCategory, InvoiceKind, PaymentCondition, PaymentMethod, SettlementMethod, SettlementRelease, SupplierKind, WithholdingType } from '@/types/domain'

export const invoiceKindLabel: Record<InvoiceKind, string> = {
  A: 'Factura A',
  B: 'Factura B',
  E: 'Factura E (exportación)',
  foreign: 'Invoice (entidad del exterior)',
}

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  transfer: 'Transferencia',
  wire: 'Transferencia internacional',
  check: 'Cheque',
  card: 'Tarjeta',
  cash: 'Efectivo',
}

export const costCategoryLabel: Record<CostCategory, string> = {
  'supplier-fee': 'Honorarios de proveedor',
  'professional-services': 'Servicios profesionales externos',
  moving: 'Gastos de mudanza',
  migration: 'Gastos migratorios',
  'other-direct': 'Otro costo directo',
  'general-expense': 'Gasto general de la empresa',
}

export const collectionActionLabel: Record<CollectionActionKind, string> = {
  call: 'Llamada',
  email: 'Email',
  meeting: 'Reunión',
  promise: 'Promesa de pago',
  note: 'Nota',
}

export const paymentConditionLabel: Record<PaymentCondition, string> = {
  'due-date': 'Al vencimiento',
  'after-client-collection': 'Después del cobro al cliente',
}

export const supplierKindLabel: Record<SupplierKind, string> = {
  company: 'Empresa',
  professional: 'Profesional independiente',
}

/** Shown wherever invoices are issued: SIGR records are not fiscal documents. */
export const FISCAL_DISCLAIMER =
  'Registro interno de SIGR. No es un comprobante fiscal: SIGR no emite ni autoriza ante ARCA. La factura se emite en el sistema externo y luego se registra con «Confirmar emisión externa».'

/** Derived settlement status (never stored): colour + meaning. */
export const settlementSignalMeta: Record<SettlementSignal, StatusMeta> = {
  green: { label: 'Pagada', tone: 'success' },
  red: { label: 'Cobrado sin pagar', tone: 'danger' },
  yellow: { label: 'Parcial / en condiciones', tone: 'warning' },
  gray: { label: 'No liquidable', tone: 'neutral' },
}

export const settlementMethodLabel: Record<SettlementMethod, string> = {
  percentage: 'Porcentaje del resultado',
  fixed: 'Importe fijo acordado',
  'by-service': 'Componentes por servicio',
}

export const settlementReleaseLabel: Record<SettlementRelease, string> = {
  'after-collection': 'Proporcional a lo cobrado al cliente',
  manual: 'Otra condición acordada (habilitación manual)',
}

export const withholdingTypeLabel: Record<WithholdingType, string> = {
  iva: 'IVA',
  ganancias: 'Ganancias',
  iibb: 'Ingresos Brutos',
  other: 'Otra retención',
}

export const advanceStatusMeta: Record<AdvanceStatus, StatusMeta> = {
  unapplied: { label: 'Anticipo no aplicado', tone: 'warning' },
  partial: { label: 'Anticipo parcialmente aplicado', tone: 'info' },
  applied: { label: 'Anticipo aplicado', tone: 'success' },
}

export const batchStatusMeta: Record<'draft' | 'confirmed' | 'partially-paid' | 'paid' | 'cancelled', StatusMeta> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  confirmed: { label: 'Confirmada · sin pagos', tone: 'info' },
  'partially-paid': { label: 'Parcialmente pagada', tone: 'warning' },
  paid: { label: 'Pagada', tone: 'success' },
  cancelled: { label: 'Liberada', tone: 'neutral' },
}
