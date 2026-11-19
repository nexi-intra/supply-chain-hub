const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const registry = require('./registry.cjs')

test('registry identity capability holds the ordinary lock, restricts targets and expires', t => {
  const root = temporaryPlatformRoot(t)
  let escaped
  registry.withIdentityTransaction(root, tx => {
    escaped = tx
    assert.ok(fs.existsSync(path.join(registry.registryDir(root), 'mutation.lock')))
    tx.set('directory', { 'synthetic@example.test': 'a' })
    assert.deepEqual(tx.get('directory'), { 'synthetic@example.test': 'a' })
    assert.throws(() => tx.set('config', {}), /Invalid registry transaction capability/)
  })
  assert.throws(() => escaped.get('directory'), /Invalid registry transaction capability/)
  assert.ok(!fs.existsSync(path.join(registry.registryDir(root), 'mutation.lock')))
})
test('async identity callbacks are rejected before writing', t => {
  const root = temporaryPlatformRoot(t)
  assert.throws(() => registry.withIdentityTransaction(root, async tx => { tx.set('directory', { bad: true }) }), /synchronous/)
  assert.deepEqual(registry.readUserDirectory(root), {})
})

test('assigning an email cannot silently move an existing account into another team', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'Test A', folderName: 'TCD' })
  registry.createTeam(root, { teamId: 'TRR', name: 'Test B', folderName: 'TRR' })
  registry.assignUserToTeam(root, 'test@example.com', 'TCD')
  assert.throws(() => registry.assignUserToTeam(root, 'TEST@example.com', 'TRR'), /allerede tilknyttet/)
  assert.equal(registry.lookupTeamForEmail(root, 'test@example.com').teamId, 'TCD')
  assert.throws(() => registry.assignUserToTeam(root, 'test@example.com', 'missing'), /findes ikke/)
})

test('a new team cannot reuse another team folder or target registry paths', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'Test A', folderName: 'TCD' })
  assert.throws(() => registry.createTeam(root, { teamId: 'OTHER', name: 'Test B', folderName: 'tcd' }), /allerede/)
  for (const folderName of ['../outside', '_registry', '_shared', 'nested\\folder']) assert.throws(() => registry.createTeam(root, { teamId: 'OTHER', name: 'Test B', folderName }))
})

test('an unreadable existing registry is not replaced with an empty registry', (t) => {
  const root = temporaryPlatformRoot(t)
  fs.mkdirSync(path.join(root, '_registry'))
  const target = path.join(root, '_registry', 'teams.json')
  fs.writeFileSync(target, '{broken json')
  assert.throws(() => registry.createTeam(root, { teamId: 'test', name: 'Test', folderName: 'Test' }))
  assert.equal(fs.readFileSync(target, 'utf8'), '{broken json')
  assert.ok(!fs.existsSync(path.join(root, '_registry', 'mutation.lock')))
})

test('a deleted account is forgotten, so the address can later join another team', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'Test A', folderName: 'TCD' })
  registry.createTeam(root, { teamId: 'TRR', name: 'Test B', folderName: 'TRR' })
  registry.assignUserToTeam(root, 'gone@example.com', 'TCD')
  registry.assignUserToTeam(root, 'stay@example.com', 'TCD')
  assert.equal(registry.forgetUser(root, ' GONE@example.com '), true)
  assert.equal(registry.lookupTeamForEmail(root, 'gone@example.com'), null)
  assert.equal(registry.lookupTeamForEmail(root, 'stay@example.com').teamId, 'TCD')
  assert.equal(registry.forgetUser(root, 'gone@example.com'), false)
  registry.assignUserToTeam(root, 'gone@example.com', 'TRR')
})

