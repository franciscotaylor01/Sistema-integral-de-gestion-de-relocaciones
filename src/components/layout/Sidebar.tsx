import type { LucideIcon } from 'lucide-react'
import { CircleHelp, LogOut, Moon, Sun } from 'lucide-react'
import { motion } from 'motion/react'
import { NavLink } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { railNav, ROUTES, settingsModule } from '@/config/navigation'
import { cn } from '@/lib/cn'
import { spring } from '@/lib/motion'
import { useTheme } from '@/theme/useTheme'

const railButton =
  'relative grid size-[40px] place-items-center rounded-full transition-[color,background-color,transform] duration-200 ease-soft active:scale-[0.92]'
const iconProps = { className: 'relative size-[19px]', strokeWidth: 1.75 } as const

function RailLink({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        cn(railButton, isActive ? 'text-on-contrast' : 'text-ink-secondary hover:bg-surface-muted hover:text-ink')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-full bg-contrast" transition={spring} />}
          <Icon {...iconProps} />
        </>
      )}
    </NavLink>
  )
}

const pill = 'flex flex-col items-center gap-[10px] rounded-full bg-surface px-[3px] shadow-pill'

/** Vertix icon rail: theme switch, module shortcuts, help and sign-out. */
export function Sidebar() {
  const { theme, setTheme } = useTheme()
  const { notify } = useToast()

  return (
    <aside
      aria-label="Barra lateral"
      className="sticky top-[24px] mt-[13px] hidden h-[calc(100dvh-141px)] min-h-[560px] w-[46px] shrink-0 flex-col items-center justify-between self-start xl:flex"
    >
      <div role="group" aria-label="Tema de color" className={cn(pill, 'gap-[6px] py-[3px]')}>
        {(
          [
            { mode: 'light', label: 'Tema claro', icon: Sun },
            { mode: 'dark', label: 'Tema oscuro', icon: Moon },
          ] as const
        ).map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            aria-label={label}
            aria-pressed={theme === mode}
            title={label}
            onClick={() => setTheme(mode)}
            className={cn(railButton, theme === mode ? 'text-ink' : 'text-subtle hover:bg-surface-muted hover:text-ink')}
          >
            <Icon {...iconProps} />
          </button>
        ))}
      </div>

      <nav aria-label="Módulos" className={cn(pill, 'py-[9px]')}>
        {railNav.map((item) => (
          <RailLink key={item.id} to={item.path} label={item.label} icon={item.icon} />
        ))}
        <RailLink to={settingsModule.path} label={settingsModule.label} icon={settingsModule.icon} />
      </nav>

      <div className={cn(pill, 'py-[7px]')}>
        <RailLink to={ROUTES.help} label="Centro de ayuda" icon={CircleHelp} />
        <button
          type="button"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          onClick={() =>
            notify({ title: 'Cerrar sesión no disponible', description: 'La autenticación se incorporará en una próxima fase.' })
          }
          className={cn(railButton, 'text-ink-secondary hover:bg-surface-muted hover:text-ink')}
        >
          <LogOut {...iconProps} />
        </button>
      </div>
    </aside>
  )
}
