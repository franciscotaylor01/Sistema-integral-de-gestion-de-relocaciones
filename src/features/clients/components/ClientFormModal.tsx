import { Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Field, FormError, SelectInput, Switch, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { clientStatusMeta } from '@/config/catalogs'
import { billingMilestoneLabel } from '@/config/commercial'
import { countryOptions } from '@/config/countries'
import { clientPath } from '@/config/navigation'
import type { ClientInput, ContactInput } from '@/domain/commercial/clients'
import { randomId } from '@/domain/context'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { CURRENCY_ORDER } from '@/lib/money'
import type { BillingMilestone, Client, ClientStatus, CountryCode, CurrencyCode, PoMode } from '@/types/domain'

interface ClientFormModalProps {
  open: boolean
  onClose: () => void
  workspace: Workspace
  /** Edit this client; create a new one when omitted. */
  client?: Client
}

export function ClientFormModal(props: ClientFormModalProps) {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.client ? `Editar ${props.client.name}` : 'Nuevo cliente corporativo'}
      description="Datos fiscales, contactos y política comercial. Usá solo datos ficticios en esta demo."
      size="lg"
    >
      {props.open && <ClientForm {...props} />}
    </Modal>
  )
}

function toInput(c: Client | undefined, defaultManager: string): ClientInput {
  return {
    name: c?.name ?? '',
    legalName: c?.legalName ?? '',
    taxId: c?.taxId ?? '',
    industry: c?.industry ?? '',
    country: c?.headquarters.country ?? '',
    city: c?.headquarters.city ?? '',
    billingAddress: c?.billingAddress ?? '',
    status: c?.status ?? 'onboarding',
    accountManagerId: c?.accountManagerId ?? defaultManager,
    billingCurrency: c?.billingCurrency ?? '',
    currencies: c?.currencies ?? [],
    paymentTermsDays: c?.paymentTermsDays ?? 30,
    requiresPurchaseOrder: c?.policy.requiresPurchaseOrder ?? true,
    requiresApprovedQuote: c?.policy.requiresApprovedQuote ?? true,
    billingMilestone: c?.policy.billingMilestone ?? 'service-completed',
    quoteValidityDays: c?.policy.quoteValidityDays ?? 30,
    poMode: c?.policy.poMode ?? (c ? (c.policy.requiresPurchaseOrder ? 'project' : 'none') : 'project'),
    requiresCertificate: c?.policy.requiresCertificate ?? false,
    contacts: c?.contacts.map((x) => ({ ...x, primary: Boolean(x.primary) })) ?? [{ name: '', role: '', email: '', phone: '', primary: true }],
    notes: c?.notes ?? '',
  }
}

function Heading({ children }: { children: string }) {
  return <h3 className="text-[13px] font-medium uppercase tracking-[0.06em] text-subtle">{children}</h3>
}

