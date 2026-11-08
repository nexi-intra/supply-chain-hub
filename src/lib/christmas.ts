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

// 24 facts about (Danish) Christmas, checked against sources before they went in (08.11.2026):
// lex.dk (jul, juletræ, nisse, risalamande, kravlenisse), Den Gamle By (Lehmann's tree 1811), Frederiksberg Museerne and
// Slagelse minkultur (Holsteinborg 1808), Odense Bys Museer (H.C. Andersen's woven heart), en.wikipedia "Pleated Christmas
// hearts" and "Christmas seal", Foreningen Norden and DR (Lucia 1944), Højskolesangbogen and Dannebrogs-Samfundet ("Højt fra
// træets grønne top", flags on the tree), da.wikipedia (risalamande, mandelgave, æbleskiver), National Geographic and Library
// of Congress (poinsettia), dagenslaengde.dk/DMI (solstice). Uncertain things are written as uncertain.
// Written like a person would write them: a few plain sentences, no dashes. No door may hint at where the nisse hides.
const DOORS_DA = [
  'Ordet jul er ældgammelt. Det kommer af det oldnordiske "jól", som var navnet på en fest midt om vinteren, længe før kristendommen kom til Norden. Hvad man egentlig lavede til de gamle jólfester, ved man faktisk ikke ret meget om.',
  'Det første juletræ i Danmark blev efter sigende tændt i 1808 på herregården Holsteinborg ved Skælskør. Det var grevinde Wilhelmine Holstein, der stod bag. Skikken kom sydfra, og i mange år var juletræet kun noget, man så på herregårde og i fine hjem.',
  'I 1811 tændte Martin Lehmann et juletræ i sin stue i Ny Kongensgade i København. Det var så nyt og mærkeligt, at naboerne stillede stiger op ad muren for at kigge ind ad vinduet. Det er et af de første juletræer, man kender i byen.',
  'Julemærket er en dansk opfindelse. Postekspedient Einar Holbøll fik idéen, og i 1904 kom verdens første julemærke med dronning Louise på. Det kostede 2 øre, pengene gik til kampen mod tuberkulose, og det første år blev der solgt over 4 millioner.',
  'Holbølls idé bredte sig hurtigt. Sverige og Island begyndte allerede samme år, og i dag udgives der julemærker i omkring 130 lande. Herhjemme går pengene i dag til Julemærkehjemmene, hvor børn, der har det svært, kan komme på et ophold.',
  'Det ældste flettede julehjerte, man kender, er lavet af H.C. Andersen i gult og grønt glanspapir. Museet i Odense daterer det til omkring 1850. Hjertet har ingen hank, så det har nok aldrig hængt på et juletræ, og man ved ikke, om det var ham, der fandt på at flette dem.',
  'Den ældste kendte vejledning i at flette julehjerter blev trykt i 1871. Det ældste bevarede hjerte med hank, altså lavet til at hænge på træet, er fra 1873. Men først omkring 1910, da børnehaverne tog det til sig, blev det for alvor noget, alle kunne.',
  'I den gamle folketro var nissen en lille mand i gråt tøj og rød hue, cirka på størrelse med en dreng på 10 år. Han boede på loftet i stalden og passede på gården og dyrene. Gik det godt på en gård, var det fordi, nissen var glad.',
  'Nissen skulle have grød med en klat smør. En gammel historie fortæller om en nisse, der ikke kunne se smørret og blev så gal, at han slog gårdens bedste ko ihjel. Bagefter fandt han smørret på bunden af skålen, og så fortrød han det bitterligt.',
  'Den tidligste julenisse, man kender, dukkede op til en julefest hos maleren Constantin Hansen i 1836. Julemanden kom først til senere i 1800-tallet. Omkring år 1900 brugte folk ordene nisse og julemand i flæng, og det gør mange stadig.',
  'Risalamande blev en del af julen hos de bedrestillede omkring år 1900. Navnet kommer af det franske riz à l\'amande, ris med mandel, men retten findes ikke i Frankrig. Den blev først almindelig under og efter krigen, hvor ris var svært at skaffe, og grøden blev strakt med flødeskum.',
  'Mandelgaven kendes på tryk fra 1876, hvor et blad beskrev mandlen i grøden som et sjovt indslag til julefesten. Hvor skikken kommer fra, ved man ikke med sikkerhed. En populær teori er en fransk skik, hvor den, der fandt en bønne i kagen, blev konge for en dag.',
  'Den 13. december er det Luciadag. Det første danske Luciaoptog gik i 1944 i Scala på Vesterbro i København, og det var Foreningen Norden, der stod bag. Selv i Sverige var traditionen ikke så gammel, for de første offentlige optog gik der i 1928.',
  'Lucia kom til Danmark midt under besættelsen, og det var ikke tilfældigt. De fleste af vores juletraditioner kommer fra Tyskland, men i de år valgte man helt bevidst at kigge mod Sverige og resten af Norden i stedet.',
  'Siden anden halvdel af 1800-tallet har danskerne gået rundt om juletræet med hinanden i hænderne og sunget. Mange familier har deres faste salmer og sange, og til sidst går det tit stærkt, når "Nu er det jul igen" sender hele familien i en lang kæde gennem huset.',
  '"Højt fra træets grønne top" blev skrevet i 1847 af Peter Faber om juleaften hjemme hos hans egen familie. Melodien, vi synger i dag, kom året efter. Samme år brød Treårskrigen ud, og i den stemning begyndte folk at hænge små dannebrogsflag på juletræet.',
  'Ikke alle var vilde med juletræet i starten. I 1817 skrev N.F.S. Grundtvig, at juletræet var udtryk for "udvandet kristendom". Han skiftede dog mening og skrev selv digtet "Jule-Træet", som blev trykt i 1823 og gjorde træet mere kendt i København.',
  'H.C. Andersens eventyr "Grantræet" udkom den 21. december 1844, i samme bog som "Sneedronningen". Det handler om et lille træ, der ikke kan vente med at blive stort, bliver pyntet til en enkelt juleaften og bagefter havner på loftet. Eventyret hjalp med at gøre skikken kendt.',
  'Længe var juletræet mest noget for velhavende familier i byerne. Ude på landet var det ofte præsten og skolelæreren, der fik juletræ først, fordi de havde kontakter i byen. Først omkring år 1900 stod der et juletræ i de fleste danske hjem.',
  'Æbleskiver hedder sådan, fordi de oprindelig var skiver af æble. Omkring år 1700 beskrev sprogforskeren Matthias Moth en æbleskive som en tynd skive æble, vendt i mel og æg og stegt i smør. Dem vi spiser i dag, har som regel slet intet æble i.',
  'Omkring den 21. december er det vintersolhverv og årets korteste dag. I København er solen kun oppe i cirka 7 timer, og i Skagen er det endnu mindre. Herfra bliver dagene langsomt længere igen, først bare et par minutter ad gangen.',
  'Julestjernen kommer fra Mexico, hvor aztekerne kaldte den cuetlaxochitl. Den er opkaldt efter den amerikanske diplomat Joel Poinsett, der tog den med hjem til USA i 1820\'erne. Det røde er i øvrigt ikke blomster, men blade. Blomsterne er de små gule knopper i midten.',
  'Den 23. december er det lillejuleaften. Dagen står ikke i kirkens kalender, men er en gammel folkelig dag. På landet var det dagen, hvor der skulle bages, gøres rent og gøres klar til juleaften, og i dag er det for mange aftenen, hvor juletræet bliver pyntet.',
  'Glædelig jul! Vi holder jul om aftenen den 24., fordi kirkens helligdage i gamle dage begyndte ved solnedgang aftenen før. I mange andre lande er det store øjeblik først om morgenen den 25., men herhjemme er det juleaften med god mad, dans om træet og gaver.',
]

