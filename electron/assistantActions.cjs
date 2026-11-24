// Genkender handlings-hensigter i et Hubert-spoergsmaal (fx "opret en
// ferieanmodning fra ... til ...") og udtraekker parametre - REN LAESNING,
// ingen skrivning sker her. Selve skrivningen sker foerst i renderer'en,
// naar brugeren har bekraeftet forslaget (se src/components/HubAssistant.tsx),
// via de SAMME delte funktioner som de manuelle formularer bruger
// (src/lib/vacationRequests.ts / src/lib/personalTodos.ts) - ingen ny,
// uafhaengig skrivevej og ingen omgaaelse af eksisterende rettighedstjek.
// Kraever et eksplicit oprettelses-udsagnsord direkte foran selve ordet -
// ren tilstedevaerelse af "ferieanmodning" er IKKE nok (fx "hvor mange
// ferieanmodninger afventer?" er et opslag, ikke en oprettelses-hensigt).
const VACATION_TRIGGERS = /(?:opret|lav|anmod om|book)\w*\s+(?:en\s+)?ferie(?:anmodning\w*)?\b|(?:create|submit|make|request)\w*\s+(?:a\s+)?vacation(?:\s+request)?\b|(?:tee|luo|j[äa]t[äa])\w*\s+loma(?:-anomu\w*)?\b|(?:skapa|gör|lägg in|boka)\w*\s+(?:en\s+)?semester(?:ansökan\w*)?(?=$|[^\p{L}])|ansök\w*\s+om\s+semester/iu
const LOOKUP_MARKERS = /hvor mange|afventer|status|hvornår|hvem|godkendt|how many|pending|when|who|approved|montako|odottaa|milloin|kuka|hyväksy|hur många|väntar|när|vem|godkänd/iu
const TODO_TRIGGERS = /(?:opret|lav|tilf[øo]j)\w*\s+(?:en\s+)?to-?do|(?:create|add|make)\w*\s+(?:a\s+)?to-?do|(?:luo|lis[äa]{2})\w*\s+to-?do|(?:skapa|lägg till|gör)\s+(?:en\s+)?(?:to-?do|att göra)/iu
// Et kort svar, der ligner et NYT spoergsmaal (spoergsmaalstegn eller et
// hvem/hvad/hvornaar-ord), skal ALDRIG tolkes som svar paa en tidligere
// ufuldstaendig handling - saa faar den nye samtale lov at starte forfra.
const QUESTION_MARKERS = /[?]|(?:^|\s)(?:hvem|hvad|hvornår|hvor|hvilken|hvilke|who|what|when|where|which|kuka|mikä|mitä|milloin|missä|vem|vad|när|var|vilken|vilka)(?=\s|$)/iu
const { calendarMatches } = require('./assistantDates.cjs')
const { formatDay, formatRange } = require('./assistantDateFormat.cjs')
const { detectTeamAction } = require('./assistantTeamActions.cjs')
const { parseTimeText } = require('./assistantTimeText.cjs')

