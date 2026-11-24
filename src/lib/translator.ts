// Ordbogsbaseret dansk↔engelsk oversætter — offline og deterministisk.
// Kvaliteten er "teknisk gloseoversættelse": god til korte, formelagtige
// trin-instruktioner (domænet her), ikke litterær prosa. UI'et markerer altid
// resultatet som automatisk oversat. Ordbogen deles med søgeindekset, så
// danske søgninger rammer engelske guides og omvendt.

import type { Language } from './translations'

export type GuideLanguage = Language

/** Languages a guide can be shown in (original or translated). */
export const GUIDE_LANGUAGES: GuideLanguage[] = ['da', 'en', 'fi', 'sv']

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

// Teknisk engelsk↔finsk fallback. Neural Bergamot bruges først, når de relevante
// modeller findes på det delte drev; ukendte produktnavne og koder bevares.
const FI_WORDS: Array<[string, string]> = [
  ['press', 'paina'], ['click', 'napsauta'], ['select', 'valitse'], ['open', 'avaa'],
  ['close', 'sulje'], ['insert', 'aseta'], ['remove', 'poista'], ['connect', 'yhdistä'],
  ['disconnect', 'irrota'], ['scan', 'skannaa'], ['print', 'tulosta'], ['enter', 'syötä'],
  ['confirm', 'vahvista'], ['cancel', 'peruuta'], ['save', 'tallenna'], ['delete', 'poista'],
  ['start', 'aloita'], ['stop', 'pysäytä'], ['restart', 'käynnistä uudelleen'],
  ['check', 'tarkista'], ['verify', 'varmista'], ['wait', 'odota'], ['run', 'suorita'],
  ['pack', 'pakkaa'], ['place', 'aseta'], ['attach', 'kiinnitä'],
  ['terminal', 'pääte'], ['payment terminal', 'maksupääte'], ['receipt', 'kuitti'],
  ['power', 'virta'], ['cable', 'kaapeli'], ['screen', 'näyttö'], ['button', 'painike'],
  ['menu', 'valikko'], ['settings', 'asetukset'], ['order', 'tilaus'], ['delivery', 'toimitus'],
  ['shipment', 'lähetys'], ['label', 'tarra'], ['printer', 'tulostin'],
  ['keyboard', 'näppäimistö'], ['mouse', 'hiiri'], ['network', 'verkko'],
  ['error', 'virhe'], ['warning', 'varoitus'], ['problem', 'ongelma'], ['guide', 'opas'],
  ['step', 'vaihe'], ['section', 'osio'], ['page', 'sivu'], ['number', 'numero'],
  ['country', 'maa'], ['agreement', 'sopimus'], ['box', 'laatikko'], ['bag', 'pussi'],
  ['warehouse', 'varasto'], ['address', 'osoite'], ['field', 'kenttä'], ['icon', 'kuvake'],
  ['card', 'kortti'], ['user', 'käyttäjä'], ['password', 'salasana'], ['username', 'käyttäjänimi'],
  ['update', 'päivitys'], ['installation', 'asennus'], ['configuration', 'määritys'],
  ['battery', 'akku'], ['charger', 'laturi'], ['new', 'uusi'], ['old', 'vanha'],
  ['next', 'seuraava'], ['previous', 'edellinen'], ['first', 'ensin'], ['then', 'sitten'],
  ['when', 'kun'], ['if', 'jos'], ['now', 'nyt'], ['again', 'uudelleen'],
  ['always', 'aina'], ['never', 'ei koskaan'], ['ready', 'valmis'], ['correct', 'oikea'],
  ['wrong', 'väärä'], ['works', 'toimii'], ['and', 'ja'], ['or', 'tai'], ['with', 'kanssa'],
  ['without', 'ilman'], ['from', 'alkaen'], ['in', 'sisällä'], ['under', 'alla'], ['over', 'yli'],
]

