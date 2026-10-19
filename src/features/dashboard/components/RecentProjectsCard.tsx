import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { PillLink } from '@/components/ui/PillLink'
import { projectPath, ROUTES } from '@/config/navigation'
import { projectColumns } from '@/features/projects/components/projectColumns'
import type { Workspace } from '@/hooks/useWorkspace'

/** Vertix "Recent Activities" table for the latest relocation projects. */
export function RecentProjectsCard({ workspace, limit = 6 }: { workspace: Workspace; limit?: number }) {
  const rows = [...workspace.projects].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, limit)

  return (
    <Card aria-labelledby="recent-projects-title" className="h-full px-[19px] pb-[19px] pt-[19px]">
      <div className="flex items-center justify-between gap-4">
        <h2 id="recent-projects-title" className="text-[20px] font-semibold tracking-[-0.01em]">
          Proyectos recientes
        </h2>
        <PillLink to={ROUTES.projects}>Ver todos</PillLink>
      </div>
      <DataTable
        className="mt-[20px]"
        caption="Proyectos de relocación más recientes"
        rows={rows}
        getRowId={(p) => p.id}
        rowHref={(p) => projectPath(p.id)}
        minWidth={820}
        columns={projectColumns(workspace, ['code', 'assignee', 'client', 'route', 'services', 'operational'])}
      />
    </Card>
  )
}
