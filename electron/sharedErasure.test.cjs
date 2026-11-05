const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { createStore } = require('./store.cjs')
const { createMultiplayerService } = require('./multiplayer.cjs')
const { eraseSharedUserData, aliasFor, DELETED_NAME } = require('./sharedErasure.cjs')

const people = [
  { email: 'anna@example.test', fullName: 'Anna Andersen', teamCode: 'SC', role: 'user' },
  { email: 'bo@example.test', fullName: 'Bo Bertelsen', teamCode: 'OPS', role: 'user' },
  { email: 'cara@example.test', fullName: 'Cara Christensen', teamCode: 'OPS', role: 'user' },
]
const teams = [{ folderName: 'SC', name: 'Supply Chain' }, { folderName: 'OPS', name: 'Operations' }]
const actor = person => ({ email: person.email, role: person.role, home: { folderName: person.teamCode } })
const [anna, bo, cara] = people.map(actor)
const request = (type, fields = {}) => ({ operationId: crypto.randomUUID(), type, ...fields })

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-shared-erase-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const shared = createStore(directory)
  const games = createStore(path.join(directory, 'multiplayer'))
  let counter = 0
  const directoryOf = () => structuredClone({ people: people.filter(person => !person.gone), teams })
  const multiplayer = createMultiplayerService({
    getIndexStore: () => shared, getGameStore: () => games, getDirectory: directoryOf,
    wordChecker: { check: async (_, words) => Object.fromEntries(words.map(word => [word, true])) },
    now: () => Date.UTC(2026, 9, 1, 12) + counter * 1000, makeId: () => `id-${++counter}`, randomInt: () => 0,
  })
  return { shared, games, multiplayer }
}

test('games keep their history under a pseudonym and stay readable for the opponent', async t => {
  const f = await fixture(t)
  const challenged = await f.multiplayer.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))
  await f.multiplayer.command(bo, request('respond', { gameId: challenged.entry.id, accept: true }))
  await f.multiplayer.command(anna, request('chat', { gameId: challenged.entry.id, text: 'Hej Bo, Anna Andersen her' }))
  const other = await f.multiplayer.command(bo, request('challenge', { opponentEmail: cara.email, language: 'da' }))

  const result = await eraseSharedUserData(f, 'ANNA@example.test', 'Anna Andersen')
  assert.equal(result.multiplayer, true)
  assert.equal(result.games, 1)
  const raw = JSON.stringify([await f.shared.getAsync('multiplayer-index', { skipCache: true }), await f.games.getAsync(`game-${challenged.entry.id}`, { skipCache: true })])
  assert.ok(!raw.toLowerCase().includes('anna@example.test'))
  assert.ok(!raw.includes('Anna Andersen'))
  assert.ok(raw.includes(aliasFor('anna@example.test')))
  assert.ok(raw.includes(DELETED_NAME))

  // Bo's view still loads, with both games; Cara's untouched game is unchanged.
  people[0].gone = true
  t.after(() => { delete people[0].gone })
  const snapshot = await f.multiplayer.snapshot(bo)
  assert.ok(snapshot.games.some(entry => entry.id === challenged.entry.id))
  assert.ok(snapshot.games.some(entry => entry.id === other.entry.id))
  await f.multiplayer.game(bo, challenged.entry.id)
  assert.deepEqual(await eraseSharedUserData(f, 'anna@example.test', 'Anna Andersen'), { highFives: false, improvements: false, links: false, multiplayer: false, games: 0 })
})

test('high-fives to and from the person are removed; improvement cases are pseudonymised', async t => {
  const f = await fixture(t)
  const five = (id, from, to) => ({ id, senderEmail: from, senderName: 'x', senderTeamCode: 'SC', recipientEmail: to, recipientName: 'y', recipientTeamCode: 'OPS', emoji: '🙌', message: 'Tak', at: '2026-10-01T12:00:00.000Z', readAt: null })
  f.shared.set('high-fives', { items: [five('h1', 'anna@example.test', 'bo@example.test'), five('h2', 'bo@example.test', 'anna@example.test'), five('h3', 'bo@example.test', 'cara@example.test')], operations: [{ id: 'o1', actorEmail: 'anna@example.test', fingerprint: 'a'.repeat(64) }, { id: 'o2', actorEmail: 'bo@example.test', fingerprint: 'b'.repeat(64) }] })
  f.shared.set('improvement-cases', [{
    id: 'c1', createdBy: 'anna@example.test', createdByName: 'Anna Andersen', title: 'Bedre paller',
    assignments: [{ id: 'a1', email: 'anna@example.test', name: 'Anna Andersen', kind: 'owner', status: 'accepted' }, { id: 'a2', email: 'bo@example.test', name: 'Bo Bertelsen', kind: 'contributor', status: 'accepted' }],
    history: [{ id: 'h1', operationId: 'op1', actorEmail: 'anna@example.test', type: 'create', fingerprint: 'c'.repeat(64) }],
    notifications: [{ id: 'n1', recipientEmail: 'anna@example.test', message: 'x' }, { id: 'n2', recipientEmail: 'bo@example.test', message: 'Anna Andersen invited you as owner' }],
  }])
  const result = await eraseSharedUserData(f, 'anna@example.test', 'Anna Andersen')
  assert.equal(result.highFives, true)
  assert.equal(result.improvements, true)
  const fives = f.shared.get('high-fives', { skipCache: true })
  assert.deepEqual(fives.items.map(item => item.id), ['h3'])
  assert.deepEqual(fives.operations.map(item => item.id), ['o2'])
  const [item] = f.shared.get('improvement-cases', { skipCache: true })
  const alias = aliasFor('anna@example.test')
  assert.equal(item.createdBy, alias)
  assert.equal(item.createdByName, DELETED_NAME)
  assert.equal(item.assignments[0].email, alias)
  assert.equal(item.assignments[1].email, 'bo@example.test')
  assert.equal(item.history[0].actorEmail, alias)
  assert.deepEqual(item.notifications.map(note => note.id), ['n2'])
  assert.equal(item.notifications[0].message, `${DELETED_NAME} invited you as owner`)
  assert.equal(item.title, 'Bedre paller')
})
