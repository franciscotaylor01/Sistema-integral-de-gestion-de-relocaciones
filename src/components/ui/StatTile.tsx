import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'
import { AnimatedNumber } from './AnimatedNumber'
import { IconChip } from './IconChip'

interface StatTileProps {
  label: string
  value: number
  format: (value: number) => string
  icon: LucideIcon
  tone?: 'accent' | 'neutral'
  /** Footer row: badges and a caption, as in the Vertix KPI tiles. */
  footer?: ReactNode
  /** Navigates to the related, filtered section when clicked. */
  to?: string
  className?: string
}

const accentBackground =
  'radial-gradient(120% 90% at 8% 0%, rgb(255 255 255 / 0.22) 0%, transparent 55%), linear-gradient(150deg, var(--sg-accent-from) 0%, var(--sg-accent-via) 48%, var(--sg-accent-to) 100%)'

/** The Vertix KPI tile (orange accent or muted), optionally a link. */
export function StatTile({ label, value, format, icon, tone = 'neutral', footer, to, className }: StatTileProps) {
  const accent = tone === 'accent'
  const classes = cn(
    'group relative flex min-h-[173px] flex-col justify-between gap-[14px] overflow-hidden rounded-tile p-[16px]',
    'transition-[transform,box-shadow] duration-300 ease-soft hover:-translate-y-0.5',
    accent ? 'text-white shadow-accent hover:shadow-accent-hover' : 'bg-surface-muted text-ink hover:shadow-pill',
    to && 'active:translate-y-0 active:scale-[0.99] active:duration-100',
    className,
  )

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className={cn('text-[15px]', accent ? 'text-white/85' : 'text-ink-secondary')}>{label}</h3>
        <IconChip
          icon={icon}
          onAccent={accent}
          className="shrink-0 transition-transform duration-300 ease-soft group-hover:-rotate-6 group-hover:scale-[1.06]"
        />
      </div>
      <p className="tabular text-[30px] font-semibold leading-none tracking-[-0.02em] 2xl:text-[33px]">
        <AnimatedNumber value={value} format={format} />
      </p>
      {footer && (
        <div className={cn('flex flex-wrap items-center gap-x-[12px] gap-y-[6px] text-[14px]', accent ? 'text-white/75' : 'text-subtle')}>
          {footer}
        </div>
      )}
    </>
  )

  const style = accent ? { backgroundImage: accentBackground } : undefined

  if (to) {
    return (
      <Link to={to} aria-label={`${label}: ver detalle`} className={classes} style={style}>
        {content}
      </Link>
    )
  }
  return (
    <article aria-label={label} className={classes} style={style}>
      {content}
    </article>
  )
}
