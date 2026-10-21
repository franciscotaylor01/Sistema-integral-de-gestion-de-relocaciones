import { getServiceType } from '@/config/serviceCatalog'
import type { Certificate, CertificateLine, CurrencyCode, ProjectRecord } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { nextNumber } from '../finance/numbering'
import { addMoney, isQuantity, mulMoney } from '../finance/money'
import { effectivePolicy } from './catalog'

/*
 * Client certificates. The certificate itself is generated on the client's
 * external portal; SIGR records its number, presentation and approval and
 * prevents certifying the same quantity twice.
 */

/** Key of a certifiable unit: a contracted sub-service, or a service billed as one line. */
const addQty = (a: number, b: number) => Math.round((a + b) * 1000) / 1000

export const certKey = (serviceId: string, serviceItemId?: string) => `${serviceId}|${serviceItemId ?? ''}`

export interface Certifiable {
  key: string
  serviceId: string
  serviceItemId?: string
  description: string
  unitPrice: number
  /** Contracted quantity (1 for a service billed as a single line). */
  contracted: number
  /** In draft / submitted / approved certificates (rejected ones release it). */
  certified: number
  approved: number
  available: number
}

/** Everything certifiable in a project, with quantities already certified. */
export function certifiableUnits(ds: Dataset, projectId: string, excludeId?: string): Certifiable[] {
  const used = new Map<string, number>()
  const approved = new Map<string, number>()
  for (const c of ds.certificates) {
    if (c.projectId !== projectId || c.status === 'rejected' || c.id === excludeId) continue
    for (const l of c.lines) {
      const k = certKey(l.serviceId, l.serviceItemId)
      used.set(k, addQty(used.get(k) ?? 0, l.quantity))
      if (c.status === 'approved') approved.set(k, addQty(approved.get(k) ?? 0, l.quantity))
    }
  }
  const out: Certifiable[] = []
  for (const s of ds.services.filter((x) => x.projectId === projectId)) {
    const label = getServiceType(s.typeId).label
    const units = s.items?.length
      ? s.items.map((i) => ({ serviceItemId: i.id, description: `${label} — ${i.name}`, unitPrice: i.unitPrice, contracted: i.quantity }))
      : s.price
        ? [{ serviceItemId: undefined, description: label, unitPrice: s.price, contracted: 1 }]
        : []
    for (const u of units) {
      const key = certKey(s.id, u.serviceItemId)
      const certified = used.get(key) ?? 0
      out.push({ key, serviceId: s.id, ...u, certified, approved: approved.get(key) ?? 0, available: Math.max(0, addQty(u.contracted, -certified)) })
    }
  }
  return out
}

/** Approved certified amounts per service (cap for invoicing when certification is required). */
export function approvedCertifiedByService(ds: Dataset, projectId: string): Map<string, Partial<Record<CurrencyCode, number>>> {
  const out = new Map<string, Partial<Record<CurrencyCode, number>>>()
  for (const c of ds.certificates) {
    if (c.projectId !== projectId || c.status !== 'approved') continue
    for (const l of c.lines) {
      const m = out.get(l.serviceId) ?? {}
      m[c.currency] = addMoney(m[c.currency] ?? 0, mulMoney(l.unitPrice, l.quantity))
      out.set(l.serviceId, m)
    }
  }
  return out
}

export const certificateTotal = (c: Pick<Certificate, 'lines'>) => addMoney(...c.lines.map((l) => mulMoney(l.unitPrice, l.quantity)))

export interface CertificateInput {
  projectId: string
  lines: { serviceId: string; serviceItemId?: string; quantity: number }[]
  notes?: string
  /** Allows certifying beyond what is still available (explicit correction). */
  correctionReason?: string
}

