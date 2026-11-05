// Round 12: relative periods, follow-ups and corrections, presence questions, rambling input, small talk and capabilities.
const test = require('node:test')
const { localize: D } = require('./assistantDateReference.cjs')
const assert = require('node:assert/strict')
const { resolveDates } = require('./assistantContext.cjs')
const { stripRelative } = require('./assistantRelativeDates.cjs')
const { NOW } = require('./assistantTrainingBank.cjs')

// NOW = Tuesday 2026-09-15 (ISO week 38).
const period = text => resolveDates(text, NOW)
const day = date => ({ start: date, end: date })

test('"in two weeks", "om to uger", "kahden viikon päästä", "om två veckor" are the week two weeks ahead, not this week', () => {
  const twoWeeks = { start: '2026-09-28', end: '2026-10-04' }
  for (const text of ['hvem har ferie om to uger?', 'hvem har ferie om 2 uger?', 'who is on vacation in two weeks?', 'who is on vacation in 2 weeks', 'kuka on lomalla kahden viikon päästä?', 'vem har semester om två veckor?']) assert.deepEqual(period(text), twoWeeks, text)
  assert.deepEqual(period('hvem har ferie om en uge?'), { start: '2026-09-21', end: '2026-09-27' })
  assert.deepEqual(period('hvem har ferie om 3 dage?'), day('2026-09-18'))
  assert.deepEqual(period('who is off in 3 days'), day('2026-09-18'))
  assert.deepEqual(period('vem är sjuk om fem dagar'), day('2026-09-20'))
  assert.deepEqual(period('hvem var syg for to uger siden?'), { start: '2026-08-31', end: '2026-09-06' })
  assert.deepEqual(period('who was sick 3 days ago?'), day('2026-09-12'))
  assert.deepEqual(period('hvem har ferie om en måned?'), { start: '2026-10-01', end: '2026-10-31' })
})

test('weekend: the coming Saturday and Sunday, next weekend a week later', () => {
  for (const text of ['hvem har ferie i weekenden?', 'who is off this weekend?', 'kuka on lomalla viikonloppuna?', 'vem är ledig i helgen?', 'hvem arbejder weekend']) assert.deepEqual(period(text), { start: '2026-09-19', end: '2026-09-20' }, text)
  for (const text of ['hvem har ferie næste weekend?', 'who is off next weekend?', 'vem är ledig nästa helg?']) assert.deepEqual(period(text), { start: '2026-09-26', end: '2026-09-27' }, text)
  assert.deepEqual(resolveDates('i weekenden', new Date(2026, 8, 20)), { start: '2026-09-19', end: '2026-09-20' }, 'on a Sunday the weekend is the one going on')
})

test('"the last Friday of the month" and "the first Monday of next month"', () => {
  for (const text of ['hvem har ferie sidste fredag i måneden?', 'who is on vacation the last friday of the month?', 'kuka on lomalla viimeinen perjantai kuussa?', 'vem har semester sista fredagen i månaden?']) assert.deepEqual(period(text), day('2026-09-25'), text)
  assert.deepEqual(period('hvem har ferie første mandag i oktober?'), day('2026-10-05'))
  assert.deepEqual(period('who is off the first monday of next month'), day('2026-10-05'))
  assert.deepEqual(period('hvem har ferie anden tirsdag i denne måned'), day('2026-09-08'))
  assert.deepEqual(period('hvem har ferie sidste fredag?'), day('2026-09-18'), 'without a month it is the plain weekday')
})

test('Christmas, New Year and Easter are real dates (the coming one)', () => {
  assert.deepEqual(period('hvem har ferie juleaften?'), day('2026-12-24'))
  assert.deepEqual(period('who is on vacation on christmas eve?'), day('2026-12-24'))
  assert.deepEqual(period('hvem har ferie til jul?'), { start: '2026-12-24', end: '2026-12-26' })
  assert.deepEqual(period('kuka on lomalla joulun aikaan?'), { start: '2026-12-24', end: '2026-12-26' })
  assert.deepEqual(period('hvem har ferie 2. juledag?'), day('2026-12-26'))
  assert.deepEqual(period('hvem har ferie nytårsaften?'), day('2026-12-31'))
  assert.deepEqual(period("who is off on new year's day?"), day('2027-01-01'))
  assert.deepEqual(period('hvem har ferie i påsken?'), { start: '2027-03-25', end: '2027-03-29' })
  assert.deepEqual(period('hvem har ferie langfredag?'), day('2027-03-26'))
  assert.deepEqual(period('who is off on easter monday?'), day('2027-03-29'))
  assert.deepEqual(period('hvem har ferie i pinsen?'), day('2027-05-16'))
  assert.deepEqual(resolveDates('juleaften', new Date(2026, 11, 25)), day('2027-12-24'), 'after the day it is next year')
  assert.deepEqual(resolveDates('juleaften', new Date(2026, 11, 24)), day('2026-12-24'), 'on the day it is today')
  assert.deepEqual(period('hvem har ferie i juli?'), { start: '2026-07-01', end: '2026-07-31' }, 'July is still a month, not "jul"')
})

