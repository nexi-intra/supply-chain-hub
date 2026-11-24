import { createSynth } from '../arcadeSynth'
import type { GameEvent } from './engine'

export { SOUND_STORAGE_KEY, loadSoundEnabled, safeLocalStorage, saveSoundEnabled } from '../chickenInvaders/audio'

export type ParcelSound = 'lift' | 'gate' | 'perfect' | 'parcel' | 'golden' | 'shield' | 'shieldBreak' | 'zone' | 'crash' | 'splash'

export function soundForParcelEvent(event: GameEvent): ParcelSound | null {
  switch (event.type) {
    case 'lift':
      return 'lift'
    case 'gatePass':
      return event.perfect ? 'perfect' : 'gate'
    case 'parcel':
      return event.golden ? 'golden' : 'parcel'
    case 'shieldGain':
      return 'shield'
    case 'shieldBreak':
      return 'shieldBreak'
    case 'zone':
      return 'zone'
    case 'crash':
      return 'crash'
    case 'splash':
      return 'splash'
    default:
      return null
  }
}

export interface ParcelAudio {
  setEnabled: (enabled: boolean) => void
  playEvents: (events: GameEvent[]) => void
  dispose: () => void
}

export function createParcelAudio(options: { enabled: boolean; createContext?: () => AudioContext | null }): ParcelAudio {
  let enabled = options.enabled
  const synth = createSynth<ParcelSound>({
    enabled: options.enabled,
    createContext: options.createContext,
    minGaps: { lift: 0.04, gate: 0.05, parcel: 0.04 },
    sounds: {
      lift: ({ noise, tone }) => {
        noise(0.12, 0.12, 'bandpass', 900)
        tone('triangle', 220, 330, 0.09, 0.05)
      },
      gate: ({ tone }) => tone('sine', 660, 700, 0.06, 0.07),
      perfect: ({ tone }) => {
        tone('sine', 880, 1320, 0.09, 0.09)
        tone('triangle', 1320, 1760, 0.12, 0.05, 0.05)
      },
      parcel: ({ arpeggio }) => arpeggio([988, 1319], 0.045, 0.1, 'sine'),
      golden: ({ arpeggio }) => arpeggio([784, 988, 1175, 1568, 1976], 0.05, 0.12, 'sine'),
      shield: ({ tone }) => tone('sine', 440, 1320, 0.3, 0.12),
      shieldBreak: ({ noise, tone }) => {
        noise(0.25, 0.25, 'highpass', 2500)
        tone('sine', 1400, 500, 0.25, 0.12)
      },
      zone: ({ arpeggio }) => arpeggio([523, 659, 784, 1046], 0.08, 0.12),
      crash: ({ noise, tone }) => {
        noise(0.6, 0.5, 'lowpass', 700)
        tone('sawtooth', 260, 60, 0.5, 0.12)
      },
      splash: ({ noise }) => {
        noise(0.5, 0.35, 'lowpass', 1600)
        noise(0.3, 0.15, 'highpass', 3000, 0.05)
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
        const name = soundForParcelEvent(event)
        if (name) synth.play(name)
      }
    },
    dispose: synth.dispose,
  }
}
