import { describe, expect, it } from 'vitest'
import { shownName } from './UserProfile'

describe('the name in the top-right corner', () => {
  it('shows the full name, or a name read from the e-mail until it is known', () => {
    expect(shownName('jacob.remmer@nexigroup.com', 'Jacob Remmer')).toBe('Jacob Remmer')
    expect(shownName('jacob.remmer@nexigroup.com')).toBe('Jacob Remmer')
    expect(shownName('jacob.remmer@nexigroup.com', 'jacob.remmer@nexigroup.com')).toBe('Jacob Remmer')
    expect(shownName('m.andersen@nexigroup.com', ' ')).toBe('M Andersen')
    expect(shownName('anne-marie_hiemstra@nexigroup.com')).toBe('Anne Marie Hiemstra')
  })
})
