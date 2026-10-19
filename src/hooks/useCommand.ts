import { useCallback, useState } from 'react'
import { useToast } from '@/components/feedback/useToast'
import { DomainError } from '@/domain/errors'

/**
 * Runs a command with busy state, field errors and toast feedback.
 * Prevents double submission while a command is in flight.
 */
export function useCommand() {
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  const run = useCallback(
    async <T>(fn: () => Promise<T>, success?: { title: string; description?: string }): Promise<T | undefined> => {
      if (busy) return undefined
      setBusy(true)
      setErrors({})
      setFormError(undefined)
      try {
        const result = await fn()
        if (success) notify(success)
        return result
      } catch (e) {
        if (e instanceof DomainError) {
          setErrors(e.fields)
          setFormError(Object.keys(e.fields).length ? 'Revisá los campos marcados.' : e.message)
        } else {
          setFormError('Ocurrió un error inesperado. Intentá nuevamente.')
          notify({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : undefined })
        }
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [busy, notify],
  )

  const reset = useCallback(() => {
    setErrors({})
    setFormError(undefined)
  }, [])

  return { run, busy, errors, setErrors, formError, reset }
}
