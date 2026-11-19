import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyOverrides, createOptimisticList } from './useOptimisticList'

type Item = { id: string; name: string }
const idOf = (item: Item) => item.id

function fixture(initial: Item[]) {
  const published: Item[][] = []
  const list = createOptimisticList<Item>(idOf, items => published.push(items))
  list.show(initial)
  return { list, published }
}

function deferred() {
  let resolve!: (value?: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

afterEach(() => vi.restoreAllMocks())

describe('applyOverrides', () => {
  it('replaces in place, removes and appends', () => {
    const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
    const result = applyOverrides(list, new Map<string, Item | null>([['b', { id: 'b', name: 'B2' }], ['c', null], ['d', { id: 'd', name: 'D' }]]), idOf)
    expect(result).toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'B2' }, { id: 'd', name: 'D' }])
  })
})

describe('optimistic list (a write to M: takes 20-90 s)', () => {
  it('shows a change at once, before the write has ended', () => {
    const { list } = fixture([{ id: 'a', name: 'A' }])
    void list.change([['a', null], ['b', { id: 'b', name: 'B' }]], deferred().promise)
    expect(list.items).toEqual([{ id: 'b', name: 'B' }])
  })

  it('keeps showing the change when the list is read again while the write is on its way', async () => {
    const { list } = fixture([{ id: 'a', name: 'A' }])
    const write = deferred()
    const saved = list.change([['a', { id: 'a', name: 'A2' }]], write.promise)
    list.show([{ id: 'a', name: 'A' }, { id: 'x', name: 'X' }])
    expect(list.items).toEqual([{ id: 'a', name: 'A2' }, { id: 'x', name: 'X' }])
    write.resolve()
    expect(await saved).toBe(true)
    list.show([{ id: 'a', name: 'stored' }])
    expect(list.items).toEqual([{ id: 'a', name: 'stored' }])
  })

  it('puts the items back as they were when the write fails, without touching other changes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { list } = fixture([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])
    const failing = deferred()
    const saved = list.change([['a', null]], failing.promise)
    void list.change([['b', { id: 'b', name: 'B2' }]], deferred().promise)
    failing.reject(new Error('EBUSY'))
    expect(await saved).toBe(false)
    expect(list.items).toEqual([{ id: 'b', name: 'B2' }, { id: 'a', name: 'A' }])
  })

  it('treats a write resolving to null or false as not saved', async () => {
    const { list } = fixture([{ id: 'a', name: 'A' }])
    expect(await list.change([['a', { id: 'a', name: 'A2' }]], Promise.resolve(null))).toBe(false)
    expect(list.items).toEqual([{ id: 'a', name: 'A' }])
    expect(await list.change([['b', { id: 'b', name: 'B' }]], Promise.resolve(false))).toBe(false)
    expect(list.items).toEqual([{ id: 'a', name: 'A' }])
  })

  it('lets a newer change to the same item win over an older one that fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { list } = fixture([{ id: 'a', name: 'A' }])
    const first = deferred()
    const saved = list.change([['a', { id: 'a', name: 'first' }]], first.promise)
    void list.change([['a', { id: 'a', name: 'second' }]], deferred().promise)
    first.reject(new Error('EBUSY'))
    await saved
    expect(list.items).toEqual([{ id: 'a', name: 'second' }])
  })
})
