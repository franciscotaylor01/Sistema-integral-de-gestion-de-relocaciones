import { activeServiceTypes, getServiceType } from '@/config/serviceCatalog'
import type { CurrencyCode, PriceEntry, PriceUnit } from '@/types/domain'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError } from '../errors'
import { addMoney, isMoney } from '../finance/money'
import { logActivityGlobal } from './activity'
import { setOfferedServices } from './catalog'
import { createPriceEntry, updatePriceEntry, type PriceEntryInput } from './pricing'

/*
 * Phase 5.0A — quick tariff editor. One "base" price per client, service or
 * sub-service (any market, from quantity 1), edited in bulk on top of the
 * existing price entries, approvals and versioning. Market-specific or tiered
 * rules stay managed in the detailed tariff list.
 */

export type TariffRowStatus = 'unset' | 'pending' | 'approved' | 'inactive'

export interface TariffGridRow {
  key: string
  serviceTypeId: string
  itemId?: string
  name: string
  unit: PriceUnit
  /** Approved price in force (never replaced by a pending version). */
  approved?: PriceEntry
  /** Unapproved price (new version or new rule) awaiting approval. */
  pending?: PriceEntry
  /** Entry the editor changes: the pending version if any, else the approved one. */
  editable?: PriceEntry
  previousVersions: number
  /** Other rules (market-specific or tiers) not shown in the quick editor. */
  otherRules: number
  status: TariffRowStatus
}

export interface TariffGridGroup {
  serviceTypeId: string
  label: string
  offered: boolean
  hasItems: boolean
  rows: TariffGridRow[]
  /** Service total from its sub-services (active rows), per currency — never adds the main price. */
  itemsTotal: Partial<Record<CurrencyCode, number>>
}

