import { isActiveProject } from '@/features/projects/selectors'
import { invoiceOutstanding } from '@/features/finance/selectors'
import type { Workspace } from '@/hooks/useWorkspace'
import { sumByCurrency, type MoneyByCurrency } from '@/lib/money'
import type { Client } from '@/types/domain'

export interface ClientSummary {
  client: Client
  activeProjects: number
  totalProjects: number
  receivable: MoneyByCurrency
  overdue: number
}

export function summarizeClient(ws: Workspace, client: Client): ClientSummary {
  const projects = ws.projects.filter((p) => p.clientId === client.id)
  const invoices = ws.invoices.filter((i) => i.clientId === client.id)
  return {
    client,
    activeProjects: projects.filter(isActiveProject).length,
    totalProjects: projects.length,
    receivable: sumByCurrency(invoices.filter((i) => invoiceOutstanding(i) > 0), (i) => i.currency, invoiceOutstanding),
    overdue: invoices.filter((i) => i.status === 'overdue').length,
  }
}
