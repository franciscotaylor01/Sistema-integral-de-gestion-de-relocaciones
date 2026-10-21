import { useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DateInput, Field, FormError, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { payableStatusMeta } from '@/config/catalogs'
import { costCategoryLabel, paymentConditionLabel, paymentMethodLabel } from '@/config/finance'
import { projectPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { randomId } from '@/domain/context'
import { supplierPaymentUnallocated } from '@/domain/finance/derive'
import { addMoney, subMoney } from '@/domain/finance/money'
import { advanceInfo, possibleDuplicatePayments, type SupplierAllocationInput, type SupplierPaymentInput } from '@/domain/finance/supplierPayments'
import { projectsOfPayment } from '@/domain/finance/supplierViews'
import { ProjectRef } from '../components/ProjectRef'
import { advanceStatusMeta } from '@/config/finance'
import { batchPaymentBreakdown, isOrdered, lineProgress } from '@/domain/finance/batchProgress'
import { batchFinancials } from '@/domain/finance/batches'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import type { CurrencyCode, PaymentCondition, PaymentMethod } from '@/types/domain'
import { Link } from 'react-router'

const money = (v: number, c: CurrencyCode) => formatCurrency(v, c, { decimals: 2 })

/** Approved, open obligations of a supplier in a currency (allocation targets). */
function payable(ws: Workspace, supplierId: string, currency: CurrencyCode | '', projectId?: string) {
  return ws.obligations
    .filter((o) => o.supplierId === supplierId && o.currency === currency && o.lifecycle === 'approved' && (ws.obligationFin.get(o.id)?.outstanding ?? 0) > 0 && (!projectId || o.projectId === projectId))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

function SupplierAllocationEditor({
  ws,
  supplierId,
  currency,
  allocations,
  onChange,
  errors,
  projectId,
  emptyNote,
}: {
  ws: Workspace
  supplierId: string
  currency: CurrencyCode | ''
  allocations: SupplierAllocationInput[]
  onChange: (a: SupplierAllocationInput[]) => void
  errors: Record<string, string>
  /** Only obligations of this project (advance applications). */
  projectId?: string
  emptyNote?: string
}) {
  const items = payable(ws, supplierId, currency, projectId)
  const get = (id: string) => allocations.find((a) => a.obligationId === id)
  const set = (obligationId: string, p: Partial<SupplierAllocationInput>) => {
    const current = get(obligationId) ?? { obligationId, amount: 0 }
    const next = { ...current, ...p }
    const rest = allocations.filter((a) => a.obligationId !== obligationId)
    onChange(next.amount > 0 || Number.isNaN(next.amount) ? [...rest, next] : rest)
  }
  if (!supplierId || !currency) return <p className="text-[13.5px] text-muted">Elegí proveedor y moneda para ver sus obligaciones aprobadas.</p>
  if (items.length === 0) return <p className="rounded-[14px] bg-surface-muted px-[14px] py-[11px] text-[13.5px] text-muted">Sin obligaciones aprobadas pendientes en {currency}. {emptyNote ?? 'El importe quedará como anticipo del proyecto que elijas.'}</p>
  return (
    <div className="flex flex-col gap-[8px] rounded-panel bg-surface-muted p-[8px]">
      {items.map((o) => {
        const f = ws.obligationFin.get(o.id)!
        const idx = allocations.findIndex((a) => a.obligationId === o.id)
        const a = get(o.id)
        return (
          <div key={o.id} className="rounded-[14px] bg-surface px-[12px] py-[10px]">
            <div className="grid items-center gap-[10px] sm:grid-cols-[minmax(0,1fr)_170px_auto]">
              <span className="min-w-0">
                <span className="tabular block truncate text-[14px] font-medium">{o.reference}</span>
                <ProjectRef ws={ws} projectId={o.projectId} serviceId={o.serviceId} compact />
                <span className={cn('block text-[12px]', f.overdue ? 'text-danger' : 'text-muted')}>
                  Saldo {money(f.outstanding, o.currency)} · vence {formatDate(o.dueDate)}
                  {!f.conditionMet && ` · ${f.conditionNote}`}
                </span>
              </span>
              <Field label={`Pagar ${o.reference}`} error={idx >= 0 ? errors[`allocations.${idx}.amount`] : undefined} className="[&>label]:sr-only">
                {(p) => <TextInput {...p} type="number" min={0} step="0.01" placeholder="0" value={a?.amount || ''} onChange={(e) => set(o.id, { amount: e.target.value === '' ? 0 : Number(e.target.value) })} />}
              </Field>
              <Button size="sm" variant="secondary" className="h-[46px] px-[10px] text-[12.5px]" onClick={() => set(o.id, { amount: f.outstanding })}>
                Saldo
              </Button>
            </div>
            {!f.conditionMet && a && a.amount > 0 && (
              <div className="mt-[10px]">
                <Field label="Motivo para pagar antes del cobro al cliente" required error={idx >= 0 ? errors[`allocations.${idx}.conditionOverride`] : undefined}>
                  {(p) => <TextInput {...p} value={a.conditionOverride ?? ''} onChange={(e) => set(o.id, { conditionOverride: e.target.value })} maxLength={200} />}
                </Field>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ───────────────────────── Record supplier payment ───────────────────────── */

/**
 * The single entry point to record money paid to a supplier — used by the
 * supplier page, the project's Finance tab and Finance → payments. "advance"
 * mode is the same operation without applying it yet (it must name a project).
 */
export function SupplierPaymentModal({ open, onClose, workspace, supplierId, obligationId, projectId, mode = 'payment', batchId }: { open: boolean; onClose: () => void; workspace: Workspace; supplierId?: string; obligationId?: string; projectId?: string; mode?: 'payment' | 'advance'; batchId?: string }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'advance' ? 'Registrar anticipo a proveedor' : 'Registrar pago a proveedor'}
      description={mode === 'advance' ? 'Dinero entregado por adelantado para un proyecto. No es un costo: se aplica después a obligaciones del mismo proveedor y proyecto.' : 'Dinero efectivamente pagado. Lo no aplicado a obligaciones queda como anticipo del proyecto.'}
      size="lg"
    >
      {open && <SupplierPaymentForm onClose={onClose} ws={workspace} supplierId={supplierId} obligationId={obligationId} projectId={projectId} mode={mode} batchId={batchId} />}
    </Modal>
  )
}

function SupplierPaymentForm({ onClose, ws, supplierId, obligationId, projectId, mode, batchId }: { onClose: () => void; ws: Workspace; supplierId?: string; obligationId?: string; projectId?: string; mode: 'payment' | 'advance'; batchId?: string }) {
  const batch = batchId ? ws.settlementBatches.find((b) => b.id === batchId) : undefined
  const progress = batch ? lineProgress(ws.dataset, batch) : undefined
  const proRata = batch && !isOrdered(batch)
  const batchOutstanding = batch ? batchFinancials(ws.dataset, batch).outstanding : 0
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [requestId] = useState(() => randomId('req'))
  const preset = obligationId ? ws.obligationById.get(obligationId) : undefined
  const presetOutstanding = preset ? ws.obligationFin.get(preset.id)!.outstanding : 0
  const [input, setInput] = useState<SupplierPaymentInput>(() => ({
    supplierId: batch?.supplierId ?? preset?.supplierId ?? supplierId ?? '',
    date: DEMO_TODAY,
    currency: batch?.currency ?? preset?.currency ?? (supplierId ? (ws.supplierById.get(supplierId)?.preferredCurrency ?? '') : ''),
    amount: proRata ? batchOutstanding : batch ? addMoney(...batch.lines.map((l) => progress!.get(l.id)!.remaining)) : presetOutstanding,
    batchId: proRata ? batch.id : undefined,
    batchAllocations: batch && !proRata ? batch.lines.filter((l) => progress!.get(l.id)!.remaining > 0).map((l) => ({ batchId: batch.id, lineId: l.id, amount: progress!.get(l.id)!.remaining })) : undefined,
    method: 'transfer',
    reference: '',
    notes: '',
    allocations: mode === 'payment' && preset && preset.lifecycle === 'approved' ? [{ obligationId: preset.id, amount: presetOutstanding }] : [],
    projectId: preset?.projectId ?? projectId,
    serviceId: preset?.serviceId,
  }))
  const blocked = preset && preset.lifecycle !== 'approved'
  const patch = (p: Partial<SupplierPaymentInput>) => setInput((i) => ({ ...i, ...p }))
  const allocated = addMoney(...input.allocations.map((a) => (Number.isFinite(a.amount) ? a.amount : 0)))
  const advance = subMoney(input.amount || 0, allocated)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.recordSupplierPayment(input, requestId), { title: 'Pago registrado' })
        if (ok) onClose()
      }}
      className="flex flex-col gap-[16px]"
    >
      <FormError message={formError} />
      {blocked && (
        <p role="alert" className="rounded-[14px] bg-warning-soft px-[14px] py-[11px] text-[13.5px] text-warning">
          La obligación {preset!.reference} todavía no está aprobada: aprobala antes de pagarla. Si es un pago por adelantado, registralo como anticipo del proyecto.
        </p>
      )}
      <div className="grid gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Proveedor" required error={errors.supplierId}>
          {(p) => (
            <SelectInput {...p} data-autofocus value={input.supplierId} onChange={(e) => patch({ supplierId: e.target.value, allocations: [], currency: ws.supplierById.get(e.target.value)?.preferredCurrency ?? input.currency })}>
              <option value="">Elegí un proveedor</option>
              {ws.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Moneda" required error={errors.currency}>
          {(p) => (
            <SelectInput {...p} value={input.currency} onChange={(e) => patch({ currency: e.target.value as CurrencyCode, allocations: [] })}>
              <option value="">Elegí</option>
              {CURRENCY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Fecha de pago" required error={errors.date}>
          {(p) => <DateInput {...p} value={input.date} max={DEMO_TODAY} onChange={(e) => patch({ date: e.target.value })} />}
        </Field>
        <Field label="Importe pagado" required error={errors.amount}>
          {(p) => <TextInput {...p} type="number" min={0} step="0.01" value={input.amount || ''} onChange={(e) => patch({ amount: Number(e.target.value) })} />}
        </Field>
        <Field label="Medio de pago">
          {(p) => (
            <SelectInput {...p} value={input.method} onChange={(e) => patch({ method: e.target.value as PaymentMethod })}>
              {(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {paymentMethodLabel[m]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Referencia" error={errors.reference}>
          {(p) => <TextInput {...p} value={input.reference ?? ''} onChange={(e) => patch({ reference: e.target.value })} maxLength={60} />}
        </Field>
      </div>
      {batch && proRata && <BatchBreakdown ws={ws} batchId={batch.id} cash={input.amount} error={errors.amount} />}
      {batch && !proRata && (
        <div className="rounded-panel bg-surface-muted p-[10px]">
          <p className="mb-[8px] text-[13.5px] font-medium text-ink-secondary">Imputación a la liquidación {batch.number} (por proyecto)</p>
          {errors.batchAllocations && <FormError message={errors.batchAllocations} />}
          <div className="flex flex-col gap-[6px]">
            {batch.lines.map((l) => {
              const rem = progress!.get(l.id)!.remaining
              const idx = (input.batchAllocations ?? []).findIndex((a) => a.lineId === l.id)
              const cur = idx >= 0 ? input.batchAllocations![idx].amount : 0
              const setLine = (v: number) => {
                const rest = (input.batchAllocations ?? []).filter((a) => a.lineId !== l.id)
                const next = v > 0 ? [...rest, { batchId: batch.id, lineId: l.id, amount: v }] : rest
                patch({ batchAllocations: next, amount: addMoney(...next.map((a) => a.amount)) })
              }
              return (
                <div key={l.id} className="grid items-center gap-[10px] rounded-[14px] bg-surface px-[12px] py-[9px] sm:grid-cols-[minmax(0,1fr)_160px]">
                  <span className="min-w-0">
                    <ProjectRef ws={ws} projectId={l.projectId} compact />
                    <span className="tabular block text-[12px] text-muted">Saldo de la línea {money(rem, batch.currency)}</span>
                    {idx >= 0 && errors[`batchAllocations.${idx}.amount`] && <span className="block text-[12px] font-medium text-danger">{errors[`batchAllocations.${idx}.amount`]}</span>}
                  </span>
                  <Field label={`Pagar línea ${l.projectId}`} className="[&>label]:sr-only">
                    {(p) => <TextInput {...p} type="number" min={0} step="0.01" disabled={rem <= 0} value={cur || ''} onChange={(e) => setLine(e.target.value === '' ? 0 : Number(e.target.value))} />}
                  </Field>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {!batch && (mode === 'advance' || advance > 0) && (
        <div className="grid gap-[14px] rounded-panel bg-surface-muted p-[12px] sm:grid-cols-2">
          <Field label="Proyecto del anticipo" required error={errors.projectId} hint="Todo anticipo corresponde a un proyecto específico.">
            {(p) => (
              <SelectInput {...p} value={input.projectId ?? ''} onChange={(e) => patch({ projectId: e.target.value || undefined, serviceId: undefined })}>
                <option value="">Elegí el proyecto</option>
                {ws.projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.code} · {ws.personById.get(pr.beneficiaryId)?.name} · {ws.clientById.get(pr.clientId)?.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Servicio relacionado (opcional)" error={errors.serviceId}>
            {(p) => (
              <SelectInput {...p} value={input.serviceId ?? ''} disabled={!input.projectId} onChange={(e) => patch({ serviceId: e.target.value || undefined })}>
                <option value="">Sin servicio</option>
                {ws.services
                  .filter((x) => x.projectId === input.projectId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {getServiceType(x.typeId).label}
                    </option>
                  ))}
              </SelectInput>
            )}
          </Field>
        </div>
      )}
      {mode === 'payment' && !batch && (
      <div>
        <div className="mb-[8px] flex flex-wrap items-end justify-between gap-2">
          <p className="text-[13.5px] font-medium text-ink-secondary">Aplicación a obligaciones</p>
          {input.currency && (
            <p className={cn('tabular text-[13px]', advance < 0 ? 'font-semibold text-danger' : 'text-muted')} aria-live="polite">
              Aplicado {money(allocated, input.currency)}
              {advance > 0 && ` · ${money(advance, input.currency)} quedará como anticipo`}
              {advance < 0 && ' · excede el importe pagado'}
            </p>
          )}
        </div>
        {errors.allocations && <FormError message={errors.allocations} />}
        <SupplierAllocationEditor ws={ws} supplierId={input.supplierId} currency={input.currency} allocations={input.allocations} onChange={(a) => patch({ allocations: a })} errors={errors} />
      </div>
      )}
      <Field label="Notas">{(p) => <TextArea {...p} value={input.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} maxLength={1000} className="min-h-[64px]" />}</Field>
      <div className="sticky bottom-0 -mx-[22px] -mb-[20px] flex justify-end gap-[10px] border-t border-line bg-surface px-[22px] py-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Registrando…' : 'Registrar pago'}
        </Button>
      </div>
    </form>
  )
}

/* ───────────────────────── Supplier payment detail ───────────────────────── */

export function SupplierPaymentDetailModal({ paymentId, onClose, workspace: ws }: { paymentId?: string; onClose: () => void; workspace: Workspace }) {
  const p = paymentId ? ws.supplierPayments.find((x) => x.id === paymentId) : undefined
  return (
    <Modal open={Boolean(p)} onClose={onClose} title={p ? `Pago ${p.number}` : 'Pago'} size="md">
      {p && <PaymentDetail key={p.id} paymentId={p.id} ws={ws} onClose={onClose} />}
    </Modal>
  )
}

function PaymentDetail({ paymentId, ws, onClose }: { paymentId: string; ws: Workspace; onClose: () => void }) {
  const p = ws.supplierPayments.find((x) => x.id === paymentId)!
  const actions = useActions()
  const { notify } = useToast()
  const { run, busy, errors, formError } = useCommand()
  const [reversing, setReversing] = useState(false)
  const [allocations, setAllocations] = useState<SupplierAllocationInput[]>([])
  const [reverting, setReverting] = useState<string>()
  const free = supplierPaymentUnallocated(p)
  const adv = advanceInfo(p)
  const dupes = possibleDuplicatePayments(ws.dataset)
  return (
    <div className="flex flex-col gap-[16px]">
      <dl className="grid grid-cols-2 gap-[12px] rounded-panel bg-surface-muted px-[14px] py-[12px] text-[14px]">
        <div>
          <dt className="text-[12.5px] text-muted">Proveedor</dt>
          <dd className="font-medium">{ws.supplierById.get(p.supplierId)?.name}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Fecha</dt>
          <dd className="tabular font-medium">{formatDate(p.date)}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Importe</dt>
          <dd className="tabular font-medium">{money(p.amount, p.currency)}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Medio · referencia</dt>
          <dd className="truncate font-medium">
            {paymentMethodLabel[p.method]}
            {p.reference && ` · ${p.reference}`}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[12.5px] text-muted">Proyecto(s)</dt>
          <dd className="flex flex-col gap-[4px]">
            {projectsOfPayment(ws.dataset, p).length === 0 ? <span className="text-[13px] text-warning">Anticipo histórico sin proyecto: requiere revisión</span> : projectsOfPayment(ws.dataset, p).map((id) => <ProjectRef key={id} ws={ws} projectId={id} serviceId={id === p.projectId ? p.serviceId : undefined} />)}
          </dd>
        </div>
        {dupes.has(p.id) && (
          <div className="col-span-2">
            <StatusBadge meta={{ label: 'Posible duplicado: revisar', tone: 'warning' }} />
            <p className="mt-[4px] text-[12.5px] text-muted">Hay otro pago del mismo proveedor, fecha, moneda, importe y referencia. No se elimina automáticamente.</p>
          </div>
        )}
        {p.status === 'reversed' && (
          <div className="col-span-2">
            <StatusBadge meta={{ label: `Revertido el ${formatDate(p.reversedAt ?? p.date)}`, tone: 'neutral' }} />
            <p className="mt-[4px] text-[13px] text-muted">{p.reversalReason}</p>
          </div>
        )}
      </dl>
      <ul className="flex flex-col gap-[6px]">
        {p.allocations.length === 0 && <li className="text-[13.5px] text-muted">Sin aplicar (anticipo).</li>}
        {p.allocations.map((a) => {
          const o = ws.obligationById.get(a.obligationId)
          return (
            <li key={a.id} className={cn('rounded-[12px] bg-surface-muted px-[12px] py-[9px] text-[14px]', a.reversedAt && 'opacity-60')}>
              <span className="flex justify-between gap-2">
                <span className="min-w-0">
                  <span className={cn('tabular block', a.reversedAt && 'line-through')}>
                    {o?.reference} <span className="text-[12.5px] text-muted">· {a.source === 'advance' ? `anticipo aplicado ${a.date ? formatDate(a.date) : ''}` : 'aplicado al pagar'}</span>
                  </span>
                  <ProjectRef ws={ws} projectId={o?.projectId} serviceId={o?.serviceId} compact />
                </span>
                <span className="flex shrink-0 flex-col items-end gap-[2px]">
                  <span className="tabular font-medium">{money(a.amount, p.currency)}</span>
                  {a.source === 'advance' && !a.reversedAt && p.status === 'recorded' && (
                    <button type="button" onClick={() => setReverting(a.id)} className="text-[12px] font-medium text-ink-secondary underline-offset-2 hover:underline">
                      Corregir
                    </button>
                  )}
                </span>
              </span>
              {a.conditionOverride && <span className="mt-[2px] block text-[12.5px] text-warning">Pago anticipado: {a.conditionOverride}</span>}
              {a.reversedAt && <span className="mt-[2px] block text-[12.5px] text-muted">Corregida el {formatDate(a.reversedAt)}: {a.reversalReason}</span>}
            </li>
          )
        })}
      </ul>
      {adv && (
        <div className="grid grid-cols-3 gap-[8px] rounded-panel bg-surface-muted px-[14px] py-[10px] text-[13.5px]">
          <span>
            <span className="block text-[12px] text-muted">Anticipo entregado</span>
            <span className="tabular font-semibold">{money(adv.given, p.currency)}</span>
          </span>
          <span>
            <span className="block text-[12px] text-muted">Aplicado</span>
            <span className="tabular font-semibold">{money(adv.applied, p.currency)}</span>
          </span>
          <span>
            <span className="block text-[12px] text-muted">Sin aplicar</span>
            <span className="tabular font-semibold">{money(adv.available, p.currency)}</span>
          </span>
          <span className="col-span-3">
            <StatusBadge meta={advanceStatusMeta[adv.status]} />
          </span>
        </div>
      )}
      {free > 0 && p.status === 'recorded' && !p.projectId && <AssignProject ws={ws} paymentId={p.id} />}
      {free > 0 && p.status === 'recorded' && p.projectId && (
        <div className="flex flex-col gap-[10px]">
          <p className="text-[13.5px]">Aplicar el anticipo a obligaciones del mismo proveedor, proyecto y moneda (no genera otro egreso de caja):</p>
          <FormError message={formError} />
          {errors.allocations && <FormError message={errors.allocations} />}
          <SupplierAllocationEditor ws={ws} supplierId={p.supplierId} currency={p.currency} allocations={allocations} onChange={setAllocations} errors={errors} projectId={p.projectId} emptyNote="Todavía no hay obligaciones aprobadas de este proveedor y proyecto en esta moneda: el anticipo sigue disponible." />
          <div>
            <Button
              size="sm"
              disabled={busy || allocations.length === 0}
              onClick={async () => {
                const ok = await run(() => actions.applySupplierAdvance(p.id, allocations), { title: 'Anticipo aplicado' })
                if (ok) setAllocations([])
              }}
            >
              Aplicar anticipo
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-[10px] border-t border-line pt-[14px]">
        {p.status === 'recorded' && (
          <Button variant="outline" size="sm" onClick={() => setReversing(true)}>
            Revertir pago
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      <ConfirmDialog
        open={reversing}
        onClose={() => setReversing(false)}
        title="Revertir pago"
        tone="danger"
        confirmLabel="Revertir"
        reasonLabel="Motivo de la reversión"
        message="El pago se conserva como revertido en el historial; las obligaciones vuelven a tener saldo."
        onConfirm={async (reason) => {
          await actions.reverseSupplierPayment(p.id, reason)
          notify({ title: 'Pago revertido' })
        }}
      />
      <ConfirmDialog
        open={Boolean(reverting)}
        onClose={() => setReverting(undefined)}
        title="Corregir aplicación de anticipo"
        confirmLabel="Corregir"
        reasonLabel="Motivo"
        message="La aplicación queda en el historial como corregida y el importe vuelve a estar disponible en el anticipo."
        onConfirm={async (reason) => {
          await actions.revertAdvanceApplication(p.id, reverting!, reason)
          notify({ title: 'Aplicación corregida' })
        }}
      />
      {(p.history?.length ?? 0) > 0 && (
        <div>
          <p className="text-[13.5px] font-medium text-ink-secondary">Historial</p>
          <ul className="mt-[6px] flex flex-col gap-[4px] text-[13px]">
            {p.history!.map((h) => (
              <li key={h.id} className="flex justify-between gap-2 rounded-[10px] bg-surface-muted px-[10px] py-[6px]">
                <span>
                  <span className="font-medium">{h.action}</span>
                  {h.detail && <span className="text-muted"> · {h.detail}</span>}
                </span>
                <span className="tabular shrink-0 text-muted">{formatDate(h.date.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Obligation detail ───────────────────────── */

export function ObligationDetailModal({ obligationId, onClose, workspace: ws, onPay }: { obligationId?: string; onClose: () => void; workspace: Workspace; onPay: (obligationId: string) => void }) {
  const o = obligationId ? ws.obligationById.get(obligationId) : undefined
  return (
    <Modal open={Boolean(o)} onClose={onClose} title={o ? `Obligación ${o.reference}` : 'Obligación'} size="md">
      {o && <ObligationDetail key={o.id} obligationId={o.id} ws={ws} onClose={onClose} onPay={onPay} />}
    </Modal>
  )
}

function ObligationDetail({ obligationId, ws, onClose, onPay }: { obligationId: string; ws: Workspace; onClose: () => void; onPay: (id: string) => void }) {
  const o = ws.obligationById.get(obligationId)!
  const f = ws.obligationFin.get(o.id)!
  const actions = useActions()
  const { notify } = useToast()
  const { run, busy, errors, formError } = useCommand()
  const [cancelling, setCancelling] = useState(false)
  const [editing, setEditing] = useState(false)
  const [dueDate, setDueDate] = useState(o.dueDate)
  const [condition, setCondition] = useState<PaymentCondition>(o.paymentCondition)
  const [clientInvoiceId, setClientInvoiceId] = useState(o.clientInvoiceId ?? '')
  const payments = ws.supplierPayments.filter((p) => p.allocations.some((a) => a.obligationId === o.id))
  const cost = ws.costs.find((c) => c.id === o.costId)
  const service = o.serviceId ? ws.serviceById.get(o.serviceId) : undefined

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-center gap-[10px]">
        <StatusBadge variant="soft" meta={payableStatusMeta[f.status]} />
        {f.conditionNote && <span className="text-[13px] text-muted">{f.conditionNote}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-[12px] rounded-panel bg-surface-muted px-[14px] py-[12px] text-[14px]">
        <div>
          <dt className="text-[12.5px] text-muted">Proveedor</dt>
          <dd className="font-medium">{ws.supplierById.get(o.supplierId)?.name}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Proyecto · servicio</dt>
          <dd className="truncate font-medium">
            {o.projectId ? (
              <Link to={`${projectPath(o.projectId)}?tab=finanzas`} onClick={onClose} className="hover:underline">
                {ws.projectById.get(o.projectId)?.code}
              </Link>
            ) : (
              'Gasto general'
            )}
            {service && ` · ${getServiceType(service.typeId).label}`}
          </dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Importe · pagado</dt>
          <dd className="tabular font-medium">
            {money(o.amount, o.currency)} · {money(f.paid, o.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Saldo</dt>
          <dd className="tabular font-semibold">{money(f.outstanding, o.currency)}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Emisión · vencimiento</dt>
          <dd className="tabular font-medium">
            {formatDate(o.issueDate)} · {formatDate(o.dueDate)}
          </dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Condición de pago</dt>
          <dd className="font-medium">{paymentConditionLabel[o.paymentCondition]}</dd>
        </div>
        {cost && (
          <div className="col-span-2">
            <dt className="text-[12.5px] text-muted">Costo incurrido asociado</dt>
            <dd className="font-medium">
              {costCategoryLabel[cost.category]} · {cost.status === 'void' ? 'anulado' : 'incurrido'}
            </dd>
          </div>
        )}
      </dl>
      {payments.length > 0 && (
        <div>
          <p className="text-[13.5px] font-medium text-ink-secondary">Historial de pagos</p>
          <ul className="mt-[8px] flex flex-col gap-[6px]">
            {payments.map((p) => (
              <li key={p.id} className={cn('flex justify-between rounded-[12px] bg-surface-muted px-[12px] py-[9px] text-[14px]', p.status === 'reversed' && 'text-muted line-through')}>
                <span className="tabular">
                  {p.number} · {formatDate(p.date)}
                </span>
                <span className="tabular font-medium">{money(addMoney(...p.allocations.filter((a) => a.obligationId === o.id).map((a) => a.amount)), p.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {editing && (
        <form
          className="flex flex-col gap-[12px] rounded-panel bg-surface-muted p-[12px]"
          onSubmit={async (e) => {
            e.preventDefault()
            const ok = await run(() => actions.updateObligationTerms(o.id, { dueDate, paymentCondition: condition, clientInvoiceId: clientInvoiceId || undefined }), { title: 'Condiciones actualizadas' })
            if (ok) setEditing(false)
          }}
        >
          <FormError message={formError} />
          <div className="grid gap-[12px] sm:grid-cols-2">
            <Field label="Vencimiento" error={errors.dueDate}>
              {(p) => <DateInput {...p} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
            </Field>
            <Field label="Condición">
              {(p) => (
                <SelectInput {...p} value={condition} onChange={(e) => setCondition(e.target.value as PaymentCondition)}>
                  {(Object.keys(paymentConditionLabel) as PaymentCondition[]).map((c) => (
                    <option key={c} value={c}>
                      {paymentConditionLabel[c]}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            {condition === 'after-client-collection' && (
              <Field label="Factura del cliente" error={errors.clientInvoiceId} className="sm:col-span-2">
                {(p) => (
                  <SelectInput {...p} value={clientInvoiceId} onChange={(e) => setClientInvoiceId(e.target.value)}>
                    <option value="">Elegí la factura</option>
                    {ws.invoices
                      .filter((i) => i.lifecycle !== 'cancelled' && (!o.projectId || i.projectId === o.projectId))
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.number}
                        </option>
                      ))}
                  </SelectInput>
                )}
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-[8px]">
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button size="sm" type="submit" disabled={busy}>
              Guardar condiciones
            </Button>
          </div>
        </form>
      )}
      <div className="flex flex-wrap justify-end gap-[10px] border-t border-line pt-[14px]">
        {o.lifecycle !== 'cancelled' && f.paid === 0 && (
          <Button variant="outline" size="sm" onClick={() => setCancelling(true)}>
            Anular
          </Button>
        )}
        {o.lifecycle !== 'cancelled' && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar condiciones
          </Button>
        )}
        {o.lifecycle === 'pending-approval' && (
          <Button size="sm" disabled={busy} onClick={() => run(() => actions.approveObligation(o.id), { title: 'Obligación aprobada' })}>
            Aprobar
          </Button>
        )}
        {o.lifecycle === 'approved' && f.outstanding > 0 && (
          <Button
            size="sm"
            onClick={() => {
              onClose()
              onPay(o.id)
            }}
          >
            Registrar pago
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Anular obligación"
        tone="danger"
        confirmLabel="Anular"
        reasonLabel="Motivo"
        message="La obligación y su costo incurrido quedan anulados (se conservan en el historial)."
        onConfirm={async (reason) => {
          await actions.cancelObligation(o.id, reason)
          notify({ title: 'Obligación anulada' })
        }}
      />
    </div>
  )
}


/** Historical advances without project: assign one explicitly before applying. */
function AssignProject({ ws, paymentId }: { ws: Workspace; paymentId: string }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [projectId, setProjectId] = useState('')
  const [reason, setReason] = useState('')
  return (
    <div className="flex flex-col gap-[10px] rounded-panel bg-warning-soft p-[12px]">
      <p className="text-[13.5px] text-warning">Anticipo histórico sin proyecto. Asignale el proyecto al que corresponde para poder aplicarlo (no se infiere automáticamente).</p>
      <FormError message={formError} />
      <div className="grid gap-[10px] sm:grid-cols-2">
        <Field label="Proyecto" required error={errors.projectId}>
          {(p) => (
            <SelectInput {...p} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Elegí el proyecto</option>
              {ws.projects.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.code} · {ws.personById.get(pr.beneficiaryId)?.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Motivo" required error={errors.reason}>
          {(p) => <TextInput {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}
        </Field>
      </div>
      <Button size="sm" className="self-start" disabled={busy} onClick={() => run(() => actions.assignAdvanceProject(paymentId, projectId, undefined, reason), { title: 'Proyecto asignado' })}>
        Asignar proyecto
      </Button>
    </div>
  )
}

/** Read-only pro-rata split of a grouped-settlement payment: no arbitrary imputation. */
function BatchBreakdown({ ws, batchId, cash, error }: { ws: Workspace; batchId: string; cash: number; error?: string }) {
  const batch = ws.settlementBatches.find((b) => b.id === batchId)!
  const f = batchFinancials(ws.dataset, batch)
  const valid = Number.isFinite(cash) && cash > 0 && cash <= f.outstanding
  const br = valid ? batchPaymentBreakdown(ws.dataset, batch, cash) : undefined
  return (
    <div className="rounded-panel bg-surface-muted p-[10px] text-[13.5px]">
      <p className="font-medium text-ink-secondary">
        Liquidación {batch.number} · saldo {money(f.outstanding, batch.currency)}
      </p>
      <p className="mt-[2px] text-[12.5px] text-muted">El pago se distribuye en proporción a los saldos de cada participación, deducción y ajuste. Pagar el saldo completo los cierra exactamente.</p>
      {error && <FormError message={error} />}
      {br && (
        <ul className="mt-[8px] flex flex-col gap-[4px]">
          {br.lines.map((l) => {
            const line = batch.lines.find((x) => x.id === l.lineId)!
            return (
              <li key={l.lineId} className="flex justify-between gap-2 rounded-[10px] bg-surface px-[10px] py-[6px]">
                <span className="min-w-0">
                  Participación <ProjectRef ws={ws} projectId={line.projectId} compact className="inline-block align-top" />
                </span>
                <span className="tabular font-medium">
                  {money(l.amount, batch.currency)}
                  {line.currency !== batch.currency && <span className="block text-right text-[12px] font-normal text-muted">= {money(l.originalAmount, line.currency)}</span>}
                </span>
              </li>
            )
          })}
          {br.deductions.map((d) => (
            <li key={d.deductionId} className="flex justify-between gap-2 rounded-[10px] bg-surface px-[10px] py-[6px]">
              <span>Deducción · {ws.costs.find((c) => c.id === batch.deductions.find((x) => x.id === d.deductionId)?.costId)?.description}</span>
              <span className="tabular font-medium text-ink-secondary">−{money(d.amount, batch.currency)}</span>
            </li>
          ))}
          {br.adjustment !== 0 && (
            <li className="flex justify-between gap-2 rounded-[10px] bg-surface px-[10px] py-[6px]">
              <span>Ajustes</span>
              <span className="tabular font-medium">{money(br.adjustment, batch.currency)}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
