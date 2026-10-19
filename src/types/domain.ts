/*
 * SIGR domain model. Shapes mirror the future database tables (Supabase):
 * ids are plain strings, dates are ISO 8601 ("YYYY-MM-DD" or full date-time),
 * and relationships are explicit foreign keys — records are never duplicated.
 *
 *   Client 1─* Project 1─* ProjectService 1─* Procedure
 *                 │             │                 │
 *                 │             └──── Task ───────┘   (task → project + service [+ procedure])
 *                 └─* ProjectParticipant *─1 Person
 *
 * The Project (a relocation) is the central entity. Each contracted service
 * has its own workflow, owner, supplier, dates and status. Migration-type
 * services hold procedures (DNI, TIE, residencia…), each with its own workflow.
 */

export type CurrencyCode = 'USD' | 'EUR' | 'ARS' | 'BRL' | 'MXN' | 'GBP' | 'CLP'

export type CountryCode =
  | 'AR' | 'BR' | 'CL' | 'CO' | 'MX' | 'UY' | 'US' | 'CA'
  | 'ES' | 'DE' | 'FR' | 'NL' | 'GB' | 'CH' | 'JP'

export interface Location {
  country: CountryCode
  city: string
}

/* ───────────────────────── Staff (Relocare team) ───────────────────────── */

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

/* ───────────────────────── People & participants ───────────────────────── */

/** A human being relocated (employee or family member). Independent of projects. */
export interface Person {
  id: string
  name: string
  nationality: CountryCode
  email?: string
  jobTitle?: string
  /** Approximate age, used for schooling. */
  age?: number
  /** Corporate client employing this person, when applicable. */
  employerId?: string
}

export type ParticipantRole = 'beneficiary' | 'spouse' | 'partner' | 'child' | 'dependent'

