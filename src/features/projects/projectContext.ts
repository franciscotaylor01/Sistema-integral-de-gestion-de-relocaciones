import type { Workspace } from '@/hooks/useWorkspace'
import type { ActivityEvent, Assignee, Client, Invoice, Project, ProjectDocument, StaffMember, SupplierPayable } from '@/types/domain'

/** Everything the project detail tabs need, resolved once. */
export interface ProjectContext {
  project: Project
  client: Client | undefined
  assignee: Assignee | undefined
  owner: StaffMember | undefined
  documents: ProjectDocument[]
  activity: ActivityEvent[]
  invoices: Invoice[]
  payables: SupplierPayable[]
  workspace: Workspace
}

export function buildProjectContext(workspace: Workspace, project: Project): ProjectContext {
  return {
    project,
    workspace,
    client: workspace.clientById.get(project.clientId),
    assignee: workspace.assigneeById.get(project.assigneeId),
    owner: workspace.staffById.get(project.ownerId),
    documents: workspace.documents.filter((d) => d.projectId === project.id),
    activity: workspace.activity.filter((a) => a.projectId === project.id).sort((a, b) => b.date.localeCompare(a.date)),
    invoices: workspace.invoices.filter((i) => i.projectId === project.id),
    payables: workspace.payables.filter((p) => p.projectId === project.id),
  }
}
