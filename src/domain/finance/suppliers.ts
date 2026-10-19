import type { CountryCode, CurrencyCode, PaymentCondition, Supplier, SupplierAgreement, SupplierKind } from '@/types/domain'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError } from '../errors'
import { appendAudit } from './audit'
import { addMoney, cmpMoney, isMoney } from './money'

export interface SupplierInput {
  name: string
  kind: SupplierKind
  country: CountryCode | ''
  contactName?: string
  email?: string
  phone?: string
  preferredCurrency: CurrencyCode | ''
  categories: string[]
  paymentDetails?: string
  defaultPaymentCondition: PaymentCondition
  active: boolean
  notes?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateSupplier(ds: Dataset, input: SupplierInput, supplierId?: string): Record<string, string> {
  const f: Record<string, string> = {}
  if (!input.name.trim()) f.name = 'Ingresá el nombre.'
  else if (ds.suppliers.some((s) => s.id !== supplierId && s.name.trim().toLowerCase() === input.name.trim().toLowerCase())) f.name = 'Ya existe un proveedor con este nombre.'
  if (!input.country) f.country = 'Elegí el país.'
  if (!input.preferredCurrency) f.preferredCurrency = 'Elegí la moneda preferida.'
  if (input.categories.length === 0) f.categories = 'Elegí al menos una categoría de servicio.'
  if (input.email && !EMAIL.test(input.email.trim())) f.email = 'Email inválido.'
  if ((input.paymentDetails?.length ?? 0) > 200) f.paymentDetails = 'Máximo 200 caracteres.'
  if ((input.notes?.length ?? 0) > 2000) f.notes = 'Máximo 2000 caracteres.'
  return f
}

function fromInput(input: SupplierInput): Omit<Supplier, 'id'> {
  return {
    name: input.name.trim(),
    kind: input.kind,
    country: input.country as CountryCode,
    contactName: input.contactName?.trim() || undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    preferredCurrency: input.preferredCurrency as CurrencyCode,
    categories: [...new Set(input.categories)],
    paymentDetails: input.paymentDetails?.trim() || undefined,
    defaultPaymentCondition: input.defaultPaymentCondition,
    active: input.active,
    notes: input.notes?.trim() || undefined,
  }
}

export function createSupplier(ds: Dataset, input: SupplierInput, requestId: string, ctx: DomainContext): { ds: Dataset; supplierId: string; duplicate: boolean } {
  const existing = ds.requests[requestId]
  if (existing && ds.suppliers.some((s) => s.id === existing)) return { ds, supplierId: existing, duplicate: true }
  const fields = validateSupplier(ds, input)
  if (Object.keys(fields).length) throw new DomainError('Revisá el proveedor.', fields)
  const supplier: Supplier = { id: ctx.newId('sup'), ...fromInput(input) }
  const next: Dataset = { ...ds, suppliers: [...ds.suppliers, supplier], requests: { ...ds.requests, [requestId]: supplier.id } }
  return { ds: appendAudit(next, { entity: 'supplier', entityId: supplier.id, action: 'create', detail: supplier.name }, ctx), supplierId: supplier.id, duplicate: false }
}

export function updateSupplier(ds: Dataset, supplierId: string, input: SupplierInput, ctx: DomainContext): Dataset {
  if (!findById(ds.suppliers, supplierId)) throw new DomainError('El proveedor no existe.')
  const fields = validateSupplier(ds, input, supplierId)
  if (Object.keys(fields).length) throw new DomainError('Revisá el proveedor.', fields)
  const next: Dataset = { ...ds, suppliers: replaceById(ds.suppliers, supplierId, (s) => ({ ...s, ...fromInput(input) })) }
  return appendAudit(next, { entity: 'supplier', entityId: supplierId, action: 'update', detail: input.name.trim() }, ctx)
}

export interface AgreementInput {
  supplierId: string
  projectId: string
  serviceId?: string
  description: string
  currency: CurrencyCode | ''
  agreedAmount: number
  paymentCondition: PaymentCondition
  notes?: string
}

/** Agreed fee for a supplier's work (an estimate/commitment — not a cost, not a payable). */
export function createAgreement(ds: Dataset, input: AgreementInput, ctx: DomainContext): { ds: Dataset; agreement: SupplierAgreement } {
  const f: Record<string, string> = {}
  if (!ds.suppliers.some((s) => s.id === input.supplierId)) f.supplierId = 'Elegí el proveedor.'
  const project = findById(ds.projects, input.projectId)
  if (!project) f.projectId = 'Elegí el proyecto.'
  if (input.serviceId && !ds.services.some((s) => s.id === input.serviceId && s.projectId === input.projectId)) f.serviceId = 'El servicio no pertenece al proyecto.'
  if (!input.description.trim()) f.description = 'Describí el trabajo acordado.'
  if (!input.currency) f.currency = 'Elegí la moneda.'
  if (!isMoney(input.agreedAmount) || input.agreedAmount <= 0) f.agreedAmount = 'Monto mayor a cero (hasta 2 decimales).'
  if (Object.keys(f).length) throw new DomainError('Revisá el acuerdo.', f)
  const agreement: SupplierAgreement = {
    id: ctx.newId('agr'),
    supplierId: input.supplierId,
    projectId: input.projectId,
    serviceId: input.serviceId || undefined,
    description: input.description.trim(),
    currency: input.currency as CurrencyCode,
    agreedAmount: input.agreedAmount,
    paymentCondition: input.paymentCondition,
    notes: input.notes?.trim() || undefined,
    createdAt: ctx.now(),
  }
  const next: Dataset = { ...ds, agreements: [...ds.agreements, agreement] }
  return {
    ds: appendAudit(next, { entity: 'agreement', entityId: agreement.id, action: 'create', detail: `${agreement.currency} ${agreement.agreedAmount}`, projectId: agreement.projectId }, ctx),
    agreement,
  }
}

/** Invoiced (obligations) against an agreement, excluding cancelled. */
export function agreementUsage(ds: Pick<Dataset, 'obligations'>, agreementId: string, excludeObligationId?: string): number {
  return addMoney(...ds.obligations.filter((o) => o.agreementId === agreementId && o.lifecycle !== 'cancelled' && o.id !== excludeObligationId).map((o) => o.amount))
}

export const exceedsAgreement = (ds: Pick<Dataset, 'obligations'>, agreement: SupplierAgreement, amount: number, excludeObligationId?: string) =>
  cmpMoney(addMoney(agreementUsage(ds, agreement.id, excludeObligationId), amount), agreement.agreedAmount) > 0
