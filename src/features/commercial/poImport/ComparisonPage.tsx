import { GitCompare } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { DateInput, Field, FormError, TextArea, TextInput } from '@/components/ui/form'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusMeta } from '@/config/catalogs'
import { DEMO_TODAY } from '@/config/brand'
import { priceUnitLabel } from '@/config/commercial'
import { projectPath, purchaseOrderPath } from '@/config/navigation'
import {
  comparePoWithQuotation,
  DIFFERENCE_LABEL,
  isSettled,
  RESOLUTION_LABEL,
  reviewHistory,
  type ComparisonRow,
  type ReviewInput,
  type RowStatus,
  type Side,
} from '@/domain/commercial/poComparison'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatMoney, formatNumber } from '@/lib/format'
import type { ComparisonResolution, Project } from '@/types/domain'

const rowStatusMeta: Record<RowStatus, StatusMeta> = {
  match: { label: 'Coincide', tone: 'success' },
  difference: { label: 'Diferencia', tone: 'warning' },
  'not-authorized': { label: 'No autorizado', tone: 'danger' },
  review: { label: 'Pendiente de revisión', tone: 'accent' },
}

const resolutionMeta: Record<ComparisonResolution, StatusMeta> = {
  accepted: { label: 'Aceptada', tone: 'success' },
  rejected: { label: 'No autorizada', tone: 'danger' },
  exception: { label: 'Excepción', tone: 'info' },
}

export function ComparisonPage() {
  const { projectId = '' } = useParams()
  const { workspace, loading } = useWorkspace()
  if (loading || !workspace) {
    return (
      <div className="pt-[5px]" aria-busy="true" aria-label="Cargando">
        <Skeleton className="h-[34px] w-[260px] rounded-full" />
        <Skeleton className="mt-[28px] h-[360px] rounded-card" />
      </div>
    )
  }
  const project = workspace.projectById.get(projectId)
  if (!project) return <NotFoundPage title="Proyecto no encontrado" />
  return <ComparisonView ws={workspace} project={project} />
}

function SideCell({ s, kind }: { s?: Side; kind: ComparisonRow['kind'] }) {
  if (!s) return <span className="text-subtle">—</span>
  return (
    <span className="block min-w-0 whitespace-normal">
      {kind === 'terms' ? (
        <span className="font-medium">{s.description}</span>
      ) : (
        <>
          {s.quantity !== undefined && s.unitPrice !== undefined && (
            <span className="block text-[12.5px] text-ink-secondary">
              {formatNumber(s.quantity, Number.isInteger(s.quantity) ? 0 : 2)} × {formatMoney(s.unitPrice, s.currency)}
              {s.unit ? ` ${priceUnitLabel[s.unit]}` : ''}
            </span>
          )}
          <span className="tabular block font-semibold">{formatMoney(s.amount, s.currency)}</span>
        </>
      )}
      {s.details && <span className="block text-[12px] leading-[1.35] text-muted">{s.details}</span>}
      <span className="block truncate text-[11.5px] text-muted" title={s.refs.join(' · ')}>
        {s.refs.join(' · ')}
      </span>
    </span>
  )
}

