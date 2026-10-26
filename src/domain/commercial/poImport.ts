import type { CurrencyCode, PoImportField, PoImportLine, PoImportRecord, PurchaseOrder } from '@/types/domain'
import { logActivity } from '../activity'
import { findById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError } from '../errors'
import { addAttachment, validateFile } from '../finance/attachments'
import { round2 } from './money'
import { termsFromValue } from './poExtraction'
import { createPurchaseOrder, linkPurchaseOrderDocument, updatePurchaseOrder, type PurchaseOrderInput } from './purchaseOrders'

/*
 * Phase 5.0C.1 — registering a reviewed PO document. Nothing is registered
 * without human confirmation: every doubtful datum must be confirmed, every
 * included line mapped to a contracted service. The PO is created (or, with
 * explicit consent, updated) through the existing commercial flow and keeps
 * the original file / text and the validated data for traceability.
 */

const norm = (s: string) => s.trim().toUpperCase()

/** POs of the same client with the same official number (any status). */
export function duplicatePos(ds: Pick<Dataset, 'purchaseOrders'>, clientId: string, number: string): PurchaseOrder[] {
  if (!number.trim()) return []
  return ds.purchaseOrders.filter((p) => p.clientId === clientId && norm(p.clientPoNumber) === norm(number))
}

export const MAX_SOURCE_TEXT = 20_000

export interface PoImportInput {
  projectId: string
  mode: 'create' | 'update'
  /** Existing PO to update (mode "update"). */
  targetPoId?: string
  /** Explicit consent to overwrite the existing PO data. */
  overwriteConfirmed?: boolean
  source: { kind: 'pdf' | 'xlsx' | 'text'; fileName?: string; file?: { attachmentId: string; mime: string; size: number }; text?: string }
  provider: string
  fields: PoImportField[]
  lines: PoImportLine[]
  receivedDate: string
}

const value = (fields: PoImportField[], key: string) => fields.find((f) => f.key === key)?.value?.trim() || undefined

/** The PO input that results from the reviewed data (allocations = included line amounts per service). */
export function poInputFromReview(ds: Dataset, input: Pick<PoImportInput, 'projectId' | 'fields' | 'lines' | 'receivedDate'>): PurchaseOrderInput {
  const q = value(input.fields, 'quotationRef')
  const quotation = q ? ds.quotations.find((x) => x.projectId === input.projectId && x.number === q && x.status === 'approved' && !x.supersededById) : undefined
  const per = new Map<string, number>()
  for (const l of input.lines) {
    if (!l.included || !l.serviceId) continue
    const amount = l.amount ?? (l.unitPrice !== undefined && l.quantity !== undefined ? l.unitPrice * l.quantity : 0)
    per.set(l.serviceId, round2((per.get(l.serviceId) ?? 0) + amount))
  }
  const notes = [
    value(input.fields, 'adminRefs') && `Referencias: ${value(input.fields, 'adminRefs')}`,
    value(input.fields, 'validTo') && `Vigencia hasta ${value(input.fields, 'validTo')!.split('-').reverse().join('/')}`,
    'Importada desde documento (revisión manual).',
  ].filter(Boolean)
  return {
    projectId: input.projectId,
    clientPoNumber: value(input.fields, 'poNumber') ?? '',
    quotationId: quotation?.id,
    issueDate: value(input.fields, 'issueDate') ?? '',
    receivedDate: input.receivedDate,
    currency: (value(input.fields, 'currency') as CurrencyCode | undefined) ?? '',
    authorizedAmount: Number(value(input.fields, 'total') ?? NaN),
    allocations: [...per].map(([serviceId, amount]) => ({ serviceId, amount })),
    notes: notes.join(' · ') || undefined,
    paymentTerms: termsFromValue(value(input.fields, 'paymentTerms')),
  }
}

/** Pending human review: doubtful data not confirmed, lines without service. */
export function reviewProblems(input: Pick<PoImportInput, 'fields' | 'lines'>): Record<string, string> {
  const f: Record<string, string> = {}
  input.fields.forEach((x, i) => {
    if ((x.status === 'confirm' || x.status === 'inconsistent') && !x.confirmed) f[`fields.${i}`] = `${x.label}: confirmá o corregí el dato.`
  })
  input.lines.forEach((l, i) => {
    if (!l.included) return
    if (!l.serviceId) f[`lines.${i}.serviceId`] = 'Elegí el servicio del proyecto o excluí la línea.'
    else if ((l.status === 'confirm' || l.status === 'inconsistent' || l.status === 'missing') && !l.confirmed) f[`lines.${i}`] = 'Confirmá la línea.'
  })
  if (!input.lines.some((l) => l.included)) f.lines = 'Incluí al menos una línea.'
  return f
}

