import { useMemo } from 'react'
import { dataSource, type CommandResult, type SigrDataSource } from '@/services/dataSource'
import { workspaceStore } from '@/services/workspaceStore'

type Commands = Omit<SigrDataSource, 'loadDataset' | 'getCurrentUser' | 'listNotifications'>

/**
 * Commands bound to the store: each runs through the data source and publishes
 * the resulting dataset, so every screen updates. Errors (DomainError) propagate.
 */
export function useActions(): Commands {
  return useMemo(() => {
    const wrap =
      <A extends unknown[], R extends CommandResult>(fn: (...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        const result = await fn(...args)
        workspaceStore.setDataset(result.dataset)
        return result
      }
    return {
      createProject: wrap(dataSource.createProject),
      updateProject: wrap(dataSource.updateProject),
      addProjectNote: wrap(dataSource.addProjectNote),
      addService: wrap(dataSource.addService),
      updateService: wrap(dataSource.updateService),
      addProcedure: wrap(dataSource.addProcedure),
      updateProcedure: wrap(dataSource.updateProcedure),
      setWorkStatus: wrap(dataSource.setWorkStatus),
      completeWork: wrap(dataSource.completeWork),
      reopenWork: wrap(dataSource.reopenWork),
      addWorkNote: wrap(dataSource.addWorkNote),
      applyStageAction: wrap(dataSource.applyStageAction),
      createTask: wrap(dataSource.createTask),
      updateTask: wrap(dataSource.updateTask),
      resetDemoData: wrap(dataSource.resetDemoData),
    }
  }, [])
}
