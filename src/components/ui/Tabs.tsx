import { motion } from 'motion/react'
import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'

export interface TabItem<T extends string> {
  value: T
  label: string
  count?: number
  icon?: ReactNode
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  /** Prefix for tab/panel ids so the panel can reference its tab. */
  idPrefix?: string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Pill tab bar using the Vertix TopNav language: contrast pill sliding under
 * the active tab. Arrow keys move between tabs (WAI-ARIA tabs pattern).
 */
export function Tabs<T extends string>({ items, value, onChange, label, idPrefix, size = 'md', className }: TabsProps<T>) {
  const autoId = useId()
  const prefix = idPrefix ?? autoId

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = items.findIndex((i) => i.value === value)
    let next = -1
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length
    if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = items.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(items[next].value)
    document.getElementById(`${prefix}-tab-${items[next].value}`)?.focus()
  }

  return (
    <div className={cn('scrollbar-none relative max-w-full overflow-x-auto', className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="inline-flex items-center rounded-full bg-surface p-[6px] shadow-pill"
      >
        {items.map((item) => {
          const active = item.value === value
          return (
            <button
              key={item.value}
              id={`${prefix}-tab-${item.value}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${prefix}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.value)}
              className={cn(
                'relative flex items-center gap-[8px] whitespace-nowrap rounded-full transition-[color,transform] duration-200 ease-soft active:scale-[0.97]',
                size === 'md' ? 'h-[42px] px-[20px] text-[15px]' : 'h-[36px] px-[16px] text-[14px]',
                active ? 'text-on-contrast' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {active && (
                <motion.span layoutId={`${prefix}-active`} className="absolute inset-0 rounded-full bg-contrast" transition={spring} />
              )}
              {item.icon && <span className="relative">{item.icon}</span>}
              <span className="relative">{item.label}</span>
              {item.count !== undefined && (
                <span
                  className={cn(
                    'tabular relative rounded-full px-[7px] py-[1px] text-[12px] font-medium',
                    active ? 'bg-on-contrast/15 text-on-contrast' : 'bg-surface-sunken text-ink-secondary',
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Panel paired with <Tabs>; re-keys so content fades on tab change. */
export function TabPanel({ idPrefix, activeValue, children }: { idPrefix: string; activeValue: string; children: ReactNode }) {
  return (
    <motion.div
      key={activeValue}
      id={`${idPrefix}-panel`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${activeValue}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
