const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('./store.cjs')
const { createTeamReader, registeredTeamDir } = require('./teamReadPolicy.cjs')
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-team-policy-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const teams = [{ teamId: 'a', folderName: 'A' }, { teamId: 'b', folderName: 'B' }]
  const actor = { email: 'user@example.test', userId: 'user_user@example.test', home: teams[0], viewId: null, role: 'user' }
  const views = [{ viewId: 'both', teamIds: ['a', 'b'] }]
  const own = createStore(path.join(root, 'A')), other = createStore(path.join(root, 'B'))
  own.set('users', { [actor.email]: { email: actor.email, fullName: 'Synthetic User' } })
  other.set('users', { 'other@example.test': { email: 'other@example.test', fullName: 'Other User', password: 'SECRET', phone: 'PRIVATE', privateMetadata: 'PRIVATE' } })
  const guide = { id: 'g1', title: 'Synthetic cloud guide', content: 'SECRET BODY', category: 'Technical', tags: ['cloud'], version: '1.00', language: 'da', wordFileData: 'SECRET WORD', fileUrl: 'kv://file_word', coverImageId: 'file_cover', sections: [{ steps: [{ text: 'SECRET STEP', imageIds: ['file_image'] }] }] }
  other.set('guides', [guide]); other.set('file_image_meta', { size: 10 }); other.set('file_image_chunk_0', 'IMAGE'); other.set('file_unrelated_meta', { private: 'SECRET' })
  const request = { id: 'r1', guideId: guide.id, requestingUserEmail: actor.email, requestingTeamCode: 'A', status: 'approved', requestedAt: '2026-09-01T00:00:00Z' }
  const reader = createTeamReader({ getRoot: () => root, listTeams: () => teams, listViews: () => views, openStore: createStore, now: () => Date.parse('2026-09-15T00:00:00Z') })
  return { root, teams, actor, views, own, other, guide, request, reader }
}
const code = expected => error => error.code === expected
test('cross-team catalogue excludes all content, embedded documents and asset IDs', async t => {
  const f = fixture(t), result = (await f.reader.readTeam(f.actor, 'B', 'guides'))[0]
  assert.equal(result.title, f.guide.title); assert.deepEqual(result.sections, []); assert.equal(result.content, '')
  assert.equal(JSON.stringify(result).includes('SECRET'), false)
  for (const key of ['wordFileData', 'fileUrl', 'coverImageId']) assert.equal(result[key], undefined)
})
test('catalogue reads the grant list once per request, not once per guide', async t => {
  const f = fixture(t); let grantReads = 0
  f.other.set('guides', Array.from({ length: 400 }, (_, index) => ({ ...f.guide, id: `g${index}` })))
  const reader = createTeamReader({ getRoot: () => f.root, listTeams: () => f.teams, listViews: () => f.views, openStore: directory => {
    const store = createStore(directory), getAsync = store.getAsync
    store.getAsync = (key, options) => { if (key === 'guide-access-requests') grantReads++; return getAsync(key, options) }
    return store
  } })
  assert.equal((await reader.readTeam(f.actor, 'B', 'guides')).length, 400); assert.equal(grantReads, 1)
})
test('approved own guide request permits content and only referenced files', async t => {
  const f = fixture(t); f.other.set('guide-access-requests', [f.request])
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'guides'))[0].content, 'SECRET BODY')
  assert.equal(await f.reader.readTeam(f.actor, 'B', 'file_image_chunk_0'), 'IMAGE')
  await assert.rejects(f.reader.readTeam(f.actor, 'B', 'file_unrelated_meta'), code('AUTH_FORBIDDEN'))
})
for (const change of [{ requestingUserEmail: 'someone@example.test' }, { requestingTeamCode: 'B' }, { status: 'pending' }, { status: 'rejected' }, { expiresAt: '2026-09-14T00:00:00Z' }, { expiresAt: 'not-a-date' }]) {
  test(`guide access cannot use a grant with ${JSON.stringify(change)}`, async t => {
    const f = fixture(t); f.other.set('guide-access-requests', [{ ...f.request, ...change }])
    assert.equal((await f.reader.readTeam(f.actor, 'B', 'guides'))[0].content, '')
    await assert.rejects(f.reader.readTeam(f.actor, 'B', 'file_image_meta'), code('AUTH_FORBIDDEN'))
  })
}
test('latest rejection revokes earlier approval rather than reviving old grants', async t => {
  const f = fixture(t); f.other.set('guide-access-requests', [f.request, { ...f.request, id: 'r2', status: 'rejected', requestedAt: '2026-09-02T00:00:00Z' }])
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'guides'))[0].content, '')
})
test('request lists disclose only the authenticated account and home team', async t => {
  const f = fixture(t); f.other.set('guide-access-requests', [f.request, { ...f.request, id: 'foreign', requestingUserEmail: 'other@example.test' }])
  assert.deepEqual(await f.reader.readTeam(f.actor, 'B', 'guide-access-requests'), [f.request])
})
test('unknown keys, internal session keys and arbitrary paths are denied', async t => {
  const f = fixture(t)
  for (const key of ['emails', 'active-sessions', 'guide-versions-g1', 'guide-review-revisions', '__private']) await assert.rejects(f.reader.readTeam(f.actor, 'B', key), code('AUTH_FORBIDDEN'))
  for (const folder of ['../B', '_shared', 'unknown', path.join(f.root, 'B')]) await assert.rejects(f.reader.readTeam(f.actor, folder, 'users'), code('AUTH_FORBIDDEN'))
  f.teams.push({ teamId: 'malformed', folderName: '../escape' })
  assert.throws(() => registeredTeamDir(f.root, f.teams, '../escape'), code('AUTH_FORBIDDEN'))
})
test('cross-team overviews keep directory contacts and presence but remove passwords, notes and sickness reasons', async t => {
  const f = fixture(t)
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'users'))['other@example.test'].privateMetadata, undefined)
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'users'))['other@example.test'].phone, 'PRIVATE')
  assert.equal(JSON.stringify(await f.reader.readTeam(f.actor, 'B', 'users')).includes('SECRET'), false)
  f.other.set('vacation-entries', [{ id: 'v1', status: 'approved', startDate: '2026-09-15', notes: 'PRIVATE' }, { id: 'v2', status: 'pending' }])
  f.other.set('sick-leave-entries', [{ id: 's1', status: 'approved', reason: 'PRIVATE', type: 'child', startDate: '2026-09-15' }])
  const vacations = await f.reader.readTeam(f.actor, 'B', 'vacation-entries'), sickness = await f.reader.readTeam(f.actor, 'B', 'sick-leave-entries')
  assert.equal(vacations.length, 1); assert.equal(vacations[0].notes, undefined)
  assert.equal(sickness[0].startDate, '2026-09-15'); assert.equal(sickness[0].reason, undefined); assert.equal(sickness[0].type, undefined)
})
test('batched cross-team reads preserve per-key policy and bound the request', async t => {
  const f = fixture(t)
  const [users, vacations] = await f.reader.readTeamMany(f.actor, 'B', ['users', 'vacation-entries'])
  assert.equal(users['other@example.test'].password, undefined)
  assert.deepEqual(vacations, [])
  await assert.rejects(f.reader.readTeamMany(f.actor, 'B', ['users', 'emails']), code('AUTH_FORBIDDEN'))
  await assert.rejects(f.reader.readTeamMany(f.actor, 'B', Array(21).fill('users')), code('AUTH_FORBIDDEN'))
})
test('multi-team batches validate every request and bound the team count', async t => {
  const f = fixture(t)
  const result = await f.reader.readTeamsMany(f.actor, [{ folderName: 'A', keys: ['users'] }, { folderName: 'B', keys: ['users'] }])
  assert.equal(result.length, 2)
  assert.equal(result[1][0]['other@example.test'].password, undefined)
  await assert.rejects(f.reader.readTeamsMany(f.actor, [{ folderName: '../B', keys: ['users'] }]), code('AUTH_FORBIDDEN'))
  await assert.rejects(f.reader.readTeamsMany(f.actor, Array(21).fill({ folderName: 'B', keys: ['users'] })), code('AUTH_FORBIDDEN'))
})
test('existing Supply Chain leaderboard reads remain available', async t => {
  const f = fixture(t); f.other.set('neon-snake-global-leaderboard', { easy: [{ email: 'other@example.test', score: 42 }] })
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'neon-snake-global-leaderboard')).easy[0].score, 42)
})
test('combined hub reads require the currently selected assigned view', async t => {
  const f = fixture(t)
  await assert.rejects(f.reader.readView(f.actor, 'both', 'b', 'guides'), code('AUTH_FORBIDDEN'))
  f.actor.viewId = 'both'
  assert.equal((await f.reader.readView(f.actor, 'both', 'b', 'guides'))[0].content, 'SECRET BODY')
  assert.equal(await f.reader.readView(f.actor, 'both', 'b', 'file_image_chunk_0'), 'IMAGE')
  await assert.rejects(f.reader.readView(f.actor, 'both', 'b', 'file_unrelated_meta'), code('AUTH_FORBIDDEN'))
  await assert.rejects(f.reader.readView(f.actor, 'both', 'b', 'emails'), code('AUTH_FORBIDDEN'))
  f.views.splice(0); await assert.rejects(f.reader.readView(f.actor, 'both', 'b', 'guides'), code('AUTH_FORBIDDEN'))
})
test('request submission constructs identity/status itself and retries without a duplicate pending request', t => {
  const f = fixture(t), fake = { guideId: 'g1', status: 'approved', requestingUserEmail: 'creator@example.test', requestingTeamCode: 'B', id: 'spoofed' }
  const rows = f.reader.submitRequest(f.actor, 'B', fake)
  assert.equal(rows[0].requestingUserEmail, f.actor.email); assert.equal(rows[0].requestingTeamCode, 'A'); assert.equal(rows[0].status, 'pending')
  assert.equal(rows[0].requestingUserName, 'Synthetic User'); assert.notEqual(rows[0].id, 'spoofed')
  f.reader.submitRequest(f.actor, 'B', fake); assert.equal(f.other.get('guide-access-requests', { skipCache: true }).length, 1)
  assert.throws(() => f.reader.submitRequest(f.actor, 'B', { guideId: 'missing' }), code('AUTH_FORBIDDEN'))
  f.actor.viewId = 'both'; assert.throws(() => f.reader.submitRequest(f.actor, 'B', fake), code('AUTH_FORBIDDEN'))
})
