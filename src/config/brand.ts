import type { CurrencyCode } from '@/types/domain'

/**
 * Branding and locale. Mirrors Vertix's per-client brand config so the shared
 * design system stays untouched while SIGR carries its own identity.
 */
export interface BrandConfig {
  productName: string
  productFullName: string
  clientName: string
  developer: string
  logoLetter: string
  locale: string
  /** Currency in which dashboard KPIs are reported (no conversion is applied). */
  reportingCurrency: CurrencyCode
  /** Shown in the UI so mock data is never mistaken for real records. */
  demoMode: boolean
}

export const brand: BrandConfig = {
  productName: 'SIGR',
  productFullName: 'Sistema Integral de Gestión de Relocaciones',
  clientName: 'Relocare',
  developer: 'Argen Labs',
  logoLetter: 'S',
  locale: 'es-AR',
  reportingCurrency: 'USD',
  demoMode: true,
}

/**
 * Fixed "today" for the demo build so due dates and expirations computed from
 * mock data stay meaningful. Replace with `new Date()` once data is live.
 */
export const DEMO_TODAY = '2026-10-19'
