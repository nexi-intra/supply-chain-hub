// Kryds-modul-indsigter: deterministiske svar der KOMBINERER personer, ferie,
// sygdom, hjemmearbejde og vagter. Ingen model kraeves; samme adgangsmodel som
// resten af assistenten (kun principal.teams, kun godkendte data, aldrig
// noter/aarsager, aldrig andre teams). Svarer paa spoergsmaalets sprog.
const { listPeople, aliasesFor, canonical, bounded, similarPeople } = require('./assistantPeople.cjs')
const { matchesHomeOfficePattern } = require('./homeOfficeRecurrence.cjs')
const { loadShifts } = require('./assistantShifts.cjs')
const { nextStep } = require('./assistantNextStep.cjs')
const { mentionsPeriod, thisWeek } = require('./assistantDates.cjs')
const { nextWorkingDay, runEnd } = require('./workdays.cjs')
const { formatDay, formatRange, formatHeading, closeSentence } = require('./assistantDateFormat.cjs')
const { exampleDates } = require('./assistantActions.cjs')

const { norm } = require('./assistantNorm.cjs')
const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const eachDay = (range, limit = 62) => {
  const days = []
  const cursor = new Date(`${range.start}T12:00:00`)
  for (let i = 0; i < limit; i++, cursor.setDate(cursor.getDate() + 1)) {
    const value = dateString(cursor)
    if (value > range.end) break
    days.push(value)
  }
  return days
}

