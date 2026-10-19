import { getProcedureType } from '@/config/procedureCatalog'
import { getServiceType } from '@/config/serviceCatalog'
import { getWorkflowTemplate } from '@/config/workflowTemplates'
import { SCHEMA_VERSION, type Dataset } from '@/domain/dataset'
import { scheduleStages } from '@/domain/workflow'
import { priceListsToEntries } from '@/domain/commercial/legacy'
import type { Client, Person, PriceEntry, Procedure, ProjectParticipant, ProjectRecord, PurchaseOrder, Quotation, ServiceRecord, ServiceStatus, Task, WorkflowStage } from '@/types/domain'
import {
  mockActivity,
  mockAlerts,
  mockClientCommercial,
  mockExtraPriceEntries,
  mockPurchaseOrderSeeds,
  mockQuotationSeeds,
  mockAssignees,
  mockClients,
  mockCurrencyIndicators,
  mockDocuments,
  mockInvoices,
  mockPayables,
  mockPayments,
  mockProcedureSeeds,
  mockProjectSeeds,
  mockStaff,
  mockSuppliers,
  mockTaskSeeds,
} from './mock'

/*
 * Builds the initial demo dataset from the Phase 1 mock definitions. All ids
 * are deterministic so links (documents → services, alerts → projects) hold.
 * Everything here is fictional demonstration data.
 */

const personId = (ref: string) => `per_${ref}`

function buildStages(templateId: string, idPrefix: string, start: string, due: string, done: number, status: ServiceStatus): WorkflowStage[] {
  const template = getWorkflowTemplate(templateId)
  if (!template) return []
  const dates = scheduleStages(template.stages, start, due)
  const completed = status === 'completed' ? template.stages.length : done
  return template.stages.map((st, j) => {
    const state = j < completed ? 'done' : j === completed && status !== 'not-started' ? 'current' : 'pending'
    return {
      id: `${idPrefix}_st${j + 1}`,
      key: st.key,
      label: st.label,
      status: state,
      dueDate: dates[j],
      completedAt: state === 'done' ? dates[j] : undefined,
    }
  })
}

