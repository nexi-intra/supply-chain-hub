const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const registry = require('./registry.cjs')

function platform(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manager-access-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const teamId of ['PIM', 'BPO', 'TCD']) registry.createTeam(root, { teamId, name: `Team ${teamId}`, folderName: teamId })
  registry.assignUserToTeam(root, 'rasmus@example.com', 'PIM')
  return root
}

test('creator grants manager access in other teams; the home team is never an extra team', t => {
  const root = platform(t)
  registry.setManagerAccess(root, ' RASMUS@example.com ', ['BPO', 'TCD', 'BPO'])
  assert.deepEqual(registry.managerTeamsForEmail(root, 'rasmus@example.com').map(team => team.teamId), ['BPO', 'TCD'])
  assert.deepEqual(registry.listManagerAccess(root).map(({ email, teamIds }) => ({ email, teamIds })), [{ email: 'rasmus@example.com', teamIds: ['BPO', 'TCD'] }])
  assert.throws(() => registry.setManagerAccess(root, 'rasmus@example.com', ['PIM']), /eget team/)
  assert.throws(() => registry.setManagerAccess(root, 'rasmus@example.com', ['missing']), /Ukendt team/)
  assert.throws(() => registry.setManagerAccess(root, 'nobody@example.com', ['BPO']), /ikke oprettet/)
})

test('an empty selection removes the access entirely', t => {
  const root = platform(t)
  registry.setManagerAccess(root, 'rasmus@example.com', ['BPO'])
  registry.setManagerAccess(root, 'rasmus@example.com', [])
  assert.deepEqual(registry.listManagerAccess(root), [])
  assert.deepEqual(registry.managerTeamsForEmail(root, 'rasmus@example.com'), [])
})

test('access to a team that no longer exists, or that became the home team, is ignored', t => {
  const root = platform(t)
  registry.setManagerAccess(root, 'rasmus@example.com', ['BPO'])
  const file = path.join(registry.registryDir(root), 'manager-access.json')
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'))
  stored['rasmus@example.com'].teamIds.push('gone', 'PIM')
  fs.writeFileSync(file, JSON.stringify(stored))
  assert.deepEqual(registry.managerTeamsForEmail(root, 'rasmus@example.com').map(team => team.teamId), ['BPO'])
})

test('a forgotten account loses its extra manager access', t => {
  const root = platform(t)
  registry.setManagerAccess(root, 'rasmus@example.com', ['BPO'])
  assert.equal(registry.forgetUser(root, 'rasmus@example.com'), true)
  assert.deepEqual(registry.listManagerAccess(root), [])
})

test('the identity transaction can move manager access to a new e-mail', t => {
  const root = platform(t)
  registry.setManagerAccess(root, 'rasmus@example.com', ['BPO'])
  registry.withIdentityTransaction(root, identity => {
    const access = identity.get('managerAccess')
    assert.deepEqual(access['rasmus@example.com'].teamIds, ['BPO'])
    identity.set('managerAccess', {})
  })
  assert.deepEqual(registry.listManagerAccess(root), [])
})
