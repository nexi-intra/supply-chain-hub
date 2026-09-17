const test = require('node:test')
const assert = require('node:assert/strict')
const { createAssistantContext, resolveDates } = require('./assistantContext.cjs')
const { createLocalAI } = require('./localAI.cjs')

const now = new Date(2026, 8, 15, 12)
function fixture() {
  const teams = [{ teamId: 'TCD', abbreviation: 'TCD', name: 'Dispatch', folderName: 'TCD' }, { teamId: 'TRR', abbreviation: 'TRR', name: 'Returns', folderName: 'TRR' }]
  const stores = {
    TCD: {
      users: { 'me@test': { email: 'me@test', fullName: 'Test User', password: 'NEVER_SEND_PASSWORD', status: 'approved' }, 'colleague@test': { fullName: 'Colleague', status: 'approved' } },
      'shift-roles': [{ id: 'pack', name: 'Packing' }],
      'shift-assignments': [{ id: 'mine', employeeId: 'me@test', roleId: 'pack', date: '2026-09-21', comment: 'PRIVATE_COMMENT' }, { employeeId: 'colleague@test', roleId: 'pack', date: '2026-09-22' }, { employeeId: 'me@test', roleId: 'pack', date: '2026-09-28' }],
      'home-office-patterns': { 'me@test': { weekdays: [4] }, 'colleague@test': { weekdays: [4] } },
      'home-office-exceptions': [{ userEmail: 'me@test', date: '2026-09-17', isHomeOffice: false }],
      'vacation-entries': [{ userEmail: 'colleague@test', startDate: '2026-09-17', endDate: '2026-09-17', status: 'approved', notes: 'SECRET_NOTES' }],
      guides: [{ id: 'own', title: 'Terminal setup', version: '1.02', sections: [{ heading: 'Power', steps: [{ text: 'Connect the terminal cable.', imageIds: ['file_image'] }] }] }],
      'file_image_meta': { chunkCount: 1, contentType: 'image/png', size: 3 },
      'file_image_chunk_0': 'YWJj',
      'guide-review-requests': [{ proposedGuide: { title: 'DRAFT_SECRET' } }],
    },
    TRR: { users: { 'other@test': { fullName: 'Other User', password: 'OTHER_PASSWORD' } }, 'home-office-patterns': { 'other@test': { weekdays: [4] } }, guides: [{ id: 'private', title: 'Terminal secret', content: 'PRIVATE_GUIDE_BODY' }], 'shift-assignments': [{ employeeId: 'other@test', date: '2026-09-21', roleId: 'SECRET_TASK' }] },
  }
  const shared = { 'active-sessions': { valid: { email: 'me@test', expiresAt: Date.now() + 60000 }, expired: { email: 'me@test', expiresAt: 1 } }, 'shared-guides': [{ id: 'shared-other', title: 'Terminal shared secret', content: 'SECRET_SHARED', sharedWithTeamCodes: ['TRR'] }] }
  const reads = []
  const api = createAssistantContext({ listTeams: () => teams, lookupTeam: () => teams[0], listViews: () => [{ viewId: 'allowed', teamIds: ['TCD', 'TRR'] }], creatorEmail: () => 'creator@test', currentFolder: () => 'TCD', readShared: key => { reads.push(`shared:${key}`); return shared[key] }, readTeam: (team, key) => { reads.push(`${team.teamId}:${key}`); return stores[team.teamId][key] } })
  return { api, stores, shared, reads, teams }
}
const request = question => ({ token: 'valid', question, language: 'da' })

function personFixture() {
  const f = fixture()
  f.stores.TCD.users['dom@test'] = { email: 'dom@test', id: 'dom-id', fullName: 'Dominic Example', username: 'domexample', status: 'approved', password: 'DOM_PASSWORD' }
  f.stores.TCD['shift-roles'].push({ id: 'receive', name: 'Receiving' })
  f.stores.TCD['shift-assignments'].push(
    { employeeId: 'dom-id', roleId: 'receive', date: '2026-09-21', comment: 'DOM_PRIVATE_COMMENT' },
    { employeeId: 'dom@test', roleId: 'receive', date: '2026-09-25T12:00:00' },
    { employeeId: 'dom@test', roleId: 'receive', date: '2026-09-28' },
  )
  return f
}

