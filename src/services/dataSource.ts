import type { Dataset } from '@/domain/dataset'
import type { NewProcedureInput, ProcedurePatch } from '@/domain/procedures'
import type { NewProjectInput, ProjectPatch } from '@/domain/projects'
import type { NewServiceInput, ServicePatch } from '@/domain/services'
import type { NewTaskInput, TaskPatch } from '@/domain/tasks'
import type { OpenStatus, StageAction, WorkScope } from '@/domain/workItems'
import type { Notification, UserProfile } from '@/types/domain'
import { createLocalDataSource } from './local/localDataSource'
import type { LoadIssue } from './local/storage'

export type CommandResult<T = object> = { dataset: Dataset } & T

/**
 * The single seam between UI and data (same pattern as Vertix). Screens read
 * the dataset and run commands through this interface only, so the local demo
 * adapter can be replaced by a Supabase implementation without UI changes.
 * Validation errors are thrown as `DomainError` (with per-field messages).
 */
export interface SigrDataSource {
  loadDataset(): Promise<{ dataset: Dataset; issue?: LoadIssue; persistent: boolean }>
  getCurrentUser(): Promise<UserProfile>
  listNotifications(): Promise<Notification[]>

  createProject(input: NewProjectInput, requestId: string): Promise<CommandResult<{ projectId: string; duplicate: boolean }>>
  updateProject(projectId: string, patch: ProjectPatch): Promise<CommandResult>
  addProjectNote(projectId: string, text: string): Promise<CommandResult>

  addService(projectId: string, input: NewServiceInput): Promise<CommandResult<{ serviceId: string }>>
  updateService(serviceId: string, patch: ServicePatch): Promise<CommandResult>
  addProcedure(serviceId: string, input: NewProcedureInput): Promise<CommandResult<{ procedureId: string }>>
  updateProcedure(procedureId: string, patch: ProcedurePatch): Promise<CommandResult>

  setWorkStatus(scope: WorkScope, status: OpenStatus): Promise<CommandResult>
  completeWork(scope: WorkScope, options: { closeOpenStages: boolean }): Promise<CommandResult>
  reopenWork(scope: WorkScope, reason: string): Promise<CommandResult>
  addWorkNote(scope: WorkScope, text: string): Promise<CommandResult>
  applyStageAction(scope: WorkScope, action: StageAction): Promise<CommandResult>

  createTask(input: NewTaskInput): Promise<CommandResult<{ taskId: string }>>
  updateTask(taskId: string, patch: TaskPatch): Promise<CommandResult>

  /** Discards local changes and restores the original demo dataset. */
  resetDemoData(): Promise<CommandResult>
}

export const dataSource: SigrDataSource = createLocalDataSource()
