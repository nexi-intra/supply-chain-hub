// The Christmas theme switches itself on on 1 December and off after New Year. It is a surprise:
// nothing about it may appear in the changelog or anywhere users can see before it starts.

export type ChristmasPhase = 'advent' | 'eve' | 'christmas' | 'newyear'
export interface ChristmasDay { month: 12 | 1; day: number; daysToEve: number; phase: ChristmasPhase }

export function christmasDay(date: Date): ChristmasDay | null {
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (month === 1 && day === 1) return { month: 1, day: 1, daysToEve: 0, phase: 'newyear' }
  if (month !== 12) return null
  const phase: ChristmasPhase = day < 24 ? 'advent' : day === 24 ? 'eve' : day < 31 ? 'christmas' : 'newyear'
  return { month: 12, day, daysToEve: Math.max(0, 24 - day), phase }
}

/** Set to a date (YYYY-MM-DD) in DevTools to see the theme before December. Only the creator can open DevTools. */
export const CHRISTMAS_PREVIEW_KEY = 'tcd-hub:christmas-preview'

export function christmasDate(now: Date, preview: string | null): Date {
  const match = preview?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return now
  return new Date(+match[1], +match[2] - 1, +match[3], now.getHours(), now.getMinutes(), now.getSeconds())
}

export type ChristmasMode = 'full' | 'calm' | 'off'
const FULL_VIEWS = new Set(['hub', 'auth', 'picker'])

/** Front pages get everything, work screens get still decoration, games get none. */
export function christmasMode(view: string): ChristmasMode {
  if (view === 'games') return 'off'
  return FULL_VIEWS.has(view) ? 'full' : 'calm'
}

// ---- The string of lights -------------------------------------------------------------------------------
// The wire hangs from hooks and sags like a parabola between them. Each bulb's socket is placed on that exact
// curve, so the lights are always fastened to the wire, never floating next to it.

export interface GarlandOptions { period?: number; top?: number; sag?: number; perPeriod?: number }
export interface GarlandBulb { x: number; y: number; tilt: number; color: string }

const BULB_COLORS = ['#ff4d42', '#ffc94a', '#3fd27a', '#4aa8ff']

export function wireY(x: number, { period = 150, top = 8, sag = 14 }: GarlandOptions = {}): number {
  const u = (((x % period) + period) % period) / period
  return top + 4 * sag * u * (1 - u)
}

export function garland(width: number, options: GarlandOptions = {}) {
  const { period = 150, top = 8, sag = 14, perPeriod = 5 } = options
  const spans = Math.max(1, Math.ceil(width / period))
  const hooks = Array.from({ length: spans + 1 }, (_, i) => i * period)
  let path = `M0 ${top}`
  const bulbs: GarlandBulb[] = []
  for (let span = 0; span < spans; span++) {
    const x0 = span * period
    path += ` Q${x0 + period / 2} ${top + 2 * sag} ${x0 + period} ${top}`
    for (let j = 0; j < perPeriod; j++) {
      const u = (j + 0.5) / perPeriod
      const x = x0 + u * period
      const slope = (4 * sag * (1 - 2 * u)) / period
      const index = span * perPeriod + j
      const tilt = (Math.atan(slope) * 180) / Math.PI * 0.4 + (index % 2 === 0 ? 7 : -7)
      bulbs.push({ x, y: wireY(x, options), tilt, color: BULB_COLORS[index % BULB_COLORS.length] })
    }
  }
  return { path, hooks, bulbs }
}

// ---- Snow lying on a card ------------------------------------------------------------------------------------

