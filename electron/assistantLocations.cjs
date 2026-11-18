// Hubert's live answers about Placeringer (Arbejdsværktøjer) for TCD and TRR: where a material stands (FIFO), what to refill
// a pick place with, free places, what stands on a place, a shelf or a rack, where a 49/50 number is and what the log says happened. Runs in the
// main process next to the warehouse services and reads through them as the signed-in Hub person, so the module's own
// rules apply: own team only, other hubs are refused. Read only: write requests get "I only read" and a button to
// Placeringer, undo requests a button to the log (Hubert never undoes); how-to questions are left to Hubert's guides.
const { isHowToQuestion } = require('./assistantAppGuide.cjs')

const B = body => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'u')
const norm = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()

const MATERIAL = /(?<![\p{L}\p{N}-])([a-z]{1,5}\d{2,5}-\d{2,5}(?:-\d{1,2})?)(?![\p{L}\p{N}-])/iu
const DOCUMENT = /(?<!\d)((?:49|50)\d{8}(?:\s+\d{4}(?:\s+\d{1,4})?)?)(?!\d)/
const LOCATION = /(?<![\p{L}\p{N}.-])([a-z]{1,4}\d{1,3}(?:\.(?:\d{1,2}|gulv))?)(?![\p{L}\p{N}-]|\.\d)/giu
// A shelf in a rack: "E9 H5" is one place (rack E9, shelf 5), read before single places so it is not E9 and H5.
const SHELF = /(?<![\p{L}\p{N}.])([a-z]{1,4}\d{1,3}) h(\d{1,2})(?![\p{L}\p{N}.])/iu
// "hvad står i reol E9", "what is in rack E9", "mitä hyllykössä E9 on", "vad står i reol E9".
const RACK = /(?<![\p{L}\p{N}])(?:reol(?:en)?|rack|hyllyk\p{L}*)\s+([a-z]{1,4}\d{1,3})(?![\p{L}\p{N}.])/iu
// Storage locations (D000), quarters and SAP codes look like places but are not.
const NOT_A_PLACE = /^(?:d\d{3}|q\d|mi\d+|mb\d+|iq\d+|me\d+|zms\d*)$/i

const TOPIC = B(String.raw`placering\p{L}*|plads\p{L}*|palle\p{L}*|pluk\p{L}*|reserveplad\p{L}*|locations?|pallets?|pick places?|sijain\p{L}*|paik\p{L}*|lava\p{L}*|keräily\p{L}*|plats\p{L}*|pall\p{L}*|plock\p{L}*`)
const FETCH = B(String.raw`hvor henter jeg|hvor får jeg|where do i get|where can i get|mistä haen|mistä saan|var hämtar jag|var får jag`)
// Optælling's own questions ("hvor mange … i optællingen") and SAP codes belong to the other answers.
const OTHER = B(String.raw`optæll\p{L}*|stock[ -]?counts?|stocktake|inventering\p{L}*|inventoin\p{L}*|mi\d{2}|mb\d{2}|iq\d{2}|zms_[\p{L}\d_]+`)
const POLITE = /^(?:kan du|vil du|kunne du|can you|could you|would you|please|voitko|voisitko|vill du|kan du|skulle du)\s+/u
const WRITE = /^(?:tag|tage|flyt\p{L}*|sæt|sætte|læg|lægge|slet|slette|registrer\p{L}*|marker\p{L}*|markér|take|move|put|mark|register|delete|remove|siirrä|siirtää|ota|merkitse|poista|laita|ta|flytta|sätt|lägg|markera|radera)(?![\p{L}\p{N}])/u
const REFILL = B(String.raw`fyld\p{L}*|refill\p{L}*|täyt\p{L}*|fyll\p{L}*|fylla`)
const EMPTY = B(String.raw`løbet tør|løber tør|tom|tomme|run empty|ran empty|empty|tyhj\p{L}*|loppu\p{L}*|tomma|slut`)
const FREE = B(String.raw`ledig\p{L}*|free places?|free slots?|free|vacant|vapaa\p{L}*`)
const CONTENTS = B(String.raw`hvad står (?:der )?på|hvad er der på|hvad ligger (?:der )?på|what is on|what's on|what stands on|mitä|vad står (?:det )?på|vad finns (?:det )?på|vad ligger (?:det )?på`)
const WHERE = B(String.raw`hvor|where|missä|mistä|var|vart`)
// "Hvad er der sket med A1.1?", "hvem flyttede pallen fra C1.3?": the log, never an undo.
const HISTORY = B(String.raw`hvad er der sket|hvad er sket|hvad skete der|sket med|skete med|hvem (?:har )?(?:flyttede|flyttet|tog|taget|satte|sat|rettede|rettet|fyldte|fyldt|ændrede|ændret)|historik\p{L}*|loggen|what happened|what has happened|happened to|who (?:has )?(?:moved|took|taken|put|changed|edited|refilled)|history|tapahtu\p{L}*|kuka (?:siirsi|otti|laittoi|muutti|täytti)|historia\p{L}*|loki\p{L}*|vad har hänt|vad hände|hänt med|vem (?:har )?(?:flyttade|flyttat|tog|tagit|satte|satt|ändrade|ändrat|fyllde)|loggen`)
const UNDO = /^(?:fortryd\p{L}*|undo|revert|peru(?:a|ta|tko|isitko)?|kumoa|ångra\p{L}*)(?![\p{L}\p{N}])/u
const TODAY = B(String.raw`i dag|idag|today|tänään`)
const FILLER = B(String.raw`hvor|henter|får|finder|står|er|jeg|man|de|den|det|en|et|med|på|til|nogle|where|do|can|is|are|the|a|an|i|get|find|with|for|of|missä|mistä|haen|saan|on|var|hämtar|får|jag|finns|står|med|pallen|paller|pallerne|pallet|pallets|lava|lavat|pall|pallar`)

