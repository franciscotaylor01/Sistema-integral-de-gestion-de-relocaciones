import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/cn'

interface TrendBadgeProps {
  value: number
  /** `onAccent` renders the translucent variant used on the orange tile. */
  variant?: 'default' | 'onAccent'
  className?: string
}

export function TrendBadge({ value, variant = 'default', className }: TrendBadgeProps) {
  const up = value >= 0
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        'tabular inline-flex h-[21px] items-center gap-[3px] rounded-[6px] px-[7px] text-[12.5px] font-medium',
        variant === 'onAccent'
          ? 'bg-white/20 text-white'
          : up
            ? 'bg-success-soft text-success'
            : 'bg-danger-soft text-danger',
        className,
      )}
    >
      <Icon aria-hidden className="size-[11px]" strokeWidth={2.4} />
      <span className="sr-only">{up ? 'Sube' : 'Baja'} </span>
      {Math.abs(value)}%
    </span>
  )
}
