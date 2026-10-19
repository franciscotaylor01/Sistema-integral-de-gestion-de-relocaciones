import type { BillingMilestone, Client, ClientContact, ClientStatus, CountryCode, CurrencyCode } from '@/types/domain'
import { logActivityGlobal } from './activity'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError } from '../errors'

export interface ContactInput {
  id?: string
  name: string
  role: string
  email: string
  phone: string
  primary?: boolean
}

export interface ClientInput {
  name: string
  legalName: string
  taxId: string
  industry: string
  country: CountryCode | ''
  city: string
  billingAddress: string
  status: ClientStatus
  accountManagerId: string
  billingCurrency: CurrencyCode | ''
  currencies: CurrencyCode[]
  paymentTermsDays: number
  requiresPurchaseOrder: boolean
  requiresApprovedQuote: boolean
  billingMilestone: BillingMilestone
  quoteValidityDays: number
  contacts: ContactInput[]
  notes?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const normalizeTax = (s: string) => s.replace(/[\s.-]/g, '').toUpperCase()

export function validateClientInput(ds: Dataset, input: ClientInput, clientId?: string): Record<string, string> {
  const f: Record<string, string> = {}
  if (!input.name.trim()) f.name = 'Ingresá el nombre comercial.'
  if (!input.legalName.trim()) f.legalName = 'Ingresá la razón social.'
  if (!input.taxId.trim()) f.taxId = 'Ingresá la identificación fiscal.'
  else if (ds.clients.some((c) => c.id !== clientId && normalizeTax(c.taxId) === normalizeTax(input.taxId))) {
    f.taxId = 'Ya existe un cliente con esta identificación fiscal.'
  }
  if (ds.clients.some((c) => c.id !== clientId && c.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
    f.name = 'Ya existe un cliente con este nombre.'
  }
  if (!input.country) f.country = 'Elegí el país.'
  if (!input.city.trim()) f.city = 'Ingresá la ciudad.'
  if (!input.billingAddress.trim()) f.billingAddress = 'Ingresá la dirección de facturación.'
  if (!ds.staff.some((s) => s.id === input.accountManagerId)) f.accountManagerId = 'Elegí un ejecutivo de cuenta.'
  if (!input.billingCurrency) f.billingCurrency = 'Elegí la moneda de facturación.'
  if (!Number.isInteger(input.paymentTermsDays) || input.paymentTermsDays < 0 || input.paymentTermsDays > 180) {
    f.paymentTermsDays = 'Entre 0 y 180 días.'
  }
  if (!Number.isInteger(input.quoteValidityDays) || input.quoteValidityDays < 1 || input.quoteValidityDays > 180) {
    f.quoteValidityDays = 'Entre 1 y 180 días.'
  }
  if (input.contacts.length === 0) f.contacts = 'Agregá al menos un contacto.'
  input.contacts.forEach((c, i) => {
    if (!c.name.trim()) f[`contacts.${i}.name`] = 'Ingresá el nombre.'
    if (!EMAIL.test(c.email.trim())) f[`contacts.${i}.email`] = 'Email inválido.'
  })
  if (input.contacts.length > 0 && input.contacts.filter((c) => c.primary).length !== 1) f.contacts = 'Marcá un único contacto principal.'
  if ((input.notes?.length ?? 0) > 2000) f.notes = 'Máximo 2000 caracteres.'
  return f
}

function buildContacts(input: ContactInput[], ctx: DomainContext): ClientContact[] {
  return input.map((c) => ({
    id: c.id ?? ctx.newId('ct'),
    name: c.name.trim(),
    role: c.role.trim(),
    email: c.email.trim(),
    phone: c.phone.trim(),
    primary: c.primary || undefined,
  }))
}

function fromInput(input: ClientInput, ctx: DomainContext): Omit<Client, 'id' | 'clientSince'> {
  const billing = input.billingCurrency as CurrencyCode
  return {
    name: input.name.trim(),
    legalName: input.legalName.trim(),
    taxId: input.taxId.trim(),
    industry: input.industry.trim() || 'Sin especificar',
    headquarters: { country: input.country as CountryCode, city: input.city.trim() },
    billingAddress: input.billingAddress.trim(),
    status: input.status,
    accountManagerId: input.accountManagerId,
    billingCurrency: billing,
    currencies: [...new Set([billing, ...input.currencies])],
    paymentTermsDays: input.paymentTermsDays,
    contacts: buildContacts(input.contacts, ctx),
    policy: {
      requiresPurchaseOrder: input.requiresPurchaseOrder,
      requiresApprovedQuote: input.requiresApprovedQuote,
      billingMilestone: input.billingMilestone,
      quoteValidityDays: input.quoteValidityDays,
    },
    notes: input.notes?.trim() || undefined,
  }
}

export function createClient(ds: Dataset, input: ClientInput, requestId: string, ctx: DomainContext): { ds: Dataset; clientId: string; duplicate: boolean } {
  const existing = ds.requests[requestId]
  if (existing && ds.clients.some((c) => c.id === existing)) return { ds, clientId: existing, duplicate: true }
  const fields = validateClientInput(ds, input)
  if (Object.keys(fields).length) throw new DomainError('Revisá los datos del cliente.', fields)
  const client: Client = { id: ctx.newId('cli'), clientSince: ctx.today(), ...fromInput(input, ctx) }
  let next: Dataset = { ...ds, clients: [...ds.clients, client], requests: { ...ds.requests, [requestId]: client.id } }
  next = logActivityGlobal(next, `Cliente ${client.name} dado de alta.`, ctx)
  return { ds: next, clientId: client.id, duplicate: false }
}

export function updateClient(ds: Dataset, clientId: string, input: ClientInput, ctx: DomainContext): Dataset {
  const client = findById(ds.clients, clientId)
  if (!client) throw new DomainError('El cliente no existe.')
  const fields = validateClientInput(ds, input, clientId)
  if (Object.keys(fields).length) throw new DomainError('Revisá los datos del cliente.', fields)
  const updated: Client = { ...client, ...fromInput(input, ctx) }
  const policyChanged = JSON.stringify(updated.policy) !== JSON.stringify(client.policy)
  const next: Dataset = { ...ds, clients: replaceById(ds.clients, clientId, () => updated) }
  return logActivityGlobal(next, `Cliente ${updated.name} actualizado${policyChanged ? ' (política comercial modificada)' : ''}.`, ctx, clientId)
}
