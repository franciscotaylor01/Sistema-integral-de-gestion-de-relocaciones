import type { ProcedureTypeId } from '@/types/domain'

/*
 * Procedures that can run inside a migration-type service, one per person.
 * A person may have several procedures over time (residencia → DNI → renovación).
 */

export interface ProcedureCatalogEntry {
  id: ProcedureTypeId
  label: string
  workflowTemplateId: string
  /** Typical duration used to propose a due date. */
  typicalDays: number
}

export const procedureCatalog: ProcedureCatalogEntry[] = [
  { id: 'residence', label: 'Residencia', workflowTemplateId: 'wf-residence', typicalDays: 90 },
  { id: 'work-visa', label: 'Visa de trabajo', workflowTemplateId: 'wf-visa', typicalDays: 60 },
  { id: 'dni', label: 'DNI', workflowTemplateId: 'wf-dni', typicalDays: 45 },
  { id: 'tie', label: 'TIE', workflowTemplateId: 'wf-tie', typicalDays: 45 },
  { id: 'apostille', label: 'Apostilla', workflowTemplateId: 'wf-apostille', typicalDays: 20 },
  { id: 'cuil', label: 'Unificación de CUIL', workflowTemplateId: 'wf-cuil', typicalDays: 30 },
  { id: 'driving-license', label: 'Licencia de conducir', workflowTemplateId: 'wf-driving-license', typicalDays: 45 },
]

const byId = new Map(procedureCatalog.map((p) => [p.id, p]))

export function getProcedureType(id: ProcedureTypeId): ProcedureCatalogEntry {
  return byId.get(id) ?? { id, label: id, workflowTemplateId: '', typicalDays: 30 }
}
