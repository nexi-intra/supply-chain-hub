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

function temporaryPlatformRoot(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-hub-registry-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('lookupTeamForEmail returns null when nothing is registered', (t) => {
  const root = temporaryPlatformRoot(t)
  assert.equal(registry.lookupTeamForEmail(root, 'nobody@example.com'), null)
})

test('access views are reusable read-only group assignments and do not change team membership', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'TCD', folderName: 'TCD' })
  registry.createTeam(root, { teamId: 'TRR', name: 'TRR', folderName: 'TRR' })
  registry.assignUserToTeam(root, 'johnny@example.com', 'TCD')

  const created = registry.createAccessView(root, {
    viewId: 'operations',
    name: 'TCD + TRR',
    teamIds: ['TCD', 'TRR', 'TCD'],
    userEmails: [' Johnny@Example.com ', 'other@example.com'],
  })

  assert.equal(created.viewId, 'operations')
  assert.deepEqual(created.teamIds, ['TCD', 'TRR'])
  assert.deepEqual(registry.listAccessViewsForEmail(root, 'JOHNNY@example.com').map((view) => view.viewId), ['operations'])
  assert.equal(registry.lookupTeamForEmail(root, 'johnny@example.com').teamId, 'TCD')
  assert.equal(registry.lookupTeamForEmail(root, 'other@example.com'), null)

  const updated = registry.updateAccessView(root, 'operations', {
    name: 'Nordic operations',
    teamIds: ['TRR', 'TCD'],
    userEmails: ['johnny@example.com'],
  })
  assert.equal(updated.name, 'Nordic operations')
  assert.deepEqual(updated.userEmails, ['johnny@example.com'])
  assert.equal(registry.deleteAccessView(root, 'operations'), true)
  assert.deepEqual(registry.listAccessViews(root), [])
})

test('access views reject unknown or single-team configurations', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'TCD', folderName: 'TCD' })
  assert.throws(() => registry.createAccessView(root, {
    name: 'Not a group', teamIds: ['TCD'], userEmails: [],
  }), /mindst to teams/)
  assert.throws(() => registry.createAccessView(root, {
    name: 'Unknown team', teamIds: ['TCD', 'NOPE'], userEmails: [],
  }), /Ukendt team/)
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
