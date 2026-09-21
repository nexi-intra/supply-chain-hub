// Indbygget viden om SELVE appen: hvad hvert modul er, hvor det ligger, og
// hvordan man udfoerer de almindeligste opgaver. Uden det her kan Hubert kun
// slaa registreringer op - den kan ikke hjaelpe nogen igennem appen.
//
// Hvorfor kun dansk tekst: Hubert svarer altid paa spoergsmaalets sprog (se
// assistantPersona.cjs), og modellen oversaetter evidensen undervejs - praecis
// som den goer med guider skrevet paa ét sprog. Det holder denne fil i én
// vedligeholdt kilde i stedet for tre der driver fra hinanden.
//
// Indholdet skal afspejle den FAKTISKE UI. Gaetter man her, hallucinerer Hubert
// med fuld troovaerdighed. Tilfoej hellere mindre end noget der ikke er tjekket.

const MANAGER = 'manager'
const CREATOR = 'creator'

// `keywords` bruges til scoring. De skal vaere ord brugeren selv ville skrive,
// ikke interne feltnavne.
const APP_GUIDE = [
  {
    id: 'shifts',
    view: 'shifts',
    title: 'Vagtplan',
    summary: 'Ugeplan hvor hver medarbejder kan tildeles opgaver paa bestemte datoer. Weekender, helligdage, ferie og sygdom er automatisk spaerret.',
    where: 'Aabn feltet "Vagtplan" paa forsiden.',
    keywords: ['vagt', 'vagtplan', 'skema', 'opgave', 'rolle', 'uge', 'tildel', 'planlaegning'],
    tasks: [
      {
        id: 'assign-task',
        title: 'Tildel en opgave til en medarbejder',
        keywords: ['tildel', 'tilfoej', 'opgave', 'vagt', 'paa en dato', 'saet'],
        steps: [
          'Find cellen hvor medarbejderens raekke krydser den oenskede dato.',
          'Klik "Tilfoej" i cellen.',
          'Vaelg opgaven i listen. Den gemmes med det samme.',
        ],
        notes: 'Er personen paa ferie eller sygemeldt den dag, er cellen laast, og du faar en besked om hvorfor.',
      },
      {
        id: 'recurring',
        title: 'Opret en gentaget vagt',
        keywords: ['gentag', 'gentagen', 'gentagne', 'hver uge', 'hver anden uge', 'fast', 'tilbagevendende', 'moenster', 'interval'],
        steps: [
          'Klik "Gentagne vagter" oeverst i vagtplanen.',
          'Vaelg medarbejder, opgave og de ugedage den skal gentages paa.',
          'Vaelg interval: hver uge og op til hver sjette uge.',
          'Vaelg startdato, og eventuelt en slutdato hvis den ikke skal loebe for evigt.',
          'Klik "Opret gentaget vagt".',
        ],
        notes: 'Gentagne vagter udfoldes automatisk i kalenderen. Der oprettes ikke enkeltrækker for hver uge.',
      },
      {
        id: 'edit-recurring',
        title: 'Ret eller slet en gentaget vagt',
        keywords: ['ret', 'rediger', 'aendre', 'slet', 'gentagen', 'moenster'],
        steps: [
          'Aabn "Gentagne vagter".',
          'Find moensteret paa listen under formularen. Du kan skjule/vise listen og filtrere den paa opgave eller medarbejder.',
          'Klik blyanten for at rette moensteret, eller papirkurven for at slette det.',
          'Retter du, udfyldes formularen med moensteret, og knappen skifter til "Gem aendringer".',
        ],
        notes: 'En vagt der kommer fra et gentaget moenster kan ikke slettes enkeltvis i kalenderen. Ret eller slet moensteret i stedet.',
      },
      {
        id: 'roles',
        title: 'Opret eller ret en opgavetype',
        keywords: ['opgavetype', 'rolle', 'ny opgave', 'farve', 'opret opgave'],
        steps: [
          'Klik "Tilfoej Opgave" i vagtplanen.',
          'Skriv navnet og vaelg en farve.',
          'Gem. Opgaven kan nu vaelges i alle celler.',
        ],
        notes: 'Sletter du en opgavetype, mister eksisterende tildelinger deres opgave. De vises derefter som "Ukendt opgave" og kan knyttes til en anden opgave med ét klik.',
      },
      {
        id: 'comment',
        title: 'Skriv en kommentar paa en vagt',
        keywords: ['kommentar', 'note paa vagt', 'bemaerkning'],
        steps: ['Klik kommentar-ikonet i cellen.', 'Skriv teksten og gem.'],
      },
    ],
  },
  {
    id: 'calendar',
    view: 'calendar',
    title: 'Kalender',
    summary: 'Samlet overblik over ferie, sygdom og hjemmearbejde for hele teamet.',
    where: 'Aabn feltet "Kalender" paa forsiden.',
    keywords: ['kalender', 'ferie', 'fri', 'sygdom', 'syg', 'hjemmearbejde', 'hjemme', 'fravaer'],
    tasks: [
      {
        id: 'request-vacation',
        title: 'Ansoeg om ferie',
        keywords: ['ferie', 'ansoeg', 'anmod', 'fri', 'orlov', 'feriedage'],
        steps: [
          'Aabn Kalender og klik "Ansoeg om ferie".',
          'Vaelg start- og slutdato, og skriv eventuelt en bemaerkning.',
          'Send anmodningen.',
        ],
        notes: 'Anmodningen sendes til teamets managere og har status "afventer", indtil den er godkendt eller afvist. Du faar besked om afgoerelsen.',
      },
      {
        id: 'approve-vacation',
        title: 'Godkend eller afvis en ferieanmodning',
        keywords: ['godkend', 'afvis', 'anmodning', 'ferie', 'behandle'],
        requires: MANAGER,
        steps: [
          'Aabn Kalender. Afventende anmodninger vises samlet.',
          'Vaelg anmodningen og klik godkend eller afvis.',
        ],
        notes: 'Ansoegeren faar automatisk besked. Kun managere ser disse knapper.',
      },
      {
        id: 'sick-leave',
        title: 'Meld dig syg',
        keywords: ['syg', 'sygemeld', 'sygemelding', 'barn syg', 'sygdom'],
        steps: [
          'Klik "Sygemelding" paa forsiden.',
          'Vaelg dato, og angiv om det er dig selv eller et sygt barn.',
          'Skriv eventuelt en bemaerkning og indsend.',
        ],
        notes: 'En sygemelding kraever ingen godkendelse. Den registreres med det samme.',
      },
      {
        id: 'home-office',
        title: 'Registrer hjemmearbejde',
        keywords: ['hjemme', 'hjemmearbejde', 'hjemmekontor', 'arbejde hjemmefra'],
        steps: [
          'Aabn Kalender og gaa til hjemmearbejde.',
          'Vaelg de faste ugedage du normalt arbejder hjemme.',
          'Har du en enkelt dag der afviger fra din faste plan, registreres den som en undtagelse paa den dato.',
        ],
        notes: 'Hjemmearbejde er ikke fravaer. Man arbejder stadig, og det vises derfor adskilt fra ferie og sygdom.',
      },
    ],
  },
  {
    id: 'projects',
    view: 'projects',
    title: 'To Do',
    summary: 'Faelles to-do\'s for teamet og dine egne personlige to-do\'s, med mulighed for forfaldsdato.',
    where: 'Aabn feltet "To Do" paa forsiden.',
    keywords: ['to do', 'todo', 'goeremaal', 'liste', 'huskeliste', 'projekt', 'deadline', 'forfald'],
    tasks: [
      {
        id: 'create-todo',
        title: 'Opret en to-do',
        keywords: ['opret', 'tilfoej', 'ny', 'to do', 'todo', 'opgave til mig selv'],
        steps: [
          'Aabn To Do og vaelg om den skal vaere faelles for teamet eller personlig.',
          'Skriv titel og eventuelt en beskrivelse.',
          'Saet en forfaldsdato hvis den skal have en.',
          'Gem.',
        ],
        notes: 'Personlige to-do\'s kan kun ses af dig. Faelles to-do\'s kan ses af hele teamet.',
      },
      {
        id: 'edit-todo',
        title: 'Ret eller afslut en to-do',
        keywords: ['ret', 'rediger', 'aendre', 'faerdig', 'afslut', 'luk'],
        steps: [
          'Klik blyanten ud for to-do\'en for at rette titel eller beskrivelse.',
          'Marker den som faerdig naar den er loest.',
        ],
      },
    ],
  },
  {
    id: 'guides',
    view: 'guides',
    title: 'Guide Bibliotek',
    summary: 'Afdelingens guider og procedurer, med versionsstyring, godkendelse og fast interval for naeste gennemgang.',
    where: 'Aabn feltet "Guide Bibliotek" paa forsiden.',
    keywords: ['guide', 'guides', 'vejledning', 'procedure', 'instruktion', 'manual', 'dokumentation'],
    tasks: [
      {
        id: 'create-guide',
        title: 'Opret en guide',
        keywords: ['opret', 'skriv', 'ny guide', 'lav en guide'],
        steps: [
          'Aabn Guide Bibliotek og klik "Opret guide".',
          'Skriv titel og indhold, opdelt i afsnit og trin.',
          'Vaelg hvor ofte guiden skal gennemgaas, og hvilken dato naeste gennemgang skal ske.',
          'Vaelg eventuelt en ansvarlig for gennemgangen, hvis det ikke skal vaere dig selv.',
          'Gem som kladde, eller send den til godkendelse.',
        ],
        notes: 'Editoren gemmer automatisk en kladde undervejs, saa arbejdet ikke gaar tabt hvis appen lukkes.',
      },
      {
        id: 'review-guide',
        title: 'Faa en guide godkendt og udgivet',
        keywords: ['godkend', 'review', 'udgiv', 'publicer', 'kladde', 'anmodning'],
        steps: [
          'Send guiden til godkendelse fra editoren.',
          'En guide-administrator gennemgaar den og godkender eller afviser.',
          'Naar den er godkendt, udgives den som en ny version og bliver synlig for dem der har adgang.',
        ],
        notes: 'En kladde er kun synlig for dig, indtil den er udgivet. Tidligere versioner gemmes, saa man kan se historikken.',
      },
      {
        id: 'guide-access',
        title: 'Faa adgang til en guide du ikke kan se',
        keywords: ['adgang', 'kan ikke se', 'laast', 'rettighed', 'anmod om adgang'],
        steps: [
          'Find guiden i biblioteket og anmod om adgang.',
          'En guide-administrator behandler anmodningen.',
        ],
      },
      {
        id: 'guide-review-due',
        title: 'Hold guider opdaterede',
        keywords: ['gennemgang', 'naeste tjek', 'forfalden', 'opdatere guide', 'ansvarlig'],
        steps: [
          'Guider har en dato for naeste gennemgang.',
          'Den ansvarlige faar en paamindelse, naar datoen naermer sig.',
          'Gennemgaa indholdet, ret det der ikke passer laengere, og saet en ny dato.',
        ],
        notes: 'Den ansvarlige behoever ikke vaere den der skrev guiden.',
      },
    ],
  },
  {
    id: 'notebook',
    view: 'notebook',
    title: 'Notesbog',
    summary: 'Delte og personlige noter for teamet, med tags og forfatter.',
    where: 'Aabn feltet "Notesbog" paa forsiden.',
    keywords: ['note', 'noter', 'notesbog', 'skriv ned', 'referat'],
    tasks: [
      {
        id: 'create-note',
        title: 'Opret en note',
        keywords: ['opret', 'tilfoej', 'skriv', 'ny note', 'skriv note', 'tilfoej note'],
        steps: [
          'Aabn Notesbog og opret en ny note.',
          'Vaelg om den skal vaere delt med teamet eller personlig.',
          'Skriv titel og indhold, og tilfoej eventuelt tags.',
          'Gem.',
        ],
        notes: 'Personlige noter kan kun ses af dig.',
      },
    ],
  },
  {
    id: 'email',
    view: 'email',
    title: 'Email System',
    summary: 'Interne beskeder mellem kolleger i hubben. Ikke almindelig e-mail ud af huset.',
    where: 'Aabn feltet "Email System" paa forsiden.',
    keywords: ['besked', 'beskeder', 'mail', 'email', 'indbakke', 'skriv til'],
    tasks: [
      {
        id: 'send-message',
        title: 'Send en besked',
        keywords: ['send', 'skriv', 'ny besked', 'kontakt kollega'],
        steps: [
          'Aabn Email System og klik "Ny besked".',
          'Vaelg modtager, skriv emne og tekst.',
          'Send.',
        ],
      },
    ],
  },
  {
    id: 'team',
    view: 'team',
    title: 'Team Oversigt',
    summary: 'Kontaktoplysninger paa teamets medlemmer: navn, rolle, arbejdstelefon og foedselsdag.',
    where: 'Aabn feltet "Team Oversigt" paa forsiden.',
    keywords: ['team', 'kollega', 'kolleger', 'telefon', 'kontakt', 'hvem er', 'foedselsdag', 'medarbejder'],
    tasks: [],
  },
  {
    id: 'meals',
    view: 'meals',
    title: 'Madplan',
    summary: 'Ugens madplan for kantinen paa Energivej.',
    where: 'Aabn feltet "Madplan" paa forsiden.',
    keywords: ['mad', 'madplan', 'frokost', 'kantine', 'menu', 'spise'],
    tasks: [],
  },
  {
    id: 'games',
    view: 'games',
    title: 'Spil Hjoernet',
    summary: 'Spil til pauserne, med highscores paa tvaers af teams.',
    where: 'Aabn feltet "Spil Hjoernet" paa forsiden.',
    keywords: ['spil', 'spille', 'pause', 'highscore', 'point'],
    tasks: [],
  },
  {
    id: 'manager',
    view: 'manager',
    title: 'Manager Panel',
    summary: 'Administration af teamet: godkend nye brugere, styr rettigheder, opgavetyper og guide-administratorer.',
    where: 'Aabn feltet "Manager Panel" paa forsiden. Feltet er kun aabent for managere.',
    requires: MANAGER,
    keywords: ['manager', 'managerpanel', 'administration', 'rettigheder', 'godkend bruger', 'ny bruger'],
    tasks: [
      {
        id: 'approve-user',
        title: 'Godkend en ny bruger',
        keywords: ['godkend bruger', 'ny kollega', 'adgang', 'afventer godkendelse'],
        requires: MANAGER,
        steps: [
          'Aabn Manager Panel.',
          'Nye brugere der venter paa godkendelse vises samlet.',
          'Godkend personen, hvorefter vedkommende kan logge ind.',
        ],
      },
    ],
  },
  {
    id: 'documents',
    view: null,
    title: 'Dokumenter',
    summary: 'Modulet er endnu ikke bygget. Feltet vises paa forsiden, men kan ikke aabnes.',
    where: 'Ikke tilgaengeligt endnu.',
    available: false,
    keywords: ['dokument', 'dokumenter', 'filer', 'dokumentbibliotek'],
    tasks: [],
  },
  {
    id: 'chat',
    view: null,
    title: 'Team Chat',
    summary: 'Modulet er endnu ikke bygget. Brug Email System til interne beskeder indtil videre.',
    where: 'Ikke tilgaengeligt endnu.',
    available: false,
    keywords: ['chat', 'team chat', 'chatte'],
    tasks: [],
  },
]