/** Links a person to a project with a role. A person can join many projects over time. */
export interface ProjectParticipant {
  id: string
  projectId: string
  personId: string
  role: ParticipantRole
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

/** Legacy Phase 1/2 price list shape — kept only for seeds and storage migration. */
export interface PriceListItem {
  serviceType: ServiceTypeId
  price: number
}

/** @deprecated Phase 1/2 shape; migrated into `PriceEntry` records (schema v3). */
export interface PriceList {
  id: string
  name: string
  currency: CurrencyCode
  validUntil: string
  items: PriceListItem[]
}

/** When a contracted service may be billed, per the client agreement. */
export type BillingMilestone = 'quote-approved' | 'service-started' | 'service-completed'

/** Configurable commercial rules agreed with each client. */
export interface CommercialPolicy {
  /** Some clients require a purchase order before invoicing; others do not. */
  requiresPurchaseOrder: boolean
  /** Work must be covered by an approved quotation before invoicing. */
  requiresApprovedQuote: boolean
  billingMilestone: BillingMilestone
  /** Days a sent quotation stays valid by default. */
  quoteValidityDays: number
}

export interface Client {
  id: string
  name: string
  legalName: string
  taxId: string
  industry: string
  headquarters: Location
  billingAddress: string
  status: ClientStatus
  accountManagerId: string
  billingCurrency: CurrencyCode
  currencies: CurrencyCode[]
  paymentTermsDays: number
  clientSince: string
  contacts: ClientContact[]
  policy: CommercialPolicy
  notes?: string
}

/* ───────────────────────── Pricing ───────────────────────── */

export type PriceUnit = 'service' | 'person' | 'family' | 'hour' | 'month' | 'session' | 'document'

/** Market a price applies to: a destination country or any market. */
export type PriceMarket = CountryCode | 'ANY'

/**
 * One negotiated price rule. Rules are matched by client, service, market,
 * currency, validity and minimum quantity; overlaps are surfaced, never
 * resolved silently.
 */
export interface PriceEntry {
  id: string
  clientId: string
  serviceTypeId: ServiceTypeId
  market: PriceMarket
  currency: CurrencyCode
  unitPrice: number
  unit: PriceUnit
  /** Quantity tier: applies from this quantity upwards. */
  minQuantity: number
  validFrom: string
  validTo?: string
  active: boolean
  /** Contract / agreement the price comes from. */
  agreement?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

/* ───────────────────────── Workflows ───────────────────────── */

/** Key of an entry in the service catalog (src/config/serviceCatalog.ts). */
export type ServiceTypeId = string
/** Kept for readability at call sites. */
export type ServiceType = ServiceTypeId
/** Key of an entry in the procedure catalog (src/config/procedureCatalog.ts). */
export type ProcedureTypeId = string

export type StageStatus = 'pending' | 'current' | 'done'

/** A workflow stage instance, owned by a service or a procedure. */
export interface WorkflowStage {
  id: string
  /** Template stage key; custom stages use a generated key. */
  key: string
  label: string
  status: StageStatus
  dueDate?: string
  completedAt?: string
  ownerId?: string
  notes?: string
}

export interface OperationalNote {
  id: string
  authorId: string
  date: string // ISO date-time
  text: string
}

/* ───────────────────────── Projects, services & procedures ───────────────────────── */

export type ProjectOperationalStatus = 'onboarding' | 'in-progress' | 'on-hold' | 'completed' | 'cancelled'

export type ProjectFinancialStatus =
  | 'to-quote'
  | 'quoted'
  | 'po-received'
  | 'invoiced'
  | 'partially-collected'
  | 'collected'
  | 'overdue'

export type ProjectCategory = 'long-term' | 'short-term' | 'permanent' | 'repatriation'
/** @deprecated alias kept for Phase 1 call sites. */
export type RelocationKind = ProjectCategory

export type ServiceStatus = 'not-started' | 'in-progress' | 'waiting' | 'blocked' | 'completed'

/** References to future commercial/financial documents (Phase 3+). No logic yet. */
export interface FinancialRefs {
  priceListId?: string
  quotationId?: string
  purchaseOrderId?: string
  invoiceIds?: string[]
  supplierPayableIds?: string[]
}

/** Persisted project record. Services, people and tasks live in their own collections. */
export interface ProjectRecord {
  id: string
  /** Human-facing code, e.g. "REL-2026-0142". Unique and stable. */
  code: string
  clientId: string
  /** Person id of the primary employee / beneficiary. */
  beneficiaryId: string
  category: ProjectCategory
  origin: Location
  destination: Location
  ownerId: string
  operationalStatus: ProjectOperationalStatus
  financialStatus: ProjectFinancialStatus
  currency: CurrencyCode
  startDate: string
  targetDate: string
  completedAt?: string
  notes?: string
  purchaseOrder?: string
  financial?: FinancialRefs
  createdAt: string
  updatedAt: string
}

/** Persisted contracted service. */
export interface ServiceRecord {
  id: string
  projectId: string
  typeId: ServiceTypeId
  templateId: string
  status: ServiceStatus
  ownerId: string
  supplierId?: string
  startDate: string
  dueDate: string
  completedAt?: string
  stages: WorkflowStage[]
  notes: OperationalNote[]
  /** Agreed sale price (project currency). Reference only, no calculations yet. */
  price?: number
  /** Expected supplier cost (project currency). Reference only. */
  estimatedCost?: number
  financial?: FinancialRefs
}

/** A procedure inside a (migration-type) service, for one person. */
export interface Procedure {
  id: string
  projectId: string
  serviceId: string
  typeId: ProcedureTypeId
  templateId: string
  personId: string
  ownerId: string
  status: ServiceStatus
  /** Agency file / appointment number. */
  reference?: string
  startDate: string
  dueDate?: string
  completedAt?: string
  stages: WorkflowStage[]
  notes: OperationalNote[]
}

/** Service as consumed by screens: record + its procedures. */
export interface ProjectService extends ServiceRecord {
  /** @deprecated use `typeId`. */
  type: ServiceTypeId
  procedures: Procedure[]
}

/** Project as consumed by screens: record + joined services. */
export interface Project extends ProjectRecord {
  services: ProjectService[]
}

/* ───────────────────────── Tasks ───────────────────────── */

export type TaskStatus = 'todo' | 'in-progress' | 'waiting' | 'done'

/** Always linked to a project and a service (and optionally a procedure / stage). */
export interface Task {
  id: string
  projectId: string
  serviceId: string
  procedureId?: string
  stageId?: string
  title: string
  description?: string
  ownerId: string
  status: TaskStatus
  /** Third party the task is waiting on (consulate, client, supplier…). */
  waitingOn?: string
  dueDate?: string
  createdAt: string
  createdBy: string
  completedAt?: string
}

/* ───────────────────────── Documents & activity ───────────────────────── */

export type DocumentKind = 'passport' | 'visa' | 'work-permit' | 'residence-card' | 'lease' | 'contract' | 'certificate' | 'insurance'

export type DocumentStatus = 'valid' | 'expiring' | 'expired' | 'in-review' | 'missing'

export interface ProjectDocument {
  id: string
  projectId: string
  serviceId?: string
  procedureId?: string
  name: string
  kind: DocumentKind
  holder: string
  status: DocumentStatus
  uploadedAt?: string
  expiresAt?: string
}

export type ActivityKind = 'project' | 'status' | 'document' | 'finance' | 'note' | 'service' | 'procedure' | 'task' | 'commercial'

export interface ActivityEvent {
  id: string
  projectId: string
  serviceId?: string
  procedureId?: string
  taskId?: string
  date: string // ISO date-time
  actorId: string
  kind: ActivityKind
  message: string
}

/* ───────────────────────── Finance (records shown in Phase 1 previews) ───────────────────────── */

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
  category: ServiceTypeId
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

export interface CurrencyIndicator {
  pair: string
  base: CurrencyCode
  quote: CurrencyCode
  rate: number
  changePct: number
}

/* ───────────────────────── Commercial: quotations & purchase orders ───────────────────────── */

export type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired'

export type PriceSource = 'price-list' | 'adjusted' | 'manual'

/** Quotation line. Amounts are a frozen snapshot: tariff changes never alter them. */
export interface QuotationLine {
  id: string
  /** Contracted service this line prices (optional for extra items). */
  serviceId?: string
  serviceTypeId: ServiceTypeId
  description: string
  quantity: number
  unit: PriceUnit
  unitPrice: number
  currency: CurrencyCode
  priceSource: PriceSource
  /** Price rule used for the suggestion, if any. */
  priceEntryId?: string
  /** Tariff price suggested when the line was built (for adjustment audit). */
  suggestedUnitPrice?: number
  adjustmentReason?: string
  notes?: string
}

export interface Quotation {
  id: string
  /** Shared by all versions: "COT-2026-0007". */
  number: string
  version: number
  /** Id of the version this one was derived from. */
  previousVersionId?: string
  projectId: string
  clientId: string
  status: QuotationStatus
  issueDate: string
  validUntil: string
  lines: QuotationLine[]
  notes?: string
  createdAt: string
  createdBy: string
  sentAt?: string
  approvedAt?: string
  /** Client-side approver (name / reference of the acceptance). */
  approvedBy?: string
  rejectedAt?: string
  rejectionReason?: string
  /** Set when a later approved version replaces this one. */
  supersededById?: string
}

export type PurchaseOrderStatus = 'active' | 'cancelled'

/** Portion of a PO authorised for one contracted service. */
export interface PoAllocation {
  id: string
  serviceId: string
  amount: number
  notes?: string
}

export interface PurchaseOrder {
  id: string
  /** Relocare internal reference: "OCI-2026-0004". */
  internalNumber: string
  /** Number on the client's document; unique per client among active POs. */
  clientPoNumber: string
  clientId: string
  projectId: string
  /** Approved quotation the PO responds to, when applicable. */
  quotationId?: string
  issueDate: string
  receivedDate: string
  currency: CurrencyCode
  authorizedAmount: number
  allocations: PoAllocation[]
  status: PurchaseOrderStatus
  /** Stable reference reserved for the PO document (storage arrives later). */
  documentRef: string
  /** Label of the linked document once registered (file name, DMS id…). */
  documentLabel?: string
  notes?: string
  cancelReason?: string
  createdAt: string
  createdBy: string
}

/* Future financial documents — shapes only, not implemented yet. */

export interface FinancialSettlement {
  id: string
  projectId: string
  currency: CurrencyCode
  period: string
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