export function validateCertificate(ds: Dataset, input: CertificateInput): Record<string, string> {
  const f: Record<string, string> = {}
  const project = findById(ds.projects, input.projectId)
  if (!project) return { projectId: 'El proyecto no existe.' }
  const units = new Map(certifiableUnits(ds, project.id).map((u) => [u.key, u]))
  const lines = input.lines.filter((l) => l.quantity !== 0)
  if (!lines.length) f.lines = 'Elegí al menos un ítem con cantidad.'
  const seen = new Set<string>()
  input.lines.forEach((l, i) => {
    if (l.quantity === 0) return
    const u = units.get(certKey(l.serviceId, l.serviceItemId))
    if (!u) f[`lines.${i}.quantity`] = 'El ítem no pertenece al proyecto.'
    else if (seen.has(u.key)) f[`lines.${i}.quantity`] = 'Ítem repetido.'
    else if (!isQuantity(l.quantity)) f[`lines.${i}.quantity`] = 'Cantidad mayor a 0 (hasta 3 decimales).'
    else if (l.quantity > u.available && !input.correctionReason?.trim()) f[`lines.${i}.quantity`] = `Supera lo pendiente de certificar (${u.available}). Para certificar de nuevo indicá una corrección.`
    if (u) seen.add(u.key)
  })
  return f
}

/** Business-date timestamp: demo date (ctx.today) with the time of day, so all certificate dates share one calendar. */
const stamp = (ctx: DomainContext) => `${ctx.today()}T${ctx.now().slice(11, 19) || '00:00:00'}`

const project = (ds: Dataset, id: string): ProjectRecord => {
  const p = findById(ds.projects, id)
  if (!p) throw new DomainError('El proyecto no existe.')
  return p
}

export function createCertificate(ds: Dataset, input: CertificateInput, requestId: string, ctx: DomainContext): { ds: Dataset; certificateId: string; duplicate: boolean } {
  const prior = ds.requests[requestId]
  if (prior) return { ds, certificateId: prior, duplicate: true }
  const p = project(ds, input.projectId)
  const f = validateCertificate(ds, input)
  if (Object.keys(f).length) throw new DomainError('Revisá el certificado.', f)
  const units = new Map(certifiableUnits(ds, p.id).map((u) => [u.key, u]))
  const lines: CertificateLine[] = input.lines
    .filter((l) => l.quantity !== 0)
    .map((l) => {
      const u = units.get(certKey(l.serviceId, l.serviceItemId))!
      return { id: ctx.newId('cel'), serviceId: l.serviceId, serviceItemId: l.serviceItemId, description: u.description, quantity: l.quantity, unitPrice: u.unitPrice }
    })
  const po = ds.purchaseOrders.find((o) => o.projectId === p.id && o.status === 'active')
  const id = ctx.newId('cer')
  const cert: Certificate = {
    id,
    number: nextNumber(ds.certificates.map((c) => c.number), 'CER', ctx.today()),
    clientId: p.clientId,
    projectId: p.id,
    openOrderId: p.openOrderId,
    purchaseOrderId: p.openOrderId ? undefined : po?.id,
    currency: p.currency,
    lines,
    status: 'draft',
    createdAt: stamp(ctx),
    correctionReason: input.correctionReason?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    documentRef: `DOCREF-${id}`,
    history: [{ id: ctx.newId('ceh'), date: stamp(ctx), actorId: ctx.actorId, action: 'Certificado creado', reason: input.correctionReason?.trim() || undefined }],
  }
  let next: Dataset = { ...ds, certificates: [...ds.certificates, cert], requests: { ...ds.requests, [requestId]: id } }
  next = logActivity(next, { projectId: p.id, kind: 'commercial', message: `Certificado ${cert.number} creado (${lines.length} ítems).` }, ctx)
  return { ds: next, certificateId: id, duplicate: false }
}

function transition(ds: Dataset, id: string, patch: Partial<Certificate>, action: string, ctx: DomainContext, reason?: string): Dataset {
  const c = findById(ds.certificates, id)!
  const entry = { id: ctx.newId('ceh'), date: stamp(ctx), actorId: ctx.actorId, action, reason }
  const next: Dataset = { ...ds, certificates: replaceById(ds.certificates, id, (x) => ({ ...x, ...patch, history: [entry, ...x.history] })) }
  return logActivity(next, { projectId: c.projectId, kind: 'commercial', message: `Certificado ${c.number}: ${action.toLowerCase()}${reason ? ` (${reason})` : ''}.` }, ctx)
}

