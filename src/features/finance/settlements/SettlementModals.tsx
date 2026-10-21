import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { DateInput, Field, FormError, SelectInput, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { DEMO_TODAY } from '@/config/brand'
import { settlementMethodLabel, settlementReleaseLabel } from '@/config/finance'
import { settlementPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { randomId } from '@/domain/context'
import type { SettlementInput } from '@/domain/finance/settlements'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { CURRENCY_ORDER } from '@/lib/money'
import type { CurrencyCode, ProjectSettlement, SettlementComponent, SettlementMethod, SettlementRelease, SettlementRule } from '@/types/domain'

function Footer({ onClose, busy, label }: { onClose: () => void; busy: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
      <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
        Cancelar
      </Button>
      <Button size="sm" type="submit" disabled={busy}>
        {busy ? 'Guardando…' : label}
      </Button>
    </div>
  )
}

const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')))

/* ───────────── New settlement ───────────── */

export function NewSettlementModal({ open, onClose, workspace, projectId }: { open: boolean; onClose: () => void; workspace: Workspace; projectId?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Nueva liquidación" description="Una por proyecto, prestadora y moneda. La distribución se configura después; no se asume ningún reparto." size="md">
      {open && <NewSettlementForm onClose={onClose} ws={workspace} projectId={projectId} />}
    </Modal>
  )
}

function NewSettlementForm({ onClose, ws, projectId }: { onClose: () => void; ws: Workspace; projectId?: string }) {
  const actions = useActions()
  const navigate = useNavigate()
  const { run, busy, errors, formError } = useCommand()
  const [requestId] = useState(() => randomId('req'))
  const partners = ws.suppliers.filter((s) => s.active && s.kind === 'professional')
  const [input, setInput] = useState<SettlementInput>(() => ({
    projectId: projectId ?? '',
    supplierId: partners.find((s) => s.id === 'sup_florencia')?.id ?? partners[0]?.id ?? '',
    currency: projectId ? (ws.projectById.get(projectId)?.currency ?? '') : '',
    release: 'after-collection',
    releaseNote: '',
  }))
  const patch = (p: Partial<SettlementInput>) => setInput((i) => ({ ...i, ...p }))
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        let id: string | undefined
        const ok = await run(async () => {
          const r = await actions.createSettlement(input, requestId)
          id = r.settlementId
          return r
        }, { title: 'Liquidación creada', description: 'Configurá la distribución para calcular importes.' })
        if (ok && id) navigate(settlementPath(id))
      }}
    >
      <FormError message={formError} />
      <Field label="Proyecto" required error={errors.projectId}>
        {(p) => (
          <SelectInput {...p} value={input.projectId} disabled={Boolean(projectId)} onChange={(e) => patch({ projectId: e.target.value, currency: ws.projectById.get(e.target.value)?.currency ?? input.currency })}>
            <option value="">Elegí un proyecto</option>
            {ws.projects.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.code} · {ws.clientById.get(pr.clientId)?.name}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      <div className="grid gap-[12px] sm:grid-cols-2">
        <Field label="Prestadora" required error={errors.supplierId}>
          {(p) => (
            <SelectInput {...p} value={input.supplierId} onChange={(e) => patch({ supplierId: e.target.value })}>
              <option value="">Elegí</option>
              {partners.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Moneda" required error={errors.currency}>
          {(p) => (
            <SelectInput {...p} value={input.currency} onChange={(e) => patch({ currency: e.target.value as CurrencyCode })}>
              <option value="">Elegí</option>
              {CURRENCY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
      </div>
      <ReleaseFields release={input.release} note={input.releaseNote ?? ''} error={errors.releaseNote} onChange={(release, releaseNote) => patch({ release, releaseNote })} />
      <Footer onClose={onClose} busy={busy} label="Crear liquidación" />
    </form>
  )
}

function ReleaseFields({ release, note, error, onChange }: { release: SettlementRelease; note: string; error?: string; onChange: (r: SettlementRelease, note: string) => void }) {
  return (
    <>
      <Field label="Habilitación del pago" required>
        {(p) => (
          <SelectInput {...p} value={release} onChange={(e) => onChange(e.target.value as SettlementRelease, note)}>
            {(Object.keys(settlementReleaseLabel) as SettlementRelease[]).map((r) => (
              <option key={r} value={r}>
                {settlementReleaseLabel[r]}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      {release === 'manual' && (
        <Field label="Condición acordada" required error={error}>
          {(p) => <TextInput {...p} value={note} onChange={(e) => onChange(release, e.target.value)} maxLength={200} />}
        </Field>
      )}
    </>
  )
}

/* ───────────── Distribution rule ───────────── */

export function RuleModal({ settlement, onClose, workspace }: { settlement?: ProjectSettlement; onClose: () => void; workspace: Workspace }) {
  return (
    <Modal open={Boolean(settlement)} onClose={onClose} title="Configurar distribución" description="Participación de la prestadora sobre el resultado operativo (antes de impuestos). El resto corresponde a Eugenia." size="lg">
      {settlement && <RuleForm s={settlement} onClose={onClose} ws={workspace} />}
    </Modal>
  )
}

interface CompDraft extends Omit<SettlementComponent, 'pct' | 'amount'> {
  value: string
}

function RuleForm({ s, onClose, ws }: { s: ProjectSettlement; onClose: () => void; ws: Workspace }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [method, setMethod] = useState<SettlementMethod>(s.rule?.method ?? 'percentage')
  const [value, setValue] = useState(s.rule?.method === 'percentage' ? String(s.rule.pct) : s.rule?.method === 'fixed' ? String(s.rule.amount) : '')
  const [comps, setComps] = useState<CompDraft[]>(() => (s.rule?.components ?? []).map((c) => ({ id: c.id, serviceId: c.serviceId, method: c.method, value: String(c.method === 'percentage' ? c.pct : c.amount) })))
  const [release, setRelease] = useState(s.release)
  const [releaseNote, setReleaseNote] = useState(s.releaseNote ?? '')
  const [reason, setReason] = useState('')
  const services = ws.services.filter((x) => x.projectId === s.projectId)
  const rule = (): SettlementRule => ({
    method,
    pct: method === 'percentage' ? num(value) : undefined,
    amount: method === 'fixed' ? num(value) : undefined,
    components: comps.map((c) => ({ id: c.id, serviceId: c.serviceId, method: c.method, pct: c.method === 'percentage' ? num(c.value) : undefined, amount: c.method === 'fixed' ? num(c.value) : undefined })),
  })
  const setComp = (i: number, p: Partial<CompDraft>) => setComps((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)))

  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.configureSettlement(s.id, { rule: rule(), release, releaseNote }, reason), { title: 'Distribución guardada' })
        if (ok) onClose()
      }}
    >
      <FormError message={formError} />
      <div className="grid gap-[12px] sm:grid-cols-2">
        <Field label="Método" required>
          {(p) => (
            <SelectInput {...p} value={method} onChange={(e) => setMethod(e.target.value as SettlementMethod)}>
              {(Object.keys(settlementMethodLabel) as SettlementMethod[]).map((m) => (
                <option key={m} value={m}>
                  {settlementMethodLabel[m]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        {method !== 'by-service' && (
          <Field label={method === 'percentage' ? 'Porcentaje de la prestadora (%)' : `Importe fijo (${s.currency})`} required error={errors.pct ?? errors.amount}>
            {(p) => <TextInput {...p} data-autofocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}
          </Field>
        )}
      </div>
      {method === 'by-service' && (
        <div className="flex flex-col gap-[8px] rounded-panel bg-surface-muted p-[8px]">
          {comps.map((c, i) => (
            <div key={i} className="grid items-end gap-[8px] rounded-[14px] bg-surface p-[10px] sm:grid-cols-[minmax(0,1fr)_150px_130px_auto]">
              <Field label="Servicio" error={errors[`components.${i}.serviceId`]}>
                {(p) => (
                  <SelectInput {...p} value={c.serviceId} onChange={(e) => setComp(i, { serviceId: e.target.value })}>
                    <option value="">Elegí</option>
                    {services.map((x) => (
                      <option key={x.id} value={x.id}>
                        {getServiceType(x.typeId).label}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>
              <Field label="Tipo">
                {(p) => (
                  <SelectInput {...p} value={c.method} onChange={(e) => setComp(i, { method: e.target.value as 'percentage' | 'fixed' })}>
                    <option value="percentage">%</option>
                    <option value="fixed">Importe fijo</option>
                  </SelectInput>
                )}
              </Field>
              <Field label="Valor" error={errors[`components.${i}.value`]}>
                {(p) => <TextInput {...p} inputMode="decimal" value={c.value} onChange={(e) => setComp(i, { value: e.target.value })} />}
              </Field>
              <Button size="sm" variant="secondary" className="h-[46px]" aria-label="Quitar componente" onClick={() => setComps((cs) => cs.filter((_, j) => j !== i))}>
                <Trash2 aria-hidden className="size-[15px]" strokeWidth={1.9} />
              </Button>
            </div>
          ))}
          {errors.components && <p className="px-[6px] text-[12.5px] font-medium text-danger">{errors.components}</p>}
          <Button size="sm" variant="outline" className="self-start" onClick={() => setComps((cs) => [...cs, { id: '', serviceId: '', method: 'percentage', value: '' }])}>
            <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
            Agregar componente
          </Button>
        </div>
      )}
      <ReleaseFields release={release} note={releaseNote} error={errors.releaseNote} onChange={(r, n) => (setRelease(r), setReleaseNote(n))} />
      {s.rule && (
        <Field label="Motivo de la modificación" required error={errors.reason}>
          {(p) => <TextInput {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}
        </Field>
      )}
      <Footer onClose={onClose} busy={busy} label="Guardar distribución" />
    </form>
  )
}

/* ───────────── Adjustment / release / confirmation ───────────── */

export type AmountKind = 'adjustment' | 'release' | 'confirm'

const amountCopy: Record<AmountKind, { title: string; description: string; label: string }> = {
  adjustment: { title: 'Ajuste manual', description: 'Modifica la participación de la prestadora. Usá un importe negativo para reducirla. Queda registrado con fecha y motivo.', label: 'Registrar ajuste' },
  release: { title: 'Habilitar importe', description: 'Registra que se cumplió la condición acordada y habilita ese importe para pago.', label: 'Habilitar' },
  confirm: { title: 'Confirmar liquidación', description: 'Guarda una foto inmutable de los importes actuales. Las confirmaciones anteriores se conservan.', label: 'Confirmar' },
}

export function AmountModal({ settlement, kind, onClose }: { settlement?: ProjectSettlement; kind: AmountKind; onClose: () => void }) {
  const c = amountCopy[kind]
  return (
    <Modal open={Boolean(settlement)} onClose={onClose} title={c.title} description={c.description} size="sm">
      {settlement && <AmountForm s={settlement} kind={kind} onClose={onClose} />}
    </Modal>
  )
}

function AmountForm({ s, kind, onClose }: { s: ProjectSettlement; kind: AmountKind; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(DEMO_TODAY)
  const [reason, setReason] = useState('')
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        const input = { amount: num(amount), date, reason }
        const ok = await run(
          () => (kind === 'confirm' ? actions.confirmSettlement(s.id, reason) : kind === 'adjustment' ? actions.addSettlementAdjustment(s.id, input) : actions.recordSettlementRelease(s.id, input)),
          { title: kind === 'confirm' ? 'Liquidación confirmada' : kind === 'adjustment' ? 'Ajuste registrado' : 'Importe habilitado' },
        )
        if (ok) onClose()
      }}
    >
      <FormError message={formError} />
      {kind !== 'confirm' && (
        <div className="grid grid-cols-2 gap-[12px]">
          <Field label={`Importe (${s.currency})`} required error={errors.amount}>
            {(p) => <TextInput {...p} data-autofocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
          <Field label="Fecha" required error={errors.date}>
            {(p) => <DateInput {...p} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
      )}
      <Field label={kind === 'confirm' ? 'Nota (opcional)' : kind === 'adjustment' ? 'Justificación' : 'Condición cumplida'} required={kind !== 'confirm'} error={errors.reason}>
        {(p) => <TextInput {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />}
      </Field>
      <Footer onClose={onClose} busy={busy} label={amountCopy[kind].label} />
    </form>
  )
}

/* ───────────── Documented fiscal adjustment (Phase 4.9) ───────────── */

export function FiscalAdjustmentModal({ settlement, onClose }: { settlement?: ProjectSettlement; onClose: () => void }) {
  return (
    <Modal open={Boolean(settlement)} onClose={onClose} title="Ajuste fiscal documentado" description="Importe que reduce la base distribuible (negativo la aumenta), tal como figura en la documentación. SIGR no calcula impuestos con alícuotas supuestas." size="sm">
      {settlement && <FiscalForm s={settlement} onClose={onClose} />}
    </Modal>
  )
}

function FiscalForm({ s, onClose }: { s: ProjectSettlement; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [v, setV] = useState({ concept: '', amount: '', date: DEMO_TODAY, reference: '', reason: '' })
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => actions.addFiscalAdjustment(s.id, { ...v, amount: num(v.amount) }), { title: 'Ajuste fiscal registrado' })) onClose()
      }}
    >
      <FormError message={formError} />
      <Field label="Concepto" required error={errors.concept}>
        {(p) => <TextInput {...p} data-autofocus value={v.concept} onChange={(e) => setV((x) => ({ ...x, concept: e.target.value }))} maxLength={120} placeholder="Ej.: IIBB según DDJJ" />}
      </Field>
      <div className="grid grid-cols-2 gap-[12px]">
        <Field label={`Importe (${s.currency})`} required error={errors.amount}>
          {(p) => <TextInput {...p} inputMode="decimal" value={v.amount} onChange={(e) => setV((x) => ({ ...x, amount: e.target.value }))} />}
        </Field>
        <Field label="Fecha" required error={errors.date}>
          {(p) => <DateInput {...p} value={v.date} onChange={(e) => setV((x) => ({ ...x, date: e.target.value }))} />}
        </Field>
      </div>
      <Field label="Referencia / comprobante">{(p) => <TextInput {...p} value={v.reference} onChange={(e) => setV((x) => ({ ...x, reference: e.target.value }))} maxLength={120} />}</Field>
      <Field label="Respaldo / motivo" required error={errors.reason}>
        {(p) => <TextInput {...p} value={v.reason} onChange={(e) => setV((x) => ({ ...x, reason: e.target.value }))} maxLength={200} />}
      </Field>
      <Footer onClose={onClose} busy={busy} label="Registrar ajuste" />
    </form>
  )
}
