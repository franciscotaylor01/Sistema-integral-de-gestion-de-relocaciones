import { FilterX, Plus, Tags, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { Flag } from '@/components/ui/Flag'
import { DateInput, Field, SelectInput, TextInput } from '@/components/ui/form'
import { MetaBadge } from '@/components/ui/MetaBadge'
import { SearchField } from '@/components/ui/SearchField'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DEMO_TODAY } from '@/config/brand'
import { countryNames } from '@/config/catalogs'
import { priceUnitLabel } from '@/config/commercial'
import { countryOptions } from '@/config/countries'
import { getServiceType, serviceCatalog } from '@/config/serviceCatalog'
import { findOverlaps, resolvePrice } from '@/domain/commercial/pricing'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import { matches } from '@/lib/search'
import type { Client, CountryCode, CurrencyCode, PriceEntry } from '@/types/domain'
import { PriceEntryModal } from './PriceEntryModal'

/** Client tariff: searchable rules, overlap warnings, editor and a resolution tester. */
export function PriceEntriesPanel({ workspace: ws, client }: { workspace: Workspace; client: Client }) {
  const [q, setQ] = useState('')
  const [service, setService] = useState('')
  const [market, setMarket] = useState('')
  const [state, setState] = useState('')
  const [editing, setEditing] = useState<PriceEntry | 'new'>()

  const entries = useMemo(() => ws.priceEntries.filter((e) => e.clientId === client.id), [ws.priceEntries, client.id])
  const overlapIds = useMemo(() => new Set(entries.filter((e) => findOverlaps(ws.dataset, e).length > 0).map((e) => e.id)), [entries, ws.dataset])
  const rows = entries
    .filter((e) => (!service || e.serviceTypeId === service) && (!market || e.market === market))
    .filter((e) => !state || (state === 'active' ? e.active : state === 'inactive' ? !e.active : overlapIds.has(e.id)))
    .filter((e) => matches(q, getServiceType(e.serviceTypeId).label, e.agreement, e.notes, e.market === 'ANY' ? 'todos' : countryNames[e.market]))
    .sort((a, b) => getServiceType(a.serviceTypeId).label.localeCompare(getServiceType(b.serviceTypeId).label) || a.validFrom.localeCompare(b.validFrom))
  const markets = [...new Set(entries.map((e) => e.market))]
  const filtered = Boolean(q || service || market || state)

  return (
    <div className="flex flex-col gap-[24px]">
      <Card aria-labelledby="tariff-title" className="px-[19px] pb-[19px] pt-[19px]">
        <SectionTitle
          id="tariff-title"
          title="Tarifario del cliente"
          description="Precios negociados por servicio, mercado, moneda, tramo y vigencia."
          action={
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
              Nueva tarifa
            </Button>
          }
        />
        {overlapIds.size > 0 && (
          <div role="note" className="mt-[16px] flex items-start gap-[10px] rounded-[14px] bg-warning-soft px-[14px] py-[11px] text-[13.5px] text-warning">
            <TriangleAlert aria-hidden className="mt-[1px] size-[16px] shrink-0" strokeWidth={2} />
            <span>
              {overlapIds.size} tarifas se superponen. Las cotizaciones no elegirán un precio automáticamente para esos casos: se pedirá revisión.{' '}
              <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setState('overlap')}>
                Ver superpuestas
              </button>
            </span>
          </div>
        )}
        <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
          <SearchField value={q} onChange={setQ} label="Buscar tarifas" placeholder="Servicio, acuerdo, nota…" />
          <FilterSelect
            size="sm"
            label="Servicio"
            value={service}
            onChange={setService}
            options={serviceCatalog.filter((s) => entries.some((e) => e.serviceTypeId === s.id)).map((s) => ({ value: s.id, label: s.label, icon: <ServiceChip type={s.id} /> }))}
          />
          <FilterSelect
            size="sm"
            label="Mercado"
            value={market}
            onChange={setMarket}
            options={markets.map((m) => ({ value: m, label: m === 'ANY' ? 'Todos los mercados' : countryNames[m] }))}
          />
          <FilterSelect
            size="sm"
            label="Estado"
            value={state}
            onChange={setState}
            options={[
              { value: 'active', label: 'Activas' },
              { value: 'inactive', label: 'Inactivas' },
              { value: 'overlap', label: 'Superpuestas' },
            ]}
          />
          {filtered && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQ('')
                setService('')
                setMarket('')
                setState('')
              }}
            >
              <FilterX aria-hidden className="size-[15px]" strokeWidth={2} />
              Limpiar
            </Button>
          )}
        </div>
        <DataTable
          className="mt-[18px]"
          caption={`Tarifas de ${client.name}`}
          rows={rows}
          getRowId={(e) => e.id}
          minWidth={980}
          dense
          columns={[
            {
              id: 'service',
              header: 'Servicio',
              width: '22%',
              cell: (e) => (
                <button type="button" onClick={() => setEditing(e)} className="flex min-w-0 items-center gap-[10px] text-left hover:underline">
                  <ServiceChip type={e.serviceTypeId} />
                  <span className="truncate font-medium">{getServiceType(e.serviceTypeId).label}</span>
                </button>
              ),
            },
            {
              id: 'market',
              header: 'Mercado',
              width: '14%',
              cell: (e) =>
                e.market === 'ANY' ? (
                  <span className="text-ink-secondary">Todos</span>
                ) : (
                  <span className="flex items-center gap-[6px]">
                    <Flag country={e.market} className="size-[16px]" />
                    {countryNames[e.market]}
                  </span>
                ),
            },
            {
              id: 'price',
              header: 'Precio',
              width: '17%',
              cell: (e) => (
                <span className="block">
                  <span className="tabular block font-medium">{formatCurrency(e.unitPrice, e.currency)}</span>
                  <span className="block text-[12px] text-muted">
                    {priceUnitLabel[e.unit]}
                    {e.minQuantity > 1 && ` · desde ${e.minQuantity}`}
                  </span>
                </span>
              ),
            },
            {
              id: 'validity',
              header: 'Vigencia',
              width: '18%',
              className: 'tabular',
              cell: (e) => (
                <span className="text-[14px]">
                  {formatDate(e.validFrom)} – {e.validTo ? formatDate(e.validTo) : 'sin fin'}
                </span>
              ),
            },
            { id: 'agreement', header: 'Acuerdo', width: '17%', cell: (e) => <span className="block truncate text-ink-secondary">{e.agreement ?? '—'}</span> },
            {
              id: 'status',
              header: 'Estado',
              width: '12%',
              cell: (e) =>
                overlapIds.has(e.id) ? (
                  <StatusBadge meta={{ label: 'Superpuesta', tone: 'warning' }} />
                ) : e.active && (!e.validTo || e.validTo >= DEMO_TODAY) ? (
                  <StatusBadge meta={{ label: 'Activa', tone: 'success' }} />
                ) : (
                  <StatusBadge meta={{ label: e.active ? 'Vencida' : 'Inactiva', tone: 'neutral' }} />
                ),
            },
          ]}
          empty={
            <EmptyState
              icon={Tags}
              title={filtered ? 'Sin coincidencias' : 'Sin tarifas'}
              description={filtered ? 'Ajustá la búsqueda o los filtros.' : 'Cargá los precios negociados con este cliente.'}
            />
          }
        />
      </Card>
      <PriceTester workspace={ws} client={client} />
      <PriceEntryModal open={Boolean(editing)} onClose={() => setEditing(undefined)} workspace={ws} client={client} entry={editing === 'new' ? undefined : editing} />
    </div>
  )
}

