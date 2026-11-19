// Assistant-specific allowlist. Never send generic KV contents to the model.
const { isTaskQuestion, selectTaskPeople, listPeople, canonical } = require('./assistantPeople.cjs')
const { insightAnswer, DID_YOU_MEAN, INTENTS } = require('./assistantInsights.cjs')
const { loadShifts, rolesNamedIn } = require('./assistantShifts.cjs')
const { extraDates, mentionsPeriod, thisWeek, calendarDate } = require('./assistantDates.cjs')
const { relativeDates } = require('./assistantRelativeDates.cjs')
const { createKnowledge, validatePlan, moduleCatalog } = require('./assistantKnowledge.cjs')
const { continueQuestion, validateConversation } = require('./assistantConversation.cjs')
const { indexGuide } = require('./assistantGuideIndex.cjs')
const { detectActionIntent } = require('./assistantActions.cjs')
const { TEAM_ACTION_TYPES } = require('./assistantTeamActions.cjs')
const { appGuidance, describeAppTerm, isHowToQuestion, isAppWord } = require('./assistantAppGuide.cjs')
const { searchGuides } = require('./assistantGuideSearch.cjs')
const { docxParagraphs } = require('./docxText.cjs')
const { smallTalkAnswer, smallTalkReply } = require('./assistantSmallTalk.cjs')
const { tidyQuestion, focusClauses } = require('./assistantTidy.cjs')
const { paraphrase } = require('./assistantParaphrase.cjs')
const { guardAnswer, stripRoleClaim, roleClaimAnswer, defangEvidence, onlySendOrWrite } = require('./assistantGuard.cjs')
const { correctTypos } = require('./assistantSpelling.cjs')
const { nextStep } = require('./assistantNextStep.cjs')
const { multiplayerAnswer, applyGameChoice } = require('./assistantMultiplayer.cjs')
const { briefingAnswer, matchBriefing } = require('./assistantBriefing.cjs')
const { matchesHomeOfficePattern } = require('./homeOfficeRecurrence.cjs')
const { formatDay, formatRange, formatHeading } = require('./assistantDateFormat.cjs')
// Follow-ups to the briefing ("og i morgen?") continue from the plain overview question, not from the greeting.
const BRIEFING_CONTEXT = { da: 'hvad sker der i dag?', en: "what's happening today?", fi: 'mitä tänään tapahtuu?', sv: 'vad händer idag?' }
const NEAR_MISS_TEXT = {
  da: { intro: missing => `Jeg fandt ingen guide om ${missing.length ? `«${missing.join(' ')}»` : 'det'}. Nærmeste guides:`, next: 'Åbn en af dem i Guide-biblioteket, eller spørg en kollega om en guide til det, der mangler.' },
  en: { intro: missing => `I found no guide about ${missing.length ? `“${missing.join(' ')}”` : 'that'}. Closest guides:`, next: 'Open one of them in the Guide Library, or ask a colleague for a guide to the missing part.' },
  fi: { intro: missing => `En löytänyt opasta aiheesta ${missing.length ? `«${missing.join(' ')}»` : 'tämä'}. Lähimmät oppaat:`, next: 'Avaa jokin niistä opaskirjastossa tai pyydä kollegaa tekemään opas puuttuvasta aiheesta.' },
  sv: { intro: missing => `Jag hittade ingen guide om ${missing.length ? `«${missing.join(' ')}»` : 'det'}. Närmaste guider:`, next: 'Öppna någon av dem i Guidebiblioteket, eller be en kollega om en guide för det som saknas.' },
}
// "Hvilke guides findes der?" uden emne = katalog over de guides brugeren har adgang til.
const GUIDE_LIST = /^(?:hvilke|which|what)\s+(?:guides?|vejledninger)\s+(?:findes(?: der)?|er der|har vi|har jeg adgang til|are there|do we have|exist|can i (?:see|access))\s*\??$|^(?:vis|list|show)(?: mig| me)?\s+(?:alle\s+|all\s+|the\s+)?(?:guides|guiderne|vejledninger|vejledningerne)\s*\??$|^mitä oppaita (?:on|löytyy)(?: olemassa)?\s*\??$|^(?:mitkä oppaat (?:ovat|on) olemassa|mitkä oppaat löytyvät|mitkä oppaat minulla on)\s*\??$|^(?:näytä|listaa)(?: minulle)?\s+(?:kaikki\s+)?oppaat\s*\??$|^(?:mihin oppaisiin minulla on pääsy|mitä oppaita (?:voin nähdä|minulla on))\s*\??$|^vilka guider (?:finns(?: det)?|har vi|har jag tillgång till)\s*\??$|^(?:visa|lista)(?: mig)?\s+(?:alla\s+)?(?:guider|guiderna)\s*\??$/u
const GUIDE_LIST_TEXT = {
  da: { title: count => `Guides du har adgang til (${count})`, more: count => `… og ${count} flere.`, next: 'Spørg fx «find guiden om <emne>», så viser jeg de relevante trin.', none: 'Du har ikke adgang til nogen publicerede guides endnu.' },
  en: { title: count => `Guides you can access (${count})`, more: count => `… and ${count} more.`, next: 'Ask e.g. “find the guide about <topic>” and I will show the relevant steps.', none: 'You do not have access to any published guides yet.' },
  fi: { title: count => `Oppaat, joihin sinulla on pääsy (${count})`, more: count => `… ja ${count} muuta.`, next: 'Kysy esim. «etsi opas aiheesta <aihe>», niin näytän olennaiset vaiheet.', none: 'Sinulla ei ole vielä pääsyä julkaistuihin oppaisiin.' },
  sv: { title: count => `Guider du har tillgång till (${count})`, more: count => `… och ${count} till.`, next: 'Fråga t.ex. «hitta guiden om <ämne>», så visar jag de relevanta stegen.', none: 'Du har inte tillgång till några publicerade guider ännu.' },
}
// The same list question for the Knowledge Base: "which knowledge articles are there?".
const KB_LIST = /^(?:hvilke|which|what)\s+(?:vidensartikler|artikler|knowledge(?: base)?(?: articles)?|articles)\s+(?:findes(?: der)?|er der|har vi|har jeg adgang til|are there|do we have|exist|can i (?:see|access))\s*\??$|^(?:vis|list|show)(?: mig| me)?\s+(?:alle\s+|all\s+|the\s+)?(?:vidensartikler|vidensartiklerne|(?:knowledge(?: base)? )?articles)\s*\??$|^mitä (?:tietopankin )?artikkeleita (?:on|löytyy)(?: olemassa)?\s*\??$|^(?:näytä|listaa)(?: kaikki)? (?:tietopankin )?artikkelit\s*\??$|^vilka (?:kunskapsbas)?artiklar (?:finns(?: det)?|har vi)\s*\??$|^(?:visa|lista)(?: alla)? (?:kunskapsbas)?artiklar(?:na)?\s*\??$/iu
const KB_LIST_TEXT = {
  da: { title: count => `Vidensartikler du har adgang til (${count})`, more: count => `… og ${count} flere.`, next: 'Spørg fx «hvad betyder rejection reason 2:1?», så svarer jeg ud fra artiklerne.', none: 'Du har ikke adgang til nogen publicerede vidensartikler endnu.' },
  en: { title: count => `Knowledge Base articles you can access (${count})`, more: count => `… and ${count} more.`, next: 'Ask e.g. “what does rejection reason 2:1 mean?” and I will answer from the articles.', none: 'You do not have access to any published Knowledge Base articles yet.' },
  fi: { title: count => `Tietopankin artikkelit, joihin sinulla on pääsy (${count})`, more: count => `… ja ${count} muuta.`, next: 'Kysy esim. «mitä rejection reason 2:1 tarkoittaa?», niin vastaan artikkeleiden perusteella.', none: 'Sinulla ei ole vielä pääsyä julkaistuihin tietopankin artikkeleihin.' },
  sv: { title: count => `Kunskapsbasartiklar du har tillgång till (${count})`, more: count => `… och ${count} till.`, next: 'Fråga t.ex. «vad betyder rejection reason 2:1?», så svarar jag utifrån artiklarna.', none: 'Du har inte tillgång till några publicerade kunskapsbasartiklar ännu.' },
}
// Ikke en indholdsgraense - guides maa indeholde lige saa store billeder de vil.
// Det her er alene et vaern mod at hovedprocessen skal laese noget absurd stort
// ind i hukommelsen; billedet skaleres til 1024 px foer modellen ser det.
const MAX_STORED_IMAGE_BYTES = 48 * 1024 ** 2
const MAX_STORED_IMAGE_BASE64 = 64 * 1024 ** 2
const MAX_LEGACY_IMAGE_CHUNKS = 256
const normalize = value => String(value || '').trim().toLowerCase()
const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const addDays = (date, days) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy }
// Finnish case endings on a game name ("Chicken Invadersissa", "Route Runnerin").
const FI_CASE = '(?:i?ssa|i?ssä|i?sta|i?stä|i?lle|i?n|ia|iä)?'
const GAMES = [
  { name: 'Parcel Pilot', pattern: new RegExp(`\\bparcel[\\s-]*pilot${FI_CASE}\\b|\\bnexi[\\s-]*flyer${FI_CASE}\\b`), key: 'parcel-pilot-global-leaderboard', plays: 'nexi-flyer-play-counts' },
  { name: 'Route Runner', pattern: new RegExp(`\\broute[\\s-]*runner${FI_CASE}\\b|\\bneon[\\s-]*snake${FI_CASE}\\b`), key: 'route-runner-global-leaderboard', plays: 'neon-snake-play-counts' },
  { name: 'Prism Break', pattern: new RegExp(`\\bprism[\\s-]*break${FI_CASE}\\b|\\bbrick[\\s-]*break${FI_CASE}\\b`), key: 'brickbreak-v2-global-leaderboard', plays: 'brickbreak-play-counts' },
  { name: 'Chicken Invaders', pattern: new RegExp(`\\bchicken[\\s-]*invaders?${FI_CASE}\\b|\\bchicken[\\s-]*invasion${FI_CASE}\\b|\\bendless[\\s-]*dodger${FI_CASE}\\b`), key: 'chicken-invaders-global-leaderboard', plays: 'endless-dodger-play-counts' },
  { name: 'Cargo Stack', pattern: new RegExp(`\\bcargo[\\s-]*stack${FI_CASE}\\b|\\btetris${FI_CASE}\\b`), key: 'cargo-stack-global-leaderboard', plays: 'cargo-stack-play-counts' },
]
const SCORE_INTENT = /high\s*-?\s*score|leaderboard|top\s*score|top\s*\d{1,2}\b|topp\s*\d{1,2}\b|rekord|highest score|best score|ennäty|pistetilasto|topplista|bästa resultat|bedste score|bedste resultat|højeste score|højeste point|flest point|(?:hvor mange|how many|montako|kuinka monta|hur många)\s+(?:point|points|pistettä|poäng)|(?:min|mit|mine)\s+(?:score|point)|paras tulo|parhaat? pisteet|korkein pistem|korkeimm\S* pistem|tulokseni|pisteeni|bästa poäng|högsta poäng|mitt bästa|mina poäng|mina resultat/
// Own scores/plays, a top list, play counts and the things the scoreboard does not store (sector, boss, level).
const OWN_SCORE = /(?:^|[^\p{L}])(?:min|mit|mine|my|mina|mitt|minun)(?=$|[^\p{L}])|tulokseni|pisteeni|ennätykseni|(?:point har|poäng har)\s+(?:jeg|jag)(?=$|[^\p{L}])|points do i(?=$|[^\p{L}])|pistettä minulla(?=$|[^\p{L}])/u
const OWN_PLAY = /(?:^|[^\p{L}])(?:jeg|jag|i|olen|min|mit|mine|my|mina|mitt|minun)(?=$|[^\p{L}])/u
const TOP_N = /(?:top|topp|toppen)\s*(\d{1,2})\b|\b(\d{1,2})\s+(?:bedste|best|parasta|bästa)|\b(tre|three|kolme|fem|five|viisi|ti|ten|kymmenen)\s+(?:bedste|best|parasta|bästa)/u
const TOP_WORDS = { tre: 3, three: 3, kolme: 3, fem: 5, five: 5, viisi: 5, ti: 10, ten: 10, kymmenen: 10 }
const PLAYED = /gange|times|kertaa|gånger|(?:har|have|olen|har)\s+(?:jeg\s+|i\s+|jag\s+)?(?:spillet|played|pelannut|spelat)|spilantal|play counts?|pelikertoja/u
const NOT_STORED = /sektor|sector|\bboss|bosse|\blevel|bølge|\bwave|sektori|\btaso|tasolle|nivå|\bvåg/u
const DIFFICULTIES = { easy: ['easy', 'let', 'helppo', 'lätt'], medium: ['medium', 'mellem', 'keskitaso', 'medel'], hard: ['hard', 'svær', 'vaikea', 'svår'], expert: ['expert', 'ekspert', 'asiantuntija'] }
const wordPattern = value => new RegExp(`(?:^|[^\\p{L}\\p{N}])${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'iu')

// Only a short, explicit score selection inherits context. Never feed a whole
// transcript or previous answer/data into the model or use it as authorization.
function scoreQuestion(question, previousQuestion, teams) {
  if (SCORE_INTENT.test(question)) return question
  const games = GAMES.filter(game => game.pattern.test(question))
  if (games.length && /fører|flest point|flest points|førsteplads|leading|most points|leder|flest poäng|förstaplats/.test(question)) return `highscore ${question}`
  let remaining = question
  for (const game of GAMES) remaining = remaining.replace(game.pattern, ' ')
  const difficultyWords = Object.values(DIFFICULTIES).flat()
  const chosenDifficulty = difficultyWords.some(word => wordPattern(word).test(question))
  for (const word of difficultyWords) remaining = remaining.replace(wordPattern(word), ' ')
  const teamNames = teams.flatMap(team => [team.teamId, team.abbreviation]).filter(Boolean)
  const chosenTeam = teamNames.some(name => wordPattern(name).test(question))
  for (const name of teamNames) remaining = remaining.replace(wordPattern(name), ' ')
  for (const word of ['og', 'hvad', 'med', 'på', 'i', 'så', 'and', 'what', 'about', 'on', 'in', 'then', 'entä', 'ja', 'och', 'vad', 'om', 'då']) remaining = remaining.replace(wordPattern(word), ' ')
  remaining = remaining.replace(/[^\p{L}\p{N}]+/gu, '').trim()
  if (remaining || (!games.length && !chosenDifficulty && !chosenTeam)) return null
  const previous = normalize(previousQuestion)
  if (!SCORE_INTENT.test(previous)) return games.length ? `highscore ${question}` : null
  let inherited = previous
  if (games.length) for (const game of GAMES) inherited = inherited.replace(game.pattern, ' ')
  if (chosenDifficulty) for (const word of difficultyWords) inherited = inherited.replace(wordPattern(word), ' ')
  if (chosenTeam) for (const name of teamNames) inherited = inherited.replace(wordPattern(name), ' ')
  const combined = `${inherited} ${question}`.replace(/\s+/g, ' ').trim()
  if (combined.length > 1000) throw new Error('Opfølgningen er for lang. Stil highscore-spørgsmålet igen i én kort besked.')
  return combined
}
const EXTRA_TEXT = {
  da: { unsupported: 'Jeg kan ikke finde et underbygget svar på det spørgsmål endnu. Jeg kan slå opgaver, hjemmearbejde, godkendt ferie og highscores op eller forklare relevante guides. Prøv at præcisere, hvad du vil vide.', chooseGame: 'Hvilket spil mener du? Jeg kan slå highscores op i Parcel Pilot, Route Runner, Prism Break, Chicken Invaders og Cargo Stack.', scores: 'Highscores', noScore: 'Ingen registreret score', all: 'Samlet', categories: { easy: 'Let', medium: 'Mellem', hard: 'Svær', expert: 'Ekspert' }, yours: 'Dine highscores', played: (game, total) => `Du har spillet ${game} ${total} gange`, notPlayed: game => `Du har ikke spillet ${game} endnu.`, limits: 'Highscore-listen gemmer kun point pr. sværhedsgrad – ikke hvilken sektor eller boss du nåede.' },
  en: { unsupported: 'I cannot find a supported answer to that question yet. I can look up tasks, home office, approved vacation and highscores, or explain relevant guides. Please clarify what you want to know.', chooseGame: 'Which game? I can look up highscores in Parcel Pilot, Route Runner, Prism Break, Chicken Invaders and Cargo Stack.', scores: 'Highscores', noScore: 'No recorded score', all: 'Overall', categories: { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' }, yours: 'Your highscores', played: (game, total) => `You have played ${game} ${total} ${total === 1 ? 'time' : 'times'}`, notPlayed: game => `You have not played ${game} yet.`, limits: 'The highscore list only stores points per difficulty – not which sector or boss you reached.' },
  fi: { unsupported: 'En vielä löydä kysymykseen tietoihin perustuvaa vastausta. Voin hakea tehtäviä, etätyötä, hyväksyttyjä lomia ja pelien ennätyksiä tai selittää oppaita. Tarkenna, mitä haluat tietää.', chooseGame: 'Mitä peliä tarkoitat? Voin hakea ennätykset peleistä Parcel Pilot, Route Runner, Prism Break, Chicken Invaders ja Cargo Stack.', scores: 'Ennätykset', noScore: 'Ei kirjattua tulosta', all: 'Yhteensä', categories: { easy: 'Helppo', medium: 'Keskitaso', hard: 'Vaikea', expert: 'Asiantuntija' }, yours: 'Omat ennätyksesi', played: (game, total) => `Olet pelannut ${game} ${total} kertaa`, notPlayed: game => `Et ole vielä pelannut peliä ${game}.`, limits: 'Ennätyslista tallentaa vain pisteet vaikeustason mukaan – ei sitä, mille sektorille tai bossille pääsit.' },
  sv: { unsupported: 'Jag hittar inget underbyggt svar på den frågan ännu. Jag kan slå upp uppgifter, hemarbete, godkänd semester och highscores eller förklara relevanta guider. Försök precisera vad du vill veta.', chooseGame: 'Vilket spel menar du? Jag kan slå upp highscores i Parcel Pilot, Route Runner, Prism Break, Chicken Invaders och Cargo Stack.', scores: 'Highscores', noScore: 'Inget registrerat resultat', all: 'Totalt', categories: { easy: 'Lätt', medium: 'Medel', hard: 'Svår', expert: 'Expert' }, yours: 'Dina highscores', played: (game, total) => `Du har spelat ${game} ${total} gånger`, notPlayed: game => `Du har inte spelat ${game} ännu.`, limits: 'Highscore-listan sparar bara poäng per svårighetsgrad – inte vilken sektor eller boss du nådde.' },
}
// Asking for another team's data: a specific refusal in the asking language (names, roles and shift schedules are what crosses teams).
const NO_TEAM_ACCESS = {
  da: 'Jeg har ikke adgang til det teams oplysninger – jeg kan kun slå op i det team, du er logget ind i. Navne, roller og vagtplaner kan jeg dog vise på tværs af teams.',
  en: 'I have no access to that team’s data – I can only look things up in the team you are signed in to. I can show names, roles and shift schedules across teams, though.',
  fi: 'Minulla ei ole pääsyä sen tiimin tietoihin – voin hakea tietoja vain tiimistä, johon olet kirjautunut. Nimet, roolit ja työvuorolistat voin kuitenkin näyttää tiimien yli.',
  sv: 'Jag har ingen tillgång till det teamets uppgifter – jag kan bara slå upp i det team du är inloggad i. Namn, roller och scheman kan jag dock visa över teamgränserna.',
}
const TASK_TEXT = {
  da: { source: 'Vagtplan', named: 'Registrerede opgaver for', team: 'Registrerede teamopgaver', ambiguous: 'Hvilken person mener du? Vælg en af personerne nedenfor.', notFound: (subject, scope) => `Jeg kan ikke finde “${subject}” blandt de godkendte personer ${scope === 'any' ? 'i nogen teams' : 'i de valgte teams'}. Prøv personens fulde navn eller brugernavn.` },
  en: { source: 'Shift schedule', named: 'Recorded tasks for', team: 'Recorded team tasks', ambiguous: 'Which person do you mean? Choose one of the people below.', notFound: (subject, scope) => `I cannot find “${subject}” among approved people ${scope === 'any' ? 'in any team' : 'in the selected teams'}. Try their full name or username.` },
  fi: { source: 'Vaihtoaikataulu', named: 'Kirjatut tehtävät:', team: 'Tiimin kirjatut tehtävät', ambiguous: 'Ketä henkilöä tarkoitat? Valitse henkilö alta.', notFound: (subject, scope) => `Henkilöä ”${subject}” ei löydy ${scope === 'any' ? 'mistään tiimistä' : 'valittujen tiimien hyväksytyistä käyttäjistä'}. Kokeile koko nimeä tai käyttäjätunnusta.` },
  sv: { source: 'Schema', named: 'Registrerade uppgifter för', team: 'Teamets registrerade uppgifter', ambiguous: 'Vilken person menar du? Välj en av personerna nedan.', notFound: (subject, scope) => `Jag hittar inte ”${subject}” bland de godkända personerna ${scope === 'any' ? 'i något team' : 'i de valda teamen'}. Försök med personens fullständiga namn eller användarnamn.` },
}

// "Who has / who is on ...": a team-wide question when it names a shift role.
const WHO_HAS = /^(?:hvem|who|kuka|ketkä|ketka|vem)\s+(?:har|får|has|have|gets|is on|are on|on|ovat|er på|är på)\b/u
// Any who-question ("hvem er lead", "who is picking", "vem kör truck") counts as a shift question once it names one of the team's shift roles.
const WHO_ANY = /^(?:hvem|who|who's|kuka|ketkä|ketka|vem)\s/u

function resolveDates(question, now = new Date(), { holidays = true } = {}) {
  const q = normalize(question)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const explicit = q.match(/\b(\d{4}-\d{2}-\d{2})\b/) || q.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/)
  if (explicit) {
    const value = explicit.length === 2 ? explicit[1] : `${explicit[3]}-${explicit[2].padStart(2, '0')}-${explicit[1].padStart(2, '0')}`
    const parsed = new Date(`${value}T12:00:00`)
    if (Number.isNaN(parsed.getTime()) || dateString(parsed) !== value) return null
    return { start: value, end: value }
  }
  const written = calendarDate(q, now)
  if (written) return { start: written, end: written }
  const relative = relativeDates(q, now, { holidays })
  if (relative) return relative
  const extended = extraDates(q, now)
  if (extended.matched) return extended.range
  const weekdays = [['søndag', 'sunday', 'sunnuntai', 'söndag'], ['mandag', 'monday', 'maanantai', 'måndag'], ['tirsdag', 'tuesday', 'tiistai', 'tisdag'], ['onsdag', 'wednesday', 'keskiviikko'], ['torsdag', 'thursday', 'torstai'], ['fredag', 'friday', 'perjantai'], ['lørdag', 'saturday', 'lauantai', 'lördag']]
  const weekday = weekdays.findIndex(words => words.some(word => q.includes(word)))
  const nextWeek = /næste uge|next week|ensi viik|nästa vecka/.test(q)
  if (nextWeek || /denne uge|this week|tällä viik|denna vecka|den här veckan|i veckan/.test(q)) {
    const monday = addDays(today, -((today.getDay() + 6) % 7) + (nextWeek ? 7 : 0))
    const start = weekday < 0 ? monday : addDays(monday, (weekday + 6) % 7)
    return { start: dateString(start), end: dateString(weekday < 0 ? addDays(monday, 6) : start) }
  }
  if (/overmorgen|day after tomorrow|ylihuomenna|övermorgon/.test(q)) {
    const day = dateString(addDays(today, 2)); return { start: day, end: day }
  }
  if (/i morgen|imorgen|tomorrow|huomenna|i morgon|imorgon/.test(q)) {
    const day = dateString(addDays(today, 1)); return { start: day, end: day }
  }
  if (/i går|igår|yesterday|eilen/.test(q)) {
    const day = dateString(addDays(today, -1)); return { start: day, end: day }
  }
  if (/i dag|idag|today|tänään/.test(q)) return { start: dateString(today), end: dateString(today) }
  if (weekday >= 0) {
    let distance = (weekday - today.getDay() + 7) % 7
    if (distance === 0 && /næste|next|ensi|nästa/.test(q)) distance = 7
    const day = dateString(addDays(today, distance)); return { start: day, end: day }
  }
  return null
}

const { guideAccessIds } = require('./guideGrants.cjs')
const { LIBRARIES, KINDS } = require('./libraryKeys.cjs')
// Every part must open with a question word, so "a and b" inside one phrase is never split.
const WH = '(?:hvad|hvem|hvor|hvornår|hvilke|hvilken|what|who|where|when|which|how|kuka|mitä|mikä|missä|milloin|vem|vad|var|när|vilka|vilken|hur)'
const COMPOUND_START = new RegExp(`^${WH}(?=[\\s'’])`, 'iu')
const COMPOUND_SPLIT = new RegExp(`\\s*(?:,|\\s(?:og|and|ja|och))\\s+(?=${WH}(?=[\\s'’]))`, 'iu')
const PERIOD_PHRASE = /(?:i dag|idag|i morgen|imorgen|i overmorgen|i går|igår|næste uge|denne uge|today|tomorrow|yesterday|next week|this week|tänään|huomenna|eilen|tällä viikolla|ensi viikolla|i morgon|imorgon|nästa vecka|denna vecka|\d{4}-\d{2}-\d{2}|(?:^|[^\p{L}])(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|monday|tuesday|wednesday|thursday|friday|saturday|sunday|maanantaina?|tiistaina?|keskiviikkona?|torstaina?|perjantaina?|lauantaina?|sunnuntaina?|måndag|tisdag|lördag|söndag)(?=$|[^\p{L}]))/iu
const periodOf = part => PERIOD_PHRASE.exec(part)?.[0]?.trim() || calendarDate(part)
// "Who is off, who is sick and what is for lunch tomorrow?" -> three questions; a part without a period shares the nearest one.
function splitCompound(question) {
  const text = typeof question === 'string' ? question.trim().replace(/\s*\?$/, '') : ''
  if (!COMPOUND_START.test(text)) return null
  const parts = text.split(COMPOUND_SPLIT).map(part => part.replace(/[,;\s]+$/, '').trim()).filter(Boolean)
  if (parts.length < 2 || parts.length > 4) return null
  const periods = parts.map(periodOf)
  return parts.map((part, index) => {
    if (periods[index]) return part
    const shared = periods.slice(0, index).reverse().find(Boolean) || periods.slice(index + 1).find(Boolean)
    return shared ? `${part} ${shared}` : part
  })
}
// "Which teams exist?": the creator sees every team, everybody else only their own. "Who is in the team?" lists names and roles.
const TEAM_LIST = /^(?:(?:hvilke|hvor mange)\s+(?:teams?|hold)\s+(?:findes|er der|har vi)|(?:which|what)\s+teams\s+(?:exist|are there|do we have)|how many teams|(?:mitkä|montako)\s+(?:tiimit|tiimää)\b|vilka\s+team\s+(?:finns|har vi)|hur många team)[^.]{0,30}$|^(?:vis|list|liste|show|visa|lista|näytä)\s+(?:alle\s+|all\s+|alla\s+|kaikki\s+)?(?:teams|team|tiimit)\s*\??$/iu
const TEAM_MEMBERS = /^(?:hvem er (?:der )?(?:i|på) (?:mit |vores |dit )?(?:team(?:et)?|holdet)|who(?:'s| is| are) (?:in|on) (?:my |our |the )?team|team members|ketkä ovat (?:tiimissä|tiimissäni)|kuka kuuluu tiimiin|vilka är (?:med i|i) (?:mitt |vårt )?teamet|vem är med i teamet|vilka ingår i teamet)\s*\??$/iu
const TEAM_MEMBERS_WORD = { da: 'medarbejdere', en: 'people', fi: 'työntekijät', sv: 'medarbetare' }
const TEAMS_TEXT = {
  da: { title: count => `Teams (${count})`, own: (code, name) => `Du er i team ${code}${name ? ` (${name})` : ''}. Andre teams' data viser jeg ikke.` },
  en: { title: count => `Teams (${count})`, own: (code, name) => `You are in team ${code}${name ? ` (${name})` : ''}. I do not show other teams' data.` },
  fi: { title: count => `Tiimit (${count})`, own: (code, name) => `Olet tiimissä ${code}${name ? ` (${name})` : ''}. En näytä muiden tiimien tietoja.` },
  sv: { title: count => `Team (${count})`, own: (code, name) => `Du är i team ${code}${name ? ` (${name})` : ''}. Jag visar inte andra teams data.` },
}
const TEXT = {
  da: { date: 'Hvilken dato eller uge mener du? Skriv fx “næste uge” eller “17. september”.', tasks: 'Dine registrerede opgaver', none: 'Ingen registrerede opgaver i perioden. Det betyder ikke nødvendigvis, at du har fri.', noneOther: 'Ingen registrerede opgaver i perioden. Det betyder ikke nødvendigvis, at personen har fri.', noneTeam: 'Ingen registrerede opgaver i perioden.', home: 'Registreret hjemmearbejde', noHome: 'Ingen registreret som hjemmearbejdende i perioden.', vacation: 'Godkendt ferie', parental: 'barsel', noVacation: 'Ingen godkendt ferie i perioden.', noHits: 'Jeg fandt ikke relevante afsnit i de guides, du har adgang til. Prøv guidens navn eller andre søgeord.', excerpts: 'Relevante guideafsnit', unknown: 'Opgave/rolle uden navn' },
  en: { date: 'Which date or week do you mean? Try “next week” or “17 September”.', tasks: 'Your recorded tasks', none: 'No recorded tasks in this period. This does not necessarily mean you have time off.', noneOther: 'No recorded tasks in this period. This does not necessarily mean the person has time off.', noneTeam: 'No recorded tasks in this period.', home: 'Recorded working from home', noHome: 'No one recorded as working from home in this period.', vacation: 'Approved vacation', parental: 'parental leave', noVacation: 'No approved vacation in this period.', noHits: 'No relevant sections found in the guides you can access. Try a guide title or other keywords.', excerpts: 'Relevant guide sections', unknown: 'Unnamed task/role' },
  fi: { date: 'Mitä päivää tai viikkoa tarkoitat? Kirjoita esimerkiksi “ensi viikolla” tai “17.9.”.', tasks: 'Kirjatut tehtäväsi', none: 'Ei kirjattuja tehtäviä ajanjaksolla. Tämä ei välttämättä tarkoita vapaata.', noneOther: 'Ei kirjattuja tehtäviä ajanjaksolla. Tämä ei välttämättä tarkoita, että henkilöllä on vapaata.', noneTeam: 'Ei kirjattuja tehtäviä ajanjaksolla.', home: 'Kirjattu etätyö', noHome: 'Ajanjaksolla ei ole kirjattua etätyötä.', vacation: 'Hyväksytty loma', parental: 'perhevapaa', noVacation: 'Ajanjaksolla ei ole hyväksyttyjä lomia.', noHits: 'Oppaista, joihin sinulla on pääsy, ei löytynyt osuvia kohtia. Kokeile oppaan nimeä tai muita hakusanoja.', excerpts: 'Oppaiden asiaankuuluvat kohdat', unknown: 'Nimetön tehtävä/rooli' },
  sv: { date: 'Vilket datum eller vilken vecka menar du? Skriv t.ex. ”nästa vecka” eller ”17 september”.', tasks: 'Dina registrerade uppgifter', none: 'Inga registrerade uppgifter under perioden. Det betyder inte nödvändigtvis att du är ledig.', noneOther: 'Inga registrerade uppgifter under perioden. Det betyder inte nödvändigtvis att personen är ledig.', noneTeam: 'Inga registrerade uppgifter under perioden.', home: 'Registrerat hemarbete', noHome: 'Ingen registrerad med hemarbete under perioden.', vacation: 'Godkänd semester', parental: 'föräldraledighet', noVacation: 'Ingen godkänd semester under perioden.', noHits: 'Jag hittade inga relevanta avsnitt i de guider du har tillgång till. Försök med guidens namn eller andra sökord.', excerpts: 'Relevanta guideavsnitt', unknown: 'Uppgift/roll utan namn' },
}

// Public people directory shown by the Team Overview module to every signed-in
// user: name + role only. This is the ONLY cross-team data the assistant reveals.
const DIRECTORY_TEXT = {
  da: { people: 'Personer', manager: 'Leder', user: 'Medarbejder', none: 'Ingen registrerede personer' },
  en: { people: 'People', manager: 'Manager', user: 'Member', none: 'No registered people' },
  fi: { people: 'Henkilöt', manager: 'Esihenkilö', user: 'Jäsen', none: 'Ei rekisteröityjä henkilöitä' },
  sv: { people: 'Personer', manager: 'Chef', user: 'Medarbetare', none: 'Inga registrerade personer' },
}

// Sprogmarkoerer til at gaette spoergsmaalets sprog, saa svaret gives paa samme
// sprog som spoergsmaalet (uafhaengigt af app-sproget). Dansk/engelsk matches som
// hele ord; finsk matches paa ordstammer pga. kraftig boejning.
const LANGUAGE_MARKERS = {
  da: ['hvem', 'hvad', 'hvornår', 'hvor', 'hvilken', 'hvilke', 'ferie', 'fri', 'syg', 'sygemeldt', 'vagt', 'vagter', 'opgave', 'opgaver', 'hjemme', 'hjemmearbejde', 'næste', 'uge', 'ugen', 'min', 'mine', 'idag', 'imorgen', 'arbejder', 'sidder', 'ansatte', 'medarbejder', 'medarbejdere', 'kollega', 'fødselsdag', 'vejledning'],
  en: ['who', 'what', 'when', 'where', 'which', 'vacation', 'holiday', 'sick', 'shift', 'shifts', 'task', 'tasks', 'home', 'from', 'working', 'works', 'work', 'next', 'week', 'today', 'tomorrow', 'people', 'staff', 'employee', 'employees', 'colleague', 'birthday', 'does', 'the', 'are', 'how', 'why', 'can', 'my', 'you', 'with', 'this', 'that', 'images', 'missing'],
  fi: ['kuka', 'ketk', 'mitä', 'milloin', 'missä', 'loma', 'saira', 'vuoro', 'tehtäv', 'etätö', 'etäty', 'ensi', 'viiko', 'viikk', 'tänään', 'huomenna', 'työnteki', 'henkil', 'syntym', 'opas', 'oppa', 'onko', 'ovatko', 'minun', 'tehdä'],
  // Only words that are not also Danish, so Danish questions are never read as Swedish.
  sv: ['vem', 'vad', 'när', 'vilken', 'vilka', 'vilket', 'hur', 'många', 'är', 'och', 'jag', 'inte', 'några', 'något', 'nytt', 'ska', 'semester', 'ledigt', 'sjuk', 'sjukskriven', 'pass', 'schema', 'schemat', 'uppgift', 'uppgifter', 'hemma', 'hemifrån', 'hemarbete', 'nästa', 'vecka', 'veckan', 'jobbar', 'jobbet', 'arbetar', 'anställda', 'medarbetare', 'kollegor', 'födelsedag', 'tillbaka', 'händer', 'gör', 'äta', 'äter', 'måndag', 'tisdag', 'lördag', 'söndag', 'hittar', 'finns', 'guider', 'meddelanden', 'olästa', 'översikt', 'spel', 'visa', 'mitt', 'lösenord', 'radera', 'användare', 'ignorera', 'vädret', 'tack', 'mycket', 'hejdå', 'morgon', 'imorgon', 'hjälpa', 'krockar', 'lista', 'allas', 'alla', 'ovanstående', 'dumpa', 'följ', 'kontaktuppgifter', 'behörighet', 'anteckningar', 'anteckningen', 'hennes', 'deras', 'sätt', 'roll', 'till', 'ändra'],
}

// Returnerer 'da' | 'en' | 'fi' | 'sv' hvis et sprog klart dominerer i spoergsmaalet, ellers null.
function detectQuestionLanguage(question) {
  const words = normalize(question).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (!words.length) return null
  const wordSet = new Set(words)
  const scores = {
    da: LANGUAGE_MARKERS.da.reduce((total, marker) => total + (wordSet.has(marker) ? 1 : 0), 0),
    en: LANGUAGE_MARKERS.en.reduce((total, marker) => total + (wordSet.has(marker) ? 1 : 0), 0),
    fi: LANGUAGE_MARKERS.fi.reduce((total, marker) => total + (words.some(word => word.includes(marker)) ? 1 : 0), 0),
    sv: LANGUAGE_MARKERS.sv.reduce((total, marker) => total + (wordSet.has(marker) ? 1 : 0), 0),
  }
  const best = ['da', 'en', 'fi', 'sv'].reduce((winner, lang) => (scores[lang] > scores[winner] ? lang : winner), 'da')
  if (scores[best] === 0) return null
  if (['da', 'en', 'fi', 'sv'].some(lang => lang !== best && scores[lang] >= scores[best])) return null
  return best
}

function createAssistantContext({ listTeams, lookupTeam, managerTeams = () => [], creatorEmail, readTeam, readShared, currentFolder, getDiagnostics }) {  const knowledge = createKnowledge({ readTeam, readShared, creatorEmail, resolveDates, getDiagnostics, getGuides: guidesFor })
  function authorize(token) {
    const sessions = readShared('active-sessions')
    const session = token && (sessions?.[require('./authService.cjs').sessionKey(token)] || sessions?.[token])
    if (!token || !session || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) throw new Error('Log ind igen før du bruger chatbotten')
    const email = normalize(session.email)
    const home = lookupTeam(email)
    if (!home) throw new Error('Brugerens team kunne ikke bekræftes')
    const users = readTeam(home, 'users') || {}
    const user = Object.entries(users).find(([key, value]) => normalize(value?.email || key) === email)?.[1]
    if (!user || (user.status && user.status !== 'approved')) throw new Error('Brugerkontoen er ikke godkendt')
    const current = listTeams().find(team => team.folderName === currentFolder())
    const creator = email === normalize(creatorEmail())
    const extra = !creator && !!current && current.teamId !== home.teamId && managerTeams(email).some(team => team.teamId === current.teamId)
    if (!current || (current.teamId !== home.teamId && !creator && !extra)) throw new Error('Ingen adgang til det aktive team')
    const teams = [current]
    const role = creator ? 'creator' : extra || user.role === 'manager' || user.role === 'admin' || (!user.role && user.isManager) ? 'manager' : 'user'
    return { email, name: String(user.fullName || email), teams, role }
  }

  // Guides and Knowledge Base articles share one shape and one permission model; each library has its own keys and grants.
  function guidesFor(principal, { ownOnly = false, library } = {}) {
    const guides = []
    for (const kind of library ? KINDS.filter(value => value === library) : KINDS) {
      const keys = LIBRARIES[kind]
      for (const team of principal.teams) {
        for (const guide of readTeam(team, keys.items) || []) guides.push({ guide, team, library: kind })
        for (const guide of readShared(keys.shared) || []) {
          if (guide.sharedWithTeamCodes?.includes(team.folderName)) guides.push({ guide, team, library: kind, shared: true })
        }
      }
      if (!ownOnly) for (const team of listTeams().filter(team => !principal.teams.some(allowed => allowed.teamId === team.teamId))) {
        const home = lookupTeam(principal.email)
        const grants = guideAccessIds(readTeam(team, keys.requests), principal.email, home?.folderName)
        if (!grants.size) continue
        for (const guide of readTeam(team, keys.items) || []) if (grants.has(guide.id)) guides.push({ guide, team, library: kind })
      }
    }
    return guides
  }

  function getGuide(token, teamId, guideId, library = 'guides') {
    const principal = authorize(token)
    const found = KINDS.includes(library) && guidesFor(principal, { library }).find(value => value.team.teamId === teamId && value.guide.id === guideId)
    if (!found) throw new Error('Du har ikke adgang til denne guide')
    return found
  }

  function getImage(token, teamId, guideId, imageId, library = 'guides') {
    const found = getGuide(token, teamId, guideId, library)
    const imageIds = [found.guide.coverImageId, ...(found.guide.sections || []).flatMap(section => (section.steps || []).flatMap(step => step.imageIds || []))]
    const document = [found.guide.fileUrl, found.guide.previewPdfUrl, found.guide.originalPdfUrl].includes(`kv://${imageId}`)
    if ((!imageIds.includes(imageId) && !document) || !/^file_[a-zA-Z0-9_-]+$/.test(imageId)) throw new Error('Billedet er ikke del af en tilgængelig guide')
    const stores = [key => readTeam(found.team, key), readShared]
    // A shared guide's images stay in the store of the team that uploaded them.
    if (found.shared) for (const team of listTeams()) {
      if (team.teamId !== found.team.teamId && found.guide.sharedWithTeamCodes.includes(team.folderName)) stores.push(key => readTeam(team, key))
    }
    for (const read of stores) {
      const meta = read(`${imageId}_meta`)
      if (!meta) continue
      const validType = document ? ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(meta.contentType) : /^image\/(png|jpeg|webp|gif|bmp)$/.test(meta.contentType)
      if (meta.size > MAX_STORED_IMAGE_BYTES || !validType) throw new Error('Ugyldigt eller for stort guidebillede')
      let base64
      if (typeof meta.data === 'string') {
        base64 = meta.data
      } else {
        if (!Number.isInteger(meta.chunkCount) || meta.chunkCount < 1 || meta.chunkCount > MAX_LEGACY_IMAGE_CHUNKS) throw new Error('Ugyldigt eller for stort guidebillede')
        const chunks = Array.from({ length: meta.chunkCount }, (_, i) => read(`${imageId}_chunk_${i}`))
        if (chunks.some(value => typeof value !== 'string')) throw new Error('Guidebilledet mangler data')
        base64 = chunks.join('')
      }
      if (base64.length > MAX_STORED_IMAGE_BASE64 || !/^[a-zA-Z0-9+/=]*$/.test(base64)) throw new Error('Guidebilledet er ugyldigt eller for stort')
      return `data:${meta.contentType};base64,${base64}`
    }
    throw new Error('Guidebilledet kunne ikke læses')
  }

  // Word-only guides are indexed from their stored .docx, so new uploads are searchable at once.
  // Every upload gets a new file id, so the extracted text can be cached per id across guide edits.
  const wordTexts = new Map()
  const wordFailures = new WeakMap()
  function wordParagraphs(team, guide) {
    if (guide.sections?.length || !guide.preserveWordLayout || !/^kv:\/\/file_[\w-]+$/.test(String(guide.fileUrl || ''))) return undefined
    const cacheKey = `${team.folderName}:${guide.fileUrl}`
    if (wordTexts.has(cacheKey)) return wordTexts.get(cacheKey)
    if (wordFailures.has(guide)) return undefined
    const fileId = guide.fileUrl.slice(5)
    let paragraphs
    for (const read of [key => readTeam(team, key), readShared]) {
      try {
        const meta = read(`${fileId}_meta`)
        if (!meta || typeof meta !== 'object') continue
        let base64 = typeof meta.data === 'string' ? meta.data : null
        if (!base64 && Number.isInteger(meta.chunkCount) && meta.chunkCount > 0 && meta.chunkCount <= MAX_LEGACY_IMAGE_CHUNKS) {
          const chunks = Array.from({ length: meta.chunkCount }, (_, i) => read(`${fileId}_chunk_${i}`))
          if (chunks.every(value => typeof value === 'string')) base64 = chunks.join('')
        }
        if (base64 && base64.length <= MAX_STORED_IMAGE_BASE64) paragraphs = docxParagraphs(Buffer.from(base64, 'base64'))
      } catch { /* unreadable document: the title stays searchable */ }
      break
    }
    if (!paragraphs?.length) { wordFailures.set(guide, true); return undefined }
    if (wordTexts.size >= 500) wordTexts.delete(wordTexts.keys().next().value)
    wordTexts.set(cacheKey, paragraphs)
    return paragraphs
  }

  function guideSearch(principal, teams, question, plan, options) {
    const entries = guidesFor({ ...principal, teams }, options).map(({ guide, team, library }) => ({ guide, team, library, paragraphs: wordParagraphs(team, guide) }))
    return searchGuides(entries, plan?.terms?.length ? '' : question, { terms: plan?.terms || [], isAppWord })
  }
  // When a hub module word also appears ("credit note" vs. notebook), only a near-complete guide title match wins.
  function moduleSafeGuide(principal, teams, question) {
    const result = guideSearch(principal, teams, question, undefined, { ownOnly: true })
    const top = result.hits[0]
    return top?.strong && top.coverage >= 0.75 ? result : null
  }
  // Keywords like "link 2500" or "sap password skift": the guide is unmistakable, not a command or a module search.
  function confidentGuide(result, minimum, titleMinimum = 1) {
    const top = result.hits[0]
    return top && top.coverage >= minimum && top.titleCount >= titleMinimum && top.nonApp && (result.tokens.filter(token => !token.soft).length >= 2 || result.tokens.some(token => token.code)) ? result : null
  }

  const IMAGE_ONLY = { da: '(se billedet i guiden)', en: '(see the picture in the guide)', fi: '(katso kuva oppaasta)', sv: '(se bilden i guiden)' }
  function guideAnswer(result, question, language) {
    const t = TEXT[language] || TEXT.da
    const sources = result.hits.map((hit, rank) => {
      const chunk = hit.step.chunk
      const document = !hit.entry.guide.sections?.length && hit.entry.paragraphs?.length > 0
      const lines = hit.section.steps.slice(0, 30).map((step, index) => {
        const text = step.chunk.stepText.trim().slice(0, 600)
        if (document) return text
        return `${index + 1}. ${text || (step.chunk.imageIds.length ? IMAGE_ONLY[language] || IMAGE_ONLY.da : '')}`.trim()
      }).filter(line => line && !/^\d+\.$/.test(line))
      const imageIds = chunk.imageIds.length ? chunk.imageIds : hit.section.steps.flatMap(step => step.chunk.imageIds).slice(0, 1)
      // The local model has a 4096-token window: the best guide keeps its procedure, others are short context.
      return { kind: 'guide', ...(hit.entry.library === 'knowledge' ? { library: 'knowledge' } : {}), teamId: hit.entry.team.teamId, guideId: hit.entry.guide.id, title: chunk.title, version: chunk.version, revision: chunk.revision, heading: hit.section.heading, reference: chunk.reference, imageIds, text: lines.join('\n').slice(0, rank === 0 ? 3500 : 1000) }
    })
    const text = defangEvidence(sources.map((source, index) => `[${index + 1}] ${source.title} · v${source.version} · §${source.reference}\n${source.heading ? `${source.heading}\n` : ''}${source.text}`).join('\n\n'))
    return { mode: 'retrieval', text: `${t.excerpts}:\n\n${text}`, sources, contextQuestion: question }
  }

  // Name + role only, for the named teams. Mirrors the Team Overview directory
  // that every signed-in user can already open; no contact, passwords, tasks,
  // absence or notes from another team are ever read here.
  function crossTeamDirectory(teamsToList, language) {
    const labels = DIRECTORY_TEXT[language] || DIRECTORY_TEXT.da
    const creator = normalize(creatorEmail())
    const isManager = user => user.role === 'manager' || user.role === 'admin' || (!user.role && user.isManager === true)
    const sources = []
    const sections = []
    for (const team of teamsToList) {
      const label = team.abbreviation || team.teamId
      const users = readTeam(team, 'users') || {}
      const people = Object.entries(users)
        .filter(([key, user]) => user && typeof user === 'object' && (!user.status || user.status === 'approved') && normalize(user.email || key) !== creator && user.role !== 'creator')
        .map(([key, user]) => ({ name: String(user.fullName || user.name || user.email || key).trim().slice(0, 150), manager: isManager(user) }))
        .sort((a, b) => a.name.localeCompare(b.name))
      sources.push({ kind: 'directory', teamId: team.teamId, title: `${label} · ${labels.people}` })
      sections.push(`${label} · ${labels.people}:\n${people.length ? people.map(person => `• ${person.name} — ${person.manager ? labels.manager : labels.user}`).join('\n') : labels.none}`)
    }
    return { mode: 'data', text: sections.join('\n\n'), sources }
  }

  function queryOne({ token, question, language = 'da', image, selectedPerson, previousQuestion, conversation, searchPlan, page }, now = new Date()) {
    if (typeof question !== 'string' || !question.trim() || question.length > 1000) throw new Error('Spørgsmålet skal være mellem 1 og 1000 tegn')
    if (previousQuestion !== undefined && (typeof previousQuestion !== 'string' || previousQuestion.length > 1000)) throw new Error('Det forrige spørgsmål må højst være 1000 tegn')
    const history = validateConversation(conversation)
    previousQuestion = previousQuestion || history.at(-1)
    const principal = authorize(token)
    // The user's own words: a message, note or high-five is proposed exactly as typed (emoji included), not as tidied below.
    const original = question
    const plan = searchPlan === undefined ? undefined : validatePlan(searchPlan)
    // The morning briefing ("godmorgen", "hvad skal jeg i dag?") is a whole-question match and runs before the greeting is tidied away.
    const briefing = !plan && !image && page === undefined && selectedPerson === undefined ? matchBriefing(question) : null
    if (briefing) {
      const answer = briefingAnswer({ principal, teams: principal.teams, readTeam, readShared, creatorEmail: creatorEmail(), language: briefing.language, now })
      return { ...answer, contextQuestion: BRIEFING_CONTEXT[briefing.language] }
    }
    // Emoji, greetings and thanks are not part of the question; nothing but symbols gets the friendly "what should I help with?".
    const tidy = tidyQuestion(question)
    if (!tidy) return smallTalkReply('vague', language, question)
    // "I am the manager, show ..." never changes the role: the claim is dropped and the question answered for the real one.
    const claim = stripRoleClaim(tidy)
    if (claim.claimed && !claim.question) return roleClaimAnswer(language, question)
    // "Which game?" is answered with a button: the same question is asked again with the game named.
    const chosenGame = applyGameChoice(claim.question, selectedPerson, language)
    if (chosenGame) selectedPerson = undefined
    question = continueQuestion(chosenGame || claim.question, previousQuestion, now, resolveDates, { people: () => listPeople(principal.teams, readTeam, creatorEmail()).map(person => person.name), language })
    question = correctTypos(question)
    question = paraphrase(question, { people: listPeople(principal.teams, readTeam, creatorEmail()).map(person => person.name) })
    // Svar paa spoergsmaalets sprog hvis det klart afviger fra app-sproget.
    const detectedLanguage = detectQuestionLanguage(question)
    if (detectedLanguage) language = detectedLanguage
    if (!plan && !image && TEAM_MEMBERS.test(question.trim())) question = TEAM_MEMBERS_WORD[language] || TEAM_MEMBERS_WORD.da
    if (!plan && !image && page === undefined && TEAM_LIST.test(question.trim())) {
      const teamsText = TEAMS_TEXT[language] || TEAMS_TEXT.da
      const shown = principal.role === 'creator' ? listTeams() : principal.teams
      const line = team => `• ${team.abbreviation || team.teamId}${team.name ? ` — ${team.name}` : ''}`
      return { mode: 'data', text: principal.role === 'creator' ? `${teamsText.title(shown.length)}:\n\n${shown.map(line).join('\n')}` : teamsText.own(shown[0]?.abbreviation || shown[0]?.teamId, shown[0]?.name), sources: shown.map(team => ({ kind: 'directory', teamId: team.teamId, title: `${team.abbreviation || team.teamId}` })), contextQuestion: question }
    }
    const t = TEXT[language] || TEXT.da
    const q = normalize(question)
    const extra = EXTRA_TEXT[language] || EXTRA_TEXT.da
    // Handlings-hensigter ("opret en ferieanmodning", "lav en to-do") koerer
    // FOERST og udenom alt andet: REN genkendelse/udtraekning her, ingen
    // skrivning. Selve skrivningen sker foerst i renderer'en efter eksplicit
    // brugerbekraeftelse, via de samme delte funktioner som de manuelle
    // formularer bruger (se src/components/HubAssistant.tsx).
    if (!plan && !image) {
      const people = listPeople(principal.teams, readTeam, creatorEmail())
      // "how do I request vacation?" asks for an explanation, not for Hubert to act.
      const explainOnly = /^(?:hvordan|hvorledes|how (?:do|can|to)|miten|kuinka|hur)\b/i.test(q) && !/\d/.test(q)
      const action = explainOnly ? null : detectActionIntent(question, language, previousQuestion, { now, resolveDates: (text, date) => resolveDates(text, date, { holidays: false }), original, people, allPeople: () => listPeople(listTeams(), readTeam, creatorEmail()), self: principal.email })
      const guarded = guardAnswer(question, language, { people: people.map(person => person.name), self: principal.name })
      // A message, note or high-five the user confirms is the one write the "I only read" guard lets through; every other guard still wins.
      const teamWrite = action && (TEAM_ACTION_TYPES.has(action.type) || action.team) && onlySendOrWrite(question)
      if (guarded && !(guarded.guard === 'destructive' && teamWrite)) {
        const lookup = ['destructive', 'credentials'].includes(guarded.guard) && confidentGuide(guideSearch(principal, principal.teams, question, undefined, { ownOnly: true }), 0.6, 2)
        return lookup ? guideAnswer(lookup, question, language) : guarded
      }
      if (action?.type === 'unresolved') return { mode: 'action-proposal', text: action.message, sources: [], contextQuestion: action.context || question }
      if (action) return { mode: 'action-proposal', text: action.summary, sources: [], contextQuestion: question, actionProposal: { type: action.type, params: action.params, summary: action.summary } }
      if (page === undefined) {
        const small = smallTalkAnswer(question, language, previousQuestion)
        if (small) return small
        // "Do it" after something that was no how-to question has nothing to refer to.
        const vague = previousQuestion ? smallTalkAnswer(question, language) : null
        if (vague?.smallTalk === 'vague') return vague
      }
    }
    // "Hvordan goer jeg X?" skal besvares med en vejledning, ikke med en liste af
    // registreringer. Uden det her rammer fx "hvordan opretter jeg en
    // ferieanmodning?" ferie-dataopslaget og svarer med ferieREGISTRERINGER.
    // Kun naar en konkret OPGAVE rammes - et loest modul-traef (fx "hvordan ser
    // min uge ud?") skal fortsat gaa til dataopslaget nedenfor.
    // Own Multiplayer games and results come from the shared index, never from game files; arcade scores keep their own route below.
    if (!plan && !image && page === undefined && !isHowToQuestion(question) && !SCORE_INTENT.test(q) && !GAMES.some(game => game.pattern.test(q))) {
      const mine = multiplayerAnswer({ question, language, principal, readIndex: () => readShared('multiplayer-index'), people: listPeople(principal.teams, readTeam, creatorEmail()) })
      if (mine) return mine
    }
    const described = !plan && !image && page === undefined ? describeAppTerm(question, { role: principal.role, language }) : null
    if (described) return { mode: 'app-guide', text: described.text, sources: [{ kind: 'app-guide', title: described.title }], contextQuestion: question }
    if (!plan && !image && page === undefined && isHowToQuestion(question)) {
      // A guide about a named product/system ("PUUILO", "SAP") beats the app's own how-to.
      const guided = knowledge.matchedModules(question).length ? moduleSafeGuide(principal, principal.teams, question) : guideSearch(principal, principal.teams, question)
      if (guided?.hits[0]?.strong) return guideAnswer(guided, question, language)
      const guidance = appGuidance(question, { role: principal.role, requireTask: true, language })
      if (guidance) return { mode: 'app-guide', text: guidance.text, sources: [{ kind: 'app-guide', title: guidance.title }], contextQuestion: question }
    }
    // Chess, "Dine opgør", the blue dot ...: asked plainly ("is there a clock in chess?"), these still get their task.
    if (!plan && !image && page === undefined) {
      const direct = appGuidance(question, { role: principal.role, language, directOnly: true })
      if (direct) return { mode: 'app-guide', text: direct.text, sources: [{ kind: 'app-guide', title: direct.title }], contextQuestion: question }
    }
    const gameAsked = GAMES.find(game => game.pattern.test(q))
    // "How many times have I played X?" comes from the play counters, which are per user and team.
    if (gameAsked && PLAYED.test(q) && OWN_PLAY.test(q) && !SCORE_INTENT.test(q)) {
      const totals = {}
      for (const team of principal.teams) {
        const values = readTeam(team, gameAsked.plays)?.[principal.email]
        if (values && typeof values === 'object') for (const key of Object.keys(DIFFICULTIES)) if (Number.isInteger(values[key]) && values[key] > 0) totals[key] = (totals[key] || 0) + values[key]
      }
      const sum = Object.values(totals).reduce((total, count) => total + count, 0)
      return { mode: 'data', text: sum ? `${extra.played(gameAsked.name, sum)} (${Object.entries(totals).map(([key, count]) => `${extra.categories[key]}: ${count}`).join(' · ')}).` : extra.notPlayed(gameAsked.name), sources: principal.teams.map(team => ({ kind: 'highscores', teamId: team.teamId, title: `${team.abbreviation || team.teamId} · ${gameAsked.name}` })), contextQuestion: question }
    }
    // Sector, boss or level are not stored: say so, then show what is (the asker's own best scores).
    const notStored = !!gameAsked && NOT_STORED.test(q)
    const scoreQ = scoreQuestion(q, previousQuestion, listTeams()) || (plan?.modules.includes('highscores') ? `highscore oversigt ${q}` : null) || (notStored ? `highscore ${q}` : null)
    if (scoreQ) {
      let games = GAMES.filter(game => game.pattern.test(scoreQ))
      const overview = /oversigt|overblik|alle spil|samlet|overview|all games|summary|yhteenveto|kaikkien pelien|översikt|alla spel|sammanfattning/.test(scoreQ)
      if (!games.length && overview) games = GAMES
      if (!games.length) return { mode: 'data', text: extra.chooseGame, sources: [], scoreContext: scoreQ }
      // Game scoreboards are already public to authenticated users. The Creator
      // restriction is for administering scores, not seeing the in-game rankings.
      let scoreTeams = listTeams()
      const explicitlyNamed = listTeams().filter(team => [team.teamId, team.abbreviation].filter(Boolean).some(name => wordPattern(name).test(scoreQ)))
      if (explicitlyNamed.some(team => !scoreTeams.some(allowed => allowed.teamId === team.teamId))) throw new Error(NO_TEAM_ACCESS[language] || NO_TEAM_ACCESS.da)
      if (explicitlyNamed.length) scoreTeams = explicitlyNamed
      const words = new Set(scoreQ.split(/[^\p{L}\p{N}]+/u))
      const requested = Object.keys(DIFFICULTIES).filter(key => DIFFICULTIES[key].some(word => words.has(word)))
      const sources = []
      const sections = []
      const own = notStored || OWN_SCORE.test(scoreQ)
      const topMatch = TOP_N.exec(scoreQ)
      const topCount = topMatch ? Math.min(10, Math.max(2, Number(topMatch[1] || topMatch[2] || TOP_WORDS[topMatch[3]]))) : 0
      for (const game of games) {
        const categories = game.flat ? ['all'] : requested.length ? requested : Object.keys(DIFFICULTIES)
        const entries = Object.fromEntries(categories.map(category => [category, []]))
        for (const team of scoreTeams) {
          const board = readTeam(team, game.key)
          const users = readTeam(team, 'users') || {}
          for (const category of categories) {
            const scores = game.flat ? board : board?.[category]
            if (!Array.isArray(scores)) continue
            for (const score of scores) {
              if (!score || typeof score.email !== 'string' || !score.email || !Number.isFinite(score.score) || score.score < 0) continue
              const email = normalize(score.email)
              const user = Object.entries(users).find(([key, value]) => normalize(value?.email || key) === email)?.[1]
              entries[category].push({ email, name: String(user?.fullName || email.split('@')[0]), score: score.score, team: team.abbreviation || team.teamId })
            }
          }
          sources.push({ kind: 'highscores', teamId: team.teamId, title: `${team.abbreviation || team.teamId} · ${game.name}` })
        }
        const labelOf = category => category === 'all' ? extra.all : extra.categories[category]
        let lines
        if (own) {
          // Own best per difficulty; difficulties without a score are only mentioned when asked for by name.
          lines = categories.flatMap(category => {
            const mine = entries[category].filter(score => score.email === principal.email)
            return mine.length ? [`• ${labelOf(category)}: ${Math.max(...mine.map(score => score.score))}`] : requested.length ? [`• ${labelOf(category)}: ${extra.noScore}`] : []
          })
          if (!lines.length) lines = [`• ${extra.noScore}`]
        } else if (topCount) {
          lines = categories.map(category => {
            const best = new Map()
            for (const score of entries[category]) if (!best.has(score.email) || best.get(score.email).score < score.score) best.set(score.email, score)
            const ranked = [...best.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, topCount)
            return ranked.length ? `${labelOf(category)}:\n${ranked.map((score, index) => `${index + 1}. ${score.name} (${score.team}) — ${score.score}`).join('\n')}` : `• ${labelOf(category)}: ${extra.noScore}`
          })
        } else {
          lines = categories.map(category => {
            const scores = entries[category]
            if (!scores.length) return `• ${labelOf(category)}: ${extra.noScore}`
            const maximum = Math.max(...scores.map(score => score.score))
            const winners = [...new Set(scores.filter(score => score.score === maximum).map(score => `${score.name} (${score.team})`))].sort()
            return `• ${labelOf(category)}: ${winners.join(', ')} — ${maximum}`
          })
        }
        sections.push(`${notStored ? `${extra.limits}\n\n` : ''}${own ? extra.yours : extra.scores} · ${game.name}:\n\n${lines.join(topCount && !own ? '\n\n' : '\n')}`)
      }
      return { mode: 'data', text: sections.join('\n\n'), sources, scoreContext: scoreQ }
    }
    const homeQuery = /hjemme|hjemmearbejde|home office|from home|etäty|etätö|etänä|hemma|hemifrån|hemarbete|distansarbete/.test(q) || plan?.modules.includes('homeOffice')
    const namedTeams = listTeams().filter(team => [team.teamId, team.abbreviation, team.name].filter(Boolean).some(name => new RegExp(`(?:^|[^\\p{L}\\p{N}])${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(q)))
    const vacationQuery = (/ferie|vacation|holiday|loma|semester/.test(q) || plan?.modules.includes('vacation')) && !/guide|vejledning|manual|opas|oppaa|anmodning|afventer|pending|request|ansök|väntar|ventende|afventende|väntande|odottav|pyynn|hakemu/.test(q)
    let taskQuery = !homeQuery && (isTaskQuestion(q) || plan?.modules.includes('shifts'))
    const roleTeams = namedTeams.length ? namedTeams : principal.teams
    const namesRole = () => roleTeams.some(team => rolesNamedIn(question, readTeam(team, 'shift-roles') || []).length > 0)
    // "Hvem har lukkevagt?" names a shift role instead of saying "vagt" ("stängningspasset"): the team's own role names make it a shift question.
    if (!taskQuery && !homeQuery && !vacationQuery && !plan && WHO_ANY.test(q)) taskQuery = namesRole()
    // "Hvem er lead i dag?" asks who in the team has that role, not about the asker's own plan.
    const whoHasRole = taskQuery && WHO_ANY.test(q) && namesRole()
    let teams = principal.teams
    // Set when a shift question is answered from teams other than the asker's own.
    let crossTeam = false
    // Hjemmearbejde-OVERSIGTEN er allerede synlig for alle paa forsiden paa
    // tvaers af teams (supplyHomeOffice-widgetten, kun navn+dato). Et
    // hjemmearbejde-spoergsmaal daekker derfor hele Supply Chain som standard;
    // navngivne teams indsnaevrer stadig. Ingen andre teams' opgaver, guides eller noter laeses.
    const supplyOverview = homeQuery
    if (supplyOverview) teams = listTeams()
    // The public people directory (name + role) crosses teams, exactly like the
    // Team Overview module.
    const directoryQuery = /personer|\bperson\b|\bfolk\b|medarbejder|medarbejd|kolleg|ansatte|team\s?medlem|team\s?members|\bpeople\b|colleagu|\bstaff\b|employee|henkil|työntekij|medarbetare|anställda|hvem (?:er|arbejder|sidder)|who (?:is|are|works)|vem (?:är|arbetar|jobbar|sitter)/iu.test(q)
      && !taskQuery && !homeQuery && !vacationQuery
      && !/ferie|vacation|holiday|loma|semester|\bsyg|sick|sjuk|fravær|frånvaro|absence|vagt|\bshift|vuoro|\bpass\b|\bnote|noter|anteckning|besked|meddelande|\bmail|email|projekt|project|guide|vejledning|highscore|leaderboard|fødselsdag|födelsedag|birthday|syntymä/iu.test(q)
    if (namedTeams.length) {
      const foreignNamed = namedTeams.filter(team => !teams.some(allowed => allowed.teamId === team.teamId))
      if (foreignNamed.length) {
        if (directoryQuery) return crossTeamDirectory(namedTeams, language)
        // Another team's shift schedule may be asked by everybody; any other module there stays closed.
        const modules = plan?.modules || knowledge.matchedModules(question)
        const shiftsOnly = !vacationQuery && modules.every(id => id === 'shifts' || id === 'people')
        if (shiftsOnly && taskQuery) { teams = namedTeams; crossTeam = true }
        else if (shiftsOnly && !plan && INTENTS.whereIs.test(q)) {
          const status = insightAnswer({ question, principal, teams: namedTeams, readTeam, creatorEmail: creatorEmail(), language, resolveDates, selectedPerson, now, only: ['whereIs'] })
          if (status) return status
          throw new Error(NO_TEAM_ACCESS[language] || NO_TEAM_ACCESS.da)
        } else throw new Error(NO_TEAM_ACCESS[language] || NO_TEAM_ACCESS.da)
      } else teams = teams.filter(team => namedTeams.some(named => named.teamId === team.teamId))
    }
    if (!plan && !image && (GUIDE_LIST.test(q) || KB_LIST.test(q))) {
      const library = GUIDE_LIST.test(q) ? 'guides' : 'knowledge'
      const listText = (library === 'guides' ? GUIDE_LIST_TEXT : KB_LIST_TEXT)[language] || (library === 'guides' ? GUIDE_LIST_TEXT : KB_LIST_TEXT).da
      const titles = [...new Set(guidesFor({ ...principal, teams }, { library }).map(({ guide }) => String(guide.title || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      if (!titles.length) return { mode: 'data', text: listText.none, sources: [], contextQuestion: question }
      const shown = titles.slice(0, 40).map(title => `• ${title}`).join('\n')
      const more = titles.length > 40 ? `\n${listText.more(titles.length - 40)}` : ''
      return { mode: 'data', text: `${listText.title(titles.length)}:\n\n${shown}${more}\n\n${listText.next}`, sources: [], contextQuestion: question }
    }
    // Kryds-modul-indsigter (hvor-er, ledige, tilbage, flest opgaver, konflikter)
    // kombinerer personer x ferie x sygdom x hjemmearbejde x vagter deterministisk.
    // Koerer FOER enkelt-modul-sporene, men kun paa praecise intents.
    const insight = insightAnswer({ question, principal, teams, readTeam, creatorEmail: creatorEmail(), language, resolveDates, selectedPerson, now, allTeams: !crossTeam && !namedTeams.length ? listTeams : undefined, only: crossTeam ? ['whereIs', 'workload'] : undefined })
    if (insight) return insight
    const sources = []
    // Extended modules share one permission-projected search layer. Prefer explicit
    // module requests before the old narrowly defined planning intent detectors.
    const planning = homeQuery || taskQuery || vacationQuery
    const extendedModules = plan?.modules || knowledge.matchedModules(question)
    const combinedPlanning = [homeQuery, taskQuery, vacationQuery].filter(Boolean).length > 1
    const useKnowledge = !planning || combinedPlanning || /hvornår|when|milloin|fast mønster|fixed pattern|när|fast mönster/u.test(q) || extendedModules.some(id => !['people', 'shifts', 'homeOffice', 'vacation', 'highscores', 'guides'].includes(id))
    // A question (not a bare keyword) that names no module is most often a guide question.
    const asksQuestion = isHowToQuestion(question) || /\?\s*$/.test(question) || /^(?:hvad|hvorfor|hvilk\w*|what|why|which|mikä|mitä|miksi|vad|varför|vilk\w*)\b/u.test(q)
    if (!plan && !image && !planning && !extendedModules.includes('guideInfo')) {
      // "Hvad betyder afventer review?" asks for an explanation, which lives in the guides.
      const definition = /^(?:hvad betyder|hvad er forskellen på|what does .+ mean|what is the difference|mitä .+ tarkoittaa|vad betyder|vad är skillnaden)/u.test(q)
      const guided = definition
        ? confidentGuide(guideSearch(principal, teams, question, undefined, { ownOnly: true }), 0.75, 0) || (extendedModules.length ? null : guideSearch(principal, teams, question))
        : asksQuestion
        ? extendedModules.length ? moduleSafeGuide(principal, teams, question) : guideSearch(principal, teams, question)
        : confidentGuide(guideSearch(principal, teams, question, undefined, { ownOnly: extendedModules.length > 0 }), 0.75)
      if (guided?.hits.length) return guideAnswer(guided, question, language)
    }
    const knowledgeAnswer = useKnowledge && !crossTeam ? knowledge.query({ principal: { ...principal, teams: teams.filter(team => principal.teams.some(allowed => allowed.teamId === team.teamId)) }, question, language, now, plan, page }) : null
    if (knowledgeAnswer) return knowledgeAnswer
    if (homeQuery || taskQuery || vacationQuery) {
      // A list question without a period ("hvem har ferie?") covers this week; the title shows the dates.
      const range = resolveDates(q, now) || (mentionsPeriod(q) ? null : thisWeek(now))
      if (!range) return { mode: 'data', text: t.date, sources: [], contextQuestion: question }
      const taskText = TASK_TEXT[language] || TASK_TEXT.da
      const showDay = iso => formatDay(iso, language, { now })
      let selection = null
      if (taskQuery) {
        const pick = scope => selectTaskPeople(q, principal, scope, readTeam, creatorEmail(), selectedPerson, { teamWide: crossTeam || whoHasRole })
        if (crossTeam || namedTeams.length) selection = pick(teams)
        else {
          // A person who is not in the asker's team is looked up in every team; only that person's own shifts are shown.
          const everyone = listTeams()
          const fromOwn = selectedPerson === undefined || typeof selectedPerson !== 'string' || listPeople(teams, readTeam, creatorEmail()).some(person => person.email === canonical(selectedPerson))
          selection = fromOwn ? pick(teams) : pick(everyone)
          if (fromOwn && (selection.reason === 'notFound' || selection.reason === 'didYouMean')) {
            const wide = pick(everyone)
            if (!wide.reason || wide.reason === 'ambiguous') selection = wide
          }
          if (!selection.reason && !selection.all && !selection.own) {
            const memberTeams = everyone.filter(team => selection.people.some(person => person.memberships.some(member => member.teamId === team.teamId)))
            if (memberTeams.some(team => !teams.some(own => own.teamId === team.teamId))) { teams = memberTeams; crossTeam = true }
          }
        }
      }
      if (selection?.reason === 'notFound') return { mode: 'data', text: taskText.notFound(selection.subject, namedTeams.length ? 'selected' : 'any'), sources: [] }
      if (selection?.reason === 'didYouMean') return { mode: 'data', text: DID_YOU_MEAN[language] || DID_YOU_MEAN.da, personChoices: selection.choices, sources: [] }
      if (selection?.reason === 'ambiguous') return { mode: 'data', text: taskText.ambiguous, personChoices: selection.choices, sources: [] }
      // Role names in the question ("lukkevagt") narrow the answer to that role; teams without such a role then add nothing.
      const roleFilter = new Map()
      const roleTitles = []
      if (taskQuery) {
        for (const team of teams) {
          const named = rolesNamedIn(question, readTeam(team, 'shift-roles') || [])
          if (named.length) { roleFilter.set(team.teamId, new Set(named.map(role => role.id))); roleTitles.push(...named.map(role => String(role.name).trim())) }
        }
      }
      const rows = []
      // The team label only helps when several teams can be in the answer.
      const showTeam = principal.teams.length > 1 || teams.length > 1 || crossTeam
      for (const team of teams) {
        const label = team.abbreviation || team.teamId
        if (taskQuery) {
          const people = selection.people.filter(person => person.memberships.some(member => member.teamId === team.teamId))
          const wanted = roleFilter.size ? roleFilter.get(team.teamId) || new Set() : null
          for (const shift of loadShifts(team, readTeam).inRange(range)) {
            if (wanted && !wanted.has(shift.roleId)) continue
            const person = people.find(person => person.memberships.some(member => member.teamId === team.teamId && member.identifiers.has(normalize(shift.employeeId))))
            if (!person) continue
            rows.push({ date: shift.date, text: `${showDay(shift.date)}${showTeam ? ` · ${label}` : ''}: ${selection.all ? `${person.name} — ` : ''}${shift.roleName || t.unknown}` })
          }
          sources.push({ kind: 'shifts', teamId: team.teamId, title: `${label} · ${taskText.source}` })
        } else {
          const users = readTeam(team, 'users') || {}
          const vacation = (readTeam(team, 'vacation-entries') || []).filter(item => item.status === 'approved')
          if (vacationQuery) {
            for (const entry of vacation.filter(item => item.startDate.slice(0, 10) <= range.end && item.endDate.slice(0, 10) >= range.start)) {
              rows.push({ date: entry.startDate, text: `${showTeam ? `${label} · ` : ''}${users[entry.userEmail]?.fullName || entry.userId || '—'}${entry.type === 'parental' ? ` (${t.parental})` : ''}: ${formatRange(entry.startDate.slice(0, 10), entry.endDate.slice(0, 10), language, { now })}` })
            }
          } else {
            const patterns = readTeam(team, 'home-office-patterns') || {}
            const exceptions = readTeam(team, 'home-office-exceptions') || []
            const count = Math.round((new Date(`${range.end}T12:00:00`) - new Date(`${range.start}T12:00:00`)) / 86400000) + 1
            const first = new Date(`${range.start}T12:00:00`)
            for (let i = 0; i < Math.min(count, 366); i++) {
              const day = addDays(first, i)
              const date = dateString(day)
              for (const [key, user] of Object.entries(users)) {
                const email = normalize(user.email || key)
                if (user.status && user.status !== 'approved') continue
                if (email === normalize(creatorEmail()) || user.role === 'creator') continue
                const exception = exceptions.find(item => normalize(item.userEmail) === email && item.date === date)
                const home = exception ? exception.isHomeOffice : matchesHomeOfficePattern(patterns[email], day)
                const onVacation = vacation.some(item => normalize(item.userEmail) === email && item.startDate.slice(0, 10) <= date && item.endDate.slice(0, 10) >= date)
                if (home && !onVacation) rows.push({ date, text: `${showDay(date)}${showTeam ? ` · ${label}` : ''}: ${user.fullName || email}` })
              }
            }
          }
          sources.push({ kind: vacationQuery ? 'calendar' : 'homeOffice', teamId: team.teamId, title: `${label} · ${vacationQuery ? t.vacation : t.home}` })
        }
      }
      rows.sort((a, b) => a.date.localeCompare(b.date) || a.text.localeCompare(b.text))
      const scopeTitle = selection ? selection.own ? t.tasks : selection.all ? `${taskText.team} · ${teams.map(team => team.abbreviation || team.teamId).join(', ')}` : `${taskText.named} ${selection.people[0].name}` : ''
      const taskTitle = roleTitles.length
        ? `${[...new Set(roleTitles)].join(', ')} · ${selection.own ? t.tasks : selection.all ? teams.map(team => team.abbreviation || team.teamId).join(', ') : selection.people[0].name}`
        : scopeTitle
      const title = taskQuery ? taskTitle : vacationQuery ? t.vacation : t.home
      const empty = `${taskQuery ? (!selection.own ? (selection.all ? t.noneTeam : t.noneOther) : t.none) : vacationQuery ? t.noVacation : t.noHome}\n\n${nextStep(language, taskQuery ? 'tasks' : vacationQuery ? 'vacation' : 'home', { asked: q })}`
      return { mode: 'data', text: `${title} (${formatHeading(range.start, range.end, language, { now })}):\n\n${rows.length ? rows.map(row => `• ${row.text}`).join('\n') : empty}`, sources, range, contextQuestion: question }
    }
    // Published guides only, never review drafts.
    const result = guideSearch(principal, teams, question, plan)
    // Some words hit a guide title but the guide does not cover the question:
    // say which word has no guide and point to the closest ones. Still logged,
    // because a missing guide is useful feedback for the guide owners.
    if (!result.hits.length && !image && result.near.length) {
      const near = [...new Map(result.near.map(item => [item.entry.guide.id, item])).values()].slice(0, 3)
      const covered = new Set(near.flatMap(item => item.hits))
      const missing = result.tokens.filter(token => !token.soft).map(token => token.surface).filter(token => !covered.has(token)).map(token => token.length <= 5 && /\d/.test(token) ? token.toUpperCase() : token)
      const nearText = NEAR_MISS_TEXT[language] || NEAR_MISS_TEXT.da
      return { mode: 'data', text: `${nearText.intro(missing)}\n${near.map(item => `• ${item.entry.guide.title}`).join('\n')}\n\n${nearText.next}`, sources: [], contextQuestion: question, unmatched: true }
    }
    if (!result.hits.length && !image && !/guide|vejledning|manual|opas|oppaa|vägledning/.test(q)) {
      // Blindgyden er vaek: i stedet for en blank afvisning svarer vi ud fra
      // app-viden. Rammer spoergsmaalet intet kendt emne, fortaeller vi hvad
      // Hubert KAN - og `unmatched` bevarer signalet til daeknings-loggen.
      const guidance = appGuidance(question, { role: principal.role, language })
      return { mode: 'app-guide', text: guidance.text, sources: [{ kind: 'app-guide', title: guidance.title }], contextQuestion: question, ...(guidance.unmatched ? { unmatched: true } : {}) }
    }
    if (!result.hits.length) return { mode: 'retrieval', text: t.noHits, sources: [], contextQuestion: question }
    return guideAnswer(result, question, language)
  }
  // "Who is off tomorrow and what is for lunch?" is two questions: answer both, with the period shared.
  function queryCompound(request, now = new Date()) {
    const parts = request && !request.searchPlan && !request.image && request.page === undefined && typeof request.question === 'string' ? splitCompound(tidyQuestion(request.question)) : null
    if (!parts) return queryOne(request, now)
    const answers = parts.map(question => queryOne({ ...request, question }, now))
    if (!answers.every(answer => answer.mode === 'data' && !answer.unmatched && !answer.guard && !answer.smallTalk && !answer.personChoices && !answer.nextPage)) return queryOne(request, now)
    return { mode: 'data', text: answers.map(answer => answer.text).join('\n\n'), sources: answers.flatMap(answer => answer.sources || []), contextQuestion: request.question }
  }
  // A long, rambling message that gave nothing is asked again from each question word on, last first.
  const isWeak = answer => answer.unmatched === true || (answer.total === 0 && answer.weak !== false)
  function query(request, now = new Date()) {
    const answer = queryCompound(request, now)
    if (!isWeak(answer) || !request || request.searchPlan || request.image || request.page !== undefined || typeof request.question !== 'string') return answer
    for (const clause of focusClauses(request.question)) {
      const retry = queryCompound({ ...request, question: clause }, now)
      if (!isWeak(retry)) return retry
    }
    return answer
  }
  const getRecord = ({ token, moduleId, recordId, teamId, language }) => knowledge.getRecord(authorize(token), moduleId, recordId, teamId, language)
  function prepare({ token }) {
    const principal = authorize(token)
    const guides = guidesFor(principal)
    let stepCount = 0
    for (const { guide } of guides) stepCount += indexGuide(guide).length
    return { guideCount: guides.length, stepCount }
  }
  return { authorize, query, getGuide, getImage, getRecord, moduleCatalog, prepare }
}

module.exports = { createAssistantContext, resolveDates, detectQuestionLanguage, splitCompound }
