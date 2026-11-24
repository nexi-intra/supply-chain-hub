// Colloquial, passive, embedded and regional phrasings ("hvem mangler vi i morgen", "who's WFH", "onks kukaan sairaana")
// are rewritten to the plain question the routes already answer. Only whole phrases are matched, so a real question keeps its own route.
const { tidyQuestion } = require('./assistantTidy.cjs')

const rx = source => new RegExp(source.replaceAll('<b>', '(?<![\\p{L}\\p{N}])').replaceAll('<e>', '(?![\\p{L}\\p{N}])'), 'iu')
const wordCount = text => text.split(/\s+/).filter(Boolean).length
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Lead-ins that only frame the question; stripped while at least two words remain.
const LEAD_INS = {
  da: [
    '^(?:nu )?hvor det er (?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag),?\\s+',
    '^(?:min chef|chefen|min leder|en kollega|min kollega) (?:spurgte|spørger) (?:mig )?(?:om )?(?:jeg )?(?:ved|vidste|kan fortælle|kunne fortælle) ',
    '^(?:kan|kunne|vil|ville) (?:du|i)(?: lige| venligst| så| bare)* (?:vise|give|finde|hente|slå op)(?: mig)? ',
    ',?\\s*(?:kan|kunne|vil|ville) (?:du|i)(?: lige| venligst)* hjælpe(?: mig)?(?: med det)?\\s*\\??$',
  ],
  en: [
    '^(?:just checking|quick question|one more thing|by the way|btw)[,:]?\\s+',
    '^(?:can|could|would|will) you(?: please| kindly)* (?:show|give|get|find|bring up|pull up|list)(?: me)? ',
  ],
  fi: [
    '^voitko(?: ystävällisesti| sinä| nyt)* (?:näyttää|kertoa|etsiä|hakea)(?: minulle| mulle)? ',
  ],
  sv: [
    '^(?:jag undrar om|undrar om|jag undrar) (?:om )?',
    '^kan du(?: vara snäll och| gärna)* (?:visa|hitta|ge)(?: mig)? ',
  ],
}

