import { MotionConfig } from 'motion/react'
import { RouterProvider } from 'react-router'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { router } from './router'

export function App() {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </MotionConfig>
    </ThemeProvider>
  )
}
