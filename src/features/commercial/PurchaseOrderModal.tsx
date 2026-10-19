import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { DEMO_TODAY } from '@/config/brand'
import { purchaseOrderPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { randomId } from '@/domain/context'
import { round2 } from '@/domain/commercial/money'
import { availableToAuthorize, serviceCaps, type PurchaseOrderInput } from '@/domain/commercial/purchaseOrders'
import { authorizedByService } from '@/domain/commercial/quotations'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/format'
import type { CurrencyCode, Project, PurchaseOrder } from '@/types/domain'

interface Props {
  open: boolean
  onClose: () => void
  workspace: Workspace
  project: Project
  /** Edit an existing PO… */
  purchaseOrder?: PurchaseOrder
  /** …or create one in response to this approved quotation. */
  quotationId?: string
}

export function PurchaseOrderModal(props: Props) {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.purchaseOrder ? `Editar OC ${props.purchaseOrder.clientPoNumber}` : 'Registrar orden de compra'}
      description="Una OC puede autorizar varios servicios, total o parcialmente, sin superar lo aprobado."
      size="lg"
    >
      {props.open && <PurchaseOrderForm {...props} />}
    </Modal>
  )
}

function PurchaseOrderForm({ onClose, workspace: ws, project, purchaseOrder: po, quotationId }: Props) {
  const actions = useActions()
  const navigate = useNavigate()
  const { run, busy, errors, formError } = useCommand()
  const [requestId] = useState(() => randomId('req'))
  const caps = useMemo(() => serviceCaps(ws.dataset, project.id), [ws.dataset, project.id])
  const currencies = [...new Set([...caps.values()].flatMap((a) => Object.keys(a)))] as CurrencyCode[]
  const approved = ws.quotations.filter((q) => q.projectId === project.id && q.status === 'approved' && !q.supersededById)

  const [input, setInput] = useState<PurchaseOrderInput>(() => ({
    projectId: project.id,
    clientPoNumber: po?.clientPoNumber ?? '',
    quotationId: po?.quotationId ?? quotationId ?? approved[0]?.id ?? '',
    issueDate: po?.issueDate ?? DEMO_TODAY,
    receivedDate: po?.receivedDate ?? DEMO_TODAY,
    currency: po?.currency ?? currencies[0] ?? project.currency,
    authorizedAmount: po?.authorizedAmount ?? 0,
    allocations: po?.allocations.map((a) => ({ serviceId: a.serviceId, amount: a.amount, notes: a.notes })) ?? [],
    notes: po?.notes ?? '',
  }))
  const patch = (p: Partial<PurchaseOrderInput>) => setInput((i) => ({ ...i, ...p }))
  const currency = input.currency as CurrencyCode

  const available = useMemo(() => (currency ? availableToAuthorize(ws.dataset, project.id, currency, po?.id) : new Map<string, number>()), [ws.dataset, project.id, currency, po?.id])
  const others = useMemo(() => authorizedByService(ws.dataset, project.id, po?.id), [ws.dataset, project.id, po?.id])
  const rows = project.services.filter((s) => (caps.get(s.id)?.[currency] ?? 0) > 0)
  const amountFor = (serviceId: string) => input.allocations.find((a) => a.serviceId === serviceId)?.amount ?? 0
  /** Functional update: consecutive quick edits never overwrite each other. */
  const setAmount = (serviceId: string, amount: number) =>
    setInput((i) => {
      const rest = i.allocations.filter((x) => x.serviceId !== serviceId)
      return { ...i, allocations: amount > 0 || Number.isNaN(amount) ? [...rest, { serviceId, amount }] : rest }
    })
  const allocated = round2(input.allocations.reduce((s, a) => s + (Number.isFinite(a.amount) ? a.amount : 0), 0))
  const free = round2((input.authorizedAmount || 0) - allocated)

  const save = async () => {
    const ordered = { ...input, allocations: project.services.map((s) => input.allocations.find((a) => a.serviceId === s.id)).filter((a): a is NonNullable<typeof a> => Boolean(a)) }
    if (po) {
      const ok = await run(() => actions.updatePurchaseOrder(po.id, ordered), { title: 'Orden de compra actualizada' })
      if (ok) onClose()
      return
    }
    const result = await run(() => actions.createPurchaseOrder(ordered, requestId), { title: 'Orden de compra registrada', description: input.clientPoNumber })
    if (result) {
      onClose()
      navigate(purchaseOrderPath(result.poId))
    }
  }

  const errorFor = (serviceId: string) => {
    const idx = [...project.services.map((s) => input.allocations.find((a) => a.serviceId === s.id)).filter(Boolean)].findIndex((a) => a?.serviceId === serviceId)
    return idx >= 0 ? errors[`allocations.${idx}.amount`] : undefined
  }

  if (currencies.length === 0) {
    return (
      <div className="flex flex-col gap-[14px]">
        <p className="rounded-[14px] bg-warning-soft px-[14px] py-[12px] text-[14px] text-warning">
          No hay trabajo comercial aprobado para autorizar. Aprobá una cotización del proyecto antes de registrar una OC.
        </p>
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="flex flex-col gap-[16px]"
    >
      <FormError message={formError} />
      <div className="grid gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
        <Field label="N.º de OC del cliente" required error={errors.clientPoNumber}>
          {(p) => <TextInput {...p} data-autofocus value={input.clientPoNumber} onChange={(e) => patch({ clientPoNumber: e.target.value })} maxLength={40} />}
        </Field>
        <Field label="Cotización aprobada" error={errors.quotationId}>
          {(p) => (
            <SelectInput {...p} value={input.quotationId ?? ''} onChange={(e) => patch({ quotationId: e.target.value })}>
              <option value="">Sin cotización asociada</option>
              {approved.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.number} v{q.version}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Moneda" required error={errors.currency}>
          {(p) => (
            <SelectInput {...p} value={input.currency} onChange={(e) => patch({ currency: e.target.value as CurrencyCode, allocations: [] })}>
              {currencies.map((c) => (
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
        <Field label="Fecha de recepción" required error={errors.receivedDate}>
          {(p) => <DateInput {...p} value={input.receivedDate} max={DEMO_TODAY} onChange={(e) => patch({ receivedDate: e.target.value })} />}
        </Field>
        <Field label={`Monto autorizado (${currency})`} required error={errors.authorizedAmount}>
          {(p) => (
            <TextInput {...p} type="number" min={0} step="any" inputMode="decimal" value={input.authorizedAmount || ''} onChange={(e) => patch({ authorizedAmount: Number(e.target.value) })} />
          )}
        </Field>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-[13.5px] font-medium text-ink-secondary">Asignación por servicio</p>
          <p className={cn('tabular text-[13px]', free < 0 ? 'font-semibold text-danger' : 'text-muted')} aria-live="polite">
            Asignado {formatCurrency(allocated, currency, { decimals: 2 })} de {formatCurrency(input.authorizedAmount || 0, currency, { decimals: 2 })}
            {free > 0 && ` · ${formatCurrency(free, currency, { decimals: 2 })} sin asignar`}
            {free < 0 && ' · excede la OC'}
          </p>
        </div>
        {errors.allocations && <FormError message={errors.allocations} />}
        <div className="mt-[8px] flex flex-col gap-[8px] rounded-panel bg-surface-muted p-[8px]">
          {rows.map((s) => {
            const cap = caps.get(s.id)?.[currency] ?? 0
            const other = others.get(s.id)?.[currency] ?? 0
            const avail = available.get(s.id) ?? 0
            return (
              <div key={s.id} className="grid items-center gap-[10px] rounded-[14px] bg-surface px-[12px] py-[10px] md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_180px]">
                <span className="flex min-w-0 items-center gap-[10px]">
                  <ServiceChip type={s.typeId} />
                  <span className="truncate text-[14px] font-medium">{getServiceType(s.typeId).label}</span>
                </span>
                <span className="text-[12.5px] text-muted">
                  Aprobado <span className="tabular block text-[13.5px] text-ink">{formatCurrency(cap, currency)}</span>
                </span>
                <span className="text-[12.5px] text-muted">
                  Otras OC <span className="tabular block text-[13.5px] text-ink">{formatCurrency(other, currency)}</span>
                </span>
                <span className="text-[12.5px] text-muted">
                  Disponible <span className={cn('tabular block text-[13.5px]', avail <= 0 ? 'text-muted' : 'font-semibold text-ink')}>{formatCurrency(avail, currency)}</span>
                </span>
                <span className="flex items-start gap-[6px]">
                  <Field label={`Asignar a ${getServiceType(s.typeId).label}`} error={errorFor(s.id)} className="flex-1 [&>label]:sr-only">
                    {(p) => (
                      <TextInput
                        {...p}
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        placeholder="0"
                        value={amountFor(s.id) || ''}
                        disabled={avail <= 0 && amountFor(s.id) === 0}
                        onChange={(e) => setAmount(s.id, e.target.value === '' ? 0 : Number(e.target.value))}
                      />
                    )}
                  </Field>
                  {avail > 0 && amountFor(s.id) !== avail && (
                    <Button size="sm" variant="secondary" className="h-[46px] px-[10px] text-[12.5px]" onClick={() => setAmount(s.id, avail)} title="Asignar todo lo disponible">
                      Máx.
                    </Button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <Field label="Notas" error={errors.notes}>
        {(p) => <TextArea {...p} value={input.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} maxLength={2000} className="min-h-[70px]" />}
      </Field>
      <div className="sticky bottom-0 -mx-[22px] -mb-[20px] flex flex-wrap justify-end gap-[10px] border-t border-line bg-surface px-[22px] py-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : po ? 'Guardar cambios' : 'Registrar OC'}
        </Button>
      </div>
    </form>
  )
}
