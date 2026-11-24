import type { FlybyKind, FormationSpecial } from './enemies'
import { createRng, type Rng } from './rng'
import type { ThemeId } from './themes'
import type { TemplateId } from './waveTemplates'

export const SECTOR_COUNT = 5
export const WAVES_PER_SECTOR = 8
export const WAVES_PER_ROUND = SECTOR_COUNT * WAVES_PER_SECTOR
const FORMATION_SLOTS_PER_SECTOR = 4
const RAINBOW_CHANCE = 0.1

export type SlotType = 'formation' | 'hazard' | 'bonus' | 'miniboss' | 'boss'

export const SLOT_RHYTHM: readonly SlotType[] = ['formation', 'formation', 'hazard', 'bonus', 'formation', 'miniboss', 'formation', 'boss']

/** Hvor de nye kyllinger må stå: forreste række (ikke dykkerne), bageste række eller hvor som helst. */
export type MixPlace = 'front' | 'back' | 'any'

/** Andel af de almindelige høns, der bliver til en ny kylling; `min`/`max` er antal pr. bølge. */
export interface MixEntry {
  kind: FormationSpecial
  share: number
  place?: MixPlace
  min?: number
  max?: number
}

export interface SectorDef {
  themeId: ThemeId
  /** Formationen i sektorens første formationsplads; udelades for en helt tilfældig start. */
  opener?: TemplateId
  formations: TemplateId[]
  hazards: TemplateId[]
  bonuses: TemplateId[]
  miniBoss: TemplateId
  boss: TemplateId
  /** Sektorens typiske kyllinger i formationsbølgerne; første match vinder. */
  mix: MixEntry[]
  /** Frie flyvere, der kommer forbi i formationsbølgerne. */
  flybys: FlybyKind[]
}

const sector = (themeId: ThemeId, formations: TemplateId[], extra: Partial<SectorDef> = {}): SectorDef => ({
  themeId,
  formations,
  hazards: ['meteorShower'],
  bonuses: ['drumstickRain'],
  miniBoss: 'eggTrio',
  boss: 'motherHen',
  mix: [],
  flybys: [],
  ...extra,
})

/** Puljerne er data: senere faser tilføjer skabelon-id'er her. De sene sektorer får de hårdeste mønstre. */
export const SECTORS: SectorDef[] = [
  sector('farm', ['classic', 'vSquadron', 'columnDrop', 'twinFlanks', 'divers', 'carousel'], {
    opener: 'classic',
    hazards: ['meteorShower', 'goldRush'],
    bonuses: ['drumstickRain', 'shootingGallery'],
    mix: [{ kind: 'balloon', share: 0.12 }],
  }),
  sector('asteroids', ['classic', 'divers', 'armored', 'conga', 'diamondDance', 'checkerWall', 'twinFlanks', 'sniperNest'], {
    hazards: ['asteroidBelt', 'meteorShower'],
    bonuses: ['shootingGallery', 'eggDodge'],
    miniBoss: 'chickenCruiser',
    boss: 'eggeroid',
    mix: [
      { kind: 'sniper', share: 0.3, place: 'front', max: 4 },
      { kind: 'balloon', share: 0.08 },
    ],
    flybys: ['ninja'],
  }),
  sector('ice', ['armored', 'carousel', 'arrowhead', 'checkerWall', 'pinballFlock', 'vSquadron', 'conga', 'medicSquad'], {
    hazards: ['meteorShower', 'cometStorm'],
    bonuses: ['eggDodge', 'drumstickRain'],
    miniBoss: 'ufoMothership',
    boss: 'iceQueen',
    mix: [
      { kind: 'sniper', share: 0.22, place: 'front', max: 3 },
      { kind: 'shield', share: 0.14 },
      { kind: 'medic', share: 0.06, max: 3 },
      { kind: 'balloon', share: 0.06 },
    ],
    flybys: ['ninja'],
  }),
  sector('volcano', ['divers', 'loopSquad', 'pinballFlock', 'arrowhead', 'diamondDance', 'columnDrop', 'turkeyRaid', 'twinFlanks'], {
    hazards: ['meteorShower', 'blackHole'],
    bonuses: ['drumstickRain', 'shootingGallery', 'eggDodge'],
    miniBoss: 'eggTrioFire',
    boss: 'roboRooster',
    mix: [
      { kind: 'turkey', share: 0.18, place: 'front', max: 3 },
      { kind: 'sniper', share: 0.2, place: 'front', max: 3 },
      { kind: 'bomber', share: 0.25, place: 'back', max: 3 },
      { kind: 'shield', share: 0.08 },
      { kind: 'medic', share: 0.05, max: 2 },
      { kind: 'balloon', share: 0.05 },
    ],
    flybys: ['ninja'],
  }),
  sector('mothership', ['loopSquad', 'arrowhead', 'pinballFlock', 'checkerWall', 'sniperNest', 'medicSquad', 'turkeyRaid', 'ufoAmbush'], {
    hazards: ['blackHole', 'meteorShower', 'cometStorm', 'asteroidBelt', 'goldRush'],
    bonuses: ['eggDodge', 'shootingGallery', 'drumstickRain'],
    miniBoss: 'chickenCruiserMk2',
    boss: 'galacticRooster',
    mix: [
      { kind: 'turkey', share: 0.15, place: 'front', max: 3 },
      { kind: 'sniper', share: 0.22, place: 'front', max: 3 },
      { kind: 'bomber', share: 0.2, place: 'back', max: 3 },
      { kind: 'shield', share: 0.1 },
      { kind: 'medic', share: 0.06, max: 3 },
      { kind: 'balloon', share: 0.06 },
    ],
    flybys: ['ninja', 'ufo'],
  }),
]

