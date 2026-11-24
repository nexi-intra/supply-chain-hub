import { createSynth } from '../arcadeSynth'
import type { GameEvent } from './engine'

export { SOUND_STORAGE_KEY, loadSoundEnabled, safeLocalStorage, saveSoundEnabled } from '../chickenInvaders/audio'

export type CargoSound = 'move' | 'rotate' | 'hold' | 'lock' | 'hardDrop' | 'clear' | 'fullLoad' | 'tspin' | 'perfect' | 'levelUp' | 'gameOver'

export function soundForCargoEvent(event: GameEvent): CargoSound | null {
  switch (event.type) {
    case 'move':
      return 'move'
    case 'rotate':
      return 'rotate'
    case 'hold':
      return 'hold'
    case 'lock':
      return 'lock'
    case 'hardDrop':
      return 'hardDrop'
    case 'lineClear':
      if (event.perfect) return 'perfect'
      if (event.tspin !== 'none') return 'tspin'
      return event.count === 4 ? 'fullLoad' : event.count > 0 ? 'clear' : null
    case 'levelUp':
      return 'levelUp'
    case 'gameOver':
      return 'gameOver'
    default:
      return null
  }
}

export interface CargoAudio {
  setEnabled: (enabled: boolean) => void
  playEvents: (events: GameEvent[]) => void
  dispose: () => void
}

export function createCargoAudio(options: { enabled: boolean; createContext?: () => AudioContext | null }): CargoAudio {
  let enabled = options.enabled
  const synth = createSynth<CargoSound>({
    enabled: options.enabled,
    createContext: options.createContext,
    minGaps: { move: 0.03, rotate: 0.03, lock: 0.04 },
    sounds: {
      move: ({ tone }) => tone('triangle', 520, 500, 0.03, 0.04),
      rotate: ({ tone }) => tone('square', 700, 900, 0.04, 0.03),
      hold: ({ tone }) => tone('sine', 440, 660, 0.09, 0.08),
      lock: ({ noise, tone }) => {
        noise(0.07, 0.12, 'lowpass', 900)
        tone('sine', 160, 110, 0.08, 0.1)
      },
      hardDrop: ({ noise, tone }) => {
        noise(0.14, 0.25, 'lowpass', 700)
        tone('sine', 140, 60, 0.15, 0.18)
      },
      clear: ({ arpeggio, noise }) => {
        noise(0.2, 0.12, 'bandpass', 1800)
        arpeggio([523, 784], 0.05, 0.1)
      },
      fullLoad: ({ arpeggio, noise }) => {
        noise(0.4, 0.2, 'bandpass', 1400)
        arpeggio([523, 659, 784, 1046], 0.06, 0.13)
      },
      tspin: ({ arpeggio }) => arpeggio([659, 880, 1175], 0.05, 0.12, 'square'),
      perfect: ({ arpeggio }) => arpeggio([523, 659, 784, 1046, 1318, 1568], 0.06, 0.13),
      levelUp: ({ arpeggio }) => arpeggio([392, 523, 659, 784], 0.07, 0.12),
      gameOver: ({ tone, noise }) => {
        tone('sawtooth', 330, 70, 0.8, 0.12)
        noise(0.6, 0.25, 'lowpass', 600)
      },
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
        const name = soundForCargoEvent(event)
        if (name) synth.play(name)
      }
    },
    dispose: synth.dispose,
  }
}
