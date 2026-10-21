import { cn } from '@/lib/cn'
import { TextInput } from '@/components/ui/form'
import { priceUnitLabel } from '@/config/commercial'
import { effectivePolicy, findOpenOrderItem, resolveItemPrice, type ServiceItemInput } from '@/domain/commercial/catalog'
import { mulMoney, addMoney } from '@/domain/finance/money'
import type { Workspace } from '@/hooks/useWorkspace'
import { formatMoney } from '@/lib/format'
import type { ProjectRecord, ServiceItem } from '@/types/domain'

const sourceLabel: Record<ServiceItem['source'], string> = { 'open-order': 'OC abierta', tariff: 'Tarifario', manual: 'Manual' }

/**
 * Pick the sub-services contracted for one service, with quantities. Prices come
 * from the open PO or the client's tariff; already-contracted items keep their
 * frozen (historical) price.
 */
export function ServiceItemsEditor({
  ws,
  project,
  typeId,
  items,
  onChange,
  errors,
  frozen = [],
  date,
}: {
  ws: Workspace
  project: ProjectRecord
  typeId: string
  items: ServiceItemInput[]
  onChange: (items: ServiceItemInput[]) => void
  /** Field errors keyed "items.N.field". */
  errors: Record<string, string>
  frozen?: ServiceItem[]
  date: string
}) {
  const catalog = ws.catalogItems.filter((i) => i.serviceTypeId === typeId && (i.active || frozen.some((f) => f.catalogItemId === i.id)))
  if (!catalog.length) return <p className="rounded-[14px] bg-surface px-[14px] py-[11px] text-[13px] text-ink-secondary">Sin subservicios en el catálogo: se contrata y factura como una línea única.</p>
  const policy = effectivePolicy(ws.clientById.get(project.clientId), project)
  const order = project.openOrderId ? ws.openOrders.find((o) => o.id === project.openOrderId) : undefined
  const idx = (id: string) => items.findIndex((i) => i.catalogItemId === id)
  const set = (id: string, patch: Partial<ServiceItemInput> | null) => {
    const i = idx(id)
    if (patch === null) return onChange(items.filter((x) => x.catalogItemId !== id))
    if (i < 0) return onChange([...items, { catalogItemId: id, quantity: 1, ...patch }])
    onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }
  const priceOf = (id: string) => {
    const prev = frozen.find((f) => f.catalogItemId === id)
    return prev ? { unitPrice: prev.unitPrice, unit: prev.unit, source: prev.source } : resolveItemPrice(ws.dataset, project, typeId, id, date)
  }
  const total = addMoney(...items.map((it) => mulMoney(priceOf(it.catalogItemId)?.unitPrice ?? it.unitPrice ?? 0, it.quantity || 0)))
  return (
    <div className="flex flex-col gap-[6px]" role="group" aria-label="Subservicios contratados">
      {catalog.map((ci) => {
        const i = idx(ci.id)
        const on = i >= 0
        const prev = frozen.find((f) => f.catalogItemId === ci.id)
        const price = priceOf(ci.id)
        const blocked = !prev && policy.poMode === 'open' && (!order || !findOpenOrderItem(order, typeId, ci.id))
        const unitPrice = price?.unitPrice ?? (on ? items[i].unitPrice : undefined)
        const qty = on ? items[i].quantity : 0
        const sub = on && unitPrice ? mulMoney(unitPrice, qty || 0) : 0
        const err = on ? (errors[`items.${i}.catalogItemId`] ?? errors[`items.${i}.quantity`] ?? errors[`items.${i}.unitPrice`]) : undefined
        return (
          <div key={ci.id} className={cn('grid items-center gap-[10px] rounded-[14px] bg-surface px-[12px] py-[9px] sm:grid-cols-[minmax(0,1fr)_96px_130px_120px]', blocked && 'opacity-60')}>
            <label className="flex min-w-0 items-center gap-[10px] text-[14px]">
              <input type="checkbox" className="size-[16px] accent-[var(--color-ink)]" checked={on} disabled={blocked} onChange={(e) => set(ci.id, e.target.checked ? {} : null)} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{ci.name}</span>
                <span className="block truncate text-[12px] text-muted">
                  {blocked ? 'No autorizado por la OC abierta' : price ? `${sourceLabel[price.source]}${prev ? ' · precio histórico' : ''}` : 'Sin precio: ingresalo'} · {priceUnitLabel[price?.unit ?? ci.unit].toLowerCase()}
                </span>
                {err && <span className="block text-[12px] font-medium text-danger">{err}</span>}
              </span>
            </label>
            <TextInput aria-label={`Cantidad de ${ci.name}`} type="number" min={0} step="1" disabled={!on} value={on ? qty : ''} onChange={(e) => set(ci.id, { quantity: Number(e.target.value) })} />
            {price || !on ? (
              <span className="tabular text-right text-[13.5px] text-ink-secondary">{price ? formatMoney(price.unitPrice, project.currency) : '—'}</span>
            ) : (
              <TextInput aria-label={`Precio de ${ci.name}`} inputMode="decimal" value={items[i].unitPrice ?? ''} onChange={(e) => set(ci.id, { unitPrice: Number(e.target.value.replace(',', '.')) })} />
            )}
            <span className="tabular text-right text-[14px] font-semibold">{on ? formatMoney(sub, project.currency) : ''}</span>
          </div>
        )
      })}
      <p className="flex justify-between px-[12px] pt-[4px] text-[14px]">
        <span className="text-ink-secondary">Total del servicio ({items.length} ítems)</span>
        <span className="tabular font-semibold">{formatMoney(total, project.currency)}</span>
      </p>
    </div>
  )
}