test('ordinal words are dates: "tredje oktober", "the third of October", "den tjugonde september"', () => {
  assert.deepEqual(period('hvem har ferie tredje oktober?'), day('2026-10-03'))
  assert.deepEqual(period('hvem har ferie den fjerde oktober?'), day('2026-10-04'))
  assert.deepEqual(period('who is on vacation the third of October?'), day('2026-10-03'))
  assert.deepEqual(period('vem har semester den tjugonde september?'), day('2026-09-20'))
  assert.deepEqual(period('hvem har ferie den enogtyvende oktober?'), day('2026-10-21'))
  assert.equal(period('hvem har ferie den anden uge?'), null)
})

test('two relative days make one range, a single one stays single', () => {
  const both = { start: '2026-09-15', end: '2026-09-16' }
  for (const text of ['hvem har ferie i dag og i morgen?', 'who is on vacation today and tomorrow?', 'kuka on lomalla tänään ja huomenna?', 'vem har semester idag och imorgon?']) assert.deepEqual(period(text), both, text)
  assert.deepEqual(period('hvem har ferie i morgen og i overmorgen?'), { start: '2026-09-16', end: '2026-09-17' })
  assert.deepEqual(period('hvem har ferie i overmorgen?'), day('2026-09-17'))
  assert.deepEqual(period('who is off the day after tomorrow?'), day('2026-09-17'))
  assert.deepEqual(period('hvilken dag er det i morgen?'), day('2026-09-16'))
})

test('write intents keep asking about vague holiday periods instead of guessing', () => {
  assert.deepEqual(resolveDates('opret ferie i juleferien', NOW, { holidays: false }), null)
  assert.deepEqual(resolveDates('create vacation around christmas', NOW, { holidays: false }), null)
  assert.deepEqual(resolveDates('opret ferie i dag og i morgen', NOW, { holidays: false }), { start: '2026-09-15', end: '2026-09-16' })
})

test('stripRelative removes the relative period so a follow-up can swap it', () => {
  assert.equal(stripRelative('hvem har ferie om to uger?', NOW), 'hvem har ferie ?')
  assert.equal(stripRelative('hvem har ferie i dag og i morgen', NOW), 'hvem har ferie')
  assert.equal(stripRelative('hvem har ferie i weekenden', NOW), 'hvem har ferie')
})

// ---------- conversation ----------
const { ask, buildUnansweredLogEntry } = require('./assistantTrainingBank.cjs')
const { continueQuestion } = require('./assistantConversation.cjs')
const { focusClauses } = require('./assistantTidy.cjs')
const turn = (question, language, after) => ask({ q: question, lang: language, after })

test('a correction ("nej, jeg mente i dag", "I meant Clara") swaps only the period or the person of the previous question', () => {
  for (const [language, before, correction, expected] of [
    ['da', 'hvem har ferie i morgen?', 'nej, jeg mente i dag', D(/^Godkendt ferie \(2026-09-15\)/, 'da')],
    ['da', 'hvem er syg i morgen?', 'nej, i dag', D(/Test User — sygemeldt 2026-09-15/, 'da')],
    ['en', 'who is sick tomorrow?', 'sorry, today', D(/Test User — sick leave 2026-09-15/, 'en')],
    ['en', 'who is on vacation tomorrow?', 'no, I meant next week', D(/^Approved vacation \(2026-09-21 – 2026-09-27\)/, 'en')],
    ['sv', 'vem har semester imorgon?', 'nej, jag menade idag', D(/^Godkänd semester \(2026-09-15\)/, 'sv')],
    ['fi', 'kuka on lomalla huomenna?', 'ei, tarkoitin tänään', D(/^Hyväksytty loma \(2026-09-15\)/, 'fi')],
    ['da', 'hvor er Anne på torsdag?', 'jeg mente Clara', D(/^Status for Clara Dahl \(2026-09-17\)/, 'da')],
    ['en', 'where is Anne on Thursday?', 'I meant Clara', D(/^Status for Clara Dahl \(2026-09-17\)/, 'en')],
    ['sv', 'var är Anne på torsdag?', 'jag menade Clara', D(/^Status för Clara Dahl \(2026-09-17\)/, 'sv')],
    ['fi', 'missä Anne on torstaina?', 'tarkoitin Claraa', D(/^Tilanne: Clara Dahl \(2026-09-17\)/, 'fi')],
  ]) {
    const answer = turn(correction, language, [before])
    assert.equal(answer.mode, 'data', correction)
    assert.ok(!answer.unmatched, `${correction}: ${answer.text}`)
    assert.match(answer.text, expected, correction)
  }
  const unchanged = (question, previous) => continueQuestion(question, previous, NOW, resolveDates, { people: () => ['Anne Holm', 'Clara Dahl'], language: 'da' })
  assert.equal(unchanged('nej tak', 'hvem har ferie i morgen?'), 'nej tak')
  assert.equal(unchanged('nej, hvem er syg i dag?', 'hvem har ferie i morgen?'), 'hvem er syg i dag?'.replace('?', ''), 'a full new question after "nej," is simply that question')
})

