// Hubert's team actions: sick leave, a home-office day, a note, an internal message, a shared to-do and a high-five.
// PURE detection - nothing is written here. The renderer writes only after the user confirms the proposal,
// through the same shared functions the module screens use (src/lib/sickLeave.ts, src/lib/moduleWrites.ts,
// window.electronHighFives). Matching runs on the user's own words (`original`), so a message or note is
// proposed exactly as typed, emoji included.
const { aliasesFor, canonical, bounded, similarPeople, inflectedName } = require('./assistantPeople.cjs')
const { formatDay } = require('./assistantDateFormat.cjs')

const HIGH_FIVE_EMOJIS = ['🙌', '👏', '🎉', '💪', '🔥', '⭐', '🙏', '❤️']
const HIGH_FIVE_LIMIT = 200
const MESSAGE_LIMIT = 2000
const TITLE_LIMIT = 60

// `\b` in the sources below means a Unicode word boundary (plain \b fails next to æ, ø, å, ä and ö).
const WORD = '[\\p{L}\\p{N}]'
const rx = source => new RegExp(source.replace(/\\b/g, `(?:(?<!${WORD})(?=${WORD})|(?<=${WORD})(?!${WORD}))`), 'iu')

const ASKING = rx('\\b(?:hvem|hvornår|hvor mange|hvordan|hvorfor|who|when|how many|how|why|kuka|ketkä|milloin|montako|miten|kuinka|miksi|vem|när|hur många|hur|varför)\\b')
const POLITE = rx('^(?:(?:hej|hi|hello|moi|hei|hej hej)\\s+hubert[,!.]?\\s*)?(?:kan du|vil du|kunne du|gider du|can you|could you|would you|will you|please|voitko|voisitko|viitsitkö|skulle du|vill du|kan du)\\b')
const RECURRING = rx('\\b(?:hver|hvert|alle|fast|altid|every|always|joka|aina|varje|alltid)\\b')

