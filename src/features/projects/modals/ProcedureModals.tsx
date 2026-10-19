import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { DEMO_TODAY } from '@/config/brand'
import { participantRoleLabel } from '@/config/catalogs'
import { getProcedureType } from '@/config/procedureCatalog'
import { getServiceType } from '@/config/serviceCatalog'
import { addDays } from '@/domain/dates'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import type { Procedure, ProjectService } from '@/types/domain'

function Footer({ onClose, busy, label }: { onClose: () => void; busy: boolean; label: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-[10px] border-t border-line pt-[14px]">
      <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
        Cancelar
      </Button>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? 'Guardando…' : label}
      </Button>
    </div>
  )
}

/* ───────────────────────── Add procedure ───────────────────────── */

export function AddProcedureModal({ service, onClose, workspace }: { service?: ProjectService; onClose: () => void; workspace: Workspace }) {
  return (
    <Modal
      open={Boolean(service)}
      onClose={onClose}
      title="Nuevo trámite"
      description="Un trámite (DNI, TIE, residencia…) corre dentro del servicio, para una persona del proyecto, con su propio workflow."
      size="md"
    >
      {service && <AddProcedureForm key={service.id} service={service} onClose={onClose} ws={workspace} />}
    </Modal>
  )
}

function AddProcedureForm({ service, onClose, ws }: { service: ProjectService; onClose: () => void; ws: Workspace }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const types = getServiceType(service.typeId).procedureTypes ?? []
  const people = (ws.participantsByProject.get(service.projectId) ?? []).map((p) => ({ participant: p, person: ws.personById.get(p.personId) }))
  const [typeId, setTypeId] = useState(types[0] ?? '')
  const [personId, setPersonId] = useState(people[0]?.person?.id ?? '')
  const [ownerId, setOwnerId] = useState(service.ownerId)
  const [startDate, setStartDate] = useState(DEMO_TODAY)
  const [dueDate, setDueDate] = useState(typeId ? addDays(DEMO_TODAY, getProcedureType(typeId).typicalDays) : '')
  const [reference, setReference] = useState('')

  const submit = async () => {
    const ok = await run(() => actions.addProcedure(service.id, { typeId, personId, ownerId, startDate, dueDate, reference }), {
      title: 'Trámite iniciado',
      description: `${getProcedureType(typeId).label} · ${ws.personById.get(personId)?.name ?? ''}`,
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
      <div className="grid gap-[14px] sm:grid-cols-2">
        <Field label="Tipo de trámite" required error={errors.typeId}>
          {(p) => (
            <SelectInput
              {...p}
              data-autofocus
              value={typeId}
              onChange={(e) => {
                setTypeId(e.target.value)
                setDueDate(addDays(startDate || DEMO_TODAY, getProcedureType(e.target.value).typicalDays))
              }}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {getProcedureType(t).label}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Persona" required error={errors.personId}>
          {(p) => (
            <SelectInput {...p} value={personId} onChange={(e) => setPersonId(e.target.value)}>
              {people.map(({ participant, person }) =>
                person ? (
                  <option key={participant.id} value={person.id}>
                    {person.name} ({participantRoleLabel[participant.role]})
                  </option>
                ) : null,
              )}
            </SelectInput>
          )}
        </Field>
        <Field label="Responsable" required error={errors.ownerId}>
          {(p) => (
            <SelectInput {...p} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {ws.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="N.º de expediente / turno" error={errors.reference}>
          {(p) => <TextInput {...p} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} placeholder="Opcional" />}
        </Field>
        <Field label="Inicio" required error={errors.startDate}>
          {(p) => <DateInput {...p} value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
        </Field>
        <Field label="Vencimiento estimado" error={errors.dueDate} hint="Propuesto según la duración típica del trámite.">
          {(p) => <DateInput {...p} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
        </Field>
      </div>
      <Footer onClose={onClose} busy={busy} label="Iniciar trámite" />
    </form>
  )
}

/* ───────────────────────── Edit procedure ───────────────────────── */

export function EditProcedureModal({ procedure, onClose, workspace }: { procedure?: Procedure; onClose: () => void; workspace: Workspace }) {
  return (
    <Modal open={Boolean(procedure)} onClose={onClose} title={procedure ? `Editar trámite ${getProcedureType(procedure.typeId).label}` : 'Editar trámite'} size="sm">
      {procedure && <EditProcedureForm key={procedure.id} procedure={procedure} onClose={onClose} ws={workspace} />}
    </Modal>
  )
}

function EditProcedureForm({ procedure, onClose, ws }: { procedure: Procedure; onClose: () => void; ws: Workspace }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [ownerId, setOwnerId] = useState(procedure.ownerId)
  const [reference, setReference] = useState(procedure.reference ?? '')
  const [dueDate, setDueDate] = useState(procedure.dueDate ?? '')

  const submit = async () => {
    const ok = await run(() => actions.updateProcedure(procedure.id, { ownerId, reference, dueDate }), { title: 'Trámite actualizado' })
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
      <Field label="Responsable" required error={errors.ownerId}>
        {(p) => (
          <SelectInput {...p} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {ws.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      <Field label="N.º de expediente / turno" error={errors.reference}>
        {(p) => <TextInput {...p} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />}
      </Field>
      <Field label="Vencimiento estimado" error={errors.dueDate}>
        {(p) => <DateInput {...p} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
      </Field>
      <Footer onClose={onClose} busy={busy} label="Guardar cambios" />
    </form>
  )
}
