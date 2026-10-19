import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SectionTitleProps {
  id?: string
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  /** `lg` = Vertix "Total Income"/"Recent Activities"; `sm` = "Monthly Spending Limit". */
  size?: 'sm' | 'lg'
  className?: string
}

export function SectionTitle({ id, title, description, action, size = 'lg', className }: SectionTitleProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        <h2
          id={id}
          className={cn(
            size === 'lg' ? 'text-[19px] font-semibold leading-[1.3] tracking-[-0.01em]' : 'text-[16px] font-medium leading-[1.3]',
          )}
        >
          {title}
        </h2>
        {description && <p className="mt-[6px] text-[14.5px] leading-[1.4] text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-[10px]">{action}</div>}
    </div>
  )
}
