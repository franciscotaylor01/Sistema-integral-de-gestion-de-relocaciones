import { AR_PROVINCES } from '@/config/provinces'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { operationalStatusMeta, participantRoleLabel, projectCategoryLabel } from '@/config/catalogs'
import { countryOptions } from '@/config/countries'
import type { FamilyMemberInput, FamilyRole } from '@/domain/projects'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { cn } from '@/lib/cn'
import type { CountryCode, ProjectCategory, ProjectOperationalStatus } from '@/types/domain'
import type { ProjectContext } from '../projectContext'

const FAMILY_ROLES: FamilyRole[] = ['spouse', 'partner', 'child', 'dependent']

export function EditProjectModal({ open, onClose, ctx }: { open: boolean; onClose: () => void; ctx: ProjectContext }) {
  return (
    <Modal open={open} onClose={onClose} title={`Editar ${ctx.project.code}`} description="Los cambios quedan registrados en la actividad del proyecto." size="lg">
      {open && <EditProjectForm onClose={onClose} ctx={ctx} />}
    </Modal>
  )
}

function SectionHeading({ children }: { children: string }) {
  return <h3 className="text-[13px] font-medium uppercase tracking-[0.06em] text-subtle">{children}</h3>
}

function EditProjectForm({ onClose, ctx }: { onClose: () => void; ctx: ProjectContext }) {
  const { project, beneficiary, family, workspace } = ctx
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()

  const [name, setName] = useState(beneficiary?.name ?? '')
  const [nationality, setNationality] = useState<CountryCode>(beneficiary?.nationality ?? 'AR')
  const [email, setEmail] = useState(beneficiary?.email ?? '')
  const [jobTitle, setJobTitle] = useState(beneficiary?.jobTitle ?? '')
  const [removing, setRemoving] = useState<string[]>([])
  const [adding, setAdding] = useState<FamilyMemberInput[]>([])
  const [origin, setOrigin] = useState(project.origin)
  const [destination, setDestination] = useState(project.destination)
  const [category, setCategory] = useState<ProjectCategory>(project.category)
  const [ownerId, setOwnerId] = useState(project.ownerId)
  const [status, setStatus] = useState<ProjectOperationalStatus>(project.operationalStatus)
  const [startDate, setStartDate] = useState(project.startDate)
  const [targetDate, setTargetDate] = useState(project.targetDate)
  const [notes, setNotes] = useState(project.notes ?? '')
  const [province, setProvince] = useState(project.province ?? '')

  const save = async () => {
    const ok = await run(
      () =>
        actions.updateProject(project.id, {
          beneficiary: { name, nationality, email, jobTitle },
          addFamily: adding,
          removeParticipantIds: removing,
          origin: { country: origin.country, city: origin.city },
          destination: { country: destination.country, city: destination.city },
          province: province !== (project.province ?? '') ? province : undefined,
          category,
          ownerId,
          operationalStatus: status,
          startDate,
          targetDate,
          notes,
        }),
      { title: 'Proyecto actualizado' },
    )
    if (ok) onClose()
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
        <SectionHeading>Beneficiario principal</SectionHeading>
        <div className="grid gap-[14px] sm:grid-cols-2">
          <Field label="Nombre completo" required error={errors['beneficiary.name']}>
            {(p) => <TextInput {...p} data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />}
          </Field>
          <Field label="Nacionalidad" required>
            {(p) => (
              <SelectInput {...p} value={nationality} onChange={(e) => setNationality(e.target.value as CountryCode)}>
                {countryOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Email" error={errors['beneficiary.email']}>
            {(p) => <TextInput {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />}
          </Field>
          <Field label="Puesto">{(p) => <TextInput {...p} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={100} />}</Field>
        </div>
      </section>

      <section className="flex flex-col gap-[10px]">
        <SectionHeading>Familia</SectionHeading>
        {errors.family && <FormError message={errors.family} />}
        {family.length === 0 && adding.length === 0 && <p className="text-[14px] text-muted">Sin familiares asociados.</p>}
        {family.map(({ participant, person }) => {
          const marked = removing.includes(participant.id)
          return (
            <div key={participant.id} className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-muted px-[14px] py-[10px]">
              <span className={cn('min-w-0 text-[14px]', marked && 'text-muted line-through')}>
                <span className="font-medium">{person.name}</span> · {participantRoleLabel[participant.role]}
                {person.age !== undefined && ` · ${person.age} años`}
              </span>
              <Button
                size="sm"
                variant="secondary"
                className="h-[32px] px-[12px] text-[13px]"
                onClick={() => setRemoving((r) => (marked ? r.filter((x) => x !== participant.id) : [...r, participant.id]))}
              >
                {marked ? <Undo2 aria-hidden className="size-[14px]" strokeWidth={2} /> : <Trash2 aria-hidden className="size-[14px]" strokeWidth={2} />}
                {marked ? 'Deshacer' : 'Quitar'}
              </Button>
            </div>
          )
        })}
        {adding.map((m, i) => (
          <div key={i} className="grid items-end gap-[10px] rounded-[14px] bg-surface-muted p-[12px] sm:grid-cols-[1fr_150px_90px_auto]">
            <Field label="Nombre" required error={errors[`addFamily.${i}.name`]}>
              {(p) => <TextInput {...p} value={m.name} onChange={(e) => setAdding((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={100} />}
            </Field>
            <Field label="Vínculo">
              {(p) => (
                <SelectInput {...p} value={m.role} onChange={(e) => setAdding((a) => a.map((x, j) => (j === i ? { ...x, role: e.target.value as FamilyRole } : x)))}>
                  {FAMILY_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {participantRoleLabel[r]}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            <Field label="Edad">
              {(p) => (
                <TextInput
                  {...p}
                  type="number"
                  min={0}
                  max={120}
                  value={m.age ?? ''}
                  onChange={(e) => setAdding((a) => a.map((x, j) => (j === i ? { ...x, age: e.target.value === '' ? undefined : Number(e.target.value) } : x)))}
                />
              )}
            </Field>
            <Button size="sm" variant="secondary" aria-label="Quitar familiar" onClick={() => setAdding((a) => a.filter((_, j) => j !== i))} className="h-[46px]">
              <Trash2 aria-hidden className="size-[15px]" strokeWidth={2} />
            </Button>
          </div>
        ))}
        <div>
          <Button size="sm" variant="outline" onClick={() => setAdding((a) => [...a, { name: '', role: 'child' }])}>
            <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
            Agregar familiar
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-[12px]">
        <SectionHeading>Traslado</SectionHeading>
        <div className="grid gap-[14px] sm:grid-cols-2">
          <Field label="País de origen" required>
            {(p) => (
              <SelectInput {...p} value={origin.country} onChange={(e) => setOrigin({ ...origin, country: e.target.value as CountryCode })}>
                {countryOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Ciudad de origen" required error={errors['origin.city']}>
            {(p) => <TextInput {...p} value={origin.city} onChange={(e) => setOrigin({ ...origin, city: e.target.value })} maxLength={80} />}
          </Field>
          <Field label="País de destino" required>
            {(p) => (
              <SelectInput {...p} value={destination.country} onChange={(e) => setDestination({ ...destination, country: e.target.value as CountryCode })}>
                {countryOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Ciudad de destino" required error={errors['destination.city']}>
            {(p) => <TextInput {...p} value={destination.city} onChange={(e) => setDestination({ ...destination, city: e.target.value })} maxLength={80} />}
          </Field>
          <Field label="Provincia" error={errors.province} hint={project.openOrderId ? 'Fijada por la OC abierta del proyecto.' : 'Opcional.'}>
            {(p) => (
              <SelectInput {...p} value={province} disabled={Boolean(project.openOrderId)} onChange={(e) => setProvince(e.target.value)}>
                <option value="">Sin especificar</option>
                {AR_PROVINCES.map((pr) => (
                  <option key={pr} value={pr}>
                    {pr}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-[12px]">
        <SectionHeading>Gestión</SectionHeading>
        <div className="grid gap-[14px] sm:grid-cols-2">
          <Field label="Categoría" required>
            {(p) => (
              <SelectInput {...p} value={category} onChange={(e) => setCategory(e.target.value as ProjectCategory)}>
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
              <SelectInput {...p} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                {workspace.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Inicio" required error={errors.startDate}>
            {(p) => <DateInput {...p} value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
          </Field>
          <Field label="Finalización estimada" required error={errors.targetDate}>
            {(p) => <DateInput {...p} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />}
          </Field>
          <Field label="Estado operativo" error={errors.operationalStatus} className="sm:col-span-2">
            {(p) => (
              <SelectInput {...p} value={status} onChange={(e) => setStatus(e.target.value as ProjectOperationalStatus)}>
                {(Object.keys(operationalStatusMeta) as ProjectOperationalStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {operationalStatusMeta[s].label}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Notas" error={errors.notes} className="sm:col-span-2">
            {(p) => <TextArea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />}
          </Field>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-[22px] -mb-[20px] flex flex-wrap justify-end gap-[10px] border-t border-line bg-surface px-[22px] py-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
