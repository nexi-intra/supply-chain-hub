import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchInactivity } from './inactivityWatcher'

class FakeTarget {
  private listeners = new Map<string, Set<() => void>>()
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }
  removeEventListener(type: string, fn: () => void) { this.listeners.get(type)?.delete(fn) }
  emit(type: string) { this.listeners.get(type)?.forEach((fn) => fn()) }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0) }
}

const MIN = 60_000

describe('watchInactivity', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
  afterEach(() => { vi.useRealTimers() })

  function start(enforce = true) {
    const target = new FakeTarget()
    const lastActivity = { current: Date.now() }
    const onTimeout = vi.fn()
    const stop = watchInactivity({
      target, events: ['mousedown', 'keydown'], lastActivity, enforce,
      timeoutMs: 30 * MIN, checkEveryMs: MIN, onTimeout,
    })
    return { target, lastActivity, onTimeout, stop }
  }

  it('times out once more than 30 minutes have passed since the last activity', () => {
    const { onTimeout } = start()
    vi.advanceTimersByTime(30 * MIN)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(MIN)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('activity updates the clock and restarts the 60 s check phase', () => {
    const { target, lastActivity, onTimeout } = start()
    vi.advanceTimersByTime(29 * MIN + 30_000)
    target.emit('keydown')
    expect(lastActivity.current).toBe(29 * MIN + 30_000)
    vi.advanceTimersByTime(30 * MIN)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(MIN)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('never times out when not enforcing but still tracks activity', () => {
    const { target, lastActivity, onTimeout } = start(false)
    vi.advanceTimersByTime(3 * 60 * MIN)
    expect(onTimeout).not.toHaveBeenCalled()
    target.emit('mousedown')
    expect(lastActivity.current).toBe(3 * 60 * MIN)
  })

  it('stop clears the timer and removes the listeners', () => {
    const { target, onTimeout, stop } = start()
    stop()
    expect(target.count()).toBe(0)
    vi.advanceTimersByTime(2 * 60 * MIN)
    expect(onTimeout).not.toHaveBeenCalled()
  })
})
