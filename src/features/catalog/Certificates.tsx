import { BadgeCheck, Ban, Check, FileCheck2, Plus, Send } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { DateInput, Field, FormError, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Timeline } from '@/components/ui/Timeline'
import { DEMO_TODAY } from '@/config/brand'
import { certificatePath, clientPath, invoicePath, projectPath } from '@/config/navigation'
import { randomId } from '@/domain/context'
import { certifiableUnits, certificateFlow, certificateTotal } from '@/domain/commercial/certificates'
import { lineSubtotal } from '@/domain/finance/derive'
import { activityKindMeta } from '@/features/projects/activityMeta'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { staggerVariants } from '@/lib/motion'
import type { Certificate, CertificateLine, Project } from '@/types/domain'
import { certificateStatusMeta } from './meta'
import { certificateColumns } from './certificateColumns'

/* ───────────── Project section ───────────── */

export function CertificatesSection({ ws, project, required }: { ws: Workspace; project: Project; required: boolean }) {
  const [creating, setCreating] = useState(false)
  const certs = ws.certificates.filter((c) => c.projectId === project.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const units = certifiableUnits(ws.dataset, project.id)
  if (!required && certs.length === 0) return null
  return (
    <Card aria-labelledby="pf-certs" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="pf-certs"
        title="Certificados"
        description={required ? 'Este cliente exige certificado aprobado para facturar. Se puede certificar en forma parcial, varias veces.' : 'Certificados registrados para este proyecto.'}
        action={
          <Button size="sm" onClick={() => setCreating(true)} disabled={!units.some((u) => u.available > 0)}>
            <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
            Nuevo certificado
          </Button>
        }
      />
      <DataTable className="mt-[18px]" caption="Certificados del proyecto" rows={certs} getRowId={(c) => c.id} minWidth={980} columns={certificateColumns(ws, false)} empty={<EmptyState icon={FileCheck2} title="Sin certificados" description="Creá el primero con los ítems a certificar." />} />
      {units.length > 0 && (
        <div className="mt-[14px] grid gap-[6px] sm:grid-cols-2 xl:grid-cols-3">
          {units.map((u) => (
            <div key={u.key} className="rounded-[14px] bg-surface-muted px-[12px] py-[9px] text-[13px]">
              <span className="block truncate font-medium">{u.description}</span>
              <span className="tabular block text-muted">
                Contratado {u.contracted} · certificado {u.certified} · aprobado {u.approved} · pendiente {u.available}
              </span>
            </div>
          ))}
        </div>
      )}
      <NewCertificateModal open={creating} onClose={() => setCreating(false)} ws={ws} project={project} />
    </Card>
  )
}

function NewCertificateModal({ open, onClose, ws, project }: { open: boolean; onClose: () => void; ws: Workspace; project: Project }) {
  return (
    <Modal open={open} onClose={onClose} title="Nuevo certificado" description="Paso 1: revisá los servicios e ítems. Luego generalo en el portal del cliente y registrá su número." size="lg">
      {open && <NewCertificateForm ws={ws} project={project} onClose={onClose} />}
    </Modal>
  )
}

function NewCertificateForm({ ws, project, onClose }: { ws: Workspace; project: Project; onClose: () => void }) {
  const actions = useActions()
  const navigate = useNavigate()
  const { run, busy, errors, formError } = useCommand()
  const [requestId] = useState(() => randomId('req'))
  const units = certifiableUnits(ws.dataset, project.id)
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(units.map((u) => [u.key, u.available ? String(u.available) : ''])))
  const [notes, setNotes] = useState('')
  const [correction, setCorrection] = useState('')
  const lines = units.map((u) => ({ serviceId: u.serviceId, serviceItemId: u.serviceItemId, quantity: Number((qty[u.key] ?? '').replace(',', '.')) || 0 }))
  const total = units.reduce((s, u, i) => s + lineSubtotal({ unitPrice: u.unitPrice, quantity: lines[i].quantity }), 0)
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        let id: string | undefined
        const ok = await run(async () => {
          const r = await actions.createCertificate({ projectId: project.id, lines, notes, correctionReason: correction }, requestId)
          id = r.certificateId
          return r
        }, { title: 'Certificado creado', description: 'Siguiente paso: generarlo en el portal del cliente.' })
        if (ok && id) navigate(certificatePath(id))
      }}
    >
      <FormError message={formError ?? errors.lines} />
      <div className="flex flex-col gap-[6px] rounded-panel bg-surface-muted p-[8px]">
        {units.map((u, i) => (
          <div key={u.key} className="grid items-center gap-[10px] rounded-[14px] bg-surface px-[12px] py-[9px] sm:grid-cols-[minmax(0,1fr)_110px_130px]">
            <span className="min-w-0 text-[14px]">
              <span className="block truncate font-medium">{u.description}</span>
              <span className="tabular block text-[12px] text-muted">
                {formatMoney(u.unitPrice, project.currency)} · pendiente {u.available} de {u.contracted}
              </span>
              {errors[`lines.${i}.quantity`] && <span className="block text-[12px] font-medium text-danger">{errors[`lines.${i}.quantity`]}</span>}
            </span>
            <TextInput aria-label={`Cantidad a certificar de ${u.description}`} inputMode="decimal" value={qty[u.key] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [u.key]: e.target.value }))} />
            <span className="tabular text-right text-[14px] font-semibold">{formatMoney(lineSubtotal({ unitPrice: u.unitPrice, quantity: lines[i].quantity }), project.currency)}</span>
          </div>
        ))}
      </div>
      <p className="flex justify-between px-[4px] text-[14px]">
        <span className="text-ink-secondary">Total a certificar</span>
        <span className="tabular font-semibold">{formatMoney(Math.round(total * 100) / 100, project.currency)}</span>
      </p>
      <Field label="Observaciones">{(p) => <TextInput {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />}</Field>
      <Field label="Corrección explícita (solo para recertificar ítems ya certificados)" hint="Dejar vacío salvo que el cliente pida recertificar.">
        {(p) => <TextInput {...p} value={correction} onChange={(e) => setCorrection(e.target.value)} maxLength={200} />}
      </Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Crear certificado
        </Button>
      </div>
    </form>
  )
}