// Emner der ikke hoerer til ét modul, men som folk alligevel spoerger om.
const APP_TOPICS = [
  {
    id: 'navigation',
    title: 'Saadan finder du rundt',
    keywords: ['forside', 'hub', 'tilbage', 'navigation', 'hvor finder jeg', 'menu', 'modul'],
    summary: 'Forsiden viser et felt for hvert modul. Klik et felt for at aabne modulet, og brug tilbage-knappen eller Escape for at komme tilbage til forsiden. Felter du ikke har adgang til, er tonet ned.',
  },
  {
    id: 'dashboard',
    title: 'Tilpas forsiden',
    keywords: ['widget', 'dashboard', 'forside', 'tilpas', 'skjul', 'vis'],
    summary: 'Du kan selv vaelge hvilke oversigter der vises paa forsiden, fx dagens opgaver, hvem der er fravaerende, og dagens mad. Indstillingen gaelder kun dig.',
  },
  {
    id: 'roles',
    title: 'Roller og hvem der kan hvad',
    keywords: ['rolle', 'rettighed', 'adgang', 'manager', 'managerpanel', 'kan ikke se', 'maa jeg', 'hvem kan', 'creator', 'administrator', 'laast'],
    summary: 'Der er tre roller. En almindelig bruger kan se og redigere teamets daglige data. En manager kan derudover godkende nye brugere og ferieanmodninger og styre opgavetyper, og har adgang til Manager Panel. En creator administrerer alle teams. Kan du ikke se et felt paa forsiden, er det enten fordi det kraever manager-adgang, eller fordi modulet endnu ikke er bygget. Har du brug for mere adgang, skal du spoerge din manager.',
  },
  {
    id: 'appearance',
    title: 'Tema og sprog',
    keywords: ['tema', 'moerk', 'lys', 'farve', 'sprog', 'dansk', 'engelsk', 'finsk', 'udseende'],
    summary: 'Tema og sprog skiftes oeverst i appen. Appen findes paa dansk, engelsk og finsk, og valget gaelder kun din egen bruger.',
  },
  {
    id: 'profile',
    title: 'Din profil og adgangskode',
    keywords: ['profil', 'adgangskode', 'kodeord', 'password', 'telefonnummer', 'mine oplysninger'],
    summary: 'Under din profil kan du rette dit telefonnummer og skifte adgangskode. Navn og e-mail styres af din manager.',
  },
  {
    id: 'storage',
    title: 'Faelles drev, offline og synkronisering',
    keywords: ['offline', 'forbindelse', 'synkronisering', 'drev', 'gemt', 'lager', 'optaget'],
    summary: 'Alle data ligger paa et faelles drev, saa hele teamet ser det samme. Mister du forbindelsen, kan du arbejde videre, og aendringerne sendes automatisk naar forbindelsen er tilbage. Beskeden om at lageret er optaget betyder blot at en kollega skrev i samme oejeblik. Appen proever selv igen.',
  },
  {
    id: 'updates',
    title: 'Opdateringer af appen',
    keywords: ['opdatering', 'ny version', 'opdater', 'version'],
    summary: 'Appen tjekker selv efter nye versioner og giver besked, naar der er en. Opdateringen hentes fra det faelles drev, og appen genstarter naar den er lagt paa plads.',
  },
  {
    id: 'assistant',
    title: 'Hvad Hubert kan hjaelpe med',
    keywords: ['hubert', 'chatbot', 'assistent', 'hvad kan du', 'hjaelp', 'hjaelpe mig'],
    summary: 'Hubert kan slaa op i hubbens data, fx hvem der har ferie, hvad der er paa madplanen, eller hvilke opgaver du har. Hubert kan ogsaa forklare hvordan modulerne bruges, og foreslaa handlinger som en ferieanmodning eller en to-do, som du selv bekraefter til sidst. Hubert kan kun laese data, aldrig aendre eller godkende noget af sig selv.',
  },
]

