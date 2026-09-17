import { afterEach, describe, expect, it, vi } from 'vitest'
import { persistKvChange } from './persistKvChange'

afterEach(() => vi.unstubAllGlobals())

function fixture(value: unknown) {
  let current = structuredClone(value)
  const compareAndSet = vi.fn(async (_key: string, expected: unknown, next: unknown) => {
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('KV_CONFLICT')
    current = structuredClone(next)
    return next
  })
  vi.stubGlobal('window', { kv: { get: async () => structuredClone(current), compareAndSet } })
  return { compareAndSet, read: () => current, write: (next: unknown) => { current = structuredClone(next) } }
}

describe('safe KV changes', () => {
  it('preserves another user’s record when recomputing an addition', async () => {
    const f = fixture(['existing', 'other-client'])
    expect(await persistKvChange('items', ['existing'], current => [...current, 'mine'])).toEqual(['existing', 'other-client', 'mine'])
    expect(f.read()).toEqual(['existing', 'other-client', 'mine'])
  })
  it('rejects an old direct replacement without writing', async () => {
    const f = fixture(['existing', 'other-client'])
    await expect(persistKvChange('items', ['existing'], ['mine'])).rejects.toThrow('KV_CONFLICT')
    expect(f.compareAndSet).not.toHaveBeenCalled()
  })
  it('retries a functional change against a fresh snapshot', async () => {
    const f = fixture(['existing'])
    f.compareAndSet.mockImplementationOnce(async () => { f.write(['existing', 'other-client']); throw new Error('KV_CONFLICT') })
    expect(await persistKvChange('items', ['existing'], current => [...current, 'mine'])).toEqual(['existing', 'other-client', 'mine'])
    expect(f.compareAndSet).toHaveBeenCalledTimes(2)
  })
  it('does not retry a direct replacement after a compare-and-set conflict', async () => {
    const f = fixture(['existing'])
    f.compareAndSet.mockImplementationOnce(async () => { throw new Error('KV_CONFLICT') })
    await expect(persistKvChange('items', ['existing'], ['mine'])).rejects.toThrow('KV_CONFLICT')
    expect(f.compareAndSet).toHaveBeenCalledTimes(1)
  })
  it('reports storage failures instead of treating them as conflicts', async () => {
    const f = fixture(['existing'])
    f.compareAndSet.mockImplementationOnce(async () => { throw new Error('EACCES') })
    await expect(persistKvChange('items', ['existing'], current => [...current, 'mine'])).rejects.toThrow('EACCES')
    expect(f.compareAndSet).toHaveBeenCalledTimes(1)
  })
  it('bounds retries if another client keeps changing the record', async () => {
    const f = fixture(['existing'])
    f.compareAndSet.mockImplementation(async () => { throw new Error('KV_CONFLICT') })
    await expect(persistKvChange('items', ['existing'], current => [...current, 'mine'])).rejects.toThrow('KV_CONFLICT')
    expect(f.compareAndSet).toHaveBeenCalledTimes(5)
  })
})
