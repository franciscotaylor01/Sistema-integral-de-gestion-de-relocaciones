import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('skeleton block rounded-[10px]', className)} />
}

/** Placeholder rows matching the Vertix table rhythm. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-panel bg-surface-muted p-[2px]" aria-hidden>
      <div className="flex h-[49px] items-center gap-6 px-[22px]">
        {['w-[8%]', 'w-[14%]', 'w-[12%]', 'w-[10%]'].map((w) => (
          <Skeleton key={w} className={cn('h-[10px]', w)} />
        ))}
      </div>
      <div className="overflow-hidden rounded-[14px] bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-[54px] items-center gap-6 border-b border-line px-[22px] last:border-b-0">
            <Skeleton className="h-[12px] w-[12%]" />
            <Skeleton className="h-[12px] w-[22%]" />
            <Skeleton className="h-[12px] w-[16%]" />
            <Skeleton className="h-[12px] w-[14%]" />
            <Skeleton className="ml-auto h-[12px] w-[10%]" />
          </div>
        ))}
      </div>
    </div>
  )
}
