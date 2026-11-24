const test = require('node:test')
const assert = require('node:assert/strict')
const { createFixture, ask } = require('./assistantTrainingBank.cjs')
const { publicAnswer, publicRecordId } = require('./assistantPublicSources.cjs')

const ASKER = 'me@test'
const EMAIL = /[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*/gu

const QUESTIONS = [
  ['hvem er på arbejde i dag?', 'da'], ['hvad laver Bo i denne uge?', 'da'], ['hvem har ferie næste uge?', 'da'], ['who is working from home on tuesday?', 'en'],
  ['hvem har fødselsdag i september?', 'da'], ['what is Bo\'s phone number and email?', 'en'], ['wer ist der manager?', 'da'], ['hvem er vores leder?', 'da'],
  ['hvem skrev noterne om terminalen?', 'da'], ['show my messages from Anne', 'en'], ['hvem ejer guiden om returns?', 'da'], ['who wrote the dock safety guide?', 'en'],
  ['which improvements am I invited to?', 'en'], ['vilka projekt finns det?', 'sv'], ['kuka on lomalla ensi viikolla?', 'fi'], ['who is sick this week?', 'en'],
  ['hvem er ventende brugere?', 'da'], ['list the users', 'en'], ['hvem er guide admin?', 'da'], ['what do my notifications say?', 'en'], ['hvem er hjemmefra på tirsdag?', 'da'],
  ['hvilke vagter har jeg?', 'da'], ['vem har semester nästa vecka?', 'sv'], ['hvem skal gennemgå guides?', 'da'], ['PUUILO software update', 'en'],
]
const ROLES = ['user', 'manager', 'creator']

const emailsIn = value => JSON.stringify(value).match(EMAIL) || []
const foreign = value => emailsIn(value).filter(found => found.toLowerCase() !== ASKER)

test('no source sent to the renderer carries a colleague e-mail, for any role', () => {
  let rawLeaks = 0, checked = 0
  for (const role of ROLES) for (const [q, lang] of QUESTIONS) {
    const raw = ask({ q, lang }, { role, parental: true })
    rawLeaks += foreign(raw.sources || []).length
    const sent = publicAnswer(raw, ASKER)
    checked += (sent.sources || []).length
    assert.deepEqual(foreign(sent.sources || []), [], `${role}: ${q}`)
    for (const source of sent.sources || []) for (const key of Object.keys(source)) assert.ok(['kind', 'teamId', 'title', 'guideId', 'library', 'reference', 'version', 'moduleId', 'recordId'].includes(key), key)
  }
  // The harness is only meaningful if the unsanitised answers really did leak addresses.
  assert.ok(rawLeaks > 0, 'raw answers should expose addresses (owner/recordId)')
  assert.ok(checked > 20, `only ${checked} sources checked`)
})

test('the sanitiser also covers hostile fixture data', () => {
  for (const [q, lang] of QUESTIONS) {
    const sent = publicAnswer(ask({ q, lang }, { injected: true, dates: true }), ASKER)
    assert.deepEqual(foreign(sent.sources || []), [], q)
  }
})

test('the asker keeps their own address; every colleague address becomes an opaque token', () => {
  assert.equal(publicRecordId('me@test', ASKER), 'me@test')
  assert.equal(publicRecordId('home:bo@test:2026-09-15', ASKER).includes('bo@test'), false)
  assert.equal(publicRecordId('home:bo@test:2026-09-15', ASKER), publicRecordId('home:BO@test:2026-09-15', ASKER))
  assert.notEqual(publicRecordId('user:bo@test', ASKER), publicRecordId('user:anne@test', ASKER))
  const title = publicAnswer({ mode: 'data', text: 'x', sources: [{ kind: 'module', moduleId: 'people', recordId: 'ghost@test', teamId: 'TCD', title: 'TCD · People · ghost@test', owner: 'ghost@test', members: ['bo@test'], text: 'secret@test' }] }, ASKER).sources[0]
  assert.deepEqual(Object.keys(title).sort(), ['kind', 'moduleId', 'recordId', 'teamId', 'title'])
  assert.equal(title.title, 'TCD · People · —')
  assert.deepEqual(emailsIn(title.recordId), [])
})

test('a record can still be opened from its public id', () => {
  const api = createFixture({ parental: true })
  const request = { token: 'boss', moduleId: 'administration', teamId: 'TCD', language: 'en' }
  const answer = ask({ q: 'list the users', lang: 'en' }, { role: 'manager' })
  const modules = (answer.sources || []).filter(source => source.kind === 'module' && /@/.test(source.recordId))
  assert.ok(modules.length, 'expected people/administration records with address-based ids')
  for (const source of modules) {
    const sent = publicAnswer({ sources: [source] }, ASKER).sources[0]
    assert.ok(!/@/.test(sent.recordId) || sent.recordId.includes(ASKER))
    const opened = api.getRecord({ ...request, moduleId: source.moduleId, recordId: sent.recordId, teamId: source.teamId })
    assert.deepEqual(opened, api.getRecord({ ...request, moduleId: source.moduleId, recordId: source.recordId, teamId: source.teamId }))
  }
})

test('home-office records (pattern and dated) open from the public id', () => {
  const api = createFixture()
  const answer = ask({ q: 'when does Bo work from home?', lang: 'en' })
  const patterns = (answer.sources || []).filter(source => source.moduleId === 'homeOffice')
  assert.ok(patterns.length, 'expected a home-office pattern source')
  const dated = [{ kind: 'module', moduleId: 'homeOffice', teamId: 'TCD', title: 'x', recordId: 'home:bo@test:2026-09-22' }]
  for (const source of [...patterns, ...dated]) {
    const sent = publicAnswer({ sources: [source] }, ASKER).sources[0]
    assert.ok(!sent.recordId.includes('bo@test'))
    const read = recordId => api.getRecord({ token: 'valid', moduleId: source.moduleId, recordId, teamId: source.teamId, language: 'en' })
    assert.deepEqual(read(sent.recordId), read(source.recordId))
  }
})