function ComparisonView({ ws, project }: { ws: Workspace; project: Project }) {
  const [reviewing, setReviewing] = useState<ComparisonRow>()
  const c = comparePoWithQuotation(ws.dataset, project.id)
  const pending = c.rows.filter((r) => !isSettled(r))
  const counts = (Object.keys(rowStatusMeta) as RowStatus[]).map((s) => [s, c.rows.filter((r) => r.status === s).length] as const).filter(([, n]) => n)

  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={<BackLink to={`${projectPath(project.id)}?tab=finanzas`} label={project.code} />}
        title="OC vs. cotización"
        description={`${ws.clientById.get(project.clientId)?.name} · ${ws.personById.get(project.beneficiaryId)?.name}. Las diferencias nunca se aprueban solas: cada una necesita una resolución antes de facturar.`}
      />
      {!c.applicable ? (
        <Card className="mt-[28px]">
          <EmptyState icon={GitCompare} className="py-12" title="Sin comparación" description={c.reason ?? ''} />
        </Card>
      ) : (
        <>
          <Card className="mt-[28px] px-[19px] pb-[19px] pt-[19px]">
            <div className="flex flex-wrap items-center gap-[8px]" aria-label="Resumen de la comparación">
              {counts.map(([s, n]) => (
                <span key={s} className="inline-flex items-center gap-[6px] rounded-full bg-surface-muted px-[10px] py-[4px] text-[12.5px]">
                  <StatusBadge meta={rowStatusMeta[s]} /> <span className="tabular font-semibold">{n}</span>
                </span>
              ))}
              <span className="ml-auto text-[13px] text-muted">
                {pending.length ? `${pending.length} pendiente(s) de resolución: los servicios afectados no se facturan.` : 'Todas las filas están resueltas o coinciden.'}
              </span>
            </div>
            <p className="mt-[10px] text-[12.5px] text-muted">
              OC comparadas:{' '}
              {c.purchaseOrders.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <Link to={purchaseOrderPath(p.id)} className="font-medium text-ink hover:underline">
                    {p.clientPoNumber}
                  </Link>
                </span>
              ))}
              {c.manualPurchaseOrders.length > 0 && ` · OC cargadas a mano (sin comparación por ítem): ${c.manualPurchaseOrders.map((p) => p.clientPoNumber).join(', ')}`}
            </p>
            <DataTable<ComparisonRow>
              className="mt-[16px]"
              caption="Comparación OC vs. cotización"
              rows={c.rows}
              getRowId={(r) => r.key}
              minWidth={1000}
              columns={[
                { id: 'label', header: 'Concepto', width: '16%', cell: (r) => <span className={`block whitespace-normal ${r.kind === 'item' ? 'font-medium' : 'font-semibold'}`}>{r.label}</span> },
                { id: 'quote', header: 'Cotización', width: '19%', cell: (r) => <SideCell s={r.quote} kind={r.kind} /> },
                { id: 'po', header: 'Orden de compra', width: '19%', cell: (r) => <SideCell s={r.po} kind={r.kind} /> },
                {
                  id: 'diff',
                  header: 'Diferencia',
                  width: '18%',
                  cell: (r) =>
                    r.differences.length ? (
                      <span className="block whitespace-normal text-[12.5px] leading-[1.4]">{r.differences.map((d) => DIFFERENCE_LABEL[d]).join(' · ')}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    ),
                },
                {
                  id: 'status',
                  header: 'Estado',
                  width: '16%',
                  cell: (r) => (
                    <span className="block whitespace-normal">
                      <StatusBadge meta={rowStatusMeta[r.status]} />
                      {r.review && (
                        <span className="mt-[2px] block">
                          <StatusBadge meta={resolutionMeta[r.review.resolution]} />
                        </span>
                      )}
                      {r.staleReview && <span className="block text-[11.5px] text-warning">Resolución anterior desactualizada</span>}
                    </span>
                  ),
                },
                {
                  id: 'action',
                  header: 'Acción',
                  width: '12%',
                  cell: (r) =>
                    r.status === 'match' && !r.review ? (
                      <span className="text-[12.5px] text-muted">Sin acción</span>
                    ) : (
                      <Button size="sm" variant={r.review ? 'secondary' : 'outline'} className="h-[32px] px-[10px] text-[12.5px]" aria-label={`Revisar ${r.label}`} onClick={() => setReviewing(r)}>
                        {r.review ? 'Ver / corregir' : 'Revisar'}
                      </Button>
                    ),
                },
              ]}
            />
          </Card>
          <Card className="mt-[24px] px-[19px] pb-[19px] pt-[19px]">
            <SectionTitle size="sm" title="Trazabilidad" description="Cotización aprobada → OC validada → servicios y subservicios autorizados → certificado (si corresponde) → factura. La cotización histórica no se modifica." />
          </Card>
        </>
      )}
      <ReviewModal row={reviewing} project={project} ws={ws} onClose={() => setReviewing(undefined)} />
    </div>
  )
}

