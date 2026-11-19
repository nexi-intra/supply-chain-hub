import type { BossId } from './bosses/core'
import { campaignWave, sectorFlybys, sectorMix, sectorScaling, type CampaignWave, type MixEntry, type SlotType } from './campaign'
import { DIFFICULTY_SETTINGS, type Difficulty } from './config'
import type { EnemyKind, FlybyKind } from './enemies'
import { generateSlots, type Slot } from './formations'
import type { ThemeId } from './themes'
import { getWaveTemplate, MAX_COLS, type TemplateContext, type TemplateId } from './waveTemplates'

export type { Slot }

/** En fri flyver, der kommer forbi `at` sekunder inde i bølgen. */
export interface FlybySpec {
  kind: FlybyKind
  at: number
}

/** 'meteors' er hazard-bølgerne; 'bonus' er de tidsstyrede bonusbaner; 'miniBoss' er sektorens plads 6. */
export type WaveKind = 'formation' | 'divers' | 'meteors' | 'armored' | 'boss' | 'miniBoss' | 'bonus'
export type FormationKind = 'hen' | 'helmet' | 'diver'

export type FormationLayout = 'grid' | 'vShape' | 'ring' | 'diamond' | 'flanks' | 'columns' | 'checker' | 'arrow'
export type FormationMotion = 'sway' | 'rotate' | 'bob' | 'snake' | 'pinball' | 'loopers'
export type FormationEntrance = 'sides' | 'top' | 'spiral' | 'split'
/** 'rows': de øverste `helmetRows` rækker er hjelme. 'checker': hjelm på hvert andet felt som på et skakbræt. */
export type HelmetPattern = 'rows' | 'checker'
export type BossType = BossId

export interface WaveSpec {
  wave: number
  kind: WaveKind
  round: number
  sector: number
  slot: number
  slotType: SlotType
  theme: ThemeId
  templateId: TemplateId
  rows: number
  cols: number
  helmetRows: number
  helmetPattern: HelmetPattern
  diverRows: number
  enemySpeed: number
  descentStep: number
  eggRate: number
  eggSpeed: number
  diveRate: number
  meteorCount: number
  goldenFlyby: boolean
  bossLevel: number
  layout: FormationLayout
  motion: FormationMotion
  entrance: FormationEntrance
  hazard?: TemplateId
  bonus?: TemplateId
  miniBoss?: TemplateId
  bossType?: BossType
  /** 1 = Ild-trioen eller Kyllingekrydseren MK II. */
  bossVariant?: number
  /** De nye kyllinger, der erstatter almindelige høns i formationen. */
  enemyMix: MixEntry[]
  flybys: FlybySpec[]
  /** Seedet tal, der placerer kyllingerne i formationen. */
  variety: number
}
export function waveKind(wave: number, seed = 0): WaveKind {
  return getWaveTemplate(campaignWave(wave, seed).templateId).kind
}

export function buildSpecFromWave(campaign: CampaignWave, difficulty: Difficulty): WaveSpec {
  const settings = DIFFICULTY_SETTINGS[difficulty]
  const template = getWaveTemplate(campaign.templateId)
  const { round, sector, slot, slotType, templateId } = campaign
  const roundScaling = 1 + 0.15 * round
  const factor = campaign.sectorScaling * campaign.slotScaling
  // Farten stiger kun halvt så meget som æggene, så de sene mønstre stadig kan læses.
  const gentle = 1 + (factor - 1) / 2
  const context: TemplateContext = {
    settings,
    round,
    sector,
    slot,
    difficulty: factor,
    density: sectorScaling(sector) * campaign.slotScaling,
    roundScaling,
    cols: Math.min(7 + round, MAX_COLS),
    rowBonus: Math.floor(sector / 2),
    backgroundDives: round >= 1 ? settings.diveRate * 0.5 * roundScaling * factor : 0,
  }
  // Den allerførste bølge er ren; derefter får formationsbølger og mini-bossen sektorens kyllinger.
  const mixed = (slotType === 'formation' || slotType === 'miniboss') && campaign.wave > 1
  const built = template.build(context)
  const flybys = built.flybys ?? (mixed ? planFlybys(sectorFlybys(sector, round), sector, round) : [])
  if (campaign.rainbow) flybys.push({ kind: 'rainbow', at: 10 })

  return {
    wave: campaign.wave,
    kind: template.kind,
    round,
    sector,
    slot,
    slotType,
    theme: campaign.theme,
    templateId,
    rows: 0,
    cols: 0,
    helmetRows: 0,
    helmetPattern: 'rows',
    diverRows: 0,
    enemySpeed: settings.enemySpeed * roundScaling * gentle,
    descentStep: settings.descentStep,
    eggRate: settings.eggRate * (1 + 0.2 * round) * factor,
    eggSpeed: settings.eggSpeed * (1 + 0.08 * round) * gentle,
    diveRate: 0,
    meteorCount: 0,
    goldenFlyby: false,
    bossLevel: 0,
    layout: 'grid',
    motion: 'sway',
    entrance: 'sides',
    hazard: slotType === 'hazard' ? templateId : undefined,
    bonus: slotType === 'bonus' ? templateId : undefined,
    miniBoss: slotType === 'miniboss' ? templateId : undefined,
    enemyMix: mixed ? sectorMix(sector, round) : [],
    variety: campaign.variety,
    ...built,
    flybys: [...flybys],
  }
}

