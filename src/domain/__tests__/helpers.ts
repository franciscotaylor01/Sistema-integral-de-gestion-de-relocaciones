import { DomainError } from '@/domain/errors'
import { buildSeedDataset } from '@/data/seed'
import type { DomainContext } from '@/domain/context'
import type { NewProjectInput } from '@/domain/projects'

/** Deterministic context: sequential ids and a fixed clock. */
export function testContext(actorId = 'stf_01'): DomainContext {
  let n = 0
  return {
    actorId,
    now: () => '2026-10-19T10:00:00',
    today: () => '2026-10-19',
    newId: (prefix) => `${prefix}_t${++n}`,
  }
}

export const seed = () => buildSeedDataset()

export function projectInput(overrides: Partial<NewProjectInput> = {}): NewProjectInput {
  return {
    clientId: 'cli_nordvik',
    beneficiary: { name: 'Ada Lindqvist', nationality: 'NL', email: 'ada@nordvik.example', jobTitle: 'Geologist' },
    family: [
      { name: 'Ole Lindqvist', role: 'spouse' },
      { name: 'Mia Lindqvist', role: 'child', age: 7 },
    ],
    origin: { country: 'NL', city: 'Rotterdam' },
    destination: { country: 'AR', city: 'Neuquén' },
    category: 'long-term',
    ownerId: 'stf_02',
    startDate: '2026-11-01',
    targetDate: '2027-03-31',
    notes: 'Llegada prevista en noviembre.',
    services: [
      { typeId: 'immigration', ownerId: 'stf_03', startDate: '2026-11-01', dueDate: '2027-02-15', startNow: true },
      { typeId: 'housing', ownerId: 'stf_04', startDate: '2026-11-01', dueDate: '2026-12-20' },
      { typeId: 'schooling', ownerId: 'stf_04', startDate: '2026-11-15', dueDate: '2027-02-01' },
    ],
    ...overrides,
  }
}

/** Runs `fn` expecting a DomainError and returns its per-field messages. */
export function fieldsOf(fn: () => unknown): Record<string, string> {
  try {
    fn()
  } catch (e) {
    if (e instanceof DomainError) return e.fields
    throw e
  }
  throw new Error('Expected a DomainError')
}
