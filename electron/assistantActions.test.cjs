const test = require('node:test')
const assert = require('node:assert/strict')
const { detectActionIntent, extractDateRange, extractTodoTitle, exampleDates } = require('./assistantActions.cjs')
const { resolveDates } = require('./assistantContext.cjs')

const NOW = new Date(2026, 8, 15, 12) // Tuesday 2026-09-15

test('detects a Danish vacation request with an explicit date range', () => {
  const result = detectActionIntent('opret en ferieanmodning fra 2026-10-05 til 2026-10-10', 'da', undefined, { now: NOW })
  assert.equal(result.type, 'vacation-request')
  assert.deepEqual(result.params, { startDate: '2026-10-05', endDate: '2026-10-10' })
  assert.equal(result.summary, 'Opret en ferieanmodning fra mandag 5. okt. til lørdag 10. okt.?')
})

test('detects an English vacation request phrased differently', () => {
  const result = detectActionIntent('can you create a vacation request from 2026-11-01 to 2026-11-03', 'en')
  assert.equal(result.type, 'vacation-request')
  assert.deepEqual(result.params, { startDate: '2026-11-01', endDate: '2026-11-03' })
})

test('detects a Finnish vacation request', () => {
  const result = detectActionIntent('luo loma-anomus 2026-12-01 2026-12-05', 'fi')
  assert.equal(result.type, 'vacation-request')
  assert.deepEqual(result.params, { startDate: '2026-12-01', endDate: '2026-12-05' })
})

test('accepts european dd/mm/yyyy dates and sorts them regardless of order', () => {
  const result = detectActionIntent('opret ferie fra 10/10/2026 til 05/10/2026', 'da')
  assert.equal(result.type, 'vacation-request')
  assert.deepEqual(result.params, { startDate: '2026-10-05', endDate: '2026-10-10' })
})

test('a single date becomes a one-day vacation request', () => {
  const result = detectActionIntent('opret ferie for 2026-10-05', 'da')
  assert.deepEqual(result.params, { startDate: '2026-10-05', endDate: '2026-10-05' })
})

test('a vacation intent without any date asks for clarification instead of guessing', () => {
  const result = detectActionIntent('opret en ferieanmodning for mig', 'da')
  assert.equal(result.type, 'unresolved')
  assert.match(result.message, /start.*slutdato/i)
})

test('detects a personal to-do with an explicit colon-delimited title', () => {
  const result = detectActionIntent('opret en to-do: ring til IT om printeren', 'da')
  assert.equal(result.type, 'personal-todo')
  assert.deepEqual(result.params, { title: 'ring til IT om printeren' })
})

test('detects an English to-do phrased without a colon', () => {
  const result = detectActionIntent('create a to-do call the supplier tomorrow', 'en')
  assert.equal(result.type, 'personal-todo')
  assert.equal(result.params.title, 'call the supplier tomorrow')
})

test('a to-do intent without any recoverable title asks for clarification', () => {
  const result = detectActionIntent('opret en to-do', 'da')
  assert.equal(result.type, 'unresolved')
  assert.match(result.message, /titel/i)
})

test('a time in a to-do becomes its time: on the named day, else today, else tomorrow once it has passed', () => {
  const tomorrow = detectActionIntent('opret en to-do: ring til DHL i morgen kl. 10:30', 'da', undefined, { now: NOW, resolveDates })
  assert.deepEqual(tomorrow.params, { title: 'ring til DHL i morgen', dueDate: '2026-09-16', startTime: '10:30' })
  assert.match(tomorrow.summary, /kl\. 10:30\?$/)
  const later = detectActionIntent('opret en to-do: møde med Anna kl. 13-14', 'da', undefined, { now: NOW, resolveDates })
  assert.deepEqual(later.params, { title: 'møde med Anna', dueDate: '2026-09-15', startTime: '13:00', endTime: '14:00' })
  assert.match(later.summary, /13:00–14:00/)
  const passed = detectActionIntent('create a to-do: call IT at 9', 'en', undefined, { now: NOW, resolveDates })
  assert.deepEqual(passed.params, { title: 'call IT', dueDate: '2026-09-16', startTime: '09:00' })
  assert.match(passed.summary, /at 09:00\?$/)
})

test('ordinary lookup questions are never mistaken for an action intent', () => {
  for (const question of [
    'hvor er Anne i dag?',
    'hvornår har jeg ferie?',
    'who is on vacation next week?',
    'what tasks do I have next week?',
    'onko minulla huomenna vapaata?',
    'hvor mange ferieanmodninger afventer?',
    'how many vacation requests are pending?',
    'montako loma-anomusta odottaa hyväksyntää?',
  ]) {
    assert.equal(detectActionIntent(question, 'da'), null, question)
  }
})

test('a bare date-only reply completes a previously unresolved vacation request', () => {
  const result = detectActionIntent('fra 2026-10-05 til 2026-10-10', 'da', 'opret en ferieanmodning')
  assert.equal(result.type, 'vacation-request')
  assert.deepEqual(result.params, { startDate: '2026-10-05', endDate: '2026-10-10' })
})

test('a bare title reply completes a previously unresolved to-do', () => {
  const result = detectActionIntent('ring til IT om printeren', 'da', 'opret en to-do')
  assert.equal(result.type, 'personal-todo')
  assert.equal(result.params.title, 'ring til IT om printeren')
})