function temporaryPlatformRoot(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-hub-registry-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

// A registry write on M: takes 15-90 s; the synchronous one froze the whole app (every window, every click) meanwhile.
test('async registry mutations never touch the disk synchronously and give the same result', async (t) => {
  const root = temporaryPlatformRoot(t)
  const syncCalls = []
  const spied = ['readFileSync', 'writeFileSync', 'renameSync', 'openSync', 'mkdirSync', 'unlinkSync']
  const real = Object.fromEntries(spied.map(name => [name, fs[name]]))
  for (const name of spied) fs[name] = (...args) => { syncCalls.push(`${name} ${args[0]}`); return real[name](...args) }
  t.after(() => { for (const name of spied) fs[name] = real[name] })
  await registry.createTeamAsync(root, { teamId: 'TCD', name: 'Test A', folderName: 'TCD' })
  await registry.createTeamAsync(root, { teamId: 'TRR', name: 'Test B', folderName: 'TRR' })
  await registry.assignUserToTeamAsync(root, 'Boss@example.com', 'TCD')
  assert.deepEqual(await registry.setManagerAccessAsync(root, 'boss@example.com', ['TRR']), { email: 'boss@example.com', teamIds: ['TRR'] })
  assert.equal((await registry.updateTeamAsync(root, 'TRR', { name: 'Renamed', abbreviation: 'trr' })).name, 'Renamed')
  await registry.setCreatorEmailAsync(root, ' Creator@example.com ')
  assert.equal(await registry.forgetUserAsync(root, 'boss@example.com'), true)
  assert.deepEqual(syncCalls, [])
  for (const name of spied) fs[name] = real[name]
  assert.equal(registry.lookupTeamForEmail(root, 'boss@example.com'), null)
  assert.deepEqual(registry.listManagerAccess(root), [])
  assert.equal(registry.getCreatorEmail(root), 'creator@example.com')
  assert.deepEqual(registry.listTeams(root).map(team => team.name).sort(), ['Renamed', 'Test A'])
  assert.ok(!fs.existsSync(path.join(registry.registryDir(root), 'mutation.lock')), 'the lock is released')
})

test('an async mutation uses the same lock file as the synchronous one (1.6.6 clients) and validates before writing', async (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'Test A', folderName: 'TCD' })
  registry.assignUserToTeam(root, 'a@example.com', 'TCD')
  await assert.rejects(registry.assignUserToTeamAsync(root, 'a@example.com', 'NOPE'), /Teamet findes ikke/)
  const lock = path.join(registry.registryDir(root), 'mutation.lock')
  fs.writeFileSync(lock, 'other-client')
  await assert.rejects(registry.assignUserToTeamAsync(root, 'b@example.com', 'TCD'), error => error.code === 'KV_LOCK_BUSY')
  assert.equal(registry.lookupTeamForEmail(root, 'b@example.com'), null)
  fs.unlinkSync(lock)
})

test('an async mutation reads fresh and keeps a colleague\'s change', async (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'Test A', folderName: 'TCD' })
  registry.assignUserToTeam(root, 'me@example.com', 'TCD')
  const directory = registry.userDirectoryPath(root)
  const onShare = JSON.parse(fs.readFileSync(directory, 'utf8'))
  onShare['colleague@example.com'] = 'TCD'
  fs.writeFileSync(directory, JSON.stringify(onShare))
  await registry.assignUserToTeamAsync(root, 'third@example.com', 'TCD')
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(directory, 'utf8'))).sort(), ['colleague@example.com', 'me@example.com', 'third@example.com'])
})

test('lookupTeamForEmail returns null when nothing is registered', (t) => {
  const root = temporaryPlatformRoot(t)
  assert.equal(registry.lookupTeamForEmail(root, 'nobody@example.com'), null)
})

test('createTeam + assignUserToTeam + lookupTeamForEmail round-trips', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'Terminal Configuration & Dispatch', folderName: 'TCD' })
  registry.assignUserToTeam(root, 'Jane@Example.com', 'TCD')

  const result = registry.lookupTeamForEmail(root, 'jane@example.com')
  assert.deepEqual(result, {
    teamId: 'TCD',
    name: 'Terminal Configuration & Dispatch',
    abbreviation: 'TCD',
    folderName: 'TCD',
    createdAt: result.createdAt,
  })
})

test('lookupTeamForEmail is case-insensitive and trims whitespace', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'TCD', folderName: 'TCD' })
  registry.assignUserToTeam(root, 'jane@example.com', 'TCD')

  assert.equal(registry.lookupTeamForEmail(root, '  Jane@EXAMPLE.com  ').teamId, 'TCD')
})

test('createTeam throws when the teamId already exists', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'TCD', folderName: 'TCD' })
  assert.throws(() => registry.createTeam(root, { teamId: 'TCD', name: 'Other', folderName: 'OTHER' }))
})

test('listTeams returns every registered team', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'TCD', folderName: 'TCD' })
  registry.createTeam(root, { teamId: 'TRR', name: 'Terminal Returns & Repair', folderName: 'TRR' })

  const teams = registry.listTeams(root).sort((a, b) => a.teamId.localeCompare(b.teamId))
  assert.deepEqual(teams.map((team) => team.teamId), ['TCD', 'TRR'])
})

