import { useId } from 'react'
import { brand } from '@/config/brand'
import { cn } from '@/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn('size-10', className)}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0.15" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="var(--sg-accent-from)" />
          <stop offset="0.55" stopColor="var(--sg-accent-via)" />
          <stop offset="1" stopColor="var(--sg-accent-to)" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="20" fill={`url(#${id}-g)`} />
      <text
        x="20"
        y="27.2"
        textAnchor="middle"
        fontFamily="Inter Variable, system-ui, sans-serif"
        fontSize="22"
        fontWeight="500"
        fill="#fff"
      >
        {brand.logoLetter}
      </text>
    </svg>
  )
}