// Colloquial word -> plain word, in the order they are applied (language, then phrase).
const REWRITES = {
  da: [
    ['^hvem er (?:ikke på arbejde|ikke her|ikke inde|ikke mødt (?:ind|op)|væk|borte|fraværende)<e>', 'hvem er fri'],
    ['^er der nogen(?: der)?(?: er)? (?:væk|borte|fraværende|ikke på arbejde|ikke her|ikke inde)<e>', 'hvem er fri'],
    ['^hvem mangler(?: vi)?<e>', 'hvem er fri'],
    ['^hvem er (?:mødt|kommet) (?:ind|op)<e>', 'hvem er på arbejde'],
    ['^hvem er (?:i huset|til stede|inde|på kontoret)<e>', 'hvem er på arbejde'],
    ['^er der nogen (?:der )?(?:er )?(syg|syge|sygemeldt|på ferie|på arbejde|hjemme|fri)<e>', 'hvem er $1'],
    ['^(hvem|hvor mange) er der (?=på arbejde|på kontoret|syge|fri<e>|hjemme)', '$1 er '],
    ['^hvor mange (?:er )?(?:væk|borte|fraværende|ikke på arbejde)<e>', 'hvor mange er syge eller har ferie'],
    ['^(?:har jeg|er der)\\s+(?:fået\\s+|modtaget\\s+|kommet\\s+)?(?:nogen\\s+|nogle\\s+)?(?:nye\\s+)?(?:mails?|e-?mails?|post|beskeder)(?:\\s+til mig)?\\s*\\??$', 'har jeg nye beskeder'],
    ['^hvem er (?:teamlederen|holdlederen|afdelingslederen|gruppelederen|chefen|min chef|min nærmeste leder|overlederen)<e>', 'hvem er min leder'],
    ['^hvornår (?:bliver|er|holder)\\s+(\\p{L}+?)(?:[\'’]s|s)?\\s+fødselsdag(?:en)?(?: fejret| holdt)?', 'hvornår har $1 fødselsdag'],
    ['<b>fylder (\\p{L}+) år<e>', '$1 har fødselsdag'],
    ['^hvad kan man bruge dig til<e>', 'hvad kan du'],
    ['^hvad (?:kan|må) jeg (?:spørge dig om|bruge dig til)<e>', 'hvad kan du'],
    ['^hvordan (?:bliver|oprettes|laves) (en|et) (guide|note|to-?do|forslag) (?:oprettet|lavet|skrevet)<e>', 'hvordan opretter jeg $1 $2'],
    ['^jeg (?:vil|ville)(?: gerne)? (?:have|holde|tage|afholde) ferie<e>', 'opret ferie'],
    ['^jeg (?:vil|ville)(?: gerne)? have fri<e>', 'opret ferie'],
    ['^(?:kan|kunne|vil|ville) (?:du|i)(?: lige| venligst| så| bare)* (?:lave|oprette|tilføje|lægge)(?: mig)? (?:en|et) (to-?do)(?: til mig| for mig)?', 'lav en $1'],
    ['^jeg er syg(?: i dag| idag| i morgen| imorgen)?\\s*\\??$', 'hvordan melder jeg mig syg'],
    ['^er jeg (?:på arbejde|på vagt|i vagtplanen)<e>', 'hvilke opgaver har jeg'],
    ['^hvad er der af nyt (i dag|idag|i morgen|imorgen|denne uge)\\s*\\??$', 'hvad er der i notifikationer $1'],
    ['^hvad sker der (næste uge|denne uge|i dag|idag|i morgen|imorgen)\\s*\\??$', 'hvad sker der $1'],
    ['<b>(hvem|hvad|hvor|hvilke|hvilken) der (er|har|arbejder|sidder|skal|får)<e>', '$1 $2'],
    ['^hvordan (?:spiller|spille) jeg mod (\\p{L}+(?: \\p{L}+)?)\\s*\\??$', 'hvordan udfordrer jeg $1'],
    ['^kan jeg spille mod (\\p{L}+(?: \\p{L}+)?)\\s*\\??$', 'kan jeg udfordre $1'],
    ['^hvad (?:skal|bør|burde) jeg(?: (?:lave|gøre|nå))?(?: (i dag|idag|i morgen|imorgen|i overmorgen|denne uge|næste uge))?\\s*\\??$', 'hvad laver jeg $1'],
  ],
  en: [
    ['<b>who[\'’]s<e>', 'who is'],
    ['^who is (?:away|absent|out(?: of (?:the )?office)?|gone|not (?:in|at work|here|around|working))<e>', 'who is off'],
    ['^who is (?:around|here|present|in work)<e>', 'who is at work'],
    ['<b>(?:out|off|home|away) sick<e>', 'sick'],
    ['<b>called in sick<e>', 'sick'],
    ['<b>on (?:annual |paid )?leave<e>', 'on vacation'],
    ['<b>pto<e>', 'vacation'],
    ['<b>wfh<e>', 'working from home'],
    ['^(?:are|is) there (?:anybody|anyone|someone) (?:who is |that is )?', 'who is '],
    ['^(?:are|is) there any (?:people |employees |colleagues )?(?:who|that) (?:is |are )?', 'who is '],
    ['^is (?:anybody|anyone|somebody|someone) ', 'who is '],
    ['^is (\\p{L}+(?: \\p{L}+)?) (?:out|away|off|absent|gone)<e>', 'where is $1'],
    ['^whose birthday is (?:it )?', 'who has a birthday '],
    ['<b>how many people are<e>', 'how many are'],
    ['^how many are (?:away|absent|out|off|gone)<e>', 'how many are sick or on vacation'],
    ['^what[\'’]?s (?:the )?(?:canteen|cafeteria|kitchen) (?:serving|offering|cooking|having|making)<e>', 'what is for lunch'],
    ['<b>(?:cafeteria|canteen) menu<e>', 'meal plan'],
    ['^what[\'’]?s my (?:rota|roster)(?: for)?<e>', 'what are my tasks'],
    ['^what am i (?:supposed|meant|expected) to (?:do|work on)<e>', 'what are my tasks'],
    ['^(?:do i have|have i got|did i get|have i received|are there)(?: any)?(?: new)? (?:post|mail|e-?mails?)\\s*\\??$', 'do i have new messages'],
    ['^any (?:new )?(?:post|mail)\\s*\\??$', 'do i have new messages'],
    ['^am i (?:at work|working|in|on|scheduled)(?: (?:on|for))?\\s*', 'what are my tasks '],
    ['^i (?:want|would like|\'d like|need|wanna) to (?:take|have|book) (.+?) (?:off|as vacation|as holiday)\\s*\\??$', 'create vacation $1'],
    ['^i (?:want|would like|\'d like|need) (?:some )?(?:vacation|holiday|time off)<e>', 'create vacation'],
    ['^add (.+?) to my (?:to-?dos?|to-?do list|todo list)\\s*\\??$', 'create a to-do: $1'],
    ['^how (?:are|is) (guides?|notes?|to-?dos?|suggestions?) (?:created|made|written|added)\\s*\\??$', (_, kind) => `how do i create ${/^guides$/i.test(kind) ? 'a guide' : /s$/i.test(kind) ? `a ${kind.slice(0, -1)}` : `a ${kind}`}`],
    ['^(?:i[\'’]m|i am) (?:sick|ill)(?: today| tomorrow)?\\s*\\??$', 'how do i report sick'],
    ['^what[\'’]?s new (today|this week|tomorrow)\\s*\\??$', 'what is in notifications $1'],
    ['<b>(?:the |my |our )?(?:line manager|team lead(?:er)?|supervisor|boss)<e>', 'my manager'],
    ['<b>(?:mobile|cell)(?: phone| number)?<e>', 'phone'],
    ['<b>phone number<e>', 'phone'],
    ['^how (?:do|can) i play against (\\p{L}+(?: \\p{L}+)?)\\s*\\??$', 'how do i challenge $1'],
    ['^what (?:do i have to|should i|must i|do i need to|am i going to|shall i) do(?: (today|tomorrow|this week|next week))?\\s*\\??$', 'what am i doing $1'],
  ],
  fi: [
    ['<b>mä<e>', 'minä'],
    ['<b>mulla<e>', 'minulla'],
    ['<b>mulle<e>', 'minulle'],
    ['<b>mun<e>', 'minun'],
    ['<b>sulla<e>', 'sinulla'],
    ['<b>onks<e>', 'onko'],
    ['<b>(?:kipeänä|kipeä)<e>', 'sairaana'],
    ['<b>mitä töitä<e>', 'mitä tehtäviä'],
    ['<b>synttäri\\p{L}*', 'syntymäpäivä'],
    ['<b>kotoa (?:töitä|töihin)<e>', 'etätöitä'],
    ['<b>mitä syödään<e>', 'mitä lounaaksi'],
    ['^mitäs (tänään|huomenna|ensi viikolla|tällä viikolla)\\s*\\??$', 'mitä tapahtuu $1'],
    ['^(?:paljonko|montako|kuinka monta)(?: ihmistä| ihmisiä| henkilöä| työntekijää)?(?: on| ovat)? poissa<e>', 'kuinka monta on sairaana tai lomalla'],
    ['^onko (.+?) (?:joku|kukaan) (poissa|sairaana|lomalla|töissä|etätöissä)\\s*\\??$', 'kuka on $2 $1'],
    ['^onko (?:joku|kukaan) (.+)$', 'kuka on $1'],
    ['^(?:minä )?haluan (?:lomaa|vapaata|lomalle)<e>', 'luo loma'],
    ['^olenko (?:töissä|vuorossa)<e>', 'mitä tehtäviä minulla on'],
    ['^(?:olen|oon) sairas(?: tänään| huomenna)?\\s*\\??$', 'miten ilmoitan sairastumisesta'],
    ['^miten pelaan (\\p{L}+(?: \\p{L}+)?) vastaan\\s*\\??$', 'miten haastan $1'],
    ['^mitä (?:minun pitää|minun täytyy|minun on|minun tulee) tehdä(?: (tänään|huomenna|tällä viikolla|ensi viikolla))?\\s*\\??$', 'mitä teen $1'],
  ],
  sv: [
    ['^vem (?:är|var) (?:borta|frånvarande)<e>', 'vem är ledig'],
    ['^hur många (?:är|var) (?:borta|frånvarande|lediga?)<e>', 'hur många är sjuka eller har semester'],
    ['^någon (är|har) ', 'vem $1 '],
    ['^är (?:någon|nån) (.+)$', 'vem är $1'],
    ['<b>vad (?:blir det|får vi|äter vi|serveras det)(?: (?:till|för))? (lunch|middag|mat)<e>', 'vad är det för $1'],
    ['^har jag fått (?:några |något )?(?:nya )?(?:mejl|mail|e-?post|post|meddelanden)\\s*\\??$', 'har jag nya meddelanden'],
    ['<b>när fyller (\\p{L}+) år<e>', 'när har $1 födelsedag'],
    ['<b>vilket (?:telefon)?nummer har (\\p{L}+)', 'vad är telefonnumret till $1'],
    ['^jag vill (?:ha|ta) (?:ledigt|semester|ledighet)<e>', 'skapa semester'],
    ['^jag är sjuk(?: idag| i dag| imorgon| i morgon)?\\s*\\??$', 'hur sjukanmäler jag mig'],
    ['^är jag (?:på jobbet|i tjänst|schemalagd)<e>', 'vilka uppgifter har jag'],
    ['<b>(?:teamledaren|gruppledaren|teamchefen)<e>', 'min chef'],
    ['^hur spelar jag mot (\\p{L}+(?: \\p{L}+)?)\\s*\\??$', 'hur utmanar jag $1'],
  ],
}

