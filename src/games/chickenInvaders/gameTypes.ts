import type { Difficulty } from './config'
import type { BossId, BossState } from './bosses'
import type { BonusStageId, BonusState } from './bonusStages'
import type { EnemyKind, FlybyKind, SpecialKind } from './enemies'
import type { Rng } from './rng'
import type { HazardKind, HazardState, MeteorType } from './hazards'
import type { ScoreState } from './scoring'
import type { EntryKind, FormationState } from './formations'
import type { WaveKind, WaveSpec } from './waves'
import type { ThemeId } from './themes'
import type { TemplateId } from './waveTemplates'
import type { WeaponFamily, WeaponState } from './weapons'
import type { PowerupState, TimedPowerup } from './powerups'

/** Spillets datatyper: tilstand, fjender, skud, æg, pickups, input og hændelser. Motoren (engine.ts) eksporterer dem videre. */

export type { EnemyKind, FlybyKind, SpecialKind, MeteorType, WeaponFamily, TimedPowerup }
/**
 * 'looping': et Galaga-loop-dyk fra formationen; 'formation' omfatter også slange, pinball og rotation.
 * 'wobble' og 'kamikaze' er kalkunens varsel og styrtdyk.
 */
export type EnemyMode = 'entering' | 'formation' | 'diving' | 'looping' | 'free' | 'wobble' | 'kamikaze'
export type PickupKind = 'gift' | 'shield' | 'coolant' | 'missile' | 'drumstick' | 'coin' | 'drone' | 'slowmo' | 'magnet' | 'double' | 'life'

export interface Enemy {
  id: number
  kind: EnemyKind
  mode: EnemyMode
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  maxHp: number
  radius: number
  large: boolean
  /** Meteorens type; ligegyldig for kyllinger. */
  meteorType: MeteorType
  dead: boolean
  variant: number
  hitFlash: number
  /** Skjoldboblens resterende træf (skjoldhøne). */
  shield: number
  /** Nedtælling til kyllingens næste egne angreb eller heling. */
  cooldown: number
  /** Adfærdsfase: sigter/klar til bombe (1) eller UFO'ens strålefase. */
  stage: number
  stageT: number
  /** Sekunder skibet har stået i UFO'ens stråle. */
  beam: number
  stolen: boolean
  /** Familien UFO'en stjal et niveau fra; dens gave giver den tilbage. */
  stolenFamily?: WeaponFamily
  slotX: number
  slotY: number
  slotRow: number
  slotGroup: number
  slotParam: number
  entry: EntryKind
  /** Vandret forskydning i seneste trin; bruges til hældning i tegningen. */
  dx: number
  delay: number
  pathT: number
  pathDuration: number
  p0x: number
  p0y: number
  p1x: number
  p1y: number
  p2x: number
  p2y: number
}

export interface Projectile {
  id: number
  kind: 'bolt' | 'ion' | 'pellet' | 'rocket' | 'drone'
  x: number
  y: number
  vx: number
  vy: number
  damage: number
  pierce: boolean
  hitIds: number[]
  dead: boolean
  /** Haglkornets resterende rækkevidde i px. */
  range?: number
  /** Rakettens alder og mål (fjendens id, -1 = Mor Høne, 0 = intet). */
  age?: number
  targetId?: number
}

export interface Egg {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  /** Snigskyttens sigtede æg, bombehønens store æg eller en af dets splinter, eller et boss-æg (ild, is, målsøgende); ellers et almindeligt æg. */
  kind?: 'aimed' | 'bomb' | 'shard' | 'fire' | 'ice' | 'homing'
  /** Højden hvor bomben sprænger. */
  burstY?: number
  /** Det målsøgende ægs alder i sekunder. */
  age?: number
}

export interface Pickup {
  id: number
  kind: PickupKind
  /** Gavens farve = våbenfamilien. */
  family?: WeaponFamily
  x: number
  y: number
  vx: number
  vy: number
}

export interface GameInput {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  fire: boolean
  /** Kantudløst: sæt kun true i det trin hvor tasten blev trykket ned. */
  missile: boolean
  /** Musens position i banens logiske koordinater; null når musen ikke styrer. */
  pointerX: number | null
  pointerY: number | null
}

