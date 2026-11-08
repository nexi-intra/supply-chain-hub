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

// 24 facts about (Danish) Christmas. Every sentence was checked by hand against the source it comes from (08.11.2026):
// lex.dk "jul", "juletræ", "nisse"; Den Gamle By (Lehmann's tree 1811); en.wikipedia "Christmas seal" and "Pleated Christmas
// hearts"; da.wikipedia "Risalamande", "Æbleskiver", "Højt fra træets grønne top"; Højskolesangbogen (the verses);
// Dannebrogs-Samfundet (flags on the tree); DR (Lucia 1944); historienet.dk (why the 24th); danskkalender.app/kristendom.dk
// (lillejuleaften); HGIC Clemson (poinsettia). Each text must make sense on its own: no vague links like "in that mood".
// Written like a person would write them: a few plain sentences, no dashes. No door may hint at where the nisse hides.
const DOORS_DA = [
  'Ordet jul kommer af det oldnordiske "jól". I Norden holdt man en fest midt om vinteren, længe før kristendommen kom hertil. I vikingetiden kaldte man det at "drikke jul", og man skålede for de guder, der skulle give et godt og frugtbart år.',
  'Juletræet er en tysk skik, der går helt tilbage til 1500-tallet. Det første juletræ i Danmark blev efter sigende tændt i 1808 hos grevefamilien Holstein på godset Holsteinborg på Sydsjælland. Familien havde tyske rødder, og det var nok derfor, de kendte skikken.',
  'Juleaften 1811 tændte Martin Lehmann et juletræ med levende lys i sin lejlighed i København. Naboerne troede, familien var blevet skøre, og nogle satte stiger op ad muren for at kigge ind ad vinduet. Allerede året efter havde flere borgerhjem i byen juletræ.',
  'Julemærket er en dansk opfindelse. Postekspedient Einar Holbøll fik idéen om et ekstra mærke på julepost, hvor pengene skulle hjælpe børn med tuberkulose. Det første julemærke kom i 1904 med dronning Louise på og kostede 2 øre. Det første år blev der solgt over 4 millioner.',
  'For pengene fra de første seks års julemærker byggede man Julemærkesanatoriet i Kolding, som åbnede i 1911. Idéen bredte sig hurtigt, og Sverige og Island udgav julemærker allerede samme år som Danmark. I dag laver omkring 130 lande deres egne julemærker.',
  'Et af de ældste flettede julehjerter, man kender, er klippet af H.C. Andersen i gult og grønt glanspapir i midten af 1800-tallet. Det ligger i dag på museet i Odense. Hjertet har ingen hank, så det har nok aldrig hængt på et juletræ.',
  'Den ældste kendte vejledning i at flette julehjerter blev trykt i et dansk husflidsblad i 1871. Det ældste bevarede hjerte med hank, så det kunne hænge på træet, er fra 1873. Man mener, det var børnehaverne, der omkring 1910 for alvor fik alle børn til at flette dem.',
  'I den gamle folketro var nissen en lille, ældre ungkarl på størrelse med en dreng på 10 til 12 år. Han gik i gråt tøj med en spids rød hue og boede på loftet over stalden eller i laden. Der var kun én nisse på hver gård, og han hjalp bonden, så længe han fik sin løn.',
  'Nissens løn var et fad sødgrød med en klat smør hver lørdag aften og ved højtiderne. Et gammelt sagn fortæller om en nisse, der ikke kunne se smørret og blev så vred, at han slog gårdens bedste ko ihjel. Da han spiste videre, fandt han smørret på bunden af fadet og fortrød bittert.',
  'Den første julenisse, man har kilder til, dukkede op til maleren Constantin Hansens julefest i 1836. Kunstnerne gjorde folketroens nisse til den, der kommer med gaverne juleaften. Julemanden kom først senere i 1800-tallet, og fra omkring 1900 kaldte de fleste dem bare alle sammen for nisser.',
  'Risalamande kendes fra omkring år 1900, hvor borgerlige familier begyndte at servere den med kirsebærsovs juleaften i stedet for risengrød. Navnet er fransk, riz à l\'amande betyder ris med mandel, men retten kendes slet ikke i Frankrig. Den, der finder den hele mandel, vinder mandelgaven.',
  'Under og efter 2. verdenskrig var mange madvarer rationeret. Damebladene rådede husmødrene til at få risengrøden til at slå længere ved at røre flødeskum i, og var der ikke fløde, brugte man erstatning. Det var i de år, risalamanden blev danskernes foretrukne juledessert.',
  'Den 13. december er det Luciadag. Danmarks første Luciaoptog gik den 13. december 1944 i det gamle Scala på Vesterbro i København, og Foreningen Norden stod bag. I Norden fejrede man i forvejen natten til den 13. med lys, fordi den efter den gamle kalender var årets længste nat.',
  'Lucia kom til Danmark midt under besættelsen, og det var et bevidst valg. Næsten alle vores juletraditioner kommer fra Tyskland, men i de år ville man hellere hente inspiration i det neutrale Sverige. Det gjaldt ikke kun Lucia. Svenske film blev populære, og svenske skuespillerinder afløste stjernerne fra Hollywood.',
  'Siden anden halvdel af 1800-tallet har danskerne gået rundt om juletræet med hinanden i hænderne, mens de synger julesalmer og julesange. Mange familier har deres faste sange i en fast rækkefølge. Til sidst ender det tit med "Nu er det jul igen", hvor kæden løber gennem hele huset.',
  'I "Højt fra træets grønne top" bliver børnenes julegaver delt ud fra træet. Peter får en tromme, og Henrik får en fane, for "det er en ære Dannebrog at bære". Sangen udkom i 1848, samme år som Danmark gik i krig om Slesvig, og mange ville vise, at de holdt med Danmark. Derfor kom trommer og dannebrogsflag på juletræet.',
  'Ikke alle var begejstrede for juletræet. I 1817 skrev præsten og digteren N.F.S. Grundtvig, at juletræet var udtryk for "udvandet kristendom". Han skiftede dog hurtigt mening og skrev selv digtet "Jule-Træet", som blev trykt i 1823 og gjorde juletræet mere kendt i København.',
  'H.C. Andersens eventyr "Grantræet" udkom til jul i 1844. Det handler om et lille grantræ, der længes efter at komme ind i stuen og blive pyntet. Det får sin juleaften, men bagefter havner det på loftet og bliver til sidst brændt. Eventyret var med til at gøre juletræet kendt i Danmark.',
  'Længe var juletræet mest noget for de velstillede i byerne. Uden for København kom det først til præste- og lærerhjemmene, fordi de havde kontakter i hovedstaden og læste om skikken i blade og almanakker. Først omkring år 1900 stod der juletræ i de fleste danske hjem.',
  'Omkring år 1700 var en æbleskive bogstaveligt talt en skive æble, vendt i mel og æg og stegt i smør på en pande. De runde æbleskiver fra æbleskivepanden kendes fra børnebogen "Peters Jul" fra 1866. I dag er der som regel slet ikke æble i, men navnet har overlevet.',
  'Omkring den 21. december er det vintersolhverv og årets korteste dag. I København står solen op lidt over halv ni og går ned lidt over halv fire, så den er kun oppe i cirka 7 timer. Lige efter solhverv vokser dagen kun med få sekunder ad gangen, men sidst i januar er den halvanden time længere.',
  'Julestjernen kommer fra Mexico. Den er opkaldt efter Joel Poinsett, USA\'s første gesandt i Mexico, som i 1820\'erne sendte planten hjem til USA. Det røde på julestjernen er faktisk ikke blomster, men blade. De rigtige blomster er de små gule knopper i midten.',
  'Den 23. december er det lillejuleaften. Dagen står ikke i kirkens kalender, men er en gammel folkelig dag. På landet skulle slagtning, bagning, lysstøbning og rengøring være færdig til lillejuleaften, og derfor siger man stadig om et rodet hjem, at her ser ud som lillejuleaften.',
  'Glædelig jul! At vi holder jul om aftenen den 24., skyldes en gammel måde at regne døgnet på, hvor en ny dag begyndte ved solnedgang og ikke ved midnat. Juledag startede altså allerede om aftenen den 24. I mange andre lande er det store øjeblik først den 25., men i Norden har vi holdt fast i juleaften.',
]

