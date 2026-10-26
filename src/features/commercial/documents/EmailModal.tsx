import { Copy, Download, Info } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { DEMO_TODAY } from '@/config/brand'
import type { CommunicationInput } from '@/domain/commercial/documents'
import { randomId } from '@/domain/context'
import { copyText } from '@/features/finance/emission/copy'
import { useCommand } from '@/hooks/useCommand'
import type { EmailDraft } from './emails'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  /** 'email': prepare texts (+ optional registration); 'register': only the manual sending record. */
  mode: 'email' | 'register'
  draft: EmailDraft
  /** Files the user attaches in their own mail client. */
  downloads: { label: string; onDownload: () => void | Promise<void> }[]
  /** Short name of what is being sent (toast after registering). */
  docLabel: string
  /** Extra content above the texts (e.g. document selection). */
  children?: React.ReactNode
  /** Omitted when sending cannot be registered (e.g. approved quotations). */
  onRegister?: (input: CommunicationInput, requestId: string) => Promise<unknown>
  minDate?: string
}

/**
 * Prepared email: SIGR never sends it. The user copies subject/body, attaches
 * the downloaded PDF in their own mail client and then records the sending.
 */
export function EmailModal(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={props.title} description={props.mode === 'email' ? 'Email preparado: SIGR no lo envía.' : 'Registro manual de un envío ya realizado fuera de SIGR.'} size="lg">
      {props.open && <Body {...props} />}
    </Modal>
  )
}

function Body({ mode, draft, downloads, docLabel, onRegister, onClose, minDate, children }: Props) {
  const { notify } = useToast()
  const { run, busy, errors, formError } = useCommand()
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [recipients, setRecipients] = useState(draft.to ?? '')
  const [sentAt, setSentAt] = useState(DEMO_TODAY)
  const [reference, setReference] = useState('')
  const [requestId] = useState(() => randomId('req'))
  const copy = async (text: string, what: string) => notify({ title: (await copyText(text)) ? `${what} copiado` : `No se pudo copiar el ${what.toLowerCase()}` })

  return (
    <div className="flex flex-col gap-[14px]">
      {mode === 'email' && (
        <>
          <p className="flex items-start gap-[8px] rounded-[14px] bg-info-soft px-[12px] py-[10px] text-[13px] leading-[1.45] text-info">
            <Info aria-hidden className="mt-[1px] size-[15px] shrink-0" strokeWidth={2} />
            Copiá el asunto y el cuerpo, adjuntá {downloads.length === 1 ? 'el archivo' : 'los archivos'} y envialo desde tu correo. El email no figura como enviado hasta que registres el envío.
          </p>
          {children}
          <Field label="Para (sugerido)" hint="Contacto principal registrado del cliente.">
            {(p) => <TextInput {...p} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="Sin contacto con email registrado" />}
          </Field>
          <Field label="Asunto">{(p) => <TextInput {...p} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />}</Field>
          <Field label="Cuerpo" error={errors.body}>
            {(p) => <TextArea {...p} rows={12} value={body} onChange={(e) => setBody(e.target.value)} className="font-[inherit] text-[13.5px] leading-[1.5]" />}
          </Field>
          <div className="flex flex-wrap gap-[8px]">
            <Button size="sm" variant="outline" onClick={() => copy(subject, 'Asunto')}>
              <Copy aria-hidden className="size-[14px]" strokeWidth={1.9} />
              Copiar asunto
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(body, 'Cuerpo')}>
              <Copy aria-hidden className="size-[14px]" strokeWidth={1.9} />
              Copiar cuerpo
            </Button>
            {downloads.map((d) => (
              <Button key={d.label} size="sm" variant="outline" onClick={() => void d.onDownload()}>
                <Download aria-hidden className="size-[14px]" strokeWidth={1.9} />
                {d.label}
              </Button>
            ))}
          </div>
        </>
      )}

      {onRegister ? (
        <form
          className="flex flex-col gap-[12px] rounded-panel bg-surface-muted px-[14px] py-[14px]"
          onSubmit={async (e) => {
            e.preventDefault()
            const ok = await run(() => onRegister({ subject, body, recipients, sentAt, reference }, requestId), { title: 'Envío registrado', description: `${docLabel} · ${sentAt.split('-').reverse().join('/')}` })
            if (ok) onClose()
          }}
        >
          <p className="text-[14px] font-semibold">Registrar envío manual</p>
          <FormError message={formError} />
          <div className="grid gap-[12px] sm:grid-cols-2">
            <Field label="Fecha de envío" required error={errors.sentAt}>
              {(p) => <DateInput {...p} value={sentAt} min={minDate} max={DEMO_TODAY} onChange={(e) => setSentAt(e.target.value)} />}
            </Field>
            <Field label="Referencia" error={errors.reference} hint="Asunto, id del email, portal del cliente…">
              {(p) => <TextInput {...p} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} />}
            </Field>
            <Field label="Destinatarios" error={errors.recipients} className="sm:col-span-2">
              {(p) => <TextInput {...p} value={recipients} onChange={(e) => setRecipients(e.target.value)} maxLength={300} />}
            </Field>
          </div>
          {errors.subject && <p className="text-[12.5px] font-medium text-danger">{errors.subject}</p>}
          <div className="flex justify-end gap-[10px]">
            <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
              Cerrar
            </Button>
            <Button size="sm" type="submit" disabled={busy}>
              Registrar envío
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      )}
    </div>
  )
}
