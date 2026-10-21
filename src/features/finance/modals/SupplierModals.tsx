import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, Switch, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { DEMO_TODAY } from '@/config/brand'
import { countryOptions } from '@/config/countries'
import { costCategoryLabel, paymentConditionLabel, supplierKindLabel } from '@/config/finance'
import { supplierPath } from '@/config/navigation'
import { activeServiceTypes, getServiceType } from '@/config/serviceCatalog'
import { randomId } from '@/domain/context'
import { addDays } from '@/domain/dates'
import type { CostInput } from '@/domain/finance/costs'
import type { ObligationInput } from '@/domain/finance/obligations'
import { agreementUsage, type AgreementInput, type SupplierInput } from '@/domain/finance/suppliers'
import { subMoney } from '@/domain/finance/money'
import { useActions } from '@/hooks/useActions'
import type { SharingInput } from '@/domain/finance/batches'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import type { CostCategory, CountryCode, CurrencyCode, PaymentCondition, Supplier, SupplierKind } from '@/types/domain'

function Footer({ onClose, busy, label }: { onClose: () => void; busy: boolean; label: string }) {
  return (
    <div className="sticky bottom-0 -mx-[22px] -mb-[20px] flex justify-end gap-[10px] border-t border-line bg-surface px-[22px] py-[14px]">
      <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
        Cancelar
      </Button>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? 'Guardando…' : label}
      </Button>
    </div>
  )
}

