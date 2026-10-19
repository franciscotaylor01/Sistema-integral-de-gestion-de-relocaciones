import { getProcedureType } from '@/config/procedureCatalog'
import { getServiceType } from '@/config/serviceCatalog'
import { getWorkflowTemplate } from '@/config/workflowTemplates'
import { SCHEMA_VERSION, type Dataset } from '@/domain/dataset'
import { scheduleStages } from '@/domain/workflow'
import type { Person, Procedure, ProjectParticipant, ProjectRecord, ServiceRecord, ServiceStatus, Task, WorkflowStage } from '@/types/domain'
import {
  mockActivity,
  mockAlerts,
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

  return {
    schemaVersion: SCHEMA_VERSION,
    staff: mockStaff,
    clients: mockClients,
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
    requests: {},
  }
}
