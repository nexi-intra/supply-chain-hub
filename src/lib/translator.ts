// Ordbogsbaseret dansk↔engelsk oversætter — offline og deterministisk.
// Kvaliteten er "teknisk gloseoversættelse": god til korte, formelagtige
// trin-instruktioner (domænet her), ikke litterær prosa. UI'et markerer altid
// resultatet som automatisk oversat. Ordbogen deles med søgeindekset, så
// danske søgninger rammer engelske guides og omvendt.

export type GuideLanguage = 'da' | 'en'

// Fraser oversættes før enkeltord (længste først). [da, en]
const PHRASES: Array<[string, string]> = [
  ['tryk på', 'press'],
  ['klik på', 'click'],
  ['vælg', 'select'],
  ['åbn', 'open'],
  ['luk', 'close'],
  ['indsæt bonrullen', 'insert the receipt roll'],
  ['bonrullen', 'the receipt roll'],
  ['bonrulle', 'receipt roll'],
  ['sæt strøm til', 'connect power to'],
  ['tag strømmen fra', 'disconnect the power from'],
  ['hovedmenuen', 'the main menu'],
  ['hovedmenu', 'main menu'],
  ['magnetstriben', 'the magnetic stripe'],
  ['magnetstribe', 'magnetic stripe'],
  ['servicekortet', 'the service card'],
  ['servicekort', 'service card'],
  ['serienummeret', 'the serial number'],
  ['serienummer', 'serial number'],
  ['leveringsnummeret', 'the delivery number'],
  ['leveringsnummer', 'delivery number'],
  ['følgesedlen', 'the order slip'],
  ['følgeseddel', 'order slip'],
  ['leveringsadressen', 'the delivery address'],
  ['leveringsadresse', 'delivery address'],
  ['print labels', 'print labels'],
  ['gem og luk', 'save and close'],
  ['scan stregkoden', 'scan the barcode'],
  ['stregkoden', 'the barcode'],
  ['stregkode', 'barcode'],
  ['netværkskablet', 'the ethernet cable'],
  ['netværkskabel', 'ethernet cable'],
  ['strømkablet', 'the power cable'],
  ['strømkabel', 'power cable'],
  ['pakkes i posen', 'packed into the bag'],
  ['klargør terminalen', 'prepare the terminal'],
  ['terminalen', 'the terminal'],
  ['printeren', 'the printer'],
  ['skærmen', 'the screen'],
  ['kvitteringen', 'the receipt'],
  ['ordren', 'the order'],
  ['kassen', 'the box'],
  ['posen', 'the bag'],
  ['lageret', 'the warehouse'],
  ['feltet', 'the field'],
  ['knappen', 'the button'],
  ['menuen', 'the menu'],
  ['landet', 'the country'],
]