const T = {
  da: {
    vacation: 'Ferie', sick: 'Sygemeldt', parental: 'Barsel', state: { sick: 'sygemeldt', vacation: 'på ferie', parental: 'på barsel' }, noun: { sick: 'en sygemelding', vacation: 'ferie', parental: 'barsel' }, home: 'Hjemmearbejde', work: 'På arbejde', task: 'Opgave', atWork: 'På arbejde', absent: 'Fravær',
    whereTitle: (name, date) => `Status for ${name} (${date})`,
    noRecords: name => `Ingen registreringer for ${name} i perioden — det betyder ikke nødvendigvis fri.`,
    backOn: (name, type, end, back, f) => closeSentence(`${name} er ${T.da.state[type]} til og med ${f.day(end)} og er tilbage ${f.day(back)}`),
    backNone: name => `${name} har intet aktivt eller kommende registreret fravær.`,
    backUpcoming: (name, type, start, end, back, f) => closeSentence(`${name} har ${T.da.noun[type]} ${start === end ? f.day(start) : `fra ${f.day(start)} til ${f.day(end)}`} og er tilbage ${f.day(back)}`),
    availableTitle: range => `Tilgængelighed (${range})`,
    headcount: (working, home, away) => `${working} på arbejde${home ? ` (heraf ${home} hjemmefra)` : ''} · ${away} fraværende`,
    availableAtWork: 'På arbejde', availableHome: 'Hjemmearbejde (arbejder, men hjemmefra)', availableAway: 'Fraværende',
    availableNone: 'Ingen godkendte personer fundet i de valgte teams.',
    absenceTitle: range => `Fravær (${range})`, absenceNone: 'Intet registreret fravær i perioden.',
    workloadTitle: (range, most) => `${most ? 'Flest' : 'Færrest'} registrerede opgaver (${range})`,
    workloadNone: 'Ingen registrerede opgaver i perioden.',
    workloadLine: (name, count) => `${name} — ${count} ${count === 1 ? 'opgave' : 'opgaver'}`,
    conflictTitle: range => `Vagter der falder sammen med registreret fravær (${range})`,
    conflictNone: 'Ingen vagter falder sammen med godkendt fravær i perioden.',
    conflictLine: (date, name, role, type) => `${date} · ${name}: ${role} — samtidig ${T.da.state[type]}`,
    disclaimer: 'Kun registrerede data; manglende registrering betyder ikke nødvendigvis fri.',
    unknown: 'Opgave/rolle uden navn',
    noBalance: 'Hubben har ingen feriesaldo, så jeg kan ikke sige, hvor mange feriedage du har tilbage – det får du hos din leder. Jeg kan vise din kommende godkendte ferie.',
    briefingTitle: range => `Dit overblik (${range})`, briefingMe: 'Dig', briefingTeam: 'Teamet',
    briefingMeNone: 'Intet registreret på dig i perioden.', briefingTeamNone: 'Intet fravær eller hjemmearbejde registreret i teamet.',
    nextVacationTitle: (name, own) => own ? 'Din kommende godkendte ferie' : `Kommende godkendt ferie for ${name}`,
    nextVacationNone: (name, own, [from, to]) => own ? `Du har ingen kommende godkendt ferie registreret. Vil du søge, så skriv fx «opret ferie fra ${from} til ${to}».` : `${name} har ingen kommende godkendt ferie registreret.`,
  },
  en: {
    vacation: 'Vacation', sick: 'Sick leave', parental: 'Parental leave', state: { sick: 'on sick leave', vacation: 'on vacation', parental: 'on parental leave' }, noun: { sick: 'sick leave', vacation: 'vacation', parental: 'parental leave' }, home: 'Working from home', work: 'At work', task: 'Task', atWork: 'At work', absent: 'Absent',
    whereTitle: (name, date) => `Status for ${name} (${date})`,
    noRecords: name => `No records for ${name} in this period — this does not necessarily mean time off.`,
    backOn: (name, type, end, back, f) => closeSentence(`${name} is ${T.en.state[type]} through ${f.day(end)} and is back on ${f.day(back)}`),
    backNone: name => `${name} has no active or upcoming recorded absence.`,
    backUpcoming: (name, type, start, end, back, f) => closeSentence(`${name} has ${T.en.noun[type]} ${start === end ? `on ${f.day(start)}` : `from ${f.day(start)} to ${f.day(end)}`} and is back on ${f.day(back)}`),
    availableTitle: range => `Availability (${range})`,
    headcount: (working, home, away) => `${working} at work${home ? ` (${home} from home)` : ''} · ${away} absent`,
    availableAtWork: 'At work', availableHome: 'Working from home', availableAway: 'Absent',
    availableNone: 'No approved people found in the selected teams.',
    absenceTitle: range => `Absence (${range})`, absenceNone: 'No absence recorded in this period.',
    workloadTitle: (range, most) => `${most ? 'Most' : 'Fewest'} recorded tasks (${range})`,
    workloadNone: 'No recorded tasks in this period.',
    workloadLine: (name, count) => `${name} — ${count} ${count === 1 ? 'task' : 'tasks'}`,
    conflictTitle: range => `Shifts that overlap recorded absence (${range})`,
    conflictNone: 'No shifts overlap approved absence in this period.',
    conflictLine: (date, name, role, type) => `${date} · ${name}: ${role} — also ${T.en.state[type]}`,
    disclaimer: 'Recorded data only; a missing record does not necessarily mean time off.',
    unknown: 'Unnamed task/role',
    noBalance: 'The hub keeps no vacation balance, so I cannot say how many vacation days you have left – ask your manager. I can show your upcoming approved vacation.',
    briefingTitle: range => `Your overview (${range})`, briefingMe: 'You', briefingTeam: 'Team',
    briefingMeNone: 'Nothing recorded for you in this period.', briefingTeamNone: 'No absence or home office recorded in the team.',
    nextVacationTitle: (name, own) => own ? 'Your upcoming approved vacation' : `Upcoming approved vacation for ${name}`,
    nextVacationNone: (name, own, [from, to]) => own ? `You have no upcoming approved vacation recorded. To request some, write e.g. “create vacation from ${from} to ${to}”.` : `${name} has no upcoming approved vacation recorded.`,
  },
  fi: {
    vacation: 'Loma', sick: 'Sairauslomalla', parental: 'Perhevapaa', state: { sick: 'sairauslomalla', vacation: 'lomalla', parental: 'perhevapaalla' }, noun: { sick: 'sairausloma', vacation: 'loma', parental: 'perhevapaa' }, home: 'Etätyössä', work: 'Töissä', task: 'Tehtävä', atWork: 'Töissä', absent: 'Poissa',
    whereTitle: (name, date) => `Tilanne: ${name} (${date})`,
    noRecords: name => `${name}: ei kirjauksia ajanjaksolla — se ei välttämättä tarkoita vapaata.`,
    backOn: (name, type, end, back, f) => closeSentence(`${name} on ${T.fi.state[type]} ${f.day(end, { weekday: false })} asti ja palaa ${f.day(back, { inflect: 'essive' })}`),
    backNone: name => `${name}: ei aktiivista tai tulevaa kirjattua poissaoloa.`,
    backUpcoming: (name, type, start, end, back, f) => closeSentence(`${name}: ${T.fi.noun[type]} ${start === end ? f.day(start, { inflect: 'essive' }) : f.range(start, end)}, palaa ${f.day(back, { inflect: 'essive' })}`),
    availableTitle: range => `Saatavuus (${range})`,
    headcount: (working, home, away) => `${working} töissä${home ? ` (joista ${home} etänä)` : ''} · ${away} poissa`,
    availableAtWork: 'Töissä', availableHome: 'Etätyössä', availableAway: 'Poissa',
    availableNone: 'Valituista tiimeistä ei löytynyt hyväksyttyjä henkilöitä.',    absenceTitle: range => `Poissaolot (${range})`, absenceNone: 'Ajanjaksolle ei ole kirjattu poissaoloja.',    workloadTitle: (range, most) => `${most ? 'Eniten' : 'Vähiten'} kirjattuja tehtäviä (${range})`,
    workloadNone: 'Ajanjaksolla ei ole kirjattuja tehtäviä.',
    workloadLine: (name, count) => `${name} — ${count} ${count === 1 ? 'tehtävä' : 'tehtävää'}`,
    conflictTitle: range => `Vuorot, jotka osuvat kirjattuun poissaoloon (${range})`,
    conflictNone: 'Yksikään vuoro ei osu hyväksyttyyn poissaoloon ajanjaksolla.',
    conflictLine: (date, name, role, type) => `${date} · ${name}: ${role} — samaan aikaan ${T.fi.state[type]}`,
    disclaimer: 'Vain kirjatut tiedot; puuttuva kirjaus ei välttämättä tarkoita vapaata.',
    unknown: 'Nimetön tehtävä/rooli',
    noBalance: 'Hubissa ei ole lomasaldoa, joten en voi sanoa, montako lomapäivää sinulla on jäljellä – kysy esihenkilöltäsi. Voin näyttää tulevan hyväksytyn lomasi.',
    briefingTitle: range => `Yhteenveto (${range})`, briefingMe: 'Sinä', briefingTeam: 'Tiimi',
    briefingMeNone: 'Sinulle ei ole kirjauksia ajanjaksolla.', briefingTeamNone: 'Tiimissä ei ole kirjattuja poissaoloja tai etätyötä.',
    nextVacationTitle: (name, own) => own ? 'Tuleva hyväksytty lomasi' : `Tuleva hyväksytty loma: ${name}`,
    nextVacationNone: (name, own, [from, to]) => own ? `Sinulle ei ole kirjattu tulevaa hyväksyttyä lomaa. Voit hakea lomaa kirjoittamalla esim. «luo loma ${from}–${to}».` : `${name}: tulevaa hyväksyttyä lomaa ei ole kirjattu.`,
  },
  sv: {
    vacation: 'Semester', sick: 'Sjukskriven', parental: 'Föräldraledighet', state: { sick: 'sjukskriven', vacation: 'på semester', parental: 'föräldraledig' }, noun: { sick: 'sjukfrånvaro', vacation: 'semester', parental: 'föräldraledighet' }, home: 'Hemarbete', work: 'På jobbet', task: 'Uppgift', atWork: 'På jobbet', absent: 'Frånvarande',
    whereTitle: (name, date) => `Status för ${name} (${date})`,
    noRecords: name => `Inga registreringar för ${name} under perioden — det betyder inte nödvändigtvis ledigt.`,
    backOn: (name, type, end, back, f) => closeSentence(`${name} är ${T.sv.state[type]} till och med ${f.day(end)} och är tillbaka ${f.day(back)}`),
    backNone: name => `${name} har ingen pågående eller kommande registrerad frånvaro.`,
    backUpcoming: (name, type, start, end, back, f) => closeSentence(`${name} har ${T.sv.noun[type]} ${start === end ? f.day(start) : `från ${f.day(start)} till ${f.day(end)}`} och är tillbaka ${f.day(back)}`),
    availableTitle: range => `Tillgänglighet (${range})`,
    headcount: (working, home, away) => `${working} på jobbet${home ? ` (varav ${home} hemifrån)` : ''} · ${away} frånvarande`,
    availableAtWork: 'På jobbet', availableHome: 'Hemarbete (arbetar, men hemifrån)', availableAway: 'Frånvarande',
    availableNone: 'Inga godkända personer hittades i de valda teamen.',
    absenceTitle: range => `Frånvaro (${range})`, absenceNone: 'Ingen frånvaro registrerad under perioden.',
    workloadTitle: (range, most) => `${most ? 'Flest' : 'Färst'} registrerade uppgifter (${range})`,
    workloadNone: 'Inga registrerade uppgifter under perioden.',
    workloadLine: (name, count) => `${name} — ${count} ${count === 1 ? 'uppgift' : 'uppgifter'}`,
    conflictTitle: range => `Pass som sammanfaller med registrerad frånvaro (${range})`,
    conflictNone: 'Inga pass sammanfaller med godkänd frånvaro under perioden.',
    conflictLine: (date, name, role, type) => `${date} · ${name}: ${role} — samtidigt ${T.sv.state[type]}`,
    disclaimer: 'Endast registrerade data; en saknad registrering betyder inte nödvändigtvis ledigt.',
    unknown: 'Uppgift/roll utan namn',
    noBalance: 'Hubben har inget semestersaldo, så jag kan inte säga hur många semesterdagar du har kvar – fråga din chef. Jag kan visa din kommande godkända semester.',
    briefingTitle: range => `Din översikt (${range})`, briefingMe: 'Du', briefingTeam: 'Teamet',
    briefingMeNone: 'Inget registrerat på dig under perioden.', briefingTeamNone: 'Ingen frånvaro eller hemarbete registrerat i teamet.',
    nextVacationTitle: (name, own) => own ? 'Din kommande godkända semester' : `Kommande godkänd semester för ${name}`,
    nextVacationNone: (name, own, [from, to]) => own ? `Du har ingen kommande godkänd semester registrerad. Vill du ansöka, skriv t.ex. «skapa semester från ${from} till ${to}».` : `${name} har ingen kommande godkänd semester registrerad.`,
  },
}

