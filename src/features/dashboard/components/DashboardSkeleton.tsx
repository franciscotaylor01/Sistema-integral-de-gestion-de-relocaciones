import { Skeleton } from '@/components/ui/Skeleton'

/** Card-shaped placeholders mirroring the dashboard grid while data loads. */
export function DashboardSkeleton() {
  const card = 'rounded-card bg-surface p-[18px] shadow-card'
  return (
    <div aria-busy="true" aria-label="Cargando dashboard" className="mt-[34px] grid grid-cols-1 gap-[24px] md:grid-cols-2 xl:grid-cols-3">
      <div className={card}>
        <Skeleton className="h-[14px] w-[40%]" />
        <Skeleton className="mt-[18px] h-[30px] w-[65%]" />
        <Skeleton className="mt-[20px] h-[46px] w-full rounded-full" />
        <Skeleton className="mt-[20px] h-[140px] w-full rounded-panel" />
      </div>
      <div className={`${card} grid grid-cols-2 gap-[14px]`}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[173px] rounded-tile" />
        ))}
      </div>
      <div className={`${card} md:col-span-2 xl:col-span-1`}>
        <Skeleton className="h-[18px] w-[50%]" />
        <Skeleton className="mt-[10px] h-[12px] w-[70%]" />
        <Skeleton className="mt-[20px] h-[290px] w-full rounded-panel" />
      </div>
      <div className={card}>
        <Skeleton className="h-[16px] w-[45%]" />
        <Skeleton className="mt-[16px] h-[60px] w-full" />
      </div>
      <div className={`${card} md:col-span-2`}>
        <Skeleton className="h-[18px] w-[30%]" />
        <Skeleton className="mt-[20px] h-[260px] w-full rounded-panel" />
      </div>
    </div>
  )
}
