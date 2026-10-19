import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { DateInput, Field, FormError, SelectInput, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import type { ExchangeRateInput } from '@/domain/finance/fx'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { CURRENCY_ORDER } from '@/lib/money'
import type { CurrencyCode, ExchangeRate } from '@/types/domain'

/** Recorded exchange rates with correction history. Informative only: no conversion is applied. */
export function ExchangeRatesPanel({ workspace: ws }: { workspace: Workspace }) {
  const [adding, setAdding] = useState(false)
  const [correcting, setCorrecting] = useState<ExchangeRate>()
  const rows = [...ws.exchangeRates].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt))
  return (
    <Card aria-labelledby="fx-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="fx-title"
        title="Tipos de cambio registrados"
        description="Referencia con fecha, fuente e historial de ajustes. SIGR no consolida monedas hasta definir una política de conversión."
        action={
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
            Registrar cotización
          </Button>
        }
      />
      <DataTable<ExchangeRate>
        className="mt-[18px]"
        caption="Tipos de cambio"
        rows={rows}
        getRowId={(r) => r.id}
        minWidth={760}
        dense
        columns={[
          { id: 'pair', header: 'Par', width: '110px', className: 'font-medium', cell: (r) => `${r.base}/${r.quote}` },
          { id: 'rate', header: 'Cotización', width: '130px', className: 'tabular font-semibold', cell: (r) => <span className={r.supersededById ? 'text-muted line-through' : undefined}>{r.rate}</span> },
          { id: 'date', header: 'Vigencia', width: '120px', className: 'tabular', cell: (r) => formatDate(r.effectiveDate) },
          { id: 'source', header: 'Fuente', width: '22%', cell: (r) => <span className="block truncate text-ink-secondary">{r.source}</span> },
          { id: 'notes', header: 'Notas', width: '24%', cell: (r) => <span className="block truncate text-muted">{r.notes ?? '—'}</span> },
          {
            id: 'status',
            header: 'Estado',
            width: '150px',
            cell: (r) =>
              r.supersededById ? (
                <StatusBadge meta={{ label: 'Reemplazada', tone: 'neutral' }} />
              ) : (
                <button type="button" onClick={() => setCorrecting(r)} className="rounded-full px-[10px] py-[4px] text-[13px] text-ink-secondary hover:bg-surface-muted hover:text-ink">
                  Ajustar
                </button>
              ),
          },
        ]}
      />
      <Modal open={adding} onClose={() => setAdding(false)} title="Registrar cotización" size="sm">
        {adding && <RateForm onClose={() => setAdding(false)} />}
      </Modal>
      <Modal open={Boolean(correcting)} onClose={() => setCorrecting(undefined)} title="Ajustar cotización" description="Se crea un registro nuevo que reemplaza al anterior; el historial se conserva." size="sm">
        {correcting && <CorrectForm rate={correcting} onClose={() => setCorrecting(undefined)} />}
      </Modal>
    </Card>
  )
}

function RateForm({ onClose }: { onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [input, setInput] = useState<ExchangeRateInput>({ base: 'USD', quote: 'ARS', rate: '', effectiveDate: DEMO_TODAY, source: 'Carga manual', notes: '' })
  const patch = (p: Partial<ExchangeRateInput>) => setInput((i) => ({ ...i, ...p }))
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.recordExchangeRate(input), { title: 'Cotización registrada' })
        if (ok) onClose()
      }}
    >
      <FormError message={formError} />
      <div className="grid grid-cols-2 gap-[12px]">
        {(['base', 'quote'] as const).map((k) => (
          <Field key={k} label={k === 'base' ? 'Moneda origen' : 'Moneda destino'} error={errors[k]}>
            {(p) => (
              <SelectInput {...p} value={input[k]} onChange={(e) => patch({ [k]: e.target.value as CurrencyCode })}>
                {CURRENCY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        ))}
        <Field label="Cotización" required error={errors.rate} hint={`${input.quote} por 1 ${input.base}`}>
          {(p) => <TextInput {...p} data-autofocus inputMode="decimal" value={input.rate} onChange={(e) => patch({ rate: e.target.value })} />}
        </Field>
        <Field label="Vigencia" required error={errors.effectiveDate}>
          {(p) => <DateInput {...p} value={input.effectiveDate} onChange={(e) => patch({ effectiveDate: e.target.value })} />}
        </Field>
        <Field label="Fuente" required error={errors.source} className="col-span-2">
          {(p) => <TextInput {...p} value={input.source} onChange={(e) => patch({ source: e.target.value })} maxLength={80} />}
        </Field>
      </div>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Registrar
        </Button>
      </div>
    </form>
  )
}

function CorrectForm({ rate, onClose }: { rate: ExchangeRate; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [value, setValue] = useState(rate.rate)
  const [reason, setReason] = useState('')
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.correctExchangeRate(rate.id, value, reason), { title: 'Cotización ajustada' })
        if (ok) onClose()
      }}
    >
      <FormError message={formError} />
      <p className="text-[13.5px] text-ink-secondary">
        {rate.base}/{rate.quote} · {formatDate(rate.effectiveDate)} · actual {rate.rate}
      </p>
      <Field label="Nueva cotización" required error={errors.rate}>
        {(p) => <TextInput {...p} data-autofocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}
      </Field>
      <Field label="Motivo del ajuste" required error={errors.reason}>
        {(p) => <TextInput {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}
      </Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Ajustar
        </Button>
      </div>
    </form>
  )
}
