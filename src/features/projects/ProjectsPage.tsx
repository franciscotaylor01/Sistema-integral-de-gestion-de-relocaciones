import { BriefcaseBusiness, FilterX, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useToast } from '@/components/feedback/useToast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchField } from '@/components/ui/SearchField'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import { countryNames, financialStatusMeta, operationalStatusMeta, serviceTypeMeta } from '@/config/catalogs'
import { projectPath } from '@/config/navigation'
import { useWorkspace } from '@/hooks/useWorkspace'
import { cardVariants } from '@/lib/motion'
import { matches } from '@/lib/search'
import type { Project, ProjectFinancialStatus, ServiceType } from '@/types/domain'
import { projectColumns } from './components/projectColumns'
import { isActiveProject } from './selectors'

type StatusFilter = 'todos' | 'activos' | 'onboarding' | 'in-progress' | 'on-hold' | 'completed'

const statusTabs: { value: StatusFilter; label: string; test: (p: Project) => boolean }[] = [
  { value: 'todos', label: 'Todos', test: () => true },
  { value: 'activos', label: 'Activos', test: isActiveProject },
  { value: 'onboarding', label: 'Inicio', test: (p) => p.operationalStatus === 'onboarding' },
  { value: 'in-progress', label: 'En curso', test: (p) => p.operationalStatus === 'in-progress' },
  { value: 'on-hold', label: 'En pausa', test: (p) => p.operationalStatus === 'on-hold' },
  { value: 'completed', label: 'Finalizados', test: (p) => p.operationalStatus === 'completed' },
]

/** Filters live in the URL so dashboard links and the back button keep them. */
const PARAMS = ['q', 'estado', 'finanzas', 'cliente', 'servicio', 'responsable', 'destino'] as const

