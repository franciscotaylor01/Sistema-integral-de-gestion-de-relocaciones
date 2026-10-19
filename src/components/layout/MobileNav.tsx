import type { LucideIcon } from 'lucide-react'
import { CircleHelp, ListChecks, Moon, Sun, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router'
import { LogoMark } from '@/components/ui/Logo'
import { brand } from '@/config/brand'
import { primaryNav, railNav, ROUTES, settingsModule } from '@/config/navigation'
import { cn } from '@/lib/cn'
import { easeOutSoft } from '@/lib/motion'
import { useTheme } from '@/theme/useTheme'

function DrawerLink({ to, label, icon: Icon, onNavigate }: { to: string; label: string; icon: LucideIcon; onNavigate: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-[46px] items-center gap-[12px] rounded-full px-[16px] text-[15px] transition-[background-color,color] duration-200 ease-soft',
          isActive ? 'bg-contrast text-on-contrast' : 'text-ink-secondary hover:bg-surface-muted hover:text-ink',
        )
      }
    >
      <Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />
      {label}
    </NavLink>
  )
}

/** Below `xl` the top nav and rail collapse into this drawer. */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme } = useTheme()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <motion.div
            className="absolute inset-0 bg-backdrop/70 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.nav
            aria-label="Menú principal"
            initial={{ x: '-104%' }}
            animate={{ x: 0 }}
            exit={{ x: '-104%', transition: { duration: 0.22, ease: 'easeIn' } }}
            transition={{ duration: 0.38, ease: easeOutSoft }}
            className="absolute inset-y-3 left-3 flex w-[min(320px,calc(100vw-24px))] flex-col overflow-y-auto rounded-card bg-surface p-[14px] shadow-card-hover"
          >
            <div className="flex items-center justify-between pl-[4px]">
              <span className="flex items-center gap-[12px]">
                <LogoMark className="size-[38px]" />
                <span>
                  <span className="block text-[17px] font-semibold leading-[1.2]">{brand.productName}</span>
                  <span className="block text-[11.5px] leading-[1.35] text-muted">{brand.clientName}</span>
                </span>
              </span>
              <button
                ref={closeRef}
                type="button"
                aria-label="Cerrar menú"
                onClick={onClose}
                className="grid size-[40px] place-items-center rounded-full text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-[19px]" strokeWidth={1.9} />
              </button>
            </div>

            <p className="mt-[22px] px-[16px] text-[12px] font-medium uppercase tracking-[0.06em] text-subtle">Secciones</p>
            <div className="mt-[8px] flex flex-col gap-[4px]">
              {primaryNav.map((item) => (
                <DrawerLink key={item.id} to={item.path} label={item.label} icon={item.icon} onNavigate={onClose} />
              ))}
              <DrawerLink to={ROUTES.tasks} label="Mis tareas" icon={ListChecks} onNavigate={onClose} />
            </div>

            <p className="mt-[22px] px-[16px] text-[12px] font-medium uppercase tracking-[0.06em] text-subtle">Próximos módulos</p>
            <div className="mt-[8px] flex flex-col gap-[4px]">
              {[...railNav.filter((m) => m.path !== '/'), settingsModule].map((item) => (
                <DrawerLink key={item.id} to={item.path} label={item.label} icon={item.icon} onNavigate={onClose} />
              ))}
              <DrawerLink to={ROUTES.help} label="Centro de ayuda" icon={CircleHelp} onNavigate={onClose} />
            </div>

            <div className="mt-auto pt-[22px]">
              <div role="group" aria-label="Tema de color" className="grid grid-cols-2 gap-[6px] rounded-full bg-surface-muted p-[4px]">
                {(
                  [
                    { mode: 'light', label: 'Claro', icon: Sun },
                    { mode: 'dark', label: 'Oscuro', icon: Moon },
                  ] as const
                ).map(({ mode, label, icon: Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={theme === mode}
                    onClick={() => setTheme(mode)}
                    className={cn(
                      'flex h-[38px] items-center justify-center gap-[8px] rounded-full text-[14px] transition-[background-color,color] duration-200 ease-soft',
                      theme === mode ? 'bg-surface text-ink shadow-pill' : 'text-ink-secondary hover:text-ink',
                    )}
                  >
                    <Icon aria-hidden className="size-[16px]" strokeWidth={1.8} />
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-[14px] px-[6px] text-[11.5px] leading-[1.4] text-subtle">{brand.productFullName}</p>
            </div>
          </motion.nav>
        </div>
      )}
    </AnimatePresence>
  )
}
