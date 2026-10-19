import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TimelineEntry {
  id: string
  icon: LucideIcon
  title: ReactNode
  meta?: ReactNode
  date: ReactNode
  highlight?: boolean
}

/** Vertical activity timeline with icon nodes and a hairline spine. */
export function Timeline({ items, className }: { items: TimelineEntry[]; className?: string }) {
  return (
    <ol className={cn('relative', className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-[14px] pb-[18px] last:pb-0">
          {i < items.length - 1 && <span aria-hidden className="absolute left-[16px] top-[36px] bottom-[2px] w-px bg-line-strong" />}
          <span
            aria-hidden
            className={cn(
              'relative z-[1] grid size-[33px] shrink-0 place-items-center rounded-full',
              item.highlight ? 'bg-contrast text-on-contrast' : 'bg-surface-sunken text-ink-secondary',
            )}
          >
            <item.icon className="size-[15px]" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1 pt-[6px]">
            <p className="text-[14.5px] leading-[1.45] text-ink">{item.title}</p>
            <p className="mt-[3px] flex flex-wrap items-center gap-x-[8px] text-[12.5px] text-muted">
              {item.meta}
              {item.meta && <span aria-hidden className="h-[10px] w-px bg-line-strong" />}
              <span className="tabular">{item.date}</span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