test('updateTeam changes display name and abbreviation without changing identity or data folder', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'TCD', folderName: 'TCD-data' })
  registry.assignUserToTeam(root, 'jane@example.com', 'TCD')

  const updated = registry.updateTeam(root, 'TCD', {
    name: 'Terminal Configuration & Dispatch',
    abbreviation: ' tc-d ',
  })

  assert.equal(updated.name, 'Terminal Configuration & Dispatch')
  assert.equal(updated.abbreviation, 'TC-D')
  assert.equal(updated.teamId, 'TCD')
  assert.equal(updated.folderName, 'TCD-data')
  assert.equal(registry.lookupTeamForEmail(root, 'jane@example.com').abbreviation, 'TC-D')
})

test('updateTeam rejects duplicate and invalid abbreviations', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'TCD', folderName: 'TCD' })
  registry.createTeam(root, { teamId: 'TRR', name: 'TRR', folderName: 'TRR' })

  assert.throws(() => registry.updateTeam(root, 'TRR', {
    name: 'Returns', abbreviation: 'tcd',
  }), /bruges allerede/)
  assert.throws(() => registry.updateTeam(root, 'TRR', {
    name: 'Returns', abbreviation: 'TRR!',
  }), /må kun indeholde/)
})

test('legacy teams get their team id as abbreviation', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.writeTeams(root, {
    LEGACY: { name: 'Legacy team', folderName: 'Legacy folder', createdAt: '2025-01-01T00:00:00.000Z' },
  })

  assert.equal(registry.listTeams(root)[0].abbreviation, 'LEGACY')
})

test('an email with no directory entry returns null even if teams exist', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'TCD', folderName: 'TCD' })
  assert.equal(registry.lookupTeamForEmail(root, 'unassigned@example.com'), null)
})

test('reads are shared for 30 s, but a mutation always reads fresh and never overwrites a colleague', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'Test A', folderName: 'TCD' })
  registry.assignUserToTeam(root, 'me@example.com', 'TCD')
  const directory = registry.userDirectoryPath(root)
  const realRead = fs.readFileSync
  let reads = 0
  fs.readFileSync = (file, ...rest) => { if (path.resolve(String(file)) === path.resolve(directory)) reads++; return realRead(file, ...rest) }
  t.after(() => { fs.readFileSync = realRead })
  for (let i = 0; i < 5; i++) assert.equal(registry.lookupTeamForEmail(root, 'me@example.com').teamId, 'TCD')
  assert.equal(reads, 0, 'the write left a fresh copy in the cache')

  // Another PC adds a colleague directly on the share; our cached copy does not know about it yet.
  const onShare = JSON.parse(realRead(directory, 'utf8'))
  onShare['colleague@example.com'] = 'TCD'
  fs.writeFileSync(directory, JSON.stringify(onShare))
  assert.equal(registry.lookupTeamForEmail(root, 'colleague@example.com').teamId, 'TCD', 'a miss is confirmed with a fresh read')
  registry.assignUserToTeam(root, 'third@example.com', 'TCD')
  assert.deepEqual(Object.keys(JSON.parse(realRead(directory, 'utf8'))).sort(), ['colleague@example.com', 'me@example.com', 'third@example.com'])
})

test('cached registry values are copies, so callers cannot corrupt the cache', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'Test A', folderName: 'TCD' })
  registry.readTeams(root).TCD.name = 'changed by caller'
  assert.equal(registry.readTeams(root).TCD.name, 'Test A')
})

function expireRegistryCache(t) {
  const realNow = Date.now
  Date.now = () => realNow() + 31000
  t.after(() => { Date.now = realNow })
}

function forbidSyncReads(t) {
  const realRead = fs.readFileSync
  fs.readFileSync = () => { throw new Error('synchronous registry read after the first read') }
  t.after(() => { fs.readFileSync = realRead })
  return realRead
}

test('an expired registry cache is served without a synchronous read and refreshed in the background', async (t) => {
  const root = temporaryPlatformRoot(t)
  registry.writeTeams(root, { A: { name: 'Team A', folderName: 'A', createdAt: '2025-01-01T00:00:00.000Z' } })
  assert.deepEqual(Object.keys(registry.readTeams(root)), ['A'])
  fs.writeFileSync(registry.teamsPath(root), JSON.stringify({
    A: { name: 'Team A', folderName: 'A', createdAt: '2025-01-01T00:00:00.000Z' },
    B: { name: 'Team B', folderName: 'B', createdAt: '2025-01-01T00:00:00.000Z' },
  }))
  expireRegistryCache(t)
  forbidSyncReads(t)
  assert.deepEqual(Object.keys(registry.readTeams(root)), ['A'])
  await registry.whenRefreshed()
  assert.deepEqual(Object.keys(registry.readTeams(root)).sort(), ['A', 'B'])
})

