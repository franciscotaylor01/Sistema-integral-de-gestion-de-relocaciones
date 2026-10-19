import { Link } from 'react-router'
import { Card } from '@/components/ui/Card'
import { Timeline } from '@/components/ui/Timeline'
import { projectPath } from '@/config/navigation'
import { activityKindMeta } from '@/features/projects/activityMeta'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDateTime } from '@/lib/dates'

/** Latest events across all projects (live: every command logs here). */
export function RecentActivityCard({ workspace, limit = 6 }: { workspace: Workspace; limit?: number }) {
  const events = [...workspace.activity].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
  return (
    <Card aria-labelledby="recent-activity-title" className="h-full px-[19px] pb-[19px] pt-[19px]">
      <h2 id="recent-activity-title" className="text-[20px] font-semibold tracking-[-0.01em]">
        Actividad reciente
      </h2>
      <Timeline
        className="mt-[18px]"
        items={events.map((e, i) => {
          const project = workspace.projectById.get(e.projectId)
          return {
            id: e.id,
            icon: activityKindMeta[e.kind].icon,
            highlight: i === 0,
            title: (
              <>
                {project && (
                  <Link to={`${projectPath(project.id)}?tab=actividad`} className="tabular mr-[6px] font-medium underline-offset-4 hover:underline">
                    {project.code}
                  </Link>
                )}
                {e.message}
              </>
            ),
            meta: workspace.staffById.get(e.actorId)?.name,
            date: formatDateTime(e.date),
          }
        })}
      />
    </Card>
  )
}
