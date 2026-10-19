import { getProcedureType } from '@/config/procedureCatalog'
import { getServiceType } from '@/config/serviceCatalog'
import type { Procedure } from '@/types/domain'
import { logActivity } from './activity'
import { findById, replaceById } from './collections'
import type { DomainContext } from './context'
import type { Dataset } from './dataset'
import { addDays } from './dates'
import { DomainError, isIsoDate } from './errors'
import { spawnStageTasks } from './tasks'
import { instantiateStages } from './workflow'

export interface NewProcedureInput {
  typeId: string
  personId: string
  ownerId: string
  startDate: string
  dueDate?: string
  reference?: string
}

export function validateProcedureInput(ds: Dataset, serviceId: string, input: Partial<NewProcedureInput>): Record<string, string> {
  const f: Record<string, string> = {}
  const service = findById(ds.services, serviceId)
  if (!service) return { serviceId: 'El servicio no existe.' }
  const allowed = getServiceType(service.typeId).procedureTypes ?? []
  if (!input.typeId || !allowed.includes(input.typeId)) f.typeId = 'Elegí un tipo de trámite.'
  const isParticipant = ds.participants.some((p) => p.projectId === service.projectId && p.personId === input.personId)
  if (!input.personId || !isParticipant) f.personId = 'Elegí una persona del proyecto.'
  if (!input.ownerId || !ds.staff.some((s) => s.id === input.ownerId)) f.ownerId = 'Elegí un responsable.'
  if (!isIsoDate(input.startDate)) f.startDate = 'Ingresá la fecha de inicio.'
  if (input.dueDate && !isIsoDate(input.dueDate)) f.dueDate = 'Fecha inválida.'
  if (isIsoDate(input.startDate) && input.dueDate && isIsoDate(input.dueDate) && input.dueDate < input.startDate) {
    f.dueDate = 'El vencimiento no puede ser anterior al inicio.'
  }
  if (input.reference && input.reference.length > 60) f.reference = 'Máximo 60 caracteres.'
  return f
}

/**
 * Opens a procedure (DNI, TIE, residencia…) for one person inside a
 * migration-type service. The procedure starts on its first stage.
 */
export function addProcedure(ds: Dataset, serviceId: string, input: NewProcedureInput, ctx: DomainContext): { ds: Dataset; procedure: Procedure } {
  const fields = validateProcedureInput(ds, serviceId, input)
  if (Object.keys(fields).length) throw new DomainError('Revisá los datos del trámite.', fields)
  const service = findById(ds.services, serviceId)!
  if (service.status === 'completed') throw new DomainError('Reabrí el servicio para iniciar nuevos trámites.')
  const type = getProcedureType(input.typeId)
  const dueDate = input.dueDate || addDays(input.startDate, type.typicalDays)
  const procedure: Procedure = {
    id: ctx.newId('prc'),
    projectId: service.projectId,
    serviceId,
    typeId: type.id,
    templateId: type.workflowTemplateId,
    personId: input.personId,
    ownerId: input.ownerId,
    status: 'in-progress',
    reference: input.reference?.trim() || undefined,
    startDate: input.startDate,
    dueDate,
    stages: instantiateStages(type.workflowTemplateId, input.startDate, dueDate, ctx, { activateFirst: true }),
    notes: [],
  }
  let next: Dataset = { ...ds, procedures: [...ds.procedures, procedure] }
  next = spawnStageTasks(next, { kind: 'procedure', id: procedure.id }, procedure.stages[0], ctx)
  // Opening a procedure means the migration service is underway.
  if (service.status === 'not-started') {
    next = { ...next, services: replaceById(next.services, serviceId, (s) => ({ ...s, status: 'in-progress' })) }
  }
  const person = findById(ds.people, input.personId)
  next = logActivity(
    next,
    { projectId: service.projectId, serviceId, procedureId: procedure.id, kind: 'procedure', message: `Trámite ${type.label} iniciado para ${person?.name}.` },
    ctx,
  )
  return { ds: next, procedure }
}

export interface ProcedurePatch {
  ownerId?: string
  reference?: string
  dueDate?: string
}

export function updateProcedure(ds: Dataset, procedureId: string, patch: ProcedurePatch, ctx: DomainContext): Dataset {
  const procedure = findById(ds.procedures, procedureId)
  if (!procedure) throw new DomainError('El trámite no existe.')
  const fields: Record<string, string> = {}
  if (patch.ownerId !== undefined && !ds.staff.some((s) => s.id === patch.ownerId)) fields.ownerId = 'Elegí un responsable.'
  if (patch.dueDate && !isIsoDate(patch.dueDate)) fields.dueDate = 'Fecha inválida.'
  if (patch.dueDate && patch.dueDate < procedure.startDate) fields.dueDate = 'El vencimiento no puede ser anterior al inicio.'
  if (patch.reference && patch.reference.length > 60) fields.reference = 'Máximo 60 caracteres.'
  if (Object.keys(fields).length) throw new DomainError('Revisá los datos del trámite.', fields)
  const updated: Procedure = {
    ...procedure,
    ownerId: patch.ownerId ?? procedure.ownerId,
    reference: patch.reference !== undefined ? patch.reference.trim() || undefined : procedure.reference,
    dueDate: patch.dueDate !== undefined ? patch.dueDate || undefined : procedure.dueDate,
  }
  const next: Dataset = { ...ds, procedures: replaceById(ds.procedures, procedureId, () => updated) }
  return logActivity(
    next,
    {
      projectId: procedure.projectId,
      serviceId: procedure.serviceId,
      procedureId,
      kind: 'procedure',
      message: `Trámite ${getProcedureType(procedure.typeId).label} actualizado.`,
    },
    ctx,
  )
}
