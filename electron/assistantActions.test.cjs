const test = require('node:test')
const assert = require('node:assert/strict')
const { detectActionIntent, extractDateRange, extractTodoTitle } = require('./assistantActions.cjs')

test('detects a Danish vacation request with an explicit date range', () => {
  const result = detectActionIntent('opret en ferieanmodning fra 2026-10-05 til 2026-10-10', 'da')
  assert.equal(result.type, 'vacation-request')
  assert.deepEqual(result.params, { startDate: '2026-10-05', endDate: '2026-10-10' })
  assert.match(result.summary, /2026-10-05/)
  assert.match(result.summary, /2026-10-10/)
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

test('an empty or non-string question never throws', () => {
  assert.equal(detectActionIntent('', 'da'), null)
  assert.equal(detectActionIntent(undefined, 'da'), null)
  assert.equal(detectActionIntent(null, 'da'), null)
})