// `f` formats the ISO days of a proposal as people read them; Finnish leaves the weekday out where it would need a case ending.
const TEXT = {
  da: {
    vacationSummary: (start, end, f) => start === end ? `Opret en ferieanmodning for ${f.day(start)}?` : `Opret en ferieanmodning fra ${f.day(start)} til ${f.day(end)}?`,
    vacationNoDates: (from, to, f) => `Jeg forstod at du vil oprette en ferieanmodning, men jeg kunne ikke se en start- og slutdato. Skriv fx "opret ferie fra ${f.typed(from)} til ${f.typed(to)}" eller "opret ferie næste uge".`,
    todoSummary: (title, due, f, time) => `Opret en personlig to-do: "${title}"${due ? ` med forfaldsdato ${f.day(due)}` : ''}${time ? ` kl. ${time}` : ''}?`,
    todoNoTitle: 'Jeg forstod at du vil oprette en to-do, men jeg kunne ikke se en titel. Prøv fx "opret en to-do: ring til IT".',
    vacationContext: 'opret ferie', todoContext: 'opret en to-do',
  },
  en: {
    vacationSummary: (start, end, f) => start === end ? `Create a vacation request for ${f.day(start)}?` : `Create a vacation request from ${f.day(start)} to ${f.day(end)}?`,
    vacationNoDates: (from, to, f) => `I understood you want to create a vacation request, but I could not find a start and end date. Try e.g. "create vacation from ${f.typed(from)} to ${f.typed(to)}" or "create vacation next week".`,
    todoSummary: (title, due, f, time) => `Create a personal to-do: "${title}"${due ? `, due ${f.day(due)}` : ''}${time ? ` at ${time}` : ''}?`,
    todoNoTitle: 'I understood you want to create a to-do, but I could not find a title. Try e.g. "create a to-do: call IT".',
    vacationContext: 'create vacation', todoContext: 'create a to-do',
  },
  fi: {
    vacationSummary: (start, end, f) => start === end ? `Luodaanko loma-anomus päivälle ${f.day(start, { weekday: false })}?` : `Luodaanko loma-anomus ${f.range(start, end)}?`,
    vacationNoDates: (from, to, f) => `Ymmärsin, että haluat luoda loma-anomuksen, mutta en löytänyt alkamis- ja päättymispäivää. Kokeile esim. "luo loma ${f.typed(from)}–${f.typed(to)}" tai "luo loma ensi viikolla".`,
    todoSummary: (title, due, f, time) => `Luodaanko henkilökohtainen to-do: "${title}"${due ? `, eräpäivä ${f.day(due, { weekday: false })}` : ''}${time ? ` klo ${time}` : ''}?`,
    todoNoTitle: 'Ymmärsin, että haluat luoda to-don, mutta en löytänyt otsikkoa. Kokeile esim. "luo to-do: soita IT:lle".',
    vacationContext: 'luo loma', todoContext: 'luo to-do',
  },
  sv: {
    vacationSummary: (start, end, f) => start === end ? `Ska jag skapa en semesteransökan för ${f.day(start)}?` : `Ska jag skapa en semesteransökan från ${f.day(start)} till ${f.day(end)}?`,
    vacationNoDates: (from, to, f) => `Jag förstod att du vill skapa en semesteransökan, men jag hittade inget start- och slutdatum. Försök t.ex. "skapa semester från ${f.typed(from)} till ${f.typed(to)}" eller "skapa semester nästa vecka".`,
    todoSummary: (title, due, f, time) => `Ska jag skapa en personlig att göra-uppgift: "${title}"${due ? `, förfallodatum ${f.day(due)}` : ''}${time ? ` kl. ${time}` : ''}?`,
    todoNoTitle: 'Jag förstod att du vill skapa en att göra-uppgift, men jag hittade ingen titel. Försök t.ex. "skapa en att göra: ring IT".',
    vacationContext: 'skapa semester', todoContext: 'skapa en att göra',
  },
}

/** To eksplicitte datoer i den raekkefoelge de staar ('yyyy-MM-dd', 'dd/mm/yyyy' eller skrevet som "21. sep." / "21.9." naar `now` er med). */
function extractDateRange(question, now) {
  const isoMatches = [...question.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)].map(m => m[0])
  const euroMatches = [...question.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g)]
    .map(m => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
  const dates = [...isoMatches, ...euroMatches]
  // Two written days (what Hubert itself writes in its examples) are a range; one day is left to the vague-period logic.
  if (!dates.length && now) {
    const written = calendarMatches(question, now).sort((a, b) => a.index - b.index).map(item => item.date)
    if (written.length >= 2) dates.push(...written)
  }
  if (dates.length === 1) return { start: dates[0], end: dates[0] }
  if (dates.length < 2) return null
  const [start, end] = [...dates].sort()
  return { start, end }
}

/** Teksten efter et "to-do: ..."-triggerord, ellers resten af spørgsmålet efter selve triggerfrasen. */
function extractTodoTitle(question) {
  const afterColon = question.match(/(?:to-?do|att göra(?:-uppgift)?)\s*[:\-–]\s*(.+)$/iu)
  if (afterColon && afterColon[1].trim()) return afterColon[1].trim().slice(0, 200)
  const stripped = question.replace(TODO_TRIGGERS, '').replace(/^[:\-–,\s]+/, '').trim()
  return stripped.length > 1 ? stripped.slice(0, 200) : null
}

// Vague periods ("next week", "monday to friday", "tomorrow") resolve to a concrete range; anything else is asked about.
const WEEKDAY_WORDS = [['søndag', 'sunday', 'sunnuntai', 'söndag'], ['mandag', 'monday', 'maanantai', 'måndag'], ['tirsdag', 'tuesday', 'tiistai', 'tisdag'], ['onsdag', 'wednesday', 'keskiviikko'], ['torsdag', 'thursday', 'torstai'], ['fredag', 'friday', 'perjantai'], ['lørdag', 'saturday', 'lauantai', 'lördag']]
const weekdayToken = () => new RegExp(`(?<![\\p{L}])(${WEEKDAY_WORDS.flat().join('|')})\\p{L}*`, 'giu')
const isoDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const plusDays = (date, days) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy }
const MAX_VACATION_DAYS = 21

