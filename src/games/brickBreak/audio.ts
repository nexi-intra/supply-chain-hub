import { createSynth } from '../arcadeSynth'
import type { GameEvent } from './engine'

export { SOUND_STORAGE_KEY, loadSoundEnabled, safeLocalStorage, saveSoundEnabled } from '../chickenInvaders/audio'

export type PrismSound =
  | 'shatter'
  | 'chime'
  | 'clink'
  | 'boom'
  | 'paddle'
  | 'wall'
  | 'launch'
  | 'powerup'
  | 'lifeLost'
  | 'extraLife'
  | 'shield'
  | 'laser'
  | 'levelClear'

export function soundForPrismEvent(event: GameEvent): PrismSound | null {
  switch (event.type) {
    case 'brickBreak':
      return event.kind === 'crystal' ? 'chime' : 'shatter'
    case 'brickHit':
      return 'clink'
    case 'explosion':
      return 'boom'
    case 'paddleHit':
      return 'paddle'
    case 'wallHit':
      return 'wall'
    case 'launch':
      return 'launch'
    case 'pickup':
      return 'powerup'
    case 'lifeLost':
      return 'lifeLost'
    case 'extraLife':
      return 'extraLife'
    case 'shieldBlock':
      return 'shield'
    case 'laser':
      return 'laser'
    case 'levelClear':
      return 'levelClear'
    default:
      return null
  }
}

export interface PrismAudio {
  setEnabled: (enabled: boolean) => void
  playEvents: (events: GameEvent[]) => void
  dispose: () => void
}

export function createPrismAudio(options: { enabled: boolean; createContext?: () => AudioContext | null }): PrismAudio {
  let enabled = options.enabled
  const synth = createSynth<PrismSound>({
    enabled: options.enabled,
    createContext: options.createContext,
    minGaps: { shatter: 0.03, chime: 0.05, clink: 0.03, boom: 0.08, paddle: 0.04, wall: 0.05, laser: 0.05 },
    sounds: {
      shatter: ({ noise, tone }) => {
        const pitch = 2200 + Math.random() * 900
        noise(0.2, 0.32, 'highpass', 3200)
        tone('triangle', pitch, pitch * 0.75, 0.12, 0.06)
        tone('sine', pitch * 1.4, pitch * 1.3, 0.08, 0.04, 0.05)
      },
      chime: ({ arpeggio, noise }) => {
        noise(0.25, 0.25, 'highpass', 3600)
        arpeggio([1568, 1976, 2349, 3136], 0.045, 0.09, 'sine')
      },
      clink: ({ tone }) => {
        tone('triangle', 1900, 1500, 0.06, 0.08)
        tone('sine', 2850, 2700, 0.05, 0.04)
      },
      boom: ({ noise, tone }) => {
        noise(0.55, 0.5, 'lowpass', 520)
        tone('sine', 120, 40, 0.5, 0.4)
      },
      paddle: ({ tone }) => tone('sine', 520, 780, 0.07, 0.12),
      wall: ({ tone }) => tone('triangle', 900, 800, 0.03, 0.04),
      launch: ({ tone }) => tone('sine', 400, 900, 0.1, 0.1),
      powerup: ({ arpeggio }) => arpeggio([660, 880, 1320], 0.05, 0.12),
      lifeLost: ({ tone, noise }) => {
        tone('sawtooth', 300, 80, 0.5, 0.12)
        noise(0.4, 0.3, 'lowpass', 900)
      },
      extraLife: ({ arpeggio }) => arpeggio([784, 988, 1175, 1568], 0.07, 0.14),
      shield: ({ tone }) => tone('sine', 1300, 600, 0.16, 0.15),
      laser: ({ tone }) => tone('square', 1400, 900, 0.05, 0.05),
      levelClear: ({ arpeggio }) => arpeggio([523, 659, 784, 1046, 1318], 0.07, 0.13),
    },
  })

  return {
    setEnabled: (value) => {
      enabled = value
      synth.setEnabled(value)
    },
    playEvents: (events) => {
      if (!enabled) return
      for (const event of events) {
        const name = soundForPrismEvent(event)
        if (name) synth.play(name)
      }
    },
    dispose: synth.dispose,
  }
}