test('"og Bo?" after a list question asks the same about Bo; "he/hän/han" is the person of the previous question', () => {
  for (const [language, chain, expectedStatus, backQuestion, expectedBack] of [
    ['da', ['hvem har ferie i morgen?', 'og i næste uge?'], D(/^Status for Bo Berg \(2026-09-21 – 2026-09-27\)/, 'da'), 'hvornår er han tilbage?', /^Bo Berg har en sygemelding torsdag 17\. sep\. og er tilbage fredag 18\. sep\./],
    ['en', ['who is on vacation tomorrow?', 'and next week?'], D(/^Status for Bo Berg \(2026-09-21 – 2026-09-27\)/, 'en'), 'when is he back?', /^Bo Berg has sick leave on Thu 17 Sep and is back on Fri 18 Sep\./],
    ['fi', ['kuka on lomalla huomenna?', 'entä ensi viikolla?'], D(/^Tilanne: Bo Berg \(2026-09-21 – 2026-09-27\)/, 'fi'), 'milloin hän palaa?', /Bo Berg/],
    ['sv', ['vem har semester imorgon?', 'och nästa vecka?'], D(/^Status för Bo Berg \(2026-09-21 – 2026-09-27\)/, 'sv'), 'när är han tillbaka?', /^Bo Berg har sjukfrånvaro torsdag 17 sep\. och är tillbaka fredag 18 sep\./],
  ]) {
    const status = turn(language === 'da' ? 'og Bo?' : language === 'en' ? 'and Bo?' : language === 'fi' ? 'entä Bo?' : 'och Bo?', language, chain)
    assert.match(status.text, expectedStatus, language)
    const back = turn(backQuestion, language, [...chain, language === 'da' ? 'og Bo?' : language === 'en' ? 'and Bo?' : language === 'fi' ? 'entä Bo?' : 'och Bo?'])
    assert.match(back.text, expectedBack, `${language}: ${back.text}`)
  }
  assert.match(turn('er han syg i dag?', 'da', ['hvor er Test User i dag?']).text, /^Test User er sygemeldt/)
  assert.doesNotMatch(turn('og pasta?', 'da', ['hvem har ferie i morgen?']).text, /Status for/, 'a word that is no person is not turned into a status question')
})

test('presence and yes/no state questions about one person get a direct answer, never the knowledge dump', () => {
  for (const [language, question, expected] of [
    ['da', 'er Anne her i morgen?', D(/^Status for Anne Holm \(2026-09-16\)/, 'da')],
    ['en', 'is Anne in tomorrow?', D(/^Status for Anne Holm \(2026-09-16\)/, 'en')],
    ['fi', 'onko Anne töissä huomenna?', D(/^Tilanne: Anne Holm \(2026-09-16\)/, 'fi')],
    ['sv', 'är Anne här imorgon?', D(/^Status för Anne Holm \(2026-09-16\)/, 'sv')],
    ['da', 'er Anne syg i dag?', D(/^Anne Holm er ikke sygemeldt \(2026-09-15\)\.\n\nKun registrerede data/, 'da')],
    ['da', 'er Bo syg på torsdag?', D(/^Bo Berg er sygemeldt: 2026-09-17$/, 'da')],
    ['da', 'er Anne på ferie i morgen?', D(/^Anne Holm er på ferie: 2026-09-16$/, 'da')],
    ['en', 'is Anne on vacation tomorrow?', D(/^Anne Holm is on vacation: 2026-09-16\.$/, 'en')],
    ['en', 'is Bo working from home today?', D(/^Bo Berg is working from home: 2026-09-15\.$/, 'en')],
    ['fi', 'onko Bo sairaana torstaina?', D(/^Bo Berg on sairauslomalla: 2026-09-17$/, 'fi')],
    ['sv', 'är Anne på semester imorgon?', D(/^Anne Holm är på semester: 2026-09-16$/, 'sv')],
  ]) {
    const answer = turn(question, language)
    assert.equal(answer.mode, 'data', question)
    assert.match(answer.text, expected, question)
    assert.equal(buildUnansweredLogEntry({ question, language }, answer), null, question)
    assert.ok(!JSON.stringify(answer).includes('SICK_REASON_SECRET'), question)
  }
  assert.match(turn('er der nogen syge i dag?', 'da').text, /^Fravær og anmodninger/, '"is anybody sick" still lists everybody')
})

