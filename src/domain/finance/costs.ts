import type { CostCategory, CostRecord, CurrencyCode } from '@/types/domain'
import { logActivity } from '../activity'
import { findById, replaceById } from '../collections'
import type { DomainContext } from '../context'
import type { Dataset } from '../dataset'
import { DomainError, isIsoDate } from '../errors'
import { appendAudit } from './audit'
import { isMoney } from './money'

export interface CostInput {
  scope: 'project' | 'company'
  projectId?: string
  serviceId?: string
  supplierId?: string
  category: CostCategory
  description: string
  currency: CurrencyCode | ''
  amount: number
  date: string
  notes?: string
}

export function validateCost(ds: Dataset, input: CostInput, today: string): Record<string, string> {
  const f: Record<string, string> = {}
  if (input.scope === 'project') {
    if (!input.projectId || !ds.projects.some((p) => p.id === input.projectId)) f.projectId = 'Elegí el proyecto.'
    if (input.serviceId && !ds.services.some((s) => s.id === input.serviceId && s.projectId === input.projectId)) f.serviceId = 'El servicio no pertenece al proyecto.'
    if (input.category === 'general-expense') f.category = 'Los gastos generales no se imputan a proyectos.'
  } else {
    if (input.projectId || input.serviceId) f.projectId = 'Un gasto general de la empresa no lleva proyecto.'
    if (input.category !== 'general-expense') f.category = 'Usá la categoría «Gasto general» para gastos de la empresa.'
  }
  if (input.supplierId && !ds.suppliers.some((s) => s.id === input.supplierId)) f.supplierId = 'Proveedor inválido.'
  if (!input.description.trim()) f.description = 'Describí el costo.'
  if (!input.currency) f.currency = 'Elegí la moneda.'
  if (!isMoney(input.amount) || input.amount <= 0) f.amount = 'Monto mayor a cero (hasta 2 decimales).'
  if (!isIsoDate(input.date)) f.date = 'Fecha inválida.'
  else if (input.date > today) f.date = 'Un costo incurrido no puede tener fecha futura.'
  return f
}

export function buildCost(input: CostInput, ctx: DomainContext): CostRecord {
  return {
    id: ctx.newId('cost'),
    scope: input.scope,
    projectId: input.scope === 'project' ? input.projectId : undefined,
    serviceId: input.scope === 'project' ? input.serviceId || undefined : undefined,
    supplierId: input.supplierId || undefined,
    category: input.category,
    description: input.description.trim(),
    currency: input.currency as CurrencyCode,
    amount: input.amount,
    date: input.date,
    status: 'incurred',
    notes: input.notes?.trim() || undefined,
    createdAt: ctx.now(),
    createdBy: ctx.actorId,
  }
}

/** Records an actually incurred cost (e.g. paid directly by card). Not an estimate, not a payable. */
export function recordCost(ds: Dataset, input: CostInput, ctx: DomainContext): { ds: Dataset; costId: string } {
  const fields = validateCost(ds, input, ctx.today())
  if (Object.keys(fields).length) throw new DomainError('Revisá el costo.', fields)
  const cost = buildCost(input, ctx)
  let next: Dataset = { ...ds, costs: [...ds.costs, cost] }
  next = appendAudit(next, { entity: 'cost', entityId: cost.id, action: 'record', detail: `${cost.description}: ${cost.currency} ${cost.amount}`, projectId: cost.projectId }, ctx)
  if (cost.projectId) next = logActivity(next, { projectId: cost.projectId, serviceId: cost.serviceId, kind: 'finance', message: `Costo registrado: ${cost.description} (${cost.currency} ${cost.amount}).` }, ctx)
  return { ds: next, costId: cost.id }
}

/** Voiding keeps the record. Costs backing an active supplier obligation cannot be voided directly. */
export function voidCost(ds: Dataset, costId: string, reason: string, ctx: DomainContext): Dataset {
  const cost = findById(ds.costs, costId)
  if (!cost) throw new DomainError('El costo no existe.')
  if (cost.status === 'void') return ds
  if (!reason.trim()) throw new DomainError('Indicá el motivo.', { reason: 'Indicá el motivo.' })
  if (ds.obligations.some((o) => o.costId === costId && o.lifecycle !== 'cancelled')) {
    throw new DomainError('Este costo respalda una obligación con proveedor: anulá la obligación.')
  }
  const next: Dataset = { ...ds, costs: replaceById(ds.costs, costId, (c) => ({ ...c, status: 'void', voidReason: reason.trim() })) }
  return appendAudit(next, { entity: 'cost', entityId: costId, action: 'void', detail: reason.trim(), projectId: cost.projectId }, ctx)
}
