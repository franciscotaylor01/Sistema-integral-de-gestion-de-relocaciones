import type { LucideIcon } from 'lucide-react'
import { ChevronRight, CircleAlert, Info, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { alertSeverityMeta } from '@/config/catalogs'
import { cn } from '@/lib/cn'
import { formatShortDate } from '@/lib/dates'
import type { Alert, AlertSeverity } from '@/types/domain'

const severityIcon: Record<AlertSeverity, { icon: LucideIcon; className: string }> = {
  critical: { icon: CircleAlert, className: 'bg-danger-soft text-danger' },
  warning: { icon: TriangleAlert, className: 'bg-warning-soft text-warning' },
  info: { icon: Info, className: 'bg-info-soft text-info' },
}

const VISIBLE = 6

export function AlertsCard({ alerts }: { alerts: Alert[] }) {
  const [expanded, setExpanded] = useState(false)
  const critical = alerts.filter((a) => a.severity === 'critical').length

  return (
    <Card aria-labelledby="alerts-title" className="h-full px-[19px] pb-[19px] pt-[19px]">
      <div className="flex items-center justify-between gap-4">
        <h2 id="alerts-title" className="text-[20px] font-semibold tracking-[-0.01em]">
          Alertas
        </h2>
        <span className="flex h-[34px] items-center rounded-full border border-line px-[14px] text-[13.5px] text-ink-secondary shadow-pill">
          {critical} críticas · {alerts.length} en total
        </span>
      </div>
      {alerts.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Todo en orden" description="No hay alertas activas." />
      ) : (
        <ul className="mt-[20px] grid grid-cols-1 gap-[8px] rounded-panel bg-surface-muted p-[8px] md:grid-cols-2">
          {(expanded ? alerts : alerts.slice(0, VISIBLE)).map((a) => {
            const s = severityIcon[a.severity]
            return (
              <li key={a.id} className="min-w-0">
                <Link
                  to={a.href}
                  className="group flex h-full items-start gap-[12px] rounded-[14px] bg-surface px-[14px] py-[13px] transition-[box-shadow,transform] duration-300 ease-soft hover:-translate-y-0.5 hover:shadow-pill active:translate-y-0"
                >
                  <span aria-hidden className={cn('grid size-[32px] shrink-0 place-items-center rounded-full', s.className)}>
                    <s.icon className="size-[16px]" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-medium">{a.title}</span>
                    </span>
                    <span className="mt-[2px] block text-[13px] leading-[1.4] text-muted">{a.description}</span>
                    <span className="mt-[8px] flex items-center gap-[10px] text-[12px]">
                      <StatusBadge meta={alertSeverityMeta[a.severity]} className="text-[12px]" />
                      <span className="tabular text-subtle">{formatShortDate(a.date)}</span>
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="mt-[8px] size-[16px] shrink-0 text-subtle transition-transform duration-300 ease-soft group-hover:translate-x-[2px]"
                    strokeWidth={2}
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {alerts.length > VISIBLE && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-[12px] rounded-full px-[12px] py-[6px] text-[13.5px] font-medium text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
        >
          {expanded ? 'Ver menos' : `Ver todas (${alerts.length})`}
        </button>
      )}
    </Card>
  )
}
