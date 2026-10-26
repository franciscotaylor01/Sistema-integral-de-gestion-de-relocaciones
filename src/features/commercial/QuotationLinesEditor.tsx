import { Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { priceUnitLabel } from '@/config/commercial'
import { activeServiceTypes, getServiceType } from '@/config/serviceCatalog'
import { resolvePrice } from '@/domain/commercial/pricing'
import { isAuthorizer, lineTotal, type QuotationLineInput } from '@/domain/commercial/quotations'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import type { CurrencyCode, PriceUnit, Project } from '@/types/domain'

interface Props {
  lines: QuotationLineInput[]
  onChange: (lines: QuotationLineInput[]) => void
  project: Project
  workspace: Workspace
  issueDate: string
  errors: Record<string, string>
  actorId: string
}

/** Drops the automatic "tariff missing/ambiguous" note once a price is chosen. */
const clearAutoNote = (n?: string) => (n && /^(Tarifa ambigua|Sin tarifa vigente)/.test(n) ? undefined : n)

/** Draft line editor: tariff suggestions per line, explicit choice when ambiguous. */
export function QuotationLinesEditor({ lines, onChange, project, workspace: ws, issueDate, errors, actorId }: Props) {
  const set = (i: number, p: Partial<QuotationLineInput>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const canAdjust = isAuthorizer(actorId)

  const addLine = () => {
    const missing = project.services.find((s) => !lines.some((l) => l.serviceId === s.id))
    const typeId = missing?.typeId ?? 'orientation'
    onChange([
      ...lines,
      {
        serviceId: missing?.id,
        serviceTypeId: typeId,
        description: `${getServiceType(typeId).label} — ${project.destination.city}`,
        quantity: 1,
        unit: 'service',
        unitPrice: 0,
        currency: project.currency,
      },
    ])
  }

  return (
    <div className="flex flex-col gap-[10px]">
      {lines.map((l, i) => {
        const res = resolvePrice(ws.dataset, {
          clientId: project.clientId,
          serviceTypeId: l.serviceTypeId,
          market: project.destination.country,
          currency: l.currency,
          date: issueDate,
          quantity: l.quantity || 1,
        })
        const adjusted = l.suggestedUnitPrice !== undefined && Math.round(l.unitPrice * 100) !== Math.round(l.suggestedUnitPrice * 100)
        const e = (k: string) => errors[`lines.${i}.${k}`]
        // Phase 5.0B: special sub-service lines take price, quantity and currency from the item.
        const fixed = Boolean(l.serviceItemId)
        return (
          <section key={l.id ?? `new-${i}`} aria-label={`Línea ${i + 1}`} className="rounded-panel bg-surface-muted p-[14px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-[10px]">
                <ServiceChip type={l.serviceTypeId} size="md" />
                <span className="text-[13px] font-medium text-muted">Línea {i + 1}</span>
                {fixed && <span className="rounded-full bg-accent-soft px-[9px] py-[2px] text-[12px] font-medium text-accent-strong">Subservicio especial</span>}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-[32px] px-[12px] text-[13px]"
                aria-label={`Quitar línea ${i + 1}`}
                onClick={() => onChange(lines.filter((_, j) => j !== i))}
              >
                <Trash2 aria-hidden className="size-[14px]" strokeWidth={2} />
                Quitar
              </Button>
            </div>
            <div className="mt-[12px] grid gap-[12px] sm:grid-cols-2 xl:grid-cols-6">
              <Field label="Servicio contratado" error={e('serviceId')} className="xl:col-span-2">
                {(p) => (
                  <SelectInput
                    {...p}
                    disabled={fixed}
                    value={l.serviceId ?? `type:${l.serviceTypeId}`}
                    onChange={(ev) => {
                      const v = ev.target.value
                      if (v.startsWith('type:')) set(i, { serviceId: undefined, serviceTypeId: v.slice(5), suggestedUnitPrice: undefined, priceEntryId: undefined })
                      else {
                        const svc = project.services.find((s) => s.id === v)!
                        set(i, { serviceId: svc.id, serviceTypeId: svc.typeId, suggestedUnitPrice: undefined, priceEntryId: undefined })
                      }
                    }}
                  >
                    <optgroup label="Servicios del proyecto">
                      {project.services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {getServiceType(s.typeId).label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Ítem adicional (sin servicio)">
                      {activeServiceTypes().map((t) => (
                        <option key={t.id} value={`type:${t.id}`}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                  </SelectInput>
                )}
              </Field>
              <Field label="Descripción" required error={e('description')} className="sm:col-span-2 xl:col-span-4">
                {(p) => <TextInput {...p} value={l.description} onChange={(ev) => set(i, { description: ev.target.value })} maxLength={160} />}
              </Field>
              <Field label="Cantidad" required error={e('quantity')}>
                {(p) => <TextInput {...p} type="number" min={0} step="any" disabled={fixed} value={l.quantity || ''} onChange={(ev) => set(i, { quantity: Number(ev.target.value) })} />}
              </Field>
              <Field label="Unidad">
                {(p) => (
                  <SelectInput {...p} disabled={fixed} value={l.unit} onChange={(ev) => set(i, { unit: ev.target.value as PriceUnit })}>
                    {(Object.keys(priceUnitLabel) as PriceUnit[]).map((u) => (
                      <option key={u} value={u}>
                        {priceUnitLabel[u]}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>
              <Field label="Precio unitario" required error={e('unitPrice')}>
                {(p) => <TextInput {...p} type="number" min={0} step="any" inputMode="decimal" disabled={fixed} value={l.unitPrice || ''} onChange={(ev) => set(i, { unitPrice: Number(ev.target.value) })} />}
              </Field>
              <Field label="Moneda">
                {(p) => (
                  <SelectInput {...p} disabled={fixed} value={l.currency} onChange={(ev) => set(i, { currency: ev.target.value as CurrencyCode, suggestedUnitPrice: undefined, priceEntryId: undefined })}>
                    {CURRENCY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>
              <div className="min-w-0 sm:col-span-2">
                <p className="mb-[6px] text-[13.5px] font-medium text-ink-secondary">Total de la línea</p>
                <p className="tabular flex h-[46px] items-center rounded-[14px] bg-surface px-[14px] text-[15px] font-semibold">{formatCurrency(lineTotal(l), l.currency, { decimals: 2 })}</p>
              </div>
            </div>

            <div className="mt-[12px] rounded-[14px] bg-surface px-[12px] py-[10px] text-[13px]">
              {fixed && <span className="text-ink-secondary">Exclusivo del proyecto (fuera del tarifario). El precio se modifica desde el servicio, nunca desde la cotización.</span>}
              {!fixed && res.status === 'unique' && (
                <span className="flex flex-wrap items-center gap-[8px]">
                  <span className="text-ink-secondary">
                    Tarifa: <span className="tabular font-semibold text-ink">{formatCurrency(res.entry.unitPrice, res.entry.currency)}</span> {priceUnitLabel[res.entry.unit]}
                    {res.entry.agreement && ` · ${res.entry.agreement}`}
                  </span>
                  {l.priceEntryId !== res.entry.id || l.unitPrice !== res.entry.unitPrice ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-[30px] px-[10px] text-[12.5px]"
                      onClick={() => set(i, { unitPrice: res.entry.unitPrice, unit: res.entry.unit, suggestedUnitPrice: res.entry.unitPrice, priceEntryId: res.entry.id, adjustmentReason: undefined, notes: clearAutoNote(l.notes) })}
                    >
                      Aplicar tarifa
                    </Button>
                  ) : (
                    <span className="text-success">Aplicada</span>
                  )}
                </span>
              )}
              {!fixed && res.status === 'ambiguous' && (
                <span className="flex flex-col gap-[8px] text-warning">
                  <span className="flex items-center gap-[6px] font-medium">
                    <TriangleAlert aria-hidden className="size-[15px]" strokeWidth={2} />
                    {res.candidates.length} tarifas aplican por igual: elegí cuál corresponde.
                  </span>
                  <span className="flex flex-wrap gap-[6px]">
                    {res.candidates.map((c) => (
                      <Button
                        key={c.id}
                        size="sm"
                        variant={l.priceEntryId === c.id ? 'primary' : 'outline'}
                        className="h-[30px] px-[10px] text-[12.5px]"
                        onClick={() => set(i, { unitPrice: c.unitPrice, unit: c.unit, suggestedUnitPrice: c.unitPrice, priceEntryId: c.id, adjustmentReason: undefined, notes: clearAutoNote(l.notes) })}
                      >
                        {formatCurrency(c.unitPrice, c.currency)} · {c.agreement ?? 'sin acuerdo'}
                      </Button>
                    ))}
                  </span>
                </span>
              )}
              {!fixed && res.status === 'none' && <span className="text-muted">Sin tarifa vigente para este servicio, mercado y moneda: precio manual.</span>}
            </div>

            {adjusted && (
              <div className="mt-[12px]">
                <Field
                  label={`Motivo del ajuste (tarifa ${formatCurrency(l.suggestedUnitPrice ?? 0, l.currency)})`}
                  required
                  error={e('adjustmentReason') ?? (canAdjust ? undefined : 'Solo Dirección o Finanzas pueden ajustar precios de tarifa.')}
                >
                  {(p) => <TextInput {...p} value={l.adjustmentReason ?? ''} onChange={(ev) => set(i, { adjustmentReason: ev.target.value })} maxLength={200} />}
                </Field>
              </div>
            )}
            <div className="mt-[12px]">
              <Field label="Alcance / descripción del servicio" error={e('details')} hint={fixed ? undefined : 'Se completa con la descripción del servicio en el proyecto.'}>
                {(p) => <TextArea {...p} rows={2} value={l.details ?? ''} onChange={(ev) => set(i, { details: ev.target.value })} maxLength={600} />}
              </Field>
            </div>
            <div className="mt-[12px]">
              <Field label="Notas de la línea">{(p) => <TextInput {...p} value={l.notes ?? ''} onChange={(ev) => set(i, { notes: ev.target.value })} maxLength={300} />}</Field>
            </div>
          </section>
        )
      })}
      {errors.lines && <p className="text-[12.5px] font-medium text-danger">{errors.lines}</p>}
      <div>
        <Button size="sm" variant="outline" onClick={addLine}>
          <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
          Agregar línea
        </Button>
      </div>
    </div>
  )
}
