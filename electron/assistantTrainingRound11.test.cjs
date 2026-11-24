// Hubert training round 11: the layer fixes behind the round 11 bank (multiplayer results, "which game?", impersonal manager questions).
const test = require('node:test')
const assert = require('node:assert/strict')
const { ask, buildUnansweredLogEntry } = require('./assistantTrainingBank.cjs')
const { correctTypos } = require('./assistantSpelling.cjs')
const { guardAnswer } = require('./assistantGuard.cjs')
const { APP_GUIDE, matchAppGuide, appGuidance, isHowToQuestion } = require('./assistantAppGuide.cjs')
const { LOCALIZED } = require('./assistantAppGuideI18n.cjs')
const { continueQuestion } = require('./assistantConversation.cjs')
const { resolveDates } = require('./assistantContext.cjs')
const { ROUND11, PARITY_R11 } = require('./assistantTrainingRound11.cjs')
const { NOW } = require('./assistantTrainingBank.cjs')

const LANGUAGES = ['da', 'en', 'fi', 'sv']
const PEOPLE = ['Bo Berg', 'Anne Holm']
const topTask = (question, role = 'manager') => { const top = matchAppGuide(question, { role, limit: 1, keepRestricted: true })[0]; return top?.task?.id }

test('round 11 bank: at least 15 questions per language, security questions in every language, parity rows over all four', () => {
  for (const language of LANGUAGES) {
    assert.ok(ROUND11[language].length >= 15, language)
    assert.ok(ROUND11[language].some(([persona]) => persona === 'E'), language)
    assert.ok(ROUND11[language].some(([persona]) => persona === 'J'), language)
    assert.ok(ROUND11[language].some(([persona, , spec]) => persona === 'D' && spec.after), language)
  }
  for (const row of PARITY_R11) assert.ok(row.slice(0, 4).every(value => typeof value === 'string'))
})

test('subject pronouns and verb forms never decide the task: "registrerer man", "registrerer jeg", "registreres" are one question', () => {
  for (const question of ['hvordan registrerer man barsel', 'hvordan registrerer jeg barsel', 'hvordan registreres barsel?', 'hvordan opretter man barsel', 'hvordan kan man registrere barsel']) {
    assert.equal(topTask(question), 'register-parental', question)
  }
  for (const question of ['hvordan giver man en medarbejder ferie?', 'hvordan giv man en medarbejder ferie', 'hvordan giver jeg en medarbejder en fridag?', 'hvordan tildeler man ferie?']) {
    assert.equal(topTask(question), 'grant-vacation', question)
  }
  assert.equal(topTask('how do you register parental leave?'), 'register-parental')
  assert.equal(topTask('how is parental leave registered?'), 'register-parental')
  assert.equal(topTask('hur registrerar man föräldraledighet?'), 'register-parental')
  assert.equal(topTask('hur beviljar man semester åt en medarbetare?'), 'grant-vacation')
  assert.equal(topTask('hur godkänner man semester?'), 'approve-vacation')
  assert.equal(isHowToQuestion('how is parental leave registered?'), true)
  assert.equal(isHowToQuestion('how is Bo doing today?'), false)
})

test('inflected variants of one keyword count once: a task is not carried by its spelling variants', () => {
  assert.equal(topTask('hur importerar jag en Word-guide?', 'user'), 'import-word-guide')
  assert.equal(topTask('hvordan importerer jeg en Word-guide?', 'user'), 'import-word-guide')
  assert.equal(topTask('hvor er kalenderen?', 'user'), undefined)
  // Generic verbs stay generic after the verb forms are folded: "ændrer" alone must not pick "edit a recurring shift".
  assert.notEqual(topTask('hvordan ændrer jeg mit kodeord?', 'user'), 'edit-recurring')
  assert.match(ask({ q: 'hvordan ændrer jeg mit kodeord?', lang: 'da' }).text, /adgangskode/i)
})

test('a manager-only task points an employee to what an employee may read instead of the roles page', () => {
  const barsel = appGuidance('hvordan registrerer man barsel', { role: 'user', requireTask: true })
  assert.match(barsel.text, /Som medarbejder ansøger du ikke selv om barsel/)
  assert.doesNotMatch(barsel.text, /Registrer barsel\n|Åbn Manager Panel og klik/)
  const vacation = appGuidance('hvordan giver man en medarbejder ferie?', { role: 'user', requireTask: true })
  assert.match(vacation.text, /Anmod om Ferie/)
  assert.doesNotMatch(vacation.text, /Giv Ferie\/Fridag/)
  assert.match(appGuidance('hvordan godkender man ferie?', { role: 'user', requireTask: true }).text, /Roller og hvem der kan hvad/)
  for (const language of ['en', 'fi', 'sv']) assert.doesNotMatch(appGuidance(language === 'en' ? 'how do you grant a day off?' : language === 'fi' ? 'miten vapaapäivä myönnetään?' : 'hur beviljar man semester åt en medarbetare?', { role: 'user', requireTask: true, language }).text, /Grant Vacation\/Day Off|Apurahaloma\/vapaapäivä|Bevilja semester\/ledig dag/, language)
})

