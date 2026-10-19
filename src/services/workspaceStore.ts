import type { Dataset } from '@/domain/dataset'
import { dataSource } from './dataSource'
import type { LoadIssue } from './local/storage'

export interface StoreState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  dataset?: Dataset
  error?: Error
  /** Set when stored data was discarded (corrupted / outdated) and re-seeded. */
  issue?: LoadIssue
  /** False when browser storage is unavailable: changes live only in memory. */
  persistent: boolean
}

let state: StoreState = { status: 'idle', persistent: true }
const listeners = new Set<() => void>()

function set(next: Partial<StoreState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

/** Minimal external store; components subscribe through useSyncExternalStore. */
export const workspaceStore = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  ensureLoaded() {
    if (state.status !== 'idle') return
    set({ status: 'loading' })
    dataSource.loadDataset().then(
      ({ dataset, issue, persistent }) => set({ status: 'ready', dataset, issue, persistent }),
      (error: unknown) => set({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }),
    )
  },
  setDataset(dataset: Dataset) {
    set({ status: 'ready', dataset, error: undefined })
  },
  clearIssue() {
    set({ issue: undefined })
  },
}
