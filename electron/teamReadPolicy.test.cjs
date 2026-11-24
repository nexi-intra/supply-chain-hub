const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('./store.cjs')
const { createTeamReader, registeredTeamDir, registeredWarehouseTeamDir } = require('./teamReadPolicy.cjs')
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-team-policy-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const teams = [{ teamId: 'a', folderName: 'A' }, { teamId: 'b', folderName: 'B' }]
  const actor = { email: 'user@example.test', userId: 'user_user@example.test', home: teams[0], role: 'user' }
  const own = createStore(path.join(root, 'A')), other = createStore(path.join(root, 'B'))
  own.set('users', { [actor.email]: { email: actor.email, fullName: 'Synthetic User' } })
  other.set('users', { 'other@example.test': { email: 'other@example.test', fullName: 'Other User', password: 'SECRET', phone: 'PRIVATE', privateMetadata: 'PRIVATE' } })
  const guide = { id: 'g1', title: 'Synthetic cloud guide', content: 'SECRET BODY', category: 'Technical', tags: ['cloud'], version: '1.00', language: 'da', wordFileData: 'SECRET WORD', fileUrl: 'kv://file_word', previewPdfUrl: 'kv://file_preview', coverImageId: 'file_cover', sections: [{ steps: [{ text: 'SECRET STEP', imageIds: ['file_image'] }] }] }
  other.set('guides', [guide]); other.set('file_image_meta', { size: 10 }); other.set('file_image_chunk_0', 'IMAGE'); other.set('file_preview_meta', { size: 7 }); other.set('file_preview_chunk_0', 'PDF'); other.set('file_unrelated_meta', { private: 'SECRET' })
  const request = { id: 'r1', guideId: guide.id, requestingUserEmail: actor.email, requestingTeamCode: 'A', status: 'approved', requestedAt: '2026-09-01T00:00:00Z' }
  const reader = createTeamReader({ getRoot: () => root, listTeams: () => teams, openStore: createStore, now: () => Date.parse('2026-09-15T00:00:00Z') })
  return { root, teams, actor, own, other, guide, request, reader }
}
const code = expected => error => error.code === expected
test('cross-team catalogue excludes all content, embedded documents and asset IDs', async t => {
  const f = fixture(t), result = (await f.reader.readTeam(f.actor, 'B', 'guides'))[0]
  assert.equal(result.title, f.guide.title); assert.deepEqual(result.sections, []); assert.equal(result.content, '')
  assert.equal(JSON.stringify(result).includes('SECRET'), false)
  for (const key of ['wordFileData', 'fileUrl', 'previewPdfUrl', 'coverImageId']) assert.equal(result[key], undefined)
  await assert.rejects(f.reader.readTeam(f.actor, 'B', 'file_preview_chunk_0'), code('AUTH_FORBIDDEN'))
})
test('catalogue reads the grant list once per request, not once per guide', async t => {
  const f = fixture(t); let grantReads = 0
  f.other.set('guides', Array.from({ length: 400 }, (_, index) => ({ ...f.guide, id: `g${index}` })))
  const reader = createTeamReader({ getRoot: () => f.root, listTeams: () => f.teams, openStore: directory => {
    const store = createStore(directory), getAsync = store.getAsync
    store.getAsync = (key, options) => { if (key === 'guide-access-requests') grantReads++; return getAsync(key, options) }
    return store
  } })
  assert.equal((await reader.readTeam(f.actor, 'B', 'guides')).length, 400); assert.equal(grantReads, 1)
})
test('a cross-team batch resolves the team registry only once', async t => {
  const f = fixture(t); let registryReads = 0
  const reader = createTeamReader({ getRoot: () => f.root, listTeams: () => { registryReads++; return f.teams }, openStore: createStore })
  const values = await reader.readTeamMany(f.actor, 'B', ['users', 'vacation-entries', 'sick-leave-entries', 'home-office-patterns', 'home-office-exceptions'])
  assert.equal(values.length, 5)
  assert.equal(registryReads, 1)
})
test('cross-team home-office patterns expose only weekdays and recurrence dates', async t => {
  const f = fixture(t)
  f.other.set('home-office-patterns', { 'other@example.test': {
    weekdays: [3], privateNote: 'SECRET',
    repeat: { 3: { intervalWeeks: 2, startDate: '2026-09-23', privateNote: 'SECRET' }, 9: { intervalWeeks: 1, startDate: '2026-09-23' } },
  } })
  const value = await f.reader.readTeam(f.actor, 'B', 'home-office-patterns')
  assert.deepEqual(value, { 'other@example.test': { weekdays: [3], repeat: { 3: { intervalWeeks: 2, startDate: '2026-09-23' } } } })
  assert.equal(JSON.stringify(value).includes('SECRET'), false)
})
test('a multi-team batch validates each team with one fresh registry snapshot', async t => {
  const f = fixture(t); let registryReads = 0
  const reader = createTeamReader({ getRoot: () => f.root, listTeams: () => { registryReads++; return f.teams }, openStore: createStore })
  const requests = [{ folderName: 'A', keys: ['users', 'vacation-entries'] }, { folderName: 'B', keys: ['users', 'sick-leave-entries'] }]
  assert.equal((await reader.readTeamsMany(f.actor, requests)).length, 2)
  assert.equal(registryReads, 1)
  f.teams.splice(1)
  await assert.rejects(reader.readTeamsMany(f.actor, requests), code('AUTH_FORBIDDEN'))
  assert.equal(registryReads, 2)
})
test('approved own guide request permits content and only referenced files', async t => {
  const f = fixture(t); f.other.set('guide-access-requests', [f.request])
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'guides'))[0].content, 'SECRET BODY')
  assert.equal(await f.reader.readTeam(f.actor, 'B', 'file_image_chunk_0'), 'IMAGE')
  assert.equal(await f.reader.readTeam(f.actor, 'B', 'file_preview_meta').then(value => value.size), 7)
  assert.equal(await f.reader.readTeam(f.actor, 'B', 'file_preview_chunk_0'), 'PDF')
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
test('a warehouse team folder is unavailable storage (kept for a retry) when no team is registered at all, refused otherwise', t => {
  const f = fixture(t)
  assert.equal(registeredWarehouseTeamDir(f.root, f.teams, 'B').directory, path.join(f.root, 'B'))
  assert.throws(() => registeredWarehouseTeamDir(f.root, f.teams, 'unknown'), code('AUTH_FORBIDDEN'))
  // The Hub's local fallback folder (M: away at start) has no teams.json.
  assert.throws(() => registeredWarehouseTeamDir(f.root, [], 'B'), code('STORAGE_UNAVAILABLE'))
})
test('cross-team overviews keep directory contacts and presence but remove passwords, notes and sickness reasons', async t => {
  const f = fixture(t)
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'users'))['other@example.test'].privateMetadata, undefined)
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'users'))['other@example.test'].phone, 'PRIVATE')
  assert.equal(JSON.stringify(await f.reader.readTeam(f.actor, 'B', 'users')).includes('SECRET'), false)
  f.other.set('vacation-entries', [{ id: 'v1', status: 'approved', startDate: '2026-09-15', notes: 'PRIVATE', type: 'parental' }, { id: 'v2', status: 'pending' }])
  f.other.set('sick-leave-entries', [{ id: 's1', status: 'approved', reason: 'PRIVATE', type: 'child', startDate: '2026-09-15' }])
  const vacations = await f.reader.readTeam(f.actor, 'B', 'vacation-entries'), sickness = await f.reader.readTeam(f.actor, 'B', 'sick-leave-entries')
  assert.equal(vacations.length, 1); assert.equal(vacations[0].notes, undefined); assert.equal(vacations[0].type, 'parental')
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
test('Chicken Invaders season 2 leaderboard can be read cross-team', async t => {
  const f = fixture(t); f.other.set('chicken-invaders-global-leaderboard', { hard: [{ email: 'other@example.test', score: 12450 }] })
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'chicken-invaders-global-leaderboard')).hard[0].score, 12450)
})
test('Prism Break leaderboard can be read cross-team', async t => {
  const f = fixture(t); f.other.set('brickbreak-v2-global-leaderboard', { medium: [{ email: 'other@example.test', score: 8800, level: 3 }] })
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'brickbreak-v2-global-leaderboard')).medium[0].level, 3)
})
test('Parcel Pilot leaderboard can be read cross-team', async t => {
  const f = fixture(t); f.other.set('parcel-pilot-global-leaderboard', { expert: [{ email: 'other@example.test', score: 640, level: 2 }] })
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'parcel-pilot-global-leaderboard')).expert[0].score, 640)
})
test('Cargo Stack leaderboard can be read cross-team', async t => {
  const f = fixture(t); f.other.set('cargo-stack-global-leaderboard', { hard: [{ email: 'other@example.test', score: 52000, level: 9 }] })
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'cargo-stack-global-leaderboard')).hard[0].level, 9)
})
test('Route Runner leaderboard can be read cross-team', async t => {
  const f = fixture(t); f.other.set('route-runner-global-leaderboard', { expert: [{ email: 'other@example.test', score: 1450 }] })
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'route-runner-global-leaderboard')).expert[0].score, 1450)
})
test('client app versions can be read cross-team for the Creator Panel version overview', async t => {
  const f = fixture(t); f.other.set('client-versions', { 'other@example.test': { version: '1.5.2', platform: 'win32', lastSeen: 1 } })
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'client-versions'))['other@example.test'].version, '1.5.2')
})
test('request submission constructs identity/status itself and retries without a duplicate pending request', t => {
  const f = fixture(t), fake = { guideId: 'g1', status: 'approved', requestingUserEmail: 'creator@example.test', requestingTeamCode: 'B', id: 'spoofed' }
  const rows = f.reader.submitRequest(f.actor, 'B', fake)
  assert.equal(rows[0].requestingUserEmail, f.actor.email); assert.equal(rows[0].requestingTeamCode, 'A'); assert.equal(rows[0].status, 'pending')
  assert.equal(rows[0].requestingUserName, 'Synthetic User'); assert.notEqual(rows[0].id, 'spoofed')
  f.reader.submitRequest(f.actor, 'B', fake); assert.equal(f.other.get('guide-access-requests', { skipCache: true }).length, 1)
  assert.throws(() => f.reader.submitRequest(f.actor, 'B', { guideId: 'missing' }), code('AUTH_FORBIDDEN'))
})
function knowledgeFixture(t) {
  const f = fixture(t)
  const article = { id: 'g1', title: 'Synthetic LocalMode result codes', content: 'KNOWLEDGE SECRET', category: 'Error Codes', tags: ['baxi'], version: '1.00', language: 'en', previewPdfUrl: 'kv://file_kbpdf', sections: [{ steps: [{ text: 'KNOWLEDGE SECRET STEP', imageIds: ['file_kbimage'] }] }] }
  f.other.set('knowledge-articles', [article]); f.other.set('file_kbpdf_meta', { size: 3 }); f.other.set('file_kbpdf_chunk_0', 'KBPDF'); f.other.set('file_kbimage_meta', { size: 2 })
  return { ...f, article }
}
test('cross-team knowledge catalogue exposes metadata only, without content or file references', async t => {
  const f = knowledgeFixture(t), result = (await f.reader.readTeam(f.actor, 'B', 'knowledge-articles'))[0]
  assert.equal(result.title, f.article.title); assert.equal(result.content, ''); assert.deepEqual(result.sections, [])
  assert.equal(JSON.stringify(result).includes('SECRET'), false); assert.equal(result.previewPdfUrl, undefined)
  await assert.rejects(f.reader.readTeam(f.actor, 'B', 'file_kbpdf_chunk_0'), code('AUTH_FORBIDDEN'))
})
test('a guide grant never unlocks a knowledge article, even with the same id', async t => {
  const f = knowledgeFixture(t); f.other.set('guide-access-requests', [f.request])
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'guides'))[0].content, 'SECRET BODY')
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'knowledge-articles'))[0].content, '')
  await assert.rejects(f.reader.readTeam(f.actor, 'B', 'file_kbpdf_chunk_0'), code('AUTH_FORBIDDEN'))
})
test('an approved knowledge grant unlocks the article and only its own files, not guides', async t => {
  const f = knowledgeFixture(t); f.other.set('knowledge-access-requests', [f.request])
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'knowledge-articles'))[0].content, 'KNOWLEDGE SECRET')
  assert.equal(await f.reader.readTeam(f.actor, 'B', 'file_kbpdf_chunk_0'), 'KBPDF')
  assert.equal(await f.reader.readTeam(f.actor, 'B', 'file_kbimage_meta').then(value => value.size), 2)
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'guides'))[0].content, '')
  await assert.rejects(f.reader.readTeam(f.actor, 'B', 'file_image_chunk_0'), code('AUTH_FORBIDDEN'))
})
for (const change of [{ requestingUserEmail: 'someone@example.test' }, { requestingTeamCode: 'B' }, { status: 'pending' }, { status: 'rejected' }, { expiresAt: '2026-09-14T00:00:00Z' }]) {
  test(`knowledge access cannot use a grant with ${JSON.stringify(change)}`, async t => {
    const f = knowledgeFixture(t); f.other.set('knowledge-access-requests', [{ ...f.request, ...change }])
    assert.equal((await f.reader.readTeam(f.actor, 'B', 'knowledge-articles'))[0].content, '')
    await assert.rejects(f.reader.readTeam(f.actor, 'B', 'file_kbpdf_meta'), code('AUTH_FORBIDDEN'))
  })
}
test('knowledge request lists disclose only the authenticated account and home team', async t => {
  const f = knowledgeFixture(t); f.other.set('knowledge-access-requests', [f.request, { ...f.request, id: 'foreign', requestingUserEmail: 'other@example.test' }])
  assert.deepEqual(await f.reader.readTeam(f.actor, 'B', 'knowledge-access-requests'), [f.request])
})
test('knowledge requests are stored separately from guide requests and validated against knowledge articles', t => {
  const f = knowledgeFixture(t)
  f.other.set('knowledge-articles', [{ ...f.article, id: 'k1' }])
  const rows = f.reader.submitRequest(f.actor, 'B', { guideId: 'k1', status: 'approved' }, 'knowledge')
  assert.equal(rows[0].guideId, 'k1'); assert.equal(rows[0].status, 'pending'); assert.equal(rows[0].guideTitle, f.article.title)
  assert.equal(f.other.get('knowledge-access-requests', { skipCache: true }).length, 1)
  assert.equal(f.other.get('guide-access-requests', { skipCache: true }), undefined)
  assert.throws(() => f.reader.submitRequest(f.actor, 'B', { guideId: 'g1' }, 'knowledge'), code('AUTH_FORBIDDEN'))
  assert.throws(() => f.reader.submitRequest(f.actor, 'B', { guideId: 'k1' }, 'unknown'), code('AUTH_FORBIDDEN'))
  assert.throws(() => f.reader.submitRequest(f.actor, 'B', { guideId: 'k1' }), code('AUTH_FORBIDDEN'))
})
test('knowledge version and draft keys of another team are never readable', async t => {
  const f = knowledgeFixture(t)
  for (const key of ['knowledge-versions-g1', 'knowledge-draft-g1', 'knowledge-review-requests', 'archived-knowledge-articles', 'knowledge-categories']) await assert.rejects(f.reader.readTeam(f.actor, 'B', key), code('AUTH_FORBIDDEN'))
})
test('an imported original PDF is only readable with an approved grant for its article', async t => {
  const f = knowledgeFixture(t)
  f.other.set('knowledge-articles', [{ ...f.article, previewPdfUrl: undefined, originalPdfUrl: 'kv://file_kboriginal', originalPdfName: 'LocalMode.pdf' }])
  f.other.set('file_kboriginal_meta', { size: 4 }); f.other.set('file_kboriginal_chunk_0', 'ORIG')
  assert.equal((await f.reader.readTeam(f.actor, 'B', 'knowledge-articles'))[0].originalPdfUrl, undefined)
  await assert.rejects(f.reader.readTeam(f.actor, 'B', 'file_kboriginal_chunk_0'), code('AUTH_FORBIDDEN'))
  f.other.set('knowledge-access-requests', [f.request])
  assert.equal(await f.reader.readTeam(f.actor, 'B', 'file_kboriginal_chunk_0'), 'ORIG')
})
test('a guide shared with my team shows its images from the team that uploaded them, and nothing else', async t => {
  const f = fixture(t)
  const shared = createStore(path.join(f.root, '_shared'))
  const sharedGuide = { id: 's1', title: 'Shared', sharedWithTeamCodes: ['B', 'A'], coverImageId: 'file_cover', sections: [{ steps: [{ imageIds: ['file_image'] }] }] }
  shared.set('shared-guides', [sharedGuide, { id: 's2', title: 'Not mine', sharedWithTeamCodes: ['B'], sections: [{ steps: [{ imageIds: ['file_image'] }] }] }])
  assert.deepEqual(await f.reader.readSharedFile(f.actor, 'guides', 's1', 'file_image_meta'), { size: 10 })
  assert.equal(await f.reader.readSharedFile(f.actor, 'guides', 's1', 'file_image_chunk_0'), 'IMAGE')
  assert.equal(await f.reader.readSharedFile(f.actor, 'guides', 's1', 'file_cover_meta'), undefined)
  await assert.rejects(f.reader.readSharedFile(f.actor, 'guides', 's1', 'file_unrelated_meta'), code('AUTH_FORBIDDEN'))
  await assert.rejects(f.reader.readSharedFile(f.actor, 'guides', 's2', 'file_image_meta'), code('AUTH_FORBIDDEN'))
  await assert.rejects(f.reader.readSharedFile(f.actor, 'guides', 'missing', 'file_image_meta'), code('AUTH_FORBIDDEN'))
  await assert.rejects(f.reader.readSharedFile(f.actor, 'guides', 's1', 'users'), code('AUTH_FORBIDDEN'))
  await assert.rejects(f.reader.readSharedFile(f.actor, 'knowledge', 's1', 'file_image_meta'), code('AUTH_FORBIDDEN'))
  // Only teams the guide is shared with are searched, even if another team holds a file with that id.
  shared.set('shared-guides', [{ ...sharedGuide, sharedWithTeamCodes: ['A'] }])
  assert.equal(await f.reader.readSharedFile(f.actor, 'guides', 's1', 'file_image_meta'), undefined)
})
