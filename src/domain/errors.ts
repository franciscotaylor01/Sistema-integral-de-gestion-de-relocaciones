/** Validation / rule violation. `fields` maps form field paths to messages. */
export class DomainError extends Error {
  readonly fields: Record<string, string>

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'DomainError'
    this.fields = fields
  }
}

export function assert(condition: unknown, message: string, field?: string): asserts condition {
  if (!condition) throw new DomainError(message, field ? { [field]: message } : {})
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}
