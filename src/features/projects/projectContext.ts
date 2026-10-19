import { projectFamily, type Workspace } from '@/hooks/useWorkspace'
import type { ActivityEvent, Client, Invoice, Person, Project, ProjectDocument, ProjectParticipant, StaffMember, SupplierObligation, Task } from '@/types/domain'

/** Everything the project detail tabs need, resolved once per render. */
export interface ProjectContext {
  project: Project
  client: Client | undefined
  beneficiary: Person | undefined
  family: { participant: ProjectParticipant; person: Person }[]
  owner: StaffMember | undefined
  documents: ProjectDocument[]
  activity: ActivityEvent[]
  invoices: Invoice[]
  obligations: SupplierObligation[]
  tasks: Task[]
  workspace: Workspace
}

export function buildProjectContext(workspace: Workspace, project: Project): ProjectContext {
  return {
    project,
    workspace,
    client: workspace.clientById.get(project.clientId),
    beneficiary: workspace.personById.get(project.beneficiaryId),
    family: projectFamily(workspace, project.id),
    owner: workspace.staffById.get(project.ownerId),
    documents: workspace.documents.filter((d) => d.projectId === project.id),
    activity: workspace.activity.filter((a) => a.projectId === project.id).sort((a, b) => b.date.localeCompare(a.date)),
    invoices: workspace.invoices.filter((i) => i.projectId === project.id),
    obligations: workspace.obligations.filter((o) => o.projectId === project.id),
    tasks: workspace.tasks.filter((t) => t.projectId === project.id),
  }
}