const DOORS_EN = [
  'The Danish word for Christmas, "jul", comes from Old Norse "jól". People in the North held a feast in the middle of winter long before Christianity arrived. In the Viking Age it was called "drinking jul", and people raised their cups to the gods who were to bring a good and fruitful year.',
  'The Christmas tree is a German custom that goes back to the 1500s. The first tree in Denmark was reportedly lit in 1808 by the noble Holstein family at their Holsteinborg estate in southern Zealand. The family had German roots, which is probably how they knew the custom.',
  'On Christmas Eve 1811 Martin Lehmann lit a Christmas tree with real candles in his flat in Copenhagen. The neighbours thought the family had gone mad, and some put ladders up against the wall to peek in through the window. By the following year several town houses had a tree.',
  'The Christmas seal is a Danish invention. Postal clerk Einar Holbøll came up with an extra stamp for Christmas mail, with the money going to children with tuberculosis. The first seal came out in 1904 with Queen Louise on it and cost 2 øre. More than 4 million were sold that first year.',
  'The money from the first six years of Christmas seals built the Christmas Seal Sanatorium in Kolding, which opened in 1911. The idea spread quickly, and Sweden and Iceland issued seals in the very same year as Denmark. Today around 130 countries make their own Christmas seals.',
  'One of the oldest known woven paper hearts was cut by Hans Christian Andersen from yellow and green glossy paper in the middle of the 1800s. It is kept at the museum in Odense today. The heart has no handle, so it probably never hung on a Christmas tree.',
  'The oldest known instructions for weaving paper hearts were printed in a Danish craft magazine in 1871. The oldest surviving heart with a handle, so it could hang on the tree, is from 1873. It is thought that kindergartens around 1910 were what got every child weaving them.',
  'In old Danish folklore the nisse was a small, elderly bachelor about the size of a boy of 10 to 12. He wore grey clothes and a pointed red cap and lived in the loft above the stable or in the barn. There was only one nisse on each farm, and he helped the farmer as long as he got his pay.',
  'The nisse was paid with a bowl of sweet porridge and a knob of butter every Saturday evening and on holidays. An old tale tells of a nisse who could not see the butter and got so angry that he killed the best cow on the farm. Eating on, he found the butter at the bottom of the bowl and bitterly regretted it.',
  'The first Christmas nisse we have records of turned up at the painter Constantin Hansen\'s Christmas party in 1836. Artists turned the farm nisse of folklore into the one who brings the presents on Christmas Eve. Father Christmas only came later in the 1800s, and from about 1900 most people simply called them all nisser.',
  'Risalamande is known from around 1900, when well off families began serving it with cherry sauce on Christmas Eve instead of rice porridge. The name is French, riz à l\'amande means rice with almond, but the dish is unknown in France. Whoever finds the one whole almond wins the almond gift.',
  'During and after the Second World War many foods were rationed. Women\'s magazines told housewives to make the rice porridge go further by stirring in whipped cream, and if there was no cream, a substitute would do. It was in those years that risalamande became the Danes\' favourite Christmas dessert.',
  'The 13th of December is Saint Lucy\'s Day. Denmark\'s first Lucia procession was held on 13 December 1944 at the old Scala in Copenhagen, organised by Foreningen Norden. In the North people already marked the night before the 13th with lights, because by the old calendar it was the longest night of the year.',
  'Lucia came to Denmark in the middle of the German occupation, and it was a deliberate choice. Almost all Danish Christmas traditions come from Germany, but in those years people preferred to look to neutral Sweden for inspiration. It was not just Lucia. Swedish films became popular, and Swedish actresses replaced the Hollywood stars.',
  'Since the second half of the 1800s Danes have walked around the Christmas tree hand in hand, singing carols and Christmas songs. Many families sing the same songs in the same order every year. It often ends with "Nu er det jul igen", when the chain runs through the whole house.',
  'In the carol "Højt fra træets grønne top" the children\'s presents are handed out from the tree. Peter gets a drum and Henrik a banner, because "it is an honour to carry the Dannebrog". The song came out in 1848, when Denmark went to war over Schleswig and many wanted to show they stood by Denmark. So drums and flags went on the tree.',
  'Not everyone liked the Christmas tree at first. In 1817 the priest and poet N.F.S. Grundtvig wrote that the tree was an expression of "watered down Christianity". He soon changed his mind, though, and wrote the poem "Jule-Træet" himself, which was printed in 1823 and made the tree better known in Copenhagen.',
  'Hans Christian Andersen\'s tale "The Fir-Tree" came out at Christmas 1844. It is about a little fir tree that longs to be brought into the living room and decorated. It gets its Christmas Eve, but afterwards it ends up in the attic and is finally burned. The tale helped make the Christmas tree known in Denmark.',
  'For a long time the Christmas tree was mostly for well off families in the towns. Outside Copenhagen it first reached the homes of vicars and teachers, because they had contacts in the capital and read about the custom in magazines and almanacs. Only around 1900 did most Danish homes have a tree.',
  'Around 1700 an æbleskive was literally a slice of apple, dipped in flour and egg and fried in butter in a pan. The round ones from the special æbleskive pan are described in the children\'s book "Peters Jul" from 1866. Today there is usually no apple in them at all, but the name has survived.',
  'Around 21 December comes the winter solstice, the shortest day of the year. In Copenhagen the sun rises a little after half past eight and sets a little after half past three, so it is only up for about 7 hours. Right after the solstice the days grow by mere seconds, but by late January they are an hour and a half longer.',
  'The poinsettia comes from Mexico. It is named after Joel Poinsett, the first US envoy to Mexico, who sent the plant home to the USA in the 1820s. The red parts of a poinsettia are actually not flowers but leaves. The real flowers are the small yellow buds in the middle.',
  'The 23rd of December is "little Christmas Eve" in Denmark. It is not in the church calendar but an old folk tradition. On farms the slaughtering, baking, candle making and cleaning all had to be done by this evening, which is why Danes still say a messy home looks like little Christmas Eve.',
  'Merry Christmas! Danes celebrate on the evening of the 24th because of an old way of counting the day, where a new day began at sunset rather than at midnight. So Christmas Day really started on the evening of the 24th. In many countries the big moment is on the 25th, but the Nordic countries kept Christmas Eve.',
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
