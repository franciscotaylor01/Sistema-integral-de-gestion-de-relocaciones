import { CheckCircle2, CircleDot, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { WorkScope } from '@/domain/workItems'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import type { ServiceStatus, WorkflowStage } from '@/types/domain'

const stageStatusMeta = {
  done: { label: 'Completada', tone: 'success' },
  current: { label: 'Etapa actual', tone: 'accent' },
  pending: { label: 'Pendiente', tone: 'neutral' },
} as const

interface StageModalProps {
  open: boolean
  onClose: () => void
  scope: WorkScope
  stage: WorkflowStage | undefined
  itemStatus: ServiceStatus
  workspace: Workspace
  onOpenTask?: (taskId: string) => void
}

/** Stage detail: edit name, due date, owner and notes; complete it or make it current. */
export function StageModal(props: StageModalProps) {
  return (
    <Modal open={props.open && Boolean(props.stage)} onClose={props.onClose} title={props.stage?.label ?? 'Etapa'} size="md">
      {props.stage && <StageForm key={props.stage.id} {...props} stage={props.stage} />}
    </Modal>
  )
}

function StageForm({ onClose, scope, stage, itemStatus, workspace, onOpenTask }: StageModalProps & { stage: WorkflowStage }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [label, setLabel] = useState(stage.label)
  const [dueDate, setDueDate] = useState(stage.dueDate ?? '')
  const [ownerId, setOwnerId] = useState(stage.ownerId ?? '')
  const [notes, setNotes] = useState(stage.notes ?? '')
  const locked = itemStatus === 'completed'
  const tasks = workspace.tasks.filter((t) => t.stageId === stage.id)

  const save = async () => {
    const ok = await run(
      () => actions.applyStageAction(scope, { type: 'update', stageId: stage.id, patch: { label, dueDate, ownerId, notes } }),
      { title: 'Etapa actualizada' },
    )
    if (ok) onClose()
  }
  const transition = async (type: 'complete' | 'activate') => {
    const ok = await run(() => actions.applyStageAction(scope, { type, stageId: stage.id }), {
      title: type === 'complete' ? `Etapa «${stage.label}» completada` : `«${stage.label}» es ahora la etapa actual`,
      description: type === 'complete' ? 'La siguiente etapa pendiente pasó a estar en curso.' : undefined,
    })
    if (ok) onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="flex flex-col gap-[16px]"
    >
      <div className="flex flex-wrap items-center gap-[10px] text-[13px] text-muted">
        <StatusBadge variant="soft" meta={stageStatusMeta[stage.status]} />
        {stage.completedAt && <span>Completada el {formatDate(stage.completedAt)}</span>}
      </div>

      {!locked && stage.status !== 'done' && (
        <div className="flex flex-wrap gap-[10px] rounded-[14px] bg-surface-muted p-[10px]">
          <Button size="sm" onClick={() => transition('complete')} disabled={busy}>
            <CheckCircle2 aria-hidden className="size-[16px]" strokeWidth={2} />
            Marcar como completada
          </Button>
          {stage.status !== 'current' && (
            <Button size="sm" variant="outline" onClick={() => transition('activate')} disabled={busy}>
              <CircleDot aria-hidden className="size-[16px]" strokeWidth={2} />
              Hacer etapa actual
            </Button>
          )}
        </div>
      )}
      {!locked && stage.status === 'done' && (
        <div className="flex flex-wrap items-center justify-between gap-[10px] rounded-[14px] bg-surface-muted px-[12px] py-[10px] text-[13.5px] text-ink-secondary">
          Esta etapa está completada.
          <Button size="sm" variant="outline" onClick={() => transition('activate')} disabled={busy}>
            Reabrir como etapa actual
          </Button>
        </div>
      )}
      {locked && (
        <p className="rounded-[14px] bg-surface-muted px-[12px] py-[10px] text-[13.5px] text-ink-secondary">
          El workflow está completado. Podés editar los datos de la etapa; para cambiar su estado, reabrilo primero.
        </p>
      )}

      <FormError message={formError} />
      <Field label="Nombre de la etapa" required error={errors.label}>
        {(p) => <TextInput {...p} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />}
      </Field>
      <div className="grid gap-[14px] sm:grid-cols-2">
        <Field label="Fecha objetivo">{(p) => <DateInput {...p} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
        <Field label="Responsable de la etapa" hint="Vacío = responsable del servicio">
          {(p) => (
            <SelectInput {...p} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Responsable del servicio</option>
              {workspace.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
      </div>
      <Field label="Notas operativas">{(p) => <TextArea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />}</Field>

      {tasks.length > 0 && (
        <div>
          <p className="text-[13.5px] font-medium text-ink-secondary">Tareas de la etapa</p>
          <ul className="mt-[8px] flex flex-col gap-[6px]">
            {tasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpenTask?.(t.id)}
                  disabled={!onOpenTask}
                  className="flex w-full items-center justify-between gap-3 rounded-[12px] bg-surface-muted px-[12px] py-[9px] text-left text-[13.5px] transition-colors hover:bg-surface-sunken disabled:cursor-default"
                >
                  <span className={t.status === 'done' ? 'text-muted line-through' : 'font-medium'}>{t.title}</span>
                  {onOpenTask && <ExternalLink aria-hidden className="size-[14px] shrink-0 text-muted" strokeWidth={2} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
