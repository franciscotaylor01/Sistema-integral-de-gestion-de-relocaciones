import { Check, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { pillControl } from './buttonStyles'
import { MenuItem, Popover } from './Popover'

export interface FilterOption {
  value: string
  label: string
  icon?: ReactNode
}

interface FilterSelectProps {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
  /** Label of the "no filter" option; its value is the empty string. */
  allLabel?: string
  align?: 'start' | 'end'
  size?: 'sm' | 'md'
}

/** Vertix "Filter" pill turned into a single-select dropdown. */
export function FilterSelect({ label, value, options, onChange, allLabel = 'Todos', align = 'start', size = 'md' }: FilterSelectProps) {
  const current = options.find((o) => o.value === value)
  const active = Boolean(current)

  return (
    <Popover
      label={label}
      role="listbox"
      align={align}
      panelClassName="max-h-[320px] w-max max-w-[300px] overflow-y-auto"
      trigger={({ toggle, open, ...aria }) => (
        <button
          type="button"
          onClick={toggle}
          {...aria}
          className={cn(
            pillControl,
            size === 'sm' && 'h-[38px] px-[14px] text-[14px]',
            active && 'border-line-strong text-ink',
            open && 'bg-surface-muted',
          )}
        >
          <span className="text-muted">{label}:</span>
          <span className={cn('max-w-[150px] truncate', active ? 'font-medium text-ink' : 'text-ink-secondary')}>
            {current?.label ?? allLabel}
          </span>
          <ChevronDown
            aria-hidden
            className={cn('size-[15px] text-muted transition-transform duration-300 ease-soft', open && 'rotate-180')}
            strokeWidth={2}
          />
        </button>
      )}
    >
      {(close) => (
        <>
          {[{ value: '', label: allLabel } as FilterOption, ...options].map((o) => (
            <MenuItem
              key={o.value || '__all'}
              role="option"
              selected={o.value === value}
              onSelect={() => {
                onChange(o.value)
                close()
              }}
            >
              {o.icon}
              <span className="flex-1 whitespace-nowrap">{o.label}</span>
              <Check aria-hidden className={cn('size-[15px] text-ink', o.value !== value && 'invisible')} strokeWidth={2.2} />
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  )
}
