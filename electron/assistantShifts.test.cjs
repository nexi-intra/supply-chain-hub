const test = require('node:test')
const assert = require('node:assert/strict')
const { matchesShiftInterval, expandPatterns, loadShifts, shiftsInRange, rolesNamedIn } = require('./assistantShifts.cjs')

const pattern = (overrides = {}) => ({ id: 'p1', employeeId: 'oliver@test', employeeName: 'Oliver', roleId: 'close', weekdays: [1], intervalWeeks: 1, anchorDate: '2026-09-21', ...overrides })

test('interval matching counts elapsed Mondays from the anchor week, also across a year boundary', () => {
  // 2026-12-28 is a Monday: every 2nd week from 2026-12-14 hits 12-14, 12-28, 2027-01-11.
  assert.equal(matchesShiftInterval('2026-12-14', '2026-12-14', 2), true)
  assert.equal(matchesShiftInterval('2026-12-21', '2026-12-14', 2), false)
  assert.equal(matchesShiftInterval('2026-12-28', '2026-12-14', 2), true)
  assert.equal(matchesShiftInterval('2027-01-04', '2026-12-14', 2), false)
  assert.equal(matchesShiftInterval('2027-01-11', '2026-12-14', 2), true)
  // Every 3rd week; ISO week numbers would restart in January but the elapsed-week count does not.
  assert.deepEqual(['2026-12-07', '2026-12-28', '2027-01-18', '2027-02-08'].map(date => matchesShiftInterval(date, '2026-12-07', 3)), [true, true, true, true])
  assert.deepEqual(['2026-12-14', '2026-12-21', '2027-01-04', '2027-01-11'].map(date => matchesShiftInterval(date, '2026-12-07', 3)), [false, false, false, false])
  // The anchor week counts from its Monday, whatever weekday the anchor is.
  assert.equal(matchesShiftInterval('2026-09-14', '2026-09-18', 2), true)
  assert.equal(matchesShiftInterval('2026-09-21', '2026-09-18', 2), false)
  // Before the anchor week nothing matches.
  assert.equal(matchesShiftInterval('2026-09-14', '2026-09-21', 1), false)
  // Across the DST change in October the week count stays exact.
  assert.equal(matchesShiftInterval('2026-11-02', '2026-10-05', 2), true)
  assert.equal(matchesShiftInterval('2026-11-09', '2026-10-05', 2), false)
})

test('patterns expand on their weekday, stop at endDate and let a real shift for the same person and role win', () => {
  assert.equal(expandPatterns([pattern()], [], '2026-09-21').length, 1)
  assert.equal(expandPatterns([pattern({ weekdays: [2] })], [], '2026-09-21').length, 0)
  assert.equal(expandPatterns([pattern()], [], '2026-09-14').length, 0)
  assert.equal(expandPatterns([pattern({ endDate: '2026-09-21' })], [], '2026-09-28').length, 0)
  assert.equal(expandPatterns([pattern({ endDate: '2026-09-28' })], [], '2026-09-28').length, 1)
  const real = [{ employeeId: 'oliver@test', roleId: 'close', date: '2026-09-21' }]
  assert.equal(expandPatterns([pattern()], real, '2026-09-21').length, 0)
  assert.equal(expandPatterns([pattern()], [{ employeeId: 'oliver@test', roleId: 'other', date: '2026-09-21' }], '2026-09-21').length, 1)
  assert.equal(expandPatterns([pattern({ intervalWeeks: 2 })], [], '2026-09-28').length, 0)
  assert.equal(expandPatterns([pattern({ intervalWeeks: 2 })], [], '2026-10-05').length, 1)
  assert.equal(expandPatterns([pattern()], [], '2026-09-21', employeeId => employeeId === 'oliver@test').length, 0)
})

test('loadShifts merges single shifts and patterns, drops patterns on approved vacation or sick leave and never carries comments', () => {
  const store = {
    users: { 'oliver@test': { email: 'oliver@test', fullName: 'Oliver', status: 'approved' }, 'legacy@test': { email: 'legacy@test', id: 'legacy-id', fullName: 'Legacy' } },
    'shift-roles': [{ id: 'close', name: 'Lukkevagt' }, { id: 'open', name: 'Åbning' }],
    'shift-assignments': [{ id: 'a1', employeeId: 'oliver@test', roleId: 'open', date: '2026-09-22T00:00:00', comment: 'REAL_COMMENT' }],
    'shift-patterns': [
      pattern({ comment: 'PATTERN_COMMENT' }),
      pattern({ id: 'p2', employeeId: 'legacy-id', employeeName: 'Legacy' }),
      pattern({ id: 'p3', employeeId: 'oliver@test', weekdays: [1, 2], roleId: 'open' }),
    ],
    'vacation-entries': [
      { userEmail: 'oliver@test', startDate: '2026-09-28', endDate: '2026-09-28', status: 'approved' },
      { userEmail: 'legacy@test', startDate: '2026-10-05', endDate: '2026-10-09', status: 'pending' },
    ],
    'sick-leave-entries': [{ userEmail: 'legacy@test', startDate: '2026-10-12', status: 'approved' }],
  }
  const read = (_team, key) => store[key]
  const team = { teamId: 'T' }
  const rows = shiftsInRange(team, read, { start: '2026-09-21', end: '2026-10-13' })
  const monday = date => rows.filter(row => row.date === date).map(row => `${row.employeeId}:${row.roleName}:${row.pattern ? 'p' : 'r'}`).sort()
  assert.deepEqual(monday('2026-09-21'), ['legacy-id:Lukkevagt:p', 'oliver@test:Lukkevagt:p', 'oliver@test:Åbning:p'])
  // The real shift on Tuesday 22nd stays; the Tuesday pattern for the same person and role is dropped.
  assert.deepEqual(monday('2026-09-22'), ['oliver@test:Åbning:r'])
  // Approved vacation removes Oliver's patterns on 28 Sep, not Legacy's.
  assert.deepEqual(monday('2026-09-28'), ['legacy-id:Lukkevagt:p'])
  // A pending vacation does not remove a pattern; approved sick leave (matched through the legacy id) does.
  assert.deepEqual(monday('2026-10-05').filter(row => row.startsWith('legacy-id')), ['legacy-id:Lukkevagt:p'])
  assert.deepEqual(monday('2026-10-12').filter(row => row.startsWith('legacy-id')), [])
  assert.ok(!JSON.stringify(rows).includes('COMMENT'))
  assert.ok(rows.every(row => !('comment' in row)))
})

