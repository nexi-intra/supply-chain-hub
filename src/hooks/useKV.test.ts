import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Exercise the hook's async persistence and cleanup paths with an isolated
// hook harness. This is not a substitute for real React/Electron UI testing.
const harness = vi.hoisted(() => ({ values: [] as unknown[], cleanup: [] as (() => void)[], error: vi.fn() }))
vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, (next: unknown) => { harness.values.push(next) }],
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void)) => { harness.cleanup.push(effect()) },
}))
vi.mock('sonner', () => ({ toast: { error: harness.error } }))
import { useKV } from './useKV'

beforeEach(() => { harness.values = []; harness.cleanup = []; harness.error.mockClear(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { for (const cleanup of harness.cleanup) cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const latestValue = () => harness.values[harness.values.length - 1]

function fixture<T>(value: T) {
  let current = structuredClone(value)
  let listener: ((keys: string[]) => void) | undefined
  const compareAndSet = vi.fn(async (_key: string, expected: T, next: T) => {
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('KV_CONFLICT')
    current = structuredClone(next)
    return next
  })
  vi.stubGlobal('window', { kv: {
    get: async () => structuredClone(current), compareAndSet,
    subscribe: (callback: (keys: string[]) => void) => { listener = callback; return () => { listener = undefined } },
  } })
  return { compareAndSet, read: () => current, write: (next: T) => { current = structuredClone(next) }, notify: () => listener?.(['key']) }
}

describe('responsive safe hook saves', () => {
  it('keeps rapid direct edits responsive and persists them in order', async () => {
    const f = fixture('da')
    const [, save] = useKV('key', 'da')
    await flush()
    const first = save('fi')
    const second = save('en')
    expect(latestValue()).toBe('en')
    await Promise.all([first, second])
    expect(f.read()).toBe('en')
    expect(f.compareAndSet.mock.calls.map(call => call[2])).toEqual(['fi', 'en'])
    expect(harness.error).not.toHaveBeenCalled()
  })
  it('rebases functional additions on another client’s fresh data', async () => {
    const f = fixture(['initial'])
    const [, save] = useKV('key', ['initial'])
    await flush()
    f.write(['initial', 'other-client'])
    await save(current => [...current, 'mine'])
    expect(f.read()).toEqual(['initial', 'other-client', 'mine'])
    expect(latestValue()).toEqual(f.read())
  })
  it('rolls back a failed optimistic edit to the actually stored value', async () => {
    const f = fixture('initial')
    const [, save] = useKV('key', 'initial')
    await flush()
    f.compareAndSet.mockImplementationOnce(async () => { throw new Error('EACCES') })
    const pending = save('mine')
    expect(latestValue()).toBe('mine')
    await expect(pending).rejects.toThrow('EACCES')
    await flush()
    expect(latestValue()).toBe('initial')
    expect(f.read()).toBe('initial')
    expect(harness.error).toHaveBeenCalledTimes(1)
  })
  it('does not let a subscription load replace newer pending input', async () => {
    const f = fixture('initial')
    const [, save] = useKV('key', 'initial')
    await flush()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    f.compareAndSet.mockImplementationOnce(async (_key, _expected, next) => { await gate; f.write(next); return next })
    const pending = save('mine')
    f.notify()
    await flush()
    expect(latestValue()).toBe('mine')
    release()
    await pending
    expect(f.read()).toBe('mine')
  })
  it('cancels queued writes after the view has unmounted', async () => {
    const f = fixture('initial')
    const [, save] = useKV('key', 'initial')
    await flush()
    const pending = save('mine')
    harness.cleanup[0]()
    await expect(pending).rejects.toThrow('Hubben blev skiftet')
    expect(f.compareAndSet).not.toHaveBeenCalled()
    expect(f.read()).toBe('initial')
  })
  it('does not carry a failed edit into a following functional save', async () => {
    const f = fixture(['initial'])
    const [, save] = useKV('key', ['initial'])
    await flush()
    f.compareAndSet.mockImplementationOnce(async () => { throw new Error('EACCES') })
    const first = save(current => [...current, 'failed'])
    const second = save(current => [...current, 'success'])
    await expect(first).rejects.toThrow('EACCES')
    await second
    expect(f.read()).toEqual(['initial', 'success'])
    expect(latestValue()).toEqual(f.read())
  })
})
