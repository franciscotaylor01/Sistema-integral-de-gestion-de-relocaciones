import type {
  AuditEvent,
  CollectionAction,
  CostRecord,
  CustomerReceipt,
  ExchangeRate,
  ProjectSettlement,
  CatalogItem,
  OpenPurchaseOrder,
  Certificate,
  Attachment,
  LegalEntity,
  SupplierAgreement,
  SupplierObligation,
  SupplierPayment,
  ActivityEvent,
  Alert,
  Client,
  CurrencyIndicator,
  Invoice,
  PriceEntry,
  PurchaseOrder,
  Quotation,
  Person,
  Procedure,
  ProjectDocument,
  ProjectParticipant,
  ProjectRecord,
  ServiceRecord,
  StaffMember,
  Supplier,
  Task,
} from '@/types/domain'

/** Bump when the persisted shape changes; older stored data is discarded safely. */
export const SCHEMA_VERSION = 8

/** Normalised application state. One collection per future database table. */
export interface Dataset {
  schemaVersion: number
  staff: StaffMember[]
  clients: Client[]
  suppliers: Supplier[]
  people: Person[]
  participants: ProjectParticipant[]
  projects: ProjectRecord[]
  services: ServiceRecord[]
  procedures: Procedure[]
  tasks: Task[]
  activity: ActivityEvent[]
  documents: ProjectDocument[]
  /** Phase 4 — financial management. */
  legalEntities: LegalEntity[]
  invoices: Invoice[]
  receipts: CustomerReceipt[]
  collectionActions: CollectionAction[]
  agreements: SupplierAgreement[]
  costs: CostRecord[]
  obligations: SupplierObligation[]
  supplierPayments: SupplierPayment[]
  exchangeRates: ExchangeRate[]
  audit: AuditEvent[]
  /** Phase 4.5 — Eugenia–Florencia settlements. */
  settlements: ProjectSettlement[]
  /** Phase 4.6 — hierarchical catalog, open POs and certificates. */
  catalogItems: CatalogItem[]
  openOrders: OpenPurchaseOrder[]
  certificates: Certificate[]
  /** Phase 4.7 — document evidence metadata (files live in IndexedDB). */
  attachments: Attachment[]
  currencyIndicators: CurrencyIndicator[]
  alerts: Alert[]
  /** Phase 3 — commercial management. */
  priceEntries: PriceEntry[]
  quotations: Quotation[]
  purchaseOrders: PurchaseOrder[]
  /** Idempotency keys of processed create requests → created record id. */
  requests: Record<string, string>
}
