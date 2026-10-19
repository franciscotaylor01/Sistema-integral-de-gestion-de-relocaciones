import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

/** The Vertix "Next 14 days" pill, as a navigation affordance. */
export function PillLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'group inline-flex h-[34px] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-full border border-line bg-surface px-[14px] text-[13.5px] text-ink-secondary shadow-pill',
        'transition-[background-color,color,transform] duration-200 ease-soft hover:bg-surface-muted hover:text-ink active:scale-[0.97]',
        className,
      )}
    >
      {children}
      <ArrowUpRight
        aria-hidden
        className="size-[14px] transition-transform duration-300 ease-soft group-hover:-translate-y-[1px] group-hover:translate-x-[1px]"
        strokeWidth={2}
      />
    </Link>
  )
}
