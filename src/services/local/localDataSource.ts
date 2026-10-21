import { DEMO_TODAY } from '@/config/brand'
import { buildSeedDataset } from '@/data/seed'
import { mockCurrentUser, mockNotifications } from '@/data/mock'
import { randomId, type DomainContext } from '@/domain/context'
import type { Dataset } from '@/domain/dataset'
import { createClient, updateClient } from '@/domain/commercial/clients'
import { createPriceEntry, updatePriceEntry } from '@/domain/commercial/pricing'
import { cancelPurchaseOrder, createPurchaseOrder, linkPurchaseOrderDocument, updatePurchaseOrder } from '@/domain/commercial/purchaseOrders'
import {
  approveQuotation,
  createQuotationFromProject,
  createQuotationVersion,
  discardQuotationDraft,
  rejectQuotation,
  sendQuotation,
  updateQuotationDraft,
} from '@/domain/commercial/quotations'
import { recordCost, voidCost, markOverheadPaid } from '@/domain/finance/costs'
import { correctExchangeRate, recordExchangeRate } from '@/domain/finance/fx'
import { createCatalogItem, createOpenOrder, setOfferedServices, setOpenOrderStatus, setProjectException, updateCatalogItem } from '@/domain/commercial/catalog'
import { approveCertificate, createCertificate, rejectCertificate, submitCertificate } from '@/domain/commercial/certificates'
import { approvePriceEntry } from '@/domain/commercial/pricing'
import { changeInvoiceDueDate, confirmInvoiceEmission, correctFiscalData, recordFiscalData } from '@/domain/finance/emission'
import { addAttachment } from '@/domain/finance/attachments'
import { addSettlementAdjustment, configureSettlement, confirmSettlement, createSettlement, linkSettlementObligation, recordSettlementRelease, unlinkSettlementObligation } from '@/domain/finance/settlements'
import { cancelInvoice, createInvoiceDraft, issueInvoice, updateInvoiceDraft } from '@/domain/finance/invoices'
import { approveObligation, cancelObligation, createObligation, updateObligationTerms } from '@/domain/finance/obligations'
import { addCollectionAction, applyReceiptCredit, recordReceipt, reverseReceipt, addReceiptWithholdings } from '@/domain/finance/receipts'
import { applySupplierAdvance, assignAdvanceProject, recordSupplierPayment, revertAdvanceApplication, reverseSupplierPayment } from '@/domain/finance/supplierPayments'
import { closeProjectCosts, reopenProjectCosts } from '@/domain/finance/costControl'
import { createAgreement, createSupplier, updateSupplier } from '@/domain/finance/suppliers'
import { addProcedure, updateProcedure } from '@/domain/procedures'
import { addProjectNote, createProject, updateProject } from '@/domain/projects'
import { addService, updateService, updateServiceItems } from '@/domain/services'
import { createTask, updateTask } from '@/domain/tasks'
import { addWorkNote, applyStageAction, completeWork, reopenWork, setWorkStatus } from '@/domain/workItems'
import type { SigrDataSource } from '../dataSource'
import { browserStorage, clearDataset, readDataset, writeDataset, type LoadIssue, type StorageLike } from './storage'

const READ_LATENCY_MS = 420
const WRITE_LATENCY_MS = 180

const delay = <T>(ms: number, value: T) => new Promise<T>((r) => setTimeout(() => r(value), ms))

