import { MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, TextArea } from '@/components/ui/form'
import type { WorkScope } from '@/domain/workItems'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDateTime } from '@/lib/dates'
import type { OperationalNote } from '@/types/domain'

/** Operational notes of a service or procedure, newest first, with a composer. */
export function NotesPanel({ scope, notes, workspace }: { scope: WorkScope; notes: OperationalNote[]; workspace: Workspace }) {
  const actions = useActions()
  const { run, busy, errors } = useCommand()
  const [text, setText] = useState('')

  const submit = async () => {
    const ok = await run(() => actions.addWorkNote(scope, text), { title: 'Nota agregada' })
    if (ok) setText('')
  }

  return (
    <div className="flex flex-col gap-[14px]">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="flex flex-col gap-[10px]"
      >
        <Field label="Nueva nota operativa" error={errors.text}>
          {(p) => (
            <TextArea
              {...p}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              placeholder="Ej.: El propietario pide garantía bancaria en lugar de seguro de caución."
              className="min-h-[76px]"
            />
          )}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="outline" disabled={busy || !text.trim()}>
            {busy ? 'Guardando…' : 'Agregar nota'}
          </Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <EmptyState icon={MessageSquareText} title="Sin notas" description="Registrá acuerdos, llamadas o novedades del caso." className="py-6" />
      ) : (
        <ul className="flex flex-col gap-[8px]">
          {notes.map((n) => {
            const author = workspace.staffById.get(n.authorId)
            return (
              <li key={n.id} className="flex gap-[12px] rounded-[14px] bg-surface-muted px-[12px] py-[11px]">
                <Avatar name={author?.name ?? '?'} className="size-[30px] bg-surface" />
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.45]">{n.text}</p>
                  <p className="mt-[4px] text-[12px] text-muted">
                    {author?.name} · <span className="tabular">{formatDateTime(n.date)}</span>
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
