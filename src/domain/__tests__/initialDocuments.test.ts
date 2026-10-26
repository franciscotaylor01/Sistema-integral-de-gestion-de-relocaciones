import { describe, expect, it } from 'vitest'
import type { Dataset } from '@/domain/dataset'
import { XLSX_MIME } from '@/domain/finance/attachments'
import {
  createTemplate,
  discardInitialDocument,
  initialDocStage,
  nextStep,
  projectServiceTypes,
  registerInitialDocReceived,
  registerInitialDocsSent,
  replaceTemplateFile,
  requestInitialDocCorrection,
  requestInitialDocuments,
  servicesUsing,
  suggestTemplates,
  updateTemplate,
  type TemplateFileInput,
} from '@/domain/initialDocuments'
import { createProject } from '@/domain/projects'
import { addService } from '@/domain/services'
import { migrateDataset } from '@/services/local/migrations'
import { readDataset, writeDataset, type StorageLike } from '@/services/local/storage'
import { fieldsOf, projectInput, seed, testContext } from './helpers'

const file = (id: string, name = 'Formulario.xlsx'): TemplateFileInput => ({ attachmentId: id, fileName: name, mime: XLSX_MIME, size: 2048 })
const send = { subject: 'Documentación inicial', body: 'Adjuntamos los formularios.', recipients: 'ada@nordvik.example', sentAt: '2026-10-19', reference: 'Email 19/10' }

/** Library: one template for housing + immigration, one for schooling, one inactive. */
function library() {
  const ctx = testContext()
  let ds = seed()
  const a = createTemplate(ds, { name: 'Ficha de datos personales', description: 'Datos del grupo familiar', serviceTypeIds: ['housing', 'immigration'], active: true }, file('att_a'), 'tpl-a', ctx)
  ds = a.ds
  const b = createTemplate(ds, { name: 'Preferencias escolares', serviceTypeIds: ['schooling'], active: true }, file('att_b', 'Escuelas.xlsx'), 'tpl-b', ctx)
  ds = b.ds
  const c = createTemplate(ds, { name: 'Inventario de mudanza', serviceTypeIds: ['moving'], active: false }, file('att_c'), 'tpl-c', ctx)
  return { ctx, ds: c.ds, a: a.templateId, b: b.templateId, c: c.templateId }
}
const doc = (ds: Dataset, projectId: string, templateId: string) => ds.initialDocuments.find((d) => d.projectId === projectId && d.templateId === templateId)!

describe('template library', () => {
  it('stores metadata, one or several services and the original xlsx as a local attachment', () => {
    const { ds, a } = library()
    const t = ds.documentTemplates.find((x) => x.id === a)!
    expect(t).toMatchObject({ name: 'Ficha de datos personales', serviceTypeIds: ['housing', 'immigration'], version: 1, active: true })
    expect(t.files[0]).toMatchObject({ version: 1, attachmentId: 'att_a', fileName: 'Formulario.xlsx' })
    expect(ds.attachments.find((x) => x.id === 'att_a')).toMatchObject({ entity: 'document-template', entityId: a, storage: 'indexeddb', mime: XLSX_MIME })
    expect(ds.audit[0]).toMatchObject({ entity: 'document-template', action: 'attach' })
    // Only metadata lives in the dataset (never the binary).
    expect(JSON.stringify(ds)).not.toMatch(/base64|blob:/)
  })

  it('validates name, services and an .xlsx file; is idempotent', () => {
    const { ctx, ds } = library()
    expect(Object.keys(fieldsOf(() => createTemplate(ds, { name: 'Ficha de datos personales', serviceTypeIds: [], active: true }, undefined, 'x1', ctx))).sort()).toEqual(['file', 'name', 'serviceTypeIds'])
    expect(fieldsOf(() => createTemplate(ds, { name: 'PDF', serviceTypeIds: ['housing'], active: true }, { attachmentId: 'z', fileName: 'x.pdf', mime: 'application/pdf', size: 10 }, 'x2', ctx)).file).toMatch(/xlsx/)
    const r = createTemplate(ds, { name: 'Otra', serviceTypeIds: ['housing'], active: true }, file('att_z'), 'tpl-a', ctx)
    expect(r.duplicate).toBe(true)
  })

  it('edits keep history; new file versions do not change documents already sent', () => {
    const { ctx, ds: d0, a } = library()
    const p = createProject(d0, projectInput({ initialTemplateIds: [a] }), 'p-v', ctx)
    let ds = registerInitialDocsSent(p.ds, p.projectId, [doc(p.ds, p.projectId, a).id], send, 's-v', ctx).ds
    ds = replaceTemplateFile(ds, a, { ...file('att_a2', 'Formulario v2.xlsx'), notes: 'Agrega CUIL' }, ctx)
    ds = updateTemplate(ds, a, { name: 'Ficha personal', serviceTypeIds: ['housing', 'immigration'], active: true }, ctx)
    const t = ds.documentTemplates.find((x) => x.id === a)!
    expect(t.version).toBe(2)
    expect(t.files.map((f) => f.attachmentId)).toEqual(['att_a', 'att_a2'])
    expect(t.history.map((h) => h.action)).toEqual(['Plantilla creada', 'Nueva versión v2', 'Plantilla actualizada'])
    expect(doc(ds, p.projectId, a)).toMatchObject({ name: 'Ficha de datos personales', sentVersion: 1, sentAttachmentId: 'att_a' })
  })
})

