import { AlarmClockOff, CalendarClock, CircleCheckBig, FilterX, Hourglass, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchField } from '@/components/ui/SearchField'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatTile } from '@/components/ui/StatTile'
import { Tabs } from '@/components/ui/Tabs'
import { getServiceType, serviceCatalog } from '@/config/serviceCatalog'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useWorkspace } from '@/hooks/useWorkspace'
import { formatNumber } from '@/lib/format'
import { cardVariants, staggerVariants } from '@/lib/motion'
import { matches } from '@/lib/search'
import { TaskList } from './TaskList'
import { TaskModal } from './TaskModal'
import { sortTasks, taskBucket, taskLinks, type TaskBucket } from './selectors'

const VIEWS: { value: TaskBucket; label: string; empty: string }[] = [
  { value: 'upcoming', label: 'Próximas', empty: 'No hay tareas próximas.' },
  { value: 'overdue', label: 'Vencidas', empty: 'No hay tareas vencidas. ¡Bien!' },
  { value: 'waiting', label: 'Esperando a terceros', empty: 'Nada esperando respuesta de terceros.' },
  { value: 'done', label: 'Completadas', empty: 'Todavía no hay tareas completadas.' },
]
const isView = (v: string | null): v is TaskBucket => VIEWS.some((x) => x.value === v)

