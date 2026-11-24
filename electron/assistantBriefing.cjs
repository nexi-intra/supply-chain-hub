// Huberts morgenbriefing: ét deterministisk overblik over i dag for den, der spørger.
// Kun egne data plus navne på teamets fravær; aldrig årsager, kommentarer, e-mails eller andre teams.
const { listPeople } = require('./assistantPeople.cjs')
const { loadShifts } = require('./assistantShifts.cjs')
const { absenceFor, homeOfficeFor } = require('./assistantInsights.cjs')
const { formatDay } = require('./assistantDateFormat.cjs')
const { LIBRARIES } = require('./libraryKeys.cjs')
const { norm } = require('./assistantNorm.cjs')

const MAX_TITLES = 3
const MAX_NAMES = 6
const TITLE_LENGTH = 80

const T = {
  da: {
    greeting: 'Godmorgen', source: 'Dagens overblik', more: n => `og ${n} til`,
    shifts: roles => `• Vagter i dag: ${roles}`, noShifts: '• Ingen registrerede vagter i dag.', unnamed: 'opgave uden navn',
    own: { sick: '• Du er sygemeldt i dag.', vacation: '• Du er på ferie i dag.', parental: '• Du er på barsel i dag.', home: '• Du arbejder hjemmefra i dag.' },
    count: (total, overdue) => overdue ? `${total}, heraf ${overdue} overskredet` : `${total}`,
    todos: (count, titles) => `• To-dos der forfalder i dag eller er overskredet (${count}): ${titles}`,
    away: 'Væk i dag', home: 'Hjemmefra',
    reviews: (count, titles) => `• Guides til gennemgang (${count}): ${titles}`,
    improvements: (count, titles) => `• Forbedringer med frist denne uge (${count}): ${titles}`,
    ask: (first, second) => second ? `Spørg fx «${first}» eller «${second}»` : `Spørg fx «${first}»`,
    questions: ['hvilke opgaver har jeg i morgen?', 'hvem har ferie næste uge?'],
  },
  en: {
    greeting: 'Good morning', source: 'Today\'s overview', more: n => `and ${n} more`,
    shifts: roles => `• Shifts today: ${roles}`, noShifts: '• No shifts registered today.', unnamed: 'unnamed task',
    own: { sick: '• You are on sick leave today.', vacation: '• You are on vacation today.', parental: '• You are on parental leave today.', home: '• You are working from home today.' },
    count: (total, overdue) => overdue ? `${total}, ${overdue} overdue` : `${total}`,
    todos: (count, titles) => `• To-dos due today or overdue (${count}): ${titles}`,
    away: 'Away today', home: 'Working from home',
    reviews: (count, titles) => `• Guides due for review (${count}): ${titles}`,
    improvements: (count, titles) => `• Improvement deadlines this week (${count}): ${titles}`,
    ask: (first, second) => second ? `Ask e.g. “${first}” or “${second}”` : `Ask e.g. “${first}”`,
    questions: ['what are my tasks tomorrow?', 'who is on vacation next week?'],
  },
  fi: {
    greeting: 'Huomenta', source: 'Päivän yhteenveto', more: n => `ja ${n} muuta`,
    shifts: roles => `• Vuorot tänään: ${roles}`, noShifts: '• Ei kirjattuja vuoroja tänään.', unnamed: 'nimetön tehtävä',
    own: { sick: '• Olet sairauslomalla tänään.', vacation: '• Olet lomalla tänään.', parental: '• Olet perhevapaalla tänään.', home: '• Teet etätyötä tänään.' },
    count: (total, overdue) => overdue ? `${total}, joista ${overdue} myöhässä` : `${total}`,
    todos: (count, titles) => `• Tänään erääntyvät tai myöhässä olevat to-do-tehtävät (${count}): ${titles}`,
    away: 'Poissa tänään', home: 'Etätyössä',
    reviews: (count, titles) => `• Tarkistettavat oppaat (${count}): ${titles}`,
    improvements: (count, titles) => `• Parannusten määräajat tällä viikolla (${count}): ${titles}`,
    ask: (first, second) => second ? `Kysy esim. «${first}» tai «${second}»` : `Kysy esim. «${first}»`,
    questions: ['mitä tehtäviä minulla on huomenna?', 'kuka on lomalla ensi viikolla?'],
  },
  sv: {
    greeting: 'God morgon', source: 'Dagens översikt', more: n => `och ${n} till`,
    shifts: roles => `• Pass idag: ${roles}`, noShifts: '• Inga registrerade pass idag.', unnamed: 'uppgift utan namn',
    own: { sick: '• Du är sjukskriven idag.', vacation: '• Du är på semester idag.', parental: '• Du är föräldraledig idag.', home: '• Du jobbar hemifrån idag.' },
    count: (total, overdue) => overdue ? `${total}, varav ${overdue} försenade` : `${total}`,
    todos: (count, titles) => `• Att göra som förfaller idag eller är försenat (${count}): ${titles}`,
    away: 'Borta idag', home: 'Hemarbete',
    reviews: (count, titles) => `• Guider att granska (${count}): ${titles}`,
    improvements: (count, titles) => `• Förbättringar med frist den här veckan (${count}): ${titles}`,
    ask: (first, second) => second ? `Fråga t.ex. «${first}» eller «${second}»` : `Fråga t.ex. «${first}»`,
    questions: ['vilka uppgifter har jag imorgon?', 'vem har semester nästa vecka?'],
  },
}

