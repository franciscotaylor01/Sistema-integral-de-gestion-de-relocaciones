import type { CollectionActionKind, CostCategory, InvoiceKind, PaymentCondition, PaymentMethod, SupplierKind } from '@/types/domain'

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
  'Registro interno de SIGR (demo). No es un comprobante fiscal: no se emite ni autoriza ante ARCA y no tiene CAE. Si la factura se emitió fuera de SIGR, cargá su número como referencia externa.'
