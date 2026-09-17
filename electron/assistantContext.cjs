// Assistant-specific allowlist. Never send generic KV contents to the model.
const { isTaskQuestion, selectTaskPeople } = require('./assistantPeople.cjs')
const { insightAnswer } = require('./assistantInsights.cjs')
const { extraDates } = require('./assistantDates.cjs')
const { createKnowledge, validatePlan, moduleCatalog } = require('./assistantKnowledge.cjs')
const { continueQuestion, validateConversation } = require('./assistantConversation.cjs')
const { indexGuide } = require('./assistantGuideIndex.cjs')
const normalize = value => String(value || '').trim().toLowerCase()
const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const addDays = (date, days) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy }
const GAMES = [
  { name: 'Nexi Flyer', pattern: /\bnexi[\s-]*flyer\b/, key: 'nexi-flyer-global-leaderboard' },
  { name: 'Neon Snake', pattern: /\bneon[\s-]*snake\b/, key: 'neon-snake-global-leaderboard' },
  { name: 'Brick Break', pattern: /\bbrick[\s-]*break\b/, key: 'brickbreak-global-leaderboard' },
  { name: 'Endless Dodger', pattern: /\bendless[\s-]*dodger\b/, key: 'endless-dodger-global-leaderboard' },
  { name: 'Tetris', pattern: /\btetris\b/, key: 'tetris-global-leaderboard', flat: true },
]
const SCORE_INTENT = /high\s*-?\s*score|leaderboard|top\s*score|rekord|highest score|best score|ennäty|pistetilasto/
const DIFFICULTIES = { easy: ['easy', 'let', 'helppo'], medium: ['medium', 'mellem', 'keskitaso'], hard: ['hard', 'svær', 'vaikea'], expert: ['expert', 'ekspert', 'asiantuntija'] }
const wordPattern = value => new RegExp(`(?:^|[^\\p{L}\\p{N}])${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'iu')

// Only a short, explicit score selection inherits context. Never feed a whole
// transcript or previous answer/data into the model or use it as authorization.
function scoreQuestion(question, previousQuestion, teams) {
  if (SCORE_INTENT.test(question)) return question
  const games = GAMES.filter(game => game.pattern.test(question))
  if (games.length && /fører|flest point|flest points|førsteplads|leading|most points/.test(question)) return `highscore ${question}`
  let remaining = question
  for (const game of GAMES) remaining = remaining.replace(game.pattern, ' ')
  const difficultyWords = Object.values(DIFFICULTIES).flat()
  const chosenDifficulty = difficultyWords.some(word => wordPattern(word).test(question))
  for (const word of difficultyWords) remaining = remaining.replace(wordPattern(word), ' ')
  const teamNames = teams.flatMap(team => [team.teamId, team.abbreviation]).filter(Boolean)
  const chosenTeam = teamNames.some(name => wordPattern(name).test(question))
  for (const name of teamNames) remaining = remaining.replace(wordPattern(name), ' ')
  for (const word of ['og', 'hvad', 'med', 'på', 'i', 'så', 'and', 'what', 'about', 'on', 'in', 'then', 'entä', 'ja']) remaining = remaining.replace(wordPattern(word), ' ')
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
  da: { unsupported: 'Jeg kan ikke finde et underbygget svar på det spørgsmål endnu. Jeg kan slå opgaver, hjemmearbejde, godkendt ferie og highscores op eller forklare relevante guides. Prøv at præcisere, hvad du vil vide.', chooseGame: 'Hvilket spil mener du? Jeg kan slå highscores op i Nexi Flyer, Neon Snake, Brick Break, Endless Dodger og Tetris.', scores: 'Highscores', noScore: 'Ingen registreret score', all: 'Samlet', categories: { easy: 'Let', medium: 'Mellem', hard: 'Svær', expert: 'Ekspert' } },
  en: { unsupported: 'I cannot find a supported answer to that question yet. I can look up tasks, home office, approved vacation and highscores, or explain relevant guides. Please clarify what you want to know.', chooseGame: 'Which game? I can look up highscores in Nexi Flyer, Neon Snake, Brick Break, Endless Dodger and Tetris.', scores: 'Highscores', noScore: 'No recorded score', all: 'Overall', categories: { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' } },
  fi: { unsupported: 'En vielä löydä kysymykseen tietoihin perustuvaa vastausta. Voin hakea tehtäviä, etätyötä, hyväksyttyjä lomia ja pelien ennätyksiä tai selittää oppaita. Tarkenna, mitä haluat tietää.', chooseGame: 'Mitä peliä tarkoitat? Voin hakea ennätykset peleistä Nexi Flyer, Neon Snake, Brick Break, Endless Dodger ja Tetris.', scores: 'Ennätykset', noScore: 'Ei kirjattua tulosta', all: 'Yhteensä', categories: { easy: 'Helppo', medium: 'Keskitaso', hard: 'Vaikea', expert: 'Asiantuntija' } },
}
const GUIDE_STOPWORDS = new Set('jeg mig min mine skal kan kunne hvordan hvad hvem hvor der det den en et er at i på til fra for med og har havde have guide guides please how what can the a an in of to is opas does do who has have which me my are about om du we you your would like tell explain forklare forklar fortæl hjælp hjælpe gerne vil want know vide noget this that'.split(' '))
function guideTokens(value) {
  return [...new Set(normalize(value).split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 1 && !GUIDE_STOPWORDS.has(word)))]
}
const TASK_TEXT = {
  da: { source: 'Vagtplan', named: 'Registrerede opgaver for', team: 'Registrerede teamopgaver', ambiguous: 'Hvilken person mener du? Vælg en af personerne nedenfor.', notFound: subject => `Jeg kan ikke finde “${subject}” blandt de godkendte personer i de valgte teams. Prøv personens fulde navn eller brugernavn. Jeg kan kun slå opgaver op i teams, du har adgang til.` },
  en: { source: 'Shift schedule', named: 'Recorded tasks for', team: 'Recorded team tasks', ambiguous: 'Which person do you mean? Choose one of the people below.', notFound: subject => `I cannot find “${subject}” among approved people in the selected teams. Try their full name or username. I can only look up tasks in teams you can access.` },
  fi: { source: 'Vuoroaikataulu', named: 'Kirjatut tehtävät henkilölle', team: 'Tiimin kirjatut tehtävät', ambiguous: 'Ketä henkilöä tarkoitat? Valitse henkilö alta.', notFound: subject => `Henkilöä ”${subject}” ei löydy valittujen tiimien hyväksytyistä käyttäjistä. Kokeile koko nimeä tai käyttäjätunnusta. Voin hakea tehtäviä vain tiimeistä, joihin sinulla on pääsy.` },
}

function resolveDates(question, now = new Date()) {
  const q = normalize(question)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const explicit = q.match(/\b(\d{4}-\d{2}-\d{2})\b/) || q.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/)
  if (explicit) {
    const value = explicit.length === 2 ? explicit[1] : `${explicit[3]}-${explicit[2].padStart(2, '0')}-${explicit[1].padStart(2, '0')}`
    const parsed = new Date(`${value}T12:00:00`)
    if (Number.isNaN(parsed.getTime()) || dateString(parsed) !== value) return null
    return { start: value, end: value }
  }
  const extended = extraDates(q, now)
  if (extended.matched) return extended.range
  const weekdays = [['søndag', 'sunday', 'sunnuntai'], ['mandag', 'monday', 'maanantai'], ['tirsdag', 'tuesday', 'tiistai'], ['onsdag', 'wednesday', 'keskiviikko'], ['torsdag', 'thursday', 'torstai'], ['fredag', 'friday', 'perjantai'], ['lørdag', 'saturday', 'lauantai']]
  const weekday = weekdays.findIndex(words => words.some(word => q.includes(word)))
  const nextWeek = /næste uge|next week|ensi viik/.test(q)
  if (nextWeek || /denne uge|this week|tällä viik/.test(q)) {
    const monday = addDays(today, -((today.getDay() + 6) % 7) + (nextWeek ? 7 : 0))
    const start = weekday < 0 ? monday : addDays(monday, (weekday + 6) % 7)
    return { start: dateString(start), end: dateString(weekday < 0 ? addDays(monday, 6) : start) }
  }
  if (/overmorgen|day after tomorrow|ylihuomenna/.test(q)) {
    const day = dateString(addDays(today, 2)); return { start: day, end: day }
  }
  if (/i morgen|imorgen|tomorrow|huomenna/.test(q)) {
    const day = dateString(addDays(today, 1)); return { start: day, end: day }
  }
  if (/i dag|idag|today|tänään/.test(q)) return { start: dateString(today), end: dateString(today) }
  if (weekday >= 0) {
    let distance = (weekday - today.getDay() + 7) % 7
    if (distance === 0 && /næste|next|ensi/.test(q)) distance = 7
    const day = dateString(addDays(today, distance)); return { start: day, end: day }
  }
  return null
}

const { guideAccessIds } = require('./guideGrants.cjs')
const TEXT = {
  da: { date: 'Hvilken dato eller uge mener du? Skriv fx “næste uge” eller “2026-09-17”.', tasks: 'Dine registrerede opgaver', none: 'Ingen registrerede opgaver i perioden. Det betyder ikke nødvendigvis, at du har fri.', home: 'Registreret hjemmearbejde', noHome: 'Ingen registreret som hjemmearbejdende i perioden.', vacation: 'Godkendt ferie', noVacation: 'Ingen godkendt ferie i perioden.', noHits: 'Jeg fandt ikke relevante afsnit i de guides, du har adgang til. Prøv guidens navn eller andre søgeord.', excerpts: 'Relevante guideafsnit', unknown: 'Opgave/rolle uden navn' },
  en: { date: 'Which date or week do you mean? Try “next week” or “2026-09-17”.', tasks: 'Your recorded tasks', none: 'No recorded tasks in this period. This does not necessarily mean you have time off.', home: 'Recorded working from home', noHome: 'No one recorded as working from home in this period.', vacation: 'Approved vacation', noVacation: 'No approved vacation in this period.', noHits: 'No relevant sections found in the guides you can access. Try a guide title or other keywords.', excerpts: 'Relevant guide sections', unknown: 'Unnamed task/role' },
  fi: { date: 'Mitä päivää tai viikkoa tarkoitat? Kirjoita esimerkiksi “ensi viikolla” tai “2026-09-17”.', tasks: 'Kirjatut tehtäväsi', none: 'Ei kirjattuja tehtäviä ajanjaksolla. Tämä ei välttämättä tarkoita vapaata.', home: 'Kirjattu etätyö', noHome: 'Ajanjaksolla ei ole kirjattua etätyötä.', vacation: 'Hyväksytty loma', noVacation: 'Ajanjaksolla ei ole hyväksyttyjä lomia.', noHits: 'Oppaista, joihin sinulla on pääsy, ei löytynyt osuvia kohtia. Kokeile oppaan nimeä tai muita hakusanoja.', excerpts: 'Oppaiden asiaankuuluvat kohdat', unknown: 'Nimetön tehtävä/rooli' },
}

// Public people directory shown by the Team Overview module to every signed-in
// user: name + role only. This is the ONLY cross-team data the assistant reveals.
const DIRECTORY_TEXT = {
  da: { people: 'Personer', manager: 'Leder', user: 'Medarbejder', none: 'Ingen registrerede personer' },
  en: { people: 'People', manager: 'Manager', user: 'Member', none: 'No registered people' },
  fi: { people: 'Henkilöt', manager: 'Esihenkilö', user: 'Jäsen', none: 'Ei rekisteröityjä henkilöitä' },
}

// Sprogmarkoerer til at gaette spoergsmaalets sprog, saa svaret gives paa samme
// sprog som spoergsmaalet (uafhaengigt af app-sproget). Dansk/engelsk matches som
// hele ord; finsk matches paa ordstammer pga. kraftig boejning.
const LANGUAGE_MARKERS = {
  da: ['hvem', 'hvad', 'hvornår', 'hvor', 'hvilken', 'hvilke', 'ferie', 'fri', 'syg', 'sygemeldt', 'vagt', 'vagter', 'opgave', 'opgaver', 'hjemme', 'hjemmearbejde', 'næste', 'uge', 'ugen', 'min', 'mine', 'idag', 'imorgen', 'arbejder', 'sidder', 'ansatte', 'medarbejder', 'medarbejdere', 'kollega', 'fødselsdag', 'vejledning'],
  en: ['who', 'what', 'when', 'where', 'which', 'vacation', 'holiday', 'sick', 'shift', 'shifts', 'task', 'tasks', 'home', 'from', 'working', 'works', 'work', 'next', 'week', 'today', 'tomorrow', 'people', 'staff', 'employee', 'employees', 'colleague', 'birthday', 'does'],
  fi: ['kuka', 'ketk', 'mitä', 'milloin', 'miss', 'loma', 'saira', 'vuoro', 'tehtäv', 'etätö', 'etäty', 'ensi', 'viiko', 'viikk', 'tänään', 'huomenna', 'työnteki', 'henkil', 'syntym', 'opas', 'oppa', 'onko', 'ovatko', 'minun', 'tehdä'],
}

// Returnerer 'da' | 'en' | 'fi' hvis et sprog klart dominerer i spoergsmaalet, ellers null.
function detectQuestionLanguage(question) {
  const words = normalize(question).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (!words.length) return null
  const wordSet = new Set(words)
  const scores = {
    da: LANGUAGE_MARKERS.da.reduce((total, marker) => total + (wordSet.has(marker) ? 1 : 0), 0),
    en: LANGUAGE_MARKERS.en.reduce((total, marker) => total + (wordSet.has(marker) ? 1 : 0), 0),
    fi: LANGUAGE_MARKERS.fi.reduce((total, marker) => total + (words.some(word => word.includes(marker)) ? 1 : 0), 0),
  }
  const best = ['da', 'en', 'fi'].reduce((winner, lang) => (scores[lang] > scores[winner] ? lang : winner), 'da')
  if (scores[best] === 0) return null
  if (['da', 'en', 'fi'].some(lang => lang !== best && scores[lang] >= scores[best])) return null
  return best
}

function createAssistantContext({ listTeams, lookupTeam, listViews, creatorEmail, readTeam, readShared, currentFolder, getDiagnostics }) {  const knowledge = createKnowledge({ readTeam, readShared, creatorEmail, resolveDates, getDiagnostics, getGuides: guidesFor })
  function authorize(token, viewId) {
    const sessions = readShared('active-sessions')
    const session = token && (sessions?.[require('./authService.cjs').sessionKey(token)] || sessions?.[token])
    if (!token || !session || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) throw new Error('Log ind igen før du bruger chatbotten')
    const email = normalize(session.email)
    const home = lookupTeam(email)
    if (!home) throw new Error('Brugerens team kunne ikke bekræftes')
    const users = readTeam(home, 'users') || {}
    const user = Object.entries(users).find(([key, value]) => normalize(value?.email || key) === email)?.[1]
    if (!user || (user.status && user.status !== 'approved')) throw new Error('Brugerkontoen er ikke godkendt')
    let teams
    if (viewId) {
      const view = listViews(email).find(value => value.viewId === viewId)
      if (!view) throw new Error('Ingen adgang til den valgte hub')
      teams = listTeams().filter(team => view.teamIds.includes(team.teamId))
    } else {
      const current = listTeams().find(team => team.folderName === currentFolder())
      if (!current || (current.teamId !== home.teamId && email !== normalize(creatorEmail()))) throw new Error('Ingen adgang til det aktive team')
      teams = [current]
    }
    const role = email === normalize(creatorEmail()) ? 'creator' : user.role === 'manager' || user.role === 'admin' || (!user.role && user.isManager) ? 'manager' : 'user'
    return { email, name: String(user.fullName || email), teams, viewId, role }
  }

  function guidesFor(principal) {
    const guides = []
    for (const team of principal.teams) {
      for (const guide of readTeam(team, 'guides') || []) guides.push({ guide, team })
      for (const guide of readShared('shared-guides') || []) {
        if (guide.sharedWithTeamCodes?.includes(team.folderName)) guides.push({ guide, team })
      }
    }
    if (!principal.viewId) for (const team of listTeams().filter(team => !principal.teams.some(allowed => allowed.teamId === team.teamId))) {
      const home = lookupTeam(principal.email)
      const grants = guideAccessIds(readTeam(team, 'guide-access-requests'), principal.email, home?.folderName)
      if (!grants.size) continue
      for (const guide of readTeam(team, 'guides') || []) if (grants.has(guide.id)) guides.push({ guide, team })
    }
    return guides
  }

  function getGuide(token, viewId, teamId, guideId) {
    const principal = authorize(token, viewId)
    const found = guidesFor(principal).find(value => value.team.teamId === teamId && value.guide.id === guideId)
    if (!found) throw new Error('Du har ikke adgang til denne guide')
    return found
  }

  function getImage(token, viewId, teamId, guideId, imageId) {
    const found = getGuide(token, viewId, teamId, guideId)
    const imageIds = [found.guide.coverImageId, ...(found.guide.sections || []).flatMap(section => (section.steps || []).flatMap(step => step.imageIds || []))]
    if (!imageIds.includes(imageId) || !/^file_[a-zA-Z0-9_-]+$/.test(imageId)) throw new Error('Billedet er ikke del af en tilgængelig guide')
    const stores = [key => readTeam(found.team, key), readShared]
    for (const read of stores) {
      const meta = read(`${imageId}_meta`)
      if (!meta) continue
      if (!Number.isInteger(meta.chunkCount) || meta.chunkCount < 1 || meta.chunkCount > 28 || meta.size > 5 * 1024 ** 2 || !/^image\/(png|jpeg|webp|gif|bmp)$/.test(meta.contentType)) throw new Error('Ugyldigt eller for stort guidebillede')
      const chunks = Array.from({ length: meta.chunkCount }, (_, i) => read(`${imageId}_chunk_${i}`))
      if (chunks.some(value => typeof value !== 'string')) throw new Error('Guidebilledet mangler data')
      const base64 = chunks.join('')
      if (base64.length > 7 * 1024 ** 2) throw new Error('Guidebilledet er for stort')
      return `data:${meta.contentType};base64,${base64}`
    }
    throw new Error('Guidebilledet kunne ikke læses')
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

  function query({ token, viewId, question, language = 'da', image, selectedPerson, previousQuestion, conversation, searchPlan, page }, now = new Date()) {
    if (typeof question !== 'string' || !question.trim() || question.length > 1000) throw new Error('Spørgsmålet skal være mellem 1 og 1000 tegn')
    if (previousQuestion !== undefined && (typeof previousQuestion !== 'string' || previousQuestion.length > 1000)) throw new Error('Det forrige spørgsmål må højst være 1000 tegn')
    const history = validateConversation(conversation)
    previousQuestion = previousQuestion || history.at(-1)
    const principal = authorize(token, viewId)
    const plan = searchPlan === undefined ? undefined : validatePlan(searchPlan)
    question = continueQuestion(question, previousQuestion, now, resolveDates)
    // Svar paa spoergsmaalets sprog hvis det klart afviger fra app-sproget.
    const detectedLanguage = detectQuestionLanguage(question)
    if (detectedLanguage) language = detectedLanguage
    const t = TEXT[language] || TEXT.da
    const q = normalize(question)
    const extra = EXTRA_TEXT[language] || EXTRA_TEXT.da
    const scoreQ = scoreQuestion(q, previousQuestion, listTeams()) || (plan?.modules.includes('highscores') ? `highscore oversigt ${q}` : null)
    if (scoreQ) {
      let games = GAMES.filter(game => game.pattern.test(scoreQ))
      const overview = /oversigt|overblik|alle spil|samlet|overview|all games|summary|yhteenveto|kaikkien pelien/.test(scoreQ)
      if (!games.length && overview) games = GAMES
      if (!games.length) return { mode: 'data', text: extra.chooseGame, sources: [], scoreContext: scoreQ }
      // Game scoreboards are already public to authenticated users. The Creator
      // restriction is for administering scores, not seeing the in-game rankings.
      // Observer hubs stay within assigned teams; no protected data is exposed.
      let scoreTeams = viewId ? principal.teams : listTeams()
      const explicitlyNamed = listTeams().filter(team => [team.teamId, team.abbreviation].filter(Boolean).some(name => wordPattern(name).test(scoreQ)))
      if (explicitlyNamed.some(team => !scoreTeams.some(allowed => allowed.teamId === team.teamId))) throw new Error('Chatbotten har ikke adgang til det teams oplysninger')
      if (explicitlyNamed.length) scoreTeams = explicitlyNamed
      const words = new Set(scoreQ.split(/[^\p{L}\p{N}]+/u))
      const requested = Object.keys(DIFFICULTIES).filter(key => DIFFICULTIES[key].some(word => words.has(word)))
      const sources = []
      const sections = []
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
              entries[category].push({ name: String(user?.fullName || email.split('@')[0]), score: score.score, team: team.abbreviation || team.teamId })
            }
          }
          sources.push({ kind: 'highscores', teamId: team.teamId, title: `${team.abbreviation || team.teamId} · ${game.name}` })
        }
        const lines = categories.map(category => {
          const scores = entries[category]
          const label = category === 'all' ? extra.all : extra.categories[category]
          if (!scores.length) return `• ${label}: ${extra.noScore}`
          const maximum = Math.max(...scores.map(score => score.score))
          const winners = [...new Set(scores.filter(score => score.score === maximum).map(score => `${score.name} (${score.team})`))].sort()
          return `• ${label}: ${winners.join(', ')} — ${maximum}`
        })
        sections.push(`${extra.scores} · ${game.name}:\n\n${lines.join('\n')}`)
      }
      return { mode: 'data', text: sections.join('\n\n'), sources, scoreContext: scoreQ }
    }
    const homeQuery = /hjemme|hjemmearbejde|home office|from home|etäty|etänä/.test(q) || plan?.modules.includes('homeOffice')
    const taskQuery = !homeQuery && (isTaskQuestion(q) || plan?.modules.includes('shifts'))
    const vacationQuery = (/ferie|vacation|holiday|loma/.test(q) || plan?.modules.includes('vacation')) && !/guide|vejledning|manual|opas|oppaa|anmodning|afventer|pending|request/.test(q)
    let teams = principal.teams
    // Hjemmearbejde-OVERSIGTEN er allerede synlig for alle paa forsiden paa
    // tvaers af teams (supplyHomeOffice-widgetten, kun navn+dato). Et
    // hjemmearbejde-spoergsmaal daekker derfor hele Supply Chain som standard;
    // navngivne teams indsnaevrer stadig, og observer-hubs holder sig til deres
    // tildelte teams. Ingen andre teams' opgaver, guides eller noter laeses.
    const supplyOverview = homeQuery
    if (supplyOverview) teams = viewId ? principal.teams : listTeams()
    const namedTeams = listTeams().filter(team => [team.teamId, team.abbreviation, team.name].filter(Boolean).some(name => new RegExp(`(?:^|[^\\p{L}\\p{N}])${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(q)))
    // The public people directory (name + role) crosses teams, exactly like the
    // Team Overview module. Observer (view) hubs stay inside their assigned view.
    const directoryQuery = !viewId
      && /personer|\bperson\b|\bfolk\b|medarbejder|medarbejd|kolleg|ansatte|team\s?medlem|team\s?members|\bpeople\b|colleagu|\bstaff\b|employee|henkil|työntekij|hvem (?:er|arbejder|sidder)|who (?:is|are|works)/iu.test(q)
      && !taskQuery && !homeQuery && !vacationQuery
      && !/ferie|vacation|holiday|loma|\bsyg|sick|fravær|absence|vagt|\bshift|vuoro|\bnote|noter|besked|\bmail|email|projekt|project|guide|vejledning|highscore|leaderboard|fødselsdag|birthday|syntymä/iu.test(q)
    if (namedTeams.length) {
      const foreignNamed = namedTeams.filter(team => !teams.some(allowed => allowed.teamId === team.teamId))
      if (foreignNamed.length) {
        if (directoryQuery) return crossTeamDirectory(namedTeams, language)
        throw new Error('Chatbotten har ikke adgang til det teams oplysninger')
      }
      teams = teams.filter(team => namedTeams.some(named => named.teamId === team.teamId))
    }
    // Kryds-modul-indsigter (hvor-er, ledige, tilbage, flest opgaver, konflikter)
    // kombinerer personer x ferie x sygdom x hjemmearbejde x vagter deterministisk.
    // Koerer FOER enkelt-modul-sporene, men kun paa praecise intents.
    const insight = insightAnswer({ question, principal, teams, readTeam, creatorEmail: creatorEmail(), language, resolveDates, selectedPerson, now })
    if (insight) return insight
    const sources = []
    // Extended modules share one permission-projected search layer. Prefer explicit
    // module requests before the old narrowly defined planning intent detectors.
    const planning = homeQuery || taskQuery || vacationQuery
    const extendedModules = plan?.modules || knowledge.matchedModules(question)
    const combinedPlanning = [homeQuery, taskQuery, vacationQuery].filter(Boolean).length > 1
    const useKnowledge = !planning || combinedPlanning || /hvornår|when|fast mønster|fixed pattern/u.test(q) || extendedModules.some(id => !['people', 'shifts', 'homeOffice', 'vacation', 'highscores', 'guides'].includes(id))
    const knowledgeAnswer = useKnowledge ? knowledge.query({ principal: { ...principal, teams: teams.filter(team => principal.teams.some(allowed => allowed.teamId === team.teamId)) }, question, language, now, plan, page }) : null
    if (knowledgeAnswer) return knowledgeAnswer
    if (homeQuery || taskQuery || vacationQuery) {
      const range = resolveDates(q, now)
      if (!range) return { mode: 'data', text: t.date, sources: [], contextQuestion: question }
      const taskText = TASK_TEXT[language] || TASK_TEXT.da
      const selection = taskQuery ? selectTaskPeople(q, principal, teams, readTeam, creatorEmail(), selectedPerson) : null
      if (selection?.reason === 'notFound') return { mode: 'data', text: taskText.notFound(selection.subject), sources: [] }
      if (selection?.reason === 'ambiguous') return { mode: 'data', text: taskText.ambiguous, personChoices: selection.choices, sources: [] }
      const rows = []
      for (const team of teams) {
        const label = team.abbreviation || team.teamId
        if (taskQuery) {
          const roles = readTeam(team, 'shift-roles') || []
          const assignments = readTeam(team, 'shift-assignments') || []
          const people = selection.people.filter(person => person.memberships.some(member => member.teamId === team.teamId))
          for (const assignment of assignments) {
            const date = String(assignment.date || '').slice(0, 10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < range.start || date > range.end) continue
            const person = people.find(person => person.memberships.some(member => member.teamId === team.teamId && member.identifiers.has(normalize(assignment.employeeId))))
            if (!person) continue
            rows.push({ date, text: `${date} · ${label}: ${selection.all ? `${person.name} — ` : ''}${roles.find(role => role.id === assignment.roleId)?.name || t.unknown}` })
          }
          sources.push({ kind: 'shifts', teamId: team.teamId, title: `${label} · ${taskText.source}` })
        } else {
          const users = readTeam(team, 'users') || {}
          const vacation = (readTeam(team, 'vacation-entries') || []).filter(item => item.status === 'approved')
          if (vacationQuery) {
            for (const entry of vacation.filter(item => item.startDate.slice(0, 10) <= range.end && item.endDate.slice(0, 10) >= range.start)) {
              rows.push({ date: entry.startDate, text: `${label} · ${users[entry.userEmail]?.fullName || entry.userId || '—'}: ${entry.startDate.slice(0, 10)} – ${entry.endDate.slice(0, 10)}` })
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
                const home = exception ? exception.isHomeOffice : (patterns[email]?.weekdays || []).includes(day.getDay())
                const onVacation = vacation.some(item => normalize(item.userEmail) === email && item.startDate.slice(0, 10) <= date && item.endDate.slice(0, 10) >= date)
                if (home && !onVacation) rows.push({ date, text: `${date} · ${label}: ${user.fullName || email}` })
              }
            }
          }
          sources.push({ kind: vacationQuery ? 'calendar' : 'homeOffice', teamId: team.teamId, title: `${label} · ${vacationQuery ? t.vacation : t.home}` })
        }
      }
      rows.sort((a, b) => a.date.localeCompare(b.date) || a.text.localeCompare(b.text))
      const taskTitle = selection ? selection.own ? t.tasks : selection.all ? `${taskText.team} · ${teams.map(team => team.abbreviation || team.teamId).join(', ')}` : `${taskText.named} ${selection.people[0].name}` : ''
      const title = taskQuery ? taskTitle : vacationQuery ? t.vacation : t.home
      const empty = taskQuery ? t.none : vacationQuery ? t.noVacation : t.noHome
      return { mode: 'data', text: `${title} (${range.start}${range.end !== range.start ? ` – ${range.end}` : ''}):\n\n${rows.length ? rows.map(row => `• ${row.text}`).join('\n') : empty}`, sources, range, contextQuestion: question }
    }
    // Small lexical retrieval pilot. Uses published guides only, never review drafts.
    const tokens = plan?.terms?.length ? plan.terms : guideTokens(q)
    const chunks = []
    for (const { guide, team } of guidesFor({ ...principal, teams })) {
      for (const chunk of indexGuide(guide)) {
        const matches = tokens.filter(token => chunk.words.has(token))
        const score = matches.reduce((total, token) => total + (chunk.titleWords.has(token) ? 3 : 1), 0)
        const minimumMatches = Math.min(2, tokens.length)
        // Exact topic words, at least half covered, and never substring matches
        // such as 'har' -> 'Npayhar'. Missing evidence is not a guide answer.
        if (score && matches.length >= minimumMatches && matches.length / tokens.length >= 0.5) chunks.push({ score, text: chunk.stepText.slice(0, 1200), kind: 'guide', teamId: team.teamId, guideId: guide.id, title: chunk.title, version: chunk.version, revision: chunk.revision, heading: chunk.heading, reference: chunk.reference, imageIds: chunk.imageIds })
      }
    }
    chunks.sort((a, b) => b.score - a.score)
    const seen = new Set()
    const selected = chunks.filter(chunk => { const key = `${chunk.guideId}:${chunk.reference}`; if (seen.has(key)) return false; seen.add(key); return true }).slice(0, 3)
    if (!selected.length && !image && !/guide|vejledning|manual|opas|oppaa/.test(q)) return { mode: 'unsupported', text: language === 'da' ? 'Jeg fandt ikke et underbygget svar i de tilgængelige hubdata. Prøv navnet på en person, en registrering eller et modul, og tilføj en periode hvis relevant. Jeg må ikke gætte på manglende eller utilgængelige data.' : language === 'fi' ? 'Käytettävissä olevista Hub-tiedoista ei löytynyt perusteltua vastausta. Tarkenna henkilö, tietue tai moduuli ja tarvittaessa ajanjakso. En saa arvata puuttuvia tietoja.' : 'I found no supported answer in the accessible hub data. Try a person, record or module name and a period if relevant. I must not guess missing or inaccessible data.', sources: [] }
    return { mode: 'retrieval', text: selected.length ? `${t.excerpts}:\n\n${selected.map((chunk, index) => `[${index + 1}] ${chunk.title} · v${chunk.version} · §${chunk.reference}\n${chunk.text}`).join('\n\n')}` : t.noHits, sources: selected, contextQuestion: question }
  }
  const getRecord = ({ token, viewId, moduleId, recordId, teamId, language }) => knowledge.getRecord(authorize(token, viewId), moduleId, recordId, teamId, language)
  function prepare({ token, viewId }) {
    const principal = authorize(token, viewId)
    const guides = guidesFor(principal)
    let stepCount = 0
    for (const { guide } of guides) stepCount += indexGuide(guide).length
    return { guideCount: guides.length, stepCount }
  }
  return { authorize, query, getGuide, getImage, getRecord, moduleCatalog, prepare }
}

module.exports = { createAssistantContext, resolveDates, detectQuestionLanguage }