/** Sektorens blanding; i Nyt+ kommer alle kyllinger med fra start, og andelen stiger lidt pr. runde. */
export function sectorMix(sectorIndex: number, round: number): MixEntry[] {
  const own = SECTORS[sectorIndex].mix
  if (round <= 0) return own
  const boost = 1 + 0.15 * Math.min(round, 3)
  const merged = new Map(own.map((entry) => [entry.kind, { ...entry }]))
  for (const entry of SECTORS[SECTOR_COUNT - 1].mix) if (!merged.has(entry.kind)) merged.set(entry.kind, { ...entry, share: entry.share * 0.5 })
  return [...merged.values()].map((entry) => ({ ...entry, share: Math.min(0.5, entry.share * boost) }))
}

export function sectorFlybys(sectorIndex: number, round: number): FlybyKind[] {
  const own = SECTORS[sectorIndex].flybys
  return round > 0 && !own.includes('ninja') ? ['ninja', ...own] : own
}

export interface CampaignPosition {
  sector: number
  slot: number
  round: number
}

export interface CampaignWave extends CampaignPosition {
  wave: number
  theme: ThemeId
  slotType: SlotType
  templateId: TemplateId
  sectorScaling: number
  slotScaling: number
  /** Seedet tal pr. bølge, der placerer de nye kyllinger i formationen. */
  variety: number
  /** Den sjældne regnbuehøne kommer forbi i denne bølge. */
  rainbow: boolean
}

export function campaignPosition(wave: number): CampaignPosition {
  const index = wave - 1
  return {
    sector: Math.floor(index / WAVES_PER_SECTOR) % SECTOR_COUNT,
    slot: index % WAVES_PER_SECTOR,
    round: Math.floor(index / WAVES_PER_ROUND),
  }
}

export const sectorScaling = (sectorIndex: number): number => 1 + 0.08 * sectorIndex

/** Nyt+ starter på sektor 5's niveau, så rundeskaleringen bliver et skridt op i stedet for et fald. */
export const NEW_PLUS_SECTOR_STEP = SECTOR_COUNT - 1

export const slotScaling = (slot: number): number => 1 + 0.03 * slot

