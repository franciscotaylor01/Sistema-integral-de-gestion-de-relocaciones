import { FIELD_LABELS, type PoExtraction, type PoFieldKey } from '@/domain/commercial/poExtraction'
import type { ImportFieldStatus, PoImportField, PoImportLine } from '@/types/domain'
import type { StatusMeta } from '@/config/catalogs'

export interface ReviewLine extends PoImportLine {
  key: string
  candidates: { value: string; label: string }[]
}

export const importStatusMeta: Record<ImportFieldStatus, StatusMeta> = {
  recognized: { label: 'Reconocido', tone: 'success' },
  confirm: { label: 'Requiere confirmación', tone: 'warning' },
  missing: { label: 'No encontrado', tone: 'neutral' },
  inconsistent: { label: 'Inconsistente', tone: 'danger' },
}

/** Read-only fields: they verify the document against SIGR data and never change it. */
export const VERIFY_ONLY: PoFieldKey[] = ['client', 'taxId', 'province', 'projectRef']

/** "serviceId|catalogItemId|serviceItemId" encodes a line's SIGR correspondence in a select. */
export const targetKey = (l: Pick<PoImportLine, 'serviceId' | 'catalogItemId' | 'serviceItemId'>) => (l.serviceId ? `${l.serviceId}|${l.catalogItemId ?? ''}|${l.serviceItemId ?? ''}` : '')
export const parseTarget = (v: string) => {
  const [serviceId, catalogItemId, serviceItemId] = v.split('|')
  return { serviceId: serviceId || undefined, catalogItemId: catalogItemId || undefined, serviceItemId: serviceItemId || undefined }
}

export function toReview(x: PoExtraction): { fields: PoImportField[]; lines: ReviewLine[] } {
  return {
    fields: x.fields.map((f) => ({ key: f.key, label: FIELD_LABELS[f.key].label, raw: f.raw, value: f.value, detected: f.value, source: f.source, status: f.status, note: f.note, confirmed: f.status === 'recognized', edited: false })),
    lines: x.lines.map((l) => ({
      key: l.id,
      raw: l.raw,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      amount: l.amount,
      currency: l.currency,
      source: l.source,
      status: l.status,
      note: l.note,
      // Lines without any correspondence start excluded; the user can include and map them.
      included: Boolean(l.match),
      serviceId: l.match?.serviceId,
      catalogItemId: l.match?.catalogItemId,
      serviceItemId: l.match?.serviceItemId,
      confirmed: l.status === 'recognized',
      candidates: l.candidates.map((c) => ({ value: targetKey(c), label: `${c.label} (${Math.round(c.score * 100)}%)` })),
    })),
  }
}

/** Strips UI-only data before sending to the domain. */
export const toImportLines = (lines: ReviewLine[]): PoImportLine[] => lines.map(({ key: _key, candidates: _c, ...l }) => l)
