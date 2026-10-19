import { CheckCircle2, CircleDashed, CircleDot } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Timeline } from '@/components/ui/Timeline'
import { documentStatusMeta, serviceStatusMeta, serviceTypeMeta } from '@/config/catalogs'
import { daysUntil, formatDate, formatRelativeDays } from '@/lib/dates'
import type { ServiceType, StageStatus } from '@/types/domain'
import type { ProjectContext } from '../projectContext'

interface PlanItem {
  id: string
  label: string
  type: ServiceType
  status: StageStatus
  date?: string
}

const stageIcon = { done: CheckCircle2, current: CircleDot, pending: CircleDashed } as const

/** Work plan across all services, plus blockers and upcoming dates. */
export function OperationsTab({ ctx }: { ctx: ProjectContext }) {
  const { project, workspace } = ctx
  const plan: PlanItem[] = project.services.flatMap((s) =>
    s.stages.map((st) => ({ id: st.id, label: st.label, type: s.type, status: st.status, date: st.date })),
  )
  const current = plan.filter((p) => p.status === 'current')
  const upcoming = plan.filter((p) => p.status === 'pending').sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).slice(0, 6)
  const blockers = project.services.filter((s) => s.status === 'blocked' || s.status === 'waiting')
  const docAlerts = ctx.documents.filter((d) => d.status !== 'valid' && d.status !== 'in-review')

  const toEntry = (p: PlanItem) => ({
    id: p.id,
    icon: stageIcon[p.status],
    highlight: p.status === 'current',
    title: (
      <span className="inline-flex flex-wrap items-center gap-[8px]">
        <ServiceChip type={p.type} />
        <span className="font-medium">{p.label}</span>
      </span>
    ),
    meta: serviceTypeMeta[p.type].label,
    date: p.date ? `${formatDate(p.date)} · ${formatRelativeDays(p.date)}` : '—',
  })

  return (
    <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-3">
      <Card aria-labelledby="ops-plan" className="px-[20px] pb-[20px] pt-[20px] lg:col-span-2">
        <SectionTitle id="ops-plan" title="Plan de trabajo" description="Etapas en curso y próximas, combinando todos los servicios" />
        <h3 className="mt-[20px] text-[13px] font-medium uppercase tracking-[0.06em] text-subtle">En curso</h3>
        {current.length === 0 ? (
          <p className="mt-[8px] text-[14px] text-muted">No hay etapas en curso.</p>
        ) : (
          <Timeline className="mt-[12px]" items={current.map(toEntry)} />
        )}
        <h3 className="mt-[24px] text-[13px] font-medium uppercase tracking-[0.06em] text-subtle">Próximas etapas</h3>
        {upcoming.length === 0 ? (
          <p className="mt-[8px] text-[14px] text-muted">Todas las etapas planificadas están completas.</p>
        ) : (
          <Timeline className="mt-[12px]" items={upcoming.map(toEntry)} />
        )}
      </Card>

      <div className="flex flex-col gap-[24px]">
        <Card aria-labelledby="ops-blockers" className="px-[20px] pb-[18px] pt-[20px]">
          <SectionTitle id="ops-blockers" size="sm" title="Bloqueos y esperas" />
          {blockers.length === 0 ? (
            <p className="mt-[12px] text-[14px] text-muted">Sin bloqueos activos.</p>
          ) : (
            <ul className="mt-[14px] flex flex-col gap-[8px]">
              {blockers.map((s) => (
                <li key={s.id} className="flex items-center gap-[12px] rounded-[14px] bg-surface-muted px-[12px] py-[10px]">
                  <ServiceChip type={s.type} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{serviceTypeMeta[s.type].label}</span>
                    <span className="block truncate text-[12px] text-muted">{workspace.staffById.get(s.ownerId)?.name}</span>
                  </span>
                  <StatusBadge meta={serviceStatusMeta[s.status]} className="text-[13px]" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="ops-docs" className="px-[20px] pb-[18px] pt-[20px]">
          <SectionTitle id="ops-docs" size="sm" title="Documentación a resolver" />
          {docAlerts.length === 0 ? (
            <p className="mt-[12px] text-[14px] text-muted">Toda la documentación está vigente o en revisión.</p>
          ) : (
            <ul className="mt-[14px] flex flex-col gap-[8px]">
              {docAlerts.map((d) => (
                <li key={d.id} className="rounded-[14px] bg-surface-muted px-[12px] py-[10px]">
                  <p className="flex items-center justify-between gap-3">
                    <span className="truncate text-[14px] font-medium">{d.name}</span>
                    <StatusBadge meta={documentStatusMeta[d.status]} className="shrink-0 text-[12.5px]" />
                  </p>
                  <p className="mt-[2px] text-[12px] text-muted">
                    {d.holder}
                    {d.expiresAt && ` · ${daysUntil(d.expiresAt) < 0 ? 'venció' : 'vence'} ${formatRelativeDays(d.expiresAt)}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