/** Egen seed pr. sektor og runde, så planen ikke afhænger af spillets løbende RNG. */
function sectorSeed(seed: number, sectorIndex: number, round: number): number {
  let h = (seed ^ Math.imul(sectorIndex + 1, 0x9e3779b1) ^ Math.imul(round + 1, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

const pick = <T>(pool: readonly T[], rng: Rng): T => pool[Math.floor(rng() * pool.length)]

/** Trækker uden tilbagelægning; er puljen for lille, genopfyldes den uden at samme id kommer to gange i træk. */
export function drawFormations<T>(pool: readonly T[], count: number, rng: Rng, opener?: T): T[] {
  const picks: T[] = []
  let bag: T[] = []
  for (let i = 0; i < count; i++) {
    if (bag.length === 0) bag = [...pool]
    const last = picks[picks.length - 1]
    const fresh = bag.filter((id) => id !== last)
    const candidates = fresh.length > 0 ? fresh : bag
    const chosen = i === 0 && opener !== undefined && bag.includes(opener) ? opener : pick(candidates, rng)
    bag.splice(bag.indexOf(chosen), 1)
    picks.push(chosen)
  }
  return picks
}

/**
 * Ét valg pr. pulje, så alle muligheder fra puljerne kommer med mindst én gang, når det kan lade sig gøre;
 * blandt de gyldige kombinationer vælges seedet. Puljerne er små (højst ca. 100 kombinationer).
 */
export function coverPick<T>(pools: readonly (readonly T[])[], rng: Rng): T[] {
  const wanted = new Set(pools.flat())
  const valid: T[][] = []
  const walk = (index: number, picks: T[]) => {
    if (index === pools.length) {
      if (new Set(picks).size === wanted.size) valid.push([...picks])
      return
    }
    for (const id of pools[index]) {
      picks.push(id)
      walk(index + 1, picks)
      picks.pop()
    }
  }
  walk(0, [])
  if (valid.length === 0) return pools.map((pool) => pick(pool, rng))
  return valid[Math.floor(rng() * valid.length)]
}

export interface RoundPlan {
  hazards: TemplateId[]
  bonuses: TemplateId[]
}

const roundPlans = new Map<string, RoundPlan>()
const MAX_CACHED_ROUNDS = 64

/** Hazard og bonusbane for hver sektor i en runde, så en hel runde møder alle hazards og alle tre bonusbaner. */
export function planRound(seed: number, round: number): RoundPlan {
  const key = `${seed}:${round}`
  const cached = roundPlans.get(key)
  if (cached) return cached
  const rng = createRng(sectorSeed(seed, 97, round))
  const plan: RoundPlan = {
    hazards: coverPick(SECTORS.map((sector) => sector.hazards), rng),
    bonuses: coverPick(SECTORS.map((sector) => sector.bonuses), rng),
  }
  if (roundPlans.size >= MAX_CACHED_ROUNDS) roundPlans.delete(roundPlans.keys().next().value!)
  roundPlans.set(key, plan)
  return plan
}

/** Skabelon-id for hver af sektorens otte pladser. */
export function planSector(seed: number, sectorIndex: number, round: number): TemplateId[] {
  const def = SECTORS[sectorIndex]
  const rng = createRng(sectorSeed(seed, sectorIndex, round))
  const formations = drawFormations(def.formations, FORMATION_SLOTS_PER_SECTOR, rng, def.opener)
  const specials = planRound(seed, round)
  const hazard = specials.hazards[sectorIndex]
  const bonus = specials.bonuses[sectorIndex]
  let nextFormation = 0
  return SLOT_RHYTHM.map((type) => {
    switch (type) {
      case 'formation':
        return formations[nextFormation++]
      case 'hazard':
        return hazard
      case 'bonus':
        return bonus
      case 'miniboss':
        return def.miniBoss
      case 'boss':
        return def.boss
    }
  })
}

export function campaignWave(wave: number, seed: number): CampaignWave {
  const position = campaignPosition(wave)
  const slotType = SLOT_RHYTHM[position.slot]
  const variety = sectorSeed(seed, wave + 101, 7)
  return {
    wave,
    ...position,
    theme: SECTORS[position.sector].themeId,
    slotType,
    templateId: planSector(seed, position.sector, position.round)[position.slot],
    sectorScaling: sectorScaling(position.sector + NEW_PLUS_SECTOR_STEP * position.round),
    slotScaling: slotScaling(position.slot),
    variety,
    rainbow: slotType === 'formation' && wave > 1 && createRng(variety ^ 0x5bd1e995)() < RAINBOW_CHANCE,
  }
}
