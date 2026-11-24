// Explicit module adapters. No arbitrary KV keys, object dumps or model-chosen
// permissions. Every record is projected AFTER its team/row access check.
const clean = (value, max = 12000) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\u0000/g, '').slice(0, max) : ''
const { indexGuide } = require('./assistantGuideIndex.cjs')
const { matchesHomeOfficePattern } = require('./homeOfficeRecurrence.cjs')
const { mentionsPeriod, isMonthWord } = require('./assistantDates.cjs')
const { formatDay, formatRange, formatHeading, formatMonthDay } = require('./assistantDateFormat.cjs')
const { nextStep } = require('./assistantNextStep.cjs')
const { defangEvidence } = require('./assistantGuard.cjs')
const { norm } = require('./assistantNorm.cjs')
const { publicRecordId } = require('./assistantPublicSources.cjs')
const dayOf = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const array = value => Array.isArray(value) ? value : []
const timestamp = value => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : ''
const keyWords = value => [...new Set(norm(value).split(/[^\p{L}\p{N}@._-]+/u).map(word => word.replace(/^[@._-]+|[@._-]+$/g, '')).filter(word => word.length > 1))]
const STOP = new Set('af mikä tällä from by written tagged tag tags tagget taggen taggar tunnisteella latest seneste nyeste senaste viimeisin uusin tilanne tilanteeni giv give mig me en et the a an of over om about ind i på til fra for med and og er var står den det de der som skal ville vil kan kunne hvordan hvad hvilke hvilken hvem hvor hvornår what which who how when does do is are was were tell show find search please vis find søg oversigt overblik overview summary alle all min mine my dine your data hub hubben uge week næste next denne this sidste last år year 2026 opgaver tasks arbejde arbejder lave arbejde med'.split(' '))
for (const word of 'så ud så den ud team teamet mit vores sin eget hele ser se sås looked looks look like hvordan mange how many antal en hvilke bliver blev har have havde has læs læse read læste pr planer plan planned hvad indeholder indhold indeholdt hvilke ugen uge'.split(' ')) STOP.add(word)
for (const word of 'vi we our findes findes der fælles shared personlige personal guide guides guidebibliotek bibliotek status lige nu stadig endnu sker sket stod skrevet skrev said wrote skriver skriverne sammenfat opsummer forklar explain summarize summary betyder mean means hvorfor why kuinka monta nämä kaikki mitä on ollut näyttää miltä article articles artikel artikler artikkeli artikkelit artiklar mention mentions mentioned nævner omtaler nämner mainitsee base knowledge tietopankin kunskapsbasen'.split(' ')) STOP.add(word)
for (const word of ['jeg', 'mig', 'me', 'minun', 'kuka', 'ketkä', 'ketka', 'nogen', 'nogle', 'anyone', 'anybody', 'someone', 'joku', 'kukaan', 'har', 'liste', 'listen', 'list', 'lista', 'onko', 'minulla', 'there', 'exist', 'milloin', 'number', 'nummer', 'numret', 'numero']) STOP.add(word)
// "Where is the link to PostNord?": the question word is not a search word in any language.
for (const word of ['where', 'missä', 'mistä', 'mihin', 'to', 'is']) STOP.add(word)
// Modal-/hjaelpeverber og fyld-spoergeord er ikke soegeord: de maa ikke nulstille
// ellers gyldige modul-traef (fx "what should we eat today" -> madplan).
for (const word of 'should shall would could can cannot will must may might do does skal skulle burde vil ville kan kunne må pitäisi täytyy voisi saisi voiko'.split(' ')) STOP.add(word)
// Tidsfragmenter fra flerords-datoudtryk (fx "i dag" -> token "dag") er ikke soegeord.
for (const word of 'dag idag morgen imorgen går igår overmorgen'.split(' ')) STOP.add(word)
for (const word of 'say says saying contain contains containing siger indeholder sanoo säger innehåller ago sitten siden sedan was were oli olivat ollut with'.split(' ')) STOP.add(word)
// Period words that resolveDates already turned into a range ("right now", "in two weeks", "this weekend", "at Christmas").
for (const word of 'right now just juuri weekend weekenden helg helgen viikonloppu viikonloppuna uger weeks days dage dagar veckor viikon päästä kuluttua juleaften christmas påske påsken easter nytårsaften juleferie two three four five'.split(' ')) STOP.add(word)
// Svenska frågeord, hjälpverb och tidsord är inte heller sökord.
for (const word of 'ge mig ett av över om in i på till från för med och är var står den det de som ska skulle vill kan kunde hur vad vilka vilken vilket vem när visa hitta sök översikt alla min mina mitt dina data hubben vecka veckan nästa denna förra år uppgifter arbete arbetar jobbar jobbet jag mig någon några finns har hade såg ser ut hela vi vår våra delade personliga status just nu fortfarande ännu händer hänt sammanfatta förklara betyder varför många antal lista listan morgon övermorgon igår'.split(' ')) STOP.add(word)
// Fyldord, perioder ("måned") og "nye/new"-ord styrer filtre og datoer - de er ikke søgeord.
for (const word of 'any anything some noget whats nye nyt ny new nya nytt uusia uusi uudet mitkä mitkae här eller or tai ja moni ovat did create creates made oprettede måned måneden month months kuussa kuukausi kuun månad månaden oprettet created luonut skapat skapade tässä tänä kenellä kenella fyller fylder auki esimieheni esimiehen näytä listaa kerro anna'.split(' ')) STOP.add(word)
const terms = value => keyWords(value).filter(word => !STOP.has(word) && !/^\d+$/.test(word))
// Meal questions express a period and optionally a dish. Their auxiliary verbs
// are not ingredients to require in the menu. Keep this vocabulary scoped to
// meals rather than silently weakening free-text searches in every module.
const MEAL_QUESTION_WORDS = new Set('at af fik får få fået have haft did had get got in us served serveret serverede syötiin åt äter äta fick serverades serverat'.split(' '))
const CATALOG = [
  { id: 'knowledge', labels: ['Knowledge Base', 'Knowledge Base', 'Knowledge Base', 'Knowledge Base'], topic: /knowledge[ -]?base|vidensartikel|vidensartikl\w*|vidensbase|artikkeli|tietopankki|kunskapsbas|artiklar/u, view: 'knowledge', fields: 'authorized published Knowledge Base articles: reference knowledge such as error and result codes, specifications and definitions' },
  { id: 'meals', labels: ['Madplan', 'Meal plan', 'Ruokalista', 'Matsedel'], topic: /madplan|menu|måltid|frokost|kantine|spise|spiste|maden|meal|lunch|canteen|ruokalista|ruoka|lounaa|lounas|matsedel|matsal|(?:^|[^\p{L}])(?:mad|spist|eat|ate|eating|food|söimme|syömme|syödä|mat|maten|äta|äter|åt)(?=$|[^\p{L}])/u, view: 'meals', fields: 'week/year, Monday–Friday meals' },
  { id: 'projects', labels: ['Projekter', 'Projects', 'Projektit', 'Att göra'], topic: /projekt|project|projekti|to-?do|tehtävälista|att göra-lista|att göra-uppgift/u, view: 'projects', fields: 'title, description, status, members, creation/completion dates; own personal to-dos' },
  { id: 'improvements', labels: ['Forbedringer', 'Improvements', 'Parannukset', 'Förbättringar'], topic: /forbedring|improvement|parannu|kehitysehdot|förbättring|forslag|suggestion|ehdotu|förslag|invit\w*|kutsu\w*|inbjud\w*/u, view: 'improvements', fields: 'non-deleted improvement cases: title, category, status, priority, creator, origin team, owners; never comments, notifications or deletion requests' },
  { id: 'links', labels: ['Link Library', 'Link Library', 'Link Library', 'Link Library'], topic: /link.?library|linkbibliotek|linkkikirjasto|länkbibliotek|(?<![\p{L}])(?:links?|linket|linkene|linksene|linkit|linkki\p{L}*|länk|länken|länkar|länkarna|hjemmeside\p{L}*|websites?|webside\p{L}*|verkkosivu\p{L}*|webbplats\p{L}*|webbsida\p{L}*|url)(?![\p{L}])/u, view: 'links', fields: 'approved Link Library links shared with the team: title, description, category, domain; never pending, rejected or reported-suspicious links and never the full address' },
  { id: 'notes', labels: ['Notesbog', 'Notebook', 'Muistikirja', 'Anteckningsbok'], topic: /notesbog|notebook|noter|noten\b|notes?\b|notat|muisti|anteckning/u, view: 'notebook', fields: 'accessible shared notes and own personal notes, tags, authors, timestamps' },
  { id: 'messages', labels: ['Beskeder', 'Messages', 'Viestit', 'Meddelanden'], topic: /besked|beskeder|mail|message|inbox|indbakke|viest|meddelande|inkorg|e-post/u, view: 'email', fields: 'ONLY own incoming/outgoing messages, subject, body, read flag, folders, timestamp' },
  { id: 'announcements', labels: ['Opslagstavle', 'Announcements', 'Ilmoitukset', 'Anslagstavla'], topic: /opslag|meddelel|announcement|bulletin|ilmoitus|anslag|tillkännagivande/u, view: 'hub', fields: 'team announcements, title, body, author, timestamp' },
  { id: 'people', labels: ['Teamoversigt', 'Team overview', 'Tiimin yleiskuva', 'Teamöversikt'], topic: /medarbejd|kollega|manager|chef|(?:min|mit|vores|teamets|din|hvem er) leder|\blederen\b|\bledere\b|brugernavn|telefon|puhelin|yhteystie|kontakt|teamoversigt|fødselsdag|birthday|employee|colleague|people|phone|contact|esihenkilö|esimies|esimiehe|syntymä|fyller år|fylder år|työntekij|medarbetare|anställd|användarnamn|teamöversikt|födelsedag|e-?mail\s?adress\w*|mailadress\w*|email address\w*|sähköpostiosoit\w*|e-?postadress\w*|(?:email|e-?mail|e-?post|sähköposti)\s+(?:på|til|for|of)\s+\p{L}|\p{L}+(?:'s|s|n|in|:n)\s+(?:email|e-?mail|e-?post|sähköposti)(?![\p{L}])/u, view: 'team', fields: 'approved team members, names, usernames, work contact, roles and birthdays; NEVER passwords' },
  { id: 'absence', labels: ['Fravær og anmodninger', 'Absence and requests', 'Poissaolot ja pyynnöt', 'Frånvaro och ansökningar'], topic: /fravær|syg|syge|anmodning|godkendelse|afventer|sygemeld|absence|absent|sick|pending|request|approval|poissaolo|saira|pyyntö|pyynn|lomahakemu|frånvaro|sjuk|ansökan|ansökning|godkännande|väntar/u, view: 'calendar', fields: 'approved absence dates; own requests; manager-only pending requests and authorized details' },
  { id: 'reviews', labels: ['Guide-review', 'Guide review', 'Oppaiden tarkistus', 'Guidegranskning'], topic: /review|guide.admin|kladde|revision|arkiver|historik|guide.*version|version.*guide|draft|archive|restore|tarkistus|luonnos|granskning|utkast/u, view: 'guides', fields: 'own drafts/requests; reviewers authorized requests and archived guides; accessible published guide version history' },
  { id: 'guideInfo', labels: ['Guide-info', 'Guide info', 'Oppaan tiedot', 'Guideinfo'], topic: /(?=.*(?:guide|vejledning|opas|oppa|vägledning))(?=.*(?:\bejer|\bejes|ansvarlig|vedligehold|forfatter|skrevet af|\bskrev\b|skrevet|oprettet af|opdateret|opdaterede|ændret|gennemgang|gennemgå|forældet|forfalden|\bversion|\bowner|\bowns|responsible|maintain|author|\bwrote|written by|created by|updated|last changed|due for review|next review|review date|overdue|outdated|omistaa|omistaja|vastuu|kirjoittaja|kirjoitti|päivitetty|päivitettiin|tarkistettava|tarkistaa|tarkistu\p{L}*|vanhentunut|\bversio|äger|ansvarig|\bskrev|skapade|uppdaterad|uppdaterades|granskas|granskning|föråldrad))/u, view: 'guides', fields: 'owner, author, version, last update and next review date of the guides the user can access; never guide content' },
  { id: 'settings', labels: ['Personlige indstillinger', 'Personal settings', 'Omat asetukset', 'Personliga inställningar'], topic: /dashboard|widget|indstilling|settings|asetus|inställning|startsida/u, view: 'hub', fields: 'own dashboard widget preferences; no other users preferences' },
  { id: 'modules', labels: ['Moduler', 'Modules', 'Moduulit', 'Moduler'], topic: /modul|module|dokumentbibliotek|document library|team.chat|moduuli|dokumenttikirjasto|tiimichat/u, view: 'hub', fields: 'module availability, capabilities; document library and team chat are unimplemented placeholders' },
  { id: 'administration', labels: ['Administration', 'Administration', 'Hallinta', 'Administration'], topic: /administration|managerpanel|manager.panel|guide.admins|brugeranmod|bruger.*afventer|user.*pending|hallinta|användare.*väntar|(?:ventende|afventende)\s+brugere?|brugere?\s+(?:der\s+)?(?:venter|afventer)|(?:venter|afventer)\s+(?:på\s+)?godkendelse|pending\s+(?:users?|accounts?|registrations?)|(?:users?|accounts?)\s+(?:pending|waiting|awaiting)|(?:waiting|waits?|awaiting)\s+(?:for\s+)?approval|odottavat?\s+käyttäjä\S*|käyttäjä\S*\s+(?:jotka\s+)?odottaa\S*|odottaa\S*\s+hyväksyntää|väntande\s+användare|väntar\s+på\s+godkännande/u, view: 'manager', fields: 'manager-only user statuses, shift roles, guide admins and incoming guide access requests; never credentials' },
  { id: 'system', labels: ['App og datalagring', 'App and storage', 'Sovellus ja tallennus', 'App och datalagring'], topic: /datalagr|lagring|datamappe|forbindelse|opdatering|app.version|(?:hvilken|which|what|vilken) version|mikä versio|storage|connection|(?:app|hub).*update|update.*(?:app|hub)|version.*app|tallennus|yhteys|anslutning|uppdatering|\bonline\b|\boffline\b|synkron\w*|\bsync\w*|(?:hvor ligger|where is|where are|var ligger|var finns|missä) (?:the )?(?:data|dataen|dataene|datan|filerne)|data folder|data directory|datakansio|data sijaitsee|datan lagrad|verkossa/u, view: 'hub', fields: 'app version, online/offline state and pending sync count; no filesystem dumps, credentials or backups' },
  { id: 'games', labels: ['Spilhjørnet', 'Game corner', 'Pelinurkka', 'Spelhörnan'], topic: /spilhjørne|hvilke spil|spille|game corner|available games|pelinurkka|spelhörna|vilka spel|spela|which games|what games|games (?:are there|do we have|exist)|mitä pelejä|mitkä pelit|pelejä/u, view: 'games', fields: 'available games and own play counts; public highscores use separate scoreboard tool' },
  { id: 'notifications', labels: ['Notifikationer', 'Notifications', 'Ilmoitukset', 'Notiser'], topic: /notifikation|notification|ilmoitukset|notis|avisering/u, view: 'hub', fields: 'own unread messages/accessible note alerts; manager/reviewer queues; stored state, not transient dismissed UI state' },
]
const LEGACY = [
  { id: 'shifts', fields: 'shift roles/assignments for authorized people and dates' },
  { id: 'homeOffice', fields: 'home office patterns and date exceptions, approved vacation exclusion' },
  { id: 'vacation', fields: 'approved vacations for authorized people and date ranges' },
  { id: 'highscores', fields: 'public game scoreboards, difficulties and winners' },
  { id: 'guides', fields: 'authorized published guide sections, steps, text and images' },
]
const PLANNING_MODULES = [
  { id: 'shifts', labels: ['Vagtplan', 'Shift schedule', 'Vuorot', 'Schema'], topic: /opgave|vagt|shift|task|assignment|tehtäv|vuoro|uppgift|schema|(?:^|[^\p{L}])pass(?:et|en)?(?=$|[^\p{L}])/u },
  { id: 'homeOffice', labels: ['Hjemmearbejde', 'Home office', 'Etätyö', 'Hemarbete'], topic: /hjemme|home office|from home|etäty|etätö|etänä|hemma|hemifrån|hemarbete|distansarbete/u },
  { id: 'vacation', labels: ['Ferie', 'Vacation', 'Loma', 'Semester'], topic: /ferie|vacation|holiday|loma|semester/u },
]
const LABELS = {
  da: { empty: 'Ingen tilgængelige registreringer matcher spørgsmålet.', managerOnly: 'Det er kun managere der kan se administrationsdata, fx brugere der venter på godkendelse. Spørg din manager – eller spørg mig «hvem er min leder?».', noPending: 'Ingen brugere venter på godkendelse.', pendingOwn: 'Du kan kun se dine egne ventende anmodninger og reviews – andres er kun synlige for managere og guide-administratorer.', date: 'Hvilken dato eller uge mener du? Du kan også skrive fx “uge 36 2026”.', count: 'Antal', found: 'Fundet i hubben', total: 'matchende registreringer', more: 'viser', missing: 'Ikke registreret', days: ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag'], role: { creator: 'Creator', manager: 'Manager', user: 'Bruger' }, kinds: { vacation: 'ferie', parental: 'barsel', sick: 'sygemeldt', home: 'hjemmearbejde', pending: 'afventer', rejected: 'afvist', unread: 'ulæst' }, improve: { status: { new: 'ny', assessment: 'under vurdering', planned: 'planlagt', 'in-progress': 'i gang', testing: 'under test', 'ready-for-approval': 'klar til godkendelse', completed: 'afsluttet', 'on-hold': 'på pause', declined: 'afvist' }, priority: { critical: 'kritisk', high: 'høj', medium: 'mellem', low: 'lav' }, category: { process: 'proces', automation: 'automatisering', quality: 'kvalitet', workplace: 'arbejdsplads', cost: 'omkostninger', other: 'andet' }, due: 'frist', invited: 'inviteret – svar senest' }, guide: { owner: 'ansvarlig', author: 'forfatter', updated: 'opdateret', nextReview: 'næste gennemgang', overdue: 'overskredet' }, noReview: 'Ingen guides skal gennemgås lige nu.', sys: { version: 'Version', online: 'online', offline: 'offline', pending: count => `${count} ændringer venter på synkronisering`, synced: 'alt er synkroniseret', data: 'datamappe' }, pathOnly: 'Stien til datamappen kan kun creator og managere se.', games: { easy: 'Let', medium: 'Mellem', hard: 'Svær', expert: 'Ekspert', none: 'ikke spillet endnu', modern: 'Cube Basher gemmer ingen spiltilstand' } },
  en: { empty: 'No accessible records match the question.', managerOnly: 'Only managers can see administration data, e.g. users waiting for approval. Ask your manager - or ask me “who is my manager?”.', noPending: 'No users are waiting for approval.', pendingOwn: "You can only see your own pending requests and reviews - other people's are only visible to managers and guide administrators.", date: 'Which date or week? You can also write e.g. “week 36 2026”.', count: 'Count', found: 'Found in the hub', total: 'matching records', more: 'showing', missing: 'Not recorded', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], role: { creator: 'Creator', manager: 'Manager', user: 'User' }, kinds: { vacation: 'vacation', parental: 'parental leave', sick: 'sick leave', home: 'home office', pending: 'pending', rejected: 'rejected', unread: 'unread' }, improve: { status: { new: 'new', assessment: 'under assessment', planned: 'planned', 'in-progress': 'in progress', testing: 'in testing', 'ready-for-approval': 'ready for approval', completed: 'completed', 'on-hold': 'on hold', declined: 'declined' }, priority: { critical: 'critical', high: 'high', medium: 'medium', low: 'low' }, category: { process: 'process', automation: 'automation', quality: 'quality', workplace: 'workplace', cost: 'cost', other: 'other' }, due: 'due', invited: 'invited – reply by' }, guide: { owner: 'owner', author: 'author', updated: 'updated', nextReview: 'next review', overdue: 'overdue' }, noReview: 'No guides are due for review right now.', sys: { version: 'Version', online: 'online', offline: 'offline', pending: count => `${count} ${count === 1 ? 'change' : 'changes'} waiting to sync`, synced: 'everything is synced', data: 'data folder' }, pathOnly: 'The path of the data folder is visible to only the creator and managers.', games: { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert', none: 'not played yet', modern: 'Cube Basher does not save any game state' } },
  fi: { empty: 'Kysymykseen sopivia tietoja ei löytynyt.', managerOnly: 'Vain esihenkilöt näkevät hallintatiedot, esim. hyväksyntää odottavat käyttäjät. Kysy esihenkilöltäsi - tai kysy minulta «kuka on esimieheni?».', noPending: 'Yksikään käyttäjä ei odota hyväksyntää.', pendingOwn: 'Näet vain omat odottavat pyyntösi ja tarkistuksesi - muiden pyynnöt näkevät vain esihenkilöt ja oppaiden ylläpitäjät.', date: 'Mitä päivää tai viikkoa tarkoitat? Voit kirjoittaa esimerkiksi ”viikko 36 2026”.', count: 'Määrä', found: 'Hubista löytyneet tiedot', total: 'vastaavaa tietuetta', more: 'näytetään', missing: 'Ei kirjattu', days: ['Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai'], role: { creator: 'Creator', manager: 'Esihenkilö', user: 'Käyttäjä' }, kinds: { vacation: 'loma', parental: 'perhevapaa', sick: 'sairauslomalla', home: 'etätyö', pending: 'odottaa', rejected: 'hylätty', unread: 'lukematon' }, improve: { status: { new: 'uusi', assessment: 'arvioitavana', planned: 'suunniteltu', 'in-progress': 'käynnissä', testing: 'testauksessa', 'ready-for-approval': 'valmis hyväksyttäväksi', completed: 'valmis', 'on-hold': 'pidossa', declined: 'hylätty' }, priority: { critical: 'kriittinen', high: 'korkea', medium: 'keskitaso', low: 'matala' }, category: { process: 'prosessi', automation: 'automaatio', quality: 'laatu', workplace: 'työpaikka', cost: 'kustannukset', other: 'muu' }, due: 'määräaika', invited: 'kutsuttu – vastaa viimeistään' }, guide: { owner: 'vastuuhenkilö', author: 'kirjoittaja', updated: 'päivitetty', nextReview: 'seuraava tarkistus', overdue: 'myöhässä' }, noReview: 'Yksikään opas ei ole tarkistettavana juuri nyt.', sys: { version: 'Versio', online: 'verkossa', offline: 'ei verkossa', pending: count => `${count} ${count === 1 ? 'muutos odottaa' : 'muutosta odottaa'} synkronointia`, synced: 'kaikki on synkronoitu', data: 'datakansio' }, pathOnly: 'Datakansion polun näkevät vain creator ja esihenkilöt.', games: { easy: 'Helppo', medium: 'Keskitaso', hard: 'Vaikea', expert: 'Asiantuntija', none: 'ei pelattu vielä', modern: 'Cube Basher ei tallenna pelitilaa' } },
  sv: { empty: 'Inga tillgängliga registreringar matchar frågan.', managerOnly: 'Bara chefer kan se administrationsdata, t.ex. användare som väntar på godkännande. Fråga din chef - eller fråga mig «vem är min chef?».', noPending: 'Inga användare väntar på godkännande.', pendingOwn: 'Du kan bara se dina egna väntande ansökningar och granskningar - andras kan bara chefer och guideadministratörer se.', date: 'Vilket datum eller vilken vecka menar du? Du kan också skriva t.ex. ”vecka 36 2026”.', count: 'Antal', found: 'Hittat i hubben', total: 'matchande registreringar', more: 'visar', missing: 'Inte registrerat', days: ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'], role: { creator: 'Creator', manager: 'Chef', user: 'Användare' }, kinds: { vacation: 'semester', parental: 'föräldraledighet', sick: 'sjukskriven', home: 'hemarbete', pending: 'väntar', rejected: 'avvisad', unread: 'oläst' }, improve: { status: { new: 'ny', assessment: 'under bedömning', planned: 'planerad', 'in-progress': 'pågår', testing: 'under test', 'ready-for-approval': 'redo för godkännande', completed: 'avslutad', 'on-hold': 'pausad', declined: 'avvisad' }, priority: { critical: 'kritisk', high: 'hög', medium: 'medel', low: 'låg' }, category: { process: 'process', automation: 'automatisering', quality: 'kvalitet', workplace: 'arbetsplats', cost: 'kostnad', other: 'övrigt' }, due: 'förfaller', invited: 'inbjuden – svara senast' }, guide: { owner: 'ansvarig', author: 'författare', updated: 'uppdaterad', nextReview: 'nästa granskning', overdue: 'försenad' }, noReview: 'Inga guider behöver granskas just nu.', sys: { version: 'Version', online: 'online', offline: 'offline', pending: count => `${count} ${count === 1 ? 'ändring väntar' : 'ändringar väntar'} på synkronisering`, synced: 'allt är synkroniserat', data: 'datamapp' }, pathOnly: 'Sökvägen till datamappen kan bara creator och chefer se.', games: { easy: 'Lätt', medium: 'Medel', hard: 'Svår', expert: 'Expert', none: 'inte spelat ännu', modern: 'Cube Basher sparar inget speltillstånd' } },
}
// A birthday is stored as MM-DD and read as "25. sep.".
const birthdayText = (value, language, now) => (/^\d{2}-\d{2}$/.test(String(value)) ? formatMonthDay(value, language) : formatDay(String(value ?? '').slice(0, 10), language, { now, weekday: false }))
// "Who is sick tomorrow?" with nobody sick says exactly that, not that "no records match". Sick leave is deleted when
// its day is over, so an empty past period says so.
const NO_SICK = {
  da: (range, past) => `Ingen ${past ? 'var' : 'er'} sygemeldt (${range}).${past ? ' Hubben gemmer ikke sygdom fra tidligere dage.' : ''}`,
  en: (range, past) => `No one ${past ? 'was' : 'is'} on sick leave (${range}).${past ? ' The hub does not keep sick leave from earlier days.' : ''}`,
  fi: (range, past) => `Kukaan ei ${past ? 'ollut' : 'ole'} sairauslomalla (${range}).${past ? ' Hubi ei säilytä aiempien päivien sairauspoissaoloja.' : ''}`,
  sv: (range, past) => `Ingen ${past ? 'var' : 'är'} sjukskriven (${range}).${past ? ' Hubben sparar inte sjukfrånvaro från tidigare dagar.' : ''}`,
}
const SICK_QUESTION = /(?<![\p{L}])(?:syg\p{L}*|sick|sairaa\p{L}*|sairauslom\p{L}*|sjuk\p{L}*)(?![\p{L}])/u
const OTHER_ABSENCE = /ferie|vacation|holiday|loma(?!n)|semester|barsel|parental|perhevapaa|föräldraledig|anmodning|request|ansökan|pyynn/u
// "Pending" questions filter by status; their nouns and verbs must not become search words.
const PENDING_ASK = /afventer|afventende|ventende|venter|pending|waiting|awaiting|odottaa|odottavat|väntar|väntande|skal godkende|to approve|hyväksyttäv\S*|att godkänna/u
// "Requests I have to approve": the person asked is the approver, so the "my own records" filter does not apply.
const APPROVE_ASK = /skal godkende|to approve|hyväksyttäv\S*|att godkänna/u
const USER_WORDS = /brugere?\b|\busers?\b|\baccounts?\b|käyttäj|användare/u
const OWN_WORDS = /(?:^|[^\p{L}])(?:jeg|mig|min|mine|mit|my|me|omat|minun|jag|mina|mitt)(?=$|[^\p{L}])/u
// Contact details by person ("Bo's email"); plural mail words mean the mailbox.
const CONTACT_ASK = /e-?mail\s?adress\w*|mailadress\w*|email address\w*|sähköpostiosoit\w*|e-?postadress\w*|(?:email|e-?mail|e-?post|sähköposti)\s+(?:på|til|for|of)\s+\p{L}|\p{L}+(?:'s|s|n|in|:n)\s+(?:email|e-?mail|e-?post|sähköposti)(?![\p{L}])/u
const MESSAGE_WORDS = /besked|message|inbox|indbakke|ulæst|unread|sendte|sent\b|viest|meddelande|inkorg|oläst|lukematon|\bmails\b|\bemails\b|e-mails\b/u
const WANTS_CONTACT = /teamoversigt|team overview|tiimin yleiskuva|teamöversikt|telefon|phone|puhelin|e-?mail|\bmail\b|sähköposti|e-?post|kontakt|contact|yhteystie|username|brugernavn|käyttäjätunnus|användarnamn|adress|osoite|nummer|number/u
const wordOf = alternatives => new RegExp(`(?<![\\p{L}])(?:${alternatives})(?![\\p{L}])`, 'u')
// Improvements are filtered by what the question says about priority, status, category, invitations and deadlines.
const IMPROVE_PRIORITY = { critical: wordOf('kritisk|critical|kriittinen'), high: wordOf('høj|høje|high|korkea|korkean|korkeat|hög|höga'), medium: wordOf('mellem|medium|keskitaso|keskitason|medel'), low: wordOf('lav|lave|low|matala|matalan|låg|låga') }
const IMPROVE_STATUS = [
  ['ready-for-approval', wordOf('klar til godkendelse|ready for approval|valmis hyväksyttäväksi|redo för godkännande')],
  ['in-progress', wordOf('i gang|igang|in progress|in-progress|käynnissä(?! ole)|pågår')],
  ['assessment', wordOf('vurdering|vurderes|assessment|arvioitavana|arvio|bedömning')],
  ['planned', wordOf('planlagt|planlagte|planned|suunniteltu|suunnitellut|planerad|planerade')],
  ['testing', wordOf('under test|testing|testaus|testauksessa|testas')],
  ['completed', wordOf('afsluttet|afsluttede|færdig|færdige|gennemført|gennemførte|completed|finished|valmis|valmiit|valmiita|avslutad|avslutade|slutförd|slutförda|genomförd|genomförda')],
  ['on-hold', wordOf('på pause|on hold|pidossa|pausad|pausade')],
  ['declined', wordOf('afvist|afviste|declined|rejected|hylätty|hylätyt|avvisad|avvisade')],
  ['new', wordOf('ny|nye|nyt|new|uusi|uudet|uusia|nya|nytt')],
]
const IMPROVE_CATEGORY = [['process', wordOf('proces|processer|process|prosessi')], ['automation', wordOf('automatisering|automation|automaatio')], ['quality', wordOf('kvalitet|quality|laatu')], ['workplace', wordOf('arbejdsplads|workplace|työpaikka|arbetsplats')], ['cost', wordOf('omkostninger|omkostning|cost|kustannus|kustannukset|kostnad')], ['other', wordOf('andet|other|muu|övrigt')]]
const IMPROVE_INVITE = wordOf('invitation|invitationer|inviteret|invited|invitations|kutsu|kutsut|kutsuja|kutsuttu|inbjudan|inbjudningar|inbjuden')
// The Improvements list's default view ("Igangværende"): every case that is neither completed nor declined.
const IMPROVE_ACTIVE = wordOf('igangværende|aktive|ongoing|active|käynnissä olevat|käynnissä oleva|aktiiviset|pågående|aktiva')
const IMPROVE_DUE = wordOf('deadline|deadlines|frist|fristen|forfald|forfalder|due|erääntyy|erääntyvät|määräaika|määräajalla|määräajan|määräajat|förfaller|förfallodag|förfallodatum|förfallodatumet')
const IMPROVE_NOISE = /kategori|category|kategoria|luokka|luokassa|prioritet|priority|prioriteet/u
const LATEST = /seneste|nyeste|latest|newest|most recent|viimeisin|uusin|senaste|nyaste/u
const WANTS_BIRTHDAY = /teamoversigt|team overview|tiimin yleiskuva|teamöversikt|fødselsdag|birthday|syntymä|födelsedag|fyller år|fylder år/u
const ABSENCE_WORDS = /fravær|syg|ferie|anmodning|absence|sick|vacation|holiday|request|poissa|saira|loma|pyyntö|frånvaro|sjuk|semester|ansökan/u
const PENDING_WORDS = new Set('ventende afventende venter waiting awaiting odottavat godkendelse approval hyväksyntää godkännande brugere bruger users user käyttäjät käyttäjä användare accounts account godkende approve to att godkänna hyväksyttäviä hyväksyttävää'.split(' '))
// Stored records carry one label for every language ("Ferie / Vacation / Loma / Semester"); the answer shows only its own.
const LOCAL_LABELS = [
  ['Ferie / Vacation / Loma / Semester', ['Ferie', 'Vacation', 'Loma', 'Semester']],
  ['Sygemelding / Sick leave / Sairasloma / Sjukskrivning', ['Sygemelding', 'Sick leave', 'Sairasloma', 'Sjukskrivning']],
  ['Home office / Hjemmearbejde / Etätyö / Hemarbete', ['Hjemmearbejde', 'Home office', 'Etätyö', 'Hemarbete']],
  ['Unread / Ulæst / Lukematon / Oläst', ['Ulæst', 'Unread', 'Lukematon', 'Oläst']],
  ['Read / Læst / Luettu / Läst', ['Læst', 'Read', 'Luettu', 'Läst']],
  ['Hidden / Skjult / Piilotettu / Dold', ['Skjult', 'Hidden', 'Piilotettu', 'Dold']],
  ['Visible / Synlig / Näkyvä', ['Synlig', 'Visible', 'Näkyvä', 'Synlig']],
  ['REVIEW / KLADDE / LUONNOS / UTKAST', ['KLADDE', 'REVIEW', 'LUONNOS', 'UTKAST']],
  ['ARKIVERET / ARCHIVED / ARKISTOITU / ARKIVERAD', ['ARKIVERET', 'ARCHIVED', 'ARKISTOITU', 'ARKIVERAD']],
]
const localized = (text, language) => LOCAL_LABELS.reduce((value, [label, words]) => value.replaceAll(label, words[Math.max(0, ['da', 'en', 'fi', 'sv'].indexOf(language))]), String(text))
// Which module a data question was about, for the "try this next" hint on an empty answer.
function emptyHint(ids, q, language, hasPeriod) {
  const asksVacation = /ferie|vacation|holiday|loma|semester/u.test(q)
  const asksSick = /syg|sick|saira|sjuk/u.test(q)
  const kinds = { meals: 'meals', notes: 'notes', messages: 'messages', projects: 'projects', improvements: 'improvements', people: 'people', administration: 'administration', shifts: 'tasks', homeOffice: 'home', vacation: 'vacation', reviews: 'guides', knowledge: 'knowledge', absence: asksSick && !asksVacation ? 'sick' : 'vacation' }
  const id = ids.find(value => kinds[value])
  const hint = id ? nextStep(language, kinds[id], { period: hasPeriod, asked: q }) : ''
  return hint ? `\n\n${hint}` : ''
}
const MANAGER = user => user.role === 'manager' || user.role === 'admin' || (!user.role && user.isManager === true)
const WIDGETS = ['teamTasks', 'offToday', 'todaysMeal', 'sickToday', 'supplyOff', 'supplyHomeOffice', 'supplySick']

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.modules) || plan.modules.length > 6 || !Array.isArray(plan.terms) || plan.terms.length > 10) throw new Error('Ugyldig lokal søgeplan')
  const known = new Set([...CATALOG, ...LEGACY].map(module => module.id))
  if (plan.modules.some(id => typeof id !== 'string' || !known.has(id)) || plan.terms.some(term => typeof term !== 'string' || term.length > 80)) throw new Error('Ugyldig lokal søgeplan')
  return { modules: [...new Set(plan.modules)], terms: plan.terms.flatMap(terms).slice(0, 15) }
}
function createKnowledge({ readTeam, readShared, creatorEmail, resolveDates, getDiagnostics = () => ({}), getGuides }) {
  const indexedWords = new WeakMap()
  function records(principal, ids, language = 'da', range, now) {
    const lang = ['da', 'en', 'fi', 'sv'].indexOf(language); const t = LABELS[language] || LABELS.da
    // Every date a person reads goes through the shared formatter; the ISO values stay in start/end/dueDate for filtering.
    const day = (value, options) => clean(formatDay(typeof value === 'string' ? value : '', language, { now, ...options }), 80)
    const span = (start, end) => clean(formatRange(start, end, language, { now }), 120)
    const output = []
    const sharedDone = new Set()
    let creator
    const creatorNorm = () => creator ??= norm(creatorEmail())
    for (const team of principal.teams) {
      const label = team.abbreviation || team.teamId
      let users
      const getUsers = () => users ||= readTeam(team, 'users') || {}
      // The user list, the name lookup and the shift-owner lookup are built once per team and reused for every record.
      let entries, nameIndex, employeeIndex
      const userEntries = () => entries ||= Object.entries(getUsers()).filter(([key, user]) => user && typeof user === 'object' && (!user.status || user.status === 'approved') && norm(user.email || key) !== creatorNorm() && user.role !== 'creator')
      const name = email => {
        if (!nameIndex) { nameIndex = new Map(); for (const entry of Object.entries(getUsers())) { const id = norm(entry[1]?.email || entry[0]); if (!nameIndex.has(id)) nameIndex.set(id, entry[1]) } }
        return clean(nameIndex.get(norm(email))?.fullName || String(email || '—'), 150)
      }
      const findEmployee = id => {
        if (!employeeIndex) { employeeIndex = new Map(); for (const [key, user] of userEntries()) for (const identifier of [norm(key), norm(user.email), norm(user.id)]) if (!employeeIndex.has(identifier)) employeeIndex.set(identifier, user) }
        return employeeIndex.get(norm(id))
      }
      const ownUser = Object.entries(getUsers()).find(([key, user]) => norm(user?.email || key) === principal.email)?.[1]
      const manager = principal.role === 'creator' || MANAGER(ownUser || {})
      for (const module of [...CATALOG, ...PLANNING_MODULES].filter(module => ids.includes(module.id))) {
        const title = module.labels[lang < 0 ? 0 : lang]
        const add = (id, heading, body, extra = {}) => output.push({ kind: 'module', moduleId: module.id, recordId: String(id), teamId: team.teamId, title: `${label} · ${title} · ${clean(String(heading), 180)}`, text: clean(body, 24000), ...extra })
        if (module.id === 'shifts') {
          const roles = array(readTeam(team, 'shift-roles'))
          for (const shift of array(readTeam(team, 'shift-assignments'))) {
            if (!shift?.id) continue
            const employee = findEmployee(shift.employeeId)
            if (!employee) continue
            const date = clean(shift.date, 10)
            add(shift.id, `${clean(employee.fullName || employee.name)} · ${day(date)}`, `${name(employee.email || shift.employeeId)}\n${roles.find(role => role?.id === shift.roleId)?.name || t.missing}\n${day(date)}`, { start: date, owner: norm(employee.email || shift.employeeId), line: `${clean(employee.fullName || employee.name)} — ${roles.find(role => role?.id === shift.roleId)?.name || t.missing}, ${day(date)}` })
          }
        } else if (module.id === 'homeOffice') {
          const patterns = readTeam(team, 'home-office-patterns') || {}
          const exceptions = array(readTeam(team, 'home-office-exceptions'))
          const vacations = array(readTeam(team, 'vacation-entries')).filter(entry => entry?.status === 'approved')
          for (const [key, user] of userEntries()) {
            const email = norm(user.email || key)
            if (range) {
              const date = new Date(`${range.start}T12:00:00`)
              for (let i = 0; i < 366; i++, date.setDate(date.getDate() + 1)) {
                const current = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                if (current > range.end) break
                const exception = exceptions.find(item => norm(item?.userEmail) === email && item.date === current)
                const home = exception ? exception.isHomeOffice === true : matchesHomeOfficePattern(patterns[email], date)
                if (!home || vacations.some(item => norm(item.userEmail) === email && clean(item.startDate, 10) <= current && clean(item.endDate, 10) >= current)) continue
                add(`home:${email}:${current}`, `${name(email)} · ${day(current)}`, `${name(email)} · Home office / Hjemmearbejde / Etätyö / Hemarbete\n${day(current)}`, { start: current, owner: email, line: `${name(email)} — ${t.kinds.home} ${day(current)}` })
              }
            } else if (patterns[email]) {
              const days = array(patterns[email].weekdays).filter(index => Number.isInteger(index) && index >= 0 && index < 7).map(index => {
                const weekday = new Intl.DateTimeFormat(language === 'fi' ? 'fi-FI' : language === 'sv' ? 'sv-SE' : language === 'en' ? 'en-GB' : 'da-DK', { weekday: 'long' }).format(new Date(2026, 0, 4 + index, 12))
                const repeat = patterns[email].repeat?.[index]
                if (!repeat || repeat.intervalWeeks === 1) return weekday
                const frequency = language === 'fi' ? `joka ${repeat.intervalWeeks}. viikko alkaen ${day(repeat.startDate, { weekday: false })}` : language === 'sv' ? `var ${repeat.intervalWeeks}:e vecka från ${day(repeat.startDate, { weekday: false })}` : language === 'en' ? `every ${repeat.intervalWeeks} weeks from ${day(repeat.startDate, { weekday: false })}` : `hver ${repeat.intervalWeeks}. uge fra ${day(repeat.startDate, { weekday: false })}`
                return `${weekday} (${frequency})`
              })
              add(`pattern:${email}`, name(email), `${name(email)}\n${days.join(', ')}`, { owner: email, line: `${name(email)} — ${t.kinds.home}: ${days.join(', ')}` })
            }
          }
        } else if (module.id === 'vacation') {
          for (const entry of array(readTeam(team, 'vacation-entries'))) if (entry?.id && entry.status === 'approved') add(entry.id, name(entry.userEmail), `${name(entry.userEmail)} · ${span(clean(entry.startDate, 10), clean(entry.endDate, 10))}`, { start: clean(entry.startDate, 10), end: clean(entry.endDate, 10), owner: norm(entry.userEmail), line: `${name(entry.userEmail)} — ${t.kinds[entry.type === 'parental' ? 'parental' : 'vacation']} ${span(clean(entry.startDate, 10), clean(entry.endDate, 10))}` })
        } else if (module.id === 'meals') {
          for (const menu of array(readTeam(team, 'meal-plan-weeks'))) {
            if (!menu || !Number.isInteger(menu.year) || !Number.isInteger(menu.weekNumber)) continue
            // Stored year/week is authoritative; weekStart is occasionally localized.
            const week = require('./assistantDates.cjs').isoWeek(menu.weekNumber, menu.year)
            if (!week) continue
            const meals = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
            // One asked weekday shows only that day's meal; weekends and ranges show the whole week.
            const asked = range && range.start === range.end ? (new Date(`${range.start}T12:00:00`).getDay() + 6) % 7 : -1
            const shown = asked >= 0 && asked < 5 ? [asked] : meals.map((_, i) => i)
            const weekWord = language === 'da' ? 'uge' : language === 'fi' ? 'viikko' : language === 'sv' ? 'vecka' : 'week'
            const body = shown.map(i => `${t.days[i]}: ${clean(menu.meals?.[meals[i]]) || t.missing}`).join('\n')
            add(`${menu.year}-${menu.weekNumber}`, `${menu.year} · ${weekWord} ${menu.weekNumber}`, body, { start: week.start, end: week.end, line: shown.length === 1 ? body : `${weekWord} ${menu.weekNumber}:\n${body}` })
          }
        } else if (module.id === 'projects') {
          for (const project of array(readTeam(team, 'projects'))) {
            if (!project?.id) continue
            add(project.id, project.title, `${clean(project.title)}\n${clean(project.description)}\nStatus: ${clean(project.status)}\n${clean(project.createdByName) || name(project.createdBy)}\n${day(project.createdAt)}${project.completedAt ? ` → ${day(project.completedAt)}` : ''}\n${array(project.teamMembers).map(member => clean(member.name) || name(member.email)).join(', ')}`, { start: clean(project.createdAt, 10), end: clean(project.completedAt || project.createdAt, 10), owner: norm(project.createdBy), members: array(project.teamMembers).map(member => norm(member.email)), status: project.status })
          }
          // Personlige to-do's: KUN brugerens egen noegle (todos-personal-<egen email>), aldrig kollegers.
          for (const todo of array(readTeam(team, `todos-personal-${principal.email}`))) {
            if (!todo?.id) continue
            add(`todo:${todo.id}`, todo.title, `${clean(todo.title)}\n${clean(todo.description)}\nStatus: ${clean(todo.status)}${todo.dueDate ? `\n${language === 'da' ? 'Forfald' : language === 'fi' ? 'Eräpäivä' : language === 'sv' ? 'Förfaller' : 'Due'}: ${day(todo.dueDate)}` : ''}`, { start: clean(todo.createdAt, 10), owner: principal.email, personal: true, status: todo.status })
          }
        } else if (module.id === 'improvements') {
          // Shared across teams: list once, same projection as the module snapshot minus history/notifications.
          if (sharedDone.has('improvements')) continue
          sharedDone.add('improvements')
          for (const item of array(readShared('improvement-cases'))) {
            if (!item?.id || Object.hasOwn(item, 'deletedAt')) continue
            const owners = array(item.assignments).filter(entry => entry?.status === 'accepted')
            const invite = array(item.assignments).find(entry => entry?.status === 'pending' && norm(entry.email) === principal.email)
            add(`improvement:${item.id}`, item.title, `${clean(item.title)}\n${clean(item.problem, 600)}\n${clean(item.proposal, 600)}\nStatus: ${clean(item.status, 40)} · ${clean(item.priority, 20)} · ${clean(item.category, 60)}\n${clean(item.createdByName) || name(item.createdBy)} · ${clean(item.originTeamCode, 20)} · ${day(item.createdAt)}${owners.length ? `\n${owners.map(entry => clean(entry.name) || name(entry.email)).join(', ')}` : ''}`, { start: clean(item.createdAt, 10), owner: norm(item.createdBy), members: owners.map(entry => norm(entry.email)), status: item.status, priority: item.priority, category: norm(item.category), dueDate: clean(item.dueDate, 10), invitedMe: !!invite, line: [`${clean(item.title)} — ${[t.improve.status[item.status] || clean(item.status, 40), t.improve.priority[item.priority] || clean(item.priority, 20), t.improve.category[norm(item.category)] || clean(item.category, 60)].join(' · ')}`, item.dueDate ? `${t.improve.due} ${day(item.dueDate)}` : '', invite ? `${t.improve.invited}${invite.responseDueDate ? ` ${day(invite.responseDueDate)}` : ''}` : ''].filter(Boolean).join(' · ') })
          }
        } else if (module.id === 'links') {
          // Same rule as the Link Library for ordinary users: approved, not reported as suspicious, owned by or shared with the team.
          for (const link of array(readShared('link-library')?.links)) {
            if (!link?.id || sharedDone.has(`link:${link.id}`) || link.status !== 'approved') continue
            if (array(link.reports).some(report => report?.status === 'open' && report.reason === 'suspicious')) continue
            if (link.ownerTeamCode !== team.folderName && !array(link.sharedWithTeamCodes).includes(team.folderName)) continue
            let domain
            try { domain = new URL(link.url).hostname.replace(/^www\./, '') } catch { continue }
            sharedDone.add(`link:${link.id}`)
            add(`link:${link.id}`, link.title, `${clean(link.title, 200)}\n${clean(link.description, 2000)}\n${clean(link.category, 80)}\n${clean(domain, 200)}`, { start: clean(link.createdAt, 10), linkId: link.id, line: `${clean(link.title, 200)} — ${clean(domain, 200)}${clean(link.description, 300).trim() ? `: ${clean(link.description, 300).trim()}` : ''}` })
          }
        } else if (module.id === 'notes') {
          for (const note of array(readTeam(team, 'notebook-notes'))) {
            if (!note?.id || (note.isPersonal !== false && norm(note.creatorEmail) !== principal.email)) continue
            add(note.id, note.title, `${clean(note.content)}\n${array(note.tags).map(tag => clean(tag, 80)).join(', ')}\n${clean(note.creatorName) || name(note.creatorEmail)} · ${day(note.updatedAt || note.createdAt)}`, { start: clean(note.updatedAt || note.createdAt, 10), owner: norm(note.creatorEmail), personal: note.isPersonal !== false, pinned: note.pinned === true })
          }
        } else if (module.id === 'messages') {
          const folders = array(readTeam(team, 'email-folders')).filter(folder => norm(folder?.userId) === principal.email)
          for (const email of array(readTeam(team, 'emails'))) {
            if (!email?.id || (norm(email.from) !== principal.email && norm(email.to) !== principal.email)) continue
            const date = timestamp(email.timestamp)
            add(email.id, email.subject, `${clean(email.subject)}\n${clean(email.message)}\n${name(email.from)} → ${name(email.to)}\n${day(date)}\n${email.read ? 'Read / Læst / Luettu / Läst' : 'Unread / Ulæst / Lukematon / Oläst'}${email.folderId ? `\n${clean(folders.find(folder => folder.id === email.folderId)?.name)}` : ''}`, { start: date.slice(0, 10), read: email.read === true, from: norm(email.from), to: norm(email.to), starred: email.starred === true, line: `${clean(email.subject)} — ${[name(email.from), day(date)].filter(Boolean).join(', ')}${email.read ? '' : ` (${t.kinds.unread})`}${clean(email.message).trim() ? `\n${clean(email.message).trim().slice(0, 300)}` : ''}` })
          }
          for (const folder of folders) add(`folder:${folder.id}`, folder.name, clean(folder.name), { folder: true })
        } else if (module.id === 'announcements') {
          for (const item of array(readTeam(team, 'announcements'))) {
            if (!item?.id) continue
            const date = timestamp(item.createdAt).slice(0, 10)
            add(item.id, item.title, `${clean(item.message)}\n${clean(item.createdByName) || name(item.createdBy)} · ${day(date)}`, { start: date })
          }
        } else if (module.id === 'people') {
          const birthdays = array(readTeam(team, 'employee-birthdays'))
          const birthdayOf = new Map()
          for (const item of birthdays) { const id = norm(item.email); if (!birthdayOf.has(id)) birthdayOf.set(id, item) }
          for (const [key, user] of userEntries()) {
            const email = norm(user.email || (Array.isArray(getUsers()) ? user.id : key))
            const birthday = birthdayOf.get(email)
            const role = MANAGER(user) ? 'manager' : 'user'
            add(email, user.fullName || user.name || email, `${clean(user.fullName || user.name)}\n${email}\n${clean(user.username)}\n${clean(user.phone)}\n${t.role[role]}${birthday ? `\n${language === 'da' ? 'Fødselsdag' : language === 'fi' ? 'Syntymäpäivä' : language === 'sv' ? 'Födelsedag' : 'Birthday'}: ${birthdayText(birthday.birthday, language, now)}` : ''}`, { role, owner: email, birthday: clean(birthday?.birthday, 10), lineParts: { head: `${clean(user.fullName || user.name) || email} — ${t.role[role]}`, contact: [email, clean(user.username), clean(user.phone)].filter(Boolean), birthday: birthday ? `${language === 'da' ? 'fødselsdag' : language === 'fi' ? 'syntymäpäivä' : language === 'sv' ? 'födelsedag' : 'birthday'} ${birthdayText(birthday.birthday, language, now)}` : '' } })
          }
        } else if (module.id === 'absence') {
          for (const [key, type] of [['vacation-entries', 'Ferie / Vacation / Loma / Semester'], ['sick-leave-entries', 'Sygemelding / Sick leave / Sairasloma / Sjukskrivning']]) {
            for (const entry of array(readTeam(team, key))) {
              if (!entry?.id) continue
              const own = norm(entry.userEmail) === principal.email
              if (entry.status !== 'approved' && !own && !manager) continue
              // A colleague's sick-leave reason is never shown, not even to managers.
              const note = (own || (manager && key === 'vacation-entries')) ? clean(entry.notes || entry.reason) : ''
              add(`${key}:${entry.id}`, `${name(entry.userEmail)} · ${type}`, `${name(entry.userEmail)}\n${type} · ${clean(entry.status)}\n${span(clean(entry.startDate, 10), clean(entry.endDate || entry.startDate, 10))}${note ? `\n${note}` : ''}`, { start: clean(entry.startDate, 10), end: clean(entry.endDate || entry.startDate, 10), owner: norm(entry.userEmail), status: entry.status, absenceType: key, line: `${name(entry.userEmail)} — ${key === 'vacation-entries' ? t.kinds[entry.type === 'parental' ? 'parental' : 'vacation'] : t.kinds.sick}${entry.status === 'approved' ? '' : ` (${t.kinds[entry.status] || clean(entry.status, 40)})`} ${span(clean(entry.startDate, 10), clean(entry.endDate || entry.startDate, 10))}${note ? ` (${note})` : ''}` })
            }
          }
        } else if (module.id === 'reviews') {
          const reviewer = manager || array(readTeam(team, 'guide-admin-emails')).some(email => norm(email) === principal.email)
          for (const item of array(readTeam(team, 'guide-review-requests'))) {
            if (!item?.id || (!reviewer && norm(item.submittedBy) !== principal.email)) continue
            // Review content is explicitly a draft, never published evidence.
            const draft = item.proposedGuide
            add(`review:${item.id}`, `${item.guideTitle} · ${item.status}`, `REVIEW / KLADDE / LUONNOS / UTKAST — ${clean(item.action)} · ${clean(item.status)}\n${clean(item.changeNote)}\n${clean(item.reviewerComment)}\n${clean(item.submittedByName) || name(item.submittedBy)}${draft ? `\n${clean(draft.content)}\n${array(draft.sections).map(section => `${clean(section.heading)}\n${array(section.steps).map(step => clean(step.text)).join('\n')}`).join('\n')}` : ''}`, { owner: norm(item.submittedBy), status: item.status, draft: true })
          }
          if (reviewer) for (const item of array(readTeam(team, 'archived-guides'))) if (item?.id && item.guide) add(`archive:${item.id}`, `${item.guide.title} · Archive`, `ARKIVERET / ARCHIVED / ARKISTOITU / ARKIVERAD\n${clean(item.guide.content)}`, { archived: true })
          // Do not expose old removed content to ordinary users through version history.
          if (reviewer) for (const guide of array(readTeam(team, 'guides'))) if (/^[\w-]{1,160}$/.test(guide?.id || '')) {
            for (const version of array(readTeam(team, `guide-versions-${guide.id}`))) add(`version:${guide.id}:${version.version}`, `${guide.title} · v${version.version}`, `HISTORIK / HISTORY / HISTORIA\n${clean(version.changeNote)}\n${clean(version.snapshot?.content)}\n${array(version.snapshot?.sections).map(section => `${clean(section.heading)}\n${array(section.steps).map(step => clean(step.text)).join('\n')}`).join('\n')}`, { history: true })
          }
        } else if (module.id === 'settings') {
          const preferences = readTeam(team, `hub-dashboard-${principal.email}`)
          for (const widget of WIDGETS) if (preferences?.[widget]) add(`widget:${widget}`, widget, `${widget}: ${preferences[widget].visible === false ? 'Hidden / Skjult / Piilotettu / Dold' : 'Visible / Synlig / Näkyvä'} · ${['compact', 'standard', 'large'].includes(preferences[widget].size) ? preferences[widget].size : 'standard'}`)
        } else if (module.id === 'modules') {
          add('available', 'Supply Chain Hub', CATALOG.map(item => `${item.labels[lang < 0 ? 0 : lang]}: ${item.fields}`).concat(LEGACY.map(item => `${item.id}: ${item.fields}`)).join('\n'))
          add('placeholders', 'Document library / Team chat', language === 'da' ? 'Dokumentbibliotek og teamchat er endnu ikke implementeret. Der findes ikke moduldata at svare ud fra.' : language === 'fi' ? 'Dokumenttikirjastoa ja tiimichattia ei ole vielä toteutettu. Moduulitietoja ei ole saatavilla.' : language === 'sv' ? 'Dokumentbibliotek och teamchatt är inte implementerade ännu. Det finns inga moduldata att svara utifrån.' : 'Document library and team chat are not implemented yet. There is no module data to answer from.')
        } else if (module.id === 'administration' && manager) {
          for (const [key, user] of Object.entries(getUsers())) if (user && norm(user.email || key) !== norm(creatorEmail())) add(`user:${norm(user.email || key)}`, user.fullName || user.email || key, `${clean(user.fullName)}\n${norm(user.email || key)}\nStatus: ${clean(user.status || 'approved')}\n${MANAGER(user) ? t.role.manager : t.role.user}`, { status: user.status || 'approved', line: `${clean(user.fullName) || norm(user.email || key)} — ${MANAGER(user) ? t.role.manager : t.role.user} · ${norm(user.email || key)}${(user.status || 'approved') !== 'approved' ? ` · ${t.kinds[user.status] || clean(user.status, 40)}` : ''}` })
          for (const role of array(readTeam(team, 'shift-roles'))) if (role?.id) add(`role:${role.id}`, role.name, `${clean(role.name)} · ${clean(role.color, 120)}`)
          for (const email of array(readTeam(team, 'guide-admin-emails'))) if (typeof email === 'string') add(`guide-admin:${norm(email)}`, name(email), `Guide Admin: ${name(email)}`)
          for (const request of array(readTeam(team, 'guide-access-requests'))) if (request?.id) add(`guide-access:${request.id}`, request.guideTitle, `${clean(request.guideTitle)}\n${clean(request.requestingUserName)} · ${clean(request.requestingTeamCode)}\nStatus: ${clean(request.status)}\n${day(request.expiresAt)}`, { status: request.status })
        } else if (module.id === 'system') {
          const info = getDiagnostics(principal)
          const privileged = principal.role === 'creator' || manager
          add('status', 'Supply Chain Hub', `Version: ${clean(info.version, 40) || t.missing}\n${info.connected === true ? 'Online' : info.connected === false ? 'Offline' : t.missing}\nPending sync: ${Number.isInteger(info.pendingSync) ? info.pendingSync : t.missing}${privileged ? `\n${clean(info.dataDir, 1000)}` : ''}`, { line: [`${t.sys.version} ${clean(info.version, 40) || t.missing}`, info.connected === true ? t.sys.online : info.connected === false ? t.sys.offline : '', Number.isInteger(info.pendingSync) ? (info.pendingSync > 0 ? t.sys.pending(info.pendingSync) : t.sys.synced) : '', privileged && info.dataDir ? `${t.sys.data}: ${clean(info.dataDir, 1000)}` : ''].filter(Boolean).join(' · ') })
        } else if (module.id === 'games') {
          const games = [['Parcel Pilot', 'nexi-flyer-play-counts'], ['Route Runner', 'neon-snake-play-counts'], ['Prism Break', 'brickbreak-play-counts'], ['Chicken Invaders', 'endless-dodger-play-counts'], ['Cargo Stack', 'cargo-stack-play-counts']]
          for (const [game, key] of games) {
            const values = readTeam(team, key)?.[principal.email]
            const keys = ['easy', 'medium', 'hard', 'expert']
            const counts = keys.filter(difficulty => values && typeof values === 'object' && Number.isInteger(values[difficulty]) && values[difficulty] > 0).map(difficulty => `${t.games[difficulty]}: ${values[difficulty]}`)
            add(key, game, `Arcade · ${game}${values && typeof values === 'object' ? `\n${keys.map(difficulty => `${t.games[difficulty]}: ${Number.isInteger(values[difficulty]) && values[difficulty] >= 0 ? values[difficulty] : t.missing}`).join('\n')}` : `\n${t.missing}`}`, { line: `${game}: ${counts.join(' · ') || t.games.none}` })
          }
          add('modern', 'Modern', `Modern · Cube Basher\n${t.games.modern}`, { line: `Cube Basher: ${t.games.modern}` })
        } else if (module.id === 'notifications') {
          for (const email of array(readTeam(team, 'emails'))) if (email?.id && norm(email.to) === principal.email && !email.read) add(`email:${email.id}`, email.subject, `${clean(email.subject)}\n${name(email.from)}\nUnread / Ulæst / Lukematon / Oläst`)
          const notes = array(readTeam(team, 'notebook-notes'))
          for (const alert of array(readTeam(team, 'notebook-notifications'))) {
            if (!alert?.id || alert.read || norm(alert.originalCreator) !== principal.email) continue
            const note = notes.find(note => note?.id === alert.noteId)
            if (!note || (note.isPersonal !== false && norm(note.creatorEmail) !== principal.email)) continue
            add(`note:${alert.id}`, note.title, `${clean(note.title)}\n${clean(alert.editedByName)} · ${day(alert.timestamp)}`)
          }
          if (manager) for (const key of ['vacation-entries', 'sick-leave-entries']) for (const entry of array(readTeam(team, key))) if (entry?.id && entry.status === 'pending') add(`${key}:${entry.id}`, name(entry.userEmail), `${name(entry.userEmail)}\n${key === 'vacation-entries' ? t.kinds.vacation : t.kinds.sick} · ${t.kinds.pending}\n${day(entry.startDate)}`)
          const reviewer = manager || array(readTeam(team, 'guide-admin-emails')).some(email => norm(email) === principal.email)
          if (reviewer) for (const request of array(readTeam(team, 'guide-review-requests'))) if (request?.id && request.status === 'pending') add(`review:${request.id}`, request.guideTitle, `${clean(request.guideTitle)}\n${CATALOG.find(item => item.id === 'reviews').labels[lang < 0 ? 0 : lang]} · ${t.kinds.pending}`)
        }
      }
    }
    // Who owns a guide, who wrote it, which version, when it was last updated and when it is due for review: metadata only, never the guide's content.
    if (ids.includes('guideInfo') && getGuides) {
      const t = LABELS[language] || LABELS.da
      const seen = new Set()
      const nameIndexes = new Map()
      const nameIndexOf = users => {
        let index = nameIndexes.get(users)
        if (!index) { index = new Map(); for (const entry of Object.entries(users)) { const id = norm(entry[1]?.email || entry[0]); if (!index.has(id)) index.set(id, entry[1]) } nameIndexes.set(users, index) }
        return index
      }
      for (const { guide, team } of getGuides(principal)) {
        if (!guide?.id || seen.has(guide.id)) continue
        seen.add(guide.id)
        const users = readTeam(team, 'users') || {}
        const person = email => clean(nameIndexOf(users).get(norm(email))?.fullName || String(email || ''), 150)
        const iso = value => Number.isFinite(value) ? new Date(value).toISOString().slice(0, 10) : ''
        const updated = iso(guide.updatedAt)
        const nextReview = iso(guide.nextReviewAt)
        const owner = guide.responsibleEmail ? person(guide.responsibleEmail) : ''
        const author = guide.author ? person(guide.author) : guide.createdBy ? person(guide.createdBy) : ''
        const updatedBy = guide.updatedBy ? person(guide.updatedBy) : ''
        const parts = [`${clean(guide.title, 180)} — v${clean(guide.version, 20) || '1.00'}`, owner ? `${t.guide.owner}: ${owner}` : '', author ? `${t.guide.author}: ${author}` : '', updated ? `${t.guide.updated}: ${day(updated)}${updatedBy ? ` (${updatedBy})` : ''}` : '', nextReview ? `${t.guide.nextReview}: ${day(nextReview)}` : '']
        output.push({ kind: 'module', moduleId: 'guideInfo', recordId: `guide:${guide.id}`, teamId: team.teamId, title: `${team.abbreviation || team.teamId} · ${t === LABELS.da ? 'Guide-info' : 'Guide info'} · ${clean(guide.title, 180)}`, text: parts.filter(Boolean).join('\n'), start: updated, end: updated, nextReview, line: parts.filter(Boolean).join(' · ') })
      }
    }
    if ((ids.includes('guides') || ids.includes('knowledge')) && getGuides) for (const { guide, team, library } of getGuides(principal, ids.includes('knowledge') && !ids.includes('guides') ? { library: 'knowledge' } : {})) {
      if (!guide?.id) continue
      for (const chunk of indexGuide(guide)) {
        const item = { kind: 'guide', ...(library === 'knowledge' ? { library } : {}), moduleId: library === 'knowledge' ? 'knowledge' : 'guides', teamId: team.teamId, guideId: guide.id, title: chunk.title, version: chunk.version, revision: chunk.revision, reference: chunk.reference, imageIds: chunk.imageIds, text: chunk.text }
        indexedWords.set(item, chunk.words)
        output.push(item)
      }
    }
    return output
  }
  function query({ principal, question, language, now, plan, page = 0 }) {
    const t = LABELS[language] || LABELS.da
    const headingOf = period => formatHeading(period.start, period.end, language, { now })
    if (!Number.isInteger(page) || page < 0 || page > 10000) throw new Error('Ugyldig resultatside')
    const q = norm(question)
    const targeted = CATALOG.filter(module => module.topic.test(q)).map(module => module.id)
    const planning = PLANNING_MODULES.filter(module => module.topic.test(q)).map(module => module.id)
    // Combine multiple requested domains; retain old direct handlers for a single
    // ordinary planning question. Explicit plans are still constrained to adapters.
    if (targeted.length || planning.length > 1 || /hvornår|when|milloin|fast mønster|fixed pattern|när|fast mönster/u.test(q)) targeted.push(...planning)
    const available = [...CATALOG, ...PLANNING_MODULES]
    let ids = plan?.modules?.filter(id => available.some(module => module.id === id)) || targeted
    if (ids.includes('absence')) ids = ids.filter(id => id !== 'vacation')
    // "Pending users" are not pending absence requests ("pending" alone matches the absence topic).
    if (ids.includes('absence') && (ids.includes('administration') && USER_WORDS.test(q) || ids.includes('reviews') && PENDING_ASK.test(q)) && !ABSENCE_WORDS.test(q)) ids = ids.filter(id => id !== 'absence')
    // "people" in "how many people are sick" is a plural noun, not a request for the team directory.
    if (ids.includes('absence') && ids.includes('people') && !/birthday|fødselsdag|födelsedag|syntymä|fyller år|phone|telefon|puhelin|manager|chef|leder|esimies|esihenkilö|kontakt|contact/u.test(q)) ids = ids.filter(id => id !== 'people')
    // "Bo's email" asks for a contact detail, not for the messages in the mailbox.
    if (ids.includes('people') && CONTACT_ASK.test(q) && !MESSAGE_WORDS.test(q)) ids = ids.filter(id => id !== 'messages')
    // "Pending sync" is about the app, not about pending requests; a guide's version is not the app's.
    if (ids.includes('system') && ids.includes('absence') && !ABSENCE_WORDS.test(q)) ids = ids.filter(id => id !== 'absence')
    if (ids.includes('system') && ids.includes('guideInfo') && !/\bapp|appen|\bhub|sovellus/u.test(q)) ids = ids.filter(id => id !== 'system')
    // Guide metadata ("who owns the guide?") is not the review queue or the version history, unless those are asked for.
    if (ids.includes('guideInfo') && ids.includes('reviews') && !/historik|history|historia|kladde|draft|luonnos|utkast|arkiv|archive|anmodning|request|pending|ventende|odottav|väntande|restore/u.test(q)) ids = ids.filter(id => id !== 'reviews')
    // Administration data (pending users, guide admins) is manager-only: refuse politely instead of searching it.
    if (ids.includes('administration') && !['manager', 'creator'].includes(principal.role)) {
      if (ids.length === 1) return { mode: 'data', text: t.managerOnly, sources: [], contextQuestion: question }
      ids = ids.filter(id => id !== 'administration')
    }
    const pendingAsk = PENDING_ASK.test(q)
    const requestedPeriod = mentionsPeriod(q)
    // Improvements are narrowed by what the question says; the words that did the narrowing are not search words.
    const consumed = new Set()
    const take = pattern => { const match = pattern.exec(q); if (match) for (const word of match[0].split(/[^\p{L}\p{N}]+/u)) consumed.add(word); return !!match }
    const improve = ids.includes('improvements') ? {
      priority: Object.keys(IMPROVE_PRIORITY).find(key => take(IMPROVE_PRIORITY[key])),
      status: IMPROVE_STATUS.find(([, pattern]) => take(pattern))?.[0],
      category: /kategori|category|kategoria|luokka|luokassa/u.test(q) ? IMPROVE_CATEGORY.find(([, pattern]) => take(pattern))?.[0] : undefined,
      invited: take(IMPROVE_INVITE),
      due: take(IMPROVE_DUE),
      active: take(IMPROVE_ACTIVE),
    } : null
    if (improve?.invited) for (const word of 'venter ventende waiting pending odottavia odottavat odottaa väntande väntar awaiting svar answer'.split(' ')) consumed.add(word)
    if (ids.includes('system')) for (const word of 'appen app appens applikationen sovellus sovelluksen käytössä körs kører køre online offline verkossa changes ndringer ændringer muutosta muutos ändringar waiting pending venter odottaa väntar sync synkroniseret synkronisering synkronointia stored lagret lagrad sijaitsee ligger finns'.split(' ')) consumed.add(word)
    // The data folder path is for the creator and managers only.
    if (ids.includes('system') && /(?:hvor ligger|where is|where are|var ligger|var finns|missä) (?:the )?(?:data|dataen|dataene|datan|filerne)|data folder|data directory|datakansio|data sijaitsee|datan lagrad|datamappe|datamapp/u.test(q) && !['creator', 'manager'].includes(principal.role)) return { mode: 'data', text: t.pathOnly, sources: [], weak: false, contextQuestion: question }
    const asksSickOnly = /syg|sick|saira|sjuk/u.test(q) && !/ferie|vacation|holiday|loma|semester/u.test(q)
    // A meal question without any period means today, and so does "who is sick?" (not a list of every old record).
    const todayDefault = (ids.includes('meals') || (ids.includes('absence') && asksSickOnly && !pendingAsk && !OWN_WORDS.test(q))) && !requestedPeriod
    const range = resolveDates(q, now) || (todayDefault ? { start: dayOf(now), end: dayOf(now) } : null)
    if (ids.includes('meals') && !range) return { mode: 'data', text: t.date, sources: [], contextQuestion: question }
    const searches = plan ? plan.terms : terms(q).filter(word =>
      !available.some(module => module.topic.test(word)) &&
      !(ids.includes('meals') && MEAL_QUESTION_WORDS.has(word)) &&
      !(pendingAsk && PENDING_WORDS.has(word)))
    if (requestedPeriod && !range && ids.length) return { mode: 'data', text: t.date, sources: [], contextQuestion: question }
    // Preserve the focused guide parser for guide-only queries; general searches
    // and multi-module requests can combine published guides with other records.
    if (!ids.length && /guide|vejledning|manual|opas|oppaa/u.test(q) && !plan) return null
    // A normal factual search uses current information, not draft proposals or
    // historical snapshots. Do not even read version files unless requested.
    let items = records(principal, ids.length ? [...ids, ...(/guide|vejledning|manual|opas|oppaa/u.test(q) && !(ids.includes('reviews') && pendingAsk) && !ids.includes('guideInfo') ? ['guides'] : [])] : [...available.filter(module => !['reviews', 'notifications'].includes(module.id)).map(module => module.id), 'guides'], language, range, now)
    if (/historik|history|historia/u.test(q)) items = items.filter(item => item.moduleId !== 'reviews' || item.history === true)
    // The document library and team chat are asked about by name: the answer is the "not built yet" note, not the technical module catalogue.
    if (ids.includes('modules') && /dokumentbibliotek|document library|team.?chat|teamchat|dokumenttikirjasto|tiimichat/u.test(q)) items = items.filter(item => item.recordId !== 'available')
    if (range) items = items.filter(item => (improve?.due && item.moduleId === 'improvements') || !item.start || (item.start <= range.end && (item.end || item.start) >= range.start))
    if (/ulæst|unread|lukematon|lukemat|oläst|\b(?:nye|new|uusia|uudet|nya)\b/u.test(q)) items = items.filter(item => item.moduleId !== 'messages' || (!item.folder && item.to === principal.email && !item.read))
    if (/indbakke|inbox|saapuneet|inkorg/u.test(q)) items = items.filter(item => item.moduleId !== 'messages' || (!item.folder && item.to === principal.email))
    if (/sendte|sent|lähetetyt|skickade/u.test(q)) items = items.filter(item => item.moduleId !== 'messages' || (!item.folder && item.from === principal.email))
    if (PENDING_ASK.test(q)) items = items.filter(item => !['absence', 'reviews', 'administration'].includes(item.moduleId) || item.status === 'pending')
    // Both words in one question ("sick or vacation") means either kind of absence, so neither filter applies.
    const asksVacation = /ferie|vacation|holiday|loma|semester/u.test(q)
    const asksSick = /syg|sick|saira|sjuk/u.test(q)
    if (asksVacation && !asksSick) items = items.filter(item => item.moduleId !== 'absence' || item.absenceType === 'vacation-entries')
    if (asksSick && !asksVacation) items = items.filter(item => item.moduleId !== 'absence' || item.absenceType === 'sick-leave-entries')
    if (/færdige|afsluttede|completed|valmiit|klara|avslutade|slutförda/u.test(q)) items = items.filter(item => item.moduleId !== 'projects' || item.status === 'completed')
    if (/åbne|open|avoimet|auki|öppna/u.test(q)) items = items.filter(item => (item.moduleId !== 'projects' || item.status !== 'completed') && (item.moduleId !== 'improvements' || !['completed', 'declined'].includes(item.status)))
    if (/i gang|igang|in.progress|käynnissä|pågår|pågående/u.test(q)) items = items.filter(item => item.moduleId !== 'projects' || item.status === 'in-progress')
    if (/mine projekter|my projects|omat projektit|(?:min|mine|my|omat)\s+(?:personlige\s+)?to-?do|mina projekt|mina att göra/u.test(q)) items = items.filter(item => item.moduleId !== 'projects' || item.personal || item.owner === principal.email || item.members?.includes(principal.email))
    if (/teamets|team to-?do|tiimin/u.test(q)) items = items.filter(item => item.moduleId !== 'projects' || !item.personal)
    if (/personlige noter|private noter|personal notes|private notes|omat muistiinpanot|yksityiset muistiinpanot|personliga anteckningar|privata anteckningar/u.test(q)) items = items.filter(item => item.moduleId !== 'notes' || item.personal)
    if (/fælles noter|shared notes|delade anteckningar/u.test(q)) items = items.filter(item => item.moduleId !== 'notes' || !item.personal)
    if (/manager|chef|esihenkilö|esimies|esimiehe|(?:min|mit|vores|teamets|din|hvem er) leder|\blederen\b|\bledere\b/u.test(q)) items = items.filter(item => item.moduleId !== 'people' || item.role === 'manager')
    if (/fødselsdag|birthday|syntymä|födelsedag|fyller år|fylder år/u.test(q)) items = items.filter(item => item.moduleId !== 'people' || (item.birthday && (!range || (() => { const dates = [range.start.slice(0, 4), range.end.slice(0, 4)].map(year => `${year}-${item.birthday}`); return dates.some(date => date >= range.start && date <= range.end) })())))
    if (!APPROVE_ASK.test(q) && /(?:^|[^\p{L}])(?:jeg|mig|min|mine|my|me|omat|minun|jag|mina|mitt)(?=$|[^\p{L}])|[\p{L}]{4,}ni(?=$|[^\p{L}])/u.test(q)) items = items.filter(item => (!['shifts', 'homeOffice', 'vacation', 'absence'].includes(item.moduleId) || item.owner === principal.email) && (item.moduleId !== 'improvements' || item.owner === principal.email || item.members?.includes(principal.email) || (improve?.invited && item.invitedMe)))
    // "My phone number" is one record: the asker's own, not the whole directory.
    if (/(?:^|[^\p{L}])(?:jeg|mig|min|mit|mine|my|omat|minun|mina|mitt)(?=$|[^\p{L}])/u.test(q) && /telefon|phone|puhelin|e-?mail|fødselsdag|födelsedag|birthday|syntymä/u.test(q) && !/(?:^|[^\p{L}])(?:hvem|who|kuka|ketkä|vem)(?=$|[^\p{L}])/u.test(q)) items = items.filter(item => item.moduleId !== 'people' || item.owner === principal.email)
    if (improve) items = items.filter(item => item.moduleId !== 'improvements' || ((!improve.priority || item.priority === improve.priority) && (!improve.status || item.status === improve.status) && (!improve.category || item.category === improve.category) && (!improve.invited || item.invitedMe) && (!improve.active || !['completed', 'declined'].includes(item.status)) && (!improve.due || (item.dueDate && (range ? item.dueDate >= range.start && item.dueDate <= range.end : item.dueDate >= dayOf(now))))))
    // "My latest message": the newest record of a dated module.
    if (LATEST.test(q) && ids.length && ids.every(id => ['messages', 'notes', 'announcements', 'projects', 'improvements'].includes(id))) items = [...items].sort((a, b) => (b.start || '').localeCompare(a.start || '')).slice(0, 1)
    const filterWords = new Set('due ejer ejes ansvarlig vedligeholder forfatter skrevet skrev oprettet opdateret opdaterede ændret gennemgang gennemgås gennemgå forældet forfalden owner owns responsible maintains author wrote written created updated changed review overdue outdated omistaa omistaja vastuussa kirjoitti kirjoittanut päivitetty päivitettiin tarkistaa tarkistettava vanhentunut versio äger ansvarig skapade uppdaterad uppdaterades granskas granskning föråldrad guiden guiderne guider oppaan oppaassa oppaat oppaita opas behöver pitää private privat yksityiset privata ulæste ulæst unread lukematon lukemattomia lukemattomat kører running version versio versiota indbakke inbox saapuneet sendte sent lähetetyt afventer pending odottaa færdige afsluttede completed valmiit åbne open avoimet mine my omat personlige personal manager chef esihenkilö leder lederen ledere esimies teamets teamet tiimin uge week viikko viikolla viikon 2026 oläst olästa inkorg skickade väntar väntande klara avslutade öppna pågående mina personliga vecka veckan'.split(' '))
    const meaningful = (ids.length === 1 && ids[0] === 'system') ? [] : searches.filter(word => !filterWords.has(word) && !consumed.has(word) && !(improve && IMPROVE_NOISE.test(word)) && !/^\d+$/.test(word) && !isMonthWord(word) && !(range && resolveDates(word, now)))
    // "Which guides are due for review?" lists the overdue ones; naming a guide asks about that one instead.
    const guideDue = ids.includes('guideInfo') && !meaningful.length && /gennemgang|gennemgang|gennemgå|forældet|forfalden|due for review|overdue|outdated|review due|tarkistaa|tarkistettava|vanhentun|granskas|granskning|föråldrad/u.test(q)
    if (guideDue) items = items.filter(item => item.moduleId !== 'guideInfo' || (item.nextReview && item.nextReview <= dayOf(now)))
    // General free-text search indexes only permission-projected records.
    if (meaningful.length) {
      const ranked = items.map(item => {
        const body = indexedWords.get(item) || new Set(keyWords(`${item.title} ${item.text}`))
        const matches = meaningful.filter(word => body.has(word) || [...body].some(value => value.startsWith(word) && word.length >= 4) || [...body].some(value => value.length >= 2 && word.startsWith(value) && /^(?:s|n|in|:n|ssa|lla|lle|lta|sta|ksi)$/u.test(word.slice(value.length))))
        return { item, score: matches.length }
      }).filter(value => value.score >= Math.min(2, meaningful.length) && value.score / meaningful.length >= 0.5)
      ranked.sort((a, b) => b.score - a.score || (b.item.start || '').localeCompare(a.item.start || ''))
      items = ranked.map(value => value.item)
    } else if (!ids.length) return null
    const total = items.length
    if (!total && !ids.length) return null
    if (/hvor mange|how many|kuinka monta|kuinka moni|hur många/u.test(q) && !(ids.length === 1 && ids[0] === 'system')) return { mode: 'data', text: `${t.count}: ${total}${range ? ` (${headingOf(range)})` : ''}`, sources: [], total, weak: false, contextQuestion: question }
    const selected = items.slice(page * 8, (page + 1) * 8).map(item => ({ ...item, title: localized(item.title, language), text: localized(item.text, language), ...(item.lineParts ? { line: [item.lineParts.head, ...(WANTS_CONTACT.test(q) ? item.lineParts.contact : []), ...(WANTS_BIRTHDAY.test(q) ? [item.lineParts.birthday] : [])].filter(Boolean).join(' · ') } : {}), ...(item.moduleId === 'guideInfo' && item.nextReview && item.nextReview <= dayOf(now) ? { line: `${item.line} (${t.guide.overdue})` } : {}) }))
    const sources = selected.map(({ text, line, lineParts, ...source }) => source.kind === 'guide' || source.history ? { ...source, text } : source)
    const periodText = range ? ` (${headingOf(range)})` : ''
    const shownModules = [...new Set(selected.map(item => item.moduleId))]
    const moduleLabel = shownModules.length === 1 ? [...CATALOG, ...PLANNING_MODULES].find(module => module.id === shownModules[0])?.labels[Math.max(0, ['da', 'en', 'fi', 'sv'].indexOf(language))] : ''
    const header = `${moduleLabel || t.found}${periodText}${total > 8 ? ` · ${total} ${t.total}; ${t.more} ${page * 8 + 1}–${Math.min((page + 1) * 8, total)}` : ''}`
    const direct = ids.length > 0 && !/forklar|betyder|sammenfat|opsummer|summar|explain|analyser|analyse|hvorfor|why|miksi|selitä|förklara|sammanfatta|varför/u.test(q)
    const sickOnly = !!range && ids.length === 1 && ids[0] === 'absence' && !pendingAsk && SICK_QUESTION.test(q) && !OTHER_ABSENCE.test(q) && !meaningful.length
    const rangeLabel = range ? headingOf(range) : ''
    const emptyText = guideDue ? t.noReview : pendingAsk && ids.includes('administration') ? t.noPending : pendingAsk && (ids.includes('absence') || ids.includes('reviews')) && !['manager', 'creator'].includes(principal.role) ? t.pendingOwn : `${sickOnly ? (NO_SICK[language] || NO_SICK.da)(rangeLabel, !!range && range.end < dayOf(now)) : range ? `${t.empty.replace(/\.$/, '')} (${rangeLabel}).` : t.empty}${emptyHint(ids, q, language, !!range)}`
    // Nothing found is a weak answer for the unanswered log, unless the empty result is the real answer (a period or a pending queue with nothing in it).
    const legitimatelyEmpty = guideDue || (pendingAsk && ids.some(id => ['administration', 'absence', 'reviews'].includes(id))) || (!!range && !meaningful.length)
    // One module in the answer: its name is in the header, so a record shows only its own heading (and its team when several are in view).
    const shownTitle = item => {
      if (shownModules.length !== 1 || item.kind !== 'module') return item.title
      const [teamLabel, , ...rest] = item.title.split(' · ')
      return principal.teams.length > 1 ? `${teamLabel} · ${rest.join(' · ')}` : rest.join(' · ') || item.title
    }
    // A record body that starts with its own heading would say everything twice.
    const bodyOf = item => {
      const heading = item.kind === 'module' ? item.title.split(' · ').slice(2).join(' · ') : ''
      const text = heading && item.text.startsWith(`${heading}\n`) ? item.text.slice(heading.length + 1) : item.text
      return text.replace(/\n{2,}/g, '\n').trim()
    }
    const separator = direct && selected.every(item => item.line && !item.line.includes('\n')) ? '\n' : '\n\n'
    const answerText = selected.length ? `${header}:\n\n${selected.map((item, i) => direct && item.line ? `[${i + 1}] ${item.line}` : `[${i + 1}] ${shownTitle(item)}\n${bodyOf(item).slice(0, direct ? 2400 : 1000)}${item.text.length > (direct ? 2400 : 1000) ? '\n[…] — open source for more' : ''}`).join(separator)}` : emptyText
    // A direct answer is shown as it is; text that the model will read must not be able to give it orders.
    return { mode: direct ? 'data' : selected.length && selected.every(item => item.kind === 'guide') ? 'retrieval' : 'knowledge', text: direct ? answerText : defangEvidence(answerText), sources, total, ...(total ? {} : { weak: !legitimatelyEmpty }), nextPage: (page + 1) * 8 < total ? page + 1 : undefined, contextQuestion: question }
  }
  function getRecord(principal, moduleId, recordId, teamId, language) {
    if (![...CATALOG, ...PLANNING_MODULES].some(module => module.id === moduleId)) throw new Error('Ukendt modul')
    if (!principal.teams.some(team => team.teamId === teamId)) throw new Error('Ingen adgang til dette team')
    // The id may be the public form (addresses replaced); the date is the only part the range needs.
    const range = moduleId === 'homeOffice' && typeof recordId === 'string' ? resolveDates(recordId.match(/\d{4}-\d{2}-\d{2}/u)?.[0] || '', new Date()) : undefined
    const item = records({ ...principal, teams: principal.teams.filter(team => team.teamId === teamId) }, [moduleId], language, range, new Date()).find(item => item.recordId === recordId || publicRecordId(item.recordId, principal.email) === recordId)
    if (!item) throw new Error('Kilden findes ikke længere, eller du har ikke adgang til den')
    return { title: item.title, text: item.text }
  }
  return { query, getRecord, matchedModules: question => [...CATALOG, ...PLANNING_MODULES].filter(module => module.topic.test(norm(question))).map(module => module.id) }
}
module.exports = { createKnowledge, validatePlan, moduleCatalog: () => [...CATALOG, ...LEGACY].map(({ id, fields }) => ({ id, fields })) }
