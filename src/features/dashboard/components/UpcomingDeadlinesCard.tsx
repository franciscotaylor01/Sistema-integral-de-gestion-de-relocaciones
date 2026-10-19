import { CalendarClock, FileWarning } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PillLink } from '@/components/ui/PillLink'
import { collectDeadlines, DEADLINE_HORIZON_DAYS as HORIZON_DAYS } from '@/features/operations/selectors'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { daysUntil, formatRelativeDays, formatShortDate } from '@/lib/dates'

/** Vertix "Upcoming Payments" card applied to service due dates and document expirations. */
export function UpcomingDeadlinesCard({ workspace, limit = 5 }: { workspace: Workspace; limit?: number }) {
  const deadlines = collectDeadlines(workspace).slice(0, limit)

  return (
    <Card aria-labelledby="deadlines-title" className="px-[20px] pb-[16px] pt-[18px]">
      <div className="flex h-[34px] items-center justify-between gap-3">
        <h2 id="deadlines-title" className="text-[16px] font-medium">
          Próximos vencimientos
        </h2>
        <PillLink to="/operaciones">Próximos {HORIZON_DAYS} días</PillLink>
      </div>
      {deadlines.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Sin vencimientos cercanos" className="py-6" />
      ) : (
        <ul className="mt-[14px] flex flex-col gap-[8px]">
          {deadlines.map((d) => {
            const days = daysUntil(d.date)
            const Icon = d.kind === 'document' ? FileWarning : CalendarClock
            return (
              <li key={d.id}>
                <Link
                  to={d.href}
                  className="flex items-center gap-[12px] rounded-[14px] bg-surface-muted px-[12px] py-[10px] transition-[background-color,transform] duration-200 ease-soft hover:bg-surface-sunken active:scale-[0.99]"
                >
                  <span aria-hidden className="grid size-[32px] shrink-0 place-items-center rounded-full bg-surface text-ink-secondary">
                    <Icon className="size-[15px]" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{d.title}</span>
                    <span className="block text-[12px] text-muted">
                      {d.detail} · {formatShortDate(d.date)}
                    </span>
                  </span>
                  <span className={cn('shrink-0 text-[12.5px] font-medium', days <= 7 ? 'text-danger' : 'text-ink-secondary')}>
                    {formatRelativeDays(d.date)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
