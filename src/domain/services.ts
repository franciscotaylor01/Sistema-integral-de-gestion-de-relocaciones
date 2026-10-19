import { getServiceType } from '@/config/serviceCatalog'
import type { ProjectRecord, ServiceRecord } from '@/types/domain'
import { logActivity } from './activity'
import { findById, replaceById } from './collections'
import type { DomainContext } from './context'
import type { Dataset } from './dataset'
import { DomainError, isIsoDate } from './errors'
import { spawnStageTasks } from './tasks'
import { instantiateStages } from './workflow'

export interface NewServiceInput {
  typeId: string
  ownerId: string
  supplierId?: string
  startDate: string
  dueDate: string
  /** Start the workflow right away (first stage becomes current). */
  startNow?: boolean
  price?: number
}

/** Field errors for a service, keyed by field name (prefix them for nested forms). */
export function validateServiceInput(
  ds: Pick<Dataset, 'staff' | 'suppliers'>,
  input: Partial<NewServiceInput>,
  project?: Pick<ProjectRecord, 'startDate' | 'targetDate'>,
): Record<string, string> {
  const f: Record<string, string> = {}
  const type = input.typeId ? getServiceType(input.typeId) : undefined
  if (!type || !type.active) f.typeId = 'Elegí un tipo de servicio.'
  if (!input.ownerId || !ds.staff.some((s) => s.id === input.ownerId)) f.ownerId = 'Elegí un responsable.'
  if (input.supplierId && !ds.suppliers.some((s) => s.id === input.supplierId)) f.supplierId = 'Proveedor inválido.'
  if (!isIsoDate(input.startDate)) f.startDate = 'Ingresá la fecha de inicio.'
  if (!isIsoDate(input.dueDate)) f.dueDate = 'Ingresá la fecha de vencimiento.'
  if (isIsoDate(input.startDate) && isIsoDate(input.dueDate) && input.dueDate < input.startDate) {
    f.dueDate = 'El vencimiento no puede ser anterior al inicio.'
  }
  if (project && isIsoDate(input.startDate) && input.startDate < project.startDate) {
    f.startDate = 'No puede ser anterior al inicio del proyecto.'
  }
  if (project && isIsoDate(input.dueDate) && input.dueDate > project.targetDate) {
    f.dueDate = 'No puede superar la fecha estimada de finalización del proyecto.'
  }
  if (input.price !== undefined && (!Number.isFinite(input.price) || input.price < 0)) f.price = 'Importe inválido.'
  return f
}

/** Reference price from the client's price list in the project currency, if any. */
function priceFromList(ds: Dataset, project: ProjectRecord, typeId: string) {
  const client = findById(ds.clients, project.clientId)
  const list = client?.priceLists.find((pl) => pl.currency === project.currency && pl.items.some((i) => i.serviceType === typeId))
  const item = list?.items.find((i) => i.serviceType === typeId)
  return list && item ? { price: item.price, priceListId: list.id } : undefined
}

/** Builds a service record (no activity) — shared by project creation and addService. */
export function buildService(ds: Dataset, project: ProjectRecord, input: NewServiceInput, ctx: DomainContext): ServiceRecord {
  const type = getServiceType(input.typeId)
  const fromList = input.price === undefined ? priceFromList(ds, project, input.typeId) : undefined
  return {
    id: ctx.newId('svc'),
    projectId: project.id,
    typeId: type.id,
    templateId: type.workflowTemplateId,
    status: input.startNow ? 'in-progress' : 'not-started',
    ownerId: input.ownerId,
    supplierId: input.supplierId || undefined,
    startDate: input.startDate,
    dueDate: input.dueDate,
    stages: instantiateStages(type.workflowTemplateId, input.startDate, input.dueDate, ctx, { activateFirst: input.startNow }),
    notes: [],
    price: input.price ?? fromList?.price,
    financial: fromList ? { priceListId: fromList.priceListId } : undefined,
  }
}

/** Inserts a built service and creates the tasks of its active stage. */
export function insertService(ds: Dataset, service: ServiceRecord, ctx: DomainContext): Dataset {
  let next: Dataset = { ...ds, services: [...ds.services, service] }
  const active = service.stages.find((s) => s.status === 'current')
  if (active) next = spawnStageTasks(next, { kind: 'service', id: service.id }, active, ctx)
  return next
}

export function addService(ds: Dataset, projectId: string, input: NewServiceInput, ctx: DomainContext): { ds: Dataset; service: ServiceRecord } {
  const project = findById(ds.projects, projectId)
  if (!project) throw new DomainError('El proyecto no existe.')
  if (project.operationalStatus === 'completed' || project.operationalStatus === 'cancelled') {
    throw new DomainError('No se pueden agregar servicios a un proyecto cerrado.')
  }
  const fields = validateServiceInput(ds, input, project)
  if (Object.keys(fields).length) throw new DomainError('Revisá los datos del servicio.', fields)
  const service = buildService(ds, project, input, ctx)
  let next = insertService(ds, service, ctx)
  next = logActivity(next, { projectId, serviceId: service.id, kind: 'service', message: `Servicio agregado: ${getServiceType(service.typeId).label}.` }, ctx)
  next = { ...next, projects: replaceById(next.projects, projectId, (p) => ({ ...p, updatedAt: ctx.now() })) }
  return { ds: next, service }
}

export interface ServicePatch {
  ownerId?: string
  supplierId?: string
  startDate?: string
  dueDate?: string
  price?: number
  estimatedCost?: number
}

export function updateService(ds: Dataset, serviceId: string, patch: ServicePatch, ctx: DomainContext): Dataset {
  const service = findById(ds.services, serviceId)
  if (!service) throw new DomainError('El servicio no existe.')
  const project = findById(ds.projects, service.projectId)
  const merged = { ...service, ...patch, supplierId: patch.supplierId !== undefined ? patch.supplierId || undefined : service.supplierId }
  const fields = validateServiceInput(ds, { ...merged, typeId: service.typeId }, project)
  // Existing services may predate the catalog's active flag; only the type is immutable here.
  delete fields.typeId
  if (patch.estimatedCost !== undefined && (!Number.isFinite(patch.estimatedCost) || patch.estimatedCost < 0)) fields.estimatedCost = 'Importe inválido.'
  if (Object.keys(fields).length) throw new DomainError('Revisá los datos del servicio.', fields)

  const changes: string[] = []
  if (patch.ownerId && patch.ownerId !== service.ownerId) changes.push(`responsable: ${findById(ds.staff, patch.ownerId)?.name}`)
  if (patch.supplierId !== undefined && (patch.supplierId || undefined) !== service.supplierId) {
    changes.push(`proveedor: ${patch.supplierId ? findById(ds.suppliers, patch.supplierId)?.name : 'gestión interna'}`)
  }
  if (patch.startDate && patch.startDate !== service.startDate) changes.push('fecha de inicio')
  if (patch.dueDate && patch.dueDate !== service.dueDate) changes.push('vencimiento')
  if (patch.price !== undefined && patch.price !== service.price) changes.push('precio')
  if (patch.estimatedCost !== undefined && patch.estimatedCost !== service.estimatedCost) changes.push('costo estimado')
  if (changes.length === 0) return ds

  let next: Dataset = { ...ds, services: replaceById(ds.services, serviceId, () => merged) }
  next = logActivity(
    next,
    { projectId: service.projectId, serviceId, kind: 'service', message: `${getServiceType(service.typeId).label} actualizado (${changes.join(', ')}).` },
    ctx,
  )
  return { ...next, projects: replaceById(next.projects, service.projectId, (p) => ({ ...p, updatedAt: ctx.now() })) }
}
