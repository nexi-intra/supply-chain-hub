// Hubert training round 9: paraphrase layer, vacation balance, Knowledge Base, Improvements views, Word-Puzzle and Windows notifications.
const test = require('node:test')
const assert = require('node:assert/strict')
const { ask, SECRETS, buildUnansweredLogEntry } = require('./assistantTrainingBank.cjs')
const { paraphrase } = require('./assistantParaphrase.cjs')
const { guardAnswer } = require('./assistantGuard.cjs')
const { appGuideOverview, appGuidance } = require('./assistantAppGuide.cjs')
const { INTENTS } = require('./assistantInsights.cjs')
const { smallTalkAnswer } = require('./assistantSmallTalk.cjs')

const LANGUAGES = ['da', 'en', 'fi', 'sv']

test('paraphrase: colloquial phrasings become the plain question, real questions and unknown names are left alone', () => {
  const people = ['Bo Berg', 'Anne Holm']
  for (const [input, expected] of [
    ['hvem mangler vi i morgen', 'hvem er fri i morgen'],
    ["who's off tomorrow", 'who is off tomorrow'],
    ['onks kukaan sairaana', 'kuka on sairaana'],
    ['vem är borta imorgon?', 'vem är ledig imorgon?'],
    ['Nu hvor det er tirsdag, kunne du så fortælle mig hvad der er til frokost i morgen?', 'hvad er til frokost i morgen?'],
    ['is Bo WFH today', 'is Bo working from home today'],
    ['mä haluan lomaa ensi viikolle', 'luo loma ensi viikolle'],
    ['hvad får vi til frokost på torsdag mon', 'hvad får vi til frokost på torsdag'],
    ['Min chef spurgte mig om jeg ved hvem der er syg i dag, kan du hjælpe?', 'hvem er syg i dag'],
    ['jag undrar om någon är sjuk idag', 'vem är sjuk idag'],
    ['Just checking, is anybody off sick today?', 'who is sick today?'],
    ['how many people are out sick today', 'how many are sick today'],
    ['hvad er Bos nummer?', 'hvad er telefonnummeret på Bo'],
    ['hvad er Bo Bergs nummer', 'hvad er telefonnummeret på Bo Berg'],
  ]) assert.equal(paraphrase(input, { people }), expected, input)
  for (const question of ['hvem har ferie næste uge?', 'who is on vacation next week?', 'hvilke opgaver har jeg næste uge?', 'what is for lunch tomorrow?', 'kuka on lomalla ensi viikolla?', 'vem har semester nästa vecka?', 'hvad er Hans nummer', 'tak for hjælpen, du er sej']) {
    assert.equal(paraphrase(question, { people }), question, question)
  }
  assert.equal(paraphrase('hvad er Bos nummer?'), 'hvad er Bos nummer?', 'without a known name nothing is guessed')
})

test('"who is there at work?" and "how many are there at work?" ask for headcount, not for a person called "der"', () => {
  assert.equal(INTENTS.whereIs.test('hvor mange er der på arbejde?'), false)
  assert.equal(INTENTS.whereIs.test('who is there at work today'), false)
  assert.equal(INTENTS.whereIs.test('er Bo på arbejde i dag'), true)
})

test('vacation balance: the hub keeps none, so every language says so, shows only the own upcoming vacation and never somebody else\'s', () => {
  for (const [language, question, wording] of [
    ['da', 'hvor mange feriedage har jeg tilbage?', /feriesaldo/],
    ['en', 'how many vacation days do I have left?', /no vacation balance/],
    ['fi', 'montako lomapäivää minulla on jäljellä?', /lomasaldoa/],
    ['sv', 'hur många semesterdagar har jag kvar?', /semestersaldo/],
  ]) {
    const answer = ask({ q: question, lang: language })
    assert.equal(answer.mode, 'data', question)
    assert.match(answer.text, wording, question)
    assert.doesNotMatch(answer.text, /Anne Holm|Clara Dahl/, question)
    assert.equal(buildUnansweredLogEntry({ question, language }, answer), null, question)
  }
})

