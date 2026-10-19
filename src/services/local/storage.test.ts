import { describe, expect, it } from 'vitest'
import { buildSeedDataset } from '@/data/seed'
import { SCHEMA_VERSION } from '@/domain/dataset'
import { projectInput } from '@/domain/__tests__/helpers'
import { createLocalDataSource } from './localDataSource'
import { isValidDataset, readDataset, STORAGE_KEY, writeDataset, type StorageLike } from './storage'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: (k) => {
      delete data[k]
    },
  }
}

describe('storage', () => {
  it('the seed dataset is valid and round-trips', () => {
    const ds = buildSeedDataset()
    expect(isValidDataset(ds)).toBe(true)
    const storage = memoryStorage()
    expect(writeDataset(storage, ds, 'now')).toBe(true)
    expect(readDataset(storage).dataset).toEqual(ds)
  })

  it('flags corrupted, outdated and inconsistent data', () => {
    expect(readDataset(memoryStorage({ [STORAGE_KEY]: '{oops' })).issue).toBe('corrupted')
    expect(readDataset(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, data: {} }) })).issue).toBe('outdated')
    const broken = buildSeedDataset()
    broken.tasks = [{ ...broken.tasks[0], serviceId: 'missing' }]
    expect(readDataset(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: SCHEMA_VERSION, data: broken }) })).issue).toBe('invalid')
  })

  it('survives unavailable storage', () => {
    const failing: StorageLike = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    expect(readDataset(failing)).toEqual({})
    expect(writeDataset(failing, buildSeedDataset(), 'now')).toBe(false)
  })
})

describe('local data source', () => {
  it('persists changes across instances (browser refresh) and resets the demo', async () => {
    const storage = memoryStorage()
    const first = createLocalDataSource({ storage, latency: false })
    await first.loadDataset()
    const { projectId } = await first.createProject(projectInput(), 'req-1')

    const reloaded = createLocalDataSource({ storage, latency: false })
    const { dataset } = await reloaded.loadDataset()
    expect(dataset.projects.some((p) => p.id === projectId)).toBe(true)

    const { dataset: reset } = await reloaded.resetDemoData()
    expect(reset.projects.some((p) => p.id === projectId)).toBe(false)
    const again = await createLocalDataSource({ storage, latency: false }).loadDataset()
    expect(again.dataset.projects).toHaveLength(reset.projects.length)
  })

  it('re-seeds and reports when stored data is outdated', async () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, data: {} }) })
    const { dataset, issue } = await createLocalDataSource({ storage, latency: false }).loadDataset()
    expect(issue).toBe('outdated')
    expect(isValidDataset(dataset)).toBe(true)
  })
})
