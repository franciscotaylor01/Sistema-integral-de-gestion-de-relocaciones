import { Building2, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { CurrencyFlag, Flag } from '@/components/ui/Flag'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchField } from '@/components/ui/SearchField'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { clientStatusMeta, countryNames } from '@/config/catalogs'
import { clientPath } from '@/config/navigation'
import { useWorkspace } from '@/hooks/useWorkspace'
import { formatCompactCurrency } from '@/lib/format'
import { currencyEntries } from '@/lib/money'
import { cardVariants, staggerVariants } from '@/lib/motion'
import { matches } from '@/lib/search'
import type { ClientStatus } from '@/types/domain'
import { ClientFormModal } from './components/ClientFormModal'
import { summarizeClient } from './selectors'

export function ClientsPage() {
  const { workspace, loading } = useWorkspace()
  const [creating, setCreating] = useState(false)
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('estado') ?? ''
  const industry = params.get('industria') ?? ''

  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const summaries = useMemo(() => (workspace ? workspace.clients.map((c) => summarizeClient(workspace, c)) : []), [workspace])
  const industries = useMemo(() => [...new Set(workspace?.clients.map((c) => c.industry))].sort(), [workspace])
  const rows = summaries.filter(
    ({ client: c }) =>
      (!status || c.status === status) &&
      (!industry || c.industry === industry) &&
      matches(q, c.name, c.legalName, c.industry, c.headquarters.city, c.taxId, c.contacts.map((x) => x.name).join(' ')),
  )

  return (
    <div className="pt-[5px]">
      <PageHeader
        title="Clientes"
        description="Empresas que contratan relocaciones para sus colaboradores."
        actions={
          <Button onClick={() => setCreating(true)} disabled={!workspace}>
            <Plus aria-hidden className="size-[17px]" strokeWidth={2} />
            Nuevo cliente
          </Button>
        }
      />

      <motion.div variants={cardVariants} className="mt-[30px] flex flex-wrap items-center gap-[10px]">
        <SearchField value={q} onChange={(v) => setParam('q', v)} label="Buscar clientes" placeholder="Empresa, CUIT, contacto…" className="sm:w-[340px]" />
        <FilterSelect
          size="sm"
          label="Estado"
          value={status}
          onChange={(v) => setParam('estado', v)}
          options={(Object.keys(clientStatusMeta) as ClientStatus[]).map((s) => ({ value: s, label: clientStatusMeta[s].label }))}
        />
        <FilterSelect size="sm" label="Industria" value={industry} onChange={(v) => setParam('industria', v)} options={industries.map((i) => ({ value: i, label: i }))} />
      </motion.div>

      {loading ? (
        <div className="mt-[24px] grid gap-[24px] md:grid-cols-2 2xl:grid-cols-3" aria-busy="true" aria-label="Cargando clientes">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[236px] rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="mt-[24px]">
          <EmptyState icon={Building2} className="py-14" title="No hay clientes que coincidan" description="Probá con otra búsqueda o quitá filtros." />
        </Card>
      ) : (
        <motion.ul variants={staggerVariants} initial="hidden" animate="show" className="mt-[24px] grid grid-cols-1 gap-[24px] md:grid-cols-2 2xl:grid-cols-3">
          {rows.map(({ client: c, activeProjects, totalProjects, receivable, overdue }) => {
            const manager = workspace?.staffById.get(c.accountManagerId)
            const primary = c.contacts.find((x) => x.primary) ?? c.contacts[0]
            const open = currencyEntries(receivable).filter(([, v]) => v > 0)
            return (
              <motion.li key={c.id} variants={cardVariants} className="min-w-0">
                <Link
                  to={clientPath(c.id)}
                  className="group flex h-full flex-col rounded-card bg-surface p-[18px] shadow-card transition-[box-shadow,transform] duration-300 ease-soft hover:-translate-y-0.5 hover:shadow-card-hover active:translate-y-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-[12px]">
                      <span aria-hidden className="grid size-[44px] shrink-0 place-items-center rounded-[14px] bg-surface-sunken text-[15px] font-semibold text-ink-secondary">
                        {c.name
                          .split(' ')
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join('')}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em]">{c.name}</h2>
                        <p className="flex items-center gap-[6px] truncate text-[13px] text-muted">
                          <Flag country={c.headquarters.country} className="size-[14px]" />
                          {c.headquarters.city}, {countryNames[c.headquarters.country]} · {c.industry}
                        </p>
                      </div>
                    </div>
                    <StatusBadge variant="soft" meta={clientStatusMeta[c.status]} />
                  </div>

                  <dl className="mt-[16px] grid grid-cols-3 gap-[10px] rounded-panel bg-surface-muted p-[12px]">
                    <div className="rounded-[12px] bg-surface px-[10px] py-[9px]">
                      <dt className="text-[12px] text-muted">Activos</dt>
                      <dd className="tabular mt-[2px] text-[18px] font-semibold">{activeProjects}</dd>
                    </div>
                    <div className="rounded-[12px] bg-surface px-[10px] py-[9px]">
                      <dt className="text-[12px] text-muted">Proyectos</dt>
                      <dd className="tabular mt-[2px] text-[18px] font-semibold">{totalProjects}</dd>
                    </div>
                    <div className="min-w-0 rounded-[12px] bg-surface px-[10px] py-[9px]">
                      <dt className="text-[12px] text-muted">Por cobrar</dt>
                      <dd className="tabular mt-[2px] truncate text-[14px] font-semibold leading-[1.6]">
                        {open.length ? open.map(([cur, v]) => formatCompactCurrency(v, cur)).join(' · ') : '—'}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex items-center justify-between gap-3 pt-[16px] text-[13px]">
                    <span className="min-w-0 truncate text-muted">
                      {primary ? `${primary.name} · ${primary.role}` : 'Sin contactos'}
                    </span>
                    <span className="flex shrink-0 items-center gap-[4px]">
                      {c.currencies.map((cur) => (
                        <CurrencyFlag key={cur} currency={cur} className="size-[16px]" />
                      ))}
                    </span>
                  </div>
                  <div className="mt-[10px] flex items-center justify-between border-t border-line pt-[12px] text-[12.5px] text-muted">
                    <span>Cuenta: {manager?.name}</span>
                    {overdue > 0 && <span className="font-medium text-danger">{overdue} factura vencida</span>}
                  </div>
                </Link>
              </motion.li>
            )
          })}
        </motion.ul>
      )}
      {workspace && <ClientFormModal open={creating} onClose={() => setCreating(false)} workspace={workspace} />}
    </div>
  )
}
