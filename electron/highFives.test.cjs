const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { createStore } = require('./store.cjs')

const KEY = 'high-fives'
const NOW = Date.UTC(2026, 9, 13, 12)
const HOUR = 3600 * 1000
const people = [
  { email: 'anna@example.test', fullName: 'Anna Andersen', teamCode: 'SC', role: 'user' },
  { email: 'bo@example.test', fullName: 'Bo Bertelsen', teamCode: 'OPS', role: 'user' },
  { email: 'cara@example.test', fullName: 'Cara Christensen', teamCode: 'OPS', role: 'user' },
  { email: 'dan@example.test', fullName: 'Dan Dahl', teamCode: 'QA', role: 'user' },
  { email: 'lead@example.test', fullName: 'Lena Leader', teamCode: 'SC', role: 'manager' },
  { email: 'creator@example.test', fullName: 'Test Creator', teamCode: 'OPS', role: 'creator' },
]
const teams = [{ folderName: 'SC', name: 'Supply Chain' }, { folderName: 'OPS', name: 'Operations' }, { folderName: 'QA', name: 'Quality' }]
const actors = Object.fromEntries(people.map(person => [person.email.split('@')[0], {
  email: person.email, role: person.role, home: { folderName: person.teamCode },
}]))
const { anna, bo, cara, dan, lead, creator } = actors
const code = value => ({ code: value })
const request = (type, fields = {}) => ({ operationId: crypto.randomUUID(), type, ...fields })
const send = (to, fields = {}) => request('send', { recipientEmail: to.email, emoji: '🙌', message: 'Great job!', ...fields })

async function fixture(t, options = {}) {
  const { createHighFivesService, EMOJIS } = require('./highFives.cjs')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-highfives-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const store = createStore(directory)
  const state = { now: NOW, failNextWrite: null, directoryReads: 0, people: people.map(person => ({ ...person })) }
  let counter = 0
  const events = []
  const guarded = {
    getAsync: (...args) => store.getAsync(...args),
    updateAsync: async (...args) => {
      const hook = state.failNextWrite
      state.failNextWrite = null
      if (hook) await hook()
      return store.updateAsync(...args)
    },
  }
  const settings = {
    getStore: () => guarded,
    getDirectory: () => { state.directoryReads++; return structuredClone({ people: state.people, teams }) },
    now: () => state.now, makeId: () => `id-${++counter}`, onChanged: keys => { events.push(keys) }, ...options,
  }
  const service = createHighFivesService(settings)
  const otherStore = createStore(directory)
  const other = createHighFivesService({ ...settings, getStore: () => otherStore, makeId: () => `other-${++counter}` })
  const stored = () => store.getAsync(KEY, { skipCache: true })
  return { service, other, store, state, events, stored, settings, EMOJIS }
}

test('the fixed emoji set holds the eight kudos emojis, default first', () => {
  const { EMOJIS } = require('./highFives.cjs')
  assert.deepEqual(EMOJIS, ['🙌', '👏', '🎉', '💪', '🔥', '⭐', '🙏', '❤️'])
})

test('send stores a trimmed high-five with names, teams and an unread mark, and announces the change', async t => {
  const f = await fixture(t)
  const result = await f.service.command(anna, send(bo, { recipientEmail: ' BO@example.test ', message: '  Great job!  ', emoji: '🎉' }))
  assert.equal(result.senderName, 'Anna Andersen')
  assert.equal(result.recipientName, 'Bo Bertelsen')
  assert.equal(result.emoji, '🎉')
  assert.equal(result.message, 'Great job!')
  const data = await f.stored()
  assert.equal(data.items.length, 1)
  assert.deepEqual(data.items[0], {
    id: result.id, senderEmail: anna.email, senderName: 'Anna Andersen', senderTeamCode: 'SC',
    recipientEmail: bo.email, recipientName: 'Bo Bertelsen', recipientTeamCode: 'OPS',
    emoji: '🎉', message: 'Great job!', at: new Date(NOW).toISOString(), readAt: null,
  })
  assert.deepEqual(f.events, [[KEY]])
})

