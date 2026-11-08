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

// 24 facts about (Danish) Christmas, checked against sources before they went in:
// lex.dk (juletræ, julemærker, Einar Holbøll), DR and Foreningen Norden (Lucia 1944), Odense Bys Museer (H.C. Andersen's
// woven heart), da/en.wikipedia (risalamande, mandelgave), danskkultur.dk and Lex/Thiele (the nisse and his porridge).
// No door may hint at where the nisse hides.
const DOORS_DA = [
  'Ordet "jul" kommer af oldnordisk "jól" – en midvinterfest, der blev fejret i Norden længe før kristendommen kom hertil.',
  'Det første juletræ i Danmark blev efter sigende tændt i 1808 på godset Holsteinborg på Sydsjælland.',
  'I 1811 tændte Martin Lehmann det første juletræ i København. Folk stimlede sammen i gaden for at se det.',
  'Postekspedient Einar Holbøll fik idéen til julemærket. Verdens første julemærke udkom i Danmark i 1904 og kostede 2 øre.',
  'Den danske julemærke-idé fra 1904 har bredt sig til hele verden – i dag udgives julemærker i mere end 125 lande.',
  'Det ældste kendte flettede julehjerte er klippet af H.C. Andersen i gult og grønt glanspapir, sandsynligvis omkring 1850.',
  'Først fra 1870\'erne kendes flettede julehjerter, der er lavet til at hænge på juletræet.',
  'I dansk folketro var nissen en lille gråklædt gårdbo med rød hue, som passede på dyrene – og drillede, hvis han blev glemt.',
  'Nissen skulle have risengrød med en klat smør juleaften. Glemte man smørret, kunne han finde på at lave ballade på gården.',
  'Risalamande kendes fra omkring år 1900. Navnet lyder fransk – riz à l\'amande, "ris med mandel" – men retten er dansk.',
  'Mandelgaven menes at stamme fra en fransk skik fra 1500-tallet: den, der fandt en bønne i helligtrekongerskagen, blev "konge".',
  'Under rationeringen i 1940\'erne strakte husmødre risengrøden med flødeskum – og risalamanden blev Danmarks foretrukne juledessert.',
  'I dag er det Luciadag! Det første danske Luciaoptog gik den 13. december 1944 på Scala i København.',
  'Lucia blev hentet fra Sverige under besættelsen – et bevidst valg om at vende blikket mod Norden i stedet for mod Tyskland.',
  'Siden anden halvdel af 1800-tallet har danskerne gået rundt om juletræet med hinanden i hænderne og sunget.',
  '"Højt fra træets grønne top" er fra 1848. Derfor pynter mange stadig juletræet med trommer og dannebrogsflag.',
  'N.F.S. Grundtvig kaldte i 1817 juletræet "udvandet kristendom" – men skrev kort efter selv digtet "Jule-Træet".',
  'H.C. Andersens eventyr "Grantræet" fra 1844 var med til at udbrede skikken med at pynte et juletræ i stuen.',
  'Først omkring år 1900 havde de fleste danske hjem fået juletræ. Før var det mest noget for borgerskabet i byerne.',
  'Æbleskiver hedder sådan, fordi man tidligere puttede et stykke æble i dejen, når de blev bagt i panden.',
  'Vintersolhverv falder omkring den 21. december – årets korteste dag. Herfra bliver dagene længere igen.',
  'Julestjernen kommer fra Mexico. På engelsk hedder den poinsettia efter den amerikanske diplomat Joel Poinsett.',
  'Lillejuleaften er for mange dagen, hvor juletræet bliver pyntet, og risengrøden bliver kogt til i morgen.',
  'Glædelig jul! I Danmark holder vi juleaften den 24. december – med julemad, dans om juletræet og gaver bagefter.',
]

const DOORS_EN = [
  'The Danish word for Christmas, "jul", comes from Old Norse "jól" – a midwinter feast held in the North long before Christianity.',
  'The first Christmas tree in Denmark was reportedly lit in 1808 at the Holsteinborg estate in southern Zealand.',
  'In 1811 Martin Lehmann lit the first Christmas tree in Copenhagen. People crowded the street to see it.',
  'Postal clerk Einar Holbøll came up with the Christmas seal. The world\'s first one was issued in Denmark in 1904 for 2 øre.',
  'The Danish Christmas seal idea from 1904 spread worldwide – today Christmas seals are issued in more than 125 countries.',
  'The oldest known woven paper heart was cut by Hans Christian Andersen in yellow and green paper, probably around 1850.',
  'Woven paper hearts made for hanging on the Christmas tree are only known from the 1870s.',
  'In Danish folklore the nisse was a small grey-clad farm spirit with a red cap who looked after the animals – and played tricks if forgotten.',
  'The nisse expected rice porridge with a knob of butter on Christmas Eve. Forget the butter, and he might cause trouble on the farm.',
  'Risalamande has been known since around 1900. The name sounds French – riz à l\'amande, "rice with almond" – but the dish is Danish.',
  'The almond gift is thought to come from a 16th-century French custom: whoever found a bean in the Epiphany cake became "king".',
  'During rationing in the 1940s, housewives stretched rice porridge with whipped cream – and risalamande became the Danish favourite.',
  'Today is Saint Lucy\'s Day! The first Danish Lucia procession took place on 13 December 1944 at Scala in Copenhagen.',
  'Lucia was brought from Sweden during the German occupation – a deliberate choice to look north instead of south.',
  'Since the second half of the 1800s, Danes have walked around the Christmas tree hand in hand, singing.',
  'The carol "Højt fra træets grønne top" is from 1848. That is why many still hang drums and Danish flags on the tree.',
  'In 1817 N.F.S. Grundtvig called the Christmas tree "watered-down Christianity" – but soon wrote the poem "Jule-Træet" himself.',
  'Hans Christian Andersen\'s tale "The Fir-Tree" from 1844 helped spread the custom of decorating a tree indoors.',
  'Only around 1900 did most Danish homes have a Christmas tree. Before that it was mostly for town families of means.',
  'Æbleskiver ("apple slices") got their name because a piece of apple used to be put in the batter as they were baked in the pan.',
  'The winter solstice falls around 21 December – the shortest day of the year. From here the days get longer again.',
  'The poinsettia comes from Mexico and is named after the American diplomat Joel Poinsett.',
  'For many Danes, 23 December is the day the tree is decorated and the rice porridge is cooked for tomorrow.',
  'Merry Christmas! In Denmark Christmas Eve is celebrated on 24 December – with dinner, dancing around the tree and presents after.',
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