const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
// Danske/finske tegn foldes, saa "hjælp" og "hjaelp" scorer ens uanset hvad
// brugeren skriver, og uanset hvordan teksten er stavet i denne fil.
const fold = value => normalize(value)
  .replace(/[æä]/g, 'ae').replace(/[øö]/g, 'oe').replace(/å/g, 'aa')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

// "skal jeg" er bevidst IKKE med: "hvilke opgaver skal jeg lave naeste uge" er
// et dataspoergsmaal, ikke en anmodning om en vejledning.
const HOW_TO = /\b(hvordan|hvorledes|hvor (?:finder|ser|aendrer|opretter|skriver|godkender|melder)|kan jeg|how (?:do|can|to)|where (?:do|can|is)|miten|kuinka|mista)\b/
// Spoergsmaal der starter med disse, beder om DATA uanset resten af saetningen.
const DATA_QUESTION = /^(hvilke|hvilken|hvilket|hvem|hvornaar|hvor mange|hvad er der|which|who|when|how many|kuka|ketka)\b/

/** True hvis spoergsmaalet handler om at GOERE noget, ikke om at slaa data op. */
function isHowToQuestion(question) {
  const folded = fold(question)
  if (DATA_QUESTION.test(folded)) return false
  return HOW_TO.test(folded)
}

