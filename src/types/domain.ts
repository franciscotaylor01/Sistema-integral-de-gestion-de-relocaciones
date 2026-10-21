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
  /**
   * Phase 4.6 purchase-order modality. "open": standing PO per client/province
   * authorising catalog items (no consumable balance); "project": PO amounts per
   * project; "none": no PO. Absent on older data → derived from requiresPurchaseOrder.
   */
  poMode?: PoMode
  /** Invoicing requires an approved certificate from the client's portal. */
  requiresCertificate?: boolean
  /** Phase 4.7: payment term counted in calendar or business days (default calendar). */
  paymentDayType?: PaymentDayType
}

export type PoMode = 'open' | 'project' | 'none'

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
  /** Main services Relocare offers this client (absent = all active services). */
  offeredServices?: ServiceTypeId[]
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
  /** Phase 4.6: sub-service (catalog item) this price is for; absent = whole service. */
  itemId?: string
  /** Contract / agreement the price comes from. */
  agreement?: string
  /** Commercial approval. Approved prices are never edited: a change creates a new version. */
  approvedAt?: string
  approvedBy?: string
  approvalRef?: string
  supersedesId?: string
  supersededById?: string
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
  /** Phase 4.6: province / region the work is authorised for, and the open PO applied. */
  province?: string
  openOrderId?: string
  /** Explicit per-project exception to the client's commercial policy. */
  commercialException?: { poMode?: PoMode; requiresCertificate?: boolean; reason: string }
  /** Phase 4.8: cost closure (absent = open). Closed ≠ paid. */
  costClosure?: CostClosure
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
  /** Agreed sale price (project currency). With sub-service items it equals their total. */
  price?: number
  /** Phase 4.6: contracted sub-services with their frozen (historical) prices. */
  items?: ServiceItem[]
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

/* ───────────────────────── Finance (Phase 4) ───────────────────────── */

/** Relocare legal entity that issues invoices. Tax ids are never invented. */
export interface LegalEntity {
  id: string
  name: string
  country: CountryCode
  /** Left empty in the demo: real fiscal identifiers must be loaded by the client. */
  taxId?: string
  defaultCurrency: CurrencyCode
}

/** Invoice document type (labels only; no fiscal semantics in SIGR). */
export type InvoiceKind = 'A' | 'B' | 'E' | 'foreign'

/** Lifecycle state. Paid / partially paid / overdue are derived, never stored. */
export type InvoiceLifecycle = 'draft' | 'issued' | 'cancelled'

/** Display status derived from lifecycle, receipts and due date. */
export type InvoiceStatus = 'draft' | 'issued' | 'partially-paid' | 'paid' | 'overdue' | 'cancelled'

export interface InvoiceLine {
  id: string
  /** Contracted service billed by this line (required unless `reimbursable`). */
  serviceId?: string
  /** Approved commercial record the line bills. */
  quotationId?: string
  purchaseOrderId?: string
  description: string
  quantity: number
  unitPrice: number
  /** Pass-through expense not covered by the commercial approval (explicit). */
  reimbursable?: boolean
  /** Phase 4.6 breakdown and traceability. */
  serviceItemId?: string
  openOrderId?: string
  certificateId?: string
}

export interface TaxComponent {
  id: string
  /** e.g. "IVA 21 %" — entered by the user; SIGR does not determine taxes. */
  label: string
  ratePct: number
}

export interface Invoice {
  id: string
  /** SIGR internal reference: "FC-2026-0042". */
  number: string
  /** Number of the externally issued (fiscal) document, if any. */
  externalRef?: string
  issuerId: string
  kind: InvoiceKind
  clientId: string
  projectId: string
  issueDate: string
  dueDate: string
  currency: CurrencyCode
  lines: InvoiceLine[]
  taxes: TaxComponent[]
  lifecycle: InvoiceLifecycle
  notes?: string
  createdAt: string
  createdBy: string
  issuedAt?: string
  cancelledAt?: string
  cancelReason?: string
  /** Migrated from the Phase 1 flat invoice records. */
  legacy?: boolean
  /** Phase 4.7: data of the externally issued fiscal document (absent until confirmed). */
  fiscal?: InvoiceFiscal
  /** Payment terms applied and resulting due date, frozen at emission. */
  paymentTerms?: InvoicePaymentTerms
  history?: InvoiceEvent[]
}

export type PaymentDayType = 'calendar' | 'business'

export interface PaymentTerms {
  days: number
  dayType: PaymentDayType
}

