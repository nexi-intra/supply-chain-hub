import { describe, expect, it } from 'vitest'
import { routeLabels } from './labels'

describe('Route Runner-tekster', () => {
  it('har samme navn på alle sprog og oversatte kombo- og ekspres-tekster', () => {
    for (const lang of ['da', 'en', 'fi', 'sv']) expect(routeLabels(lang).menu.title).toBe('Route Runner')
    expect(routeLabels('da').combo(3)).toBe('Kombo ×3')
    expect(routeLabels('en').express).toBe('Express!')
    expect(routeLabels('fi').crashed).toBe('Törmäys!')
  })

  it('formaterer point og tid og falder tilbage til dansk', () => {
    expect(routeLabels('da').points(12500)).toBe('12.500')
    expect(routeLabels('da').time(83)).toBe('1:23')
    expect(routeLabels('xx').readyHint).toBe(routeLabels('da').readyHint)
  })
})
