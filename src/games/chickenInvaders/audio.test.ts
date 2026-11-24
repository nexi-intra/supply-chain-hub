import { describe, it, expect } from 'vitest'
import { createArcadeAudio, loadSoundEnabled, saveSoundEnabled, soundForEvent, SOUND_STORAGE_KEY } from './audio'
import { ALL_BOSS_IDS } from './bosses/core'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('lydindstilling', () => {
  it('er slået fra som standard', () => {
    expect(loadSoundEnabled(memoryStorage())).toBe(false)
    expect(loadSoundEnabled(undefined)).toBe(false)
  })

  it('husker valget', () => {
    const storage = memoryStorage()
    saveSoundEnabled(true, storage)
    expect(storage.getItem(SOUND_STORAGE_KEY)).toBe('1')
    expect(loadSoundEnabled(storage)).toBe(true)
    saveSoundEnabled(false, storage)
    expect(loadSoundEnabled(storage)).toBe(false)
  })

  it('tåler ugyldige værdier og en storage der kaster', () => {
    expect(loadSoundEnabled(memoryStorage({ [SOUND_STORAGE_KEY]: 'måske' }))).toBe(false)
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadSoundEnabled(broken)).toBe(false)
    expect(() => saveSoundEnabled(true, broken)).not.toThrow()
  })
})

