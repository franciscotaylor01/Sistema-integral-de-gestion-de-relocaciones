import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { DEMO_TODAY } from '@/config/brand'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Quotation } from '@/types/domain'
import { AmountsText } from '@/components/ui/Amounts'
import { quotationTotals } from '@/domain/commercial/quotations'

interface Props {
  open: boolean
  onClose: () => void
  quotation: Quotation
  defaultApprover: string
}

/** Registers the client's acceptance. The quoted lines become an immutable snapshot. */
export function ApproveQuotationModal({ open, onClose, quotation, defaultApprover }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={`Aprobar ${quotation.number} v${quotation.version}`} size="sm">
      {open && <ApproveForm onClose={onClose} quotation={quotation} defaultApprover={defaultApprover} />}
    </Modal>
  )
}

function ApproveForm({ onClose, quotation, defaultApprover }: Omit<Props, 'open'>) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [approvedBy, setApprovedBy] = useState(defaultApprover)
  const [approvedAt, setApprovedAt] = useState(DEMO_TODAY)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.approveQuotation(quotation.id, { approvedBy, approvedAt }), {
          title: 'Cotización aprobada',
          description: 'Los precios quedaron congelados en esta versión.',
        })
        if (ok) onClose()
      }}
      className="flex flex-col gap-[14px]"
    >
      <div className="rounded-[14px] bg-surface-muted px-[14px] py-[11px] text-[14px] leading-[1.5] text-ink-secondary">
        Total aprobado: <AmountsText inline amounts={quotationTotals(quotation.lines)} className="font-semibold text-ink" />. Una vez aprobada, esta versión no
        podrá modificarse: los cambios requerirán una nueva versión, y los cambios de tarifario no la afectarán.
      </div>
      <FormError message={formError} />
      <Field label="Aprobado por (cliente)" required error={errors.approvedBy} hint="Nombre y área, o referencia del email de aceptación.">
        {(p) => <TextInput {...p} data-autofocus value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} maxLength={120} />}
      </Field>
      <Field label="Fecha de aprobación" required error={errors.approvedAt}>
        {(p) => <DateInput {...p} value={approvedAt} max={DEMO_TODAY} onChange={(e) => setApprovedAt(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Registrando…' : 'Confirmar aprobación'}
        </Button>
      </div>
    </form>
  )
}
