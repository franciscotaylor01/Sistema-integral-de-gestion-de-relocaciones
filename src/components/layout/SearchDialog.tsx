import type { LucideIcon } from 'lucide-react'
import { ArrowRight, BriefcaseBusiness, Building2, CornerDownLeft, ListChecks, Plus, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { Skeleton } from '@/components/ui/Skeleton'
import { countryNames } from '@/config/catalogs'
import { clientPath, primaryNav, projectPath, railNav, ROUTES, settingsModule } from '@/config/navigation'
import { useWorkspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { easeOutSoft } from '@/lib/motion'
import { matches } from '@/lib/search'

interface Result {
  id: string
  group: string
  title: string
  subtitle?: string
  href: string
  icon: LucideIcon
}

const MAX_PER_GROUP = 6

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <AnimatePresence>{open && <SearchPanel onClose={onClose} />}</AnimatePresence>
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { workspace, loading } = useWorkspace()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => {
    inputRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  const results = useMemo<Result[]>(() => {
    const q = query.trim()
    const shortcuts = [
      { id: 'tasks', label: 'Mis tareas', path: ROUTES.tasks, icon: ListChecks },
      { id: 'new-project', label: 'Nuevo proyecto', path: ROUTES.newProject, icon: Plus },
    ]
    const sections: Result[] = [...primaryNav, ...shortcuts, ...railNav.filter((m) => m.path !== '/'), settingsModule]
      .filter((n) => !q || matches(q, n.label))
      .map((n) => ({ id: `nav-${n.id}`, group: 'Secciones', title: n.label, href: n.path, icon: n.icon }))

    if (!workspace) return sections

    const projects: Result[] = workspace.projects
      .filter((p) => {
        if (!q) return p.operationalStatus === 'in-progress'
        const assignee = workspace.personById.get(p.beneficiaryId)?.name ?? ''
        const client = workspace.clientById.get(p.clientId)?.name ?? ''
        return matches(q, p.code, assignee, client, p.destination.city, countryNames[p.destination.country])
      })
      .slice(0, q ? MAX_PER_GROUP : 4)
      .map((p) => ({
        id: p.id,
        group: q ? 'Proyectos' : 'Proyectos en curso',
        title: `${p.code} · ${workspace.personById.get(p.beneficiaryId)?.name ?? ''}`,
        subtitle: `${workspace.clientById.get(p.clientId)?.name} — ${p.origin.city} → ${p.destination.city}`,
        href: projectPath(p.id),
        icon: BriefcaseBusiness,
      }))

    const clients: Result[] = q
      ? workspace.clients
          .filter((c) => matches(q, c.name, c.legalName, c.industry))
          .slice(0, MAX_PER_GROUP)
          .map((c) => ({
            id: c.id,
            group: 'Clientes',
            title: c.name,
            subtitle: `${c.industry} · ${c.headquarters.city}`,
            href: clientPath(c.id),
            icon: Building2,
          }))
      : []

    return [...projects, ...clients, ...sections]
  }, [query, workspace])

  const go = (r: Result | undefined) => {
    if (!r) return
    onClose()
    navigate(r.href)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    }
  }

  const groups = results.reduce<{ name: string; items: { r: Result; index: number }[] }[]>((acc, r, index) => {
    const g = acc.find((x) => x.name === r.group)
    if (g) g.items.push({ r, index })
    else acc.push({ name: r.group, items: [{ r, index }] })
    return acc
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]" onKeyDown={onKeyDown}>
      <motion.div
        className="absolute inset-0 bg-backdrop/70 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.16 } }}
        transition={{ duration: 0.28, ease: easeOutSoft }}
        className="relative flex max-h-[72vh] w-full max-w-[620px] flex-col overflow-hidden rounded-card bg-surface shadow-card-hover"
      >
        <div className="flex items-center gap-[12px] border-b border-line px-[20px]">
          <Search aria-hidden className="size-[20px] shrink-0 text-ink-secondary" strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Buscar proyectos, beneficiarios, clientes o secciones…"
            aria-label="Buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            className="h-[62px] min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
          />
          <kbd className="hidden rounded-[6px] border border-line px-[6px] py-[2px] text-[11px] text-muted sm:block">Esc</kbd>
        </div>

        <div id={listId} role="listbox" aria-label="Resultados" className="overflow-y-auto p-[8px]">
          {loading && (
            <div className="flex flex-col gap-[8px] p-[8px]">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[46px] rounded-[14px]" />
              ))}
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="px-[12px] py-[28px] text-center text-[14px] text-muted">Sin resultados para “{query}”.</p>
          )}
          {groups.map((g) => (
            <div key={g.name} role="group" aria-label={g.name} className="mb-[6px]">
              <p className="px-[12px] pb-[4px] pt-[8px] text-[12px] font-medium uppercase tracking-[0.06em] text-subtle">{g.name}</p>
              {g.items.map(({ r, index }) => (
                <button
                  key={r.id}
                  id={`${listId}-${r.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(r)}
                  className={cn(
                    'flex w-full items-center gap-[12px] rounded-[14px] px-[12px] py-[9px] text-left transition-colors duration-150',
                    index === active ? 'bg-surface-muted' : 'hover:bg-surface-muted',
                  )}
                >
                  <span aria-hidden className="grid size-[32px] shrink-0 place-items-center rounded-full bg-surface-sunken text-ink-secondary">
                    <r.icon className="size-[15px]" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{r.title}</span>
                    {r.subtitle && <span className="block truncate text-[12.5px] text-muted">{r.subtitle}</span>}
                  </span>
                  {index === active ? (
                    <CornerDownLeft aria-hidden className="size-[15px] text-muted" strokeWidth={2} />
                  ) : (
                    <ArrowRight aria-hidden className="size-[15px] text-subtle" strokeWidth={2} />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
