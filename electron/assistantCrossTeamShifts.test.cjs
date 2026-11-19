// Shift questions across teams: any approved user may ask about another team's shift schedule (names, days and shift roles only),
// recurring patterns count everywhere, and nothing else of the other team is read or shown.
const test = require('node:test')
const assert = require('node:assert/strict')
const { createAssistantContext } = require('./assistantContext.cjs')

const now = new Date(2026, 8, 15, 12) // Tuesday 2026-09-15; "this week" = 14-20 Sep
const TEAMS = [{ teamId: 'TCD', abbreviation: 'TCD', name: 'Dispatch', folderName: 'TCD' }, { teamId: 'TRR', abbreviation: 'TRR', name: 'Returns', folderName: 'TRR' }]
// Whatever the other team stores besides its shift schedule must never be read for a shift question.
const TRR_SHIFT_KEYS = ['users', 'shift-roles', 'shift-assignments', 'shift-patterns', 'vacation-entries', 'sick-leave-entries', 'home-office-patterns', 'home-office-exceptions']
const SECRETS = ['TRR_PASSWORD', 'TRR_PHONE', 'TRR_ASSIGNMENT_COMMENT', 'TRR_PATTERN_COMMENT', 'TCD_ASSIGNMENT_COMMENT', 'TCD_PATTERN_COMMENT', 'TRR_NOTE_SECRET', 'TRR_MAIL_SECRET', 'TRR_GUIDE_SECRET', 'TRR_PROJECT_SECRET', 'TRR_VACATION_NOTE', 'TRR_SICK_REASON']

function stores() {
  return {
    TCD: {
      users: {
        'me@test': { email: 'me@test', fullName: 'Test User', status: 'approved', password: 'TCD_PASSWORD' },
        'anna@test': { email: 'anna@test', fullName: 'Anna Dahl', status: 'approved' },
        'bo@test': { email: 'bo@test', fullName: 'Bo Berg', status: 'approved' },
      },
      'shift-roles': [
        { id: 'lukke', name: 'Lukkevagt' }, { id: 'closing', name: 'Closing' }, { id: 'lukkovuoro', name: 'Lukkovuoro' }, { id: 'stangning', name: 'Stängning' },
        { id: 'pack', name: 'Pakning' }, { id: 'am', name: 'AM' }, { id: 'vagt', name: 'Vagt' },
      ],
      'shift-assignments': [
        { id: 'a1', employeeId: 'me@test', roleId: 'pack', date: '2026-09-15', comment: 'TCD_ASSIGNMENT_COMMENT' },
        { id: 'a2', employeeId: 'bo@test', roleId: 'lukke', date: '2026-09-17' },
        { id: 'a3', employeeId: 'bo@test', roleId: 'closing', date: '2026-09-18' },
        { id: 'a4', employeeId: 'anna@test', roleId: 'lukkovuoro', date: '2026-09-16' },
        { id: 'a5', employeeId: 'me@test', roleId: 'stangning', date: '2026-09-18' },
        { id: 'a6', employeeId: 'bo@test', roleId: 'am', date: '2026-09-15' },
        { id: 'a7', employeeId: 'bo@test', roleId: 'vagt', date: '2026-09-19' },
      ],
      // Anna closes every Wednesday; Test User would close every Monday but is on vacation on Monday 14 Sep.
      'shift-patterns': [
        { id: 'p1', employeeId: 'anna@test', employeeName: 'Anna Dahl', roleId: 'lukke', weekdays: [3], intervalWeeks: 1, anchorDate: '2026-09-07', comment: 'TCD_PATTERN_COMMENT' },
        { id: 'p2', employeeId: 'me@test', employeeName: 'Test User', roleId: 'lukke', weekdays: [1], intervalWeeks: 1, anchorDate: '2026-09-07' },
      ],
      'vacation-entries': [{ userEmail: 'me@test', startDate: '2026-09-14', endDate: '2026-09-14', status: 'approved' }],
    },
    TRR: {
      users: {
        'maja@test': { email: 'maja@test', fullName: 'Maja Lund', status: 'approved', password: 'TRR_PASSWORD' },
        'frederik@test': { email: 'frederik@test', fullName: 'Frederik Torp', status: 'approved', password: 'TRR_PASSWORD', phone: 'TRR_PHONE' },
      },
      'shift-roles': [{ id: 'lukke', name: 'Lukkevagt' }, { id: 'aaben', name: 'Åbning' }, { id: 'vagt', name: 'Vagt' }],
      'shift-assignments': [
        { id: 'r1', employeeId: 'frederik@test', roleId: 'aaben', date: '2026-09-15', comment: 'TRR_ASSIGNMENT_COMMENT' },
        { id: 'r2', employeeId: 'maja@test', roleId: 'vagt', date: '2026-09-16' },
      ],
      // Frederik closes every second Friday starting with the week of 14 Sep, i.e. Friday 18 Sep.
      'shift-patterns': [{ id: 'rp1', employeeId: 'frederik@test', employeeName: 'Frederik Torp', roleId: 'lukke', weekdays: [5], intervalWeeks: 2, anchorDate: '2026-09-14', comment: 'TRR_PATTERN_COMMENT' }],
      'home-office-patterns': { 'frederik@test': { weekdays: [2] } },
      'vacation-entries': [{ userEmail: 'maja@test', startDate: '2026-09-21', endDate: '2026-09-25', status: 'approved', notes: 'TRR_VACATION_NOTE' }],
      'sick-leave-entries': [{ userEmail: 'maja@test', startDate: '2026-09-30', status: 'approved', reason: 'TRR_SICK_REASON' }],
      'notebook-notes': [{ id: 'n', title: 'TRR_NOTE_SECRET', content: 'TRR_NOTE_SECRET' }],
      emails: [{ id: 'm', subject: 'TRR_MAIL_SECRET' }],
      guides: [{ id: 'g', title: 'TRR_GUIDE_SECRET' }],
      projects: [{ id: 'pr', title: 'TRR_PROJECT_SECRET' }],
    },
  }
}

