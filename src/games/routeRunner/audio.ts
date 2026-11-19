import { createSynth } from '../arcadeSynth'
import type { GameEvent } from './engine'

export { SOUND_STORAGE_KEY, loadSoundEnabled, safeLocalStorage, saveSoundEnabled } from '../chickenInvaders/audio'

export type RouteSound = 'start' | 'pickup' | 'combo' | 'express' | 'expressSpawn' | 'expressExpired' | 'crash'

export function soundForRouteEvent(event: GameEvent): RouteSound | null {
  switch (event.type) {
    case 'start':
      return 'start'
    case 'eat':
      if (event.kind === 'express') return 'express'
      return event.multiplier > 1 ? 'combo' : 'pickup'
    case 'expressSpawn':
      return 'expressSpawn'
    case 'expressExpired':
      return 'expressExpired'
    case 'crash':
      return 'crash'
    default:
      return null
  }
}

export interface RouteAudio {
  setEnabled: (enabled: boolean) => void
  playEvents: (events: GameEvent[]) => void
  dispose: () => void
}

export function createRouteAudio(options: { enabled: boolean; createContext?: () => AudioContext | null }): RouteAudio {
  let enabled = options.enabled
  const synth = createSynth<RouteSound>({
    enabled: options.enabled,
    createContext: options.createContext,
    minGaps: { pickup: 0.04, combo: 0.04 },
    sounds: {
      start: ({ tone, noise }) => {
        tone('sawtooth', 70, 140, 0.35, 0.08)
        noise(0.3, 0.08, 'lowpass', 500)
      },
      pickup: ({ tone }) => {
        tone('triangle', 660, 880, 0.07, 0.1)
        tone('sine', 990, 990, 0.06, 0.05, 0.05)
      },
      combo: ({ arpeggio }) => arpeggio([784, 988, 1319], 0.04, 0.1, 'triangle'),
      express: ({ arpeggio }) => arpeggio([784, 988, 1175, 1568, 1976], 0.05, 0.12, 'sine'),
      expressSpawn: ({ tone }) => tone('sine', 1320, 1760, 0.12, 0.07),
      expressExpired: ({ tone }) => tone('triangle', 660, 330, 0.25, 0.06),
      crash: ({ noise, tone }) => {
        noise(0.5, 0.45, 'lowpass', 800)
        tone('square', 220, 55, 0.45, 0.1)
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
        const name = soundForRouteEvent(event)
        if (name) synth.play(name)
      }
    },
    dispose: synth.dispose,
  }
}
