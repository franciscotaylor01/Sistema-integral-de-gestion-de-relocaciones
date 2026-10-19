import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { duration, easeOutSoft } from '@/lib/motion'

interface AnimatedNumberProps {
  value: number
  format: (value: number) => string
  className?: string
}

/**
 * Counts up to `value` on mount and eases between later values. Writes to the
 * DOM directly (no re-render per frame). Screen readers get the final value.
 */
export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const current = useRef(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduceMotion) {
      current.current = value
      node.textContent = format(value)
      return
    }
    const controls = animate(current.current, value, {
      duration: duration.counter,
      ease: easeOutSoft,
      onUpdate: (v) => {
        current.current = v
        node.textContent = format(v)
      },
    })
    return () => controls.stop()
  }, [value, format, reduceMotion])

  return (
    <span className={className}>
      <span ref={ref} aria-hidden>
        {format(reduceMotion ? value : 0)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
