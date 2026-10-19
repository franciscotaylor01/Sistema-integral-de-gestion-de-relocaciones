import { Building2, FilterX, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchField } from '@/components/ui/SearchField'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { countryNames } from '@/config/catalogs'
import { paymentConditionLabel, supplierKindLabel } from '@/config/finance'
import { supplierPath } from '@/config/navigation'
import { getServiceType } from '@/config/serviceCatalog'
import { SupplierFormModal } from '@/features/finance/modals/SupplierModals'
import { supplierBalances } from '@/features/finance/selectors'
import { useWorkspace } from '@/hooks/useWorkspace'
import { formatCurrency } from '@/lib/format'
import { currencyEntries } from '@/lib/money'
import { cardVariants } from '@/lib/motion'
import { matches } from '@/lib/search'
import type { CountryCode, ServiceTypeId, Supplier, SupplierKind } from '@/types/domain'

export function SuppliersPage() {
  const { workspace: ws, loading } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const q = params.get('q') ?? ''
  const kind = params.get('tipo') ?? ''
  const active = params.get('estado') ?? ''
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
  const hasFilters = Boolean(q || kind || active)

  const rows = useMemo(
    () =>
      (ws?.suppliers ?? [])
        .filter(
          (s) =>
            (!kind || s.kind === kind) &&
            (!active || (active === 'active') === s.active) &&
            matches(q, s.name, s.contactName, s.email, countryNames[s.country as CountryCode], ...s.categories.map((c) => getServiceType(c as ServiceTypeId).label)),
        )
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    [ws, q, kind, active],
  )

  return (
    <div className="pt-[5px]">
      <PageHeader
        title="Proveedores"
        description="Empresas y profesionales que prestan servicios en los proyectos: acuerdos, obligaciones y pagos."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-[17px]" strokeWidth={2} />
            Nuevo proveedor
          </Button>
        }
      />
      <motion.div variants={cardVariants} initial="hidden" animate="show">
        <Card className="mt-[30px] px-[19px] pb-[19px] pt-[19px]">
          <div className="flex flex-wrap items-center gap-[10px]">
            <SearchField value={q} onChange={(v) => setParam('q', v)} label="Buscar proveedores" placeholder="Nombre, contacto, país, servicio…" className="sm:w-[340px]" />
            <FilterSelect
              size="sm"
              label="Tipo"
              value={kind}
              onChange={(v) => setParam('tipo', v)}
              options={(Object.keys(supplierKindLabel) as SupplierKind[]).map((k) => ({ value: k, label: supplierKindLabel[k] }))}
            />
            <FilterSelect
              size="sm"
              label="Estado"
              value={active}
              onChange={(v) => setParam('estado', v)}
              options={[
                { value: 'active', label: 'Activos' },
                { value: 'inactive', label: 'Inactivos' },
              ]}
            />
            {hasFilters && (
              <Button variant="secondary" size="sm" onClick={() => setParams({}, { replace: true })}>
                <FilterX aria-hidden className="size-[15px]" strokeWidth={2} />
                Limpiar
              </Button>
            )}
          </div>
          <div className="mt-[20px]">
            {loading || !ws ? (
              <TableSkeleton rows={8} />
            ) : (
              <DataTable<Supplier>
                caption="Proveedores"
                rows={rows}
                getRowId={(s) => s.id}
                rowHref={(s) => supplierPath(s.id)}
                minWidth={1080}
                columns={[
                  {
                    id: 'name',
                    header: 'Proveedor',
                    width: '26%',
                    cell: (s) => (
                      <span className="block min-w-0">
                        <span className={s.active ? 'block truncate font-medium' : 'block truncate font-medium text-muted'}>{s.name}</span>
                        <span className="block truncate text-[12px] text-muted">
                          {supplierKindLabel[s.kind]}
                          {s.contactName && ` · ${s.contactName}`}
                        </span>
                      </span>
                    ),
                  },
                  { id: 'country', header: 'País', width: '13%', cell: (s) => <span className="block truncate">{countryNames[s.country as CountryCode] ?? s.country}</span> },
                  {
                    id: 'services',
                    header: 'Servicios',
                    width: '15%',
                    cell: (s) => (
                      <span className="flex flex-wrap gap-[4px]">
                        {s.categories.slice(0, 4).map((c) => (
                          <ServiceChip key={c} type={c as ServiceTypeId} />
                        ))}
                      </span>
                    ),
                  },
                  { id: 'condition', header: 'Condición de pago', width: '16%', cell: (s) => <span className="block truncate text-ink-secondary">{paymentConditionLabel[s.defaultPaymentCondition]}</span> },
                  {
                    id: 'owed',
                    header: 'Saldo adeudado',
                    width: '18%',
                    className: 'tabular font-medium',
                    cell: (s) => {
                      const e = currencyEntries(supplierBalances(ws, s.id))
                      return e.length ? (
                        <span className="flex flex-col">
                          {e.map(([c, v]) => (
                            <span key={c}>{formatCurrency(v, c, { decimals: 2 })}</span>
                          ))}
                        </span>
                      ) : (
                        <span className="font-normal text-muted">Sin saldo</span>
                      )
                    },
                  },
                  { id: 'status', header: 'Estado', width: '110px', cell: (s) => <StatusBadge meta={s.active ? { label: 'Activo', tone: 'success' } : { label: 'Inactivo', tone: 'neutral' }} /> },
                ]}
                empty={<EmptyState icon={Building2} title="No hay proveedores que coincidan" description="Probá con otra búsqueda o quitá filtros." />}
              />
            )}
          </div>
          {ws && (
            <p className="mt-[14px] px-[4px] text-[13px] text-muted" aria-live="polite">
              Mostrando {rows.length} de {ws.suppliers.length} proveedores
            </p>
          )}
        </Card>
      </motion.div>
      <SupplierFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
