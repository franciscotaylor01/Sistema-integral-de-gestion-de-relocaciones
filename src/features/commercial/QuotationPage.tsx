import { CopyPlus, Download, FileCheck2, Mail, Save, Send, ThumbsDown, Trash2, Undo2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { AmountsText } from '@/components/ui/Amounts'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/DataTable'
import { Fact } from '@/components/ui/Fact'
import { DateInput, Field, FormError, TextArea } from '@/components/ui/form'
import { MetaBadge } from '@/components/ui/MetaBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { billingMilestoneLabel, priceUnitLabel, quotationStageMeta } from '@/config/commercial'
import { clientPath, projectPath, purchaseOrderPath, quotationPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { quotationDocument } from '@/domain/commercial/documents'
import { effectiveStatus, isAuthorizer, lineTotal, quotationStage, quotationTotals, type QuotationLineInput } from '@/domain/commercial/quotations'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { cardVariants, staggerVariants } from '@/lib/motion'
import type { Quotation, QuotationLine } from '@/types/domain'
import { ApproveQuotationModal } from './ApproveQuotationModal'
import { PurchaseOrderModal } from './PurchaseOrderModal'
import { QuotationLinesEditor } from './QuotationLinesEditor'
import { EmailModal } from './documents/EmailModal'
import { downloadFile, quotationEmail } from './documents/emails'
import { dmy } from './documents/layout'
import { quotationPdf } from './documents/quotationPdf'

const sourceMeta = {
  'price-list': { label: 'Tarifa', tone: 'success' },
  adjusted: { label: 'Ajustado', tone: 'warning' },
  manual: { label: 'Manual', tone: 'neutral' },
  special: { label: 'Especial', tone: 'accent' },
} as const

export function QuotationPage() {
  const { quotationId = '' } = useParams()
  const { workspace, loading } = useWorkspace()
  if (loading || !workspace) {
    return (
      <div className="pt-[5px]" aria-busy="true" aria-label="Cargando cotización">
        <Skeleton className="h-[34px] w-[260px] rounded-full" />
        <Skeleton className="mt-[16px] h-[44px] w-[380px] max-w-full" />
        <Skeleton className="mt-[28px] h-[420px] rounded-card" />
      </div>
    )
  }
  const quotation = workspace.quotationById.get(quotationId)
  if (!quotation) return <NotFoundPage title="Cotización no encontrada" description="Puede haber sido un borrador descartado." />
  return <QuotationView key={quotation.id} quotation={quotation} workspace={workspace} />
}

function QuotationView({ quotation: q, workspace: ws }: { quotation: Quotation; workspace: Workspace }) {
  const actions = useActions()
  const navigate = useNavigate()
  const { notify } = useToast()
  const user = useCurrentUser()
  const { run, busy, errors, formError } = useCommand()
  const project = ws.projectById.get(q.projectId)!
  const client = ws.clientById.get(q.clientId)
  const status = effectiveStatus(q, DEMO_TODAY)
  const stage = quotationStage(q, DEMO_TODAY)
  /** Editable only while a plain draft; "ready" drafts are frozen for sending. */
  const isDraft = q.status === 'draft' && !q.preparedAt
  const isReady = stage === 'ready'
  const communications = ws.communications.filter((c) => c.quotationId === q.id).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
  const makePdf = () => quotationPdf(quotationDocument(ws.dataset, q.id, DEMO_TODAY), dmy(DEMO_TODAY))
  const fileName = () => quotationDocument(ws.dataset, q.id, DEMO_TODAY).fileName
  const versions = ws.quotations.filter((x) => x.number === q.number).sort((a, b) => b.version - a.version)
  const linkedPos = ws.purchaseOrders.filter((p) => p.quotationId === q.id)
  const supersededBy = q.supersededById ? ws.quotationById.get(q.supersededById) : undefined
  const canAuthorize = isAuthorizer(user?.id ?? '')

  // Draft editing state.
  const initialLines = useMemo<QuotationLineInput[]>(() => q.lines.map((l) => ({ ...l })), [q.lines])
  const [lines, setLines] = useState<QuotationLineInput[]>(initialLines)
  const [issueDate, setIssueDate] = useState(q.issueDate)
  const [validUntil, setValidUntil] = useState(q.validUntil)
  const [notes, setNotes] = useState(q.notes ?? '')
  const dirty = isDraft && (JSON.stringify(lines) !== JSON.stringify(initialLines) || issueDate !== q.issueDate || validUntil !== q.validUntil || notes !== (q.notes ?? ''))
  const [dialog, setDialog] = useState<'email' | 'register' | 'reject' | 'discard' | 'version' | 'approve' | 'po' | null>(null)

  const draftTotals = quotationTotals(lines.map((l) => ({ ...l, quantity: l.quantity || 0, unitPrice: l.unitPrice || 0 })))
  /** Saves and re-syncs local state with the stored draft (new lines get ids). */
  const saveDraft = async () => {
    const result = await actions.updateQuotationDraft(q.id, { issueDate, validUntil, notes, lines })
    const saved = result.dataset.quotations.find((x) => x.id === q.id)
    if (saved) setLines(saved.lines.map((l) => ({ ...l })))
    return result
  }

  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-[10px]">
            <BackLink to={`${projectPath(project.id)}?tab=finanzas`} label={project.code} />
            <StatusBadge variant="soft" meta={quotationStageMeta[stage]} />
            {supersededBy && <MetaBadge>Reemplazada por v{supersededBy.version}</MetaBadge>}
          </div>
        }
        title={
          <>
            {q.number} <span className="text-muted">v{q.version}</span>
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
            <Link to={clientPath(q.clientId)} className="font-medium text-ink-secondary hover:underline">
              {client?.name}
            </Link>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span>{ws.personById.get(project.beneficiaryId)?.name}</span>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span>
              {project.origin.city} → {project.destination.city}
            </span>
          </span>
        }
        actions={
          <>
            {isDraft && (
              <>
                <Button variant="outline" onClick={() => setDialog('discard')} disabled={busy}>
                  <Trash2 aria-hidden className="size-[16px]" strokeWidth={1.9} />
                  Descartar
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !dirty}
                  onClick={() => run(saveDraft, { title: 'Borrador guardado' })}
                >
                  <Save aria-hidden className="size-[16px]" strokeWidth={1.9} />
                  Guardar
                </Button>
                <Button
                  onClick={async () => {
                    if (dirty && !(await run(saveDraft))) return
                    await run(() => actions.markQuotationReady(q.id), { title: 'Cotización preparada para envío', description: 'El contenido quedó bloqueado. Descargá el PDF o prepará el email.' })
                  }}
                  disabled={busy}
                >
                  <Send aria-hidden className="size-[16px]" strokeWidth={1.9} />
                  Preparar para envío
                </Button>
              </>
            )}
            {isReady && (
              <Button variant="outline" disabled={busy} onClick={() => run(() => actions.reopenQuotationDraft(q.id), { title: 'Volvió a borrador' })}>
                <Undo2 aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Volver a borrador
              </Button>
            )}
            {!isDraft && (
              <Button variant="outline" onClick={() => downloadFile(makePdf(), fileName())}>
                <Download aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Descargar PDF
              </Button>
            )}
            {isReady && (
              <Button variant="outline" onClick={() => setDialog('register')}>
                <FileCheck2 aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Registrar envío
              </Button>
            )}
            {(isReady || status === 'sent' || status === 'expired') && (
              <Button variant={isReady ? 'primary' : 'outline'} onClick={() => setDialog('email')}>
                <Mail aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Preparar email
              </Button>
            )}
            {(status === 'sent' || status === 'expired') && (
              <Button variant="outline" onClick={() => setDialog('reject')}>
                <ThumbsDown aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Registrar rechazo
              </Button>
            )}
            {q.status !== 'draft' && !versions.some((v) => v.status === 'draft') && (
              <Button variant="outline" onClick={() => setDialog('version')}>
                <CopyPlus aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Nueva versión
              </Button>
            )}
            {status === 'sent' && (
              <Button onClick={() => setDialog('approve')} disabled={!canAuthorize} title={canAuthorize ? undefined : 'Solo Dirección o Finanzas pueden registrar aprobaciones'}>
                <FileCheck2 aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Registrar aprobación
              </Button>
            )}
            {status === 'approved' && !q.supersededById && client?.policy.requiresPurchaseOrder && (
              <Button onClick={() => setDialog('po')}>Registrar OC</Button>
            )}
          </>
        }
      />

      <motion.div variants={staggerVariants} initial="hidden" animate="show" className="mt-[28px] grid grid-cols-1 gap-[24px] xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-[24px] xl:col-span-2">
          <Card aria-labelledby="quote-lines" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle
              id="quote-lines"
              title="Líneas"
              description={isDraft ? 'Precios sugeridos desde el tarifario del cliente. Los ajustes requieren motivo.' : 'Snapshot de precios: no cambia aunque se actualice el tarifario.'}
            />
            <div className="mt-[16px]">
              <FormError message={formError} />
              {isDraft ? (
                <QuotationLinesEditor lines={lines} onChange={setLines} project={project} workspace={ws} issueDate={issueDate} errors={errors} actorId={user?.id ?? ''} />
              ) : (
                <ReadOnlyLines lines={q.lines} />
              )}
            </div>
          </Card>
          {versions.length > 1 && (
            <Card aria-labelledby="quote-versions" className="px-[19px] pb-[19px] pt-[19px]">
              <SectionTitle id="quote-versions" size="sm" title="Versiones" description="Las versiones anteriores se conservan sin cambios." />
              <ul className="mt-[14px] flex flex-col gap-[8px]">
                {versions.map((v) => (
                  <li key={v.id}>
                    <Link
                      to={quotationPath(v.id)}
                      aria-current={v.id === q.id ? 'page' : undefined}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-3 rounded-[14px] px-[14px] py-[10px] transition-colors',
                        v.id === q.id ? 'bg-contrast text-on-contrast' : 'bg-surface-muted hover:bg-surface-sunken',
                      )}
                    >
                      <span className="font-medium">
                        v{v.version} · {formatDate(v.issueDate)}
                      </span>
                      <span className="flex items-center gap-[12px] text-[13.5px]">
                        <AmountsText inline amounts={quotationTotals(v.lines)} />
                        <StatusBadge meta={quotationStageMeta[quotationStage(v, DEMO_TODAY)]} className={v.id === q.id ? 'text-on-contrast' : undefined} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-[24px]">
          <Card aria-labelledby="quote-summary" className="px-[20px] pb-[20px] pt-[20px] xl:sticky xl:top-[24px]">
            <SectionTitle id="quote-summary" size="sm" title="Resumen" />
            <div className="mt-[14px] rounded-panel bg-surface-muted px-[14px] py-[12px]">
              <p className="text-[12.5px] text-muted">Total por moneda</p>
              <AmountsText amounts={isDraft ? draftTotals : quotationTotals(q.lines)} className="mt-[4px] text-[22px] font-semibold tracking-[-0.02em]" />
              {Object.keys(isDraft ? draftTotals : quotationTotals(q.lines)).length > 1 && (
                <p className="mt-[6px] text-[12px] text-muted">Monedas separadas: no se suman sin una política de conversión.</p>
              )}
            </div>
            {isDraft ? (
              <div className="mt-[14px] flex flex-col gap-[12px]">
                <Field label="Emisión" required error={errors.issueDate}>
                  {(p) => <DateInput {...p} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />}
                </Field>
                <Field label="Válida hasta" required error={errors.validUntil}>
                  {(p) => <DateInput {...p} value={validUntil} min={issueDate} onChange={(e) => setValidUntil(e.target.value)} />}
                </Field>
                <Field label="Notas para el cliente" error={errors.notes}>
                  {(p) => <TextArea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="min-h-[76px]" />}
                </Field>
                {dirty && <p className="text-[12.5px] text-warning">Hay cambios sin guardar.</p>}
              </div>
            ) : (
              <dl className="mt-[14px] grid grid-cols-2 gap-x-4 gap-y-[14px]">
                <Fact label="Emisión">{formatDate(q.issueDate)}</Fact>
                <Fact label="Válida hasta">{formatDate(q.validUntil)}</Fact>
                {q.preparedAt && q.status === 'draft' && <Fact label="Preparada">{formatDate(q.preparedAt)}</Fact>}
                {q.sentAt && <Fact label="Enviada">{formatDate(q.sentAt)}</Fact>}
                {q.approvedAt && <Fact label="Aprobada">{formatDate(q.approvedAt)}</Fact>}
                {q.sentRef && (
                  <Fact label="Referencia de envío" className="col-span-2">
                    <span className="whitespace-normal">{q.sentRef}</span>
                  </Fact>
                )}
                {q.approvalRef && (
                  <Fact label="Referencia de aprobación" className="col-span-2">
                    <span className="whitespace-normal">{q.approvalRef}</span>
                  </Fact>
                )}
                {q.approvedBy && (
                  <Fact label="Aprobada por" className="col-span-2">
                    <span className="whitespace-normal">{q.approvedBy}</span>
                  </Fact>
                )}
                {q.rejectionReason && (
                  <Fact label="Motivo del rechazo" className="col-span-2">
                    <span className="whitespace-normal">{q.rejectionReason}</span>
                  </Fact>
                )}
                {q.notes && (
                  <Fact label="Notas" className="col-span-2">
                    <span className="whitespace-normal font-normal">{q.notes}</span>
                  </Fact>
                )}
              </dl>
            )}
            {client && (
              <p className="mt-[16px] rounded-[14px] bg-surface-muted px-[14px] py-[10px] text-[12.5px] leading-[1.5] text-ink-secondary">
                Política de {client.name}: {client.policy.requiresPurchaseOrder ? 'exige OC' : 'no exige OC'} · factura{' '}
                {billingMilestoneLabel[client.policy.billingMilestone].toLowerCase()}.
              </p>
            )}
          </Card>
          <Card aria-labelledby="quote-comms" className="px-[20px] pb-[18px] pt-[20px]">
            <SectionTitle id="quote-comms" size="sm" title="Envíos registrados" description="Registro manual: SIGR no envía emails." />
            {communications.length === 0 ? (
              <p className="mt-[12px] text-[13px] text-muted">{isReady ? 'Preparada, todavía sin envío registrado.' : 'Sin envíos registrados.'}</p>
            ) : (
              <ul className="mt-[12px] flex flex-col gap-[8px]">
                {communications.map((c) => (
                  <li key={c.id} className="rounded-[14px] bg-surface-muted px-[12px] py-[10px] text-[13px]">
                    <span className="block font-medium">Enviado el {formatDate(c.sentAt)}{c.reference ? ` · ${c.reference}` : ''}</span>
                    <span className="block truncate text-muted">{c.recipients ? `A ${c.recipients} · ` : ''}{c.subject}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {linkedPos.length > 0 && (
            <Card aria-labelledby="quote-pos" className="px-[20px] pb-[18px] pt-[20px]">
              <SectionTitle id="quote-pos" size="sm" title="Órdenes de compra" />
              <ul className="mt-[12px] flex flex-col gap-[8px]">
                {linkedPos.map((po) => (
                  <li key={po.id}>
                    <Link to={purchaseOrderPath(po.id)} className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-muted px-[12px] py-[10px] hover:bg-surface-sunken">
                      <span className="tabular truncate text-[14px] font-medium">{po.clientPoNumber}</span>
                      <span className="tabular text-[13.5px]">{formatCurrency(po.authorizedAmount, po.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </motion.div>

      <EmailModal
        open={dialog === 'email' || dialog === 'register'}
        onClose={() => setDialog(null)}
        mode={dialog === 'register' ? 'register' : 'email'}
        title={dialog === 'register' ? `Registrar envío de ${q.number} v${q.version}` : `Email para ${q.number} v${q.version}`}
        draft={quotationEmail(quotationDocument(ws.dataset, q.id, DEMO_TODAY), user?.name)}
        docLabel={fileName()}
        downloads={[{ label: 'Descargar PDF', onDownload: () => downloadFile(makePdf(), fileName()) }]}
        minDate={q.sentAt ?? q.issueDate}
        onRegister={(input, requestId) => actions.registerQuotationSent(q.id, input, requestId)}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title="Registrar rechazo"
        confirmLabel="Registrar rechazo"
        tone="danger"
        reasonLabel="Motivo del rechazo"
        message="La versión queda rechazada y se conserva en el historial. Podés crear una nueva versión."
        onConfirm={async (reason) => {
          await actions.rejectQuotation(q.id, reason)
          notify({ title: 'Rechazo registrado' })
        }}
      />
      <ConfirmDialog
        open={dialog === 'discard'}
        onClose={() => setDialog(null)}
        title="Descartar borrador"
        confirmLabel="Descartar"
        tone="danger"
        message="El borrador se eliminará. Las versiones emitidas no se ven afectadas."
        onConfirm={async () => {
          await actions.discardQuotationDraft(q.id)
          notify({ title: 'Borrador descartado' })
          navigate(`${projectPath(project.id)}?tab=finanzas`)
        }}
      />
      <ConfirmDialog
        open={dialog === 'version'}
        onClose={() => setDialog(null)}
        title={`Nueva versión de ${q.number}`}
        confirmLabel="Crear versión"
        message={`Se crea un borrador v${Math.max(...versions.map((v) => v.version)) + 1} copiando estas líneas. Esta versión no se modifica.`}
        onConfirm={async () => {
          const r = await actions.createQuotationVersion(q.id)
          notify({ title: 'Nueva versión creada' })
          navigate(quotationPath(r.quotationId))
        }}
      />
      <ApproveQuotationModal
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        quotation={q}
        defaultApprover={client?.contacts.find((c) => c.primary)?.name ?? ''}
      />
      <PurchaseOrderModal open={dialog === 'po'} onClose={() => setDialog(null)} workspace={ws} project={project} quotationId={q.id} />
    </div>
  )
}

function ReadOnlyLines({ lines }: { lines: QuotationLine[] }) {
  return (
    <motion.div variants={cardVariants}>
      <DataTable<QuotationLine>
        caption="Líneas de la cotización"
        rows={lines}
        getRowId={(l) => l.id}
        minWidth={820}
        columns={[
          {
            id: 'service',
            header: 'Servicio',
            width: '30%',
            cell: (l) => (
              <span className="flex min-w-0 items-center gap-[10px]">
                <ServiceChip type={l.serviceTypeId} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.description}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {l.serviceId ? getServiceType(l.serviceTypeId).label : 'Ítem adicional'}
                    {l.notes && ` · ${l.notes}`}
                  </span>
                  {l.details && <span className="block whitespace-normal text-[12.5px] leading-[1.4] text-ink-secondary">{l.details}</span>}
                </span>
              </span>
            ),
          },
          { id: 'qty', header: 'Cant.', width: '72px', className: 'tabular', cell: (l) => l.quantity },
          { id: 'unit', header: 'Unidad', width: '15%', cell: (l) => <span className="text-ink-secondary">{priceUnitLabel[l.unit]}</span> },
          { id: 'price', header: 'Precio unit.', width: '14%', className: 'tabular', cell: (l) => formatCurrency(l.unitPrice, l.currency) },
          { id: 'total', header: 'Total', width: '14%', className: 'tabular font-semibold', cell: (l) => formatCurrency(lineTotal(l), l.currency) },
          {
            id: 'source',
            header: 'Origen',
            width: '14%',
            cell: (l) => (
              <span className="block" title={l.adjustmentReason}>
                <StatusBadge meta={sourceMeta[l.priceSource]} />
                {l.priceSource === 'adjusted' && l.suggestedUnitPrice !== undefined && (
                  <span className="tabular block text-[12px] text-muted">tarifa {formatCurrency(l.suggestedUnitPrice, l.currency)}</span>
                )}
              </span>
            ),
          },
        ]}
      />
    </motion.div>
  )
}
