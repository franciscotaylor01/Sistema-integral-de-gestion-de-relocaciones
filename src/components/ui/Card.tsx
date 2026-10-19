import { motion, type HTMLMotionProps } from 'motion/react'
import { cn } from '@/lib/cn'
import { cardVariants } from '@/lib/motion'

type CardTag = 'section' | 'div' | 'article'

type CardProps = HTMLMotionProps<'section'> & {
  as?: CardTag
}

/**
 * White rounded surface used for every top-level dashboard block. Enters with
 * the page stagger (when inside an animated page) and deepens its shadow on hover.
 */
export function Card({ as = 'section', className, ...props }: CardProps) {
  const Comp = motion[as] as typeof motion.section
  return (
    <Comp
      variants={cardVariants}
      className={cn(
        'rounded-card bg-surface shadow-card transition-[background-color,box-shadow] duration-300 ease-soft hover:shadow-card-hover',
        className,
      )}
      {...props}
    />
  )
}