test('reported named-colleague work question returns that person’s next calendar week only', () => {
  const { api, reads } = personFixture()
  const answer = api.query(request('hvad skal dominic arbejde med i næste uge?'), now)
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Registrerede opgaver for Dominic Example/)
  assert.match(answer.text, /2026-09-21 · TCD: Receiving/)
  assert.match(answer.text, /2026-09-25 · TCD: Receiving/)
  for (const forbidden of ['Packing', '2026-09-28', 'PASSWORD', 'PRIVATE_COMMENT']) assert.ok(!JSON.stringify(answer).includes(forbidden))
  assert.ok(!reads.includes('TRR:users'))
  assert.ok(!reads.includes('TRR:shift-assignments'))
  assert.ok(answer.sources.every(source => source.kind === 'shifts'))
})

test('person interpretation handles name, possessive, username, email and multilingual work questions', () => {
  const { api } = personFixture()
  for (const question of [
    'Hvad skal DOMINIC lave næste uge?',
    'Hvad arbejder Dominic med næste uge?',
    'Hvilke opgaver har Dominic næste uge?',
    'Dominics opgaver næste uge',
    "Dominic's tasks next week",
    'opgaver for Dominic Example i næste uge',
    'hvad skal domexample arbejde med næste uge?',
    'opgaver for dom@test næste uge',
    'What will Dominic work on next week?',
    'Which tasks does Dominic have next week?',
    'mitä Dominic tekee ensi viikolla?',
    'Dominicin tehtävät ensi viikolla',
  ]) {
    const answer = api.query(request(question), now)
    assert.equal(answer.mode, 'data', question)
    assert.match(answer.text, /Dominic Example/, question)
    assert.match(answer.text, /Receiving/, question)
    assert.ok(!answer.text.includes('Packing'), question)
  }
})

test('an explicit unknown person never falls back to own plan or reads an unauthorized directory', () => {
  const { api, reads } = personFixture()
  for (const question of ['hvad skal Missing Person arbejde med næste uge?', 'hvad skal Other User lave næste uge?', 'opgaver for Dominicx næste uge']) {
    const answer = api.query(request(question), now)
    assert.match(answer.text, /Jeg kan ikke finde/)
    assert.deepEqual(answer.sources, [])
    assert.ok(!answer.text.includes('Packing'))
  }
  assert.ok(!reads.includes('TRR:users'))
  assert.ok(!reads.includes('TCD:shift-assignments'))
})

test('duplicate first names require selection, while full names resolve without guessing', () => {
  const { api, stores } = personFixture()
  stores.TCD.users['dom2@test'] = { email: 'dom2@test', fullName: 'Dominic Second', status: 'approved' }
  stores.TCD['shift-assignments'].push({ employeeId: 'dom2@test', roleId: 'pack', date: '2026-09-22' })
  const req = request('hvad skal Dominic lave næste uge?')
  const choices = api.query(req, now)
  assert.equal(choices.personChoices.length, 2)
  assert.deepEqual(choices.sources, [])
  const selected = api.query({ ...req, selectedPerson: 'dom2@test' }, now)
  assert.match(selected.text, /Dominic Second/)
  assert.match(selected.text, /Packing/)
  assert.ok(!selected.text.includes('Receiving'))
  assert.throws(() => api.query({ ...req, selectedPerson: 'other@test' }, now), /Personvalget/)
  assert.throws(() => api.query({ ...req, selectedPerson: { email: 'dom@test' } }, now), /Personvalget/)
  assert.match(api.query(request('hvad skal Dominic Example lave næste uge?'), now).text, /Receiving/)
  stores.TCD.users['dom2@test'].status = 'pending'
  assert.throws(() => api.query({ ...req, selectedPerson: 'dom2@test' }, now), /Personvalget/)
})

test('whole-team plan labels each person and excludes pending users and creator', () => {
  const { api, stores } = personFixture()
  stores.TCD.users['pending@test'] = { fullName: 'Pending Person', status: 'pending' }
  stores.TCD.users['creator@test'] = { fullName: 'Creator Person', status: 'approved' }
  for (const employeeId of ['pending@test', 'creator@test']) stores.TCD['shift-assignments'].push({ employeeId, date: '2026-09-21', roleId: 'pack' })
  const answer = api.query(request('Vis hele teamets opgaver næste uge'), now)
  assert.match(answer.text, /Test User — Packing/)
  assert.match(answer.text, /Dominic Example — Receiving/)
  assert.match(answer.text, /Colleague — Packing/)
  assert.ok(!answer.text.includes('Pending Person'))
  assert.ok(!answer.text.includes('Creator Person'))
  assert.throws(() => api.query({ ...request('hele teamets opgaver næste uge'), selectedPerson: 'dom@test' }, now), /Personvalget/)
})

