import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Flag } from '@/components/ui/Flag'
import { DateInput, Field, FormError, SelectInput, Switch, TextArea, TextInput } from '@/components/ui/form'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { ServiceTypeGrid } from '@/components/ui/ServiceTypeGrid'
import { Skeleton } from '@/components/ui/Skeleton'
import { DEMO_TODAY } from '@/config/brand'
import { countryNames, participantRoleLabel, projectCategoryLabel } from '@/config/catalogs'
import { countryOptions } from '@/config/countries'
import { projectPath, ROUTES } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { randomId } from '@/domain/context'
import { suggestTemplates } from '@/domain/initialDocuments'
import { addDays } from '@/domain/dates'
import { DomainError } from '@/domain/errors'
import { AR_PROVINCES } from '@/config/provinces'
import type { CurrencyCode } from '@/types/domain'
import { draftProject, validateProjectInput, type FamilyRole, type NewProjectInput } from '@/domain/projects'
import type { NewServiceInput } from '@/domain/services'
import { effectivePolicy, openOrderLive, resolveItemPrice } from '@/domain/commercial/catalog'
import { addMoney, mulMoney } from '@/domain/finance/money'
import { ServiceItemsEditor } from '@/features/catalog/ServiceItemsEditor'
import { useActions } from '@/hooks/useActions'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { cardVariants } from '@/lib/motion'
import type { CountryCode, ProjectCategory } from '@/types/domain'
import { referencePrice } from '../pricing'
import { WizardSteps, type WizardStep } from './WizardSteps'

const STEPS: WizardStep[] = [
  { id: 'people', label: 'Cliente y beneficiario', description: 'Empresa, persona trasladada y su familia.' },
  { id: 'move', label: 'Traslado', description: 'Origen, destino, categoría, responsable y fechas.' },
  { id: 'services', label: 'Servicios', description: 'Uno o más servicios, cada uno con su responsable y fechas.' },
  { id: 'review', label: 'Revisión', description: 'Confirmá los datos antes de crear el proyecto.' },
]

/** Which step owns each validation field. */
function stepOf(field: string): number {
  if (field === 'clientId' || field === 'province' || field === 'openOrderId' || field === 'currency' || field.startsWith('beneficiary') || field.startsWith('family')) return 0
  if (field.startsWith('services')) return 2
  return 1
}

const FAMILY_ROLES: FamilyRole[] = ['spouse', 'partner', 'child', 'dependent']

function emptyInput(ownerId: string): NewProjectInput {
  return {
    clientId: '',
    beneficiary: { name: '', nationality: '', email: '', jobTitle: '' },
    family: [],
    origin: { country: '', city: '' },
    destination: { country: '', city: '' },
    category: '',
    ownerId,
    startDate: DEMO_TODAY,
    targetDate: addDays(DEMO_TODAY, 120),
    notes: '',
    services: [],
  }
}

export function NewProjectPage() {
  const { workspace, loading } = useWorkspace()
  const user = useCurrentUser()

  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={<BackLink to={ROUTES.projects} label="Proyectos" />}
        title="Nuevo proyecto"
        description="Una relocación: un cliente corporativo, un beneficiario con su familia y todos los servicios contratados."
      />
      {loading || !workspace || !user ? (
        <div className="mt-[28px] flex flex-col gap-[20px]" aria-busy="true" aria-label="Cargando formulario">
          <Skeleton className="h-[56px] w-[640px] max-w-full rounded-full" />
          <Skeleton className="h-[420px] rounded-card" />
        </div>
      ) : (
        <Wizard workspace={workspace} defaultOwner={user.id} />
      )}
    </div>
  )
}

