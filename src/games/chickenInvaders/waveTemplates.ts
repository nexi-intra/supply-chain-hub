import { SECTOR_COUNT } from './campaign'
import type { BossId } from './bosses/core'
import type { DifficultySettings } from './config'
import { MAX_ENEMIES } from './formations'
import type { FlybySpec, WaveKind, WaveSpec } from './waves'

export const MAX_ROWS = 6
export const MAX_COLS = 10

export type TemplateId =
  | 'classic'
  | 'divers'
  | 'armored'
  | 'meteorShower'
  | 'goldRush'
  | 'asteroidBelt'
  | 'cometStorm'
  | 'blackHole'
  | 'drumstickRain'
  | 'shootingGallery'
  | 'eggDodge'
  | 'motherHen'
  | 'vSquadron'
  | 'carousel'
  | 'conga'
  | 'pinballFlock'
  | 'diamondDance'
  | 'loopSquad'
  | 'twinFlanks'
  | 'checkerWall'
  | 'columnDrop'
  | 'arrowhead'
  | 'sniperNest'
  | 'medicSquad'
  | 'turkeyRaid'
  | 'ufoAmbush'
  | 'eggeroid'
  | 'iceQueen'
  | 'roboRooster'
  | 'galacticRooster'
  | 'eggTrio'
  | 'eggTrioFire'
  | 'chickenCruiser'
  | 'chickenCruiserMk2'
  | 'ufoMothership'

export interface TemplateContext {
  settings: DifficultySettings
  round: number
  sector: number
  slot: number
  /** Sektor- og pladsskalering samlet; ovenpå rundeskaleringen. */
  difficulty: number
  /** Som `difficulty`, men uden Nyt+-grundniveauet: hazard-tætheden, så Nyt+ bliver hurtigere frem for tættere. */
  density: number
  /** Rundeskalering af fart (1 + 0,15 pr. runde). */
  roundScaling: number
  cols: number
  /** Ekstra rækker i de senere sektorer. */
  rowBonus: number
  /** Dyk fra baggrunden i formationsbølger, når runden er over første. */
  backgroundDives: number
}

/** `build` leverer kun de felter skabelonen bestemmer; resten får standardværdier i `buildSpecFromWave`. */
export interface WaveTemplate {
  id: TemplateId
  kind: WaveKind
  build: (ctx: TemplateContext) => Partial<WaveSpec>
}

const formationRows = (ctx: TemplateContext, base: number) => Math.min(base + ctx.round + ctx.rowBonus, MAX_ROWS)

const classic: WaveTemplate = {
  id: 'classic',
  kind: 'formation',
  build: (ctx) => ({ rows: formationRows(ctx, 3), cols: ctx.cols, diverRows: ctx.round >= 1 ? 1 : 0, diveRate: ctx.backgroundDives }),
}

const divers: WaveTemplate = {
  id: 'divers',
  kind: 'divers',
  build: (ctx) => {
    const rows = formationRows(ctx, 3)
    return {
      rows,
      cols: ctx.cols,
      diverRows: Math.min(2 + Math.floor(ctx.round / 2), rows),
      diveRate: ctx.settings.diveRate * ctx.roundScaling * ctx.difficulty,
    }
  },
}

const armored: WaveTemplate = {
  id: 'armored',
  kind: 'armored',
  build: (ctx) => {
    const rows = formationRows(ctx, 4)
    return {
      rows,
      cols: ctx.cols,
      helmetRows: Math.min(2 + ctx.round, rows - 1),
      diverRows: ctx.round >= 1 ? 1 : 0,
      diveRate: ctx.backgroundDives,
      goldenFlyby: true,
    }
  },
}

/** Ninjaer kommer forbi i de sene sektorers hazard-bølger og i Nyt+. */
function hazardFlybys(ctx: TemplateContext): FlybySpec[] | undefined {
  if (ctx.sector < 3 && ctx.round < 1) return undefined
  const flybys: FlybySpec[] = [{ kind: 'ninja', at: 6.5 }]
  if (ctx.sector >= 4 || ctx.round >= 1) flybys.push({ kind: 'ninja', at: 13 })
  return flybys
}

