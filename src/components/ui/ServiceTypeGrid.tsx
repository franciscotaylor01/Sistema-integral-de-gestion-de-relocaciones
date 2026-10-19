import { Check } from 'lucide-react'
import { activeServiceTypes } from '@/config/serviceCatalog'
import { cn } from '@/lib/cn'
import { ServiceChip } from './ServiceChip'

interface ServiceTypeGridProps {
  selected: string[]
  onToggle: (typeId: string) => void
  multiple?: boolean
  label: string
  /** Types already contracted (shown as a hint, still selectable). */
  existing?: string[]
}

/** Selectable service catalog cards (radio or checkbox semantics). */
export function ServiceTypeGrid({ selected, onToggle, multiple, label, existing = [] }: ServiceTypeGridProps) {
  return (
    <div role={multiple ? 'group' : 'radiogroup'} aria-label={label} className="grid grid-cols-1 gap-[8px] min-[460px]:grid-cols-2 lg:grid-cols-3">
      {activeServiceTypes().map((t) => {
        const on = selected.includes(t.id)
        return (
          <button
            key={t.id}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            onClick={() => onToggle(t.id)}
            className={cn(
              'flex items-start gap-[10px] rounded-[14px] border px-[12px] py-[11px] text-left transition-[background-color,border-color,box-shadow,transform] duration-200 ease-soft active:scale-[0.985]',
              on ? 'border-contrast bg-surface shadow-pill' : 'border-line bg-surface-muted hover:bg-surface hover:shadow-pill',
            )}
          >
            <ServiceChip type={t.id} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium leading-[1.3]">{t.label}</span>
              <span className="mt-[2px] line-clamp-2 block text-[12px] leading-[1.35] text-muted">
                {existing.includes(t.id) ? 'Ya contratado en este proyecto' : t.description}
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                'grid size-[20px] shrink-0 place-items-center rounded-full border transition-colors',
                on ? 'border-contrast bg-contrast text-on-contrast' : 'border-line-strong',
              )}
            >
              {on && <Check className="size-[12px]" strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
