import { useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Field, FormError, TextArea } from './form'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  tone?: 'default' | 'danger'
  /** Ask for a mandatory reason (e.g. reopening a service). */
  reasonLabel?: string
  onConfirm: (reason: string) => Promise<void> | void
  onClose: () => void
}

/** Confirmation for destructive or irreversible actions. */
export function ConfirmDialog({ open, onClose, ...rest }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={rest.title} size="sm" busy={false}>
      {open && <ConfirmBody onClose={onClose} {...rest} />}
    </Modal>
  )
}

function ConfirmBody({ message, confirmLabel, tone = 'default', reasonLabel, onConfirm, onClose }: Omit<ConfirmDialogProps, 'open' | 'title'>) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [reasonError, setReasonError] = useState<string>()
  const [error, setError] = useState<string>()

  const confirm = async () => {
    if (reasonLabel && !reason.trim()) {
      setReasonError('Indicá el motivo.')
      return
    }
    setBusy(true)
    setReasonError(undefined)
    setError(undefined)
    try {
      await onConfirm(reason.trim())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="text-[14.5px] leading-[1.5] text-ink-secondary">{message}</div>
      {reasonLabel && (
        <Field label={reasonLabel} required error={reasonError}>
          {(p) => <TextArea {...p} data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
        </Field>
      )}
      <FormError message={error} />
      <div className="flex flex-wrap justify-end gap-[10px] pt-[4px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={confirm}
          disabled={busy}
          className={tone === 'danger' ? 'bg-danger text-white hover:opacity-90' : undefined}
          data-autofocus={reasonLabel ? undefined : true}
        >
          {busy ? 'Procesando…' : confirmLabel}
        </Button>
      </div>
    </div>
  )
}
