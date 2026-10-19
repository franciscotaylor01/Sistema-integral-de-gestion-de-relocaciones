import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import type { WorkScope } from '@/domain/workItems'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import type { WorkflowStage } from '@/types/domain'

interface AddStageModalProps {
  open: boolean
  onClose: () => void
  scope: WorkScope
  stages: WorkflowStage[]
  workspace: Workspace
}

export function AddStageModal(props: AddStageModalProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Agregar etapa" description="Sumá un paso propio de este caso al workflow." size="sm">
      {props.open && <AddStageForm {...props} />}
    </Modal>
  )
}

function AddStageForm({ onClose, scope, stages, workspace }: AddStageModalProps) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [label, setLabel] = useState('')
  const [afterStageId, setAfter] = useState(stages.at(-1)?.id ?? '')
  const [dueDate, setDueDate] = useState('')
  const [ownerId, setOwnerId] = useState('')

  const submit = async () => {
    const ok = await run(() => actions.applyStageAction(scope, { type: 'add', input: { label, afterStageId: afterStageId || undefined, dueDate, ownerId } }), {
      title: 'Etapa agregada',
    })
    if (ok) onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-[14px]"
    >
      <FormError message={formError} />
      <Field label="Nombre" required error={errors.label}>
        {(p) => <TextInput {...p} data-autofocus value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Ej.: Inspección técnica" />}
      </Field>
      <Field label="Ubicación">
        {(p) => (
          <SelectInput {...p} value={afterStageId} onChange={(e) => setAfter(e.target.value)}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                Después de «{s.label}»
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      <div className="grid gap-[14px] sm:grid-cols-2">
        <Field label="Fecha objetivo">{(p) => <DateInput {...p} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
        <Field label="Responsable">
          {(p) => (
            <SelectInput {...p} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Responsable del servicio</option>
              {workspace.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-[10px] pt-[4px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Agregando…' : 'Agregar etapa'}
        </Button>
      </div>
    </form>
  )
}
