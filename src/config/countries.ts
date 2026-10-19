import type { CountryCode } from '@/types/domain'
import { countryNames } from './catalogs'

/** Countries available in selects, alphabetical by Spanish name. */
export const countryOptions = (Object.keys(countryNames) as CountryCode[])
  .map((code) => ({ value: code, label: countryNames[code] }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es'))
