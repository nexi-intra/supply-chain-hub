const test = require('node:test')
const assert = require('node:assert/strict')
const { buildUnansweredLogEntry } = require('./assistantUnansweredLog.cjs')

const now = new Date('2026-09-17T12:00:00.000Z')

test('logs a question when the answer mode is unsupported', () => {
  const entry = buildUnansweredLogEntry({ question: 'hvad er meningen med livet?', language: 'da' }, { mode: 'unsupported' }, now)
  assert.deepEqual(entry, { question: 'hvad er meningen med livet?', language: 'da', createdAt: now.toISOString() })
})

test('never logs data, action-proposal or ai answers', () => {
  for (const mode of ['data', 'action-proposal', 'ai', 'retrieval', 'knowledge']) {
    assert.equal(buildUnansweredLogEntry({ question: 'test' }, { mode }, now), null)
  }
})

test('logs an app-guide answer that matched no known topic', () => {
  // Fase 4 fjernede den haarde afvisning. Uden dette signal ville manglende
  // daekning blive usynlig, fordi brugeren nu altid faar ET svar.
  const entry = buildUnansweredLogEntry({ question: 'hvad er hovedstaden i frankrig?', language: 'da' }, { mode: 'app-guide', unmatched: true }, now)
  assert.equal(entry.question, 'hvad er hovedstaden i frankrig?')
})

test('never logs an app-guide answer that did match a topic', () => {
  assert.equal(buildUnansweredLogEntry({ question: 'hvordan opretter jeg en note?' }, { mode: 'app-guide' }, now), null)
})

test('logs a zero-result answer as a weak answer, tagged so it can be told apart', () => {
  const entry = buildUnansweredLogEntry({ question: 'hvilke noter har jeg om pasta?', language: 'da', email: 'a@test' }, { mode: 'data', total: 0, text: 'Ingen' }, now)
  assert.deepEqual(Object.keys(entry).sort(), ['createdAt', 'language', 'question', 'reason'])
  assert.equal(entry.reason, 'empty')
})

test('does not log a zero-result answer that is the real answer, or any answer with results', () => {
  assert.equal(buildUnansweredLogEntry({ question: 'hvem er syg i morgen?' }, { mode: 'data', total: 0, weak: false }, now), null)
  assert.equal(buildUnansweredLogEntry({ question: 'hvilke noter har jeg?' }, { mode: 'data', total: 2 }, now), null)
})

test('never logs an empty or missing question', () => {
  assert.equal(buildUnansweredLogEntry({ question: '' }, { mode: 'unsupported' }, now), null)
  assert.equal(buildUnansweredLogEntry({ question: '   ' }, { mode: 'unsupported' }, now), null)
  assert.equal(buildUnansweredLogEntry({}, { mode: 'unsupported' }, now), null)
  assert.equal(buildUnansweredLogEntry(null, { mode: 'unsupported' }, now), null)
})

test('never includes anything beyond question/language/createdAt', () => {
  const entry = buildUnansweredLogEntry({ question: 'x', language: 'en', token: 'secret-token', email: 'a@test' }, { mode: 'unsupported' }, now)
  assert.deepEqual(Object.keys(entry).sort(), ['createdAt', 'language', 'question'])
})

test('falls back to Danish when the language is missing', () => {
  const entry = buildUnansweredLogEntry({ question: 'x' }, { mode: 'unsupported' }, now)
  assert.equal(entry.language, 'da')
})

test('truncates an overly long question to 1000 characters', () => {
  const entry = buildUnansweredLogEntry({ question: 'a'.repeat(2000) }, { mode: 'unsupported' }, now)
  assert.equal(entry.question.length, 1000)
})
