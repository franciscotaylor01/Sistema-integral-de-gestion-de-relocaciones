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
      createClient: wrap(dataSource.createClient),
      updateClient: wrap(dataSource.updateClient),
      createPriceEntry: wrap(dataSource.createPriceEntry),
      updatePriceEntry: wrap(dataSource.updatePriceEntry),
      createQuotation: wrap(dataSource.createQuotation),
      updateQuotationDraft: wrap(dataSource.updateQuotationDraft),
      sendQuotation: wrap(dataSource.sendQuotation),
      approveQuotation: wrap(dataSource.approveQuotation),
      rejectQuotation: wrap(dataSource.rejectQuotation),
      createQuotationVersion: wrap(dataSource.createQuotationVersion),
      discardQuotationDraft: wrap(dataSource.discardQuotationDraft),
      createPurchaseOrder: wrap(dataSource.createPurchaseOrder),
      updatePurchaseOrder: wrap(dataSource.updatePurchaseOrder),
      cancelPurchaseOrder: wrap(dataSource.cancelPurchaseOrder),
      linkPurchaseOrderDocument: wrap(dataSource.linkPurchaseOrderDocument),
      resetDemoData: wrap(dataSource.resetDemoData),
    }
  }, [])
}
