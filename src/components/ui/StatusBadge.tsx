import type { StatusMeta, Tone } from '@/config/catalogs'
import { cn } from '@/lib/cn'

const dotTone: Record<Tone, string> = {
  neutral: 'bg-subtle',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  accent: 'bg-accent',
}

const softTone: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-secondary',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  accent: 'bg-accent-soft text-accent-strong',
}

interface StatusBadgeProps {
  meta: StatusMeta
  /** `dot` is the Vertix table status; `soft` is a tinted pill for headers and cards. */
  variant?: 'dot' | 'soft'
  className?: string
}

export function StatusBadge({ meta, variant = 'dot', className }: StatusBadgeProps) {
  if (variant === 'soft') {
    return (
      <span
        className={cn(
          'inline-flex h-[24px] items-center gap-[6px] whitespace-nowrap rounded-full px-[10px] text-[12.5px] font-medium',
          softTone[meta.tone],
          className,
        )}
      >
        <span aria-hidden className={cn('size-[6px] rounded-full', dotTone[meta.tone])} />
        {meta.label}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-[8px] whitespace-nowrap font-medium', className)}>
      <span aria-hidden className={cn('size-[6px] shrink-0 rounded-full', dotTone[meta.tone])} />
      {meta.label}
    </span>
  )
}
