import { History } from 'lucide-react'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Timeline } from '@/components/ui/Timeline'
import { formatDateTime } from '@/lib/dates'
import type { ActivityKind } from '@/types/domain'
import { activityKindMeta } from '../activityMeta'
import type { ProjectContext } from '../projectContext'

export function ActivityTab({ ctx }: { ctx: ProjectContext }) {
  const [kind, setKind] = useState('')
  const events = ctx.activity.filter((e) => !kind || e.kind === kind)

  return (
    <Card aria-labelledby="act-title" className="px-[20px] pb-[20px] pt-[20px]">
      <SectionTitle
        id="act-title"
        title="Actividad"
        description="Historial de cambios, documentación y movimientos financieros"
        action={
          <FilterSelect
            size="sm"
            align="end"
            label="Tipo"
            value={kind}
            onChange={setKind}
            options={(Object.keys(activityKindMeta) as ActivityKind[]).map((k) => ({ value: k, label: activityKindMeta[k].label }))}
          />
        }
      />
      {events.length === 0 ? (
        <EmptyState icon={History} title="Sin actividad" description="No hay eventos para el filtro seleccionado." />
      ) : (
        <Timeline
          className="mt-[20px] max-w-[760px]"
          items={events.map((e, i) => ({
            id: e.id,
            icon: activityKindMeta[e.kind].icon,
            title: e.message,
            meta: `${ctx.workspace.staffById.get(e.actorId)?.name ?? ''} · ${activityKindMeta[e.kind].label}`,
            date: formatDateTime(e.date),
            highlight: i === 0,
          }))}
        />
      )}
    </Card>
  )
}