/** Hazard-bølgerne har ingen formation; `meteorCount` er tætheden, som hazards.ts planlægger ud fra. Den allerførste er en blid introduktion. */
const FIRST_HAZARD_DENSITY = 0.7
const hazard = (id: TemplateId, base: number, perRound: number): WaveTemplate => ({
  id,
  kind: 'meteors',
  build: (ctx) => ({
    meteorCount: Math.round((base + perRound * ctx.round) * ctx.density * (ctx.sector === 0 && ctx.round === 0 ? FIRST_HAZARD_DENSITY : 1)),
    flybys: hazardFlybys(ctx),
  }),
})

const meteorShower = hazard('meteorShower', 14, 4)
const goldRush = hazard('goldRush', 16, 4)
/** Tætheden deles i pulser af baner (ca. én pr. 3). */
const asteroidBelt = hazard('asteroidBelt', 15, 4)
const cometStorm = hazard('cometStorm', 10, 3)
const blackHole = hazard('blackHole', 12, 3)

/** Bonusbanerne styres af bonusStages.ts og en timer; ingen formation. */
const bonusStage = (id: TemplateId): WaveTemplate => ({ id, kind: 'bonus', build: () => ({}) })

const drumstickRain = bonusStage('drumstickRain')
const shootingGallery = bonusStage('shootingGallery')
const eggDodge = bonusStage('eggDodge')

/** Boss- og mini-boss-bølger har ingen formation og ingen tilfældige flyvere; bossen styres af bosses/. */
const bossWave = (id: TemplateId, bossType: BossId, kind: WaveKind = 'boss', variant = 0): WaveTemplate => ({
  id,
  kind,
  build: (ctx) => ({ bossLevel: ctx.round * SECTOR_COUNT + ctx.sector + 1, bossType, ...(variant > 0 ? { bossVariant: variant } : {}), flybys: [] }),
})

const motherHen = bossWave('motherHen', 'motherHen')
const eggeroid = bossWave('eggeroid', 'eggeroid')
const iceQueen = bossWave('iceQueen', 'iceQueen')
const roboRooster = bossWave('roboRooster', 'roboRooster')
const galacticRooster = bossWave('galacticRooster', 'galacticRooster')
const eggTrio = bossWave('eggTrio', 'eggTrio', 'miniBoss')
const eggTrioFire = bossWave('eggTrioFire', 'eggTrio', 'miniBoss', 1)
const chickenCruiser = bossWave('chickenCruiser', 'chickenCruiser', 'miniBoss')
const chickenCruiserMk2 = bossWave('chickenCruiserMk2', 'chickenCruiser', 'miniBoss', 1)
const ufoMothership = bossWave('ufoMothership', 'ufoMothership', 'miniBoss')

const rowsAtLeast = (ctx: TemplateContext, base: number, min: number) => Math.max(min, formationRows(ctx, base))
const laterOrNewPlus = (ctx: TemplateContext) => ctx.sector >= 2 || ctx.round >= 1
const diveEvery = (ctx: TemplateContext) => ctx.settings.diveRate * ctx.roundScaling * ctx.difficulty

/** V med spidsen nedad, der flyver ind fra begge sider på én gang. */
const vSquadron: WaveTemplate = {
  id: 'vSquadron',
  kind: 'formation',
  build: (ctx) => ({
    rows: rowsAtLeast(ctx, 4, 4),
    cols: ctx.cols,
    layout: 'vShape',
    motion: 'sway',
    entrance: 'split',
    diverRows: ctx.round >= 1 ? 1 : 0,
    diveRate: ctx.backgroundDives,
  }),
}

/** Roterende ringe; `rows` er antallet af ringe. */
const carousel: WaveTemplate = {
  id: 'carousel',
  kind: 'formation',
  build: (ctx) => ({
    rows: laterOrNewPlus(ctx) ? 3 : 2,
    cols: ctx.cols,
    layout: 'ring',
    motion: 'rotate',
    entrance: 'spiral',
    diverRows: ctx.round >= 1 ? 1 : 0,
    diveRate: ctx.backgroundDives,
  }),
}

