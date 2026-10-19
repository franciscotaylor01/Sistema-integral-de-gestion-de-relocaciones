import { motion } from 'motion/react'
import { useId } from 'react'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}

/** Compact toggle (e.g. chart currency) in the TopNav pill language. */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: SegmentedControlProps<T>) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-full bg-surface p-[3px] shadow-pill', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative h-[28px] rounded-full px-[11px] text-[12.5px] font-medium transition-colors duration-200 ease-soft',
              active ? 'text-on-contrast' : 'text-ink-secondary hover:text-ink',
            )}
          >
            {active && <motion.span layoutId={`${id}-seg`} className="absolute inset-0 rounded-full bg-contrast" transition={spring} />}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