function vagueRange(question, now, resolveDates) {
  if (typeof resolveDates !== 'function') return null
  const q = question.toLowerCase()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const noon = value => new Date(`${value}T12:00:00`)
  const weekdays = [...q.matchAll(weekdayToken())].map(match => ({ index: match.index, end: match.index + match[0].length, day: WEEKDAY_WORDS.findIndex(words => words.includes(match[1])) }))
  const period = resolveDates(q.replace(weekdayToken(), ' '), now)
  const fullWeek = period && noon(period.end) - noon(period.start) === 6 * 86400000 && noon(period.start).getDay() === 1
  let range = null
  if (weekdays.length >= 2 && !/\b(?:og|and|ja|och)\b/u.test(q.slice(weekdays[0].end, weekdays[1].index))) {
    const offset = day => (day + 6) % 7
    if (fullWeek) range = { start: isoDay(plusDays(noon(period.start), offset(weekdays[0].day))), end: isoDay(plusDays(noon(period.start), offset(weekdays[1].day))) }
    else {
      let distance = (weekdays[0].day - today.getDay() + 7) % 7
      if (distance === 0 && /\b(?:næste|next|ensi|nästa|seuraava)\b/u.test(q)) distance = 7
      const start = plusDays(today, distance)
      range = { start: isoDay(start), end: isoDay(plusDays(start, (weekdays[1].day - start.getDay() + 7) % 7)) }
    }
  } else {
    const found = resolveDates(q, now)
    if (!found) return null
    // A whole week means its workdays.
    range = noon(found.end) - noon(found.start) === 6 * 86400000 && noon(found.start).getDay() === 1 ? { start: found.start, end: isoDay(plusDays(noon(found.start), 4)) } : found
  }
  const todayIso = isoDay(today)
  if (range.end < todayIso) return null
  if (range.start < todayIso) range = { ...range, start: todayIso }
  return (noon(range.end) - noon(range.start)) / 86400000 + 1 > MAX_VACATION_DAYS ? null : range
}
// Next Monday-Friday: the concrete example in the follow-up question.
function exampleWeek(now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const monday = plusDays(today, (8 - today.getDay()) % 7 || 7)
  return [isoDay(monday), isoDay(plusDays(monday, 4))]
}
// A to-do's due date from the words in its title: one day, an ISO date, or a whole week (its Friday); never in the past.
function dueDateOf(title, now, resolveDates) {
  if (typeof resolveDates !== 'function') return null
  const found = resolveDates(title.toLowerCase(), now)
  if (!found) return null
  const start = new Date(`${found.start}T12:00:00`)
  const days = (new Date(`${found.end}T12:00:00`) - start) / 86400000
  const due = days === 0 ? found.start : days === 6 && start.getDay() === 1 ? isoDay(plusDays(start, 4)) : null
  return due && due >= isoDay(now) ? due : null
}
// "Do it for me" after a how-to question about vacation or a to-do.
const HOW_TO_PREV = /^(?:hvordan|hvorledes|how|miten|kuinka|hur)\b/iu
const VACATION_WORDS = /\bferie|\bvacation|\bloma|\bsemester|\bholiday/iu
const TODO_WORDS = /to-?do|att göra/iu
const DO_IT = /^(?:(?:ja|yes|ok|okay|kyllä|joo|jo)[, ]\s*)?(?:(?:tak|please|kiitos|tack)[, ]\s*)?(?:(?:kan du|could you|can you|voitko|skulle du)\s+)?(?:gør|gøre|lav|lave|opret|oprette|søg|søge|book|booke|do|make|create|submit|request|tee|luo|hae|lähetä|gör|göra|skapa|ansök|boka|skicka)\s+(?:det|den|en|dem|it|that|one|se|sen|ett)(?:\s+(?:for mig|for me|åt mig|puolestani|för mig))?(?:\s+(.+))?$/iu
const YES = /^(?:ja|ja tak|ja tack|yes|yes please|please|ok|okay|ok tak|kyllä|kyllä kiitos|joo|jo tack|jo)$/iu

/**
 * Returnerer null (ingen handlings-hensigt), { type: 'unresolved', message }
 * (hensigt genkendt, men manglende parametre), eller { type, params, summary }.
 * `previousQuestion` bruges KUN til aet genkende en direkte opfoelgning paa et
 * tidligere ufuldstaendigt handlings-forslag (fx et svar med blot datoer efter
 * "opret en ferieanmodning") - aldrig til at afgoere adgang eller data.
 */
