import { ArrowUpRight, Mail } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { Flag } from '@/components/ui/Flag'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Timeline } from '@/components/ui/Timeline'
import { countryNames, familyRelationLabel, serviceStatusMeta, serviceTypeMeta } from '@/config/catalogs'
import { summarizeLedger } from '@/features/finance/selectors'
import { formatDateTime, formatShortDate } from '@/lib/dates'
import { formatCurrency, formatPercent } from '@/lib/format'
import { activityKindMeta } from '../activityMeta'
import type { ProjectContext } from '../projectContext'
import { currentStageLabel, projectBudget, projectEstimatedCost, serviceProgress } from '../selectors'

type Tab = 'servicios' | 'finanzas' | 'actividad'

const linkButton =
  'group inline-flex items-center gap-[4px] rounded-full px-[10px] py-[5px] text-[13.5px] text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink'

export function OverviewTab({ ctx, onNavigate }: { ctx: ProjectContext; onNavigate: (tab: Tab) => void }) {
  const { project, assignee, workspace } = ctx
  const ledger = summarizeLedger(ctx.invoices, ctx.payables)
  const cur = project.currency
  const budget = projectBudget(project)
  const margin = budget - projectEstimatedCost(project)

  const finances = [
    { label: 'Presupuesto', value: budget },
    { label: 'Facturado', value: ledger.invoiced[cur] ?? 0 },
    { label: 'Cobrado', value: ledger.collected[cur] ?? 0 },
    { label: 'Saldo por cobrar', value: ledger.receivable[cur] ?? 0 },
    { label: 'Costos de proveedores', value: ledger.supplierCosts[cur] ?? 0 },
  ]

  return (
    <div className="grid grid-cols-1 gap-[24px] lg:grid-cols-3">
      <Card aria-labelledby="ov-assignee" className="px-[20px] pb-[18px] pt-[20px]">
        <SectionTitle id="ov-assignee" size="sm" title="Beneficiario y familia" />
        {assignee && (
          <>
            <div className="mt-[16px] flex items-center gap-[12px]">
              <Avatar name={assignee.name} className="size-[46px]" />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold">{assignee.name}</p>
                <p className="truncate text-[13.5px] text-muted">{assignee.jobTitle}</p>
              </div>
            </div>
            <dl className="mt-[16px] grid grid-cols-2 gap-[12px] rounded-panel bg-surface-muted p-[14px] text-[13.5px]">
              <div>
                <dt className="text-muted">Nacionalidad</dt>
                <dd className="mt-[3px] flex items-center gap-[7px] font-medium">
                  <Flag country={assignee.nationality} className="size-[16px]" />
                  {countryNames[assignee.nationality]}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted">Contacto</dt>
                <dd className="mt-[3px] truncate font-medium">
                  <a href={`mailto:${assignee.email}`} className="inline-flex items-center gap-[5px] hover:underline">
                    <Mail aria-hidden className="size-[13px]" strokeWidth={2} />
                    Email
                  </a>
                </dd>
              </div>
            </dl>
            <p className="mt-[18px] text-[13.5px] font-medium">
              Grupo familiar <span className="font-normal text-muted">· {assignee.family.length + 1} personas</span>
            </p>
            {assignee.family.length === 0 ? (
              <p className="mt-[8px] text-[13.5px] text-muted">Traslado individual, sin familiares.</p>
            ) : (
              <ul className="mt-[10px] flex flex-col gap-[8px]">
                {assignee.family.map((f) => (
                  <li key={f.id} className="flex items-center gap-[10px]">
                    <Avatar name={f.name} className="size-[32px]" />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{f.name}</span>
                    <span className="shrink-0 text-[12.5px] text-muted">
                      {familyRelationLabel[f.relation]}
                      {f.age !== undefined && ` · ${f.age} años`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      <Card aria-labelledby="ov-services" className="px-[20px] pb-[18px] pt-[20px] lg:col-span-2">
        <SectionTitle
          id="ov-services"
          title="Servicios del proyecto"
          description={`${project.services.length} servicios gestionados dentro de esta relocación`}
          action={
            <button type="button" onClick={() => onNavigate('servicios')} className={linkButton}>
              Ver detalle
              <ArrowUpRight aria-hidden className="size-[14px]" strokeWidth={2} />
            </button>
          }
        />
        <ul className="mt-[16px] flex flex-col gap-[8px] rounded-panel bg-surface-muted p-[8px]">
          {project.services.map((s) => {
            const pct = serviceProgress(s)
            return (
              <li key={s.id} className="grid grid-cols-[auto_1fr] items-center gap-x-[12px] gap-y-[10px] rounded-[14px] bg-surface px-[14px] py-[12px] sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto]">
                <ServiceChip type={s.type} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-medium">{serviceTypeMeta[s.type].label}</p>
                  <p className="truncate text-[12.5px] text-muted">
                    {currentStageLabel(s)} · {workspace.staffById.get(s.ownerId)?.name}
                  </p>
                </div>
                <div className="col-span-2 flex items-center gap-[10px] sm:col-span-1">
                  <ProgressBar value={pct} size="sm" label={`Avance de ${serviceTypeMeta[s.type].label}`} valueText={formatPercent(pct)} className="flex-1" tone={s.status === 'blocked' ? 'danger' : s.status === 'completed' ? 'success' : 'accent'} />
                  <span className="tabular w-[38px] text-right text-[12.5px] text-muted">{formatPercent(pct)}</span>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end sm:gap-[2px]">
                  <StatusBadge meta={serviceStatusMeta[s.status]} className="text-[13px]" />
                  <span className="tabular text-[12px] text-subtle">vence {formatShortDate(s.dueDate)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card aria-labelledby="ov-finance" className="px-[20px] pb-[18px] pt-[20px]">
        <SectionTitle
          id="ov-finance"
          size="sm"
          title="Resumen financiero"
          action={
            <button type="button" onClick={() => onNavigate('finanzas')} className={linkButton}>
              Finanzas
              <ArrowUpRight aria-hidden className="size-[14px]" strokeWidth={2} />
            </button>
          }
        />
        <dl className="mt-[14px] flex flex-col">
          {finances.map((f) => (
            <div key={f.label} className="flex items-center justify-between border-b border-line py-[10px] text-[14px] last:border-b-0">
              <dt className="text-ink-secondary">{f.label}</dt>
              <dd className="tabular font-medium">{formatCurrency(f.value, cur)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-[10px] flex items-center justify-between rounded-[14px] bg-success-soft px-[14px] py-[11px] text-success">
          <span className="text-[14px] font-medium">Margen estimado</span>
          <span className="tabular text-[15px] font-semibold">
            {formatCurrency(margin, cur)} · {formatPercent(budget ? (margin / budget) * 100 : 0)}
          </span>
        </div>
      </Card>

      <Card aria-labelledby="ov-activity" className="px-[20px] pb-[18px] pt-[20px] lg:col-span-2">
        <SectionTitle
          id="ov-activity"
          size="sm"
          title="Actividad reciente"
          action={
            <button type="button" onClick={() => onNavigate('actividad')} className={linkButton}>
              Ver todo
              <ArrowUpRight aria-hidden className="size-[14px]" strokeWidth={2} />
            </button>
          }
        />
        {ctx.activity.length === 0 ? (
          <p className="mt-[14px] text-[14px] text-muted">Todavía no hay actividad registrada.</p>
        ) : (
          <Timeline
            className="mt-[16px]"
            items={ctx.activity.slice(0, 4).map((e, i) => ({
              id: e.id,
              icon: activityKindMeta[e.kind].icon,
              title: e.message,
              meta: workspace.staffById.get(e.actorId)?.name,
              date: formatDateTime(e.date),
              highlight: i === 0,
            }))}
          />
        )}
      </Card>
    </div>
  )
}
