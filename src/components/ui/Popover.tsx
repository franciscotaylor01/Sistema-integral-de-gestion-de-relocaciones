import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDismiss } from '@/hooks/useDismiss'
import { cn } from '@/lib/cn'
import { duration, easeOutSoft } from '@/lib/motion'

interface TriggerProps {
  open: boolean
  toggle: () => void
  'aria-expanded': boolean
  'aria-controls': string
  'aria-haspopup': 'dialog' | 'menu' | 'listbox'
}

interface PopoverProps {
  trigger: (props: TriggerProps) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  role?: 'dialog' | 'menu' | 'listbox'
  label: string
  panelClassName?: string
  className?: string
}

/**
 * Anchored floating panel (dropdowns, menus, notification tray). Uses the
 * Vertix surface language: white card, hairline border, soft lifted shadow.
 */
export function Popover({ trigger, children, align = 'end', role = 'dialog', label, panelClassName, className }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => [wrapRef], [])
  const id = useId()
  const close = useCallback(() => setOpen(false), [])
  useDismiss(refs, open, close)

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      {trigger({
        open,
        toggle: () => setOpen((o) => !o),
        'aria-expanded': open,
        'aria-controls': id,
        'aria-haspopup': role,
      })}
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role={role}
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: duration.fast } }}
            transition={{ duration: 0.22, ease: easeOutSoft }}
            className={cn(
              'absolute top-[calc(100%+10px)] z-40 min-w-[220px] origin-top rounded-panel border border-line bg-surface p-[6px] shadow-card-hover',
              align === 'end' ? 'right-0' : 'left-0',
              panelClassName,
            )}
          >
            {children(close)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Row inside a popover menu. */
export function MenuItem({
  children,
  onSelect,
  selected,
  role = 'menuitem',
  className,
}: {
  children: ReactNode
  onSelect: () => void
  selected?: boolean
  role?: 'menuitem' | 'option' | 'menuitemradio'
  className?: string
}) {
  return (
    <button
      type="button"
      role={role}
      aria-selected={role === 'option' ? selected : undefined}
      aria-checked={role === 'menuitemradio' ? selected : undefined}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-[10px] rounded-[10px] px-[10px] py-[9px] text-left text-[14px] transition-colors duration-150 ease-soft hover:bg-surface-muted',
        selected ? 'font-medium text-ink' : 'text-ink-secondary hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}
