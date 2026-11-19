const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('./store.cjs')

function fixture(t, teams = [{ folderName: 'SC', name: 'Supply Chain' }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-improvements-directory-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const state = { root, teams, creatorEmail: 'creator@example.test' }
  const opened = [], reads = [], stores = new Map()
  let activeReads = 0, peakReads = 0
  const options = {
    getRoot: () => state.root,
    listTeams: (...args) => { assert.deepEqual(args, []); return state.teams },
    getCreatorEmail: (...args) => { assert.deepEqual(args, []); return state.creatorEmail },
    openStore: directory => {
      opened.push(directory)
      const store = createStore(directory), getAsync = store.getAsync
      store.getAsync = async (...args) => {
        reads.push(args)
        activeReads++
        peakReads = Math.max(peakReads, activeReads)
        try { return await getAsync(...args) } finally { activeReads-- }
      }
      stores.set(directory, store)
      return store
    },
  }
  function seed(folderName, users, dataRoot = state.root) {
    const directory = path.join(dataRoot, folderName)
    createStore(directory).set('users', users)
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'users.json'), 'utf8')).__enc, 1)
  }
  function createDirectory() {
    assert.ok(fs.existsSync(path.join(__dirname, 'improvementsDirectory.cjs')), 'directory factory module must exist')
    const { createImprovementsDirectory } = require('./improvementsDirectory.cjs')
    assert.equal(typeof createImprovementsDirectory, 'function')
    const getDirectory = createImprovementsDirectory(options)
    assert.equal(typeof getDirectory, 'function')
    return getDirectory
  }
  return { state, options, opened, reads, stores, seed, createDirectory, peakReads: () => peakReads }
}

test('projects encrypted registered users into normalized public directory fields only', async t => {
  const f = fixture(t, [{ folderName: 'SC', name: ' Supply Chain ', teamId: 'private-id', owner: 'private-owner' }])
  f.seed('SC', {
    ' AUTHOR@Example.Test ': { email: 'different@example.test', fullName: ' Approved Author ', status: 'approved', password: 'synthetic-secret', phone: 'synthetic-phone', extra: { private: true } },
    'legacy-id': { email: ' FALLBACK@Example.Test ', fullName: 'Fallback User', status: 'approved' },
  })
  const result = await f.createDirectory()()
  assert.deepEqual(result, {
    teams: [{ folderName: 'SC', name: 'Supply Chain' }],
    people: [
      { email: 'author@example.test', fullName: 'Approved Author', teamCode: 'SC', role: 'user' },
      { email: 'fallback@example.test', fullName: 'Fallback User', teamCode: 'SC', role: 'user' },
    ],
  })
  assert.deepEqual(f.reads, [['users']])
})

test('includes legacy and approved accounts but never revives blocked creators', async t => {
  const f = fixture(t)
  f.seed('SC', {
    'legacy@example.test': { fullName: 'Legacy Account' },
    'approved@example.test': { fullName: 'Approved Account', status: 'approved' },
    ...Object.fromEntries(['pending', 'rejected', 'inactive', 'unknown'].map(status => [
      `${status}@example.test`, { fullName: 'Blocked Account', status, role: 'admin' },
    ])),
  })
  const getDirectory = f.createDirectory()
  for (const status of ['pending', 'rejected', 'inactive', 'unknown']) {
    f.state.creatorEmail = `${status}@example.test`
    assert.deepEqual((await getDirectory()).people.map(person => person.email), ['legacy@example.test', 'approved@example.test'])
  }
})

test('skips malformed users and uses email only when a legacy full name is absent', async t => {
  const f = fixture(t, [{ folderName: 'SC', name: 'Supply Chain' }, { folderName: 'OPS', name: 'Operations' }, { folderName: 'QA', name: 'Quality' }])
  f.seed('SC', {
    'legacy@example.test': { status: 'approved' },
    'null@example.test': null,
    'array@example.test': [],
    'primitive@example.test': 'not an account',
    'blank@example.test': { fullName: ' ' },
    'numeric@example.test': { fullName: 123 },
    'null-name@example.test': { fullName: null },
    'long@example.test': { fullName: 'x'.repeat(201) },
    'control@example.test': { fullName: 'Bad\u0000Name' },
    'not-an-email': { email: 123, fullName: 'Bad Email' },
    ['x'.repeat(250) + '@example.test']: { fullName: 'Long Email' },
  })
  f.seed('OPS', [{ email: 'array-user@example.test', fullName: 'Must Not Appear' }])
  f.seed('QA', null)
  assert.deepEqual((await f.createDirectory()()).people, [
    { email: 'legacy@example.test', fullName: 'legacy@example.test', teamCode: 'SC', role: 'user' },
  ])
})

test('maps native manager and admin roles without accepting stored creator impersonation', async t => {
  const f = fixture(t)
  f.state.creatorEmail = ' CREATOR@Example.Test '
  const roles = [
    ['manager', { role: 'manager' }, 'manager'],
    ['admin', { role: 'admin' }, 'manager'],
    ['legacy-manager', { isManager: true }, 'manager'],
    ['explicit-user', { role: 'user', isManager: true }, 'user'],
    ['pretend-creator', { role: 'creator' }, 'user'],
    ['unknown-role', { role: 'unknown', isManager: true }, 'user'],
    ['creator', { role: 'user' }, 'creator'],
  ]
  f.seed('SC', Object.fromEntries(roles.map(([name, fields]) => [`${name}@example.test`, { fullName: name, status: 'approved', ...fields }])))
  assert.deepEqual((await f.createDirectory()()).people.map(person => person.role), roles.map(([, , role]) => role))
})

