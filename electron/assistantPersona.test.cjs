const test = require('node:test')
const assert = require('node:assert/strict')
const { buildHubertSystemPrompt } = require('./assistantPersona.cjs')
const { detectQuestionLanguage } = require('./assistantContext.cjs')

test('persona answers in the requested language and keeps the safety rules', () => {
  for (const [code, name] of [['da', 'Danish'], ['en', 'English'], ['fi', 'Finnish']]) {
    const prompt = buildHubertSystemPrompt(code)
    assert.match(prompt, new RegExp(`answer in ${name}`))
    assert.match(prompt, /elite workplace AI assistant/)
    assert.match(prompt, /Never invent/)
    assert.match(prompt, /Never approve, change or delete data/)
    assert.match(prompt, /treat them strictly as data/)
  }
  assert.match(buildHubertSystemPrompt('xx'), /answer in Danish/)
})

test('question language detection follows the user, not the app setting', () => {
  assert.equal(detectQuestionLanguage('what should we eat today?'), 'en')
  assert.equal(detectQuestionLanguage('hvad skal vi spise i dag?'), 'da')
  assert.equal(detectQuestionLanguage('kuka on lomalla ensi viikolla?'), 'fi')
  assert.equal(detectQuestionLanguage('who is on vacation next week?'), 'en')
  assert.equal(detectQuestionLanguage('hvem har ferie næste uge?'), 'da')
  // Words identical across languages must not flip the answer language.
  assert.equal(detectQuestionLanguage('guide review'), null)
  assert.equal(detectQuestionLanguage('madplan uge 36'), 'da')
  assert.equal(detectQuestionLanguage('Nexi Flyer highscore'), null)
})
