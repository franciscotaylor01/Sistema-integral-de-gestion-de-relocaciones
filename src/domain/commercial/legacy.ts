import type { PriceEntry, PriceList } from '@/types/domain'

/** Converts Phase 1/2 per-client price lists into Phase 3 price rules. */
export function priceListsToEntries(clientId: string, lists: PriceList[], createdAt: string): PriceEntry[] {
  return lists.flatMap((pl) =>
    pl.items.map((item) => ({
      id: `tar_${pl.id}_${item.serviceType}`,
      clientId,
      serviceTypeId: item.serviceType,
      market: 'ANY' as const,
      currency: pl.currency,
      unitPrice: item.price,
      unit: 'service' as const,
      minQuantity: 1,
      validFrom: '2026-01-01',
      validTo: pl.validUntil,
      active: true,
      agreement: pl.name,
      createdAt,
      updatedAt: createdAt,
    })),
  )
}
