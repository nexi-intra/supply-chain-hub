import { describe, expect, it } from 'vitest'
import type { GameEvent } from './engine'
import { createCargoAudio, soundForCargoEvent } from './audio'

const clear = (count: number, tspin: 'none' | 'mini' | 'full' = 'none', perfect = false): GameEvent => ({ type: 'lineClear', rows: [], blocks: [], count, tspin, backToBack: false, combo: 0, perfect, points: 0 })

describe('Cargo Stack-lyd', () => {
  it('giver hver hændelse sin lyd', () => {
    expect(soundForCargoEvent({ type: 'move', dx: 1 })).toBe('move')
    expect(soundForCargoEvent({ type: 'rotate', rotation: 1, kick: 0 })).toBe('rotate')
    expect(soundForCargoEvent({ type: 'hold', piece: 'T' })).toBe('hold')
    expect(soundForCargoEvent({ type: 'lock', piece: 'T', cells: [] })).toBe('lock')
    expect(soundForCargoEvent({ type: 'hardDrop', piece: 'T', distance: 3, cells: [] })).toBe('hardDrop')
    expect(soundForCargoEvent(clear(1))).toBe('clear')
    expect(soundForCargoEvent(clear(4))).toBe('fullLoad')
    expect(soundForCargoEvent(clear(2, 'full'))).toBe('tspin')
    expect(soundForCargoEvent(clear(1, 'none', true))).toBe('perfect')
    expect(soundForCargoEvent({ type: 'levelUp', level: 2 })).toBe('levelUp')
    expect(soundForCargoEvent({ type: 'gameOver', reason: 'blockOut' })).toBe('gameOver')
    expect(soundForCargoEvent({ type: 'spawn', piece: 'T' })).toBeNull()
  })

  it('opretter først lydsystemet, når lyden slås til', () => {
    let created = 0
    const audio = createCargoAudio({ enabled: false, createContext: () => { created++; return null } })
    audio.playEvents([{ type: 'move', dx: 1 }])
    expect(created).toBe(0)
    audio.setEnabled(true)
    audio.playEvents([{ type: 'move', dx: 1 }])
    expect(created).toBe(1)
    audio.dispose()
  })
})
