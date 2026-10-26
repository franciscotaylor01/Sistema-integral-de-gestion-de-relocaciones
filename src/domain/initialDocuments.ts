import { getServiceType } from '@/config/serviceCatalog'
import type { CommercialCommunication, DocumentTemplate, HistoryEntry, InitialDocument, ServiceRecord, TemplateFileVersion } from '@/types/domain'
import { logActivity } from './activity'
import { findById, replaceById } from './collections'
import type { DomainContext } from './context'
import type { Dataset } from './dataset'
import { addDays, daysBetween } from './dates'
import { DomainError, isIsoDate } from './errors'
import { addAttachment, validateFile, XLSX_MIME } from './finance/attachments'

/*
 * Phase 5.0B — beneficiary initial documentation. One global library of
 * Excel templates linked to catalog services; each project requests a
 * template at most once (even when several services use it). Files live in
 * this browser's IndexedDB as attachments; nothing is sent by SIGR.
 */

/** Days after sending before a document counts as "pending reception" (follow-up). */
export const FOLLOW_UP_DAYS = 7

const entry = (ctx: DomainContext, action: string, detail?: string): HistoryEntry => ({ id: ctx.newId('his'), date: ctx.now(), actorId: ctx.actorId, action, detail })

/* ───────────── Template library ───────────── */

export interface TemplateFileInput {
  /** Attachment id under which the UI already stored the blob in IndexedDB. */
  attachmentId: string
  fileName: string
  mime: string
  size: number
  notes?: string
}

export interface TemplateInput {
  name: string
  description?: string
  serviceTypeIds: string[]
  active: boolean
}

function validateTemplate(ds: Dataset, input: TemplateInput, id?: string): Record<string, string> {
  const f: Record<string, string> = {}
  const name = input.name.trim()
  if (!name) f.name = 'Ingresá el nombre de la plantilla.'
  else if (name.length > 120) f.name = 'Máximo 120 caracteres.'
  else if (ds.documentTemplates.some((t) => t.id !== id && t.name.trim().toLowerCase() === name.toLowerCase())) f.name = 'Ya existe una plantilla con ese nombre.'
  if ((input.description?.length ?? 0) > 500) f.description = 'Máximo 500 caracteres.'
  if (!input.serviceTypeIds.length) f.serviceTypeIds = 'Asociá al menos un servicio.'
  else if (input.serviceTypeIds.some((t) => !getServiceType(t).workflowTemplateId)) f.serviceTypeIds = 'Servicio inválido.'
  return f
}

function validateTemplateFile(file: TemplateFileInput | undefined): string | undefined {
  if (!file) return 'Adjuntá el Excel original (.xlsx).'
  if (file.mime !== XLSX_MIME || !/\.xlsx$/i.test(file.fileName)) return 'La plantilla debe ser un Excel .xlsx.'
  return validateFile(file.mime, file.size)
}

function attachTemplateFile(ds: Dataset, templateId: string, file: TemplateFileInput, version: number, ctx: DomainContext): { ds: Dataset; fv: TemplateFileVersion } {
  const r = addAttachment(ds, { id: file.attachmentId, entity: 'document-template', entityId: templateId, name: file.fileName, mime: file.mime, size: file.size, storage: 'indexeddb' }, ctx)
  return { ds: r.ds, fv: { version, attachmentId: r.attachmentId, fileName: file.fileName, size: file.size, uploadedAt: ctx.now(), uploadedBy: ctx.actorId, notes: file.notes?.trim() || undefined } }
}

export function createTemplate(ds: Dataset, input: TemplateInput, file: TemplateFileInput | undefined, requestId: string, ctx: DomainContext): { ds: Dataset; templateId: string; duplicate: boolean } {
  const prior = ds.requests[requestId]
  if (prior) return { ds, templateId: prior, duplicate: true }
  const f = validateTemplate(ds, input)
  const fileError = validateTemplateFile(file)
  if (fileError) f.file = fileError
  if (Object.keys(f).length) throw new DomainError('Revisá la plantilla.', f)
  const id = ctx.newId('dtp')
  const template: DocumentTemplate = {
    id,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    serviceTypeIds: [...new Set(input.serviceTypeIds)],
    version: 1,
    files: [],
    active: input.active,
    history: [entry(ctx, 'Plantilla creada', `v1 · ${file!.fileName}`)],
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
    updatedAt: ctx.now(),
  }
  let next: Dataset = { ...ds, documentTemplates: [...ds.documentTemplates, template], requests: { ...ds.requests, [requestId]: id } }
  const r = attachTemplateFile(next, id, file!, 1, ctx)
  next = { ...r.ds, documentTemplates: replaceById(r.ds.documentTemplates, id, (t) => ({ ...t, files: [r.fv] })) }
  return { ds: next, templateId: id, duplicate: false }
}