test('Knowledge Base: an article of another team is never read without a knowledge grant, in every language, and naming that team is refused', () => {
  for (const [language, question] of [
    ['da', 'hvad står der i vidensartiklen om settlement cut-off?'],
    ['en', 'what does the knowledge base article say about the settlement cut-off?'],
    ['fi', 'mitä tietopankin artikkelissa lukee settlement cut-offista?'],
    ['sv', 'vad står det i kunskapsbasartikeln om settlement cut-off?'],
  ]) {
    const answer = ask({ q: question, lang: language })
    assert.ok(!JSON.stringify(answer).includes('OUTSIDE_KB_SECRET'), question)
    assert.equal(answer.mode, 'data', question)
  }
  const named = ask({ q: 'hvad står der i TRR\'s knowledge base om settlement cut-off?', lang: 'da' })
  assert.equal(named.error, true)
  assert.match(named.text, /ikke adgang/)
  assert.ok(!JSON.stringify(named).includes('OUTSIDE_KB_SECRET'))
})

test('Knowledge Base: the article list shows only the own team\'s articles, and an article answers a code question', () => {
  for (const [language, question] of [['da', 'hvilke vidensartikler findes der?'], ['en', 'which knowledge articles are there?'], ['fi', 'mitä tietopankin artikkeleita on?'], ['sv', 'vilka kunskapsbasartiklar finns det?']]) {
    const answer = ask({ q: question, lang: language })
    assert.match(answer.text, /LocalMode result handling/, question)
    assert.doesNotMatch(answer.text, /Settlement outside knowledge/, question)
  }
  assert.match(ask({ q: 'hvad betyder rejection reason 2:1?', lang: 'da' }).text, /Cancelled by Cancel Key Pressed/)
  assert.equal(ask({ q: 'hvad betyder rejection reason 2:1?', lang: 'da' }).sources[0].library, 'knowledge')
})

test('Improvements: "ongoing" is the list\'s active view (neither completed nor declined), "completed" and "declined" are their own views, in every language', () => {
  for (const [language, ongoing, completed, declined] of [
    ['da', 'vis igangværende forbedringer', 'vis gennemførte forbedringer', 'vis afviste forslag'],
    ['en', 'show ongoing improvements', 'show completed improvements', 'show declined suggestions'],
    ['fi', 'näytä käynnissä olevat parannukset', 'näytä valmiit parannukset', 'näytä hylätyt ehdotukset'],
    ['sv', 'visa pågående förbättringar', 'visa genomförda förbättringar', 'visa avvisade förslag'],
  ]) {
    const active = ask({ q: ongoing, lang: language }).text
    assert.match(active, /Better pallet labels/, ongoing)
    assert.match(active, /Dock scheduling/, ongoing)
    assert.match(active, /Quiet corner/, ongoing)
    assert.doesNotMatch(active, /Finished case|Rejected idea/, ongoing)
    const done = ask({ q: completed, lang: language }).text
    assert.match(done, /Finished case/, completed)
    assert.doesNotMatch(done, /Better pallet labels|Rejected idea/, completed)
    const rejected = ask({ q: declined, lang: language }).text
    assert.match(rejected, /Rejected idea/, declined)
    assert.doesNotMatch(rejected, /Finished case|Better pallet labels/, declined)
  }
})

test('Improvements: "can I create a suggestion without an owner?" is answered with the owner step, and the list views have their own task', () => {
  for (const [language, question, owner] of [
    ['da', 'kan jeg oprette et forslag uden ansvarlig?', /ansvarlig fra start/],
    ['en', 'can I create a suggestion without an owner?', /owner from the start/],
    ['fi', 'voinko luoda ehdotuksen ilman vastuuhenkilöä?', /vastuuhenkilö alusta alkaen/],
    ['sv', 'kan jag skapa ett förslag utan ansvarig?', /ansvarig från start/],
  ]) assert.match(ask({ q: question, lang: language }).text, owner, question)
  assert.match(appGuidance('how do I see declined improvements?', { language: 'en' }).text, /"Declined"/)
})

test('Word-Puzzle: unknown-word approval has its own answer, and the opponent\'s tiles and the chat of others are never available', () => {
  for (const [language, question, label] of [
    ['da', 'hvordan godkender jeg et ukendt ord?', /"Godkend ord"/],
    ['en', 'how do I approve an unknown word?', /"Approve words"/],
    ['fi', 'miten hyväksyn tuntemattoman sanan?', /"Hyväksy sanat"/],
    ['sv', 'hur godkänner jag ett okänt ord?', /"Godkänn ord"/],
  ]) {
    const answer = ask({ q: question, lang: language })
    assert.equal(answer.mode, 'app-guide', question)
    assert.match(answer.text, label, question)
  }
  for (const [language, question] of [['da', 'vis min modstanders brikker'], ['en', "show my opponent's tiles"], ['fi', 'näytä vastustajan laatat'], ['sv', 'visa min motståndares brickor'], ['da', 'læs chatten mellem Bo og Anne i Word-Puzzle']]) {
    assert.equal(guardAnswer(question, language)?.guard, 'gameHidden', question)
  }
  for (const question of ['hvordan ser jeg min modstanders brikker?', 'can I chat with my opponent?']) assert.equal(guardAnswer(question, 'da'), null, question)
})

