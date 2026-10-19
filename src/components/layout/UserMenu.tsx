import { ChevronDown, ListChecks, LogOut, Moon, RotateCcw, Settings, Sun, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MenuItem, Popover } from '@/components/ui/Popover'
import { Skeleton } from '@/components/ui/Skeleton'
import { ROUTES } from '@/config/navigation'
import { useActions } from '@/hooks/useActions'
import { useQuery } from '@/hooks/useQuery'
import { cn } from '@/lib/cn'
import { dataSource } from '@/services/dataSource'
import { useTheme } from '@/theme/useTheme'

export function UserMenu() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const { theme, setTheme } = useTheme()
  const { data: user } = useQuery('current-user', dataSource.getCurrentUser)
  const actions = useActions()
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <>
      <Popover
        className="h-full"
        label="Menú de la cuenta"
        role="menu"
        panelClassName="w-[260px]"
        trigger={({ toggle, open, ...aria }) => (
          <button
            type="button"
            onClick={toggle}
            {...aria}
            aria-label="Abrir menú de la cuenta"
            className={cn(
              'group flex h-full items-center gap-[12px] rounded-full bg-surface p-[6px] text-left shadow-pill transition-[background-color,transform] duration-200 ease-soft hover:bg-surface-muted active:scale-[0.985] sm:p-[9px] 2xl:w-[226px] 2xl:pr-[20px]',
              open && 'bg-surface-muted',
            )}
          >
            {user ? <Avatar name={user.name} className="size-[40px]" /> : <Skeleton className="size-[40px] rounded-full" />}
            <span className="hidden min-w-0 flex-1 2xl:block">
              <span className="block truncate text-[15px] font-semibold leading-[1.2]">{user?.name ?? '…'}</span>
              <span className="block truncate text-[11.5px] leading-[1.35] text-muted">{user?.email}</span>
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                'hidden size-[16px] shrink-0 text-muted transition-transform duration-300 ease-soft group-hover:translate-y-[1px] sm:block',
                open && 'rotate-180',
              )}
              strokeWidth={2}
            />
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="px-[10px] pb-[10px] pt-[8px]">
              <p className="truncate text-[15px] font-semibold">{user?.name}</p>
              <p className="truncate text-[12.5px] text-muted">{user?.email}</p>
              <p className="mt-[6px] inline-flex rounded-full bg-surface-muted px-[9px] py-[2px] text-[12px] text-ink-secondary">{user?.role}</p>
            </div>
            <div className="my-[4px] h-px bg-line" />
            <MenuItem
              onSelect={() => {
                close()
                navigate(ROUTES.tasks)
              }}
            >
              <ListChecks aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Mis tareas
            </MenuItem>
            <MenuItem onSelect={() => (close(), navigate(ROUTES.profile))}>
              <UserRound aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Mi perfil
            </MenuItem>
            <MenuItem onSelect={() => (close(), navigate(ROUTES.settings))}>
              <Settings aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Configuración
            </MenuItem>
            <MenuItem onSelect={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? (
                <Moon aria-hidden className="size-[16px]" strokeWidth={1.9} />
              ) : (
                <Sun aria-hidden className="size-[16px]" strokeWidth={1.9} />
              )}
              {theme === 'light' ? 'Tema oscuro' : 'Tema claro'}
            </MenuItem>
            <MenuItem
              onSelect={() => {
                close()
                setConfirmReset(true)
              }}
            >
              <RotateCcw aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Restablecer datos de demo
            </MenuItem>
            <div className="my-[4px] h-px bg-line" />
            <MenuItem
              onSelect={() => {
                close()
                notify({ title: 'Cerrar sesión no disponible', description: 'La autenticación se incorporará en una próxima fase.' })
              }}
            >
              <LogOut aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Cerrar sesión
            </MenuItem>
          </>
        )}
      </Popover>
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Restablecer datos de demo"
        tone="danger"
        confirmLabel="Restablecer"
        message="Se descartarán todos los cambios hechos en esta demo (proyectos, servicios, tareas y notas) y se restaurarán los datos ficticios iniciales. Esta acción no se puede deshacer."
        onConfirm={async () => {
          await actions.resetDemoData()
          notify({ title: 'Datos de demo restablecidos', description: 'Se restauraron los datos ficticios iniciales.' })
          navigate('/')
        }}
      />
    </>
  )
}
