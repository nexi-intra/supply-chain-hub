import { describe, expect, it } from 'vitest'
import { createRouteAudio, soundForRouteEvent } from './audio'

describe('Route Runner-lyd', () => {
  it('giver hver hændelse sin lyd', () => {
    expect(soundForRouteEvent({ type: 'start' })).toBe('start')
    expect(soundForRouteEvent({ type: 'eat', kind: 'parcel', x: 0, y: 0, points: 10, multiplier: 1, combo: 1 })).toBe('pickup')
    expect(soundForRouteEvent({ type: 'eat', kind: 'parcel', x: 0, y: 0, points: 20, multiplier: 2, combo: 3 })).toBe('combo')
    expect(soundForRouteEvent({ type: 'eat', kind: 'express', x: 0, y: 0, points: 50, multiplier: 1, combo: 1 })).toBe('express')
    expect(soundForRouteEvent({ type: 'expressSpawn', x: 0, y: 0 })).toBe('expressSpawn')
    expect(soundForRouteEvent({ type: 'expressExpired', x: 0, y: 0 })).toBe('expressExpired')
    expect(soundForRouteEvent({ type: 'crash', x: 0, y: 0, cause: 'self' })).toBe('crash')
    expect(soundForRouteEvent({ type: 'gameOver' })).toBeNull()
  })

  it('opretter først lydsystemet, når lyden slås til', () => {
    let created = 0
    const audio = createRouteAudio({ enabled: false, createContext: () => { created++; return null } })
    audio.playEvents([{ type: 'start' }])
    expect(created).toBe(0)
    audio.setEnabled(true)
    audio.playEvents([{ type: 'start' }])
    expect(created).toBe(1)
    audio.dispose()
  })
})
