// Hubert's morning briefing: content per language, permissions, intent detection and the hook in the full pipeline.
const test = require('node:test')
const assert = require('node:assert/strict')
const { briefingAnswer, isBriefingQuestion, matchBriefing } = require('./assistantBriefing.cjs')
const { createAssistantContext } = require('./assistantContext.cjs')

const now = new Date(2026, 9, 13, 8, 30) // tirsdag 2026-10-13

const TEAM = { teamId: 'TCD', abbreviation: 'TCD', name: 'Dispatch', folderName: 'TCD' }
const OTHER_TEAM = { teamId: 'ZZZ', abbreviation: 'ZZZ', name: 'Other', folderName: 'ZZZ' }
const person = (email, fullName, extra = {}) => [email, { email, fullName, status: 'approved', ...extra }]

function baseStore() {
  return {
    users: Object.fromEntries([
      person('jacob@test', 'Jacob Sørensen', { password: 'NEVER_SEND_PASSWORD' }),
      person('anne@test', 'Anne Holm', { role: 'manager' }),
      person('bo@test', 'Bo Berg'),
      person('cy@test', 'Cy Dam'),
      person('di@test', 'Di Eg'),
      person('ed@test', 'Ed Fjord'),
      person('pending@test', 'Pia Pending', { status: 'pending' }),
    ]),
    'shift-roles': [{ id: 'lead', name: 'Lead' }, { id: 'pack', name: 'Packing' }],
    'shift-assignments': [
      { id: 's1', employeeId: 'jacob@test', roleId: 'lead', date: '2026-10-13', comment: 'SHIFT_COMMENT_SECRET' },
      { id: 's2', employeeId: 'bo@test', roleId: 'pack', date: '2026-10-13' },
    ],
    'shift-patterns': [{ id: 'pt1', employeeId: 'jacob@test', roleId: 'pack', weekdays: [2], intervalWeeks: 1, anchorDate: '2026-10-06' }],
    'vacation-entries': [
      { id: 'v1', userEmail: 'anne@test', startDate: '2026-10-12', endDate: '2026-10-14', status: 'approved', type: 'vacation' },
      { id: 'v2', userEmail: 'cy@test', startDate: '2026-10-01', endDate: '2026-10-31', status: 'approved', type: 'parental' },
      { id: 'v3', userEmail: 'di@test', startDate: '2026-10-13', endDate: '2026-10-13', status: 'pending', type: 'vacation' },
    ],
    'sick-leave-entries': [{ id: 'k1', userEmail: 'bo@test', startDate: '2026-10-13', endDate: '2026-10-13', status: 'approved', reason: 'SICK_REASON_SECRET' }],
    'home-office-patterns': { 'ed@test': { weekdays: [2] } },
    'home-office-exceptions': [],
    'todos-personal-jacob@test': [
      { id: 't1', title: 'Ring til fragtmanden', status: 'open', createdAt: '2026-10-01', dueDate: '2026-10-13' },
      { id: 't2', title: 'Bestil pap', status: 'in-progress', createdAt: '2026-10-01', dueDate: '2026-10-10' },
      { id: 't3', title: 'Allerede færdig', status: 'completed', createdAt: '2026-10-01', dueDate: '2026-10-13' },
      { id: 't4', title: 'Næste uge', status: 'open', createdAt: '2026-10-01', dueDate: '2026-10-20' },
      { id: 't5', title: 'Uden frist', status: 'open', createdAt: '2026-10-01' },
    ],
    'todos-personal-anne@test': [{ id: 'ta', title: 'ANNE_PRIVATE_TODO', status: 'open', createdAt: '2026-10-01', dueDate: '2026-10-13' }],
    projects: [
      { id: 'p1', title: 'Ryd lageret', status: 'open', createdBy: 'anne@test', createdAt: '2026-10-01', dueDate: '2026-10-13', teamMembers: [{ email: 'jacob@test' }] },
      { id: 'p2', title: 'OTHERS_TEAM_TODO', status: 'open', createdBy: 'anne@test', createdAt: '2026-10-01', dueDate: '2026-10-13', teamMembers: [{ email: 'bo@test' }] },
      { id: 'p3', title: 'Afsluttet projekt', status: 'completed', createdBy: 'jacob@test', createdAt: '2026-10-01', dueDate: '2026-10-13', teamMembers: [] },
    ],
    guides: [
      { id: 'g1', title: 'Returproces', author: 'jacob@test', reviewIntervalMonths: 6, nextReviewAt: Date.parse('2026-10-01T10:00:00'), version: '1.0', sections: [] },
      { id: 'g2', title: 'Senere gennemgang', author: 'jacob@test', reviewIntervalMonths: 6, nextReviewAt: Date.parse('2027-03-01T10:00:00'), version: '1.0', sections: [] },
      { id: 'g3', title: 'Annes guide', author: 'anne@test', reviewIntervalMonths: 6, nextReviewAt: Date.parse('2026-10-01T10:00:00'), version: '1.0', sections: [] },
      { id: 'g4', title: 'Ansvarlig guide', author: 'anne@test', responsibleEmail: 'jacob@test', reviewIntervalMonths: 3, nextReviewAt: Date.parse('2026-10-13T09:00:00'), version: '1.0', sections: [] },
    ],
    'meal-plan-weeks': [{ year: 2026, weekNumber: 42, meals: { tuesday: 'Lasagne med salat' } }],
    emails: [{ id: 'e1', from: 'anne@test', to: 'jacob@test', subject: 'EMAIL_SECRET_SUBJECT', message: 'EMAIL_SECRET_BODY', read: false, timestamp: '2026-10-12T08:00:00.000Z' }],
  }
}

