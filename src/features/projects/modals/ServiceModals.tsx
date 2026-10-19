import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, Switch, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { ServiceTypeGrid } from '@/components/ui/ServiceTypeGrid'
import { DEMO_TODAY } from '@/config/brand'
import { getServiceType } from '@/config/serviceCatalog'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatCurrency } from '@/lib/format'
import type { Project, ProjectService } from '@/types/domain'
import { referencePrice } from '../pricing'

function SupplierSelect({ ws, typeId, value, onChange, error }: { ws: Workspace; typeId: string; value: string; onChange: (v: string) => void; error?: string }) {
  const suppliers = useMemo(() => {
    const matching = ws.suppliers.filter((s) => s.categories.includes(typeId))
    return matching.length ? matching : ws.suppliers
  }, [ws.suppliers, typeId])
  return (
    <Field label="Proveedor" error={error} hint={getServiceType(typeId).usesSupplier ? 'Opcional — servicios que suelen tercerizarse.' : 'Opcional.'}>
      {(p) => (
        <SelectInput {...p} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Gestión interna (sin proveedor)</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectInput>
      )}
    </Field>
  )
}

function StaffSelect({ ws, value, onChange, label, error }: { ws: Workspace; value: string; onChange: (v: string) => void; label: string; error?: string }) {
  return (
    <Field label={label} required error={error}>
      {(p) => (
        <SelectInput {...p} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Elegí un responsable</option>
          {ws.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.role}
            </option>
          ))}
        </SelectInput>
      )}
    </Field>
  )
}

function Footer({ onClose, busy, label }: { onClose: () => void; busy: boolean; label: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-[10px] border-t border-line pt-[14px]">
      <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
        Cancelar
      </Button>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? 'Guardando…' : label}
      </Button>
    </div>
  )
}

/* ───────────────────────── Add service ───────────────────────── */

export function AddServiceModal({ open, onClose, project, workspace }: { open: boolean; onClose: () => void; project: Project; workspace: Workspace }) {
  return (
    <Modal open={open} onClose={onClose} title="Agregar servicio" description={`${project.code} · cada servicio tiene su propio workflow, responsable y fechas.`} size="lg">
      {open && <AddServiceForm onClose={onClose} project={project} ws={workspace} />}
    </Modal>
  )
}

function AddServiceForm({ onClose, project, ws }: { onClose: () => void; project: Project; ws: Workspace }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [typeId, setTypeId] = useState('')
  const [ownerId, setOwnerId] = useState(project.ownerId)
  const [supplierId, setSupplierId] = useState('')
  const [startDate, setStartDate] = useState(DEMO_TODAY > project.startDate ? DEMO_TODAY : project.startDate)
  const [dueDate, setDueDate] = useState(project.targetDate)
  const [startNow, setStartNow] = useState(true)
  const ref = typeId ? referencePrice(ws, project, typeId) : undefined

  const submit = async () => {
    const ok = await run(() => actions.addService(project.id, { typeId, ownerId, supplierId, startDate, dueDate, startNow }), {
      title: 'Servicio agregado',
      description: typeId ? getServiceType(typeId).label : undefined,
    })
    if (ok) onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-[16px]"
    >
      <FormError message={formError} />
      <div>
        <p className="mb-[8px] text-[13.5px] font-medium text-ink-secondary">
          Tipo de servicio<span className="ml-[3px] text-accent">*</span>
        </p>
        <ServiceTypeGrid label="Tipo de servicio" selected={typeId ? [typeId] : []} onToggle={setTypeId} existing={project.services.map((s) => s.typeId)} />
        {errors.typeId && <p className="mt-[6px] text-[12.5px] font-medium text-danger">{errors.typeId}</p>}
      </div>
      <div className="grid gap-[14px] sm:grid-cols-2">
        <StaffSelect ws={ws} label="Responsable" value={ownerId} onChange={setOwnerId} error={errors.ownerId} />
        <SupplierSelect ws={ws} typeId={typeId} value={supplierId} onChange={setSupplierId} error={errors.supplierId} />
        <Field label="Inicio" required error={errors.startDate}>
          {(p) => <DateInput {...p} value={startDate} min={project.startDate} onChange={(e) => setStartDate(e.target.value)} />}
        </Field>
        <Field label="Vencimiento" required error={errors.dueDate} hint={`Hasta ${project.targetDate.split('-').reverse().join('/')} (fin del proyecto)`}>
          {(p) => <DateInput {...p} value={dueDate} max={project.targetDate} onChange={(e) => setDueDate(e.target.value)} />}
        </Field>
      </div>
      <Switch checked={startNow} onChange={setStartNow} label="Iniciar workflow ahora" description="La primera etapa queda en curso y se crean sus tareas." />
      {ref && (
        <p className="rounded-[14px] bg-surface-muted px-[14px] py-[10px] text-[13px] text-ink-secondary">
          {ref.price !== undefined ? (
            <>
              Precio de referencia según «{ref.listName}»: <span className="tabular font-semibold">{formatCurrency(ref.price, project.currency)}</span>. El
              precio comercial se fija en la cotización.
            </>
          ) : (
            <>Hay {ref.resolution.candidates.length} tarifas superpuestas para este servicio: el precio se definirá al cotizar.</>
          )}
        </p>
      )}
      <Footer onClose={onClose} busy={busy} label="Agregar servicio" />
    </form>
  )
}

