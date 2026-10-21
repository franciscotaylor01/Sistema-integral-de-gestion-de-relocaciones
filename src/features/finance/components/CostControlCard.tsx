import { Lock, LockOpen } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/DataTable'
import { Field, FormError, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { projectCostControl, type CostControlRow } from '@/domain/finance/costControl'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import type { Project } from '@/types/domain'

/** Project cost control: each figure on its own (categories overlap and are never added together). */
export function CostControlCard({ ws, project, onOpenPayment }: { ws: Workspace; project: Project; onOpenPayment: (id: string) => void }) {
  const actions = useActions()
  const { notify } = useToast()
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const c = projectCostControl(ws.dataset, project.id, DEMO_TODAY)
  const m = (r: CostControlRow, v: number) => formatMoney(v, r.currency)
  return (
    <Card aria-labelledby="pf-costctl" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="pf-costctl"
        title="Control de costos"
        description="Costos, obligaciones, pagos y anticipos del proyecto. Las columnas se superponen (una obligación genera su costo; un anticipo aplicado es parte de un pago): no se suman entre sí."
        action={
          c.closed ? (
            <Button size="sm" variant="outline" onClick={() => setReopening(true)}>
              <LockOpen aria-hidden className="size-[15px]" strokeWidth={1.9} />
              Reabrir costos
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setClosing(true)}>
              <Lock aria-hidden className="size-[15px]" strokeWidth={1.9} />
              Cerrar costos
            </Button>
          )
        }
      />
      <div className="mt-[14px] flex flex-wrap items-center gap-[10px] text-[13.5px]">
        <StatusBadge variant="soft" meta={c.closed ? { label: 'Costos cerrados', tone: 'success' } : { label: 'Costos abiertos', tone: 'warning' }} />
        <span className="text-ink-secondary">
          {c.closed ? `Confirmado el ${formatDate(c.closure!.closedAt!)}${c.closure?.notes ? ` · ${c.closure.notes}` : ''}. No implica que las obligaciones estén pagadas.` : 'Pueden existir costos por registrar.'}
        </span>
      </div>
      <DataTable<CostControlRow>
        className="mt-[14px]"
        caption="Control de costos por moneda"
        rows={c.rows}
        getRowId={(r) => r.currency}
        minWidth={980}
        dense
        columns={[
          { id: 'cur', header: 'Moneda', width: '80px', cell: (r) => r.currency },
          { id: 'cost', header: 'Costos directos', className: 'tabular', cell: (r) => m(r, r.directCosts) },
          { id: 'obl', header: 'Obligaciones confirmadas', className: 'tabular', cell: (r) => m(r, r.obligations) },
          { id: 'cash', header: 'Egresos de caja', className: 'tabular', cell: (r) => m(r, r.cashOut) },
          { id: 'adv', header: 'Anticipos entregados', className: 'tabular', cell: (r) => m(r, r.advancesGiven) },
          { id: 'app', header: 'Anticipos aplicados', className: 'tabular', cell: (r) => m(r, r.advancesApplied) },
          { id: 'avail', header: 'Anticipos sin aplicar', className: 'tabular', cell: (r) => m(r, r.advancesAvailable) },
          { id: 'pend', header: 'Pendiente de pago', className: 'tabular font-semibold', cell: (r) => m(r, r.pending) },
        ]}
      />
      {(c.pendingBySupplier.length > 0 || c.unappliedAdvances.length > 0) && (
        <div className="mt-[12px] grid gap-[10px] sm:grid-cols-2">
          <div className="rounded-[14px] bg-surface-muted px-[12px] py-[10px] text-[13px]">
            <p className="font-medium">Saldos pendientes por proveedor</p>
            <ul className="mt-[4px] flex flex-col gap-[2px]">
              {c.pendingBySupplier.length === 0 && <li className="text-muted">Sin saldos pendientes.</li>}
              {c.pendingBySupplier.map((x) => (
                <li key={`${x.supplierId}-${x.currency}`} className="flex justify-between gap-2">
                  <span className="truncate">{ws.supplierById.get(x.supplierId)?.name}</span>
                  <span className="tabular font-medium">{formatMoney(x.pending, x.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[14px] bg-surface-muted px-[12px] py-[10px] text-[13px]">
            <p className="font-medium">Anticipos todavía sin aplicar</p>
            <ul className="mt-[4px] flex flex-col gap-[2px]">
              {c.unappliedAdvances.length === 0 && <li className="text-muted">Sin anticipos pendientes de aplicar.</li>}
              {c.unappliedAdvances.map((x) => (
                <li key={x.paymentId} className="flex justify-between gap-2">
                  <button type="button" onClick={() => onOpenPayment(x.paymentId)} className="truncate text-left underline-offset-2 hover:underline">
                    {ws.supplierById.get(x.supplierId)?.name} · {ws.supplierPayments.find((p) => p.id === x.paymentId)?.number}
                  </button>
                  <span className="tabular font-medium">{formatMoney(x.available, x.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {(c.closure?.history.length ?? 0) > 0 && (
        <ul className="mt-[12px] flex flex-col gap-[3px] text-[12.5px] text-muted">
          {c.closure!.history.map((h) => (
            <li key={h.id}>
              {formatDate(h.date.slice(0, 10))} · {h.action}
              {h.reason && ` — ${h.reason}`}
            </li>
          ))}
        </ul>
      )}
      <Modal open={closing} onClose={() => setClosing(false)} title="Cerrar costos del proyecto" description="Confirmás que todos los costos conocidos del proyecto están registrados. No significa que las obligaciones estén pagadas; podés reabrir con motivo." size="sm">
        {closing && <CloseForm projectId={project.id} onClose={() => setClosing(false)} />}
      </Modal>
      <ConfirmDialog
        open={reopening}
        onClose={() => setReopening(false)}
        title="Reabrir costos"
        confirmLabel="Reabrir"
        reasonLabel="Motivo de la reapertura"
        message="Queda registrado en el historial del cierre."
        onConfirm={async (reason) => {
          await actions.reopenProjectCosts(project.id, reason)
          notify({ title: 'Costos reabiertos' })
        }}
      />
    </Card>
  )
}

function CloseForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, formError } = useCommand()
  const [notes, setNotes] = useState('')
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => actions.closeProjectCosts(projectId, notes), { title: 'Costos cerrados' })) onClose()
      }}
    >
      <FormError message={formError} />
      <Field label="Observaciones">{(p) => <TextInput {...p} data-autofocus value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />}</Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Cerrar costos
        </Button>
      </div>
    </form>
  )
}
