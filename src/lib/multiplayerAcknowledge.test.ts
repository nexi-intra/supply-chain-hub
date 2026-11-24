import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAcknowledgeQueue } from './multiplayerAcknowledge'

describe('createAcknowledgeQueue', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('sends ids from several callers within the delay as one command and never resends them', async () => {
    const command = vi.fn().mockResolvedValue({ entry: null })
    const acknowledge = createAcknowledgeQueue(() => ({ command }), { delayMs: 1500 })
    const bell = acknowledge(['a', 'b'])
    const game = acknowledge(['b', 'c'])
    await vi.advanceTimersByTimeAsync(1500)
    await Promise.all([bell, game])
    expect(command).toHaveBeenCalledTimes(1)
    expect(command.mock.calls[0][0]).toMatchObject({ type: 'acknowledge', notificationIds: ['a', 'b', 'c'] })

    await acknowledge(['a', 'c'])
    await vi.advanceTimersByTimeAsync(1500)
    expect(command).toHaveBeenCalledTimes(1)
  })

  it('splits large sets into batches of 100', async () => {
    const command = vi.fn().mockResolvedValue({ entry: null })
    const acknowledge = createAcknowledgeQueue(() => ({ command }))
    const done = acknowledge(Array.from({ length: 230 }, (_, i) => `n${i}`))
    await vi.advanceTimersByTimeAsync(1500)
    await done
    expect(command.mock.calls.map(call => call[0].notificationIds.length)).toEqual([100, 100, 30])
  })

  it('rejects the callers whose ids failed, so they can try again later', async () => {
    const command = vi.fn().mockRejectedValueOnce(new Error('KV_LOCK_BUSY')).mockResolvedValue({ entry: null })
    const acknowledge = createAcknowledgeQueue(() => ({ command }))
    const first = acknowledge(['x'])
    const assertion = expect(first).rejects.toThrow('KV_LOCK_BUSY')
    await vi.advanceTimersByTimeAsync(1500)
    await assertion
    const retry = acknowledge(['x'])
    await vi.advanceTimersByTimeAsync(1500)
    await retry
    expect(command).toHaveBeenCalledTimes(2)
  })
})