function scoreKeywords(haystack, keywords) {
  let score = 0
  for (const keyword of keywords) {
    const folded = fold(keyword)
    if (!folded) continue
    // Dansk boejer og sammensaetter: "ferieanmodning", "vagtplanen",
    // "notesbogen". Derfor matches laengere noegleord som ordPRAEFIKS, mens
    // korte ord (fx "fri", "syg") kraever et helt ord for ikke at ramme alt.
    const pattern = folded.includes(' ') ? folded : folded.length >= 4 ? `\\b${folded}` : `\\b${folded}\\b`
    if (new RegExp(pattern).test(haystack)) score += folded.includes(' ') ? 3 : 2
  }
  return score
}

const allowed = (entry, role) => !entry.requires || entry.requires === role || (entry.requires === MANAGER && role === CREATOR)

/**
 * Finder den app-viden der bedst matcher spoergsmaalet.
 * `keepRestricted` beholder traef brugeren ikke har adgang til, saa kalderen kan
 * forklare HVORFOR i stedet for at tilbyde en tilfaeldig anden opgave.
 */
function matchAppGuide(question, { role = 'user', limit = 3, keepRestricted = false } = {}) {
  const haystack = fold(question)
  if (!haystack) return []
  const matches = []
  for (const module of APP_GUIDE) {
    const moduleScore = scoreKeywords(haystack, [...module.keywords, module.title])
    for (const task of module.tasks) {
      // Opgaven skal ramme paa SINE EGNE ord. Ellers ville et loest modulord
      // (fx "uge") goere et rent dataspoergsmaal til en vejledning.
      const taskScore = scoreKeywords(haystack, [...task.keywords, task.title])
      if (!taskScore) continue
      matches.push({ kind: 'task', module, task, score: moduleScore + taskScore * 2, allowed: allowed(task, role) && allowed(module, role) })
    }
    if (moduleScore > 0) matches.push({ kind: 'module', module, score: moduleScore, allowed: allowed(module, role) })
  }
  for (const topic of APP_TOPICS) {
    const score = scoreKeywords(haystack, [...topic.keywords, topic.title])
    if (score > 0) matches.push({ kind: 'topic', topic, score, allowed: true })
  }
  matches.sort((a, b) => b.score - a.score)
  return (keepRestricted ? matches : matches.filter(match => match.allowed)).slice(0, limit)
}

