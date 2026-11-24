import { describe, expect, it, vi } from 'vitest'
import { watchClickResult } from './clickPending'
import { pendingWriteCount, subscribePendingWrites, trackPendingWrite } from './pendingWrites'

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

describe('a button that starts something slow shows that it works', () => {
  it('is busy while the promise it returned runs, and not before or after', async () => {
    const busy: boolean[] = []
    let finish!: () => void
    watchClickResult(new Promise<void>(resolve => { finish = resolve }), value => busy.push(value))
    expect(busy).toEqual([true])
    finish()
    await flush()
    expect(busy).toEqual([true, false])
  })
  it('a click that returns nothing does not flash a spinner', () => {
    const onBusy = vi.fn()
    watchClickResult(undefined, onBusy)
    expect(onBusy).not.toHaveBeenCalled()
  })
  it('a failing action ends the busy state and its error is not swallowed', async () => {
    const busy: boolean[] = []
    const failed = Promise.reject(new Error('boom'))
    const watched = watchClickResult(failed, value => busy.push(value))
    await expect(watched).rejects.toThrow('boom')
    expect(busy).toEqual([true, false])
  })
})

describe('the app knows when it is still saving to the shared drive', () => {
  it('counts writes until they are done, also failed ones, and tells listeners', async () => {
    const seen: number[] = []
    const stop = subscribePendingWrites(count => seen.push(count))
    let finish!: () => void
    const first = trackPendingWrite(new Promise<void>(resolve => { finish = resolve }))
    const second = trackPendingWrite(Promise.reject(new Error('EACCES')))
    expect(pendingWriteCount()).toBe(2)
    await expect(second).rejects.toThrow('EACCES')
    finish()
    await first
    expect(pendingWriteCount()).toBe(0)
    expect(seen).toEqual([1, 2, 1, 0])
    stop()
  })
})
