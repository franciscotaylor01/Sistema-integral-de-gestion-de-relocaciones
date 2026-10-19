/** Immutable helpers for id-keyed collections. */

export function findById<T extends { id: string }>(list: T[], id: string): T | undefined {
  return list.find((x) => x.id === id)
}

export function replaceById<T extends { id: string }>(list: T[], id: string, update: (item: T) => T): T[] {
  return list.map((x) => (x.id === id ? update(x) : x))
}
