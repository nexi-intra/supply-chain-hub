// Display-only copy of the Word-Puzzle geometry and letter values. The score authority stays in the
// main process (electron/games/wordPuzzle); display.test.ts compares this file with the .cjs data.
import type { MultiplayerLanguage } from '@/lib/multiplayer'

export const BOARD_SIZE = 15
export const CENTER = 7

export type Premium = 'TW' | 'DW' | 'TL' | 'DL'

const LAYOUT: Record<Premium, Array<[number, number]>> = {
  TW: [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]],
  DW: [
    [1, 1], [2, 2], [3, 3], [4, 4], [1, 13], [2, 12], [3, 11], [4, 10],
    [13, 1], [12, 2], [11, 3], [10, 4], [13, 13], [12, 12], [11, 11], [10, 10], [7, 7],
  ],
  TL: [
    [1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13],
    [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9],
  ],
  DL: [
    [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14], [6, 2], [6, 6], [6, 8], [6, 12], [7, 3],
    [7, 11], [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14], [12, 6], [12, 8], [14, 3], [14, 11],
  ],
}

const PREMIUMS = new Map<number, Premium>()
for (const kind of Object.keys(LAYOUT) as Premium[]) {
  for (const [row, col] of LAYOUT[kind]) PREMIUMS.set(row * BOARD_SIZE + col, kind)
}

export function premiumAt(row: number, col: number): Premium | null {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null
  return PREMIUMS.get(row * BOARD_SIZE + col) ?? null
}

/** Text printed on a premium square. */
export const PREMIUM_TEXT: Record<Premium, string> = { TW: '3W', DW: '2W', TL: '3L', DL: '2L' }

// Letter order is the alphabet order shown in the blank-tile picker.
const POINTS: Record<MultiplayerLanguage, string> = {
  da: 'A1 B3 C8 D2 E1 F3 G3 H4 I3 J4 K3 L2 M4 N1 O2 P4 R1 S2 T2 U3 V3 X8 Y4 Z8 Æ4 Ø4 Å4',
  en: 'A1 B3 C3 D2 E1 F4 G2 H4 I1 J8 K5 L1 M3 N1 O1 P3 Q10 R1 S1 T1 U1 V4 W4 X8 Y4 Z10',
  sv: 'A1 B4 C10 D1 E1 F3 G2 H2 I1 J7 K2 L1 M2 N1 O2 P4 R1 S1 T1 U4 V3 X8 Y7 Z10 Å4 Ä3 Ö4',
  fi: 'A1 B8 C10 D7 E1 F8 G8 H4 I1 J4 K2 L2 M3 N1 O2 P4 R4 S1 T1 U3 V4 W8 Y4 Ä2 Ö7',
}

export const LETTER_POINTS: Record<MultiplayerLanguage, Readonly<Record<string, number>>> = Object.fromEntries(
  (Object.keys(POINTS) as MultiplayerLanguage[]).map(language => [
    language,
    Object.fromEntries(POINTS[language].split(' ').map(token => [token[0], Number(token.slice(1))])),
  ]),
) as Record<MultiplayerLanguage, Readonly<Record<string, number>>>

export function letterPoints(language: MultiplayerLanguage, letter: string): number {
  return LETTER_POINTS[language]?.[letter] ?? 0
}

export function alphabet(language: MultiplayerLanguage): string[] {
  return Object.keys(LETTER_POINTS[language] ?? {})
}
