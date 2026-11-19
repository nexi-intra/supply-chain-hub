import { describe, expect, it } from 'vitest'
import { createSingleFlight } from './singleFlight'

describe('createSingleFlight', () => {
  it('ignores a second Enter while the first save is still running', async () => {
    const once = createSingleFlight()
    let saves = 0
    let finish: () => void = () => {}
    const save = () => new Promise<void>(resolve => { saves++; finish = resolve })
    const first = once(save)
    const second = once(save)
    finish()
    await Promise.all([first, second])
    expect(saves).toBe(1)
  })

  it('allows the next save once the previous one is done, also after an error', async () => {
    const once = createSingleFlight()
    let saves = 0
    await expect(once(async () => { saves++; throw new Error('M: unreachable') })).rejects.toThrow('M: unreachable')
    await once(async () => { saves++ })
    expect(saves).toBe(2)
  })
})
