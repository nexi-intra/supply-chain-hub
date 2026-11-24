// Answer lint (Phase 8): every answer of the whole bank is checked for artefacts, leftover ASCII-Danish, mixed-language labels and plural slips.
const test = require('node:test')
const assert = require('node:assert/strict')
const { runBank } = require('./assistantTrainingData.cjs')

const RULES = {
  'placeholder or script value': /\bundefined\b|\[object|\bNaN\b|\bnull\b|\$\{|\{\{|%s\b/,
  'double space inside a line': /\S {2,}\S/,
  'markdown or html artefact': /\*\*|__|```|^#{1,6} |<\/?(?:b|i|br|p|strong|em)>/m,
  'untranslated key': /\b[a-z]+(?:[A-Z][a-z]+)+\.[a-z][A-Za-z]+\b|\b(?:ui|assistant|common|nav|view)\.[a-z][A-Za-z.]+\b/,
  'trailing space': /[ \t]+$/m,
  'three newlines': /\n{3,}/,
  'plural slip': /(?<![\d:-])\b1 (?:opgaver|sejre|remier|dage|uger|personer|noter|beskeder|forbedringer|tasks|wins|losses|draws|days|weeks|people|notes|messages|voittoa|tappiota|segrar|förluster|uppgifter)\b|\b[2-9]\d* (?:opgave|sejr|dag|uge|person|note|besked|task|win|loss|draw|day|week|message)\b/,
}
const ASCII_DANISH = /(?<![\p{L}])(?:paa|aabn\p{L}*|vaelg\p{L}*|hjoernet|oeverst|ogsaa|faelles|naar|goer|spoerg\p{L}*|bekraeft\p{L}*|bemaerk\p{L}*|moedet|baade|doegn|foerste|hoejre)(?![\p{L}])/iu
// Template labels of one language that must never show up in another (retrieval shows guide text as written, so it is left out).
const ENGLISH_LABELS = /\b(?:Approved vacation|Absence and requests|Your overview|Availability|Team overview|Announcements|Your recorded tasks|Recorded team tasks|Meal plan|Working from home|No approved vacation|Recorded working from home)\b/
const DANISH_LABELS = /\b(?:Godkendt ferie|Fraværende|Tilgængelighed|Ingen godkendt|Teamoversigt|Notesbog|Opslagstavle|Madplan|Registrerede opgaver|Dit overblik|Fravær og anmodninger|Ingen er sygemeldt)\b/

const results = runBank()
const distinct = results.filter((result, index) => results.findIndex(other => other.language === result.language && other.answer.text === result.answer.text) === index)

test('the lint covers the whole bank (every distinct answer, four languages)', () => {
  assert.ok(distinct.length >= 700, String(distinct.length))
  for (const language of ['da', 'en', 'fi', 'sv']) assert.ok(distinct.filter(result => result.language === language).length >= 100, language)
})

for (const [name, rule] of Object.entries(RULES)) {
  test(`no answer has a ${name}`, () => {
    const bad = distinct.filter(result => rule.test(String(result.answer.text))).map(result => `${result.language} :: ${result.question} :: ${rule.exec(String(result.answer.text))?.[0]}`)
    assert.deepEqual(bad, [])
  })
}

test('no answer starts or ends with whitespace, or repeats a line directly after itself', () => {
  const bad = []
  for (const result of distinct) {
    const text = String(result.answer.text)
    if (text !== text.trim()) bad.push(`${result.language} :: ${result.question} :: untrimmed`)
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
    if (lines.some((line, index) => index && line === lines[index - 1] && line.length > 3)) bad.push(`${result.language} :: ${result.question} :: repeated line`)
  }
  assert.deepEqual(bad, [])
})

test('Danish answers have no leftover ASCII-Danish ("paa", "aabn", "vaelg" ...)', () => {
  const bad = distinct.filter(result => result.language === 'da' && ASCII_DANISH.test(String(result.answer.text))).map(result => `${result.question} :: ${ASCII_DANISH.exec(String(result.answer.text))[0]}`)
  assert.deepEqual(bad, [])
})

test('every answer is in its own language: no English template labels in da/fi/sv, no Danish ones in en/fi/sv', () => {
  const bad = []
  for (const result of distinct) {
    const text = String(result.answer.text)
    if (result.language !== 'en' && !['retrieval', 'knowledge'].includes(result.answer.mode) && ENGLISH_LABELS.test(text)) bad.push(`${result.language} :: ${result.question} :: ${ENGLISH_LABELS.exec(text)[0]}`)
    if (result.language !== 'da' && DANISH_LABELS.test(text)) bad.push(`${result.language} :: ${result.question} :: ${DANISH_LABELS.exec(text)[0]}`)
  }
  assert.deepEqual(bad, [])
})

test('data answers stay short enough to scan', () => {
  assert.deepEqual(distinct.filter(result => String(result.answer.text).length > 1800).map(result => `${result.language} :: ${result.question}`), [])
})

test('the rules do find the artefacts they are meant to find (so a green lint means something)', () => {
  assert.match('Fravær: undefined', RULES['placeholder or script value'])
  assert.match('Antal: NaN', RULES['placeholder or script value'])
  assert.match('Du har 1 opgaver', RULES['plural slip'])
  assert.match('You have 2 task', RULES['plural slip'])
  assert.doesNotMatch('Du har 1 nederlag og 2 sejre', RULES['plural slip'])
  assert.match('Hej  verden', RULES['double space inside a line'])
  assert.doesNotMatch('  • Anne Holm', RULES['double space inside a line'])
  assert.match('**Fed** tekst', RULES['markdown or html artefact'])
  assert.match('Aabn feltet paa forsiden', ASCII_DANISH)
  assert.match('Approved vacation (2026-09-16):', ENGLISH_LABELS)
  assert.match('Godkendt ferie (2026-09-16):', DANISH_LABELS)
  assert.match('ui.assistant.title', RULES['untranslated key'])
})
