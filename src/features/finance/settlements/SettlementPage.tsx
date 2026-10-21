import { CheckCheck, Link2, Plus, Settings2, SlidersHorizontal, Unlink } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Timeline } from '@/components/ui/Timeline'
import { DEMO_TODAY } from '@/config/brand'
import { paymentMethodLabel, settlementMethodLabel, settlementReleaseLabel, settlementSignalMeta } from '@/config/finance'
import { batchPath, clientPath, invoicePath, projectPath, supplierPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { DEFAULT_PARTNER_PCT, settlementFinancials } from '@/domain/finance/settlements'
import { obligationColumns } from '@/features/finance/components/ledgerColumns'
import { activityKindMeta } from '@/features/projects/activityMeta'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatMoney, formatPercent } from '@/lib/format'
import { staggerVariants } from '@/lib/motion'
import type { ProjectSettlement } from '@/types/domain'
import { AmountModal, FiscalAdjustmentModal, RuleModal, type AmountKind } from './SettlementModals'

export function SettlementPage() {
  const { settlementId = '' } = useParams()
  const { workspace, loading } = useWorkspace()
  if (loading || !workspace) {
    return (
      <div className="pt-[5px]" aria-busy="true" aria-label="Cargando liquidación">
        <Skeleton className="h-[34px] w-[260px] rounded-full" />
        <Skeleton className="mt-[28px] h-[420px] rounded-card" />
      </div>
    )
  }
  const s = workspace.settlements.find((x) => x.id === settlementId)
  if (!s) return <NotFoundPage title="Liquidación no encontrada" />
  return <SettlementView key={s.id} s={s} ws={workspace} />
}

interface MoveRow {
  id: string
  date: string
  kind: 'Cobro del cliente' | 'Pago a la prestadora'
  ref: string
  detail: string
  amount: number
  reversed: boolean
  href?: string
}

