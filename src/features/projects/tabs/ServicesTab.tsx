import { Card } from '@/components/ui/Card'
import { Fact } from '@/components/ui/Fact'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StageStepper } from '@/components/ui/StageStepper'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { serviceStatusMeta, serviceTypeMeta } from '@/config/catalogs'
import { cn } from '@/lib/cn'
import { daysUntil, formatDate, formatRelativeDays } from '@/lib/dates'
import { formatCurrency, formatPercent } from '@/lib/format'
import type { ProjectContext } from '../projectContext'
import { serviceProgress } from '../selectors'

/** One card per service, each with its own status, owner, supplier and workflow. */
export function ServicesTab({ ctx }: { ctx: ProjectContext }) {
  const { project, workspace } = ctx

  return (
    <div className="flex flex-col gap-[20px]">
      {project.services.map((s) => {
        const meta = serviceTypeMeta[s.type]
        const pct = serviceProgress(s)
        const days = daysUntil(s.dueDate)
        const issues = ctx.documents.filter((d) => d.serviceId === s.id && (d.status === 'expired' || d.status === 'missing'))
        return (
          <Card key={s.id} aria-labelledby={`${s.id}-title`} className="px-[20px] pb-[20px] pt-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-[12px]">
                <ServiceChip type={s.type} size="md" />
                <div className="min-w-0">
                  <h2 id={`${s.id}-title`} className="truncate text-[17px] font-semibold tracking-[-0.01em]">
                    {meta.label}
                  </h2>
                  <p className="text-[13px] text-muted">
                    {s.stages.filter((st) => st.status === 'done').length} de {s.stages.length} etapas completadas
                  </p>
                </div>
              </div>
              <StatusBadge variant="soft" meta={serviceStatusMeta[s.status]} />
            </div>

            <dl className="mt-[18px] grid grid-cols-2 gap-x-6 gap-y-4 rounded-panel bg-surface-muted px-[16px] py-[14px] md:grid-cols-5">
              <Fact label="Responsable">{workspace.staffById.get(s.ownerId)?.name}</Fact>
              <Fact label="Proveedor">
                {s.supplierId ? workspace.supplierById.get(s.supplierId)?.name : <span className="text-muted">Gestión interna</span>}
              </Fact>
              <Fact label="Vencimiento">
                <span className="tabular">{formatDate(s.dueDate)}</span>
                {s.status !== 'completed' && (
                  <span className={cn('ml-[6px] text-[12.5px] font-normal', days < 0 ? 'text-danger' : days <= 7 ? 'text-warning' : 'text-muted')}>
                    ({formatRelativeDays(s.dueDate)})
                  </span>
                )}
              </Fact>
              <Fact label="Precio acordado">
                <span className="tabular">{formatCurrency(s.price, project.currency)}</span>
              </Fact>
              <Fact label="Costo estimado">
                <span className="tabular">{formatCurrency(s.estimatedCost, project.currency)}</span>
              </Fact>
            </dl>

            {issues.length > 0 && (
              <div className="mt-[14px] rounded-[14px] bg-danger-soft px-[14px] py-[11px] text-[13.5px] text-danger">
                <span className="font-semibold">Bloqueo documental: </span>
                {issues.map((d) => `${d.name} de ${d.holder} (${d.status === 'expired' ? 'vencido' : 'faltante'})`).join(' · ')}
              </div>
            )}

            <div className="mt-[20px]">
              <StageStepper stages={s.stages} />
            </div>

            <div className="mt-[16px] flex items-center gap-[12px]">
              <ProgressBar
                value={pct}
                label={`Avance de ${meta.label}`}
                valueText={formatPercent(pct)}
                size="sm"
                className="flex-1"
                tone={s.status === 'blocked' ? 'danger' : s.status === 'completed' ? 'success' : 'accent'}
              />
              <span className="tabular text-[13px] font-medium">{formatPercent(pct)}</span>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
