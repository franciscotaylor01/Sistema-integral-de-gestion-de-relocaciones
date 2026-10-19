import { billingMilestoneLabel } from '@/config/commercial'
import type { Client, CurrencyCode, ProjectRecord, PurchaseOrder, Quotation, ServiceRecord } from '@/types/domain'
import type { Dataset } from '../dataset'
import { addAmount, hasAmount, round2, subtractAmounts, type Amounts } from './money'
import { approvedAmountsByService, authorizedByService, effectiveStatus, lineTotal } from './quotations'

export type CommercialStage = 'not-quoted' | 'quoted' | 'approved' | 'partially-authorized' | 'authorized' | 'approved-no-po'

export interface InvoiceEligibility {
  eligible: boolean
  amount: Amounts
  met: string[]
  missing: string[]
}

export interface ServiceCommercial {
  serviceId: string
  quoted: Amounts
  approved: Amounts
  authorized: Amounts
  /** Approved but not yet covered by a PO (only when the client requires POs). */
  pendingAuthorization: Amounts
  stage: CommercialStage
  quotations: Pick<Quotation, 'id' | 'number' | 'version'>[]
  purchaseOrders: Pick<PurchaseOrder, 'id' | 'clientPoNumber'>[]
  eligibility: InvoiceEligibility
}

/** Latest issued version (sent / approved / expired) of every quotation number. */
function latestIssued(quotations: Quotation[], today: string): Quotation[] {
  const byNumber = new Map<string, Quotation>()
  for (const q of quotations) {
    const st = effectiveStatus(q, today)
    if (st === 'draft' || st === 'rejected') continue
    const cur = byNumber.get(q.number)
    if (!cur || q.version > cur.version) byNumber.set(q.number, q)
  }
  return [...byNumber.values()]
}

function milestoneMet(milestone: Client['policy']['billingMilestone'], service: ServiceRecord, approved: boolean): boolean {
  if (milestone === 'quote-approved') return approved
  if (milestone === 'service-started') return service.status !== 'not-started'
  return service.status === 'completed'
}

/**
 * Commercial position of each service. Quotation approval, PO authorisation
 * and service execution are evaluated independently; receiving a PO alone
 * never makes a service invoiceable.
 */
export function projectCommercial(ds: Dataset, project: ProjectRecord, today: string): Map<string, ServiceCommercial> {
  const client = ds.clients.find((c) => c.id === project.clientId)
  const policy = client?.policy ?? { requiresPurchaseOrder: true, requiresApprovedQuote: true, billingMilestone: 'service-completed' as const, quoteValidityDays: 30 }
  const quotations = ds.quotations.filter((q) => q.projectId === project.id)
  const issued = latestIssued(quotations, today)
  const approved = approvedAmountsByService(ds, project.id)
  const authorized = authorizedByService(ds, project.id)
  const pos = ds.purchaseOrders.filter((p) => p.projectId === project.id && p.status === 'active')
  const out = new Map<string, ServiceCommercial>()

  for (const s of ds.services.filter((x) => x.projectId === project.id)) {
    let quoted: Amounts = {}
    for (const q of issued) for (const l of q.lines) if (l.serviceId === s.id) quoted = addAmount(quoted, l.currency, lineTotal(l))
    const appr = approved.get(s.id) ?? {}
    const auth = authorized.get(s.id) ?? {}
    const isApproved = hasAmount(appr)
    const isAuthorized = hasAmount(auth)

    const pending: Amounts = {}
    if (policy.requiresPurchaseOrder) {
      for (const [c, v] of Object.entries(subtractAmounts(appr, auth)) as [CurrencyCode, number][]) if (v > 0) pending[c] = v
    }

    let stage: CommercialStage = 'not-quoted'
    if (isApproved) {
      if (!policy.requiresPurchaseOrder) stage = 'approved-no-po'
      else if (isAuthorized && !hasAmount(pending)) stage = 'authorized'
      else if (isAuthorized) stage = 'partially-authorized'
      else stage = 'approved'
    } else if (hasAmount(quoted)) stage = 'quoted'

    // Eligibility: every agreed requirement is checked separately.
    const met: string[] = []
    const missing: string[] = []
    const basis: Amounts = isApproved ? appr : !policy.requiresApprovedQuote && s.price ? { [project.currency]: s.price } : {}
    if (policy.requiresApprovedQuote) (isApproved ? met : missing).push(isApproved ? 'Cotización aprobada' : 'Falta cotización aprobada')
    else (hasAmount(basis) ? met : missing).push(hasAmount(basis) ? 'Precio acordado (sin cotización obligatoria)' : 'Falta precio acordado')
    if (policy.requiresPurchaseOrder) {
      if (!isAuthorized) missing.push('Falta OC del cliente')
      else met.push(hasAmount(pending) ? 'OC parcial recibida' : 'OC recibida')
    } else met.push('El cliente no exige OC')
    const milestoneOk = milestoneMet(policy.billingMilestone, s, isApproved)
    ;(milestoneOk ? met : missing).push(`Hito: ${billingMilestoneLabel[policy.billingMilestone].toLowerCase()}${milestoneOk ? '' : ' (pendiente)'}`)

    let amount: Amounts = {}
    if (policy.requiresPurchaseOrder) {
      for (const [c, v] of Object.entries(basis) as [CurrencyCode, number][]) amount = addAmount(amount, c, round2(Math.min(v, auth[c] ?? 0)))
    } else amount = basis
    const eligible = missing.length === 0 && hasAmount(amount)

    out.set(s.id, {
      serviceId: s.id,
      quoted,
      approved: appr,
      authorized: auth,
      pendingAuthorization: pending,
      stage,
      quotations: quotations.filter((q) => q.lines.some((l) => l.serviceId === s.id)).map((q) => ({ id: q.id, number: q.number, version: q.version })),
      purchaseOrders: pos.filter((p) => p.allocations.some((a) => a.serviceId === s.id)).map((p) => ({ id: p.id, clientPoNumber: p.clientPoNumber })),
      eligibility: { eligible, amount, met, missing },
    })
  }
  return out
}
