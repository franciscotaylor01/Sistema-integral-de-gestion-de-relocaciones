import { ChevronDown, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { getProcedureType } from '@/config/procedureCatalog'
import { NotesPanel } from '@/features/workflows/NotesPanel'
import { WorkflowPanel } from '@/features/workflows/WorkflowPanel'
import { WorkStatusControl } from '@/features/workflows/WorkStatusControl'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import type { Procedure } from '@/types/domain'

interface ProcedureCardProps {
  procedure: Procedure
  workspace: Workspace
  onEdit: () => void
  onOpenTask: (taskId: string) => void
}

/** A procedure (DNI, TIE, residencia…) for one person, with its own workflow. */
export function ProcedureCard({ procedure, workspace, onEdit, onOpenTask }: ProcedureCardProps) {
  const [showNotes, setShowNotes] = useState(false)
  const person = workspace.personById.get(procedure.personId)
  const owner = workspace.staffById.get(procedure.ownerId)
  const scope = { kind: 'procedure' as const, id: procedure.id }

  return (
    <article aria-label={`Trámite ${getProcedureType(procedure.typeId).label} de ${person?.name}`} className="rounded-[16px] bg-surface p-[14px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[10px]">
          <Avatar name={person?.name ?? '?'} className="size-[36px]" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">
              {getProcedureType(procedure.typeId).label} <span className="font-normal text-muted">· {person?.name}</span>
            </p>
            <p className="truncate text-[12.5px] text-muted">
              {[procedure.reference && `Exp. ${procedure.reference}`, owner?.name, procedure.dueDate && `vence ${formatDate(procedure.dueDate)}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-[6px]">
          <WorkStatusControl scope={scope} status={procedure.status} stages={procedure.stages} noun="el trámite" />
          <button
            type="button"
            onClick={onEdit}
            aria-label="Editar trámite"
            title="Editar trámite"
            className="grid size-[32px] place-items-center rounded-full text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <Pencil className="size-[15px]" strokeWidth={1.9} />
          </button>
        </div>
      </div>
      <div className="mt-[14px]">
        <WorkflowPanel scope={scope} stages={procedure.stages} status={procedure.status} workspace={workspace} onOpenTask={onOpenTask} />
      </div>
      <button
        type="button"
        aria-expanded={showNotes}
        onClick={() => setShowNotes((v) => !v)}
        className="mt-[12px] inline-flex items-center gap-[6px] rounded-full px-[8px] py-[4px] text-[13px] text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
      >
        Notas del trámite ({procedure.notes.length})
        <ChevronDown aria-hidden className={cn('size-[14px] transition-transform duration-300', showNotes && 'rotate-180')} strokeWidth={2} />
      </button>
      {showNotes && (
        <div className="mt-[10px]">
          <NotesPanel scope={scope} notes={procedure.notes} workspace={workspace} />
        </div>
      )}
    </article>
  )
}