const baseShared = () => ({
  'active-sessions': { valid: { email: 'jacob@test', expiresAt: Date.now() + 60000 } },
  'improvement-cases': [
    { id: 'i1', title: 'Bedre pallelabels', problem: 'x', proposal: 'y', status: 'in-progress', createdBy: 'bo@test', createdAt: '2026-10-01T08:00:00.000Z', dueDate: '2026-10-16', assignments: [{ id: 'a1', email: 'jacob@test', status: 'accepted' }], history: [{ id: 'h1', type: 'comment', message: 'HISTORY_SECRET' }] },
    { id: 'i2', title: 'Senere forbedring', problem: 'x', proposal: 'y', status: 'planned', createdBy: 'bo@test', createdAt: '2026-10-01T08:00:00.000Z', dueDate: '2026-10-20', assignments: [{ id: 'a2', email: 'jacob@test', status: 'accepted' }] },
    { id: 'i3', title: 'DELETED_CASE', problem: 'x', proposal: 'y', status: 'new', createdBy: 'bo@test', createdAt: '2026-10-01T08:00:00.000Z', dueDate: '2026-10-14', deletedAt: '2026-10-02T08:00:00.000Z', assignments: [{ id: 'a3', email: 'jacob@test', status: 'accepted' }] },
    { id: 'i4', title: 'Afvist deltagelse', problem: 'x', proposal: 'y', status: 'in-progress', createdBy: 'bo@test', createdAt: '2026-10-01T08:00:00.000Z', dueDate: '2026-10-14', assignments: [{ id: 'a4', email: 'jacob@test', status: 'declined' }] },
    { id: 'i5', title: 'Andres forbedring', problem: 'x', proposal: 'y', status: 'in-progress', createdBy: 'bo@test', createdAt: '2026-10-01T08:00:00.000Z', dueDate: '2026-10-14', assignments: [{ id: 'a5', email: 'bo@test', status: 'accepted' }] },
    { id: 'i6', title: 'Svar ønskes', problem: 'x', proposal: 'y', status: 'in-progress', createdBy: 'bo@test', createdAt: '2026-10-01T08:00:00.000Z', assignments: [{ id: 'a6', email: 'jacob@test', status: 'pending', responseDueDate: '2026-10-15' }] },
  ],
})

