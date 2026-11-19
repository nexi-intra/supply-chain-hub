import { describe, expect, it } from 'vitest'
import { isRetryKey } from './useGameOverRetry'

describe('arcade game-over retry keys', () => {
  it('accepts new Space and Enter presses, including the numeric keypad', () => {
    expect(isRetryKey('Space', false)).toBe(true)
    expect(isRetryKey('Enter', false)).toBe(true)
    expect(isRetryKey('NumpadEnter', false)).toBe(true)
  })

  it('does not restart on key repeat or unrelated keys', () => {
    expect(isRetryKey('Space', true)).toBe(false)
    expect(isRetryKey('Enter', true)).toBe(false)
    expect(isRetryKey('ArrowUp', false)).toBe(false)
  })
})
