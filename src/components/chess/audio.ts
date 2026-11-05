import { createSynth } from '@/games/arcadeSynth'

// Soft wooden sounds for the chess board: a lift, a tock when a piece is set down, a knock for a capture and a
// two-note chime for check. On by default; the player can mute it from the board.

export const CHESS_SOUND_KEY = 'chess-sound-enabled'
export type ChessSound = 'lift' | 'place' | 'capture' | 'castle' | 'check' | 'end'

interface StorageLike { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }

export function loadChessSound(storage: StorageLike | undefined): boolean {
  try {
    return storage?.getItem(CHESS_SOUND_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveChessSound(enabled: boolean, storage: StorageLike | undefined): void {
  try {
    storage?.setItem(CHESS_SOUND_KEY, enabled ? '1' : '0')
  } catch {
    // Private mode or a full disk: the choice only lasts this session.
  }
}

export function createChessAudio(options: { enabled: boolean; createContext?: () => AudioContext | null }) {
  return createSynth<ChessSound>({
    enabled: options.enabled,
    createContext: options.createContext,
    volume: 0.32,
    minGaps: { place: 0.05, lift: 0.05 },
    sounds: {
      lift: ({ noise }) => noise(0.035, 0.05, 'bandpass', 2600),
      place: ({ noise, tone }) => {
        noise(0.05, 0.22, 'bandpass', 1500)
        tone('sine', 820, 520, 0.07, 0.16)
        tone('sine', 190, 150, 0.09, 0.12)
      },
      capture: ({ noise, tone }) => {
        noise(0.06, 0.26, 'bandpass', 1200)
        tone('sine', 700, 430, 0.08, 0.16)
        noise(0.08, 0.16, 'bandpass', 900, 0.11)
        tone('triangle', 420, 260, 0.12, 0.08, 0.12)
      },
      castle: ({ noise, tone }) => {
        noise(0.05, 0.2, 'bandpass', 1500)
        tone('sine', 820, 520, 0.07, 0.14)
        noise(0.05, 0.18, 'bandpass', 1400, 0.16)
        tone('sine', 760, 500, 0.07, 0.12, 0.16)
      },
      check: ({ tone }) => {
        tone('sine', 988, 988, 0.22, 0.07)
        tone('sine', 1318, 1318, 0.3, 0.06, 0.12)
      },
      end: ({ arpeggio }) => arpeggio([392, 494, 587, 784], 0.11, 0.07, 'sine'),
    },
  })
}
