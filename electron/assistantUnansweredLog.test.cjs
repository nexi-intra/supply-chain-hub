const test = require('node:test')
const assert = require('node:assert/strict')
const { buildUnansweredLogEntry } = require('./assistantUnansweredLog.cjs')

const now = new Date('2026-09-17T12:00:00.000Z')

test('logs a question when the answer mode is unsupported', () => {
  const entry = buildUnansweredLogEntry({ question: 'hvad er meningen med livet?', language: 'da', viewId: 'team-a' }, { mode: 'unsupported' }, now)
  assert.deepEqual(entry, { question: 'hvad er meningen med livet?', language: 'da', viewId: 'team-a', createdAt: now.toISOString() })
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

test('never logs an empty or missing question', () => {
  assert.equal(buildUnansweredLogEntry({ question: '' }, { mode: 'unsupported' }, now), null)
  assert.equal(buildUnansweredLogEntry({ question: '   ' }, { mode: 'unsupported' }, now), null)
  assert.equal(buildUnansweredLogEntry({}, { mode: 'unsupported' }, now), null)
  assert.equal(buildUnansweredLogEntry(null, { mode: 'unsupported' }, now), null)
})

test('never includes anything beyond question/language/viewId/createdAt', () => {
  const entry = buildUnansweredLogEntry({ question: 'x', language: 'en', viewId: 'v', token: 'secret-token', email: 'a@test' }, { mode: 'unsupported' }, now)
  assert.deepEqual(Object.keys(entry).sort(), ['createdAt', 'language', 'question', 'viewId'])
})

test('falls back to Danish and a null viewId when missing', () => {
  const entry = buildUnansweredLogEntry({ question: 'x' }, { mode: 'unsupported' }, now)
  assert.equal(entry.language, 'da')
  assert.equal(entry.viewId, null)
})

test('truncates an overly long question to 1000 characters', () => {
  const entry = buildUnansweredLogEntry({ question: 'a'.repeat(2000) }, { mode: 'unsupported' }, now)
  assert.equal(entry.question.length, 1000)
})