const appGuideTopic = id => APP_TOPICS.find(topic => topic.id === id)

// Et enkelt loest modulord (fx "uge") er IKKE nok til at kalde et spoergsmaal
// besvaret. Uden denne graense ville "hvad serverede koekkenet uge 36?" blive
// til en app-forklaring i stedet for at naa dataopslag og planlaegger.
const CONFIDENT_SCORE = 4

/**
 * Samlet indgang til app-viden.
 * `requireTask` (how-to-vejen): giver kun svar ved et konkret opgave-traef, saa
 * rene dataspoergsmaal ikke kapres. Uden den (blindgyde-vejen): giver ALTID et
 * brugbart svar - i vaerste fald et overblik over hvad Hubert kan.
 * `unmatched` markerer at intet kendt emne blev ramt, saa det stadig kan
 * logges, maales og sendes videre til den semantiske planlaegger.
 */
function appGuidance(question, { role = 'user', requireTask = false } = {}) {
  const matches = matchAppGuide(question, { role, limit: 3, keepRestricted: true })
  // Paa how-to-vejen godtages ogsaa et SIKKERT emne-traef (fx "hvordan skifter
  // jeg tema?"), selvom emnet ikke har trin. Emner er app-viden, ikke data, saa
  // de kan ikke kapre et dataopslag - modul-traef kan, og godtages derfor ikke.
  const confident = match => match.kind === 'task' || (match.kind === 'topic' && match.score >= CONFIDENT_SCORE)
  const top = requireTask ? matches.find(confident) : matches.find(match => match.kind === 'task' || match.score >= CONFIDENT_SCORE)
  if (requireTask && !top) return null
  // Kraever traeffet en rolle brugeren ikke har, saa forklar DET i stedet for
  // at tilbyde en tilfaeldig anden opgave fra samme modul.
  if (top && !top.allowed) {
    const roles = appGuideTopic('roles')
    return { text: `${roles.title}\n${roles.summary}`, title: roles.title }
  }
  if (top) return { text: formatAppGuide([top]), title: top.task ? `${top.module.title} \u00b7 ${top.task.title}` : top.module ? top.module.title : top.topic.title }
  return { text: appGuideOverview(role), title: appGuideTopic('assistant').title, unmatched: true }
}

