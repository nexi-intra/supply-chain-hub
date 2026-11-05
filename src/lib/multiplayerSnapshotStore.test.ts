import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MultiplayerSnapshot } from './multiplayer'
import { createSnapshotStore, sameJson } from './multiplayerSnapshotStore'

function snapshotOf(stamp: string, extra: Partial<MultiplayerSnapshot> = {}): MultiplayerSnapshot {
  return {
    actor: { email: 'anna@example.test', fullName: 'Anna', teamCode: 'OPS' },
    games: [], notifications: [], people: [], teams: [{ folderName: 'OPS', name: stamp }],
    stats: [], myStats: { email: 'anna@example.test', fullName: 'Anna', teamCode: 'OPS', wins: 0, losses: 0, draws: 0, played: 0 },
    statsByType: { 'word-puzzle': [], chess: [], backgammon: [] }, myStatsByType: {} as MultiplayerSnapshot['myStatsByType'], rivals: [], topWords: [],
    ...extra,
  }
}

function fakeApi() {
  const listeners = new Set<() => void>()
  const waiting: Array<{ resolve: (value: MultiplayerSnapshot) => void; reject: (error: unknown) => void }> = []
  const api = {
    snapshot: vi.fn(() => new Promise<MultiplayerSnapshot>((resolve, reject) => { waiting.push({ resolve, reject }) })),
    onChanged: vi.fn((callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback) } }),
  }
  return {
    api, listeners,
    emit: () => listeners.forEach(listener => listener()),
    answer: (value: MultiplayerSnapshot) => waiting.shift()!.resolve(value),
    fail: (error: unknown) => waiting.shift()!.reject(error),
    pendingCount: () => waiting.length,
  }
}

const flush = () => vi.advanceTimersByTimeAsync(0)

describe('sameJson', () => {
  it('compares structurally', () => {
    expect(sameJson({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameJson(null, null)).toBe(true)
  })
})

describe('snapshot store', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fetches once when retained and publishes the answer', async () => {
    const f = fakeApi()
    const store = createSnapshotStore(f.api)
    const states: boolean[] = []
    store.subscribe(() => states.push(store.getState().loaded))
    const release = store.retain('anna@example.test')
    expect(f.api.snapshot).toHaveBeenCalledTimes(1)
    expect(store.getState()).toMatchObject({ loaded: false, loading: true, snapshot: null })
    f.answer(snapshotOf('a'))
    await flush()
    expect(store.getState()).toMatchObject({ loaded: true, loading: false, error: null })
    expect(store.getState().snapshot?.teams[0].name).toBe('a')
    release()
  })

  it('never runs two fetches in parallel; a request during a fetch is answered by one more fetch', async () => {
    const f = fakeApi()
    const store = createSnapshotStore(f.api)
    store.retain()
    const second = store.refresh()
    const third = store.refresh()
    expect(f.api.snapshot).toHaveBeenCalledTimes(1)
    f.answer(snapshotOf('a'))
    await flush()
    expect(f.api.snapshot).toHaveBeenCalledTimes(2)
    f.answer(snapshotOf('b'))
    await Promise.all([second, third])
    expect(f.api.snapshot).toHaveBeenCalledTimes(2)
    expect(store.getState().snapshot?.teams[0].name).toBe('b')
  })

  it('coalesces a burst of change events into one trailing fetch', async () => {
    const f = fakeApi()
    const store = createSnapshotStore(f.api, { debounceMs: 200 })
    store.retain()
    f.answer(snapshotOf('a'))
    await flush()
    expect(f.api.snapshot).toHaveBeenCalledTimes(1)
    f.emit(); vi.advanceTimersByTime(100)
    f.emit(); vi.advanceTimersByTime(100)
    f.emit(); vi.advanceTimersByTime(199)
    expect(f.api.snapshot).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(f.api.snapshot).toHaveBeenCalledTimes(2)
  })

  it('keeps the same snapshot object and does not notify when the answer is unchanged', async () => {
    const f = fakeApi()
    const store = createSnapshotStore(f.api, { debounceMs: 10 })
    store.retain()
    f.answer(snapshotOf('a'))
    await flush()
    const first = store.getState().snapshot
    const listener = vi.fn()
    store.subscribe(listener)
    f.emit(); vi.advanceTimersByTime(10)
    f.answer(snapshotOf('a'))
    await flush()
    expect(store.getState().snapshot).toBe(first)
    expect(listener).not.toHaveBeenCalled()
    f.emit(); vi.advanceTimersByTime(10)
    f.answer(snapshotOf('changed'))
    await flush()
    expect(store.getState().snapshot).not.toBe(first)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the last snapshot on a failed fetch and clears the error on the next success', async () => {
    const f = fakeApi()
    const store = createSnapshotStore(f.api, { debounceMs: 10 })
    store.retain()
    f.answer(snapshotOf('a'))
    await flush()
    f.emit(); vi.advanceTimersByTime(10)
    const boom = new Error('MULTIPLAYER_UNAVAILABLE')
    f.fail(boom)
    await flush()
    expect(store.getState().error).toBe(boom)
    expect(store.getState().snapshot?.teams[0].name).toBe('a')
    expect(store.getState().loaded).toBe(true)
    f.emit(); vi.advanceTimersByTime(10)
    f.answer(snapshotOf('a'))
    await flush()
    expect(store.getState().error).toBeNull()
  })

  it('marks loaded after a failed first fetch', async () => {
    const f = fakeApi()
    const store = createSnapshotStore(f.api)
    store.retain()
    f.fail(new Error('x'))
    await flush()
    expect(store.getState()).toMatchObject({ loaded: true, loading: false, snapshot: null })
  })

  it('shows loading for an explicit visible refresh only', async () => {
    const f = fakeApi()
    const store = createSnapshotStore(f.api, { debounceMs: 10 })
    store.retain()
    f.answer(snapshotOf('a'))
    await flush()
    f.emit(); vi.advanceTimersByTime(10)
    expect(store.getState().loading).toBe(false)
    f.answer(snapshotOf('a'))
    await flush()
    const visible = store.refresh({ visible: true })
    expect(store.getState().loading).toBe(true)
    f.answer(snapshotOf('a'))
    await visible
    expect(store.getState().loading).toBe(false)
  })

  it('stops listening and forgets everything when the last holder lets go', async () => {
    const f = fakeApi()
    const store = createSnapshotStore(f.api)
    const first = store.retain()
    const second = store.retain()
    expect(f.api.onChanged).toHaveBeenCalledTimes(1)
    f.answer(snapshotOf('a'))
    await flush()
    first()
    expect(f.listeners.size).toBe(1)
    second()
    expect(f.listeners.size).toBe(0)
    expect(store.getState().snapshot).toBeNull()
    expect(store.getState().loaded).toBe(false)
  })

  it('starts over when the scope (signed-in user) changes, ignoring an answer for the old one', async () => {
    const f = fakeApi()
    const store = createSnapshotStore(f.api)
    store.retain('anna@example.test')
    f.answer(snapshotOf('anna'))
    await flush()
    store.retain('bo@example.test')
    expect(store.getState().snapshot).toBeNull()
    f.answer(snapshotOf('bo'))
    await flush()
    expect(store.getState().snapshot?.teams[0].name).toBe('bo')
  })

  it('ignores a late answer that belongs to a reset store', async () => {
    const f = fakeApi()
    const store = createSnapshotStore(f.api)
    const release = store.retain('anna@example.test')
    release()
    f.answer(snapshotOf('late'))
    await flush()
    expect(store.getState().snapshot).toBeNull()
  })
})
