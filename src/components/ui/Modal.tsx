import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { easeOutSoft } from '@/lib/motion'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Prevents closing (Escape / backdrop) while a save is in flight. */
  busy?: boolean
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Accessible dialog in the SIGR surface language (same panel as the search
 * dialog): traps focus, closes on Escape/backdrop, restores focus on close.
 */
export function Modal(props: ModalProps) {
  return <AnimatePresence>{props.open && <ModalPanel {...props} />}</AnimatePresence>
}

function ModalPanel({ onClose, title, description, children, footer, size = 'md', busy }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)

  useEffect(() => {
    closeRef.current = onClose
    busyRef.current = busy
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) {
        e.stopPropagation()
        closeRef.current()
      }
      if (e.key === 'Tab' && panel) {
        const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        if (items.length === 0) return
        const firstEl = items[0]
        const lastEl = items[items.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-start sm:px-4 sm:pt-[8vh]">
      <motion.div
        className="absolute inset-0 bg-backdrop/70 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => !busy && onClose()}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.16 } }}
        transition={{ duration: 0.3, ease: easeOutSoft }}
        className={cn(
          'relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-card bg-surface shadow-card-hover',
          size === 'sm' && 'max-w-[440px]',
          size === 'md' && 'max-w-[600px]',
          size === 'lg' && 'max-w-[780px]',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-[22px] pb-[6px] pt-[20px]">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[19px] font-semibold leading-[1.3] tracking-[-0.01em]">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-[6px] text-[14px] leading-[1.45] text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={busy}
            onClick={onClose}
            className="grid size-[36px] shrink-0 place-items-center rounded-full text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
          >
            <X className="size-[18px]" strokeWidth={1.9} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-[20px] pt-[12px]">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-[10px] border-t border-line px-[22px] py-[14px]">{footer}</div>}
      </motion.div>
    </div>
  )
}