/** Kæder af høns på en lukket sløjfe; `rows` og `cols` styrer kædelængde og antal kæder. */
const conga: WaveTemplate = {
  id: 'conga',
  kind: 'formation',
  build: (ctx) => ({
    rows: rowsAtLeast(ctx, 4, 4),
    cols: ctx.cols,
    layout: 'grid',
    motion: 'snake',
    entrance: 'sides',
    helmetRows: ctx.round >= 1 ? 1 : 0,
  }),
}

const pinballFlock: WaveTemplate = {
  id: 'pinballFlock',
  kind: 'formation',
  build: (ctx) => ({
    rows: rowsAtLeast(ctx, 4, 4),
    cols: ctx.cols,
    layout: 'checker',
    motion: 'pinball',
    entrance: 'top',
    helmetRows: ctx.round >= 1 ? 1 : 0,
  }),
}

const diamondDance: WaveTemplate = {
  id: 'diamondDance',
  kind: 'formation',
  build: (ctx) => ({
    rows: laterOrNewPlus(ctx) ? 5 : 4,
    cols: ctx.cols,
    layout: 'diamond',
    motion: 'rotate',
    entrance: 'sides',
    diverRows: ctx.round >= 1 ? 1 : 0,
    diveRate: ctx.backgroundDives,
  }),
}

/** Grupper på tre laver Galaga-loops; `diveRate` styrer hvor ofte en gruppe dykker. */
const loopSquad: WaveTemplate = {
  id: 'loopSquad',
  kind: 'divers',
  build: (ctx) => ({
    rows: Math.min(formationRows(ctx, 3), 5),
    cols: Math.min(ctx.cols, 8),
    layout: 'grid',
    motion: 'loopers',
    entrance: 'sides',
    diveRate: diveEvery(ctx),
  }),
}

const twinFlanks: WaveTemplate = {
  id: 'twinFlanks',
  kind: 'formation',
  build: (ctx) => ({
    rows: rowsAtLeast(ctx, 3, 4),
    cols: ctx.cols,
    layout: 'flanks',
    motion: 'bob',
    entrance: 'split',
    diverRows: ctx.round >= 1 ? 1 : 0,
    diveRate: ctx.backgroundDives,
  }),
}

/** Fuldt gitter med hjelme som sorte felter på et skakbræt; rækkerne begrænses, så muren holder sig under loftet. */
const checkerWall: WaveTemplate = {
  id: 'checkerWall',
  kind: 'armored',
  build: (ctx) => ({
    rows: Math.min(formationRows(ctx, 4), Math.floor(MAX_ENEMIES / ctx.cols)),
    cols: ctx.cols,
    layout: 'grid',
    motion: 'sway',
    entrance: 'sides',
    helmetPattern: 'checker',
    diverRows: ctx.round >= 1 ? 1 : 0,
    diveRate: ctx.backgroundDives,
    goldenFlyby: true,
  }),
}

const columnDrop: WaveTemplate = {
  id: 'columnDrop',
  kind: 'formation',
  build: (ctx) => ({
    rows: rowsAtLeast(ctx, 3, 4),
    cols: ctx.cols,
    layout: 'columns',
    motion: 'bob',
    entrance: 'top',
    diverRows: ctx.round >= 1 ? 1 : 0,
    diveRate: ctx.backgroundDives,
  }),
}

const arrowhead: WaveTemplate = {
  id: 'arrowhead',
  kind: 'divers',
  build: (ctx) => ({
    rows: rowsAtLeast(ctx, 4, 5),
    cols: ctx.cols,
    layout: 'arrow',
    motion: 'sway',
    entrance: 'spiral',
    diverRows: Math.min(2 + Math.floor(ctx.round / 2), 3),
    diveRate: diveEvery(ctx),
  }),
}