/** Kort overblik over hele appen - svaret paa "hvad kan du hjaelpe mig med?". */
function appGuideOverview(role = 'user') {
  const modules = APP_GUIDE
    .filter(module => module.available !== false && allowed(module, role))
    .map(module => `- ${module.title}: ${module.summary}`)
  const unavailable = APP_GUIDE.filter(module => module.available === false).map(module => module.title)
  return [
    'Moduler i Supply Chain Hub:',
    ...modules,
    unavailable.length ? `Endnu ikke bygget: ${unavailable.join(', ')}.` : '',
    APP_TOPICS.find(topic => topic.id === 'assistant').summary,
  ].filter(Boolean).join('\n')
}

/** Formaterer fundne match som evidens modellen kan svare ud fra. */
function formatAppGuide(matches) {
  return matches.map(match => {
    if (match.kind === 'topic') return `${match.topic.title}\n${match.topic.summary}`
    if (match.kind === 'module') return `${match.module.title}\n${match.module.summary}\nHvor: ${match.module.where}`
    const { module, task } = match
    return [
      `${module.title} - ${task.title}`,
      `Hvor: ${module.where}`,
      ...task.steps.map((step, index) => `${index + 1}. ${step}`),
      task.notes ? `Bemaerk: ${task.notes}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n')
}

module.exports = { APP_GUIDE, APP_TOPICS, matchAppGuide, appGuideTopic, appGuidance, appGuideOverview, formatAppGuide, isHowToQuestion }
