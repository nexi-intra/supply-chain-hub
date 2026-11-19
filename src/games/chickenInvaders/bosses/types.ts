import type { Difficulty } from '../config'
import type { Egg } from '../engine'
import type { AttackTable, BossId, BossState, BossWorld, Pattern } from './core'

export interface BossCreate {
  level: number
  round: number
  difficulty: Difficulty
  variant: number
}

/** Én boss i registret: liv, skabelse, opdatering og angrebsrække. */
export interface BossDef {
  id: BossId
  mini: boolean
  /** Grundpoint; ganges med (1 + runde), medmindre `bonus` bestemmer selv. */
  points: number
  /** Bossens liv-bjælke i alt for sværhedsgrad, runde og variant. */
  health: (difficulty: Difficulty, round: number, variant?: number) => number
  create: (setup: BossCreate) => BossState
  /** Tårne og høns oprettes her, når motoren er klar. */
  setup?: (w: BossWorld) => void
  update: (w: BossWorld, dt: number) => void
  pattern?: Pattern
  attacks?: AttackTable
  /** Livet er summen af delenes liv (Ægge-trioen, Krydseren). */
  partsHealth?: boolean
  bonus?: (boss: BossState) => number
  /** Ekstra gaver ud over standarden. */
  drops?: (w: BossWorld) => void
}

export type EggKind = Egg['kind']
