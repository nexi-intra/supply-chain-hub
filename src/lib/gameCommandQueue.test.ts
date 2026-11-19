import { describe, expect, it } from 'vitest'
import { createGameCommandQueue } from './gameCommandQueue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

describe('createGameCommandQueue', () => {
  it('runs a command only after the one queued before it, so it can use the revision that produced', async () => {
    const queue = createGameCommandQueue()
    let revision = 1
    const chat = deferred<void>()
    const seen: number[] = []
    const first = queue.enqueue(async () => { seen.push(revision); await chat.promise; revision = 2 })
    const second = queue.enqueue(async () => { seen.push(revision) })
    await Promise.resolve()
    expect(seen).toEqual([1])
    expect(queue.active()).toBe(true)
    chat.resolve()
    await Promise.all([first, second])
    expect(seen).toEqual([1, 2])
    expect(queue.active()).toBe(false)
  })

  it('a failed command is reported to its caller and does not stop the next one', async () => {
    const queue = createGameCommandQueue()
    const failing = queue.enqueue(async () => { throw new Error('conflict') })
    const next = queue.enqueue(async () => 'sent')
    await expect(failing).rejects.toThrow('conflict')
    await expect(next).resolves.toBe('sent')
    expect(queue.active()).toBe(false)
  })
})