function detectActionIntent(question, language, previousQuestion, { now = new Date(), resolveDates, original, people, allPeople, self } = {}) {
  const q = typeof question === 'string' ? question.trim() : ''
  if (!q) return null
  // Sick leave, home office, notes, messages, shared to-dos and high-fives; a plain vacation request or personal to-do keeps its own path.
  const team = detectTeamAction(typeof original === 'string' && original.trim() ? original : q, language, { now, resolveDates, people, allPeople, self, dueDateOf: title => dueDateOf(title, now, resolveDates) })
  if (team && (team.type === 'team-todo' || !(VACATION_TRIGGERS.test(q) || TODO_TRIGGERS.test(q)))) return team
  if (LOOKUP_MARKERS.test(q)) return null
  const text = TEXT[language] || TEXT.da
  const f = {
    day: (iso, options) => formatDay(iso, language, { now, ...options }),
    range: (start, end) => formatRange(start, end, language, { now }),
    typed: iso => formatDay(iso, language, { now, weekday: false }),
  }
  const prev = typeof previousQuestion === 'string' ? previousQuestion.trim() : ''
  // En opfoelgning taeller kun med hvis det FORRIGE spoergsmaal reelt manglede
  // parameteren (udsagnsord til stede, men ingen udtraekkelig dato/titel) -
  // ellers ville en efterfoelgende "tak" fejlagtigt genstarte et allerede
  // afsluttet forslag. Desuden ikke hvis nogen af de to ligner et opslag.
  const howTo = prev && HOW_TO_PREV.test(prev) ? (VACATION_WORDS.test(prev) ? 'vacation' : TODO_WORDS.test(prev) ? 'todo' : null) : null
  const doIt = howTo ? DO_IT.exec(q.replace(/[?!.,]+\s*$/u, '')) : null
  if (howTo && (doIt || YES.test(q.replace(/[?!.,]+\s*$/u, '')))) {
    // "Do it for me" right after a how-to: propose the action, or ask for the missing part.
    if (howTo === 'vacation') {
      const rest = doIt?.[1]?.trim()
      const range = rest && (extractDateRange(rest, now) || vagueRange(rest, now, resolveDates))
      if (range) return { type: 'vacation-request', params: { startDate: range.start, endDate: range.end }, summary: text.vacationSummary(range.start, range.end, f) }
      return { type: 'unresolved', message: text.vacationNoDates(...exampleWeek(now), f), context: text.vacationContext }
    }
    return { type: 'unresolved', message: text.todoNoTitle, context: text.todoContext }
  }
  const canContinue = !!prev && !LOOKUP_MARKERS.test(prev) && !QUESTION_MARKERS.test(q)
  const continuingVacation = canContinue && VACATION_TRIGGERS.test(prev) && !extractDateRange(prev, now) && !vagueRange(prev, now, resolveDates)
  if (VACATION_TRIGGERS.test(q) || continuingVacation) {
    const range = extractDateRange(q, now) || vagueRange(q, now, resolveDates)
    if (!range) return { type: 'unresolved', message: text.vacationNoDates(...exampleWeek(now), f) }
    return { type: 'vacation-request', params: { startDate: range.start, endDate: range.end }, summary: text.vacationSummary(range.start, range.end, f) }
  }
  const continuingTodo = canContinue && TODO_TRIGGERS.test(prev) && !extractTodoTitle(prev)
  if (TODO_TRIGGERS.test(q) || continuingTodo) {
    const title = extractTodoTitle(q)
    if (!title) return { type: 'unresolved', message: text.todoNoTitle }
    // "kl. 10" becomes the to-do's time; without a date it is today, or tomorrow once that time has passed.
    const timed = parseTimeText(title)
    if (timed.startTime && timed.title) {
      const clockNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const due = dueDateOf(timed.title, now, resolveDates) || isoDay(timed.startTime > clockNow ? now : plusDays(now, 1))
      const time = timed.endTime ? `${timed.startTime}–${timed.endTime}` : timed.startTime
      return { type: 'personal-todo', params: { title: timed.title, dueDate: due, startTime: timed.startTime, ...(timed.endTime ? { endTime: timed.endTime } : {}) }, summary: text.todoSummary(timed.title, due, f, time) }
    }
    const due = dueDateOf(title, now, resolveDates)
    return { type: 'personal-todo', params: { title, ...(due ? { dueDate: due } : {}) }, summary: text.todoSummary(title, due, f) }
  }
  return null
}

// The example a user can type back: next Monday-Friday written the way Hubert writes days ("21. sep.").
const exampleDates = (language, now) => exampleWeek(now).map(day => formatDay(day, language, { now, weekday: false }))

module.exports = { detectActionIntent, extractDateRange, extractTodoTitle, exampleDates }
