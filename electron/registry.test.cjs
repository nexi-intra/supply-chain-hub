const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const registry = require('./registry.cjs')

function temporaryPlatformRoot(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-hub-registry-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

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

test('an email with no directory entry returns null even if teams exist', (t) => {
  const root = temporaryPlatformRoot(t)
  registry.createTeam(root, { teamId: 'TCD', name: 'TCD', folderName: 'TCD' })
  assert.equal(registry.lookupTeamForEmail(root, 'unassigned@example.com'), null)
})