// Teknisk engelsk↔svensk fallback med samme ordforråd som den finske.
const SV_WORDS: Array<[string, string]> = [
  ['press', 'tryck'], ['click', 'klicka'], ['select', 'välj'], ['open', 'öppna'],
  ['close', 'stäng'], ['insert', 'sätt in'], ['remove', 'ta bort'], ['connect', 'anslut'],
  ['disconnect', 'koppla från'], ['scan', 'skanna'], ['print', 'skriv ut'], ['enter', 'ange'],
  ['confirm', 'bekräfta'], ['cancel', 'avbryt'], ['save', 'spara'], ['delete', 'radera'],
  ['start', 'starta'], ['stop', 'stoppa'], ['restart', 'starta om'],
  ['check', 'kontrollera'], ['verify', 'verifiera'], ['wait', 'vänta'], ['run', 'kör'],
  ['pack', 'packa'], ['place', 'placera'], ['attach', 'fäst'],
  ['terminal', 'terminal'], ['payment terminal', 'betalterminal'], ['receipt', 'kvitto'],
  ['power', 'ström'], ['cable', 'kabel'], ['screen', 'skärm'], ['button', 'knapp'],
  ['menu', 'meny'], ['settings', 'inställningar'], ['order', 'order'], ['delivery', 'leverans'],
  ['shipment', 'försändelse'], ['label', 'etikett'], ['printer', 'skrivare'],
  ['keyboard', 'tangentbord'], ['mouse', 'mus'], ['network', 'nätverk'],
  ['error', 'fel'], ['warning', 'varning'], ['problem', 'problem'], ['guide', 'guide'],
  ['step', 'steg'], ['section', 'avsnitt'], ['page', 'sida'], ['number', 'nummer'],
  ['country', 'land'], ['agreement', 'avtal'], ['box', 'låda'], ['bag', 'påse'],
  ['warehouse', 'lager'], ['address', 'adress'], ['field', 'fält'], ['icon', 'ikon'],
  ['card', 'kort'], ['user', 'användare'], ['password', 'lösenord'], ['username', 'användarnamn'],
  ['update', 'uppdatering'], ['installation', 'installation'], ['configuration', 'konfiguration'],
  ['battery', 'batteri'], ['charger', 'laddare'], ['new', 'ny'], ['old', 'gammal'],
  ['next', 'nästa'], ['previous', 'föregående'], ['first', 'först'], ['then', 'sedan'],
  ['when', 'när'], ['if', 'om'], ['now', 'nu'], ['again', 'igen'],
  ['always', 'alltid'], ['never', 'aldrig'], ['ready', 'klar'], ['correct', 'rätt'],
  ['wrong', 'fel'], ['works', 'fungerar'], ['and', 'och'], ['or', 'eller'], ['with', 'med'],
  ['without', 'utan'], ['from', 'från'], ['in', 'i'], ['under', 'under'], ['over', 'över'],
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
const enToFi = new Map(FI_WORDS)
const fiToEn = new Map<string, string>(FI_WORDS.map(([en, fi]) => [fi, en] as [string, string]))
// 'error' and 'wrong' are both 'fel'; the first English word wins on the way back.
const enToSv = new Map(SV_WORDS)
const svToEn = new Map<string, string>([...SV_WORDS].reverse().map(([en, sv]) => [sv, en] as [string, string]))
const WORD_LISTS: Partial<Record<GuideLanguage, { fromEn: Map<string, string>; toEn: Map<string, string> }>> = {
  fi: { fromEn: enToFi, toEn: fiToEn },
  sv: { fromEn: enToSv, toEn: svToEn },
}

/** Ordpar (da, en) til tosproget søge-udvidelse. */
export function getDictionaryPairs(): Array<[string, string]> {
  return WORDS.filter(([, en]) => en && !en.includes(' '))
}

const DA_MARKERS = new Set(['og', 'ikke', 'det', 'der', 'til', 'på', 'med', 'som', 'af', 'skal', 'kan', 'når', 'hvis', 'eller', 'også', 'være', 'bliver', 'derefter', 'vælg', 'tryk', 'åbn', 'indsæt'])
const EN_MARKERS = new Set(['the', 'and', 'not', 'that', 'this', 'with', 'from', 'will', 'can', 'when', 'if', 'or', 'also', 'be', 'is', 'are', 'then', 'select', 'press', 'open', 'insert', 'into'])
const FI_MARKERS = new Set(['ja', 'ei', 'että', 'tämä', 'kanssa', 'alkaen', 'voi', 'kun', 'jos', 'tai', 'myös', 'on', 'ovat', 'sitten', 'valitse', 'paina', 'avaa', 'aseta', 'joka', 'tallenna'])
const SV_MARKERS = new Set(['och', 'inte', 'det', 'är', 'att', 'på', 'med', 'som', 'av', 'ska', 'kan', 'när', 'om', 'eller', 'också', 'vara', 'blir', 'sedan', 'välj', 'tryck', 'öppna', 'klicka', 'för', 'till', 'från', 'du', 'jag', 'har', 'menyn', 'knappen'])

/** Heuristisk sprogdetektion: stopord + bogstaver. æ/ø er kun dansk; å deles af dansk/svensk, ä/ö af svensk/finsk. */
export function detectLanguage(text: string, fallback: GuideLanguage = 'en'): GuideLanguage {
  if (/[æø]/i.test(text)) return 'da'
  const tokens = text.toLowerCase().split(/[^a-zæøåäö]+/).filter(Boolean)
  const score: Record<GuideLanguage, number> = { da: 0, en: 0, fi: 0, sv: 0 }
  for (const token of tokens) {
    if (DA_MARKERS.has(token)) score.da++
    if (EN_MARKERS.has(token)) score.en++
    if (FI_MARKERS.has(token)) score.fi++
    if (SV_MARKERS.has(token)) score.sv++
  }
  if (/å/i.test(text)) { score.da++; score.sv++ }
  if (/[äö]/i.test(text)) { score.fi++; score.sv++ }
  const scores = (Object.entries(score) as Array<[GuideLanguage, number]>).sort((a, b) => b[1] - a[1])
  if (scores[0][1] === scores[1][1]) return fallback
  return scores[0][0]
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

  // Without a direct word list (da↔fi, da↔sv, fi↔sv) the fallback pivots through English,
  // just like the neural engine does.
  if (from !== 'en' && to !== 'en') return translateText(translateText(text, from, 'en'), 'en', to)

  const list = WORD_LISTS[from === 'en' ? to : from]
  if (list) {
    const words = from === 'en' ? list.fromEn : list.toEn
    return text.replace(/[A-Za-zÄÖÅäöå]+/g, (word) => {
      const translated = words.get(word.toLowerCase())
      return translated === undefined ? word : matchCase(word, translated)
    })
  }

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
