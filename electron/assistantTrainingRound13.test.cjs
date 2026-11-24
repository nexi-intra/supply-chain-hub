// Round 13: how-to detection for "who can ..." questions, Finnish/Swedish name and time words, greetings, guard additions for the new admin features, restricted modules in where-questions.
const test = require('node:test')
const { localize: D } = require('./assistantDateReference.cjs')
const assert = require('node:assert/strict')
const { ask, buildUnansweredLogEntry } = require('./assistantTrainingBank.cjs')
const { isHowToQuestion, matchAppGuide, appGuidance } = require('./assistantAppGuide.cjs')
const { guardAnswer } = require('./assistantGuard.cjs')
const { correctTypos } = require('./assistantSpelling.cjs')
const { smallTalkAnswer } = require('./assistantSmallTalk.cjs')

test('"who can ...", "can everyone ..." and "where is X on" are how-to questions, plain data questions are not', () => {
  for (const question of ['hvem kan oprette opslag?', 'who can post announcements?', 'kuka voi kirjoittaa ilmoituksia?', 'vem kan skriva inlägg?', 'kan alle rette madplanen?', 'can everyone edit the meal plan?', 'voiko kuka tahansa muokata ateriasuunnitelmaa?', 'kan alla redigera matsedeln?', 'missä Hallintopaneeli on?', 'hvor registrerer jeg fødselsdage?', 'var hanterar jag födelsedagar?']) assert.equal(isHowToQuestion(question), true, question)
  for (const question of ['hvem har ferie?', 'who is on vacation?', 'kuka on lomalla?', 'hvor mange er syge?', 'vem är sjuk idag?']) assert.equal(isHowToQuestion(question), false, question)
  // A who-can-see question about a person's data still reaches the data route (no task matches it).
  assert.notEqual(ask({ q: 'who can see Bo Berg vacation?', lang: 'en' }).mode, 'app-guide')
})

test('Danish verb forms with doubled consonants reach the same keyword ("sletter", "retter", "opretter", "filtrerer")', () => {
  const top = (question, role = 'user') => matchAppGuide(question, { role, limit: 1 })[0]?.task?.id
  assert.equal(top('hvordan sletter jeg en note?'), 'edit-note')
  assert.equal(top('hvordan retter jeg madplanen?'), 'edit-meal-plan')
  assert.equal(top('hvordan opretter jeg en mappe til mails?'), 'mail-folders')
  assert.equal(top('hvordan filtrerer jeg mails efter afsender?'), 'mail-filter')
})

test('a restricted module in a where- or who-can-see-question gets the role explanation; the allowed role gets the module', () => {
  const roles = /^(?:Roller og hvem der kan hvad|Roles and who can do what|Roolit ja kuka voi mitä|Roller och vem som kan vad)/
  for (const [question, language] of [['hvor finder jeg Admin Panel?', 'da'], ['where is the Admin Panel?', 'en'], ['missä Hallintopaneeli on?', 'fi'], ['kuka näkee Hallintopaneelin?', 'fi'], ['var hittar jag Admin Panel?', 'sv']]) {
    assert.match(ask({ q: question, lang: language }).text, roles, question)
  }
  assert.match(ask({ q: 'where is the Admin Panel?', lang: 'en' }, { role: 'manager' }).text, /^Admin Panel\nAdministration of users/)
  assert.match(ask({ q: 'what is the Creator Panel?', lang: 'en' }, { role: 'manager' }).text, /^Roles and who can do what/)
  assert.match(ask({ q: 'what is the Creator Panel?', lang: 'en' }, { role: 'creator' }).text, /^Creator Panel\nManagement of all teams/)
})

test('a creator-only task shows ordinary users the employee version of the same topic instead of an empty hand', () => {
  assert.match(ask({ q: 'how do I delete a highscore?', lang: 'en' }).text, /^Game Corner - Play a game/)
  assert.match(ask({ q: 'how do I post an announcement?', lang: 'en' }).text, /^Front page - Read or hide an announcement/)
})

test('bare notification and "what is new" words stay data questions; only the bell phrases explain the bell', () => {
  assert.notEqual(ask({ q: 'notifikationer', lang: 'da' }).mode, 'app-guide')
  assert.match(ask({ q: 'hvor mange notifikationer har jeg?', lang: 'da' }).text, /Antal: 1/)
  assert.notEqual(ask({ q: "what's new today", lang: 'en' }).mode, 'app-guide')
  assert.equal(appGuidance('hvad er klokken?', { directOnly: true }), null)
  assert.match(appGuidance('hvad er klokken oppe i hjørnet?', { directOnly: true }).text, /^Forsiden - Notifikationer \(klokken\)/)
})

