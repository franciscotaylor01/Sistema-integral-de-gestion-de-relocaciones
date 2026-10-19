import type {
  ActivityEvent,
  Alert,
  Client,
  CurrencyIndicator,
  Invoice,
  Payment,
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
export const SCHEMA_VERSION = 2

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
  /** Idempotency keys of processed create requests → created record id. */
  requests: Record<string, string>
}
