import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

/**
 * Initials avatar (no external images). When a backend supplies `src`, the
 * photo is rendered instead — same contract as the Vertix avatar.
 */
export function Avatar({ src, name, className }: { src?: string; name: string; className?: string }) {
  if (src) {
    return <img src={src} alt={name} className={cn('size-10 rounded-full object-cover', className)} />
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-grid size-10 shrink-0 place-items-center rounded-full bg-surface-sunken font-semibold text-ink-secondary',
        className,
      )}
    >
      <span aria-hidden className="text-[13px] leading-none">
        {initials(name)}
      </span>
    </span>
  )
}
