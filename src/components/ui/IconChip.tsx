import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Small round icon holder shown at the top-right of KPI tiles. */
export function IconChip({ icon: Icon, onAccent, className }: { icon: LucideIcon; onAccent?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[32px] place-items-center rounded-full',
        onAccent ? 'bg-white/20 text-white' : 'bg-surface-sunken text-ink-secondary',
        className,
      )}
    >
      <Icon className="size-[15px]" strokeWidth={1.9} />
    </span>
  )
}