describe('soundForEvent', () => {
  it('giver hver boss sin egen intro-sting og varsler angrebene med lyd', () => {
    const stings = ALL_BOSS_IDS.map((boss) => soundForEvent({ type: 'bossIntro', boss, variant: 0, mini: false }))
    expect(new Set(stings).size).toBe(ALL_BOSS_IDS.length)
    expect(soundForEvent({ type: 'bossCharge', boss: 'iceQueen', attack: 'frostLaser', x: 0, y: 0, seconds: 1 })).toBe('frostCharge')
    expect(soundForEvent({ type: 'bossCharge', boss: 'roboRooster', attack: 'grid', x: 0, y: 0, seconds: 1 })).toBe('gridCharge')
    expect(soundForEvent({ type: 'bossCharge', boss: 'eggeroid', attack: 'chunks', x: 0, y: 0, seconds: 1 })).toBe('bossCharge')
    expect(soundForEvent({ type: 'bossTeleport', fromX: 0, fromY: 0, x: 1, y: 1 })).toBe('teleport')
    expect(soundForEvent({ type: 'bossShieldDown', x: 0, y: 0 })).toBe('shieldDown')
    expect(soundForEvent({ type: 'bossDeflect', x: 0, y: 0 })).toBe('deflect')
  })

  it('kobler spilhændelser til lyde', () => {
    expect(soundForEvent({ type: 'shot', level: 1 })).toBe('shot')
    expect(soundForEvent({ type: 'shot', level: 5 })).toBe('ion')
    expect(soundForEvent({ type: 'kill', x: 0, y: 0, kind: 'hen', points: 100, multiplier: 1, large: false })).toBe('cluck')
    expect(soundForEvent({ type: 'kill', x: 0, y: 0, kind: 'meteor', points: 50, multiplier: 1, large: false })).toBe('explode')
    expect(soundForEvent({ type: 'bossDefeated', x: 0, y: 0, points: 5000 })).toBe('bigExplode')
    expect(soundForEvent({ type: 'waveStart', wave: 1, kind: 'formation', templateId: 'classic' })).toBeNull()
    expect(soundForEvent({ type: 'sectorStart', sector: 1, theme: 'asteroids', round: 0 })).toBe('sectorStart')
  })

  it('lader boss-stingen stå alene ved bølgestart', () => {
    expect(soundForEvent({ type: 'waveStart', wave: 8, kind: 'boss', templateId: 'motherHen' })).toBeNull()
    expect(soundForEvent({ type: 'waveStart', wave: 6, kind: 'miniBoss', templateId: 'eggTrio' })).toBeNull()
    const played: string[] = []
    const audio = createArcadeAudio({ enabled: true, createContext: () => null })
    const names = [{ type: 'waveStart', wave: 8, kind: 'boss', templateId: 'motherHen' }, { type: 'bossIntro', boss: 'motherHen', variant: 0, mini: false }] as const
    for (const event of names) {
      const name = soundForEvent(event)
      if (name) played.push(name)
    }
    expect(played).toEqual(['stingMotherHen'])
    expect(() => audio.playEvents([...names])).not.toThrow()
  })

  it('spiller en egen fanfare, når Nyt+ begynder', () => {
    expect(soundForEvent({ type: 'sectorStart', sector: 0, theme: 'farm', round: 1 })).toBe('newPlus')
    expect(soundForEvent({ type: 'sectorStart', sector: 0, theme: 'farm', round: 0 })).toBe('sectorStart')
    expect(soundForEvent({ type: 'sectorStart', sector: 2, theme: 'ice', round: 1 })).toBe('sectorStart')
    expect(() => createArcadeAudio({ enabled: true, createContext: () => null }).play('newPlus')).not.toThrow()
  })

  it('har lyde til de nye kyllinger', () => {
    expect(soundForEvent({ type: 'hit', x: 0, y: 0, kind: 'shield', shielded: true })).toBe('shieldCrack')
    expect(soundForEvent({ type: 'hit', x: 0, y: 0, kind: 'shield' })).toBe('hit')
    expect(soundForEvent({ type: 'shieldBreak', x: 0, y: 0 })).toBe('shieldBreak')
    expect(soundForEvent({ type: 'heal', x: 0, y: 0, targets: [] })).toBe('heal')
    expect(soundForEvent({ type: 'bombDrop', x: 0, y: 0 })).toBe('bombDrop')
    expect(soundForEvent({ type: 'bombBurst', x: 0, y: 0 })).toBe('bombBurst')
    expect(soundForEvent({ type: 'tractorBeam', x: 0 })).toBe('tractor')
    expect(soundForEvent({ type: 'weaponStolen', x: 0, y: 0, level: 1 })).toBe('weaponStolen')
    expect(soundForEvent({ type: 'turkeyWarn', x: 0, y: 0 })).toBe('gobble')
    expect(soundForEvent({ type: 'newEnemy', kind: 'ufo' })).toBe('newEnemy')
    expect(soundForEvent({ type: 'kill', x: 0, y: 0, kind: 'balloon', points: 200, multiplier: 1, large: false })).toBe('pop')
    expect(soundForEvent({ type: 'kill', x: 0, y: 0, kind: 'rainbow', points: 2000, multiplier: 1, large: false })).toBe('rainbow')
    expect(soundForEvent({ type: 'kill', x: 0, y: 0, kind: 'ufo', points: 800, multiplier: 1, large: false })).toBe('explode')
  })

  it('kan afspille alle nye lyde uden at fejle', () => {
    const audio = createArcadeAudio({ enabled: true, createContext: () => null })
    for (const name of ['shieldCrack', 'shieldBreak', 'heal', 'bombDrop', 'bombBurst', 'tractor', 'weaponStolen', 'gobble', 'newEnemy', 'pop', 'rainbow'] as const) {
      expect(() => audio.play(name)).not.toThrow()
    }
  })

  it('har lyde til meteorer, hazards og bonusbaner', () => {
    const kill = (meteorType: 'ice' | 'metal' | 'gold' | 'fire') => soundForEvent({ type: 'kill', x: 0, y: 0, kind: 'meteor', points: 50, multiplier: 1, large: false, meteorType })
    expect(kill('ice')).toBe('iceShatter')
    expect(kill('metal')).toBe('metalBreak')
    expect(kill('gold')).toBe('coin')
    expect(kill('fire')).toBe('explode')
    expect(soundForEvent({ type: 'meteorDeflect', x: 0, y: 0 })).toBe('deflect')
    expect(soundForEvent({ type: 'cometWarning', x: 0, y: 0 })).toBe('cometWarn')
    expect(soundForEvent({ type: 'laneWarning', y: 0, dir: 1 })).toBe('laneWarn')
    expect(soundForEvent({ type: 'hazardStart', hazard: 'blackHole', theme: 'volcano' })).toBe('blackHole')
    expect(soundForEvent({ type: 'hazardStart', hazard: 'meteorShower', theme: 'farm' })).toBeNull()
    expect(soundForEvent({ type: 'swallow', x: 0, y: 0, what: 'meteor' })).toBe('swallow')
    expect(soundForEvent({ type: 'pickup', kind: 'coin', x: 0, y: 0, points: 250 })).toBe('coin')
    expect(soundForEvent({ type: 'bonusStart', stage: 'eggDodge', seconds: 20 })).toBe('bonusStart')
    expect(soundForEvent({ type: 'bonusTick', seconds: 3 })).toBe('bonusTick')
    expect(soundForEvent({ type: 'bonusMiss', x: 0, y: 0, first: true })).toBe('bonusMiss')
    expect(soundForEvent({ type: 'bonusResult', stage: 'eggDodge', points: 8000, perfect: true, collected: 0, possible: 0 })).toBe('bonusEnd')
    const audio = createArcadeAudio({ enabled: true, createContext: () => null })
    for (const name of ['iceShatter', 'metalBreak', 'coin', 'deflect', 'cometWarn', 'laneWarn', 'blackHole', 'swallow', 'bonusStart', 'bonusTick', 'bonusMiss', 'bonusEnd'] as const) {
      expect(() => audio.play(name)).not.toThrow()
    }
  })
})

