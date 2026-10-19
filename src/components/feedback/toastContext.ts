import { createContext } from 'react'

export interface ToastInput {
  title: string
  description?: string
}

export interface ToastContextValue {
  notify: (toast: ToastInput) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