/** What a question asks about Placeringer, or null when it is not about Placeringer's own data; "strong" tells whether it surely is. */
function locationsIntent(question) {
  const q = norm(question)
  if (!q || OTHER.test(q)) return null
  const material = MATERIAL.exec(q)?.[1]?.toUpperCase()
  const document = DOCUMENT.exec(q)?.[1]
  const shelfMatch = SHELF.exec(q)
  // Shelf and rack words alone ("hylden til returvarer", "my rack") are common elsewhere: only a shelf name or a rack
  // with its name makes the question Placeringer's. Q3 H1 is a quarter, not a shelf.
  const shelf = shelfMatch && !NOT_A_PLACE.test(shelfMatch[1]) ? `${shelfMatch[1].toUpperCase()} H${Number(shelfMatch[2])}` : null
  const rackMatch = shelf ? null : RACK.exec(q)?.[1]
  const rack = rackMatch && !NOT_A_PLACE.test(rackMatch) ? rackMatch.toUpperCase() : null
  const withoutCodes = q.replace(MATERIAL, ' ').replace(DOCUMENT, ' ').replace(shelf ? SHELF : /$^/, ' ')
  const location = shelf || [...withoutCodes.matchAll(LOCATION)].map(match => match[1]).find(name => !NOT_A_PLACE.test(name))?.toUpperCase()
  if (!material && !document && !location && !TOPIC.test(q) && !FETCH.test(q)) return null
  // A Placeringer word, a material or a 49/50 number makes the question Placeringer's own; a place-like token ("P2",
  // "M3") or a fetch phrase alone does not, and such questions fall through to Hubert's other answers when nothing is found.
  const strong = Boolean(TOPIC.test(q) || material || document || shelf || rack)
  const result = intent => (intent ? { ...intent, strong } : null)
  const bare = q.replace(POLITE, '')
  const token = location || material || document
  if (UNDO.test(bare)) return strong || location ? result({ intent: 'undo', ...(token ? { token } : {}) }) : null
  if (WRITE.test(bare)) return strong ? result({ intent: 'write' }) : null
  if (rack) return result({ intent: 'rack', rack })
  if (token && HISTORY.test(q)) return result({ intent: 'history', token, kind: location ? 'location' : material ? 'material' : 'document', today: TODAY.test(q) })
  return result(readIntent(q, question, { material, document, location, token: Boolean(token) }))
}

