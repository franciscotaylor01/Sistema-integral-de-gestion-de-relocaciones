import type { Attachment, AttachmentEntity } from '@/types/domain'
import { findById } from '../collections'
import { businessStamp, type DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError } from '../errors'
import { appendAudit } from './audit'

/*
 * Attachment metadata. Binary files are stored by the UI in this browser's
 * IndexedDB (never in localStorage); "reference" records only a document
 * reference and must never claim that a file was saved.
 */

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
}

export interface AttachmentInput {
  id?: string
  entity: AttachmentEntity
  entityId: string
  name: string
  mime?: string
  size?: number
  storage: Attachment['storage']
  reference?: string
}

/** File rules shared by the UI (before storing the blob) and the domain. */
export function validateFile(mime: string | undefined, size: number | undefined): string | undefined {
  if (!mime || !ATTACHMENT_TYPES[mime]) return 'Formato no admitido: solo PDF, JPG, PNG o WEBP.'
  if (!size || size <= 0) return 'El archivo está vacío.'
  if (size > ATTACHMENT_MAX_BYTES) return 'El archivo supera 5 MB.'
  return undefined
}

function entityExists(ds: Dataset, entity: AttachmentEntity, id: string): boolean {
  if (entity === 'invoice') return Boolean(findById(ds.invoices, id))
  if (entity === 'receipt') return Boolean(findById(ds.receipts, id))
  return ds.receipts.some((r) => r.withholdings?.some((w) => w.id === id))
}

export function addAttachment(ds: Dataset, input: AttachmentInput, ctx: DomainContext): { ds: Dataset; attachmentId: string } {
  const f: Record<string, string> = {}
  if (!entityExists(ds, input.entity, input.entityId)) throw new DomainError('El registro al que se adjunta no existe.')
  if (!input.name.trim()) f.name = 'Indicá un nombre.'
  if (input.storage === 'indexeddb') {
    const err = validateFile(input.mime, input.size)
    if (err) f.file = err
  } else if (!input.reference?.trim()) f.reference = 'Indicá dónde está el documento (ruta, email, sistema).'
  if (Object.keys(f).length) throw new DomainError('Revisá el adjunto.', f)
  const att: Attachment = {
    id: input.id ?? ctx.newId('att'),
    entity: input.entity,
    entityId: input.entityId,
    name: input.name.trim(),
    mime: input.storage === 'indexeddb' ? input.mime : undefined,
    size: input.storage === 'indexeddb' ? input.size : undefined,
    storage: input.storage,
    reference: input.reference?.trim() || undefined,
    createdAt: businessStamp(ctx),
    createdBy: ctx.actorId,
  }
  const next = appendAudit({ ...ds, attachments: [...ds.attachments, att] }, { entity: input.entity === 'invoice' ? 'invoice' : 'receipt', entityId: input.entityId, action: 'attach', detail: `${att.name} (${att.storage === 'indexeddb' ? 'archivo local' : 'referencia'})` }, ctx)
  return { ds: next, attachmentId: att.id }
}
