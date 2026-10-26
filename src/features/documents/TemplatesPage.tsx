import { Download, FileSpreadsheet, Pencil, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, FormError, Switch, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchField } from '@/components/ui/SearchField'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { activeServiceTypes, getServiceType } from '@/config/serviceCatalog'
import { randomId } from '@/domain/context'
import { validateFile, XLSX_MIME } from '@/domain/finance/attachments'
import { currentFile, type TemplateInput } from '@/domain/initialDocuments'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { formatDateTime } from '@/lib/dates'
import { cardVariants } from '@/lib/motion'
import { matches } from '@/lib/search'
import { deleteFile } from '@/services/local/attachmentStore'
import type { DocumentTemplate } from '@/types/domain'
import { downloadLocalFile, LOCAL_FILES_NOTE, storeLocalFile } from './localFiles'

/** Phase 5.0B: one global library of beneficiary templates (Excel), linked to catalog services. */
export function TemplatesPage() {
  const { workspace: ws, loading } = useWorkspace()
  const { notify } = useToast()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<{ template?: DocumentTemplate }>()
  const rows = (ws?.documentTemplates ?? []).filter((t) => matches(q, t.name, t.description, ...t.serviceTypeIds.map((s) => getServiceType(s).label)))
  const download = async (t: DocumentTemplate) => {
    const f = currentFile(t)
    if (!f || !(await downloadLocalFile(f.attachmentId, f.fileName))) notify({ title: 'Archivo no disponible', description: 'No está guardado en este navegador.' })
  }

  return (
    <div className="pt-[5px]">
      <PageHeader
        title="Plantillas documentales"
        description="Formularios Excel que se envían a los beneficiarios según los servicios contratados. Una sola biblioteca para todos los proyectos."
        actions={
          <Button onClick={() => setEditing({})} disabled={!ws}>
            <Plus aria-hidden className="size-[17px]" strokeWidth={2} />
            Nueva plantilla
          </Button>
        }
      />
      <motion.div variants={cardVariants} initial="hidden" animate="show">
        <Card className="mt-[30px] px-[19px] pb-[19px] pt-[19px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <SearchField value={q} onChange={setQ} label="Buscar plantillas" placeholder="Nombre o servicio…" className="sm:w-[340px]" />
            <p className="text-[12.5px] text-muted">{LOCAL_FILES_NOTE}</p>
          </div>
          {loading || !ws ? (
            <div className="mt-[18px]">
              <TableSkeleton />
            </div>
          ) : (
            <DataTable
              className="mt-[18px]"
              caption="Plantillas documentales"
              rows={rows}
              getRowId={(t) => t.id}
              minWidth={860}
              columns={[
                {
                  id: 'name',
                  header: 'Plantilla',
                  width: '32%',
                  cell: (t) => (
                    <span className="flex min-w-0 items-center gap-[10px]">
                      <span aria-hidden className="grid size-[28px] shrink-0 place-items-center rounded-[8px] bg-surface-sunken text-ink-secondary">
                        <FileSpreadsheet className="size-[14px]" strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{t.name}</span>
                        <span className="block truncate text-[12px] text-muted">{t.description ?? currentFile(t)?.fileName}</span>
                      </span>
                    </span>
                  ),
                },
                {
                  id: 'services',
                  header: 'Servicios',
                  width: '26%',
                  cell: (t) => (
                    <span className="flex flex-wrap gap-[6px]">
                      {t.serviceTypeIds.map((s) => (
                        <span key={s} className="inline-flex items-center gap-[5px] text-[13px]">
                          <ServiceChip type={s} />
                          {getServiceType(s).label}
                        </span>
                      ))}
                    </span>
                  ),
                },
                { id: 'version', header: 'Versión', width: '9%', className: 'tabular', cell: (t) => `v${t.version}` },
                { id: 'usage', header: 'Proyectos', width: '9%', className: 'tabular', cell: (t) => ws.initialDocuments.filter((d) => d.templateId === t.id).length },
                { id: 'status', header: 'Estado', width: '10%', cell: (t) => <StatusBadge meta={t.active ? { label: 'Activa', tone: 'success' } : { label: 'Inactiva', tone: 'neutral' }} /> },
                {
                  id: 'actions',
                  header: <span className="sr-only">Acciones</span>,
                  width: '14%',
                  cell: (t) => (
                    <span className="flex justify-end gap-[4px]">
                      <Button size="sm" variant="secondary" className="h-[32px] px-[10px]" aria-label={`Descargar ${t.name}`} onClick={() => download(t)}>
                        <Download aria-hidden className="size-[14px]" strokeWidth={1.9} />
                      </Button>
                      <Button size="sm" variant="secondary" className="h-[32px] px-[10px]" aria-label={`Editar ${t.name}`} onClick={() => setEditing({ template: t })}>
                        <Pencil aria-hidden className="size-[14px]" strokeWidth={1.9} />
                      </Button>
                    </span>
                  ),
                },
              ]}
              empty={<EmptyState icon={FileSpreadsheet} title={ws.documentTemplates.length ? 'Sin coincidencias' : 'Sin plantillas'} description={ws.documentTemplates.length ? 'Probá con otra búsqueda.' : 'Cargá el primer formulario Excel para beneficiarios.'} />}
            />
          )}
        </Card>
      </motion.div>
      {ws && <TemplateModal state={editing} onClose={() => setEditing(undefined)} ws={ws} />}
    </div>
  )
}

