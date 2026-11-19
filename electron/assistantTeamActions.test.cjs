const test = require('node:test')
const assert = require('node:assert/strict')
const { detectActionIntent } = require('./assistantActions.cjs')
const { resolveDates } = require('./assistantContext.cjs')

const person = (email, name) => ({ email, name, names: new Set([name]), usernames: new Set(), memberships: [] })
const PEOPLE = [person('anne@x.dk', 'Anne Hansen'), person('bo@x.dk', 'Bo Berg'), person('me@x.dk', 'Mig Selv'), person('peter@x.dk', 'Peter Nielsen'), person('pia@x.dk', 'Pia Nielsen')]
const OTHER_TEAM = [...PEOPLE, person('zoe@y.dk', 'Zoe Lind')]
const NOW = new Date(2026, 9, 6, 9) // Tuesday 6 Oct 2026
const detect = (question, language = 'da') => detectActionIntent(question, language, undefined, {
  now: NOW, resolveDates: (text, date) => resolveDates(text, date, { holidays: false }), original: question, people: PEOPLE, allPeople: () => OTHER_TEAM, self: 'me@x.dk',
})

test('sick leave: self or child, today unless a day is named, in all four languages', () => {
  assert.deepEqual(detect('meld mig syg').params, { date: '2026-10-06', type: 'self' })
  assert.deepEqual(detect('Kan du melde mig syg i morgen?').params, { date: '2026-10-07', type: 'self' })
  assert.deepEqual(detect('mit barn er syg i dag').params, { date: '2026-10-06', type: 'child' })
  assert.deepEqual(detect('report me sick tomorrow', 'en').params, { date: '2026-10-07', type: 'self' })
  assert.deepEqual(detect('ilmoita minut sairaaksi', 'fi').params, { date: '2026-10-06', type: 'self' })
  assert.deepEqual(detect('vabba imorgon', 'sv').params, { date: '2026-10-07', type: 'child' })
  assert.match(detect('meld mig syg').summary, /^Meld dig syg i dag \(tirsdag 6\. okt\.\)\? Din leder/)
  for (const [question, language] of [['hvem er syg i dag?', 'da'], ["I'm sick of this", 'en'], ['er Bo syg?', 'da'], ['hvordan melder jeg mig syg?', 'da']]) assert.equal(detect(question, language), null, question)
})

test('home office: one day; a fixed pattern or a whole week is pointed to the module', () => {
  assert.deepEqual(detect('registrer hjemmearbejde i morgen').params, { date: '2026-10-07' })
  assert.deepEqual(detect('jeg arbejder hjemme fredag').params, { date: '2026-10-09' })
  assert.deepEqual(detect('I am working from home tomorrow', 'en').params, { date: '2026-10-07' })
  assert.deepEqual(detect('jag jobbar hemifrån på fredag', 'sv').params, { date: '2026-10-09' })
  assert.deepEqual(detect('kirjaa etätyö huomenna', 'fi').params, { date: '2026-10-07' })
  assert.match(detect('registrer hjemmearbejde hver fredag').message, /én hjemmearbejdsdag ad gangen/)
  assert.match(detect('registrer hjemmearbejde næste uge').message, /én hjemmearbejdsdag ad gangen/)
  assert.equal(detect('arbejder jeg hjemme i morgen?'), null)
  assert.equal(detect('hvem arbejder hjemme i morgen?'), null)
})

test('note: personal by default, shared when asked; the content is kept as typed', () => {
  assert.deepEqual(detect('opret en note: husk at bestille nye labels. Og printerpapir').params, { title: 'Husk at bestille nye labels', content: 'husk at bestille nye labels. Og printerpapir', isPersonal: true })
  assert.deepEqual(detect('kan du oprette en delt note om at printeren er flyttet').params, { title: 'Printeren er flyttet', content: 'printeren er flyttet', isPersonal: false })
  assert.equal(detect('opret en note til teamet: ny kaffemaskine').params.isPersonal, false)
  assert.equal(detect('skapa en anteckning: ring IT', 'sv').params.isPersonal, true)
  assert.equal(detect('create a note', 'en').type, 'unresolved')
})

