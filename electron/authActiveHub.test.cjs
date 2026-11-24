const test = require('node:test')
const assert = require('node:assert/strict')
const { createAuthService } = require('./authService.cjs')

function memory(initial) {
  let values = structuredClone(initial || {})
  return {
    get: key => structuredClone(values[key]),
    mutate(key, callback) { const next = callback(structuredClone(values[key])); if (next !== undefined) values = { ...values, [key]: structuredClone(next) }; return structuredClone(next) },
    update(key, operation) { return this.mutate(key, current => { const next = { ...(current || {}) }; if (operation.op === 'deleteField') delete next[operation.field]; else next[operation.field] = operation.value; return next }) },
    async getAsync(key) { return this.get(key) },
    async mutateAsync(key, callback) { return this.mutate(key, callback) },
    async updateAsync(key, operation) { return this.update(key, operation) },
  }
}

function fixture({ role = 'user' } = {}) {
  const teams = [{ teamId: 'PIM', folderName: 'PIM' }, { teamId: 'BPO', folderName: 'BPO' }, { teamId: 'TCD', folderName: 'TCD' }]
  const stores = { PIM: memory({ users: { 'rasmus@example.test': { email: 'rasmus@example.test', password: 'secret123', status: 'approved', role } } }), BPO: memory(), TCD: memory() }
  let folder = null, extra = ['BPO']
  const deps = {
    registry: {
      listTeams: () => structuredClone(teams),
      lookupTeamForEmail: (_, email) => email === 'rasmus@example.test' ? teams[0] : null,
      managerTeamsForEmail: () => teams.filter(team => extra.includes(team.teamId)),
      getCreatorEmail: () => 'creator@example.test',
    },
    getRoot: () => 'root', openTeam: team => stores[team.teamId], openSessions: (() => { const sessions = memory(); return () => sessions })(),
    switchTeam: team => { folder = team.folderName }, getActiveFolder: () => folder,
    deviceSecret: Buffer.alloc(32, 3), now: () => 5000000,
  }
  return { auth: createAuthService(deps), go: name => { folder = name }, revoke: () => { extra = [] } }
}
const login = { email: 'rasmus@example.test', password: 'secret123' }

test('a person lands in the home team and sees every hub they may use', async () => {
  const f = fixture()
  const actor = await f.auth.login(1, login)
  assert.equal(actor.activeTeam.teamId, 'PIM')
  assert.equal(actor.role, 'user')
  assert.deepEqual(actor.teams.map(team => team.teamId), ['PIM', 'BPO'])
})

test('in an extra team the person is a manager, at home their own role applies', async () => {
  const f = fixture()
  await f.auth.login(1, login)
  f.go('BPO')
  const inBpo = f.auth.current(1)
  assert.equal(inBpo.activeTeam.teamId, 'BPO')
  assert.equal(inBpo.role, 'manager')
  assert.equal(inBpo.homeRole, 'user')
  assert.equal(inBpo.home.teamId, 'PIM')
  f.go('PIM')
  assert.equal(f.auth.current(1).role, 'user')
})

test('a hub without access gives no team and no manager rights, also after access is removed', async () => {
  const f = fixture({ role: 'manager' })
  await f.auth.login(1, login)
  f.go('TCD')
  assert.equal(f.auth.current(1).activeTeam, null)
  assert.equal(f.auth.current(1).role, 'user')
  assert.throws(() => f.auth.requireRole(1, 'manager'), error => error.code === 'AUTH_FORBIDDEN')
  f.go('BPO'); f.revoke()
  const revoked = f.auth.current(1)
  assert.equal(revoked.activeTeam, null)
  assert.deepEqual(revoked.teams.map(team => team.teamId), ['PIM'])
})
