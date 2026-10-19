import { Link } from 'react-router'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { PillLink } from '@/components/ui/PillLink'
import { ROUTES } from '@/config/navigation'
import { sortTasks, taskBucket, type TaskBucket } from '@/features/tasks/selectors'
import { TaskList } from '@/features/tasks/TaskList'
import { TaskModal } from '@/features/tasks/TaskModal'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'

/** The demo user's task load, with quick completion and a link to "Mis tareas". */
export function MyTasksCard({ workspace, limit = 4 }: { workspace: Workspace; limit?: number }) {
  const user = useCurrentUser()
  const [taskId, setTaskId] = useState<string>()
  const mine = workspace.tasks.filter((t) => t.ownerId === user?.id)
  const count = (b: TaskBucket) => mine.filter((t) => taskBucket(t) === b).length
  const focus = sortTasks(mine.filter((t) => ['overdue', 'upcoming'].includes(taskBucket(t)))).slice(0, limit)

  const tiles: { bucket: TaskBucket; label: string; tone?: string }[] = [
    { bucket: 'overdue', label: 'Vencidas', tone: 'text-danger' },
    { bucket: 'upcoming', label: 'Próximas' },
    { bucket: 'waiting', label: 'En espera', tone: 'text-info' },
  ]

  return (
    <Card aria-labelledby="my-tasks-title" className="h-full px-[20px] pb-[16px] pt-[18px]">
      <div className="flex h-[34px] items-center justify-between gap-3">
        <h2 id="my-tasks-title" className="text-[16px] font-medium">
          Mis tareas
        </h2>
        <PillLink to={ROUTES.tasks}>Ver todas</PillLink>
      </div>
      <div className="mt-[14px] grid grid-cols-3 gap-[8px]">
        {tiles.map((t) => (
          <Link
            key={t.bucket}
            to={`${ROUTES.tasks}?vista=${t.bucket}`}
            className="rounded-[14px] bg-surface-muted px-[12px] py-[10px] transition-[background-color,transform] duration-200 ease-soft hover:bg-surface-sunken active:scale-[0.98]"
          >
            <span className={cn('tabular block text-[22px] font-semibold leading-none', count(t.bucket) > 0 && t.tone)}>{count(t.bucket)}</span>
            <span className="mt-[6px] block text-[12.5px] text-muted">{t.label}</span>
          </Link>
        ))}
      </div>
      <div className="mt-[12px] rounded-panel bg-surface-muted p-[6px]">
        <TaskList tasks={focus} workspace={workspace} onOpen={setTaskId} showOwner={false} emptyTitle="Estás al día" emptyDescription="No tenés tareas pendientes." />
      </div>
      <TaskModal open={Boolean(taskId)} onClose={() => setTaskId(undefined)} workspace={workspace} taskId={taskId} />
    </Card>
  )
}