/* ───────────────────────── Edit service ───────────────────────── */

export function EditServiceModal({ service, onClose, project, workspace }: { service?: ProjectService; onClose: () => void; project: Project; workspace: Workspace }) {
  return (
    <Modal open={Boolean(service)} onClose={onClose} title={service ? `Editar ${getServiceType(service.typeId).label}` : 'Editar servicio'} size="md">
      {service && <EditServiceForm key={service.id} service={service} onClose={onClose} project={project} ws={workspace} />}
    </Modal>
  )
}

function EditServiceForm({ service, onClose, project, ws }: { service: ProjectService; onClose: () => void; project: Project; ws: Workspace }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [ownerId, setOwnerId] = useState(service.ownerId)
  const [supplierId, setSupplierId] = useState(service.supplierId ?? '')
  const [startDate, setStartDate] = useState(service.startDate)
  const [dueDate, setDueDate] = useState(service.dueDate)
  const [price, setPrice] = useState(service.price?.toString() ?? '')
  const [cost, setCost] = useState(service.estimatedCost?.toString() ?? '')

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
  const submit = async () => {
    const ok = await run(
      () => actions.updateService(service.id, { ownerId, supplierId, startDate, dueDate, price: num(price), estimatedCost: num(cost) }),
      { title: 'Servicio actualizado' },
    )
    if (ok) onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-[14px]"
    >
      <FormError message={formError} />
      <div className="grid gap-[14px] sm:grid-cols-2">
        <StaffSelect ws={ws} label="Responsable" value={ownerId} onChange={setOwnerId} error={errors.ownerId} />
        <SupplierSelect ws={ws} typeId={service.typeId} value={supplierId} onChange={setSupplierId} error={errors.supplierId} />
        <Field label="Inicio" required error={errors.startDate}>
          {(p) => <DateInput {...p} value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
        </Field>
        <Field label="Vencimiento" required error={errors.dueDate}>
          {(p) => <DateInput {...p} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
        </Field>
        <Field label={`Precio acordado (${project.currency})`} error={errors.price} hint="Referencia; sin cálculos en esta fase.">
          {(p) => <TextInput {...p} type="number" min={0} step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}
        </Field>
        <Field label={`Costo estimado (${project.currency})`} error={errors.estimatedCost}>
          {(p) => <TextInput {...p} type="number" min={0} step="any" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />}
        </Field>
      </div>
      <Footer onClose={onClose} busy={busy} label="Guardar cambios" />
    </form>
  )
}
