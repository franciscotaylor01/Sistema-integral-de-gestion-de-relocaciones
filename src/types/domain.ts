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

export interface PriceListItem {
  serviceType: ServiceTypeId
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

export type ActivityKind = 'project' | 'status' | 'document' | 'finance' | 'note' | 'service' | 'procedure' | 'task'

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

/* Future commercial documents — shapes only, not implemented in Phase 2. */

export interface Quotation {
  id: string
  projectId: string
  serviceIds: string[]
  currency: CurrencyCode
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
}

export interface PurchaseOrder {
  id: string
  projectId: string
  clientId: string
  number: string
  quotationId?: string
}

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
