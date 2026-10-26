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
  SettlementBatch,
  TariffImport,
  CommercialCommunication,
  DocumentTemplate,
  InitialDocument,
  PoImportRecord,
  PoComparisonReview,
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
export const SCHEMA_VERSION = 15

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
  /** Phase 4.9 — grouped settlements to the partner (Florencia). */
  settlementBatches: SettlementBatch[]
  /** Phase 5.0A — Excel tariff import history. */
  tariffImports: TariffImport[]
  /** Phase 5.0B — manually registered quotation / tariff sendings. */
  communications: CommercialCommunication[]
  /** Phase 5.0B — beneficiary document templates (global) and their requests per project. */
  documentTemplates: DocumentTemplate[]
  initialDocuments: InitialDocument[]
  /** Phase 5.0C.1 — validated PO document imports. */
  poImports: PoImportRecord[]
  /** Phase 5.0C.2 — decisions on PO vs quotation differences. */
  poReviews: PoComparisonReview[]
  currencyIndicators: CurrencyIndicator[]
  alerts: Alert[]
  /** Phase 3 — commercial management. */
  priceEntries: PriceEntry[]
  quotations: Quotation[]
  purchaseOrders: PurchaseOrder[]
  /** Idempotency keys of processed create requests → created record id. */
  requests: Record<string, string>
}
