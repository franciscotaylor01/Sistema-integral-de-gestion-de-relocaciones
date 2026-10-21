import { CalendarClock, Copy, FilePenLine, Stamp } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DateInput, Field, FormError, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Timeline } from '@/components/ui/Timeline'
import { DEMO_TODAY } from '@/config/brand'
import { invoiceKindLabel } from '@/config/finance'
import { formatFiscalNumber, type EmissionInput } from '@/domain/finance/emission'
import { invoiceTotals, lineSubtotal } from '@/domain/finance/derive'
import { subMoney } from '@/domain/finance/money'
import { BUSINESS_DAY_POLICY, computeDueDate, resolvePaymentTerms } from '@/domain/finance/terms'
import { activityKindMeta } from '@/features/projects/activityMeta'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import type { Invoice, InvoiceKind, PaymentDayType } from '@/types/domain'
import { copyText } from './copy'

const dayTypeLabel: Record<PaymentDayType, string> = { calendar: 'días corridos', business: 'días hábiles' }
const sourceLabel = { 'purchase-order': 'OC del proyecto', 'open-order': 'OC abierta', client: 'Condición del cliente', manual: 'Condición manual documentada' } as const

function orderRefs(ws: Workspace, inv: Invoice) {
  const open = [...new Set(inv.lines.map((l) => l.openOrderId).filter(Boolean))].map((id) => ws.openOrders.find((o) => o.id === id)?.number).filter(Boolean)
  const pos = [...new Set(inv.lines.map((l) => l.purchaseOrderId).filter(Boolean))].map((id) => ws.purchaseOrderById.get(id!)?.clientPoNumber).filter(Boolean)
  const certs = [...new Set(inv.lines.map((l) => l.certificateId).filter(Boolean))].map((id) => {
    const c = ws.certificates.find((x) => x.id === id)
    return c ? (c.externalNumber ?? c.number) : undefined
  })
  return { orders: [...open, ...pos] as string[], certs: certs.filter(Boolean) as string[] }
}

/* ───────────── Preparation (data to copy into ARCA) ───────────── */

