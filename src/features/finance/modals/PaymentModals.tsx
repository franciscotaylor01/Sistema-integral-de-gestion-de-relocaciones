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
import type { SupplierAllocationInput, SupplierPaymentInput } from '@/domain/finance/supplierPayments'
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
function payable(ws: Workspace, supplierId: string, currency: CurrencyCode | '') {
  return ws.obligations
    .filter((o) => o.supplierId === supplierId && o.currency === currency && o.lifecycle === 'approved' && (ws.obligationFin.get(o.id)?.outstanding ?? 0) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

function SupplierAllocationEditor({
  ws,
  supplierId,
  currency,
  allocations,
  onChange,
  errors,
}: {
  ws: Workspace
  supplierId: string
  currency: CurrencyCode | ''
  allocations: SupplierAllocationInput[]
  onChange: (a: SupplierAllocationInput[]) => void
  errors: Record<string, string>
}) {
  const items = payable(ws, supplierId, currency)
  const get = (id: string) => allocations.find((a) => a.obligationId === id)
  const set = (obligationId: string, p: Partial<SupplierAllocationInput>) => {
    const current = get(obligationId) ?? { obligationId, amount: 0 }
    const next = { ...current, ...p }
    const rest = allocations.filter((a) => a.obligationId !== obligationId)
    onChange(next.amount > 0 || Number.isNaN(next.amount) ? [...rest, next] : rest)
  }
  if (!supplierId || !currency) return <p className="text-[13.5px] text-muted">Elegí proveedor y moneda para ver sus obligaciones aprobadas.</p>
  if (items.length === 0) return <p className="rounded-[14px] bg-surface-muted px-[14px] py-[11px] text-[13.5px] text-muted">Sin obligaciones aprobadas pendientes en {currency}. El pago quedará como anticipo explícito.</p>
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
                <span className="tabular block truncate text-[14px] font-medium">
                  {o.reference} <span className="font-normal text-muted">· {o.projectId ? ws.projectById.get(o.projectId)?.code : 'General'}</span>
                </span>
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

export function SupplierPaymentModal({ open, onClose, workspace, supplierId, obligationId }: { open: boolean; onClose: () => void; workspace: Workspace; supplierId?: string; obligationId?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Registrar pago a proveedor" description="Dinero efectivamente pagado. Las obligaciones siguen abiertas hasta cubrirse." size="lg">
      {open && <SupplierPaymentForm onClose={onClose} ws={workspace} supplierId={supplierId} obligationId={obligationId} />}
    </Modal>
  )
}

function SupplierPaymentForm({ onClose, ws, supplierId, obligationId }: { onClose: () => void; ws: Workspace; supplierId?: string; obligationId?: string }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [requestId] = useState(() => randomId('req'))
  const preset = obligationId ? ws.obligationById.get(obligationId) : undefined
  const presetOutstanding = preset ? ws.obligationFin.get(preset.id)!.outstanding : 0
  const [input, setInput] = useState<SupplierPaymentInput>(() => ({
    supplierId: preset?.supplierId ?? supplierId ?? '',
    date: DEMO_TODAY,
    currency: preset?.currency ?? (supplierId ? (ws.supplierById.get(supplierId)?.preferredCurrency ?? '') : ''),
    amount: presetOutstanding,
    method: 'transfer',
    reference: '',
    notes: '',
    allocations: preset && preset.lifecycle === 'approved' ? [{ obligationId: preset.id, amount: presetOutstanding }] : [],
  }))
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
  const free = supplierPaymentUnallocated(p)
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
        {p.status === 'reversed' && (
          <div className="col-span-2">
            <StatusBadge meta={{ label: `Revertido el ${formatDate(p.reversedAt ?? p.date)}`, tone: 'neutral' }} />
            <p className="mt-[4px] text-[13px] text-muted">{p.reversalReason}</p>
          </div>
        )}
      </dl>
      <ul className="flex flex-col gap-[6px]">
        {p.allocations.length === 0 && <li className="text-[13.5px] text-muted">Sin aplicar (anticipo).</li>}
        {p.allocations.map((a) => (
          <li key={a.id} className="rounded-[12px] bg-surface-muted px-[12px] py-[9px] text-[14px]">
            <span className="flex justify-between">
              <span className="tabular">{ws.obligationById.get(a.obligationId)?.reference}</span>
              <span className="tabular font-medium">{money(a.amount, p.currency)}</span>
            </span>
            {a.conditionOverride && <span className="mt-[2px] block text-[12.5px] text-warning">Pago anticipado: {a.conditionOverride}</span>}
          </li>
        ))}
      </ul>
      {free > 0 && (
        <div className="flex flex-col gap-[10px]">
          <p className="text-[13.5px]">
            Anticipo sin aplicar: <span className="tabular font-semibold">{money(free, p.currency)}</span>
          </p>
          <FormError message={formError} />
          {errors.allocations && <FormError message={errors.allocations} />}
          <SupplierAllocationEditor ws={ws} supplierId={p.supplierId} currency={p.currency} allocations={allocations} onChange={setAllocations} errors={errors} />
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
