import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { formatShortDate } from '@/lib/dates'
import type { WorkflowStage } from '@/types/domain'

const statusText = { done: 'completada', current: 'en curso', pending: 'pendiente' } as const

interface StageStepperProps {
  stages: WorkflowStage[]
  showDates?: boolean
  /** Makes each stage a button (opens its detail). */
  onStageClick?: (stage: WorkflowStage) => void
  className?: string
}

/** Horizontal workflow stages: done (contrast + check), current (accent ring), pending. */
export function StageStepper({ stages, showDates = true, onStageClick, className }: StageStepperProps) {
  return (
    <div className={cn('scrollbar-none relative overflow-x-auto', className)}>
      <ol className="flex min-w-max items-start pb-[2px] pt-[3px]">
        {stages.map((stage, i) => {
          const content: ReactNode = (
            <>
              <span
                className={cn(
                  'relative z-[1] grid size-[24px] place-items-center rounded-full text-[11px] font-semibold transition-transform duration-200 ease-soft',
                  stage.status === 'done' && 'bg-contrast text-on-contrast',
                  stage.status === 'current' && 'bg-surface text-accent ring-2 ring-accent ring-offset-2 ring-offset-surface',
                  stage.status === 'pending' && 'bg-surface-sunken text-muted',
                  onStageClick && 'group-hover:scale-110',
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
                  onStageClick && 'group-hover:text-ink group-hover:underline group-hover:underline-offset-2',
                )}
              >
                {stage.label}
              </span>
              {showDates && (stage.completedAt ?? stage.dueDate) && (
                <span aria-hidden className="tabular mt-[2px] text-[11px] text-subtle">
                  {formatShortDate((stage.completedAt ?? stage.dueDate) as string)}
                </span>
              )}
            </>
          )
          return (
            <li key={stage.id} className="relative flex w-[104px] flex-col items-center text-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute right-1/2 top-[14px] h-[2px] w-full rounded-full',
                    stage.status === 'pending' ? 'bg-line-strong' : 'bg-contrast',
                  )}
                />
              )}
              {onStageClick ? (
                <button
                  type="button"
                  onClick={() => onStageClick(stage)}
                  title={`Ver etapa «${stage.label}»`}
                  className="group flex w-full flex-col items-center rounded-[12px] pb-[4px] pt-[3px]"
                >
                  {content}
                </button>
              ) : (
                <div className="flex w-full flex-col items-center pb-[4px] pt-[3px]">{content}</div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
