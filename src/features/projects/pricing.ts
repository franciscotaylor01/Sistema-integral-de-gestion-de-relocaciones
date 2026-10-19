import type { Workspace } from '@/hooks/useWorkspace'
import type { ProjectRecord } from '@/types/domain'

/** Reference price for a service type from the client's price list (display only). */
export function referencePrice(ws: Workspace, project: Pick<ProjectRecord, 'clientId' | 'currency'>, typeId: string) {
  const client = ws.clientById.get(project.clientId)
  const list = client?.priceLists.find((pl) => pl.currency === project.currency && pl.items.some((i) => i.serviceType === typeId))
  const item = list?.items.find((i) => i.serviceType === typeId)
  return list && item ? { price: item.price, listName: list.name } : undefined
}
