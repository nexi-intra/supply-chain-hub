const test = require('node:test')
const assert = require('node:assert/strict')
const { spellcheckLanguages, applySpellcheckLanguage } = require('./spellcheck.cjs')

const AVAILABLE = ['da', 'en', 'en-GB', 'en-US', 'nb', 'sv']

test('checks Danish and Swedish in their own dictionary plus English, and English alone', () => {
  assert.deepEqual(spellcheckLanguages('da', AVAILABLE), ['da', 'en-US'])
  assert.deepEqual(spellcheckLanguages('sv', AVAILABLE), ['sv', 'en-US'])
  assert.deepEqual(spellcheckLanguages('en', AVAILABLE), ['en-US'])
})

test('turns checking off when the language has no dictionary, so every word is not marked as wrong', () => {
  assert.deepEqual(spellcheckLanguages('fi', AVAILABLE), [])
  assert.deepEqual(spellcheckLanguages('da', ['en-US']), [])
  assert.deepEqual(spellcheckLanguages('xx', AVAILABLE), [])
})

test('applies the dictionaries to the session', () => {
  const calls = []
  const session = { availableSpellCheckerLanguages: AVAILABLE, setSpellCheckerEnabled: value => calls.push(['enabled', value]), setSpellCheckerLanguages: value => calls.push(['languages', value]) }
  applySpellcheckLanguage(session, 'da')
  applySpellcheckLanguage(session, 'fi')
  assert.deepEqual(calls, [['enabled', true], ['languages', ['da', 'en-US']], ['enabled', false]])
})