test('send rejects every invalid field, self, the creator, unknown people and unknown fields', async t => {
  const f = await fixture(t)
  const bad = [
    { recipientEmail: anna.email }, { recipientEmail: creator.email }, { recipientEmail: 'nobody@example.test' },
    { recipientEmail: 42 }, { recipientEmail: undefined }, { recipientEmail: 'not-an-email' },
    { emoji: '😀' }, { emoji: '🙌🙌' }, { emoji: '' }, { emoji: undefined }, { emoji: 7 },
    { message: '' }, { message: '   ' }, { message: undefined }, { message: 5 }, { message: 'x'.repeat(201) },
    { message: 'line one\nline two' }, { message: 'tab\there' }, { message: 'nul\u0000byte' }, { message: 'del\u007f' },
    { message: 'ltr\u202eoverride' }, { message: 'sep\u2028arator' },
    { extra: 1 }, { gameId: 'g1' },
  ]
  for (const fields of bad) {
    const input = send(bo, fields)
    for (const key of Object.keys(input)) if (input[key] === undefined) delete input[key]
    await assert.rejects(f.service.command(anna, input), code('HIGH_FIVES_INVALID'), JSON.stringify(fields))
  }
  await assert.rejects(f.service.command(anna, { type: 'send', recipientEmail: bo.email, emoji: '🙌', message: 'hi' }), code('HIGH_FIVES_INVALID'))
  await assert.rejects(f.service.command(anna, send(bo, { operationId: 'bad id!' })), code('HIGH_FIVES_INVALID'))
  await assert.rejects(f.service.command(anna, request('unknown')), code('HIGH_FIVES_INVALID'))
  await assert.rejects(f.service.command(anna, null), code('HIGH_FIVES_INVALID'))
  await assert.rejects(f.service.command(anna, []), code('HIGH_FIVES_INVALID'))
  assert.equal(await f.stored(), undefined)
  assert.deepEqual(f.events, [])
  // A message of exactly the limit is fine, and every emoji in the set is accepted.
  await f.service.command(anna, send(bo, { message: 'y'.repeat(200) }))
  for (const emoji of f.EMOJIS) await f.service.command(lead, send(bo, { emoji }))
})

test('the creator and unapproved or moved actors cannot send', async t => {
  const f = await fixture(t)
  await assert.rejects(f.service.command(creator, send(bo)), code('HIGH_FIVES_FORBIDDEN'))
  await assert.rejects(f.service.command({ ...anna, home: { folderName: 'OPS' } }, send(bo)), code('AUTH_REQUIRED'))
  await assert.rejects(f.service.command({ ...anna, role: 'manager' }, send(bo)), code('AUTH_REQUIRED'))
  await assert.rejects(f.service.command({ email: 'ghost@example.test', role: 'user', home: { folderName: 'SC' } }, send(bo)), code('AUTH_REQUIRED'))
  await assert.rejects(f.service.command(null, send(bo)), code('AUTH_REQUIRED'))
  await assert.rejects(f.service.command({ email: anna.email, role: 'user' }, send(bo)), code('AUTH_REQUIRED'))
  assert.equal(await f.stored(), undefined)
})

test('a replayed operation returns the original high-five without a second write; a reused id with another payload or actor is refused', async t => {
  const f = await fixture(t)
  const input = send(bo)
  const first = await f.service.command(anna, input)
  const again = await f.service.command(anna, structuredClone(input))
  assert.deepEqual(again, first)
  assert.equal((await f.stored()).items.length, 1)
  assert.equal(f.events.length, 1)
  await assert.rejects(f.service.command(anna, { ...input, message: 'Something else' }), code('HIGH_FIVES_OPERATION_CONFLICT'))
  await assert.rejects(f.service.command(lead, structuredClone(input)), code('HIGH_FIVES_OPERATION_CONFLICT'))
  assert.equal((await f.stored()).items.length, 1)
  // The replay also works through another client that sees the same shared file.
  assert.deepEqual(await f.other.command(anna, structuredClone(input)), first)
  assert.equal((await f.stored()).items.length, 1)
})

test('a write that loses a race is retried against the fresh file, so both high-fives survive', async t => {
  const f = await fixture(t)
  f.state.failNextWrite = () => f.other.command(cara, send(bo, { message: 'From the other client' }))
  await f.service.command(anna, send(bo, { message: 'From this client' }))
  const messages = (await f.stored()).items.map(item => item.message).sort()
  assert.deepEqual(messages, ['From the other client', 'From this client'])
})