export function updateTemplate(ds: Dataset, id: string, input: TemplateInput, ctx: DomainContext): Dataset {
  const t = findById(ds.documentTemplates, id)
  if (!t) throw new DomainError('La plantilla no existe.')
  const f = validateTemplate(ds, input, id)
  if (Object.keys(f).length) throw new DomainError('Revisá la plantilla.', f)
  const changes: string[] = []
  if (input.name.trim() !== t.name) changes.push(`nombre: ${input.name.trim()}`)
  if ((input.description?.trim() || undefined) !== t.description) changes.push('descripción')
  const services = [...new Set(input.serviceTypeIds)]
  if (services.join() !== t.serviceTypeIds.join()) changes.push(`servicios: ${services.map((s) => getServiceType(s).label).join(', ')}`)
  if (input.active !== t.active) changes.push(input.active ? 'activada' : 'desactivada')
  if (!changes.length) return ds
  return {
    ...ds,
    documentTemplates: replaceById(ds.documentTemplates, id, (x) => ({
      ...x,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      serviceTypeIds: services,
      active: input.active,
      updatedAt: ctx.now(),
      history: [...x.history, entry(ctx, 'Plantilla actualizada', changes.join(' · '))],
    })),
  }
}

/** New file version; documents already sent keep the version they were sent with. */
export function replaceTemplateFile(ds: Dataset, id: string, file: TemplateFileInput, ctx: DomainContext): Dataset {
  const t = findById(ds.documentTemplates, id)
  if (!t) throw new DomainError('La plantilla no existe.')
  const err = validateTemplateFile(file)
  if (err) throw new DomainError('Revisá el archivo.', { file: err })
  const version = t.version + 1
  const r = attachTemplateFile(ds, id, file, version, ctx)
  return {
    ...r.ds,
    documentTemplates: replaceById(r.ds.documentTemplates, id, (x) => ({
      ...x,
      version,
      files: [...x.files, r.fv],
      updatedAt: ctx.now(),
      history: [...x.history, entry(ctx, `Nueva versión v${version}`, `${file.fileName}${r.fv.notes ? ` · ${r.fv.notes}` : ''}`)],
    })),
  }
}

export const currentFile = (t: Pick<DocumentTemplate, 'files' | 'version'>) => t.files.find((f) => f.version === t.version)

/* ───────────── Project requests ───────────── */

export interface TemplateSuggestion {
  template: DocumentTemplate
  /** Project services (or wizard service types) that use this template. */
  serviceTypeIds: string[]
}

/** Active templates for these service types, excluding those already requested in the project. */
export function suggestTemplates(ds: Pick<Dataset, 'documentTemplates' | 'initialDocuments'>, serviceTypeIds: string[], projectId?: string): TemplateSuggestion[] {
  const requested = new Set(ds.initialDocuments.filter((d) => d.projectId === projectId).map((d) => d.templateId))
  const types = new Set(serviceTypeIds)
  return ds.documentTemplates
    .filter((t) => t.active && currentFile(t) && !requested.has(t.id) && t.serviceTypeIds.some((s) => types.has(s)))
    .map((template) => ({ template, serviceTypeIds: template.serviceTypeIds.filter((s) => types.has(s)) }))
}

export const projectServiceTypes = (ds: Pick<Dataset, 'services'>, projectId: string) => [...new Set(ds.services.filter((s) => s.projectId === projectId).map((s) => s.typeId))]

/** Services of the project that use the document's template (derived, so new services are included). */
export function servicesUsing(ds: Pick<Dataset, 'services' | 'documentTemplates'>, doc: InitialDocument): ServiceRecord[] {
  const t = findById(ds.documentTemplates, doc.templateId)
  return ds.services.filter((s) => s.projectId === doc.projectId && t?.serviceTypeIds.includes(s.typeId))
}