/** "Mis tareas": the demo user's (or the team's) tasks across every project. */
export function TasksPage() {
  const { workspace, loading } = useWorkspace()
  const user = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const [openTask, setOpenTask] = useState<string>()
  const [creating, setCreating] = useState(false)

  const viewParam = params.get('vista')
  const view: TaskBucket = isView(viewParam) ? viewParam : 'upcoming'
  const ownerParam = params.get('responsable')
  const owner = ownerParam === null ? (user?.id ?? '') : ownerParam === 'equipo' ? '' : ownerParam
  const q = params.get('q') ?? ''
  const type = params.get('servicio') ?? ''
  const project = params.get('proyecto') ?? ''

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === null || value === '') next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  const scoped = useMemo(() => {
    if (!workspace) return []
    return workspace.tasks.filter((t) => {
      if (owner && t.ownerId !== owner) return false
      if (project && t.projectId !== project) return false
      if (type && workspace.serviceById.get(t.serviceId)?.typeId !== type) return false
      if (q) {
        const l = taskLinks(workspace, t)
        return matches(q, t.title, t.description, t.waitingOn, l.projectCode, l.beneficiary, l.service, l.procedure, l.stage)
      }
      return true
    })
  }, [workspace, owner, project, type, q])

  const counts = useMemo(() => {
    const c: Record<TaskBucket, number> = { upcoming: 0, overdue: 0, waiting: 0, done: 0 }
    scoped.forEach((t) => c[taskBucket(t)]++)
    return c
  }, [scoped])

  const rows = useMemo(() => sortTasks(scoped.filter((t) => taskBucket(t) === view)), [scoped, view])
  const count = useCallback((v: number) => formatNumber(Math.round(v)), [])
  const hasFilters = Boolean(q || type || project || ownerParam !== null)
  const isMine = owner !== '' && owner === user?.id
  const ownerName = owner ? workspace?.staffById.get(owner)?.name : undefined
  const tile = (v: TaskBucket) => {
    const next = new URLSearchParams(params)
    next.set('vista', v)
    return `/tareas?${next.toString()}`
  }

  return (
    <div className="pt-[5px]">
      <PageHeader
        title="Mis tareas"
        description={
          isMine
            ? 'Tus tareas en todos los proyectos. Cada una está vinculada a su proyecto, servicio y trámite.'
            : owner
              ? `Tareas asignadas a ${ownerName}.`
              : 'Tareas de todo el equipo.'
        }
        actions={
          <Button onClick={() => setCreating(true)} disabled={!workspace}>
            <Plus aria-hidden className="size-[17px]" strokeWidth={2} />
            Nueva tarea
          </Button>
        }
      />

      {loading || !workspace ? (
        <div className="mt-[34px] flex flex-col gap-[24px]" aria-busy="true" aria-label="Cargando tareas">
          <Skeleton className="h-[209px] rounded-card" />
          <Skeleton className="h-[360px] rounded-card" />
        </div>
      ) : (
        <motion.div variants={staggerVariants} initial="hidden" animate="show" className="mt-[34px] flex flex-col gap-[24px]">
          <Card aria-label="Resumen de tareas" className="grid grid-cols-1 gap-[14px] p-[18px] sm:grid-cols-2 xl:grid-cols-4">
            <StatTile tone="accent" label="Próximas" icon={CalendarClock} value={counts.upcoming} format={count} to={tile('upcoming')} footer={<span>Pendientes y en curso</span>} />
            <StatTile label="Vencidas" icon={AlarmClockOff} value={counts.overdue} format={count} to={tile('overdue')} footer={<span>Requieren atención</span>} />
            <StatTile label="Esperando a terceros" icon={Hourglass} value={counts.waiting} format={count} to={tile('waiting')} footer={<span>Consulados, clientes, proveedores</span>} />
            <StatTile label="Completadas" icon={CircleCheckBig} value={counts.done} format={count} to={tile('done')} footer={<span>Historial</span>} />
          </Card>

          <Card aria-labelledby="tasks-list-title" className="px-[19px] pb-[19px] pt-[19px]">
            <h2 id="tasks-list-title" className="sr-only">
              Listado de tareas
            </h2>
            <Tabs
              label="Vistas de tareas"
              idPrefix="tasks-view"
              size="sm"
              value={view}
              onChange={(v) => setParam('vista', v === 'upcoming' ? null : v)}
              items={VIEWS.map((v) => ({ value: v.value, label: v.label, count: counts[v.value] }))}
            />
            <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
              <SearchField value={q} onChange={(v) => setParam('q', v)} label="Buscar tareas" placeholder="Tarea, proyecto, beneficiario…" />
              <FilterSelect
                size="sm"
                label="Responsable"
                allLabel="Todo el equipo"
                value={owner}
                onChange={(v) => setParam('responsable', v === '' ? 'equipo' : v === user?.id ? null : v)}
                options={workspace.staff.map((s) => ({ value: s.id, label: s.id === user?.id ? `${s.name} (yo)` : s.name }))}
              />
              <FilterSelect
                size="sm"
                label="Servicio"
                value={type}
                onChange={(v) => setParam('servicio', v)}
                options={serviceCatalog.map(({ id }) => ({ value: id, label: getServiceType(id).label, icon: <ServiceChip type={id} /> }))}
              />
              <FilterSelect
                size="sm"
                align="end"
                label="Proyecto"
                value={project}
                onChange={(v) => setParam('proyecto', v)}
                options={[...workspace.projects]
                  .sort((a, b) => b.code.localeCompare(a.code))
                  .map((p) => ({ value: p.id, label: `${p.code} · ${workspace.personById.get(p.beneficiaryId)?.name ?? ''}` }))}
              />
              {hasFilters && (
                <Button variant="secondary" size="sm" onClick={() => setParams(view === 'upcoming' ? {} : { vista: view }, { replace: true })}>
                  <FilterX aria-hidden className="size-[15px]" strokeWidth={2} />
                  Limpiar
                </Button>
              )}
            </div>
            <motion.div key={view} variants={cardVariants} initial="hidden" animate="show" className="mt-[16px] rounded-panel bg-surface-muted p-[8px]">
              <TaskList
                tasks={rows}
                workspace={workspace}
                onOpen={setOpenTask}
                showOwner={!isMine}
                emptyTitle={q || type || project ? 'Sin coincidencias' : VIEWS.find((v) => v.value === view)!.empty}
                emptyDescription={q || type || project ? 'Probá con otra búsqueda o quitá filtros.' : undefined}
              />
            </motion.div>
            <p className="mt-[12px] px-[4px] text-[13px] text-muted" aria-live="polite">
              {rows.length} {rows.length === 1 ? 'tarea' : 'tareas'}
            </p>
          </Card>
        </motion.div>
      )}

      {workspace && (
        <>
          <TaskModal open={Boolean(openTask)} onClose={() => setOpenTask(undefined)} workspace={workspace} taskId={openTask} />
          <TaskModal open={creating} onClose={() => setCreating(false)} workspace={workspace} preset={project ? { projectId: project } : undefined} />
        </>
      )}
    </div>
  )
}