function SettlementView({ s, ws }: { s: ProjectSettlement; ws: Workspace }) {
  const actions = useActions()
  const { notify } = useToast()
  const { run, busy } = useCommand()
  const [dialog, setDialog] = useState<'rule' | AmountKind | null>(null)
  const [unlinking, setUnlinking] = useState<string>()
  const [fiscal, setFiscal] = useState(false)
  const f = settlementFinancials(ws.dataset, s, DEMO_TODAY)
  const project = ws.projectById.get(s.projectId)!
  const partner = ws.supplierById.get(s.supplierId)
  const m = (v: number | undefined) => (v === undefined ? '—' : formatMoney(v, s.currency))
  const rule = s.rule

  // Linked movements: client receipts on this project's invoices (same currency) and payments on linked partner obligations.
  const projectInvoices = new Set(ws.invoices.filter((i) => i.projectId === s.projectId && i.currency === s.currency).map((i) => i.id))
  const linkedIds = new Set(s.obligationIds)
  const moves: MoveRow[] = [
    ...ws.receipts.flatMap((r) =>
      r.allocations
        .filter((a) => projectInvoices.has(a.invoiceId))
        .map((a) => ({ id: a.id, date: a.date, kind: 'Cobro del cliente' as const, ref: r.number, detail: ws.invoiceById.get(a.invoiceId)?.number ?? '', amount: a.amount, reversed: r.status === 'reversed', href: invoicePath(a.invoiceId) })),
    ),
    ...ws.supplierPayments.flatMap((p) =>
      p.allocations
        .filter((a) => linkedIds.has(a.obligationId))
        .map((a) => ({ id: a.id, date: p.date, kind: 'Pago a la prestadora' as const, ref: p.number, detail: `${ws.obligationById.get(a.obligationId)?.reference} · ${paymentMethodLabel[p.method]}`, amount: a.amount, reversed: p.status === 'reversed', href: supplierPath(p.supplierId) })),
    ),
    ...ws.supplierPayments.flatMap((p) =>
      (p.batchAllocations ?? [])
        .filter((a) => a.settlementId === s.id)
        .map((a) => ({ id: a.id, date: p.date, kind: 'Pago a la prestadora' as const, ref: p.number, detail: `Liquidación ${ws.settlementBatches.find((b) => b.id === a.batchId)?.number ?? ''}${a.originalCurrency !== p.currency ? ` · ${formatMoney(a.originalAmount, a.originalCurrency)}` : ''}`, amount: a.originalAmount, reversed: p.status === 'reversed', href: batchPath(a.batchId) })),
    ),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const calc: [string, string, string?][] = [
    ['Ingresos netos registrados', m(f.netRevenue), 'Facturas emitidas, sin impuestos'],
    ['Costos directos', `− ${m(f.directCosts)}`, 'Costos incurridos; excluye las facturas vinculadas de la prestadora'],
    ['Ajustes fiscales documentados', `− ${m(f.fiscalAdjustments)}`, 'Cargados manualmente con respaldo; las retenciones de cobranzas no se descuentan'],
    ['Base distribuible', m(f.base), `Regla: ${f.pctLabel}`],
    ...(f.configured
      ? ([
          ['Participación Florencia', m(f.partnerShare), f.adjustments ? `Incluye ajustes por ${m(f.adjustments)}` : f.pctLabel],
          ['Liquidado en liquidaciones agrupadas', m(f.batchSettled)],
          ['Comprometido (confirmado, sin pagar)', m(f.committed)],
          ['Disponible para liquidar', m(f.available)],
          ['Participación Eugenia', m(f.ownerShare), 'Resultado base − participación de Florencia'],
          ['Cobrado al cliente', `${m(f.collected)} de ${m(f.grossInvoiced)}`],
          ['Liquidable según condición', m(f.releasable), settlementReleaseLabel[s.release]],
        ] as [string, string, string?][])
      : ([['Participaciones', 'Pendiente de configurar', 'Sin regla de distribución no se calculan importes']] as [string, string, string?][])),
    ['Facturado por Florencia', m(f.partnerInvoiced)],
    ['Pagado a Florencia', m(f.partnerPaid)],
    ...(f.configured
      ? ([
          ['Pendiente de pago (liquidable)', m(f.pendingPayment)],
          ['Saldo de la participación', m(f.shareOutstanding)],
        ] as [string, string, string?][])
      : []),
  ]

  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-[10px]">
            <BackLink to="/finanzas?vista=liquidaciones" label="Liquidaciones" />
            <StatusBadge variant="soft" meta={settlementSignalMeta[f.signal]} />
            <span className="text-[13px] text-muted">{f.signalNote}</span>
          </div>
        }
        title={`Liquidación ${project.code} · ${s.currency}`}
        description={
          <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
            <Link to={`${projectPath(project.id)}?tab=finanzas`} className="font-medium text-ink-secondary hover:underline">
              {project.code}
            </Link>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <Link to={clientPath(project.clientId)} className="hover:underline">
              {ws.clientById.get(project.clientId)?.name}
            </Link>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span>Eugenia – {partner?.name}</span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog('rule')}>
              <Settings2 aria-hidden className="size-[16px]" strokeWidth={1.9} />
              {rule ? 'Modificar distribución' : 'Configurar distribución'}
            </Button>
            <Button variant="outline" onClick={() => setFiscal(true)}>
              <Plus aria-hidden className="size-[16px]" strokeWidth={2} />
              Ajuste fiscal
            </Button>
            <Button variant="outline" onClick={() => setDialog('adjustment')}>
              <SlidersHorizontal aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Ajuste
            </Button>
            {s.release === 'manual' && (
              <Button variant="outline" onClick={() => setDialog('release')} disabled={!f.configured}>
                <Plus aria-hidden className="size-[16px]" strokeWidth={2} />
                Habilitar importe
              </Button>
            )}
            <Button onClick={() => setDialog('confirm')} disabled={!f.configured}>
              <CheckCheck aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Confirmar
            </Button>
          </>
        }
      />

      <motion.div variants={staggerVariants} initial="hidden" animate="show" className="mt-[28px] grid grid-cols-1 gap-[24px] xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-[24px] xl:col-span-2">
          <Card aria-labelledby="set-calc" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="set-calc" title="Detalle del cálculo" description="Derivado de facturas, cobros, costos, obligaciones y pagos existentes. No es un resultado después de impuestos." />
            <dl className="mt-[16px] flex flex-col rounded-panel bg-surface-muted px-[14px]">
              {calc.map(([label, value, hint], i) => (
                <div key={label} className={cn('flex flex-wrap items-baseline justify-between gap-x-4 gap-y-[2px] py-[10px] text-[14px]', i < calc.length - 1 && 'border-b border-line')}>
                  <dt>
                    <span className="block text-ink-secondary">{label}</span>
                    {hint && <span className="block text-[12px] text-muted">{hint}</span>}
                  </dt>
                  <dd className={cn('tabular font-semibold', value === 'Pendiente de configurar' && 'font-medium text-muted')}>{value}</dd>
                </div>
              ))}
            </dl>
            {f.warnings.length > 0 && (
              <ul className="mt-[12px] flex flex-col gap-[6px]">
                {f.warnings.map((w) => (
                  <li key={w} className="rounded-[14px] bg-warning-soft px-[12px] py-[9px] text-[13px] text-warning">
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card aria-labelledby="set-obl" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="set-obl" title="Facturas de la prestadora vinculadas" description="Se gestionan y pagan desde Proveedores. Vincularlas evita descontarlas también como costo directo." />
            <DataTable
              className="mt-[18px]"
              caption="Obligaciones vinculadas"
              rows={f.linked}
              getRowId={(o) => o.id}
              minWidth={1000}
              dense
              columns={[
                ...obligationColumns(ws, { withProject: false, withSupplier: false }),
                {
                  id: 'unlink',
                  header: '',
                  width: '120px',
                  cell: (o) => (
                    <button type="button" onClick={() => setUnlinking(o.id)} className="flex items-center gap-[6px] rounded-full px-[10px] py-[4px] text-[13px] text-ink-secondary hover:bg-surface-muted hover:text-ink">
                      <Unlink aria-hidden className="size-[14px]" strokeWidth={1.9} />
                      Desvincular
                    </button>
                  ),
                },
              ]}
              empty={<EmptyState title="Sin facturas vinculadas" description="Cuando la prestadora facture, registrá la obligación en Proveedores y vinculala acá." />}
            />
            {f.unlinked.length > 0 && (
              <div className="mt-[14px] rounded-panel bg-surface-muted p-[10px]">
                <p className="px-[4px] text-[13px] font-medium text-ink-secondary">Comprobantes de la prestadora en este proyecto sin vincular</p>
                <ul className="mt-[8px] flex flex-col gap-[6px]">
                  {f.unlinked.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-surface px-[12px] py-[9px] text-[14px]">
                      <span>
                        <span className="tabular font-medium">{o.reference}</span> <span className="text-muted">· {o.description}</span>
                      </span>
                      <span className="flex items-center gap-[10px]">
                        <span className="tabular font-semibold">{formatMoney(o.amount, o.currency)}</span>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => actions.linkSettlementObligation(s.id, o.id), { title: `${o.reference} vinculada` })}>
                          <Link2 aria-hidden className="size-[15px]" strokeWidth={1.9} />
                          Vincular
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card aria-labelledby="set-moves" className="px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle id="set-moves" title="Cobros y pagos vinculados" description="Cobros del cliente sobre facturas del proyecto en esta moneda y pagos sobre las facturas vinculadas. Las reversiones se muestran tachadas." />
            <DataTable<MoveRow>
              className="mt-[18px]"
              caption="Movimientos vinculados"
              rows={moves}
              getRowId={(r) => r.id}
              minWidth={760}
              dense
              columns={[
                { id: 'date', header: 'Fecha', width: '112px', className: 'tabular', cell: (r) => formatDate(r.date) },
                { id: 'kind', header: 'Movimiento', width: '22%', cell: (r) => <span className={cn('block truncate', r.kind === 'Cobro del cliente' ? 'text-success' : 'text-ink-secondary')}>{r.kind}</span> },
                {
                  id: 'ref',
                  header: 'Comprobante',
                  width: '30%',
                  cell: (r) => (
                    <Link to={r.href ?? '#'} className={cn('block truncate underline-offset-4 hover:underline', r.reversed && 'text-muted line-through')}>
                      <span className="tabular">{r.ref}</span> <span className="text-muted">· {r.detail}</span>
                    </Link>
                  ),
                },
                { id: 'amount', header: 'Importe', className: 'tabular font-medium', cell: (r) => <span className={r.reversed ? 'text-muted line-through' : undefined}>{formatMoney(r.amount, s.currency)}</span> },
              ]}
              empty={<EmptyState title="Sin movimientos vinculados" />}
            />
          </Card>
        </div>

        <div className="flex flex-col gap-[24px]">
          <Card aria-labelledby="set-rule" className="px-[20px] pb-[20px] pt-[20px]">
            <SectionTitle id="set-rule" size="sm" title="Distribución" />
            {!rule ? (
              <p className="mt-[12px] rounded-[14px] bg-surface-muted px-[12px] py-[10px] text-[13.5px] text-ink-secondary">Regla preliminar confirmada: {DEFAULT_PARTNER_PCT}% de la base distribuible para Florencia. Podés configurar una regla explícita para este proyecto.</p>
            ) : (
              <dl className="mt-[12px] flex flex-col gap-[10px] text-[14px]">
                <div>
                  <dt className="text-[12.5px] text-muted">Método</dt>
                  <dd className="font-medium">{settlementMethodLabel[rule.method]}</dd>
                </div>
                {rule.method === 'percentage' && (
                  <div>
                    <dt className="text-[12.5px] text-muted">Florencia / Eugenia</dt>
                    <dd className="tabular font-medium">
                      {formatPercent(rule.pct!)} / {formatPercent(100 - rule.pct!)} del resultado base
                    </dd>
                  </div>
                )}
                {rule.method === 'fixed' && (
                  <div>
                    <dt className="text-[12.5px] text-muted">Importe fijo de Florencia</dt>
                    <dd className="tabular font-medium">{m(rule.amount)}</dd>
                  </div>
                )}
                {rule.method === 'by-service' &&
                  rule.components.map((c) => (
                    <div key={c.id}>
                      <dt className="text-[12.5px] text-muted">{getServiceType(ws.serviceById.get(c.serviceId)?.typeId ?? c.serviceId).label}</dt>
                      <dd className="tabular font-medium">{c.method === 'percentage' ? `${formatPercent(c.pct!)} del resultado del servicio` : m(c.amount)}</dd>
                    </div>
                  ))}
              </dl>
            )}
            <p className="mt-[14px] text-[13px] text-ink-secondary">
              <span className="font-medium">Habilitación:</span> {settlementReleaseLabel[s.release]}
              {s.releaseNote && ` — ${s.releaseNote}`}
            </p>
          </Card>

          {(s.fiscalAdjustments?.length ?? 0) > 0 && (
            <Card aria-labelledby="set-fiscal" className="px-[20px] pb-[18px] pt-[20px]">
              <SectionTitle id="set-fiscal" size="sm" title="Ajustes fiscales documentados" />
              <ul className="mt-[12px] flex flex-col gap-[6px] text-[13.5px]">
                {s.fiscalAdjustments!.map((a) => (
                  <li key={a.id} className="rounded-[12px] bg-surface-muted px-[12px] py-[9px]">
                    <span className="flex justify-between gap-3">
                      <span className="font-medium">
                        {a.concept} · {formatDate(a.date)}
                      </span>
                      <span className="tabular font-semibold">{formatMoney(a.amount, s.currency)}</span>
                    </span>
                    <span className="block text-[12.5px] text-muted">
                      {a.reason}
                      {a.reference && ` · ${a.reference}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {(s.adjustments.length > 0 || s.releases.length > 0) && (
            <Card aria-labelledby="set-adj" className="px-[20px] pb-[18px] pt-[20px]">
              <SectionTitle id="set-adj" size="sm" title="Ajustes y habilitaciones" />
              <ul className="mt-[12px] flex flex-col gap-[6px] text-[13.5px]">
                {[...s.adjustments.map((a) => ({ ...a, label: 'Ajuste' })), ...s.releases.map((r) => ({ ...r, label: 'Habilitado' }))]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((a) => (
                    <li key={a.id} className="rounded-[12px] bg-surface-muted px-[12px] py-[9px]">
                      <span className="flex justify-between gap-3">
                        <span className="font-medium">
                          {a.label} · {formatDate(a.date)}
                        </span>
                        <span className="tabular font-semibold">{formatMoney(a.amount, s.currency)}</span>
                      </span>
                      <span className="block text-[12.5px] text-muted">{a.reason}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <Card aria-labelledby="set-conf" className="px-[20px] pb-[18px] pt-[20px]">
            <SectionTitle id="set-conf" size="sm" title="Liquidaciones confirmadas" />
            {s.confirmations.length === 0 ? (
              <p className="mt-[12px] text-[14px] text-muted">Sin confirmaciones.</p>
            ) : (
              <ul className="mt-[12px] flex flex-col gap-[6px] text-[13.5px]">
                {s.confirmations.map((c) => (
                  <li key={c.id} className="rounded-[12px] bg-surface-muted px-[12px] py-[9px]">
                    <span className="block font-medium">{formatDateTime(c.date)}</span>
                    <span className="tabular block text-[12.5px] text-ink-secondary">
                      Base {formatMoney(c.base, s.currency)} · Florencia {formatMoney(c.partnerShare, s.currency)} · Eugenia {formatMoney(c.ownerShare, s.currency)} · pagado {formatMoney(c.partnerPaid, s.currency)}
                    </span>
                    {c.note && <span className="block text-[12.5px] text-muted">{c.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card aria-labelledby="set-hist" className="px-[20px] pb-[18px] pt-[20px]">
            <SectionTitle id="set-hist" size="sm" title="Historial" />
            <Timeline
              className="mt-[14px]"
              items={s.history.map((h, i) => ({
                id: h.id,
                icon: activityKindMeta.finance.icon,
                highlight: i === 0,
                title: (
                  <>
                    <span className="font-medium">{h.action}</span>
                    {h.reason && <span className="text-ink-secondary"> — {h.reason}</span>}
                  </>
                ),
                meta: ws.staffById.get(h.actorId)?.name,
                date: formatDateTime(h.date),
              }))}
            />
          </Card>
        </div>
      </motion.div>

      <FiscalAdjustmentModal settlement={fiscal ? s : undefined} onClose={() => setFiscal(false)} />
      <RuleModal settlement={dialog === 'rule' ? s : undefined} onClose={() => setDialog(null)} workspace={ws} />
      <AmountModal settlement={dialog === 'adjustment' || dialog === 'release' || dialog === 'confirm' ? s : undefined} kind={dialog === 'adjustment' || dialog === 'release' || dialog === 'confirm' ? dialog : 'adjustment'} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={Boolean(unlinking)}
        onClose={() => setUnlinking(undefined)}
        title="Desvincular factura"
        confirmLabel="Desvincular"
        reasonLabel="Motivo"
        message="La factura y sus pagos no cambian; volverá a contarse como costo directo del proyecto."
        onConfirm={async (reason) => {
          await actions.unlinkSettlementObligation(s.id, unlinking!, reason)
          notify({ title: 'Factura desvinculada' })
        }}
      />
    </div>
  )
}