export interface InvoicePaymentTerms extends PaymentTerms {
  source: 'purchase-order' | 'open-order' | 'client' | 'manual'
  sourceRef?: string
  /** Documented reason (manual terms or due-date exception). */
  reason?: string
  /** Due date computed from the fiscal issue date. */
  computedDueDate: string
  /** Set when the due date was changed by a justified exception. */
  exception?: { dueDate: string; reason: string; date: string }
}

/** Snapshot of the fiscal document issued outside SIGR (ARCA). SIGR never computes fiscal amounts. */
export interface InvoiceFiscal {
  voucherType: InvoiceKind
  pointOfSale: string
  number: string
  issueDate: string
  /** Total on the fiscal document, as entered. */
  total: number
  currency: CurrencyCode
  notes?: string
  reference?: string
  confirmedAt: string
  /** Commercial lines and totals at the moment of emission. */
  linesSnapshot: InvoiceLine[]
  commercialSubtotal: number
  commercialTotal: number
}

export interface InvoiceEvent {
  id: string
  date: string
  actorId: string
  action: string
  detail?: string
}

export type PaymentMethod = 'transfer' | 'wire' | 'check' | 'card' | 'cash'

/** Exchange-rate metadata kept with a transaction (informative, no conversion). */
export interface FxMeta {
  exchangeRateId?: string
  note?: string
}

export interface ReceiptAllocation {
  id: string
  invoiceId: string
  amount: number
  date: string
}

/**
 * Money received from a client. Allocated to one or more invoices of the same
 * currency; any unallocated remainder is an explicit client credit.
 */
export interface CustomerReceipt {
  id: string
  number: string
  clientId: string
  date: string
  currency: CurrencyCode
  amount: number
  method: PaymentMethod
  reference?: string
  notes?: string
  allocations: ReceiptAllocation[]
  /** Phase 4.7: tax withholdings documented by the client (entered manually, never computed). */
  withholdings?: Withholding[]
  fx?: FxMeta
  status: 'recorded' | 'reversed'
  reversedAt?: string
  reversalReason?: string
  createdAt: string
  createdBy: string
}

export type CollectionActionKind = 'call' | 'email' | 'meeting' | 'promise' | 'note'

export interface CollectionAction {
  id: string
  invoiceId: string
  clientId: string
  date: string
  actorId: string
  kind: CollectionActionKind
  text: string
  /** Payment date promised by the client, if any. */
  promisedDate?: string
}

/* Suppliers & costs */

export type SupplierKind = 'company' | 'professional'

/** When a supplier obligation becomes payable. */
export type PaymentCondition = 'due-date' | 'after-client-collection'

export interface Supplier {
  id: string
  name: string
  kind: SupplierKind
  country: CountryCode
  contactName?: string
  email?: string
  phone?: string
  preferredCurrency: CurrencyCode
  /** Service categories the supplier covers. */
  categories: ServiceTypeId[]
  /** Placeholder only — no real banking data in the demo. */
  paymentDetails?: string
  /** Default rule for new obligations (configurable per obligation). */
  defaultPaymentCondition: PaymentCondition
  active: boolean
  notes?: string
  /** Phase 4.8: creation time (absent on suppliers created before; listed last). */
  createdAt?: string
}

/** Agreed amount for a supplier's work on a contracted service (e.g. a professional's fee). */
export interface SupplierAgreement {
  id: string
  supplierId: string
  projectId: string
  serviceId?: string
  description: string
  currency: CurrencyCode
  agreedAmount: number
  paymentCondition: PaymentCondition
  notes?: string
  createdAt: string
}

export type CostCategory = 'supplier-fee' | 'professional-services' | 'moving' | 'migration' | 'other-direct' | 'general-expense'

/**
 * An actually incurred cost. Project-direct costs carry a project (and usually a
 * service); general company expenses have no project and are kept separate.
 * Estimates live on services (`estimatedCost`) and agreements, never here.
 */
export interface CostRecord {
  id: string
  scope: 'project' | 'company'
  projectId?: string
  serviceId?: string
  supplierId?: string
  category: CostCategory
  description: string
  currency: CurrencyCode
  amount: number
  date: string
  status: 'incurred' | 'void'
  voidReason?: string
  /** Phase 4.8 general (indirect) expenses: accounting period, editable category and payment state. */
  period?: string
  overheadCategory?: string
  paymentStatus?: 'pending' | 'paid'
  paidAt?: string
  paymentRef?: string
  notes?: string
  createdAt: string
  createdBy: string
}