function ReviewModal({ row, project, ws, onClose }: { row?: ComparisonRow; project: Project; ws: Workspace; onClose: () => void }) {
  return (
    <Modal open={Boolean(row)} onClose={onClose} title={row ? `Revisar: ${row.label}` : ''} description={row ? row.differences.map((d) => DIFFERENCE_LABEL[d]).join(' · ') || 'Coincide' : ''} size="md">
      {row && <ReviewForm row={row} project={project} ws={ws} onClose={onClose} />}
    </Modal>
  )
}

function ReviewForm({ row, project, ws, onClose }: { row: ComparisonRow; project: Project; ws: Workspace; onClose: () => void }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const [input, setInput] = useState<ReviewInput>({ resolution: row.status === 'not-authorized' ? 'rejected' : 'accepted', reason: '', evidence: '', date: DEMO_TODAY, reference: '' })
  const set = (p: Partial<ReviewInput>) => setInput((x) => ({ ...x, ...p }))
  const history = reviewHistory(ws.dataset, project.id, row.key)
  const options: ComparisonResolution[] = row.status === 'match' ? ['rejected'] : ['accepted', 'rejected', 'exception']
  return (
    <form
      className="flex flex-col gap-[14px]"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => actions.reviewComparisonRow(project.id, row.key, input), { title: 'Resolución registrada' })) onClose()
      }}
    >
      <FormError message={formError} />
      <fieldset>
        <legend className="mb-[6px] text-[13.5px] font-medium text-ink-secondary">Resolución</legend>
        <div className="flex flex-wrap gap-[8px]">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-[6px] rounded-full bg-surface-muted px-[12px] py-[7px] text-[13.5px]">
              <input type="radio" name="resolution" className="accent-[var(--color-ink)]" checked={input.resolution === o} onChange={() => set({ resolution: o })} />
              {RESOLUTION_LABEL[o]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Motivo" required error={errors.reason}>
        {(p) => <TextArea {...p} rows={2} value={input.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={500} />}
      </Field>
      <Field label="Evidencia de aprobación" required={row.status === 'review' && input.resolution !== 'rejected'} error={errors.evidence} hint="Email del cliente, acta, enmienda de la OC…">
        {(p) => <TextInput {...p} value={input.evidence} onChange={(e) => set({ evidence: e.target.value })} maxLength={300} />}
      </Field>
      <div className="grid gap-[12px] sm:grid-cols-2">
        <Field label="Fecha" required error={errors.date}>
          {(p) => <DateInput {...p} value={input.date} max={DEMO_TODAY} onChange={(e) => set({ date: e.target.value })} />}
        </Field>
        <Field label="Referencia comercial">{(p) => <TextInput {...p} value={input.reference} onChange={(e) => set({ reference: e.target.value })} maxLength={160} />}</Field>
      </div>
      {history.length > 0 && (
        <div className="rounded-panel bg-surface-muted px-[12px] py-[10px] text-[12.5px]">
          <p className="font-medium">Historial</p>
          <ul className="mt-[4px] flex flex-col gap-[6px]">
            {history.map((h) => (
              <li key={h.id} className={h.supersededById ? 'text-muted' : ''}>
                <span className="font-medium">{RESOLUTION_LABEL[h.resolution]}</span> · {formatDate(h.date)} · {h.reason}
                {h.evidence && ` · Evidencia: ${h.evidence}`}
                {h.reference && ` · Ref. ${h.reference}`}
                <span className="block text-[11.5px] text-muted">
                  {formatDateTime(h.createdAt)} · {ws.staffById.get(h.createdBy)?.name ?? h.createdBy} · resultado entonces: {h.snapshot.differences.join(', ') || 'coincidía'}
                  {h.supersededById ? ' · reemplazada' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex justify-end gap-[10px] border-t border-line pt-[14px]">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Registrar resolución
        </Button>
      </div>
    </form>
  )
}
