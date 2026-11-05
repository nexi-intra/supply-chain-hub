import { describe, expect, it } from 'vitest'
import { createParcelAudio, soundForParcelEvent } from './audio'

describe('Parcel Pilot-lyd', () => {
  it('giver hver hændelse sin lyd', () => {
    expect(soundForParcelEvent({ type: 'lift' })).toBe('lift')
    expect(soundForParcelEvent({ type: 'gatePass', x: 0, y: 0, perfect: true, points: 10, multiplier: 1, streak: 1 })).toBe('perfect')
    expect(soundForParcelEvent({ type: 'gatePass', x: 0, y: 0, perfect: false, points: 10, multiplier: 1, streak: 0 })).toBe('gate')
    expect(soundForParcelEvent({ type: 'parcel', x: 0, y: 0, points: 25, golden: false })).toBe('parcel')
    expect(soundForParcelEvent({ type: 'parcel', x: 0, y: 0, points: 100, golden: true })).toBe('golden')
    expect(soundForParcelEvent({ type: 'shieldBreak', x: 0, y: 0 })).toBe('shieldBreak')
    expect(soundForParcelEvent({ type: 'zone', zone: 2 })).toBe('zone')
    expect(soundForParcelEvent({ type: 'crash', x: 0, y: 0, cause: 'stack' })).toBe('crash')
    expect(soundForParcelEvent({ type: 'splash', x: 0, y: 0 })).toBe('splash')
    expect(soundForParcelEvent({ type: 'gameOver' })).toBeNull()
  })

  it('opretter først lydsystemet, når lyden slås til', () => {
    let created = 0
    const audio = createParcelAudio({ enabled: false, createContext: () => { created++; return null } })
    audio.playEvents([{ type: 'lift' }])
    expect(created).toBe(0)
    audio.setEnabled(true)
    audio.playEvents([{ type: 'lift' }])
    expect(created).toBe(1)
    audio.dispose()
  })
})
