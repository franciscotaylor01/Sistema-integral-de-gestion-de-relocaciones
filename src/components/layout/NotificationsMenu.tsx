import { Bell, BellOff } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { utilityButton } from '@/components/ui/buttonStyles'
import { EmptyState } from '@/components/ui/EmptyState'
import { Popover } from '@/components/ui/Popover'
import { Skeleton } from '@/components/ui/Skeleton'
import { useQuery } from '@/hooks/useQuery'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/dates'
import { dataSource } from '@/services/dataSource'

export function NotificationsMenu() {
  const navigate = useNavigate()
  const { data: notifications, loading } = useQuery('notifications', dataSource.listNotifications)
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())

  const isRead = (id: string, read: boolean) => read || readIds.has(id)
  const unread = (notifications ?? []).filter((n) => !isRead(n.id, n.read)).length

  return (
    <Popover
      label="Notificaciones"
      panelClassName="w-[min(360px,calc(100vw-32px))] p-[8px] max-sm:fixed max-sm:inset-x-4 max-sm:top-[76px] max-sm:w-auto"
      trigger={({ toggle, open, ...aria }) => (
        <button
          type="button"
          onClick={toggle}
          {...aria}
          aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
          className={cn(utilityButton, 'relative', open && 'bg-surface-muted')}
        >
          <Bell className="size-[20px] origin-top transition-transform duration-300 ease-soft group-hover:rotate-[10deg]" strokeWidth={1.8} />
          {unread > 0 && <span className="absolute right-[11px] top-[10px] size-[7px] rounded-full bg-accent ring-2 ring-surface" />}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-[8px] pb-[8px] pt-[4px]">
            <p className="text-[15px] font-semibold">Notificaciones</p>
            <button
              type="button"
              disabled={unread === 0}
              onClick={() => setReadIds(new Set((notifications ?? []).map((n) => n.id)))}
              className="rounded-full px-[10px] py-[4px] text-[13px] text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-40"
            >
              Marcar como leídas
            </button>
          </div>
          {loading ? (
            <div className="flex flex-col gap-[8px] p-[8px]">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[52px] rounded-[14px]" />
              ))}
            </div>
          ) : !notifications?.length ? (
            <EmptyState icon={BellOff} title="Sin notificaciones" description="Te avisaremos cuando haya novedades." />
          ) : (
            <ul className="flex flex-col gap-[2px]">
              {notifications.map((n) => {
                const read = isRead(n.id, n.read)
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setReadIds((s) => new Set(s).add(n.id))
                        close()
                        navigate(n.href)
                      }}
                      className="flex w-full items-start gap-[12px] rounded-[14px] px-[10px] py-[10px] text-left transition-colors duration-150 hover:bg-surface-muted"
                    >
                      <span
                        aria-hidden
                        className={cn('mt-[6px] size-[7px] shrink-0 rounded-full', read ? 'bg-transparent' : 'bg-accent')}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[14px]', read ? 'text-ink-secondary' : 'font-medium text-ink')}>
                          {n.title}
                          {!read && <span className="sr-only"> (sin leer)</span>}
                        </span>
                        <span className="block truncate text-[13px] text-muted">{n.description}</span>
                        <span className="tabular mt-[2px] block text-[11.5px] text-subtle">{formatDateTime(n.date)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Popover>
  )
}
