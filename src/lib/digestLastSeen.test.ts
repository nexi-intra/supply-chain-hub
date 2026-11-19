import { describe, expect, it } from 'vitest'
import { shouldSaveDigestLastSeen } from './digestLastSeen'

const HOUR = 60 * 60 * 1000
const now = Date.UTC(2026, 10, 7, 12)

describe('shouldSaveDigestLastSeen', () => {
  it('does not save last seen when nothing was shown and it is less than a day old', () => {
    expect(shouldSaveDigestLastSeen({ lastSeen: now - 3 * HOUR, now, shown: 0 })).toBe(false)
  })
  it('saves when something was shown, so it is not shown again', () => {
    expect(shouldSaveDigestLastSeen({ lastSeen: now - 3 * HOUR, now, shown: 2 })).toBe(true)
  })
  it('saves when the stored value is over a day old, even with nothing shown', () => {
    expect(shouldSaveDigestLastSeen({ lastSeen: now - 25 * HOUR, now, shown: 0 })).toBe(true)
  })
  it('saves on the very first visit', () => {
    expect(shouldSaveDigestLastSeen({ lastSeen: undefined, now, shown: 0 })).toBe(true)
  })
})
