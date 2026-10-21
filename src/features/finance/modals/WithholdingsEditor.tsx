import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, SelectInput, TextInput } from '@/components/ui/form'
import { withholdingTypeLabel } from '@/config/finance'
import type { WithholdingInput } from '@/domain/finance/receipts'
import type { Workspace } from '@/hooks/useWorkspace'
import type { CurrencyCode, WithholdingType } from '@/types/domain'

/**
 * Manual withholdings, entered exactly as stated in the documentation the
 * client sends (e.g. by email). SIGR never computes them from rates.
 */
export function WithholdingsEditor({ ws, clientId, currency, items, onChange, errors }: { ws: Workspace; clientId: string; currency: CurrencyCode | ''; items: WithholdingInput[]; onChange: (w: WithholdingInput[]) => void; errors: Record<string, string> }) {
  const invoices = ws.invoices.filter((i) => i.clientId === clientId && i.lifecycle === 'issued' && (!currency || i.currency === currency))
  const set = (i: number, p: Partial<WithholdingInput>) => onChange(items.map((w, j) => (j === i ? { ...w, ...p } : w)))
  return (
    <div className="flex flex-col gap-[8px]">
      {items.map((w, i) => {
        const e = (k: string) => errors[`withholdings.${i}.${k}`]
        return (
          <div key={i} className="grid gap-[8px] rounded-[14px] bg-surface p-[10px] sm:grid-cols-3">
            <Field label="Tipo" error={e('type')}>
              {(p) => (
                <SelectInput {...p} value={w.type} onChange={(ev) => set(i, { type: ev.target.value as WithholdingType })}>
                  {(Object.keys(withholdingTypeLabel) as WithholdingType[]).map((t) => (
                    <option key={t} value={t}>
                      {withholdingTypeLabel[t]}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            <Field label="Factura" error={e('invoiceId')}>
              {(p) => (
                <SelectInput {...p} value={w.invoiceId} onChange={(ev) => set(i, { invoiceId: ev.target.value })}>
                  <option value="">Elegí la factura</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.externalRef ?? inv.number}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            <Field label={`Importe retenido${currency ? ` (${currency})` : ''}`} error={e('amount')}>
              {(p) => <TextInput {...p} inputMode="decimal" value={w.amount || ''} onChange={(ev) => set(i, { amount: Number(ev.target.value.replace(',', '.')) })} />}
            </Field>
            <Field label="Jurisdicción" error={e('jurisdiction')}>
              {(p) => <TextInput {...p} value={w.jurisdiction ?? ''} onChange={(ev) => set(i, { jurisdiction: ev.target.value })} maxLength={60} placeholder="Ej.: Neuquén (IIBB)" />}
            </Field>
            <Field label="N.º de certificado de retención" error={e('certificateRef')}>
              {(p) => <TextInput {...p} value={w.certificateRef ?? ''} onChange={(ev) => set(i, { certificateRef: ev.target.value })} maxLength={60} />}
            </Field>
            <div className="flex items-end gap-[8px]">
              <Field label="Observación" className="min-w-0 flex-1">
                {(p) => <TextInput {...p} value={w.notes ?? ''} onChange={(ev) => set(i, { notes: ev.target.value })} maxLength={200} />}
              </Field>
              <Button size="sm" variant="secondary" className="h-[46px]" aria-label="Quitar retención" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                <Trash2 aria-hidden className="size-[15px]" strokeWidth={1.9} />
              </Button>
            </div>
          </div>
        )
      })}
      <Button size="sm" variant="outline" className="self-start" disabled={!clientId} onClick={() => onChange([...items, { type: 'iva', invoiceId: invoices.length === 1 ? invoices[0].id : '', amount: 0 }])}>
        <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
        Agregar retención
      </Button>
    </div>
  )
}
