/** Next sequential document number for a prefix, e.g. FC-2026-0042. */
export function nextNumber(existing: string[], prefix: string, today: string): string {
  const year = today.slice(0, 4)
  const re = new RegExp(`^${prefix}-\\d{4}-(\\d{4,})$`)
  const max = existing.reduce((m, n) => {
    const match = re.exec(n)
    return match ? Math.max(m, Number(match[1])) : m
  }, 0)
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`
}
