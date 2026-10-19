import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Neutral sibling of <TrendBadge>: same size, no arrow. */
export function MetaBadge({ children, onAccent, className }: { children: ReactNode; onAccent?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'tabular inline-flex h-[21px] items-center gap-[3px] whitespace-nowrap rounded-[6px] px-[7px] text-[12.5px] font-medium',
        onAccent ? 'bg-white/20 text-white' : 'bg-surface-sunken text-ink-secondary',
        className,
      )}
    >
      {children}
    </span>
  )
}
