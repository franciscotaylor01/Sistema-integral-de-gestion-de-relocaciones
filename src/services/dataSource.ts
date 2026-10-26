import type { CatalogItemInput, OpenOrderInput, ServiceItemInput } from '@/domain/commercial/catalog'
import type { CertificateInput } from '@/domain/commercial/certificates'
import type { SpecialItemInput } from '@/domain/commercial/specialItems'
import type { TariffRowChange } from '@/domain/commercial/tariffGrid'
import type { TariffImportInput } from '@/domain/commercial/tariffImport'
import type { EmissionInput } from '@/domain/finance/emission'
import type { BatchInput, SharingInput } from '@/domain/finance/batches'
import type { WithholdingInput } from '@/domain/finance/receipts'
import type { AttachmentInput } from '@/domain/finance/attachments'
import type { OpenOrderStatus, ProjectRecord } from '@/types/domain'
import type { SettlementInput } from '@/domain/finance/settlements'
import type { SettlementRelease, SettlementRule } from '@/types/domain'
import type { Dataset } from '@/domain/dataset'
import type { ClientInput } from '@/domain/commercial/clients'
import type { PriceEntryInput } from '@/domain/commercial/pricing'
import type { PurchaseOrderInput } from '@/domain/commercial/purchaseOrders'
import type { ApprovalInput, QuotationDraftInput, SendInput } from '@/domain/commercial/quotations'
import type { CommunicationInput } from '@/domain/commercial/documents'
import type { PoImportInput } from '@/domain/commercial/poImport'
import type { ReviewInput } from '@/domain/commercial/poComparison'
import type { InitialDocsSendInput, ReceptionInput, TemplateFileInput, TemplateInput } from '@/domain/initialDocuments'
import type { CostInput } from '@/domain/finance/costs'
import type { ExchangeRateInput } from '@/domain/finance/fx'
import type { InvoiceInput } from '@/domain/finance/invoices'
import type { ObligationInput, ObligationTermsPatch } from '@/domain/finance/obligations'
import type { AllocationInput, CollectionActionInput, ReceiptInput } from '@/domain/finance/receipts'
import type { SupplierAllocationInput, SupplierPaymentInput } from '@/domain/finance/supplierPayments'
import type { AgreementInput, SupplierInput } from '@/domain/finance/suppliers'
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

  // Phase 3 — commercial management
  createClient(input: ClientInput, requestId: string): Promise<CommandResult<{ clientId: string; duplicate: boolean }>>
  updateClient(clientId: string, input: ClientInput): Promise<CommandResult>
  createPriceEntry(input: PriceEntryInput, options?: { acceptOverlap?: boolean }): Promise<CommandResult<{ entryId: string }>>
  updatePriceEntry(entryId: string, input: PriceEntryInput, options?: { acceptOverlap?: boolean }): Promise<CommandResult>
  createQuotation(projectId: string): Promise<CommandResult<{ quotationId: string }>>
  updateQuotationDraft(quotationId: string, input: QuotationDraftInput): Promise<CommandResult>
  sendQuotation(quotationId: string, input?: SendInput): Promise<CommandResult>
  markQuotationReady(quotationId: string): Promise<CommandResult>
  reopenQuotationDraft(quotationId: string): Promise<CommandResult>
  registerQuotationSent(quotationId: string, input: CommunicationInput, requestId: string): Promise<CommandResult<{ communicationId: string; duplicate: boolean }>>
  registerTariffSent(clientId: string, input: CommunicationInput, requestId: string): Promise<CommandResult<{ communicationId: string; duplicate: boolean }>>
  createTemplate(input: TemplateInput, file: TemplateFileInput | undefined, requestId: string): Promise<CommandResult<{ templateId: string; duplicate: boolean }>>
  updateTemplate(templateId: string, input: TemplateInput): Promise<CommandResult>
  replaceTemplateFile(templateId: string, file: TemplateFileInput): Promise<CommandResult>
  requestInitialDocuments(projectId: string, templateIds: string[]): Promise<CommandResult>
  discardInitialDocument(docId: string): Promise<CommandResult>
  registerInitialDocsSent(projectId: string, docIds: string[], input: InitialDocsSendInput, requestId: string): Promise<CommandResult<{ communicationId: string; duplicate: boolean }>>
  registerInitialDocReceived(docId: string, input: ReceptionInput): Promise<CommandResult>
  requestInitialDocCorrection(docId: string, note: string): Promise<CommandResult>
  confirmPoImport(input: PoImportInput, requestId: string): Promise<CommandResult<{ poId: string; importId: string; duplicate: boolean }>>
  reviewComparisonRow(projectId: string, rowKey: string, input: ReviewInput): Promise<CommandResult>
  approveQuotation(quotationId: string, input: ApprovalInput): Promise<CommandResult>
  rejectQuotation(quotationId: string, reason: string): Promise<CommandResult>
  createQuotationVersion(quotationId: string): Promise<CommandResult<{ quotationId: string }>>
  discardQuotationDraft(quotationId: string): Promise<CommandResult>
  createPurchaseOrder(input: PurchaseOrderInput, requestId: string): Promise<CommandResult<{ poId: string; duplicate: boolean }>>
  updatePurchaseOrder(poId: string, input: PurchaseOrderInput): Promise<CommandResult>
  cancelPurchaseOrder(poId: string, reason: string): Promise<CommandResult>
  linkPurchaseOrderDocument(poId: string, label: string): Promise<CommandResult>

  // Phase 4 — financial management
  createInvoiceDraft(input: InvoiceInput, requestId: string): Promise<CommandResult<{ invoiceId: string; duplicate: boolean }>>
  updateInvoiceDraft(invoiceId: string, input: InvoiceInput): Promise<CommandResult>
  issueInvoice(invoiceId: string, externalRef?: string): Promise<CommandResult>
  cancelInvoice(invoiceId: string, reason: string): Promise<CommandResult>
  recordReceipt(input: ReceiptInput, requestId: string): Promise<CommandResult<{ receiptId: string; duplicate: boolean }>>
  applyReceiptCredit(receiptId: string, allocations: AllocationInput[]): Promise<CommandResult>
  reverseReceipt(receiptId: string, reason: string): Promise<CommandResult>
  addCollectionAction(input: CollectionActionInput): Promise<CommandResult>
  createSupplier(input: SupplierInput, requestId: string): Promise<CommandResult<{ supplierId: string; duplicate: boolean }>>
  updateSupplier(supplierId: string, input: SupplierInput): Promise<CommandResult>
  createAgreement(input: AgreementInput): Promise<CommandResult<{ agreementId: string }>>
  recordCost(input: CostInput): Promise<CommandResult<{ costId: string }>>
  voidCost(costId: string, reason: string): Promise<CommandResult>
  createObligation(input: ObligationInput, requestId: string): Promise<CommandResult<{ obligationId: string; duplicate: boolean }>>
  approveObligation(obligationId: string): Promise<CommandResult>
  updateObligationTerms(obligationId: string, patch: ObligationTermsPatch): Promise<CommandResult>
  cancelObligation(obligationId: string, reason: string): Promise<CommandResult>
  recordSupplierPayment(input: SupplierPaymentInput, requestId: string): Promise<CommandResult<{ paymentId: string; duplicate: boolean }>>
  applySupplierAdvance(paymentId: string, allocations: SupplierAllocationInput[]): Promise<CommandResult>
  reverseSupplierPayment(paymentId: string, reason: string): Promise<CommandResult>
  recordExchangeRate(input: ExchangeRateInput): Promise<CommandResult<{ rateId: string }>>
  correctExchangeRate(rateId: string, rate: string, reason: string): Promise<CommandResult<{ rateId: string }>>
  createSettlement(input: SettlementInput, requestId: string): Promise<CommandResult<{ settlementId: string; duplicate: boolean }>>
  configureSettlement(settlementId: string, input: SettlementConfigInput, reason: string): Promise<CommandResult>
  addSettlementAdjustment(settlementId: string, input: SettlementAmountInput): Promise<CommandResult>
  recordSettlementRelease(settlementId: string, input: SettlementAmountInput): Promise<CommandResult>
  linkSettlementObligation(settlementId: string, obligationId: string): Promise<CommandResult>
  unlinkSettlementObligation(settlementId: string, obligationId: string, reason: string): Promise<CommandResult>
  confirmSettlement(settlementId: string, note: string): Promise<CommandResult>
  createCatalogItem(input: CatalogItemInput): Promise<CommandResult<{ itemId: string }>>
  updateCatalogItem(itemId: string, input: CatalogItemInput): Promise<CommandResult>
  setOfferedServices(clientId: string, typeIds: string[]): Promise<CommandResult>
  approvePriceEntry(entryId: string, approvalRef: string): Promise<CommandResult>
  saveTariffGrid(clientId: string, input: { changes: TariffRowChange[]; offeredServices?: string[] }): Promise<CommandResult>
  applyTariffImport(clientId: string, input: TariffImportInput, requestId: string): Promise<CommandResult<{ importId: string; duplicate: boolean }>>
  createOpenOrder(input: OpenOrderInput, requestId: string): Promise<CommandResult<{ openOrderId: string; duplicate: boolean }>>
  setOpenOrderStatus(openOrderId: string, status: OpenOrderStatus): Promise<CommandResult>
  updateServiceItems(serviceId: string, items: ServiceItemInput[]): Promise<CommandResult>
  setServiceDescription(serviceId: string, text: string): Promise<CommandResult>
  addSpecialItem(serviceId: string, input: SpecialItemInput): Promise<CommandResult<{ itemId: string }>>
  updateSpecialItem(serviceId: string, itemId: string, input: Omit<SpecialItemInput, 'approvalRef'>): Promise<CommandResult>
  approveSpecialItem(serviceId: string, itemId: string, approvalRef: string): Promise<CommandResult>
  removeSpecialItem(serviceId: string, itemId: string): Promise<CommandResult>
  createCertificate(input: CertificateInput, requestId: string): Promise<CommandResult<{ certificateId: string; duplicate: boolean }>>
  submitCertificate(certificateId: string, input: { externalNumber: string; date: string }): Promise<CommandResult>
  approveCertificate(certificateId: string, input: { date: string }): Promise<CommandResult>
  rejectCertificate(certificateId: string, reason: string): Promise<CommandResult>
  setProjectException(projectId: string, exception: ProjectRecord['commercialException'] | null): Promise<CommandResult>
  confirmInvoiceEmission(invoiceId: string, input: EmissionInput): Promise<CommandResult>
  recordFiscalData(invoiceId: string, input: EmissionInput): Promise<CommandResult>
  correctFiscalData(invoiceId: string, input: EmissionInput, reason: string): Promise<CommandResult>
  changeInvoiceDueDate(invoiceId: string, dueDate: string, reason: string): Promise<CommandResult>
  addReceiptWithholdings(receiptId: string, items: WithholdingInput[]): Promise<CommandResult>
  addAttachment(input: AttachmentInput): Promise<CommandResult<{ attachmentId: string }>>
  closeProjectCosts(projectId: string, notes: string): Promise<CommandResult>
  reopenProjectCosts(projectId: string, reason: string): Promise<CommandResult>
  markOverheadPaid(costId: string, input: { date: string; reference?: string }): Promise<CommandResult>
  revertAdvanceApplication(paymentId: string, allocationId: string, reason: string): Promise<CommandResult>
  assignAdvanceProject(paymentId: string, projectId: string, serviceId: string | undefined, reason: string): Promise<CommandResult>
  createBatch(input: BatchInput, requestId: string): Promise<CommandResult<{ batchId: string; duplicate: boolean }>>
  updateBatchDraft(batchId: string, input: BatchInput): Promise<CommandResult>
  confirmBatch(batchId: string, input: { acknowledgeOpenCosts: boolean }): Promise<CommandResult>
  cancelBatch(batchId: string, reason: string): Promise<CommandResult>
  setCostSharing(costId: string, sharing: SharingInput | null): Promise<CommandResult>
  addFiscalAdjustment(settlementId: string, input: { date: string; concept: string; amount: number; reference?: string; reason: string }): Promise<CommandResult>

  /** Discards local changes and restores the original demo dataset. */
  resetDemoData(): Promise<CommandResult>
}

export const dataSource: SigrDataSource = createLocalDataSource()

export interface SettlementConfigInput {
  rule: SettlementRule
  release: SettlementRelease
  releaseNote?: string
}

export interface SettlementAmountInput {
  amount: number
  date: string
  reason: string
}
