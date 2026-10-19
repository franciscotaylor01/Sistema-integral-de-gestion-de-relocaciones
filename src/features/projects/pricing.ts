import { DEMO_TODAY } from '@/config/brand'
import { resolvePrice, type PriceResolution } from '@/domain/commercial/pricing'
import type { Workspace } from '@/hooks/useWorkspace'
import type { CountryCode, ProjectRecord } from '@/types/domain'

export interface ReferencePrice {
  resolution: PriceResolution
  price?: number
  listName?: string
}

/** Tariff suggestion for a service type (display only; ambiguity is reported, not resolved). */
export function referencePrice(
  ws: Workspace,
  project: Pick<ProjectRecord, 'clientId' | 'currency'> & { destination?: { country: CountryCode } },
  typeId: string,
  date = DEMO_TODAY,
): ReferencePrice | undefined {
  if (!project.destination) return undefined
  const resolution = resolvePrice(ws.dataset, {
    clientId: project.clientId,
    serviceTypeId: typeId,
    market: project.destination.country,
    currency: project.currency,
    date,
    quantity: 1,
  })
  if (resolution.status === 'none') return undefined
  if (resolution.status === 'ambiguous') return { resolution }
  return { resolution, price: resolution.entry.unitPrice, listName: resolution.entry.agreement ?? 'Tarifario del cliente' }
}
