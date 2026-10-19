/** Accent- and case-insensitive normalisation ("México" → "mexico"). */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** True when every word of `query` appears in at least one of `fields`. */
export function matches(query: string, ...fields: (string | undefined)[]): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalize(fields.filter(Boolean).join(' '))
  return words.every((w) => haystack.includes(w))
}