// `as` picks who asks: Test User (home team TCD) or Maja Lund (home team TRR).
function createApi(as = 'tcd') {
  const data = stores()
  const reads = []
  const home = as === 'tcd' ? TEAMS[0] : TEAMS[1]
  const sessions = { valid: { email: as === 'tcd' ? 'me@test' : 'maja@test', expiresAt: Date.now() + 60000 } }
  const api = createAssistantContext({
    listTeams: () => TEAMS, lookupTeam: () => home, creatorEmail: () => 'creator@test', currentFolder: () => home.folderName,
    readShared: key => (key === 'active-sessions' ? sessions : undefined),
    readTeam: (team, key) => { reads.push(`${team.teamId}:${key}`); return data[team.teamId][key] },
  })
  const ask = (question, language = 'da', extra = {}) => api.query({ token: 'valid', question, language, ...extra }, now)
  return { ask, reads, data }
}

const noLeaks = answer => { const body = JSON.stringify(answer); for (const secret of SECRETS) assert.ok(!body.includes(secret), secret) }
const trrReads = reads => [...new Set(reads.filter(read => read.startsWith('TRR:')).map(read => read.slice(4)))]

test('own team: "hvem har lukkevagt denne uge?" lists only that role, including people who have it through a recurring pattern', () => {
  const { ask } = createApi('tcd')
  const answer = ask('hvem har lukkevagt denne uge?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /^Lukkevagt · TCD \(/)
  assert.match(answer.text, /onsdag 16\. sep\.: Anna Dahl — Lukkevagt/) // pattern
  assert.match(answer.text, /torsdag 17\. sep\.: Bo Berg — Lukkevagt/) // single shift
  for (const other of ['Closing', 'Lukkovuoro', 'Pakning', 'Stängning', 'AM']) assert.ok(!answer.text.includes(other), other)
  // The pattern of a person on approved vacation that Monday does not show up.
  assert.ok(!answer.text.includes('mandag 14. sep.'))
  assert.equal((answer.text.match(/^• /gm) || []).length, 2)
  noLeaks(answer)
})

test('role names match inflections, any case', () => {
  const { ask } = createApi('tcd')
  for (const question of ['hvem har lukkevagten denne uge?', 'hvem har LUKKEVAGTER denne uge?', 'Hvem har lukkevagterne denne uge', 'hvem har lukkevagt i denne uge']) {
    const answer = ask(question)
    assert.match(answer.text, /Anna Dahl — Lukkevagt/, question)
    assert.match(answer.text, /Bo Berg — Lukkevagt/, question)
    assert.ok(!answer.text.includes('Pakning'), question)
  }
})

test('a plain "hvem har vagt" or a short role name does not narrow the answer to one role', () => {
  const { ask } = createApi('tcd')
  const all = ask('hvem har vagt denne uge?')
  assert.match(all.text, /^Registrerede teamopgaver · TCD/)
  for (const role of ['Lukkevagt', 'Closing', 'Lukkovuoro', 'Pakning', 'Stängning', 'AM', 'Vagt']) assert.match(all.text, new RegExp(`— ${role}\\b`), role)
  // "AM" is a role here but "what am I doing" is not a question about it.
  assert.ok(!ask('what am I doing this week?', 'en').text.includes('Registrerede'))
})

test('own team: a colleague with a recurring shift is found by "what is X doing" with the pattern included', () => {
  const { ask } = createApi('tcd')
  const answer = ask('hvad laver Anna Dahl i denne uge?')
  assert.match(answer.text, /^Status for Anna Dahl/)
  assert.match(answer.text, /onsdag 16\. sep\.: På arbejde — Opgave: (?:Lukkevagt, Lukkovuoro|Lukkovuoro, Lukkevagt)/)
  noLeaks(answer)
})

test('foreign person: "hvad laver Frederik Torp i denne uge?" finds him in the other team (da)', () => {
  const { ask, reads } = createApi('tcd')
  const answer = ask('hvad laver Frederik Torp i denne uge?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /^Status for Frederik Torp \(14\.–20\. sep\.\):/)
  assert.match(answer.text, /tirsdag 15\. sep\.: Hjemmearbejde — Opgave: Åbning/)
  assert.match(answer.text, /fredag 18\. sep\.: På arbejde — Opgave: Lukkevagt/) // pattern, every 2nd week
  assert.deepEqual(answer.sources.map(source => source.teamId), ['TRR'])
  noLeaks(answer)
  for (const key of ['notebook-notes', 'emails', 'guides', 'projects']) assert.ok(!trrReads(reads).includes(key), key)
  assert.ok(trrReads(reads).every(key => TRR_SHIFT_KEYS.includes(key)), trrReads(reads).join(','))
})

test('foreign person in English, Finnish and Swedish', () => {
  for (const [language, question, header] of [
    ['en', 'what is Frederik Torp doing this week?', /^Status for Frederik Torp/],
    ['fi', 'mitä Frederik Torp tekee tällä viikolla?', /Frederik Torp/],
    ['sv', 'vad gör Frederik Torp den här veckan?', /^Status för Frederik Torp/],
  ]) {
    const { ask, reads } = createApi('tcd')
    const answer = ask(question, language)
    assert.equal(answer.mode, 'data', question)
    assert.match(answer.text, header, question)
    assert.match(answer.text, /Åbning/, question)
    assert.match(answer.text, /Lukkevagt/, question)
    noLeaks(answer)
    assert.ok(trrReads(reads).every(key => TRR_SHIFT_KEYS.includes(key)), question)
  }
})

test('a task-style question about a foreign person (hvad skal X arbejde med) is answered the same way, with the team shown', () => {
  const { ask } = createApi('tcd')
  const answer = ask('hvad skal Frederik Torp arbejde med i denne uge?')
  assert.match(answer.text, /^Registrerede opgaver for Frederik Torp/)
  assert.match(answer.text, /tirsdag 15\. sep\. · TRR: Åbning/)
  assert.match(answer.text, /fredag 18\. sep\. · TRR: Lukkevagt/)
  noLeaks(answer)
})

test('foreign team: a TRR user asks "hvem har lukkevagt i TCD i denne uge?" (da)', () => {
  const { ask, reads } = createApi('trr')
  const answer = ask('hvem har lukkevagt i TCD i denne uge?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /^Lukkevagt · TCD \(14\.–20\. sep\.\):/)
  assert.match(answer.text, /onsdag 16\. sep\. · TCD: Anna Dahl — Lukkevagt/)
  assert.match(answer.text, /torsdag 17\. sep\. · TCD: Bo Berg — Lukkevagt/)
  assert.ok(!answer.text.includes('Test User')) // vacation removes his Monday pattern
  assert.ok(!answer.text.includes('Maja'))
  assert.deepEqual(answer.sources.map(source => source.teamId), ['TCD'])
  noLeaks(answer)
  assert.ok(!reads.some(read => read.startsWith('TCD:') && !TRR_SHIFT_KEYS.includes(read.slice(4))))
})

test('foreign team in English, Finnish and Swedish, also when the role is not a "vagt" word', () => {
  for (const [language, question, expected, unexpected] of [
    ['en', 'who has closing in TCD this week?', /Bo Berg — Closing/, 'Lukkevagt'],
    ['fi', 'kuka on lukkovuorossa TCD:ssä tällä viikolla?', /Anna Dahl — Lukkovuoro/, 'Lukkevagt'],
    ['sv', 'vem har stängning i TCD denna vecka?', /Test User — Stängning/, 'Lukkevagt'],
    ['da', 'hvem er på lukkevagt i TCD i denne uge?', /Bo Berg — Lukkevagt/, 'Closing'],
  ]) {
    const { ask } = createApi('trr')
    const answer = ask(question, language)
    assert.equal(answer.mode, 'data', question)
    assert.match(answer.text, expected, question)
    assert.ok(!answer.text.includes(unexpected), question)
    assert.match(answer.text, /· TCD/, question)
    noLeaks(answer)
  }
})

test('naming a foreign team without a person shows its whole schedule, never the asker\'s own plan', () => {
  const { ask } = createApi('trr')
  const answer = ask('vagtplan i TCD denne uge')
  assert.match(answer.text, /^Registrerede teamopgaver · TCD/)
  assert.match(answer.text, /Bo Berg — AM/)
  assert.ok(!answer.text.includes('Maja'))
})

test('"hvem har vagt" without a team name stays in the own team', () => {
  const { ask, reads } = createApi('tcd')
  const answer = ask('hvem har vagt denne uge?')
  assert.ok(!answer.text.includes('Frederik'))
  assert.ok(!answer.text.includes('TRR'))
  assert.deepEqual(trrReads(reads), [])
  const role = createApi('tcd')
  const closing = role.ask('hvem har lukkevagt denne uge?')
  assert.ok(!closing.text.includes('Frederik'))
  assert.deepEqual(trrReads(role.reads), [])
})

test('an unknown person is searched for by name only and never answered with the asker\'s own plan', () => {
  const { ask, reads } = createApi('tcd')
  const answer = ask('hvad skal Ukendt Person lave i denne uge?')
  assert.match(answer.text, /Jeg kan ikke finde “ukendt person” blandt de godkendte personer i nogen teams/)
  assert.deepEqual(answer.sources, [])
  assert.deepEqual(trrReads(reads), ['users'])
})

test('every other module of the other team stays closed', () => {
  const { ask, reads } = createApi('tcd')
  for (const question of ['vis noter i TRR', 'vis beskeder fra TRR', 'hvilke guides har TRR?', 'hvilke projekter har TRR?', 'vagter og noter fra TRR', 'vis TRR ferie næste uge']) {
    assert.throws(() => ask(question), /ikke adgang/, question)
  }
  for (const key of ['notebook-notes', 'emails', 'guides', 'projects']) assert.ok(!trrReads(reads).includes(key), key)
  assert.ok(trrReads(reads).every(key => key === 'users' || TRR_SHIFT_KEYS.includes(key)))
  noLeaks({ reads })
})

test('the refusal says that shift schedules can be looked up across teams, in all four languages', () => {
  const { ask } = createApi('tcd')
  for (const [language, question, expected] of [
    ['da', 'vis noter i TRR', /vagtplaner/],
    ['en', 'show notes in TRR', /shift schedules/],
    ['fi', 'näytä muistiinpanot TRR', /työvuorolistat/],
    ['sv', 'visa anteckningar TRR', /scheman/],
  ]) assert.throws(() => ask(question, language), expected, question)
})

test('a recurring shift on approved vacation or sick leave does not show for another team either', () => {
  const { ask, data } = createApi('tcd')
  data.TRR['vacation-entries'].push({ userEmail: 'frederik@test', startDate: '2026-09-18', endDate: '2026-09-18', status: 'approved' })
  const answer = ask('hvem har lukkevagt i TRR i denne uge?')
  assert.ok(!answer.text.includes('Frederik Torp'))
})
