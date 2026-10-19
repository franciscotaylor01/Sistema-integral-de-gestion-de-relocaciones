import type { Transition, Variants } from 'motion/react'

/*
 * Shared motion language. Every animation in the app pulls its timing from
 * here so the interface feels consistent: short, eased-out, no overshoot.
 */

/** Soft ease-out (matches the `ease-soft` Tailwind token in index.css). */
export const easeOutSoft = [0.22, 1, 0.36, 1] as const

export const duration = {
  fast: 0.18,
  base: 0.32,
  slow: 0.6,
  counter: 1.1,
} as const

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 36 }

/** Route-level container: fades the page and staggers its cards in. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.base,
      ease: easeOutSoft,
      delayChildren: 0.04,
      staggerChildren: 0.055,
    },
  },
  exit: { opacity: 0, y: -4, transition: { duration: duration.fast, ease: 'easeIn' } },
}

/** Card entrance, driven by the nearest page container. Inert elsewhere. */
export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: easeOutSoft } },
}

/**
 * Stagger container for content that mounts after its data loads (the page
 * container has already finished its own entrance by then).
 */
export const staggerVariants: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.02, staggerChildren: 0.055 } },
}