/* ───────────── Certificate page ───────────── */

export function CertificatePage() {
  const { certificateId = '' } = useParams()
  const { workspace, loading } = useWorkspace()
  if (loading || !workspace) return <Skeleton className="mt-[28px] h-[420px] rounded-card" />
  const c = workspace.certificates.find((x) => x.id === certificateId)
  if (!c) return <NotFoundPage title="Certificado no encontrado" />
  return <CertificateView key={c.id} c={c} ws={workspace} />
}

function CertificateView({ c, ws }: { c: Certificate; ws: Workspace }) {
  const actions = useActions()
  const { notify } = useToast()
  const { run, busy, errors, formError } = useCommand()
  const [dialog, setDialog] = useState<'submit' | 'approve' | 'reject' | null>(null)
  const [extNumber, setExtNumber] = useState('')
  const [date, setDate] = useState(DEMO_TODAY)
  const project = ws.projectById.get(c.projectId)!
  const flow = certificateFlow(ws.dataset, c)
  const pending = c.status === 'rejected' ? undefined : flow.find((s) => !s.done)
  const invoices = ws.invoices.filter((i) => i.lines.some((l) => l.certificateId === c.id))
  const order = c.openOrderId ? ws.openOrders.find((o) => o.id === c.openOrderId) : undefined
  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-[10px]">
            <BackLink to={`${projectPath(project.id)}?tab=finanzas`} label={project.code} />
            <StatusBadge variant="soft" meta={certificateStatusMeta[c.status]} />
          </div>
        }
        title={c.externalNumber ? `Certificado ${c.externalNumber}` : `Certificado ${c.number}`}
        description={
          <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
            <Link to={clientPath(c.clientId)} className="font-medium text-ink-secondary hover:underline">
              {ws.clientById.get(c.clientId)?.name}
            </Link>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span>{order ? `OC abierta ${order.number} (${order.province})` : c.purchaseOrderId ? `OC ${ws.purchaseOrderById.get(c.purchaseOrderId)?.clientPoNumber}` : 'Sin OC'}</span>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span className="tabular">{c.number}</span>
          </span>
        }
        actions={
          <>
            {(c.status === 'draft' || c.status === 'submitted') && (
              <Button variant="outline" onClick={() => setDialog('reject')}>
                <Ban aria-hidden className="size-[16px]" strokeWidth={1.9} />
                {c.status === 'draft' ? 'Descartar' : 'Registrar rechazo'}
              </Button>
            )}
            {c.status === 'draft' && (
              <Button onClick={() => setDialog('submit')}>
                <Send aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Registrar presentación
              </Button>
            )}
            {c.status === 'submitted' && (
              <Button onClick={() => setDialog('approve')}>
                <BadgeCheck aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Registrar aprobación
              </Button>
            )}
          </>
        }
      />
      <motion.div variants={staggerVariants} initial="hidden" animate="show" className="mt-[28px] grid grid-cols-1 gap-[24px] xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-[24px] xl:col-span-2">
          <Card aria-labelledby="cert-lines" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="cert-lines" title="Ítems certificados" description="Precios contratados del proyecto (históricos)." />
            <DataTable<CertificateLine>
              className="mt-[18px]"
              caption="Líneas del certificado"
              rows={c.lines}
              getRowId={(l) => l.id}
              minWidth={620}
              columns={[
                { id: 'desc', header: 'Servicio / subservicio', width: '46%', cell: (l) => <span className="block truncate font-medium">{l.description}</span> },
                { id: 'qty', header: 'Cant.', width: '80px', className: 'tabular', cell: (l) => l.quantity },
                { id: 'price', header: 'Precio', className: 'tabular', cell: (l) => formatMoney(l.unitPrice, c.currency) },
                { id: 'sub', header: 'Importe', className: 'tabular font-semibold', cell: (l) => formatMoney(lineSubtotal(l), c.currency) },
              ]}
            />
            <p className="mt-[12px] flex justify-end gap-[8px] px-[6px] text-[15px]">
              Total <span className="tabular font-semibold">{formatMoney(certificateTotal(c), c.currency)}</span>
            </p>
          </Card>
          <Card aria-labelledby="cert-inv" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="cert-inv" title="Facturas" description="Facturas que usan este certificado. La factura se emite desde Finanzas; SIGR no emite comprobantes fiscales." />
            {invoices.length === 0 ? (
              <p className="mt-[12px] text-[14px] text-muted">{c.status === 'approved' ? 'Aprobado: ya se puede facturar desde Finanzas del proyecto.' : 'Se podrá facturar cuando el certificado esté aprobado.'}</p>
            ) : (
              <ul className="mt-[12px] flex flex-col gap-[6px] text-[14px]">
                {invoices.map((i) => (
                  <li key={i.id}>
                    <Link to={invoicePath(i.id)} className="tabular font-medium hover:underline">
                      {i.number}
                    </Link>{' '}
                    <span className="text-muted">· {i.lifecycle === 'draft' ? 'borrador' : i.lifecycle === 'cancelled' ? 'anulada' : 'emitida'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-[24px]">
          <Card aria-labelledby="cert-flow" className="px-[20px] pb-[20px] pt-[20px]">
            <SectionTitle id="cert-flow" size="sm" title="Flujo de certificación" description="El certificado se genera en el portal del cliente; SIGR solo registra cada paso." />
            <ol className="mt-[14px] flex flex-col gap-[8px]">
              {flow.map((s, i) => (
                <li key={s.label} className={cn('flex items-center gap-[10px] rounded-[14px] px-[12px] py-[9px] text-[14px]', pending?.label === s.label ? 'bg-info-soft font-medium text-info' : 'bg-surface-muted', s.done && 'text-ink-secondary')}>
                  <span className={cn('grid size-[22px] shrink-0 place-items-center rounded-full text-[12px]', s.done ? 'bg-success text-white' : 'bg-surface')}>{s.done ? <Check aria-hidden className="size-[13px]" strokeWidth={2.4} /> : i + 1}</span>
                  {s.label}
                  {pending?.label === s.label && <span className="ml-auto text-[12px]">Próximo paso</span>}
                </li>
              ))}
            </ol>
            {c.status === 'rejected' && <p className="mt-[12px] rounded-[14px] bg-danger-soft px-[12px] py-[9px] text-[13px] text-danger">Rechazado: {c.rejectionReason}</p>}
            <dl className="mt-[14px] grid grid-cols-2 gap-y-[10px] text-[13.5px]">
              <dt className="text-muted">Creado</dt>
              <dd>{formatDate(c.createdAt.slice(0, 10))}</dd>
              <dt className="text-muted">Presentado</dt>
              <dd>{c.submittedAt ? formatDate(c.submittedAt) : '—'}</dd>
              <dt className="text-muted">Aprobado</dt>
              <dd>{c.approvedAt ? formatDate(c.approvedAt) : '—'}</dd>
              <dt className="text-muted">Ref. documental</dt>
              <dd className="tabular truncate">{c.documentRef}</dd>
            </dl>
            {(c.notes || c.correctionReason) && (
              <p className="mt-[12px] text-[13px] text-ink-secondary">
                {c.notes}
                {c.correctionReason && <span className="block text-warning">Corrección: {c.correctionReason}</span>}
              </p>
            )}
          </Card>
          <Card aria-labelledby="cert-hist" className="px-[20px] pb-[18px] pt-[20px]">
            <SectionTitle id="cert-hist" size="sm" title="Historial" />
            <Timeline
              className="mt-[14px]"
              items={c.history.map((h, i) => ({ id: h.id, icon: activityKindMeta.finance.icon, highlight: i === 0, title: <><span className="font-medium">{h.action}</span>{h.reason && <span className="text-ink-secondary"> — {h.reason}</span>}</>, meta: ws.staffById.get(h.actorId)?.name, date: formatDateTime(h.date) }))}
            />
          </Card>
        </div>
      </motion.div>

      <Modal open={dialog === 'submit' || dialog === 'approve'} onClose={() => setDialog(null)} title={dialog === 'submit' ? 'Registrar presentación' : 'Registrar aprobación'} description={dialog === 'submit' ? 'Generá el certificado en el portal del cliente y cargá acá su número oficial.' : 'Al aprobarse, los ítems quedan habilitados para facturar.'} size="sm">
        {dialog && dialog !== 'reject' && (
          <form
            className="flex flex-col gap-[14px]"
            onSubmit={async (e) => {
              e.preventDefault()
              const ok = await run(() => (dialog === 'submit' ? actions.submitCertificate(c.id, { externalNumber: extNumber, date }) : actions.approveCertificate(c.id, { date })), { title: dialog === 'submit' ? 'Presentación registrada' : 'Certificado aprobado' })
              if (ok) setDialog(null)
            }}
          >
            <FormError message={formError} />
            {dialog === 'submit' && (
              <Field label="N.º oficial del certificado" required error={errors.externalNumber}>
                {(p) => <TextInput {...p} data-autofocus value={extNumber} onChange={(e) => setExtNumber(e.target.value)} maxLength={40} />}
              </Field>
            )}
            <Field label={dialog === 'submit' ? 'Fecha de presentación' : 'Fecha de aprobación'} required error={errors.date}>
              {(p) => <DateInput {...p} value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
            <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
              <Button size="sm" variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button size="sm" type="submit" disabled={busy}>
                Registrar
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title={c.status === 'draft' ? 'Descartar borrador' : 'Registrar rechazo'}
        tone="danger"
        confirmLabel={c.status === 'draft' ? 'Descartar' : 'Registrar rechazo'}
        reasonLabel="Motivo"
        message="El certificado se conserva en el historial y sus cantidades vuelven a estar disponibles para certificar."
        onConfirm={async (reason) => {
          await actions.rejectCertificate(c.id, reason)
          notify({ title: c.status === 'draft' ? 'Borrador descartado' : 'Rechazo registrado' })
        }}
      />
    </div>
  )
}
