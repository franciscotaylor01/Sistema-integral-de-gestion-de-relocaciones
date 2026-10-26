import { Building2, Pencil } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { BackLink } from '@/components/ui/BackLink'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Fact } from '@/components/ui/Fact'
import { Flag } from '@/components/ui/Flag'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { countryNames, financialStatusMeta, operationalStatusMeta, relocationKindLabel } from '@/config/catalogs'
import { clientPath, ROUTES } from '@/config/navigation'
import { NotFoundPage } from '@/features/sections/NotFoundPage'
import { useWorkspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { formatCurrency, formatPercent } from '@/lib/format'
import { cardVariants, staggerVariants } from '@/lib/motion'
import { buildProjectContext } from './projectContext'
import { projectProgress } from '@/domain/progress'
import { EditProjectModal } from './modals/EditProjectModal'
import { projectBudget } from './selectors'
import { ActivityTab } from './tabs/ActivityTab'
import { DocumentsTab } from './tabs/DocumentsTab'
import { FinanceTab } from './tabs/FinanceTab'
import { OperationsTab } from './tabs/OperationsTab'
import { OverviewTab } from './tabs/OverviewTab'
import { ServicesTab } from './tabs/ServicesTab'

const TABS = ['resumen', 'servicios', 'operaciones', 'finanzas', 'documentos', 'actividad'] as const
type ProjectTab = (typeof TABS)[number]

const isTab = (v: string | null): v is ProjectTab => TABS.includes(v as ProjectTab)

export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { workspace, loading } = useWorkspace()
  const tabParam = params.get('tab')
  const tab: ProjectTab = isTab(tabParam) ? tabParam : 'resumen'
  const [editing, setEditing] = useState(false)

  const ctx = useMemo(() => {
    const project = workspace?.projectById.get(projectId)
    return workspace && project ? buildProjectContext(workspace, project) : undefined
  }, [workspace, projectId])

  if (loading) return <ProjectDetailSkeleton />
  if (!ctx) return <NotFoundPage title="Proyecto no encontrado" description={`No existe un proyecto con el identificador “${projectId}”.`} />

  const { project, client, beneficiary, owner } = ctx
  const activePos = ctx.workspace.purchaseOrders.filter((p) => p.projectId === project.id && p.status === 'active')
  const progress = projectProgress(project.services, project.services.flatMap((s) => s.procedures)).pct

  const setTab = (value: ProjectTab) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'resumen') next.delete('tab')
        else next.set('tab', value)
        return next
      },
      { replace: true },
    )

  return (
    <div className="pt-[5px]">
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-[10px]">
            <BackLink to={ROUTES.projects} label="Proyectos" />
            <span className="tabular text-[14px] font-medium text-ink-secondary">{project.code}</span>
            <StatusBadge variant="soft" meta={operationalStatusMeta[project.operationalStatus]} />
            <StatusBadge variant="soft" meta={financialStatusMeta[project.financialStatus]} />
          </div>
        }
        title={beneficiary?.name ?? project.code}
        description={
          <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
            <span className="font-medium text-ink-secondary">{client?.name}</span>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span className="inline-flex items-center gap-[7px]">
              <Flag country={project.origin.country} className="size-[17px]" />
              {project.origin.city}
              <span aria-hidden className="text-subtle">→</span>
              <Flag country={project.destination.country} className="size-[17px]" />
              {project.destination.city}, {countryNames[project.destination.country]}
              {project.province && <span className="text-ink-secondary">· {project.province}</span>}
            </span>
            <span aria-hidden className="h-[13px] w-px bg-line-strong" />
            <span>{relocationKindLabel[project.category]}</span>
          </span>
        }
        actions={
          <>
            {client && (
              <ButtonLink to={clientPath(client.id)} variant="outline">
                <Building2 aria-hidden className="size-[17px]" strokeWidth={1.9} />
                Ver cliente
              </ButtonLink>
            )}
            <Button onClick={() => setEditing(true)}>
              <Pencil aria-hidden className="size-[16px]" strokeWidth={1.9} />
              Editar proyecto
            </Button>
          </>
        }
      />

      <Card className="mt-[28px] px-[20px] py-[18px]">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-6">
          <Fact label="Responsable">{owner?.name}</Fact>
          <Fact label="Inicio">{formatDate(project.startDate)}</Fact>
          <Fact label="Fecha objetivo">{formatDate(project.targetDate)}</Fact>
          <Fact label="Presupuesto">
            <span className="tabular">{formatCurrency(projectBudget(project), project.currency)}</span>
          </Fact>
          <Fact label="Órdenes de compra">
            {client?.policy.requiresPurchaseOrder === false ? (
              <span className="text-muted">No requeridas</span>
            ) : activePos.length ? (
              <span className="tabular">{activePos.map((p) => p.clientPoNumber).join(', ')}</span>
            ) : (
              <span className="text-muted">Pendiente</span>
            )}
          </Fact>
          <div className="col-span-2 min-w-0 md:col-span-1">
            <dt className="flex items-center justify-between text-[13px] text-muted">
              Avance general <span className="tabular font-medium text-ink">{formatPercent(progress)}</span>
            </dt>
            <dd className="mt-[10px]">
              <ProgressBar value={progress} label="Avance general del proyecto" valueText={formatPercent(progress)} size="sm" />
            </dd>
          </div>
        </dl>
      </Card>

      <motion.div variants={cardVariants} className="mt-[24px]">
        <Tabs
          label="Secciones del proyecto"
          idPrefix="project-tabs"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'resumen', label: 'Resumen' },
            { value: 'servicios', label: 'Servicios', count: project.services.length },
            { value: 'operaciones', label: 'Operaciones' },
            { value: 'finanzas', label: 'Finanzas' },
            { value: 'documentos', label: 'Documentos', count: ctx.documents.length + ctx.workspace.initialDocuments.filter((d) => d.projectId === project.id).length },
            { value: 'actividad', label: 'Actividad', count: ctx.activity.length },
          ]}
        />
      </motion.div>

      <div className="mt-[20px]">
        <TabPanel idPrefix="project-tabs" activeValue={tab}>
          <motion.div variants={staggerVariants} initial="hidden" animate="show">
            {tab === 'resumen' && <OverviewTab ctx={ctx} onNavigate={setTab} onEdit={() => setEditing(true)} />}
            {tab === 'servicios' && <ServicesTab ctx={ctx} />}
            {tab === 'operaciones' && <OperationsTab ctx={ctx} />}
            {tab === 'finanzas' && <FinanceTab ctx={ctx} />}
            {tab === 'documentos' && <DocumentsTab ctx={ctx} />}
            {tab === 'actividad' && <ActivityTab ctx={ctx} />}
          </motion.div>
        </TabPanel>
      </div>
      <EditProjectModal open={editing} onClose={() => setEditing(false)} ctx={ctx} />
    </div>
  )
}

function ProjectDetailSkeleton() {
  return (
    <div className="pt-[5px]" aria-busy="true" aria-label="Cargando proyecto">
      <Skeleton className="h-[34px] w-[280px] rounded-full" />
      <Skeleton className="mt-[16px] h-[44px] w-[360px] max-w-full" />
      <Skeleton className="mt-[14px] h-[16px] w-[520px] max-w-full" />
      <Skeleton className="mt-[28px] h-[92px] w-full rounded-card" />
      <Skeleton className="mt-[24px] h-[54px] w-[640px] max-w-full rounded-full" />
      <div className="mt-[20px] grid gap-[24px] lg:grid-cols-3">
        <Skeleton className="h-[320px] rounded-card" />
        <Skeleton className="h-[320px] rounded-card lg:col-span-2" />
      </div>
    </div>
  )
}
