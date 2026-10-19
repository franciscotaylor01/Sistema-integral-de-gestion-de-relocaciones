import type {
  ActivityEvent,
  Alert,
  Client,
  CurrencyIndicator,
  Invoice,
  Payment,
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
  SupplierPayable,
  Task,
} from '@/types/domain'

/** Bump when the persisted shape changes; older stored data is discarded safely. */
export const SCHEMA_VERSION = 3

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
  invoices: Invoice[]
  payables: SupplierPayable[]
  payments: Payment[]
  currencyIndicators: CurrencyIndicator[]
  alerts: Alert[]
  /** Phase 3 — commercial management. */
  priceEntries: PriceEntry[]
  quotations: Quotation[]
  purchaseOrders: PurchaseOrder[]
  /** Idempotency keys of processed create requests → created record id. */
  requests: Record<string, string>
}
