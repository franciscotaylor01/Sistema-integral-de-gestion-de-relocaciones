import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { cardVariants } from '@/lib/motion'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  className?: string
}

/** Page title block — the Vertix "Good morning" header. */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <motion.header
      variants={cardVariants}
      className={cn('flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between', className)}
    >
      <div className="min-w-0">
        {eyebrow && <div className="mb-[12px]">{eyebrow}</div>}
        <h1 className="text-[32px] font-medium leading-[1.15] tracking-[-0.025em] sm:text-[42px]">{title}</h1>
        {description && <div className="mt-[14px] text-[15px] leading-[1.4] text-muted">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-[12px]">{actions}</div>}
    </motion.header>
  )
}
