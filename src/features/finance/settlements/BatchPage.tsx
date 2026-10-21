import { Ban, CheckCheck, Copy, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/DataTable'
import { FormError } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { batchStatusMeta, paymentMethodLabel } from '@/config/finance'
import { supplierPath } from '@/config/navigation'
import { deductionProgress, isOrdered, lineProgress } from '@/domain/finance/batchProgress'
import { batchDifferences, batchFinancials, batchSummaryText, openCostProjects } from '@/domain/finance/batches'
import { ProjectRef } from '@/features/finance/components/ProjectRef'
import { copyText } from '@/features/finance/emission/copy'
import { SupplierPaymentDetailModal, SupplierPaymentModal } from '@/features/finance/modals/PaymentModals'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { staggerVariants } from '@/lib/motion'
import type { BatchDeduction, BatchLine, SettlementBatch } from '@/types/domain'

export function BatchPage() {
  const { batchId = '' } = useParams()
  const { workspace, loading } = useWorkspace()
  if (loading || !workspace) return <Skeleton className="mt-[28px] h-[420px] rounded-card" />
  const b = workspace.settlementBatches.find((x) => x.id === batchId)
  if (!b) return <NotFoundPage title="Liquidación no encontrada" />
  return <BatchView key={b.id} b={b} ws={workspace} />
}

function BatchView({ b, ws }: { b: SettlementBatch; ws: Workspace }) {
  const actions = useActions()
  const { notify } = useToast()
  const [dialog, setDialog] = useState<'confirm' | 'cancel' | 'pay' | null>(null)
  const [paymentId, setPaymentId] = useState<string>()
  const f = batchFinancials(ws.dataset, b)
  const prog = lineProgress(ws.dataset, b)
  const dprog = deductionProgress(ws.dataset, b)
  const legacy = isOrdered(b)
  const diffs = batchDifferences(ws.dataset, b, DEMO_TODAY)
  const payments = ws.supplierPayments.filter((p) => p.batchAllocations?.some((a) => a.batchId === b.id))
  const m = (v: number, c = b.currency) => formatMoney(v, c)
  const hasPayments = payments.some((p) => p.status === 'recorded')
  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-[10px]">
            <BackLink to="/finanzas?vista=liquidaciones" label="Resumen Flor" />
            <StatusBadge variant="soft" meta={batchStatusMeta[f.status]} />
          </div>
        }
        title={`Liquidación ${b.number}`}
        description={
          <span className="flex flex-wrap items-center gap-x-[10px]">
            <Link to={supplierPath(b.supplierId)} className="font-medium text-ink-secondary hover:underline">
              {ws.supplierById.get(b.supplierId)?.name}
            </Link>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span>
              {formatDate(b.date)} · {b.currency}
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={async () => notify({ title: (await copyText(batchSummaryText(ws.dataset, b))) ? 'Resumen copiado' : 'No se pudo copiar' })}>
              <Copy aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Copiar resumen
            </Button>
            {b.status !== 'cancelled' && !hasPayments && (
              <Button variant="outline" onClick={() => setDialog('cancel')}>
                <Ban aria-hidden className="size-[16px]" strokeWidth={1.9} />
                {b.status === 'draft' ? 'Descartar' : 'Liberar'}
              </Button>
            )}
            {b.status === 'draft' && (
              <Button onClick={() => setDialog('confirm')}>
                <CheckCheck aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Confirmar liquidación
              </Button>
            )}
            {b.status === 'confirmed' && f.outstanding > 0 && (
              <Button onClick={() => setDialog('pay')}>
                <Wallet aria-hidden className="size-[16px]" strokeWidth={1.9} />
                Registrar pago
              </Button>
            )}
          </>
        }
      />
      <motion.div variants={staggerVariants} initial="hidden" animate="show" className="mt-[28px] grid grid-cols-1 gap-[24px] xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-[24px] xl:col-span-2">
          <Card aria-labelledby="bl" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle
              id="bl"
              title="Participaciones incluidas"
              description={legacy ? 'Liquidación histórica: las deducciones se compensaron contra las líneas en orden de selección (se conserva tal como se registró).' : 'Participación de cada proyecto, sin reducción por gastos compartidos. Cada pago se distribuye en proporción a los saldos.'}
            />
            <DataTable<BatchLine>
              className="mt-[16px]"
              caption="Líneas"
              rows={b.lines}
              getRowId={(l) => l.id}
              minWidth={1240}
              dense
              columns={[
                { id: 'p', header: 'Proyecto', width: '22%', cell: (l) => <ProjectRef ws={ws} projectId={l.projectId} compact /> },
                {
                  id: 'calc',
                  header: 'Cálculo',
                  width: '22%',
                  cell: (l) =>
                    l.snapshot ? (
                      <span className="block whitespace-normal text-[12px] leading-[1.4] text-ink-secondary">
                        Base {formatMoney(l.snapshot.base, l.currency)} · {l.snapshot.pctLabel}
                        <span className="block">
                          Ajustes fiscales {formatMoney(l.snapshot.fiscalAdjustments, l.currency)} · {l.snapshot.costsClosed ? 'costos cerrados' : <span className="text-warning">costos abiertos</span>}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted">Se congela al confirmar</span>
                    ),
                },
                { id: 'orig', header: 'Importe', className: 'tabular', cell: (l) => formatMoney(l.amount, l.currency) },
                { id: 'fx', header: 'Conversión', width: '16%', cell: (l) => (l.fx ? <span className="tabular block whitespace-normal break-words text-[12px] leading-[1.35] text-muted">×{l.fx.rate} · {formatDate(l.fx.date)} · {l.fx.source}</span> : <span className="text-muted">—</span>) },
                { id: 'conv', header: `En ${b.currency}`, className: 'tabular font-medium', cell: (l) => m(l.converted) },
                ...(legacy ? [{ id: 'comp', header: 'Compensado (histórico)', className: 'tabular', cell: (l: BatchLine) => m(prog.get(l.id)!.compensated) }] : []),
                { id: 'cash', header: 'Liquidado', className: 'tabular text-success', cell: (l) => m(prog.get(l.id)!.cash) },
                { id: 'rem', header: 'Saldo', className: 'tabular font-semibold', cell: (l) => m(prog.get(l.id)!.remaining) },
              ]}
            />
          </Card>
          <Card aria-labelledby="bd" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="bd" title="Deducciones por gastos compartidos" description="Partidas independientes de la liquidación: parte de Florencia de cada gasto, con el porcentaje efectivo del registro. Se descuentan a medida que se paga." />
            <DataTable<BatchDeduction>
              className="mt-[16px]"
              caption="Deducciones"
              rows={b.deductions}
              getRowId={(d) => d.id}
              minWidth={860}
              dense
              columns={[
                { id: 'c', header: 'Gasto', width: '34%', cell: (d) => <span className="block truncate font-medium">{ws.costs.find((c) => c.id === d.costId)?.description}</span> },
                { id: 'pct', header: 'Florencia / Eugenia', cell: (d) => `${d.partnerPct}% / ${d.ownerPct}%` },
                { id: 'a', header: 'Deducido', className: 'tabular', cell: (d) => formatMoney(d.amount, d.currency) },
                { id: 'fx', header: 'Conversión', cell: (d) => (d.fx ? <span className="tabular block whitespace-normal text-[12px] text-muted">×{d.fx.rate} · {d.fx.source}</span> : '—') },
                { id: 'cv', header: `En ${b.currency}`, className: 'tabular font-medium', cell: (d) => m(d.converted) },
                { id: 'off', header: 'Descontado', className: 'tabular', cell: (d) => m(dprog.get(d.id)!.offset) },
                { id: 'rem', header: 'Por descontar', className: 'tabular font-semibold', cell: (d) => m(dprog.get(d.id)!.remaining) },
              ]}
              empty={<p className="px-[4px] text-[13.5px] text-muted">Sin deducciones.</p>}
            />
            {b.adjustments.length > 0 && (
              <ul className="mt-[12px] flex flex-col gap-[4px] text-[13.5px]">
                {b.adjustments.map((a) => (
                  <li key={a.id} className="flex justify-between rounded-[10px] bg-surface-muted px-[10px] py-[6px]">
                    <span>
                      Ajuste: {a.concept}
                      {a.reference && <span className="text-muted"> · {a.reference}</span>}
                    </span>
                    <span className="tabular font-medium">{m(a.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card aria-labelledby="bp" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="bp" title="Pagos registrados" description="Misma fuente única de pagos a proveedores; cada pago queda imputado a los proyectos." />
            <ul className="mt-[12px] flex flex-col gap-[6px] text-[14px]">
              {payments.length === 0 && <li className="text-muted">Sin pagos.</li>}
              {payments.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setPaymentId(p.id)} className="flex w-full justify-between gap-2 rounded-[12px] bg-surface-muted px-[12px] py-[9px] text-left hover:bg-surface-sunken">
                    <span className={p.status === 'reversed' ? 'text-muted line-through' : undefined}>
                      <span className="tabular font-medium">{p.number}</span>
                      <span className="text-muted">
                        {' '}
                        · {formatDate(p.date)} · {paymentMethodLabel[p.method]}
                        {p.reference && ` · ${p.reference}`}
                      </span>
                    </span>
                    <span className="tabular font-semibold">{m(p.amount)}</span>
                  </button>
                  {p.status === 'recorded' && (p.batchAllocations?.length || p.batchDeductions?.length) ? (
                    <ul className="mt-[4px] flex flex-col gap-[2px] px-[12px] text-[12.5px] text-muted">
                      {(p.batchAllocations ?? []).map((a) => (
                        <li key={a.id} className="flex justify-between gap-2">
                          <span>Participación {ws.projectById.get(b.lines.find((l) => l.id === a.lineId)?.projectId ?? '')?.code}</span>
                          <span className="tabular">
                            {m(a.amount)}
                            {a.originalCurrency !== b.currency && ` = ${formatMoney(a.originalAmount, a.originalCurrency)}`}
                          </span>
                        </li>
                      ))}
                      {(p.batchDeductions ?? []).map((d) => (
                        <li key={d.id} className="flex justify-between gap-2">
                          <span>Deducción · {ws.costs.find((c) => c.id === d.costId)?.description}</span>
                          <span className="tabular">−{m(d.amount)}</span>
                        </li>
                      ))}
                      {p.batchAdjustment ? (
                        <li className="flex justify-between gap-2">
                          <span>Ajustes</span>
                          <span className="tabular">{m(p.batchAdjustment)}</span>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="flex flex-col gap-[24px]">
          <Card aria-labelledby="bt" className="px-[20px] pb-[20px] pt-[20px]">
            <SectionTitle id="bt" size="sm" title="Desglose" />
            <dl className="mt-[12px] flex flex-col text-[14px]">
              {(
                [
                  ['Participaciones', f.gross],
                  ['Deducciones compartidas', -f.deductions],
                  ['Ajustes', f.adjustments],
                ] as [string, number][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line py-[7px]">
                  <dt className="text-ink-secondary">{k}</dt>
                  <dd className="tabular">{m(v)}</dd>
                </div>
              ))}
              <div className="flex justify-between py-[8px] text-[16px] font-semibold">
                <dt>Neto liquidado</dt>
                <dd className="tabular">{m(f.net)}</dd>
              </div>
              <div className="flex justify-between py-[4px]">
                <dt className="text-ink-secondary">Pagado</dt>
                <dd className="tabular text-success">{m(f.paid)}</dd>
              </div>
              <div className="flex justify-between py-[4px]">
                <dt className="text-ink-secondary">Saldo pendiente</dt>
                <dd className="tabular font-semibold">{m(f.outstanding)}</dd>
              </div>
            </dl>
            <p className="mt-[10px] text-[12.5px] text-muted">Confirmar no registra egresos. Las conversiones quedan congeladas: cotizaciones posteriores no la modifican.</p>
          </Card>
          {diffs.length > 0 && (
            <Card aria-labelledby="bdf" className="px-[20px] pb-[18px] pt-[20px]">
              <SectionTitle id="bdf" size="sm" title="Diferencias pendientes de ajuste" description="La participación actual cambió desde la confirmación (p. ej., costos nuevos). No se modifica la liquidación ni se generan pagos." />
              <ul className="mt-[10px] flex flex-col gap-[4px] text-[13px]">
                {diffs.map((d) => {
                  const l = b.lines.find((x) => x.id === d.lineId)!
                  return (
                    <li key={d.lineId} className="rounded-[10px] bg-warning-soft px-[10px] py-[6px] text-warning">
                      {ws.projectById.get(l.projectId)?.code}: {formatMoney(d.snapshotShare, l.currency)} → {formatMoney(d.currentShare, l.currency)} ({formatMoney(d.difference, l.currency)})
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
          <Card aria-labelledby="bh" className="px-[20px] pb-[18px] pt-[20px]">
            <SectionTitle id="bh" size="sm" title="Historial" />
            <ul className="mt-[10px] flex flex-col gap-[4px] text-[13px]">
              {b.history.map((h) => (
                <li key={h.id} className="rounded-[10px] bg-surface-muted px-[10px] py-[6px]">
                  <span className="font-medium">{h.action}</span>
                  {h.detail && <span className="text-muted"> · {h.detail}</span>}
                  <span className="tabular block text-[12px] text-muted">{formatDate(h.date.slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </motion.div>
      <ConfirmModal open={dialog === 'confirm'} onClose={() => setDialog(null)} b={b} ws={ws} />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title={b.status === 'draft' ? 'Descartar borrador' : 'Liberar liquidación'}
        tone="danger"
        confirmLabel={b.status === 'draft' ? 'Descartar' : 'Liberar'}
        reasonLabel="Motivo"
        message="La liquidación se conserva en el historial; sus saldos y deducciones vuelven a estar disponibles."
        onConfirm={async (reason) => {
          await actions.cancelBatch(b.id, reason)
          notify({ title: 'Liquidación liberada' })
        }}
      />
      <SupplierPaymentModal open={dialog === 'pay'} onClose={() => setDialog(null)} workspace={ws} batchId={b.id} supplierId={b.supplierId} />
      <SupplierPaymentDetailModal paymentId={paymentId} onClose={() => setPaymentId(undefined)} workspace={ws} />
    </div>
  )
}

function ConfirmModal({ open, onClose, b, ws }: { open: boolean; onClose: () => void; b: SettlementBatch; ws: Workspace }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [ack, setAck] = useState(false)
  const open_ = openCostProjects(ws.dataset, b)
  return (
    <Modal open={open} onClose={onClose} title={`Confirmar ${b.number}`} description="Compromete los saldos y congela el cálculo. No registra pagos." size="sm">
      {open && (
        <div className="flex flex-col gap-[14px]">
          <FormError message={formError} />
          {open_.length > 0 && (
            <label className="flex items-start gap-[10px] rounded-[14px] bg-warning-soft px-[12px] py-[10px] text-[13.5px] text-warning">
              <input type="checkbox" className="mt-[3px] size-[16px]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>
                {open_.map((id) => ws.projectById.get(id)?.code).join(', ')} {open_.length === 1 ? 'tiene' : 'tienen'} los costos abiertos: puede haber costos por registrar. Confirmo que liquido igual; si aparecen costos nuevos, se mostrarán como diferencias pendientes de ajuste.
                {errors.acknowledgeOpenCosts && <span className="block font-medium">Confirmación requerida.</span>}
              </span>
            </label>
          )}
          <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
            <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button size="sm" disabled={busy} onClick={async () => (await run(() => actions.confirmBatch(b.id, { acknowledgeOpenCosts: ack }), { title: 'Liquidación confirmada' })) && onClose()}>
              Confirmar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