test('a write that keeps conflicting fails with a high-fives conflict', async t => {
  const f = await fixture(t)
  const conflict = Object.assign(new Error('KV_CONFLICT'), { code: 'KV_CONFLICT' })
  const failing = { getAsync: (...args) => f.store.getAsync(...args), updateAsync: async () => { throw conflict } }
  const { createHighFivesService } = require('./highFives.cjs')
  const service = createHighFivesService({ ...f.settings, getStore: () => failing })
  await assert.rejects(service.command(anna, send(bo)), code('HIGH_FIVES_CONFLICT'))
})

test('other store failures are not swallowed', async t => {
  const f = await fixture(t)
  const failing = { getAsync: (...args) => f.store.getAsync(...args), updateAsync: async () => { throw new Error('DRIVE_GONE') } }
  const { createHighFivesService } = require('./highFives.cjs')
  const service = createHighFivesService({ ...f.settings, getStore: () => failing })
  await assert.rejects(service.command(anna, send(bo)), /DRIVE_GONE/)
})

test('only the newest 500 high-fives and 1000 operation ids are kept', async t => {
  const f = await fixture(t)
  const at = new Date(NOW - 30 * 24 * HOUR).toISOString()
  const items = Array.from({ length: 500 }, (_, index) => ({
    id: `old-${index}`, senderEmail: cara.email, senderName: 'Cara Christensen', senderTeamCode: 'OPS',
    recipientEmail: bo.email, recipientName: 'Bo Bertelsen', recipientTeamCode: 'OPS', emoji: '🙌', message: `old ${index}`, at, readAt: null,
  }))
  const operations = Array.from({ length: 1000 }, (_, index) => ({ id: `op-${index}`, actorEmail: cara.email, fingerprint: 'a'.repeat(64), at }))
  await f.store.setAsync(KEY, { items, operations })
  const sent = await f.service.command(anna, send(bo))
  const data = await f.stored()
  assert.equal(data.items.length, 500)
  assert.equal(data.items[0].id, 'old-1')
  assert.equal(data.items.at(-1).id, sent.id)
  assert.equal(data.operations.length, 1000)
  assert.equal(data.operations[0].id, 'op-1')
})

test('a sender may send at most 20 high-fives per hour', async t => {
  const f = await fixture(t)
  for (let index = 0; index < 20; index++) await f.service.command(anna, send(bo, { message: `Thanks ${index}` }))
  await assert.rejects(f.service.command(anna, send(bo)), code('HIGH_FIVES_LIMIT'))
  await f.service.command(lead, send(bo))
  f.state.now += HOUR + 1000
  await f.service.command(anna, send(bo))
})

test('acknowledge marks only the actor\'s own received high-fives read, once, and ignores ids that no longer exist', async t => {
  const f = await fixture(t)
  const toBo = await f.service.command(anna, send(bo))
  const toBo2 = await f.service.command(cara, send(bo))
  const toDan = await f.service.command(anna, send(dan))
  f.state.now += 5000
  const result = await f.service.command(bo, request('acknowledge', { ids: [toBo.id, 'gone-already'] }))
  assert.deepEqual(result, { acknowledged: 1 })
  const data = await f.stored()
  const read = Object.fromEntries(data.items.map(item => [item.id, item.readAt]))
  assert.equal(read[toBo.id], new Date(NOW + 5000).toISOString())
  assert.equal(read[toBo2.id], null)
  assert.equal(read[toDan.id], null)
  // Someone else's high-fives, or the sender's own sent ones, cannot be acknowledged.
  await assert.rejects(f.service.command(bo, request('acknowledge', { ids: [toDan.id] })), code('HIGH_FIVES_FORBIDDEN'))
  await assert.rejects(f.service.command(anna, request('acknowledge', { ids: [toBo.id] })), code('HIGH_FIVES_FORBIDDEN'))
  assert.equal((await f.stored()).items.find(item => item.id === toDan.id).readAt, null)
  // A second acknowledge changes nothing: the first read time stays.
  f.state.now += 9000
  assert.deepEqual(await f.service.command(bo, request('acknowledge', { ids: [toBo.id] })), { acknowledged: 0 })
  assert.equal((await f.stored()).items.find(item => item.id === toBo.id).readAt, new Date(NOW + 5000).toISOString())
})