/** Adds the selected templates to the project; already requested ones are skipped (never duplicated). */
export function requestInitialDocuments(ds: Dataset, projectId: string, templateIds: string[], ctx: DomainContext): Dataset {
  const project = findById(ds.projects, projectId)
  if (!project) throw new DomainError('El proyecto no existe.')
  const existing = new Set(ds.initialDocuments.filter((d) => d.projectId === projectId).map((d) => d.templateId))
  const created: InitialDocument[] = []
  for (const id of new Set(templateIds)) {
    if (existing.has(id)) continue
    const t = findById(ds.documentTemplates, id)
    if (!t || !t.active) throw new DomainError('La plantilla no existe o está inactiva.')
    if (!currentFile(t)) throw new DomainError(`La plantilla ${t.name} no tiene archivo.`)
    created.push({ id: ctx.newId('idc'), projectId, templateId: id, name: t.name, status: 'pending', receivedAttachmentIds: [], history: [entry(ctx, 'Documento requerido', `Plantilla ${t.name} v${t.version}`)], createdAt: ctx.now(), createdBy: ctx.actorId })
  }
  if (!created.length) return ds
  const next: Dataset = { ...ds, initialDocuments: [...ds.initialDocuments, ...created] }
  return logActivity(next, { projectId, kind: 'document', message: `Documentación inicial requerida: ${created.map((d) => d.name).join(', ')}.` }, ctx)
}

/** Only requests never sent and without files can be removed. */
export function discardInitialDocument(ds: Dataset, docId: string, ctx: DomainContext): Dataset {
  const d = findById(ds.initialDocuments, docId)
  if (!d) throw new DomainError('El documento no existe.')
  if (d.status !== 'pending' || d.sentAt || d.receivedAttachmentIds.length) throw new DomainError('Solo se quitan documentos que nunca se enviaron.')
  const next: Dataset = { ...ds, initialDocuments: ds.initialDocuments.filter((x) => x.id !== docId) }
  return logActivity(next, { projectId: d.projectId, kind: 'document', message: `Documento inicial quitado: ${d.name}.` }, ctx)
}

/* ───────────── Stages and next steps ───────────── */

export type InitialDocumentStage = 'pending-send' | 'sent' | 'awaiting' | 'received' | 'correction'

export function initialDocStage(d: Pick<InitialDocument, 'status' | 'sentAt'>, today: string): InitialDocumentStage {
  if (d.status === 'pending') return 'pending-send'
  if (d.status === 'received') return 'received'
  if (d.status === 'correction') return 'correction'
  return d.sentAt && daysBetween(d.sentAt, today) >= FOLLOW_UP_DAYS ? 'awaiting' : 'sent'
}

export function nextStep(d: InitialDocument, today: string): string | undefined {
  switch (initialDocStage(d, today)) {
    case 'pending-send':
      return 'Enviar al beneficiario.'
    case 'sent':
      return `Esperar el formulario completo (seguimiento desde el ${addDays(d.sentAt!, FOLLOW_UP_DAYS).split('-').reverse().join('/')}).`
    case 'awaiting':
      return `Hacer seguimiento: enviado hace ${daysBetween(d.sentAt!, today)} días sin respuesta.`
    case 'correction':
      return `Pedir la corrección y esperar la versión corregida${d.correctionNote ? `: ${d.correctionNote}` : '.'}`
    default:
      return undefined
  }
}

/* ───────────── Sending and reception (manual records) ───────────── */

export interface InitialDocsSendInput {
  subject: string
  body: string
  recipients?: string
  sentAt: string
  reference?: string
}

/** Registers that the user sent the selected documents (outside SIGR), snapshotting the file version sent. */
export function registerInitialDocsSent(ds: Dataset, projectId: string, docIds: string[], input: InitialDocsSendInput, requestId: string, ctx: DomainContext): { ds: Dataset; communicationId: string; duplicate: boolean } {
  const prior = ds.requests[requestId]
  if (prior) return { ds, communicationId: prior, duplicate: true }
  const project = findById(ds.projects, projectId)
  if (!project) throw new DomainError('El proyecto no existe.')
  const docs = docIds.map((id) => findById(ds.initialDocuments, id))
  const f: Record<string, string> = {}
  if (!docIds.length || docs.some((d) => !d || d.projectId !== projectId)) f.documents = 'Elegí los documentos del proyecto a enviar.'
  else if (docs.some((d) => d!.status === 'received')) f.documents = 'Hay documentos ya recibidos: no se reenvían.'
  if (!input.subject.trim()) f.subject = 'Ingresá el asunto.'
  if (!input.body.trim()) f.body = 'Ingresá el cuerpo del email.'
  if (!isIsoDate(input.sentAt)) f.sentAt = 'Fecha inválida.'
  else if (input.sentAt > ctx.today()) f.sentAt = 'No puede ser una fecha futura.'
  if (Object.keys(f).length) throw new DomainError('Revisá el registro de envío.', f)

  const ids = new Set(docIds)
  const reference = input.reference?.trim() || undefined
  const recipients = input.recipients?.trim() || undefined
  let next: Dataset = {
    ...ds,
    initialDocuments: ds.initialDocuments.map((d) => {
      if (!ids.has(d.id)) return d
      const t = findById(ds.documentTemplates, d.templateId)
      const file = t && currentFile(t)
      const resend = d.status !== 'pending'
      return {
        ...d,
        status: 'sent' as const,
        sentAt: input.sentAt,
        sentRef: reference,
        sentTo: recipients,
        sentVersion: file?.version ?? d.sentVersion,
        sentAttachmentId: file?.attachmentId ?? d.sentAttachmentId,
        history: [...d.history, entry(ctx, resend ? 'Reenviado' : 'Enviado', [`v${file?.version ?? d.sentVersion}`, input.sentAt, recipients, reference].filter(Boolean).join(' · '))],
      }
    }),
  }
  const com: CommercialCommunication = {
    id: ctx.newId('com'),
    kind: 'beneficiary-docs',
    clientId: project.clientId,
    projectId,
    subject: input.subject.trim(),
    body: input.body.trim(),
    recipients,
    sentAt: input.sentAt,
    reference,
    initialDocumentIds: docIds,
    registeredAt: ctx.now(),
    registeredBy: ctx.actorId,
  }
  next = { ...next, communications: [...next.communications, com], requests: { ...next.requests, [requestId]: com.id } }
  next = logActivity(next, { projectId, kind: 'document', message: `Documentación inicial enviada (registro manual): ${docs.map((d) => d!.name).join(', ')}.` }, ctx)
  return { ds: next, communicationId: com.id, duplicate: false }
}

