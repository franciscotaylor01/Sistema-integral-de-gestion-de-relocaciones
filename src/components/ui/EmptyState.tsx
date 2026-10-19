import type { LucideIcon } from 'lucide-react'
import { SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon: Icon = SearchX, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <span aria-hidden className="grid size-[44px] place-items-center rounded-full bg-surface-sunken text-ink-secondary">
        <Icon className="size-[19px]" strokeWidth={1.8} />
      </span>
      <p className="mt-[14px] text-[15px] font-semibold">{title}</p>
      {description && <p className="mt-[4px] max-w-[360px] text-[14px] leading-[1.45] text-muted">{description}</p>}
      {action && <div className="mt-[16px]">{action}</div>}
    </div>
  )
}
