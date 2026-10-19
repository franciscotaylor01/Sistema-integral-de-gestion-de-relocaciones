import { serviceTypeMeta } from '@/config/catalogs'
import { cn } from '@/lib/cn'
import type { ServiceType } from '@/types/domain'

/** Gradient icon square — the Vertix activity-category treatment. */
export function ServiceChip({ type, size = 'sm', className }: { type: ServiceType; size?: 'sm' | 'md'; className?: string }) {
  const meta = serviceTypeMeta[type]
  return (
    <span
      aria-hidden
      title={meta.label}
      className={cn(
        'grid shrink-0 place-items-center text-white',
        size === 'sm' ? 'size-[22px] rounded-[6px]' : 'size-[34px] rounded-[10px]',
        className,
      )}
      style={{ backgroundImage: meta.bg }}
    >
      <meta.icon className={size === 'sm' ? 'size-[12px]' : 'size-[17px]'} strokeWidth={2.2} />
    </span>
  )
}

/** Overlapping service chips for compact table cells. */
export function ServiceChipStack({ types, max = 4 }: { types: ServiceType[]; max?: number }) {
  const visible = types.slice(0, max)
  const rest = types.length - visible.length
  return (
    <span className="flex items-center" aria-label={types.map((t) => serviceTypeMeta[t].label).join(', ')} role="img">
      {visible.map((t, i) => (
        <ServiceChip key={`${t}-${i}`} type={t} className={cn('ring-2 ring-surface', i > 0 && '-ml-[5px]')} />
      ))}
      {rest > 0 && <span className="ml-[6px] text-[13px] font-medium text-muted">+{rest}</span>}
    </span>
  )
}
