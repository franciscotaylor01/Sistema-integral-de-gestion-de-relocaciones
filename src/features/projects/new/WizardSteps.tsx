import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface WizardStep {
  id: string
  label: string
  description: string
}

interface WizardStepsProps {
  steps: WizardStep[]
  current: number
  /** Highest step the user may jump to. */
  reachable: number
  invalid: Set<number>
  onSelect: (index: number) => void
}

/** Step tracker in the workflow-stepper language (done = contrast check, current = accent ring). */
export function WizardSteps({ steps, current, reachable, invalid, onSelect }: WizardStepsProps) {
  return (
    <nav aria-label="Pasos del alta" className="scrollbar-none relative overflow-x-auto">
      <ol className="flex min-w-max gap-[6px] rounded-full bg-surface p-[6px] shadow-pill">
        {steps.map((step, i) => {
          const done = i < current
          const active = i === current
          const disabled = i > reachable
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={disabled}
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(i)}
                className={cn(
                  'flex h-[44px] items-center gap-[10px] rounded-full pl-[8px] pr-[16px] text-[14.5px] transition-[background-color,color] duration-200 ease-soft',
                  active ? 'bg-contrast text-on-contrast' : 'text-ink-secondary hover:bg-surface-muted hover:text-ink disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                <span
                  className={cn(
                    'grid size-[28px] place-items-center rounded-full text-[12.5px] font-semibold',
                    active ? 'bg-on-contrast/15' : invalid.has(i) ? 'bg-danger-soft text-danger' : done ? 'bg-contrast text-on-contrast' : 'bg-surface-sunken',
                  )}
                >
                  {done && !invalid.has(i) ? <Check aria-hidden className="size-[14px]" strokeWidth={2.6} /> : i + 1}
                </span>
                <span className="whitespace-nowrap">{step.label}</span>
                {invalid.has(i) && <span className="sr-only">(con errores)</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
