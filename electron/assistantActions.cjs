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
const VACATION_TRIGGERS = /(?:opret|lav|anmod om|book)\w*\s+(?:en\s+)?ferie(?:anmodning\w*)?\b|(?:create|submit|make|request)\w*\s+(?:a\s+)?vacation(?:\s+request)?\b|(?:tee|luo|j[äa]t[äa])\w*\s+loma(?:-anomu\w*)?\b/iu
const LOOKUP_MARKERS = /hvor mange|afventer|status|hvornår|hvem|godkendt|how many|pending|when|who|approved|montako|odottaa|milloin|kuka|hyväksy/iu
const TODO_TRIGGERS = /(?:opret|lav|tilf[øo]j)\w*\s+(?:en\s+)?to-?do|(?:create|add|make)\w*\s+(?:a\s+)?to-?do|(?:luo|lis[äa]{2})\w*\s+to-?do/iu

const TEXT = {
  da: {
    vacationSummary: (start, end) => start === end ? `Opret en ferieanmodning for ${start}?` : `Opret en ferieanmodning fra ${start} til ${end}?`,
    vacationNoDates: 'Jeg forstod at du vil oprette en ferieanmodning, men jeg kunne ikke se en start- og slutdato. Prøv fx "opret ferie fra 2026-10-05 til 2026-10-10".',
    todoSummary: title => `Opret en personlig to-do: "${title}"?`,
    todoNoTitle: 'Jeg forstod at du vil oprette en to-do, men jeg kunne ikke se en titel. Prøv fx "opret en to-do: ring til IT".',
  },
  en: {
    vacationSummary: (start, end) => start === end ? `Create a vacation request for ${start}?` : `Create a vacation request from ${start} to ${end}?`,
    vacationNoDates: 'I understood you want to create a vacation request, but I could not find a start and end date. Try e.g. "create vacation from 2026-10-05 to 2026-10-10".',
    todoSummary: title => `Create a personal to-do: "${title}"?`,
    todoNoTitle: 'I understood you want to create a to-do, but I could not find a title. Try e.g. "create a to-do: call IT".',
  },
  fi: {
    vacationSummary: (start, end) => start === end ? `Luodaanko loma-anomus päivälle ${start}?` : `Luodaanko loma-anomus ${start}–${end}?`,
    vacationNoDates: 'Ymmärsin, että haluat luoda loma-anomuksen, mutta en löytänyt alkamis- ja päättymispäivää. Kokeile esim. "luo loma 2026-10-05–2026-10-10".',
    todoSummary: title => `Luodaanko henkilökohtainen to-do: "${title}"?`,
    todoNoTitle: 'Ymmärsin, että haluat luoda to-don, mutta en löytänyt otsikkoa. Kokeile esim. "luo to-do: soita IT:lle".',
  },
}

/** To eksplicitte datoer i den raekkefoelge de staar ('yyyy-MM-dd' eller 'dd/mm/yyyy'/'dd.mm.yyyy'). */
function extractDateRange(question) {
  const isoMatches = [...question.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)].map(m => m[0])
  const euroMatches = [...question.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g)]
    .map(m => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
  const dates = [...isoMatches, ...euroMatches]
  if (dates.length === 1) return { start: dates[0], end: dates[0] }
  if (dates.length < 2) return null
  const [start, end] = [...dates].sort()
  return { start, end }
}

/** Teksten efter et "to-do: ..."-triggerord, ellers resten af spørgsmålet efter selve triggerfrasen. */
function extractTodoTitle(question) {
  const afterColon = question.match(/to-?do\s*[:\-–]\s*(.+)$/iu)
  if (afterColon && afterColon[1].trim()) return afterColon[1].trim().slice(0, 200)
  const stripped = question.replace(TODO_TRIGGERS, '').replace(/^[:\-–,\s]+/, '').trim()
  return stripped.length > 1 ? stripped.slice(0, 200) : null
}

/**
 * Returnerer null (ingen handlings-hensigt), { type: 'unresolved', message }
 * (hensigt genkendt, men manglende parametre), eller { type, params, summary }.
 */
function detectActionIntent(question, language) {
  const q = typeof question === 'string' ? question.trim() : ''
  if (!q) return null
  if (LOOKUP_MARKERS.test(q)) return null
  const text = TEXT[language] || TEXT.da
  if (VACATION_TRIGGERS.test(q)) {
    const range = extractDateRange(q)
    if (!range) return { type: 'unresolved', message: text.vacationNoDates }
    return { type: 'vacation-request', params: { startDate: range.start, endDate: range.end }, summary: text.vacationSummary(range.start, range.end) }
  }
  if (TODO_TRIGGERS.test(q)) {
    const title = extractTodoTitle(q)
    if (!title) return { type: 'unresolved', message: text.todoNoTitle }
    return { type: 'personal-todo', params: { title }, summary: text.todoSummary(title) }
  }
  return null
}

module.exports = { detectActionIntent, extractDateRange, extractTodoTitle }