export interface ReceptionInput {
  receivedAt: string
  /** Completed version already stored in IndexedDB by the UI (optional). */
  file?: { attachmentId: string; fileName: string; mime: string; size: number }
  note?: string
}

/** Records the completed form. A file is optional (it may arrive by other means). */
export function registerInitialDocReceived(ds: Dataset, docId: string, input: ReceptionInput, ctx: DomainContext): Dataset {
  const d = findById(ds.initialDocuments, docId)
  if (!d) throw new DomainError('El documento no existe.')
  if (d.status === 'pending') throw new DomainError('Registrá primero el envío al beneficiario.')
  const f: Record<string, string> = {}
  if (!isIsoDate(input.receivedAt)) f.receivedAt = 'Fecha inválida.'
  else if (input.receivedAt > ctx.today()) f.receivedAt = 'No puede ser una fecha futura.'
  else if (d.sentAt && input.receivedAt < d.sentAt) f.receivedAt = 'No puede ser anterior al envío.'
  if (input.file) {
    const err = validateFile(input.file.mime, input.file.size)
    if (err) f.file = err
  }
  if (Object.keys(f).length) throw new DomainError('Revisá la recepción.', f)
  let next = ds
  let attachmentId: string | undefined
  if (input.file) {
    const r = addAttachment(ds, { id: input.file.attachmentId, entity: 'initial-document', entityId: docId, name: input.file.fileName, mime: input.file.mime, size: input.file.size, storage: 'indexeddb' }, ctx)
    next = r.ds
    attachmentId = r.attachmentId
  }
  next = {
    ...next,
    initialDocuments: replaceById(next.initialDocuments, docId, (x) => ({
      ...x,
      status: 'received',
      receivedAt: input.receivedAt,
      correctionNote: undefined,
      receivedAttachmentIds: attachmentId ? [...x.receivedAttachmentIds, attachmentId] : x.receivedAttachmentIds,
      history: [...x.history, entry(ctx, 'Formulario recibido', [input.receivedAt, input.file?.fileName ?? 'sin archivo adjunto', input.note?.trim()].filter(Boolean).join(' · '))],
    })),
  }
  return logActivity(next, { projectId: d.projectId, kind: 'document', message: `Documento inicial recibido: ${d.name}${input.file ? ' (versión completa adjunta)' : ''}.` }, ctx)
}

/** Received form with problems: files are kept; a corrected version is expected. */
export function requestInitialDocCorrection(ds: Dataset, docId: string, note: string, ctx: DomainContext): Dataset {
  const d = findById(ds.initialDocuments, docId)
  if (!d) throw new DomainError('El documento no existe.')
  if (d.status !== 'received') throw new DomainError('Solo se piden correcciones de documentos recibidos.')
  if (!note.trim()) throw new DomainError('Indicá qué hay que corregir.', { note: 'Indicá qué hay que corregir.' })
  const next: Dataset = { ...ds, initialDocuments: replaceById(ds.initialDocuments, docId, (x) => ({ ...x, status: 'correction', correctionNote: note.trim(), history: [...x.history, entry(ctx, 'Requiere corrección', note.trim())] })) }
  return logActivity(next, { projectId: d.projectId, kind: 'document', message: `Documento inicial requiere corrección: ${d.name} — ${note.trim()}.` }, ctx)
}