function TemplateModal({ state, onClose, ws }: { state?: { template?: DocumentTemplate }; onClose: () => void; ws: Workspace }) {
  const t = state?.template
  return (
    <Modal open={Boolean(state)} onClose={onClose} title={t ? `Editar ${t.name}` : 'Nueva plantilla'} description={LOCAL_FILES_NOTE} size="md">
      {state && <TemplateForm template={t} ws={ws} onClose={onClose} />}
    </Modal>
  )
}

function TemplateForm({ template: t, ws, onClose }: { template?: DocumentTemplate; ws: Workspace; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const fileRef = useRef<HTMLInputElement>(null)
  const [requestId] = useState(() => randomId('req'))
  const [input, setInput] = useState<TemplateInput>({ name: t?.name ?? '', description: t?.description ?? '', serviceTypeIds: t?.serviceTypeIds ?? [], active: t?.active ?? true })
  const [file, setFile] = useState<File>()
  const [notes, setNotes] = useState('')
  const [fileError, setFileError] = useState<string>()
  const toggle = (id: string) => setInput((x) => ({ ...x, serviceTypeIds: x.serviceTypeIds.includes(id) ? x.serviceTypeIds.filter((s) => s !== id) : [...x.serviceTypeIds, id] }))
  const current = t && currentFile(t)

  const pick = (f?: File) => {
    setFileError(undefined)
    if (!f) return
    const err = f.type !== XLSX_MIME || !/\.xlsx$/i.test(f.name) ? 'La plantilla debe ser un Excel .xlsx.' : validateFile(f.type, f.size)
    if (err) {
      setFile(undefined)
      setFileError(err)
      if (fileRef.current) fileRef.current.value = ''
    } else setFile(f)
  }

  const submit = async () => {
    let stored: Awaited<ReturnType<typeof storeLocalFile>> | undefined
    if (file) {
      try {
        stored = await storeLocalFile(file)
      } catch (e) {
        return setFileError(e instanceof Error ? e.message : 'No se pudo guardar el archivo en este navegador.')
      }
    }
    const ok = await run(
      async () => {
        if (!t) return actions.createTemplate(input, stored, requestId)
        await actions.updateTemplate(t.id, input)
        if (stored) await actions.replaceTemplateFile(t.id, { ...stored, notes })
        return true
      },
      { title: t ? 'Plantilla actualizada' : 'Plantilla creada', description: stored ? 'Excel guardado solo en este navegador.' : undefined },
    )
    if (ok) onClose()
    else if (stored) await deleteFile(stored.attachmentId).catch(() => undefined)
  }

  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <FormError message={formError} />
      <Field label="Nombre" required error={errors.name}>
        {(p) => <TextInput {...p} value={input.name} onChange={(e) => setInput((x) => ({ ...x, name: e.target.value }))} maxLength={120} />}
      </Field>
      <Field label="Descripción" error={errors.description}>
        {(p) => <TextArea {...p} rows={2} value={input.description} onChange={(e) => setInput((x) => ({ ...x, description: e.target.value }))} maxLength={500} />}
      </Field>
      <fieldset>
        <legend className="mb-[6px] text-[13.5px] font-medium text-ink-secondary">
          Servicios asociados <span className="text-danger">*</span>
        </legend>
        <div className="grid gap-[6px] sm:grid-cols-2">
          {activeServiceTypes().map((s) => (
            <label key={s.id} className="flex items-center gap-[8px] rounded-[12px] bg-surface-muted px-[10px] py-[8px] text-[13.5px]">
              <input type="checkbox" className="size-[16px] accent-[var(--color-ink)]" checked={input.serviceTypeIds.includes(s.id)} onChange={() => toggle(s.id)} />
              <ServiceChip type={s.id} />
              {s.label}
            </label>
          ))}
        </div>
        {errors.serviceTypeIds && <p className="mt-[6px] text-[12.5px] font-medium text-danger">{errors.serviceTypeIds}</p>}
      </fieldset>
      <div className="rounded-panel bg-surface-muted px-[14px] py-[12px]">
        <p className="text-[13.5px] font-medium">{t ? 'Archivo original' : 'Excel original (.xlsx)'}{!t && <span className="text-danger"> *</span>}</p>
        {current && (
          <p className="mt-[2px] text-[12.5px] text-muted">
            Actual: v{t!.version} · {current.fileName} · {formatDateTime(current.uploadedAt)}
          </p>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Archivo Excel de la plantilla" onChange={(e) => pick(e.target.files?.[0])} />
        <div className="mt-[8px] flex flex-wrap items-center gap-[8px]">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <FileSpreadsheet aria-hidden className="size-[14px]" strokeWidth={1.9} />
            {t ? 'Reemplazar archivo (nueva versión)' : 'Elegir archivo'}
          </Button>
          {file && <span className="truncate text-[13px]">{file.name}</span>}
        </div>
        {(fileError ?? errors.file) && <p className="mt-[6px] text-[12.5px] font-medium text-danger">{fileError ?? errors.file}</p>}
        {t && file && (
          <Field label="Cambios de esta versión" className="mt-[10px]">
            {(p) => <TextInput {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />}
          </Field>
        )}
        {t && <p className="mt-[6px] text-[12px] text-muted">Los documentos ya enviados conservan la versión con la que se enviaron.</p>}
      </div>
      <Switch checked={input.active} onChange={(v) => setInput((x) => ({ ...x, active: v }))} label="Activa" description="Las inactivas no se sugieren en proyectos nuevos." />
      {t && t.history.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted">Historial ({t.history.length})</summary>
          <ul className="mt-[6px] flex flex-col gap-[4px]">
            {[...t.history].reverse().map((h) => (
              <li key={h.id} className="rounded-[12px] bg-surface-muted px-[10px] py-[6px]">
                <span className="font-medium">{h.action}</span>
                {h.detail && <span className="text-muted"> · {h.detail}</span>}
                <span className="block text-[12px] text-muted">
                  {formatDateTime(h.date)} · {ws.staffById.get(h.actorId)?.name ?? h.actorId}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          {t ? 'Guardar' : 'Crear plantilla'}
        </Button>
      </div>
    </form>
  )
}