export type ObligationLifecycle = 'pending-approval' | 'approved' | 'cancelled'

/** Derived display status of a supplier obligation. */
export type PayableStatus = 'pending-approval' | 'scheduled' | 'partially-paid' | 'paid' | 'overdue' | 'cancelled' | 'awaiting-collection'

/** Amount owed to a supplier (normally its invoice). Payments are separate records. */
export interface SupplierObligation {
  id: string
  /** Supplier's document number (its invoice). */
  reference: string
  supplierId: string
  projectId?: string
  serviceId?: string
  /** Incurred cost this obligation represents. */
  costId: string
  agreementId?: string
  description: string
  issueDate: string
  dueDate: string
  currency: CurrencyCode
  amount: number
  paymentCondition: PaymentCondition
  /** Client invoice whose collection releases the payment (after-client-collection). */
  clientInvoiceId?: string
  lifecycle: ObligationLifecycle
  notes?: string
  cancelReason?: string
  createdAt: string
  createdBy: string
}

export interface SupplierPaymentAllocation {
  id: string
  obligationId: string
  amount: number
  /** Explicit reason when paying before the agreed condition is met. */
  conditionOverride?: string
  /** Phase 4.8: "advance" = later application of an advance (no new cash outflow). Absent = applied when paying. */
  source?: 'payment' | 'advance'
  date?: string
  /** Corrections of an advance application keep the record. */
  reversedAt?: string
  reversalReason?: string
}

/** Money paid to a supplier; the unallocated remainder is an explicit advance. */
export interface SupplierPayment {
  id: string
  number: string
  supplierId: string
  date: string
  currency: CurrencyCode
  amount: number
  method: PaymentMethod
  reference?: string
  notes?: string
  allocations: SupplierPaymentAllocation[]
  /** Phase 4.8: project (and service) the unallocated remainder (advance) belongs to. */
  projectId?: string
  serviceId?: string
  history?: { id: string; date: string; action: string; detail?: string }[]
  fx?: FxMeta
  status: 'recorded' | 'reversed'
  reversedAt?: string
  reversalReason?: string
  createdAt: string
  createdBy: string
}

/** Recorded exchange rate. Corrections create a new record that supersedes the old. */
export interface ExchangeRate {
  id: string
  base: CurrencyCode
  quote: CurrencyCode
  /** Units of quote per 1 base, as entered (decimal string). */
  rate: string
  effectiveDate: string
  source: string
  notes?: string
  supersedesId?: string
  supersededById?: string
  createdAt: string
  createdBy: string
}

