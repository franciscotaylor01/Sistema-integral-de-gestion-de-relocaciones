/** Side effects the domain needs, injected so logic stays pure and testable. */
export interface DomainContext {
  /** Staff id performing the action (for activity and authorship). */
  actorId: string
  /** Current date-time, ISO 8601. */
  now: () => string
  /** Current business date, "YYYY-MM-DD". */
  today: () => string
  newId: (prefix: string) => string
}

export function randomId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${uuid}`
}

/** Business-calendar timestamp: the domain date (ctx.today) with the time of day, so record dates never mix calendars. */
export const businessStamp = (ctx: Pick<DomainContext, 'today' | 'now'>) => `${ctx.today()}T${ctx.now().slice(11, 19) || '00:00:00'}`