test('"what do I have to do today?" is the personal overview of the day', () => {
  for (const [language, question, expected] of [
    ['da', 'hvad skal jeg i dag?', /^Godmorgen Test – tirsdag 15\. sep\./], ['da', 'hvad skal jeg lave i morgen?', D(/^Dit overblik \(2026-09-16\)/, 'da')],
    ['en', 'what do I have to do today?', D(/^Your overview \(2026-09-15\)/, 'en')], ['en', 'what should I do tomorrow?', D(/^Your overview \(2026-09-16\)/, 'en')],
    ['fi', 'mitä minun pitää tehdä tänään?', D(/^Yhteenveto \(2026-09-15\)/, 'fi')], ['sv', 'vad ska jag göra idag?', D(/^Din översikt \(2026-09-15\)/, 'sv')],
  ]) assert.match(turn(question, language).text, expected, question)
})

test('a rambling message with the real question buried is answered from the question word on; a typo in the question word is repaired', () => {
  const rambling = [
    ['da', 'Hej Hubert jeg sad lige og tænkte på at vi har haft en lang dag og jeg skal nok også ud og handle bagefter men det handler om at jeg vil vide hvem der er syg i dag tak'],
    ['en', 'Hi there, I was just wondering, it has been a long day and I need to go shopping later but anyway could you tell me who is sick today please'],
    ['en', 'wer is sick today'],
  ]
  for (const [language, question] of rambling) {
    const answer = turn(question, language)
    assert.match(answer.text, /Test User — (?:sygemeldt tirsdag 15\. sep\.|sick leave Tue 15 Sep)/, question)
    assert.equal(buildUnansweredLogEntry({ question, language }, answer), null, question)
  }
  assert.deepEqual(focusClauses('hvem har ferie i morgen'), [], 'a short question is left alone')
  assert.equal(focusClauses(rambling[1][1])[0], 'who is sick today')
})

test('"who is sick right now?" / "hvem har ferie nu?" mean today', () => {
  assert.match(turn('who is sick right now?', 'en').text, D(/^Absence and requests \(2026-09-15\)[\s\S]*Test User/, 'en'))
  assert.match(turn('hvem har ferie nu?', 'da').text, D(/^Godkendt ferie \(2026-09-15\)/, 'da'))
  assert.match(turn('hvem er syg lige nu?', 'da').text, D(/^Fravær og anmodninger \(2026-09-15\)/, 'da'))
})

test('polite wrappers ("kan jeg få at vide", "tell me") are not part of the question', () => {
  assert.match(turn('kan jeg få at vide hvem der har fri på fredag', 'da').text, D(/^Fravær \(2026-09-18\)/, 'da'))
  assert.match(turn('tell me who is off on friday', 'en').text, D(/^Absence \(2026-09-18\)/, 'en'))
  assert.match(turn('fortæl mig hvem der er syg i dag', 'da').text, /Test User/)
})

test('farewells in every language, and mixed-language small talk follows the language of the chat', () => {
  for (const [language, question] of [['da', 'på gensyn'], ['en', 'see you later'], ['fi', 'nakemiin'], ['fi', 'hei hei'], ['sv', 'hej då'], ['sv', 'adjö']]) {
    const answer = turn(question, language)
    assert.equal(answer.smallTalk, 'bye', question)
    assert.equal(buildUnansweredLogEntry({ question, language }, answer), null, question)
  }
  assert.match(turn('du er useless', 'da').text, /^Undskyld/)
  assert.match(turn('you are useless', 'en').text, /^Sorry/)
})