test('observer person lookup groups one account across assigned teams and honors explicit team scope', () => {
  const { api, stores, reads, teams } = personFixture()
  stores.TRR.users['dom@test'] = { email: 'dom@test', id: 'trr-dom-id', fullName: 'Dominic Example' }
  stores.TRR['shift-roles'] = [{ id: 'return', name: 'Returns task' }]
  stores.TRR['shift-assignments'].push({ employeeId: 'trr-dom-id', roleId: 'return', date: '2026-09-23' })
  teams.push({ teamId: 'LAB', abbreviation: 'LAB', folderName: 'LAB' })
  stores.LAB = { users: { 'hidden@test': { fullName: 'Dominic Hidden' } } }
  const req = { ...request('hvad skal Dominic lave næste uge?'), viewId: 'allowed' }
  const answer = api.query(req, now)
  assert.equal(answer.personChoices, undefined)
  assert.match(answer.text, /TCD: Receiving/)
  assert.match(answer.text, /TRR: Returns task/)
  assert.ok(!reads.includes('LAB:users'))
  const restricted = api.query({ ...req, question: 'hvad skal Dominic fra TRR lave næste uge?' }, now)
  assert.match(restricted.text, /TRR: Returns task/)
  assert.ok(!restricted.text.includes('Receiving'))
  assert.throws(() => api.query({ ...req, question: 'hvad skal Dominic fra LAB lave næste uge?' }, now), /ikke adgang/)
})

test('legacy employee arrays support stored IDs for named lookup without exposing fields', () => {
  const { api, stores } = personFixture()
  stores.TRR.users = [{ id: 'legacy-id', email: 'legacy@test', name: 'Legacy Example', password: 'LEGACY_PASSWORD' }]
  stores.TRR['shift-roles'] = [{ id: 'pack', name: 'Legacy role' }]
  stores.TRR['shift-assignments'] = [{ employeeId: 'legacy-id', roleId: 'pack', date: '2026-09-21' }]
  const answer = api.query({ ...request('opgaver for Legacy næste uge'), viewId: 'allowed' }, now)
  assert.match(answer.text, /Legacy Example/)
  assert.match(answer.text, /Legacy role/)
  assert.ok(!JSON.stringify(answer).includes('PASSWORD'))
})

test('work-from-home question is not misrouted to own task plan', () => {
  const { api } = fixture()
  const answer = api.query(request('hvem skal arbejde hjemme næste torsdag?'), now)
  assert.match(answer.text, /Registreret hjemmearbejde/)
  assert.ok(!answer.text.includes('Dine registrerede opgaver'))
})

