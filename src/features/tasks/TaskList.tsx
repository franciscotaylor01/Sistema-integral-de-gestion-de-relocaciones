import { Check, ListChecks } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { taskStatusMeta } from '@/config/catalogs'
import { useActions } from '@/hooks/useActions'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { daysUntil, formatRelativeDays, formatShortDate } from '@/lib/dates'
import type { Task } from '@/types/domain'
import { isOverdue, taskLinks } from './selectors'

interface TaskListProps {
  tasks: Task[]
  workspace: Workspace
  onOpen: (taskId: string) => void
  /** Show the project code / beneficiary line (off inside a project). */
  showProject?: boolean
  showOwner?: boolean
  emptyTitle?: string
  emptyDescription?: string
}

/** Task rows in the Vertix list language: check toggle, links, due date, status. */
export function TaskList({ tasks, workspace, onOpen, showProject = true, showOwner = true, emptyTitle = 'Sin tareas', emptyDescription }: TaskListProps) {
  const actions = useActions()
  const { notify } = useToast()
  const [pending, setPending] = useState<string>()

  const toggle = async (t: Task) => {
    if (pending) return
    setPending(t.id)
    const done = t.status !== 'done'
    try {
      await actions.updateTask(t.id, { status: done ? 'done' : 'todo' })
      notify({ title: done ? 'Tarea completada' : 'Tarea reabierta', description: t.title })
    } catch (e) {
      notify({ title: 'No se pudo actualizar la tarea', description: e instanceof Error ? e.message : undefined })
    } finally {
      setPending(undefined)
    }
  }

  if (tasks.length === 0) {
    return <EmptyState icon={ListChecks} title={emptyTitle} description={emptyDescription} className="py-8" />
  }

  return (
    <ul className="flex flex-col gap-[6px]">
      {tasks.map((t) => {
        const links = taskLinks(workspace, t)
        const done = t.status === 'done'
        const overdue = isOverdue(t)
        const owner = workspace.staffById.get(t.ownerId)
        return (
          <li key={t.id} className="group flex items-start gap-[12px] rounded-[14px] bg-surface px-[12px] py-[11px] transition-shadow duration-300 ease-soft hover:shadow-pill">
            <button
              type="button"
              role="checkbox"
              aria-checked={done}
              aria-label={done ? `Reabrir «${t.title}»` : `Completar «${t.title}»`}
              disabled={pending === t.id}
              onClick={() => toggle(t)}
              className={cn(
                'mt-[1px] grid size-[22px] shrink-0 place-items-center rounded-[7px] border transition-[background-color,border-color,transform] duration-200 ease-soft active:scale-90',
                done ? 'border-contrast bg-contrast text-on-contrast' : 'border-line-strong bg-surface hover:border-ink-secondary',
              )}
            >
              {done && <Check aria-hidden className="size-[14px]" strokeWidth={2.6} />}
            </button>
            <button type="button" onClick={() => onOpen(t.id)} className="min-w-0 flex-1 text-left">
              <span className={cn('block text-[14.5px] leading-[1.35]', done ? 'text-muted line-through' : 'font-medium text-ink')}>{t.title}</span>
              <span className="mt-[3px] block truncate text-[12.5px] text-muted">
                {[showProject && links.projectCode, showProject && links.beneficiary, links.service, links.procedure, links.stage].filter(Boolean).join(' · ')}
              </span>
              {t.status === 'waiting' && t.waitingOn && <span className="mt-[3px] block text-[12.5px] text-info">Esperando a: {t.waitingOn}</span>}
            </button>
            <span className="flex shrink-0 flex-col items-end gap-[4px]">
              {!done && t.status !== 'todo' && <StatusBadge meta={taskStatusMeta[t.status]} className="text-[12px]" />}
              {t.dueDate && (
                <span
                  className={cn('tabular text-[12px]', done ? 'text-subtle' : overdue ? 'font-medium text-danger' : daysUntil(t.dueDate) <= 3 ? 'text-warning' : 'text-muted')}
                  title={formatShortDate(t.dueDate)}
                >
                  {done ? `hecha ${formatShortDate(t.completedAt ?? t.dueDate)}` : overdue ? `vencida ${formatRelativeDays(t.dueDate)}` : formatRelativeDays(t.dueDate)}
                </span>
              )}
              {showOwner && owner && (
                <span className="flex items-center gap-[5px] text-[11.5px] text-muted">
                  <Avatar name={owner.name} className="size-[18px] [&>span]:text-[8px]" />
                  {owner.name.split(' ')[0]}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