export function confirmPoImport(ds: Dataset, input: PoImportInput, requestId: string, ctx: DomainContext): { ds: Dataset; poId: string; importId: string; duplicate: boolean } {
  const prior = ds.requests[requestId]
  if (prior) {
    const rec = ds.poImports.find((x) => x.id === prior)
    if (rec) return { ds, poId: rec.poId, importId: rec.id, duplicate: true }
  }
  const project = findById(ds.projects, input.projectId)
  if (!project) throw new DomainError('El proyecto no existe.')
  const problems = reviewProblems(input)
  if (Object.keys(problems).length) throw new DomainError('Hay datos sin revisar. Confirmá cada dato dudoso antes de registrar la OC.', problems)
  if (input.source.file) {
    const err = validateFile(input.source.file.mime, input.source.file.size)
    if (err) throw new DomainError(err, { file: err })
  }
  if ((input.source.text?.length ?? 0) > MAX_SOURCE_TEXT) throw new DomainError(`El texto supera ${MAX_SOURCE_TEXT} caracteres.`, { text: 'Texto demasiado largo.' })

  const po = poInputFromReview(ds, input)
  const dups = duplicatePos(ds, project.clientId, po.clientPoNumber).filter((p) => p.status === 'active')
  let next: Dataset
  let poId: string
  if (input.mode === 'update') {
    const target = input.targetPoId ? findById(ds.purchaseOrders, input.targetPoId) : undefined
    if (!target || target.projectId !== project.id) throw new DomainError('Elegí la OC del proyecto a actualizar.')
    if (target.status !== 'active') throw new DomainError('Una OC anulada no puede actualizarse.')
    if (!input.overwriteConfirmed) throw new DomainError(`Confirmá explícitamente que querés reemplazar los datos de la OC ${target.clientPoNumber}.`, { overwriteConfirmed: 'Confirmación requerida.' })
    next = updatePurchaseOrder(ds, target.id, po, ctx)
    poId = target.id
  } else {
    if (dups.length) throw new DomainError(`El cliente ya tiene la OC ${dups[0].clientPoNumber} vigente (${dups[0].internalNumber}). Revisala o elegí actualizarla.`, { clientPoNumber: 'OC duplicada.' })
    const r = createPurchaseOrder(ds, po, `${requestId}:po`, ctx)
    next = r.ds
    poId = r.poId
  }

  let attachmentId: string | undefined
  if (input.source.file) {
    const r = addAttachment(next, { id: input.source.file.attachmentId, entity: 'purchase-order', entityId: poId, name: input.source.fileName ?? 'OC', mime: input.source.file.mime, size: input.source.file.size, storage: 'indexeddb' }, ctx)
    next = r.ds
    attachmentId = r.attachmentId
  }
  next = linkPurchaseOrderDocument(next, poId, (input.source.fileName ?? 'Texto de email (OC)').slice(0, 120), ctx)

  const excluded = input.lines.filter((l) => !l.included).length
  const warnings = [
    ...input.fields.filter((f) => f.status === 'inconsistent').map((f) => `${f.label}: ${f.note ?? 'inconsistente'} (confirmado: ${f.value ?? 'sin valor'})`),
    ...(excluded ? [`${excluded} línea(s) excluida(s) de la OC.`] : []),
  ]
  const record: PoImportRecord = {
    id: ctx.newId('poi'),
    projectId: project.id,
    clientId: project.clientId,
    poId,
    mode: input.mode,
    source: { kind: input.source.kind, fileName: input.source.fileName, attachmentId, text: input.source.text },
    provider: input.provider,
    fields: input.fields,
    lines: input.lines,
    warnings,
    confirmedAt: ctx.now(),
    confirmedBy: ctx.actorId,
  }
  next = { ...next, poImports: [...next.poImports, record], requests: { ...next.requests, [requestId]: record.id } }
  next = logActivity(
    next,
    {
      projectId: project.id,
      kind: 'commercial',
      message: `OC ${po.clientPoNumber} ${input.mode === 'update' ? 'actualizada' : 'registrada'} desde ${input.source.fileName ?? 'texto de email'} tras revisión manual (${input.lines.filter((l) => l.included).length} líneas${excluded ? `, ${excluded} excluidas` : ''}).`,
    },
    ctx,
  )
  return { ds: next, poId, importId: record.id, duplicate: false }
}