function Wizard({ workspace: ws, defaultOwner }: { workspace: Workspace; defaultOwner: string }) {
  const actions = useActions()
  const navigate = useNavigate()
  const { notify } = useToast()
  const [input, setInput] = useState<NewProjectInput>(() => emptyInput(defaultOwner))
  const [step, setStep] = useState(0)
  const [reachable, setReachable] = useState(0)
  const [showErrors, setShowErrors] = useState<Set<number>>(new Set())
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string>()
  const [confirmCancel, setConfirmCancel] = useState(false)
  /** Phase 5.0B: suggested templates the user unticked at review. */
  const [skippedTemplates, setSkippedTemplates] = useState<Set<string>>(() => new Set())
  /** Idempotency key: retries of this wizard never create a second project. */
  const [requestId] = useState(() => randomId('req'))
  const submitted = useRef(false)

  const allErrors = useMemo(() => ({ ...validateProjectInput(ws.dataset, input), ...serverErrors }), [ws.dataset, input, serverErrors])
  const errorsByStep = useMemo(() => {
    const map = new Map<number, Record<string, string>>()
    for (const [k, v] of Object.entries(allErrors)) {
      const s = stepOf(k)
      map.set(s, { ...(map.get(s) ?? {}), [k]: v })
    }
    return map
  }, [allErrors])
  const errors = showErrors.has(step) ? (errorsByStep.get(step) ?? {}) : {}
  const invalidSteps = new Set([...showErrors].filter((s) => errorsByStep.has(s)))

  const patch = (p: Partial<NewProjectInput>) => {
    setInput((i) => ({ ...i, ...p }))
    setServerErrors({})
  }
  const dirty = input.clientId !== '' || input.beneficiary.name !== '' || input.services.length > 0

  const goTo = (target: number) => {
    setStep(target)
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  const next = () => {
    setShowErrors((s) => new Set(s).add(step))
    if (errorsByStep.has(step)) {
      setFormError('Revisá los campos marcados para continuar.')
      return
    }
    setFormError(undefined)
    const target = step + 1
    setReachable((r) => Math.max(r, target))
    goTo(target)
  }

  const submit = async () => {
    if (submitting || submitted.current) return
    setShowErrors(new Set([0, 1, 2]))
    const firstInvalid = [0, 1, 2].find((s) => errorsByStep.has(s))
    if (firstInvalid !== undefined) {
      setFormError('Hay datos incompletos o inválidos. Te llevamos al paso con errores.')
      goTo(firstInvalid)
      return
    }
    setSubmitting(true)
    setFormError(undefined)
    try {
      const initialTemplateIds = suggestTemplates(ws.dataset, input.services.map((sv) => sv.typeId)).map((x) => x.template.id).filter((id) => !skippedTemplates.has(id))
      const result = await actions.createProject({ ...input, initialTemplateIds }, requestId)
      submitted.current = true
      const code = result.dataset.projects.find((p) => p.id === result.projectId)?.code
      notify({
        title: result.duplicate ? 'El proyecto ya había sido creado' : `Proyecto ${code} creado`,
        description: `${input.services.length} ${input.services.length === 1 ? 'servicio' : 'servicios'} con sus workflows listos.`,
      })
      navigate(projectPath(result.projectId))
    } catch (e) {
      if (e instanceof DomainError) {
        setServerErrors(e.fields)
        const first = Object.keys(e.fields).map(stepOf).sort()[0]
        setFormError(e.message)
        if (first !== undefined) goTo(first)
      } else {
        setFormError('No se pudo crear el proyecto. Intentá nuevamente.')
      }
      setSubmitting(false)
    }
  }

  const client = ws.clientById.get(input.clientId)

  return (
    <>
      <motion.div variants={cardVariants} className="mt-[28px]">
        <WizardSteps steps={STEPS} current={step} reachable={reachable} invalid={invalidSteps} onSelect={(i) => i <= reachable && goTo(i)} />
      </motion.div>

      <div className="mt-[20px] grid grid-cols-1 gap-[24px] xl:grid-cols-3">
        <Card aria-labelledby="wizard-step-title" className="min-w-0 px-[20px] pb-[20px] pt-[20px] xl:col-span-2">
          <SectionTitle id="wizard-step-title" title={STEPS[step].label} description={STEPS[step].description} />
          <div className="mt-[18px] flex flex-col gap-[18px]">
            <FormError message={formError} />
            <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              {step === 0 && <PeopleStep ws={ws} input={input} patch={patch} errors={errors} />}
              {step === 1 && <MoveStep ws={ws} input={input} patch={patch} errors={errors} />}
              {step === 2 && <ServicesStep ws={ws} input={input} patch={patch} errors={errors} />}
              {step === 3 && (
                <ReviewStep
                  ws={ws}
                  input={input}
                  onEdit={goTo}
                  skipped={skippedTemplates}
                  onToggleTemplate={(id) => setSkippedTemplates((prev) => (prev.has(id) ? new Set([...prev].filter((x) => x !== id)) : new Set(prev).add(id)))}
                />
              )}
            </motion.div>
          </div>
          <div className="mt-[22px] flex flex-wrap items-center justify-between gap-[10px] border-t border-line pt-[16px]">
            <Button variant="secondary" size="sm" onClick={() => (dirty ? setConfirmCancel(true) : navigate(ROUTES.projects))} disabled={submitting}>
              Cancelar
            </Button>
            <div className="flex flex-wrap gap-[10px]">
              {step > 0 && (
                <Button variant="outline" size="sm" onClick={() => goTo(step - 1)} disabled={submitting}>
                  <ArrowLeft aria-hidden className="size-[15px]" strokeWidth={2} />
                  Atrás
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button size="sm" onClick={next}>
                  Siguiente
                  <ArrowRight aria-hidden className="size-[15px]" strokeWidth={2} />
                </Button>
              ) : (
                <Button size="sm" onClick={submit} disabled={submitting} aria-busy={submitting}>
                  {submitting ? 'Creando proyecto…' : 'Crear proyecto'}
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card aria-labelledby="wizard-summary" className="h-fit px-[20px] pb-[18px] pt-[20px] xl:sticky xl:top-[24px]">
          <SectionTitle id="wizard-summary" size="sm" title="Resumen" />
          <dl className="mt-[12px] flex flex-col text-[14px]">
            {[
              ['Cliente', client?.name],
              ['Provincia', input.province ?? 'Sin especificar'],
              ['OC abierta', input.openOrderId ? `OC ${ws.openOrders.find((o) => o.id === input.openOrderId)?.number}` : 'No aplica'],
              ['Moneda del proyecto', ws.openOrders.find((o) => o.id === input.openOrderId)?.currency ?? input.currency ?? client?.billingCurrency],
              ['Beneficiario', input.beneficiaryPersonId ? ws.personById.get(input.beneficiaryPersonId)?.name : input.beneficiary.name],
              ['Familia', input.family.length ? `${input.family.length} ${input.family.length === 1 ? 'persona' : 'personas'}` : undefined],
              [
                'Ruta',
                input.origin.city && input.destination.city ? `${input.origin.city} → ${input.destination.city}` : undefined,
              ],
              ['Fechas', input.startDate && input.targetDate ? `${formatDate(input.startDate)} – ${formatDate(input.targetDate)}` : undefined],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-line py-[9px] last:border-b-0">
                <dt className="text-muted">{label}</dt>
                <dd className="truncate text-right font-medium">{value || <span className="font-normal text-subtle">—</span>}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-[14px] text-[13px] font-medium">Servicios ({input.services.length})</p>
          {input.services.length === 0 ? (
            <p className="mt-[6px] text-[13px] text-muted">Todavía no elegiste servicios.</p>
          ) : (
            <ul className="mt-[8px] flex flex-col gap-[6px]">
              {input.services.map((s, i) => (
                <li key={`${s.typeId}-${i}`} className="flex items-center gap-[8px] text-[13.5px]">
                  <ServiceChip type={s.typeId} />
                  {getServiceType(s.typeId).label}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Descartar el alta"
        tone="danger"
        confirmLabel="Descartar"
        message="Se perderán los datos cargados en este formulario."
        onConfirm={() => navigate(ROUTES.projects)}
      />
    </>
  )
}

interface StepProps {
  ws: Workspace
  input: NewProjectInput
  patch: (p: Partial<NewProjectInput>) => void
  errors: Record<string, string>
}

function CountrySelect({ value, onChange, ...p }: { value: string; onChange: (v: CountryCode | '') => void } & Record<string, unknown>) {
  return (
    <SelectInput {...p} value={value} onChange={(e) => onChange(e.target.value as CountryCode | '')}>
      <option value="">Elegí un país</option>
      {countryOptions.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </SelectInput>
  )
}

function PeopleStep({ ws, input, patch, errors }: StepProps) {
  const known = ws.people.filter((p) => p.employerId && p.employerId === input.clientId)
  const existing = input.beneficiaryPersonId ? ws.personById.get(input.beneficiaryPersonId) : undefined
  const setFamily = (i: number, p: Partial<NewProjectInput['family'][number]>) => patch({ family: input.family.map((m, j) => (j === i ? { ...m, ...p } : m)) })

  return (
    <div className="flex flex-col gap-[18px]">
      <Field label="Cliente corporativo" required error={errors.clientId}>
        {(p) => (
          <SelectInput {...p} data-autofocus value={input.clientId} onChange={(e) => patch({ clientId: e.target.value, beneficiaryPersonId: undefined, openOrderId: undefined, currency: undefined })}>
            <option value="">Elegí un cliente</option>
            {ws.clients
              .filter((c) => c.status !== 'inactive')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.industry}
                </option>
              ))}
          </SelectInput>
        )}
      </Field>

      <OpenOrderFields ws={ws} input={input} patch={patch} errors={errors} />

      {known.length > 0 && (
        <Field label="¿Es una persona con la que ya trabajamos?" hint="Elegila para no duplicar su registro; si no, cargá sus datos abajo.">
          {(p) => (
            <SelectInput {...p} value={input.beneficiaryPersonId ?? ''} onChange={(e) => patch({ beneficiaryPersonId: e.target.value || undefined })}>
              <option value="">No, es una persona nueva</option>
              {known.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.jobTitle ? ` — ${person.jobTitle}` : ''}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
      )}

      {existing ? (
        <p className="rounded-[14px] bg-surface-muted px-[14px] py-[11px] text-[14px]">
          Beneficiario: <span className="font-medium">{existing.name}</span> · {countryNames[existing.nationality]}
        </p>
      ) : (
        <div className="grid gap-[14px] sm:grid-cols-2">
          <Field label="Nombre completo del beneficiario" required error={errors['beneficiary.name']}>
            {(p) => <TextInput {...p} value={input.beneficiary.name} onChange={(e) => patch({ beneficiary: { ...input.beneficiary, name: e.target.value } })} maxLength={100} />}
          </Field>
          <Field label="Nacionalidad" required error={errors['beneficiary.nationality']}>
            {(p) => <CountrySelect {...p} value={input.beneficiary.nationality} onChange={(v) => patch({ beneficiary: { ...input.beneficiary, nationality: v } })} />}
          </Field>
          <Field label="Email" error={errors['beneficiary.email']}>
            {(p) => <TextInput {...p} type="email" value={input.beneficiary.email} onChange={(e) => patch({ beneficiary: { ...input.beneficiary, email: e.target.value } })} maxLength={120} />}
          </Field>
          <Field label="Puesto">
            {(p) => <TextInput {...p} value={input.beneficiary.jobTitle} onChange={(e) => patch({ beneficiary: { ...input.beneficiary, jobTitle: e.target.value } })} maxLength={100} />}
          </Field>
        </div>
      )}

      <div>
        <p className="text-[13.5px] font-medium text-ink-secondary">Familia que se traslada</p>
        <div className="mt-[8px] flex flex-col gap-[8px]">
          {input.family.map((m, i) => (
            <div key={i} className="grid items-end gap-[10px] rounded-[14px] bg-surface-muted p-[12px] sm:grid-cols-[1fr_150px_90px_auto]">
              <Field label="Nombre" required error={errors[`family.${i}.name`]}>
                {(p) => <TextInput {...p} value={m.name} onChange={(e) => setFamily(i, { name: e.target.value })} maxLength={100} />}
              </Field>
              <Field label="Vínculo">
                {(p) => (
                  <SelectInput {...p} value={m.role} onChange={(e) => setFamily(i, { role: e.target.value as FamilyRole })}>
                    {FAMILY_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {participantRoleLabel[r]}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>
              <Field label="Edad" error={errors[`family.${i}.age`]}>
                {(p) => (
                  <TextInput {...p} type="number" min={0} max={120} value={m.age ?? ''} onChange={(e) => setFamily(i, { age: e.target.value === '' ? undefined : Number(e.target.value) })} />
                )}
              </Field>
              <Button size="sm" variant="secondary" aria-label={`Quitar a ${m.name || 'familiar'}`} onClick={() => patch({ family: input.family.filter((_, j) => j !== i) })} className="h-[46px]">
                <Trash2 aria-hidden className="size-[15px]" strokeWidth={2} />
              </Button>
            </div>
          ))}
          <div>
            <Button size="sm" variant="outline" onClick={() => patch({ family: [...input.family, { name: '', role: input.family.length === 0 ? 'spouse' : 'child' }] })}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Agregar familiar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MoveStep({ ws, input, patch, errors }: StepProps) {
  return (
    <div className="grid gap-[14px] sm:grid-cols-2">
      <Field label="País de origen" required error={errors['origin.country']}>
        {(p) => <CountrySelect {...p} data-autofocus value={input.origin.country} onChange={(v) => patch({ origin: { ...input.origin, country: v } })} />}
      </Field>
      <Field label="Ciudad de origen" required error={errors['origin.city']}>
        {(p) => <TextInput {...p} value={input.origin.city} onChange={(e) => patch({ origin: { ...input.origin, city: e.target.value } })} maxLength={80} />}
      </Field>
      <Field label="País de destino" required error={errors['destination.country']}>
        {(p) => <CountrySelect {...p} value={input.destination.country} onChange={(v) => patch({ destination: { ...input.destination, country: v } })} />}
      </Field>
      <Field label="Ciudad de destino" required error={errors['destination.city']}>
        {(p) => <TextInput {...p} value={input.destination.city} onChange={(e) => patch({ destination: { ...input.destination, city: e.target.value } })} maxLength={80} />}
      </Field>
      <Field label="Categoría del proyecto" required error={errors.category}>
        {(p) => (
          <SelectInput {...p} value={input.category} onChange={(e) => patch({ category: e.target.value as ProjectCategory | '' })}>
            <option value="">Elegí una categoría</option>
            {(Object.keys(projectCategoryLabel) as ProjectCategory[]).map((c) => (
              <option key={c} value={c}>
                {projectCategoryLabel[c]}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      <Field label="Responsable interno" required error={errors.ownerId}>
        {(p) => (
          <SelectInput {...p} value={input.ownerId} onChange={(e) => patch({ ownerId: e.target.value })}>
            <option value="">Elegí un responsable</option>
            {ws.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.role}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      <Field label="Fecha de inicio" required error={errors.startDate}>
        {(p) => <DateInput {...p} value={input.startDate} onChange={(e) => patch({ startDate: e.target.value })} />}
      </Field>
      <Field label="Finalización estimada" required error={errors.targetDate}>
        {(p) => <DateInput {...p} value={input.targetDate} min={input.startDate} onChange={(e) => patch({ targetDate: e.target.value })} />}
      </Field>
      <Field label="Notas" error={errors.notes} className="sm:col-span-2" hint="Contexto del traslado, preferencias, restricciones.">
        {(p) => <TextArea {...p} value={input.notes} onChange={(e) => patch({ notes: e.target.value })} maxLength={2000} />}
      </Field>
    </div>
  )
}

/**
 * Province (always available: Argentine jurisdictions), open PO (only for
 * clients working with open POs: compatible province and in force) and project
 * currency (an open PO imposes its own). Clients with per-project PO or no PO are
 * never blocked by the province.
 */
function OpenOrderFields({ ws, input, patch, errors }: StepProps) {
  const client = ws.clientById.get(input.clientId)
  if (!client) return null
  const open = effectivePolicy(client).poMode === 'open'
  const live = ws.openOrders.filter((o) => o.clientId === client.id && openOrderLive(o, input.startDate || DEMO_TODAY))
  const forProvince = live.filter((o) => o.province === input.province)
  const order = ws.openOrders.find((o) => o.id === input.openOrderId)
  return (
    <div className="grid gap-[12px] sm:grid-cols-2">
      <Field label="Provincia" required={open} error={errors.province} hint={open ? `OC abiertas vigentes en: ${[...new Set(live.map((o) => o.province))].join(', ') || 'ninguna'}.` : 'Opcional para este cliente.'}>
        {(p) => (
          <SelectInput
            {...p}
            value={input.province ?? ''}
            onChange={(e) => {
              const province = e.target.value || undefined
              const only = live.filter((o) => o.province === province)
              patch({ province, openOrderId: open && only.length === 1 ? only[0].id : undefined })
            }}
          >
            <option value="">{open ? 'Elegí la provincia' : 'Sin especificar'}</option>
            {AR_PROVINCES.map((pr) => (
              <option key={pr} value={pr}>
                {pr}
                {open && live.some((o) => o.province === pr) ? ' · OC abierta' : ''}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      {open ? (
        <Field label="OC abierta aplicable" required error={errors.openOrderId} hint={input.province && !forProvince.length ? `No hay OC abierta vigente para ${input.province}.` : undefined}>
          {(p) => (
            <SelectInput {...p} value={input.openOrderId ?? ''} disabled={!forProvince.length} onChange={(e) => patch({ openOrderId: e.target.value || undefined })}>
              <option value="">{input.province ? 'Elegí la OC' : 'Primero elegí la provincia'}</option>
              {forProvince.map((o) => (
                <option key={o.id} value={o.id}>
                  OC {o.number} · {o.currency} · {o.items.length} ítems
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
      ) : (
        client.currencies.length > 1 && (
          <Field label="Moneda del proyecto" error={errors.currency} hint="Los precios se buscan en esta moneda; no hay conversión.">
            {(p) => (
              <SelectInput {...p} value={input.currency ?? client.billingCurrency} onChange={(e) => patch({ currency: e.target.value as CurrencyCode })}>
                {client.currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )
      )}
      {open && order && <p className="text-[12.5px] text-muted sm:col-span-2">Moneda del proyecto: {order.currency} (de la OC). Los precios se toman de los ítems autorizados en la OC.</p>}
    </div>
  )
}

function ServicesStep({ ws, input, patch, errors }: StepProps) {
  const selected = input.services.map((s) => s.typeId)
  const client = ws.clientById.get(input.clientId)
  const draft = client ? draftProject(input, input.currency ?? client.billingCurrency, ws.openOrders.find((o) => o.id === input.openOrderId)?.currency) : undefined
  const setService = (i: number, p: Partial<NewServiceInput>) => patch({ services: input.services.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  const toggle = (typeId: string) =>
    patch({
      services: selected.includes(typeId)
        ? input.services.filter((s) => s.typeId !== typeId)
        : [...input.services, { typeId, ownerId: input.ownerId, startDate: input.startDate, dueDate: input.targetDate, startNow: true }],
    })

  // Contracted total per currency (project currency only: nothing is converted).
  const totals = new Map<string, number>()
  let pending = 0
  if (draft) {
    for (const sv of input.services) {
      if (sv.items?.length) {
        for (const it of sv.items) {
          const pr = resolveItemPrice(ws.dataset, draft, sv.typeId, it.catalogItemId, sv.startDate || DEMO_TODAY)?.unitPrice ?? it.unitPrice
          if (pr && it.quantity > 0) totals.set(draft.currency, addMoney(totals.get(draft.currency) ?? 0, mulMoney(pr, it.quantity)))
          else pending++
        }
      } else {
        const pr = resolveItemPrice(ws.dataset, draft, sv.typeId, undefined, sv.startDate || DEMO_TODAY)?.unitPrice ?? referencePrice(ws, { clientId: draft.clientId, currency: draft.currency, destination: { country: draft.destination.country } }, sv.typeId, sv.startDate)?.price
        if (pr) totals.set(draft.currency, addMoney(totals.get(draft.currency) ?? 0, pr))
        else pending++
      }
    }
  }
  const totalsBar = input.services.length > 0 && (
    <p className="rounded-[14px] bg-surface-muted px-[14px] py-[11px] text-[13.5px]">
      Total contratado:{' '}
      <span className="tabular font-semibold">{[...totals.entries()].map(([c, v]) => formatCurrency(v, c as CurrencyCode)).join(' · ') || '—'}</span>
      {pending > 0 && <span className="text-warning"> · {pending} ítem(s) sin precio vigente (pendiente de configurar)</span>}
    </p>
  )
  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <ServiceTypeGrid multiple label="Servicios contratados" selected={selected} onToggle={toggle} only={client?.offeredServices} />
        {errors.services && <p className="mt-[8px] text-[12.5px] font-medium text-danger">{errors.services}</p>}
      </div>
      {input.services.map((s, i) => {
        const ref =
          client && input.destination.country
            ? referencePrice(ws, { clientId: client.id, currency: draft?.currency ?? client.billingCurrency, destination: { country: input.destination.country } }, s.typeId, s.startDate)
            : undefined
        const suppliers = ws.suppliers.filter((x) => x.categories.includes(s.typeId))
        const e = (k: string) => errors[`services.${i}.${k}`]
        return (
          <section key={s.typeId} aria-label={getServiceType(s.typeId).label} className="rounded-panel bg-surface-muted p-[14px]">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-[10px] text-[15px] font-semibold">
                <ServiceChip type={s.typeId} size="md" />
                {getServiceType(s.typeId).label}
              </p>
              <Button size="sm" variant="secondary" onClick={() => toggle(s.typeId)} className="h-[32px] px-[12px] text-[13px]">
                Quitar
              </Button>
            </div>
            <div className="mt-[14px] grid gap-[12px] sm:grid-cols-2">
              <Field label="Responsable" required error={e('ownerId')}>
                {(p) => (
                  <SelectInput {...p} value={s.ownerId} onChange={(ev) => setService(i, { ownerId: ev.target.value })}>
                    <option value="">Elegí un responsable</option>
                    {ws.staff.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>
              <Field label="Proveedor" error={e('supplierId')}>
                {(p) => (
                  <SelectInput {...p} value={s.supplierId ?? ''} onChange={(ev) => setService(i, { supplierId: ev.target.value || undefined })}>
                    <option value="">Gestión interna</option>
                    {(suppliers.length ? suppliers : ws.suppliers).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>
              <Field label="Inicio" required error={e('startDate')}>
                {(p) => <DateInput {...p} value={s.startDate} min={input.startDate} onChange={(ev) => setService(i, { startDate: ev.target.value })} />}
              </Field>
              <Field label="Vencimiento" required error={e('dueDate')}>
                {(p) => <DateInput {...p} value={s.dueDate} max={input.targetDate} onChange={(ev) => setService(i, { dueDate: ev.target.value })} />}
              </Field>
            </div>
            {draft && (
              <div className="mt-[12px]">
                <p className="mb-[6px] text-[13px] font-medium text-ink-secondary">Subservicios contratados</p>
                <ServiceItemsEditor
                  ws={ws}
                  project={draft}
                  typeId={s.typeId}
                  items={s.items ?? []}
                  onChange={(items) => setService(i, { items })}
                  errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith(`services.${i}.items`)).map(([k, v]) => [k.slice(`services.${i}.`.length), v]))}
                  date={s.startDate || DEMO_TODAY}
                />
                {e('items') && <p className="mt-[6px] text-[12.5px] font-medium text-danger">{e('items')}</p>}
                {e('typeId') && <p className="mt-[6px] text-[12.5px] font-medium text-danger">{e('typeId')}</p>}
              </div>
            )}
            <div className="mt-[12px] grid gap-[10px] sm:grid-cols-2">
              <Switch checked={Boolean(s.startNow)} onChange={(v) => setService(i, { startNow: v })} label="Iniciar ahora" description="Activa la primera etapa y crea sus tareas." />
              <p className="flex items-center rounded-[14px] bg-surface px-[14px] py-[11px] text-[13px] text-ink-secondary">
                {s.items?.length ? (
                  'El precio del servicio es el total de sus subservicios.'
                ) : ref && client && ref.price !== undefined ? (
                  <span>
                    Tarifario: <span className="tabular font-semibold">{formatCurrency(ref.price, draft?.currency ?? client.billingCurrency)}</span>
                  </span>
                ) : ref ? (
                  'Tarifas superpuestas: el precio se definirá al cotizar.'
                ) : (
                  'Sin precio vigente en el tarifario: pendiente de configurar (quedará «a cotizar»).'
                )}
              </p>
            </div>
          </section>
        )
      })}
      {totalsBar}
    </div>
  )
}

function ReviewStep({ ws, input, onEdit, skipped, onToggleTemplate }: { ws: Workspace; input: NewProjectInput; onEdit: (step: number) => void; skipped: Set<string>; onToggleTemplate: (id: string) => void }) {
  const client = ws.clientById.get(input.clientId)
  const templates = suggestTemplates(ws.dataset, input.services.map((s) => s.typeId))
  const person = input.beneficiaryPersonId ? ws.personById.get(input.beneficiaryPersonId) : undefined
  const block = (title: string, stepIndex: number, rows: [string, ReactNode][]) => (
    <section className="rounded-panel bg-surface-muted p-[14px]">
      <div className="flex items-center justify-between">
        <h3 className="text-[14.5px] font-semibold">{title}</h3>
        <button type="button" onClick={() => onEdit(stepIndex)} className="rounded-full px-[10px] py-[4px] text-[13px] text-ink-secondary hover:bg-surface hover:text-ink">
          Editar
        </button>
      </div>
      <dl className="mt-[8px] grid gap-x-6 gap-y-[8px] text-[14px] sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[12.5px] text-muted">{k}</dt>
            <dd className="mt-[1px] font-medium">{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )

  return (
    <div className="flex flex-col gap-[12px]">
      {block('Cliente y beneficiario', 0, [
        ['Cliente', client?.name],
        ['Beneficiario', person?.name ?? input.beneficiary.name],
        ['Nacionalidad', person ? countryNames[person.nationality] : input.beneficiary.nationality ? countryNames[input.beneficiary.nationality] : ''],
        ['Familia', input.family.map((m) => `${m.name} (${participantRoleLabel[m.role]})`).join(', ') || 'Sin familiares'],
      ])}
      {block('Traslado', 1, [
        [
          'Origen',
          input.origin.country && (
            <span className="inline-flex items-center gap-[6px]">
              <Flag country={input.origin.country} className="size-[15px]" />
              {input.origin.city}
            </span>
          ),
        ],
        [
          'Destino',
          input.destination.country && (
            <span className="inline-flex items-center gap-[6px]">
              <Flag country={input.destination.country} className="size-[15px]" />
              {input.destination.city}
            </span>
          ),
        ],
        ['Categoría', input.category ? projectCategoryLabel[input.category] : ''],
        ['Responsable', ws.staffById.get(input.ownerId)?.name],
        ['Fechas', `${formatDate(input.startDate)} – ${formatDate(input.targetDate)}`],
        ['Notas', input.notes],
      ])}
      {block(
        'Servicios',
        2,
        input.services.map((s) => [
          getServiceType(s.typeId).label,
          `${ws.staffById.get(s.ownerId)?.name ?? '—'} · ${formatDate(s.startDate)} – ${formatDate(s.dueDate)}${s.startNow ? ' · inicia ahora' : ''}${
            s.items?.length ? ` · ${s.items.map((it) => `${ws.catalogItems.find((c) => c.id === it.catalogItemId)?.name} ×${it.quantity}`).join(', ')}` : ''
          }`,
        ]),
      )}
      <section className="rounded-panel bg-surface-muted p-[14px]" aria-label="Documentación inicial sugerida">
        <h3 className="text-[14.5px] font-semibold">Documentación inicial sugerida</h3>
        {templates.length === 0 ? (
          <p className="mt-[6px] text-[13.5px] text-muted">No hay plantillas activas para los servicios elegidos.</p>
        ) : (
          <>
            <p className="mt-[2px] text-[13px] text-muted">
              Se agregan al proyecto como pendientes de enviar a {(person ?? input.beneficiary).name || 'el beneficiario'}
              {(person?.email ?? input.beneficiary.email) ? ` (${person?.email ?? input.beneficiary.email})` : ' (sin email registrado)'}. No se envía nada automáticamente.
            </p>
            <ul className="mt-[8px] flex flex-col gap-[6px]">
              {templates.map(({ template: t, serviceTypeIds }) => (
                <li key={t.id}>
                  <label className="flex flex-wrap items-center gap-[8px] text-[14px]">
                    <input type="checkbox" className="size-[16px] accent-[var(--color-ink)]" checked={!skipped.has(t.id)} onChange={() => onToggleTemplate(t.id)} />
                    <span className="font-medium">{t.name}</span>
                    <span className="text-[13px] text-muted">{serviceTypeIds.map((id) => getServiceType(id).label).join(', ')}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