test('loadShifts tolerates missing keys and reads nothing but shift data until a pattern needs the absence lists', () => {
  const reads = []
  const read = (_team, key) => { reads.push(key); return undefined }
  assert.deepEqual(loadShifts({ teamId: 'T' }, read).inRange({ start: '2026-09-14', end: '2026-09-20' }), [])
  assert.deepEqual([...new Set(reads)].sort(), ['shift-assignments', 'shift-patterns', 'shift-roles'])
})

test('role names in a question: inflections of 4+ letter names, exact words for shorter ones, generic names never filter', () => {
  const roles = [{ id: 'close', name: 'Lukkevagt' }, { id: 'weekend', name: 'Lukkevagt weekend' }, { id: 'am', name: 'AM' }, { id: 'gen', name: 'Vagt' }, { id: 'early', name: 'Tidlig (07-15)' }, { id: 'aa', name: 'Åbning' }, { id: 'pm', name: 'PM' }]
  const ids = question => rolesNamedIn(question, roles).map(role => role.id)
  assert.deepEqual(ids('hvem har lukkevagt i TCD i denne uge?'), ['close'])
  assert.deepEqual(ids('hvem har LUKKEVAGTEN denne uge'), ['close'])
  assert.deepEqual(ids('hvem har lukkevagter denne uge'), ['close'])
  assert.deepEqual(ids('hvem har lukkevagterne denne uge'), ['close'])
  assert.deepEqual(ids('hvem har lukkevagt weekend'), ['weekend'])
  assert.deepEqual(ids('hvem har åbningen i morgen'), ['aa'])
  assert.deepEqual(ids('hvem har ÅBNING i morgen'), ['aa'])
  assert.deepEqual(ids('hvem har tidlig i morgen'), ['early'])
  // "Vagt" is the everyday word for every shift question; it never narrows the answer.
  assert.deepEqual(ids('hvem har vagt i morgen?'), [])
  assert.deepEqual(ids('hvem har vagter denne uge?'), [])
  // Short names match as whole words only, and "am" the English verb needs the role's own spelling.
  assert.deepEqual(ids('hvem har PM i dag?'), ['pm'])
  assert.deepEqual(ids('hvem har pm i dag?'), ['pm'])
  assert.deepEqual(ids('hvem har AM i dag?'), ['am'])
  assert.deepEqual(ids('what am I doing this week?'), [])
  assert.deepEqual(ids('hvem har amager i dag?'), [])
  assert.deepEqual(ids('hvem har lukkevagtsoversigt'), [])
  assert.deepEqual(ids('hvordan er vejret'), [])
})

// Training round (1.6.3): short role names as teams really write them, asked the way people talk, in four languages.
test('short role names: the role is found in everyday wording, and ordinary words are never read as a role', () => {
  const roles = [{ id: 'lead', name: 'Lead' }, { id: 'pick', name: 'Pick' }, { id: 'kran', name: 'Kran' }, { id: 'post', name: 'Post' }, { id: 'tl', name: 'TL' }, { id: 'lager', name: 'Lager' }, { id: 'kasse', name: 'Kasse' }, { id: 'retur', name: 'Retur' }]
  const ids = question => rolesNamedIn(question, roles).map(role => role.id)
  const cases = [
    ['hvem er lead i dag?', ['lead']], ['hvem er leader i morgen?', ['lead']], ['who is the lead today?', ['lead']], ['who leads tomorrow?', ['lead']],
    ['kuka on lead tänään?', ['lead']], ['vem är lead idag?', ['lead']], ['hvem har pick i dag?', ['pick']], ['who is picking today?', ['pick']],
    ['hvem kører kranen i dag?', ['kran']], ['hvem har posten i dag?', ['post']], ['hvem er TL i dag?', ['tl']], ['hvem er tl i morgen?', ['tl']],
    ['hvem har lageret i dag?', ['lager']], ['hvem sidder i kassen i dag?', ['kasse']], ['hvem tager returerne i morgen?', ['retur']], ['vem har lagret idag?', []],
    // Everyday words that only resemble a role.
    ['hvem er min leder?', []], ['hvem har ferie i dag?', []], ['who is on the leaderboard?', []], ['hvem har returneringsguiden?', []], ['hvem har vagt i dag?', []],
  ]
  const wrong = cases.filter(([question, expected]) => JSON.stringify(ids(question)) !== JSON.stringify(expected)).map(([question, expected]) => `${question} -> ${JSON.stringify(ids(question))} (expected ${JSON.stringify(expected)})`)
  assert.deepEqual(wrong, [])
})
