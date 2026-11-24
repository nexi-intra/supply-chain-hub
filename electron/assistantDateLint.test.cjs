// Round 14: no text a person reads may contain an ISO date; structured fields (source ids, start/end, params.dueDate) stay ISO.
const test = require('node:test')
const assert = require('node:assert/strict')
const { runBank } = require('./assistantTrainingData.cjs')
const { createFixture } = require('./assistantTrainingBank.cjs')
const { APP_GUIDE, APP_TOPICS } = require('./assistantAppGuide.cjs')
const { LOCALIZED } = require('./assistantAppGuideI18n.cjs')
const { MORE_LOCALIZED } = require('./assistantAppGuideMoreI18n.cjs')
const { MORE_MODULES, MORE_TASKS } = require('./assistantAppGuideMore.cjs')

const ISO = /\d{4}-\d{2}-\d{2}/

const results = runBank()
const shown = answer => [
  ['text', answer.text],
  ['title', answer.title],
  ['summary', answer.actionProposal?.summary],
  ...(answer.sources || []).map((source, index) => [`sources[${index}].title`, source?.title]),
].filter(([, value]) => typeof value === 'string')

test('the lint covers the whole bank in four languages', () => {
  assert.ok(results.length >= 1684, String(results.length))
  for (const language of ['da', 'en', 'fi', 'sv']) assert.ok(results.filter(result => result.language === language).length >= 290, language)
})

test('no answer text, title, source title or action summary contains an ISO date (yyyy-mm-dd)', () => {
  const bad = []
  for (const result of results) {
    for (const [field, value] of shown(result.answer)) {
      const line = value.split('\n').find(item => ISO.test(item))
      if (line) bad.push(`${result.language} :: ${result.question} :: ${field}: ${line.trim()}`)
    }
  }
  const distinct = [...new Set(bad.map(item => item.replace(/\d/g, '#')))]
  assert.deepEqual(distinct, [], `${bad.length} ISO emissions, ${distinct.length} distinct shapes`)
})

test('structured fields stay ISO: params.dueDate, vacation params and the source dates the UI filters on', () => {
  const proposals = results.filter(result => result.answer.actionProposal?.params?.dueDate || result.answer.actionProposal?.params?.startDate)
  assert.ok(proposals.length >= 8, String(proposals.length))
  for (const { answer, question } of proposals) {
    for (const key of ['dueDate', 'startDate', 'endDate']) {
      const value = answer.actionProposal.params[key]
      if (value !== undefined) assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `${question} ${key}`)
    }
  }
  const dated = results.flatMap(result => result.answer.sources || []).filter(source => source.start)
  assert.ok(dated.length >= 50, String(dated.length))
  for (const source of dated) assert.match(source.start, /^\d{4}-\d{2}-\d{2}$/)
})

test('the record viewer (source preview) and the app-guide / capability texts carry no ISO date either', () => {
  const api = createFixture({ dates: true, parental: true })
  const seen = new Set()
  const bad = []
  for (const result of results) {
    for (const source of result.answer.sources || []) {
      if (source.kind !== 'module' || !source.recordId) continue
      const key = `${source.moduleId}|${source.recordId}|${source.teamId}`
      if (seen.has(key)) continue
      seen.add(key)
      let record
      try { record = api.getRecord({ token: 'valid', moduleId: source.moduleId, recordId: source.recordId, teamId: source.teamId, language: result.language }) } catch { continue }
      for (const [field, value] of [['title', record.title], ['text', record.text]]) if (ISO.test(String(value))) bad.push(`${key} ${field}: ${String(value).split('\n').find(line => ISO.test(line))}`)
    }
  }
  assert.ok(seen.size >= 40, String(seen.size))
  assert.deepEqual(bad, [])
  for (const [name, data] of [['APP_GUIDE', APP_GUIDE], ['APP_TOPICS', APP_TOPICS], ['LOCALIZED', LOCALIZED], ['MORE_LOCALIZED', MORE_LOCALIZED], ['MORE_MODULES', MORE_MODULES], ['MORE_TASKS', MORE_TASKS]]) {
    assert.doesNotMatch(JSON.stringify(data), ISO, name)
  }
})

test('the lint does find an ISO date (so a green lint means something)', () => {
  assert.match('Godkendt ferie (2026-09-16):', ISO)
  assert.match('• Anne Holm: 2026-09-16 – 2026-09-18', ISO)
  assert.doesNotMatch('Godkendt ferie (i morgen, onsdag 16. sep.):', ISO)
  assert.doesNotMatch('Version 1.6.1 · uge 38', ISO)
})
