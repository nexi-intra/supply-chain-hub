import { describe, expect, it } from 'vitest'
import { sinceTime } from './since'

describe('since', () => {
  it('shows the time today and the date before today', () => {
    const at = new Date(2026, 10, 20, 10, 42).getTime()
    expect(sinceTime(at, new Date(2026, 10, 20, 17, 0).getTime())).toBe('10:42')
    expect(sinceTime(at, new Date(2026, 10, 23, 8, 0).getTime())).toBe('20.11.2026 10:42')
  })
})