test('next week means next calendar Monday–Sunday, including across year and DST', () => {
  assert.deepEqual(resolveDates('næste uge', now), { start: '2026-09-21', end: '2026-09-27' })
  assert.deepEqual(resolveDates('next week', new Date(2026, 11, 31)), { start: '2027-01-04', end: '2027-01-10' })
  assert.deepEqual(resolveDates('ensi viikolla', new Date(2026, 9, 21)), { start: '2026-10-26', end: '2026-11-01' })
})
test('weekday, weekday in next week, tomorrow and explicit date are deterministic', () => {
  assert.deepEqual(resolveDates('næste torsdag', now), { start: '2026-09-17', end: '2026-09-17' })
  assert.deepEqual(resolveDates('torsdag næste uge', now), { start: '2026-09-24', end: '2026-09-24' })
  assert.deepEqual(resolveDates('i morgen', now), { start: '2026-09-16', end: '2026-09-16' })
  assert.deepEqual(resolveDates('17.9.2026', now), { start: '2026-09-17', end: '2026-09-17' })
  assert.equal(resolveDates('2026-02-30', now), null)
  assert.equal(resolveDates('senere engang', now), null)
})
test('only own tasks inside range, never passwords, comments or other tasks', () => {
  const { api, reads } = fixture()
  const answer = api.query(request('hvilke opgaver skal jeg lave næste uge'), now)
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /2026-09-21 · TCD: Packing/)
  const result = JSON.stringify(answer)
  for (const forbidden of ['2026-09-28', '2026-09-22 ·', 'PASSWORD', 'PRIVATE_COMMENT', 'SECRET_TASK']) assert.ok(!result.includes(forbidden))
  assert.ok(!reads.includes('TRR:shift-assignments'))
})
test('missing date asks for clarification; no unbounded task lookup', () => {
  const { api, reads } = fixture()
  assert.match(api.query(request('mine opgaver'), now).text, /Hvilken dato/)
  assert.ok(!reads.includes('TCD:shift-assignments'))
})
test('no recorded tasks does not imply a day off', () => {
  const { api } = fixture()
  assert.match(api.query(request('mine opgaver 2026-09-23'), now).text, /ikke nødvendigvis, at du har fri/)
})
test('home office overview crosses teams but does not read protected team data', () => {
  const { api, reads } = fixture()
  const answer = api.query(request('hvem arbejder hjemme i Supply Chain næste torsdag'), now)
  assert.match(answer.text, /TRR: Other User/)
  assert.ok(!answer.text.includes('Test User')) // single-day office exception
  assert.ok(!answer.text.includes('Colleague')) // approved vacation
  assert.ok(!reads.includes('TRR:guides'))
  assert.ok(!reads.includes('TRR:shift-assignments'))
  assert.ok(!JSON.stringify(answer).includes('PASSWORD'))
})
test('a plain work-from-home question crosses teams like the public dashboard widget', () => {
  const { api, reads } = fixture()
  const answer = api.query(request('hvem er hjemmefra på torsdag?'), now)
  assert.match(answer.text, /TRR: Other User/)
  assert.ok(!reads.includes('TRR:guides'))
  assert.ok(!reads.includes('TRR:shift-assignments'))
  assert.ok(!JSON.stringify(answer).includes('PASSWORD'))
})
test('team-explicit task question cannot read another team', () => {
  const { api, reads } = fixture()
  assert.throws(() => api.query(request('opgaver i TRR næste uge'), now), /ikke adgang/)
  assert.ok(!reads.includes('TRR:shift-assignments'))
})
test('cross-team people question returns only names and roles from the public directory', () => {
  const { api, reads } = fixture()
  const answer = api.query(request('kan du give mig en liste over personer i TRR?'), now)
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Other User/)
  assert.ok(answer.sources.every(source => source.kind === 'directory' && source.teamId === 'TRR'))
  assert.ok(reads.includes('TRR:users'))
  assert.ok(!reads.includes('TRR:shift-assignments'))
  for (const forbidden of ['OTHER_PASSWORD', 'PASSWORD', 'SECRET_TASK', 'other@test']) assert.ok(!JSON.stringify(answer).includes(forbidden), forbidden)
})
test('assigned observer view can read guides, never approves or alters data', () => {
  const { api } = fixture()
  const answer = api.query({ ...request('terminal'), viewId: 'allowed' }, now)
  assert.ok(answer.sources.some(source => source.guideId === 'private'))
  assert.throws(() => api.query({ ...request('terminal'), viewId: 'unauthorized' }, now), /Ingen adgang/)
})
test('published own guides only, not unshared external guides or pending drafts', () => {
  const { api } = fixture()
  const answer = api.query(request('terminal cable'), now)
  assert.equal(answer.mode, 'retrieval')
  assert.equal(answer.sources.length, 1)
  assert.equal(answer.sources[0].guideId, 'own')
  assert.equal(answer.sources[0].reference, '1.1')
  assert.equal(answer.sources[0].version, '1.02')
  assert.ok(!JSON.stringify(answer).includes('SECRET'))
})
test('guide and image fetches independently recheck access and belonging', () => {
  const { api } = fixture()
  assert.throws(() => api.getGuide('valid', undefined, 'TRR', 'private'), /ikke adgang/)
  assert.throws(() => api.getImage('valid', undefined, 'TCD', 'own', 'file_other'), /ikke del/)
  assert.equal(api.getImage('valid', undefined, 'TCD', 'own', 'file_image'), 'data:image/png;base64,YWJj')
})
test('expired, absent, malformed sessions and unapproved users are rejected', () => {
  const { api, stores, shared } = fixture()
  assert.throws(() => api.query({ ...request('terminal'), token: 'expired' }), /Log ind/)
  assert.throws(() => api.query({ ...request('terminal'), token: 'missing' }), /Log ind/)
  shared['active-sessions'].valid.expiresAt = 'not-a-date'
  assert.throws(() => api.query(request('terminal')), /Log ind/)
  shared['active-sessions'].valid.expiresAt = Date.now() + 60000
  stores.TCD.users['me@test'].status = 'pending'
  assert.throws(() => api.query(request('terminal')), /ikke godkendt/)
})
test('request length and oversized images are bounded', () => {
  const { api, stores } = fixture()
  assert.throws(() => api.query(request('x'.repeat(1001))), /1000/)
  stores.TCD.file_image_meta = { chunkCount: 999, contentType: 'image/png' }
  assert.throws(() => api.getImage('valid', undefined, 'TCD', 'own', 'file_image'), /for stort/)
})
test('vacation results include approved dates only and exclude notes', () => {
  const { api } = fixture()
  const answer = api.query(request('hvem har ferie næste torsdag'), now)
  assert.match(answer.text, /Colleague/)
  assert.ok(!JSON.stringify(answer).includes('SECRET_NOTES'))
})
test('runtime status works without starting a process or connecting externally', () => {
  const ai = createLocalAI({ assetDir: 'C:\\nonexistent-assistant-test', freeMemory: () => 0 })
  assert.equal(ai.status().running, false)
  assert.equal(ai.status().installed, false)
  assert.equal(ai.status().modelId, '8b')
  assert.match(ai.status().model, /8B/)
  ai.stop()
})
test('reported Nexi Flyer question uses direct score data, not Npayhar guide substrings', () => {
  const { api, stores, reads } = fixture()
  stores.TCD.guides.push({ id: 'unrelated', title: 'Se om Npayhar kortaftaler', sections: [{ heading: '', steps: [{ text: 'Klik application', imageIds: [] }] }] })
  stores.TCD['nexi-flyer-global-leaderboard'] = { easy: [{ email: 'me@test', score: 11 }], medium: [{ email: 'me@test', score: 20 }, { email: 'colleague@test', score: 30 }], hard: [], expert: [] }
  stores.TRR['nexi-flyer-global-leaderboard'] = { medium: [{ email: 'other@test', score: 40 }] }
  const answer = api.query(request('Hvem har highscoren i nexi flyer?'), now)
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Let: Test User \(TCD\) — 11/)
  assert.match(answer.text, /Mellem: Other User \(TRR\) — 40/)
  assert.match(answer.text, /Svær: Ingen registreret score/)
  assert.ok(answer.sources.every(source => source.kind === 'highscores'))
  assert.ok(!reads.includes('TCD:guides'))
  assert.ok(!JSON.stringify(answer).includes('PASSWORD'))
})
test('highscores respect difficulty, explicit team, unsorted records and tied winners', () => {
  const { api, stores } = fixture()
  stores.TCD['nexi-flyer-global-leaderboard'] = { expert: [{ email: 'me@test', score: 5 }, { email: 'colleague@test', score: 50 }, { email: 'me@test', score: 50 }, { email: 'me@test', score: NaN }] }
  const answer = api.query(request('highscore NexiFlyer ekspert TCD'), now)
  assert.match(answer.text, /Ekspert: Colleague \(TCD\), Test User \(TCD\) — 50/)
  assert.ok(!answer.text.includes('Mellem'))
  assert.equal(answer.sources.length, 1)
})