function planFlybys(kinds: FlybyKind[], sector: number, round: number): FlybySpec[] {
  const flybys: FlybySpec[] = []
  for (const kind of kinds) {
    if (kind === 'ninja') {
      flybys.push({ kind, at: 4.5 })
      if (sector >= 3 || round >= 1) flybys.push({ kind, at: 13 })
    } else {
      flybys.push({ kind, at: 7.5 })
    }
  }
  return flybys
}

export function buildWaveSpec(wave: number, difficulty: Difficulty, seed = 0): WaveSpec {
  return buildSpecFromWave(campaignWave(wave, seed), difficulty)
}

export function formationSlots(spec: WaveSpec, fieldWidth: number): Slot[] {
  return generateSlots(spec, fieldWidth)
}

type KindSpec = Pick<WaveSpec, 'rows' | 'helmetRows' | 'diverRows'> & { helmetPattern?: HelmetPattern }

export function slotKind(spec: KindSpec, row: number, col = 0): FormationKind {
  if (spec.helmetPattern === 'checker') {
    if (row >= spec.rows - spec.diverRows) return 'diver'
    return (row + col) % 2 === 0 ? 'helmet' : 'hen'
  }
  if (row < spec.helmetRows) return 'helmet'
  if (row >= spec.rows - spec.diverRows) return 'diver'
  return 'hen'
}

/** Tal i [0, 1) ud fra bølgens seed, slottet og blandingslinjen. */
function hash01(variety: number, index: number, salt: number): number {
  let h = (variety ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32
}

const SPECIAL_CAP = 0.35

/**
 * Typen for hvert slot: hjelme og dykkere står hvor de plejer, og bølgens blanding gør nogle af de almindelige
 * høns til nye kyllinger. Garanterede antal (`min`) lægges først, så tilfældige op til loftet.
 */
export function assignKinds(spec: WaveSpec, slots: readonly Slot[]): EnemyKind[] {
  const kinds: EnemyKind[] = slots.map((slot) => slotKind(spec, slot.row, slot.col))
  const mix = spec.enemyMix
  if (mix.length === 0) return kinds
  let front = -Infinity
  let back = Infinity
  slots.forEach((slot, index) => {
    if (kinds[index] === 'diver') return
    front = Math.max(front, slot.row)
    back = Math.min(back, slot.row)
  })
  const fits = (entry: MixEntry, index: number) =>
    kinds[index] === 'hen' && (entry.place === 'front' ? slots[index].row === front : entry.place === 'back' ? slots[index].row === back : true)
  const counts = new Map<EnemyKind, number>()
  const place = (index: number, entry: MixEntry) => {
    kinds[index] = entry.kind
    counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1)
  }
  mix.forEach((entry, salt) => {
    if (!entry.min) return
    const candidates = slots.map((_, index) => index).filter((index) => fits(entry, index))
    candidates.sort((a, b) => hash01(spec.variety, a, salt + 50) - hash01(spec.variety, b, salt + 50))
    for (const index of candidates.slice(0, entry.min)) place(index, entry)
  })
  const cap = Math.floor(slots.length * (SPECIAL_CAP + 0.05 * Math.min(spec.round, 2)))
  let total = [...counts.values()].reduce((sum, count) => sum + count, 0)
  for (let index = 0; index < slots.length && total < cap; index++) {
    for (let salt = 0; salt < mix.length; salt++) {
      const entry = mix[salt]
      if (!fits(entry, index) || (counts.get(entry.kind) ?? 0) >= (entry.max ?? Infinity)) continue
      if (hash01(spec.variety, index, salt) >= entry.share) continue
      place(index, entry)
      total++
      break
    }
  }
  return kinds
}