const GREETING = {
  da: /^god ?morgen(?: (?:hubert|hubi|bot|botten|chatbot))?(?= |$)/u,
  en: /^good morning(?: (?:hubert|hubi|bot|chatbot))?(?= |$)/u,
  fi: /^(?:hyvää )?huomenta(?: (?:hubert|hubi|bot|botti))?(?= |$)/u,
  sv: /^god ?morgon(?: (?:hubert|hubi|bot|botten|chatbot))?(?= |$)/u,
}
// Every phrase must be the whole question, so "hvad skal jeg i dag i Word-Puzzle" and lunch questions are left alone.
const PHRASES = {
  da: /^(?:hvad skal jeg(?: lave| foretage mig)? i ?dag|hvad sker der i ?dag|hvad foregår der i ?dag|hvad har jeg på programmet i ?dag|(?:giv mig |vis mig )?(?:et )?overblik over (?:i ?dag|dagen)|(?:giv mig |vis mig )?dagens overblik)$/u,
  en: /^(?:what(?:'s| is) (?:on|happening|going on)(?: for)? today|what do i have (?:on )?today|(?:give me |show me )?(?:an )?(?:overview|summary|briefing) of today|today's (?:overview|briefing)|(?:my )?(?:daily|morning) briefing)$/u,
  fi: /^(?:mitä minulla on tänään|mitä tänään tapahtuu|mitä tapahtuu tänään|anna minulle (?:yhteenveto|katsaus) (?:tästä päivästä|tänään)|päivän yhteenveto)$/u,
  sv: /^(?:vad har jag i ?dag|vad händer i ?dag|vad ska jag i ?dag|vad är på gång i ?dag|ge mig en översikt över (?:i ?dag|dagen)|dagens översikt)$/u,
}

const clean = value => String(value).normalize('NFKC').toLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}'\s-]/gu, ' ').replace(/\s+/g, ' ').trim()

/** `{ language }` (the question's own language) when the whole question asks for the morning briefing, else null. */
function matchBriefing(question) {
  if (typeof question !== 'string' || question.length > 160) return null
  let q = clean(question)
  if (!q) return null
  let greeted = null
  for (const [language, pattern] of Object.entries(GREETING)) {
    const match = pattern.exec(q)
    if (!match) continue
    greeted = language
    q = q.slice(match[0].length).trim()
    break
  }
  if (!q) return greeted ? { language: greeted } : null
  for (const [language, pattern] of Object.entries(PHRASES)) if (pattern.test(q)) return { language }
  return null
}
const isBriefingQuestion = question => matchBriefing(question) !== null

const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const isoDay = value => { const day = String(value || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '' }
const array = value => Array.isArray(value) ? value : []
const title = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_LENGTH)
const firstName = name => { const text = String(name || '').trim(); return (text.includes('@') ? text.split('@')[0] : text).split(/\s+/)[0] || '' }

/** Names or titles for one line: the first few, the rest counted. */
const named = (items, limit, t) => items.length > limit ? `${items.slice(0, limit).join(', ')} ${t.more(items.length - limit)}` : items.join(', ')