export function buildSeedDataset(): Dataset {
  const people: Person[] = mockAssignees.flatMap((a) => [
    { id: personId(a.id), name: a.name, nationality: a.nationality, email: a.email, jobTitle: a.jobTitle, employerId: a.clientId },
    ...a.family.map((f) => ({ id: personId(f.id), name: f.name, nationality: a.nationality, age: f.age })),
  ])

  const participants: ProjectParticipant[] = []
  const projects: ProjectRecord[] = []
  const services: ServiceRecord[] = []

  for (const seed of mockProjectSeeds) {
    const assignee = mockAssignees.find((a) => a.id === seed.assigneeId)
    participants.push({ id: `ppt_${seed.id}_b`, projectId: seed.id, personId: personId(seed.assigneeId), role: 'beneficiary' })
    assignee?.family.forEach((f) => participants.push({ id: `ppt_${seed.id}_${f.id}`, projectId: seed.id, personId: personId(f.id), role: f.relation }))

    const created = `${seed.startDate}T09:00:00`
    projects.push({
      id: seed.id,
      code: seed.code,
      clientId: seed.clientId,
      beneficiaryId: personId(seed.assigneeId),
      category: seed.kind,
      origin: seed.origin,
      destination: seed.destination,
      ownerId: seed.ownerId,
      operationalStatus: seed.operationalStatus,
      financialStatus: seed.financialStatus,
      currency: seed.currency,
      startDate: seed.startDate,
      targetDate: seed.targetDate,
      completedAt: seed.operationalStatus === 'completed' ? seed.targetDate : undefined,
      purchaseOrder: seed.purchaseOrder,
      financial: seed.purchaseOrder ? { purchaseOrderId: seed.purchaseOrder } : undefined,
      createdAt: created,
      updatedAt: created,
    })

    seed.services.forEach((s, i) => {
      const id = `${seed.id}_s${i + 1}`
      const type = getServiceType(s.type)
      services.push({
        id,
        projectId: seed.id,
        typeId: type.id,
        templateId: type.workflowTemplateId,
        status: s.status,
        ownerId: s.owner,
        supplierId: s.supplier,
        startDate: seed.startDate,
        dueDate: s.due,
        completedAt: s.status === 'completed' ? s.due : undefined,
        stages: buildStages(type.workflowTemplateId, id, seed.startDate, s.due, s.done, s.status),
        notes: [],
        price: s.price,
        estimatedCost: s.cost,
      })
    })
  }

  const procedures: Procedure[] = mockProcedureSeeds.map((p) => {
    const service = services.find((s) => s.id === p.serviceId)!
    const type = getProcedureType(p.typeId)
    return {
      id: p.id,
      projectId: service.projectId,
      serviceId: p.serviceId,
      typeId: type.id,
      templateId: type.workflowTemplateId,
      personId: personId(p.personRef),
      ownerId: p.owner,
      status: p.status,
      reference: p.reference,
      startDate: p.start,
      dueDate: p.due,
      completedAt: p.status === 'completed' ? p.due : undefined,
      stages: buildStages(type.workflowTemplateId, p.id, p.start, p.due, p.done, p.status),
      notes: [],
    }
  })

  const projectOf = (serviceId: string) => services.find((s) => s.id === serviceId)!.projectId

  const handWritten: Task[] = mockTaskSeeds.map((t) => ({
    id: t.id,
    projectId: projectOf(t.serviceId),
    serviceId: t.serviceId,
    procedureId: t.procedureId,
    title: t.title,
    description: t.description,
    ownerId: t.owner,
    status: t.status,
    waitingOn: t.waitingOn,
    dueDate: t.due,
    createdAt: '2026-10-12T10:00:00',
    createdBy: 'stf_01',
    completedAt: t.completedAt,
  }))

  // Template tasks: open for every current stage, done for the stage just finished.
  const generated: Task[] = []
  const activeProjects = new Set(projects.filter((p) => p.operationalStatus !== 'completed' && p.operationalStatus !== 'cancelled').map((p) => p.id))
  const items: { stages: WorkflowStage[]; templateId: string; projectId: string; serviceId: string; procedureId?: string; ownerId: string }[] = [
    ...services.map((s) => ({ ...s, serviceId: s.id, procedureId: undefined })),
    ...procedures.map((p) => ({ ...p, procedureId: p.id })),
  ]
  for (const item of items) {
    if (!activeProjects.has(item.projectId)) continue
    const template = getWorkflowTemplate(item.templateId)
    const current = item.stages.findIndex((s) => s.status === 'current')
    const targets = current >= 0 ? [current, current - 1] : []
    for (const idx of targets) {
      const stage = item.stages[idx]
      if (!stage) continue
      const titles = template?.stages.find((s) => s.key === stage.key)?.tasks ?? []
      titles.forEach((title, k) => {
        const done = stage.status === 'done'
        generated.push({
          id: `tsk_${stage.id}_${k + 1}`,
          projectId: item.projectId,
          serviceId: item.serviceId,
          procedureId: item.procedureId,
          stageId: stage.id,
          title,
          ownerId: item.ownerId,
          status: done ? 'done' : k === 0 ? 'in-progress' : 'todo',
          dueDate: stage.dueDate,
          createdAt: `${stage.dueDate ?? '2026-10-01'}T09:00:00`,
          createdBy: 'stf_01',
          completedAt: done ? stage.completedAt : undefined,
        })
      })
    }
  }

  const base = {
    clients: mockClients.map(({ priceLists: _legacy, ...c }) => withCommercial(c)),
    projects,
    services,
  }
  const commercial = buildCommercialSeed(base, mockClients.flatMap((c) => priceListsToEntries(c.id, c.priceLists, SEED_TIME)))

  return {
    schemaVersion: SCHEMA_VERSION,
    staff: mockStaff,
    clients: base.clients,
    suppliers: mockSuppliers,
    people,
    participants,
    projects,
    services,
    procedures,
    tasks: [...handWritten, ...generated],
    activity: [...mockActivity].sort((a, b) => b.date.localeCompare(a.date)),
    documents: mockDocuments,
    invoices: mockInvoices,
    payables: mockPayables,
    payments: mockPayments,
    currencyIndicators: mockCurrencyIndicators,
    alerts: mockAlerts,
    ...commercial,
    requests: {},
  }
}

const SEED_TIME = '2026-01-05T09:00:00'

