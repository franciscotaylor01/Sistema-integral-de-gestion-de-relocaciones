import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, Switch, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { DEMO_TODAY } from '@/config/brand'
import { priceUnitLabel } from '@/config/commercial'
import { countryOptions } from '@/config/countries'
import { activeServiceTypes, getServiceType } from '@/config/serviceCatalog'
import { findOverlaps, type PriceEntryInput } from '@/domain/commercial/pricing'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import type { Client, CurrencyCode, PriceEntry, PriceMarket, PriceUnit } from '@/types/domain'

interface PriceEntryModalProps {
  open: boolean
  onClose: () => void
  workspace: Workspace
  client: Client
  entry?: PriceEntry
}

export function PriceEntryModal(props: PriceEntryModalProps) {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.entry ? 'Editar tarifa' : 'Nueva tarifa'}
      description="Los cambios aplican a cotizaciones nuevas; las aprobadas conservan su precio."
      size="md"
    >
      {props.open && <PriceEntryForm key={props.entry?.id ?? 'new'} {...props} />}
    </Modal>
  )
}

function PriceEntryForm({ onClose, workspace: ws, client, entry }: PriceEntryModalProps) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [input, setInput] = useState<PriceEntryInput>(() => ({
    clientId: client.id,
    serviceTypeId: entry?.serviceTypeId ?? '',
    itemId: entry?.itemId ?? '',
    market: entry?.market ?? 'ANY',
    currency: entry?.currency ?? client.billingCurrency,
    unitPrice: entry?.unitPrice ?? 0,
    unit: entry?.unit ?? 'service',
    minQuantity: entry?.minQuantity ?? 1,
    validFrom: entry?.validFrom ?? DEMO_TODAY,
    validTo: entry?.validTo ?? '',
    active: entry?.active ?? true,
    agreement: entry?.agreement ?? '',
    notes: entry?.notes ?? '',
  }))
  const patch = (p: Partial<PriceEntryInput>) => setInput((i) => ({ ...i, ...p }))
  const overlaps = errors.overlap
    ? findOverlaps(ws.dataset, { ...input, currency: input.currency as CurrencyCode, id: entry?.id, validTo: input.validTo || undefined } as PriceEntry)
    : []

  const save = async (acceptOverlap = false) => {
    const ok = entry
      ? await run(() => actions.updatePriceEntry(entry.id, input, { acceptOverlap }), { title: 'Tarifa actualizada' })
      : await run(() => actions.createPriceEntry(input, { acceptOverlap }), { title: 'Tarifa creada' })
    if (ok) onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save(false)
      }}
      className="flex flex-col gap-[14px]"
    >
      {entry?.approvedAt && (
        <p role="note" className="rounded-[14px] bg-info-soft px-[14px] py-[10px] text-[13px] text-info">
          Tarifa aprobada ({entry.approvalRef}). Al guardar cambios se crea una nueva versión pendiente de aprobación; la anterior se conserva en el historial y los proyectos ya contratados mantienen su precio.
        </p>
      )}
      {errors.overlap ? (
        <div role="alert" className="rounded-[14px] bg-warning-soft px-[14px] py-[12px] text-[13.5px] text-warning">
          <p className="flex items-center gap-[8px] font-semibold">
            <TriangleAlert aria-hidden className="size-[16px]" strokeWidth={2} />
            Se superpone con {overlaps.length} tarifa(s) vigente(s)
          </p>
          <ul className="mt-[6px] list-disc pl-[20px] text-ink-secondary">
            {overlaps.map((o) => (
              <li key={o.id}>
                {formatCurrency(o.unitPrice, o.currency)} · {o.agreement ?? 'sin acuerdo'} · desde {formatDate(o.validFrom)}
                {o.validTo ? ` hasta ${formatDate(o.validTo)}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-[6px] text-ink-secondary">Si la guardás, las cotizaciones te pedirán elegir manualmente cuál aplicar.</p>
          <div className="mt-[10px]">
            <Button size="sm" variant="outline" onClick={() => save(true)} disabled={busy}>
              Guardar igualmente
            </Button>
          </div>
        </div>
      ) : (
        <FormError message={formError} />
      )}
      <div className="grid gap-[14px] sm:grid-cols-2">
        <Field label="Servicio" required error={errors.serviceTypeId}>
          {(p) => (
            <SelectInput {...p} data-autofocus value={input.serviceTypeId} onChange={(e) => patch({ serviceTypeId: e.target.value, itemId: '' })}>
              <option value="">Elegí un servicio</option>
              {activeServiceTypes().map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
              {input.serviceTypeId && !getServiceType(input.serviceTypeId).active && <option value={input.serviceTypeId}>{getServiceType(input.serviceTypeId).label}</option>}
            </SelectInput>
          )}
        </Field>
        <Field label="Subservicio" error={errors.itemId} hint="Vacío = precio del servicio completo (una sola línea).">
          {(p) => (
            <SelectInput {...p} value={input.itemId ?? ''} onChange={(e) => {
              const it = ws.catalogItems.find((x) => x.id === e.target.value)
              patch({ itemId: e.target.value, unit: it?.unit ?? input.unit })
            }}>
              <option value="">Servicio completo</option>
              {ws.catalogItems
                .filter((it) => it.serviceTypeId === input.serviceTypeId && (it.active || it.id === input.itemId))
                .map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Mercado" hint="País de destino al que aplica.">
          {(p) => (
            <SelectInput {...p} value={input.market} onChange={(e) => patch({ market: e.target.value as PriceMarket })}>
              <option value="ANY">Todos los mercados</option>
              {countryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Moneda" required error={errors.currency}>
          {(p) => (
            <SelectInput {...p} value={input.currency} onChange={(e) => patch({ currency: e.target.value as CurrencyCode })}>
              {CURRENCY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Precio unitario" required error={errors.unitPrice}>
          {(p) => <TextInput {...p} type="number" min={0} step="any" inputMode="decimal" value={input.unitPrice || ''} onChange={(e) => patch({ unitPrice: Number(e.target.value) })} />}
        </Field>
        <Field label="Unidad de medida">
          {(p) => (
            <SelectInput {...p} value={input.unit} onChange={(e) => patch({ unit: e.target.value as PriceUnit })}>
              {(Object.keys(priceUnitLabel) as PriceUnit[]).map((u) => (
                <option key={u} value={u}>
                  {priceUnitLabel[u]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Desde cantidad" error={errors.minQuantity} hint="Tramo por volumen (1 = siempre).">
          {(p) => <TextInput {...p} type="number" min={1} step={1} value={input.minQuantity} onChange={(e) => patch({ minQuantity: Number(e.target.value) })} />}
        </Field>
        <Field label="Vigente desde" required error={errors.validFrom}>
          {(p) => <DateInput {...p} value={input.validFrom} onChange={(e) => patch({ validFrom: e.target.value })} />}
        </Field>
        <Field label="Vigente hasta" error={errors.validTo} hint="Vacío = sin vencimiento.">
          {(p) => <DateInput {...p} value={input.validTo ?? ''} min={input.validFrom} onChange={(e) => patch({ validTo: e.target.value })} />}
        </Field>
        <Field label="Acuerdo / contrato" className="sm:col-span-2">
          {(p) => <TextInput {...p} value={input.agreement ?? ''} onChange={(e) => patch({ agreement: e.target.value })} maxLength={80} placeholder="Ej.: Acuerdo marco 2026" />}
        </Field>
        <Field label="Notas" error={errors.notes} className="sm:col-span-2">
          {(p) => <TextArea {...p} value={input.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} maxLength={500} className="min-h-[70px]" />}
        </Field>
      </div>
      <Switch checked={input.active} onChange={(v) => patch({ active: v })} label="Tarifa activa" description="Las inactivas no se sugieren en cotizaciones." />
      <div className="flex flex-wrap justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : entry ? 'Guardar cambios' : 'Crear tarifa'}
        </Button>
      </div>
    </form>
  )
}
