import { BadgeCheck, FileSpreadsheet, HandCoins } from 'lucide-react'
import { Link } from 'react-router'
import { AmountsText } from '@/components/ui/Amounts'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PillLink } from '@/components/ui/PillLink'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { projectPath } from '@/config/navigation'
import { addAmount, type Amounts } from '@/domain/commercial/money'
import { settlementFinancials } from '@/domain/finance/settlements'
import { initialStageMeta } from '@/features/documents/initialDocs'
import type { Workspace } from '@/hooks/useWorkspace'
import type { AttentionRow, InitialDocRow } from '../selectors'

/** Active projects with real blockers; each reason links to the tab where it is solved. */
export function AttentionCard({ rows, limit = 6 }: { rows: AttentionRow[]; limit?: number }) {
  return (
    <Card aria-labelledby="attention-title" className="h-full px-[20px] pb-[16px] pt-[18px]">
      <div className="flex h-[34px] items-center justify-between gap-3">
        <h2 id="attention-title" className="text-[16px] font-medium">
          Proyectos que requieren atención
        </h2>
        <PillLink to="/proyectos?estado=activos">{rows.length}</PillLink>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={BadgeCheck} className="py-6" title="Sin bloqueos operativos" description="Ningún proyecto activo tiene tareas vencidas, servicios bloqueados ni documentos pendientes." />
      ) : (
        <ul className="mt-[12px] flex flex-col gap-[8px]">
          {rows.slice(0, limit).map((r) => (
            <li key={r.projectId} className="rounded-[14px] bg-surface-muted px-[12px] py-[9px] text-[13px]">
              <Link to={projectPath(r.projectId)} className="font-medium hover:underline">
                <span className="tabular">{r.projectCode}</span> <span className="font-normal text-muted">· {r.clientName}</span>
              </Link>
              <span className="mt-[2px] flex flex-wrap gap-x-[10px] gap-y-[2px]">
                {r.reasons.map((x) => (
                  <Link key={x.text} to={x.href} className="text-ink-secondary underline-offset-2 hover:text-ink hover:underline">
                    {x.text}
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Next operational actions derived from the beneficiary's initial documentation (tasks live in "Mis tareas"). */
export function InitialDocsCard({ rows, limit = 6 }: { rows: InitialDocRow[]; limit?: number }) {
  return (
    <Card aria-labelledby="idocs-dash-title" className="h-full px-[20px] pb-[16px] pt-[18px]">
      <div className="flex h-[34px] items-center justify-between gap-3">
        <h2 id="idocs-dash-title" className="text-[16px] font-medium">
          Documentación inicial pendiente
        </h2>
        <PillLink to="/documentos">Plantillas</PillLink>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} className="py-6" title="Sin formularios pendientes" description="No hay documentación inicial por enviar ni esperando respuesta del beneficiario." />
      ) : (
        <ul className="mt-[12px] flex flex-col gap-[8px]">
          {rows.slice(0, limit).map((r) => (
            <li key={r.id}>
              <Link to={r.href} className="block rounded-[14px] bg-surface-muted px-[12px] py-[9px] text-[13px] hover:bg-surface-sunken">
                <span className="flex flex-wrap items-center gap-[8px]">
                  <span className="font-medium">{r.name}</span>
                  <StatusBadge meta={initialStageMeta[r.stage]} />
                </span>
                <span className="block text-[12px] text-muted">
                  <span className="tabular">{r.projectCode}</span> · {r.step}
                </span>
              </Link>
            </li>
          ))}
          {rows.length > limit && <li className="px-[4px] text-[12.5px] text-muted">y {rows.length - limit} más…</li>}
        </ul>
      )}
    </Card>
  )
}

/** Partner (Florencia) settlements: released but unpaid, and available for a grouped settlement. Existing calculations only. */
export function PartnerSettlementsCard({ ws }: { ws: Workspace }) {
  let pending: Amounts = {}
  let available: Amounts = {}
  let count = 0
  for (const s of ws.settlements) {
    const f = settlementFinancials(ws.dataset, s, DEMO_TODAY)
    if (f.pendingPayment > 0) {
      pending = addAmount(pending, s.currency, f.pendingPayment)
      count++
    }
    if (f.available > 0) available = addAmount(available, s.currency, f.available)
  }
  return (
    <Card aria-labelledby="partner-title" className="h-full px-[20px] pb-[16px] pt-[18px]">
      <div className="flex h-[34px] items-center justify-between gap-3">
        <h2 id="partner-title" className="text-[16px] font-medium">
          Liquidaciones a Florencia
        </h2>
        <PillLink to="/finanzas?vista=liquidaciones">Resumen Flor</PillLink>
      </div>
      {count === 0 && !Object.keys(available).length ? (
        <EmptyState icon={HandCoins} className="py-6" title="Sin liquidaciones pendientes" />
      ) : (
        <dl className="mt-[12px] grid grid-cols-1 gap-[8px] text-[13px] min-[420px]:grid-cols-2">
          <div className="rounded-[14px] bg-surface-muted px-[12px] py-[10px]">
            <dt className="text-ink-secondary">Liberado pendiente de pago ({count})</dt>
            <dd className="mt-[4px] font-semibold">
              <AmountsText amounts={pending} />
            </dd>
          </div>
          <div className="rounded-[14px] bg-surface-muted px-[12px] py-[10px]">
            <dt className="text-ink-secondary">Disponible para liquidación agrupada</dt>
            <dd className="mt-[4px] font-semibold">
              <AmountsText amounts={available} />
            </dd>
          </div>
        </dl>
      )}
    </Card>
  )
}