test('acknowledge validates ids and an operation replay does not write again', async t => {
  const f = await fixture(t)
  const toBo = await f.service.command(anna, send(bo))
  for (const fields of [{ ids: [] }, { ids: 'x' }, { ids: [1] }, { ids: ['bad id!'] }, { ids: [toBo.id, toBo.id] }, { ids: Array.from({ length: 101 }, (_, index) => `i${index}`) }, {}, { ids: [toBo.id], extra: true }]) {
    await assert.rejects(f.service.command(bo, request('acknowledge', fields)), code('HIGH_FIVES_INVALID'), JSON.stringify(fields))
  }
  const input = request('acknowledge', { ids: [toBo.id] })
  assert.deepEqual(await f.service.command(bo, input), { acknowledged: 1 })
  const before = await f.stored()
  assert.deepEqual(await f.service.command(bo, structuredClone(input)), { acknowledged: 1 })
  assert.deepEqual(await f.stored(), before)
  await assert.rejects(f.service.command(bo, { ...input, ids: ['x1'] }), code('HIGH_FIVES_OPERATION_CONFLICT'))
})

async function scenario(t) {
  const f = await fixture(t)
  const out = []
  for (const [from, to, message] of [[anna, bo, 'Anna to Bo'], [cara, dan, 'Cara to Dan'], [bo, anna, 'Bo to Anna'], [dan, lead, 'Dan to Lena']]) {
    f.state.now += 1000
    out.push(await f.service.command(from, send(to, { message })))
  }
  return { f, out }
}

test('snapshot shows the actor what they received and their team\'s feed, newest first, and nothing else', async t => {
  const { f, out } = await scenario(t)
  const forBo = await f.service.snapshot(bo)
  assert.deepEqual(forBo.received.map(item => item.message), ['Anna to Bo'])
  assert.equal(forBo.received[0].senderName, 'Anna Andersen')
  assert.equal(forBo.received[0].senderTeamCode, 'SC')
  assert.equal(forBo.received[0].readAt, null)
  // OPS = Bo and Cara: Anna to Bo (to OPS), Cara to Dan (from OPS), Bo to Anna (from OPS); not Dan to Lena.
  assert.deepEqual(forBo.team.map(item => item.message), ['Bo to Anna', 'Cara to Dan', 'Anna to Bo'])
  assert.deepEqual(forBo.team[0], {
    id: out[2].id, senderName: 'Bo Bertelsen', senderTeamCode: 'OPS', recipientName: 'Anna Andersen', recipientTeamCode: 'SC',
    emoji: '🙌', message: 'Bo to Anna', at: new Date(NOW + 3000).toISOString(),
  })
  const forDan = await f.service.snapshot(dan)
  assert.deepEqual(forDan.received.map(item => item.message), ['Cara to Dan'])
  assert.deepEqual(forDan.team.map(item => item.message), ['Dan to Lena', 'Cara to Dan'])
  const forLead = await f.service.snapshot(lead)
  assert.deepEqual(forLead.received.map(item => item.message), ['Dan to Lena'])
  assert.deepEqual(forLead.team.map(item => item.message), ['Dan to Lena', 'Bo to Anna', 'Anna to Bo'])
  const text = JSON.stringify([forBo, forDan, forLead])
  for (const secret of ['fingerprint', 'operations', 'senderEmail', 'recipientEmail']) assert.ok(!text.includes(secret), secret)
  // Received items never expose the recipient's e-mail or others' read marks; team items carry no read marks at all.
  assert.ok(forBo.team.every(item => !('readAt' in item)))
})