export function PrepareInvoiceCard({ ws, inv }: { ws: Workspace; inv: Invoice }) {
  const { notify } = useToast()
  const client = ws.clientById.get(inv.clientId)
  const issuer = ws.legalEntities.find((e) => e.id === inv.issuerId)
  const project = ws.projectById.get(inv.projectId)
  const refs = orderRefs(ws, inv)
  const t = invoiceTotals(inv)
  const m = (v: number) => formatMoney(v, inv.currency)
  const fields: [string, string][] = [
    ['Emisor', issuer?.name ?? '—'],
    ['Cliente', client?.name ?? '—'],
    ['Razón social', client?.legalName ?? '—'],
    ['Identificación fiscal', client?.taxId || 'No informada en SIGR'],
    ['Domicilio de facturación', client?.billingAddress || 'No informado en SIGR'],
    ['Proyecto', project ? `${project.code}` : '—'],
    ['OC (n.º oficial)', refs.orders.join(', ') || 'Sin OC'],
    ['Certificado aprobado', refs.certs.join(', ') || 'No aplica'],
    ['Moneda', inv.currency],
  ]
  const lineText = inv.lines.map((l) => `${l.description}\t${l.quantity}\t${l.unitPrice}\t${lineSubtotal(l)}`)
  const all = [...fields.map(([k, v]) => `${k}: ${v}`), '', 'Descripción\tCantidad\tPrecio unitario\tImporte', ...lineText, '', `Subtotal comercial: ${t.subtotal}`, `Total comercial: ${t.total}`].join('\n')
  const copy = async (text: string, what: string) => notify({ title: (await copyText(text)) ? `${what} copiado` : 'No se pudo copiar' })
  return (
    <Card aria-labelledby="prep-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="prep-title"
        title="Preparar factura"
        description="Datos para emitir el comprobante en el sistema externo (ARCA). SIGR no emite facturas fiscales."
        action={
          <Button size="sm" variant="outline" onClick={() => copy(all, 'Resumen')}>
            <Copy aria-hidden className="size-[15px]" strokeWidth={1.9} />
            Copiar todo
          </Button>
        }
      />
      <dl className="mt-[16px] grid gap-[6px] sm:grid-cols-2">
        {fields.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2 rounded-[12px] bg-surface-muted px-[12px] py-[8px] text-[13.5px]">
            <span className="min-w-0">
              <dt className="text-[12px] text-muted">{k}</dt>
              <dd className={cn('truncate font-medium', v.startsWith('No informad') && 'font-normal text-warning')}>{v}</dd>
            </span>
            <button type="button" aria-label={`Copiar ${k}`} onClick={() => copy(v, k)} className="grid size-[28px] shrink-0 place-items-center rounded-full text-ink-secondary hover:bg-surface">
              <Copy aria-hidden className="size-[13px]" strokeWidth={1.9} />
            </button>
          </div>
        ))}
      </dl>
      <div className="mt-[12px] overflow-x-auto rounded-panel bg-surface-muted p-[8px]">
        <table className="w-full min-w-[520px] text-[13.5px]">
          <thead>
            <tr className="text-left text-[12px] text-muted">
              <th className="px-[8px] py-[6px] font-normal">Descripción</th>
              <th className="px-[8px] py-[6px] text-right font-normal">Cant.</th>
              <th className="px-[8px] py-[6px] text-right font-normal">Precio unit.</th>
              <th className="px-[8px] py-[6px] text-right font-normal">Importe</th>
              <th className="w-[36px]" />
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-[8px] py-[7px] font-medium">{l.description}</td>
                <td className="tabular px-[8px] py-[7px] text-right">{l.quantity}</td>
                <td className="tabular px-[8px] py-[7px] text-right">{m(l.unitPrice)}</td>
                <td className="tabular px-[8px] py-[7px] text-right font-semibold">{m(lineSubtotal(l))}</td>
                <td>
                  <button type="button" aria-label={`Copiar línea ${i + 1}`} onClick={() => copy(lineText[i], 'Línea')} className="grid size-[28px] place-items-center rounded-full text-ink-secondary hover:bg-surface">
                    <Copy aria-hidden className="size-[13px]" strokeWidth={1.9} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto mt-[10px] w-full max-w-[340px] text-[14px]">
        <div className="flex justify-between py-[3px]">
          <dt className="text-ink-secondary">Subtotal comercial</dt>
          <dd className="tabular font-medium">{m(t.subtotal)}</dd>
        </div>
        <div className="flex justify-between py-[3px]">
          <dt className="font-semibold">Total comercial</dt>
          <dd className="tabular font-semibold">{m(t.total)}</dd>
        </div>
      </dl>
      <p className="mt-[10px] rounded-[14px] bg-info-soft px-[12px] py-[9px] text-[12.5px] leading-[1.5] text-info">
        IVA, alícuotas, tipo de cambio y demás importes fiscales se determinan al emitir el comprobante en ARCA. SIGR no los calcula: registralos al confirmar la emisión.
      </p>
    </Card>
  )
}

/* ───────────── Confirm / record / correct emission ───────────── */

export type EmissionMode = 'confirm' | 'record' | 'correct'
const modeCopy: Record<EmissionMode, { title: string; label: string; description: string }> = {
  confirm: { title: 'Confirmar emisión externa', label: 'Confirmar emisión', description: 'Registrá los datos del comprobante ya emitido en ARCA. Hasta confirmar, la factura no se considera emitida.' },
  record: { title: 'Registrar datos fiscales', label: 'Registrar datos', description: 'Factura histórica emitida antes de esta versión: completá los datos del comprobante. Su vencimiento original se conserva.' },
  correct: { title: 'Corregir datos fiscales', label: 'Guardar corrección', description: 'La corrección queda en el historial con el valor anterior y el motivo.' },
}

export function EmissionModal({ ws, inv, mode, onClose }: { ws: Workspace; inv: Invoice; mode?: EmissionMode; onClose: () => void }) {
  return (
    <Modal open={Boolean(mode)} onClose={onClose} title={mode ? modeCopy[mode].title : ''} description={mode ? modeCopy[mode].description : undefined} size="md">
      {mode && <EmissionForm ws={ws} inv={inv} mode={mode} onClose={onClose} />}
    </Modal>
  )
}