function makeEnvironment({ store = baseStore(), shared = baseShared(), principalOverrides = {} } = {}) {
  const reads = []
  const readTeam = (team, key) => { reads.push(`${team.teamId}:${key}`); return (team.teamId === 'TCD' ? store : {})[key] }
  const readShared = key => { reads.push(`_shared:${key}`); return shared[key] }
  const principal = { email: 'jacob@test', name: 'Jacob Sørensen', teams: [TEAM], role: 'user', ...principalOverrides }
  const run = (language = 'da', extra = {}) => briefingAnswer({ principal, teams: principal.teams, readTeam, readShared, creatorEmail: 'creator@test', language, now, ...extra })
  return { store, shared, reads, principal, run, readTeam, readShared }
}

const lines = answer => answer.text.split('\n')

test('Danish briefing: greeting with first name and natural date, shifts including recurring patterns, own to-dos, team, reviews, improvements', () => {
  const answer = makeEnvironment().run('da')
  assert.equal(answer.mode, 'data')
  const text = answer.text
  assert.equal(lines(answer)[0], 'Godmorgen Jacob – tirsdag 13. okt.')
  assert.match(text, /• Vagter i dag: Lead, Packing/)
  assert.match(text, /• To-dos der forfalder i dag eller er overskredet \(3, heraf 1 overskredet\): Bestil pap, Ring til fragtmanden, Ryd lageret/)
  assert.ok(!text.includes('Allerede færdig') && !text.includes('Næste uge') && !text.includes('Uden frist') && !text.includes('Afsluttet projekt'))
  assert.match(text, /• Væk i dag: .*Anne Holm/)
  assert.match(text, /Bo Berg/)
  assert.match(text, /Cy Dam/)
  assert.match(text, /Hjemmefra: Ed Fjord/)
  assert.match(text, /• Guides til gennemgang \(2, heraf 1 overskredet\): .*Returproces/)
  assert.match(text, /Ansvarlig guide/)
  assert.match(text, /• Forbedringer med frist denne uge \(2\): .*Bedre pallelabels \(fredag 16\. okt\.\)/)
  assert.match(text, /Svar ønskes \(torsdag 15\. okt\.\)/)
  assert.ok(lines(answer).length <= 10, `${lines(answer).length} lines`)
  assert.match(lines(answer).at(-1), /^Spørg fx «/)
})

test('briefing wording in en, fi and sv', () => {
  const env = makeEnvironment()
  const en = env.run('en').text
  assert.equal(en.split('\n')[0], 'Good morning Jacob – Tue 13 Oct')
  assert.match(en, /• Shifts today: Lead, Packing/)
  assert.match(en, /• To-dos due today or overdue \(3, 1 overdue\):/)
  assert.match(en, /• Away today: .*Anne Holm.* · Working from home: Ed Fjord/)
  assert.match(en, /• Guides due for review \(2, 1 overdue\):/)
  assert.match(en, /• Improvement deadlines this week \(2\): .*Bedre pallelabels \(Fri 16 Oct\)/)
  assert.match(en.split('\n').at(-1), /^Ask e\.g\. “/)
  const fi = env.run('fi').text
  assert.equal(fi.split('\n')[0], 'Huomenta Jacob – tiistai 13.10.')
  assert.match(fi, /• Vuorot tänään: Lead, Packing/)
  assert.match(fi, /• Poissa tänään: .*Anne Holm/)
  assert.match(fi.split('\n').at(-1), /^Kysy esim\. «/)
  const sv = env.run('sv').text
  assert.equal(sv.split('\n')[0], 'God morgon Jacob – tisdag 13 okt.')
  assert.match(sv, /• Pass idag: Lead, Packing/)
  assert.match(sv, /• Borta idag: .*Anne Holm/)
  assert.match(sv.split('\n').at(-1), /^Fråga t\.ex\. «/)
})

