import { Check, ChevronDown, CircleCheckBig, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MenuItem, Popover } from '@/components/ui/Popover'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { serviceStatusMeta } from '@/config/catalogs'
import { DomainError } from '@/domain/errors'
import type { OpenStatus, WorkScope } from '@/domain/workItems'
import { useActions } from '@/hooks/useActions'
import { cn } from '@/lib/cn'
import type { ServiceStatus, WorkflowStage } from '@/types/domain'

const OPEN: OpenStatus[] = ['not-started', 'in-progress', 'waiting', 'blocked']

interface WorkStatusControlProps {
  scope: WorkScope
  status: ServiceStatus
  stages: WorkflowStage[]
  /** "el servicio" / "el trámite" — used in confirmations. */
  noun: string
}

/** Status pill that changes status, completes (with confirmation) or reopens (with reason). */
export function WorkStatusControl({ scope, status, stages, noun }: WorkStatusControlProps) {
  const actions = useActions()
  const { notify } = useToast()
  const [confirm, setConfirm] = useState<'complete' | 'reopen' | null>(null)
  const [busy, setBusy] = useState(false)
  const open = stages.filter((s) => s.status !== 'done').length

  const change = async (next: OpenStatus) => {
    if (busy) return
    setBusy(true)
    try {
      await actions.setWorkStatus(scope, next)
      notify({ title: `Estado actualizado: ${serviceStatusMeta[next].label}` })
    } catch (e) {
      notify({ title: 'No se pudo cambiar el estado', description: e instanceof DomainError ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Popover
        label={`Estado de ${noun}`}
        role="menu"
        align="end"
        panelClassName="w-[240px]"
        trigger={({ toggle, open: isOpen, ...aria }) => (
          <button
            type="button"
            onClick={toggle}
            {...aria}
            aria-label={`Estado: ${serviceStatusMeta[status].label}. Cambiar estado`}
            className={cn(
              'group inline-flex items-center gap-[4px] rounded-full pr-[6px] transition-[background-color,transform] duration-200 ease-soft hover:bg-surface-muted active:scale-[0.97]',
              isOpen && 'bg-surface-muted',
            )}
          >
            <StatusBadge variant="soft" meta={serviceStatusMeta[status]} />
            <ChevronDown aria-hidden className={cn('size-[14px] text-muted transition-transform duration-300', isOpen && 'rotate-180')} strokeWidth={2} />
          </button>
        )}
      >
        {(close) =>
          status === 'completed' ? (
            <MenuItem
              onSelect={() => {
                close()
                setConfirm('reopen')
              }}
            >
              <RotateCcw aria-hidden className="size-[15px]" strokeWidth={2} />
              Reabrir {noun}
            </MenuItem>
          ) : (
            <>
              {OPEN.map((s) => (
                <MenuItem
                  key={s}
                  role="menuitemradio"
                  selected={s === status}
                  onSelect={() => {
                    close()
                    if (s !== status) void change(s)
                  }}
                >
                  <StatusBadge meta={serviceStatusMeta[s]} className="flex-1 text-[14px]" />
                  <Check aria-hidden className={cn('size-[15px]', s !== status && 'invisible')} strokeWidth={2.2} />
                </MenuItem>
              ))}
              <div className="my-[4px] h-px bg-line" />
              <MenuItem
                onSelect={() => {
                  close()
                  setConfirm('complete')
                }}
              >
                <CircleCheckBig aria-hidden className="size-[15px] text-success" strokeWidth={2} />
                Marcar como completado
              </MenuItem>
            </>
          )
        }
      </Popover>

      <ConfirmDialog
        open={confirm === 'complete'}
        onClose={() => setConfirm(null)}
        title={`Completar ${noun}`}
        confirmLabel="Marcar como completado"
        message={
          open > 0
            ? `Quedan ${open} ${open === 1 ? 'etapa abierta' : 'etapas abiertas'}. Se marcarán como completadas con fecha de hoy. Las tareas abiertas seguirán pendientes.`
            : `Todas las etapas están completas. ¿Confirmás que ${noun} está terminado?`
        }
        onConfirm={async () => {
          await actions.completeWork(scope, { closeOpenStages: true })
          notify({ title: `${capitalize(noun)} completado` })
        }}
      />
      <ConfirmDialog
        open={confirm === 'reopen'}
        onClose={() => setConfirm(null)}
        title={`Reabrir ${noun}`}
        confirmLabel="Reabrir"
        reasonLabel="Motivo de la reapertura"
        message="La última etapa volverá a estar en curso. El motivo queda registrado en la actividad del proyecto."
        onConfirm={async (reason) => {
          await actions.reopenWork(scope, reason)
          notify({ title: `${capitalize(noun)} reabierto` })
        }}
      />
    </>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
