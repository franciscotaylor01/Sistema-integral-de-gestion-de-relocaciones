import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Label/value pair for detail panels. */
export function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-[4px] truncate text-[15px] font-medium text-ink">{children}</dd>
    </div>
  )
}