test('briefing never leaks e-mails, passwords, comments, sick reasons, private to-dos or other people\'s items', () => {
  const env = makeEnvironment()
  for (const language of ['da', 'en', 'fi', 'sv']) {
    const answer = env.run(language)
    const serialized = JSON.stringify(answer)
    for (const secret of ['NEVER_SEND_PASSWORD', 'SHIFT_COMMENT_SECRET', 'SICK_REASON_SECRET', 'ANNE_PRIVATE_TODO', 'OTHERS_TEAM_TODO', 'EMAIL_SECRET', 'HISTORY_SECRET', 'DELETED_CASE', 'Andres forbedring', 'Afvist deltagelse', 'Annes guide', 'Pia Pending', 'Senere forbedring']) {
      assert.ok(!serialized.includes(secret), `${language}: ${secret}`)
    }
    assert.ok(!/@/.test(serialized), `${language}: no e-mail address`)
    assert.ok(!/sick|syg|saira|sjuk/i.test(answer.text.split('\n').filter(line => /Anne|Bo Berg/.test(line)).join('')), `${language}: no reason words beside names`)
  }
})

test('the asker is not listed as away, and a pending vacation request is not an absence', () => {
  const store = baseStore()
  store['vacation-entries'].push({ id: 'v9', userEmail: 'jacob@test', startDate: '2026-10-13', endDate: '2026-10-13', status: 'approved', type: 'vacation' })
  const text = makeEnvironment({ store }).run('da').text
  assert.match(text, /Du er på ferie i dag\./)
  assert.ok(!text.includes('Jacob Sørensen'))
  assert.ok(!text.includes('Di Eg'))
})

test('own status today: sick, parental leave and working from home', () => {
  const sick = baseStore(); sick['sick-leave-entries'].push({ id: 'k9', userEmail: 'jacob@test', startDate: '2026-10-12', endDate: '2026-10-14', status: 'approved', reason: 'OWN_REASON' })
  const sickText = makeEnvironment({ store: sick }).run('en').text
  assert.match(sickText, /You are on sick leave today\./)
  assert.ok(!sickText.includes('OWN_REASON'))
  const parental = baseStore(); parental['vacation-entries'].push({ id: 'v8', userEmail: 'jacob@test', startDate: '2026-10-01', endDate: '2026-12-31', status: 'approved', type: 'parental' })
  assert.match(makeEnvironment({ store: parental }).run('da').text, /Du er på barsel i dag\./)
  const home = baseStore(); home['home-office-patterns']['jacob@test'] = { weekdays: [2] }
  assert.match(makeEnvironment({ store: home }).run('sv').text, /Du jobbar hemifrån idag\./)
  assert.match(makeEnvironment({ store: home }).run('fi').text, /Teet etätyötä tänään\./)
  assert.match(makeEnvironment({ store: home }).run('en').text, /You are working from home today\./)
})

test('empty day: greeting, "no shifts" and a follow-up only; every other section is left out', () => {
  const store = baseStore()
  for (const key of ['shift-assignments', 'shift-patterns', 'vacation-entries', 'sick-leave-entries', 'home-office-patterns', 'todos-personal-jacob@test', 'projects', 'guides']) store[key] = []
  store['home-office-patterns'] = {}
  const env = makeEnvironment({ store, shared: { ...baseShared(), 'improvement-cases': [] } })
  const da = env.run('da')
  assert.deepEqual(lines(da).slice(0, 2), ['Godmorgen Jacob – tirsdag 13. okt.', '• Ingen registrerede vagter i dag.'])
  assert.ok(!/To-dos|Væk|Hjemmefra|Guides|Forbedringer/.test(da.text), da.text)
  assert.match(env.run('en').text, /• No shifts registered today\./)
  assert.match(env.run('fi').text, /• Ei kirjattuja vuoroja tänään\./)
  assert.match(env.run('sv').text, /• Inga registrerade pass idag\./)
})