const DEFAULT_POLICY: Client['policy'] = { requiresPurchaseOrder: true, requiresApprovedQuote: true, billingMilestone: 'service-completed', quoteValidityDays: 30 }

/** Adds Phase 3 commercial fields (billing address, policy, notes) to a client record. */
export function withCommercial<T extends Omit<Client, 'policy' | 'billingAddress' | 'notes'>>(client: T): Client {
  const extra = mockClientCommercial[client.id]
  return {
    ...client,
    billingAddress: extra?.billingAddress ?? `${client.headquarters.city}`,
    policy: extra?.policy ?? DEFAULT_POLICY,
    notes: extra?.notes,
  }
}

/**
 * Commercial demo records (tariffs, quotations, POs). Records whose project or
 * services no longer exist are skipped, so this is also safe when upgrading
 * data a user already modified (schema v2 → v3).
 */
export function buildCommercialSeed(
  ds: { clients: Client[]; projects: ProjectRecord[]; services: ServiceRecord[] },
  legacyEntries: PriceEntry[],
): { priceEntries: PriceEntry[]; quotations: Quotation[]; purchaseOrders: PurchaseOrder[] } {
  const clientIds = new Set(ds.clients.map((c) => c.id))
  const priceEntries: PriceEntry[] = [
    ...legacyEntries,
    ...mockExtraPriceEntries.map((e) => ({ ...e, createdAt: SEED_TIME, updatedAt: SEED_TIME })),
  ].filter((e) => clientIds.has(e.clientId))

  const quotations: Quotation[] = []
  for (const q of mockQuotationSeeds) {
    const project = ds.projects.find((p) => p.id === q.projectId)
    const services = ds.services.filter((s) => s.projectId === q.projectId)
    if (!project || services.length === 0) continue
    quotations.push({
      id: q.id,
      number: q.number,
      version: q.version,
      previousVersionId: q.previousVersionId,
      projectId: project.id,
      clientId: project.clientId,
      status: q.status,
      issueDate: q.issueDate,
      validUntil: q.validUntil,
      notes: q.notes,
      createdAt: `${q.issueDate}T10:00:00`,
      createdBy: 'stf_05',
      sentAt: q.sentAt,
      approvedAt: q.approvedAt,
      approvedBy: q.approvedBy,
      rejectedAt: q.status === 'rejected' ? q.sentAt : undefined,
      rejectionReason: q.rejectionReason,
      supersededById: q.supersededById,
      lines: services.map((s, i) => {
        const price = q.prices?.[s.id] ?? s.price ?? 0
        return {
          id: `${q.id}_l${i + 1}`,
          serviceId: s.id,
          serviceTypeId: s.typeId,
          description: `${getServiceType(s.typeId).label} — ${project.destination.city}`,
          quantity: 1,
          unit: 'service' as const,
          unitPrice: price,
          currency: project.currency,
          priceSource: 'price-list' as const,
          suggestedUnitPrice: price,
        }
      }),
    })
  }

  const quotationIds = new Set(quotations.map((q) => q.id))
  const serviceIds = new Set(ds.services.map((s) => s.id))
  const purchaseOrders: PurchaseOrder[] = []
  for (const po of mockPurchaseOrderSeeds) {
    const project = ds.projects.find((p) => p.id === po.projectId)
    if (!project || !quotationIds.has(po.quotationId) || !Object.keys(po.allocations).every((id) => serviceIds.has(id))) continue
    purchaseOrders.push({
      id: po.id,
      internalNumber: po.internalNumber,
      clientPoNumber: po.clientPoNumber,
      clientId: project.clientId,
      projectId: project.id,
      quotationId: po.quotationId,
      issueDate: po.issueDate,
      receivedDate: po.receivedDate,
      currency: project.currency,
      authorizedAmount: po.authorizedAmount,
      allocations: Object.entries(po.allocations).map(([serviceId, amount], i) => ({ id: `${po.id}_a${i + 1}`, serviceId, amount })),
      status: 'active',
      documentRef: `DOCREF-${po.internalNumber}`,
      documentLabel: po.documentLabel,
      createdAt: `${po.receivedDate}T12:00:00`,
      createdBy: 'stf_05',
    })
  }
  return { priceEntries, quotations, purchaseOrders }
}
