import { useEffect, type RefObject } from 'react'

/** Calls `onDismiss` on outside pointer-down or Escape while `active`. */
export function useDismiss(refs: RefObject<HTMLElement | null>[], active: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!active) return
    const onPointer = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return
      onDismiss()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [refs, active, onDismiss])
}
