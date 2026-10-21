import { useMemo, useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DateInput, Field, FormError, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { collectionActionLabel, paymentMethodLabel, withholdingTypeLabel } from '@/config/finance'
import { randomId } from '@/domain/context'
import { receiptUnallocated } from '@/domain/finance/derive'
import { addMoney, subMoney } from '@/domain/finance/money'
import type { AllocationInput, ReceiptInput, WithholdingInput } from '@/domain/finance/receipts'
import { AttachmentsPanel } from '../attachments/AttachmentsPanel'
import { WithholdingsEditor } from './WithholdingsEditor'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import type { CollectionActionKind, CurrencyCode, PaymentMethod } from '@/types/domain'

const money = (v: number, c: CurrencyCode) => formatCurrency(v, c, { decimals: 2 })

/** Open (issued, unpaid) invoices of a client in one currency, oldest due first. */
function openInvoices(ws: Workspace, clientId: string, currency: CurrencyCode | '') {
  return ws.invoices
    .filter((i) => i.clientId === clientId && i.currency === currency && i.lifecycle === 'issued' && (ws.invoiceFin.get(i.id)?.outstanding ?? 0) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

/** Per-invoice allocation inputs with "pay the balance" shortcuts. */
function AllocationEditor({
  ws,
  clientId,
  currency,
  allocations,
  onChange,
  errors,
}: {
  ws: Workspace
  clientId: string
  currency: CurrencyCode | ''
  allocations: AllocationInput[]
  onChange: (a: AllocationInput[]) => void
  errors: Record<string, string>
}) {
  const invoices = openInvoices(ws, clientId, currency)
  const amountFor = (id: string) => allocations.find((a) => a.invoiceId === id)?.amount ?? 0
  const set = (invoiceId: string, amount: number) => {
    const rest = allocations.filter((a) => a.invoiceId !== invoiceId)
    onChange(amount > 0 || Number.isNaN(amount) ? [...rest, { invoiceId, amount }] : rest)
  }
  if (!clientId || !currency) return <p className="text-[13.5px] text-muted">Elegí cliente y moneda para ver sus facturas abiertas.</p>
  if (invoices.length === 0) return <p className="rounded-[14px] bg-surface-muted px-[14px] py-[11px] text-[13.5px] text-muted">El cliente no tiene facturas abiertas en {currency}. El cobro quedará como saldo a favor.</p>
  return (
    <div className="flex flex-col gap-[8px] rounded-panel bg-surface-muted p-[8px]">
      {invoices.map((inv) => {
        const f = ws.invoiceFin.get(inv.id)!
        const idx = allocations.findIndex((a) => a.invoiceId === inv.id)
        return (
          <div key={inv.id} className="grid items-center gap-[10px] rounded-[14px] bg-surface px-[12px] py-[10px] sm:grid-cols-[minmax(0,1fr)_170px_auto]">
            <span className="min-w-0">
              <span className="tabular block truncate text-[14px] font-medium">{inv.number}</span>
              <span className={cn('block text-[12px]', f.overdue ? 'text-danger' : 'text-muted')}>
                {ws.projectById.get(inv.projectId)?.code} · saldo {money(f.outstanding, inv.currency)}
                {f.overdue && ` · ${f.daysOverdue} días de atraso`}
              </span>
            </span>
            <Field label={`Aplicar a ${inv.number}`} error={idx >= 0 ? errors[`allocations.${idx}.amount`] : undefined} className="[&>label]:sr-only">
              {(p) => <TextInput {...p} type="number" min={0} step="0.01" placeholder="0" value={amountFor(inv.id) || ''} onChange={(e) => set(inv.id, e.target.value === '' ? 0 : Number(e.target.value))} />}
            </Field>
            <Button size="sm" variant="secondary" className="h-[46px] px-[10px] text-[12.5px]" onClick={() => set(inv.id, f.outstanding)}>
              Saldo
            </Button>
          </div>
        )
      })}
    </div>
  )
}

/* ───────────────────────── Record receipt ───────────────────────── */

interface RecordProps {
  open: boolean
  onClose: () => void
  workspace: Workspace
  clientId?: string
  invoiceId?: string
}

export function RecordReceiptModal(props: RecordProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Registrar cobro" description="Dinero efectivamente recibido del cliente. Emitir una factura no es cobrarla." size="lg">
      {props.open && <RecordReceiptForm {...props} />}
    </Modal>
  )
}

function RecordReceiptForm({ onClose, workspace: ws, clientId: presetClient, invoiceId }: RecordProps) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [requestId] = useState(() => randomId('req'))
  const preset = invoiceId ? ws.invoiceById.get(invoiceId) : undefined
  const [input, setInput] = useState<ReceiptInput>(() => ({
    clientId: preset?.clientId ?? presetClient ?? '',
    date: DEMO_TODAY,
    currency: preset?.currency ?? '',
    amount: preset ? ws.invoiceFin.get(preset.id)!.outstanding : 0,
    method: 'wire',
    reference: '',
    notes: '',
    allocations: preset ? [{ invoiceId: preset.id, amount: ws.invoiceFin.get(preset.id)!.outstanding }] : [],
    withholdings: [],
  }))
  const patch = (p: Partial<ReceiptInput>) => setInput((i) => ({ ...i, ...p }))
  const allocated = addMoney(...input.allocations.map((a) => (Number.isFinite(a.amount) ? a.amount : 0)))
  const credit = subMoney(input.amount || 0, allocated)
  const rates = ws.exchangeRates.filter((r) => !r.supersededById && (r.base === input.currency || r.quote === input.currency))

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.recordReceipt(input, requestId), { title: 'Cobro registrado', description: input.currency ? money(input.amount, input.currency) : undefined })
        if (ok) onClose()
      }}
      className="flex flex-col gap-[16px]"
    >
      <FormError message={formError} />
      <div className="grid gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Cliente" required error={errors.clientId}>
          {(p) => (
            <SelectInput {...p} data-autofocus value={input.clientId} onChange={(e) => patch({ clientId: e.target.value, allocations: [] })}>
              <option value="">Elegí un cliente</option>
              {ws.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
        <Field label="Fecha de cobro" required error={errors.date}>
          {(p) => <DateInput {...p} value={input.date} max={DEMO_TODAY} onChange={(e) => patch({ date: e.target.value })} />}
        </Field>
        <Field label="Importe recibido" required error={errors.amount}>
          {(p) => <TextInput {...p} type="number" min={0} step="0.01" inputMode="decimal" value={input.amount || ''} onChange={(e) => patch({ amount: Number(e.target.value) })} />}
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
        <Field label="Referencia" error={errors.reference} hint="N.º de transferencia o comprobante.">
          {(p) => <TextInput {...p} value={input.reference ?? ''} onChange={(e) => patch({ reference: e.target.value })} maxLength={60} />}
        </Field>
        {rates.length > 0 && (
          <Field label="Tipo de cambio de referencia" hint="Solo informativo: no se convierte ningún importe." className="sm:col-span-2 xl:col-span-3">
            {(p) => (
              <SelectInput {...p} value={input.exchangeRateId ?? ''} onChange={(e) => patch({ exchangeRateId: e.target.value || undefined })}>
                <option value="">Sin tipo de cambio asociado</option>
                {rates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.base}/{r.quote} {r.rate} · {formatDate(r.effectiveDate)} · {r.source}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}
      </div>
      <div>
        <div className="mb-[8px] flex flex-wrap items-end justify-between gap-2">
          <p className="text-[13.5px] font-medium text-ink-secondary">Aplicación a facturas</p>
          {input.currency && (
            <p className={cn('tabular text-[13px]', credit < 0 ? 'font-semibold text-danger' : 'text-muted')} aria-live="polite">
              Aplicado {money(allocated, input.currency)}
              {credit > 0 && ` · ${money(credit, input.currency)} quedará como saldo a favor`}
              {credit < 0 && ' · excede el importe recibido'}
            </p>
          )}
        </div>
        {errors.allocations && <FormError message={errors.allocations} />}
        <AllocationEditor ws={ws} clientId={input.clientId} currency={input.currency} allocations={input.allocations} onChange={(a) => patch({ allocations: a })} errors={errors} />
      </div>
      <div className="rounded-panel bg-surface-muted p-[10px]">
        <p className="text-[13.5px] font-medium text-ink-secondary">Retenciones documentadas</p>
        <p className="mb-[8px] text-[12.5px] text-muted">Cargá los importes tal como figuran en el detalle recibido. No son dinero depositado ni gastos. Si falta información, dejá la diferencia pendiente de conciliar.</p>
        {errors.withholdings && <FormError message={errors.withholdings} />}
        <WithholdingsEditor ws={ws} clientId={input.clientId} currency={input.currency} items={input.withholdings ?? []} onChange={(w) => patch({ withholdings: w })} errors={errors} />
      </div>
      <Field label="Notas">{(p) => <TextArea {...p} value={input.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} maxLength={1000} className="min-h-[64px]" />}</Field>
      <div className="sticky bottom-0 -mx-[22px] -mb-[20px] flex justify-end gap-[10px] border-t border-line bg-surface px-[22px] py-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Registrando…' : 'Registrar cobro'}
        </Button>
      </div>
    </form>
  )
}

/* ───────────────────────── Receipt detail ───────────────────────── */

export function ReceiptDetailModal({ receiptId, onClose, workspace: ws }: { receiptId?: string; onClose: () => void; workspace: Workspace }) {
  const r = receiptId ? ws.receipts.find((x) => x.id === receiptId) : undefined
  return (
    <Modal open={Boolean(r)} onClose={onClose} title={r ? `Cobro ${r.number}` : 'Cobro'} size="md">
      {r && <ReceiptDetail key={r.id} receiptId={r.id} ws={ws} onClose={onClose} />}
    </Modal>
  )
}

function ReceiptDetail({ receiptId, ws, onClose }: { receiptId: string; ws: Workspace; onClose: () => void }) {
  const r = ws.receipts.find((x) => x.id === receiptId)!
  const actions = useActions()
  const { notify } = useToast()
  const { run, busy, errors, formError } = useCommand()
  const [reversing, setReversing] = useState(false)
  const [allocations, setAllocations] = useState<AllocationInput[]>([])
  const [newWithholdings, setNewWithholdings] = useState<WithholdingInput[]>([])
  const free = receiptUnallocated(r)
  const rate = r.fx?.exchangeRateId ? ws.exchangeRates.find((x) => x.id === r.fx!.exchangeRateId) : undefined

  return (
    <div className="flex flex-col gap-[16px]">
      <dl className="grid grid-cols-2 gap-[12px] rounded-panel bg-surface-muted px-[14px] py-[12px] text-[14px]">
        <div>
          <dt className="text-[12.5px] text-muted">Cliente</dt>
          <dd className="font-medium">{ws.clientById.get(r.clientId)?.name}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Fecha</dt>
          <dd className="tabular font-medium">{formatDate(r.date)}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Importe</dt>
          <dd className="tabular font-medium">{money(r.amount, r.currency)}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-muted">Medio · referencia</dt>
          <dd className="truncate font-medium">
            {paymentMethodLabel[r.method]}
            {r.reference && ` · ${r.reference}`}
          </dd>
        </div>
        {rate && (
          <div className="col-span-2">
            <dt className="text-[12.5px] text-muted">Tipo de cambio de referencia</dt>
            <dd className="tabular font-medium">
              {rate.base}/{rate.quote} {rate.rate} ({formatDate(rate.effectiveDate)}, {rate.source})
            </dd>
          </div>
        )}
        {r.status === 'reversed' && (
          <div className="col-span-2">
            <StatusBadge meta={{ label: `Revertido el ${formatDate(r.reversedAt ?? r.date)}`, tone: 'neutral' }} />
            <p className="mt-[4px] text-[13px] text-muted">{r.reversalReason}</p>
          </div>
        )}
      </dl>
      <div>
        <p className="text-[13.5px] font-medium text-ink-secondary">Aplicaciones</p>
        <ul className="mt-[8px] flex flex-col gap-[6px]">
          {r.allocations.length === 0 && <li className="text-[13.5px] text-muted">Sin aplicar.</li>}
          {r.allocations.map((a) => (
            <li key={a.id} className="flex justify-between rounded-[12px] bg-surface-muted px-[12px] py-[9px] text-[14px]">
              <span className="tabular">{ws.invoiceById.get(a.invoiceId)?.number}</span>
              <span className="tabular font-medium">
                {money(a.amount, r.currency)} <span className="font-normal text-muted">· {formatDate(a.date)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[13.5px] font-medium text-ink-secondary">Retenciones documentadas</p>
        <ul className="mt-[8px] flex flex-col gap-[6px]">
          {(r.withholdings ?? []).length === 0 && <li className="text-[13.5px] text-muted">Sin retenciones cargadas.</li>}
          {(r.withholdings ?? []).map((w) => (
            <li key={w.id} className="rounded-[12px] bg-surface-muted px-[12px] py-[9px] text-[14px]">
              <span className="flex justify-between gap-2">
                <span>
                  <span className="font-medium">{withholdingTypeLabel[w.type]}</span>
                  <span className="text-muted">
                    {' · '}
                    {ws.invoiceById.get(w.invoiceId)?.externalRef ?? ws.invoiceById.get(w.invoiceId)?.number}
                    {w.jurisdiction && ` · ${w.jurisdiction}`}
                    {w.certificateRef && ` · cert. ${w.certificateRef}`}
                  </span>
                </span>
                <span className="tabular font-medium">{money(w.amount, r.currency)}</span>
              </span>
              {w.notes && <span className="block text-[12.5px] text-muted">{w.notes}</span>}
              <div className="mt-[6px]">
                <AttachmentsPanel ws={ws} entity="withholding" entityId={w.id} compact />
              </div>
            </li>
          ))}
        </ul>
        {r.status === 'recorded' && (
          <div className="mt-[10px] flex flex-col gap-[8px]">
            {errors.withholdings && <FormError message={errors.withholdings} />}
            <WithholdingsEditor ws={ws} clientId={r.clientId} currency={r.currency} items={newWithholdings} onChange={setNewWithholdings} errors={errors} />
            {newWithholdings.length > 0 && (
              <Button
                size="sm"
                className="self-start"
                disabled={busy}
                onClick={async () => {
                  if (await run(() => actions.addReceiptWithholdings(r.id, newWithholdings), { title: 'Retenciones registradas' })) setNewWithholdings([])
                }}
              >
                Guardar retenciones
              </Button>
            )}
          </div>
        )}
      </div>
      <div>
        <p className="mb-[8px] text-[13.5px] font-medium text-ink-secondary">Comprobante del cobro</p>
        <AttachmentsPanel ws={ws} entity="receipt" entityId={r.id} />
      </div>
      {free > 0 && (
        <div className="flex flex-col gap-[10px]">
          <p className="text-[13.5px]">
            Sin aplicar (saldo a favor o diferencia pendiente de conciliar): <span className="tabular font-semibold">{money(free, r.currency)}</span>
          </p>
          <FormError message={formError} />
          {errors.allocations && <FormError message={errors.allocations} />}
          <AllocationEditor ws={ws} clientId={r.clientId} currency={r.currency} allocations={allocations} onChange={setAllocations} errors={errors} />
          <div>
            <Button
              size="sm"
              disabled={busy || allocations.length === 0}
              onClick={async () => {
                const ok = await run(() => actions.applyReceiptCredit(r.id, allocations), { title: 'Saldo a favor aplicado' })
                if (ok) setAllocations([])
              }}
            >
              Aplicar saldo a favor
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-[10px] border-t border-line pt-[14px]">
        {r.status === 'recorded' && (
          <Button variant="outline" size="sm" onClick={() => setReversing(true)}>
            Revertir cobro
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      <ConfirmDialog
        open={reversing}
        onClose={() => setReversing(false)}
        title="Revertir cobro"
        tone="danger"
        confirmLabel="Revertir"
        reasonLabel="Motivo de la reversión"
        message="El cobro se conserva en el historial como revertido y deja de contar como pagado. Las facturas vuelven a tener saldo."
        onConfirm={async (reason) => {
          await actions.reverseReceipt(r.id, reason)
          notify({ title: 'Cobro revertido' })
        }}
      />
    </div>
  )
}

/* ───────────────────────── Collection follow-up ───────────────────────── */

export function CollectionActionModal({ invoiceId, onClose, workspace: ws }: { invoiceId?: string; onClose: () => void; workspace: Workspace }) {
  const inv = invoiceId ? ws.invoiceById.get(invoiceId) : undefined
  return (
    <Modal open={Boolean(inv)} onClose={onClose} title="Registrar gestión de cobranza" description={inv ? `${inv.number} · ${ws.clientById.get(inv.clientId)?.name}` : undefined} size="sm">
      {inv && <CollectionForm invoiceId={inv.id} onClose={onClose} />}
    </Modal>
  )
}

function CollectionForm({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [kind, setKind] = useState<CollectionActionKind>('call')
  const [text, setText] = useState('')
  const [promisedDate, setPromised] = useState('')
  const kinds = useMemo(() => Object.keys(collectionActionLabel) as CollectionActionKind[], [])
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.addCollectionAction({ invoiceId, kind, text, promisedDate }), { title: 'Gestión registrada' })
        if (ok) onClose()
      }}
      className="flex flex-col gap-[14px]"
    >
      <FormError message={formError} />
      <Field label="Tipo de gestión">
        {(p) => (
          <SelectInput {...p} data-autofocus value={kind} onChange={(e) => setKind(e.target.value as CollectionActionKind)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {collectionActionLabel[k]}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      <Field label="Detalle" required error={errors.text}>
        {(p) => <TextArea {...p} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />}
      </Field>
      <Field label="Fecha de pago prometida" error={errors.promisedDate}>
        {(p) => <DateInput {...p} value={promisedDate} onChange={(e) => setPromised(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : 'Registrar'}
        </Button>
      </div>
    </form>
  )
}