const SICK_CHILD = rx('\\b(?:(?:meld|melde|registrer\\w*)\\s+(?:mit\\s+|vores\\s+)?barn(?:et)?\\s+syg|barn(?:et)?\\s+(?:er\\s+)?syg|mit\\s+barn\\s+er\\s+syg|barns?\\s+(?:første\\s+)?sygedag|(?:my\\s+)?(?:child|kid|son|daughter)\\s+(?:is\\s+)?sick|sick\\s+(?:child|kid)|lapsi\\s+(?:on\\s+)?sairas|lapsen\\s+sairau\\w*|sairas\\s+lapsi|vab(?:ba|bar)?|barn(?:et)?\\s+(?:är\\s+)?sjukt|sjukt\\s+barn)\\b')
const SICK_SELF = rx('\\b(?:(?:meld|melde|registrer|registrere)\\s+mig\\s+(?:som\\s+)?syg|sygemeld\\w*\\s+mig|jeg\\s+(?:er|bliver)\\s+syg|(?:report|register|mark|log)\\s+me\\s+(?:as\\s+)?sick|call(?:ing)?\\s+in\\s+sick|i(?:\'m|\\s+am)\\s+(?:off\\s+)?sick(?!\\s+of)|ilmoita\\s+(?:minut\\s+)?sairaaksi|olen\\s+sairaana|(?:kirjaa|ilmoita)\\s+sairauspoissaolo\\w*|sjukanmäl\\w*\\s+mig|(?:anmäl|registrera)\\s+mig\\s+(?:som\\s+)?sjuk|jag\\s+är\\s+sjuk)\\b')
const HOME_OFFICE = rx('\\b(?:(?:registrer|sæt|opret|meld|book|skriv)\\w*\\s+(?:mig\\s+)?(?:på\\s+|som\\s+|til\\s+)?hjemme(?:arbejde|kontor)|jeg\\s+(?:arbejder|sidder)\\s+(?:hjemme(?:fra)?|på\\s+hjemmekontor)|jeg\\s+har\\s+hjemmearbejde|hjemmearbejdsdag|(?:register|set|book|log|mark)\\s+(?:me\\s+)?(?:as\\s+)?(?:a\\s+)?(?:home\\s*office|wfh|working\\s+from\\s+home|remote\\s+work)|i(?:\'m|\\s+am|\\s+will\\s+be|\'ll\\s+be)\\s+working\\s+from\\s+home|i\\s+(?:will\\s+)?work\\s+from\\s+home|(?:kirjaa|merkitse|ilmoita)\\s+(?:minulle\\s+)?etä(?:työ|päivä)\\w*|teen\\s+etä(?:töitä|työtä)|olen\\s+etätöissä|(?:registrera|lägg\\s+in|boka|markera)\\s+(?:mig\\s+)?(?:som\\s+|på\\s+)?(?:hemarbete|hemmakontor|distansarbete)|jag\\s+(?:jobbar|arbetar)\\s+(?:hemifrån|hemma|på\\s+distans))\\b')
const NOTE = rx('\\b(?:(?:opret|lav|skriv|gem|tilføj|tag)\\w*\\s+(?:en\\s+|et\\s+)?(?:ny\\s+)?(?:(?:personlig|privat|delt|fælles)\\s+)?(?:note|notat)|(?:skriv|gem)\\s+(?:det\\s+)?(?:i|til)\\s+(?:min\\s+)?notesbog(?:en)?|(?:create|make|write|add|save|take|jot\\s+down)\\s+(?:a\\s+)?(?:new\\s+)?(?:(?:personal|private|shared|team)\\s+)?note|(?:write|save)\\s+(?:it\\s+)?(?:in|to)\\s+(?:my\\s+|the\\s+)?notebook|(?:luo|tee|kirjoita|lisää|tallenna)\\s+(?:uusi\\s+)?(?:(?:henkilökohtainen|yksityinen|jaettu|yhteinen)\\s+)?muistiinpano\\w*|(?:kirjoita|tallenna)\\s+muistikirjaan|(?:skapa|skriv|gör|lägg\\s+till|spara)\\s+(?:en\\s+)?(?:ny\\s+)?(?:(?:personlig|privat|delad|gemensam)\\s+)?anteckning\\w*|(?:skriv|spara)\\s+i\\s+anteckningsboken)\\b')
const NOTE_SHARED = rx('\\b(?:delt|fælles|shared|team|jaettu|yhteinen|delad|gemensam)\\b')
const FOR_TEAM = rx('\\b(?:til|for)\\s+(?:hele\\s+)?teamet|for\\s+the\\s+(?:whole\\s+)?team|tiimille|(?:för|åt)\\s+(?:hela\\s+)?teamet\\b')
const TEAM_TODO = rx('\\b(?:(?:opret|lav|tilf[øo]j)\\w*\\s+(?:en\\s+)?(?:team[- ]?|fælles\\s+)to-?do|(?:create|add|make)\\w*\\s+(?:a\\s+)?(?:team|shared)\\s+to-?do|(?:luo|lisää)\\s+(?:tiimin\\s+|yhteinen\\s+)to-?do|(?:skapa|lägg\\s+till|gör)\\s+(?:en\\s+)?(?:team-?|gemensam\\s+)(?:to-?do|att\\s+göra|uppgift))\\b')
const TEAM_TODO_TAIL = rx('\\b(?:(?:opret|lav|tilf[øo]j)\\w*\\s+(?:en\\s+)?to-?do\\s+(?:til|for|på)\\s+(?:teamet|holdet)|(?:create|add|make)\\w*\\s+(?:a\\s+)?to-?do\\s+for\\s+the\\s+team|(?:luo|lisää)\\s+to-?do\\s+tiimille|(?:skapa|lägg\\s+till)\\s+(?:en\\s+)?(?:to-?do|att\\s+göra)\\s+(?:för|åt)\\s+teamet)\\b')
const MESSAGE = [
  rx('\\b(?:send|sende|skriv|skrive)\\s+(?:en\\s+)?(?:intern\\s+)?(?:besked|mail|e-?mail|meddelelse)\\s+til\\s+(?<name>.+)$'),
  rx('\\b(?:send|sende)\\s+(?<name>.+?)\\s+en\\s+(?:besked|mail|e-?mail)\\b'),
  rx('\\b(?:skriv|send)\\s+til\\s+(?<name>.+)$'),
  rx('\\b(?:send|write)\\s+(?:an?\\s+)?(?:internal\\s+)?(?:message|mail|e-?mail)\\s+to\\s+(?<name>.+)$'),
  rx('\\bsend\\s+(?<name>.+?)\\s+an?\\s+(?:message|mail|e-?mail)\\b'),
  rx('\\b(?:write|send)\\s+to\\s+(?<name>.+)$'),
  rx('\\b(?:lähetä|kirjoita)\\s+(?:viesti|sähköposti)\\s+(?<name>.+)$'),
  rx('\\b(?:lähetä|kirjoita)\\s+(?<name>\\p{L}+lle)\\b'),
  rx('\\b(?:skicka|skriv)\\s+(?:ett\\s+)?(?:meddelande|mejl|mail|e-?post)\\s+till\\s+(?<name>.+)$'),
  rx('\\bskicka\\s+(?<name>.+?)\\s+ett\\s+(?:meddelande|mejl|mail)\\b'),
  rx('\\b(?:skriv|skicka)\\s+till\\s+(?<name>.+)$'),
]
const HIGH_FIVE_WORD = 'high[- ]?(?:five|fem|5)'
const HIGH_FIVE = rx(`\\b${HIGH_FIVE_WORD}\\b`)
const HIGH_FIVE_NAME = [
  rx(`\\b${HIGH_FIVE_WORD}s?\\s+(?:til|to|till)\\s+(?<name>.+)$`),
  rx(`\\b(?:giv|give|send|ge|skicka|anna|lähetä)\\s+(?<name>.+?)\\s+(?:(?:en|a|an|ett)\\s+)?${HIGH_FIVE_WORD}\\b(?<rest>.*)$`),
  rx(`\\b${HIGH_FIVE_WORD}\\s+(?<name>\\p{L}+lle)\\b(?<rest>.*)$`),
  rx(`^(?:${HIGH_FIVE_WORD})\\s+(?<name>.+)$`),
]
// Where a recipient's name stops and the reason or message starts.
const NAME_STOP = rx('\\s+(?:om|angående|fordi|for|og|about|regarding|because|for|and|that|siitä|koska|kiitos|om|angående|för|att|och|eftersom|tak|thanks|tack|med|with)\\b')
const THANKS_START = rx('^(?:tak|thanks|thank you|kiitos|tack)\\b')
const FOR_START = rx('^(?:for|för)\\b')

