import { useEffect, useSyncExternalStore } from 'react'
import { DEMO_TODAY } from '@/config/brand'
import { invoiceFinancials, obligationFinancials, type InvoiceFinancials, type ObligationFinancials } from '@/domain/finance/derive'
import type { Dataset } from '@/domain/dataset'
import { workspaceStore } from '@/services/workspaceStore'
import type {
  ActivityEvent,
  Alert,
  Client,
  CurrencyIndicator,
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
  Invoice,
  LegalEntity,
  SupplierAgreement,
  SupplierObligation,
  SupplierPayment,
  Person,
  PriceEntry,
  PurchaseOrder,
  Quotation,
  Procedure,
  Project,
  ProjectDocument,
  ProjectParticipant,
  ProjectService,
  StaffMember,
  Supplier,
  Task,
} from '@/types/domain'

/** Read model for screens: dataset collections, joined projects and id lookups. */
export interface Workspace {
  dataset: Dataset
  projects: Project[]
  services: ProjectService[]
  procedures: Procedure[]
  tasks: Task[]
  clients: Client[]
  people: Person[]
  participants: ProjectParticipant[]
  staff: StaffMember[]
  suppliers: Supplier[]
  documents: ProjectDocument[]
  activity: ActivityEvent[]
  legalEntities: LegalEntity[]
  invoices: Invoice[]
  receipts: CustomerReceipt[]
  collectionActions: CollectionAction[]
  agreements: SupplierAgreement[]
  costs: CostRecord[]
  obligations: SupplierObligation[]
  supplierPayments: SupplierPayment[]
  exchangeRates: ExchangeRate[]
  settlements: ProjectSettlement[]
  catalogItems: CatalogItem[]
  openOrders: OpenPurchaseOrder[]
  certificates: Certificate[]
  attachments: Attachment[]
  settlementBatches: SettlementBatch[]
  tariffImports: TariffImport[]
  communications: CommercialCommunication[]
  documentTemplates: DocumentTemplate[]
  initialDocuments: InitialDocument[]
  poImports: PoImportRecord[]
  poReviews: PoComparisonReview[]
  audit: AuditEvent[]
  /** Derived financial views (as of the demo "today"). */
  invoiceFin: Map<string, InvoiceFinancials>
  obligationFin: Map<string, ObligationFinancials>
  invoiceById: Map<string, Invoice>
  obligationById: Map<string, SupplierObligation>
  currencyIndicators: CurrencyIndicator[]
  alerts: Alert[]
  priceEntries: PriceEntry[]
  quotations: Quotation[]
  purchaseOrders: PurchaseOrder[]
  quotationById: Map<string, Quotation>
  purchaseOrderById: Map<string, PurchaseOrder>
  clientById: Map<string, Client>
  personById: Map<string, Person>
  staffById: Map<string, StaffMember>
  supplierById: Map<string, Supplier>
  projectById: Map<string, Project>
  serviceById: Map<string, ProjectService>
  procedureById: Map<string, Procedure>
  taskById: Map<string, Task>
  participantsByProject: Map<string, ProjectParticipant[]>
}

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]))

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

/** One derived workspace per dataset snapshot (datasets are immutable). */
const cache = new WeakMap<Dataset, Workspace>()

export function deriveWorkspace(ds: Dataset): Workspace {
  const cached = cache.get(ds)
  if (cached) return cached
  const proceduresByService = groupBy(ds.procedures, (p) => p.serviceId)
  const services: ProjectService[] = ds.services.map((s) => ({ ...s, type: s.typeId, procedures: proceduresByService.get(s.id) ?? [] }))
  const servicesByProject = groupBy(services, (s) => s.projectId)
  const projects: Project[] = ds.projects.map((p) => ({ ...p, services: servicesByProject.get(p.id) ?? [] }))
  const ws: Workspace = {
    dataset: ds,
    projects,
    services,
    procedures: ds.procedures,
    tasks: ds.tasks,
    clients: ds.clients,
    people: ds.people,
    participants: ds.participants,
    staff: ds.staff,
    suppliers: ds.suppliers,
    documents: ds.documents,
    activity: ds.activity,
    legalEntities: ds.legalEntities,
    invoices: ds.invoices,
    receipts: ds.receipts,
    collectionActions: ds.collectionActions,
    agreements: ds.agreements,
    costs: ds.costs,
    obligations: ds.obligations,
    supplierPayments: ds.supplierPayments,
    exchangeRates: ds.exchangeRates,
    settlements: ds.settlements,
    catalogItems: ds.catalogItems,
    openOrders: ds.openOrders,
    certificates: ds.certificates,
    attachments: ds.attachments,
    settlementBatches: ds.settlementBatches,
    tariffImports: ds.tariffImports,
    communications: ds.communications,
    documentTemplates: ds.documentTemplates,
    initialDocuments: ds.initialDocuments,
    poImports: ds.poImports,
    poReviews: ds.poReviews,
    audit: ds.audit,
    invoiceFin: new Map(ds.invoices.map((i) => [i.id, invoiceFinancials(ds, i, DEMO_TODAY)])),
    obligationFin: new Map(ds.obligations.map((o) => [o.id, obligationFinancials(ds, o, DEMO_TODAY)])),
    invoiceById: byId(ds.invoices),
    obligationById: byId(ds.obligations),
    currencyIndicators: ds.currencyIndicators,
    alerts: ds.alerts,
    priceEntries: ds.priceEntries,
    quotations: ds.quotations,
    purchaseOrders: ds.purchaseOrders,
    quotationById: byId(ds.quotations),
    purchaseOrderById: byId(ds.purchaseOrders),
    clientById: byId(ds.clients),
    personById: byId(ds.people),
    staffById: byId(ds.staff),
    supplierById: byId(ds.suppliers),
    projectById: byId(projects),
    serviceById: byId(services),
    procedureById: byId(ds.procedures),
    taskById: byId(ds.tasks),
    participantsByProject: groupBy(ds.participants, (p) => p.projectId),
  }
  cache.set(ds, ws)
  return ws
}

/** Live workspace: re-renders after every command that changes the dataset. */
export function useWorkspace() {
  const state = useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getState)
  useEffect(() => workspaceStore.ensureLoaded(), [])
  return {
    workspace: state.dataset ? deriveWorkspace(state.dataset) : undefined,
    loading: state.status === 'idle' || state.status === 'loading',
    error: state.error,
  }
}

/** Family members (non-beneficiary participants) of a project, with their person record. */
export function projectFamily(ws: Workspace, projectId: string) {
  return (ws.participantsByProject.get(projectId) ?? [])
    .filter((p) => p.role !== 'beneficiary')
    .map((participant) => ({ participant, person: ws.personById.get(participant.personId) }))
    .filter((x): x is { participant: ProjectParticipant; person: Person } => Boolean(x.person))
}
