import { projectCategoryLabel } from '@/config/catalogs'
import { getServiceType } from '@/config/serviceCatalog'
import type {
  CountryCode,
  CurrencyCode,
  Location,
  ParticipantRole,
  Person,
  ProjectCategory,
  ProjectOperationalStatus,
  ProjectParticipant,
  ProjectRecord,
  ServiceRecord,
} from '@/types/domain'
import { logActivity } from './activity'
import { findById, replaceById } from './collections'
import type { DomainContext } from './context'
import type { Dataset } from './dataset'
import { DomainError, isIsoDate } from './errors'
import { buildService, insertService, validateServiceCommercial, validateServiceInput, type NewServiceInput } from './services'
import { effectivePolicy, openOrderLive } from './commercial/catalog'

export type FamilyRole = Exclude<ParticipantRole, 'beneficiary'>

export interface PersonInput {
  name: string
  nationality: CountryCode | ''
  email?: string
  jobTitle?: string
}

export interface FamilyMemberInput {
  name: string
  role: FamilyRole
  age?: number
  nationality?: CountryCode | ''
}

export interface NewProjectInput {
  clientId: string
  /** Reuse an existing person (e.g. a returning employee) or create one. */
  beneficiaryPersonId?: string
  beneficiary: PersonInput
  family: FamilyMemberInput[]
  origin: { country: CountryCode | ''; city: string }
  destination: { country: CountryCode | ''; city: string }
  category: ProjectCategory | ''
  ownerId: string
  startDate: string
  targetDate: string
  notes?: string
  services: NewServiceInput[]
  /** Phase 4.6: province and open PO applied to the project. */
  province?: string
  openOrderId?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NOTES = 2000

/** Every rule for a new project. Keys are field paths ("family.0.name", "services.1.dueDate"). */
export function validateProjectInput(ds: Dataset, input: NewProjectInput): Record<string, string> {
  const f: Record<string, string> = {}
  if (!ds.clients.some((c) => c.id === input.clientId)) f.clientId = 'Elegí un cliente corporativo.'

  if (input.beneficiaryPersonId) {
    if (!ds.people.some((p) => p.id === input.beneficiaryPersonId)) f['beneficiary.name'] = 'La persona elegida no existe.'
  } else {
    if (!input.beneficiary.name.trim()) f['beneficiary.name'] = 'Ingresá el nombre del beneficiario.'
    if (!input.beneficiary.nationality) f['beneficiary.nationality'] = 'Elegí la nacionalidad.'
    if (input.beneficiary.email && !EMAIL.test(input.beneficiary.email)) f['beneficiary.email'] = 'Email inválido.'
  }
  input.family.forEach((m, i) => {
    if (!m.name.trim()) f[`family.${i}.name`] = 'Ingresá el nombre.'
    if (m.age !== undefined && (!Number.isInteger(m.age) || m.age < 0 || m.age > 120)) f[`family.${i}.age`] = 'Edad inválida.'
  })

  if (!input.origin.country) f['origin.country'] = 'Elegí el país de origen.'
  if (!input.origin.city.trim()) f['origin.city'] = 'Ingresá la ciudad de origen.'
  if (!input.destination.country) f['destination.country'] = 'Elegí el país de destino.'
  if (!input.destination.city.trim()) f['destination.city'] = 'Ingresá la ciudad de destino.'
  if (
    input.origin.country &&
    input.origin.country === input.destination.country &&
    input.origin.city.trim().toLowerCase() === input.destination.city.trim().toLowerCase() &&
    input.origin.city.trim()
  ) {
    f['destination.city'] = 'El destino debe ser distinto del origen.'
  }
  if (!input.category) f.category = 'Elegí la categoría.'
  if (!ds.staff.some((s) => s.id === input.ownerId)) f.ownerId = 'Elegí un responsable interno.'
  if (!isIsoDate(input.startDate)) f.startDate = 'Ingresá la fecha de inicio.'
  if (!isIsoDate(input.targetDate)) f.targetDate = 'Ingresá la fecha estimada de finalización.'
  if (isIsoDate(input.startDate) && isIsoDate(input.targetDate) && input.targetDate <= input.startDate) {
    f.targetDate = 'Debe ser posterior a la fecha de inicio.'
  }
  if ((input.notes?.length ?? 0) > MAX_NOTES) f.notes = `Máximo ${MAX_NOTES} caracteres.`

  if (input.services.length === 0) f.services = 'Agregá al menos un servicio.'
  const projectDates = isIsoDate(input.startDate) && isIsoDate(input.targetDate) ? { startDate: input.startDate, targetDate: input.targetDate } : undefined
  const client = findById(ds.clients, input.clientId)
  const policy = effectivePolicy(client)
  const order = input.openOrderId ? findById(ds.openOrders, input.openOrderId) : undefined
  if (policy.poMode === 'open') {
    if (!input.province?.trim()) f.province = 'Elegí la provincia.'
    if (!order) f.openOrderId = 'Elegí la OC abierta aplicable.'
  }
  if (order) {
    if (order.clientId !== input.clientId) f.openOrderId = 'La OC es de otro cliente.'
    else if (!openOrderLive(order, isIsoDate(input.startDate) ? input.startDate : order.validFrom)) f.openOrderId = 'La OC no está vigente para la fecha de inicio.'
    else if (input.province?.trim() && order.province !== input.province.trim()) f.openOrderId = 'La OC corresponde a otra provincia.'
  }
  const draft = client && draftProject(input, client.billingCurrency, order?.currency)
  input.services.forEach((s, i) => {
    for (const [key, msg] of Object.entries(validateServiceInput(ds, s, projectDates))) f[`services.${i}.${key}`] = msg
    if (draft && !f.openOrderId) for (const [key, msg] of Object.entries(validateServiceCommercial(ds, draft, s))) f[`services.${i}.${key}`] ??= msg
  })
  return f
}

/** Minimal project shape to price and validate services before the project exists. */
export function draftProject(input: NewProjectInput, billingCurrency: CurrencyCode, orderCurrency?: CurrencyCode): ProjectRecord {
  return {
    id: '',
    code: '',
    clientId: input.clientId,
    beneficiaryId: '',
    category: 'long-term',
    origin: { country: (input.origin.country || 'AR') as CountryCode, city: input.origin.city },
    destination: { country: (input.destination.country || 'AR') as CountryCode, city: input.destination.city },
    ownerId: input.ownerId,
    operationalStatus: 'onboarding',
    financialStatus: 'to-quote',
    currency: orderCurrency ?? billingCurrency,
    startDate: input.startDate,
    targetDate: input.targetDate,
    province: input.province?.trim() || undefined,
    openOrderId: input.openOrderId || undefined,
    createdAt: '',
    updatedAt: '',
  }
}

/** Next code in the global sequence for the current year: REL-2026-0163. */
export function nextProjectCode(ds: Dataset, today: string): string {
  const year = today.slice(0, 4)
  const max = ds.projects.reduce((m, p) => {
    const match = /^REL-\d{4}-(\d{4,})$/.exec(p.code)
    return match ? Math.max(m, Number(match[1])) : m
  }, 0)
  return `REL-${year}-${String(max + 1).padStart(4, '0')}`
}

/**
 * Creates a project with its people, participants and services.
 * `requestId` makes creation idempotent: repeating a submission returns the
 * project created the first time instead of a duplicate.
 */
export function createProject(
  ds: Dataset,
  input: NewProjectInput,
  requestId: string,
  ctx: DomainContext,
): { ds: Dataset; projectId: string; duplicate: boolean } {
  const existing = ds.requests[requestId]
  if (existing && ds.projects.some((p) => p.id === existing)) return { ds, projectId: existing, duplicate: true }

  const fields = validateProjectInput(ds, input)
  if (Object.keys(fields).length) throw new DomainError('Revisá los datos del proyecto.', fields)

  const client = findById(ds.clients, input.clientId)!
  const now = ctx.now()
  const projectId = ctx.newId('prj')

  const people: Person[] = []
  let beneficiaryId = input.beneficiaryPersonId
  if (!beneficiaryId) {
    const person: Person = {
      id: ctx.newId('per'),
      name: input.beneficiary.name.trim(),
      nationality: input.beneficiary.nationality as CountryCode,
      email: input.beneficiary.email?.trim() || undefined,
      jobTitle: input.beneficiary.jobTitle?.trim() || undefined,
      employerId: client.id,
    }
    people.push(person)
    beneficiaryId = person.id
  }
  const beneficiary = people[0] ?? findById(ds.people, beneficiaryId)!
  const family: Person[] = input.family.map((m) => ({
    id: ctx.newId('per'),
    name: m.name.trim(),
    nationality: (m.nationality || beneficiary.nationality) as CountryCode,
    age: m.age,
  }))
  people.push(...family)

  const participants: ProjectParticipant[] = [
    { id: ctx.newId('ppt'), projectId, personId: beneficiaryId, role: 'beneficiary' },
    ...family.map((p, i) => ({ id: ctx.newId('ppt'), projectId, personId: p.id, role: input.family[i].role })),
  ]

  const project: ProjectRecord = {
    id: projectId,
    code: nextProjectCode(ds, ctx.today()),
    clientId: client.id,
    beneficiaryId,
    category: input.category as ProjectCategory,
    origin: { country: input.origin.country as CountryCode, city: input.origin.city.trim() },
    destination: { country: input.destination.country as CountryCode, city: input.destination.city.trim() },
    ownerId: input.ownerId,
    operationalStatus: 'onboarding',
    financialStatus: 'to-quote',
    currency: (input.openOrderId && findById(ds.openOrders, input.openOrderId)?.currency) || client.billingCurrency,
    startDate: input.startDate,
    targetDate: input.targetDate,
    notes: input.notes?.trim() || undefined,
    province: input.province?.trim() || undefined,
    openOrderId: input.openOrderId || undefined,
    createdAt: now,
    updatedAt: now,
  }

  let next: Dataset = {
    ...ds,
    people: [...ds.people, ...people],
    participants: [...ds.participants, ...participants],
    projects: [...ds.projects, project],
    requests: { ...ds.requests, [requestId]: projectId },
  }
  const services: ServiceRecord[] = input.services.map((s) => buildService(next, project, s, ctx))
  for (const service of services) next = insertService(next, service, ctx)

  next = logActivity(
    next,
    {
      projectId,
      kind: 'project',
      message: `Proyecto ${project.code} creado para ${beneficiary.name} (${client.name}) con ${services.length} ${services.length === 1 ? 'servicio' : 'servicios'}: ${services.map((s) => getServiceType(s.typeId).label).join(', ')}.`,
    },
    ctx,
  )
  return { ds: next, projectId, duplicate: false }
}

export interface ProjectPatch {
  category?: ProjectCategory
  origin?: Location
  destination?: Location
  ownerId?: string
  startDate?: string
  targetDate?: string
  operationalStatus?: ProjectOperationalStatus
  notes?: string
  beneficiary?: Partial<Omit<PersonInput, 'nationality'>> & { nationality?: CountryCode }
  addFamily?: FamilyMemberInput[]
  removeParticipantIds?: string[]
}

const operationalLabel: Record<ProjectOperationalStatus, string> = {
  onboarding: 'Inicio',
  'in-progress': 'En curso',
  'on-hold': 'En pausa',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
}

export function updateProject(ds: Dataset, projectId: string, patch: ProjectPatch, ctx: DomainContext): Dataset {
  const project = findById(ds.projects, projectId)
  if (!project) throw new DomainError('El proyecto no existe.')
  const merged: ProjectRecord = {
    ...project,
    category: patch.category ?? project.category,
    origin: patch.origin ? { ...patch.origin, city: patch.origin.city.trim() } : project.origin,
    destination: patch.destination ? { ...patch.destination, city: patch.destination.city.trim() } : project.destination,
    ownerId: patch.ownerId ?? project.ownerId,
    startDate: patch.startDate ?? project.startDate,
    targetDate: patch.targetDate ?? project.targetDate,
    operationalStatus: patch.operationalStatus ?? project.operationalStatus,
    notes: patch.notes !== undefined ? patch.notes.trim() || undefined : project.notes,
    updatedAt: ctx.now(),
  }

  const f: Record<string, string> = {}
  if (!merged.origin.city) f['origin.city'] = 'Ingresá la ciudad de origen.'
  if (!merged.destination.city) f['destination.city'] = 'Ingresá la ciudad de destino.'
  if (!ds.staff.some((s) => s.id === merged.ownerId)) f.ownerId = 'Elegí un responsable interno.'
  if (!isIsoDate(merged.startDate)) f.startDate = 'Fecha inválida.'
  if (!isIsoDate(merged.targetDate)) f.targetDate = 'Fecha inválida.'
  if (isIsoDate(merged.startDate) && isIsoDate(merged.targetDate) && merged.targetDate <= merged.startDate) {
    f.targetDate = 'Debe ser posterior a la fecha de inicio.'
  }
  if ((merged.notes?.length ?? 0) > MAX_NOTES) f.notes = `Máximo ${MAX_NOTES} caracteres.`
  if (patch.beneficiary?.name !== undefined && !patch.beneficiary.name.trim()) f['beneficiary.name'] = 'Ingresá el nombre.'
  if (patch.beneficiary?.email && !EMAIL.test(patch.beneficiary.email)) f['beneficiary.email'] = 'Email inválido.'
  patch.addFamily?.forEach((m, i) => {
    if (!m.name.trim()) f[`addFamily.${i}.name`] = 'Ingresá el nombre.'
  })
  if (merged.operationalStatus === 'completed' && project.operationalStatus !== 'completed') {
    const open = ds.services.filter((s) => s.projectId === projectId && s.status !== 'completed').length
    if (open > 0) f.operationalStatus = `Quedan ${open} servicios abiertos. Completalos antes de finalizar el proyecto.`
  }
  const removing = patch.removeParticipantIds ?? []
  for (const pid of removing) {
    const participant = ds.participants.find((p) => p.id === pid && p.projectId === projectId)
    if (!participant) f.family = 'Participante inválido.'
    else if (participant.role === 'beneficiary') f.family = 'No se puede quitar al beneficiario principal.'
    else if (ds.procedures.some((pr) => pr.projectId === projectId && pr.personId === participant.personId)) {
      f.family = `${findById(ds.people, participant.personId)?.name} tiene trámites en este proyecto y no puede quitarse.`
    }
  }
  if (Object.keys(f).length) throw new DomainError('Revisá los datos del proyecto.', f)

  const changes: string[] = []
  if (merged.category !== project.category) changes.push(`categoría: ${projectCategoryLabel[merged.category]}`)
  if (merged.origin.city !== project.origin.city || merged.origin.country !== project.origin.country) changes.push('origen')
  if (merged.destination.city !== project.destination.city || merged.destination.country !== project.destination.country) changes.push('destino')
  if (merged.ownerId !== project.ownerId) changes.push(`responsable: ${findById(ds.staff, merged.ownerId)?.name}`)
  if (merged.startDate !== project.startDate) changes.push('fecha de inicio')
  if (merged.targetDate !== project.targetDate) changes.push('fecha estimada de finalización')
  if (merged.operationalStatus !== project.operationalStatus) changes.push(`estado: ${operationalLabel[merged.operationalStatus]}`)
  if (merged.notes !== project.notes) changes.push('notas')

  let next: Dataset = {
    ...ds,
    projects: replaceById(ds.projects, projectId, () => ({
      ...merged,
      completedAt: merged.operationalStatus === 'completed' ? (project.completedAt ?? ctx.today()) : undefined,
    })),
  }

  if (patch.beneficiary) {
    const b = patch.beneficiary
    const person = findById(ds.people, project.beneficiaryId)
    if (person && (b.name?.trim() !== person.name || b.email !== person.email || b.jobTitle !== person.jobTitle || (b.nationality && b.nationality !== person.nationality))) {
      next = {
        ...next,
        people: replaceById(next.people, person.id, (p) => ({
          ...p,
          name: b.name?.trim() || p.name,
          email: b.email !== undefined ? b.email.trim() || undefined : p.email,
          jobTitle: b.jobTitle !== undefined ? b.jobTitle.trim() || undefined : p.jobTitle,
          nationality: b.nationality ?? p.nationality,
        })),
      }
      changes.push('datos del beneficiario')
    }
  }

  if (patch.addFamily?.length) {
    const beneficiary = findById(next.people, project.beneficiaryId)
    const people = patch.addFamily.map((m) => ({
      id: ctx.newId('per'),
      name: m.name.trim(),
      nationality: (m.nationality || beneficiary?.nationality || 'AR') as CountryCode,
      age: m.age,
    }))
    next = {
      ...next,
      people: [...next.people, ...people],
      participants: [...next.participants, ...people.map((p, i) => ({ id: ctx.newId('ppt'), projectId, personId: p.id, role: patch.addFamily![i].role }))],
    }
    changes.push(`${people.length === 1 ? 'familiar agregado' : 'familiares agregados'}: ${people.map((p) => p.name).join(', ')}`)
  }

  if (removing.length) {
    const names = removing.map((pid) => findById(ds.people, ds.participants.find((p) => p.id === pid)!.personId)?.name)
    next = { ...next, participants: next.participants.filter((p) => !removing.includes(p.id)) }
    changes.push(`${removing.length === 1 ? 'familiar quitado' : 'familiares quitados'}: ${names.join(', ')}`)
  }

  if (changes.length === 0) return ds
  return logActivity(next, { projectId, kind: 'project', message: `Proyecto actualizado — ${changes.join('; ')}.` }, ctx)
}

/** Free-form note on the project timeline. */
export function addProjectNote(ds: Dataset, projectId: string, text: string, ctx: DomainContext): Dataset {
  if (!ds.projects.some((p) => p.id === projectId)) throw new DomainError('El proyecto no existe.')
  const body = text.trim()
  if (!body) throw new DomainError('La nota está vacía.', { text: 'Escribí una nota.' })
  if (body.length > MAX_NOTES) throw new DomainError(`Máximo ${MAX_NOTES} caracteres.`, { text: `Máximo ${MAX_NOTES} caracteres.` })
  return logActivity(ds, { projectId, kind: 'note', message: body }, ctx)
}