test('a failed background refresh keeps serving the cached registry', async (t) => {
  const root = temporaryPlatformRoot(t)
  registry.writeTeams(root, { A: { name: 'Team A', folderName: 'A', createdAt: '2025-01-01T00:00:00.000Z' } })
  assert.deepEqual(Object.keys(registry.readTeams(root)), ['A'])
  // Filen kan ikke laeses (EISDIR) - en rigtig laesefejl, ikke en slettet fil.
  fs.rmSync(registry.registryDir(root), { recursive: true, force: true })
  fs.mkdirSync(registry.teamsPath(root), { recursive: true })
  expireRegistryCache(t)
  forbidSyncReads(t)
  assert.deepEqual(Object.keys(registry.readTeams(root)), ['A'])
  await registry.whenRefreshed()
  assert.deepEqual(Object.keys(registry.readTeams(root)), ['A'])
})

test('a background refresh that finds invalid content keeps serving the cached registry', async (t) => {
  const root = temporaryPlatformRoot(t)
  registry.writeTeams(root, { A: { name: 'Team A', folderName: 'A', createdAt: '2025-01-01T00:00:00.000Z' } })
  assert.deepEqual(Object.keys(registry.readTeams(root)), ['A'])
  fs.writeFileSync(registry.teamsPath(root), '[]')
  expireRegistryCache(t)
  forbidSyncReads(t)
  assert.deepEqual(Object.keys(registry.readTeams(root)), ['A'])
  await registry.whenRefreshed()
  assert.deepEqual(Object.keys(registry.readTeams(root)), ['A'])
})

test('a background refresh of a deleted registry file falls back like the synchronous read', async (t) => {
  const root = temporaryPlatformRoot(t)
  registry.writeTeams(root, { A: { name: 'Team A', folderName: 'A', createdAt: '2025-01-01T00:00:00.000Z' } })
  assert.deepEqual(Object.keys(registry.readTeams(root)), ['A'])
  fs.rmSync(registry.teamsPath(root))
  expireRegistryCache(t)
  forbidSyncReads(t)
  assert.deepEqual(Object.keys(registry.readTeams(root)), ['A'])
  await registry.whenRefreshed()
  assert.deepEqual(registry.readTeams(root), {})
})

test('mutations still read the registry fresh', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'Test A', folderName: 'TCD' })
  registry.assignUserToTeam(root, 'me@example.com', 'TCD')
  assert.equal(registry.lookupTeamForEmail(root, 'me@example.com').teamId, 'TCD')
  const directory = registry.userDirectoryPath(root)
  fs.writeFileSync(directory, JSON.stringify({ 'me@example.com': 'TCD', 'colleague@example.com': 'TCD' }))
  registry.assignUserToTeam(root, 'third@example.com', 'TCD')
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(directory, 'utf8'))).sort(), ['colleague@example.com', 'me@example.com', 'third@example.com'])
})

test('prefetchAsync and a background refresh share one read per file', async (t) => {
  const root = temporaryPlatformRoot(t)
  registry.writeTeams(root, { A: { name: 'Team A', folderName: 'A', createdAt: '2025-01-01T00:00:00.000Z' } })
  registry.readTeams(root)
  expireRegistryCache(t)
  forbidSyncReads(t)
  const realReadFile = fs.promises.readFile
  let reads = 0
  const teams = path.resolve(registry.teamsPath(root))
  fs.promises.readFile = (file, ...rest) => { if (path.resolve(String(file)) === teams) reads++; return realReadFile(file, ...rest) }
  t.after(() => { fs.promises.readFile = realReadFile })
  registry.readTeams(root)
  await Promise.all([registry.prefetchAsync(root), registry.whenRefreshed()])
  assert.equal(reads, 1)
})

test('prefetchAsync fills the cache so the synchronous auth lookups never touch the disk', async (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'Test A', folderName: 'TCD' })
  registry.assignUserToTeam(root, 'me@example.com', 'TCD')
  registry.setCreatorEmail(root, 'boss@example.com')
  registry.invalidateCache()
  await registry.prefetchAsync(root)
  const realRead = fs.readFileSync
  let reads = 0
  fs.readFileSync = (...args) => { reads++; return realRead(...args) }
  t.after(() => { fs.readFileSync = realRead })
  assert.equal(registry.lookupTeamForEmail(root, 'me@example.com').teamId, 'TCD')
  assert.deepEqual(registry.managerTeamsForEmail(root, 'me@example.com'), [])
  assert.equal(registry.getCreatorEmail(root), 'boss@example.com')
  assert.equal(reads, 0)
})
