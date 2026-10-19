import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatShortDate } from '@/lib/dates'
import type { WorkflowStage } from '@/types/domain'

const statusText = { done: 'completada', current: 'en curso', pending: 'pendiente' } as const

/** Horizontal workflow stages: done (contrast + check), current (accent ring), pending. */
export function StageStepper({ stages, showDates = true, className }: { stages: WorkflowStage[]; showDates?: boolean; className?: string }) {
  return (
    <div className={cn('scrollbar-none relative overflow-x-auto', className)}>
      <ol className="flex min-w-max items-start">
        {stages.map((stage, i) => (
          <li key={stage.id} className="relative flex w-[104px] flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute right-1/2 top-[11px] h-[2px] w-full rounded-full',
                  stage.status === 'pending' ? 'bg-line-strong' : 'bg-contrast',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-[1] grid size-[24px] place-items-center rounded-full text-[11px] font-semibold',
                stage.status === 'done' && 'bg-contrast text-on-contrast',
                stage.status === 'current' && 'bg-surface text-accent ring-2 ring-accent ring-offset-2 ring-offset-surface',
                stage.status === 'pending' && 'bg-surface-sunken text-muted',
              )}
            >
              {stage.status === 'done' ? <Check aria-hidden className="size-[13px]" strokeWidth={2.6} /> : i + 1}
              <span className="sr-only">
                {stage.label}: {statusText[stage.status]}
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                'mt-[9px] line-clamp-2 px-[4px] text-[12px] leading-[1.3]',
                stage.status === 'pending' ? 'text-muted' : 'font-medium text-ink',
              )}
            >
              {stage.label}
            </span>
            {showDates && stage.date && (
              <span aria-hidden className="tabular mt-[2px] text-[11px] text-subtle">
                {formatShortDate(stage.date)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