describe('project initial documentation', () => {
  it('suggests templates for the contracted services and creates one request per template (no duplicates)', () => {
    const { ctx, ds: d0, a, b, c } = library()
    // projectInput: immigration + housing + schooling → template A once (two services), B; C inactive.
    const types = projectInput().services.map((s) => s.typeId)
    expect(suggestTemplates(d0, types).map((s) => [s.template.id, s.serviceTypeIds])).toEqual([
      [a, ['housing', 'immigration']],
      [b, ['schooling']],
    ])
    expect(fieldsOf(() => createProject(d0, projectInput({ initialTemplateIds: [c] }), 'p-bad', ctx))).toHaveProperty('initialTemplateIds')
    const p = createProject(d0, projectInput({ initialTemplateIds: [a, b, a] }), 'p-1', ctx)
    const docs = p.ds.initialDocuments.filter((d) => d.projectId === p.projectId)
    expect(docs.map((d) => [d.templateId, d.status])).toEqual([
      [a, 'pending'],
      [b, 'pending'],
    ])
    expect(servicesUsing(p.ds, docs[0]).map((s) => s.typeId).sort()).toEqual(['housing', 'immigration'])
    expect(requestInitialDocuments(p.ds, p.projectId, [a, b], ctx)).toBe(p.ds)
    expect(suggestTemplates(p.ds, projectServiceTypes(p.ds, p.projectId), p.projectId)).toEqual([])
    // Only the beneficiary's recorded email is offered (no invented contacts).
    expect(p.ds.people.find((x) => x.id === p.ds.projects.find((pr) => pr.id === p.projectId)!.beneficiaryId)?.email).toBe('ada@nordvik.example')
  })

  it('sending, follow-up, reception with completed file, correction and new reception', () => {
    const { ctx, ds: d0, a, b } = library()
    const p = createProject(d0, projectInput({ initialTemplateIds: [a, b] }), 'p-2', ctx)
    const A = doc(p.ds, p.projectId, a)
    const B = doc(p.ds, p.projectId, b)
    expect(initialDocStage(A, '2026-10-19')).toBe('pending-send')
    expect(nextStep(A, '2026-10-19')).toMatch(/Enviar/)
    expect(() => registerInitialDocReceived(p.ds, A.id, { receivedAt: '2026-10-19' }, ctx)).toThrow(/envío/)
    expect(fieldsOf(() => registerInitialDocsSent(p.ds, p.projectId, [A.id], { ...send, sentAt: '2026-12-01' }, 's0', ctx))).toHaveProperty('sentAt')

    const r = registerInitialDocsSent(p.ds, p.projectId, [A.id, B.id], send, 's1', ctx)
    let ds = r.ds
    expect(registerInitialDocsSent(ds, p.projectId, [A.id], send, 's1', ctx).duplicate).toBe(true)
    expect(doc(ds, p.projectId, a)).toMatchObject({ status: 'sent', sentAt: '2026-10-19', sentRef: 'Email 19/10', sentTo: 'ada@nordvik.example', sentVersion: 1 })
    expect(ds.communications.at(-1)).toMatchObject({ kind: 'beneficiary-docs', projectId: p.projectId, initialDocumentIds: [A.id, B.id] })
    expect(initialDocStage(doc(ds, p.projectId, a), '2026-10-20')).toBe('sent')
    expect(initialDocStage(doc(ds, p.projectId, a), '2026-10-26')).toBe('awaiting')
    expect(nextStep(doc(ds, p.projectId, a), '2026-10-26')).toMatch(/seguimiento: enviado hace 7 días/)

    ds = registerInitialDocReceived(ds, A.id, { receivedAt: '2026-10-19', file: { attachmentId: 'att_done1', fileName: 'Ficha completa.xlsx', mime: XLSX_MIME, size: 4000 } }, ctx)
    expect(doc(ds, p.projectId, a)).toMatchObject({ status: 'received', receivedAttachmentIds: ['att_done1'] })
    expect(ds.attachments.find((x) => x.id === 'att_done1')).toMatchObject({ entity: 'initial-document', entityId: A.id })
    expect(fieldsOf(() => requestInitialDocCorrection(ds, A.id, ' ', ctx))).toHaveProperty('note')
    ds = requestInitialDocCorrection(ds, A.id, 'Falta el pasaporte del cónyuge', ctx)
    expect(initialDocStage(doc(ds, p.projectId, a), '2026-10-19')).toBe('correction')
    expect(doc(ds, p.projectId, a).receivedAttachmentIds).toEqual(['att_done1']) // files kept
    ds = registerInitialDocReceived(ds, A.id, { receivedAt: '2026-10-19', file: { attachmentId: 'att_done2', fileName: 'Ficha corregida.pdf', mime: 'application/pdf', size: 3000 } }, ctx)
    expect(doc(ds, p.projectId, a)).toMatchObject({ status: 'received', receivedAttachmentIds: ['att_done1', 'att_done2'] })
    expect(doc(ds, p.projectId, a).history.map((h) => h.action)).toEqual(['Documento requerido', 'Enviado', 'Formulario recibido', 'Requiere corrección', 'Formulario recibido'])
    // Received documents are not resent; B can be received without a file.
    expect(fieldsOf(() => registerInitialDocsSent(ds, p.projectId, [A.id], send, 's2', ctx))).toHaveProperty('documents')
    ds = registerInitialDocReceived(ds, B.id, { receivedAt: '2026-10-19', note: 'Entregado en papel' }, ctx)
    expect(doc(ds, p.projectId, b)).toMatchObject({ status: 'received', receivedAttachmentIds: [] })
    expect(() => discardInitialDocument(ds, A.id, ctx)).toThrow(/nunca se enviaron/)
  })

  it('new services suggest new templates without touching existing requests or files', () => {
    const { ctx, ds: d0, a, b } = library()
    const p = createProject(d0, projectInput({ services: [{ typeId: 'housing', ownerId: 'stf_04', startDate: '2026-11-01', dueDate: '2026-12-20' }], initialTemplateIds: [a] }), 'p-3', ctx)
    let ds = registerInitialDocsSent(p.ds, p.projectId, [doc(p.ds, p.projectId, a).id], send, 's3', ctx).ds
    const before = JSON.stringify(doc(ds, p.projectId, a))
    expect(suggestTemplates(ds, projectServiceTypes(ds, p.projectId), p.projectId)).toEqual([])
    // Adding immigration (already covered by A) suggests nothing new; schooling suggests B.
    ds = addService(ds, p.projectId, { typeId: 'immigration', ownerId: 'stf_03', startDate: '2026-11-01', dueDate: '2027-02-15' }, ctx).ds
    expect(suggestTemplates(ds, projectServiceTypes(ds, p.projectId), p.projectId)).toEqual([])
    expect(servicesUsing(ds, doc(ds, p.projectId, a))).toHaveLength(2)
    ds = addService(ds, p.projectId, { typeId: 'schooling', ownerId: 'stf_04', startDate: '2026-11-15', dueDate: '2027-02-01' }, ctx).ds
    expect(suggestTemplates(ds, projectServiceTypes(ds, p.projectId), p.projectId).map((s) => s.template.id)).toEqual([b])
    ds = requestInitialDocuments(ds, p.projectId, [b], ctx)
    expect(JSON.stringify(doc(ds, p.projectId, a))).toBe(before)
    expect(ds.initialDocuments.filter((d) => d.projectId === p.projectId)).toHaveLength(2)
    // A pending request can be removed; it can then be suggested again.
    ds = discardInitialDocument(ds, doc(ds, p.projectId, b).id, ctx)
    expect(suggestTemplates(ds, projectServiceTypes(ds, p.projectId), p.projectId).map((s) => s.template.id)).toEqual([b])
  })

  it('persists and migrates v12 data keeping documents and Phase 4.7 attachments', () => {
    const { ctx, ds: d0, a } = library()
    const p = createProject(d0, projectInput({ initialTemplateIds: [a] }), 'p-4', ctx)
    const mem: Record<string, string> = {}
    const storage: StorageLike = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => void (mem[k] = v), removeItem: (k) => void delete mem[k] }
    writeDataset(storage, p.ds, 'now')
    const back = readDataset(storage).dataset!
    expect(back.documentTemplates).toEqual(p.ds.documentTemplates)
    expect(back.initialDocuments).toEqual(p.ds.initialDocuments)

    const { documentTemplates, initialDocuments, ...v12 } = { ...seed(), schemaVersion: 12, attachments: [{ id: 'att_inv', entity: 'invoice' as const, entityId: 'inv_x', name: 'Factura.pdf', storage: 'reference' as const, reference: 'Drive', createdAt: '2026-10-01', createdBy: 'stf_01' }] }
    expect([documentTemplates, initialDocuments]).toEqual([[], []])
    const out = migrateDataset(v12, 12, 13) as Dataset
    expect(out).toMatchObject({ schemaVersion: 13, documentTemplates: [], initialDocuments: [] })
    expect(out.documents).toEqual(v12.documents)
    expect(out.attachments).toEqual(v12.attachments)
  })
})