function readIntent(q, question, { material, document, location, token }) {
  if (!token && !FETCH.test(q) && isHowToQuestion(question)) return null
  if (document) return { intent: 'find-document', document }
  if (FREE.test(q)) return { intent: 'free', ...(material ? { material } : {}) }
  if (location && (EMPTY.test(q) || REFILL.test(q))) return { intent: 'refill', location, ...(material ? { material } : {}) }
  if (material && REFILL.test(q)) return { intent: 'refill', material }
  if (location && !material && (CONTENTS.test(q) || WHERE.test(q))) return { intent: 'contents', location }
  if (material && (WHERE.test(q) || FETCH.test(q))) return { intent: 'where', material }
  if (!token && (WHERE.test(q) || FETCH.test(q))) {
    const query = q.replace(FETCH, ' ').replace(/[?!.,:;"']/g, ' ').split(/\s+/).filter(word => word && !FILLER.test(word) && !TOPIC.test(word)).join(' ')
    return query ? { intent: 'where', query } : null
  }
  return null
}

const LOCALES = { da: 'da-DK', en: 'en-GB', fi: 'fi-FI', sv: 'sv-SE' }
const TEXT = {
  da: {
    name: 'Placeringer', open: 'Åbn Placeringer', openItem: name => `Åbn ${name}`, refillButton: name => `Fyld ${name} op`, putAway: 'Sæt palle på plads',
    only: 'Placeringer (Arbejdsværktøjer) findes kun i TCD- og TRR-hubben. Åbn TCD- eller TRR-hubben.',
    readOnly: 'Jeg kan kun læse i Placeringer. Sæt på plads, tag, flyt og fyld op gør du selv i Placeringer.',
    unavailable: 'Placeringer kan ikke læses lige nu. Prøv igen om lidt.',
    age: days => (days <= 0 ? 'i dag' : days === 1 ? '1 dag' : `${days} dage`), pcs: qty => `${qty} stk.`,
    station: 'Arbejdsstation', pick: 'Pluk-plads', reserve: 'Reservepaller, ældste først', more: n => `og ${n} til`, total: qty => `Samlet: ${qty} stk.`,
    noPallets: material => `Der står ingen reservepaller med ${material}.`,
    nothingFound: query => `Jeg fandt intet materiale i Placeringer, der passer til "${query}".`, others: list => `Andre materialer: ${list}`,
    notFound: name => `Placeringen ${name} findes ikke i Placeringer.`, notPick: name => `${name} er ikke en pluk-plads.`,
    refill: (place, label, from) => `Fyld ${place} op med ${label} fra ${from} – den ældste reservepalle.`, noReserve: (place, label) => `${place} skal have ${label}, men der står ingen reservepalle med materialet.`,
    freeTitle: 'Ledige pladser', reasons: { fixed: 'fast plads', near: 'nær samme materiale', free: 'ledig' },
    noFree: 'Der er ingen ledige reservepladser til materialet.', freeAreas: 'Ledige pladser pr. område:',
    contents: (name, purpose) => `${name} (${purpose}):`, placeEmpty: name => `${name} er tom.`, purposes: { reserve: 'reserve', pick: 'pluk-plads', station: 'arbejdsstation', reserved: 'reserveret' },
    document: (doc, where) => `49/50-nummer ${doc} står på ${where}.`, noDocument: doc => `Ingen palle med 49/50-nummeret ${doc} i Placeringer.`,
    shelves: list => `Hylder: ${list}`, rackTitle: rack => `Reol ${rack}:`, emptyShelf: 'tom', openRack: rack => `Åbn reol ${rack}`, noRack: rack => `Reolen ${rack} findes ikke i Placeringer.`,
    log: 'Åbn loggen', logTitle: (token, today) => `Loggen for ${token}${today ? ' i dag' : ''}:`, noLog: (token, today) => `Ingen handlinger i loggen for ${token}${today ? ' i dag' : ' de seneste 3 måneder'}.`, undone: 'fortrudt',
    noUndo: 'Jeg fortryder aldrig selv. En manager eller Placerings admin kan fortryde én handling ad gangen i Placeringer > Log.',
    events: { putaway: (e, q) => `Sat på plads på ${e.location}${q}`, take: (e, q) => `Taget fra ${e.location}${q}`, move: e => `Flyttet ${e.from} → ${e.to}`, sloc: e => `Storage location ${e.from} → ${e.to}`, refill: (e, q) => `${e.location} fyldt op fra ${e.from}${q}`, 'edit-pallet': () => 'Pallen rettet', series: () => 'Placeringer oprettet', created: e => `Placeringen ${e.location} oprettet`, location: e => `Placeringen ${e.location} rettet`, import: () => 'Placeringsarket importeret', undo: e => (e.location ? `Fortrød en handling på ${e.location}` : 'Fortrød en handling') },
  },
  en: {
    name: 'Locations', open: 'Open Locations', openItem: name => `Open ${name}`, refillButton: name => `Refill ${name}`, putAway: 'Put a pallet away',
    only: 'Locations (Work Tools) is only in the TCD and TRR hubs. Open the TCD or TRR hub.',
    readOnly: 'I can only read in Locations. You put away, take, move and refill in Locations yourself.',
    unavailable: 'Locations cannot be read right now. Try again in a moment.',
    age: days => (days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`), pcs: qty => `${qty} pcs`,
    station: 'Work station', pick: 'Pick place', reserve: 'Reserve pallets, oldest first', more: n => `and ${n} more`, total: qty => `Total: ${qty} pcs`,
    noPallets: material => `There are no reserve pallets with ${material}.`,
    nothingFound: query => `I found no material in Locations that matches "${query}".`, others: list => `Other materials: ${list}`,
    notFound: name => `The location ${name} does not exist in Locations.`, notPick: name => `${name} is not a pick place.`,
    refill: (place, label, from) => `Refill ${place} with ${label} from ${from} – the oldest reserve pallet.`, noReserve: (place, label) => `${place} needs ${label}, but there is no reserve pallet with the material.`,
    freeTitle: 'Free places', reasons: { fixed: 'fixed place', near: 'near the same material', free: 'free' },
    noFree: 'There are no free reserve places for the material.', freeAreas: 'Free places per area:',
    contents: (name, purpose) => `${name} (${purpose}):`, placeEmpty: name => `${name} is empty.`, purposes: { reserve: 'reserve', pick: 'pick place', station: 'work station', reserved: 'reserved' },
    document: (doc, where) => `49/50 number ${doc} is on ${where}.`, noDocument: doc => `No pallet with the 49/50 number ${doc} in Locations.`,
    shelves: list => `Shelves: ${list}`, rackTitle: rack => `Rack ${rack}:`, emptyShelf: 'empty', openRack: rack => `Open rack ${rack}`, noRack: rack => `The rack ${rack} does not exist in Locations.`,
    log: 'Open the log', logTitle: (token, today) => `The log for ${token}${today ? ' today' : ''}:`, noLog: (token, today) => `No actions in the log for ${token}${today ? ' today' : ' in the last 3 months'}.`, undone: 'undone',
    noUndo: 'I never undo anything myself. A manager or Placerings admin can undo one action at a time in Locations > Log.',
    events: { putaway: (e, q) => `Put away on ${e.location}${q}`, take: (e, q) => `Taken from ${e.location}${q}`, move: e => `Moved ${e.from} → ${e.to}`, sloc: e => `Storage location ${e.from} → ${e.to}`, refill: (e, q) => `${e.location} refilled from ${e.from}${q}`, 'edit-pallet': () => 'Pallet edited', series: () => 'Locations created', created: e => `Location ${e.location} created`, location: e => `Location ${e.location} edited`, import: () => 'Placement sheet imported', undo: e => (e.location ? `Undid an action on ${e.location}` : 'Undid an action') },
  },
  fi: {
    name: 'Sijainnit', open: 'Avaa Locations', openItem: name => `Avaa ${name}`, refillButton: name => `Täytä ${name}`, putAway: 'Laita lava paikalleen',
    only: 'Sijainnit (Työkalut) ovat vain TCD- ja TRR-hubissa. Avaa TCD- tai TRR-hub.',
    readOnly: 'Voin vain lukea sijainteja. Lavan paikalleen laitto, otto, siirto ja täyttö tehdään itse näkymässä Locations.',
    unavailable: 'Sijainteja ei voi lukea juuri nyt. Yritä hetken päästä uudelleen.',
    age: days => (days <= 0 ? 'tänään' : days === 1 ? '1 päivä' : `${days} päivää`), pcs: qty => `${qty} kpl`,
    station: 'Työpiste', pick: 'Keräilypaikka', reserve: 'Varalavat, vanhin ensin', more: n => `ja ${n} muuta`, total: qty => `Yhteensä: ${qty} kpl`,
    noPallets: material => `Materiaalista ${material} ei ole varalavoja.`,
    nothingFound: query => `En löytänyt materiaalia, joka vastaa hakua "${query}".`, others: list => `Muut materiaalit: ${list}`,
    notFound: name => `Sijaintia ${name} ei ole.`, notPick: name => `${name} ei ole keräilypaikka.`,
    refill: (place, label, from) => `Täytä ${place} materiaalilla ${label} paikasta ${from} – vanhin varalava.`, noReserve: (place, label) => `${place} tarvitsee materiaalia ${label}, mutta varalavaa ei ole.`,
    freeTitle: 'Vapaat paikat', reasons: { fixed: 'kiinteä paikka', near: 'saman materiaalin lähellä', free: 'vapaa' },
    noFree: 'Materiaalille ei ole vapaita varapaikkoja.', freeAreas: 'Vapaat paikat alueittain:',
    contents: (name, purpose) => `${name} (${purpose}):`, placeEmpty: name => `${name} on tyhjä.`, purposes: { reserve: 'vara', pick: 'keräilypaikka', station: 'työpiste', reserved: 'varattu' },
    document: (doc, where) => `49/50-numero ${doc} on paikassa ${where}.`, noDocument: doc => `Lavaa 49/50-numerolla ${doc} ei ole.`,
    shelves: list => `Hyllyt: ${list}`, rackTitle: rack => `Hyllykkö ${rack}:`, emptyShelf: 'tyhjä', openRack: rack => `Avaa hyllykkö ${rack}`, noRack: rack => `Hyllykköä ${rack} ei ole.`,
    log: 'Avaa loki', logTitle: (token, today) => `Loki: ${token}${today ? ' tänään' : ''}:`, noLog: (token, today) => `Lokissa ei ole toimintoja: ${token}${today ? ' tänään' : ' viimeisten 3 kuukauden aikana'}.`, undone: 'peruttu',
    noUndo: 'En koskaan peru mitään itse. Manager tai Placerings admin voi perua yhden toiminnon kerrallaan kohdassa Locations > Loki.',
    events: { putaway: (e, q) => `Laitettu paikalleen paikkaan ${e.location}${q}`, take: (e, q) => `Otettu paikasta ${e.location}${q}`, move: e => `Siirretty ${e.from} → ${e.to}`, sloc: e => `Storage location ${e.from} → ${e.to}`, refill: (e, q) => `${e.location} täytetty paikasta ${e.from}${q}`, 'edit-pallet': () => 'Lavaa muokattu', series: () => 'Sijainnit luotu', created: e => `Sijainti ${e.location} luotu`, location: e => `Sijaintia ${e.location} muokattu`, import: () => 'Sijoitustaulukko tuotu', undo: e => (e.location ? `Peruttiin toiminto paikassa ${e.location}` : 'Peruttiin toiminto') },
  },
  sv: {
    name: 'Placeringar', open: 'Öppna Locations', openItem: name => `Öppna ${name}`, refillButton: name => `Fyll på ${name}`, putAway: 'Sätt en pall på plats',
    only: 'Placeringar (Arbetsverktyg) finns bara i TCD- och TRR-hubben. Öppna TCD- eller TRR-hubben.',
    readOnly: 'Jag kan bara läsa i placeringarna. Du sätter på plats, tar, flyttar och fyller på själv i Locations.',
    unavailable: 'Placeringarna kan inte läsas just nu. Försök igen om en stund.',
    age: days => (days <= 0 ? 'i dag' : days === 1 ? '1 dag' : `${days} dagar`), pcs: qty => `${qty} st.`,
    station: 'Arbetsstation', pick: 'Plockplats', reserve: 'Reservpallar, äldst först', more: n => `och ${n} till`, total: qty => `Totalt: ${qty} st.`,
    noPallets: material => `Det finns inga reservpallar med ${material}.`,
    nothingFound: query => `Jag hittade inget material som passar "${query}".`, others: list => `Andra material: ${list}`,
    notFound: name => `Placeringen ${name} finns inte.`, notPick: name => `${name} är ingen plockplats.`,
    refill: (place, label, from) => `Fyll på ${place} med ${label} från ${from} – den äldsta reservpallen.`, noReserve: (place, label) => `${place} behöver ${label}, men det finns ingen reservpall med materialet.`,
    freeTitle: 'Lediga platser', reasons: { fixed: 'fast plats', near: 'nära samma material', free: 'ledig' },
    noFree: 'Det finns inga lediga reservplatser för materialet.', freeAreas: 'Lediga platser per område:',
    contents: (name, purpose) => `${name} (${purpose}):`, placeEmpty: name => `${name} är tom.`, purposes: { reserve: 'reserv', pick: 'plockplats', station: 'arbetsstation', reserved: 'reserverad' },
    document: (doc, where) => `49/50-nummer ${doc} står på ${where}.`, noDocument: doc => `Ingen pall med 49/50-numret ${doc}.`,
    shelves: list => `Hyllor: ${list}`, rackTitle: rack => `Reol ${rack}:`, emptyShelf: 'tom', openRack: rack => `Öppna reol ${rack}`, noRack: rack => `Reolen ${rack} finns inte.`,
    log: 'Öppna loggen', logTitle: (token, today) => `Loggen för ${token}${today ? ' i dag' : ''}:`, noLog: (token, today) => `Inga åtgärder i loggen för ${token}${today ? ' i dag' : ' de senaste 3 månaderna'}.`, undone: 'ångrad',
    noUndo: 'Jag ångrar aldrig något själv. En manager eller Placerings admin kan ångra en åtgärd i taget i Locations > Logg.',
    events: { putaway: (e, q) => `Satt på plats på ${e.location}${q}`, take: (e, q) => `Tagen från ${e.location}${q}`, move: e => `Flyttad ${e.from} → ${e.to}`, sloc: e => `Storage location ${e.from} → ${e.to}`, refill: (e, q) => `${e.location} påfylld från ${e.from}${q}`, 'edit-pallet': () => 'Pallen ändrad', series: () => 'Placeringar skapade', created: e => `Placeringen ${e.location} skapad`, location: e => `Placeringen ${e.location} ändrad`, import: () => 'Placeringsarket importerat', undo: e => (e.location ? `Ångrade en åtgärd på ${e.location}` : 'Ångrade en åtgärd') },
  },
}

const RESERVE_LIMIT = 5
const LIST_LIMIT = 15
const HISTORY_LIMIT = 8

function createLocationsAssistant({ userFor, service, now = Date.now }) {
  async function answer({ event, question, language }) {
    const asked = locationsIntent(question)
    if (!asked) return null
    const lang = TEXT[language] ? language : 'da'
    const t = TEXT[lang]
    const number = value => new Intl.NumberFormat(LOCALES[lang]).format(value || 0)
    const label = (material, description) => (description ? `${material} · ${description}` : material)
    const reply = (text, navigation, user) => ({ mode: 'data', text, sources: user ? [{ kind: 'warehouse', teamId: user.team, title: `${user.team} · ${t.name}` }] : [], contextQuestion: question, ...(navigation ? { navigation } : {}) })
    const nav = (itemId, text) => ({ view: 'warehouse', params: { tab: 'locations', ...(itemId ? { itemId } : {}) }, label: text })
    const toModule = nav(null, t.open)
    const palletText = pallet => `${pallet.location} (${[t.age(pallet.ageDays), pallet.quantity === null || pallet.quantity === undefined ? null : t.pcs(number(pallet.quantity))].filter(Boolean).join(', ')})`

    let user
    try {
      user = await userFor(event)
    } catch (error) {
      if (error?.code === 'WAREHOUSE_TEAM_NOT_ALLOWED') return asked.strong ? reply(t.only) : null
      throw error
    }
    // Hubert reads only; changes are made in Placeringer itself, where its own checks apply.
    if (asked.intent === 'write') return reply(t.readOnly, toModule, user)
    if (asked.intent === 'undo') return reply(t.noUndo, nav(asked.token ? `log:${asked.token}` : 'log', t.log), user)

    /** One log line: "14.05 · Bo Berg · Taget fra A1.1 · 5" (with the date when it was not today). */
    function logLine(event, midnight) {
      const quantity = event.quantity === null || event.quantity === undefined ? '' : ` · ${number(event.quantity)}`
      const kind = event.type === 'location' && event.changes?.series ? 'series' : event.type === 'location' && event.changes?.created ? 'created' : event.type
      const what = (t.events[kind] || (() => event.type))(event, quantity)
      const clock = new Intl.DateTimeFormat(LOCALES[lang], { hour: '2-digit', minute: '2-digit' }).format(event.at)
      const when = event.at >= midnight ? clock : `${new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'numeric' }).format(event.at)} ${clock}`
      return `${when} · ${event.by?.name || '?'} · ${what}${event.undoneAt ? ` (${t.undone})` : ''}`
    }

    async function history({ token, kind, today }) {
      const midnight = new Date(now()).setHours(0, 0, 0, 0)
      const log = await service.log(user, { query: token, days: today ? 1 : 90, verdicts: false })
      // The log searches by prefix (A1.1 also finds A1.10); Hubert answers about exactly the place or material asked.
      const exact = event => (kind === 'location' ? [event.location, event.from, event.to].some(value => String(value || '').toUpperCase() === token) : kind === 'material' ? event.material === token : true)
      const events = log.events.filter(event => exact(event) && (!today || event.at >= midnight))
      const button = nav(`log:${token}`, t.log)
      if (!events.length) return asked.strong ? reply(t.noLog(token, today), button, user) : null
      const lines = [t.logTitle(token, today), ...events.slice(0, HISTORY_LIMIT).map(event => logLine(event, midnight))]
      if (events.length > HISTORY_LIMIT) lines.push(t.more(events.length - HISTORY_LIMIT))
      return reply(lines.join('\n'), button, user)
    }

    async function whereIs(material, others = []) {
      const card = await service.materialCard(user, { material })
      const lines = [`${label(card.material, card.description)}:`]
      if (card.stations.length) lines.push(`${t.station}: ${card.stations.map(item => item.name).join(', ')}`)
      if (card.pickPlaces.length) lines.push(`${t.pick}: ${card.pickPlaces.map(item => item.name).join(', ')}`)
      if (card.reserve.length) {
        const shown = card.reserve.slice(0, RESERVE_LIMIT).map(palletText).join(', ')
        lines.push(`${t.reserve}: ${shown}${card.reserve.length > RESERVE_LIMIT ? ` ${t.more(card.reserve.length - RESERVE_LIMIT)}` : ''}`)
        lines.push(t.total(number(card.total)))
      } else lines.push(t.noPallets(card.material))
      if (card.shelves?.length) lines.push(t.shelves(card.shelves.map(item => `${item.name} (${t.pcs(number(item.quantity))})`).join(', ')))
      if (others.length) lines.push(t.others(others.map(item => label(item.material, item.description)).join('; ')))
      return reply(lines.join('\n'), nav(`material:${card.material}`, t.openItem(card.material)), user)
    }

    async function findMaterials(query) {
      const full = await service.search(user, { query })
      if (full.materials.length) return full.materials
      // "ethernet kabler": SAP's text is English, so single words are tried too, the longest first.
      for (const word of query.split(/\s+/).filter(item => item.length >= 3).sort((a, b) => b.length - a.length)) {
        const found = await service.search(user, { query: word })
        if (found.materials.length) return found.materials
      }
      return []
    }

    async function refillPlace(locationName, material) {
      const card = await service.locationCard(user, { location: locationName })
      const place = card.location
      if (place.purpose !== 'pick') return reply(t.notPick(place.name), nav(`location:${place.id}`, t.openItem(place.name)), user)
      const fixed = card.fixed.find(item => item.material === material) || card.fixed[0]
      if (!fixed) return reply(t.notPick(place.name), nav(`location:${place.id}`, t.openItem(place.name)), user)
      const oldest = (await service.materialCard(user, { material: fixed.material })).reserve[0]
      const text = oldest ? t.refill(place.name, label(fixed.material, fixed.description), palletText(oldest)) : t.noReserve(place.name, label(fixed.material, fixed.description))
      return reply(text, nav(`refill:${place.id}|${fixed.material}`, t.refillButton(place.name)), user)
    }

    try {
      if (asked.intent === 'history') return await history(asked)
      if (asked.intent === 'rack') {
        const card = await service.rackCard(user, { rack: asked.rack })
        const shelfText = ({ location, stock }) => (stock.length
          ? stock.map(line => `${label(line.material, line.description)} – ${t.pcs(number(line.quantity))}`).join('; ')
          : location.purpose === 'pick' && location.fixedMaterials?.length ? location.fixedMaterials.join(', ') : t.emptyShelf)
        const lines = [t.rackTitle(card.rack), ...card.shelves.map(item => `${item.location.name}: ${shelfText(item)}`)]
        return reply(lines.join('\n'), nav(`rack:${card.rack}`, t.openRack(card.rack)), user)
      }
      if (asked.intent === 'where') {
        if (asked.material) return await whereIs(asked.material)
        const materials = await findMaterials(asked.query)
        if (!materials.length) return asked.strong ? reply(t.nothingFound(asked.query), toModule, user) : null
        return await whereIs(materials[0].material, materials.slice(1, 5))
      }
      if (asked.intent === 'refill') {
        if (asked.location) return await refillPlace(asked.location, asked.material)
        const card = await service.materialCard(user, { material: asked.material })
        const pick = card.pickPlaces[0]
        return pick ? await refillPlace(pick.id, asked.material) : await whereIs(asked.material)
      }
      if (asked.intent === 'free') {
        if (!asked.material) {
          const overview = await service.overview(user)
          const areas = overview.areas.filter(area => area.free > 0).map(area => `${area.area} ${number(area.free)}`)
          return reply(areas.length ? `${t.freeAreas} ${areas.join(', ')}` : t.noFree, nav('putaway', t.putAway), user)
        }
        const suggestion = await service.suggest(user, { material: asked.material })
        const lines = []
        lines.push(suggestion.slots.length ? `${t.freeTitle}: ${suggestion.slots.map(slot => `${slot.location} (${t.reasons[slot.reason]})`).join(', ')}` : t.noFree)
        return reply(lines.join('\n'), nav('putaway', t.putAway), user)
      }
      if (asked.intent === 'contents') {
        const card = await service.locationCard(user, { location: asked.location })
        const place = card.location
        const lines = [t.contents(place.name, t.purposes[place.purpose] || place.purpose)]
        for (const item of card.fixed) lines.push(`• ${label(item.material, item.description)}`)
        for (const pallet of card.pallets) lines.push(`• ${label(pallet.material, pallet.description)} – ${[pallet.quantity === null ? null : t.pcs(number(pallet.quantity)), t.age(pallet.ageDays)].filter(Boolean).join(', ')}`)
        for (const line of card.stock || []) lines.push(`• ${label(line.material, line.description)} – ${t.pcs(number(line.quantity))}`)
        const text = lines.length > 1 ? lines.join('\n') : t.placeEmpty(place.name)
        return reply(text, nav(`location:${place.id}`, t.openItem(place.name)), user)
      }
      // A 49/50 number: the pallets registered with it.
      const found = await service.search(user, { query: asked.document })
      if (!found.pallets.length) return reply(t.noDocument(asked.document), toModule, user)
      const where = found.pallets.slice(0, LIST_LIMIT).map(pallet => `${pallet.location} (${label(pallet.material, pallet.description)}${pallet.quantity === null ? '' : `, ${t.pcs(number(pallet.quantity))}`})`).join(', ')
      const one = found.pallets.length === 1 ? found.pallets[0] : null
      return reply(t.document(asked.document, where), one ? nav(`pallet:${one.id}`, t.openItem(one.location)) : toModule, user)
    } catch (error) {
      if (error?.code === 'LOCATION_NOT_FOUND') return asked.strong ? reply(t.notFound(asked.location || ''), toModule, user) : null
      if (error?.code === 'RACK_INVALID') return reply(t.noRack(asked.rack || ''), toModule, user)
      console.error('Hubert: Placeringer unavailable', error?.code || error?.message)
      return reply(t.unavailable, toModule, user)
    }
  }
  return { answer }
}

module.exports = { createLocationsAssistant, locationsIntent }