/** Append-only audit trail of financial changes. */
export interface AuditEvent {
  id: string
  date: string
  actorId: string
  entity: 'invoice' | 'receipt' | 'cost' | 'obligation' | 'supplier-payment' | 'supplier' | 'exchange-rate' | 'agreement' | 'settlement'
  entityId: string
  action: string
  detail: string
  projectId?: string
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
  /** Phase 4.7: payment condition stated on the PO (takes precedence over the client's). */
  paymentTerms?: PaymentTerms
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

/* ───────────── Phase 4.5 — Eugenia–Florencia settlements ───────────── */

/**
 * How the partner's (Florencia's) share is determined. No default split is
 * assumed: without a rule the settlement stays "Pendiente de configurar".
 */
export type SettlementMethod = 'percentage' | 'fixed' | 'by-service'

/** Per-service component (method "by-service"): a % of that service's base or a fixed amount. */
export interface SettlementComponent {
  id: string
  serviceId: string
  method: 'percentage' | 'fixed'
  /** Partner % of the service base (0–100, up to 2 decimals). */
  pct?: number
  amount?: number
}

export interface SettlementRule {
  method: SettlementMethod
  pct?: number
  amount?: number
  components: SettlementComponent[]
}

/**
 * When the partner share becomes payable: proportionally to what the client
 * actually paid, or on explicitly recorded releases (another agreed condition).
 */
export type SettlementRelease = 'after-collection' | 'manual'

export interface SettlementAdjustment {
  id: string
  date: string
  /** Signed: + increases the partner share, − decreases it. */
  amount: number
  reason: string
  actorId: string
}

export interface SettlementReleaseEntry {
  id: string
  date: string
  amount: number
  reason: string
  actorId: string
}

/** Immutable snapshot of a confirmed settlement (historical record). */
export interface SettlementConfirmation {
  id: string
  date: string
  actorId: string
  netRevenue: number
  directCosts: number
  base: number
  partnerShare: number
  ownerShare: number
  releasable: number
  partnerInvoiced: number
  partnerPaid: number
  note?: string
}

export interface SettlementHistoryEntry {
  id: string
  date: string
  actorId: string
  action: string
  reason?: string
}

export interface ProjectSettlement {
  id: string
  projectId: string
  /** The partner, reusing the supplier record (Florencia). */
  supplierId: string
  currency: CurrencyCode
  rule?: SettlementRule
  release: SettlementRelease
  releaseNote?: string
  releases: SettlementReleaseEntry[]
  adjustments: SettlementAdjustment[]
  /** Partner invoices (supplier obligations) that document this share. */
  obligationIds: string[]
  confirmations: SettlementConfirmation[]
  history: SettlementHistoryEntry[]
  notes?: string
  createdAt: string
  createdBy: string
}

/* ───────────── Phase 4.6 — hierarchical catalog, open POs, certificates ───────────── */

/** Billable sub-service of a main service (commercial item, not an operational task). */
export interface CatalogItem {
  id: string
  serviceTypeId: ServiceTypeId
  name: string
  description?: string
  unit: PriceUnit
  active: boolean
  createdAt: string
}

/** A contracted sub-service inside a project service, with its price frozen at contracting time. */
export interface ServiceItem {
  id: string
  catalogItemId: string
  name: string
  unit: PriceUnit
  quantity: number
  unitPrice: number
  /** Where the price came from (open PO item, tariff entry or manual). */
  source: 'open-order' | 'tariff' | 'manual'
  sourceRef?: string
}

export type OpenOrderStatus = 'active' | 'suspended' | 'expired' | 'cancelled'

export interface OpenOrderItem {
  id: string
  serviceTypeId: ServiceTypeId
  /** Absent = the main service billed as a single line. */
  catalogItemId?: string
  unit: PriceUnit
  unitPrice: number
}

/** Standing purchase order by client and province: authorises items, reusable without balance. */
export interface OpenPurchaseOrder {
  id: string
  /** Official number on the client's document. */
  number: string
  clientId: string
  province: string
  currency: CurrencyCode
  validFrom: string
  validTo?: string
  status: OpenOrderStatus
  conditions?: string
  paymentTerms?: PaymentTerms
  items: OpenOrderItem[]
  documentRef: string
  createdAt: string
  createdBy: string
}

export type CertificateStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface CertificateLine {
  id: string
  serviceId: string
  /** Contracted sub-service; absent for services billed as a single line. */
  serviceItemId?: string
  description: string
  quantity: number
  unitPrice: number
}

/** Client certificate (generated on the client's external portal; SIGR only records it). */
export interface Certificate {
  id: string
  /** Internal "CER-2026-0001". */
  number: string
  externalNumber?: string
  clientId: string
  projectId: string
  openOrderId?: string
  purchaseOrderId?: string
  currency: CurrencyCode
  lines: CertificateLine[]
  status: CertificateStatus
  createdAt: string
  submittedAt?: string
  approvedAt?: string
  rejectedAt?: string
  rejectionReason?: string
  /** Explicit correction allowing items already certified to be certified again. */
  correctionReason?: string
  notes?: string
  documentRef: string
  history: { id: string; date: string; actorId: string; action: string; reason?: string }[]
}

/* ───────────── Phase 4.7 — withholdings and attachments ───────────── */

export type WithholdingType = 'iva' | 'ganancias' | 'iibb' | 'other'

/** Withholding applied by the client to an invoice, as documented (not money received). */
export interface Withholding {
  id: string
  type: WithholdingType
  invoiceId: string
  amount: number
  jurisdiction?: string
  certificateRef?: string
  notes?: string
  createdAt: string
}

export type AttachmentEntity = 'invoice' | 'receipt' | 'withholding'

/**
 * Document evidence. "indexeddb": the file is stored in this browser only;
 * "reference": only a reference was recorded (no file stored).
 */
export interface Attachment {
  id: string
  entity: AttachmentEntity
  entityId: string
  name: string
  mime?: string
  size?: number
  storage: 'indexeddb' | 'reference'
  reference?: string
  createdAt: string
  createdBy: string
}

/** Explicit confirmation that all known project costs are registered. No user identity is stored (no auth yet). */
export interface CostClosure {
  status: 'open' | 'closed'
  closedAt?: string
  notes?: string
  history: { id: string; date: string; action: string; reason?: string }[]
}
