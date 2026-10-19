import { cn } from '@/lib/cn'
import { daysUntil, formatDate, formatRelativeDays } from '@/lib/dates'

/** Due date with a relative hint while the document is still open. */
export function DueCell({ date, open }: { date: string; open: boolean }) {
  const days = daysUntil(date)
  return (
    <span className="block">
      <span className="tabular block">{formatDate(date)}</span>
      {open && (
        <span className={cn('block text-[12px]', days < 0 ? 'text-danger' : days <= 7 ? 'text-warning' : 'text-muted')}>
          {days < 0 ? `vencida ${formatRelativeDays(date)}` : `vence ${formatRelativeDays(date)}`}
        </span>
      )}
    </span>
  )
}