test('an unrelated question is never swallowed by a pending action follow-up', () => {
  assert.equal(detectActionIntent('hvem har flest opgaver denne uge?', 'da', 'opret en ferieanmodning'), null)
  assert.equal(detectActionIntent('hvad skal jeg lave i morgen?', 'da', 'opret en to-do'), null)
})

test('a follow-up is ignored once the previous action was already fully resolved', () => {
  assert.equal(detectActionIntent('tak', 'da', 'opret ferie fra 2026-10-05 til 2026-10-10'), null)
  assert.equal(detectActionIntent('super', 'da', 'opret en to-do: ring til IT'), null)
})

test('extractDateRange finds two ISO dates regardless of surrounding text', () => {
  assert.deepEqual(extractDateRange('fra 2026-01-02 og til 2026-01-05 tak'), { start: '2026-01-02', end: '2026-01-05' })
  assert.equal(extractDateRange('ingen datoer her'), null)
})

test('extractTodoTitle strips the trigger phrase when there is no colon', () => {
  assert.equal(extractTodoTitle('opret en to-do køb kaffe'), 'køb kaffe')
})

test('two days written the way Hubert writes them are a range; one written day is left to the vague-period logic', () => {
  assert.deepEqual(extractDateRange('opret ferie fra 21. sep. til 25. sep.', NOW), { start: '2026-09-21', end: '2026-09-25' })
  assert.deepEqual(extractDateRange('create vacation from 21 Sep to 25 Sep', NOW), { start: '2026-09-21', end: '2026-09-25' })
  assert.deepEqual(extractDateRange('luo loma 21.9.–25.9.', NOW), { start: '2026-09-21', end: '2026-09-25' })
  assert.deepEqual(extractDateRange('skapa semester från 21 sep. till 25 sep.', NOW), { start: '2026-09-21', end: '2026-09-25' })
  assert.deepEqual(extractDateRange('opret ferie fra 25. sep. til 21. sep.', NOW), { start: '2026-09-21', end: '2026-09-25' }, 'order does not matter')
  assert.equal(extractDateRange('opret ferie 21. sep.', NOW), null)
  assert.equal(extractDateRange('opret ferie fra 21. sep. til 25. sep.'), null, 'without now written days are not read (the old callers are unchanged)')
})

test('the example in a "no dates" answer is something the user can type back and get a proposal for, in every language', () => {
  for (const [language, build] of [['da', (a, b) => `opret ferie fra ${a} til ${b}`], ['en', (a, b) => `create vacation from ${a} to ${b}`], ['fi', (a, b) => `luo loma ${a}–${b}`], ['sv', (a, b) => `skapa semester från ${a} till ${b}`]]) {
    const [from, to] = exampleDates(language, NOW)
    const result = detectActionIntent(build(from, to), language, undefined, { now: NOW })
    assert.equal(result.type, 'vacation-request', `${language} ${from} ${to}`)
    assert.deepEqual(result.params, { startDate: '2026-09-21', endDate: '2026-09-25' }, language)
    assert.doesNotMatch(result.summary, /\d{4}-\d{2}-\d{2}/, language)
  }
  assert.deepEqual(exampleDates('da', NOW), ['21. sep.', '25. sep.'])
  assert.deepEqual(exampleDates('fi', NOW), ['21.9.', '25.9.'])
  assert.deepEqual(exampleDates('en', new Date(2026, 11, 28, 12)), ['4 Jan 2027', '8 Jan 2027'], 'next week in another year carries the year')
})

test('proposal summaries write the days naturally; Finnish leaves the weekday out where it would need a case ending', () => {
  const summary = (question, language) => detectActionIntent(question, language, undefined, { now: NOW, resolveDates }).summary
  assert.equal(summary('create vacation on friday', 'en'), 'Create a vacation request for Fri 18 Sep?')
  assert.equal(summary('create vacation next week', 'en'), 'Create a vacation request from Mon 21 Sep to Fri 25 Sep?')
  assert.equal(summary('luo loma ensi viikolla', 'fi'), 'Luodaanko loma-anomus 21.–25.9.?')
  assert.equal(summary('luo loma perjantaina', 'fi'), 'Luodaanko loma-anomus päivälle 18.9.?')
  assert.equal(summary('skapa semester på fredag', 'sv'), 'Ska jag skapa en semesteransökan för fredag 18 sep.?')
  assert.equal(summary('lav en to-do: ring IT på fredag', 'da'), 'Opret en personlig to-do: "ring IT på fredag" med forfaldsdato fredag 18. sep.?')
  assert.equal(summary('luo to-do: soita IT:lle perjantaina', 'fi'), 'Luodaanko henkilökohtainen to-do: "soita IT:lle perjantaina", eräpäivä 18.9.?')
  assert.equal(summary('create vacation from 2027-01-04 to 2027-01-08', 'en'), 'Create a vacation request from Mon 4 Jan 2027 to Fri 8 Jan 2027?')
})

test('an empty or non-string question never throws', () => {
  assert.equal(detectActionIntent('', 'da'), null)
  assert.equal(detectActionIntent(undefined, 'da'), null)
  assert.equal(detectActionIntent(null, 'da'), null)
})