function ClientForm({ onClose, workspace: ws, client }: ClientFormModalProps) {
  const actions = useActions()
  const navigate = useNavigate()
  const { run, busy, errors, formError } = useCommand()
  const [input, setInput] = useState<ClientInput>(() => toInput(client, ws.staff[1]?.id ?? ws.staff[0].id))
  const [requestId] = useState(() => randomId('req'))
  const patch = (p: Partial<ClientInput>) => setInput((i) => ({ ...i, ...p }))
  const setContact = (i: number, p: Partial<ContactInput>) =>
    patch({ contacts: input.contacts.map((c, j) => (j === i ? { ...c, ...p } : p.primary ? { ...c, primary: false } : c)) })

  const save = async () => {
    if (client) {
      const ok = await run(() => actions.updateClient(client.id, input), { title: 'Cliente actualizado' })
      if (ok) onClose()
      return
    }
    const result = await run(() => actions.createClient(input, requestId), { title: 'Cliente creado', description: input.name })
    if (result) {
      onClose()
      navigate(clientPath(result.clientId))
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="flex flex-col gap-[20px]"
    >
      <FormError message={formError} />

      <section className="flex flex-col gap-[12px]">
        <Heading>Empresa</Heading>
        <div className="grid gap-[14px] sm:grid-cols-2">
          <Field label="Nombre comercial" required error={errors.name}>
            {(p) => <TextInput {...p} data-autofocus value={input.name} onChange={(e) => patch({ name: e.target.value })} maxLength={100} />}
          </Field>
          <Field label="Razón social" required error={errors.legalName}>
            {(p) => <TextInput {...p} value={input.legalName} onChange={(e) => patch({ legalName: e.target.value })} maxLength={140} />}
          </Field>
          <Field label="Identificación fiscal" required error={errors.taxId} hint="CUIT, VAT, EIN…">
            {(p) => <TextInput {...p} value={input.taxId} onChange={(e) => patch({ taxId: e.target.value })} maxLength={40} />}
          </Field>
          <Field label="Industria">{(p) => <TextInput {...p} value={input.industry} onChange={(e) => patch({ industry: e.target.value })} maxLength={60} />}</Field>
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
          <Field label="Ciudad" required error={errors.city}>
            {(p) => <TextInput {...p} value={input.city} onChange={(e) => patch({ city: e.target.value })} maxLength={80} />}
          </Field>
          <Field label="Dirección de facturación" required error={errors.billingAddress} className="sm:col-span-2">
            {(p) => <TextInput {...p} value={input.billingAddress} onChange={(e) => patch({ billingAddress: e.target.value })} maxLength={200} />}
          </Field>
          <Field label="Estado">
            {(p) => (
              <SelectInput {...p} value={input.status} onChange={(e) => patch({ status: e.target.value as ClientStatus })}>
                {(Object.keys(clientStatusMeta) as ClientStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {clientStatusMeta[s].label}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Ejecutivo de cuenta" required error={errors.accountManagerId}>
            {(p) => (
              <SelectInput {...p} value={input.accountManagerId} onChange={(e) => patch({ accountManagerId: e.target.value })}>
                {ws.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-[10px]">
        <Heading>Contactos</Heading>
        {errors.contacts && <FormError message={errors.contacts} />}
        {input.contacts.map((c, i) => (
          <div key={c.id ?? i} className="grid gap-[10px] rounded-[14px] bg-surface-muted p-[12px] sm:grid-cols-2">
            <Field label="Nombre" required error={errors[`contacts.${i}.name`]}>
              {(p) => <TextInput {...p} value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} maxLength={100} />}
            </Field>
            <Field label="Rol">{(p) => <TextInput {...p} value={c.role} onChange={(e) => setContact(i, { role: e.target.value })} maxLength={80} />}</Field>
            <Field label="Email" required error={errors[`contacts.${i}.email`]}>
              {(p) => <TextInput {...p} type="email" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} maxLength={120} />}
            </Field>
            <Field label="Teléfono">{(p) => <TextInput {...p} value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} maxLength={40} />}</Field>
            <div className="flex flex-wrap justify-between gap-[8px] sm:col-span-2">
              <button
                type="button"
                role="radio"
                aria-checked={Boolean(c.primary)}
                onClick={() => setContact(i, { primary: true })}
                className={cn(
                  'inline-flex items-center gap-[6px] rounded-full px-[12px] py-[6px] text-[13px] transition-colors',
                  c.primary ? 'bg-accent-soft font-medium text-accent-strong' : 'text-ink-secondary hover:bg-surface',
                )}
              >
                <Star aria-hidden className="size-[14px]" strokeWidth={2} />
                {c.primary ? 'Contacto principal' : 'Marcar como principal'}
              </button>
              <Button size="sm" variant="secondary" className="h-[32px] px-[12px] text-[13px]" onClick={() => patch({ contacts: input.contacts.filter((_, j) => j !== i) })}>
                <Trash2 aria-hidden className="size-[14px]" strokeWidth={2} />
                Quitar
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button size="sm" variant="outline" onClick={() => patch({ contacts: [...input.contacts, { name: '', role: '', email: '', phone: '', primary: input.contacts.length === 0 }] })}>
            <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
            Agregar contacto
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-[12px]">
        <Heading>Condiciones comerciales</Heading>
        <div className="grid gap-[14px] sm:grid-cols-3">
          <Field label="Moneda de facturación" required error={errors.billingCurrency}>
            {(p) => (
              <SelectInput {...p} value={input.billingCurrency} onChange={(e) => patch({ billingCurrency: e.target.value as CurrencyCode })}>
                <option value="">Elegí</option>
                {CURRENCY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Plazo de pago (días)" required error={errors.paymentTermsDays}>
            {(p) => <TextInput {...p} type="number" min={0} max={180} value={input.paymentTermsDays} onChange={(e) => patch({ paymentTermsDays: Number(e.target.value) })} />}
          </Field>
          <Field label="Validez de cotizaciones (días)" required error={errors.quoteValidityDays}>
            {(p) => <TextInput {...p} type="number" min={1} max={180} value={input.quoteValidityDays} onChange={(e) => patch({ quoteValidityDays: Number(e.target.value) })} />}
          </Field>
        </div>
        <div>
          <p className="mb-[6px] text-[13.5px] font-medium text-ink-secondary">Otras monedas operadas</p>
          <div role="group" aria-label="Otras monedas operadas" className="flex flex-wrap gap-[6px]">
            {CURRENCY_ORDER.filter((c) => c !== input.billingCurrency).map((c) => {
              const on = input.currencies.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => patch({ currencies: on ? input.currencies.filter((x) => x !== c) : [...input.currencies, c] })}
                  className={cn('h-[32px] rounded-full border px-[12px] text-[13px] transition-colors', on ? 'border-contrast bg-contrast text-on-contrast' : 'border-line text-ink-secondary hover:bg-surface-muted')}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>
        <div className="grid gap-[10px] sm:grid-cols-2">
          <Field label="Modalidad de orden de compra">
            {(p) => (
              <SelectInput {...p} value={input.poMode} onChange={(e) => patch({ poMode: e.target.value as PoMode, requiresPurchaseOrder: e.target.value !== 'none' })}>
                <option value="open">OC abierta por cliente / provincia</option>
                <option value="project">OC por proyecto</option>
                <option value="none">Sin OC obligatoria</option>
              </SelectInput>
            )}
          </Field>
          <Switch
            checked={Boolean(input.requiresCertificate)}
            onChange={(v) => patch({ requiresCertificate: v })}
            label="Exige certificado aprobado"
            description="Se factura solo lo certificado y aprobado en el portal del cliente."
          />
          <Switch
            checked={input.requiresApprovedQuote}
            onChange={(v) => patch({ requiresApprovedQuote: v })}
            label="Exige cotización aprobada"
            description="Si no, alcanza con el precio acordado del servicio."
          />
        </div>
        <Field label="Hito de facturación">
          {(p) => (
            <SelectInput {...p} value={input.billingMilestone} onChange={(e) => patch({ billingMilestone: e.target.value as BillingMilestone })}>
              {(Object.keys(billingMilestoneLabel) as BillingMilestone[]).map((m) => (
                <option key={m} value={m}>
                  {billingMilestoneLabel[m]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Notas" error={errors.notes}>
          {(p) => <TextArea {...p} value={input.notes} onChange={(e) => patch({ notes: e.target.value })} maxLength={2000} />}
        </Field>
      </section>

      <div className="sticky bottom-0 -mx-[22px] -mb-[20px] flex flex-wrap justify-end gap-[10px] border-t border-line bg-surface px-[22px] py-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : client ? 'Guardar cambios' : 'Crear cliente'}
        </Button>
      </div>
    </form>
  )
}
