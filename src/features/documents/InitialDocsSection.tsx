import { CircleAlert, Download, FilePlus2, FileSpreadsheet, Mail, Paperclip } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DateInput, Field, FormError, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { ROUTES } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { ATTACHMENT_TYPES, validateFile } from '@/domain/finance/attachments'
import { currentFile, initialDocStage, nextStep, projectServiceTypes, servicesUsing, suggestTemplates, type InitialDocumentStage } from '@/domain/initialDocuments'
import { initialDocsEmail, initialStageMeta } from './initialDocs'
import { EmailModal } from '@/features/commercial/documents/EmailModal'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate, formatDateTime } from '@/lib/dates'
import { deleteFile } from '@/services/local/attachmentStore'
import type { InitialDocument, Project } from '@/types/domain'
import { downloadLocalFile, LOCAL_FILES_NOTE, storeLocalFile } from './localFiles'

/** Phase 5.0B: initial documentation of the beneficiary, inside the project's Documents tab. */
export function InitialDocsSection({ project, ws }: { project: Project; ws: Workspace }) {
  const actions = useActions()
  const user = useCurrentUser()
  const { notify } = useToast()
  const { run, busy } = useCommand()
  const person = ws.personById.get(project.beneficiaryId)
  const docs = ws.initialDocuments.filter((d) => d.projectId === project.id)
  const suggestions = suggestTemplates(ws.dataset, projectServiceTypes(ws.dataset, project.id), project.id)
  /** Suggestions are all selected by default; the user unticks the ones not to request. */
  const [unpicked, setUnpicked] = useState<Set<string>>(() => new Set())
  const [sendSel, setSendSel] = useState<Set<string>>(() => new Set())
  const [emailFor, setEmailFor] = useState<InitialDocument[]>()
  const [receiving, setReceiving] = useState<InitialDocument>()
  const [correcting, setCorrecting] = useState<InitialDocument>()
  const sendable = docs.filter((d) => d.status !== 'received')
  const pickedSuggestions = suggestions.filter((s) => !unpicked.has(s.template.id))
  const stages = docs.map((d) => initialDocStage(d, DEMO_TODAY))
  const steps = docs.map((d) => ({ d, step: nextStep(d, DEMO_TODAY) })).filter((x) => x.step)

  const fileOf = (d: InitialDocument) => {
    const t = ws.documentTemplates.find((x) => x.id === d.templateId)
    const cur = t && currentFile(t)
    // Sent documents: the version actually sent; pending ones: the current version.
    const f = d.sentAttachmentId ? t?.files.find((x) => x.attachmentId === d.sentAttachmentId) : cur
    return f ? { attachmentId: f.attachmentId, fileName: f.fileName, version: f.version } : undefined
  }
  const downloadDoc = async (d: InitialDocument) => {
    const f = fileOf(d)
    if (!f || !(await downloadLocalFile(f.attachmentId, f.fileName))) notify({ title: 'Archivo no disponible', description: 'No está guardado en este navegador.' })
  }
  const openReceived = async (id: string) => {
    const a = ws.attachments.find((x) => x.id === id)
    if (!a || !(await downloadLocalFile(id, a.name))) notify({ title: 'Archivo no disponible', description: 'No está guardado en este navegador.' })
  }

  return (
    <Card aria-labelledby="idocs-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="idocs-title"
        title="Documentación inicial del beneficiario"
        description={
          <span>
            {person?.name ?? 'Beneficiario'} ·{' '}
            {person?.email ? person.email : <span className="text-warning">sin email registrado: cargalo en el proyecto antes de enviar</span>}
          </span>
        }
        action={
          sendable.length > 0 && (
            <Button size="sm" onClick={() => setEmailFor(sendable.filter((d) => (sendSel.size ? sendSel.has(d.id) : d.status === 'pending' || d.status === 'correction')))} disabled={!sendSel.size && !sendable.some((d) => d.status === 'pending' || d.status === 'correction')}>
              <Mail aria-hidden className="size-[15px]" strokeWidth={1.9} />
              Preparar email{sendSel.size ? ` (${sendSel.size})` : ''}
            </Button>
          )
        }
      />

      {docs.length > 0 && (
        <div className="mt-[14px] flex flex-wrap gap-[8px]" aria-label="Resumen de la documentación inicial">
          {(Object.keys(initialStageMeta) as InitialDocumentStage[])
            .filter((k) => stages.includes(k))
            .map((k) => (
              <span key={k} className="inline-flex items-center gap-[6px] rounded-full bg-surface-muted px-[10px] py-[4px] text-[12.5px]">
                <StatusBadge meta={initialStageMeta[k]} /> <span className="tabular font-semibold">{stages.filter((s) => s === k).length}</span>
              </span>
            ))}
        </div>
      )}

      {steps.length > 0 && (
        <div className="mt-[12px] rounded-panel bg-surface-muted px-[14px] py-[11px]">
          <p className="text-[13px] font-medium">Próximos pasos</p>
          <ul className="mt-[4px] flex flex-col gap-[2px] text-[13px] text-ink-secondary">
            {steps.map(({ d, step }) => (
              <li key={d.id}>
                <span className="font-medium text-ink">{d.name}:</span> {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-[12px] rounded-panel border border-dashed border-line-strong px-[14px] py-[12px]">
          <p className="flex items-center gap-[6px] text-[13.5px] font-medium">
            <FilePlus2 aria-hidden className="size-[15px]" strokeWidth={1.9} />
            Plantillas sugeridas para los servicios contratados
          </p>
          <ul className="mt-[8px] flex flex-col gap-[6px]">
            {suggestions.map((s) => (
              <li key={s.template.id}>
                <label className="flex flex-wrap items-center gap-[8px] text-[13.5px]">
                  <input
                    type="checkbox"
                    className="size-[16px] accent-[var(--color-ink)]"
                    checked={!unpicked.has(s.template.id)}
                    onChange={(e) => setUnpicked((prev) => (e.target.checked ? new Set([...prev].filter((x) => x !== s.template.id)) : new Set(prev).add(s.template.id)))}
                  />
                  <span className="font-medium">{s.template.name}</span>
                  <span className="text-muted">v{s.template.version} · {s.serviceTypeIds.map((t) => getServiceType(t).label).join(', ')}</span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="mt-[10px]"
            disabled={busy || !pickedSuggestions.length}
            onClick={async () => {
              const ok = await run(() => actions.requestInitialDocuments(project.id, pickedSuggestions.map((s) => s.template.id)), { title: 'Documentación agregada', description: `${pickedSuggestions.length} ${pickedSuggestions.length === 1 ? 'documento pendiente' : 'documentos pendientes'} de enviar.` })
              if (ok) setUnpicked(new Set())
            }}
          >
            Agregar seleccionadas ({pickedSuggestions.length})
          </Button>
        </div>
      )}

      {docs.length === 0 && suggestions.length === 0 && (
        <p className="mt-[14px] text-[13.5px] text-muted">
          No hay plantillas para los servicios de este proyecto.{' '}
          <Link to={ROUTES.documents} className="font-medium text-ink hover:underline">
            Gestionar plantillas
          </Link>
        </p>
      )}

      {docs.length > 0 && (
        <ul className="mt-[14px] flex flex-col gap-[8px]" aria-label="Documentos iniciales del proyecto">
          {docs.map((d) => {
            const stage = initialDocStage(d, DEMO_TODAY)
            const f = fileOf(d)
            const services = servicesUsing(ws.dataset, d)
            return (
              <li key={d.id} className="rounded-panel bg-surface-muted px-[14px] py-[12px]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <label className="flex min-w-0 flex-1 basis-[260px] items-start gap-[10px]">
                    {d.status !== 'received' ? (
                      <input
                        type="checkbox"
                        aria-label={`Incluir ${d.name} en el email`}
                        className="mt-[3px] size-[16px] accent-[var(--color-ink)]"
                        checked={sendSel.has(d.id)}
                        onChange={(e) => setSendSel((prev) => (e.target.checked ? new Set(prev).add(d.id) : new Set([...prev].filter((x) => x !== d.id))))}
                      />
                    ) : (
                      <FileSpreadsheet aria-hidden className="mt-[2px] size-[16px] shrink-0 text-success" strokeWidth={1.9} />
                    )}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-[8px]">
                        <span className="font-medium">{d.name}</span>
                        <StatusBadge meta={initialStageMeta[stage]} />
                      </span>
                      <span className="mt-[2px] flex flex-wrap items-center gap-[6px] text-[12.5px] text-muted">
                        {services.map((s) => (
                          <span key={s.id} className="inline-flex items-center gap-[4px]">
                            <ServiceChip type={s.typeId} />
                            {getServiceType(s.typeId).label}
                          </span>
                        ))}
                        {f && <span>· {f.fileName} (v{f.version})</span>}
                      </span>
                      <span className="mt-[2px] block text-[12.5px] text-muted">
                        {d.sentAt ? `Enviado el ${formatDate(d.sentAt)}${d.sentTo ? ` a ${d.sentTo}` : ''}${d.sentRef ? ` · ${d.sentRef}` : ''}` : 'Sin envío registrado'}
                        {d.receivedAt && ` · Recibido el ${formatDate(d.receivedAt)}`}
                      </span>
                      {d.status === 'correction' && d.correctionNote && (
                        <span className="mt-[2px] flex items-center gap-[5px] text-[12.5px] text-danger">
                          <CircleAlert aria-hidden className="size-[13px]" strokeWidth={2} />
                          {d.correctionNote}
                        </span>
                      )}
                    </span>
                  </label>
                  <span className="flex flex-wrap gap-[6px]">
                    <Button size="sm" variant="secondary" className="h-[32px] px-[10px] text-[12.5px]" onClick={() => downloadDoc(d)} aria-label={`Descargar Excel de ${d.name}`}>
                      <Download aria-hidden className="size-[14px]" strokeWidth={1.9} />
                      Excel
                    </Button>
                    {d.status !== 'pending' && (
                      <Button size="sm" variant="outline" className="h-[32px] px-[10px] text-[12.5px]" onClick={() => setReceiving(d)}>
                        {d.status === 'received' ? 'Adjuntar otra versión' : 'Registrar recepción'}
                      </Button>
                    )}
                    {d.status === 'received' && (
                      <Button size="sm" variant="outline" className="h-[32px] px-[10px] text-[12.5px]" onClick={() => setCorrecting(d)}>
                        Requiere corrección
                      </Button>
                    )}
                    {d.status === 'pending' && (
                      <Button size="sm" variant="secondary" className="h-[32px] px-[10px] text-[12.5px]" disabled={busy} onClick={() => run(() => actions.discardInitialDocument(d.id), { title: 'Documento quitado' })}>
                        Quitar
                      </Button>
                    )}
                  </span>
                </div>
                {d.receivedAttachmentIds.length > 0 && (
                  <ul className="mt-[8px] flex flex-col gap-[4px] pl-[26px]">
                    {d.receivedAttachmentIds.map((id) => {
                      const a = ws.attachments.find((x) => x.id === id)
                      return (
                        <li key={id} className="flex items-center justify-between gap-2 rounded-[12px] bg-surface px-[10px] py-[6px] text-[12.5px]">
                          <span className="flex min-w-0 items-center gap-[6px]">
                            <Paperclip aria-hidden className="size-[13px] shrink-0 text-ink-secondary" strokeWidth={1.9} />
                            <span className="min-w-0">
                              <span className="block truncate">{a?.name ?? id}</span>
                              <span className="block truncate text-[11.5px] text-muted">{a ? formatDateTime(a.createdAt) : ''} · archivo local</span>
                            </span>
                          </span>
                          <button type="button" onClick={() => openReceived(id)} className="shrink-0 rounded-full px-[8px] py-[2px] font-medium text-ink-secondary hover:bg-surface-muted hover:text-ink">
                            Descargar
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-[12px] text-[12px] text-muted">{LOCAL_FILES_NOTE} SIGR no envía emails: el envío y la recepción se registran manualmente.</p>

      {emailFor && (
        <EmailModal
          open
          onClose={() => setEmailFor(undefined)}
          mode="email"
          title={`Documentación inicial para ${person?.name ?? 'el beneficiario'}`}
          draft={initialDocsEmail(ws, project, emailFor, user?.name)}
          docLabel={`${emailFor.length} ${emailFor.length === 1 ? 'documento' : 'documentos'}`}
          downloads={emailFor.map((d) => ({ label: `Descargar ${fileOf(d)?.fileName ?? d.name}`, onDownload: () => downloadDoc(d) }))}
          onRegister={async (input, requestId) => {
            await actions.registerInitialDocsSent(project.id, emailFor.map((d) => d.id), input, requestId)
            setSendSel(new Set())
          }}
        />
      )}
      <ReceiveModal doc={receiving} onClose={() => setReceiving(undefined)} />
      <CorrectionModal doc={correcting} onClose={() => setCorrecting(undefined)} />
    </Card>
  )
}

function ReceiveModal({ doc, onClose }: { doc?: InitialDocument; onClose: () => void }) {
  return (
    <Modal open={Boolean(doc)} onClose={onClose} title={doc ? `Recepción de ${doc.name}` : ''} description="Adjuntá la versión completa si la tenés; también podés registrar la recepción sin archivo." size="sm">
      {doc && <ReceiveForm doc={doc} onClose={onClose} />}
    </Modal>
  )
}

function ReceiveForm({ doc, onClose }: { doc: InitialDocument; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const ref = useRef<HTMLInputElement>(null)
  const [receivedAt, setReceivedAt] = useState(DEMO_TODAY)
  const [file, setFile] = useState<File>()
  const [note, setNote] = useState('')
  const [fileError, setFileError] = useState<string>()
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        let stored: Awaited<ReturnType<typeof storeLocalFile>> | undefined
        if (file) {
          try {
            stored = await storeLocalFile(file)
          } catch (err) {
            return setFileError(err instanceof Error ? err.message : 'No se pudo guardar el archivo en este navegador.')
          }
        }
        const ok = await run(() => actions.registerInitialDocReceived(doc.id, { receivedAt, file: stored, note }), { title: 'Recepción registrada', description: stored ? 'Archivo guardado solo en este navegador.' : undefined })
        if (ok) onClose()
        else if (stored) await deleteFile(stored.attachmentId).catch(() => undefined)
      }}
    >
      <FormError message={formError} />
      <Field label="Fecha de recepción" required error={errors.receivedAt}>
        {(p) => <DateInput {...p} value={receivedAt} min={doc.sentAt} max={DEMO_TODAY} onChange={(e) => setReceivedAt(e.target.value)} />}
      </Field>
      <div>
        <input
          ref={ref}
          type="file"
          className="sr-only"
          aria-label="Versión completada"
          accept={Object.keys(ATTACHMENT_TYPES).join(',')}
          onChange={(e) => {
            const f = e.target.files?.[0]
            const err = f && validateFile(f.type, f.size)
            setFileError(err)
            setFile(err ? undefined : f)
          }}
        />
        <Button size="sm" variant="outline" onClick={() => ref.current?.click()}>
          <Paperclip aria-hidden className="size-[14px]" strokeWidth={1.9} />
          Adjuntar versión completada
        </Button>
        {file && <span className="ml-[8px] text-[13px]">{file.name}</span>}
        {(fileError ?? errors.file) && <p className="mt-[6px] text-[12.5px] font-medium text-danger">{fileError ?? errors.file}</p>}
        <p className="mt-[6px] text-[12px] text-muted">PDF, JPG, PNG, WEBP o XLSX de hasta 5 MB. {LOCAL_FILES_NOTE}</p>
      </div>
      <Field label="Observaciones">{(p) => <TextInput {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}</Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Registrar recepción
        </Button>
      </div>
    </form>
  )
}

function CorrectionModal({ doc, onClose }: { doc?: InitialDocument; onClose: () => void }) {
  return (
    <Modal open={Boolean(doc)} onClose={onClose} title={doc ? `Corrección de ${doc.name}` : ''} description="Los archivos recibidos se conservan; se espera una versión corregida." size="sm">
      {doc && <CorrectionForm doc={doc} onClose={onClose} />}
    </Modal>
  )
}

function CorrectionForm({ doc, onClose }: { doc: InitialDocument; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [note, setNote] = useState('')
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => actions.requestInitialDocCorrection(doc.id, note), { title: 'Corrección registrada' })) onClose()
      }}
    >
      <FormError message={formError} />
      <Field label="Qué hay que corregir" required error={errors.note}>
        {(p) => <TextInput {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}
      </Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Registrar corrección
        </Button>
      </div>
    </form>
  )
}