test('reported overview then bare Neon Snake reply returns score data, never unsupported or guides', () => {
  const { api, stores, reads } = fixture()
  stores.TCD['neon-snake-global-leaderboard'] = { easy: [{ email: 'me@test', score: 12 }], expert: [{ email: 'colleague@test', score: 99 }] }
  const overview = api.query(request('Giv mig en oversigt over highscores'), now)
  assert.equal(overview.mode, 'data')
  for (const game of ['Nexi Flyer', 'Neon Snake', 'Brick Break', 'Endless Dodger', 'Tetris']) assert.ok(overview.text.includes(game))
  const reply = api.query({ ...request('neon snake'), previousQuestion: overview.scoreContext }, now)
  assert.equal(reply.mode, 'data')
  assert.match(reply.text, /Highscores · Neon Snake/)
  assert.match(reply.text, /Ekspert: Colleague \(TCD\) — 99/)
  assert.ok(!reply.text.includes('Nexi Flyer'))
  assert.ok(!reads.includes('TCD:guides'))
  assert.ok(!JSON.stringify(reply).includes('PASSWORD'))
})

test('bare supported game names work without history, including spelling aliases', () => {
  const { api } = fixture()
  for (const question of ['neon snake', 'NeonSnake', 'Nexi-Flyer', 'Brick Break', 'endless dodger', 'tetris']) {
    const answer = api.query(request(question), now)
    assert.equal(answer.mode, 'data', question)
    assert.ok(answer.sources.every(source => source.kind === 'highscores'))
    assert.match(answer.text, /Ingen registreret score/)
  }
})