const TEXT = {
  da: {
    sick: (day, child) => child ? `Registrer barn syg ${day}? Din leder får automatisk besked.` : `Meld dig syg ${day}? Din leder får automatisk besked.`,
    homeOffice: day => `Registrer hjemmearbejde ${day}?`,
    homeOfficeRecurring: 'Jeg kan registrere én hjemmearbejdsdag ad gangen. Et fast ugemønster sætter du selv under Hjemmearbejde.',
    homeOfficeRange: 'Jeg kan registrere én hjemmearbejdsdag ad gangen. Skriv fx "registrer hjemmearbejde i morgen" eller "jeg arbejder hjemme fredag".',
    note: (title, personal) => personal ? `Opret en personlig note i Notesbog: "${title}"?` : `Opret en delt note i Notesbog, som hele teamet kan se: "${title}"?`,
    noteNoContent: 'Jeg forstod at du vil oprette en note, men jeg kunne ikke se hvad der skal stå i den. Prøv fx "opret en note: husk at bestille nye labels".',
    message: (name, text) => `Send en intern besked til ${name}: "${text}"?`,
    messageNoBody: (name, first) => `Hvad skal beskeden til ${name} indeholde? Skriv fx "send en besked til ${first}: mødet er flyttet til kl. 10".`,
    messageNoName: 'Hvem skal beskeden sendes til? Skriv fx "send en besked til Anne: mødet er flyttet til kl. 10".',
    messageTooLong: 'Beskeden er for lang til at sende via mig. Skriv den i Email-systemet i stedet.',
    teamTodo: (title, due, f) => `Opret en fælles to-do for teamet: "${title}"${due ? ` med forfaldsdato ${f.day(due)}` : ''}?`,
    teamTodoNoTitle: 'Jeg forstod at du vil oprette en fælles to-do, men jeg kunne ikke se en titel. Prøv fx "opret en team to-do: ryd op på lageret".',
    highFive: (emoji, name, text) => `Send en high-five ${emoji} til ${name}: "${text}"?`,
    highFiveSelf: 'Du kan ikke sende en high-five til dig selv – vælg en kollega.',
    highFiveNoName: 'Hvem skal have en high-five? Skriv fx "send en high-five til Anne for hjælpen i dag".',
    highFiveTooLong: 'En high-five må højst have 200 tegn tekst. Prøv en kortere hilsen.',
    highFiveDefault: 'Godt gået!',
    thanks: 'Tak',
    notFound: name => `Jeg kan ikke finde "${name}" blandt dine kolleger. Prøv personens fulde navn.`,
    didYouMean: (name, names) => `Jeg kan ikke finde "${name}". Mente du ${names}? Skriv det fulde navn, så laver jeg et nyt forslag.`,
    ambiguous: names => `Flere kolleger passer: ${names}. Skriv det fulde navn, så laver jeg et nyt forslag.`,
    or: 'eller',
  },
  en: {
    sick: (day, child) => child ? `Register a sick child ${day}? Your manager is notified automatically.` : `Report yourself sick ${day}? Your manager is notified automatically.`,
    homeOffice: day => `Register home office ${day}?`,
    homeOfficeRecurring: 'I can register one home-office day at a time. You set a fixed weekly pattern yourself under Home office.',
    homeOfficeRange: 'I can register one home-office day at a time. Try e.g. "register home office tomorrow" or "I am working from home on Friday".',
    note: (title, personal) => personal ? `Create a personal note in Notebook: "${title}"?` : `Create a shared note in Notebook that the whole team can see: "${title}"?`,
    noteNoContent: 'I understood you want to create a note, but I could not see what it should say. Try e.g. "create a note: remember to order new labels".',
    message: (name, text) => `Send an internal message to ${name}: "${text}"?`,
    messageNoBody: (name, first) => `What should the message to ${name} say? Try e.g. "send a message to ${first}: the meeting has moved to 10 am".`,
    messageNoName: 'Who should the message go to? Try e.g. "send a message to Anne: the meeting has moved to 10 am".',
    messageTooLong: 'That message is too long to send through me. Write it in the Email System instead.',
    teamTodo: (title, due, f) => `Create a shared to-do for the team: "${title}"${due ? `, due ${f.day(due)}` : ''}?`,
    teamTodoNoTitle: 'I understood you want to create a shared to-do, but I could not find a title. Try e.g. "create a team to-do: tidy the warehouse".',
    highFive: (emoji, name, text) => `Send a high-five ${emoji} to ${name}: "${text}"?`,
    highFiveSelf: 'You cannot send a high-five to yourself – pick a colleague.',
    highFiveNoName: 'Who should get a high-five? Try e.g. "send a high-five to Anne for the help today".',
    highFiveTooLong: 'A high-five can have at most 200 characters of text. Try a shorter greeting.',
    highFiveDefault: 'Great job!',
    thanks: 'Thanks',
    notFound: name => `I cannot find "${name}" among your colleagues. Try their full name.`,
    didYouMean: (name, names) => `I cannot find "${name}". Did you mean ${names}? Write the full name and I will make a new proposal.`,
    ambiguous: names => `Several colleagues match: ${names}. Write the full name and I will make a new proposal.`,
    or: 'or',
  },
  fi: {
    sick: (day, child) => child ? `Kirjataanko lapsen sairaus ${day}? Esihenkilösi saa ilmoituksen automaattisesti.` : `Ilmoitetaanko sinut sairaaksi ${day}? Esihenkilösi saa ilmoituksen automaattisesti.`,
    homeOffice: day => `Kirjataanko etätyö ${day}?`,
    homeOfficeRecurring: 'Voin kirjata yhden etätyöpäivän kerrallaan. Kiinteän viikkorytmin asetat itse kohdassa Etätyö.',
    homeOfficeRange: 'Voin kirjata yhden etätyöpäivän kerrallaan. Kokeile esim. "kirjaa etätyö huomenna".',
    note: (title, personal) => personal ? `Luodaanko henkilökohtainen muistiinpano Muistikirjaan: "${title}"?` : `Luodaanko jaettu muistiinpano Muistikirjaan, jonka koko tiimi näkee: "${title}"?`,
    noteNoContent: 'Ymmärsin, että haluat luoda muistiinpanon, mutta en nähnyt sen sisältöä. Kokeile esim. "luo muistiinpano: muista tilata uudet tarrat".',
    message: (name, text) => `Lähetetäänkö sisäinen viesti henkilölle ${name}: "${text}"?`,
    messageNoBody: (name, first) => `Mitä viestissä henkilölle ${name} pitäisi lukea? Kokeile esim. "lähetä viesti ${first}lle: kokous siirtyi klo 10".`,
    messageNoName: 'Kenelle viesti lähetetään? Kokeile esim. "lähetä viesti Annelle: kokous siirtyi klo 10".',
    messageTooLong: 'Viesti on liian pitkä lähetettäväksi minun kauttani. Kirjoita se Sähköpostijärjestelmässä.',
    teamTodo: (title, due, f) => `Luodaanko tiimin yhteinen to-do: "${title}"${due ? `, eräpäivä ${f.day(due, { weekday: false })}` : ''}?`,
    teamTodoNoTitle: 'Ymmärsin, että haluat luoda yhteisen to-don, mutta en löytänyt otsikkoa. Kokeile esim. "luo tiimin to-do: siivoa varasto".',
    highFive: (emoji, name, text) => `Lähetetäänkö high five ${emoji} henkilölle ${name}: "${text}"?`,
    highFiveSelf: 'Et voi lähettää high fivea itsellesi – valitse kollega.',
    highFiveNoName: 'Kuka saa high fiven? Kokeile esim. "lähetä high five Annelle avusta tänään".',
    highFiveTooLong: 'High fiven tekstissä voi olla enintään 200 merkkiä. Kokeile lyhyempää tervehdystä.',
    highFiveDefault: 'Hienoa työtä!',
    thanks: 'Kiitos',
    notFound: name => `En löydä henkilöä "${name}" kollegoistasi. Kokeile koko nimeä.`,
    didYouMean: (name, names) => `En löydä henkilöä "${name}". Tarkoititko ${names}? Kirjoita koko nimi, niin teen uuden ehdotuksen.`,
    ambiguous: names => `Useampi kollega sopii: ${names}. Kirjoita koko nimi, niin teen uuden ehdotuksen.`,
    or: 'tai',
  },
  sv: {
    sick: (day, child) => child ? `Ska jag registrera vård av sjukt barn ${day}? Din chef får automatiskt besked.` : `Ska jag sjukanmäla dig ${day}? Din chef får automatiskt besked.`,
    homeOffice: day => `Ska jag registrera hemarbete ${day}?`,
    homeOfficeRecurring: 'Jag kan registrera en hemarbetsdag i taget. Ett fast veckomönster ställer du själv in under Hemarbete.',
    homeOfficeRange: 'Jag kan registrera en hemarbetsdag i taget. Försök t.ex. "registrera hemarbete imorgon" eller "jag jobbar hemifrån på fredag".',
    note: (title, personal) => personal ? `Ska jag skapa en personlig anteckning i Anteckningsboken: "${title}"?` : `Ska jag skapa en delad anteckning i Anteckningsboken som hela teamet ser: "${title}"?`,
    noteNoContent: 'Jag förstod att du vill skapa en anteckning, men jag såg inte vad den ska innehålla. Försök t.ex. "skapa en anteckning: kom ihåg att beställa nya etiketter".',
    message: (name, text) => `Ska jag skicka ett internt meddelande till ${name}: "${text}"?`,
    messageNoBody: (name, first) => `Vad ska meddelandet till ${name} innehålla? Försök t.ex. "skicka ett meddelande till ${first}: mötet är flyttat till kl. 10".`,
    messageNoName: 'Vem ska meddelandet skickas till? Försök t.ex. "skicka ett meddelande till Anne: mötet är flyttat till kl. 10".',
    messageTooLong: 'Meddelandet är för långt för att skickas via mig. Skriv det i E-postsystemet i stället.',
    teamTodo: (title, due, f) => `Ska jag skapa en gemensam att göra-uppgift för teamet: "${title}"${due ? `, förfallodatum ${f.day(due)}` : ''}?`,
    teamTodoNoTitle: 'Jag förstod att du vill skapa en gemensam att göra-uppgift, men jag hittade ingen titel. Försök t.ex. "skapa en team-uppgift: städa lagret".',
    highFive: (emoji, name, text) => `Ska jag skicka en high five ${emoji} till ${name}: "${text}"?`,
    highFiveSelf: 'Du kan inte skicka en high five till dig själv – välj en kollega.',
    highFiveNoName: 'Vem ska få en high five? Försök t.ex. "skicka en high five till Anne för hjälpen idag".',
    highFiveTooLong: 'En high five får ha högst 200 tecken text. Försök med en kortare hälsning.',
    highFiveDefault: 'Bra jobbat!',
    thanks: 'Tack',
    notFound: name => `Jag hittar inte "${name}" bland dina kollegor. Försök med det fullständiga namnet.`,
    didYouMean: (name, names) => `Jag hittar inte "${name}". Menade du ${names}? Skriv det fullständiga namnet så gör jag ett nytt förslag.`,
    ambiguous: names => `Flera kollegor passar: ${names}. Skriv det fullständiga namnet så gör jag ett nytt förslag.`,
    or: 'eller',
  },
}

