import { Info, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { easeOutSoft } from '@/lib/motion'
import { ToastContext, type ToastInput } from './toastContext'

interface ToastItem extends ToastInput {
  id: number
}

const TOAST_MS = 4200

/**
 * Lightweight toasts for actions not wired in Phase 1 (e.g. "Nuevo proyecto"),
 * so every visible control gives honest feedback instead of doing nothing.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const notify = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-2), { ...toast, id }])
      window.setTimeout(() => dismiss(id), TOAST_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-[10px] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.18 } }}
              transition={{ duration: 0.32, ease: easeOutSoft }}
              role="status"
              className="pointer-events-auto flex w-full max-w-[380px] items-start gap-[12px] rounded-[18px] bg-contrast px-[16px] py-[13px] text-on-contrast shadow-card-hover"
            >
              <Info aria-hidden className="mt-[2px] size-[17px] shrink-0 opacity-80" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium leading-[1.35]">{t.title}</p>
                {t.description && <p className="mt-[2px] text-[13px] leading-[1.4] opacity-75">{t.description}</p>}
              </div>
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={() => dismiss(t.id)}
                className="grid size-[24px] shrink-0 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100"
              >
                <X className="size-[14px]" strokeWidth={2.2} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
