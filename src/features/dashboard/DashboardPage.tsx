import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetaBadge } from '@/components/ui/MetaBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { brand, DEMO_TODAY } from '@/config/brand'
import { commercialAlerts, sortAlerts } from '@/features/commercial/alerts'
import { financeAlerts } from '@/features/finance/alerts'
import { summarizeLedger } from '@/features/finance/selectors'
import { useQuery } from '@/hooks/useQuery'
import { useWorkspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { greetingForHour } from '@/lib/format'
import { staggerVariants } from '@/lib/motion'
import { dataSource } from '@/services/dataSource'
import { ActiveProjectsCard } from './components/ActiveProjectsCard'
import { AlertsCard } from './components/AlertsCard'
import { CashflowChartCard } from '@/features/finance/components/CashflowChartCard'
import { DashboardSkeleton } from './components/DashboardSkeleton'
import { KpiGrid } from './components/KpiGrid'
import { MyTasksCard } from './components/MyTasksCard'
import { AttentionCard, InitialDocsCard, PartnerSettlementsCard } from './components/OperationsCards'
import { ProfitabilityCard } from './components/ProfitabilityCard'
import { RecentActivityCard } from './components/RecentActivityCard'
import { RecentProjectsCard } from './components/RecentProjectsCard'
import { ReceivablesCard } from './components/ReceivablesCard'
import { SupplierPaymentsCard } from './components/SupplierPaymentsCard'
import { UpcomingDeadlinesCard } from './components/UpcomingDeadlinesCard'
import { BillingQueueCard, CertificatesCard, PoQueueCard, WorkKpis } from './components/WorkQueueCards'
import { workQueue } from './selectors'

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div id={id} className="scroll-mt-[24px] pt-[10px] md:col-span-2 xl:col-span-3">
      <h2 className="text-[22px] font-semibold tracking-[-0.015em]">{title}</h2>
      <p className="mt-[2px] text-[14px] text-muted">{description}</p>
    </div>
  )
}

/**
 * Phase 5.0D — Eugenia's daily work centre: billing and commercial approvals
 * first, then operations, then finance (all previous cards are kept).
 */
export function DashboardPage() {
  const { workspace, loading, error } = useWorkspace()
  const { data: user } = useQuery('current-user', dataSource.getCurrentUser)
  const [greeting] = useState(() => greetingForHour(new Date().getHours()))
  const ledger = useMemo(() => workspace && summarizeLedger(workspace), [workspace])
  // Derived once per data change (not on every render).
  const queue = useMemo(() => workspace && workQueue(workspace.dataset, DEMO_TODAY), [workspace])
  const alerts = useMemo(
    () => workspace && sortAlerts([...financeAlerts(workspace), ...commercialAlerts(workspace).filter((a) => !a.id.startsWith('com_po_')), ...workspace.alerts]),
    [workspace],
  )
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash || !queue) return
    const el = document.getElementById(hash.slice(1))
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, queue])

  return (
    <div className="pt-[5px]">
      <PageHeader
        title={`${greeting}${user ? `, ${user.firstName}` : ''}`}
        description={
          <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
            <span>
              Qué falta facturar, qué OC y certificados lo impiden, y luego operaciones y finanzas de {brand.clientName} al {formatDate(DEMO_TODAY)}. Importes por moneda, sin convertir.
            </span>
            {brand.demoMode && <MetaBadge>Datos de demostración</MetaBadge>}
          </span>
        }
      />

      {loading && <DashboardSkeleton />}

      {error && (
        <Card className="mt-[34px]">
          <EmptyState title="No pudimos cargar el dashboard" description={error.message} />
        </Card>
      )}

      {workspace && ledger && queue && alerts && (
        <motion.div variants={staggerVariants} initial="hidden" animate="show" className="mt-[34px] grid grid-cols-1 gap-x-[23px] gap-y-[24px] md:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0 md:col-span-2 xl:col-span-3">
            <WorkKpis q={queue} />
          </div>

          <SectionHeading id="seccion-facturacion" title="Facturación y aprobaciones" description="Prioridad del día: conceptos facturables, OC y certificados que bloquean la facturación." />
          <div className="min-w-0 md:col-span-2 xl:col-span-3">
            <BillingQueueCard rows={queue.billing} />
          </div>
          <div className="min-w-0 md:col-span-2 xl:col-span-3">
            <PoQueueCard rows={queue.pos} />
          </div>
          <div className="min-w-0 md:col-span-2 xl:col-span-3">
            <CertificatesCard rows={queue.certificates} drafts={queue.billing.filter((r) => r.state === 'draft')} />
          </div>

          <SectionHeading id="seccion-operaciones" title="Operaciones" description="Proyectos activos, bloqueos, tareas, documentación del beneficiario y próximos vencimientos." />
          <ActiveProjectsCard projects={workspace.projects} />
          <AttentionCard rows={queue.attention} />
          <MyTasksCard workspace={workspace} />
          <InitialDocsCard rows={queue.initialDocs} />
          <UpcomingDeadlinesCard workspace={workspace} />
          <div className="min-w-0 md:col-span-2 xl:col-span-1">
            <RecentActivityCard workspace={workspace} />
          </div>
          <div className="min-w-0 md:col-span-2 xl:col-span-3">
            <RecentProjectsCard workspace={workspace} limit={7} />
          </div>

          <SectionHeading id="seccion-finanzas" title="Finanzas" description="Cobranzas, pagos a proveedores y liquidaciones (sin cambios en los cálculos)." />
          <ProfitabilityCard projects={workspace.projects} />
          <KpiGrid ledger={ledger} />
          <div className="md:col-span-2 xl:col-span-1">
            <CashflowChartCard workspace={workspace} />
          </div>
          <div className="min-w-0 md:col-span-2 xl:col-span-3">
            <ReceivablesCard workspace={workspace} />
          </div>
          <SupplierPaymentsCard workspace={workspace} />
          <PartnerSettlementsCard ws={workspace} />
          <div className="min-w-0 md:col-span-2 xl:col-span-1">
            <AlertsCard alerts={alerts} />
          </div>
        </motion.div>
      )}
    </div>
  )
}
