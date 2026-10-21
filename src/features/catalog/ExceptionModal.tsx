import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, FormError, SelectInput, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { PoMode, Project } from '@/types/domain'
import { poModeLabel } from './meta'

/** Explicit per-project exception to the client's commercial policy. */
export function ExceptionModal({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  return (
    <Modal open={open} onClose={onClose} title="Excepción comercial del proyecto" description="Cambia la política solo para este proyecto; la política general del cliente no se modifica." size="sm">
      {open && <Form project={project} onClose={onClose} />}
    </Modal>
  )
}

function Form({ project, onClose }: { project: Project; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const ex = project.commercialException
  const [poMode, setPoMode] = useState<PoMode | ''>(ex?.poMode ?? '')
  const [cert, setCert] = useState(ex?.requiresCertificate === undefined ? '' : ex.requiresCertificate ? 'yes' : 'no')
  const [reason, setReason] = useState(ex?.reason ?? '')
  const save = (remove = false) =>
    run(
      () => actions.setProjectException(project.id, remove ? null : { poMode: poMode || undefined, requiresCertificate: cert === '' ? undefined : cert === 'yes', reason }),
      { title: remove ? 'Excepción eliminada' : 'Excepción guardada' },
    ).then((ok) => ok && onClose())
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <FormError message={formError} />
      <Field label="Modalidad de OC" error={errors.poMode}>
        {(p) => (
          <SelectInput {...p} value={poMode} onChange={(e) => setPoMode(e.target.value as PoMode | '')}>
            <option value="">Igual que el cliente</option>
            {(Object.keys(poModeLabel) as PoMode[]).map((m) => (
              <option key={m} value={m}>
                {poModeLabel[m]}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      <Field label="Certificado obligatorio">
        {(p) => (
          <SelectInput {...p} value={cert} onChange={(e) => setCert(e.target.value)}>
            <option value="">Igual que el cliente</option>
            <option value="yes">Sí, exigir certificado</option>
            <option value="no">No exigir certificado</option>
          </SelectInput>
        )}
      </Field>
      <Field label="Motivo" required error={errors.reason}>
        {(p) => <TextInput {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}
      </Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        {ex && (
          <Button size="sm" variant="outline" onClick={() => save(true)} disabled={busy} className="mr-auto">
            Quitar excepción
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Guardar
        </Button>
      </div>
    </form>
  )
}