// Enkeltord [da, en]. Bruges begge veje og i søgeindekset.
const WORDS: Array<[string, string]> = [
  ['tryk', 'press'], ['klik', 'click'], ['vælg', 'select'], ['åbn', 'open'], ['åben', 'open'],
  ['luk', 'close'], ['indsæt', 'insert'], ['fjern', 'remove'], ['tilslut', 'connect'],
  ['afmontér', 'disconnect'], ['frakobl', 'disconnect'], ['scan', 'scan'], ['skan', 'scan'],
  ['print', 'print'], ['udskriv', 'print'], ['indtast', 'enter'], ['bekræft', 'confirm'],
  ['annuller', 'cancel'], ['gem', 'save'], ['slet', 'delete'], ['start', 'start'],
  ['stop', 'stop'], ['genstart', 'restart'], ['tjek', 'check'], ['kontrollér', 'verify'],
  ['kontroller', 'verify'], ['swipe', 'swipe'], ['kør', 'run'], ['afvent', 'wait'],
  ['vent', 'wait'], ['pak', 'pack'], ['placér', 'place'], ['placer', 'place'],
  ['fastgør', 'attach'], ['påsæt', 'attach'], ['terminal', 'terminal'],
  ['betalingsterminal', 'payment terminal'], ['kvittering', 'receipt'], ['bon', 'receipt'],
  ['strøm', 'power'], ['kabel', 'cable'], ['ledning', 'cable'], ['skærm', 'screen'],
  ['knap', 'button'], ['menu', 'menu'], ['indstillinger', 'settings'], ['ordre', 'order'],
  ['bestilling', 'order'], ['levering', 'delivery'], ['forsendelse', 'shipment'],
  ['label', 'label'], ['etiket', 'label'], ['mærkat', 'label'], ['printer', 'printer'],
  ['tastatur', 'keyboard'], ['mus', 'mouse'], ['netværk', 'network'], ['fejl', 'error'],
  ['advarsel', 'warning'], ['problem', 'problem'], ['guide', 'guide'],
  ['vejledning', 'guide'], ['trin', 'step'], ['sektion', 'section'], ['side', 'page'],
  ['nummer', 'number'], ['land', 'country'], ['aftale', 'agreement'],
  ['aftaler', 'agreements'], ['kasse', 'box'], ['pose', 'bag'], ['lager', 'warehouse'],
  ['adresse', 'address'], ['felt', 'field'], ['ikon', 'icon'], ['kort', 'card'],
  ['og', 'and'], ['eller', 'or'], ['med', 'with'], ['uden', 'without'], ['til', 'to'],
  ['fra', 'from'], ['i', 'in'], ['på', 'on'], ['under', 'under'], ['over', 'over'],
  ['ny', 'new'], ['nyt', 'new'], ['gammel', 'old'], ['næste', 'next'], ['forrige', 'previous'],
  ['først', 'first'], ['derefter', 'then'], ['når', 'when'], ['hvis', 'if'], ['nu', 'now'],
  ['igen', 'again'], ['altid', 'always'], ['aldrig', 'never'], ['husk', 'remember'],
  ['klar', 'ready'], ['færdig', 'done'], ['korrekt', 'correct'], ['forkert', 'wrong'],
  ['virker', 'works'], ['tændt', 'on'], ['slukket', 'off'], ['tænd', 'turn on'],
  ['sluk', 'turn off'], ['oplader', 'charger'], ['batteri', 'battery'],
  ['opsætning', 'setup'], ['installation', 'installation'], ['installér', 'install'],
  ['installer', 'install'], ['konfiguration', 'configuration'], ['konfigurér', 'configure'],
  ['opdatering', 'update'], ['opdatér', 'update'], ['opdater', 'update'],
  ['bruger', 'user'], ['adgangskode', 'password'], ['brugernavn', 'username'],
  ['retur', 'return'], ['returnering', 'return'], ['ombytning', 'exchange'],
]

// Engelske ord der oversættes til dansk (retning en→da hvor parret ikke er symmetrisk).
const EN_EXTRA: Array<[string, string]> = [
  ['the', ''], ['a', 'en'], ['an', 'en'], ['into', 'i'], ['onto', 'på'],
  ['plug', 'tilslut'], ['unplug', 'frakobl'], ['choose', 'vælg'], ['pick', 'vælg'],
  ['exit', 'afslut'], ['fetch', 'hente'], ['fetches', 'henter'], ['small', 'lille'],
  ['need', 'skal'], ['needs', 'skal'], ['determine', 'afgøre'], ['which', 'hvilket'],
  ['your', 'din'], ['you', 'du'], ['it', 'den'], ['is', 'er'], ['are', 'er'],
  ['will', 'vil'], ['done', 'færdig'], ['via', 'via'],
]

function buildMaps(): { daToEn: Map<string, string>; enToDa: Map<string, string> } {
  const daToEn = new Map<string, string>()
  const enToDa = new Map<string, string>()
  for (const [da, en] of WORDS) {
    if (!daToEn.has(da)) daToEn.set(da, en)
    if (!enToDa.has(en)) enToDa.set(en, da)
  }
  for (const [en, da] of EN_EXTRA) {
    if (!enToDa.has(en)) enToDa.set(en, da)
  }
  return { daToEn, enToDa }
}

const { daToEn, enToDa } = buildMaps()

