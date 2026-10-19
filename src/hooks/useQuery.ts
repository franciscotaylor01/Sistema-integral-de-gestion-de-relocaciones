import { useEffect, useState } from 'react'

export interface QueryState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
}

/** Session cache: revisiting a screen renders instantly instead of re-loading. */
const cache = new Map<string, unknown>()

/**
 * Minimal async query hook. `key` identifies the request; the fetcher is
 * re-run only when the key changes. Swap for TanStack Query or Supabase
 * realtime later without changing call sites much.
 */
export function useQuery<T>(key: string, fetcher: () => Promise<T>): QueryState<T> {
  const [state, setState] = useState<{ key: string; data?: T; error?: Error }>({ key: '' })

  useEffect(() => {
    if (cache.has(key)) return
    let cancelled = false
    fetcher().then(
      (data) => {
        cache.set(key, data)
        if (!cancelled) setState({ key, data })
      },
      (error: unknown) => {
        if (!cancelled) setState({ key, error: error instanceof Error ? error : new Error(String(error)) })
      },
    )
    return () => {
      cancelled = true
    }
    // The fetcher is intentionally keyed by `key` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (cache.has(key)) return { data: cache.get(key) as T, loading: false, error: undefined }
  const settled = state.key === key
  return {
    data: settled ? state.data : undefined,
    loading: !settled,
    error: settled ? state.error : undefined,
  }
}