// Konservative triggere: maa IKKE kapre eksisterende spor (fx "hvem har ferie
// naeste uge" -> ferie-modulet, "hvem arbejder hjemme" -> hjemmearbejde-sporet).
const INTENTS = {
  // "Er Anne syg i dag?" / "is Bo on vacation tomorrow?": one named person, one kind of absence (the reason is never shown).
  personState: /(?:^|\s)(?:er|var|is|was|onko|oliko|är)\s+(?!(?:der|there|någon|nogen|anyone|anybody|someone|joku|kukaan)(?=\s))\S.{1,40}?\s+(?:(?:i dag|idag|i morgen|imorgen|i går|today|tomorrow|yesterday|tänään|huomenna|eilen|imorgon|i morgon)\s+)?(?:(syg|sygemeldt|sick|ill|off sick|on sick leave|sairaana|kipeänä|sairauslomalla|sjuk|sjukskriven)|(på ferie|ferie|on vacation|on holiday|lomalla|på semester|semester)|(hjemme|på hjemmearbejde|hjemmearbejde|working from home|home|etätöissä|etätyössä|hemma|hemarbete))(?=\s|[?!.]|$)/iu,
  // "hvor mange feriedage har jeg tilbage?": the hub keeps no allowance, so the answer is the own upcoming approved vacation and that fact.
  vacationBalance: /feriesaldo|ferie ?saldo|feriedage|ferie\w* tilbage|tilbage af (?:min |mit )?ferie|hvor meget ferie|vacation (?:balance|days)|holiday (?:balance|days)|leave balance|days of (?:vacation|holiday|leave)|(?:vacation|holiday|leave) (?:do i have )?left|remaining (?:vacation|holiday)|lomasaldo|lomapäiv\p{L}*|lomaa jäljellä|paljonko lomaa|semestersaldo|semesterdag\p{L}*|semester kvar|hur mycket semester/iu,
  // "sammenlign i dag med i går": to perioder side om side.
  compare: /^(?:sammenlign|compare|vertaa|jämför)\s+(.+?)\s+(?:med|with|vs\.?|to|ja|och|mot|og|and)\s+(.+?)\s*\??$/iu,
  whereIs: /(?:hvor er|hvor befinder|where is|where's|missä on|missä .{2,40} on|var är|var befinner)|(?:^|\s)(?:er|is|onko|är)\s+(?!(?:der|there|här|där)\s)\S.{0,40}?\s(?:på arbejde|paa arbejde|på kontoret|at work|in the office|in today|working today|töissä|toimistolla|på jobbet)|(?:registreret|noteret|planlagt|booket|registered|scheduled|planned|booked|registrerat|registrerad|planerat|planerad|bokat|bokad)\s+(?:på|paa|for|til|on|för)\s+\S|(?:hvad laver|status (?:på|paa|for)|what is \S+(?: \S+)? doing|what's \S+(?: \S+)? doing|status (?:of|for)|mitä \S+ tekee|vad gör (?!jag\b|vi\b)\S+|status för)/iu,
  available: /(?:ledig|ledige|til rådighed|til raadighed|available|(?:is|are)\s+free\b|free to work|vapaa|vapaita|vapaana|tillgänglig)|(?:hvem|who|ketkä|ketka|kuka|vem)\s+(?:er|is|are|ovat|on|är)\s+(?:alle\s+|alla\s+|tänään\s+|huomenna\s+|i dag\s+|idag\s+|i morgen\s+|imorgen\s+|today\s+|tomorrow\s+|i morgon\s+|imorgon\s+)?(?:på arbejde|paa arbejde|på kontoret|paa kontoret|at work|working|in the office|in today|töissä|toissa|toimistolla|på jobbet|i tjänst)|^(?:hvem|who|vem)\s+(?:arbejder|works|arbetar|jobbar)\b(?!\s+(?:på|paa|on|med|with)\s+(?!mig\b|me\b|(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|monday|tuesday|wednesday|thursday|friday|saturday|sunday|måndag|tisdag|lördag|söndag|i dag|idag|i morgen|imorgen|today|tomorrow|i morgon|imorgon)\b))|(?:hvem|who|kuka|ketkä|vem)\s+(?:har|er|is|are|has|on|ovat|är)\s+(?:fri|off|the day off|time off|vapaalla|poissa|ledigt)\b|(?:nogen|anyone|anybody|someone|någon)\s+(?:der\s+|som\s+)?(?:har|is|are|has|är)\s+(?:fri|off|ledig)\b|(?:hvor mange|how many|kuinka monta|montako|hur många)\b.{0,25}?(?:på arbejde|paa arbejde|på job|at work|working|in today|töissä|toissa|på jobbet|jobbar|arbetar)|^(?:hvem|who|vem)(?:'s|\s+(?:er|is|are|är))\s+(?:på|on|in|her|inde|here|der|there|här|där)(?:\s+(?:i dag|idag|today|nu|now))?\s*\??$/iu,
  // Personligt overblik: "hvad sker der i dag?", "noget nyt?", "overblik over min uge".
  briefing: /^(?:hvad sker der|hvad foregår der|what'?s happening|what is happening|what'?s going on|mitä (?:tänään |huomenna )?tapahtuu)(?:\s+(?:i dag|idag|i morgen|imorgen|denne uge|i denne uge|næste uge|i næste uge|today|tomorrow|this week|next week|tänään|huomenna|tällä viikolla|ensi viikolla))?\s*\??$|^(?:noget nyt|er der noget nyt|anything new|what'?s new|mitä uutta)\s*\??$|overblik over (?:min|mit|mine|dagen|ugen|i dag|i morgen|næste uge|denne uge)\b|(?:overview|summary) (?:of|for) (?:my|today|tomorrow|this week|next week)\b|(?:^|\s)(?:min dag|min uge|my day|my week|päiväni|viikkoni)(?=\s|\?|$)|^(?:hvad bør jeg|hvad burde jeg|what should i)\s+(?:gøre|lave|do|work on)(?:\s+(?:nu|i dag|idag|now|today))?\s*\??$|^(?:hvad laver jeg|what am i doing|mitä teen)(?:\s+(?:i dag|idag|i morgen|imorgen|i overmorgen|denne uge|næste uge|today|tomorrow|this week|next week|tänään|huomenna))?\s*\??$|^hvordan ser (?:min |mit |mine )?(?:dag(?:en)?|uge(?:n)?|i dag|i morgen|næste uge|denne uge)\b.{0,20}\bud\b|^how does (?:my |the )?(?:day|week|today|tomorrow|next week)\b.{0,15}\blook\b|^(?:hvad er )?min status\b|^what(?:'s| is) my status\b|^mikä on tilanteeni\b|^(?:hvad med|og|what about|how about|entä)\s+(?:i dag|idag|i morgen|imorgen|i overmorgen|today|tomorrow|tänään|huomenna)\s*\??$|^(?:vad händer|vad är på gång)(?:\s+(?:i dag|idag|i morgon|imorgon|denna vecka|i veckan|nästa vecka))?\s*\??$|^(?:något nytt|nåt nytt|är det något nytt)\s*\??$|översikt (?:över|av) (?:min|mitt|mina|dagen|veckan|idag|i dag|imorgon|i morgon|nästa vecka|denna vecka)\b|(?:^|\s)min vecka(?=\s|\?|$)|^vad (?:bör|borde|ska) jag (?:göra|jobba med)(?:\s+(?:nu|i dag|idag))?\s*\??$|^vad gör jag(?:\s+(?:i dag|idag|i morgon|imorgon|i övermorgon|denna vecka|nästa vecka))?\s*\??$|^hur ser (?:min |mitt |mina )?(?:dag(?:en)?|vecka(?:n)?|i dag|idag|i morgon|imorgon|nästa vecka|denna vecka)\b.{0,20}\but\b|^(?:vad är )?min status\b|^(?:och|vad sägs om)\s+(?:i dag|idag|i morgon|imorgon|i övermorgon)\s*\??$/iu,
  // Egen naeste ferie: "hvornår har jeg fri næste gang?" (navngivne personer klares af videns-sporet).
  nextVacation: /^(?:hvornår|hvornaar)\s+(?:har|holder|får)\s+\S.{0,40}?\s+(?:fri|fridag)\b|^(?:hvornår|hvornaar)\s+(?:har|holder|får)\s+jeg\s+ferie|^hvornår er min næste (?:ferie|fridag)|^when (?:is my next|do i have|am i (?:next )?(?:off|on))|^when is \S.{0,40}? (?:off|on vacation|on holiday)\b|^when (?:does|do) \S.{0,40}? have (?:a )?(?:day off|time off|vacation|holiday)|^milloin (?:minulla on|on seuraava|olen) (?:loma|lomalla|vapaa)|^milloin \S.{0,40}? on (?:lomalla|vapaalla)|^när\s+(?:har|får)\s+jag\s+(?:semester|ledigt)|^när är min nästa (?:semester|lediga dag)|^när\s+(?:har|får)\s+\S.{0,40}?\s+(?:semester|ledigt)\b|^när är \S.{0,40}? (?:ledig|på semester)\b/iu,
  back: /(?:hvornår|hvornaar|hvor længe|hvor laenge)\s+(?:er|kommer)\s+\S.{0,40}?\s*(?:tilbage|retur)|when\s+(?:is|will|does)\s+\S.{0,40}?\s*(?:back|return)|how long is\s+\S.{0,40}?\s*(?:away|gone|off)|milloin\s+\S.{0,40}?\s*(?:palaa|on takaisin|tulee takaisin)|(?:när|hur länge)\s+(?:är|kommer)\s+\S.{0,40}?\s*(?:tillbaka|borta)/iu,
  workload: /(?:flest|færrest|faerrest|most|fewest|least|eniten|vähiten|vahiten|färst|minst)\s+(?:registrerede\s+|registrerade\s+)?(?:opgaver|vagter|tasks|shifts|assignments|tehtäviä|tehtavia|vuoroja|uppgifter|pass)|(?:hvem har|who has|kenellä on|kenella on|vem har)\s+(?:flest|færrest|faerrest|most|fewest|least|eniten|vähiten|vahiten|färst|minst)/iu,
  // "hvem er på barsel?": parental leave is its own list, with the day each person is back.
  parental: /(?:^|[^\p{L}])(?:barsel\p{L}*|parental leave|perhevapaa\p{L}*|vanhempainvapaa\p{L}*|föräldraledig\p{L}*)(?=$|[^\p{L}])/iu,
  conflicts: /(?:kolliderer|konflikt|overlapper|clash|conflict|overlap|päällekkäin|paallekkain|päällekkäis|krock|överlappar|sammanfaller)/iu,
  // "status på teamet", "team status", "hvordan har teamet det?" = tilgængelighed for hele teamet.
  teamStatus: /^(?:status (?:på|paa|for|för) (?:teamet|holdet|os|oss)|team ?status|teamets status|status (?:of|for) (?:the|my|our) team|(?:hvordan|how|hur) (?:har|is|går det med|are|mår|går det för) (?:teamet|holdet|the team|my team|our team)(?: det)?|tiimin tilanne)\b/iu,
}
// "available"-ord optraeder ogsaa i system-/opdaterings-spoergsmaal; de skal
// ikke udloese personoversigten.
const AVAILABLE_BLOCKERS = /opdater|update|version|app\b|modul|module|system|päivit|paivit|download|installer|uppdater/iu

function absenceFor(team, readTeam) {
  const vacations = (readTeam(team, 'vacation-entries') || []).filter(entry => entry && entry.status === 'approved')
  const sick = (readTeam(team, 'sick-leave-entries') || []).filter(entry => entry && entry.status === 'approved')
  const covers = (entry, date) => String(entry.startDate || '').slice(0, 10) <= date && String(entry.endDate || entry.startDate || '').slice(0, 10) >= date
  // Entries per person, so a day lookup scans one person's entries instead of the whole team's.
  const byUser = list => { const map = new Map(); for (const entry of list) { const id = norm(entry.userEmail); const own = map.get(id); if (own) own.push(entry); else map.set(id, [entry]) } return map }
  const sickBy = byUser(sick)
  const vacationBy = byUser(vacations)
  return {
    vacations, sick,
    typeOn: (email, date) => {
      if (sickBy.get(email)?.some(entry => covers(entry, date))) return 'sick'
      const onVacation = (vacationBy.get(email) || []).filter(entry => covers(entry, date))
      if (onVacation.some(entry => entry.type === 'parental')) return 'parental'
      if (onVacation.length) return 'vacation'
      return null
    },
  }
}

function homeOfficeFor(team, readTeam) {
  const patterns = readTeam(team, 'home-office-patterns') || {}
  const exceptions = readTeam(team, 'home-office-exceptions') || []
  return (email, date) => {
    const exception = exceptions.find(item => norm(item?.userEmail) === email && item.date === date)
    if (exception) return exception.isHomeOffice === true
    return matchesHomeOfficePattern(patterns[email], new Date(`${date}T12:00:00`))
  }
}

// Single shifts plus recurring patterns, loaded once per team and question.
function shiftsFor(team, readTeam, cache) {
  let loaded = cache.get(team.teamId)
  if (!loaded) { loaded = loadShifts(team, readTeam); cache.set(team.teamId, loaded) }
  return loaded
}

// Finder EN navngiven person i spoergsmaalet via samme alias-model som opgave-sporet.
// bounded() kraever ordgraenser, saa korte navne (fx "Bo") stadig er sikre.
function findPerson(question, people) {
  const q = canonical(question)
  const ranked = people.map(person => ({ person, rank: Math.max(0, ...aliasesFor(person).filter(({ alias }) => alias.length >= 2 && bounded(q, alias)).map(({ rank }) => rank)) })).filter(value => value.rank > 0)
  if (!ranked.length) return { person: null }
  const best = Math.max(...ranked.map(value => value.rank))
  const winners = ranked.filter(value => value.rank === best)
  if (winners.length > 1) return { ambiguous: winners.map(value => ({ id: value.person.email, label: `${value.person.name} (${[...new Set(value.person.memberships.map(member => member.label))].join(', ')})` })).sort((a, b) => a.label.localeCompare(b.label)) }
  return { person: winners[0].person }
}

const AMBIGUOUS = { da: 'Hvilken person mener du? Vælg en af personerne nedenfor.', en: 'Which person do you mean? Choose one of the people below.', fi: 'Ketä henkilöä tarkoitat? Valitse henkilö alta.', sv: 'Vilken person menar du? Välj en av personerna nedan.' }
const DID_YOU_MEAN = { da: 'Jeg kender ikke det navn. Mente du en af disse? Vælg personen nedenfor.', en: 'I do not know that name. Did you mean one of these? Choose the person below.', fi: 'En tunnista nimeä. Tarkoititko jotakuta näistä? Valitse henkilö alta.', sv: 'Jag känner inte igen det namnet. Menade du någon av dessa? Välj personen nedan.' }

const PARENTAL_TEXT = {
  da: { title: range => `Barsel (${range})`, leave: 'barsel', back: date => `tilbage ${date}`, none: 'Ingen er på barsel i perioden.', notOn: name => `${name} er ikke på barsel i perioden.`, noReason: 'Hubben gemmer ingen årsag til barsel – jeg kan kun vise datoerne.' },
  en: { title: range => `Parental leave (${range})`, leave: 'parental leave', back: date => `back on ${date}`, none: 'No one is on parental leave in this period.', notOn: name => `${name} is not on parental leave in this period.`, noReason: 'The hub stores no reason for parental leave – I can only show the dates.' },
  fi: { title: range => `Perhevapaa (${range})`, leave: 'perhevapaa', back: date => `palaa ${date}`, none: 'Kukaan ei ole perhevapaalla ajanjaksolla.', notOn: name => `${name} ei ole perhevapaalla ajanjaksolla.`, noReason: 'Hubi ei tallenna perhevapaan syytä – voin näyttää vain päivämäärät.' },
  sv: { title: range => `Föräldraledighet (${range})`, leave: 'föräldraledighet', back: date => `tillbaka ${date}`, none: 'Ingen är föräldraledig under perioden.', notOn: name => `${name} är inte föräldraledig under perioden.`, noReason: 'Hubben sparar ingen orsak till föräldraledighet – jag kan bara visa datumen.' },
}
const PERSON_STATE = {
  da: { states: { sick: 'sygemeldt', vacation: 'på ferie', home: 'på hjemmearbejde' }, yes: (name, state, dates) => closeSentence(`${name} er ${state}: ${dates}`), no: (name, state, range) => `${name} er ikke ${state} (${range}).` },
  en: { states: { sick: 'on sick leave', vacation: 'on vacation', home: 'working from home' }, yes: (name, state, dates) => closeSentence(`${name} is ${state}: ${dates}`), no: (name, state, range) => `${name} is not ${state} (${range}).` },
  fi: { states: { sick: 'sairauslomalla', vacation: 'lomalla', home: 'etätyössä' }, yes: (name, state, dates) => closeSentence(`${name} on ${state}: ${dates}`), no: (name, state, range) => `${name} ei ole ${state} (${range}).` },
  sv: { states: { sick: 'sjukskriven', vacation: 'på semester', home: 'på hemarbete' }, yes: (name, state, dates) => closeSentence(`${name} är ${state}: ${dates}`), no: (name, state, range) => `${name} är inte ${state} (${range}).` },
}
const REASON_ASKED = /(?:^|[^\p{L}])(?:hvorfor|årsag\p{L}*|grund|why|reason\p{L}*|miksi|syy\p{L}*|varför|orsak\p{L}*)(?=$|[^\p{L}])/iu
const SOURCE_TITLE = { da: 'Personstatus (vagter, ferie, sygdom, hjemmearbejde)', en: 'People status (shifts, vacation, sickness, home office)', fi: 'Henkilötilanne (vuorot, lomat, sairaudet, etätyö)', sv: 'Personstatus (pass, semester, sjukdom, hemarbete)' }

// Hovedindgang. Returnerer et svarobjekt eller null (=fald videre til andre spor).
// `allTeams`: a person missing from the asker's teams is looked up in every team for "what is X doing".
// `only` limits which intents may answer (used when the asker named a team that is not their own).
function insightAnswer({ question, principal, teams, readTeam, creatorEmail, language, resolveDates, selectedPerson, now = new Date(), allTeams, only }) {
  const q = norm(question)
  const shiftCache = new Map()
  const t = T[language] || T.da
  const absenceLabel = type => (type === 'sick' ? t.sick : type === 'parental' ? t.parental : t.vacation)
  const today = dateString(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12))
  const f = {
    day: (iso, options) => formatDay(iso, language, { now, ...options }),
    range: (start, end) => formatRange(start, end, language, { now }),
    heading: (start, end) => formatHeading(start, end, language, { now }),
  }
  const guideish = /guide|vejledning|manual|opas|oppaa/.test(q)
  if (guideish) return null
  const people = listPeople(teams, readTeam, creatorEmail)

  const intent = INTENTS.compare.test(q) ? 'compare'
    : INTENTS.vacationBalance.test(q) && /(?:^|[^\p{L}])(?:jeg|min|mit|mine|my|me|i|minun|minulla|jag|mitt|mina)(?=$|[^\p{L}])/u.test(q) ? 'vacationBalance'
    : INTENTS.briefing.test(q) ? 'briefing'
    : INTENTS.nextVacation.test(q) ? 'nextVacation'
    : INTENTS.back.test(q) ? 'back'
    : INTENTS.parental.test(q) ? 'parental'
    : INTENTS.workload.test(q) ? 'workload'
    : INTENTS.conflicts.test(q) && /vagt|opgave|shift|task|vuoro|tehtäv|ferie|fravær|fravaer|vacation|absence|loma|poissaolo|syg|sick|saira|pass|uppgift|semester|frånvaro|sjuk|schedule|schema|aikataulu/.test(q) ? 'conflicts'
    : INTENTS.teamStatus.test(q) ? 'available'
    : INTENTS.personState.test(q) && findPerson(q, people).person ? 'personState'
    : INTENTS.whereIs.test(q) ? 'whereIs'
    : INTENTS.available.test(q) && !/hjemme(?!fra alle)|home office|from home|etäty|etätö|hemma|hemifrån|hemarbete/.test(q) && !AVAILABLE_BLOCKERS.test(q) ? 'available'
    : null
  if (!intent || (only && !only.includes(intent))) return null

  const label = team => team.abbreviation || team.teamId
  const sourcesFor = scope => scope.map(team => ({ kind: 'insight', teamId: team.teamId, title: `${label(team)} · ${SOURCE_TITLE[language] || SOURCE_TITLE.da}` }))
  let sources = sourcesFor(teams)
  // Conflicts are about the plan ahead: without a period they cover this week.
  const range = resolveDates(q, now) || (intent === 'conflicts' && !mentionsPeriod(q) ? thisWeek(now) : { start: today, end: today })
  const rangeLabel = f.heading(range.start, range.end)
  const teamsOf = person => teams.filter(team => person.memberships.some(member => member.teamId === team.teamId))
  // Dagsstatus for en person: sygdom > ferie > vagt > hjemmearbejde (null = intet registreret).
  const statusOn = (person, date) => {
    let status = null
    for (const team of teamsOf(person)) {
      const absence = absenceFor(team, readTeam).typeOn(person.email, date)
      if (absence === 'sick') return t.sick
      if (absence === 'parental') return t.parental
      if (absence === 'vacation') return t.vacation
      const shifts = shiftsFor(team, readTeam, shiftCache)
      const member = person.memberships.find(member => member.teamId === team.teamId)
      const roleNames = shifts.onDay(date).filter(row => member.identifiers.has(norm(row.employeeId))).map(row => row.roleName || t.unknown)
      const home = homeOfficeFor(team, readTeam)(person.email, date)
      const candidate = roleNames.length ? { rank: 2, text: `${home ? t.home : t.work} — ${t.task}: ${[...new Set(roleNames)].join(', ')}` } : home ? { rank: 3, text: t.home } : null
      if (candidate && (!status || candidate.rank < status.rank)) status = candidate
    }
    return status ? status.text : null
  }

  // Personligt overblik for en periode: egen dagsstatus plus teamets fravaer/hjemmearbejde.
  const briefingFor = period => {
    const periodLabel = f.heading(period.start, period.end)
    const days = eachDay(period, 14)
    const me = people.find(person => person.email === canonical(principal.email))
    const mine = me ? days.map(date => [date, statusOn(me, date)]).filter(([, status]) => status).map(([date, status]) => `• ${f.day(date)}: ${status}`) : []
    const teamLines = []
    for (const date of days) {
      const away = []; const home = []
      for (const person of people.filter(person => person !== me)) {
        let absence = null; let isHome = false
        for (const team of teamsOf(person)) {
          absence = absence || absenceFor(team, readTeam).typeOn(person.email, date)
          isHome = isHome || homeOfficeFor(team, readTeam)(person.email, date)
        }
        if (absence) away.push(`${person.name} (${absenceLabel(absence)})`)
        else if (isHome) home.push(person.name)
      }
      const parts = []
      if (away.length) parts.push(`${t.absent}: ${away.sort().join(', ')}`)
      if (home.length) parts.push(`${t.home}: ${home.sort().join(', ')}`)
      if (parts.length) teamLines.push(`• ${f.day(date)}: ${parts.join(' · ')}`)
    }
    return [
      `${t.briefingTitle(periodLabel)}:`,
      `${t.briefingMe}:\n${mine.length ? mine.join('\n') : t.briefingMeNone}`,
      `${t.briefingTeam}:\n${teamLines.length ? teamLines.join('\n') : t.briefingTeamNone}`,
    ].join('\n\n')
  }

  if (intent === 'compare') {
    const match = INTENTS.compare.exec(q)
    const first = resolveDates(match[1], now)
    const second = resolveDates(match[2], now)
    if (!first || !second) return null
    return { mode: 'data', text: [briefingFor(first), briefingFor(second)].join('\n\n'), sources, range: first, contextQuestion: question }
  }

  if (intent === 'briefing') {
    const period = resolveDates(q, now) || (/uge|week|viikko|viikon|viikkoni|vecka|veckan/.test(q) ? resolveDates('denne uge', now) : null) || { start: today, end: today }
    return { mode: 'data', text: briefingFor(period), sources, range: period, contextQuestion: question }
  }

  // "Is Anne sick today?": yes or no for one person and one kind of absence, over the asked period.
  if (intent === 'personState') {
    const person = findPerson(q, people).person
    const match = INTENTS.personState.exec(q)
    const kind = match[1] ? 'sick' : match[2] ? 'vacation' : 'home'
    const text = PERSON_STATE[language] || PERSON_STATE.da
    const days = eachDay(range, 62).filter(date => teamsOf(person).some(team => {
      if (kind === 'home') return homeOfficeFor(team, readTeam)(person.email, date) && !absenceFor(team, readTeam).typeOn(person.email, date)
      const type = absenceFor(team, readTeam).typeOn(person.email, date)
      return kind === 'sick' ? type === 'sick' : type === 'vacation' || type === 'parental'
    }))
    const runs = []
    for (const date of days) {
      const last = runs.at(-1)
      if (last && new Date(`${date}T12:00:00`) - new Date(`${last.end}T12:00:00`) === 86400000) last.end = date
      else runs.push({ start: date, end: date })
    }
    const state = text.states[kind]
    const answer = runs.length
      ? text.yes(person.name, state, runs.map(run => f.range(run.start, run.end)).join(', '))
      : `${text.no(person.name, state, rangeLabel)}\n\n${t.disclaimer}`
    return { mode: 'data', text: answer, sources, range, contextQuestion: question }
  }

  // HVOR-ER / STATUS og TILBAGE kraever en genkendt person.
  if (intent === 'whereIs' || intent === 'back' || intent === 'nextVacation' || intent === 'vacationBalance') {
    let pool = people
    let resolution = findPerson(q, people)
    // Not in the asker's teams: a person from any other team is found by name (names, shifts, absence and home office only).
    if (intent === 'whereIs' && allTeams && !resolution.person && !resolution.ambiguous) {
      const everyone = listPeople(allTeams(), readTeam, creatorEmail)
      const wide = findPerson(q, everyone)
      if (wide.person || wide.ambiguous) {
        const involved = wide.person ? [wide.person] : everyone.filter(person => wide.ambiguous.some(choice => choice.id === person.email))
        pool = everyone; resolution = wide
        teams = allTeams().filter(team => involved.some(person => person.memberships.some(member => member.teamId === team.teamId)))
        sources = sourcesFor(teams)
      }
    }
    if (resolution.ambiguous) {
      if (selectedPerson !== undefined) {
        const chosen = pool.find(person => person.email === canonical(selectedPerson))
        if (!chosen || !resolution.ambiguous.some(choice => choice.id === chosen.email)) throw new Error('Personvalget passer ikke til spørgsmålet eller de teams, du har adgang til')
        resolution = { person: chosen }
      } else return { mode: 'data', text: AMBIGUOUS[language] || AMBIGUOUS.da, personChoices: resolution.ambiguous, sources: [] }
    }
    const me = people.find(person => person.email === canonical(principal.email))
    const own = !resolution.person && (intent === 'vacationBalance' || (intent === 'nextVacation' && /\bjeg\b|\bmin\b|\bmy\b|^when (?:do|am) i\b|minulla|\bolen\b|\bjag\b/.test(q)))
    let person = resolution.person || (own ? me : null)
    if (!person) {
      // Intet kendt navn: et naesten-ens navn giver "mente du?", ellers fald videre.
      const guesses = similarPeople(q, people)
      if (!guesses.length) return null
      if (selectedPerson === undefined) return { mode: 'data', text: DID_YOU_MEAN[language] || DID_YOU_MEAN.da, personChoices: guesses.map(value => ({ id: value.email, label: `${value.name} (${[...new Set(value.memberships.map(member => member.label))].join(', ')})` })).sort((a, b) => a.label.localeCompare(b.label)), sources: [] }
      person = guesses.find(value => value.email === canonical(selectedPerson))
      if (!person) throw new Error('Personvalget passer ikke til spørgsmålet eller de teams, du har adgang til')
    }

    if (intent === 'nextVacation' || intent === 'vacationBalance') {
      const periods = new Set()
      for (const team of teamsOf(person)) {
        for (const entry of absenceFor(team, readTeam).vacations) {
          const start = String(entry.startDate || '').slice(0, 10)
          const end = String(entry.endDate || entry.startDate || '').slice(0, 10)
          if (norm(entry.userEmail) === person.email && entry.type !== 'parental' && /^\d{4}-\d{2}-\d{2}$/.test(start) && end >= today) periods.add(`${start}|${end}`)
        }
      }
      const list = [...periods].sort()
      const text = list.length ? `${t.nextVacationTitle(person.name, own)}:\n\n${list.map(period => `• ${f.range(...period.split('|'))}`).join('\n')}` : t.nextVacationNone(person.name, own, exampleDates(language, now))
      return { mode: 'data', text: `${intent === 'vacationBalance' ? `${t.noBalance}\n\n` : ''}${text}\n\n${t.disclaimer}`, sources, contextQuestion: question }
    }

    if (intent === 'back') {
      // Aktivt eller foerstkommende fravaer paa tvaers af personens teams.
      let bestEntry = null
      const periods = []
      for (const team of teams.filter(team => person.memberships.some(member => member.teamId === team.teamId))) {
        const { vacations, sick } = absenceFor(team, readTeam)
        for (const [list, type] of [[vacations, 'vacation'], [sick, 'sick']]) {
          for (const entry of list) {
            if (norm(entry.userEmail) !== person.email) continue
            const start = String(entry.startDate || '').slice(0, 10)
            const end = String(entry.endDate || entry.startDate || '').slice(0, 10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < today) continue
            const kind = entry.type === 'parental' ? 'parental' : type
            periods.push({ start, end, kind })
            if (!bestEntry || start < bestEntry.start) bestEntry = { type: kind, start, end }
          }
        }
      }
      if (!bestEntry) return { mode: 'data', text: `${t.backNone(person.name)}\n\n${t.disclaimer}`, sources, contextQuestion: question }
      // Back = first working day after the contiguous run (adjacent entries merge across weekends and holidays).
      const lastDay = runEnd(periods, bestEntry.end)
      const back = nextWorkingDay(lastDay)
      const type = periods.some(period => period.kind === 'parental' && period.start >= bestEntry.start && period.start <= lastDay) ? 'parental' : bestEntry.type
      const text = bestEntry.start <= today ? t.backOn(person.name, type, lastDay, back, f) : t.backUpcoming(person.name, type, bestEntry.start, lastDay, back, f)
      return { mode: 'data', text, sources, contextQuestion: question }
    }

    // whereIs: status pr. dag i perioden (typisk en enkelt dag).
    const lines = eachDay(range, 14).map(date => `• ${f.day(date)}: ${statusOn(person, date) || '—'}`)
    const anyStatus = lines.some(line => !line.endsWith('—'))
    const header = t.whereTitle(person.name, rangeLabel)
    const body = anyStatus ? lines.join('\n') : `${t.noRecords(person.name)}\n\n${nextStep(language, 'vacation')}`
    return { mode: 'data', text: `${header}:\n\n${body}`, sources, range, contextQuestion: question }
  }

  if (intent === 'parental') {
    const text = PARENTAL_TEXT[language] || PARENTAL_TEXT.da
    // "Er Eva på barsel?" is about one person; anything else lists everybody.
    const subject = findPerson(q, people).person || null
    const rows = []
    for (const person of subject ? [subject] : people) {
      const periods = []
      for (const team of teamsOf(person)) {
        const { vacations, sick } = absenceFor(team, readTeam)
        for (const [list, type] of [[vacations, 'vacation'], [sick, 'sick']]) {
          for (const entry of list) {
            const start = String(entry.startDate || '').slice(0, 10)
            const end = String(entry.endDate || entry.startDate || '').slice(0, 10)
            if (norm(entry.userEmail) === person.email && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) periods.push({ start, end, kind: entry.type === 'parental' ? 'parental' : type })
          }
        }
      }
      for (const period of periods.filter(item => item.kind === 'parental' && item.start <= range.end && item.end >= range.start)) {
        rows.push({ start: period.start, name: person.name, text: `${person.name} — ${text.leave} ${f.range(period.start, period.end)} (${text.back(f.day(nextWorkingDay(runEnd(periods, period.end)), { inflect: 'essive' }))})` })
      }
    }
    const lines = rows.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name)).map(row => `• ${row.text}`)
    return { mode: 'data', text: `${REASON_ASKED.test(q) ? `${text.noReason}\n\n` : ''}${text.title(rangeLabel)}:\n\n${lines.length ? lines.join('\n') : `${subject ? text.notOn(subject.name) : text.none}\n\n${nextStep(language, 'vacation')}`}`, sources, range, contextQuestion: question }
  }

  if (intent === 'available') {
    // "Who is off?" asks for the absent people, not for everybody's status; "who is at work?" keeps the full picture.
    const offAsk = (/(?:^|\s)(?:fri|off|poissa|vapaalla)(?=\s|[?!.]|$)/u.test(q) || (language === 'sv' && /(?:^|\s)ledigt?(?=\s|[?!.]|$)/u.test(q))) && !/på arbejde|paa arbejde|at work|working|töissä|på jobbet|på kontoret|in the office|i tjänst|hvor mange|how many|kuinka monta|hur många/u.test(q)
    if (range.start !== range.end || offAsk) {
      // "Who is off this week?" lists each person's absence in the period instead of one day's headcount.
      const rows = new Map()
      for (const person of people) {
        for (const team of teams.filter(team => person.memberships.some(member => member.teamId === team.teamId))) {
          const { vacations, sick } = absenceFor(team, readTeam)
          for (const [list, type] of [[vacations, t.vacation], [sick, t.sick]]) {
            for (const entry of list) {
              const start = String(entry.startDate || '').slice(0, 10)
              const end = String(entry.endDate || entry.startDate || '').slice(0, 10)
              if (norm(entry.userEmail) !== person.email || !/^\d{4}-\d{2}-\d{2}$/.test(start) || start > range.end || end < range.start) continue
              const kind = entry.type === 'parental' ? t.parental : type
              rows.set(`${person.email}|${kind}|${start}|${end}`, { start, name: person.name, text: `${person.name} — ${kind.toLowerCase()} ${f.range(start, end)}` })
            }
          }
        }
      }
      const lines = [...rows.values()].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name)).map(row => `• ${row.text}`)
      return { mode: 'data', text: `${t.absenceTitle(rangeLabel)}:\n\n${lines.length ? lines.join('\n') : `${t.absenceNone}\n\n${nextStep(language, 'vacation')}`}`, sources, range, contextQuestion: question }
    }
    const date = range.start // tilgaengelighed vises pr. foerste dag i perioden
    const atWork = []; const home = []; const away = []
    for (const person of people) {
      let absence = null; let isHome = false
      for (const team of teams.filter(team => person.memberships.some(member => member.teamId === team.teamId))) {
        absence = absence || absenceFor(team, readTeam).typeOn(person.email, date)
        isHome = isHome || homeOfficeFor(team, readTeam)(person.email, date)
      }
      if (absence) away.push(`${person.name} (${absenceLabel(absence)})`)
      else if (isHome) home.push(person.name)
      else atWork.push(person.name)
    }
    if (!people.length) return { mode: 'data', text: t.availableNone, sources: [], contextQuestion: question }
    const sections = [`${t.availableAtWork} (${atWork.length}):\n${atWork.length ? atWork.sort().map(name => `• ${name}`).join('\n') : '—'}`]
    if (home.length) sections.push(`${t.availableHome} (${home.length}):\n${home.sort().map(name => `• ${name}`).join('\n')}`)
    if (away.length) sections.push(`${t.availableAway} (${away.length}):\n${away.sort().map(name => `• ${name}`).join('\n')}`)
    const headcount = /hvor mange|how many|kuinka monta|montako|hur många/.test(q) ? `${t.headcount(atWork.length + home.length, home.length, away.length)}\n\n` : ''
    return { mode: 'data', text: `${headcount}${t.availableTitle(f.heading(date, date))}:\n\n${sections.join('\n\n')}\n\n${t.disclaimer}`, sources, range: { start: date, end: date }, contextQuestion: question }
  }

  if (intent === 'workload') {
    const most = !/færrest|faerrest|fewest|least|vähiten|vahiten|färst|minst/.test(q)
    const counts = new Map()
    for (const team of teams) {
      const shifts = shiftsFor(team, readTeam, shiftCache)
      for (const item of shifts.inRange(range)) {
        const date = item.date
        const person = people.find(person => person.memberships.some(member => member.teamId === team.teamId && member.identifiers.has(norm(item.employeeId))))
        if (!person) continue
        counts.set(person.email, { name: person.name, count: (counts.get(person.email)?.count || 0) + 1 })
      }
    }
    if (!counts.size) return { mode: 'data', text: `${t.workloadTitle(rangeLabel, most)}:\n\n${t.workloadNone}\n\n${nextStep(language, 'tasks', { asked: q })}`, sources, range, contextQuestion: question }
    const ranked = [...counts.values()].sort((a, b) => (most ? b.count - a.count : a.count - b.count) || a.name.localeCompare(b.name))
    const top = ranked.slice(0, 5)
    return { mode: 'data', text: `${t.workloadTitle(rangeLabel, most)}:\n\n${top.map(entry => `• ${t.workloadLine(entry.name, entry.count)}`).join('\n')}`, sources, range, contextQuestion: question }
  }

  if (intent === 'conflicts') {
    const lines = []
    for (const team of teams) {
      const shifts = shiftsFor(team, readTeam, shiftCache)
      const absence = absenceFor(team, readTeam)
      for (const item of shifts.inRange(range)) {
        const date = item.date
        const person = people.find(person => person.memberships.some(member => member.teamId === team.teamId && member.identifiers.has(norm(item.employeeId))))
        if (!person) continue
        const type = absence.typeOn(person.email, date)
        if (type) lines.push({ date, text: `• ${t.conflictLine(f.day(date), person.name, item.roleName || t.unknown, type)}` })
      }
    }
    lines.sort((a, b) => a.date.localeCompare(b.date) || a.text.localeCompare(b.text))
    return { mode: 'data', text: `${t.conflictTitle(rangeLabel)}:\n\n${lines.length ? lines.map(line => line.text).join('\n') : t.conflictNone}`, sources, range, contextQuestion: question }
  }

  return null
}

module.exports = { insightAnswer, INTENTS, DID_YOU_MEAN, absenceFor, homeOfficeFor }