export const rowKey = (serviceTypeId: string, itemId?: string) => `${serviceTypeId}|${itemId ?? ''}`
const latest = (xs: PriceEntry[]) => [...xs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

function buildRow(ds: Dataset, clientId: string, serviceTypeId: string, itemId: string | undefined, name: string, unit: PriceUnit): TariffGridRow {
  const all = ds.priceEntries.filter((e) => e.clientId === clientId && e.serviceTypeId === serviceTypeId && (e.itemId ?? '') === (itemId ?? ''))
  const base = all.filter((e) => e.market === 'ANY' && e.minQuantity === 1)
  const approved = latest(base.filter((e) => e.approvedAt && !e.supersededById))
  const pending = latest(base.filter((e) => !e.approvedAt && !e.supersededById))
  const editable = pending ?? approved
  const status: TariffRowStatus = !editable ? 'unset' : !editable.active && !(approved?.active ?? false) ? 'inactive' : pending ? 'pending' : 'approved'
  return {
    key: rowKey(serviceTypeId, itemId),
    serviceTypeId,
    itemId,
    name,
    unit: editable?.unit ?? unit,
    approved,
    pending,
    editable,
    previousVersions: base.filter((e) => e.supersededById).length,
    otherRules: all.filter((e) => !base.includes(e) && !e.supersededById).length,
    status,
  }
}

/** Whole SIGR catalog for a client (not only contracted services), grouped by main service. */
export function tariffGrid(ds: Dataset, clientId: string): TariffGridGroup[] {
  const client = findById(ds.clients, clientId)
  return activeServiceTypes().map((t) => {
    const items = ds.catalogItems.filter((i) => i.serviceTypeId === t.id && (i.active || ds.priceEntries.some((e) => e.clientId === clientId && e.itemId === i.id)))
    const rows = items.map((i) => buildRow(ds, clientId, t.id, i.id, i.name, i.unit))
    // A main service without sub-services is billed as one line; with sub-services, a legacy whole-service price is shown only if it exists.
    const whole = buildRow(ds, clientId, t.id, undefined, items.length ? 'Servicio completo (sin desglose)' : getServiceType(t.id).label, 'service')
    if (!items.length || whole.editable) rows.unshift(whole)
    const itemsTotal: TariffGridGroup['itemsTotal'] = {}
    for (const r of rows) if (r.itemId && r.editable?.active) itemsTotal[r.editable.currency] = addMoney(itemsTotal[r.editable.currency] ?? 0, r.editable.unitPrice)
    return { serviceTypeId: t.id, label: t.label, offered: !client?.offeredServices || client.offeredServices.includes(t.id), hasItems: items.length > 0, rows, itemsTotal }
  })
}

export interface TariffRowChange {
  key: string
  unitPrice: number
  currency: CurrencyCode | ''
  active: boolean
  /** Optional (imports): unit and validity stated in the source. */
  unit?: PriceUnit
  validFrom?: string
  validTo?: string
}

const toInput = (e: PriceEntry): PriceEntryInput => ({
  clientId: e.clientId,
  serviceTypeId: e.serviceTypeId,
  itemId: e.itemId,
  market: e.market,
  currency: e.currency,
  unitPrice: e.unitPrice,
  unit: e.unit,
  minQuantity: e.minQuantity,
  validFrom: e.validFrom,
  validTo: e.validTo,
  active: e.active,
  agreement: e.agreement,
  notes: e.notes,
})

/**
 * Saves several rows in one operation (all or nothing). Changing an approved
 * price creates a pending version; it never replaces the approved one. Project
 * snapshots and open-PO prices are untouched (they are separate records).
 */
export function saveTariffGrid(ds: Dataset, clientId: string, input: { changes: TariffRowChange[]; offeredServices?: string[]; agreement?: string }, ctx: DomainContext): Dataset {
  if (!findById(ds.clients, clientId)) throw new DomainError('El cliente no existe.')
  const rows = new Map(tariffGrid(ds, clientId).flatMap((g) => g.rows).map((r) => [r.key, r]))
  const f: Record<string, string> = {}
  for (const c of input.changes) {
    const k = (x: string) => `rows.${c.key}.${x}`
    const r = rows.get(c.key)
    if (!r) {
      f[k('unitPrice')] = 'Fila inexistente.'
      continue
    }
    if (!c.active && !r.editable) continue
    if (!c.currency) f[k('currency')] = 'Elegí la moneda.'
    if (!isMoney(c.unitPrice) || c.unitPrice <= 0) f[k('unitPrice')] = 'Precio mayor a 0 (hasta 2 decimales).'
  }
  if (Object.keys(f).length) throw new DomainError(`Revisá ${Object.keys(f).length} fila(s) marcada(s).`, f)

  let next = ds
  for (const c of input.changes) {
    const r = rows.get(c.key)!
    try {
      if (!r.editable) {
        if (!c.active) continue
        next = createPriceEntry(next, { clientId, serviceTypeId: r.serviceTypeId, itemId: r.itemId, market: 'ANY', currency: c.currency, unitPrice: c.unitPrice, unit: c.unit ?? r.unit, minQuantity: 1, validFrom: c.validFrom ?? ctx.today(), validTo: c.validTo, active: true, agreement: input.agreement ?? 'Tarifario rápido' }, ctx).ds
        continue
      }
      const e = findById(next.priceEntries, r.editable.id)!
      const priceChanged = c.unitPrice !== e.unitPrice || c.currency !== e.currency
      if (priceChanged) next = updatePriceEntry(next, e.id, { ...toInput(e), unitPrice: c.unitPrice, currency: c.currency, active: c.active, unit: c.unit ?? e.unit, validFrom: c.validFrom ?? e.validFrom, validTo: c.validTo ?? e.validTo, agreement: input.agreement ?? e.agreement }, ctx)
      // Activation is a status, not a price: applied to the approved and pending entries of the row.
      for (const id of [r.approved?.id, r.pending?.id]) {
        const cur = id ? findById(next.priceEntries, id) : undefined
        if (cur && cur.active !== c.active && !cur.supersededById) next = { ...next, priceEntries: replaceById(next.priceEntries, cur.id, (x) => ({ ...x, active: c.active, updatedAt: ctx.now() })) }
      }
    } catch (err) {
      if (err instanceof DomainError) throw new DomainError(`${r.name}: ${err.message}`, { [`rows.${c.key}.unitPrice`]: err.message })
      throw err
    }
  }
  if (input.offeredServices) {
    const client = findById(next.clients, clientId)!
    const before = client.offeredServices ?? activeServiceTypes().map((t) => t.id)
    if ([...before].sort().join() !== [...input.offeredServices].sort().join()) next = setOfferedServices(next, clientId, input.offeredServices, ctx)
  }
  return logActivityGlobal(next, `Tarifario actualizado en bloque (${input.changes.length} fila(s)).`, ctx, clientId)
}
