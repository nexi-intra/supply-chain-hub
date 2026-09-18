import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElectronKv, type ElectronKvApi } from './electronKvBridge'

// Tidsstyret, saa backoff-ventetiden ikke goer testen langsom.
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function api(overrides: Partial<ElectronKvApi>): ElectronKvApi {
  return {
    get: vi.fn(async () => undefined),
    getMany: vi.fn(async (keys: string[]) => keys.map(() => undefined)),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    keys: vi.fn(async () => []),
    update: vi.fn(async () => []),
    getDataDir: vi.fn(async () => ''),
    getStorageInfo: vi.fn(async () => ({ dataDir: '', source: 'default' as const })),
    chooseDataDir: vi.fn(async () => null),
    getConnectionStatus: vi.fn(),
    retrySync: vi.fn(),
    onConnectionChanged: vi.fn(() => () => {}),
    onSyncResult: vi.fn(() => () => {}),
    onChanged: vi.fn(() => () => {}),
    ...overrides,
  } as ElectronKvApi
}

const busy = () => Object.assign(new Error('KV_LOCK_BUSY: Lageret er optaget af en anden klient.'), { code: 'KV_LOCK_BUSY' })

describe('createElectronKv transient retry', () => {
  it('retries a set when the shared lock is momentarily busy, then succeeds', async () => {
    const set = vi.fn<ElectronKvApi['set']>()
      .mockRejectedValueOnce(busy())
      .mockRejectedValueOnce(busy())
      .mockResolvedValueOnce(undefined)
    const kv = createElectronKv(api({ set }))
    const promise = kv.set('shift-assignments', [{ id: 'a' }])
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toBeUndefined()
    expect(set).toHaveBeenCalledTimes(3)
  })

  it('retries compareAndSet on a busy lock (write never ran, so re-issue is safe)', async () => {
    const update = vi.fn<ElectronKvApi['update']>()
      .mockRejectedValueOnce(busy())
      .mockResolvedValueOnce({ ok: true })
    const kv = createElectronKv(api({ update }))
    const promise = kv.compareAndSet('users', { v: 1 }, { v: 2 })
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledWith('users', { op: 'compareAndSet', expected: { v: 1 }, value: { v: 2 } })
  })

  it('does NOT retry a KV_CONFLICT — the caller must re-read fresh data', async () => {
    const update = vi.fn<ElectronKvApi['update']>().mockRejectedValue(Object.assign(new Error('KV_CONFLICT'), { code: 'KV_CONFLICT' }))
    const kv = createElectronKv(api({ update }))
    const promise = kv.compareAndSet('users', { v: 1 }, { v: 2 })
    const assertion = expect(promise).rejects.toThrow('KV_CONFLICT')
    await vi.runAllTimersAsync()
    await assertion
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('surfaces the error only after every retry is exhausted', async () => {
    const set = vi.fn<ElectronKvApi['set']>().mockRejectedValue(busy())
    const kv = createElectronKv(api({ set }))
    const promise = kv.set('meal-plan-weeks', [])
    const assertion = expect(promise).rejects.toThrow('KV_LOCK_BUSY')
    await vi.runAllTimersAsync()
    await assertion
    // 1 foerste forsoeg + 6 genforsoeg (RETRY_BACKOFF_MS.length).
    expect(set).toHaveBeenCalledTimes(7)
  })
})