function EmissionForm({ ws, inv, mode, onClose }: { ws: Workspace; inv: Invoice; mode: EmissionMode; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const fx = inv.fiscal
  const commercial = invoiceTotals(inv).total
  const [input, setInput] = useState<EmissionInput>({
    voucherType: fx?.voucherType ?? inv.kind,
    pointOfSale: fx?.pointOfSale ?? '',
    number: fx?.number ?? '',
    issueDate: fx?.issueDate ?? DEMO_TODAY,
    total: fx?.total ?? commercial,
    currency: inv.currency,
    notes: fx?.notes ?? '',
    reference: fx?.reference ?? '',
  })
  const [manual, setManual] = useState({ days: '', dayType: 'calendar' as PaymentDayType, reason: '' })
  const [reason, setReason] = useState('')
  const patch = (p: Partial<EmissionInput>) => setInput((i) => ({ ...i, ...p }))
  const resolved = mode === 'confirm' ? resolvePaymentTerms(ws.dataset, inv) : undefined
  const terms = mode === 'confirm' ? (resolved ?? (manual.days ? { days: Number(manual.days), dayType: manual.dayType } : undefined)) : inv.paymentTerms
  const due = terms && /^\d{4}-\d{2}-\d{2}$/.test(input.issueDate) ? computeDueDate(input.issueDate, terms) : undefined
  const diff = Number.isFinite(input.total) ? subMoney(input.total, commercial) : 0
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        const payload: EmissionInput = { ...input, manualTerms: mode === 'confirm' && !resolved ? { days: Number(manual.days), dayType: manual.dayType, reason: manual.reason } : undefined }
        const ok = await run(
          () => (mode === 'confirm' ? actions.confirmInvoiceEmission(inv.id, payload) : mode === 'record' ? actions.recordFiscalData(inv.id, payload) : actions.correctFiscalData(inv.id, payload, reason)),
          { title: mode === 'confirm' ? 'Emisión registrada' : mode === 'record' ? 'Datos fiscales registrados' : 'Corrección registrada' },
        )
        if (ok) onClose()
      }}
    >
      <FormError message={formError} />
      <div className="grid gap-[12px] sm:grid-cols-3">
        <Field label="Tipo de comprobante" required error={errors.voucherType}>
          {(p) => (
            <SelectInput {...p} value={input.voucherType} onChange={(e) => patch({ voucherType: e.target.value as InvoiceKind })}>
              {(Object.keys(invoiceKindLabel) as InvoiceKind[]).map((k) => (
                <option key={k} value={k}>
                  {invoiceKindLabel[k]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Punto de venta" required error={errors.pointOfSale}>
          {(p) => <TextInput {...p} data-autofocus inputMode="numeric" value={input.pointOfSale} onChange={(e) => patch({ pointOfSale: e.target.value })} maxLength={5} />}
        </Field>
        <Field label="Número oficial" required error={errors.number}>
          {(p) => <TextInput {...p} inputMode="numeric" value={input.number} onChange={(e) => patch({ number: e.target.value })} maxLength={8} />}
        </Field>
        <Field label="Fecha real de emisión" required error={errors.issueDate}>
          {(p) => <DateInput {...p} value={input.issueDate} max={DEMO_TODAY} onChange={(e) => patch({ issueDate: e.target.value })} />}
        </Field>
        <Field label={`Total del comprobante (${inv.currency})`} required error={errors.total ?? errors.currency}>
          {(p) => <TextInput {...p} inputMode="decimal" value={Number.isFinite(input.total) ? input.total : ''} onChange={(e) => patch({ total: Number(e.target.value.replace(',', '.')) })} />}
        </Field>
        <Field label="Referencia / comprobante">
          {(p) => <TextInput {...p} value={input.reference} onChange={(e) => patch({ reference: e.target.value })} maxLength={120} placeholder="CAE, PDF, enlace…" />}
        </Field>
      </div>
      {diff !== 0 && (
        <p className="rounded-[14px] bg-surface-muted px-[12px] py-[9px] text-[13px] text-ink-secondary">
          El total fiscal difiere del total comercial ({formatMoney(commercial, inv.currency)}) en {formatMoney(diff, inv.currency)} (por ejemplo, impuestos). Verificá que coincida con el comprobante emitido.
        </p>
      )}
      {mode === 'confirm' && (
        <div className="rounded-[14px] bg-surface-muted px-[12px] py-[10px] text-[13.5px]">
          {resolved ? (
            <p>
              <span className="font-medium">Condición de pago:</span> {resolved.days} {dayTypeLabel[resolved.dayType]} desde la emisión · {sourceLabel[resolved.source]}
              {due && <span className="tabular"> → vence {formatDate(due)}</span>}
            </p>
          ) : (
            <div className="flex flex-col gap-[10px]">
              <p className="font-medium text-warning">Sin condición de pago en la OC ni en el cliente: indicala manualmente y documentá su origen.</p>
              <div className="grid gap-[10px] sm:grid-cols-3">
                <Field label="Plazo (días)" required error={errors.terms}>
                  {(p) => <TextInput {...p} inputMode="numeric" value={manual.days} onChange={(e) => setManual((x) => ({ ...x, days: e.target.value }))} />}
                </Field>
                <Field label="Tipo de días">
                  {(p) => (
                    <SelectInput {...p} value={manual.dayType} onChange={(e) => setManual((x) => ({ ...x, dayType: e.target.value as PaymentDayType }))}>
                      <option value="calendar">Corridos</option>
                      <option value="business">Hábiles</option>
                    </SelectInput>
                  )}
                </Field>
                <Field label="Origen documentado" required error={errors.termsReason}>
                  {(p) => <TextInput {...p} value={manual.reason} onChange={(e) => setManual((x) => ({ ...x, reason: e.target.value }))} maxLength={200} />}
                </Field>
              </div>
              {due && <p className="tabular">Vence {formatDate(due)}</p>}
            </div>
          )}
          {terms?.dayType === 'business' && <p className="mt-[4px] text-[12px] text-muted">{BUSINESS_DAY_POLICY}</p>}
        </div>
      )}
      <Field label="Observaciones" error={errors.notes}>
        {(p) => <TextArea {...p} value={input.notes} onChange={(e) => patch({ notes: e.target.value })} maxLength={1000} className="min-h-[60px]" />}
      </Field>
      {mode === 'correct' && (
        <Field label="Motivo de la corrección" required error={errors.reason}>
          {(p) => <TextInput {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}
        </Field>
      )}
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          {modeCopy[mode].label}
        </Button>
      </div>
    </form>
  )
}

/* ───────────── Fiscal data, terms and history ───────────── */

export function FiscalCard({ ws, inv, onEmission, onDue }: { ws: Workspace; inv: Invoice; onEmission: (m: EmissionMode) => void; onDue: () => void }) {
  const fx = inv.fiscal
  const t = inv.paymentTerms
  const refs = orderRefs(ws, inv)
  return (
    <Card aria-labelledby="fiscal-title" className="px-[20px] pb-[20px] pt-[20px]">
      <SectionTitle id="fiscal-title" size="sm" title="Comprobante fiscal" />
      {fx ? (
        <dl className="mt-[12px] grid grid-cols-2 gap-x-4 gap-y-[10px] text-[13.5px]">
          <div>
            <dt className="text-[12px] text-muted">Comprobante</dt>
            <dd className="tabular font-medium">
              {invoiceKindLabel[fx.voucherType]} {formatFiscalNumber(fx)}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Emisión real</dt>
            <dd className="tabular font-medium">{formatDate(fx.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Total fiscal</dt>
            <dd className="tabular font-medium">{formatMoney(fx.total, fx.currency)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Total comercial</dt>
            <dd className="tabular">{formatMoney(fx.commercialTotal, fx.currency)}</dd>
          </div>
          {fx.reference && (
            <div className="col-span-2">
              <dt className="text-[12px] text-muted">Referencia</dt>
              <dd className="truncate">{fx.reference}</dd>
            </div>
          )}
          {fx.notes && <p className="col-span-2 text-[12.5px] text-ink-secondary">{fx.notes}</p>}
        </dl>
      ) : (
        <p className="mt-[12px] rounded-[14px] bg-warning-soft px-[12px] py-[9px] text-[13px] text-warning">
          Factura emitida antes del registro fiscal en SIGR: no hay datos del comprobante confirmados. Su vencimiento original ({formatDate(inv.dueDate)}) se conserva.
        </p>
      )}
      <div className="mt-[12px] rounded-[14px] bg-surface-muted px-[12px] py-[9px] text-[13px]">
        <p>
          <span className="font-medium">Vencimiento:</span> <span className="tabular">{formatDate(inv.dueDate)}</span>
        </p>
        {t && (
          <p className="text-ink-secondary">
            {t.source === 'manual' && !t.days ? 'Condición manual' : `${t.days} ${dayTypeLabel[t.dayType]} desde la emisión`} · {sourceLabel[t.source]}
            {t.reason && ` (${t.reason})`}
            {t.exception && (
              <span className="block text-warning">
                Excepción: calculado {formatDate(t.computedDueDate)} → {formatDate(t.exception.dueDate)}. {t.exception.reason}
              </span>
            )}
          </p>
        )}
        {(refs.orders.length > 0 || refs.certs.length > 0) && (
          <p className="text-[12.5px] text-muted">
            {refs.orders.length > 0 && `OC ${refs.orders.join(', ')}`}
            {refs.certs.length > 0 && ` · Certificado ${refs.certs.join(', ')}`}
          </p>
        )}
      </div>
      {inv.lifecycle === 'issued' && (
        <div className="mt-[12px] flex flex-wrap gap-[8px]">
          <Button size="sm" variant="outline" onClick={() => onEmission(fx ? 'correct' : 'record')}>
            {fx ? <FilePenLine aria-hidden className="size-[15px]" strokeWidth={1.9} /> : <Stamp aria-hidden className="size-[15px]" strokeWidth={1.9} />}
            {fx ? 'Corregir datos fiscales' : 'Registrar datos fiscales'}
          </Button>
          <Button size="sm" variant="outline" onClick={onDue}>
            <CalendarClock aria-hidden className="size-[15px]" strokeWidth={1.9} />
            Modificar vencimiento
          </Button>
        </div>
      )}
    </Card>
  )
}

export function DueDateModal({ inv, open, onClose }: { inv: Invoice; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Modificar vencimiento" description="Excepción justificada: queda en el historial; la OC y el vencimiento calculado no se modifican." size="sm">
      {open && <DueForm inv={inv} onClose={onClose} />}
    </Modal>
  )
}

function DueForm({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [date, setDate] = useState(inv.dueDate)
  const [reason, setReason] = useState('')
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => actions.changeInvoiceDueDate(inv.id, date, reason), { title: 'Vencimiento modificado' })) onClose()
      }}
    >
      <FormError message={formError} />
      <Field label="Nuevo vencimiento" required error={errors.dueDate}>
        {(p) => <DateInput {...p} data-autofocus value={date} min={inv.issueDate} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <Field label="Motivo de la excepción" required error={errors.reason}>
        {(p) => <TextInput {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}
      </Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Guardar
        </Button>
      </div>
    </form>
  )
}

export function InvoiceHistoryCard({ ws, inv }: { ws: Workspace; inv: Invoice }) {
  if (!inv.history?.length) return null
  return (
    <Card aria-labelledby="inv-history" className="px-[20px] pb-[18px] pt-[20px]">
      <SectionTitle id="inv-history" size="sm" title="Historial de la factura" />
      <Timeline
        className="mt-[14px]"
        items={inv.history.map((h, i) => ({
          id: h.id,
          icon: activityKindMeta.finance.icon,
          highlight: i === 0,
          title: (
            <>
              <span className="font-medium">{h.action}</span>
              {h.detail && <span className="block text-[12.5px] text-ink-secondary">{h.detail}</span>}
            </>
          ),
          meta: ws.staffById.get(h.actorId)?.name,
          date: formatDateTime(h.date),
        }))}
      />
    </Card>
  )
}