test('message: a colleague in the own team, body after a colon or "om at"; never to everyone', () => {
  assert.deepEqual(detect('send en besked til Anne: mødet er flyttet til kl. 10').params, { to: 'anne@x.dk', toName: 'Anne Hansen', subject: 'Mødet er flyttet til kl. 10', message: 'mødet er flyttet til kl. 10' })
  assert.equal(detect('skriv til Bo om at jeg er lidt forsinket').params.message, 'jeg er lidt forsinket')
  assert.equal(detect('send a message to Bo: running late', 'en').params.to, 'bo@x.dk')
  assert.equal(detect('lähetä viesti Annelle: kokous siirtyi', 'fi').params.to, 'anne@x.dk')
  assert.equal(detect('skicka ett meddelande till Anne: hej', 'sv').params.to, 'anne@x.dk')
  assert.match(detect('send en besked til Nielsen: hej').message, /Peter Nielsen eller Pia Nielsen/)
  assert.match(detect('send en besked til Anna: hej').message, /Mente du Anne Hansen/)
  assert.match(detect('send en besked til Peter').message, /Hvad skal beskeden til Peter Nielsen indeholde/)
  // Another team's colleague cannot get an internal message (the mail lives in the own team).
  assert.match(detect('send en besked til Zoe: hej').message, /kan ikke finde "Zoe"/)
  for (const question of ['send en besked til alle: hej', 'send a message to everyone', 'hvem har sendt mig en besked?']) assert.equal(detect(question, /send a/.test(question) ? 'en' : 'da'), null, question)
})

test('shared to-do comes before the personal one; a plain to-do stays personal', () => {
  assert.deepEqual(detect('opret en team to-do: ryd op på lageret fredag').params, { title: 'ryd op på lageret fredag', dueDate: '2026-10-09' })
  assert.deepEqual(detect('opret en to-do til teamet: bestil kaffe').params, { title: 'bestil kaffe' })
  assert.equal(detect('create a shared to-do: clean desk', 'en').type, 'team-todo')
  assert.equal(detect('opret en to-do: ring til IT').type, 'personal-todo')
  assert.equal(detect('opret en to-do skriv til Anne').type, 'personal-todo')
})

test('high-five: any approved colleague across teams, emoji and reason from the words, never to oneself', () => {
  assert.deepEqual(detect('send en high-five til Anne for hjælpen i dag 🎉').params, { recipientEmail: 'anne@x.dk', recipientName: 'Anne Hansen', emoji: '🎉', message: 'Tak for hjælpen i dag' })
  assert.deepEqual(detect('giv Bo en high five').params, { recipientEmail: 'bo@x.dk', recipientName: 'Bo Berg', emoji: '🙌', message: 'Godt gået!' })
  assert.equal(detect('send a high-five to Zoe: great work', 'en').params.recipientEmail, 'zoe@y.dk')
  assert.equal(detect('give Anne a high-five: great work on the audit', 'en').params.message, 'Great work on the audit')
  assert.equal(detect('lähetä high five Annelle', 'fi').params.recipientEmail, 'anne@x.dk')
  assert.equal(detect('skicka en high five till Bo för hjälpen', 'sv').params.message, 'Tack för hjälpen')
  assert.match(detect('send en high five til mig selv').message, /ikke sende en high-five til dig selv/)
  assert.match(detect(`send en high-five til Anne: ${'x'.repeat(201)}`).message, /højst have 200 tegn/)
  assert.equal(detect('hvordan sender jeg en high-five?'), null)
})

test('the existing vacation path is untouched', () => {
  assert.deepEqual(detect('opret ferie fra 2026-10-12 til 2026-10-16').params, { startDate: '2026-10-12', endDate: '2026-10-16' })
})