function localNow(): string {
  // Local wall-clock time without the "Z" so it renders in the user's zone.
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * Local demo adapter: domain functions + browser storage. Swappable for a
 * Supabase adapter implementing the same `SigrDataSource` interface.
 */
export function createLocalDataSource(options: { storage?: StorageLike; latency?: boolean } = {}): SigrDataSource {
  const storage = options.storage ?? browserStorage()
  const wait = <T>(ms: number, v: T) => (options.latency === false ? Promise.resolve(v) : delay(ms, v))
  let current: Dataset | undefined
  let issue: LoadIssue | undefined
  let persistent = true

  const ctx: DomainContext = {
    actorId: mockCurrentUser.id,
    now: localNow,
    today: () => DEMO_TODAY,
    newId: randomId,
  }

  function ensure(): Dataset {
    if (current) return current
    const stored = readDataset(storage)
    issue = stored.issue
    if (stored.dataset) {
      current = stored.dataset
    } else {
      current = buildSeedDataset()
      persistent = writeDataset(storage, current, ctx.now())
    }
    return current
  }

  /** Runs a pure domain command, persists the result and returns it. */
  async function run<T extends object>(command: (ds: Dataset) => { ds: Dataset } & T): Promise<{ dataset: Dataset } & T> {
    const { ds, ...rest } = command(ensure())
    current = ds
    persistent = writeDataset(storage, ds, ctx.now())
    return wait(WRITE_LATENCY_MS, { dataset: ds, ...(rest as T) })
  }

  const simple = (fn: (ds: Dataset) => Dataset) => run((ds) => ({ ds: fn(ds) }))

  return {
    loadDataset: () => {
      const dataset = ensure()
      return wait(READ_LATENCY_MS, { dataset, issue, persistent })
    },
    getCurrentUser: () => wait(READ_LATENCY_MS, mockCurrentUser),
    listNotifications: () => wait(READ_LATENCY_MS, mockNotifications),

    createProject: (input, requestId) => run((ds) => createProject(ds, input, requestId, ctx)),
    updateProject: (id, patch) => simple((ds) => updateProject(ds, id, patch, ctx)),
    addProjectNote: (id, text) => simple((ds) => addProjectNote(ds, id, text, ctx)),

    addService: (projectId, input) =>
      run((ds) => {
        const r = addService(ds, projectId, input, ctx)
        return { ds: r.ds, serviceId: r.service.id }
      }),
    updateService: (id, patch) => simple((ds) => updateService(ds, id, patch, ctx)),
    addProcedure: (serviceId, input) =>
      run((ds) => {
        const r = addProcedure(ds, serviceId, input, ctx)
        return { ds: r.ds, procedureId: r.procedure.id }
      }),
    updateProcedure: (id, patch) => simple((ds) => updateProcedure(ds, id, patch, ctx)),

    setWorkStatus: (scope, status) => simple((ds) => setWorkStatus(ds, scope, status, ctx)),
    completeWork: (scope, opts) => simple((ds) => completeWork(ds, scope, ctx, opts)),
    reopenWork: (scope, reason) => simple((ds) => reopenWork(ds, scope, reason, ctx)),
    addWorkNote: (scope, text) => simple((ds) => addWorkNote(ds, scope, text, ctx)),
    applyStageAction: (scope, action) => simple((ds) => applyStageAction(ds, scope, action, ctx)),

    createTask: (input) =>
      run((ds) => {
        const r = createTask(ds, input, ctx)
        return { ds: r.ds, taskId: r.task.id }
      }),
    updateTask: (id, patch) => simple((ds) => updateTask(ds, id, patch, ctx)),

    createClient: (input, requestId) => run((ds) => createClient(ds, input, requestId, ctx)),
    updateClient: (id, input) => simple((ds) => updateClient(ds, id, input, ctx)),
    createPriceEntry: (input, opts) =>
      run((ds) => {
        const r = createPriceEntry(ds, input, ctx, opts)
        return { ds: r.ds, entryId: r.entry.id }
      }),
    updatePriceEntry: (id, input, opts) => simple((ds) => updatePriceEntry(ds, id, input, ctx, opts)),
    createQuotation: (projectId) =>
      run((ds) => {
        const r = createQuotationFromProject(ds, projectId, ctx)
        return { ds: r.ds, quotationId: r.quotation.id }
      }),
    updateQuotationDraft: (id, input) => simple((ds) => updateQuotationDraft(ds, id, input, ctx)),
    sendQuotation: (id) => simple((ds) => sendQuotation(ds, id, ctx)),
    approveQuotation: (id, input) => simple((ds) => approveQuotation(ds, id, input, ctx)),
    rejectQuotation: (id, reason) => simple((ds) => rejectQuotation(ds, id, reason, ctx)),
    createQuotationVersion: (id) =>
      run((ds) => {
        const r = createQuotationVersion(ds, id, ctx)
        return { ds: r.ds, quotationId: r.quotation.id }
      }),
    discardQuotationDraft: (id) => simple((ds) => discardQuotationDraft(ds, id, ctx)),
    createPurchaseOrder: (input, requestId) => run((ds) => createPurchaseOrder(ds, input, requestId, ctx)),
    updatePurchaseOrder: (id, input) => simple((ds) => updatePurchaseOrder(ds, id, input, ctx)),
    cancelPurchaseOrder: (id, reason) => simple((ds) => cancelPurchaseOrder(ds, id, reason, ctx)),
    linkPurchaseOrderDocument: (id, label) => simple((ds) => linkPurchaseOrderDocument(ds, id, label, ctx)),

    createInvoiceDraft: (input, requestId) => run((ds) => createInvoiceDraft(ds, input, requestId, ctx)),
    updateInvoiceDraft: (id, input) => simple((ds) => updateInvoiceDraft(ds, id, input, ctx)),
    issueInvoice: (id, ref) => simple((ds) => issueInvoice(ds, id, ref, ctx)),
    cancelInvoice: (id, reason) => simple((ds) => cancelInvoice(ds, id, reason, ctx)),
    recordReceipt: (input, requestId) => run((ds) => recordReceipt(ds, input, requestId, ctx)),
    applyReceiptCredit: (id, allocations) => simple((ds) => applyReceiptCredit(ds, id, allocations, ctx)),
    reverseReceipt: (id, reason) => simple((ds) => reverseReceipt(ds, id, reason, ctx)),
    addCollectionAction: (input) => simple((ds) => addCollectionAction(ds, input, ctx)),
    createSupplier: (input, requestId) => run((ds) => createSupplier(ds, input, requestId, ctx)),
    updateSupplier: (id, input) => simple((ds) => updateSupplier(ds, id, input, ctx)),
    createAgreement: (input) =>
      run((ds) => {
        const r = createAgreement(ds, input, ctx)
        return { ds: r.ds, agreementId: r.agreement.id }
      }),
    recordCost: (input) => run((ds) => recordCost(ds, input, ctx)),
    voidCost: (id, reason) => simple((ds) => voidCost(ds, id, reason, ctx)),
    createObligation: (input, requestId) => run((ds) => createObligation(ds, input, requestId, ctx)),
    approveObligation: (id) => simple((ds) => approveObligation(ds, id, ctx)),
    updateObligationTerms: (id, patch) => simple((ds) => updateObligationTerms(ds, id, patch, ctx)),
    cancelObligation: (id, reason) => simple((ds) => cancelObligation(ds, id, reason, ctx)),
    recordSupplierPayment: (input, requestId) => run((ds) => recordSupplierPayment(ds, input, requestId, ctx)),
    applySupplierAdvance: (id, allocations) => simple((ds) => applySupplierAdvance(ds, id, allocations, ctx)),
    reverseSupplierPayment: (id, reason) => simple((ds) => reverseSupplierPayment(ds, id, reason, ctx)),
    recordExchangeRate: (input) => run((ds) => recordExchangeRate(ds, input, ctx)),
    correctExchangeRate: (id, rate, reason) => run((ds) => correctExchangeRate(ds, id, rate, reason, ctx)),
    createSettlement: (input, requestId) => run((ds) => createSettlement(ds, input, requestId, ctx)),
    configureSettlement: (id, input, reason) => simple((ds) => configureSettlement(ds, id, input, reason, ctx)),
    addSettlementAdjustment: (id, input) => simple((ds) => addSettlementAdjustment(ds, id, input, ctx)),
    recordSettlementRelease: (id, input) => simple((ds) => recordSettlementRelease(ds, id, input, ctx)),
    linkSettlementObligation: (id, obligationId) => simple((ds) => linkSettlementObligation(ds, id, obligationId, ctx)),
    unlinkSettlementObligation: (id, obligationId, reason) => simple((ds) => unlinkSettlementObligation(ds, id, obligationId, reason, ctx)),
    confirmSettlement: (id, note) => simple((ds) => confirmSettlement(ds, id, note, ctx)),
    createCatalogItem: (input) => run((ds) => createCatalogItem(ds, input, ctx)),
    updateCatalogItem: (id, input) => simple((ds) => updateCatalogItem(ds, id, input, ctx)),
    setOfferedServices: (clientId, typeIds) => simple((ds) => setOfferedServices(ds, clientId, typeIds, ctx)),
    approvePriceEntry: (id, ref) => simple((ds) => approvePriceEntry(ds, id, ref, ctx)),
    createOpenOrder: (input, requestId) => run((ds) => createOpenOrder(ds, input, requestId, ctx)),
    setOpenOrderStatus: (id, status) => simple((ds) => setOpenOrderStatus(ds, id, status, ctx)),
    updateServiceItems: (id, items) => simple((ds) => updateServiceItems(ds, id, items, ctx)),
    createCertificate: (input, requestId) => run((ds) => createCertificate(ds, input, requestId, ctx)),
    submitCertificate: (id, input) => simple((ds) => submitCertificate(ds, id, input, ctx)),
    approveCertificate: (id, input) => simple((ds) => approveCertificate(ds, id, input, ctx)),
    rejectCertificate: (id, reason) => simple((ds) => rejectCertificate(ds, id, reason, ctx)),
    setProjectException: (id, ex) => simple((ds) => setProjectException(ds, id, ex, ctx)),
    confirmInvoiceEmission: (id, input) => simple((ds) => confirmInvoiceEmission(ds, id, input, ctx)),
    recordFiscalData: (id, input) => simple((ds) => recordFiscalData(ds, id, input, ctx)),
    correctFiscalData: (id, input, reason) => simple((ds) => correctFiscalData(ds, id, input, reason, ctx)),
    changeInvoiceDueDate: (id, date, reason) => simple((ds) => changeInvoiceDueDate(ds, id, date, reason, ctx)),
    addReceiptWithholdings: (id, items) => simple((ds) => addReceiptWithholdings(ds, id, items, ctx)),
    addAttachment: (input) => run((ds) => addAttachment(ds, input, ctx)),
    closeProjectCosts: (id, notes) => simple((ds) => closeProjectCosts(ds, id, notes, ctx)),
    reopenProjectCosts: (id, reason) => simple((ds) => reopenProjectCosts(ds, id, reason, ctx)),
    markOverheadPaid: (id, input) => simple((ds) => markOverheadPaid(ds, id, input, ctx)),
    revertAdvanceApplication: (id, allocationId, reason) => simple((ds) => revertAdvanceApplication(ds, id, allocationId, reason, ctx)),
    assignAdvanceProject: (id, projectId, serviceId, reason) => simple((ds) => assignAdvanceProject(ds, id, projectId, serviceId, reason, ctx)),

    resetDemoData: async () => {
      clearDataset(storage)
      current = buildSeedDataset()
      issue = undefined
      persistent = writeDataset(storage, current, ctx.now())
      return wait(WRITE_LATENCY_MS, { dataset: current })
    },
  }
}