/** Hele forreste række er snigskytter med sigtede æg; de bobber, så de er sværere at ramme. */
const sniperNest: WaveTemplate = {
  id: 'sniperNest',
  kind: 'formation',
  build: (ctx) => ({
    rows: rowsAtLeast(ctx, 3, 4),
    cols: ctx.cols,
    layout: 'grid',
    motion: 'bob',
    entrance: 'top',
    diveRate: ctx.backgroundDives,
    enemyMix: [
      { kind: 'sniper', share: 0.6, place: 'front', min: 3, max: 6 },
      { kind: 'balloon', share: 0.1 },
    ],
  }),
}

/** To flanker med hjelme øverst, skjoldhøns og sygeplejersker, der lapper dem sammen. */
const medicSquad: WaveTemplate = {
  id: 'medicSquad',
  kind: 'formation',
  build: (ctx) => ({
    rows: rowsAtLeast(ctx, 3, 4),
    cols: ctx.cols,
    layout: 'flanks',
    motion: 'bob',
    entrance: 'split',
    helmetRows: 1,
    diveRate: ctx.backgroundDives,
    enemyMix: [
      { kind: 'medic', share: 0.15, min: 2, max: 4 },
      { kind: 'shield', share: 0.3, min: 2 },
    ],
  }),
}

/** V med kalkuner i spidsen og bombehøns på vingerne. */
const turkeyRaid: WaveTemplate = {
  id: 'turkeyRaid',
  kind: 'formation',
  build: (ctx) => ({
    rows: rowsAtLeast(ctx, 4, 4),
    cols: ctx.cols,
    layout: 'vShape',
    motion: 'sway',
    entrance: 'split',
    diverRows: ctx.round >= 1 ? 1 : 0,
    diveRate: ctx.backgroundDives,
    enemyMix: [
      { kind: 'turkey', share: 0.5, place: 'front', min: 2, max: 5 },
      { kind: 'bomber', share: 0.3, place: 'back', min: 1, max: 3 },
      { kind: 'balloon', share: 0.08 },
    ],
  }),
}

/** En skjoldmur, mens UFO'er og en ninja kommer forbi og prøver at stjæle våbnet. */
const ufoAmbush: WaveTemplate = {
  id: 'ufoAmbush',
  kind: 'formation',
  build: (ctx) => ({
    rows: formationRows(ctx, 3),
    cols: ctx.cols,
    layout: 'grid',
    motion: 'sway',
    entrance: 'sides',
    helmetRows: 1,
    diveRate: ctx.backgroundDives,
    enemyMix: [
      { kind: 'shield', share: 0.2 },
      { kind: 'sniper', share: 0.25, place: 'front', max: 3 },
    ],
    flybys: [
      { kind: 'ufo', at: 3 },
      { kind: 'ninja', at: 8 },
      { kind: 'ufo', at: 15 },
    ],
  }),
}

/** Nye bølgetyper tilføjes her og i sektorernes puljer i `campaign.ts`. */
export const WAVE_TEMPLATES: Record<TemplateId, WaveTemplate> = {
  classic,
  divers,
  armored,
  meteorShower,
  goldRush,
  asteroidBelt,
  cometStorm,
  blackHole,
  drumstickRain,
  shootingGallery,
  eggDodge,
  motherHen,
  vSquadron,
  carousel,
  conga,
  pinballFlock,
  diamondDance,
  loopSquad,
  twinFlanks,
  checkerWall,
  columnDrop,
  arrowhead,
  sniperNest,
  medicSquad,
  turkeyRaid,
  ufoAmbush,
  eggeroid,
  iceQueen,
  roboRooster,
  galacticRooster,
  eggTrio,
  eggTrioFire,
  chickenCruiser,
  chickenCruiserMk2,
  ufoMothership,
}

export function getWaveTemplate(id: TemplateId): WaveTemplate {
  const template = WAVE_TEMPLATES[id]
  if (!template) throw new Error(`Ukendt bølgeskabelon: ${id}`)
  return template
}
