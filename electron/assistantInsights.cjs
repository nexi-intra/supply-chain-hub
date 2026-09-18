// Kryds-modul-indsigter: deterministiske svar der KOMBINERER personer, ferie,
// sygdom, hjemmearbejde og vagter. Ingen model kraeves; samme adgangsmodel som
// resten af assistenten (kun principal.teams, kun godkendte data, aldrig
// noter/aarsager, aldrig andre teams). Svarer paa spoergsmaalets sprog.
const { listPeople, aliasesFor, canonical, bounded } = require('./assistantPeople.cjs')

const norm = value => String(value || '').normalize('NFKC').trim().toLowerCase()
const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const addDays = (date, days) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy }
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
    vacation: 'Ferie', sick: 'Sygemeldt', home: 'Hjemmearbejde', work: 'På arbejde', task: 'Opgave', atWork: 'På arbejde', absent: 'Fravær',
    whereTitle: (name, date) => `Status for ${name} (${date})`,
    noRecords: name => `Ingen registreringer for ${name} i perioden — det betyder ikke nødvendigvis fri.`,
    backOn: (name, type, end, back) => `${name} er ${type === 'sick' ? 'sygemeldt' : 'på ferie'} til og med ${end} og er tilbage ${back}.`,
    backNone: name => `${name} har intet aktivt eller kommende registreret fravær.`,
    backUpcoming: (name, type, start, end, back) => `${name} har ${type === 'sick' ? 'en sygemelding' : 'ferie'} fra ${start} til ${end} og er tilbage ${back}.`,
    availableTitle: range => `Tilgængelighed (${range})`,
    availableAtWork: 'På arbejde', availableHome: 'Hjemmearbejde (arbejder, men hjemmefra)', availableAway: 'Fraværende',
    availableNone: 'Ingen godkendte personer fundet i de valgte teams.',
    workloadTitle: (range, most) => `${most ? 'Flest' : 'Færrest'} registrerede opgaver (${range})`,
    workloadNone: 'Ingen registrerede opgaver i perioden.',
    workloadLine: (name, count) => `${name} — ${count} ${count === 1 ? 'opgave' : 'opgaver'}`,
    conflictTitle: range => `Vagter der falder sammen med registreret fravær (${range})`,
    conflictNone: 'Ingen vagter falder sammen med godkendt fravær i perioden.',
    conflictLine: (date, name, role, type) => `${date} · ${name}: ${role} — samtidig ${type === 'sick' ? 'sygemeldt' : 'på ferie'}`,
    disclaimer: 'Kun registrerede data; manglende registrering betyder ikke nødvendigvis fri.',
    unknown: 'Opgave/rolle uden navn',
  },
  en: {
    vacation: 'Vacation', sick: 'Sick leave', home: 'Working from home', work: 'At work', task: 'Task', atWork: 'At work', absent: 'Absent',
    whereTitle: (name, date) => `Status for ${name} (${date})`,
    noRecords: name => `No records for ${name} in this period — this does not necessarily mean time off.`,
    backOn: (name, type, end, back) => `${name} is ${type === 'sick' ? 'on sick leave' : 'on vacation'} through ${end} and is back on ${back}.`,
    backNone: name => `${name} has no active or upcoming recorded absence.`,
    backUpcoming: (name, type, start, end, back) => `${name} has ${type === 'sick' ? 'sick leave' : 'vacation'} from ${start} to ${end} and is back on ${back}.`,
    availableTitle: range => `Availability (${range})`,
    availableAtWork: 'At work', availableHome: 'Working from home', availableAway: 'Absent',
    availableNone: 'No approved people found in the selected teams.',
    workloadTitle: (range, most) => `${most ? 'Most' : 'Fewest'} recorded tasks (${range})`,
    workloadNone: 'No recorded tasks in this period.',
    workloadLine: (name, count) => `${name} — ${count} ${count === 1 ? 'task' : 'tasks'}`,
    conflictTitle: range => `Shifts that overlap recorded absence (${range})`,
    conflictNone: 'No shifts overlap approved absence in this period.',
    conflictLine: (date, name, role, type) => `${date} · ${name}: ${role} — also ${type === 'sick' ? 'on sick leave' : 'on vacation'}`,
    disclaimer: 'Recorded data only; a missing record does not necessarily mean time off.',
    unknown: 'Unnamed task/role',
  },
  fi: {
    vacation: 'Loma', sick: 'Sairauslomalla', home: 'Etätyössä', work: 'Töissä', task: 'Tehtävä', atWork: 'Töissä', absent: 'Poissa',
    whereTitle: (name, date) => `Tilanne: ${name} (${date})`,
    noRecords: name => `Ei kirjauksia henkilölle ${name} ajanjaksolla — tämä ei välttämättä tarkoita vapaata.`,
    backOn: (name, type, end, back) => `${name} on ${type === 'sick' ? 'sairauslomalla' : 'lomalla'} ${end} asti ja palaa ${back}.`,
    backNone: name => `Henkilöllä ${name} ei ole aktiivista tai tulevaa kirjattua poissaoloa.`,
    backUpcoming: (name, type, start, end, back) => `Henkilöllä ${name} on ${type === 'sick' ? 'sairausloma' : 'loma'} ${start} – ${end} ja hän palaa ${back}.`,
    availableTitle: range => `Saatavuus (${range})`,
    availableAtWork: 'Töissä', availableHome: 'Etätyössä', availableAway: 'Poissa',
    availableNone: 'Valituista tiimeistä ei löytynyt hyväksyttyjä henkilöitä.',
    workloadTitle: (range, most) => `${most ? 'Eniten' : 'Vähiten'} kirjattuja tehtäviä (${range})`,
    workloadNone: 'Ajanjaksolla ei ole kirjattuja tehtäviä.',
    workloadLine: (name, count) => `${name} — ${count} ${count === 1 ? 'tehtävä' : 'tehtävää'}`,
    conflictTitle: range => `Vuorot, jotka osuvat kirjattuun poissaoloon (${range})`,
    conflictNone: 'Yksikään vuoro ei osu hyväksyttyyn poissaoloon ajanjaksolla.',
    conflictLine: (date, name, role, type) => `${date} · ${name}: ${role} — samaan aikaan ${type === 'sick' ? 'sairauslomalla' : 'lomalla'}`,
    disclaimer: 'Vain kirjatut tiedot; puuttuva kirjaus ei välttämättä tarkoita vapaata.',
    unknown: 'Nimetön tehtävä/rooli',
  },
}

