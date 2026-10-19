import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { DEMO_TODAY } from '@/config/brand'
import { FISCAL_DISCLAIMER, invoiceKindLabel } from '@/config/finance'
import { getServiceType } from '@/config/serviceCatalog'
import { invoiceTotals, lineSubtotal } from '@/domain/finance/derive'
import { billableByService, type InvoiceInput, type InvoiceLineInput } from '@/domain/finance/invoices'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import type { CurrencyCode, InvoiceKind, Project } from '@/types/domain'

interface Props {
  input: InvoiceInput
  onChange: (input: InvoiceInput) => void
  project: Project
  workspace: Workspace
  errors: Record<string, string>
  formError?: string
  /** Excluded from "already invoiced" when editing a draft. */
  invoiceId?: string
}

const fmt = (v: number, c: CurrencyCode | '') => (c ? formatCurrency(v, c, { decimals: 2 }) : String(v))

/** Invoice editor: lines per contracted service (capped by what is billable), taxes and live totals. */
export function InvoiceForm({ input, onChange, project, workspace: ws, errors, formError, invoiceId }: Props) {
  const billable = billableByService(ws.dataset, project.id, DEMO_TODAY, invoiceId)
  const patch = (p: Partial<InvoiceInput>) => onChange({ ...input, ...p })
  const setLine = (i: number, p: Partial<InvoiceLineInput>) => patch({ lines: input.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) })
  const totals = invoiceTotals({
    lines: input.lines.map((l, i) => ({ ...l, id: String(i), quantity: l.quantity || 0, unitPrice: l.unitPrice || 0 })),
    taxes: input.taxes.map((t, i) => ({ ...t, id: String(i), ratePct: t.ratePct || 0 })),
  })
  const cur = input.currency

  return (
    <div className="flex flex-col gap-[18px]">
      <p className="rounded-[14px] bg-info-soft px-[14px] py-[11px] text-[13px] leading-[1.5] text-info">{FISCAL_DISCLAIMER}</p>
      <FormError message={formError} />
      <div className="grid gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Entidad emisora" required error={errors.issuerId}>
          {(p) => (
            <SelectInput {...p} value={input.issuerId} onChange={(e) => patch({ issuerId: e.target.value })}>
              {ws.legalEntities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Tipo de comprobante">
          {(p) => (
            <SelectInput {...p} value={input.kind} onChange={(e) => patch({ kind: e.target.value as InvoiceKind })}>
              {(Object.keys(invoiceKindLabel) as InvoiceKind[]).map((k) => (
                <option key={k} value={k}>
                  {invoiceKindLabel[k]}
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
        <Field label="Fecha de emisión" required error={errors.issueDate}>
          {(p) => <DateInput {...p} value={input.issueDate} onChange={(e) => patch({ issueDate: e.target.value })} />}
        </Field>
        <Field label="Vencimiento" required error={errors.dueDate}>
          {(p) => <DateInput {...p} value={input.dueDate} min={input.issueDate} onChange={(e) => patch({ dueDate: e.target.value })} />}
        </Field>
        <Field label="Referencia externa" error={errors.externalRef} hint="N.º del comprobante emitido fuera de SIGR, si existe.">
          {(p) => <TextInput {...p} value={input.externalRef ?? ''} onChange={(e) => patch({ externalRef: e.target.value })} maxLength={40} />}
        </Field>
      </div>

      <div className="flex flex-col gap-[10px]">
        <p className="text-[13.5px] font-medium text-ink-secondary">Líneas</p>
        {errors.lines && <FormError message={errors.lines} />}
        {input.lines.map((l, i) => {
          const b = l.serviceId ? billable.get(l.serviceId) : undefined
          const e = (k: string) => errors[`lines.${i}.${k}`]
          const pos = ws.purchaseOrders.filter((p) => p.projectId === project.id && p.status === 'active' && p.allocations.some((a) => a.serviceId === l.serviceId))
          const quotes = ws.quotations.filter((q) => q.projectId === project.id && q.status === 'approved' && q.lines.some((x) => x.serviceId === l.serviceId))
          return (
            <section key={i} aria-label={`Línea ${i + 1}`} className="rounded-panel bg-surface-muted p-[14px]">
              <div className="grid gap-[12px] sm:grid-cols-2 xl:grid-cols-6">
                <Field label="Servicio" error={e('serviceId')} className="xl:col-span-2">
                  {(p) => (
                    <SelectInput
                      {...p}
                      value={l.reimbursable ? '__reimb' : (l.serviceId ?? '')}
                      onChange={(ev) => {
                        const v = ev.target.value
                        if (v === '__reimb') return setLine(i, { serviceId: undefined, reimbursable: true, purchaseOrderId: undefined, quotationId: undefined })
                        const bb = billable.get(v)
                        setLine(i, { serviceId: v, reimbursable: false, purchaseOrderId: bb?.purchaseOrderId, quotationId: bb?.quotationId })
                      }}
                    >
                      <option value="">Elegí un servicio</option>
                      {project.services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {getServiceType(s.typeId).label}
                        </option>
                      ))}
                      <option value="__reimb">Reintegro de gastos (sin servicio)</option>
                    </SelectInput>
                  )}
                </Field>
                <Field label="Descripción" required error={e('description')} className="sm:col-span-2 xl:col-span-4">
                  {(p) => <TextInput {...p} value={l.description} onChange={(ev) => setLine(i, { description: ev.target.value })} maxLength={160} />}
                </Field>
                <Field label="Cantidad" required error={e('quantity')}>
                  {(p) => <TextInput {...p} type="number" min={0} step="any" value={l.quantity || ''} onChange={(ev) => setLine(i, { quantity: Number(ev.target.value) })} />}
                </Field>
                <Field label="Precio unitario" required error={e('unitPrice')} className="xl:col-span-2">
                  {(p) => <TextInput {...p} type="number" min={0} step="0.01" inputMode="decimal" value={l.unitPrice || ''} onChange={(ev) => setLine(i, { unitPrice: Number(ev.target.value) })} />}
                </Field>
                <Field label="OC" error={e('purchaseOrderId')}>
                  {(p) => (
                    <SelectInput {...p} value={l.purchaseOrderId ?? ''} disabled={!l.serviceId} onChange={(ev) => setLine(i, { purchaseOrderId: ev.target.value || undefined })}>
                      <option value="">Sin OC</option>
                      {pos.map((po) => (
                        <option key={po.id} value={po.id}>
                          {po.clientPoNumber}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                </Field>
                <Field label="Cotización" error={e('quotationId')} className="xl:col-span-2">
                  {(p) => (
                    <SelectInput {...p} value={l.quotationId ?? ''} disabled={!l.serviceId} onChange={(ev) => setLine(i, { quotationId: ev.target.value || undefined })}>
                      <option value="">Sin cotización</option>
                      {quotes.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.number} v{q.version}
                          {q.supersededById ? ' (reemplazada)' : ''}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                </Field>
              </div>
              <div className="mt-[10px] flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
                <span className={cn(b && !b.eligible ? 'text-warning' : 'text-muted')}>
                  {l.reimbursable
                    ? 'Reintegro de gastos: no consume montos aprobados.'
                    : b
                      ? b.eligible
                        ? `Facturable disponible: ${fmt(b.remaining[cur as CurrencyCode] ?? 0, cur)} (ya facturado ${fmt(b.billed[cur as CurrencyCode] ?? 0, cur)})`
                        : `No facturable todavía: ${b.missing.join(' · ')}`
                      : 'Elegí el servicio facturado.'}
                </span>
                <span className="flex items-center gap-[10px]">
                  <span className="tabular font-semibold text-ink">{fmt(lineSubtotal({ quantity: l.quantity || 0, unitPrice: l.unitPrice || 0 }), cur)}</span>
                  <Button size="sm" variant="secondary" className="h-[30px] px-[10px] text-[12.5px]" aria-label={`Quitar línea ${i + 1}`} onClick={() => patch({ lines: input.lines.filter((_, j) => j !== i) })}>
                    <Trash2 aria-hidden className="size-[13px]" strokeWidth={2} />
                  </Button>
                </span>
              </div>
            </section>
          )
        })}
        <div>
          <Button size="sm" variant="outline" onClick={() => patch({ lines: [...input.lines, { description: '', quantity: 1, unitPrice: 0 }] })}>
            <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
            Agregar línea
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-[10px]">
        <p className="text-[13.5px] font-medium text-ink-secondary">Impuestos (según corresponda)</p>
        {input.taxes.map((t, i) => (
          <div key={i} className="grid items-end gap-[10px] sm:grid-cols-[1fr_140px_auto]">
            <Field label="Concepto" error={errors[`taxes.${i}.label`]}>
              {(p) => <TextInput {...p} value={t.label} onChange={(ev) => patch({ taxes: input.taxes.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)) })} placeholder="Ej.: IVA 21 %" />}
            </Field>
            <Field label="Alícuota (%)" error={errors[`taxes.${i}.ratePct`]}>
              {(p) => <TextInput {...p} type="number" min={0} max={100} step="any" value={t.ratePct} onChange={(ev) => patch({ taxes: input.taxes.map((x, j) => (j === i ? { ...x, ratePct: Number(ev.target.value) } : x)) })} />}
            </Field>
            <Button size="sm" variant="secondary" className="h-[46px]" aria-label="Quitar impuesto" onClick={() => patch({ taxes: input.taxes.filter((_, j) => j !== i) })}>
              <Trash2 aria-hidden className="size-[15px]" strokeWidth={2} />
            </Button>
          </div>
        ))}
        <div>
          <Button size="sm" variant="outline" onClick={() => patch({ taxes: [...input.taxes, { label: '', ratePct: 21 }] })}>
            <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
            Agregar impuesto
          </Button>
        </div>
        <p className="text-[12px] text-muted">SIGR no determina impuestos: los conceptos y alícuotas los define quien factura.</p>
      </div>

      <dl className="ml-auto w-full max-w-[340px] rounded-panel bg-surface-muted px-[16px] py-[12px] text-[14px]">
        <div className="flex justify-between py-[4px]">
          <dt className="text-ink-secondary">Subtotal</dt>
          <dd className="tabular font-medium">{fmt(totals.subtotal, cur)}</dd>
        </div>
        {totals.taxes.map((t) => (
          <div key={t.id} className="flex justify-between py-[4px]">
            <dt className="text-ink-secondary">{t.label || 'Impuesto'}</dt>
            <dd className="tabular">{fmt(t.amount, cur)}</dd>
          </div>
        ))}
        <div className="mt-[6px] flex justify-between border-t border-line pt-[8px] text-[16px]">
          <dt className="font-semibold">Total</dt>
          <dd className="tabular font-semibold">{fmt(totals.total, cur)}</dd>
        </div>
      </dl>

      <Field label="Notas" error={errors.notes}>
        {(p) => <TextArea {...p} value={input.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} maxLength={2000} className="min-h-[70px]" />}
      </Field>
    </div>
  )
}
