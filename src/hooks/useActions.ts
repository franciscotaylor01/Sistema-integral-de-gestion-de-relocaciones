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
      createInvoiceDraft: wrap(dataSource.createInvoiceDraft),
      updateInvoiceDraft: wrap(dataSource.updateInvoiceDraft),
      issueInvoice: wrap(dataSource.issueInvoice),
      cancelInvoice: wrap(dataSource.cancelInvoice),
      recordReceipt: wrap(dataSource.recordReceipt),
      applyReceiptCredit: wrap(dataSource.applyReceiptCredit),
      reverseReceipt: wrap(dataSource.reverseReceipt),
      addCollectionAction: wrap(dataSource.addCollectionAction),
      createSupplier: wrap(dataSource.createSupplier),
      updateSupplier: wrap(dataSource.updateSupplier),
      createAgreement: wrap(dataSource.createAgreement),
      recordCost: wrap(dataSource.recordCost),
      voidCost: wrap(dataSource.voidCost),
      createObligation: wrap(dataSource.createObligation),
      approveObligation: wrap(dataSource.approveObligation),
      updateObligationTerms: wrap(dataSource.updateObligationTerms),
      cancelObligation: wrap(dataSource.cancelObligation),
      recordSupplierPayment: wrap(dataSource.recordSupplierPayment),
      applySupplierAdvance: wrap(dataSource.applySupplierAdvance),
      reverseSupplierPayment: wrap(dataSource.reverseSupplierPayment),
      recordExchangeRate: wrap(dataSource.recordExchangeRate),
      correctExchangeRate: wrap(dataSource.correctExchangeRate),
      createSettlement: wrap(dataSource.createSettlement),
      configureSettlement: wrap(dataSource.configureSettlement),
      addSettlementAdjustment: wrap(dataSource.addSettlementAdjustment),
      recordSettlementRelease: wrap(dataSource.recordSettlementRelease),
      linkSettlementObligation: wrap(dataSource.linkSettlementObligation),
      unlinkSettlementObligation: wrap(dataSource.unlinkSettlementObligation),
      confirmSettlement: wrap(dataSource.confirmSettlement),
      createCatalogItem: wrap(dataSource.createCatalogItem),
      updateCatalogItem: wrap(dataSource.updateCatalogItem),
      setOfferedServices: wrap(dataSource.setOfferedServices),
      approvePriceEntry: wrap(dataSource.approvePriceEntry),
      createOpenOrder: wrap(dataSource.createOpenOrder),
      setOpenOrderStatus: wrap(dataSource.setOpenOrderStatus),
      updateServiceItems: wrap(dataSource.updateServiceItems),
      createCertificate: wrap(dataSource.createCertificate),
      submitCertificate: wrap(dataSource.submitCertificate),
      approveCertificate: wrap(dataSource.approveCertificate),
      rejectCertificate: wrap(dataSource.rejectCertificate),
      setProjectException: wrap(dataSource.setProjectException),
      confirmInvoiceEmission: wrap(dataSource.confirmInvoiceEmission),
      recordFiscalData: wrap(dataSource.recordFiscalData),
      correctFiscalData: wrap(dataSource.correctFiscalData),
      changeInvoiceDueDate: wrap(dataSource.changeInvoiceDueDate),
      addReceiptWithholdings: wrap(dataSource.addReceiptWithholdings),
      addAttachment: wrap(dataSource.addAttachment),
      closeProjectCosts: wrap(dataSource.closeProjectCosts),
      reopenProjectCosts: wrap(dataSource.reopenProjectCosts),
      markOverheadPaid: wrap(dataSource.markOverheadPaid),
      revertAdvanceApplication: wrap(dataSource.revertAdvanceApplication),
      assignAdvanceProject: wrap(dataSource.assignAdvanceProject),
      createBatch: wrap(dataSource.createBatch),
      updateBatchDraft: wrap(dataSource.updateBatchDraft),
      confirmBatch: wrap(dataSource.confirmBatch),
      cancelBatch: wrap(dataSource.cancelBatch),
      setCostSharing: wrap(dataSource.setCostSharing),
      addFiscalAdjustment: wrap(dataSource.addFiscalAdjustment),
      resetDemoData: wrap(dataSource.resetDemoData),
    }
  }, [])
}