test('to-do titles: at most three are named, the rest is counted, overdue ones are counted', () => {
  const store = baseStore()
  store['todos-personal-jacob@test'] = ['A', 'B', 'C', 'D', 'E'].map((title, index) => ({ id: `x${index}`, title: `Opgave ${title}`, status: 'open', createdAt: '2026-10-01', dueDate: '2026-10-13' }))
  store.projects = []
  const text = makeEnvironment({ store }).run('da').text
  const line = text.split('\n').find(value => value.startsWith('• To-dos'))
  assert.match(line, /\(5\)/)
  assert.match(line, /Opgave A, Opgave B, Opgave C og 2 til/)
  assert.ok(!line.includes('Opgave D'))
  assert.match(makeEnvironment({ store }).run('en').text, /Opgave A, Opgave B, Opgave C and 2 more/)
})

test('a long to-do title is shortened and line breaks in titles cannot add lines', () => {
  const store = baseStore()
  store['todos-personal-jacob@test'] = [{ id: 'x', title: `Meget lang ${'x'.repeat(200)}\nINJECTED_LINE`, status: 'open', createdAt: '2026-10-01', dueDate: '2026-10-13' }]
  store.projects = []
  const answer = makeEnvironment({ store }).run('da')
  assert.ok(!answer.text.includes('\nINJECTED_LINE'))
  assert.ok(lines(answer).every(line => line.length < 260))
})

test('long absence lists are capped', () => {
  const store = baseStore()
  for (let index = 0; index < 12; index++) {
    const email = `p${index}@test`
    store.users[email] = { email, fullName: `Person ${String.fromCharCode(65 + index)}`, status: 'approved' }
    store['vacation-entries'].push({ id: `vx${index}`, userEmail: email, startDate: '2026-10-13', endDate: '2026-10-13', status: 'approved', type: 'vacation' })
  }
  const line = makeEnvironment({ store }).run('da').text.split('\n').find(value => value.startsWith('• Væk i dag'))
  assert.match(line, / og \d+ til/)
  assert.ok(line.length < 200, line)
})

test('only the asker\'s own teams are read', () => {
  const env = makeEnvironment()
  env.run('da')
  assert.ok(env.reads.every(read => read.startsWith('TCD:') || read.startsWith('_shared:improvement-cases')), env.reads.join(', '))
  assert.ok(!env.reads.some(read => read.startsWith('ZZZ:')))
})

test('creator account: greeting and the team, no crash when the asker is not in the user list', () => {
  const env = makeEnvironment({ principalOverrides: { email: 'creator@test', name: 'creator@test', role: 'creator' } })
  const answer = env.run('en')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text.split('\n')[0], /^Good morning creator – /)
  assert.ok(!/@/.test(answer.text))
})

test('detection: greetings alone and the briefing questions in all four languages', () => {
  for (const question of [
    'godmorgen', 'Godmorgen!', 'god morgen', 'godmorgen Hubert', 'Godmorgen Hubert!', 'hvad skal jeg i dag?', 'Hvad skal jeg i dag', 'hvad sker der i dag?', 'giv mig et overblik over i dag', 'giv mig et overblik over dagen', 'hvad skal jeg lave i dag?',
    'good morning', 'Good morning!', 'good morning Hubert', "what's on today?", 'what is on today', "what's happening today?", 'give me an overview of today',
    'huomenta', 'Huomenta!', 'mitä minulla on tänään?', 'mitä tänään tapahtuu?',
    'god morgon', 'godmorgon', 'god morgon Hubert!', 'vad har jag idag?', 'vad händer idag?', 'vad ska jag idag?',
    'godmorgen, hvad skal jeg i dag?',
  ]) assert.equal(isBriefingQuestion(question), true, question)
})

