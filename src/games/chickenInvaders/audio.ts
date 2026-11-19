import { createSynth } from '../arcadeSynth'
import type { BossId } from './bosses/core'
import type { GameEvent } from './engine'

export const SOUND_STORAGE_KEY = 'arcade-sound-enabled'

export type SoundName =
  | 'shot'
  | 'ion'
  | 'hit'
  | 'cluck'
  | 'explode'
  | 'bigExplode'
  | 'pickup'
  | 'powerup'
  | 'overheat'
  | 'playerHit'
  | 'shield'
  | 'laserCharge'
  | 'laser'
  | 'waveClear'
  | 'extraLife'
  | 'missile'
  | 'bossPhase'
  | 'sectorStart'
  | 'newPlus'
  | 'shieldCrack'
  | 'shieldBreak'
  | 'heal'
  | 'bombDrop'
  | 'bombBurst'
  | 'tractor'
  | 'weaponStolen'
  | 'gobble'
  | 'newEnemy'
  | 'pop'
  | 'rainbow'
  | 'iceShatter'
  | 'metalBreak'
  | 'coin'
  | 'deflect'
  | 'cometWarn'
  | 'laneWarn'
  | 'blackHole'
  | 'swallow'
  | 'bonusStart'
  | 'bonusTick'
  | 'bonusMiss'
  | 'bonusEnd'
  | 'zap'
  | 'laserHum'
  | 'spread'
  | 'rocket'
  | 'weaponSwitch'
  | 'drone'
  | 'slowmo'
  | 'magnet'
  | 'double'
  | 'lifeUp'
  | 'powerDown'
  | 'stingMotherHen'
  | 'stingEggeroid'
  | 'stingIceQueen'
  | 'stingRobo'
  | 'stingGalactic'
  | 'stingTrio'
  | 'stingCruiser'
  | 'stingUfo'
  | 'bossCharge'
  | 'frostCharge'
  | 'gridCharge'
  | 'teleportCharge'
  | 'teleport'
  | 'shieldDown'
  | 'victory'
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function safeLocalStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function loadSoundEnabled(storage: StorageLike | undefined): boolean {
  try {
    return storage?.getItem(SOUND_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSoundEnabled(enabled: boolean, storage: StorageLike | undefined): void {
  try {
    storage?.setItem(SOUND_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Lyd er kosmetisk; et blokeret localStorage må ikke vælte spillet.
  }
}

const FAMILY_SOUNDS = { lightning: 'zap', laser: 'laserHum', spread: 'spread', homing: 'rocket' } as const
const PICKUP_SOUNDS: Partial<Record<string, SoundName>> = { drumstick: 'pickup', coin: 'coin', drone: 'drone', slowmo: 'slowmo', magnet: 'magnet', double: 'double', life: 'lifeUp' }
/** Hver boss har sin egen korte, musikløse intro-sting. */
export const BOSS_STINGS: Record<BossId, SoundName> = {
  motherHen: 'stingMotherHen',
  eggeroid: 'stingEggeroid',
  iceQueen: 'stingIceQueen',
  roboRooster: 'stingRobo',
  galacticRooster: 'stingGalactic',
  eggTrio: 'stingTrio',
  chickenCruiser: 'stingCruiser',
  ufoMothership: 'stingUfo',
}
const CHARGE_SOUNDS: Partial<Record<string, SoundName>> = { frostLaser: 'frostCharge', grid: 'gridCharge', teleport: 'teleportCharge', tractor: 'tractor', blackHole: 'blackHole' }

export function soundForEvent(event: GameEvent): SoundName | null {
  switch (event.type) {
    case 'shot':
      if (event.family && event.family !== 'blaster') return FAMILY_SOUNDS[event.family]
      return event.level >= 5 ? 'ion' : 'shot'
    case 'weaponUp':
      return event.switched ? 'weaponSwitch' : null
    case 'powerupEnd':
      return 'powerDown'
    case 'hit':
      return event.shielded ? 'shieldCrack' : 'hit'
    case 'bossHit':
      return 'hit'
    case 'kill':
      switch (event.kind) {
        case 'meteor':
          return event.meteorType === 'ice' ? 'iceShatter' : event.meteorType === 'metal' ? 'metalBreak' : event.meteorType === 'gold' ? 'coin' : 'explode'
        case 'ufo':
          return 'explode'
        case 'balloon':
          return 'pop'
        case 'rainbow':
          return 'rainbow'
        default:
          return 'cluck'
      }
    case 'shieldBreak':
      return 'shieldBreak'
    case 'heal':
      return 'heal'
    case 'bombDrop':
      return 'bombDrop'
    case 'bombBurst':
      return 'bombBurst'
    case 'tractorBeam':
      return 'tractor'
    case 'weaponStolen':
      return 'weaponStolen'
    case 'turkeyWarn':
      return 'gobble'
    case 'newEnemy':
      return 'newEnemy'
    case 'bossDefeated':
      return 'bigExplode'
    case 'playerHit':
      return 'playerHit'
    case 'shieldBlock':
      return 'shield'
    case 'pickup':
      return PICKUP_SOUNDS[event.kind] ?? 'powerup'
    case 'meteorDeflect':
      return 'deflect'
    case 'cometWarning':
      return 'cometWarn'
    case 'laneWarning':
      return 'laneWarn'
    case 'hazardStart':
      return event.hazard === 'blackHole' ? 'blackHole' : null
    case 'swallow':
      return 'swallow'
    case 'bonusStart':
      return 'bonusStart'
    case 'bonusTick':
      return 'bonusTick'
    case 'bonusMiss':
      return 'bonusMiss'
    case 'bonusResult':
      return 'bonusEnd'
    case 'overheat':
      return 'overheat'
    case 'extraLife':
      return 'extraLife'
    case 'missile':
      return 'missile'
    case 'laserWarning':
      return 'laserCharge'
    case 'laserFire':
      return 'laser'
    case 'waveClear':
      return 'waveClear'
    case 'bossPhase':
      return 'bossPhase'
    case 'sectorStart':
      return event.round > 0 && event.sector === 0 ? 'newPlus' : 'sectorStart'
    case 'bossIntro':
      return BOSS_STINGS[event.boss]
    case 'bossCharge':
      return CHARGE_SOUNDS[event.attack] ?? 'bossCharge'
    case 'bossDeflect':
      return 'deflect'
    case 'bossShieldDown':
      return 'shieldDown'
    case 'bossTeleport':
      return 'teleport'
    default:
      return null
  }
}

export interface ArcadeAudio {
  setEnabled: (enabled: boolean) => void
  play: (name: SoundName) => void
  playEvents: (events: GameEvent[]) => void
  dispose: () => void
}

const MIN_GAP_SECONDS: Partial<Record<SoundName, number>> = {
  shot: 0.05,
  ion: 0.05,
  hit: 0.03,
  cluck: 0.04,
  pickup: 0.05,
  explode: 0.06,
  shieldCrack: 0.04,
  heal: 0.2,
  pop: 0.05,
  gobble: 0.3,
  bombDrop: 0.2,
  iceShatter: 0.05,
  metalBreak: 0.06,
  coin: 0.04,
  deflect: 0.04,
  cometWarn: 0.2,
  laneWarn: 0.25,
  swallow: 0.1,
  bonusMiss: 0.2,
  zap: 0.06,
  laserHum: 0.07,
  spread: 0.06,
  rocket: 0.08,
  powerDown: 0.2,
  bossCharge: 0.15,
}

export function createArcadeAudio(options: { enabled: boolean; createContext?: () => AudioContext | null }): ArcadeAudio {
  let enabled = options.enabled
  const synth = createSynth<SoundName>({
    enabled: options.enabled,
    createContext: options.createContext,
    minGaps: MIN_GAP_SECONDS,
    sounds: {
      shot: ({ tone }) => tone('square', 880, 440, 0.07, 0.08),
      ion: ({ tone }) => tone('sawtooth', 300, 900, 0.09, 0.07),
      hit: ({ tone }) => tone('triangle', 520, 300, 0.05, 0.1),
      cluck: ({ tone }) => {
        tone('square', 720, 360, 0.06, 0.1)
        tone('square', 640, 300, 0.05, 0.08, 0.07)
      },
      explode: ({ noise }) => noise(0.3, 0.35, 'lowpass', 900),
      bigExplode: ({ noise, tone }) => {
        noise(1.3, 0.6, 'lowpass', 420)
        tone('sine', 130, 35, 1.1, 0.5)
      },
      pickup: ({ tone }) => tone('sine', 660, 990, 0.08, 0.12),
      powerup: ({ arpeggio }) => arpeggio([523, 659, 784, 1046], 0.06, 0.12),
      overheat: ({ tone }) => tone('sawtooth', 220, 70, 0.4, 0.12),
      playerHit: ({ noise, tone }) => {
        noise(0.5, 0.45, 'lowpass', 1300)
        tone('square', 300, 50, 0.45, 0.15)
      },
      shield: ({ tone }) => tone('sine', 1300, 600, 0.16, 0.15),
      laserCharge: ({ tone }) => tone('sine', 180, 820, 1, 0.08),
      laser: ({ tone, noise }) => {
        tone('sawtooth', 120, 90, 0.6, 0.14)
        noise(0.6, 0.15, 'bandpass', 2400)
      },
      waveClear: ({ arpeggio }) => arpeggio([659, 784, 988, 1318], 0.08, 0.12),
      extraLife: ({ arpeggio }) => arpeggio([784, 988, 1175, 1568], 0.07, 0.14),
      missile: ({ noise, tone }) => {
        noise(0.9, 0.5, 'bandpass', 700)
        tone('sine', 90, 30, 0.9, 0.4)
      },
      bossPhase: ({ tone }) => tone('square', 110, 55, 0.6, 0.16),
      sectorStart: ({ arpeggio, tone }) => {
        tone('triangle', 98, 196, 0.7, 0.12)
        arpeggio([392, 523, 659, 784], 0.09, 0.11)
        tone('square', 1046, 1046, 0.32, 0.07, 0.38)
      },
      newPlus: ({ arpeggio, tone }) => {
        tone('triangle', 98, 196, 0.9, 0.12)
        arpeggio([392, 523, 659, 784, 1046, 1318], 0.08, 0.11, 'square')
        ;[523, 659, 784, 1046].forEach((note) => tone('triangle', note, note, 0.8, 0.07, 0.52))
        tone('square', 1568, 1568, 0.4, 0.06, 0.52)
      },
      shieldCrack: ({ tone }) => {
        tone('triangle', 2200, 1400, 0.06, 0.09)
        tone('sine', 3300, 2600, 0.04, 0.05)
      },
      shieldBreak: ({ noise, tone }) => {
        noise(0.35, 0.3, 'highpass', 3000)
        tone('triangle', 1800, 300, 0.3, 0.1)
      },
      heal: ({ arpeggio }) => arpeggio([784, 988, 1175], 0.05, 0.07, 'sine'),
      bombDrop: ({ tone }) => tone('sine', 1400, 500, 0.6, 0.06),
      bombBurst: ({ noise, tone }) => {
        noise(0.45, 0.4, 'lowpass', 1400)
        tone('square', 220, 60, 0.3, 0.12)
      },
      tractor: ({ tone }) => {
        tone('sine', 220, 660, 0.9, 0.08)
        tone('triangle', 330, 990, 0.9, 0.05, 0.05)
      },
      weaponStolen: ({ arpeggio }) => arpeggio([784, 622, 494, 392], 0.07, 0.12, 'square'),
      gobble: ({ tone }) => {
        for (const delay of [0, 0.08, 0.16]) tone('square', 340, 230, 0.07, 0.1, delay)
      },
      newEnemy: ({ arpeggio, tone }) => {
        arpeggio([880, 1175], 0.08, 0.1)
        tone('sine', 1760, 1760, 0.15, 0.05, 0.16)
      },
      pop: ({ noise, tone }) => {
        noise(0.12, 0.35, 'highpass', 2500)
        tone('sine', 900, 200, 0.12, 0.12)
      },
      rainbow: ({ arpeggio }) => arpeggio([523, 659, 784, 1046, 1318, 1568], 0.045, 0.1, 'sine'),
      iceShatter: ({ noise, tone }) => {
        noise(0.18, 0.22, 'highpass', 4200)
        tone('triangle', 2600, 1900, 0.09, 0.07)
        tone('sine', 3900, 3100, 0.07, 0.04, 0.03)
      },
      metalBreak: ({ noise, tone }) => {
        noise(0.35, 0.3, 'bandpass', 1800)
        tone('square', 260, 90, 0.3, 0.1)
        tone('triangle', 1900, 1400, 0.12, 0.06)
      },
      coin: ({ tone }) => {
        tone('square', 988, 988, 0.06, 0.06)
        tone('square', 1319, 1319, 0.16, 0.06, 0.06)
      },
      deflect: ({ tone }) => {
        tone('triangle', 2400, 1700, 0.07, 0.07)
        tone('sine', 3600, 3300, 0.05, 0.04)
      },
      cometWarn: ({ tone }) => {
        tone('sine', 1900, 700, 0.55, 0.05)
        tone('triangle', 2400, 900, 0.5, 0.03, 0.05)
      },
      laneWarn: ({ tone }) => {
        tone('square', 440, 440, 0.12, 0.05)
        tone('square', 330, 330, 0.16, 0.05, 0.14)
      },
      blackHole: ({ tone }) => {
        tone('sine', 62, 48, 2.6, 0.08)
        tone('triangle', 124, 92, 2.4, 0.03, 0.1)
      },
      swallow: ({ tone }) => tone('sine', 520, 60, 0.32, 0.06),
      bonusStart: ({ arpeggio, tone }) => {
        arpeggio([523, 659, 784, 1046, 1318], 0.07, 0.1, 'square')
        tone('triangle', 1568, 1568, 0.4, 0.06, 0.36)
      },
      bonusTick: ({ tone }) => tone('square', 1320, 1320, 0.05, 0.06),
      bonusMiss: ({ tone }) => {
        tone('square', 520, 260, 0.18, 0.08)
        tone('square', 390, 180, 0.22, 0.07, 0.12)
      },
      bonusEnd: ({ tone }) => {
        // Tællelyden følger bannerets optælling (1,2 s) og slutter med en akkord.
        for (let i = 0; i < 14; i++) tone('square', 700 + i * 45, 700 + i * 45, 0.035, 0.035, i * 0.08)
        ;[784, 988, 1175, 1568].forEach((note, i) => tone('triangle', note, note, 0.4, 0.1, 1.15 + i * 0.07))
      },
      zap: ({ noise, tone }) => {
        noise(0.08, 0.16, 'highpass', 3800)
        tone('sawtooth', 1800, 420, 0.07, 0.05)
        tone('square', 2600, 900, 0.05, 0.03, 0.02)
      },
      // Laserens tik kommer tæt nok til at lyde som en vedvarende summen.
      laserHum: ({ tone }) => {
        tone('sawtooth', 96, 92, 0.16, 0.05)
        tone('sine', 192, 188, 0.16, 0.04)
      },
      spread: ({ noise, tone }) => {
        noise(0.09, 0.22, 'bandpass', 1500)
        tone('square', 520, 180, 0.08, 0.06)
      },
      rocket: ({ noise, tone }) => {
        noise(0.35, 0.16, 'lowpass', 1100)
        tone('triangle', 160, 420, 0.25, 0.07)
      },
      weaponSwitch: ({ arpeggio, tone }) => {
        tone('square', 330, 660, 0.1, 0.07)
        arpeggio([659, 880, 1319], 0.05, 0.09, 'square')
      },
      drone: ({ arpeggio, tone }) => {
        arpeggio([440, 587, 880], 0.05, 0.09, 'square')
        tone('sine', 1760, 1320, 0.2, 0.05, 0.16)
      },
      slowmo: ({ tone }) => {
        tone('sine', 880, 110, 0.9, 0.12)
        tone('triangle', 660, 82, 0.9, 0.07, 0.04)
      },
      magnet: ({ tone }) => {
        tone('sine', 300, 1200, 0.25, 0.08)
        tone('sine', 310, 1240, 0.25, 0.06, 0.1)
      },
      double: ({ arpeggio }) => arpeggio([784, 1046, 784, 1046, 1568], 0.06, 0.1, 'square'),
      lifeUp: ({ arpeggio, tone }) => {
        arpeggio([523, 659, 784, 1046, 1318, 1568], 0.06, 0.12)
        tone('sine', 2093, 2093, 0.4, 0.06, 0.36)
      },
      powerDown: ({ tone }) => tone('triangle', 660, 220, 0.3, 0.07),
      stingMotherHen: ({ arpeggio, tone }) => {
        tone('square', 720, 360, 0.08, 0.1)
        tone('square', 640, 300, 0.07, 0.08, 0.09)
        arpeggio([392, 330, 262, 196], 0.12, 0.11, 'square')
        tone('triangle', 98, 98, 0.7, 0.12, 0.5)
      },
      stingEggeroid: ({ noise, tone }) => {
        noise(1.3, 0.4, 'lowpass', 320)
        tone('sine', 72, 38, 1.3, 0.35)
        tone('triangle', 146, 92, 0.9, 0.1, 0.35)
        tone('square', 110, 104, 0.25, 0.06, 0.95)
      },
      stingIceQueen: ({ arpeggio, tone }) => {
        arpeggio([1568, 1319, 1175, 1568, 2093], 0.08, 0.08, 'sine')
        tone('triangle', 2600, 3300, 0.6, 0.04, 0.2)
        tone('sine', 523, 523, 0.9, 0.08, 0.45)
        tone('sine', 659, 659, 0.9, 0.06, 0.45)
      },
      stingRobo: ({ noise, tone }) => {
        for (const delay of [0, 0.16, 0.32]) tone('square', 110, 110, 0.1, 0.12, delay)
        tone('sawtooth', 220, 440, 0.45, 0.08, 0.5)
        noise(0.2, 0.25, 'bandpass', 1800)
        noise(0.25, 0.25, 'bandpass', 900, 0.95)
      },
      stingGalactic: ({ arpeggio, tone }) => {
        tone('triangle', 98, 196, 1.5, 0.14)
        arpeggio([262, 311, 392, 466, 523, 622], 0.11, 0.1, 'square')
        tone('sine', 1046, 1046, 0.8, 0.06, 0.75)
        tone('sine', 1245, 1245, 0.8, 0.05, 0.75)
      },
      stingTrio: ({ arpeggio, tone }) => {
        for (const [delay, pitch] of [[0, 600], [0.14, 700], [0.28, 820]]) tone('square', pitch, pitch / 2, 0.08, 0.1, delay)
        arpeggio([523, 659, 784], 0.08, 0.09, 'square')
      },
      stingCruiser: ({ tone }) => {
        tone('sawtooth', 147, 145, 0.55, 0.12)
        tone('sawtooth', 196, 194, 0.7, 0.11, 0.55)
        tone('square', 98, 98, 0.9, 0.05, 0.55)
      },
      stingUfo: ({ tone }) => {
        tone('sine', 400, 900, 0.4, 0.1)
        tone('sine', 900, 500, 0.4, 0.1, 0.4)
        tone('sine', 500, 1100, 0.5, 0.09, 0.8)
        tone('triangle', 200, 200, 1.2, 0.05)
      },
      bossCharge: ({ tone }) => tone('sine', 260, 720, 0.55, 0.05),
      frostCharge: ({ noise, tone }) => {
        tone('sine', 1200, 2600, 0.9, 0.05)
        noise(0.9, 0.06, 'highpass', 5000)
      },
      gridCharge: ({ tone }) => {
        for (const delay of [0, 0.2, 0.4]) tone('square', 880, 880, 0.08, 0.05, delay)
        tone('sawtooth', 160, 640, 0.7, 0.05)
      },
      teleportCharge: ({ tone }) => {
        tone('sine', 300, 1500, 0.8, 0.06)
        tone('triangle', 310, 1550, 0.8, 0.04, 0.04)
      },
      teleport: ({ noise, tone }) => {
        tone('sine', 1500, 200, 0.25, 0.1)
        noise(0.2, 0.15, 'bandpass', 2600)
      },
      shieldDown: ({ noise, tone }) => {
        noise(0.5, 0.35, 'highpass', 2600)
        tone('triangle', 1600, 200, 0.6, 0.12)
        tone('square', 220, 110, 0.4, 0.08, 0.1)
      },
      victory: ({ arpeggio, tone }) => {
        arpeggio([523, 659, 784, 1046, 784, 1046, 1318], 0.09, 0.11, 'square')
        ;[523, 659, 784, 1046].forEach((note) => tone('triangle', note, note, 0.9, 0.08, 0.7))
      },
    },
  })

  return {
    setEnabled: (value) => {
      enabled = value
      synth.setEnabled(value)
    },
    play: synth.play,
    playEvents: (events) => {
      if (!enabled) return
      for (const event of events) {
        const name = soundForEvent(event)
        if (name) synth.play(name)
        if (event.type === 'bossDefeated') synth.play('victory')
      }
    },
    dispose: synth.dispose,
  }
}

