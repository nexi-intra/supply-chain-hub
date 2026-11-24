import { describe, it, expect } from 'vitest'
import { SOUND_STORAGE_KEY as CHICKEN_KEY } from '../chickenInvaders/audio'
import { createPrismAudio, soundForPrismEvent, SOUND_STORAGE_KEY } from './audio'

describe('soundForPrismEvent', () => {
  it('giver glaslyde til ruder og klokkespil til krystaller', () => {
    expect(soundForPrismEvent({ type: 'brickBreak', id: 1, x: 0, y: 0, kind: 'glass', colorIndex: 0, points: 100, multiplier: 1 })).toBe('shatter')
    expect(soundForPrismEvent({ type: 'brickBreak', id: 1, x: 0, y: 0, kind: 'crystal', colorIndex: 0, points: 500, multiplier: 1 })).toBe('chime')
    expect(soundForPrismEvent({ type: 'brickHit', id: 1, x: 0, y: 0, kind: 'armored', colorIndex: 0 })).toBe('clink')
    expect(soundForPrismEvent({ type: 'explosion', x: 0, y: 0 })).toBe('boom')
    expect(soundForPrismEvent({ type: 'paddleHit', x: 0, y: 0 })).toBe('paddle')
    expect(soundForPrismEvent({ type: 'levelStart', level: 2 })).toBeNull()
  })
})

describe('createPrismAudio', () => {
  it('deler lydvalget med de andre arkadespil', () => {
    expect(SOUND_STORAGE_KEY).toBe(CHICKEN_KEY)
  })

  it('spiller intet og fejler ikke uden WebAudio', () => {
    const audio = createPrismAudio({ enabled: true, createContext: () => null })
    expect(() => audio.playEvents([{ type: 'launch' }, { type: 'explosion', x: 0, y: 0 }])).not.toThrow()
    expect(() => audio.dispose()).not.toThrow()
  })

  it('opretter ikke lydsystemet før lyd er slået til', () => {
    let created = 0
    const audio = createPrismAudio({ enabled: false, createContext: () => { created++; return null } })
    audio.playEvents([{ type: 'launch' }])
    expect(created).toBe(0)
    audio.setEnabled(true)
    audio.playEvents([{ type: 'launch' }])
    expect(created).toBe(1)
  })
})