test('detection: other questions are not hijacked, including lunch and game questions', () => {
  for (const question of [
    'hvad skal jeg i dag i Word-Puzzle', 'hvad er der til frokost i dag?', "what's for lunch today?", 'hvad sker der i morgen?', 'hvad sker der i dag i Chicken Invaders', 'hvad skal jeg i dag med guiden om retur?',
    'godmorgen hvem er syg i dag?', 'hej', 'tak', 'hvem er på arbejde i dag?', 'who is on vacation today?', 'what is on the lunch menu today', 'hvad skal jeg i morgen?',
    'what is happening in Word-Puzzle today', 'mitä lounaaksi tänään?', 'vad är det för lunch idag?', 'vad händer i skak idag', 'good morning, who is sick today?', 'morgenbriefing guide', 'hvordan slår jeg morgenbriefingen fra?',
    '', 'x'.repeat(500),
  ]) assert.equal(isBriefingQuestion(question), false, question)
})

test('detection returns the language of the question when it is unambiguous', () => {
  assert.equal(matchBriefing('good morning')?.language, 'en')
  assert.equal(matchBriefing('huomenta')?.language, 'fi')
  assert.equal(matchBriefing('god morgon')?.language, 'sv')
  assert.equal(matchBriefing('vad har jag idag?')?.language, 'sv')
  assert.equal(matchBriefing('godmorgen')?.language, 'da')
  assert.equal(matchBriefing('hvad sker der i dag?')?.language, 'da')
  assert.equal(matchBriefing('hvad er der til frokost i dag?'), null)
})

// ---------- the hook in the full pipeline ----------
function pipeline({ store = baseStore(), shared = baseShared() } = {}) {
  const teams = [TEAM, OTHER_TEAM]
  const reads = []
  const context = createAssistantContext({
    listTeams: () => teams,
    lookupTeam: () => TEAM,
    creatorEmail: () => 'creator@test',
    currentFolder: () => 'TCD',
    readShared: key => shared[key],
    readTeam: (team, key) => { reads.push(`${team.teamId}:${key}`); return (team.teamId === 'TCD' ? store : {})[key] },
  })
  return { ask: (question, language = 'da', extra = {}) => context.query({ token: 'valid', question, language, ...extra }, now), reads }
}

test('pipeline: "godmorgen" and the briefing questions return the briefing, in the app language unless the question is clearly another', () => {
  const { ask } = pipeline()
  const greeting = ask('Godmorgen')
  assert.equal(greeting.mode, 'data')
  assert.equal(greeting.text.split('\n')[0], 'Godmorgen Jacob – tirsdag 13. okt.')
  assert.ok(greeting.sources.length > 0)
  assert.equal(ask('hvad skal jeg i dag?').text.split('\n')[0], 'Godmorgen Jacob – tirsdag 13. okt.')
  assert.equal(ask('giv mig et overblik over i dag').text.split('\n')[0], 'Godmorgen Jacob – tirsdag 13. okt.')
  assert.equal(ask('good morning', 'en').text.split('\n')[0], 'Good morning Jacob – Tue 13 Oct')
  assert.equal(ask('huomenta', 'fi').text.split('\n')[0], 'Huomenta Jacob – tiistai 13.10.')
  assert.equal(ask('god morgon', 'sv').text.split('\n')[0], 'God morgon Jacob – tisdag 13 okt.')
  assert.equal(ask("what's on today?", 'da').text.split('\n')[0], 'Good morning Jacob – Tue 13 Oct')
})

test('pipeline: sources carry no e-mail and follow-ups after the briefing work', () => {
  const { ask } = pipeline()
  const first = ask('godmorgen')
  assert.ok(!/@/.test(JSON.stringify(first.sources)))
  assert.match(ask('og i morgen?', 'da', { previousQuestion: first.contextQuestion }).text, /Dit overblik/)
})

test('pipeline: lunch, other overview questions and game questions are unchanged', () => {
  const { ask } = pipeline()
  assert.match(ask('hvad er der til frokost i dag?').text, /Lasagne/)
  assert.doesNotMatch(ask('hvad er der til frokost i dag?').text, /Godmorgen/)
  assert.match(ask('hvad sker der i morgen?').text, /Dit overblik/)
  assert.doesNotMatch(ask('hvad skal jeg i dag i Word-Puzzle').text, /^Godmorgen/)
  assert.match(ask('godmorgen, hvem er syg i dag?').text, /Bo Berg/)
})
