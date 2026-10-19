import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { easeOutSoft } from '@/lib/motion'

interface ProgressBarProps {
  value: number
  max?: number
  label: string
  valueText?: string
  size?: 'sm' | 'md'
  tone?: 'accent' | 'success' | 'danger' | 'contrast'
  className?: string
}

const fillTone = {
  accent: 'bg-accent',
  success: 'bg-success',
  danger: 'bg-danger',
  contrast: 'bg-contrast',
} as const

/** Vertix spending-limit track: hatched background with an animated fill. */
export function ProgressBar({ value, max = 100, label, valueText, size = 'md', tone = 'accent', className }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className={cn('bg-hatch relative overflow-hidden rounded-full', size === 'md' ? 'h-[12px]' : 'h-[7px]', className)}
    >
      <motion.div
        className={cn('absolute inset-y-0 left-0 rounded-full shadow-[0_0_0_2px_var(--sg-surface)]', fillTone[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1.1, delay: 0.25, ease: easeOutSoft }}
      />
    </div>
  )
}
