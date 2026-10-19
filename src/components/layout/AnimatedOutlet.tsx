import { AnimatePresence, motion } from 'motion/react'
import { useLocation, useOutlet } from 'react-router'
import { pageVariants } from '@/lib/motion'

/**
 * Cross-fades between sections. The outlet element is captured per render so
 * the exiting page keeps its own content while it animates out.
 */
export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()

  return (
    <AnimatePresence mode="wait" initial>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="hidden"
        animate="show"
        exit="exit"
        onAnimationStart={(def) => {
          if (def === 'show') window.scrollTo({ top: 0 })
        }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}