const must = (ds: Dataset, id: string) => {
  const c = findById(ds.certificates, id)
  if (!c) throw new DomainError('El certificado no existe.')
  return c
}

/** Step 3: the certificate was generated on the client's portal and presented. */
export function submitCertificate(ds: Dataset, id: string, input: { externalNumber: string; date: string }, ctx: DomainContext): Dataset {
  const c = must(ds, id)
  if (c.status !== 'draft') throw new DomainError('Solo se presenta un certificado en borrador.')
  const f: Record<string, string> = {}
  if (!input.externalNumber.trim()) f.externalNumber = 'Ingresá el número oficial del portal del cliente.'
  else if (ds.certificates.some((x) => x.id !== id && x.clientId === c.clientId && x.status !== 'rejected' && x.externalNumber === input.externalNumber.trim())) f.externalNumber = 'Ese número ya está registrado.'
  if (!isIsoDate(input.date)) f.date = 'Fecha inválida.'
  else if (input.date < c.createdAt.slice(0, 10)) f.date = `No puede ser anterior a la creación (${c.createdAt.slice(0, 10)}).`
  else if (input.date > ctx.today()) f.date = 'No puede ser una fecha futura.'
  if (Object.keys(f).length) throw new DomainError('Revisá la presentación.', f)
  return transition(ds, id, { status: 'submitted', externalNumber: input.externalNumber.trim(), submittedAt: input.date }, 'Presentado', ctx)
}

/** Step 4: approval enables invoicing of the certified items. */
export function approveCertificate(ds: Dataset, id: string, input: { date: string }, ctx: DomainContext): Dataset {
  const c = must(ds, id)
  if (c.status !== 'submitted') throw new DomainError('Solo se aprueba un certificado presentado.')
  if (!isIsoDate(input.date)) throw new DomainError('Fecha de aprobación inválida.', { date: 'Fecha inválida.' })
  if (input.date < (c.submittedAt ?? c.createdAt.slice(0, 10))) throw new DomainError('Fecha de aprobación inválida.', { date: `No puede ser anterior a la presentación (${c.submittedAt}).` })
  if (input.date > ctx.today()) throw new DomainError('Fecha de aprobación inválida.', { date: 'No puede ser una fecha futura.' })
  return transition(ds, id, { status: 'approved', approvedAt: input.date }, 'Aprobado', ctx)
}

/** Rejected (or discarded draft): its quantities become certifiable again. Approved ones stay. */
export function rejectCertificate(ds: Dataset, id: string, reason: string, ctx: DomainContext): Dataset {
  const c = must(ds, id)
  if (c.status === 'approved' || c.status === 'rejected') throw new DomainError('Este certificado ya no puede rechazarse.')
  if (!reason.trim()) throw new DomainError('Indicá el motivo.', { reason: 'Indicá el motivo.' })
  if (ds.invoices.some((i) => i.lifecycle !== 'cancelled' && i.lines.some((l) => l.certificateId === id))) throw new DomainError('Hay facturas que usan este certificado.')
  return transition(ds, id, { status: 'rejected', rejectedAt: ctx.today(), rejectionReason: reason.trim() }, c.status === 'draft' ? 'Borrador descartado' : 'Rechazado', ctx, reason.trim())
}

export interface CertificateFlowStep {
  label: string
  done: boolean
}

/** The client-portal workflow, with the next pending step first not done. */
export function certificateFlow(ds: Dataset, c: Certificate): CertificateFlowStep[] {
  const invoiced = ds.invoices.some((i) => i.lifecycle !== 'cancelled' && i.lines.some((l) => l.certificateId === c.id))
  const after = c.status === 'submitted' || c.status === 'approved'
  return [
    { label: 'Revisar servicios e ítems', done: true },
    { label: 'Generar certificado en el portal del cliente', done: after },
    { label: 'Registrar número y presentación', done: after },
    { label: 'Registrar aprobación', done: c.status === 'approved' },
    { label: 'Facturar', done: invoiced },
  ]
}

export const certificationRequired = (ds: Dataset, p: ProjectRecord) => effectivePolicy(findById(ds.clients, p.clientId), p).requiresCertificate