/** Shows exactly which rule would price a service (or why it is ambiguous). */
function PriceTester({ workspace: ws, client }: { workspace: Workspace; client: Client }) {
  const [serviceTypeId, setService] = useState('housing')
  const [market, setMarket] = useState<CountryCode>('AR')
  const [currency, setCurrency] = useState<CurrencyCode>(client.billingCurrency)
  const [quantity, setQuantity] = useState(1)
  const [date, setDate] = useState(DEMO_TODAY)
  const res = resolvePrice(ws.dataset, { clientId: client.id, serviceTypeId, market, currency, quantity, date })

  return (
    <Card aria-labelledby="tester-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle id="tester-title" size="sm" title="Probar tarifa" description="Qué precio sugeriría una cotización con estos datos." />
      <div className="mt-[14px] grid gap-[12px] sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Servicio">
          {(p) => (
            <SelectInput {...p} value={serviceTypeId} onChange={(e) => setService(e.target.value)}>
              {serviceCatalog.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Destino">
          {(p) => (
            <SelectInput {...p} value={market} onChange={(e) => setMarket(e.target.value as CountryCode)}>
              {countryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Moneda">
          {(p) => (
            <SelectInput {...p} value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
              {CURRENCY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Cantidad">{(p) => <TextInput {...p} type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />}</Field>
        <Field label="Fecha">{(p) => <DateInput {...p} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      </div>
      <div aria-live="polite" className="mt-[14px] rounded-[14px] bg-surface-muted px-[14px] py-[12px] text-[14px]">
        {res.status === 'none' && <span className="text-muted">Ninguna tarifa aplica: la línea quedará con precio manual.</span>}
        {res.status === 'unique' && (
          <span>
            Sugerencia: <span className="tabular font-semibold">{formatCurrency(res.entry.unitPrice, res.entry.currency)}</span> {priceUnitLabel[res.entry.unit]}
            {res.entry.agreement && ` · ${res.entry.agreement}`}
            {res.rule && <MetaBadge className="ml-[8px]">{res.rule}</MetaBadge>}
          </span>
        )}
        {res.status === 'ambiguous' && (
          <span className="text-warning">
            <span className="font-semibold">Ambigua:</span> {res.candidates.length} tarifas empatan (
            {res.candidates.map((c) => `${formatCurrency(c.unitPrice, c.currency)} ${c.agreement ?? ''}`.trim()).join(' / ')}). La cotización pedirá elegir.
          </span>
        )}
      </div>
    </Card>
  )
}