test('game clarification preserves requested team and difficulty', () => {
  const { api, stores, reads } = fixture()
  stores.TCD['neon-snake-global-leaderboard'] = { easy: [{ email: 'me@test', score: 7 }], expert: [{ email: 'me@test', score: 33 }] }
  stores.TRR['neon-snake-global-leaderboard'] = { expert: [{ email: 'other@test', score: 999 }] }
  const clarification = api.query(request('highscores ekspert TCD'), now)
  assert.match(clarification.text, /Hvilket spil/)
  const answer = api.query({ ...request('neon snake'), previousQuestion: clarification.scoreContext }, now)
  assert.match(answer.text, /Ekspert: Test User \(TCD\) — 33/)
  assert.ok(!answer.text.includes('Let:'))
  assert.ok(!answer.text.includes('999'))
  assert.ok(!reads.includes('TRR:neon-snake-global-leaderboard'))
})

test('consecutive score follow-ups replace game, difficulty or team rather than mixing requests', () => {
  const { api, stores } = fixture()
  stores.TCD['neon-snake-global-leaderboard'] = { easy: [{ email: 'me@test', score: 7 }], expert: [{ email: 'me@test', score: 33 }] }
  stores.TRR['neon-snake-global-leaderboard'] = { expert: [{ email: 'other@test', score: 99 }] }
  let answer = api.query(request('highscore Neon Snake let TCD'), now)
  answer = api.query({ ...request('og på ekspert?'), previousQuestion: answer.scoreContext }, now)
  assert.match(answer.text, /Ekspert: Test User \(TCD\) — 33/)
  assert.ok(!answer.text.includes('Let:'))
  answer = api.query({ ...request('og i TRR?'), previousQuestion: answer.scoreContext }, now)
  assert.match(answer.text, /Other User \(TRR\) — 99/)
  assert.ok(!answer.text.includes('Test User'))
  answer = api.query({ ...request('Tetris'), previousQuestion: answer.scoreContext }, now)
  assert.match(answer.text, /Highscores · Tetris/)
  assert.ok(!answer.text.includes('Neon Snake'))
})

test('a topic change is not forced into old highscore context', () => {
  const { api } = fixture()
  const previousQuestion = 'highscore Neon Snake ekspert TCD'
  const tasks = api.query({ ...request('mine opgaver næste uge'), previousQuestion }, now)
  assert.match(tasks.text, /Dine registrerede opgaver/)
  assert.equal(tasks.scoreContext, undefined)
  const guide = api.query({ ...request('guide terminal cable'), previousQuestion }, now)
  assert.equal(guide.mode, 'retrieval')
  assert.ok(guide.sources.every(source => source.kind === 'guide'))
  const howToPlay = api.query({ ...request('hvordan spiller jeg Neon Snake?'), previousQuestion }, now)
  assert.ok(!howToPlay.sources.some(source => source.kind === 'highscores'))
})

test('score follow-up revalidates session and observer scope; previous text grants no access', () => {
  const { api, teams, stores, reads } = fixture()
  teams.push({ teamId: 'LAB', abbreviation: 'LAB', folderName: 'LAB' })
  stores.LAB = { users: {}, 'neon-snake-global-leaderboard': { expert: [{ email: 'hidden@test', score: 999 }] } }
  const req = { ...request('neon snake'), viewId: 'allowed', previousQuestion: 'highscore ekspert LAB' }
  assert.throws(() => api.query(req, now), /ikke adgang/)
  assert.ok(!reads.includes('LAB:neon-snake-global-leaderboard'))
  assert.throws(() => api.query({ ...req, previousQuestion: 'highscores', token: 'expired' }, now), /Log ind/)
  assert.throws(() => api.query({ ...req, previousQuestion: 'highscores', viewId: 'denied' }, now), /Ingen adgang/)
  assert.throws(() => api.query({ ...request('neon snake'), previousQuestion: 'x'.repeat(1001) }, now), /1000/)
  assert.throws(() => api.query({ ...request('neon snake'), previousQuestion: { text: 'highscores' } }, now), /1000/)
})

