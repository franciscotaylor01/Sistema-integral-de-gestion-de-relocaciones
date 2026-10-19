import { CalendarClock, FileWarning, FilterX, OctagonAlert, Workflow } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { MetaBadge } from '@/components/ui/MetaBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchField } from '@/components/ui/SearchField'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatTile } from '@/components/ui/StatTile'
import { Tabs } from '@/components/ui/Tabs'
import { serviceStatusMeta} from '@/config/catalogs'
import { isActiveProject } from '@/features/projects/selectors'
import { useWorkspace } from '@/hooks/useWorkspace'
import { daysUntil } from '@/lib/dates'
import { formatNumber } from '@/lib/format'
import { cardVariants, staggerVariants } from '@/lib/motion'
import { matches } from '@/lib/search'
import type { ServiceStatus} from '@/types/domain'
import { DocumentExpirationsCard } from './components/DocumentExpirationsCard'
import { MigrationProgressCard } from './components/MigrationProgressCard'
import { ServiceBoard, type ServiceRow } from './components/ServiceBoard'
import { ServiceList } from './components/ServiceList'
import { getServiceType, serviceCatalog } from '@/config/serviceCatalog'

type View = 'tablero' | 'lista'
const DUE_SOON_DAYS = 14

export function OperationsPage() {
  const { workspace, loading } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const view: View = params.get('vista') === 'lista' ? 'lista' : 'tablero'
  const q = params.get('q') ?? ''
  const type = params.get('tipo') ?? ''
  const status = params.get('estado') ?? ''
  const owner = params.get('responsable') ?? ''
  const due = params.get('vence') === '1'
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash || !workspace) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [hash, workspace])

  const setParam = useCallback(
    (key: string, value: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const hasFilters = Boolean(q || type || status || owner || due)
  const clear = () => setParams(view === 'lista' ? { vista: 'lista' } : {}, { replace: true })

  const allRows = useMemo<ServiceRow[]>(() => {
    if (!workspace) return []
    return workspace.projects
      .filter(isActiveProject)
      .flatMap((project) => project.services.map((service) => ({ service, project, assignee: workspace.personById.get(project.beneficiaryId) })))
  }, [workspace])

  const rows = allRows.filter(({ service: s, project: p, assignee }) => {
    if (type && s.type !== type) return false
    if (status && s.status !== status) return false
    if (owner && s.ownerId !== owner) return false
    if (due && (s.status === 'completed' || daysUntil(s.dueDate) > DUE_SOON_DAYS)) return false
    return matches(q, p.code, assignee?.name, getServiceType(s.type).label, p.destination.city, workspace?.clientById.get(p.clientId)?.name)
  })

  const kpis = useMemo(() => {
    const open = allRows.filter((r) => r.service.status !== 'completed')
    const docs = workspace?.documents ?? []
    return {
      running: open.filter((r) => r.service.status === 'in-progress').length,
      blocked: open.filter((r) => r.service.status === 'blocked').length,
      dueSoon: open.filter((r) => daysUntil(r.service.dueDate) <= DUE_SOON_DAYS).length,
      docs: docs.filter((d) => d.status === 'expired' || d.status === 'expiring').length,
      expired: docs.filter((d) => d.status === 'expired').length,
    }
  }, [allRows, workspace])

  const count = useCallback((v: number) => formatNumber(Math.round(v)), [])

  return (
    <div className="pt-[5px]">
      <PageHeader title="Operaciones" description="Seguimiento de cada servicio dentro de las relocaciones activas: etapas, responsables y vencimientos." />

      {loading || !workspace ? (
        <div className="mt-[34px] flex flex-col gap-[24px]" aria-busy="true" aria-label="Cargando operaciones">
          <Skeleton className="h-[209px] rounded-card" />
          <Skeleton className="h-[420px] rounded-card" />
        </div>
      ) : (
        <motion.div variants={staggerVariants} initial="hidden" animate="show" className="mt-[34px] flex flex-col gap-[24px]">
          <Card aria-label="Indicadores operativos" className="grid grid-cols-1 gap-[14px] p-[18px] sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              tone="accent"
              label="Servicios en curso"
              icon={Workflow}
              value={kpis.running}
              format={count}
              to="/operaciones?estado=in-progress"
              footer={
                <>
                  <MetaBadge onAccent>{allRows.length} total</MetaBadge>
                  <span>en proyectos activos</span>
                </>
              }
            />
            <StatTile
              label="Bloqueados"
              icon={OctagonAlert}
              value={kpis.blocked}
              format={count}
              to="/operaciones?estado=blocked"
              footer={<span>Requieren acción inmediata</span>}
            />
            <StatTile
              label={`Vencen en ${DUE_SOON_DAYS} días`}
              icon={CalendarClock}
              value={kpis.dueSoon}
              format={count}
              to="/operaciones?vence=1"
              footer={<span>Servicios con fecha comprometida</span>}
            />
            <StatTile
              label="Documentos en riesgo"
              icon={FileWarning}
              value={kpis.docs}
              format={count}
              to="#vencimientos"
              footer={
                <>
                  <MetaBadge className="bg-danger-soft text-danger">{kpis.expired} vencidos</MetaBadge>
                  <span>o por vencer</span>
                </>
              }
            />
          </Card>

          <Card aria-labelledby="ops-services" className="px-[19px] pb-[19px] pt-[19px]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 id="ops-services" className="text-[20px] font-semibold tracking-[-0.01em]">
                  Servicios
                </h2>
                <p className="mt-[4px] text-[14px] text-muted" aria-live="polite">
                  {rows.length} de {allRows.length} servicios
                </p>
              </div>
              <Tabs
                size="sm"
                label="Vista"
                idPrefix="ops-view"
                value={view}
                onChange={(v) => setParam('vista', v === 'lista' ? 'lista' : '')}
                items={[
                  { value: 'tablero', label: 'Tablero' },
                  { value: 'lista', label: 'Lista' },
                ]}
              />
            </div>

            <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
              <SearchField value={q} onChange={(v) => setParam('q', v)} label="Buscar servicios" placeholder="Proyecto, beneficiario, ciudad…" />
              <FilterSelect
                size="sm"
                label="Servicio"
                value={type}
                onChange={(v) => setParam('tipo', v)}
                options={serviceCatalog.map(({ id: t }) => ({ value: t, label: getServiceType(t).label, icon: <ServiceChip type={t} /> }))}
              />
              <FilterSelect
                size="sm"
                label="Estado"
                value={status}
                onChange={(v) => setParam('estado', v)}
                options={(Object.keys(serviceStatusMeta) as ServiceStatus[]).map((s) => ({ value: s, label: serviceStatusMeta[s].label }))}
              />
              <FilterSelect
                size="sm"
                label="Responsable"
                value={owner}
                onChange={(v) => setParam('responsable', v)}
                options={workspace.staff.map((s) => ({ value: s.id, label: s.name }))}
              />
              {due && <MetaBadge className="h-[30px] rounded-full px-[12px] text-[13px]">Vencen en {DUE_SOON_DAYS} días</MetaBadge>}
              {hasFilters && (
                <Button variant="secondary" size="sm" onClick={clear}>
                  <FilterX aria-hidden className="size-[15px]" strokeWidth={2} />
                  Limpiar
                </Button>
              )}
            </div>

            <motion.div key={view} variants={cardVariants} initial="hidden" animate="show" className="mt-[18px]">
              {rows.length === 0 ? (
                <div className="rounded-panel bg-surface-muted p-[2px]">
                  <div className="rounded-[14px] bg-surface">
                    <EmptyState title="No hay servicios que coincidan" description="Ajustá la búsqueda o los filtros." />
                  </div>
                </div>
              ) : view === 'tablero' ? (
                <ServiceBoard rows={rows} workspace={workspace} />
              ) : (
                <ServiceList rows={rows} workspace={workspace} />
              )}
            </motion.div>
          </Card>

          <div className="grid grid-cols-1 gap-[24px] xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <MigrationProgressCard rows={allRows.filter((r) => r.service.type === 'immigration')} workspace={workspace} />
            </div>
            <DocumentExpirationsCard workspace={workspace} />
          </div>
        </motion.div>
      )}
    </div>
  )
}