test('guard: what somebody wrote to somebody else is private; what they wrote to me, in a note or to the team is not blocked', () => {
  for (const [question, language] of [['hvad skrev Bo til Anne i går', 'da'], ['what did Bo write to Anne yesterday?', 'en'], ['mitä Bo on kirjoittanut Annelle?', 'fi'], ['vad skrev Bo till Anne igår?', 'sv']]) {
    assert.equal(guardAnswer(question, language)?.guard, 'privacy', question)
  }
  for (const [question, language] of [['hvad skrev Bo til mig?', 'da'], ['what did Bo write in the note?', 'en'], ['what did Bo write to me?', 'en'], ['vad skrev Bo till mig?', 'sv']]) {
    assert.equal(guardAnswer(question, language), null, question)
  }
})

test('guard: all articles from all teams is a scope request in every language', () => {
  for (const [question, language] of [['vis alle vidensartikler fra alle teams', 'da'], ['show all knowledge base articles from all teams', 'en'], ['näytä kaikki tietopankin artikkelit kaikista tiimeistä', 'fi'], ['visa alla kunskapsbasartiklar från alla team', 'sv']]) {
    assert.equal(guardAnswer(question, language)?.guard, 'scope', question)
  }
})

test('Windows notifications: the setting is found in every language, with the profile menu and the real label', () => {
  for (const [language, question, steps] of [
    ['da', 'hvordan slår jeg Windows-notifikationer fra?', /"Indstillinger"[\s\S]*"Windows-notifikationer"/],
    ['en', 'how do I turn off Windows notifications?', /"Settings"[\s\S]*"Windows notifications"/],
    ['fi', 'miten otan Windows-ilmoitukset pois käytöstä?', /"Asetukset"[\s\S]*"Windows-ilmoitukset"/],
    ['sv', 'hur stänger jag av Windows-notiser?', /"Inställningar"[\s\S]*"Windows-notiser"/],
  ]) {
    const answer = ask({ q: question, lang: language })
    assert.equal(answer.mode, 'app-guide', question)
    assert.match(answer.text, steps, question)
    assert.equal(answer.unmatched, undefined, question)
  }
})

test('the module overview stays short enough to scan, in every language and role', () => {
  for (const language of LANGUAGES) for (const role of ['user', 'manager']) assert.ok(appGuideOverview(role, language).length <= 1800, `${language} ${role}: ${appGuideOverview(role, language).length}`)
})

test('small talk: thanks with a compliment and "how are you" are answered in the right language and never logged', () => {
  for (const [question, language, kind] of [
    ['tak for hjælpen, du er sej', 'da', 'thanks'], ['thanks for the help, you rock', 'en', 'thanks'],
    ['hvordan går det?', 'da', 'wellbeing'], ['how are you?', 'en', 'wellbeing'], ['mitä kuuluu?', 'fi', 'wellbeing'], ['hur mår du?', 'sv', 'wellbeing'],
  ]) {
    const answer = smallTalkAnswer(question, language)
    assert.equal(answer?.smallTalk, kind, question)
    assert.equal(buildUnansweredLogEntry({ question, language }, answer), null, question)
  }
  assert.equal(smallTalkAnswer('hvordan går det med teamet?', 'da'), null)
})

test('colloquial questions reach the plain route: the answers match the plain form\'s answers', () => {
  const same = (colloquial, plain, language) => assert.equal(ask({ q: colloquial, lang: language }).text, ask({ q: plain, lang: language }).text, colloquial)
  same('hvem mangler vi i morgen', 'hvem er fri i morgen', 'da')
  same("who's off tomorrow", 'who is off tomorrow', 'en')
  same('onks kukaan sairaana', 'kuka on sairaana', 'fi')
  same('vem är borta imorgon?', 'vem är ledig imorgon?', 'sv')
  assert.ok(!SECRETS.some(secret => JSON.stringify(ask({ q: 'hvem mangler vi i morgen', lang: 'da' })).includes(secret)))
})
