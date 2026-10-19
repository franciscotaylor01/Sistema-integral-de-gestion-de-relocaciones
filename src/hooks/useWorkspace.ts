import { useMemo } from 'react'
import { dataSource } from '@/services/dataSource'
import type {
  ActivityEvent,
  Alert,
  Assignee,
  Client,
  CurrencyIndicator,
  Invoice,
  Payment,
  Project,
  ProjectDocument,
  StaffMember,
  Supplier,
  SupplierPayable,
} from '@/types/domain'
import { useQuery } from './useQuery'

/** All records Phase 1 screens need, plus id lookups for joins. */
export interface Workspace {
  projects: Project[]
  clients: Client[]
  assignees: Assignee[]
  staff: StaffMember[]
  suppliers: Supplier[]
  documents: ProjectDocument[]
  activity: ActivityEvent[]
  invoices: Invoice[]
  payables: SupplierPayable[]
  payments: Payment[]
  currencyIndicators: CurrencyIndicator[]
  alerts: Alert[]
  clientById: Map<string, Client>
  assigneeById: Map<string, Assignee>
  staffById: Map<string, StaffMember>
  supplierById: Map<string, Supplier>
  projectById: Map<string, Project>
}

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]))

async function loadWorkspace() {
  const [projects, clients, assignees, staff, suppliers, documents, activity, invoices, payables, payments, currencyIndicators, alerts] =
    await Promise.all([
      dataSource.listProjects(),
      dataSource.listClients(),
      dataSource.listAssignees(),
      dataSource.listStaff(),
      dataSource.listSuppliers(),
      dataSource.listDocuments(),
      dataSource.listActivity(),
      dataSource.listInvoices(),
      dataSource.listPayables(),
      dataSource.listPayments(),
      dataSource.listCurrencyIndicators(),
      dataSource.listAlerts(),
    ])
  return { projects, clients, assignees, staff, suppliers, documents, activity, invoices, payables, payments, currencyIndicators, alerts }
}

/**
 * Loads the Phase 1 dataset in one go. With a real backend this becomes
 * per-screen queries; components only depend on the `Workspace` shape.
 */
export function useWorkspace() {
  const query = useQuery('workspace', loadWorkspace)
  const data = query.data

  const workspace = useMemo<Workspace | undefined>(() => {
    if (!data) return undefined
    return {
      ...data,
      clientById: byId(data.clients),
      assigneeById: byId(data.assignees),
      staffById: byId(data.staff),
      supplierById: byId(data.suppliers),
      projectById: byId(data.projects),
    }
  }, [data])

  return { workspace, loading: query.loading, error: query.error }
}