function briefingAnswer({ principal, teams, readTeam, readShared, creatorEmail, language = 'da', now = new Date() }) {
  const t = T[language] || T.da
  const scope = array(teams)
  const me = norm(principal.email)
  const today = dateString(now)
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7 - (now.getDay() || 7))
  const weekEnd = dateString(sunday)
  const day = value => formatDay(value, language, { now })
  const people = listPeople(scope, readTeam, creatorEmail)
  const self = people.find(person => person.email === me)
  const lines = []

  const first = firstName(principal.name)
  lines.push(`${t.greeting}${first ? ` ${first}` : ''} – ${day(today)}`)

  const identifiers = team => self?.memberships.find(member => member.teamId === team.teamId)?.identifiers || new Set([me])
  const roles = []
  for (const team of scope) {
    for (const row of loadShifts(team, readTeam).onDay(today)) if (identifiers(team).has(norm(row.employeeId))) roles.push(title(row.roleName) || t.unnamed)
  }
  const uniqueRoles = [...new Set(roles)]
  lines.push(uniqueRoles.length ? t.shifts(uniqueRoles.join(', ')) : t.noShifts)

  let status = null
  for (const team of scope) {
    const absence = absenceFor(team, readTeam).typeOn(me, today)
    if (absence === 'sick') { status = 'sick'; break }
    if (absence) status = absence === 'parental' || status === 'parental' ? 'parental' : 'vacation'
  }
  if (!status && scope.some(team => homeOfficeFor(team, readTeam)(me, today))) status = 'home'
  if (status) lines.push(t.own[status])

  const todos = []
  const addTodo = (rawTitle, due, rank) => { const text = title(rawTitle); const date = isoDay(due); if (text && date && date <= today) todos.push({ title: text, due: date, rank }) }
  for (const team of scope) {
    for (const todo of array(readTeam(team, `todos-personal-${me}`))) {
      if (todo && (todo.status ?? (todo.done ? 'completed' : 'open')) !== 'completed') addTodo(todo.title, todo.dueDate, 0)
    }
    for (const project of array(readTeam(team, 'projects'))) {
      if (!project || project.status === 'completed') continue
      if (norm(project.createdBy) === me || array(project.teamMembers).some(member => norm(member?.email) === me)) addTodo(project.title, project.dueDate, 1)
    }
  }
  todos.sort((a, b) => a.due.localeCompare(b.due) || a.rank - b.rank || a.title.localeCompare(b.title))
  if (todos.length) lines.push(t.todos(t.count(todos.length, todos.filter(todo => todo.due < today).length), named(todos.map(todo => todo.title), MAX_TITLES, t)))

  const away = new Set()
  const home = new Set()
  for (const team of scope) {
    const absence = absenceFor(team, readTeam)
    const homeOffice = homeOfficeFor(team, readTeam)
    for (const person of people) {
      if (person.email === me || !person.memberships.some(member => member.teamId === team.teamId)) continue
      if (absence.typeOn(person.email, today)) away.add(person.name)
      else if (homeOffice(person.email, today)) home.add(person.name)
    }
  }
  for (const name of away) home.delete(name)
  const sorted = set => [...set].sort((a, b) => a.localeCompare(b))
  const teamParts = [
    away.size ? `${t.away}: ${named(sorted(away), MAX_NAMES, t)}` : '',
    home.size ? `${t.home}: ${named(sorted(home), MAX_NAMES, t)}` : '',
  ].filter(Boolean)
  if (teamParts.length) lines.push(`• ${teamParts.join(' · ')}`)

  const reviews = new Map()
  for (const team of scope) {
    for (const guide of array(readTeam(team, LIBRARIES.guides.items))) {
      if (!guide?.id || !guide.reviewIntervalMonths || !Number.isFinite(guide.nextReviewAt) || norm(guide.responsibleEmail || guide.author) !== me) continue
      const due = dateString(new Date(guide.nextReviewAt))
      const text = title(guide.title)
      if (due <= today && text && !reviews.has(guide.id)) reviews.set(guide.id, { title: text, due })
    }
  }
  const due = [...reviews.values()].sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
  if (due.length) lines.push(t.reviews(t.count(due.length, due.filter(review => review.due < today).length), named(due.map(review => review.title), MAX_TITLES, t)))

  const deadlines = []
  for (const item of typeof readShared === 'function' ? array(readShared('improvement-cases')) : []) {
    if (!item || Object.hasOwn(item, 'deletedAt') || ['completed', 'declined'].includes(item.status)) continue
    const mine = array(item.assignments).filter(assignment => norm(assignment?.email) === me && assignment.status !== 'declined')
    if (!mine.length) continue
    const dates = [isoDay(item.dueDate), isoDay(item.feedbackDueDate), ...mine.filter(assignment => assignment.status === 'pending').map(assignment => isoDay(assignment.responseDueDate))].filter(value => value && value <= weekEnd)
    const text = title(item.title)
    if (dates.length && text) deadlines.push({ title: text, due: dates.sort()[0] })
  }
  deadlines.sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title))
  if (deadlines.length) lines.push(t.improvements(deadlines.length, named(deadlines.map(entry => `${entry.title} (${day(entry.due)})`), MAX_TITLES, t)))

  lines.push('', t.ask(...t.questions))
  return { mode: 'data', text: lines.join('\n'), sources: scope.map(team => ({ kind: 'insight', teamId: team.teamId, title: `${team.abbreviation || team.teamId} · ${t.source}` })) }
}

module.exports = { briefingAnswer, isBriefingQuestion, matchBriefing }
