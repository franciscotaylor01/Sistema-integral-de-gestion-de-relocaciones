type ClassValue = string | false | null | undefined

/** Joins truthy class names. Kept tiny to avoid an extra dependency. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ')
}