/** Ordpar (da, en) til tosproget søge-udvidelse. */
export function getDictionaryPairs(): Array<[string, string]> {
  return WORDS.filter(([, en]) => en && !en.includes(' '))
}

const DA_MARKERS = new Set(['og', 'ikke', 'det', 'der', 'til', 'på', 'med', 'som', 'af', 'skal', 'kan', 'når', 'hvis', 'eller', 'også', 'være', 'bliver', 'derefter', 'vælg', 'tryk', 'åbn', 'indsæt'])
const EN_MARKERS = new Set(['the', 'and', 'not', 'that', 'this', 'with', 'from', 'will', 'can', 'when', 'if', 'or', 'also', 'be', 'is', 'are', 'then', 'select', 'press', 'open', 'insert', 'into'])

/** Heuristisk sprogdetektion: æ/ø/å + stopords-flertal. Ved uafgjort (fx enkeltord) bruges fallback. */
export function detectLanguage(text: string, fallback: GuideLanguage = 'en'): GuideLanguage {
  if (/[æøå]/i.test(text)) return 'da'
  const tokens = text.toLowerCase().split(/[^a-zæøå]+/).filter(Boolean)
  let daScore = 0
  let enScore = 0
  for (const token of tokens) {
    if (DA_MARKERS.has(token)) daScore++
    if (EN_MARKERS.has(token)) enScore++
  }
  if (daScore === enScore) return fallback
  return daScore > enScore ? 'da' : 'en'
}

function matchCase(source: string, translated: string): string {
  if (!translated) return translated
  if (source === source.toUpperCase() && source.length > 1) return translated.toUpperCase()
  if (source[0] === source[0].toUpperCase()) {
    return translated[0].toUpperCase() + translated.slice(1)
  }
  return translated
}

/** Oversætter tekst ordbogsbaseret. Ukendte ord (produktnavne, [knapper] osv.) bevares. */
export function translateText(text: string, from: GuideLanguage, to: GuideLanguage): string {
  if (from === to || !text.trim()) return text

  let result = text

  // Frase-pas: længste fraser først, case-insensitivt, bevar stort begyndelsesbogstav.
  const phrases = [...PHRASES].sort((a, b) => (from === 'da' ? b[0].length - a[0].length : b[1].length - a[1].length))
  for (const [da, en] of phrases) {
    const search = from === 'da' ? da : en
    const replacement = from === 'da' ? en : da
    result = result.replace(new RegExp(escapeRegExp(search), 'gi'), (match) => matchCase(match, replacement))
  }

  // Ord-pas: token for token; ord i [klammer] og tal/produktkoder røres ikke.
  const dictionary = from === 'da' ? daToEn : enToDa
  result = result.replace(/[A-Za-zÆØÅæøå]+/g, (word) => {
    const lower = word.toLowerCase()
    const translated = dictionary.get(lower)
    if (translated === undefined) return word
    return matchCase(word, translated)
  })

  // Ryd dobbelte mellemrum efter tomme oversættelser (fx "the" → "").
  return result.replace(/ {2,}/g, ' ').replace(/ ([,.:;!?])/g, '$1').trim()
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type TranslationEngine = 'neural' | 'dictionary'

export interface AsyncTranslationResult {
  text: string
  /** Hvilken motor der leverede oversættelsen — UI viser det som badge. */
  engine: TranslationEngine
}

/**
 * Foretrukken oversættelse: Bergamot (neural, offline WASM — kræver modeller i
 * <datamappe>/translation-models/) med ordbogs-oversætteren som fallback.
 */
export async function translateTextAsync(text: string, from: GuideLanguage, to: GuideLanguage): Promise<AsyncTranslationResult> {
  if (from === to || !text.trim()) return { text, engine: 'dictionary' }
  try {
    const { bergamotTranslate } = await import('./bergamotTranslator')
    const neural = await bergamotTranslate(text, from, to)
    if (neural !== null) return { text: neural, engine: 'neural' }
  } catch (error) {
    console.error('Neural oversættelse utilgængelig — bruger ordbog:', error)
  }
  return { text: translateText(text, from, to), engine: 'dictionary' }
}