function random(seed: number) {
  let state = (seed * 2654435761) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A puffy cap of snow, `width`×40, drawn at real size: rounded ends over the corners, soft mounds and icicles. */
export function snowCapPath(seed: number, width = 400): string {
  const rnd = random(seed)
  const right = width - 4
  const mounds = Math.max(4, Math.round(width / (75 + rnd() * 30)))
  const step = (width - 28) / mounds
  let d = 'M4 28 C0 21 4 13 14 12'
  for (let i = 0; i < mounds; i++) {
    const x0 = 14 + i * step
    const x1 = x0 + step
    const peak = 2 + rnd() * 7
    d += ` C${(x0 + step * 0.25).toFixed(1)} ${peak.toFixed(1)} ${(x1 - step * 0.25).toFixed(1)} ${peak.toFixed(1)} ${x1.toFixed(1)} ${(10 + rnd() * 4).toFixed(1)}`
  }
  d += ` C${right} 13 ${width} 21 ${right} 28`
  // Icicles only on the left two thirds: badges sit in the top-right corner of a card.
  const count = Math.max(3, Math.round(width / 170))
  const span = width * 0.66 - 30
  const icicles = Array.from({ length: count }, (_, i) => 30 + (span * (i + 0.2 + rnd() * 0.6)) / count).sort((a, b) => b - a)
  let x = right
  for (const tip of icicles) {
    const length = 34 + rnd() * 5
    d += ` C${(x - 12).toFixed(1)} 29 ${(tip + 16).toFixed(1)} 27 ${(tip + 4).toFixed(1)} 28 L${tip.toFixed(1)} ${length.toFixed(1)} L${(tip - 4).toFixed(1)} 28`
    x = tip - 4
  }
  return `${d} C${(x - 30).toFixed(1)} 30 20 30 4 28 Z`
}

/** Snow along the top edge of the window, drawn at real size (not stretched) so icicles keep their shape. */
export function snowRidgePath(width: number, seed = 1): string {
  const rnd = random(seed)
  let d = `M0 0 L${width} 0 L${width} 9`
  let x = width
  while (x > 0) {
    const next = Math.max(0, x - (60 + rnd() * 100))
    const icicle = next > 12 && x - next > 40
    const mid = (x + next) / 2
    d += ` C${(x - (x - next) * 0.3).toFixed(1)} ${(8 + rnd() * 6).toFixed(1)} ${(next + (x - next) * 0.3).toFixed(1)} ${(8 + rnd() * 6).toFixed(1)} ${(mid + 3).toFixed(1)} 11`
    if (icicle) d += ` L${mid.toFixed(1)} ${(19 + rnd() * 6).toFixed(1)} L${(mid - 3).toFixed(1)} 11`
    else d += ` L${(mid - 3).toFixed(1)} 11`
    d += ` C${(mid - 10).toFixed(1)} ${(9 + rnd() * 4).toFixed(1)} ${(next + 6).toFixed(1)} ${(9 + rnd() * 4).toFixed(1)} ${next.toFixed(1)} 10`
    x = next
  }
  return `${d} L0 0 Z`
}

/** CSS hangs the decorations off <html data-christmas="full|calm">; no attribute means no Christmas. */
export function applyChristmasAttribute(root: { dataset: DOMStringMap }, mode: ChristmasMode | null) {
  if (mode && mode !== 'off') root.dataset.christmas = mode
  else delete root.dataset.christmas
}

// ---- Hanging decorations (classic Danish) ------------------------------------------------------------------

export const ORNAMENT_KINDS = ['bauble', 'heart', 'star', 'cone', 'pinecone', 'drum', 'nisse', 'straw'] as const
export type OrnamentKind = typeof ORNAMENT_KINDS[number]
export interface Ornament { kind: OrnamentKind; color: string }

const BAUBLE_COLORS = ['#c8352d', '#1f6b43', '#d9a63c', '#2d5fa8', '#b9c3cf', '#7a3fa0', '#d4557a']
const STAR_COLORS = ['#e3b54f', '#f4efe2', '#c8352d']

function ornamentAt(rnd: () => number): Ornament {
  // Baubles are the most common, like on a real tree; the paper and straw classics are mixed in between.
  const roll = rnd()
  const kind: OrnamentKind = roll < 0.34 ? 'bauble' : ORNAMENT_KINDS[1 + Math.floor(rnd() * (ORNAMENT_KINDS.length - 1))]
  const palette = kind === 'bauble' ? BAUBLE_COLORS : kind === 'star' ? STAR_COLORS : ['#c8352d']
  return { kind, color: palette[Math.floor(rnd() * palette.length)] }
}

/** About two in five cards get something hanging from their snow. */
export function cardOrnament(seed: number): Ornament | null {
  const rnd = random(seed + 101)
  return rnd() < 0.42 ? ornamentAt(rnd) : null
}

export const FLAG_OPTIONS = { period: 190, top: 20, sag: 22, perPeriod: 7 }

/** A Dannebrog string ("flagranke") hung below the lights: every flag sits on the wire, tilted with it. */
export function flagString(width: number, options = FLAG_OPTIONS) {
  const { path, bulbs } = garland(width, options)
  const flags = bulbs.map(({ x, y }) => {
    const u = (((x % options.period) + options.period) % options.period) / options.period
    const slope = (4 * options.sag * (1 - 2 * u)) / options.period
    return { x, y, angle: (Math.atan(slope) * 180) / Math.PI }
  })
  return { path, flags, options }
}

export interface StringOrnament extends Ornament { x: number; y: number; thread: number }

/** Decorations tied to the light string: one at the low point of every second span, on threads of varying length. */
export function stringOrnaments(width: number, options: Required<GarlandOptions>): StringOrnament[] {
  const rnd = random(31)
  const items: StringOrnament[] = []
  for (let span = 0; span * options.period < width; span++) {
    if (span % 2 === 1) continue
    const x = span * options.period + options.period * (rnd() < 0.5 ? 0.4 : 0.6)
    items.push({ x, y: wireY(x, options), thread: 14 + Math.round(rnd() * 26), ...ornamentAt(rnd) })
  }
  return items
}
// ---- Advent calendar -----------------------------------------------------------------------------------------

const DOORS_DA = [
  'Velkommen til december! Hubben har fundet julepynten frem. Bliver det for meget, kan du slå den fra under Lys/Mørk.',
  'Dagens opgave: Giv en kollega en high-five – der er jo snart jul.',
  'Husk at drikke vand mellem al gløggen og pebernødderne.',
  'Nissen har talt alle terminalerne. To gange. De passer.',
  'Er det for tidligt at spille julemusik? Nej.',
  'Dagens hygge-tip: Sæt kaffe over til hele holdet.',
  'Nissen siger tak, fordi du holder styr på lageret.',
  'Dagens udfordring: Sig glædelig jul på finsk – "Hyvää joulua!"',
  'Glædelig jul hedder "God jul!" på svensk. Det var nemt.',
  'Pakkerne under træet skal også have en placering. Nissen bruger Placeringer.',
  'Husk at holde pause – Spil Hjørnet har åbent hele julen.',
  'Halvvejs til juleaften! Nu må der godt hentes klejner.',
  'Dagens tip: Skriv dine ferieønsker i Kalenderen, før de andre når det.',
  'Nissen har tjekket listen to gange. Du står på den gode side.',
  'Sneen på kortene er helt gratis – og den smelter ikke på lageret.',
  'Dagens udfordring: Find én ting, der kan gøres lettere, og skriv den i Forbedringer.',
  'En terminal, en scanner og en kop gløgg. Sådan ser december ud.',
  'Om en uge er det juleaften. Har du styr på gaverne?',
  'Dagens hygge-tip: Tag en julesnak ved kaffemaskinen.',
  'Nissen har sagt, at der ikke må tælles forkert før jul. Bare så du ved det.',
  'Vintersolhverv er lige omkring nu – herfra bliver dagene længere igen.',
  'Kun to dage til juleaften!',
  'Det er lillejuleaften. I morgen er det jul!',
  'Glædelig jul fra hele hubben! Tak for et godt år – nyd julen.',
]

const DOORS_EN = [
  'Welcome to December! The hub has found the Christmas decorations. If it gets too much, switch them off under Light/Dark.',
  "Today's task: Give a colleague a high-five – Christmas is coming.",
  'Remember to drink some water between all the mulled wine and gingerbread.',
  'The elf has counted all the terminals. Twice. They match.',
  'Is it too early for Christmas music? No.',
  "Today's cosy tip: Put the coffee on for the whole team.",
  'The elf says thank you for keeping the warehouse in order.',
  'Today\'s challenge: Say merry Christmas in Finnish – "Hyvää joulua!"',
  'Merry Christmas is "God jul!" in Swedish. That was easy.',
  'The presents under the tree need a location too. The elf uses Locations.',
  'Remember your breaks – the Game Corner is open all Christmas.',
  'Halfway to Christmas Eve! Time for some Christmas biscuits.',
  "Today's tip: Put your holiday wishes in the Calendar before everyone else does.",
  "The elf has checked the list twice. You're on the nice side.",
  "The snow on the cards is free – and it won't melt in the warehouse.",
  "Today's challenge: Find one thing that could be easier and add it to Improvements.",
  'A terminal, a scanner and a cup of mulled wine. That is December.',
  'Christmas Eve is a week away. Got the presents sorted?',
  "Today's cosy tip: Have a Christmas chat by the coffee machine.",
  "The elf says nothing may be miscounted before Christmas. Just so you know.",
  'The winter solstice is right about now – the days get longer from here.',
  'Only two days to Christmas Eve!',
  "It's the day before Christmas Eve. Tomorrow it's Christmas!",
  'Merry Christmas from the whole hub! Thank you for a great year – enjoy the holidays.',
]

export function doorMessage(day: number, language: string): string {
  const doors = language === 'da' ? DOORS_DA : DOORS_EN
  return doors[day - 1] ?? ''
}

const OPENED_DOORS_KEY = 'tcd-hub:christmas-doors'

/** Opened doors are remembered on this PC only – the shared drive is not touched for decoration. */
export function openedDoors(storage: Pick<Storage, 'getItem'> = localStorage, year = new Date().getFullYear()): number[] {
  try {
    const saved = JSON.parse(storage.getItem(OPENED_DOORS_KEY) || '{}') as Record<string, number[]>
    return Array.isArray(saved[year]) ? saved[year] : []
  } catch {
    return []
  }
}

export function rememberOpenedDoor(day: number, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage, year = new Date().getFullYear()) {
  const doors = openedDoors(storage, year)
  if (doors.includes(day)) return
  storage.setItem(OPENED_DOORS_KEY, JSON.stringify({ [year]: [...doors, day] }))
}

// ---- Words -------------------------------------------------------------------------------------------------

interface ChristmasLabels {
  toggle: string
  daysToEve: (days: number) => string
  eve: string
  christmas: string
  newYear: string
  door: string
  doorHint: string
  doorTitle: (day: number) => string
  close: string
  greeting: (hour: number) => string
}

const LABELS: Record<string, ChristmasLabels> = {
  da: {
    toggle: 'Juletema',
    daysToEve: days => (days === 1 ? '1 dag til juleaften' : `${days} dage til juleaften`),
    eve: 'Glædelig jul – det er juleaften!', christmas: 'Glædelig jul', newYear: 'Godt nytår',
    door: 'Dagens låge', doorHint: 'Klik og se, hvad nissen har lagt', doorTitle: day => `Låge ${day}`, close: 'Luk',
    greeting: hour => (hour < 10 ? 'God morgen' : hour < 17 ? 'God eftermiddag' : 'God aften'),
  },
  en: {
    toggle: 'Christmas theme',
    daysToEve: days => (days === 1 ? '1 day to Christmas Eve' : `${days} days to Christmas Eve`),
    eve: "Merry Christmas – it's Christmas Eve!", christmas: 'Merry Christmas', newYear: 'Happy New Year',
    door: "Today's door", doorHint: 'Click to see what the elf left', doorTitle: day => `Door ${day}`, close: 'Close',
    greeting: hour => (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'),
  },
  fi: {
    toggle: 'Jouluteema',
    daysToEve: days => (days === 1 ? '1 päivä jouluaattoon' : `${days} päivää jouluaattoon`),
    eve: 'Hyvää joulua – nyt on jouluaatto!', christmas: 'Hyvää joulua', newYear: 'Hyvää uutta vuotta',
    door: 'Päivän luukku', doorHint: 'Katso, mitä tonttu jätti', doorTitle: day => `Luukku ${day}`, close: 'Sulje',
    greeting: hour => (hour < 10 ? 'Hyvää huomenta' : hour < 17 ? 'Hyvää iltapäivää' : 'Hyvää iltaa'),
  },
  sv: {
    toggle: 'Jultema',
    daysToEve: days => (days === 1 ? '1 dag till julafton' : `${days} dagar till julafton`),
    eve: 'God jul – det är julafton!', christmas: 'God jul', newYear: 'Gott nytt år',
    door: 'Dagens lucka', doorHint: 'Se vad tomten har lämnat', doorTitle: day => `Lucka ${day}`, close: 'Stäng',
    greeting: hour => (hour < 10 ? 'God morgon' : hour < 17 ? 'God eftermiddag' : 'God kväll'),
  },
}

export function christmasLabels(language: string): ChristmasLabels {
  return LABELS[language] ?? LABELS.en
}

/** The line under the date: countdown in Advent, a greeting from Christmas Eve on. */
export function seasonLine(season: ChristmasDay, language: string): string {
  const labels = christmasLabels(language)
  if (season.phase === 'advent') return labels.daysToEve(season.daysToEve)
  if (season.phase === 'eve') return labels.eve
  return season.phase === 'christmas' ? labels.christmas : labels.newYear
}
