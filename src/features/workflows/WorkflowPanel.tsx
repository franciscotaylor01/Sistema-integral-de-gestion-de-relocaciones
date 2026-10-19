import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StageStepper } from '@/components/ui/StageStepper'
import { stageProgress } from '@/domain/workflow'
import type { WorkScope } from '@/domain/workItems'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatPercent } from '@/lib/format'
import type { ServiceStatus, WorkflowStage } from '@/types/domain'
import { AddStageModal } from './AddStageModal'
import { StageModal } from './StageModal'

interface WorkflowPanelProps {
  scope: WorkScope
  stages: WorkflowStage[]
  status: ServiceStatus
  workspace: Workspace
  onOpenTask?: (taskId: string) => void
}

/** Interactive step tracker: click a stage to edit or advance it; add custom stages. */
export function WorkflowPanel({ scope, stages, status, workspace, onOpenTask }: WorkflowPanelProps) {
  const [stageId, setStageId] = useState<string>()
  const [adding, setAdding] = useState(false)
  const progress = stageProgress(stages)
  const stage = stages.find((s) => s.id === stageId)

  return (
    <div>
      <StageStepper stages={stages} onStageClick={(s) => setStageId(s.id)} />
      <div className="mt-[14px] flex flex-wrap items-center gap-[12px]">
        <ProgressBar
          value={progress.done}
          max={progress.total || 1}
          label="Avance del workflow"
          valueText={`${progress.done} de ${progress.total} etapas`}
          size="sm"
          className="min-w-[160px] flex-1"
          tone={status === 'blocked' ? 'danger' : status === 'completed' ? 'success' : 'accent'}
        />
        <span className="tabular text-[13px] font-medium">
          {formatPercent(progress.pct)} <span className="font-normal text-muted">· {progress.done}/{progress.total} etapas de este workflow</span>
        </span>
        {status !== 'completed' && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)} className="h-[32px] px-[12px] text-[13px]">
            <Plus aria-hidden className="size-[14px]" strokeWidth={2.2} />
            Etapa
          </Button>
        )}
      </div>
      <StageModal
        open={Boolean(stage)}
        onClose={() => setStageId(undefined)}
        scope={scope}
        stage={stage}
        itemStatus={status}
        workspace={workspace}
        onOpenTask={
          onOpenTask
            ? (id) => {
                setStageId(undefined)
                onOpenTask(id)
              }
            : undefined
        }
      />
      <AddStageModal open={adding} onClose={() => setAdding(false)} scope={scope} stages={stages} workspace={workspace} />
    </div>
  )
}