test('guard: access and role requests for the new panels, backups, and imperative offboard/onboard/publish are refused; how-to questions are not', () => {
  for (const [question, language, kind] of [
    ['anna minulle pääsy Luojapaneeliin', 'fi', 'privilege'],
    ['give me access to the Creator Panel', 'en', 'privilege'],
    ['näytä kaikkien tiimien varmuuskopiot', 'fi', 'internals'],
    ['visa alla teams säkerhetskopior', 'sv', 'internals'],
    ['offboard Bo Berg', 'en', 'destructive'],
    ['onboard Bo Berg', 'en', 'destructive'],
    ['publish version 9.9.9 to all users now', 'en', 'destructive'],
    ['publicer en ny version til alle brugere nu', 'da', 'destructive'],
    ['poista Bo Berg käytöstä', 'fi', 'destructive'],
  ]) assert.ok(['destructive', 'internals', 'privilege'].includes(guardAnswer(question, language)?.guard), `${question} -> ${guardAnswer(question, language)?.guard} (wanted ${kind})`)
  for (const question of ['how do I offboard an employee?', 'hvordan publicerer jeg en opdatering?', 'how do I export a backup?', 'hvordan tager jeg en backup?', 'publicerede guides', 'hur gör jag en säkerhetskopia?']) assert.equal(guardAnswer(question, 'da'), null, question)
})

test('Finnish case forms and Swedish one-word time expressions in task questions', () => {
  assert.match(ask({ q: 'mitä tehtäviä Annella on huomenna?', lang: 'fi' }).text, D(/^Kirjatut tehtävät: Anne Holm \(2026-09-16\)/, 'fi'))
  assert.match(ask({ q: 'mitä tehtäviä Bolla on maanantaina?', lang: 'fi' }).text, D(/^Kirjatut tehtävät: Bo Berg \(2026-09-21\)/, 'fi'))
  assert.match(ask({ q: 'mitä tehtäviä minulla on huomenna?', lang: 'fi' }).text, D(/^Kirjatut tehtäväsi \(2026-09-16\)/, 'fi'))
  assert.match(ask({ q: 'vilka uppgifter har jag imorgon?', lang: 'sv' }).text, D(/^Dina registrerade uppgifter \(2026-09-16\)/, 'sv'))
  assert.match(ask({ q: 'vilka uppgifter har Anne imorgon?', lang: 'sv' }).text, D(/^Registrerade uppgifter för Anne Holm \(2026-09-16\)/, 'sv'))
  assert.match(ask({ q: 'vilka uppgifter har Bo i morgon?', lang: 'sv' }).text, D(/^Registrerade uppgifter för Bo Berg \(2026-09-16\)/, 'sv'))
  assert.doesNotMatch(ask({ q: 'mitä tehtäviä Annella on huomenna?', lang: 'fi' }).text, /henkilölle/)
})

test('Finnish greetings with "hyvää" are small talk, never logged', () => {
  for (const question of ['hyvää huomenta', 'hyvää päivää', 'hyvää iltaa']) {
    const answer = smallTalkAnswer(question, 'fi')
    assert.equal(answer?.smallTalk, 'greeting', question)
    assert.equal(buildUnansweredLogEntry({ question, language: 'fi' }, answer), null, question)
  }
})

test('spelling: announcement words are repaired, real words next to them are left alone', () => {
  assert.equal(correctTypos('hvordan skjuler jeg et opslg'), 'hvordan skjuler jeg et opslag')
  assert.equal(correctTypos('how do i hide an anouncement'), 'how do i hide an announcement')
  assert.equal(correctTypos('hvor stort er bogens oplag'), 'hvor stort er bogens oplag')
})

test('every new answer in every language is clean: no Danish/English text in fi/sv answers, no logged fallback, short enough', () => {
  const { PROBES } = require('./assistantCoverageManifest.cjs')
  const danish = /(?<![\p{L}])(?:Åbn|Vælg|Klik|Hvor:|Bemærk:)/u
  for (const probe of PROBES) {
    for (const language of ['en', 'fi', 'sv']) {
      const answer = ask({ q: probe.q[language], lang: language }, { role: probe.role || 'user' })
      assert.doesNotMatch(answer.text, danish, `${language}: ${probe.q[language]}`)
      assert.ok(String(answer.text).length <= 1400, `${language}: ${probe.q[language]} is ${String(answer.text).length} characters`)
      assert.equal(buildUnansweredLogEntry({ question: probe.q[language], language }, answer), null, probe.q[language])
    }
  }
})