const DOORS_EN = [
  'The Danish word for Christmas, "jul", is very old. It comes from Old Norse "jól", the name of a midwinter feast held in the North long before Christianity arrived. We actually know very little about what people did at those old feasts.',
  'The first Christmas tree in Denmark was reportedly lit in 1808 at Holsteinborg, a manor near Skælskør. It was Countess Wilhelmine Holstein who brought it in. The custom came from the south, and for years a tree was something you only saw in grand homes.',
  'In 1811 Martin Lehmann lit a Christmas tree in his living room in Copenhagen. It was so new and strange that the neighbours put ladders up against the wall to look in through the window. It is one of the first trees we know of in the city.',
  'The Christmas seal is a Danish invention. Postal clerk Einar Holbøll had the idea, and in 1904 the first one came out with Queen Louise on it. It cost 2 øre, the money went to fighting tuberculosis, and more than 4 million were sold that first year.',
  'Holbøll\'s idea spread quickly. Sweden and Iceland started the same year, and today Christmas seals are issued in around 130 countries. In Denmark the money now goes to homes where children who are having a hard time can come for a stay.',
  'The oldest known woven paper heart was made by Hans Christian Andersen in yellow and green glossy paper. The museum in Odense dates it to around 1850. It has no handle, so it probably never hung on a tree, and nobody knows if he invented them.',
  'The oldest known instructions for weaving paper hearts were printed in 1871. The oldest surviving heart with a handle, made to hang on the tree, is from 1873. But only around 1910, when kindergartens took it up, did everyone learn to make them.',
  'In old Danish folklore the nisse was a small man in grey clothes and a red cap, about the size of a ten year old boy. He lived in the loft above the stable and looked after the farm and the animals. If a farm did well, it was because the nisse was happy.',
  'The nisse had to have porridge with a knob of butter. An old story tells of a nisse who could not see the butter and got so angry that he killed the best cow on the farm. Afterwards he found the butter at the bottom of the bowl and bitterly regretted it.',
  'The earliest known Christmas nisse turned up at a Christmas party at the painter Constantin Hansen\'s home in 1836. Father Christmas only arrived later in the 1800s. By around 1900 Danes used the words nisse and julemand for the same figure, and many still do.',
  'Risalamande became part of Christmas in well off homes around 1900. The name comes from French riz à l\'amande, rice with almond, but the dish does not exist in France. It only became common during and after the war, when rice was scarce and the porridge was stretched with whipped cream.',
  'The almond gift is known in print from 1876, when a magazine described the almond in the porridge as a fun part of the Christmas party. Nobody knows for sure where the custom comes from. A popular theory is a French custom where whoever found a bean in the cake was king for a day.',
  'The 13th of December is Saint Lucy\'s Day. The first Danish Lucia procession was held in 1944 at Scala in Copenhagen, organised by Foreningen Norden. Even in Sweden the tradition was not very old, as the first public processions there took place in 1928.',
  'Lucia came to Denmark in the middle of the German occupation, and that was no accident. Most Danish Christmas traditions come from Germany, but in those years people quite deliberately chose to look to Sweden and the rest of the North instead.',
  'Since the second half of the 1800s Danes have walked around the Christmas tree hand in hand, singing. Many families have their own fixed carols, and at the end things often speed up as one last song sends the whole family through the house in a long chain.',
  'The carol "Højt fra træets grønne top" was written in 1847 by Peter Faber about Christmas Eve with his own family. The melody we sing today came the year after. That same year war broke out over Schleswig, and in that mood people began hanging small Danish flags on the tree.',
  'Not everyone liked the Christmas tree at first. In 1817 N.F.S. Grundtvig wrote that the tree was an expression of "watered down Christianity". He changed his mind, though, and wrote the poem "Jule-Træet" himself, printed in 1823, which made the tree better known in Copenhagen.',
  'Hans Christian Andersen\'s tale "The Fir-Tree" came out on 21 December 1844, in the same book as "The Snow Queen". It is about a little tree that cannot wait to grow up, is decorated for a single Christmas Eve and ends up in the attic. The tale helped make the custom known.',
  'For a long time the Christmas tree was mostly for well off families in the towns. In the countryside it was often the vicar and the schoolteacher who got a tree first, because they had contacts in town. Only around 1900 did most Danish homes have one.',
  'Æbleskiver means "apple slices", because that is what they once were. Around 1700 the scholar Matthias Moth described one as a thin slice of apple dipped in flour and egg and fried in butter. The round ones we eat today usually have no apple in them at all.',
  'Around 21 December comes the winter solstice, the shortest day of the year. In Copenhagen the sun is only up for about 7 hours, and in Skagen even less. From here the days slowly get longer again, at first by just a couple of minutes at a time.',
  'The poinsettia comes from Mexico, where the Aztecs called it cuetlaxochitl. It is named after the American diplomat Joel Poinsett, who took it home to the USA in the 1820s. By the way, the red parts are not flowers but leaves. The flowers are the small yellow buds in the middle.',
  'The 23rd of December is "little Christmas Eve" in Denmark. It is not in the church calendar but an old folk tradition. On farms it was the day for baking, cleaning and getting everything ready for Christmas Eve, and today many families decorate the tree that evening.',
  'Merry Christmas! Danes celebrate on the evening of the 24th, because in the old days church holidays began at sunset the evening before. In many countries the big moment only comes on the morning of the 25th, but in Denmark it is Christmas Eve with good food, dancing round the tree and presents.',
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
    eve: 'Glædelig jul, det er juleaften!', christmas: 'Glædelig jul', newYear: 'Godt nytår',
    door: 'Dagens låge', doorHint: 'Klik og se, hvad nissen har lagt', doorTitle: day => `Låge ${day}`, close: 'Luk',
    greeting: hour => (hour < 10 ? 'God morgen' : hour < 17 ? 'God eftermiddag' : 'God aften'),
  },
  en: {
    toggle: 'Christmas theme',
    daysToEve: days => (days === 1 ? '1 day to Christmas Eve' : `${days} days to Christmas Eve`),
    eve: "Merry Christmas, it's Christmas Eve!", christmas: 'Merry Christmas', newYear: 'Happy New Year',
    door: "Today's door", doorHint: 'Click to see what the elf left', doorTitle: day => `Door ${day}`, close: 'Close',
    greeting: hour => (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'),
  },
  fi: {
    toggle: 'Jouluteema',
    daysToEve: days => (days === 1 ? '1 päivä jouluaattoon' : `${days} päivää jouluaattoon`),
    eve: 'Hyvää joulua, nyt on jouluaatto!', christmas: 'Hyvää joulua', newYear: 'Hyvää uutta vuotta',
    door: 'Päivän luukku', doorHint: 'Katso, mitä tonttu jätti', doorTitle: day => `Luukku ${day}`, close: 'Sulje',
    greeting: hour => (hour < 10 ? 'Hyvää huomenta' : hour < 17 ? 'Hyvää iltapäivää' : 'Hyvää iltaa'),
  },
  sv: {
    toggle: 'Jultema',
    daysToEve: days => (days === 1 ? '1 dag till julafton' : `${days} dagar till julafton`),
    eve: 'God jul, det är julafton!', christmas: 'God jul', newYear: 'Gott nytt år',
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
