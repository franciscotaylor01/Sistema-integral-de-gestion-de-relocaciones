import { History } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { Field, TextArea } from '@/components/ui/form'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Timeline } from '@/components/ui/Timeline'
import { getServiceType } from '@/config/serviceCatalog'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { formatDateTime } from '@/lib/dates'
import type { ActivityKind } from '@/types/domain'
import { activityKindMeta } from '../activityMeta'
import type { ProjectContext } from '../projectContext'

/** Full project history: every change is logged by the domain; notes can be added here. */
export function ActivityTab({ ctx }: { ctx: ProjectContext }) {
  const { workspace, project } = ctx
  const actions = useActions()
  const { run, busy, errors } = useCommand()
  const [kind, setKind] = useState('')
  const [service, setService] = useState('')
  const [note, setNote] = useState('')
  const events = ctx.activity.filter((e) => (!kind || e.kind === kind) && (!service || e.serviceId === service))

  const addNote = async () => {
    const ok = await run(() => actions.addProjectNote(project.id, note), { title: 'Nota registrada en la actividad' })
    if (ok) setNote('')
  }

  return (
    <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-3">
      <Card aria-labelledby="act-title" className="px-[20px] pb-[20px] pt-[20px] lg:col-span-2">
        <SectionTitle
          id="act-title"
          title="Actividad"
          description={`${ctx.activity.length} eventos · cambios de estado, servicios, trámites, tareas y notas`}
          action={
            <>
              <FilterSelect
                size="sm"
                align="end"
                label="Servicio"
                value={service}
                onChange={setService}
                options={project.services.map((s) => ({ value: s.id, label: getServiceType(s.typeId).label }))}
              />
              <FilterSelect
                size="sm"
                align="end"
                label="Tipo"
                value={kind}
                onChange={setKind}
                options={(Object.keys(activityKindMeta) as ActivityKind[]).map((k) => ({ value: k, label: activityKindMeta[k].label }))}
              />
            </>
          }
        />
        {events.length === 0 ? (
          <EmptyState icon={History} title="Sin actividad" description="No hay eventos para el filtro seleccionado." />
        ) : (
          <Timeline
            className="mt-[20px]"
            items={events.map((e, i) => ({
              id: e.id,
              icon: activityKindMeta[e.kind].icon,
              title: e.message,
              meta: [
                workspace.staffById.get(e.actorId)?.name,
                e.serviceId && workspace.serviceById.get(e.serviceId) ? getServiceType(workspace.serviceById.get(e.serviceId)!.typeId).label : activityKindMeta[e.kind].label,
              ]
                .filter(Boolean)
                .join(' · '),
              date: formatDateTime(e.date),
              highlight: i === 0,
            }))}
          />
        )}
      </Card>

      <Card aria-labelledby="act-note" className="h-fit px-[20px] pb-[20px] pt-[20px]">
        <SectionTitle id="act-note" size="sm" title="Registrar nota" description="Llamadas, acuerdos con el cliente o novedades del caso." />
        <form
          className="mt-[14px] flex flex-col gap-[10px]"
          onSubmit={(e) => {
            e.preventDefault()
            void addNote()
          }}
        >
          <Field label="Nota" error={errors.text}>
            {(p) => <TextArea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Ej.: El cliente confirmó la fecha de llegada." />}
          </Field>
          <Button type="submit" size="sm" disabled={busy || !note.trim()}>
            {busy ? 'Guardando…' : 'Agregar a la actividad'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