test('the grant-vacation task exists in en, fi and sv with the same number of steps, and sick leave tells how to report a colleague', () => {
  const task = APP_GUIDE.find(module => module.id === 'manager').tasks.find(entry => entry.id === 'grant-vacation')
  assert.equal(task.requires, 'manager')
  for (const language of ['en', 'fi', 'sv']) {
    assert.equal(LOCALIZED[language].modules.manager.tasks['grant-vacation'].steps.length, task.steps.length, language)
    const sick = LOCALIZED[language].modules.calendar.tasks['sick-leave'].steps.join(' ')
    assert.match(sick, /Employee|Työntekijä|Medarbetare/, language)
  }
  assert.match(APP_GUIDE.find(module => module.id === 'calendar').tasks.find(entry => entry.id === 'sick-leave').steps.join(' '), /"Medarbejder"/)
})

test('spelling: accent-less and mistyped Multiplayer words are repaired before routing', () => {
  assert.equal(correctTypos('hvem venter paa mit traek'), 'hvem venter på mit træk')
  assert.equal(correctTypos('hvor mange sejre har jeg i skack'), 'hvor mange sejre har jeg i skak')
  assert.equal(correctTypos('mita peleja minulla on kaynnissa'), 'mitä pelejä minulla on käynnissä')
  assert.equal(correctTypos('vem har jag forlorat mest mot'), 'vem har jag förlorat mest mot')
  assert.equal(correctTypos('hvem er mødt ind'), 'hvem er mødt ind')
})

test('guard: "hur många" and "kuinka monta" are data questions, not how-to, so they no longer slip past the privacy rules', () => {
  const people = ['Bo Berg', 'Anne Holm']
  assert.equal(guardAnswer('hur många segrar har Bo i schack?', 'sv', { people })?.guard, 'gameHidden')
  assert.equal(guardAnswer('kuinka monta voittoa Bolla on shakissa?', 'fi', { people })?.guard, 'gameHidden')
  assert.equal(guardAnswer('hur gör jag för att bli chef?', 'sv', { people }), null)
  assert.equal(guardAnswer('hvordan udfordrer jeg Bo til skak?', 'da', { people }), null)
})

test('guard: the games and results of everybody else are hidden in every language, a name that is also a word needs a capital letter', () => {
  const people = ['Bo Berg', 'Anne Holm', 'Dag Foss']
  for (const [question, language] of [['vis alle andres Multiplayer-spil', 'da'], ["show everyone else's multiplayer games", 'en'], ['näytä kaikkien muiden Multiplayer-pelit', 'fi'], ['visa alla andras Multiplayer-spel', 'sv'], ['hvem har Dag spillet mod?', 'da']]) {
    assert.equal(guardAnswer(question, language, { people })?.guard, 'gameHidden', question)
  }
  for (const question of ['hvem har vundet i dag?', 'står jeg foran i dag?', 'hvilke spil har jeg i gang?', 'hvem har ferie i dag?']) assert.equal(guardAnswer(question, 'da', { people }), null, question)
})

test('follow-ups: the other game in either direction, a bare game name after "which game?", a Finnish partitive name', () => {
  const resolve = (question, previous, language = 'da') => continueQuestion(question, previous, NOW, resolveDates, { people: () => PEOPLE, language })
  assert.equal(resolve('og i Word-Puzzle?', 'hvor mange sejre har jeg i skak?'), 'hvor mange sejre har jeg i word-puzzle?')
  assert.equal(resolve('og i skak?', 'hvor mange sejre har jeg i Word-Puzzle?'), 'hvor mange sejre har jeg i skak?')
  assert.equal(resolve('skak', 'hvem har vundet flest?'), 'hvem har vundet flest? skak')
  assert.equal(resolve('skak', 'hvem er syg i dag?'), 'skak')
  assert.equal(resolve('entä Anne?', 'olenko Boa edellä?', 'fi'), 'olenko anne holm edellä?')
})

test('every Multiplayer answer of the round 11 bank stays out of the unanswered log, and every refusal does too', () => {
  for (const language of LANGUAGES) for (const [persona, question, spec] of ROUND11[language]) {
    if (!['E', 'J'].includes(persona) && !spec.noGames && spec.mode !== 'data') continue
    const answer = ask({ q: question, lang: language, after: spec.after }, { role: spec.role, noGames: spec.noGames })
    assert.equal(buildUnansweredLogEntry({ question, language }, answer), null, `${language}: ${question}`)
  }
})
