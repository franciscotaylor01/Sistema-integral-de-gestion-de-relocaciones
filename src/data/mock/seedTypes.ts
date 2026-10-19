import type { Client, CommercialPolicy, CountryCode, CurrencyCode, PriceEntry, PriceList, ProjectFinancialStatus, QuotationStatus, ProjectOperationalStatus, ProjectRecord, ServiceStatus, TaskStatus } from '@/types/domain'

/*
 * Compact shapes used to author the demo seed. `data/seed.ts` turns them into
 * the normalised domain records (people, participants, services, stages…).
 */

export interface FamilyMemberSeed {
  id: string
  name: string
  relation: 'spouse' | 'partner' | 'child' | 'dependent'
  age?: number
}

/** Employee of a corporate client plus the family that relocates with them. */
export interface Assignee {
  id: string
  clientId: string
  name: string
  jobTitle: string
  nationality: CountryCode
  email: string
  family: FamilyMemberSeed[]
}

export interface ServiceSeed {
  type: string
  status: ServiceStatus
  owner: string
  /** Number of completed workflow stages. */
  done: number
  due: string
  price: number
  cost: number
  supplier?: string
}

export interface ProjectSeed
  extends Pick<ProjectRecord, 'id' | 'code' | 'clientId' | 'origin' | 'destination' | 'ownerId' | 'currency' | 'startDate' | 'targetDate' | 'purchaseOrder'> {
  assigneeId: string
  kind: ProjectRecord['category']
  operationalStatus: ProjectOperationalStatus
  financialStatus: ProjectFinancialStatus
  services: ServiceSeed[]
}

export interface ProcedureSeed {
  id: string
  serviceId: string
  typeId: string
  /** Assignee id or family member id from assignees.ts. */
  personRef: string
  owner: string
  status: ServiceStatus
  done: number
  start: string
  due: string
  reference?: string
}

export interface TaskSeed {
  id: string
  serviceId: string
  procedureId?: string
  title: string
  description?: string
  owner: string
  status: TaskStatus
  waitingOn?: string
  due?: string
  completedAt?: string
}

/** Client as authored in Phase 1 mocks (price lists inline). */
export type ClientSeed = Omit<Client, 'policy' | 'billingAddress' | 'notes'> & { priceLists: PriceList[] }

export interface ClientCommercialSeed {
  billingAddress: string
  policy: CommercialPolicy
  notes?: string
}

export type PriceEntrySeed = Omit<PriceEntry, 'createdAt' | 'updatedAt'>

export interface QuotationSeed {
  id: string
  number: string
  version: number
  previousVersionId?: string
  projectId: string
  status: QuotationStatus
  issueDate: string
  validUntil: string
  sentAt?: string
  approvedAt?: string
  approvedBy?: string
  rejectionReason?: string
  supersededById?: string
  /** Unit price overrides by service id (default: the service's agreed price). */
  prices?: Record<string, number>
  notes?: string
}

export interface PurchaseOrderSeed {
  id: string
  internalNumber: string
  clientPoNumber: string
  projectId: string
  quotationId: string
  issueDate: string
  receivedDate: string
  authorizedAmount: number
  /** Allocations by service id. */
  allocations: Record<string, number>
  documentLabel?: string
}

/* Phase 1 flat finance shapes — kept to author seeds and migrate stored v3 data. */

export interface LegacySupplier {
  id: string
  name: string
  category: string
  country: CountryCode
}

export interface LegacyInvoice {
  id: string
  number: string
  clientId: string
  projectId: string
  issueDate: string
  dueDate: string
  currency: CurrencyCode
  amount: number
  collected: number
  status: 'draft' | 'issued' | 'partially-paid' | 'paid' | 'overdue'
}

export interface LegacyPayable {
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
  status: 'scheduled' | 'pending-approval' | 'partially-paid' | 'paid' | 'overdue'
}

export interface LegacyPayment {
  id: string
  direction: 'incoming' | 'outgoing'
  date: string
  documentId: string
  counterparty: string
  method: 'transfer' | 'wire' | 'check' | 'card'
  currency: CurrencyCode
  amount: number
}