export function ProjectsPage() {
  const { workspace, loading } = useWorkspace()
  const { notify } = useToast()
  const [params, setParams] = useSearchParams()

  const q = params.get('q') ?? ''
  const status = (params.get('estado') as StatusFilter | null) ?? 'todos'
  const financial = params.get('finanzas') ?? ''
  const client = params.get('cliente') ?? ''
  const service = params.get('servicio') ?? ''
  const owner = params.get('responsable') ?? ''
  const destination = params.get('destino') ?? ''

  const setParam = (key: (typeof PARAMS)[number], value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value && !(key === 'estado' && value === 'todos')) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const clearFilters = () => setParams({}, { replace: true })
  const hasFilters = PARAMS.some((k) => params.get(k))

  const filteredExceptStatus = useMemo(() => {
    if (!workspace) return []
    return workspace.projects.filter((p) => {
      if (financial && p.financialStatus !== financial) return false
      if (client && p.clientId !== client) return false
      if (service && !p.services.some((s) => s.type === service)) return false
      if (owner && p.ownerId !== owner && !p.services.some((s) => s.ownerId === owner)) return false
      if (destination && p.destination.country !== destination) return false
      if (q) {
        const a = workspace.assigneeById.get(p.assigneeId)
        const c = workspace.clientById.get(p.clientId)
        return matches(
          q,
          p.code,
          a?.name,
          a?.family.map((f) => f.name).join(' '),
          c?.name,
          p.origin.city,
          p.destination.city,
          countryNames[p.origin.country],
          countryNames[p.destination.country],
          p.purchaseOrder,
        )
      }
      return true
    })
  }, [workspace, q, financial, client, service, owner, destination])

  const rows = useMemo(() => {
    const test = statusTabs.find((t) => t.value === status)?.test ?? (() => true)
    return filteredExceptStatus.filter(test).sort((a, b) => b.startDate.localeCompare(a.startDate))
  }, [filteredExceptStatus, status])

  const destinations = useMemo(
    () => [...new Set(workspace?.projects.map((p) => p.destination.country))].sort((a, b) => countryNames[a].localeCompare(countryNames[b])),
    [workspace],
  )

  return (
    <div className="pt-[5px]">
      <PageHeader
        title="Proyectos"
        description="Cada proyecto es una relocación: un beneficiario, su familia y todos los servicios contratados."
        actions={
          <Button
            onClick={() =>
              notify({ title: 'Alta de proyectos en preparación', description: 'El formulario de nuevo proyecto llegará con la integración de datos.' })
            }
          >
            <Plus aria-hidden className="size-[17px]" strokeWidth={2} />
            Nuevo proyecto
          </Button>
        }
      />

      <motion.div variants={cardVariants} className="mt-[30px]">
        <Tabs
          label="Estado operativo"
          idPrefix="project-status"
          value={status}
          onChange={(v) => setParam('estado', v)}
          items={statusTabs.map((t) => ({
            value: t.value,
            label: t.label,
            count: workspace ? filteredExceptStatus.filter(t.test).length : undefined,
          }))}
        />
      </motion.div>

      <Card className="mt-[20px] px-[19px] pb-[19px] pt-[19px]">
        <div className="flex flex-col gap-[14px] 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <SearchField
            value={q}
            onChange={(v) => setParam('q', v)}
            label="Buscar proyectos"
            placeholder="ID, beneficiario, cliente, ciudad…"
            className="sm:w-[340px]"
          />
          <div className="flex flex-wrap items-center gap-[10px]">
            <FilterSelect
              size="sm"
              label="Cliente"
              value={client}
              onChange={(v) => setParam('cliente', v)}
              options={(workspace?.clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <FilterSelect
              size="sm"
              label="Servicio"
              value={service}
              onChange={(v) => setParam('servicio', v)}
              options={(Object.keys(serviceTypeMeta) as ServiceType[]).map((t) => ({
                value: t,
                label: serviceTypeMeta[t].label,
                icon: <ServiceChip type={t} />,
              }))}
            />
            <FilterSelect
              size="sm"
              label="Finanzas"
              value={financial}
              onChange={(v) => setParam('finanzas', v)}
              options={(Object.keys(financialStatusMeta) as ProjectFinancialStatus[]).map((s) => ({
                value: s,
                label: financialStatusMeta[s].label,
              }))}
            />
            <FilterSelect
              size="sm"
              label="Destino"
              value={destination}
              onChange={(v) => setParam('destino', v)}
              options={destinations.map((c) => ({ value: c, label: countryNames[c] }))}
            />
            <FilterSelect
              size="sm"
              align="end"
              label="Responsable"
              value={owner}
              onChange={(v) => setParam('responsable', v)}
              options={(workspace?.staff ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
            {hasFilters && (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                <FilterX aria-hidden className="size-[15px]" strokeWidth={2} />
                Limpiar
              </Button>
            )}
          </div>
        </div>

        <div className="mt-[20px]">
          {loading || !workspace ? (
            <TableSkeleton rows={8} />
          ) : (
            <DataTable
              caption="Proyectos de relocación"
              rows={rows}
              getRowId={(p) => p.id}
              rowHref={(p) => projectPath(p.id)}
              minWidth={1240}
              columns={projectColumns(workspace, [
                'code',
                'client',
                'assignee',
                'origin',
                'destination',
                'services',
                'owner',
                'operational',
                'financial',
                'start',
              ])}
              empty={
                <EmptyState
                  icon={BriefcaseBusiness}
                  title="No hay proyectos que coincidan"
                  description="Probá con otra búsqueda o quitá algunos filtros."
                  action={
                    hasFilters ? (
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Limpiar filtros
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          )}
        </div>
        {workspace && (
          <p className="mt-[14px] px-[4px] text-[13px] text-muted" aria-live="polite">
            Mostrando {rows.length} de {workspace.projects.length} proyectos
            {status !== 'todos' && ` · ${operationalLabel(status)}`}
          </p>
        )}
      </Card>
    </div>
  )
}

function operationalLabel(status: StatusFilter): string {
  if (status === 'activos') return 'activos'
  if (status === 'todos') return ''
  return operationalStatusMeta[status].label.toLowerCase()
}
