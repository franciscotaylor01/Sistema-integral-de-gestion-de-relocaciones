import { FileText, Link2, Paperclip } from 'lucide-react'
import { useRef, useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { Field, FormError, TextInput } from '@/components/ui/form'
import { randomId } from '@/domain/context'
import { ATTACHMENT_TYPES, validateFile } from '@/domain/finance/attachments'
import { useActions } from '@/hooks/useActions'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDateTime } from '@/lib/dates'
import { deleteFile, loadFile, saveFile } from '@/services/local/attachmentStore'
import type { AttachmentEntity } from '@/types/domain'

const kb = (n?: number) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : '')

/** Evidence attached to an invoice, receipt or withholding. Files are kept in this browser only. */
export function AttachmentsPanel({ ws, entity, entityId, compact }: { ws: Workspace; entity: AttachmentEntity; entityId: string; compact?: boolean }) {
  const actions = useActions()
  const { notify } = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [refMode, setRefMode] = useState(false)
  const [ref, setRef] = useState({ name: '', reference: '' })
  const items = ws.attachments.filter((a) => a.entity === entity && a.entityId === entityId)

  const upload = async (file: File) => {
    setError(undefined)
    const err = validateFile(file.type, file.size)
    if (err) return setError(err)
    const id = randomId('att')
    setBusy(true)
    try {
      await saveFile(id, file)
    } catch (e) {
      setBusy(false)
      return setError(e instanceof Error ? e.message : 'No se pudo guardar el archivo en este navegador.')
    }
    try {
      await actions.addAttachment({ id, entity, entityId, name: file.name, mime: file.type, size: file.size, storage: 'indexeddb' })
      notify({ title: 'Archivo adjuntado', description: 'Guardado solo en este navegador.' })
    } catch (e) {
      await deleteFile(id).catch(() => undefined)
      setError(e instanceof Error ? e.message : 'No se pudo registrar el adjunto.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const open = async (id: string) => {
    const blob = await loadFile(id).catch(() => undefined)
    if (!blob) return notify({ title: 'Archivo no disponible', description: 'No está guardado en este navegador (los adjuntos locales no se comparten ni se respaldan).' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className="flex flex-col gap-[8px]">
      {!compact && <p className="text-[12px] leading-[1.45] text-muted">Los archivos se guardan solo en este navegador: no es almacenamiento compartido ni respaldo en la nube. PDF, JPG, PNG o WEBP de hasta 5 MB.</p>}
      {items.length > 0 && (
        <ul className="flex flex-col gap-[4px]">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-[12px] bg-surface-muted px-[10px] py-[7px] text-[13px]">
              <span className="flex min-w-0 items-center gap-[8px]">
                {a.storage === 'indexeddb' ? <FileText aria-hidden className="size-[15px] shrink-0 text-ink-secondary" strokeWidth={1.9} /> : <Link2 aria-hidden className="size-[15px] shrink-0 text-ink-secondary" strokeWidth={1.9} />}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block truncate text-[11.5px] text-muted">
                    {formatDateTime(a.createdAt)} · {a.storage === 'indexeddb' ? `${ATTACHMENT_TYPES[a.mime ?? ''] ?? ''} ${kb(a.size)} · archivo local` : `Referencia: ${a.reference} (sin archivo)`}
                  </span>
                </span>
              </span>
              {a.storage === 'indexeddb' && (
                <button type="button" onClick={() => open(a.id)} className="shrink-0 rounded-full px-[10px] py-[3px] text-[12.5px] font-medium text-ink-secondary hover:bg-surface hover:text-ink">
                  Abrir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormError message={error} />
      {refMode ? (
        <div className="grid gap-[8px] rounded-[14px] bg-surface-muted p-[10px] sm:grid-cols-2">
          <Field label="Nombre del documento">{(p) => <TextInput {...p} value={ref.name} onChange={(e) => setRef((r) => ({ ...r, name: e.target.value }))} maxLength={120} />}</Field>
          <Field label="Dónde está (ruta, email, sistema)">{(p) => <TextInput {...p} value={ref.reference} onChange={(e) => setRef((r) => ({ ...r, reference: e.target.value }))} maxLength={200} />}</Field>
          <div className="flex gap-[8px] sm:col-span-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setError(undefined)
                try {
                  await actions.addAttachment({ entity, entityId, name: ref.name, storage: 'reference', reference: ref.reference })
                  setRefMode(false)
                  setRef({ name: '', reference: '' })
                  notify({ title: 'Referencia registrada', description: 'No se guardó ningún archivo.' })
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'No se pudo registrar.')
                }
              }}
            >
              Registrar referencia
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRefMode(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-[8px]">
          <input ref={input} type="file" accept={Object.keys(ATTACHMENT_TYPES).join(',')} className="sr-only" aria-label="Adjuntar archivo" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <Paperclip aria-hidden className="size-[15px]" strokeWidth={1.9} />
            {busy ? 'Guardando…' : 'Adjuntar archivo'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRefMode(true)}>
            Solo referencia
          </Button>
        </div>
      )}
    </div>
  )
}