export type GameEvent =
  | { type: 'waveStart'; wave: number; kind: WaveKind; templateId: TemplateId }
  | { type: 'sectorStart'; sector: number; theme: ThemeId; round: number }
  | { type: 'waveClear'; wave: number; bonus: number; perfect: boolean }
  | { type: 'shot'; level: number; family?: WeaponFamily }
  | { type: 'lightning'; points: number[]; level: number }
  | { type: 'beam'; x: number; y: number; halfWidth: number; level: number }
  | { type: 'powerupEnd'; kind: TimedPowerup }
  | { type: 'overheat' }
  | { type: 'hit'; x: number; y: number; kind: EnemyKind; shielded?: boolean }
  | { type: 'kill'; x: number; y: number; kind: EnemyKind; points: number; multiplier: number; large: boolean; theme?: ThemeId; meteorType?: MeteorType; part?: number }
  | { type: 'escape'; kind: EnemyKind }
  | { type: 'newEnemy'; kind: SpecialKind }
  | { type: 'shieldBreak'; x: number; y: number }
  | { type: 'heal'; x: number; y: number; targets: { x: number; y: number }[] }
  | { type: 'bombDrop'; x: number; y: number }
  | { type: 'bombBurst'; x: number; y: number }
  | { type: 'tractorBeam'; x: number }
  | { type: 'weaponStolen'; x: number; y: number; level: number }
  | { type: 'turkeyWarn'; x: number; y: number }
  | { type: 'playerHit'; x: number; y: number; lives: number }
  | { type: 'shieldBlock'; x: number; y: number }
  | { type: 'pickup'; kind: PickupKind; x: number; y: number; points: number; family?: WeaponFamily }
  | { type: 'weaponUp'; level: number; family?: WeaponFamily; switched?: boolean }
  | { type: 'extraLife'; lives: number }
  | { type: 'missile' }
  | { type: 'eggSplat'; x: number }
  | { type: 'bossHit'; x: number; y: number }
  | { type: 'bossPhase'; phase: number; boss?: BossId }
  | { type: 'bossDefeated'; x: number; y: number; points: number; boss?: BossId; mini?: boolean; variant?: number }
  | { type: 'bossIntro'; boss: BossId; variant: number; mini: boolean }
  /** Varslet for et boss-angreb begynder; `seconds` er varslets længde. */
  | { type: 'bossCharge'; boss: BossId; attack: string; x: number; y: number; seconds: number }
  | { type: 'bossDeflect'; x: number; y: number }
  | { type: 'bossShieldDown'; x: number; y: number }
  | { type: 'bossTeleport'; fromX: number; fromY: number; x: number; y: number }
  | { type: 'laserWarning'; x: number }
  | { type: 'laserFire'; x: number }
  | { type: 'laserEnd' }
  | { type: 'hazardStart'; hazard: HazardKind; theme: ThemeId }
  | { type: 'meteorDeflect'; x: number; y: number }
  | { type: 'cometWarning'; x: number; y: number }
  | { type: 'laneWarning'; y: number; dir: number }
  | { type: 'swallow'; x: number; y: number; what: 'egg' | 'shot' | 'meteor' }
  | { type: 'blackHoleCollapse'; x: number; y: number }
  | { type: 'bonusStart'; stage: BonusStageId; seconds: number }
  | { type: 'bonusTick'; seconds: number }
  | { type: 'bonusMiss'; x: number; y: number; first: boolean }
  | { type: 'bonusResult'; stage: BonusStageId; points: number; perfect: boolean; collected: number; possible: number }
  | { type: 'gameOver' }

export interface GameState {
  difficulty: Difficulty
  seed: number
  rng: Rng
  time: number
  status: 'playing' | 'over'
  wave: number
  spec: WaveSpec
  waveHitTaken: boolean
  awaitingWave: boolean
  /** Bølgeflowet (ryddet bølge / næste bølge) står stille indtil dette tidspunkt. */
  transitionUntil: number
  ship: { x: number; y: number; vx: number; vy: number; invulnerableUntil: number; shield: boolean }
  lives: number
  missiles: number
  weapon: WeaponState
  powerups: PowerupState
  scoring: ScoreState
  enemies: Enemy[]
  projectiles: Projectile[]
  eggs: Egg[]
  pickups: Pickup[]
  boss: BossState | null
  formation: FormationState
  /** Meteorer der endnu ikke er kommet; sæt til 0 for at stoppe hazard-planen. */
  meteorsToSpawn: number
  hazard: HazardState | null
  bonus: BonusState | null
  goldenAt: number
  /** Planlagte flyvere i bølgen med spilletid. */
  flybys: { kind: FlybyKind; at: number }[]
  /** Nye kyllingetyper spilleren allerede har fået introkort for. */
  introduced: SpecialKind[]
  stats: { shotsFired: number; shotsHit: number; kills: number; bossesDefeated: number; defeated: BossId[] }
  nextId: number
  pendingEvents: GameEvent[]
  /** Sat af udviklerhoppet: øvelsesspil, hvis score ikke gemmes. */
  practice: boolean
}

export interface GameStats {
  score: number
  wave: number
  kills: number
  shotsFired: number
  shotsHit: number
  accuracy: number
  bestChain: number
  bossesDefeated: number
  /** Forskellige bosser og mini-bosser besejret (højst 8). */
  distinctBosses: number
  /** Sektoren spilleren nåede (1–5) og Nyt+-runden. */
  sector: number
  round: number
}