test('"what can you do?" names the 1.6 features in every language: chess/Multiplayer results, parental leave, Knowledge Base, improvements', () => {
  for (const [language, question, words] of [
    ['da', 'hvad kan du?', [/skak/, /barsel/, /Knowledge Base/, /forbedringsforslag/, /Multiplayer/]],
    ['en', 'what can you do?', [/chess/, /parental leave/, /Knowledge Base/, /improvement suggestions/, /Multiplayer/]],
    ['fi', 'mitä osaat?', [/shakissa/, /perhevapaa/, /Knowledge Base/, /parannusehdotukset/, /Multiplayer/]],
    ['sv', 'vad kan du?', [/schack/, /föräldraledig/, /Knowledge Base/, /förbättringsförslag/, /Multiplayer/]],
  ]) {
    const answer = turn(question, language)
    assert.equal(answer.mode, 'app-guide', question)
    for (const word of words) assert.match(answer.text, word, `${language}: ${word}`)
  }
})

test('a statement of intent about a missing guide gets the nearest guides, not the generic overview', () => {
  const answer = turn('jeg skal lave en P300 til Puuilo', 'da')
  assert.equal(answer.mode, 'data')
  assert.ok(!answer.text.includes('Det kunne jeg ikke finde et svar på'))
  assert.match(answer.text, /Jeg fandt ingen guide om «P300»[\s\S]*PUUILO Software update/)
})

test('an empty "who is sick?" answer says so in plain words, in the right tense, and the example period differs from the asked one', () => {
  assert.match(turn('hvem er syg i morgen?', 'da').text, D(/^Ingen er sygemeldt \(2026-09-16\)\.\n\nPrøv en anden periode, fx «hvem er syg i dag\?»/, 'da'))
  assert.match(turn('who was sick 3 days ago?', 'en').text, D(/^No one was on sick leave \(2026-09-12\)\./, 'en'))
  assert.match(turn('who was sick 3 days ago?', 'en').text, /The hub does not keep sick leave from earlier days\./)
  assert.match(turn('hvem var syg i går?', 'da').text, /Hubben gemmer ikke sygdom fra tidligere dage\./)
  assert.ok(!turn('hvem er syg i morgen?', 'da').text.includes('tidligere dage'), 'no history note for a coming day')
  assert.match(turn('kuka on sairaana huomenna?', 'fi').text, D(/^Kukaan ei ole sairauslomalla \(2026-09-16\)\./, 'fi'))
  assert.match(turn('vem är sjuk imorgon?', 'sv').text, D(/^Ingen är sjukskriven \(2026-09-16\)\./, 'sv'))
  assert.match(turn('mitä tehtäviä minulla on ensi viikolla?', 'fi').text, /esim\. «mitä tehtäviä minulla on huomenna\?»/)
  assert.match(turn('hvem er syg i dag 2026-12-24?', 'da').text, /fx «hvem er syg i morgen\?»/)
})

test('a team the user may not read gets a specific refusal in the asking language; names and roles stay public', () => {
  for (const [language, question, expected] of [['da', 'vis noter fra TRR', /^Jeg har ikke adgang til det teams oplysninger/], ['en', 'show notes in TRR', /^I have no access to that team/], ['fi', 'näytä muistiinpanot TRR', /^Minulla ei ole pääsyä/], ['sv', 'visa anteckningar TRR', /^Jag har ingen tillgång/]]) {
    const answer = turn(question, language)
    assert.equal(answer.error, true, question)
    assert.match(answer.text, expected, question)
    assert.ok(!JSON.stringify(answer).includes('OTHER_TEAM'), question)
  }
  assert.match(turn('hvem er i TRR?', 'da').text, /Dag Foss — Medarbejder/)
})

test('send/edit/move/cancel are refused as writes, while the how-to question keeps its answer', () => {
  for (const [language, question] of [['en', 'send a message to everyone'], ['da', 'rediger min note'], ['en', 'cancel my vacation'], ['sv', 'flytta mitt pass'], ['fi', 'peruuta lomani']]) assert.equal(turn(question, language).guard, 'destructive', question)
  assert.equal(turn('hvordan sender jeg en besked til en kollega?', 'da').mode, 'app-guide')
  assert.equal(turn('how do I cancel my vacation?', 'en').guard, undefined)
})

test('Swedish and Finnish phrases for the guide list and "my tasks on <weekday>" work', () => {
  assert.match(turn('mitkä oppaat ovat olemassa?', 'fi').text, /^Oppaat, joihin sinulla on pääsy \(3\)/)
  assert.match(turn('näytä oppaat', 'fi').text, /^Oppaat, joihin sinulla on pääsy \(3\)/)
  assert.match(turn('vilka uppgifter har jag på torsdag?', 'sv').text, D(/^Dina registrerade uppgifter \(2026-09-17\)/, 'sv'))
  assert.match(turn('hvilke opgaver har jeg på torsdag?', 'da').text, D(/^Dine registrerede opgaver \(2026-09-17\)/, 'da'))
})
