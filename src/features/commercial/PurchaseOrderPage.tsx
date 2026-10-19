import { Ban, FileText, Link2, Pencil } from 'lucide-react'
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
import { Field, FormError, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { purchaseOrderStatusMeta } from '@/config/commercial'
import { clientPath, projectPath, quotationPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { allocatedTotal } from '@/domain/commercial/purchaseOrders'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { formatCurrency, formatPercent } from '@/lib/format'
import { staggerVariants } from '@/lib/motion'
import type { PoAllocation, PurchaseOrder } from '@/types/domain'
import { PurchaseOrderModal } from './PurchaseOrderModal'

export function PurchaseOrderPage() {
  const { poId = '' } = useParams()
  const { workspace, loading } = useWorkspace()
  if (loading || !workspace) {
    return (
      <div className="pt-[5px]" aria-busy="true" aria-label="Cargando orden de compra">
        <Skeleton className="h-[34px] w-[260px] rounded-full" />
        <Skeleton className="mt-[16px] h-[44px] w-[380px] max-w-full" />
        <Skeleton className="mt-[28px] h-[360px] rounded-card" />
      </div>
    )
  }
  const po = workspace.purchaseOrderById.get(poId)
  if (!po) return <NotFoundPage title="Orden de compra no encontrada" />
  return <PurchaseOrderView po={po} workspace={workspace} />
}

function PurchaseOrderView({ po, workspace: ws }: { po: PurchaseOrder; workspace: Workspace }) {
  const actions = useActions()
  const { notify } = useToast()
  const [dialog, setDialog] = useState<'edit' | 'cancel' | 'doc' | null>(null)
  const project = ws.projectById.get(po.projectId)!
  const client = ws.clientById.get(po.clientId)
  const quotation = po.quotationId ? ws.quotationById.get(po.quotationId) : undefined
  const allocated = allocatedTotal(po)
  const active = po.status === 'active'

  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-[10px]">
            <BackLink to={`${projectPath(project.id)}?tab=finanzas`} label={project.code} />
            <StatusBadge variant="soft" meta={purchaseOrderStatusMeta[po.status]} />
          </div>
        }
        title={po.clientPoNumber}
        description={
          <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
            <span className="tabular">{po.internalNumber}</span>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <Link to={clientPath(po.clientId)} className="font-medium text-ink-secondary hover:underline">
              {client?.name}
            </Link>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span>{ws.personById.get(project.beneficiaryId)?.name}</span>
          </span>
        }
        actions={
          active && (
            <>
              <Button variant="outline" onClick={() => setDialog('cancel')}>
                <Ban aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Anular
              </Button>
              <Button onClick={() => setDialog('edit')}>
                <Pencil aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Editar asignaciones
              </Button>
            </>
          )
        }
      />

      <motion.div variants={staggerVariants} initial="hidden" animate="show" className="mt-[28px] grid grid-cols-1 gap-[24px] xl:grid-cols-3">
        <Card aria-labelledby="po-alloc" className="min-w-0 px-[19px] pb-[19px] pt-[19px] xl:col-span-2">
          <SectionTitle id="po-alloc" title="Asignación por servicio" description="Monto de esta OC autorizado para cada servicio contratado." />
          <div className="mt-[16px] rounded-panel bg-surface-muted px-[16px] py-[14px]">
            <div className="flex flex-wrap items-baseline justify-between gap-3 text-[14px]">
              <span>
                Asignado <span className="tabular font-semibold">{formatCurrency(allocated, po.currency)}</span> de{' '}
                <span className="tabular font-semibold">{formatCurrency(po.authorizedAmount, po.currency)}</span>
              </span>
              <span className="tabular text-muted">{formatPercent(po.authorizedAmount ? (allocated / po.authorizedAmount) * 100 : 0)}</span>
            </div>
            <ProgressBar className="mt-[10px]" value={allocated} max={po.authorizedAmount || 1} label="Monto asignado de la OC" size="sm" tone="success" />
          </div>
          <DataTable<PoAllocation>
            className="mt-[16px]"
            caption="Asignaciones de la orden de compra"
            rows={po.allocations}
            getRowId={(a) => a.id}
            rowHref={() => `${projectPath(project.id)}?tab=finanzas`}
            minWidth={560}
            columns={[
              {
                id: 'service',
                header: 'Servicio',
                cell: (a) => {
                  const s = ws.serviceById.get(a.serviceId)
                  return (
                    <span className="flex min-w-0 items-center gap-[10px]">
                      {s && <ServiceChip type={s.typeId} />}
                      <span className="truncate font-medium">{s ? getServiceType(s.typeId).label : a.serviceId}</span>
                    </span>
                  )
                },
              },
              { id: 'amount', header: 'Autorizado', width: '180px', className: 'tabular font-semibold', cell: (a) => formatCurrency(a.amount, po.currency) },
              { id: 'notes', header: 'Notas', width: '30%', cell: (a) => <span className="block truncate text-muted">{a.notes ?? '—'}</span> },
            ]}
          />
        </Card>

        <div className="flex flex-col gap-[24px]">
          <Card aria-labelledby="po-data" className="px-[20px] pb-[20px] pt-[20px]">
            <SectionTitle id="po-data" size="sm" title="Datos de la OC" />
            <dl className="mt-[14px] grid grid-cols-2 gap-x-4 gap-y-[14px]">
              <Fact label="Emisión">{formatDate(po.issueDate)}</Fact>
              <Fact label="Recepción">{formatDate(po.receivedDate)}</Fact>
              <Fact label="Moneda">{po.currency}</Fact>
              <Fact label="Autorizado">
                <span className="tabular">{formatCurrency(po.authorizedAmount, po.currency)}</span>
              </Fact>
              <Fact label="Cotización" className="col-span-2">
                {quotation ? (
                  <Link to={quotationPath(quotation.id)} className="hover:underline">
                    {quotation.number} v{quotation.version}
                  </Link>
                ) : (
                  <span className="text-muted">Sin cotización asociada</span>
                )}
              </Fact>
              {po.notes && (
                <Fact label="Notas" className="col-span-2">
                  <span className="whitespace-normal font-normal">{po.notes}</span>
                </Fact>
              )}
              {po.cancelReason && (
                <Fact label="Motivo de anulación" className="col-span-2">
                  <span className="whitespace-normal font-normal">{po.cancelReason}</span>
                </Fact>
              )}
            </dl>
          </Card>
          <Card aria-labelledby="po-doc" className="px-[20px] pb-[20px] pt-[20px]">
            <SectionTitle id="po-doc" size="sm" title="Documento" description="La referencia es estable: el archivo se adjuntará cuando exista el almacenamiento." />
            <div className="mt-[14px] flex items-start gap-[12px] rounded-[14px] bg-surface-muted px-[14px] py-[12px]">
              <FileText aria-hidden className="mt-[2px] size-[18px] shrink-0 text-ink-secondary" strokeWidth={1.9} />
              <div className="min-w-0 flex-1 text-[14px]">
                <p className="tabular font-medium">{po.documentRef}</p>
                <p className="mt-[2px] truncate text-muted">{po.documentLabel ?? 'Sin documento vinculado'}</p>
              </div>
            </div>
            {active && (
              <Button size="sm" variant="outline" className="mt-[12px]" onClick={() => setDialog('doc')}>
                <Link2 aria-hidden className="size-[15px]" strokeWidth={2} />
                {po.documentLabel ? 'Cambiar documento' : 'Vincular documento'}
              </Button>
            )}
          </Card>
        </div>
      </motion.div>

      <PurchaseOrderModal open={dialog === 'edit'} onClose={() => setDialog(null)} workspace={ws} project={project} purchaseOrder={po} />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title="Anular orden de compra"
        tone="danger"
        confirmLabel="Anular OC"
        reasonLabel="Motivo de la anulación"
        message="Se liberan sus autorizaciones: los servicios volverán a quedar pendientes de OC. La OC se conserva como anulada."
        onConfirm={async (reason) => {
          await actions.cancelPurchaseOrder(po.id, reason)
          notify({ title: 'OC anulada' })
        }}
      />
      <LinkDocumentModal open={dialog === 'doc'} onClose={() => setDialog(null)} po={po} />
    </div>
  )
}

function LinkDocumentModal({ open, onClose, po }: { open: boolean; onClose: () => void; po: PurchaseOrder }) {
  return (
    <Modal open={open} onClose={onClose} title="Vincular documento" description={`Referencia ${po.documentRef}`} size="sm">
      {open && <LinkDocumentForm onClose={onClose} po={po} />}
    </Modal>
  )
}

function LinkDocumentForm({ onClose, po }: { onClose: () => void; po: PurchaseOrder }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [label, setLabel] = useState(po.documentLabel ?? '')
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(() => actions.linkPurchaseOrderDocument(po.id, label), { title: 'Documento vinculado' })
        if (ok) onClose()
      }}
      className="flex flex-col gap-[14px]"
    >
      <FormError message={formError} />
      <Field label="Nombre o referencia del documento" required error={errors.label} hint="Ej.: nombre del PDF o id en el gestor documental del cliente.">
        {(p) => <TextInput {...p} data-autofocus value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />}
      </Field>
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : 'Vincular'}
        </Button>
      </div>
    </form>
  )
}
