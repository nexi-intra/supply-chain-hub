import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStampWatcher, IDLE_POLL_MS, WAITING_POLL_MS } from './useGameChangeWatch'

describe('createStampWatcher', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('records a baseline, then reports each change of the game file once', async () => {
    const stamps = ['a', 'a', 'b', 'b', 'c']
    const read = vi.fn(async () => stamps.shift() ?? 'c')
    const onChange = vi.fn()
    const watcher = createStampWatcher({ read, onChange, interval: () => WAITING_POLL_MS, visible: () => true })
    await vi.advanceTimersByTimeAsync(0)
    expect(onChange).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4 * WAITING_POLL_MS)
    expect(read).toHaveBeenCalledTimes(5)
    expect(onChange).toHaveBeenCalledTimes(2)
    watcher.stop()
    await vi.advanceTimersByTimeAsync(10 * WAITING_POLL_MS)
    expect(read).toHaveBeenCalledTimes(5)
  })

  it('polls fast only while waiting for the opponent', async () => {
    let waiting = true
    const read = vi.fn(async () => 'same')
    createStampWatcher({ read, onChange: () => {}, interval: () => (waiting ? WAITING_POLL_MS : IDLE_POLL_MS), visible: () => true })
    await vi.advanceTimersByTimeAsync(3 * WAITING_POLL_MS)
    expect(read).toHaveBeenCalledTimes(4)
    waiting = false
    await vi.advanceTimersByTimeAsync(WAITING_POLL_MS)
    expect(read).toHaveBeenCalledTimes(5)
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS - 1)
    expect(read).toHaveBeenCalledTimes(5)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(6)
  })

  it('never touches the share while the window is hidden, and never stacks reads on a slow share', async () => {
    let visible = false
    let release: (value: string) => void = () => {}
    const read = vi.fn(() => new Promise<string>(resolve => { release = resolve }))
    createStampWatcher({ read, onChange: () => {}, interval: () => WAITING_POLL_MS, visible: () => visible })
    await vi.advanceTimersByTimeAsync(5 * WAITING_POLL_MS)
    expect(read).not.toHaveBeenCalled()
    visible = true
    await vi.advanceTimersByTimeAsync(WAITING_POLL_MS)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10 * WAITING_POLL_MS)
    expect(read).toHaveBeenCalledTimes(1)
    release('x')
    await vi.advanceTimersByTimeAsync(WAITING_POLL_MS)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('keeps polling after a failed read', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('EBUSY')).mockResolvedValueOnce('a').mockResolvedValueOnce('b')
    const onChange = vi.fn()
    createStampWatcher({ read, onChange, interval: () => WAITING_POLL_MS, visible: () => true })
    await vi.advanceTimersByTimeAsync(2 * WAITING_POLL_MS)
    expect(read).toHaveBeenCalledTimes(3)
    expect(onChange).toHaveBeenCalledOnce()
  })
})
