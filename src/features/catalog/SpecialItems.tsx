import { Pencil, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, FormError, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { priceUnitLabel } from '@/config/commercial'
import { getServiceType } from '@/config/serviceCatalog'
import { itemSubtotal, regularItems, specialItemsOf } from '@/domain/commercial/catalog'
import { isAuthorizer } from '@/domain/commercial/quotations'
import { specialItemLock, specialItemStatus, type SpecialItemInput } from '@/domain/commercial/specialItems'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import type { PriceUnit, Project, ProjectService, ServiceItem } from '@/types/domain'

/**
 * Phase 5.0B — project-specific scope of a contracted service: its own
 * description and special sub-services (outside the catalog and the tariff).
 */
export function ServiceScope({ service: s, project, ws }: { service: ProjectService; project: Project; ws: Workspace }) {
  const [editingDescription, setEditingDescription] = useState(false)
  const [itemModal, setItemModal] = useState<{ item?: ServiceItem }>()
  const [approving, setApproving] = useState<ServiceItem>()
  const user = useCurrentUser()
  const closed = project.operationalStatus === 'completed' || project.operationalStatus === 'cancelled'
  const regular = regularItems(s)
  const specials = specialItemsOf(s)
  const label = getServiceType(s.typeId).label

  return (
    <section aria-label={`Alcance de ${label}`} className="mt-[14px] flex flex-col gap-[10px] rounded-panel bg-surface-muted px-[16px] py-[14px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[240px]">
          <p className="text-[13px] font-medium text-muted">Descripción del servicio en este proyecto</p>
          {s.description ? (
            <p className="mt-[2px] whitespace-pre-line text-[14px] leading-[1.45]">{s.description}</p>
          ) : (
            <p className="mt-[2px] text-[14px] text-subtle">Sin descripción específica. Se usa en las cotizaciones.</p>
          )}
          {(s.descriptionHistory?.length ?? 0) > 0 && (
            <p className="mt-[2px] text-[12px] text-muted">
              {s.descriptionHistory!.length} {s.descriptionHistory!.length === 1 ? 'cambio' : 'cambios'} · último {formatDateTime(s.descriptionHistory!.at(-1)!.at)}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-[32px] px-[12px] text-[13px]" onClick={() => setEditingDescription(true)}>
          <Pencil aria-hidden className="size-[14px]" strokeWidth={1.9} />
          {s.description ? 'Editar descripción' : 'Agregar descripción'}
        </Button>
      </div>

      <div className="border-t border-line pt-[10px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-muted">
            Subservicios {regular.length > 0 && `· ${regular.map((i) => `${i.name} ×${i.quantity}`).join(' · ')}`}
          </p>
          {!closed && (
            <Button size="sm" variant="outline" className="h-[32px] px-[12px] text-[13px]" onClick={() => setItemModal({})}>
              <Plus aria-hidden className="size-[14px]" strokeWidth={2} />
              Subservicio especial
            </Button>
          )}
        </div>
        {specials.length > 0 && (
          <ul className="mt-[8px] flex flex-col gap-[6px]" aria-label={`Subservicios especiales de ${label}`}>
            {specials.map((i) => {
              const st = specialItemStatus(ws.dataset, project, i)
              const lock = specialItemLock(ws.dataset, i.id)
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-[12px] gap-y-[6px] rounded-[14px] border border-dashed border-accent/40 bg-surface px-[12px] py-[9px]">
                  <Sparkles aria-hidden className="size-[15px] shrink-0 text-accent-strong" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1 basis-[220px]">
                    <span className="flex flex-wrap items-center gap-[8px]">
                      <span className="font-medium">{i.name}</span>
                      <span className="rounded-full bg-accent-soft px-[8px] py-[1px] text-[11.5px] font-medium text-accent-strong">Especial</span>
                      <span className={cn('text-[12px] font-medium', st.approved ? 'text-success' : 'text-warning')}>{st.label}</span>
                    </span>
                    <span className="block text-[12.5px] text-muted">
                      {i.quantity} × {formatMoney(i.unitPrice, i.currency ?? project.currency)} {priceUnitLabel[i.unit]} · {i.special?.reason}
                      {i.special?.description && ` · ${i.special.description}`}
                    </span>
                  </span>
                  <span className="tabular text-[14px] font-semibold">{formatMoney(itemSubtotal(i), i.currency ?? project.currency)}</span>
                  <span className="flex gap-[6px]">
                    {!st.approved && st.channel === 'explicit' && isAuthorizer(user?.id ?? '') && (
                      <Button size="sm" variant="outline" className="h-[30px] px-[10px] text-[12.5px]" onClick={() => setApproving(i)}>
                        Aprobar
                      </Button>
                    )}
                    {!lock && !i.special?.approvalRef && !closed && (
                      <Button size="sm" variant="secondary" className="h-[30px] px-[10px] text-[12.5px]" aria-label={`Editar ${i.name}`} onClick={() => setItemModal({ item: i })}>
                        Editar
                      </Button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <DescriptionModal open={editingDescription} onClose={() => setEditingDescription(false)} service={s} />
      <SpecialItemModal state={itemModal} onClose={() => setItemModal(undefined)} service={s} project={project} ws={ws} />
      <ApproveSpecialModal item={approving} onClose={() => setApproving(undefined)} service={s} />
    </section>
  )
}

function Footer({ onClose, busy, label, extra }: { onClose: () => void; busy: boolean; label: string; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-end gap-[10px] border-t border-line pt-[14px]">
      {extra}
      <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
        Cancelar
      </Button>
      <Button size="sm" type="submit" disabled={busy}>
        {label}
      </Button>
    </div>
  )
}

function DescriptionModal({ open, onClose, service }: { open: boolean; onClose: () => void; service: ProjectService }) {
  return (
    <Modal open={open} onClose={onClose} title={`Descripción de ${getServiceType(service.typeId).label}`} description="Propia de este proyecto: no cambia el catálogo ni los precios. Se copia a las nuevas cotizaciones." size="sm">
      {open && <DescriptionForm service={service} onClose={onClose} />}
    </Modal>
  )
}

function DescriptionForm({ service, onClose }: { service: ProjectService; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [text, setText] = useState(service.description ?? '')
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => actions.setServiceDescription(service.id, text), { title: 'Descripción guardada' })) onClose()
      }}
    >
      <FormError message={formError} />
      <Field label="Descripción" error={errors.description} hint="Ej.: búsqueda en zona norte, hasta tres habitaciones, con coordinación de visitas.">
        {(p) => <TextArea {...p} rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />}
      </Field>
      {(service.descriptionHistory?.length ?? 0) > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted">Historial ({service.descriptionHistory!.length})</summary>
          <ul className="mt-[6px] flex flex-col gap-[6px]">
            {[...service.descriptionHistory!].reverse().map((h, i) => (
              <li key={i} className="rounded-[12px] bg-surface-muted px-[10px] py-[7px]">
                <span className="block text-[12px] text-muted">Antes del {formatDateTime(h.at)}</span>
                {h.previous ?? <span className="text-subtle">(sin descripción)</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <Footer onClose={onClose} busy={busy} label="Guardar descripción" />
    </form>
  )
}

function SpecialItemModal({ state, onClose, service, project, ws }: { state?: { item?: ServiceItem }; onClose: () => void; service: ProjectService; project: Project; ws: Workspace }) {
  const label = getServiceType(service.typeId).label
  return (
    <Modal
      open={Boolean(state)}
      onClose={onClose}
      title={state?.item ? `Editar ${state.item.name}` : `Subservicio especial en ${label}`}
      description="Exclusivo de este proyecto: no se agrega al catálogo ni al tarifario del cliente."
      size="md"
    >
      {state && <SpecialItemForm item={state.item} service={service} project={project} ws={ws} onClose={onClose} />}
    </Modal>
  )
}

const channelHint = {
  explicit: 'Requiere aprobación comercial explícita (la OC abierta no lo autoriza). Si ya la tenés, cargá la referencia.',
  quotation: 'Se aprueba al incluirlo en una cotización aprobada por el cliente (y su OC, si corresponde).',
  none: 'La política del cliente no exige aprobación previa.',
} as const

function SpecialItemForm({ item, service, project, ws, onClose }: { item?: ServiceItem; service: ProjectService; project: Project; ws: Workspace; onClose: () => void }) {
  const actions = useActions()
  const user = useCurrentUser()
  const { run, busy, errors, formError } = useCommand()
  const [input, setInput] = useState<SpecialItemInput>(() => ({
    name: item?.name ?? '',
    description: item?.special?.description ?? '',
    quantity: item?.quantity ?? 1,
    unit: item?.unit ?? 'service',
    unitPrice: item?.unitPrice ?? 0,
    currency: project.currency,
    reason: item?.special?.reason ?? '',
    approvalRef: '',
  }))
  const set = (p: Partial<SpecialItemInput>) => setInput((x) => ({ ...x, ...p }))
  const channel = item ? undefined : specialItemStatus(ws.dataset, project, { id: '', catalogItemId: '', name: '', unit: 'service', quantity: 1, unitPrice: 0, source: 'special', special: { reason: '', createdAt: '', createdBy: '' } }).channel
  const canApprove = channel === 'explicit' && isAuthorizer(user?.id ?? '')
  const submit = () =>
    item
      ? run(() => actions.updateSpecialItem(service.id, item.id, { ...input, approvalRef: undefined } as Omit<SpecialItemInput, 'approvalRef'>), { title: 'Subservicio especial actualizado' })
      : run(() => actions.addSpecialItem(service.id, { ...input, approvalRef: canApprove ? input.approvalRef : undefined }), { title: 'Subservicio especial agregado' })
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await submit()) onClose()
      }}
    >
      <FormError message={formError} />
      <div className="grid gap-[14px] sm:grid-cols-2">
        <Field label="Nombre" required error={errors.name} className="sm:col-span-2">
          {(p) => <TextInput {...p} value={input.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} />}
        </Field>
        <Field label="Descripción" error={errors.description} className="sm:col-span-2">
          {(p) => <TextArea {...p} rows={2} value={input.description} onChange={(e) => set({ description: e.target.value })} maxLength={500} />}
        </Field>
        <Field label="Cantidad" required error={errors.quantity}>
          {(p) => <TextInput {...p} type="number" min={0} step="any" value={input.quantity || ''} onChange={(e) => set({ quantity: Number(e.target.value) })} />}
        </Field>
        <Field label="Unidad">
          {(p) => (
            <SelectInput {...p} value={input.unit} onChange={(e) => set({ unit: e.target.value as PriceUnit })}>
              {(Object.keys(priceUnitLabel) as PriceUnit[]).map((u) => (
                <option key={u} value={u}>
                  {priceUnitLabel[u]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Precio unitario" required error={errors.unitPrice}>
          {(p) => <TextInput {...p} inputMode="decimal" value={input.unitPrice || ''} onChange={(e) => set({ unitPrice: Number(e.target.value.replace(',', '.')) })} />}
        </Field>
        <Field label="Moneda" error={errors.currency} hint="La del proyecto: no se convierte.">
          {(p) => (
            <SelectInput {...p} value={input.currency} disabled>
              <option value={project.currency}>{project.currency}</option>
            </SelectInput>
          )}
        </Field>
        <Field label="Motivo o justificación" required error={errors.reason} className="sm:col-span-2">
          {(p) => <TextInput {...p} value={input.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={500} />}
        </Field>
        {canApprove && (
          <Field label="Referencia de aprobación comercial" error={errors.approvalRef} className="sm:col-span-2" hint="Opcional: acta, enmienda de OC o email del cliente. Sin referencia queda pendiente.">
            {(p) => <TextInput {...p} value={input.approvalRef} onChange={(e) => set({ approvalRef: e.target.value })} maxLength={160} />}
          </Field>
        )}
      </div>
      <p className="rounded-[14px] bg-surface-muted px-[12px] py-[10px] text-[13px] text-ink-secondary">
        Total: <span className="tabular font-semibold text-ink">{formatMoney(itemSubtotal({ unitPrice: input.unitPrice || 0, quantity: input.quantity || 0 }), project.currency)}</span>
        {channel && ` · ${channelHint[channel]}`}
      </p>
      <Footer
        onClose={onClose}
        busy={busy}
        label={item ? 'Guardar cambios' : 'Agregar subservicio'}
        extra={
          item && (
            <Button
              size="sm"
              variant="outline"
              className="mr-auto"
              disabled={busy}
              onClick={async () => {
                if (await run(() => actions.removeSpecialItem(service.id, item.id), { title: 'Subservicio especial quitado' })) onClose()
              }}
            >
              Quitar
            </Button>
          )
        }
      />
    </form>
  )
}

function ApproveSpecialModal({ item, onClose, service }: { item?: ServiceItem; onClose: () => void; service: ProjectService }) {
  return (
    <Modal open={Boolean(item)} onClose={onClose} title={item ? `Aprobar ${item.name}` : ''} description="Registrá la aprobación o modificación comercial explícita del cliente." size="sm">
      {item && <ApproveForm item={item} service={service} onClose={onClose} />}
    </Modal>
  )
}

function ApproveForm({ item, service, onClose }: { item: ServiceItem; service: ProjectService; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [ref, setRef] = useState('')
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => actions.approveSpecialItem(service.id, item.id, ref), { title: 'Subservicio aprobado' })) onClose()
      }}
    >
      <FormError message={formError} />
      <Field label="Referencia de aprobación" required error={errors.approvalRef} hint="Acta, enmienda de la OC o email del cliente.">
        {(p) => <TextInput {...p} value={ref} onChange={(e) => setRef(e.target.value)} maxLength={160} />}
      </Field>
      <Footer onClose={onClose} busy={busy} label="Registrar aprobación" />
    </form>
  )
}
