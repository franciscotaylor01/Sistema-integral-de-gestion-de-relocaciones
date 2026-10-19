/*
 * SIGR domain model. Shapes mirror the future database tables (Supabase), so
 * ids are plain strings and dates are ISO 8601 strings ("YYYY-MM-DD").
 *
 * The Project (a relocation) is the central entity: it belongs to a corporate
 * client, relocates one employee (plus family), and groups several services.
 */

export type CurrencyCode = 'USD' | 'EUR' | 'ARS' | 'BRL' | 'MXN' | 'GBP' | 'CLP'

export type CountryCode =
  | 'AR' | 'BR' | 'CL' | 'CO' | 'MX' | 'UY' | 'US' | 'CA'
  | 'ES' | 'DE' | 'FR' | 'NL' | 'GB' | 'CH' | 'JP'

export interface Location {
  country: CountryCode
  city: string
}

/* ───────────────────────── People ───────────────────────── */

export interface StaffMember {
  id: string
  name: string
  role: string
  email: string
}

export interface UserProfile extends StaffMember {
  /** Short name used in greetings. */
  firstName: string
}

export type FamilyRelation = 'spouse' | 'partner' | 'child' | 'dependent'

export interface FamilyMember {
  id: string
  name: string
  relation: FamilyRelation
  age?: number
}

/** The relocated person (employee of a corporate client). */
export interface Assignee {
  id: string
  clientId: string
  name: string
  jobTitle: string
  nationality: CountryCode
  email: string
  family: FamilyMember[]
}

/* ───────────────────────── Clients ───────────────────────── */

export type ClientStatus = 'active' | 'onboarding' | 'inactive'

export interface ClientContact {
  id: string
  name: string
  role: string
  email: string
  phone: string
  primary?: boolean
}

export interface PriceListItem {
  serviceType: ServiceType
  price: number
}

export interface PriceList {
  id: string
  name: string
  currency: CurrencyCode
  validUntil: string
  items: PriceListItem[]
}

export interface Client {
  id: string
  name: string
  legalName: string
  taxId: string
  industry: string
  headquarters: Location
  status: ClientStatus
  accountManagerId: string
  billingCurrency: CurrencyCode
  currencies: CurrencyCode[]
  paymentTermsDays: number
  clientSince: string
  contacts: ClientContact[]
  priceLists: PriceList[]
}

/* ───────────────────────── Projects & services ───────────────────────── */

export type ProjectOperationalStatus = 'onboarding' | 'in-progress' | 'on-hold' | 'completed' | 'cancelled'

export type ProjectFinancialStatus =
  | 'to-quote'
  | 'quoted'
  | 'po-received'
  | 'invoiced'
  | 'partially-collected'
  | 'collected'
  | 'overdue'

export type ServiceType =
  | 'immigration'
  | 'housing'
  | 'schooling'
  | 'moving'
  | 'orientation'
  | 'settling-in'
  | 'tax-advisory'
  | 'departure'

export type ServiceStatus = 'not-started' | 'in-progress' | 'waiting' | 'blocked' | 'completed'

export type StageStatus = 'done' | 'current' | 'pending'

export interface WorkflowStage {
  id: string
  label: string
  status: StageStatus
  /** Completion date when done, target date otherwise. */
  date?: string
}

export interface ProjectService {
  id: string
  projectId: string
  type: ServiceType
  status: ServiceStatus
  ownerId: string
  supplierId?: string
  dueDate: string
  stages: WorkflowStage[]
  /** Agreed sale price, in the project currency. */
  price: number
  /** Expected supplier cost, in the project currency. */
  estimatedCost: number
}

export type RelocationKind = 'long-term' | 'short-term' | 'permanent' | 'repatriation'

export interface Project {
  id: string
  /** Human-facing code, e.g. "REL-2026-0142". */
  code: string
  clientId: string
  assigneeId: string
  kind: RelocationKind
  origin: Location
  destination: Location
  ownerId: string
  operationalStatus: ProjectOperationalStatus
  financialStatus: ProjectFinancialStatus
  currency: CurrencyCode
  startDate: string
  targetDate: string
  purchaseOrder?: string
  services: ProjectService[]
}

/* ───────────────────────── Documents & activity ───────────────────────── */

export type DocumentKind = 'passport' | 'visa' | 'work-permit' | 'residence-card' | 'lease' | 'contract' | 'certificate' | 'insurance'

export type DocumentStatus = 'valid' | 'expiring' | 'expired' | 'in-review' | 'missing'

export interface ProjectDocument {
  id: string
  projectId: string
  serviceId?: string
  name: string
  kind: DocumentKind
  holder: string
  status: DocumentStatus
  uploadedAt?: string
  expiresAt?: string
}

export type ActivityKind = 'status' | 'document' | 'finance' | 'note' | 'service'

export interface ActivityEvent {
  id: string
  projectId: string
  date: string // ISO date-time
  actorId: string
  kind: ActivityKind
  message: string
}

/* ───────────────────────── Finance ───────────────────────── */

export type InvoiceStatus = 'draft' | 'issued' | 'partially-paid' | 'paid' | 'overdue'

export interface Invoice {
  id: string
  number: string
  clientId: string
  projectId: string
  issueDate: string
  dueDate: string
  currency: CurrencyCode
  amount: number
  collected: number
  status: InvoiceStatus
}

export interface Supplier {
  id: string
  name: string
  category: ServiceType
  country: CountryCode
}

export type PayableStatus = 'scheduled' | 'pending-approval' | 'partially-paid' | 'paid' | 'overdue'

export interface SupplierPayable {
  id: string
  reference: string
  supplierId: string
  projectId: string
  serviceId?: string
  issueDate: string
  dueDate: string
  currency: CurrencyCode
  amount: number
  paid: number
  status: PayableStatus
}

export type PaymentDirection = 'incoming' | 'outgoing'

export interface Payment {
  id: string
  direction: PaymentDirection
  date: string
  /** Invoice id for incoming, payable id for outgoing. */
  documentId: string
  counterparty: string
  method: 'transfer' | 'wire' | 'check' | 'card'
  currency: CurrencyCode
  amount: number
}

export interface MonthlyCashflowPoint {
  month: string
  invoiced: number
  collected: number
}

export interface CurrencyIndicator {
  pair: string
  base: CurrencyCode
  quote: CurrencyCode
  rate: number
  changePct: number
}

/* ───────────────────────── Alerts ───────────────────────── */

export type AlertSeverity = 'critical' | 'warning' | 'info'

export interface Alert {
  id: string
  severity: AlertSeverity
  title: string
  description: string
  date: string
  /** In-app route to resolve the alert. */
  href: string
}

export interface Notification {
  id: string
  title: string
  description: string
  date: string
  href: string
  read: boolean
}