test('overview respects observer team boundaries, missing scores, flat and difficulty boards', () => {
  const { api, teams, stores, reads } = fixture()
  teams.push({ teamId: 'LAB', abbreviation: 'LAB', folderName: 'LAB' })
  stores.LAB = { users: {}, 'tetris-global-leaderboard': [{ email: 'hidden@test', score: 999 }] }
  stores.TCD['tetris-global-leaderboard'] = [{ email: 'me@test', score: 100 }]
  const answer = api.query({ ...request('Giv mig en oversigt over highscores'), viewId: 'allowed' }, now)
  assert.match(answer.text, /Samlet: Test User \(TCD\) — 100/)
  assert.match(answer.text, /Ingen registreret score/)
  assert.equal(answer.sources.length, 10)
  assert.ok(!answer.text.includes('999'))
  assert.ok(!reads.some(read => read.startsWith('LAB:')))
})

test('English and Finnish score overviews and follow-ups use localized output', () => {
  const { api } = fixture()
  for (const [question, language, followup, label] of [['Give me an overview of highscores', 'en', 'and expert?', 'Expert:'], ['ennätykset yhteenveto', 'fi', 'entä asiantuntija?', 'Asiantuntija:']]) {
    const overview = api.query({ ...request(question), language }, now)
    assert.match(overview.text, /Neon Snake/)
    const game = api.query({ ...request('neon snake'), language, previousQuestion: overview.scoreContext }, now)
    const difficulty = api.query({ ...request(followup), language, previousQuestion: game.scoreContext }, now)
    assert.ok(difficulty.text.includes(label))
    assert.ok(!difficulty.text.includes(language === 'en' ? 'Easy:' : 'Helppo:'))
  }
})
test('flat scoreboards and an absent/unknown game never fall through to guides', () => {
  const { api, stores, reads } = fixture()
  stores.TCD['tetris-global-leaderboard'] = [{ email: 'me@test', score: 100 }]
  assert.match(api.query(request('Who has the highest score in Tetris?')).text, /Test User \(TCD\) — 100/)
  assert.match(api.query(request('highscore i et ukendt spil')).text, /Hvilket spil/)
  assert.ok(!reads.includes('TCD:guides'))
})
test('observer score lookup stays within assigned teams', () => {
  const { api, stores, teams, reads } = fixture()
  teams.push({ teamId: 'LAB', abbreviation: 'LAB', name: 'Other', folderName: 'LAB' })
  stores.LAB = { 'nexi-flyer-global-leaderboard': { medium: [{ email: 'hidden@test', score: 999 }] } }
  stores.TCD['nexi-flyer-global-leaderboard'] = { medium: [{ email: 'me@test', score: 20 }] }
  stores.TRR['nexi-flyer-global-leaderboard'] = { medium: [{ email: 'other@test', score: 40 }] }
  const answer = api.query({ ...request('highscore Nexi Flyer'), viewId: 'allowed' })
  assert.match(answer.text, /Other User/)
  assert.ok(!answer.text.includes('999'))
  assert.ok(!reads.includes('LAB:nexi-flyer-global-leaderboard'))
  assert.throws(() => api.query({ ...request('highscore Nexi Flyer'), viewId: 'denied' }), /Ingen adgang/)
  assert.throws(() => api.query({ ...request('highscore Nexi Flyer i LAB'), viewId: 'allowed' }), /ikke adgang/)
})
test('manager lookup uses team records; unrelated substring searches return no guide sources', () => {
  const { api, stores } = fixture()
  stores.TCD.guides.push({ id: 'false-hit', title: 'Se om Npayhar kortaftaler', content: 'Manager information' })
  const answer = api.query(request('Hvem er manageren?'))
  assert.equal(answer.mode, 'data')
  assert.deepEqual(answer.sources, [])
  const query = api.query(request('har highscore i nexi unknown?'))
  assert.equal(query.mode, 'data')
  assert.deepEqual(query.sources, [])
  const noMatch = api.query(request('har kort guide'))
  assert.equal(noMatch.sources.length, 0) // 'kort' must not match 'kortaftaler'
})