const COMPILED = Object.fromEntries(Object.entries(REWRITES).map(([language, rules]) => [language, rules.map(([source, replacement]) => [rx(source), replacement])]))
const COMPILED_LEAD_INS = Object.values(LEAD_INS).flat().map(source => rx(source))
// Trailing filler that carries no question ("mon", "då", "then", "eller hvad").
const TRAILING_FILLER = rx('(?:\\s+|,\\s*)(?:mon|egentlig|da|så|lige|eller hvad|then|though|actually|sitten|siis|oikeasti|då|alltså|egentligen|liksom)(?=\\s*[?!.]*$)')

/** The question in plain form; `people` (full names) lets "Bos nummer" become "telefonnummeret på Bo". */
function paraphrase(question, { people = [] } = {}) {
  let text = String(question).replace(/[’]/g, "'").trim()
  for (const pattern of COMPILED_LEAD_INS) {
    const next = text.replace(pattern, '').trim()
    if (wordCount(next) >= 2) text = next
  }
  text = tidyQuestion(text) || text
  const trailing = text.replace(TRAILING_FILLER, '').trim()
  if (wordCount(trailing) >= 3) text = trailing
  const names = [...new Set(people.flatMap(name => [name, ...String(name).split(/\s+/)]).filter(name => name.length >= 2))].sort((a, b) => b.length - a.length)
  if (names.length) {
    const contact = new RegExp(`^(?:hvad er |hvad |hvilket nummer har )?(${names.map(escape).join('|')})(?:'s|s)?\\s+(?:mobil ?nummer|telefon ?nummer|nummer|mobil|telefon)\\s*\\??$`, 'iu')
    text = text.replace(contact, (_, name) => `hvad er telefonnummeret på ${name}`)
    // "Is Anne in tomorrow?": presence is the same question as "where is Anne tomorrow?".
    const who = names.map(escape).join('|')
    const presence = (head, place) => new RegExp(`^${head} (${who})(?: (.*?))? (?:${place})(?: (.*?))?\\s*\\??$`, 'iu')
    const rewrite = (pattern, build) => { text = text.replace(pattern, (_, name, before = '', after = '') => build(name, `${before} ${after}`.trim())) }
    rewrite(presence('(?:er|var)', 'her|til stede|inde|på kontoret|på jobbet|på job|mødt ind|i huset'), (name, rest) => `hvor er ${name} ${rest}`)
    rewrite(presence('(?:is|was)', 'in|here|around|present|at the office|in the office|at work'), (name, rest) => `where is ${name} ${rest}`)
    rewrite(presence('onko', 'työissä|toimistolla|paikalla|täällä|työpaikalla'), (name, rest) => `missä ${name} on ${rest}`)
    rewrite(presence('(?:är|var)', 'här|på jobbet|på kontoret|inne|på plats|på arbetet'), (name, rest) => `var är ${name} ${rest}`)
  }
  for (const rules of Object.values(COMPILED)) {
    for (const [pattern, replacement] of rules) text = text.replace(pattern, replacement)
  }
  return text.replace(/\s+/g, ' ').trim()
}

module.exports = { paraphrase }