const RELATIVE = { da: ['i dag', 'i morgen'], en: ['today', 'tomorrow'], fi: ['tänään', 'huomenna'], sv: ['idag', 'imorgon'] }
// How a plain day reads in a proposal: Finnish leaves the weekday out (it would need a case ending) and says "päivälle".
const DAY_STYLE = { da: { weekday: true, prefix: '' }, en: { weekday: true, prefix: '' }, fi: { weekday: false, prefix: 'päivälle ' }, sv: { weekday: true, prefix: '' } }
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** "i dag (fredag 3. okt.)" for today and tomorrow, else the day itself; Finnish reads "päivälle 6.10.". */
function whenText(iso, language, now) {
  const style = DAY_STYLE[language] || DAY_STYLE.da
  const day = formatDay(iso, language, { now, weekday: style.weekday })
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const words = RELATIVE[language] || RELATIVE.da
  if (iso === isoOf(today)) return `${words[0]} (${day})`
  if (iso === isoOf(tomorrow)) return `${words[1]} (${day})`
  return `${style.prefix}${day}`
}

const unquote = value => value.trim().replace(/^["“”«»']+|["“”«»']+$/g, '').trim()
/** The part after the first colon (the content), with Finnish "Anne:lle" kept together as a name. */
function splitAtColon(text) {
  const joined = text.replace(/’/g, "'").replace(/(\p{L}):(?=(?:lle|lla|lta|n|ille|in)(?![\p{L}]))/gu, '$1')
  const at = joined.indexOf(':')
  return at < 0 ? { head: joined.trim(), body: '' } : { head: joined.slice(0, at).trim(), body: unquote(joined.slice(at + 1)) }
}
/** A short title from the first line or sentence ("kl. 10" is no sentence end), capitalised and without the closing full stop. */
function titleOf(text) {
  const first = text.split(/\n|(?<=[.!?])\s+(?=\p{Lu})/u)[0].trim().replace(/\.$/u, '')
  const title = first.charAt(0).toUpperCase() + first.slice(1)
  return title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : title
}
const list = (names, or) => names.length > 1 ? `${names.slice(0, -1).join(', ')} ${or} ${names.at(-1)}` : names[0]
const EVERYONE = new Set(['alle', 'teamet', 'hele teamet', 'everyone', 'everybody', 'all', 'the team', 'kaikille', 'kaikki', 'tiimille', 'alla', 'hela teamet', 'teamet'])

/** One colleague named in `segment`: { person } | { problem: text } | { everyone: true }. */
function findPerson(segment, people, text) {
  const raw = unquote(segment.split(NAME_STOP)[0].replace(/[.,!?;]+$/u, ''))
  const seg = canonical(raw)
  if (!seg) return { problem: null }
  if ([...EVERYONE].some(word => seg === word || seg.startsWith(`${word} `))) return { everyone: true }
  const inflected = seg.split(' ').map(word => inflectedName(word, people.flatMap(person => [...person.names]))).filter(Boolean).map(canonical)
  const ranked = people.map(person => {
    const names = [...person.names].map(canonical)
    let rank = Math.max(0, ...aliasesFor(person).map(({ alias, rank: r }) => alias === seg ? r + 10 : bounded(seg, alias) ? r : 0))
    if (inflected.some(name => names.includes(name))) rank = Math.max(rank, 2)
    return { person, rank }
  })
  const best = Math.max(0, ...ranked.map(item => item.rank))
  if (!best) {
    const guesses = similarPeople(seg, people).map(person => person.name)
    return { problem: guesses.length ? text.didYouMean(raw, list(guesses, text.or)) : text.notFound(raw) }
  }
  const matches = ranked.filter(item => item.rank === best).map(item => item.person)
  if (matches.length > 1) return { problem: text.ambiguous(list(matches.map(person => person.name).sort(), text.or)) }
  return { person: matches[0] }
}

/** The day a sick-leave or home-office proposal is for: the one day named, today when none is. */
function oneDay(head, now, resolveDates) {
  const found = typeof resolveDates === 'function' ? resolveDates(head.toLowerCase(), now) : null
  if (!found) return { date: isoOf(now) }
  return found.start === found.end ? { date: found.start } : { range: true }
}

/**
 * Detects one of the team actions in the user's own words. Returns null (none), { type: 'unresolved', message }
 * or { type, params, summary }. `people`: approved colleagues in the user's team(s) (message recipients);
 * `allPeople`: approved colleagues across all teams, or a function returning them (high-five recipients); `self`: the user's e-mail.
 */
function detectTeamAction(original, language, { now = new Date(), resolveDates, people = [], allPeople = people, self = '', dueDateOf } = {}) {
  const textIn = typeof original === 'string' ? original.trim() : ''
  if (!textIn) return null
  const text = TEXT[language] || TEXT.da
  const f = { day: (iso, options) => formatDay(iso, language, { now, ...options }) }
  const { head, body } = splitAtColon(textIn)
  // A question about these things ("who is sick today?", "how do I send a high-five?") is answered, not acted on.
  if (ASKING.test(head) || (head.includes('?') && !POLITE.test(head))) return null
  const unresolved = message => ({ type: 'unresolved', message, team: true })

  if (HIGH_FIVE.test(head)) {
    let name = null; let rest = ''
    for (const pattern of HIGH_FIVE_NAME) {
      const match = pattern.exec(head)
      if (match) { name = match.groups.name; rest = match.groups.rest || ''; break }
    }
    if (!name) return unresolved(text.highFiveNoName)
    // The message: after a colon, else what follows the name ("for the help today").
    const afterName = rest.trim() || (name.match(NAME_STOP) ? name.slice(name.match(NAME_STOP).index).trim() : '')
    const found = findPerson(name, typeof allPeople === 'function' ? allPeople() : allPeople, text)
    if (found.everyone || found.problem === null) return unresolved(text.highFiveNoName)
    if (found.problem) return unresolved(found.problem)
    if (canonical(found.person.email) === canonical(self)) return unresolved(text.highFiveSelf)
    const emoji = HIGH_FIVE_EMOJIS.find(item => textIn.includes(item)) || HIGH_FIVE_EMOJIS[0]
    const strip = value => HIGH_FIVE_EMOJIS.reduce((acc, item) => acc.split(item).join(''), value).replace(/\s+/g, ' ').trim().replace(/^[,.;:–-]+\s*/u, '')
    let message = strip(body) || strip(afterName)
    if (message && FOR_START.test(message) && !THANKS_START.test(message)) message = `${text.thanks} ${message}`
    if (message) message = message.charAt(0).toUpperCase() + message.slice(1)
    if (!message) message = text.highFiveDefault
    if (message.length > HIGH_FIVE_LIMIT) return unresolved(text.highFiveTooLong)
    return { type: 'high-five', params: { recipientEmail: found.person.email, recipientName: found.person.name, emoji, message }, summary: text.highFive(emoji, found.person.name, message) }
  }

  const note = NOTE.exec(head)
  if (note) {
    const after = head.slice(note.index + note[0].length).replace(FOR_TEAM, ' ')
    const content = body || unquote(after.replace(/^[\s,.–-]*(?:(?:om at|om att|om|about|med|with|että|att)(?![\p{L}]))?\s*/iu, ''))
    if (!content || content.length < 2) return unresolved(text.noteNoContent)
    if (content.length > MESSAGE_LIMIT) return unresolved(text.messageTooLong)
    const isPersonal = !NOTE_SHARED.test(note[0]) && !FOR_TEAM.test(head)
    const title = titleOf(content)
    return { type: 'note', params: { title, content, isPersonal }, summary: text.note(title, isPersonal) }
  }

  const teamTodo = TEAM_TODO_TAIL.exec(head) || TEAM_TODO.exec(head)
  if (teamTodo) {
    const title = (body || unquote(head.slice(teamTodo.index + teamTodo[0].length).replace(/^[\s:,.–-]+/u, ''))).slice(0, 200)
    if (!title || title.length < 2) return unresolved(text.teamTodoNoTitle)
    const due = typeof dueDateOf === 'function' ? dueDateOf(title) : null
    return { type: 'team-todo', params: { title, ...(due ? { dueDate: due } : {}) }, summary: text.teamTodo(title, due, f) }
  }

  for (const pattern of MESSAGE) {
    const match = pattern.exec(head)
    if (!match) continue
    const segment = match.groups.name
    const found = findPerson(segment, people, text)
    // "Send a message to everyone" is a mass mailing, which Hubert never does; the guard answers it.
    if (found.everyone) return null
    if (found.problem === null) return unresolved(text.messageNoName)
    if (found.problem) return unresolved(found.problem)
    const stop = segment.match(NAME_STOP)
    const message = body || (stop ? unquote(segment.slice(stop.index).replace(NAME_STOP, '').trim().replace(/^(?:at|that|att|että)\s+/iu, '')) : '')
    const first = found.person.name.split(' ')[0]
    if (!message) return unresolved(text.messageNoBody(found.person.name, first))
    if (message.length > MESSAGE_LIMIT) return unresolved(text.messageTooLong)
    return { type: 'message', params: { to: found.person.email, toName: found.person.name, subject: titleOf(message), message }, summary: text.message(found.person.name, message) }
  }

  const child = SICK_CHILD.test(head)
  if (child || SICK_SELF.test(head)) {
    const day = oneDay(head, now, resolveDates)
    const date = day.date || oneDay('', now).date
    return { type: 'sick-leave', params: { date, type: child ? 'child' : 'self' }, summary: text.sick(whenText(date, language, now), child) }
  }

  if (HOME_OFFICE.test(head)) {
    if (RECURRING.test(head)) return unresolved(text.homeOfficeRecurring)
    const day = oneDay(head, now, resolveDates)
    if (day.range) return unresolved(text.homeOfficeRange)
    return { type: 'home-office-day', params: { date: day.date }, summary: text.homeOffice(whenText(day.date, language, now)) }
  }
  return null
}

const TEAM_ACTION_TYPES = new Set(['sick-leave', 'home-office-day', 'note', 'message', 'team-todo', 'high-five'])

module.exports = { detectTeamAction, HIGH_FIVE_EMOJIS, TEAM_ACTION_TYPES }
