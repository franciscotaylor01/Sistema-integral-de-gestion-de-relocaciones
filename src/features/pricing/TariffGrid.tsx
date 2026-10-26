import { ChevronDown, FileSpreadsheet, RotateCcw, Save } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { ImportTariffModal } from './ImportTariffModal'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormError, SelectInput, TextInput } from '@/components/ui/form'
import { SearchField } from '@/components/ui/SearchField'
import { SectionTitle } from '@/components/ui/SectionTitle'
import { ServiceChip } from '@/components/ui/ServiceChip'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusMeta } from '@/config/catalogs'
import { priceUnitLabel } from '@/config/commercial'
import { tariffGrid, type TariffGridRow, type TariffRowChange, type TariffRowStatus } from '@/domain/commercial/tariffGrid'
import { addMoney } from '@/domain/finance/money'
import { useActions } from '@/hooks/useActions'
import { useCommand } from '@/hooks/useCommand'
import type { Workspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/format'
import { CURRENCY_ORDER } from '@/lib/money'
import { matches } from '@/lib/search'
import type { Client, CurrencyCode } from '@/types/domain'

const statusMeta: Record<TariffRowStatus, StatusMeta> = {
  unset: { label: 'Sin configurar', tone: 'neutral' },
  pending: { label: 'Pendiente de aprobación', tone: 'warning' },
  approved: { label: 'Aprobado', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
}

interface Draft {
  price: string
  currency: CurrencyCode | ''
  active: boolean
}

const fromRow = (r: TariffGridRow, fallback: CurrencyCode): Draft => ({
  price: r.editable ? String(r.editable.unitPrice) : '',
  currency: r.editable?.currency ?? fallback,
  active: r.editable ? r.editable.active || Boolean(r.approved?.active) : false,
})
const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')))

/**
 * Quick tariff editor: the whole SIGR catalog for this client in one table,
 * grouped by main service. Edits are saved together; approved prices become
 * pending versions and keep applying until approved (existing workflow).
 */
export function TariffGrid({ workspace: ws, client }: { workspace: Workspace; client: Client }) {
  const actions = useActions()
  const { run, busy, errors, formError } = useCommand()
  const groups = tariffGrid(ws.dataset, client.id)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [offered, setOffered] = useState<Record<string, boolean>>({})
  const [q, setQ] = useState('')
  const [importing, setImporting] = useState(false)
  const imports = ws.tariffImports.filter((x) => x.clientId === client.id)
  const base = (r: TariffGridRow) => fromRow(r, client.billingCurrency)
  const draftOf = (r: TariffGridRow) => drafts[r.key] ?? base(r)
  const set = (r: TariffGridRow, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [r.key]: { ...draftOf(r), ...p } }))
  const changed = groups
    .flatMap((g) => g.rows)
    .filter((r) => {
      const d = drafts[r.key]
      if (!d) return false
      const b = base(r)
      return d.active !== b.active || (d.active && (num(d.price) !== num(b.price) || d.currency !== b.currency))
    })
  const offeredChanged = Object.entries(offered).filter(([id, v]) => groups.find((g) => g.serviceTypeId === id)?.offered !== v)
  const dirty = changed.length + offeredChanged.length

  const save = async () => {
    const changes: TariffRowChange[] = changed.map((r) => {
      const d = drafts[r.key]
      return { key: r.key, unitPrice: num(d.price), currency: d.currency, active: d.active }
    })
    const offeredServices = offeredChanged.length ? groups.filter((g) => offered[g.serviceTypeId] ?? g.offered).map((g) => g.serviceTypeId) : undefined
    const ok = await run(() => actions.saveTariffGrid(client.id, { changes, offeredServices }), { title: 'Tarifario guardado', description: 'Los precios aprobados modificados quedan como versión pendiente de aprobación.' })
    if (ok) {
      setDrafts({})
      setOffered({})
    }
  }

  return (
    <Card aria-labelledby="tgrid-title" className="px-[19px] pb-[19px] pt-[19px]">
      <SectionTitle
        id="tgrid-title"
        title="Tarifario rápido"
        description="Todo el catálogo de Relocare para este cliente. Editá varios precios y guardalos juntos. Los precios aprobados no se reemplazan: el cambio queda pendiente de aprobación. Reglas por mercado o tramo se gestionan en el listado detallado."
        action={
          <div className="flex flex-wrap gap-[8px]">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setImporting(true)}>
              <FileSpreadsheet aria-hidden className="size-[15px]" strokeWidth={1.9} />
              Importar Excel
            </Button>
            <Button size="sm" variant="secondary" disabled={!dirty || busy} onClick={() => (setDrafts({}), setOffered({}))}>
              <RotateCcw aria-hidden className="size-[15px]" strokeWidth={1.9} />
              Descartar
            </Button>
            <Button size="sm" disabled={!dirty || busy} onClick={save}>
              <Save aria-hidden className="size-[15px]" strokeWidth={1.9} />
              Guardar cambios{dirty ? ` (${dirty})` : ''}
            </Button>
          </div>
        }
      />
      <div className="mt-[14px] flex flex-wrap items-center gap-[10px]">
        <SearchField value={q} onChange={setQ} label="Buscar en el catálogo" placeholder="Servicio o subservicio…" />
      </div>
      <FormError message={formError} />
      <div className="mt-[14px] overflow-x-auto">
        <div className="flex min-w-[860px] flex-col gap-[8px]">
          {groups
            .filter((g) => !q || matches(q, g.label, ...g.rows.map((r) => r.name)))
            .map((g) => {
              const isOffered = offered[g.serviceTypeId] ?? g.offered
              // Live total from the drafts: sub-services only, per currency (never adds the main price).
              const total: Partial<Record<CurrencyCode, number>> = {}
              for (const r of g.rows) {
                const d = draftOf(r)
                if (r.itemId && d.active && d.currency && Number.isFinite(num(d.price))) total[d.currency] = addMoney(total[d.currency] ?? 0, num(d.price))
              }
              return (
                <details key={g.serviceTypeId} open={isOffered} className="group rounded-[16px] bg-surface-muted">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-[14px] py-[11px]">
                    <span className="flex items-center gap-[10px] text-[14px] font-medium">
                      <ServiceChip type={g.serviceTypeId} />
                      {g.label}
                      <span className="text-[12.5px] font-normal text-muted">{g.hasItems ? `${g.rows.filter((r) => r.itemId).length} subservicios` : 'Línea única'}</span>
                    </span>
                    <span className="flex items-center gap-[14px] text-[13px]">
                      {g.hasItems && (
                        <span className="tabular text-ink-secondary">
                          Total por subservicios:{' '}
                          <span className="font-semibold text-ink">{Object.entries(total).map(([c, v]) => formatMoney(v, c as CurrencyCode)).join(' · ') || '—'}</span>
                        </span>
                      )}
                      <label className="flex items-center gap-[6px]" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="size-[16px] accent-[var(--color-ink)]" checked={isOffered} onChange={(e) => setOffered((o) => ({ ...o, [g.serviceTypeId]: e.target.checked }))} />
                        Ofrecido al cliente
                      </label>
                      <ChevronDown aria-hidden className="size-[16px] text-muted transition-transform group-open:rotate-180" strokeWidth={2} />
                    </span>
                  </summary>
                  <div className="flex flex-col gap-[4px] px-[8px] pb-[8px]">
                    <div className="grid grid-cols-[44px_minmax(0,1.4fr)_140px_100px_170px_minmax(0,1fr)] gap-[10px] px-[10px] text-[12px] text-muted">
                      <span>Activo</span>
                      <span>Ítem</span>
                      <span>Precio</span>
                      <span>Moneda</span>
                      <span>Estado</span>
                      <span>Aprobado vigente</span>
                    </div>
                    {g.rows.map((r) => {
                      const d = draftOf(r)
                      const err = errors[`rows.${r.key}.unitPrice`] ?? errors[`rows.${r.key}.currency`]
                      const isDirty = changed.some((x) => x.key === r.key)
                      return (
                        <div key={r.key} className={cn('grid grid-cols-[44px_minmax(0,1.4fr)_140px_100px_170px_minmax(0,1fr)] items-center gap-[10px] rounded-[12px] bg-surface px-[10px] py-[7px] text-[13.5px]', isDirty && 'ring-1 ring-ink/20', !d.active && 'opacity-70')}>
                          <input type="checkbox" aria-label={`Activar ${r.name}`} className="size-[16px] accent-[var(--color-ink)]" checked={d.active} onChange={(e) => set(r, { active: e.target.checked })} />
                          <span className="min-w-0">
                            <span className={cn('block truncate font-medium', !r.itemId && g.hasItems && 'text-ink-secondary')}>{r.name}</span>
                            <span className="block truncate text-[12px] text-muted">
                              {priceUnitLabel[r.unit]}
                              {r.previousVersions > 0 && ` · ${r.previousVersions} versión(es) anterior(es)`}
                              {r.otherRules > 0 && ` · +${r.otherRules} regla(s) por mercado/tramo`}
                            </span>
                            {err && <span className="block text-[12px] font-medium text-danger">{err}</span>}
                          </span>
                          <TextInput aria-label={`Precio de ${r.name}`} inputMode="decimal" disabled={!d.active} value={d.price} onChange={(e) => set(r, { price: e.target.value })} className="h-[38px]" />
                          <SelectInput aria-label={`Moneda de ${r.name}`} disabled={!d.active} value={d.currency} onChange={(e) => set(r, { currency: e.target.value as CurrencyCode })} className="h-[38px]">
                            {CURRENCY_ORDER.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </SelectInput>
                          <span>
                            <StatusBadge meta={statusMeta[r.status]} />
                          </span>
                          <span className="tabular min-w-0 truncate text-[13px]">
                            {r.approved ? (
                              <>
                                <span className="font-medium">{formatMoney(r.approved.unitPrice, r.approved.currency)}</span>
                                {r.pending && <span className="block text-[12px] text-warning">Pendiente: {formatMoney(r.pending.unitPrice, r.pending.currency)}</span>}
                              </>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </details>
              )
            })}
        </div>
      </div>
      {imports.length > 0 && (
        <div className="mt-[14px] rounded-panel bg-surface-muted px-[12px] py-[10px] text-[13px]">
          <p className="font-medium">Importaciones de Excel</p>
          <ul className="mt-[4px] flex flex-col gap-[3px]">
            {imports.map((x) => (
              <li key={x.id} className="flex flex-wrap justify-between gap-2">
                <span className="min-w-0 truncate">
                  {x.fileName} · hoja «{x.sheetName}» · {formatDate(x.importedAt.slice(0, 10))}
                </span>
                <span className="tabular text-ink-secondary">
                  {x.counts.created} nuevos · {x.counts.updated} actualizados · {x.counts.unchanged} sin cambios · {x.counts.excluded} excluidos
                  {x.attachmentId ? ' · copia local del archivo' : ' · sin copia del archivo'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ImportTariffModal open={importing} onClose={() => setImporting(false)} ws={ws} client={client} />
      <p className="mt-[10px] text-[12px] text-muted">
        Los cambios no modifican proyectos ya contratados (precios históricos) ni los precios autorizados en OC abiertas. Para nombres, descripciones y subservicios usá el catálogo debajo.
      </p>
    </Card>
  )
}
