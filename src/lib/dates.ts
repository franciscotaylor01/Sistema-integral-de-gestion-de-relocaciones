import { brand, DEMO_TODAY } from '@/config/brand'

const DAY = 86_400_000

/** Parses "YYYY-MM-DD" as a local date (not UTC) or a full ISO date-time. */
export function parseDate(iso: string): Date {
  return iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
}

export const today = () => parseDate(DEMO_TODAY)

/** Whole days from the demo "today" to `iso` (negative when in the past). */
export function daysUntil(iso: string): number {
  return Math.round((parseDate(iso.slice(0, 10)).getTime() - today().getTime()) / DAY)
}

/** "19 oct 2026" — compact, like the Vertix table dates. */
export function formatDate(iso: string): string {
  const d = parseDate(iso)
  return `${formatShortDate(iso)} ${d.getFullYear()}`
}

/** "19 oct" */
export function formatShortDate(iso: string): string {
  return parseDate(iso).toLocaleDateString(brand.locale, { day: 'numeric', month: 'short' }).replace('.', '')
}

/** "19 oct 2026, 16:20" */
export function formatDateTime(iso: string): string {
  const d = parseDate(iso)
  const time = d.toLocaleTimeString(brand.locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${formatDate(iso)}, ${time}`
}

/** "en 5 días", "hoy", "hace 3 días" */
export function formatRelativeDays(iso: string): string {
  const days = daysUntil(iso)
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  if (days === -1) return 'ayer'
  return days > 0 ? `en ${days} días` : `hace ${Math.abs(days)} días`
}

/** "2026-10" month key and its label ("oct"). */
export const monthKey = (iso: string) => iso.slice(0, 7)

export function monthLabel(key: string): string {
  return parseDate(`${key}-01`).toLocaleDateString(brand.locale, { month: 'short' }).replace('.', '')
}
