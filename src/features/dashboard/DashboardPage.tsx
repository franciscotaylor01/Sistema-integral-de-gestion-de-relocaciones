import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
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
import { ProfitabilityCard } from './components/ProfitabilityCard'
import { RecentActivityCard } from './components/RecentActivityCard'
import { RecentProjectsCard } from './components/RecentProjectsCard'
import { SupplierPaymentsCard } from './components/SupplierPaymentsCard'
import { UpcomingDeadlinesCard } from './components/UpcomingDeadlinesCard'

export function DashboardPage() {
  const { workspace, loading, error } = useWorkspace()
  const { data: user } = useQuery('current-user', dataSource.getCurrentUser)
  const [greeting] = useState(() => greetingForHour(new Date().getHours()))
  const ledger = useMemo(() => workspace && summarizeLedger(workspace), [workspace])

  return (
    <div className="pt-[5px]">
      <PageHeader
        title={`${greeting}${user ? `, ${user.firstName}` : ''}`}
        description={
          <>
            Resumen operativo y financiero de {brand.clientName} al {formatDate(DEMO_TODAY)}. Montos
            en {brand.reportingCurrency}; otras monedas se muestran sin convertir.
          </>
        }
      />

      {loading && <DashboardSkeleton />}

      {error && (
        <Card className="mt-[34px]">
          <EmptyState title="No pudimos cargar el dashboard" description={error.message} />
        </Card>
      )}

      {workspace && ledger && (
        <motion.div
          variants={staggerVariants}
          initial="hidden"
          animate="show"
          className="mt-[34px] grid grid-cols-1 gap-x-[23px] gap-y-[24px] md:grid-cols-2 xl:grid-cols-3">
            <ProfitabilityCard projects={workspace.projects} />
            <KpiGrid ledger={ledger} />
            <div className="md:col-span-2 xl:col-span-1">
              <CashflowChartCard workspace={workspace} />
            </div>

            <div className="grid grid-cols-1 gap-[24px] md:col-span-2 md:grid-cols-2 xl:col-span-1 xl:flex xl:flex-col">
              <ActiveProjectsCard projects={workspace.projects} />
              <UpcomingDeadlinesCard workspace={workspace} />
            </div>
            <div className="min-w-0 md:col-span-2">
              <RecentProjectsCard workspace={workspace} limit={7} />
            </div>

            <MyTasksCard workspace={workspace} />
            <div className="min-w-0 md:col-span-1 xl:col-span-2">
              <AlertsCard alerts={sortAlerts([...financeAlerts(workspace), ...commercialAlerts(workspace), ...workspace.alerts])} />
            </div>

            <SupplierPaymentsCard workspace={workspace} />
            <div className="min-w-0 md:col-span-1 xl:col-span-2">
              <RecentActivityCard workspace={workspace} />
            </div>
        </motion.div>
      )}
    </div>
  )
}