describe('createArcadeAudio', () => {
  it('har egne skudlyde pr. våbenfamilie og lyde til de nye power-ups', () => {
    const shots = (['blaster', 'lightning', 'laser', 'spread', 'homing'] as const).map((family) => soundForEvent({ type: 'shot', level: 2, family }))
    expect(shots).toEqual(['shot', 'zap', 'laserHum', 'spread', 'rocket'])
    expect(soundForEvent({ type: 'shot', level: 5, family: 'blaster' })).toBe('ion')
    const pickups = (['drone', 'slowmo', 'magnet', 'double', 'life'] as const).map((kind) => soundForEvent({ type: 'pickup', kind, x: 0, y: 0, points: 0 }))
    expect(pickups).toEqual(['drone', 'slowmo', 'magnet', 'double', 'lifeUp'])
    expect(soundForEvent({ type: 'weaponUp', level: 3, family: 'laser', switched: true })).toBe('weaponSwitch')
    expect(soundForEvent({ type: 'powerupEnd', kind: 'slowmo' })).toBe('powerDown')
    const audio = createArcadeAudio({ enabled: true, createContext: () => null })
    for (const name of ['zap', 'laserHum', 'spread', 'rocket', 'drone', 'slowmo', 'magnet', 'double', 'lifeUp', 'weaponSwitch', 'powerDown'] as const) {
      expect(() => audio.play(name)).not.toThrow()
    }
  })
  it('spiller intet og fejler ikke uden WebAudio', () => {
    const audio = createArcadeAudio({ enabled: true, createContext: () => null })
    expect(() => audio.playEvents([{ type: 'shot', level: 1 }, { type: 'missile' }])).not.toThrow()
    expect(() => audio.dispose()).not.toThrow()
  })

  it('opretter ikke lydsystemet før lyd er slået til', () => {
    let created = 0
    const audio = createArcadeAudio({ enabled: false, createContext: () => { created++; return null } })
    audio.play('shot')
    expect(created).toBe(0)
    audio.setEnabled(true)
    audio.play('shot')
    expect(created).toBe(1)
  })
})
