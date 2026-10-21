import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { DEMO_TODAY } from '@/config/brand'
import { batchPath } from '@/config/navigation'
import { randomId } from '@/domain/context'
import { convertAmount, validRate } from '@/domain/finance/batchProgress'
import { sharedExpenseInfo, type BatchInput } from '@/domain/finance/batches'
import { addMoney, subMoney } from '@/domain/finance/money'
import { settlementFinancials } from '@/domain/finance/settlements'
import { ProjectRef } from '@/features/finance/components/ProjectRef'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import type { CurrencyCode } from '@/types/domain'

const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')))

/** Grouped settlement: selected project balances, shared-expense deductions, documented conversions. */
export function BatchModal({ open, onClose, ws, settlementIds }: { open: boolean; onClose: () => void; ws: Workspace; settlementIds: string[] }) {
  return (
    <Modal open={open} onClose={onClose} title="Nueva liquidación agrupada" description="Se guarda como borrador. Confirmarla compromete los saldos; no registra ningún pago." size="lg">
      {open && <BatchForm ws={ws} settlementIds={settlementIds} onClose={onClose} />}
    </Modal>
  )
}

function BatchForm({ ws, settlementIds, onClose }: { ws: Workspace; settlementIds: string[]; onClose: () => void }) {
  const actions = useActions()
  const navigate = useNavigate()
  const { run, busy, errors, formError } = useCommand()
  const [requestId] = useState(() => randomId('req'))
  const settlements = settlementIds.map((id) => ws.settlements.find((s) => s.id === id)!).filter(Boolean)
  const supplierId = settlements[0]?.supplierId ?? 'sup_florencia'
  const avail = new Map(settlements.map((s) => [s.id, settlementFinancials(ws.dataset, s, DEMO_TODAY).available]))
  const [currency, setCurrency] = useState<CurrencyCode>(settlements[0]?.currency ?? 'USD')
  const [date, setDate] = useState(DEMO_TODAY)
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(settlements.map((s) => [s.id, String(avail.get(s.id) ?? 0)])))
  const shared = ws.costs.filter((c) => c.sharing?.partnerSupplierId === supplierId).map((c) => ({ c, info: sharedExpenseInfo(ws.dataset, c)! })).filter((x) => x.info && x.info.pending > 0)
  const [ded, setDed] = useState<Record<string, string>>({})
  const [rates, setRates] = useState<Record<string, { rate: string; date: string; source: string }>>({})
  const setRate = (from: string, patch: Partial<{ rate: string; date: string; source: string }>) => setRates((r) => ({ ...r, [from]: Object.assign({ rate: '', date: DEMO_TODAY, source: '' }, r[from], patch) }))
  const [adjustments, setAdjustments] = useState<{ concept: string; amount: string; reference: string }[]>([])

  const lines = settlements.map((s) => ({ settlementId: s.id, amount: num(amounts[s.id] ?? '') })).filter((l) => l.amount > 0)
  const deductions = Object.entries(ded).map(([costId, v]) => ({ costId, amount: num(v) })).filter((d) => d.amount > 0)
  const foreign = [...new Set([...lines.map((l) => settlements.find((s) => s.id === l.settlementId)!.currency), ...deductions.map((d) => ws.costs.find((c) => c.id === d.costId)!.currency)])].filter((c) => c !== currency)
  const conv = (amount: number, from: CurrencyCode) => (from === currency ? amount : validRate((rates[from]?.rate ?? '').replace(',', '.')) ? convertAmount(amount, rates[from].rate.replace(',', '.')) : undefined)
  const gross = addMoney(...lines.map((l) => conv(l.amount, settlements.find((s) => s.id === l.settlementId)!.currency) ?? 0))
  const dedTotal = addMoney(...deductions.map((d) => conv(d.amount, ws.costs.find((c) => c.id === d.costId)!.currency) ?? 0))
  const adjTotal = addMoney(...adjustments.map((a) => num(a.amount)))
  const net = subMoney(addMoney(gross, adjTotal), dedTotal)
  const m = (v: number, c: CurrencyCode = currency) => formatMoney(v, c)
  const input: BatchInput = {
    supplierId,
    currency,
    date,
    lines,
    deductions,
    rates: foreign.map((from) => ({ from, rate: rates[from]?.rate ?? '', date: rates[from]?.date ?? DEMO_TODAY, source: rates[from]?.source ?? '' })),
    adjustments: adjustments.map((a) => ({ concept: a.concept, amount: num(a.amount), reference: a.reference })),
  }

  return (
    <form
      className="flex flex-col gap-[16px]"
      onSubmit={async (e) => {
        e.preventDefault()
        let id: string | undefined
        const ok = await run(async () => {
          const r = await actions.createBatch(input, requestId)
          id = r.batchId
          return r
        }, { title: 'Borrador de liquidación guardado' })
        if (ok && id) navigate(batchPath(id))
      }}
    >
      <FormError message={formError ?? errors.lines ?? errors.deductions ?? errors.adjustments} />
      <div className="grid gap-[12px] sm:grid-cols-2">
        <Field label="Moneda de la liquidación / pago" required error={errors.currency}>
          {(p) => (
            <SelectInput {...p} value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
              {CURRENCY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Fecha" required error={errors.date}>
          {(p) => <DateInput {...p} value={date} max={DEMO_TODAY} onChange={(e) => setDate(e.target.value)} />}
        </Field>
      </div>

      <section className="rounded-panel bg-surface-muted p-[10px]">
        <p className="mb-[8px] text-[13.5px] font-medium text-ink-secondary">1. Saldos de proyectos</p>
        <div className="flex flex-col gap-[6px]">
          {settlements.map((s, i) => {
            const idx = lines.findIndex((l) => l.settlementId === s.id)
            return (
              <div key={s.id} className="grid items-center gap-[10px] rounded-[14px] bg-surface px-[12px] py-[9px] sm:grid-cols-[minmax(0,1fr)_150px_130px]">
                <span className="min-w-0">
                  <ProjectRef ws={ws} projectId={s.projectId} compact />
                  <span className="tabular block text-[12px] text-muted">Disponible {formatMoney(avail.get(s.id) ?? 0, s.currency)}</span>
                  {idx >= 0 && errors[`lines.${idx}.amount`] && <span className="block text-[12px] font-medium text-danger">{errors[`lines.${idx}.amount`]}</span>}
                </span>
                <Field label={`Importe ${i + 1} (${s.currency})`} className="[&>label]:sr-only">
                  {(p) => <TextInput {...p} inputMode="decimal" value={amounts[s.id] ?? ''} onChange={(e) => setAmounts((a) => ({ ...a, [s.id]: e.target.value }))} />}
                </Field>
                <span className="tabular text-right text-[13.5px] font-medium">{(() => { const v = conv(num(amounts[s.id] ?? ''), s.currency); return v === undefined ? 'Falta TC' : m(v) })()}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-panel bg-surface-muted p-[10px]">
        <p className="mb-[8px] text-[13.5px] font-medium text-ink-secondary">2. Gastos compartidos pendientes de deducir</p>
        {shared.length === 0 && <p className="text-[13px] text-muted">No hay gastos compartidos pendientes.</p>}
        <div className="flex flex-col gap-[6px]">
          {shared.map(({ c, info }) => {
            const on = ded[c.id] !== undefined
            return (
              <div key={c.id} className="grid items-center gap-[10px] rounded-[14px] bg-surface px-[12px] py-[9px] sm:grid-cols-[minmax(0,1fr)_150px]">
                <label className="flex min-w-0 items-center gap-[10px] text-[13.5px]">
                  <input type="checkbox" className="size-[16px] accent-[var(--color-ink)]" checked={on} onChange={(e) => setDed((d) => { const n = { ...d }; if (e.target.checked) n[c.id] = String(info.pending); else delete n[c.id]; return n })} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.description}</span>
                    <span className="tabular block text-[12px] text-muted">
                      {c.sharing!.partnerPct}% Florencia / {c.sharing!.ownerPct}% Eugenia · pendiente {formatMoney(info.pending, c.currency)}
                    </span>
                  </span>
                </label>
                <Field label={`Deducir ${c.description}`} className="[&>label]:sr-only">
                  {(p) => <TextInput {...p} inputMode="decimal" disabled={!on} value={ded[c.id] ?? ''} onChange={(e) => setDed((d) => ({ ...d, [c.id]: e.target.value }))} />}
                </Field>
              </div>
            )
          })}
        </div>
      </section>

      {foreign.length > 0 && (
        <section className="rounded-panel bg-surface-muted p-[10px]">
          <p className="mb-[8px] text-[13.5px] font-medium text-ink-secondary">3. Conversiones (manuales y documentadas)</p>
          {foreign.map((from) => (
            <div key={from} className="mb-[6px] grid gap-[8px] rounded-[14px] bg-surface p-[10px] sm:grid-cols-3">
              <Field label={`${from} → ${currency}`} required error={errors[`rates.${from}.rate`]}>
                {(p) => <TextInput {...p} inputMode="decimal" placeholder={`${currency} por 1 ${from}`} value={rates[from]?.rate ?? ''} onChange={(e) => setRate(from, { rate: e.target.value })} />}
              </Field>
              <Field label="Fecha del TC" required error={errors[`rates.${from}.date`]}>
                {(p) => <DateInput {...p} value={rates[from]?.date ?? DEMO_TODAY} onChange={(e) => setRate(from, { date: e.target.value })} />}
              </Field>
              <Field label="Referencia / fuente" required error={errors[`rates.${from}.source`]}>
                {(p) => <TextInput {...p} value={rates[from]?.source ?? ''} onChange={(e) => setRate(from, { source: e.target.value })} maxLength={120} />}
              </Field>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-panel bg-surface-muted p-[10px]">
        <p className="mb-[8px] text-[13.5px] font-medium text-ink-secondary">Ajustes documentados (opcional, en {currency})</p>
        {adjustments.map((a, i) => (
          <div key={i} className="mb-[6px] grid items-end gap-[8px] rounded-[14px] bg-surface p-[10px] sm:grid-cols-[minmax(0,1fr)_130px_minmax(0,1fr)_auto]">
            <Field label="Concepto" error={errors[`adjustments.${i}.concept`]}>{(p) => <TextInput {...p} value={a.concept} onChange={(e) => setAdjustments((x) => x.map((y, j) => (j === i ? { ...y, concept: e.target.value } : y)))} maxLength={120} />}</Field>
            <Field label="Importe (±)" error={errors[`adjustments.${i}.amount`]}>{(p) => <TextInput {...p} inputMode="decimal" value={a.amount} onChange={(e) => setAdjustments((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} />}</Field>
            <Field label="Referencia">{(p) => <TextInput {...p} value={a.reference} onChange={(e) => setAdjustments((x) => x.map((y, j) => (j === i ? { ...y, reference: e.target.value } : y)))} maxLength={120} />}</Field>
            <Button size="sm" variant="secondary" className="h-[46px]" aria-label="Quitar ajuste" onClick={() => setAdjustments((x) => x.filter((_, j) => j !== i))}>
              <Trash2 aria-hidden className="size-[15px]" strokeWidth={1.9} />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setAdjustments((x) => [...x, { concept: '', amount: '', reference: '' }])}>
          <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
          Agregar ajuste
        </Button>
      </section>

      <dl className="ml-auto w-full max-w-[380px] rounded-panel bg-surface-muted px-[14px] py-[10px] text-[14px]">
        {(
          [
            ['Participaciones seleccionadas', gross],
            ['Deducciones compartidas', -dedTotal],
            ['Ajustes', adjTotal],
          ] as [string, number][]
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between py-[3px]">
            <dt className="text-ink-secondary">{k}</dt>
            <dd className="tabular">{m(v)}</dd>
          </div>
        ))}
        <div className={cn('mt-[6px] flex justify-between border-t border-line pt-[8px] text-[16px] font-semibold', net < 0 && 'text-danger')}>
          <dt>Neto a liquidar</dt>
          <dd className="tabular">{m(net)}</dd>
        </div>
      </dl>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Guardar borrador
        </Button>
      </div>
    </form>
  )
}