// Konservative triggere: maa IKKE kapre eksisterende spor (fx "hvem har ferie
// naeste uge" -> ferie-modulet, "hvem arbejder hjemme" -> hjemmearbejde-sporet).
const INTENTS = {
  whereIs: /(?:hvor er|hvor befinder|where is|where's|missä on|missä .{2,40} on)|(?:^|\s)(?:er|is|onko)\s+\S.{0,40}?\s(?:på arbejde|paa arbejde|på kontoret|at work|in the office|in today|working today|töissä|toimistolla)/iu,
  available: /(?:ledig|ledige|til rådighed|til raadighed|available|(?:is|are)\s+free\b|free to work|vapaa|vapaita|vapaana)|(?:hvem|who|ketkä|ketka)\s+(?:er|is|are|ovat)\s+(?:alle\s+)?(?:på arbejde|paa arbejde|at work|in the office|in today|töissä)/iu,
  back: /(?:hvornår|hvornaar|hvor længe|hvor laenge)\s+(?:er|kommer)\s+\S.{0,40}?\s*(?:tilbage|retur)|when\s+(?:is|will|does)\s+\S.{0,40}?\s*(?:back|return)|how long is\s+\S.{0,40}?\s*(?:away|gone|off)|milloin\s+\S.{0,40}?\s*(?:palaa|on takaisin|tulee takaisin)/iu,
  workload: /(?:flest|færrest|faerrest|most|fewest|least|eniten|vähiten|vahiten)\s+(?:registrerede\s+)?(?:opgaver|vagter|tasks|shifts|assignments|tehtäviä|tehtavia|vuoroja)|(?:hvem har|who has|kenellä on|kenella on)\s+(?:flest|færrest|faerrest|most|fewest|least|eniten|vähiten|vahiten)/iu,
  conflicts: /(?:kolliderer|konflikt|overlapper|clash|conflict|overlap|päällekkäin|paallekkain)/iu,
}
// "available"-ord optraeder ogsaa i system-/opdaterings-spoergsmaal; de skal
// ikke udloese personoversigten.
const AVAILABLE_BLOCKERS = /opdater|update|version|app\b|modul|module|system|päivit|paivit|download|installer/iu

function absenceFor(team, readTeam) {
  const vacations = (readTeam(team, 'vacation-entries') || []).filter(entry => entry && entry.status === 'approved')
  const sick = (readTeam(team, 'sick-leave-entries') || []).filter(entry => entry && entry.status === 'approved')
  const covers = (entry, date) => String(entry.startDate || '').slice(0, 10) <= date && String(entry.endDate || entry.startDate || '').slice(0, 10) >= date
  return {
    vacations, sick,
    typeOn: (email, date) => {
      if (sick.some(entry => norm(entry.userEmail) === email && covers(entry, date))) return 'sick'
      if (vacations.some(entry => norm(entry.userEmail) === email && covers(entry, date))) return 'vacation'
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
    return (patterns[email]?.weekdays || []).includes(new Date(`${date}T12:00:00`).getDay())
  }
}

function shiftsFor(team, readTeam) {
  const roles = readTeam(team, 'shift-roles') || []
  const assignments = (readTeam(team, 'shift-assignments') || []).filter(item => item && /^\d{4}-\d{2}-\d{2}/.test(String(item.date || '')))
  return { roles, assignments, roleName: (roleId, t) => roles.find(role => role?.id === roleId)?.name || t.unknown }
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

const AMBIGUOUS = { da: 'Hvilken person mener du? Vælg en af personerne nedenfor.', en: 'Which person do you mean? Choose one of the people below.', fi: 'Ketä henkilöä tarkoitat? Valitse henkilö alta.' }
const SOURCE_TITLE = { da: 'Personstatus (vagter, ferie, sygdom, hjemmearbejde)', en: 'People status (shifts, vacation, sickness, home office)', fi: 'Henkilötilanne (vuorot, lomat, sairaudet, etätyö)' }

// Hovedindgang. Returnerer et svarobjekt eller null (=fald videre til andre spor).
function insightAnswer({ question, principal, teams, readTeam, creatorEmail, language, resolveDates, selectedPerson, now = new Date() }) {
  const q = norm(question)
  const t = T[language] || T.da
  const today = dateString(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12))
  const guideish = /guide|vejledning|manual|opas|oppaa/.test(q)
  if (guideish) return null

  const intent = INTENTS.back.test(q) ? 'back'
    : INTENTS.workload.test(q) ? 'workload'
    : INTENTS.conflicts.test(q) && /vagt|opgave|shift|task|vuoro|tehtäv|ferie|fravær|fravaer|vacation|absence|loma|poissaolo|syg|sick|saira/.test(q) ? 'conflicts'
    : INTENTS.whereIs.test(q) ? 'whereIs'
    : INTENTS.available.test(q) && !/hjemme(?!fra alle)|home office|from home|etäty|etätö/.test(q) && !AVAILABLE_BLOCKERS.test(q) ? 'available'
    : null
  if (!intent) return null

  const people = listPeople(teams, readTeam, creatorEmail)
  const label = team => team.abbreviation || team.teamId
  const sources = teams.map(team => ({ kind: 'insight', teamId: team.teamId, title: `${label(team)} · ${SOURCE_TITLE[language] || SOURCE_TITLE.da}` }))
  const range = resolveDates(q, now) || { start: today, end: today }
  const rangeLabel = range.start === range.end ? range.start : `${range.start} – ${range.end}`

  // HVOR-ER / STATUS og TILBAGE kraever en genkendt person.
  if (intent === 'whereIs' || intent === 'back') {
    let resolution = findPerson(q, people)
    if (resolution.ambiguous) {
      if (selectedPerson !== undefined) {
        const chosen = people.find(person => person.email === canonical(selectedPerson))
        if (!chosen || !resolution.ambiguous.some(choice => choice.id === chosen.email)) throw new Error('Personvalget passer ikke til spørgsmålet eller de teams, du har adgang til')
        resolution = { person: chosen }
      } else return { mode: 'data', text: AMBIGUOUS[language] || AMBIGUOUS.da, personChoices: resolution.ambiguous, sources: [] }
    }
    const person = resolution.person
    if (!person) return null // ingen genkendt person -> lad andre spor forsoege

    if (intent === 'back') {
      // Aktivt eller foerstkommende fravaer paa tvaers af personens teams.
      let bestEntry = null
      for (const team of teams.filter(team => person.memberships.some(member => member.teamId === team.teamId))) {
        const { vacations, sick } = absenceFor(team, readTeam)
        for (const [list, type] of [[vacations, 'vacation'], [sick, 'sick']]) {
          for (const entry of list) {
            if (norm(entry.userEmail) !== person.email) continue
            const start = String(entry.startDate || '').slice(0, 10)
            const end = String(entry.endDate || entry.startDate || '').slice(0, 10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < today) continue
            if (!bestEntry || start < bestEntry.start) bestEntry = { type, start, end }
          }
        }
      }
      if (!bestEntry) return { mode: 'data', text: `${t.backNone(person.name)}\n\n${t.disclaimer}`, sources, contextQuestion: question }
      const back = dateString(addDays(new Date(`${bestEntry.end}T12:00:00`), 1))
      const text = bestEntry.start <= today ? t.backOn(person.name, bestEntry.type, bestEntry.end, back) : t.backUpcoming(person.name, bestEntry.type, bestEntry.start, bestEntry.end, back)
      return { mode: 'data', text, sources, contextQuestion: question }
    }

    // whereIs: status pr. dag i perioden (typisk en enkelt dag).
    const lines = []
    for (const date of eachDay(range, 14)) {
      let status = null
      for (const team of teams.filter(team => person.memberships.some(member => member.teamId === team.teamId))) {
        const absence = absenceFor(team, readTeam).typeOn(person.email, date)
        if (absence === 'sick') { status = { rank: 0, text: t.sick }; break }
        if (absence === 'vacation') { status = { rank: 1, text: t.vacation }; break }
        const shifts = shiftsFor(team, readTeam)
        const member = person.memberships.find(member => member.teamId === team.teamId)
        const roleNames = shifts.assignments.filter(item => String(item.date).slice(0, 10) === date && member.identifiers.has(norm(item.employeeId))).map(item => shifts.roleName(item.roleId, t))
        const home = homeOfficeFor(team, readTeam)(person.email, date)
        const candidate = roleNames.length ? { rank: 2, text: `${home ? t.home : t.work} — ${t.task}: ${[...new Set(roleNames)].join(', ')}` } : home ? { rank: 3, text: t.home } : null
        if (candidate && (!status || candidate.rank < status.rank)) status = candidate
      }
      lines.push(`• ${date}: ${status ? status.text : '—'}`)
    }
    const anyStatus = lines.some(line => !line.endsWith('—'))
    const header = t.whereTitle(person.name, rangeLabel)
    const body = anyStatus ? lines.join('\n') : t.noRecords(person.name)
    return { mode: 'data', text: `${header}:\n\n${body}\n\n${t.disclaimer}`, sources, range, contextQuestion: question }
  }

  if (intent === 'available') {
    const date = range.start // tilgaengelighed vises pr. foerste dag i perioden
    const atWork = []; const home = []; const away = []
    for (const person of people) {
      let absence = null; let isHome = false
      for (const team of teams.filter(team => person.memberships.some(member => member.teamId === team.teamId))) {
        absence = absence || absenceFor(team, readTeam).typeOn(person.email, date)
        isHome = isHome || homeOfficeFor(team, readTeam)(person.email, date)
      }
      if (absence) away.push(`${person.name} (${absence === 'sick' ? t.sick : t.vacation})`)
      else if (isHome) home.push(person.name)
      else atWork.push(person.name)
    }
    if (!people.length) return { mode: 'data', text: t.availableNone, sources: [], contextQuestion: question }
    const sections = [`${t.availableAtWork} (${atWork.length}):\n${atWork.length ? atWork.sort().map(name => `• ${name}`).join('\n') : '—'}`]
    if (home.length) sections.push(`${t.availableHome} (${home.length}):\n${home.sort().map(name => `• ${name}`).join('\n')}`)
    if (away.length) sections.push(`${t.availableAway} (${away.length}):\n${away.sort().map(name => `• ${name}`).join('\n')}`)
    return { mode: 'data', text: `${t.availableTitle(date)}:\n\n${sections.join('\n\n')}\n\n${t.disclaimer}`, sources, range: { start: date, end: date }, contextQuestion: question }
  }

  if (intent === 'workload') {
    const most = !/færrest|faerrest|fewest|least|vähiten|vahiten/.test(q)
    const counts = new Map()
    for (const team of teams) {
      const shifts = shiftsFor(team, readTeam)
      for (const item of shifts.assignments) {
        const date = String(item.date).slice(0, 10)
        if (date < range.start || date > range.end) continue
        const person = people.find(person => person.memberships.some(member => member.teamId === team.teamId && member.identifiers.has(norm(item.employeeId))))
        if (!person) continue
        counts.set(person.email, { name: person.name, count: (counts.get(person.email)?.count || 0) + 1 })
      }
    }
    if (!counts.size) return { mode: 'data', text: `${t.workloadTitle(rangeLabel, most)}:\n\n${t.workloadNone}`, sources, range, contextQuestion: question }
    const ranked = [...counts.values()].sort((a, b) => (most ? b.count - a.count : a.count - b.count) || a.name.localeCompare(b.name))
    const top = ranked.slice(0, 5)
    return { mode: 'data', text: `${t.workloadTitle(rangeLabel, most)}:\n\n${top.map(entry => `• ${t.workloadLine(entry.name, entry.count)}`).join('\n')}`, sources, range, contextQuestion: question }
  }

  if (intent === 'conflicts') {
    const lines = []
    for (const team of teams) {
      const shifts = shiftsFor(team, readTeam)
      const absence = absenceFor(team, readTeam)
      for (const item of shifts.assignments) {
        const date = String(item.date).slice(0, 10)
        if (date < range.start || date > range.end) continue
        const person = people.find(person => person.memberships.some(member => member.teamId === team.teamId && member.identifiers.has(norm(item.employeeId))))
        if (!person) continue
        const type = absence.typeOn(person.email, date)
        if (type) lines.push({ date, text: `• ${t.conflictLine(date, person.name, shifts.roleName(item.roleId, t), type)}` })
      }
    }
    lines.sort((a, b) => a.date.localeCompare(b.date) || a.text.localeCompare(b.text))
    return { mode: 'data', text: `${t.conflictTitle(rangeLabel)}:\n\n${lines.length ? lines.map(line => line.text).join('\n') : t.conflictNone}`, sources, range, contextQuestion: question }
  }

  return null
}

module.exports = { insightAnswer, INTENTS }