function CurrencySelect({ value, onChange, error, label = 'Moneda' }: { value: string; onChange: (c: CurrencyCode) => void; error?: string; label?: string }) {
  return (
    <Field label={label} required error={error}>
      {(p) => (
        <SelectInput {...p} value={value} onChange={(e) => onChange(e.target.value as CurrencyCode)}>
          <option value="">Elegí</option>
          {CURRENCY_ORDER.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectInput>
      )}
    </Field>
  )
}

function ProjectServiceFields({
  ws,
  projectId,
  serviceId,
  onChange,
  errors,
  allowNone,
}: {
  ws: Workspace
  projectId?: string
  serviceId?: string
  onChange: (p: { projectId?: string; serviceId?: string }) => void
  errors: Record<string, string>
  allowNone?: string
}) {
  const project = projectId ? ws.projectById.get(projectId) : undefined
  return (
    <>
      <Field label="Proyecto" required={!allowNone} error={errors.projectId}>
        {(p) => (
          <SelectInput {...p} value={projectId ?? ''} onChange={(e) => onChange({ projectId: e.target.value || undefined, serviceId: undefined })}>
            <option value="">{allowNone ?? 'Elegí un proyecto'}</option>
            {[...ws.projects]
              .sort((a, b) => b.code.localeCompare(a.code))
              .map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.code} · {ws.personById.get(pr.beneficiaryId)?.name}
                </option>
              ))}
          </SelectInput>
        )}
      </Field>
      <Field label="Servicio" error={errors.serviceId}>
        {(p) => (
          <SelectInput {...p} value={serviceId ?? ''} disabled={!project} onChange={(e) => onChange({ projectId, serviceId: e.target.value || undefined })}>
            <option value="">{project ? 'Sin servicio específico' : 'Primero elegí un proyecto'}</option>
            {project?.services.map((s) => (
              <option key={s.id} value={s.id}>
                {getServiceType(s.typeId).label}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
    </>
  )
}

/* ───────────────────────── Supplier ───────────────────────── */

export function SupplierFormModal({ open, onClose, supplier }: { open: boolean; onClose: () => void; workspace?: Workspace; supplier?: Supplier }) {
  return (
    <Modal open={open} onClose={onClose} title={supplier ? `Editar ${supplier.name}` : 'Nuevo proveedor'} description="Datos ficticios únicamente: no cargues datos bancarios reales en la demo." size="lg">
      {open && <SupplierForm onClose={onClose} supplier={supplier} />}
    </Modal>
  )
}

function SupplierForm({ onClose, supplier }: { onClose: () => void; supplier?: Supplier }) {
  const actions = useActions()
  const navigate = useNavigate()
  const { run, busy, errors, formError } = useCommand()
  const [requestId] = useState(() => randomId('req'))
  const [input, setInput] = useState<SupplierInput>(() => ({
    name: supplier?.name ?? '',
    kind: supplier?.kind ?? 'company',
    country: supplier?.country ?? '',
    contactName: supplier?.contactName ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    preferredCurrency: supplier?.preferredCurrency ?? '',
    categories: supplier?.categories ?? [],
    paymentDetails: supplier?.paymentDetails ?? '',
    defaultPaymentCondition: supplier?.defaultPaymentCondition ?? 'due-date',
    active: supplier?.active ?? true,
    notes: supplier?.notes ?? '',
  }))
  const patch = (p: Partial<SupplierInput>) => setInput((i) => ({ ...i, ...p }))

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (supplier) {
          const ok = await run(() => actions.updateSupplier(supplier.id, input), { title: 'Proveedor actualizado' })
          if (ok) onClose()
        } else {
          const r = await run(() => actions.createSupplier(input, requestId), { title: 'Proveedor creado' })
          if (r) {
            onClose()
            navigate(supplierPath(r.supplierId))
          }
        }
      }}
      className="flex flex-col gap-[16px]"
    >
      <FormError message={formError} />
      <div className="grid gap-[14px] sm:grid-cols-2">
        <Field label="Nombre" required error={errors.name}>
          {(p) => <TextInput {...p} data-autofocus value={input.name} onChange={(e) => patch({ name: e.target.value })} maxLength={100} />}
        </Field>
        <Field label="Tipo">
          {(p) => (
            <SelectInput {...p} value={input.kind} onChange={(e) => patch({ kind: e.target.value as SupplierKind })}>
              {(Object.keys(supplierKindLabel) as SupplierKind[]).map((k) => (
                <option key={k} value={k}>
                  {supplierKindLabel[k]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="País" required error={errors.country}>
          {(p) => (
            <SelectInput {...p} value={input.country} onChange={(e) => patch({ country: e.target.value as CountryCode })}>
              <option value="">Elegí un país</option>
              {countryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <CurrencySelect label="Moneda preferida" value={input.preferredCurrency} onChange={(c) => patch({ preferredCurrency: c })} error={errors.preferredCurrency} />
        <Field label="Contacto">{(p) => <TextInput {...p} value={input.contactName ?? ''} onChange={(e) => patch({ contactName: e.target.value })} maxLength={80} />}</Field>
        <Field label="Email" error={errors.email}>
          {(p) => <TextInput {...p} type="email" value={input.email ?? ''} onChange={(e) => patch({ email: e.target.value })} maxLength={120} />}
        </Field>
        <Field label="Teléfono">{(p) => <TextInput {...p} value={input.phone ?? ''} onChange={(e) => patch({ phone: e.target.value })} maxLength={40} />}</Field>
        <Field label="Condición de pago por defecto">
          {(p) => (
            <SelectInput {...p} value={input.defaultPaymentCondition} onChange={(e) => patch({ defaultPaymentCondition: e.target.value as PaymentCondition })}>
              {(Object.keys(paymentConditionLabel) as PaymentCondition[]).map((c) => (
                <option key={c} value={c}>
                  {paymentConditionLabel[c]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Datos de pago" error={errors.paymentDetails} hint="Marcador: sin datos bancarios reales." className="sm:col-span-2">
          {(p) => <TextInput {...p} value={input.paymentDetails ?? ''} onChange={(e) => patch({ paymentDetails: e.target.value })} maxLength={200} />}
        </Field>
      </div>
      <div>
        <p className="mb-[6px] text-[13.5px] font-medium text-ink-secondary">
          Categorías de servicio<span className="ml-[3px] text-accent">*</span>
        </p>
        <div role="group" aria-label="Categorías de servicio" className="flex flex-wrap gap-[6px]">
          {activeServiceTypes().map((t) => {
            const on = input.categories.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => patch({ categories: on ? input.categories.filter((c) => c !== t.id) : [...input.categories, t.id] })}
                className={cn('h-[32px] rounded-full border px-[12px] text-[13px] transition-colors', on ? 'border-contrast bg-contrast text-on-contrast' : 'border-line text-ink-secondary hover:bg-surface-muted')}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        {errors.categories && <p className="mt-[6px] text-[12.5px] font-medium text-danger">{errors.categories}</p>}
      </div>
      <Switch checked={input.active} onChange={(v) => patch({ active: v })} label="Proveedor activo" description="Los inactivos no admiten nuevas obligaciones." />
      <Field label="Notas" error={errors.notes}>
        {(p) => <TextArea {...p} value={input.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} maxLength={2000} className="min-h-[64px]" />}
      </Field>
      <Footer onClose={onClose} busy={busy} label={supplier ? 'Guardar cambios' : 'Crear proveedor'} />
    </form>
  )
}

/* ───────────────────────── Agreement ───────────────────────── */

export function AgreementModal({ supplier, onClose, workspace }: { supplier?: Supplier; onClose: () => void; workspace: Workspace }) {
  return (
    <Modal open={Boolean(supplier)} onClose={onClose} title="Nuevo acuerdo" description="Monto pactado con el proveedor por un trabajo. Es una estimación: no es un costo incurrido ni una deuda." size="md">
      {supplier && <AgreementForm supplier={supplier} onClose={onClose} ws={workspace} />}
    </Modal>
  )
}

function AgreementForm({ supplier, onClose, ws }: { supplier: Supplier; onClose: () => void; ws: Workspace }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [input, setInput] = useState<AgreementInput>({
    supplierId: supplier.id,
    projectId: '',
    description: '',
    currency: supplier.preferredCurrency,
    agreedAmount: 0,
    paymentCondition: supplier.defaultPaymentCondition,
    notes: '',
  })
  const patch = (p: Partial<AgreementInput>) => setInput((i) => ({ ...i, ...p }))
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.createAgreement(input), { title: 'Acuerdo registrado' })
        if (ok) onClose()
      }}
      className="flex flex-col gap-[14px]"
    >
      <FormError message={formError} />
      <div className="grid gap-[14px] sm:grid-cols-2">
        <ProjectServiceFields ws={ws} projectId={input.projectId} serviceId={input.serviceId} onChange={(p) => patch({ projectId: p.projectId ?? '', serviceId: p.serviceId })} errors={errors} />
        <Field label="Descripción del trabajo" required error={errors.description} className="sm:col-span-2">
          {(p) => <TextInput {...p} value={input.description} onChange={(e) => patch({ description: e.target.value })} maxLength={160} />}
        </Field>
        <CurrencySelect value={input.currency} onChange={(c) => patch({ currency: c })} error={errors.currency} />
        <Field label="Monto acordado" required error={errors.agreedAmount}>
          {(p) => <TextInput {...p} type="number" min={0} step="0.01" value={input.agreedAmount || ''} onChange={(e) => patch({ agreedAmount: Number(e.target.value) })} />}
        </Field>
        <Field label="Condición de pago" className="sm:col-span-2" hint="Si el pago depende del cobro al cliente, queda explícito y no se asume por defecto.">
          {(p) => (
            <SelectInput {...p} value={input.paymentCondition} onChange={(e) => patch({ paymentCondition: e.target.value as PaymentCondition })}>
              {(Object.keys(paymentConditionLabel) as PaymentCondition[]).map((c) => (
                <option key={c} value={c}>
                  {paymentConditionLabel[c]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
      </div>
      <Footer onClose={onClose} busy={busy} label="Registrar acuerdo" />
    </form>
  )
}

/* ───────────────────────── Cost ───────────────────────── */

export function CostModal({ open, onClose, workspace, projectId, scope = 'project' }: { open: boolean; onClose: () => void; workspace: Workspace; projectId?: string; scope?: 'project' | 'company' }) {
  return (
    <Modal open={open} onClose={onClose} title="Registrar costo" description="Costo efectivamente incurrido. Las estimaciones se cargan en los servicios y acuerdos." size="md">
      {open && <CostForm onClose={onClose} ws={workspace} projectId={projectId} initialScope={scope} />}
    </Modal>
  )
}

function CostForm({ onClose, ws, projectId, initialScope }: { onClose: () => void; ws: Workspace; projectId?: string; initialScope: 'project' | 'company' }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [input, setInput] = useState<CostInput>({
    scope: initialScope,
    projectId,
    category: initialScope === 'company' ? 'general-expense' : 'other-direct',
    description: '',
    currency: projectId ? (ws.projectById.get(projectId)?.currency ?? '') : '',
    amount: 0,
    date: DEMO_TODAY,
    notes: '',
    period: DEMO_TODAY.slice(0, 7),
    overheadCategory: '',
    paymentStatus: 'pending',
  })
  const patch = (p: Partial<CostInput>) => setInput((i) => ({ ...i, ...p }))
  const overheadCategories = [...new Set(['Software', 'Honorarios administrativos', 'Servicios profesionales', 'Comisiones bancarias', 'Gastos de oficina', ...ws.costs.map((c) => c.overheadCategory).filter((x): x is string => Boolean(x))])]
  const categories = (Object.keys(costCategoryLabel) as CostCategory[]).filter((c) => (input.scope === 'company' ? c === 'general-expense' : c !== 'general-expense'))

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.recordCost(input), { title: 'Costo registrado' })
        if (ok) onClose()
      }}
      className="flex flex-col gap-[14px]"
    >
      <FormError message={formError} />
      {!projectId && (
        <div role="radiogroup" aria-label="Tipo de costo" className="grid grid-cols-2 gap-[6px] rounded-full bg-surface-muted p-[4px]">
          {(
            [
              ['project', 'Directo de un proyecto'],
              ['company', 'Gasto general de la empresa'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={input.scope === v}
              onClick={() => patch({ scope: v, projectId: undefined, serviceId: undefined, category: v === 'company' ? 'general-expense' : 'other-direct' })}
              className={cn('h-[38px] rounded-full text-[13.5px] transition-colors', input.scope === v ? 'bg-surface text-ink shadow-pill' : 'text-ink-secondary hover:text-ink')}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-[14px] sm:grid-cols-2">
        {input.scope === 'project' && !projectId && <ProjectServiceFields ws={ws} projectId={input.projectId} serviceId={input.serviceId} onChange={(p) => patch(p)} errors={errors} />}
        {input.scope === 'project' && projectId && (
          <Field label="Servicio" error={errors.serviceId} className="sm:col-span-2">
            {(p) => (
              <SelectInput {...p} value={input.serviceId ?? ''} onChange={(e) => patch({ serviceId: e.target.value || undefined })}>
                <option value="">Sin servicio específico</option>
                {ws.projectById.get(projectId)?.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getServiceType(s.typeId).label}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}
        {input.scope === 'company' && (
          <>
            <Field label="Categoría del gasto" error={errors.overheadCategory} hint="Editable: elegí una sugerida o escribí otra.">
              {(p) => (
                <>
                  <TextInput {...p} list="overhead-categories" value={input.overheadCategory ?? ''} onChange={(e) => patch({ overheadCategory: e.target.value })} maxLength={60} />
                  <datalist id="overhead-categories">
                    {overheadCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Mes / período contable" required error={errors.period}>
              {(p) => <TextInput {...p} type="month" value={input.period ?? ''} onChange={(e) => patch({ period: e.target.value })} />}
            </Field>
            <Field label="Estado">
              {(p) => (
                <SelectInput {...p} value={input.paymentStatus} onChange={(e) => patch({ paymentStatus: e.target.value as 'pending' | 'paid' })}>
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagado</option>
                </SelectInput>
              )}
            </Field>
            {input.paymentStatus === 'paid' && (
              <>
                <Field label="Fecha de pago" required error={errors.paidAt}>
                  {(p) => <DateInput {...p} value={input.paidAt ?? ''} max={DEMO_TODAY} onChange={(e) => patch({ paidAt: e.target.value })} />}
                </Field>
                <Field label="Referencia de pago">{(p) => <TextInput {...p} value={input.paymentRef ?? ''} onChange={(e) => patch({ paymentRef: e.target.value })} maxLength={60} />}</Field>
              </>
            )}
          </>
        )}
        {input.scope === 'project' && (
        <Field label="Categoría" error={errors.category}>
          {(p) => (
            <SelectInput {...p} value={input.category} onChange={(e) => patch({ category: e.target.value as CostCategory })}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {costCategoryLabel[c]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        )}
        <Field label="Proveedor (opcional)" error={errors.supplierId}>
          {(p) => (
            <SelectInput {...p} value={input.supplierId ?? ''} onChange={(e) => patch({ supplierId: e.target.value || undefined })}>
              <option value="">Sin proveedor</option>
              {ws.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Concepto" required error={errors.description} className="sm:col-span-2">
          {(p) => <TextInput {...p} value={input.description} onChange={(e) => patch({ description: e.target.value })} maxLength={160} />}
        </Field>
        <CurrencySelect value={input.currency} onChange={(c) => patch({ currency: c })} error={errors.currency} />
        <Field label="Importe" required error={errors.amount}>
          {(p) => <TextInput {...p} type="number" min={0} step="0.01" value={input.amount || ''} onChange={(e) => patch({ amount: Number(e.target.value) })} />}
        </Field>
        <Field label="Fecha" required error={errors.date}>
          {(p) => <DateInput {...p} value={input.date} max={DEMO_TODAY} onChange={(e) => patch({ date: e.target.value })} />}
        </Field>
        {input.scope === 'company' && <SharingFields ws={ws} value={input.sharing} onChange={(sharing) => patch({ sharing })} errors={errors} />}
        {input.scope === 'company' && (
          <Field label="Observaciones" className="sm:col-span-2">
            {(p) => <TextInput {...p} value={input.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} maxLength={300} />}
          </Field>
        )}
      </div>
      {errors.costClosure && <FormError message="Los costos del proyecto están cerrados: reabrilos antes de continuar." />}
      <Footer onClose={onClose} busy={busy} label={input.scope === 'company' ? 'Registrar gasto general' : 'Registrar costo'} />
    </form>
  )
}

/* ───────────────────────── Obligation ───────────────────────── */

export function ObligationModal({ open, onClose, workspace, supplierId, projectId }: { open: boolean; onClose: () => void; workspace: Workspace; supplierId?: string; projectId?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Registrar obligación con proveedor" description="Lo que se le debe al proveedor (normalmente su factura). Registrarla no es pagarla." size="lg">
      {open && <ObligationForm onClose={onClose} ws={workspace} supplierId={supplierId} projectId={projectId} />}
    </Modal>
  )
}

function ObligationForm({ onClose, ws, supplierId, projectId }: { onClose: () => void; ws: Workspace; supplierId?: string; projectId?: string }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [requestId] = useState(() => randomId('req'))
  const presetSupplier = supplierId ? ws.supplierById.get(supplierId) : undefined
  const [input, setInput] = useState<ObligationInput>({
    supplierId: supplierId ?? '',
    reference: '',
    projectId,
    category: presetSupplier?.kind === 'professional' ? 'professional-services' : 'supplier-fee',
    description: '',
    issueDate: DEMO_TODAY,
    dueDate: addDays(DEMO_TODAY, 15),
    currency: presetSupplier?.preferredCurrency ?? (projectId ? (ws.projectById.get(projectId)?.currency ?? '') : ''),
    amount: 0,
    paymentCondition: presetSupplier?.defaultPaymentCondition ?? 'due-date',
    approve: true,
    notes: '',
  })
  const patch = (p: Partial<ObligationInput>) => setInput((i) => ({ ...i, ...p }))
  const agreements = ws.agreements.filter((a) => a.supplierId === input.supplierId && (!input.projectId || a.projectId === input.projectId))
  const agreement = input.agreementId ? ws.agreements.find((a) => a.id === input.agreementId) : undefined
  const clientInvoices = ws.invoices.filter((i) => i.lifecycle !== 'cancelled' && (!input.projectId || i.projectId === input.projectId))
  const activeSuppliers = ws.suppliers.filter((s) => s.active)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.createObligation(input, requestId), { title: 'Obligación registrada' })
        if (ok) onClose()
      }}
      className="flex flex-col gap-[16px]"
    >
      <FormError message={formError} />
      <div className="grid gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Proveedor" required error={errors.supplierId}>
          {(p) => (
            <SelectInput
              {...p}
              data-autofocus
              value={input.supplierId}
              disabled={Boolean(supplierId)}
              onChange={(e) => {
                const s = ws.supplierById.get(e.target.value)
                patch({ supplierId: e.target.value, agreementId: undefined, currency: s?.preferredCurrency ?? input.currency, paymentCondition: s?.defaultPaymentCondition ?? 'due-date' })
              }}
            >
              <option value="">Elegí un proveedor</option>
              {activeSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="N.º de comprobante del proveedor" required error={errors.reference}>
          {(p) => <TextInput {...p} value={input.reference} onChange={(e) => patch({ reference: e.target.value })} maxLength={40} />}
        </Field>
        <Field label="Categoría de costo" error={errors.category}>
          {(p) => (
            <SelectInput {...p} value={input.category} onChange={(e) => patch({ category: e.target.value as CostCategory })}>
              {(Object.keys(costCategoryLabel) as CostCategory[]).map((c) => (
                <option key={c} value={c}>
                  {costCategoryLabel[c]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        {projectId ? (
          <Field label="Servicio" error={errors.serviceId}>
            {(p) => (
              <SelectInput {...p} value={input.serviceId ?? ''} onChange={(e) => patch({ serviceId: e.target.value || undefined })}>
                <option value="">Sin servicio específico</option>
                {ws.projectById.get(projectId)?.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getServiceType(s.typeId).label}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        ) : (
          <ProjectServiceFields ws={ws} projectId={input.projectId} serviceId={input.serviceId} onChange={(p) => patch({ ...p, agreementId: undefined, category: p.projectId ? (input.category === 'general-expense' ? 'supplier-fee' : input.category) : 'general-expense' })} errors={errors} allowNone="Gasto general (sin proyecto)" />
        )}
        {agreements.length > 0 && (
          <Field label="Acuerdo" error={errors.agreementId}>
            {(p) => (
              <SelectInput
                {...p}
                value={input.agreementId ?? ''}
                onChange={(e) => {
                  const a = ws.agreements.find((x) => x.id === e.target.value)
                  patch(a ? { agreementId: a.id, projectId: a.projectId, serviceId: a.serviceId, currency: a.currency, paymentCondition: a.paymentCondition, description: a.description } : { agreementId: undefined })
                }}
              >
                <option value="">Sin acuerdo</option>
                {agreements.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.description} · {formatCurrency(a.agreedAmount, a.currency)}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}
        <Field label="Descripción" required error={errors.description} className="sm:col-span-2 xl:col-span-3">
          {(p) => <TextInput {...p} value={input.description} onChange={(e) => patch({ description: e.target.value })} maxLength={160} />}
        </Field>
        <CurrencySelect value={input.currency} onChange={(c) => patch({ currency: c })} error={errors.currency} />
        <Field
          label="Importe"
          required
          error={errors.amount}
          hint={agreement ? `Acordado ${formatCurrency(agreement.agreedAmount, agreement.currency)} · disponible ${formatCurrency(subMoney(agreement.agreedAmount, agreementUsage(ws.dataset, agreement.id)), agreement.currency)}` : undefined}
        >
          {(p) => <TextInput {...p} type="number" min={0} step="0.01" value={input.amount || ''} onChange={(e) => patch({ amount: Number(e.target.value) })} />}
        </Field>
        <Field label="Emisión" required error={errors.issueDate}>
          {(p) => <DateInput {...p} value={input.issueDate} max={DEMO_TODAY} onChange={(e) => patch({ issueDate: e.target.value })} />}
        </Field>
        <Field label="Vencimiento" required error={errors.dueDate}>
          {(p) => <DateInput {...p} value={input.dueDate} min={input.issueDate} onChange={(e) => patch({ dueDate: e.target.value })} />}
        </Field>
        <Field label="Condición de pago">
          {(p) => (
            <SelectInput {...p} value={input.paymentCondition} onChange={(e) => patch({ paymentCondition: e.target.value as PaymentCondition })}>
              {(Object.keys(paymentConditionLabel) as PaymentCondition[]).map((c) => (
                <option key={c} value={c}>
                  {paymentConditionLabel[c]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        {input.paymentCondition === 'after-client-collection' && (
          <Field label="Factura del cliente que habilita el pago" required error={errors.clientInvoiceId}>
            {(p) => (
              <SelectInput {...p} value={input.clientInvoiceId ?? ''} onChange={(e) => patch({ clientInvoiceId: e.target.value || undefined })}>
                <option value="">Elegí la factura</option>
                {clientInvoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number} · {ws.projectById.get(i.projectId)?.code}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}
      </div>
      <Switch checked={Boolean(input.approve)} onChange={(v) => patch({ approve: v })} label="Aprobar ahora" description="Solo las obligaciones aprobadas pueden pagarse." />
      <Field label="Notas">{(p) => <TextArea {...p} value={input.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} maxLength={1000} className="min-h-[64px]" />}</Field>
      <Footer onClose={onClose} busy={busy} label="Registrar obligación" />
    </form>
  )
}

/**
 * Shared Eugenia–Florencia split for a general expense. Percentages are set PER
 * EXPENSE (no global default); a previous expense's split can be reused, and the
 * effective % is stored on this record.
 */
export function SharingFields({ ws, value, onChange, errors }: { ws: Workspace; value?: SharingInput; onChange: (v: SharingInput | undefined) => void; errors: Record<string, string> }) {
  const partners = ws.suppliers.filter((s) => s.kind === 'professional')
  const previous = ws.costs.filter((c) => c.sharing).sort((a, b) => b.date.localeCompare(a.date))
  const set = (p: Partial<SharingInput>) => onChange({ partnerSupplierId: value?.partnerSupplierId ?? partners.find((x) => x.id === 'sup_florencia')?.id ?? partners[0]?.id ?? '', partnerPct: value?.partnerPct ?? 0, ownerPct: value?.ownerPct ?? 0, reference: value?.reference, ...p })
  return (
    <div className="flex flex-col gap-[10px] rounded-panel bg-surface-muted p-[10px] sm:col-span-2">
      <label className="flex items-center gap-[10px] text-[13.5px] font-medium">
        <input type="checkbox" className="size-[16px] accent-[var(--color-ink)]" checked={Boolean(value)} onChange={(e) => (e.target.checked ? set({}) : onChange(undefined))} />
        Gasto compartido Eugenia – Florencia
      </label>
      {value && (
        <div className="grid gap-[10px] sm:grid-cols-2">
          {previous.length > 0 && (
            <Field label="Reutilizar distribución de un gasto anterior" className="sm:col-span-2">
              {(p) => (
                <SelectInput
                  {...p}
                  value=""
                  onChange={(e) => {
                    const c = previous.find((x) => x.id === e.target.value)
                    if (c?.sharing) set({ partnerSupplierId: c.sharing.partnerSupplierId, partnerPct: c.sharing.partnerPct, ownerPct: c.sharing.ownerPct })
                  }}
                >
                  <option value="">Elegí un gasto…</option>
                  {previous.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.description} · {c.sharing!.partnerPct}/{c.sharing!.ownerPct}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
          )}
          <Field label="Socia" error={errors['sharing.partnerSupplierId']}>
            {(p) => (
              <SelectInput {...p} value={value.partnerSupplierId} onChange={(e) => set({ partnerSupplierId: e.target.value })}>
                {partners.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Referencia / comprobante">{(p) => <TextInput {...p} value={value.reference ?? ''} onChange={(e) => set({ reference: e.target.value })} maxLength={120} />}</Field>
          <Field label="% Florencia" required error={errors['sharing.partnerPct']}>
            {(p) => (
              <TextInput
                {...p}
                inputMode="decimal"
                value={value.partnerPct || ''}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(',', '.'))
                  set({ partnerPct: v, ownerPct: Number.isFinite(v) ? Math.round((100 - v) * 100) / 100 : value.ownerPct })
                }}
              />
            )}
          </Field>
          <Field label="% Eugenia" required error={errors['sharing.ownerPct']} hint="Deben sumar 100%.">
            {(p) => <TextInput {...p} inputMode="decimal" value={value.ownerPct || ''} onChange={(e) => set({ ownerPct: Number(e.target.value.replace(',', '.')) })} />}
          </Field>
        </div>
      )}
    </div>
  )
}
