import { Ban, HandCoins, MessageSquarePlus, Save, Send } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/DataTable'
import { Fact } from '@/components/ui/Fact'
import { Field, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Timeline } from '@/components/ui/Timeline'
import { invoiceStatusMeta } from '@/config/catalogs'
import { collectionActionLabel, FISCAL_DISCLAIMER, invoiceKindLabel, paymentMethodLabel } from '@/config/finance'
import { certificatePath, clientPath, projectPath, purchaseOrderPath, quotationPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { lineSubtotal } from '@/domain/finance/derive'
import type { InvoiceInput } from '@/domain/finance/invoices'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { staggerVariants } from '@/lib/motion'
import { activityKindMeta } from '@/features/projects/activityMeta'
import type { Invoice, InvoiceLine } from '@/types/domain'
import { InvoiceForm } from './modals/InvoiceForm'
import { CollectionActionModal, ReceiptDetailModal, RecordReceiptModal } from './modals/ReceiptModals'

export function InvoicePage() {
  const { invoiceId = '' } = useParams()
  const { workspace, loading } = useWorkspace()
  if (loading || !workspace) {
    return (
      <div className="pt-[5px]" aria-busy="true" aria-label="Cargando factura">
        <Skeleton className="h-[34px] w-[260px] rounded-full" />
        <Skeleton className="mt-[16px] h-[44px] w-[380px] max-w-full" />
        <Skeleton className="mt-[28px] h-[420px] rounded-card" />
      </div>
    )
  }
  const invoice = workspace.invoiceById.get(invoiceId)
  if (!invoice) return <NotFoundPage title="Factura no encontrada" />
  return <InvoiceView key={invoice.id} invoice={invoice} workspace={workspace} />
}

const toInput = (inv: Invoice): InvoiceInput => ({
  projectId: inv.projectId,
  issuerId: inv.issuerId,
  kind: inv.kind,
  issueDate: inv.issueDate,
  dueDate: inv.dueDate,
  currency: inv.currency,
  lines: inv.lines.map((l) => ({ ...l })),
  taxes: inv.taxes.map((t) => ({ ...t })),
  externalRef: inv.externalRef ?? '',
  notes: inv.notes ?? '',
})

function InvoiceView({ invoice: inv, workspace: ws }: { invoice: Invoice; workspace: Workspace }) {
  const actions = useActions()
  const { notify } = useToast()
  const { run, busy, errors, formError } = useCommand()
  const project = ws.projectById.get(inv.projectId)!
  const f = ws.invoiceFin.get(inv.id)!
  const isDraft = inv.lifecycle === 'draft'
  const [input, setInput] = useState<InvoiceInput>(() => toInput(inv))
  const [dialog, setDialog] = useState<'issue' | 'cancel' | 'receipt' | 'action' | null>(null)
  const [receiptId, setReceiptId] = useState<string>()
  const [externalRef, setExternalRef] = useState(inv.externalRef ?? '')
  const receipts = ws.receipts.filter((r) => r.allocations.some((a) => a.invoiceId === inv.id))
  const followUps = ws.collectionActions.filter((c) => c.invoiceId === inv.id)
  const money = (v: number) => formatCurrency(v, inv.currency, { decimals: 2 })

  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-[10px]">
            <BackLink to={`${projectPath(project.id)}?tab=finanzas`} label={project.code} />
            <StatusBadge variant="soft" meta={invoiceStatusMeta[f.status]} />
            {f.overdue && <span className="text-[13px] font-medium text-danger">{f.daysOverdue} días de atraso</span>}
          </div>
        }
        title={inv.number}
        description={
          <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
            <Link to={clientPath(inv.clientId)} className="font-medium text-ink-secondary hover:underline">
              {ws.clientById.get(inv.clientId)?.name}
            </Link>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span>{invoiceKindLabel[inv.kind]}</span>
            {inv.externalRef && (
              <>
                <span aria-hidden className="h-[13px] w-px bg-line-strong" />
                <span>Comprobante externo {inv.externalRef}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
            {inv.lifecycle !== 'cancelled' && f.paid === 0 && (
              <Button variant="outline" onClick={() => setDialog('cancel')}>
                <Ban aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Anular
              </Button>
            )}
            {isDraft && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => run(() => actions.updateInvoiceDraft(inv.id, input), { title: 'Borrador guardado' })}>
                  <Save aria-hidden className="size-[16px]" strokeWidth={1.9} />
                  Guardar
                </Button>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    if (!(await run(() => actions.updateInvoiceDraft(inv.id, input)))) return
                    setDialog('issue')
                  }}
                >
                  <Send aria-hidden className="size-[16px]" strokeWidth={1.9} />
                  Emitir
                </Button>
              </>
            )}
            {inv.lifecycle === 'issued' && f.outstanding > 0 && (
              <>
                <Button variant="outline" onClick={() => setDialog('action')}>
                  <MessageSquarePlus aria-hidden className="size-[16px]" strokeWidth={1.9} />
                  Gestión de cobranza
                </Button>
                <Button onClick={() => setDialog('receipt')}>
                  <HandCoins aria-hidden className="size-[16px]" strokeWidth={1.9} />
                  Registrar cobro
                </Button>
              </>
            )}
          </>
        }
      />

      <motion.div variants={staggerVariants} initial="hidden" animate="show" className="mt-[28px] grid grid-cols-1 gap-[24px] xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-[24px] xl:col-span-2">
          <Card aria-labelledby="inv-lines" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="inv-lines" title={isDraft ? 'Borrador' : 'Detalle'} description={isDraft ? 'Editable hasta emitirla.' : 'Las facturas emitidas no se editan: se anulan y se vuelven a emitir.'} />
            <div className="mt-[16px]">
              {isDraft ? (
                <InvoiceForm input={input} onChange={setInput} project={project} workspace={ws} errors={errors} formError={formError} invoiceId={inv.id} />
              ) : (
                <>
                  <DataTable<InvoiceLine>
                    caption="Líneas de la factura"
                    rows={inv.lines}
                    getRowId={(l) => l.id}
                    minWidth={760}
                    columns={[
                      {
                        id: 'desc',
                        header: 'Concepto',
                        width: '40%',
                        cell: (l) => {
                          const s = l.serviceId ? ws.serviceById.get(l.serviceId) : undefined
                          const q = l.quotationId ? ws.quotationById.get(l.quotationId) : undefined
                          const po = l.purchaseOrderId ? ws.purchaseOrderById.get(l.purchaseOrderId) : undefined
                          return (
                            <span className="block min-w-0">
                              <span className="block truncate font-medium">{l.description}</span>
                              <span className="block truncate text-[12px] text-muted">
                                {s ? getServiceType(s.typeId).label : l.reimbursable ? 'Reintegro de gastos' : '—'}
                                {q && (
                                  <>
                                    {' · '}
                                    <Link to={quotationPath(q.id)} className="hover:underline">
                                      {q.number} v{q.version}
                                    </Link>
                                  </>
                                )}
                                {l.certificateId && (
                                  <>
                                    {' · '}
                                    <Link to={certificatePath(l.certificateId)} className="hover:underline">
                                      Cert. {ws.certificates.find((c) => c.id === l.certificateId)?.externalNumber ?? ws.certificates.find((c) => c.id === l.certificateId)?.number}
                                    </Link>
                                  </>
                                )}
                                {l.openOrderId && ` · OC abierta ${ws.openOrders.find((o) => o.id === l.openOrderId)?.number ?? ''}`}
                                {po && (
                                  <>
                                    {' · '}
                                    <Link to={purchaseOrderPath(po.id)} className="hover:underline">
                                      OC {po.clientPoNumber}
                                    </Link>
                                  </>
                                )}
                              </span>
                            </span>
                          )
                        },
                      },
                      { id: 'qty', header: 'Cant.', width: '80px', className: 'tabular', cell: (l) => l.quantity },
                      { id: 'price', header: 'Precio unit.', width: '20%', className: 'tabular', cell: (l) => money(l.unitPrice) },
                      { id: 'sub', header: 'Subtotal', width: '20%', className: 'tabular font-semibold', cell: (l) => money(lineSubtotal(l)) },
                    ]}
                  />
                  <dl className="ml-auto mt-[14px] w-full max-w-[340px] rounded-panel bg-surface-muted px-[16px] py-[12px] text-[14px]">
                    <div className="flex justify-between py-[4px]">
                      <dt className="text-ink-secondary">Subtotal</dt>
                      <dd className="tabular font-medium">{money(f.subtotal)}</dd>
                    </div>
                    {f.taxes.map((t) => (
                      <div key={t.id} className="flex justify-between py-[4px]">
                        <dt className="text-ink-secondary">{t.label}</dt>
                        <dd className="tabular">{money(t.amount)}</dd>
                      </div>
                    ))}
                    <div className="mt-[6px] flex justify-between border-t border-line pt-[8px] text-[16px]">
                      <dt className="font-semibold">Total</dt>
                      <dd className="tabular font-semibold">{money(f.total)}</dd>
                    </div>
                  </dl>
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-[24px]">
          <Card aria-labelledby="inv-summary" className="px-[20px] pb-[20px] pt-[20px]">
            <SectionTitle id="inv-summary" size="sm" title="Cobranza" />
            <dl className="mt-[14px] grid grid-cols-2 gap-x-4 gap-y-[14px]">
              <Fact label="Total">
                <span className="tabular">{money(f.total)}</span>
              </Fact>
              <Fact label="Cobrado">
                <span className="tabular text-success">{money(f.paid)}</span>
              </Fact>
              <Fact label="Saldo">
                <span className="tabular">{money(f.outstanding)}</span>
              </Fact>
              <Fact label="Vencimiento">{formatDate(inv.dueDate)}</Fact>
              <Fact label="Emisión">{formatDate(inv.issueDate)}</Fact>
              <Fact label="Último cobro">{f.lastPaymentDate ? formatDate(f.lastPaymentDate) : '—'}</Fact>
              {inv.cancelReason && (
                <Fact label="Motivo de anulación" className="col-span-2">
                  <span className="whitespace-normal font-normal">{inv.cancelReason}</span>
                </Fact>
              )}
            </dl>
            {!isDraft && <p className="mt-[14px] rounded-[14px] bg-surface-muted px-[12px] py-[10px] text-[12px] leading-[1.5] text-muted">{FISCAL_DISCLAIMER}</p>}
          </Card>
          <Card aria-labelledby="inv-receipts" className="px-[20px] pb-[18px] pt-[20px]">
            <SectionTitle id="inv-receipts" size="sm" title="Cobros aplicados" />
            {receipts.length === 0 ? (
              <p className="mt-[12px] text-[14px] text-muted">Sin cobros registrados.</p>
            ) : (
              <ul className="mt-[12px] flex flex-col gap-[6px]">
                {receipts.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setReceiptId(r.id)} className="flex w-full items-center justify-between gap-3 rounded-[12px] bg-surface-muted px-[12px] py-[9px] text-left text-[14px] hover:bg-surface-sunken">
                      <span className={r.status === 'reversed' ? 'text-muted line-through' : undefined}>
                        <span className="tabular block font-medium">{r.number}</span>
                        <span className="block text-[12px] text-muted">
                          {formatDate(r.date)} · {paymentMethodLabel[r.method]}
                        </span>
                      </span>
                      <span className="tabular font-semibold">{money(r.allocations.filter((a) => a.invoiceId === inv.id).reduce((s, a) => s + a.amount, 0))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card aria-labelledby="inv-follow" className="px-[20px] pb-[18px] pt-[20px]">
            <SectionTitle id="inv-follow" size="sm" title="Gestiones de cobranza" />
            {followUps.length === 0 ? (
              <p className="mt-[12px] text-[14px] text-muted">Sin gestiones registradas.</p>
            ) : (
              <Timeline
                className="mt-[14px]"
                items={followUps.map((c, i) => ({
                  id: c.id,
                  icon: activityKindMeta.finance.icon,
                  highlight: i === 0,
                  title: (
                    <>
                      <span className="font-medium">{collectionActionLabel[c.kind]}:</span> {c.text}
                      {c.promisedDate && <span className="text-info"> · promete pagar el {formatDate(c.promisedDate)}</span>}
                    </>
                  ),
                  meta: ws.staffById.get(c.actorId)?.name,
                  date: formatDateTime(c.date),
                }))}
              />
            )}
          </Card>
        </div>
      </motion.div>

      <Modal open={dialog === 'issue'} onClose={() => setDialog(null)} title={`Emitir ${inv.number}`} size="sm">
        {dialog === 'issue' && (
          <form
            className="flex flex-col gap-[14px]"
            onSubmit={async (e) => {
              e.preventDefault()
              const ok = await run(() => actions.issueInvoice(inv.id, externalRef), { title: 'Factura emitida', description: 'Queda pendiente de cobro.' })
              if (ok) setDialog(null)
            }}
          >
            <p className="rounded-[14px] bg-info-soft px-[14px] py-[11px] text-[13px] leading-[1.5] text-info">{FISCAL_DISCLAIMER}</p>
            <Field label="N.º de comprobante externo (opcional)" error={errors.externalRef}>
              {(p) => <TextInput {...p} data-autofocus value={externalRef} onChange={(e) => setExternalRef(e.target.value)} maxLength={40} />}
            </Field>
            <p className="text-[13.5px] text-ink-secondary">
              Total a cobrar: <span className="tabular font-semibold text-ink">{money(f.total)}</span>. Emitir no registra ningún cobro.
            </p>
            <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
              <Button size="sm" variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button size="sm" type="submit" disabled={busy}>
                Confirmar emisión
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title={`Anular ${inv.number}`}
        tone="danger"
        confirmLabel="Anular factura"
        reasonLabel="Motivo de la anulación"
        message="La factura se conserva como anulada y libera los montos facturables de sus servicios."
        onConfirm={async (reason) => {
          await actions.cancelInvoice(inv.id, reason)
          notify({ title: 'Factura anulada' })
        }}
      />
      <RecordReceiptModal open={dialog === 'receipt'} onClose={() => setDialog(null)} workspace={ws} invoiceId={inv.id} />
      <CollectionActionModal invoiceId={dialog === 'action' ? inv.id : undefined} onClose={() => setDialog(null)} workspace={ws} />
      <ReceiptDetailModal receiptId={receiptId} onClose={() => setReceiptId(undefined)} workspace={ws} />
    </div>
  )
}