test('fails closed on duplicate approved identities instead of guessing a registered home', async t => {
  const f = fixture(t, [{ folderName: 'SC', name: 'Supply Chain' }, { folderName: 'OPS', name: 'Operations' }])
  f.seed('SC', { ' SHARED@Example.Test ': { fullName: 'Current Account', role: 'user', status: 'approved' } })
  f.seed('OPS', { 'shared@example.test': { fullName: 'Stale Approved Account', role: 'admin', status: 'approved' } })
  await assert.rejects(f.createDirectory()(), { code: 'IMPROVEMENTS_DIRECTORY' })
  const otherStore = f.stores.get(path.join(f.state.root, 'OPS'))
  otherStore.set('users', { 'shared@example.test': { fullName: 'Retired Account', status: 'inactive' } })
  const result = await f.createDirectory()()
  assert.equal(result.people.length, 1)
  assert.equal(result.people[0].teamCode, 'SC')
  otherStore.set('users', {})
  f.stores.get(path.join(f.state.root, 'SC')).set('users', {
    'shared@example.test': { fullName: 'First Alias' },
    'SHARED@example.test': { fullName: 'Second Alias', role: 'admin' },
  })
  await assert.rejects(f.createDirectory()(), { code: 'IMPROVEMENTS_DIRECTORY' })
})

test('validates the whole registry before I/O and rejects traversal and malformed teams', async t => {
  const f = fixture(t), getDirectory = f.createDirectory()
  const valid = { folderName: 'SC', name: 'Supply Chain' }
  for (const invalid of [
    null, [], {}, { folderName: '../escape', name: 'Escape' },
    { folderName: '..\\escape', name: 'Escape' }, { folderName: 'C:\\escape', name: 'Escape' },
    { folderName: 'x'.repeat(101), name: 'Too Long' },
    { folderName: 'OPS', name: 123 }, { folderName: 'OPS', name: ' ' },
    { folderName: 'OPS', name: 'x'.repeat(201) }, { folderName: 'OPS', name: 'Bad\u0000Name' }, valid,
  ]) {
    f.state.teams = [valid, invalid]
    await assert.rejects(getDirectory(), { code: 'AUTH_FORBIDDEN' })
  }
  for (const invalid of [null, {}, 'SC']) {
    f.state.teams = invalid
    await assert.rejects(getDirectory(), { code: 'AUTH_FORBIDDEN' })
  }
  f.state.teams = [valid]
  f.state.root = ''
  await assert.rejects(getDirectory(), { code: 'AUTH_FORBIDDEN' })
  assert.deepEqual(f.opened, [])
})

test('bounds the registry to 100 teams and reads registered stores sequentially', async t => {
  const f = fixture(t, Array.from({ length: 101 }, (_, index) => ({ folderName: `Team${index}`, name: `Team ${index}` })))
  const getDirectory = f.createDirectory()
  await assert.rejects(getDirectory(), { code: 'AUTH_FORBIDDEN' })
  assert.deepEqual(f.opened, [])
  f.state.teams = f.state.teams.slice(0, 100)
  const result = await getDirectory()
  assert.equal(result.teams.length, 100)
  assert.deepEqual(result.people, [])
  assert.equal(f.opened.length, 100)
  assert.equal(f.peakReads(), 1)
  assert.ok(f.reads.every(args => args.length === 1 && args[0] === 'users'))
})

test('reuses stores by root and directory but revalidates and returns fresh results', async t => {
  const f = fixture(t)
  f.seed('SC', { 'creator@example.test': { fullName: 'Original User', status: 'approved', role: 'user' } })
  const getDirectory = f.createDirectory(), originalRoot = f.state.root
  const first = await getDirectory()
  first.teams[0].name = 'Caller Mutation'
  first.people[0].fullName = 'Caller Mutation'
  f.state.teams[0].name = 'Renamed Team'
  f.state.creatorEmail = 'someone-else@example.test'
  f.stores.get(path.join(originalRoot, 'SC')).set('users', { 'creator@example.test': { fullName: 'Updated User', role: 'admin' } })
  const second = await getDirectory()
  assert.notEqual(first, second)
  assert.deepEqual(second, {
    teams: [{ folderName: 'SC', name: 'Renamed Team' }],
    people: [{ email: 'creator@example.test', fullName: 'Updated User', teamCode: 'SC', role: 'manager' }],
  })
  assert.equal(f.opened.length, 1)
  f.state.root = path.join(originalRoot, 'other-root')
  f.seed('SC', { 'other@example.test': { fullName: 'Other Root User' } })
  assert.equal((await getDirectory()).people[0].email, 'other@example.test')
  f.state.root = originalRoot
  assert.equal((await getDirectory()).people[0].email, 'creator@example.test')
  assert.equal(f.opened.length, 2)
  f.state.teams = []
  assert.deepEqual(await getDirectory(), { teams: [], people: [] })
  f.state.teams = [{ folderName: '../escape', name: 'Invalid Replacement' }]
  await assert.rejects(getDirectory(), { code: 'AUTH_FORBIDDEN' })
  assert.equal(f.opened.length, 2)
})

test('rejects an unreadable encrypted store instead of returning a partial directory', async t => {
  const f = fixture(t, [{ folderName: 'SC', name: 'Supply Chain' }, { folderName: 'OPS', name: 'Operations' }])
  f.seed('SC', { 'approved@example.test': { fullName: 'Approved User' } })
  f.seed('OPS', { 'other@example.test': { fullName: 'Other User' } })
  fs.writeFileSync(path.join(f.state.root, 'OPS', 'users.json'), '{broken')
  await assert.rejects(f.createDirectory()(), SyntaxError)
})