test('snapshot of someone nobody wrote to or about is empty, and a read mark shows up on the received item', async t => {
  const { f } = await scenario(t)
  const empty = await f.service.snapshot(creator)
  assert.deepEqual([empty.received, empty.team, empty.people], [[], [], []])
  assert.equal(empty.actor.canSend, false)
  const forCara = await f.service.snapshot(cara)
  assert.deepEqual(forCara.received, [])
  assert.equal(forCara.team.length, 3)
  const [first] = (await f.service.snapshot(bo)).received
  await f.service.command(bo, request('acknowledge', { ids: [first.id] }))
  assert.ok((await f.service.snapshot(bo)).received[0].readAt)
})

test('snapshot lists the people to choose from (no self, no creator), the teams and who may send', async t => {
  const f = await fixture(t)
  const snapshot = await f.service.snapshot(anna)
  assert.deepEqual(snapshot.people.map(person => person.email).sort(), [bo.email, cara.email, dan.email, lead.email].sort())
  assert.deepEqual(snapshot.people.find(person => person.email === dan.email), { email: dan.email, fullName: 'Dan Dahl', teamCode: 'QA' })
  assert.deepEqual(snapshot.teams, teams)
  assert.deepEqual(snapshot.actor, { email: anna.email, fullName: 'Anna Andersen', teamCode: 'SC', canSend: true })
  await assert.rejects(f.service.snapshot({ email: 'ghost@example.test', role: 'user', home: { folderName: 'SC' } }), code('AUTH_REQUIRED'))
  await assert.rejects(f.service.snapshot(null), code('AUTH_REQUIRED'))
})

test('names come from the current directory, falling back to the name stored with the high-five', async t => {
  const { f } = await scenario(t)
  f.state.people.find(person => person.email === anna.email).fullName = 'Anna Renamed'
  f.state.people = f.state.people.filter(person => person.email !== cara.email)
  const forBo = await f.service.snapshot(bo)
  assert.equal(forBo.received[0].senderName, 'Anna Renamed')
  assert.equal(forBo.team.find(item => item.message === 'Cara to Dan').senderName, 'Cara Christensen')
})

test('invalid shared data is refused rather than guessed at', async t => {
  const f = await fixture(t)
  for (const bad of ['text', [], { items: 'x', operations: [] }, { items: [], operations: 'x' }, { items: [null], operations: [] }, { items: [{ id: 'a' }], operations: [] }, { items: [], operations: [{ id: 'a' }] }]) {
    await f.store.setAsync(KEY, bad)
    await assert.rejects(f.service.snapshot(anna), code('HIGH_FIVES_INVALID_DATA'), JSON.stringify(bad))
    await assert.rejects(f.service.command(anna, send(bo)), code('HIGH_FIVES_INVALID_DATA'))
  }
})

test('the directory is read once per window when a cache time is set, a new sender is still found, and invalidate forces a fresh read', async t => {
  const f = await fixture(t, { directoryTtlMs: 30000 })
  await f.service.snapshot(anna)
  await f.service.snapshot(anna)
  await f.service.snapshot(bo)
  assert.equal(f.state.directoryReads, 1)
  f.state.people.push({ email: 'eve@example.test', fullName: 'Eve Evans', teamCode: 'QA', role: 'user' })
  const eve = { email: 'eve@example.test', role: 'user', home: { folderName: 'QA' } }
  assert.ok(await f.service.snapshot(eve))
  assert.equal(f.state.directoryReads, 2)
  await f.service.command(anna, send(eve))
  f.service.invalidateDirectory()
  await f.service.snapshot(anna)
  assert.equal(f.state.directoryReads, 4)
})

test('sending always checks a fresh directory, even when reads are cached', async t => {
  const f = await fixture(t, { directoryTtlMs: 30000 })
  await f.service.snapshot(anna)
  const reads = f.state.directoryReads
  f.state.people = f.state.people.filter(person => person.email !== bo.email)
  await assert.rejects(f.service.command(anna, send(bo)), code('HIGH_FIVES_INVALID'))
  assert.ok(f.state.directoryReads > reads)
})

test('the service refuses to start without its dependencies', () => {
  const { createHighFivesService } = require('./highFives.cjs')
  assert.throws(() => createHighFivesService(), TypeError)
  assert.throws(() => createHighFivesService({ getStore: () => ({}) }), TypeError)
  assert.throws(() => createHighFivesService({ getStore: () => ({}), getDirectory: () => ({}), onChanged: 'x' }), TypeError)
})
