const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { createStore, keyToFilename } = require('./store.cjs')

const KEY = 'improvement-cases'
const NOW = Date.UTC(2026, 9, 1, 12)
const people = [
  { email: 'author@example.test', fullName: 'Approved Author', teamCode: 'SC', role: 'user' },
  { email: 'owner@example.test', fullName: 'Cross Team Owner', teamCode: 'OPS', role: 'user' },
  { email: 'contributor@example.test', fullName: 'Cross Team Contributor', teamCode: 'OPS', role: 'user' },
  { email: 'leader@example.test', fullName: 'Approved Leader', teamCode: 'SC', role: 'manager' },
  { email: 'creator@example.test', fullName: 'Approved Creator', teamCode: 'OPS', role: 'creator' },
]
const teams = [{ folderName: 'SC', name: 'Supply Chain' }, { folderName: 'OPS', name: 'Operations' }]
const actors = Object.fromEntries(people.map(person => [person.email.split('@')[0], {
  email: person.email, role: person.role, home: { folderName: person.teamCode },
}]))
const suggestion = { title: 'Improve handover', problem: 'Information is lost', proposal: 'Use a shared checklist', category: 'process', affectedTeamCodes: ['SC', 'OPS'], ownerEmail: 'author@example.test' }
const request = (type, fields = {}, operationId = crypto.randomUUID()) => ({ operationId, type, ...fields })
const invalid = { code: 'IMPROVEMENTS_INVALID' }
const forbidden = { code: 'IMPROVEMENTS_FORBIDDEN' }
const reuse = { code: 'IMPROVEMENTS_OPERATION_CONFLICT' }
const conflict = { code: 'IMPROVEMENTS_CONFLICT' }
const notFound = { code: 'IMPROVEMENTS_NOT_FOUND' }
const revisionCommands = ['invite', 'update', 'submit', 'approve', 'return', 'set-deadlines', 'delete', 'reject-deletion']

async function fixture(t, options = {}) {
  let implementation
  try { implementation = require('./improvements.cjs') } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND' || !error.message.includes("'./improvements.cjs'")) throw error
  }
  assert.equal(typeof implementation?.createImprovementsService, 'function', 'improvements service is not implemented')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-improvements-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const store = createStore(directory)
  const otherStore = createStore(directory)
  let directoryValue = structuredClone({ people, teams })
  const getDirectory = options.getDirectory || (() => directoryValue)
  const settings = { getDirectory, now: () => NOW, ...options }
  const service = implementation.createImprovementsService({ ...settings, getStore: () => store })
  const other = implementation.createImprovementsService({ ...settings, getStore: () => otherStore })
  const stored = () => store.getAsync(KEY, { skipCache: true })
  // Cases created before an owner was required have no assignments; most workflow tests start from one.
  const create = async (actor = actors.author, fields = {}) => {
    const created = await service.command(actor, request('create', { ...suggestion, ...fields }))
    await store.setAsync(KEY, (await stored()).map(item => item.id === created.id ? { ...item, assignments: [], notifications: [] } : item))
    return { ...created, assignments: [], notifications: [] }
  }
  const command = async (actor, type, caseId, fields = {}) => {
    const expected = revisionCommands.includes(type) && !Object.hasOwn(fields, 'expectedRevision')
      ? { expectedRevision: (await stored()).find(item => item.id === caseId).revision } : {}
    return service.command(actor, request(type, { caseId, ...expected, ...fields }))
  }
  return { service, other, store, otherStore, directory, create, command, stored, setDirectory: value => { directoryValue = value } }
}

async function assigned(fixture, kind = 'owner', recipient = actors.owner) {
  const created = await fixture.create()
  const invited = await fixture.command(actors.leader, 'invite', created.id, { email: recipient.email, kind })
  const assignment = invited.assignments.at(-1)
  const accepted = await fixture.command(recipient, 'respond', created.id, { assignmentId: assignment.id, accept: true })
  return accepted
}

async function ready(fixture) {
  const item = await assigned(fixture)
  await fixture.command(actors.owner, 'update', item.id, { status: 'in-progress' })
  return fixture.command(actors.owner, 'submit', item.id)
}

async function atStatus(fixture, status, pending = false) {
  const item = await assigned(fixture)
  if (pending) await fixture.command(actors.leader, 'invite', item.id, { email: actors.contributor.email, kind: 'contributor' })
  if (['in-progress', 'testing', 'ready-for-approval', 'completed'].includes(status)) {
    await fixture.command(actors.owner, 'update', item.id, { status: 'in-progress' })
    if (status === 'testing') return fixture.command(actors.owner, 'update', item.id, { status })
    if (['ready-for-approval', 'completed'].includes(status)) {
      const submitted = await fixture.command(actors.owner, 'submit', item.id)
      if (status === 'ready-for-approval') return submitted
      await fixture.command(actors.leader, 'approve', item.id)
    }
  } else if (status !== 'new') {
    await fixture.command(actors.leader, 'update', item.id, { status, ...(['on-hold', 'declined'].includes(status) ? { message: 'Budget decision' } : {}) })
  }
  return (await fixture.service.snapshot(actors.owner)).cases.find(current => current.id === item.id)
}

test('leaders configure separate invitation-response and feedback dates without being assigned', async t => {
  const f = await fixture(t)
  const item = await f.create()
  const invited = await f.command(actors.leader, 'invite', item.id, { email: actors.owner.email, kind: 'owner', responseDueDate: '2026-10-03' })
  assert.equal(invited.assignments[0].responseDueDate, '2026-10-03')
  const updated = await f.command(actors.leader, 'set-deadlines', item.id, { feedbackDueDate: '2026-10-08' })
  assert.equal(updated.feedbackDueDate, '2026-10-08')
  assert.equal(updated.dueDate, '')
  await assert.rejects(f.command(actors.author, 'set-deadlines', item.id, { feedbackDueDate: '2026-10-10' }), forbidden)
  await assert.rejects(f.command(actors.leader, 'set-deadlines', item.id, { feedbackDueDate: '2026-02-30' }), invalid)
})

test('users request deletion but only leaders delete, keeping retry receipts and hiding deleted cases', async t => {
  const f = await fixture(t)
  const item = await f.create()
  await assert.rejects(f.command(actors.author, 'delete', item.id, { message: 'Duplicate' }), forbidden)
  const requested = await f.command(actors.author, 'request-deletion', item.id, { message: 'Duplicate proposal' })
  assert.equal(requested.deletionRequests[0].requestedBy, actors.author.email)
  assert.equal(requested.deletionRequests[0].status, 'pending')
  assert.ok((await f.service.snapshot(actors.leader)).cases[0].notifications.some(notification => notification.type === 'request-deletion'))
  const payload = request('delete', { caseId: item.id, expectedRevision: requested.revision, message: 'Duplicate confirmed' })
  const deleted = await f.service.command(actors.leader, payload)
  assert.ok(deleted.deletedAt)
  assert.deepEqual((await f.service.snapshot(actors.author)).cases, [])
  assert.equal((await f.stored()).length, 1)
  assert.equal((await f.service.command(actors.leader, payload)).revision, deleted.revision)
  await assert.rejects(f.command(actors.author, 'comment', item.id, { message: 'Still editing' }), { code: 'IMPROVEMENTS_NOT_FOUND' })
})

test('deadline fields validate real dates, explicit clearing and assignment matching atomically', async t => {
  const f = await fixture(t)
  const item = await f.create()
  for (const responseDueDate of [null, 123, undefined, '2026-02-29', '2026-04-31', '0000-01-01', '2026-1-01', ' 2026-10-02']) {
    await assert.rejects(f.command(actors.leader, 'invite', item.id, { email: actors.owner.email, kind: 'owner', responseDueDate }), invalid)
  }
  const invited = await f.command(actors.creator, 'invite', item.id, { email: actors.owner.email, kind: 'owner', responseDueDate: '2028-02-29' })
  const assignmentId = invited.assignments[0].id
  const before = await f.stored()
  for (const fields of [{}, { assignmentId }, { responseDueDate: '' }, { feedbackDueDate: '', assignmentId },
    { responseDueDate: '', assignmentId: 'unknown', feedbackDueDate: '2026-10-06' },
    { feedbackDueDate: '', status: 'completed' }, { responseDueDate: '', assignmentId, message: 'Forged' }]) {
    await assert.rejects(f.command(actors.leader, 'set-deadlines', item.id, fields), invalid)
  }
  for (const date of [null, undefined, 123, '2026-02-30', '2026-13-01', '0000-01-01', '2026-10-01T00:00:00Z']) {
    await assert.rejects(f.command(actors.leader, 'set-deadlines', item.id, { feedbackDueDate: date }), invalid)
    await assert.rejects(f.command(actors.leader, 'set-deadlines', item.id, { assignmentId, responseDueDate: date }), invalid)
  }
  assert.deepEqual(await f.stored(), before)
  const updated = await f.command(actors.creator, 'set-deadlines', item.id, { assignmentId, responseDueDate: '2026-10-04', feedbackDueDate: '2026-10-05' })
  assert.equal(updated.assignments[0].responseDueDate, '2026-10-04')
  assert.equal(updated.feedbackDueDate, '2026-10-05')
  const cleared = await f.command(actors.leader, 'set-deadlines', item.id, { assignmentId, responseDueDate: '', feedbackDueDate: '' })
  assert.equal(cleared.assignments[0].responseDueDate, '')
  assert.equal(cleared.feedbackDueDate, '')
  assert.equal(cleared.status, item.status)
  assert.equal(cleared.dueDate, '')
  const emptyInvite = await f.command(actors.leader, 'invite', item.id, { email: actors.contributor.email, kind: 'contributor', responseDueDate: '' })
  assert.equal(emptyInvite.assignments.at(-1).responseDueDate, '')
})

test('response dates are informational and only pending assignments can have their response date changed', async t => {
  const f = await fixture(t)
  for (const accept of [true, false]) {
    const item = await f.create()
    const invited = await f.command(actors.leader, 'invite', item.id, { email: actors.owner.email, kind: 'owner', responseDueDate: '2026-09-01' })
    const assignmentId = invited.assignments[0].id
    const snapshot = (await f.other.snapshot(actors.owner)).cases.find(current => current.id === item.id)
    assert.equal(snapshot.assignments[0].status, 'pending')
    const responded = await f.command(actors.owner, 'respond', item.id, { assignmentId, accept })
    assert.equal(responded.assignments[0].status, accept ? 'accepted' : 'declined')
    assert.equal(responded.assignments[0].responseDueDate, '2026-09-01')
    const before = await f.stored()
    await assert.rejects(f.command(actors.leader, 'set-deadlines', item.id, { assignmentId, responseDueDate: '', feedbackDueDate: '2026-10-06' }), forbidden)
    assert.deepEqual(await f.stored(), before)
  }
})

test('administrative dates leave case progress intact and final states freeze deadlines', async t => {
  const f = await fixture(t)
  for (const status of ['new', 'assessment', 'planned', 'in-progress', 'testing', 'ready-for-approval', 'on-hold', 'completed', 'declined']) {
    const item = await atStatus(f, status, true)
    const assignmentId = item.assignments.find(current => current.status === 'pending').id
    const before = await f.stored()
    if (['completed', 'declined'].includes(status)) {
      await assert.rejects(f.command(actors.leader, 'set-deadlines', item.id, { feedbackDueDate: '' }), forbidden)
      await assert.rejects(f.command(actors.leader, 'set-deadlines', item.id, { assignmentId, responseDueDate: '' }), forbidden)
      assert.deepEqual(await f.stored(), before)
    } else {
      const updated = await f.command(actors.leader, 'set-deadlines', item.id, { feedbackDueDate: '2026-09-01', assignmentId, responseDueDate: '2026-09-02' })
      assert.equal(updated.status, status)
      assert.equal(updated.dueDate, item.dueDate)
      assert.equal(updated.assignments.find(current => current.id === assignmentId).status, 'pending')
    }
  }
})

test('new commands reject unapproved identities, role escalation and unauthorized regular users', async t => {
  const f = await fixture(t)
  const item = await f.create()
  const requested = await f.command(actors.author, 'request-deletion', item.id, { message: 'Duplicate' })
  const fields = {
    'set-deadlines': { feedbackDueDate: '' }, delete: { message: 'Duplicate' },
    'reject-deletion': { requestId: requested.deletionRequests[0].id, message: 'Still needed' },
    'request-deletion': { message: 'Duplicate' },
  }
  for (const [type, payload] of Object.entries(fields)) {
    const input = request(type, { caseId: item.id, ...payload, ...(revisionCommands.includes(type) ? { expectedRevision: requested.revision } : {}) })
    await assert.rejects(f.service.command({ ...actors.author, email: 'pending@example.test' }, input), { code: 'AUTH_REQUIRED' })
    await assert.rejects(f.service.command({ ...actors.author, role: 'manager' }, input), { code: 'AUTH_REQUIRED' })
    if (type !== 'request-deletion') {
      for (const actor of [actors.author, actors.owner, actors.contributor]) await assert.rejects(f.service.command(actor, input), forbidden)
    }
  }
  assert.equal((await f.stored())[0].revision, requested.revision)
})

test('deletion requests require bounded reasons, notify current leaders only and deduplicate pending requester email', async t => {
  const f = await fixture(t)
  const item = await f.create()
  f.setDirectory({ people: people.filter(person => person.role !== 'creator'), teams })
  const before = await f.stored()
  for (const message of [undefined, '', ' ', null, 'bad\u0000reason', 'x'.repeat(1001)]) {
    await assert.rejects(f.command(actors.owner, 'request-deletion', item.id, { message }), invalid)
  }
  await assert.rejects(f.command(actors.owner, 'request-deletion', item.id, { message: 'Duplicate', requestedBy: actors.author.email }), invalid)
  assert.deepEqual(await f.stored(), before)
  const input = request('request-deletion', { caseId: item.id, message: '  Duplicate proposal  ' })
  const requested = await f.service.command(actors.owner, input)
  const record = requested.deletionRequests[0]
  assert.deepEqual(record, { id: record.id, requestedBy: actors.owner.email, requestedByName: people[1].fullName, requestedAt: new Date(NOW).toISOString(), message: 'Duplicate proposal', status: 'pending' })
  assert.equal(requested.history.at(-1).type, 'request-deletion')
  assert.deepEqual(requested.notifications, [])
  assert.deepEqual((await f.stored())[0].notifications.map(current => [current.type, current.recipientEmail]), [['request-deletion', actors.leader.email]])
  assert.deepEqual(await f.other.command(actors.owner, input), requested)
  const persisted = await f.stored()
  await assert.rejects(f.command({ ...actors.owner, email: 'OWNER@example.test' }, 'request-deletion', item.id, { message: 'Again' }), conflict)
  assert.deepEqual(await f.stored(), persisted)
  await assert.rejects(f.other.command(actors.author, input), reuse)
  await assert.rejects(f.other.command(actors.owner, { ...input, message: 'Changed' }), reuse)
  const second = await f.command(actors.author, 'request-deletion', item.id, { message: 'My reason' })
  assert.equal(second.deletionRequests.length, 2)
  f.setDirectory({ people: people.map(({ email, fullName, teamCode }) => ({ email, fullName, teamCode })), teams })
  const noRoles = await f.command(actors.contributor, 'request-deletion', item.id, { message: 'Another reason' })
  assert.equal(noRoles.notifications.length, 0)
  assert.equal((await f.stored())[0].notifications.length, 2)
})

test('leaders reject pending deletion requests with feedback and users may resubmit with retry-safe receipts', async t => {
  const f = await fixture(t)
  const item = await f.create()
  const input = request('request-deletion', { caseId: item.id, message: 'Looks duplicated' })
  const requested = await f.service.command(actors.author, input)
  const requestId = requested.deletionRequests[0].id
  for (const fields of [{ requestId }, { requestId, message: '' }, { requestId, message: 'x'.repeat(1001) }, { requestId: 'unknown', message: 'Needed' }]) {
    await assert.rejects(f.command(actors.leader, 'reject-deletion', item.id, fields), invalid)
  }
  const rejectInput = request('reject-deletion', { caseId: item.id, expectedRevision: requested.revision, requestId, message: 'Different shift requirements' })
  const rejected = await f.service.command(actors.creator, rejectInput)
  assert.deepEqual(rejected.deletionRequests[0], { ...requested.deletionRequests[0], status: 'rejected', reviewedBy: actors.creator.email, reviewedAt: new Date(NOW).toISOString(), reviewMessage: rejectInput.message })
  assert.equal(rejected.status, requested.status)
  const authorView = (await f.other.snapshot(actors.author)).cases[0]
  assert.deepEqual(authorView.notifications.map(current => [current.type, current.message]), [['reject-deletion', rejectInput.message]])
  assert.deepEqual((await f.other.snapshot(actors.owner)).cases[0].notifications, [])
  const before = await f.stored()
  await assert.rejects(f.command(actors.leader, 'reject-deletion', item.id, { requestId, message: 'Again' }), conflict)
  assert.deepEqual(await f.stored(), before)
  assert.deepEqual(await f.other.command(actors.author, input), authorView)
  assert.deepEqual(await f.other.command(actors.creator, rejectInput), rejected)
  const resubmitted = await f.command(actors.author, 'request-deletion', item.id, { message: 'New evidence' })
  assert.equal(resubmitted.deletionRequests.length, 2)
  assert.equal(resubmitted.deletionRequests[1].status, 'pending')
  const notificationId = authorView.notifications[0].id
  const acknowledged = await f.command(actors.author, 'acknowledge', item.id, { notificationId })
  assert.equal(acknowledged.notifications[0].readAt, new Date(NOW).toISOString())
})

test('competing deletion requests preserve different requesters and allow only one pending request per email', async t => {
  const f = await fixture(t)
  const item = await f.create()
  const input = request('request-deletion', { caseId: item.id, message: 'One request' })
  const results = await Promise.all([f.service.command(actors.author, input), f.other.command(actors.author, input)])
  assert.equal(results[0].deletionRequests[0].id, results[1].deletionRequests[0].id)
  const otherItem = await f.create()
  const competing = await Promise.allSettled([
    f.service.command(actors.owner, request('request-deletion', { caseId: otherItem.id, message: 'First request' })),
    f.other.command(actors.owner, request('request-deletion', { caseId: otherItem.id, message: 'Second request' })),
  ])
  assert.equal(competing.filter(current => current.status === 'fulfilled').length, 1)
  assert.equal(competing.find(current => current.status === 'rejected').reason.code, conflict.code)
  await Promise.all([
    f.service.command(actors.owner, request('request-deletion', { caseId: item.id, message: 'Owner reason' })),
    f.other.command(actors.contributor, request('request-deletion', { caseId: item.id, message: 'Contributor reason' })),
  ])
  const stored = (await f.stored()).find(current => current.id === item.id)
  assert.equal(stored.deletionRequests.length, 3)
  assert.equal(stored.notifications.filter(current => current.type === 'request-deletion').length, 6)
  assert.equal(stored.history.filter(current => current.type === 'request-deletion').length, 3)
})

test('new guarded commands require valid revisions and reject stale forms before any reservation', async t => {
  const f = await fixture(t)
  const item = await f.create()
  const requested = await f.command(actors.author, 'request-deletion', item.id, { message: 'Duplicate' })
  const fields = { 'set-deadlines': { feedbackDueDate: '' }, delete: { message: 'Duplicate confirmed' }, 'reject-deletion': { requestId: requested.deletionRequests[0].id, message: 'Keep it' } }
  for (const [type, payload] of Object.entries(fields)) {
    const before = await f.stored()
    for (const expectedRevision of [undefined, null, 0, -1, 1.5, '2', true, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(f.service.command(actors.leader, request(type, { caseId: item.id, ...payload, expectedRevision })), invalid)
    }
    await assert.rejects(f.service.command(actors.leader, request(type, { caseId: item.id, ...payload })), invalid)
    await assert.rejects(f.command(actors.leader, type, item.id, { ...payload, expectedRevision: item.revision }), conflict)
    assert.deepEqual(await f.stored(), before)
  }
})

test('new guarded operation claims resume only at the original revision and keep replay receipts actor-bound', async t => {
  const f = await fixture(t)
  for (const type of ['set-deadlines', 'reject-deletion', 'delete']) {
    for (const interveningChange of [false, true]) {
      const item = await f.create()
      const requested = await f.command(actors.author, 'request-deletion', item.id, { message: 'Duplicate' })
      const fields = type === 'set-deadlines' ? { feedbackDueDate: '2026-10-07' }
        : type === 'delete' ? { message: 'Duplicate confirmed' }
          : { requestId: requested.deletionRequests[0].id, message: 'Still relevant' }
      const input = request(type, { caseId: item.id, expectedRevision: requested.revision, ...fields })
      const publicBefore = (await f.other.snapshot(actors.leader)).cases.find(current => current.id === item.id)
      const update = f.store.updateAsync
      const interception = t.mock.method(f.store, 'updateAsync', async (key, operation) => {
        const result = await update(key, operation)
        if (operation.op === 'compareAndSet') throw Object.assign(new Error('Interrupted after durable claim'), { code: 'EIO' })
        return result
      })
      await assert.rejects(f.service.command(actors.leader, input), { code: 'EIO' })
      interception.mock.restore()
      const pending = (await f.stored()).find(current => current.id === item.id)
      assert.equal(pending.revision, requested.revision)
      assert.equal(pending.history.at(-1).type, 'operation-reserved')
      assert.deepEqual((await f.other.snapshot(actors.leader)).cases.find(current => current.id === item.id), publicBefore)
      await assert.rejects(f.other.command(actors.creator, input), reuse)
      await assert.rejects(f.other.command(actors.leader, { ...input, expectedRevision: requested.revision + 1 }), reuse)
      if (interveningChange) {
        await f.command(actors.author, 'comment', item.id, { message: 'Intervening change' })
        const before = await f.stored()
        await assert.rejects(f.other.command(actors.leader, input), conflict)
        assert.deepEqual(await f.stored(), before)
      } else {
        const resumed = await f.other.command(actors.leader, input)
        assert.equal(resumed.revision, requested.revision + 1)
        assert.equal(resumed.history.filter(current => current.operationId === input.operationId).length, 1)
        if (type !== 'delete') await f.command(actors.author, 'comment', item.id, { message: 'Later actual change' })
        const before = await f.stored()
        const replay = await f.service.command(actors.leader, input)
        assert.equal(replay.revision, resumed.revision + (type === 'delete' ? 0 : 1))
        assert.ok(replay.history.every(current => current.type !== 'operation-reserved' && !Object.hasOwn(current, 'fingerprint')))
        assert.ok(replay.notifications.every(current => current.recipientEmail === actors.leader.email))
        assert.deepEqual(await f.stored(), before)
        if (type === 'delete') assert.equal(replay.deletedAt, resumed.deletedAt)
      }
    }
  }
})

test('new guarded commands fail on a real competing write without changing deadlines, reviews or visibility', async t => {
  const f = await fixture(t)
  for (const type of ['set-deadlines', 'reject-deletion', 'delete']) {
    const item = await f.create()
    const requested = await f.command(actors.author, 'request-deletion', item.id, { message: 'Duplicate' })
    const fields = type === 'set-deadlines' ? { feedbackDueDate: '2026-10-07' }
      : type === 'delete' ? { message: 'Duplicate confirmed' }
        : { requestId: requested.deletionRequests[0].id, message: 'Still relevant' }
    const input = request(type, { caseId: item.id, expectedRevision: requested.revision, ...fields })
    const update = f.store.updateAsync
    let replacements = 0
    const interception = t.mock.method(f.store, 'updateAsync', async (key, operation) => {
      if (operation.op === 'replaceItem') {
        replacements++
        await f.other.command(actors.owner, request('comment', { caseId: item.id, message: 'Competing comment' }))
      }
      return update(key, operation)
    })
    await assert.rejects(f.service.command(actors.leader, input), conflict)
    interception.mock.restore()
    assert.equal(replacements, 1)
    const stored = (await f.stored()).find(current => current.id === item.id)
    assert.equal(stored.revision, requested.revision + 1)
    assert.equal(Object.hasOwn(stored, 'feedbackDueDate'), false)
    assert.equal(Object.hasOwn(stored, 'deletedAt'), false)
    assert.equal(stored.deletionRequests[0].status, 'pending')
    assert.equal(stored.history.filter(current => current.type === type).length, 0)
    assert.ok((await f.other.snapshot(actors.author)).cases.some(current => current.id === item.id))
  }
})

test('competing deadline edits, request reviews and deletions each commit one displayed revision winner', async t => {
  const f = await fixture(t)
  for (const type of ['set-deadlines', 'reject-deletion', 'delete']) {
    const item = await f.create()
    const requested = await f.command(actors.author, 'request-deletion', item.id, { message: 'Duplicate' })
    const fields = type === 'set-deadlines' ? { feedbackDueDate: '2026-10-07' }
      : type === 'delete' ? { message: 'Duplicate confirmed' }
        : { requestId: requested.deletionRequests[0].id, message: 'Still relevant' }
    const input = request(type, { caseId: item.id, expectedRevision: requested.revision, ...fields })
    const results = await Promise.allSettled([
      f.service.command(actors.leader, input),
      f.other.command(actors.creator, request(type, { caseId: item.id, expectedRevision: requested.revision, ...fields })),
    ])
    assert.equal(results.filter(current => current.status === 'fulfilled').length, 1)
    assert.equal(results.find(current => current.status === 'rejected').reason.code, type === 'delete' ? notFound.code : conflict.code)
    const stored = (await f.stored()).find(current => current.id === item.id)
    assert.equal(stored.revision, requested.revision + 1)
    assert.equal(stored.history.filter(current => current.type === type).length, 1)
  }
})

test('interrupted additive deletion requests reauthorize after competing deletion without resurrecting a case', async t => {
  const f = await fixture(t)
  const item = await f.create()
  const input = request('request-deletion', { caseId: item.id, message: 'Late request' })
  const update = f.store.updateAsync
  const interception = t.mock.method(f.store, 'updateAsync', async (key, operation) => {
    const result = await update(key, operation)
    if (operation.op === 'compareAndSet') throw Object.assign(new Error('Interrupted request claim'), { code: 'EIO' })
    return result
  })
  await assert.rejects(f.service.command(actors.author, input), { code: 'EIO' })
  interception.mock.restore()
  const deleted = await f.command(actors.leader, 'delete', item.id, { message: 'Already duplicated' })
  const before = await f.stored()
  await assert.rejects(f.other.command(actors.author, input), notFound)
  assert.deepEqual(await f.stored(), before)
  assert.equal(Object.hasOwn(deleted, 'deletionRequests'), false)
  assert.ok(deleted.history.every(current => current.type !== 'operation-reserved'))
  assert.deepEqual((await f.other.snapshot(actors.author)).cases, [])
})

test('an additive deletion request retries a real competing comment and persists its leader notifications once', async t => {
  const f = await fixture(t)
  const item = await f.create()
  const input = request('request-deletion', { caseId: item.id, message: 'Duplicate proposal' })
  const update = f.store.updateAsync
  let replacements = 0
  t.mock.method(f.store, 'updateAsync', async (key, operation) => {
    if (operation.op === 'replaceItem' && ++replacements === 1) {
      await f.other.command(actors.owner, request('comment', { caseId: item.id, message: 'Concurrent actual comment' }))
    }
    return update(key, operation)
  })
  const result = await f.service.command(actors.author, input)
  assert.equal(replacements, 2)
  assert.equal(result.revision, item.revision + 2)
  assert.equal(result.deletionRequests.length, 1)
  assert.equal(result.history.filter(current => current.type === 'request-deletion').length, 1)
  assert.equal(result.history.filter(current => current.type === 'comment').length, 1)
  assert.deepEqual(result.notifications, [])
  const stored = (await f.stored())[0]
  assert.deepEqual(stored.notifications.map(current => current.recipientEmail).sort(), [actors.creator.email, actors.leader.email].sort())
  assert.deepEqual(await f.other.command(actors.author, input), result)
})

test('leaders delete every state with a reason, retain history and approve only pending requests', async t => {
  const f = await fixture(t)
  for (const status of ['new', 'assessment', 'planned', 'in-progress', 'testing', 'ready-for-approval', 'completed', 'on-hold', 'declined']) {
    const item = await atStatus(f, status)
    for (const message of [undefined, '', ' ', null, 'x'.repeat(1001)]) await assert.rejects(f.command(actors.leader, 'delete', item.id, { message }), invalid)
    const first = await f.command(actors.author, 'request-deletion', item.id, { message: 'First reason' })
    await f.command(actors.creator, 'reject-deletion', item.id, { requestId: first.deletionRequests[0].id, message: 'Initially retained' })
    await f.command(actors.author, 'request-deletion', item.id, { message: 'Updated reason' })
    const requested = await f.command(actors.owner, 'request-deletion', item.id, { message: 'Also duplicated' })
    const before = (await f.stored()).find(current => current.id === item.id)
    const input = request('delete', { caseId: item.id, expectedRevision: requested.revision, message: '  Duplicate confirmed  ' })
    const actor = status === 'completed' ? actors.creator : actors.leader
    const deleted = await f.service.command(actor, input)
    assert.equal(deleted.status, status)
    assert.equal(deleted.deletedBy, actor.email)
    assert.equal(deleted.deletedAt, new Date(NOW).toISOString())
    assert.equal(deleted.deletionReason, 'Duplicate confirmed')
    assert.equal(deleted.revision, before.revision + 1)
    assert.deepEqual(deleted.deletionRequests[0], before.deletionRequests[0])
    for (const record of deleted.deletionRequests.slice(1)) {
      assert.equal(record.status, 'approved')
      assert.equal(record.reviewedBy, actor.email)
      assert.equal(record.reviewedAt, deleted.deletedAt)
      assert.equal(record.reviewMessage, deleted.deletionReason)
    }
    const stored = (await f.stored()).find(current => current.id === item.id)
    assert.deepEqual(stored.history.slice(0, -1), before.history)
    assert.deepEqual(stored.notifications, before.notifications)
    assert.equal(stored.history.at(-1).type, 'delete')
    assert.match(stored.history.at(-1).fingerprint, /^[a-f0-9]{64}$/)
    assert.equal(stored.history.at(-1).operationId, input.operationId)
    for (const reader of Object.values(actors)) assert.ok(!(await f.other.snapshot(reader)).cases.some(current => current.id === item.id))
    assert.deepEqual(await f.other.command(actor, input), deleted)
    await assert.rejects(f.other.command(actors.owner, input), reuse)
    await assert.rejects(f.other.command(actor, { ...input, message: 'Changed' }), reuse)
  }
})

test('deleted cases deny all fresh commands and stale notification routes but committed receipts replay scoped tombstones', async t => {
  const f = await fixture(t)
  const createInput = request('create', suggestion)
  const item = await f.service.command(actors.author, createInput)
  const inviteInput = request('invite', { caseId: item.id, expectedRevision: item.revision, email: actors.owner.email, kind: 'contributor' })
  const invited = await f.service.command(actors.leader, inviteInput)
  const ownerView = (await f.other.snapshot(actors.owner)).cases[0]
  const ackInput = request('acknowledge', { caseId: item.id, notificationId: ownerView.notifications[0].id })
  await f.service.command(actors.owner, ackInput)
  const commentInput = request('comment', { caseId: item.id, message: 'Before deleting' })
  await f.service.command(actors.author, commentInput)
  const deleted = await f.command(actors.leader, 'delete', item.id, { message: 'Duplicate' })
  const fields = {
    comment: { message: 'Stale' }, invite: { email: actors.contributor.email, kind: 'contributor' },
    respond: { assignmentId: invited.assignments.at(-1).id, accept: true }, update: { priority: 'high' },
    submit: {}, approve: {}, return: { message: 'Stale' }, acknowledge: { notificationId: ownerView.notifications[0].id },
    'set-deadlines': { feedbackDueDate: '' }, 'request-deletion': { message: 'Stale' },
    'reject-deletion': { requestId: 'stale-request', message: 'Stale' }, delete: { message: 'Again' },
  }
  const before = await f.stored()
  for (const [type, payload] of Object.entries(fields)) {
    for (const actor of [actors.author, actors.owner, actors.leader]) {
      await assert.rejects(f.command(actor, type, item.id, { ...payload, ...(revisionCommands.includes(type) ? { expectedRevision: item.revision } : {}) }), notFound)
    }
  }
  for (const [actor, input] of [[actors.author, createInput], [actors.leader, inviteInput], [actors.author, commentInput], [actors.owner, ackInput]]) {
    const replay = await f.other.command(actor, input)
    assert.equal(replay.deletedAt, deleted.deletedAt)
    assert.equal(replay.revision, deleted.revision)
    assert.ok(replay.notifications.every(current => current.recipientEmail === actor.email))
    assert.ok(replay.history.every(current => !Object.hasOwn(current, 'fingerprint') && current.type !== 'operation-reserved'))
    await assert.rejects(f.other.command(actors.contributor, input), reuse)
  }
  assert.deepEqual(await f.stored(), before)
})

test('legacy records omit optional fields and new optional records project only validated public keys', async t => {
  const f = await fixture(t)
  const item = await assigned(f)
  for (const value of [item, (await f.other.snapshot(actors.owner)).cases[0]]) {
    for (const field of ['feedbackDueDate', 'deletionRequests', 'deletedAt', 'deletedBy', 'deletionReason']) assert.equal(Object.hasOwn(value, field), false)
    assert.equal(Object.hasOwn(value.assignments[0], 'responseDueDate'), false)
  }
  await f.command(actors.leader, 'set-deadlines', item.id, { feedbackDueDate: '2026-10-07' })
  const requested = await f.command(actors.owner, 'request-deletion', item.id, { message: 'Duplicate' })
  const stored = (await f.stored())[0]
  stored.assignments[0].internal = 'private'
  stored.deletionRequests[0].fingerprint = 'private'
  stored.deletionRequests[0].internal = 'private'
  stored.internal = 'private'
  await f.store.setAsync(KEY, [stored])
  const projected = (await f.other.snapshot(actors.author)).cases[0]
  assert.equal(projected.feedbackDueDate, '2026-10-07')
  assert.deepEqual(projected.deletionRequests, requested.deletionRequests)
  assert.equal(Object.hasOwn(projected.assignments[0], 'internal'), false)
  assert.equal(Object.hasOwn(projected, 'internal'), false)
  projected.deletionRequests[0].message = 'Mutated locally'
  assert.equal((await f.stored())[0].deletionRequests[0].message, 'Duplicate')
})

test('malformed optional stored data fails closed on snapshot and mutation without resetting records', async t => {
  const f = await fixture(t)
  const item = await f.create()
  const invited = await f.command(actors.leader, 'invite', item.id, { email: actors.owner.email, kind: 'owner', responseDueDate: '' })
  const requested = await f.command(actors.author, 'request-deletion', item.id, { message: 'Duplicate' })
  const baseline = (await f.stored())[0]
  const patches = [
    { feedbackDueDate: null }, { feedbackDueDate: '2026-02-30' },
    { assignments: [{ ...baseline.assignments[0], responseDueDate: 123 }] },
    { deletionRequests: null }, { deletionRequests: [{}] },
    { deletionRequests: [{ ...baseline.deletionRequests[0], requestedBy: 'bad' }] },
    { deletionRequests: [{ ...baseline.deletionRequests[0], requestedByName: '' }] },
    { deletionRequests: [{ ...baseline.deletionRequests[0], requestedAt: 'invalid' }] },
    { deletionRequests: [{ ...baseline.deletionRequests[0], message: '' }] },
    { deletionRequests: [{ ...baseline.deletionRequests[0], status: 'unknown' }] },
    { deletionRequests: [{ ...baseline.deletionRequests[0], reviewedBy: 'bad' }] },
    { deletionRequests: [{ ...baseline.deletionRequests[0], reviewedAt: null }] },
    { deletionRequests: [{ ...baseline.deletionRequests[0], reviewMessage: 123 }] },
    { deletionRequests: [baseline.deletionRequests[0], { ...baseline.deletionRequests[0], id: 'another' }] },
    { deletedAt: 'invalid', deletedBy: actors.leader.email, deletionReason: 'Duplicate' },
    { deletedAt: new Date(NOW).toISOString() },
    { deletedAt: new Date(NOW).toISOString(), deletedBy: 'bad', deletionReason: 'Duplicate' },
    { deletedAt: new Date(NOW).toISOString(), deletedBy: actors.leader.email, deletionReason: '' },
    { deletedBy: actors.leader.email }, { deletionReason: 'Duplicate' },
  ]
  for (const patch of patches) {
    const value = [{ ...baseline, ...patch }]
    await f.store.setAsync(KEY, value)
    await assert.rejects(f.other.snapshot(actors.author), { code: 'IMPROVEMENTS_INVALID_DATA' })
    await assert.rejects(f.command(actors.author, 'comment', item.id, { message: 'Do not reset' }), { code: 'IMPROVEMENTS_INVALID_DATA' })
    assert.deepEqual(await f.stored(), value)
  }
  assert.equal(invited.assignments[0].responseDueDate, '')
  assert.equal(requested.deletionRequests[0].status, 'pending')
})

test('snapshot authenticates an approved employee and projects only public directory fields', async t => {
  const fixtureValue = await fixture(t)
  const snapshot = await fixtureValue.service.snapshot({ ...actors.author, fullName: 'Forged', teamCode: 'OPS' })
  assert.deepEqual(snapshot, {
    cases: [], people: people.map(({ email, fullName, teamCode, role }) => ({ email, fullName, teamCode, ...(role === 'creator' ? { invitable: false } : {}) })), teams,
    actor: { email: actors.author.email, fullName: people[0].fullName, teamCode: 'SC', role: 'user' },
  })
  assert.equal(await fixtureValue.stored(), undefined)
  await assert.rejects(fixtureValue.service.snapshot(null), { code: 'AUTH_REQUIRED' })
  await assert.rejects(fixtureValue.service.snapshot({ ...actors.author, email: 'pending@example.test' }), { code: 'AUTH_REQUIRED' })
  await assert.rejects(fixtureValue.service.snapshot({ ...actors.author, role: 'admin' }), { code: 'AUTH_REQUIRED' })
})

test('create constructs every case field from validated input and authoritative identity', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.service.command({ ...actors.author, fullName: 'Forged Name', teamCode: 'OPS' }, request('create', suggestion))
  assert.deepEqual(Object.keys(created).sort(), ['id', 'revision', 'title', 'problem', 'proposal', 'category', 'originTeamCode', 'affectedTeamCodes', 'createdBy', 'createdByName', 'createdAt', 'updatedAt', 'priority', 'status', 'nextAction', 'dueDate', 'assignments', 'history', 'notifications'].sort())
  assert.equal(created.revision, 1)
  assert.equal(created.status, 'new')
  assert.equal(created.priority, 'medium')
  assert.equal(created.createdBy, actors.author.email)
  assert.equal(created.createdByName, people[0].fullName)
  assert.equal(created.originTeamCode, 'SC')
  assert.equal(created.createdAt, new Date(NOW).toISOString())
  assert.deepEqual(created.assignments.map(({ email, kind, status }) => ({ email, kind, status })), [{ email: actors.author.email, kind: 'owner', status: 'accepted' }])
  assert.equal(created.history[0].actorName, people[0].fullName)
  assert.equal(created.history[0].actorEmail, actors.author.email)
  assert.deepEqual((await fixtureValue.stored())[0].id, created.id)
  const raw = await fs.readFile(path.join(fixtureValue.directory, keyToFilename(KEY)), 'utf8')
  assert.ok(!raw.includes(suggestion.title), 'case array is encrypted on disk')
})

test('a new case requires a known, invitable owner and stores nothing otherwise', async t => {
  const fixtureValue = await fixture(t)
  const { ownerEmail, ...withoutOwner } = suggestion
  await assert.rejects(fixtureValue.service.command(actors.author, request('create', withoutOwner)), invalid)
  for (const owner of ['', 'not-an-email', 'pending@example.test', actors.creator.email, 42]) {
    await assert.rejects(fixtureValue.service.command(actors.author, request('create', { ...suggestion, ownerEmail: owner })), invalid)
  }
  assert.equal(await fixtureValue.stored(), undefined)
})

test('choosing another owner at creation sends that person an owner invitation they can accept', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.service.command(actors.author, request('create', { ...suggestion, ownerEmail: actors.owner.email.toUpperCase() }))
  const [assignment] = created.assignments
  assert.deepEqual({ email: assignment.email, name: assignment.name, teamCode: assignment.teamCode, kind: assignment.kind, status: assignment.status, invitedBy: assignment.invitedBy, respondedAt: assignment.respondedAt },
    { email: actors.owner.email, name: people[1].fullName, teamCode: 'OPS', kind: 'owner', status: 'pending', invitedBy: actors.author.email, respondedAt: null })
  assert.deepEqual(created.notifications, [])
  const ownerView = (await fixtureValue.service.snapshot(actors.owner)).cases[0]
  assert.equal(ownerView.notifications.length, 1)
  assert.equal(ownerView.notifications[0].assignmentId, assignment.id)
  await assert.rejects(fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.contributor.email, kind: 'owner' }), conflict)
  const accepted = await fixtureValue.command(actors.owner, 'respond', created.id, { assignmentId: assignment.id, accept: true })
  assert.equal(accepted.assignments[0].status, 'accepted')
})

test('choosing yourself as owner makes you the accepted owner at once without notifications', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.service.command(actors.owner, request('create', { ...suggestion, ownerEmail: actors.owner.email }))
  assert.equal(created.assignments.length, 1)
  assert.equal(created.assignments[0].status, 'accepted')
  assert.equal(created.assignments[0].respondedAt, new Date(NOW).toISOString())
  assert.deepEqual((await fixtureValue.stored())[0].notifications, [])
})

test('all approved teams read all cases', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  assert.equal((await fixtureValue.service.snapshot(actors.owner)).cases[0].id, created.id)
})

test('create rejects forged records, unknown fields, categories, teams and unbounded strings', async t => {
  const fixtureValue = await fixture(t)
  for (const fields of [
    { createdBy: actors.leader.email }, { role: 'manager' }, { actor: actors.leader }, { history: [] },
    { status: 'completed' }, { notifications: [] }, { revision: 9 }, { priority: 'critical' },
    { title: '' }, { title: 'x'.repeat(161) }, { problem: 'x'.repeat(8001) }, { proposal: null },
    { category: '' }, { category: '   ' }, { category: 'x'.repeat(61) }, { category: 'bad\u0007category' }, { category: 42 }, { category: null },
    { affectedTeamCodes: ['UNKNOWN'] }, { affectedTeamCodes: ['SC', 'SC'] },
    { affectedTeamCodes: 'SC' }, { title: 'bad\u0000text' },
  ]) await assert.rejects(fixtureValue.create(actors.author, fields), invalid)
  for (const input of [null, [], request('unknown'), request('create', suggestion, ''), request('create', suggestion, 'x'.repeat(129))]) {
    await assert.rejects(fixtureValue.service.command(actors.author, input), invalid)
  }
  assert.equal(await fixtureValue.stored(), undefined)
})

test('create accepts a custom category, trims and collapses its whitespace, and keeps it readable', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create(actors.author, { category: '  Lager   og  logistik ' })
  assert.equal(created.category, 'Lager og logistik')
  assert.equal((await fixtureValue.stored())[0].category, 'Lager og logistik')
  assert.equal((await fixtureValue.service.snapshot(actors.owner)).cases[0].category, 'Lager og logistik')
  const builtIn = await fixtureValue.create(actors.author, { category: 'automation' })
  assert.equal(builtIn.category, 'automation')
})

test('stored cases with an invalid category are rejected as invalid data', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const stored = await fixtureValue.stored()
  await fixtureValue.store.setAsync(KEY, [{ ...stored[0], category: 'x'.repeat(61) }])
  await assert.rejects(fixtureValue.service.snapshot(actors.author), { code: 'IMPROVEMENTS_INVALID_DATA' })
  await fixtureValue.store.setAsync(KEY, [{ ...stored[0], id: created.id, category: 'Egen kategori' }])
  assert.equal((await fixtureValue.service.snapshot(actors.author)).cases[0].category, 'Egen kategori')
})

test('the creator account is marked as not invitable and cannot be invited', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const snapshot = await fixtureValue.service.snapshot(actors.leader)
  assert.equal(snapshot.people.find(person => person.email === actors.creator.email).invitable, false)
  assert.ok(snapshot.people.filter(person => person.email !== actors.creator.email).every(person => !Object.hasOwn(person, 'invitable')))
  for (const kind of ['owner', 'contributor']) {
    await assert.rejects(fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.creator.email, kind }), invalid)
  }
  assert.deepEqual((await fixtureValue.stored())[0].assignments, [])
})

test('cross-team comments derive their author and are atomically persisted with a revision', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const updated = await fixtureValue.command(actors.owner, 'comment', created.id, { message: 'Works across teams' })
  assert.equal(updated.revision, 2)
  assert.equal(updated.history.at(-1).message, 'Works across teams')
  assert.equal(updated.history.at(-1).actorName, people[1].fullName)
  assert.equal(updated.history.at(-1).at, new Date(NOW).toISOString())
  await assert.rejects(fixtureValue.command(actors.author, 'comment', created.id, { message: 'x', actorEmail: actors.leader.email }), invalid)
  await assert.rejects(fixtureValue.command(actors.author, 'comment', created.id, { message: ' ' }), invalid)
})

test('only leaders invite approved people from any known team and notify the recipient', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  await assert.rejects(fixtureValue.command(actors.author, 'invite', created.id, { email: actors.owner.email, kind: 'owner' }), forbidden)
  await assert.rejects(fixtureValue.command(actors.leader, 'invite', created.id, { email: 'pending@example.test', kind: 'owner' }), invalid)
  await assert.rejects(fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.owner.email, kind: 'manager' }), invalid)
  const invited = await fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.owner.email, kind: 'owner' })
  assert.equal(invited.assignments[0].status, 'pending')
  assert.equal(invited.assignments[0].name, people[1].fullName)
  assert.equal(invited.assignments[0].teamCode, 'OPS')
  assert.equal(invited.assignments[0].invitedBy, actors.leader.email)
  assert.equal(invited.assignments[0].respondedAt, null)
  const notification = (await fixtureValue.stored())[0].notifications[0]
  assert.equal(notification.recipientEmail, actors.owner.email)
  assert.equal(notification.assignmentId, invited.assignments[0].id)
  assert.equal(notification.readAt, null)
  assert.deepEqual(invited.notifications, [])
  assert.equal(invited.history.at(-1).type, 'invite')
})

test('the accepted owner invites contributors to an active case, but never another owner', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const invited = await fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.owner.email, kind: 'owner' })
  await assert.rejects(fixtureValue.command(actors.owner, 'invite', created.id, { email: actors.contributor.email, kind: 'contributor' }), forbidden, 'a pending owner cannot invite yet')
  await fixtureValue.command(actors.owner, 'respond', created.id, { assignmentId: invited.assignments[0].id, accept: true })
  await assert.rejects(fixtureValue.command(actors.owner, 'invite', created.id, { email: actors.contributor.email, kind: 'owner' }), forbidden)
  const helped = await fixtureValue.command(actors.owner, 'invite', created.id, { email: actors.contributor.email, kind: 'contributor' })
  assert.equal(helped.assignments.at(-1).invitedBy, actors.owner.email)
  assert.equal((await fixtureValue.stored())[0].notifications.at(-1).recipientEmail, actors.contributor.email)
  await assert.rejects(fixtureValue.command(actors.author, 'invite', created.id, { email: actors.leader.email, kind: 'contributor' }), forbidden)
})

test('only the pending invitation recipient can accept or decline and the inviting leader is notified', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const invited = await fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.owner.email, kind: 'owner' })
  const assignmentId = invited.assignments[0].id
  await assert.rejects(fixtureValue.command(actors.author, 'respond', created.id, { assignmentId, accept: true }), forbidden)
  await assert.rejects(fixtureValue.command(actors.leader, 'respond', created.id, { assignmentId, accept: true }), forbidden)
  await assert.rejects(fixtureValue.command(actors.owner, 'respond', created.id, { assignmentId, accept: 'true' }), invalid)
  const accepted = await fixtureValue.command(actors.owner, 'respond', created.id, { assignmentId, accept: true })
  assert.equal(accepted.assignments[0].status, 'accepted')
  assert.equal(accepted.assignments[0].respondedAt, new Date(NOW).toISOString())
  assert.equal((await fixtureValue.stored())[0].notifications.at(-1).recipientEmail, actors.leader.email)
  assert.ok(accepted.notifications.every(item => item.recipientEmail === actors.owner.email))
  await assert.rejects(fixtureValue.command(actors.owner, 'respond', created.id, { assignmentId, accept: false }), forbidden)
})

test('declining leaves no owner and allows a different approved owner invitation', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const invited = await fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.owner.email, kind: 'owner' })
  const declined = await fixtureValue.command(actors.owner, 'respond', created.id, { assignmentId: invited.assignments[0].id, accept: false })
  assert.equal(declined.assignments[0].status, 'declined')
  const next = await fixtureValue.command(actors.creator, 'invite', created.id, { email: actors.contributor.email, kind: 'owner' })
  assert.equal(next.assignments.at(-1).status, 'pending')
})

test('pending and accepted owners prevent conflicting invitations without replacing responsibility', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const invited = await fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.owner.email, kind: 'owner' })
  const conflict = { code: 'IMPROVEMENTS_CONFLICT' }
  await assert.rejects(fixtureValue.command(actors.creator, 'invite', created.id, { email: actors.contributor.email, kind: 'owner' }), conflict)
  await fixtureValue.command(actors.owner, 'respond', created.id, { assignmentId: invited.assignments[0].id, accept: true })
  await assert.rejects(fixtureValue.command(actors.creator, 'invite', created.id, { email: actors.contributor.email, kind: 'owner' }), conflict)
  assert.equal((await fixtureValue.stored())[0].assignments.length, 1)
})

test('pending assignees cannot update progress or submit and leaders do not inherit assignment powers', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  await fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.owner.email, kind: 'owner' })
  for (const actor of [actors.author, actors.owner, actors.leader, actors.creator]) {
    await assert.rejects(fixtureValue.command(actor, 'update', created.id, { status: 'in-progress' }), forbidden)
    await assert.rejects(fixtureValue.command(actor, 'update', created.id, { nextAction: 'Do the work' }), forbidden)
    await assert.rejects(fixtureValue.command(actor, 'submit', created.id), forbidden)
  }
})

test('accepted contributors can update progress but only the accepted owner submits', async t => {
  const fixtureValue = await fixture(t)
  const created = await assigned(fixtureValue, 'contributor', actors.contributor)
  await fixtureValue.command(actors.contributor, 'update', created.id, { status: 'in-progress' })
  const updated = await fixtureValue.command(actors.contributor, 'update', created.id, { status: 'testing', nextAction: 'Verify checklist', dueDate: '2028-02-29' })
  assert.equal(updated.status, 'testing')
  assert.equal(updated.dueDate, '2028-02-29')
  await assert.rejects(fixtureValue.command(actors.contributor, 'submit', created.id), forbidden)
  await assert.rejects(fixtureValue.command(actors.contributor, 'update', created.id, { priority: 'high' }), forbidden)
})

test('leaders prioritize and plan but hold and decline need a relevant reason', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  let updated = await fixtureValue.command(actors.leader, 'update', created.id, { priority: 'critical', status: 'assessment' })
  assert.equal(updated.priority, 'critical')
  updated = await fixtureValue.command(actors.creator, 'update', created.id, { status: 'planned' })
  assert.equal(updated.status, 'planned')
  for (const status of ['on-hold', 'declined']) {
    await assert.rejects(fixtureValue.command(actors.leader, 'update', created.id, { status }), invalid)
    updated = await fixtureValue.command(actors.leader, 'update', created.id, { status, message: 'Awaiting budget decision' })
    assert.equal(updated.history.at(-1).message, 'Awaiting budget decision')
  }
})

test('updates reject approval bypasses, invalid enums, empty updates and noncalendar dates', async t => {
  const fixtureValue = await fixture(t)
  const created = await assigned(fixtureValue)
  for (const fields of [
    { status: 'ready-for-approval' }, { status: 'completed' }, { status: 'unknown' }, { priority: 'urgent' },
    { dueDate: '2026-02-29' }, { dueDate: '2026-04-31' }, { dueDate: '2026-1-01' }, { dueDate: 123 },
    { dueDate: '0000-01-01' }, { nextAction: 'x'.repeat(2001) }, {}, { status: 'testing', assignments: [] },
  ]) await assert.rejects(fixtureValue.command(actors.owner, 'update', created.id, fields), invalid)
  const cleared = await fixtureValue.command(actors.owner, 'update', created.id, { dueDate: '', nextAction: '' })
  assert.equal(cleared.dueDate, '')
})

test('owner submission notifies only current known leaders and directory roles stay private', async t => {
  const fixtureValue = await fixture(t)
  const created = await assigned(fixtureValue)
  await fixtureValue.command(actors.owner, 'update', created.id, { status: 'in-progress' })
  fixtureValue.setDirectory({ people: people.filter(person => person.role !== 'creator'), teams })
  const submitted = await fixtureValue.command(actors.owner, 'submit', created.id)
  assert.equal(submitted.status, 'ready-for-approval')
  assert.deepEqual((await fixtureValue.stored())[0].notifications.filter(item => item.type === 'submit').map(item => item.recipientEmail), [actors.leader.email])
  assert.deepEqual(submitted.notifications.filter(item => item.type === 'submit'), [])
  assert.ok((await fixtureValue.service.snapshot(actors.owner)).people.every(person => !Object.hasOwn(person, 'role')))
  await assert.rejects(fixtureValue.command(actors.owner, 'update', created.id, { status: 'testing' }), forbidden)
})

test('a directory without role metadata never invents review recipients', async t => {
  const fixtureValue = await fixture(t)
  const created = await assigned(fixtureValue)
  await fixtureValue.command(actors.owner, 'update', created.id, { status: 'in-progress' })
  fixtureValue.setDirectory({ people: people.map(({ email, fullName, teamCode }) => ({ email, fullName, teamCode })), teams })
  const submitted = await fixtureValue.command(actors.owner, 'submit', created.id)
  assert.equal(submitted.status, 'ready-for-approval')
  assert.deepEqual(submitted.notifications.filter(item => item.type === 'submit'), [])
})

test('leader approval requires ready state and notifies the accepted owner atomically', async t => {
  const fixtureValue = await fixture(t)
  const created = await assigned(fixtureValue)
  await assert.rejects(fixtureValue.command(actors.leader, 'approve', created.id), forbidden)
  await fixtureValue.command(actors.owner, 'update', created.id, { status: 'in-progress' })
  await fixtureValue.command(actors.owner, 'submit', created.id)
  await assert.rejects(fixtureValue.command(actors.owner, 'approve', created.id), forbidden)
  const approved = await fixtureValue.command(actors.creator, 'approve', created.id)
  assert.equal(approved.status, 'completed')
  const notification = (await fixtureValue.stored())[0].notifications.at(-1)
  assert.equal(notification.recipientEmail, actors.owner.email)
  assert.equal(notification.type, 'approve')
  assert.ok(approved.notifications.every(item => item.recipientEmail === actors.creator.email))
  assert.equal(approved.history.at(-1).actorName, people[4].fullName)
  await assert.rejects(fixtureValue.command(actors.owner, 'submit', created.id), forbidden)
  await assert.rejects(fixtureValue.command(actors.leader, 'update', created.id, { status: 'planned' }), forbidden)
})

test('leader return requires feedback and goes to in-progress with an owner notification', async t => {
  const fixtureValue = await fixture(t)
  const created = await ready(fixtureValue)
  await assert.rejects(fixtureValue.command(actors.leader, 'return', created.id), invalid)
  await assert.rejects(fixtureValue.command(actors.owner, 'return', created.id, { message: 'More testing' }), forbidden)
  const returned = await fixtureValue.command(actors.leader, 'return', created.id, { message: 'Test the night handover' })
  assert.equal(returned.status, 'in-progress')
  assert.equal(returned.history.at(-1).message, 'Test the night handover')
  assert.equal((await fixtureValue.stored())[0].notifications.at(-1).recipientEmail, actors.owner.email)
  assert.ok(returned.notifications.every(item => item.recipientEmail === actors.leader.email))
  await assert.rejects(fixtureValue.command(actors.leader, 'return', created.id, { message: 'Again' }), forbidden)
})

test('notifications are recipient-scoped and acknowledgement is recipient-only and idempotent', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const invited = await fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.owner.email, kind: 'owner' })
  const notificationId = (await fixtureValue.stored())[0].notifications[0].id
  assert.deepEqual(invited.notifications, [])
  assert.deepEqual((await fixtureValue.service.snapshot(actors.author)).cases[0].notifications, [])
  await assert.rejects(fixtureValue.command(actors.author, 'acknowledge', created.id, { notificationId }), forbidden)
  const input = request('acknowledge', { caseId: created.id, notificationId })
  const acknowledged = await fixtureValue.service.command(actors.owner, input)
  assert.equal(acknowledged.id, created.id)
  assert.equal(acknowledged.notifications[0].readAt, new Date(NOW).toISOString())
  assert.equal(Object.hasOwn(acknowledged, 'cases'), false)
  assert.deepEqual(await fixtureValue.other.command(actors.owner, input), acknowledged)
  assert.equal((await fixtureValue.stored())[0].revision, 3)
})

test('operation retries survive reopen and reject changed payload, actor, case or command type', async t => {
  const fixtureValue = await fixture(t)
  const input = request('create', suggestion)
  const created = await fixtureValue.service.command(actors.author, input)
  const replay = await fixtureValue.other.command(actors.author, { ...suggestion, type: 'create', operationId: input.operationId })
  assert.equal(replay.id, created.id)
  assert.equal((await fixtureValue.stored()).length, 1)
  await assert.rejects(fixtureValue.other.command(actors.author, { ...input, title: 'Different' }), reuse)
  await assert.rejects(fixtureValue.other.command(actors.owner, input), reuse)
  const second = await fixtureValue.create()
  const comment = request('comment', { caseId: created.id, message: 'Once' })
  await fixtureValue.service.command(actors.owner, comment)
  await fixtureValue.other.command(actors.owner, comment)
  await assert.rejects(fixtureValue.other.command(actors.owner, { ...comment, caseId: second.id }), reuse)
  await assert.rejects(fixtureValue.other.command(actors.author, request('comment', { caseId: created.id, message: 'Reuse create' }, input.operationId)), reuse)
  const stored = await fixtureValue.stored()
  assert.equal(stored[0].history.filter(item => item.operationId === comment.operationId).length, 1)
  assert.match(stored[0].history.at(-1).fingerprint, /^[a-f0-9]{64}$/)
  assert.ok((await fixtureValue.service.snapshot(actors.owner)).cases[0].history.every(item => !Object.hasOwn(item, 'fingerprint')))
})

test('simultaneous create retries produce one case and independent creates preserve both', async t => {
  const fixtureValue = await fixture(t)
  const input = request('create', suggestion)
  const same = await Promise.all([fixtureValue.service.command(actors.author, input), fixtureValue.other.command(actors.author, input)])
  assert.equal(same[0].id, same[1].id)
  await Promise.all([fixtureValue.create(), fixtureValue.other.command(actors.owner, request('create', suggestion))])
  assert.equal((await fixtureValue.stored()).length, 3)
})

test('two independently opened services preserve simultaneous comments without overwriting other cases', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const second = await fixtureValue.create()
  await Promise.all([
    fixtureValue.service.command(actors.author, request('comment', { caseId: created.id, message: 'First comment' })),
    fixtureValue.other.command(actors.owner, request('comment', { caseId: created.id, message: 'Second comment' })),
  ])
  const stored = await fixtureValue.stored()
  assert.deepEqual(stored[0].history.filter(item => item.type === 'comment').map(item => item.message).sort(), ['First comment', 'Second comment'])
  assert.equal(stored[0].revision, 3)
  assert.equal(stored[1].revision, second.revision)
})

test('simultaneous conflicting operation reuse across different cases has exactly one winner', async t => {
  const fixtureValue = await fixture(t)
  const first = await fixtureValue.create()
  const second = await fixtureValue.create()
  const operationId = crypto.randomUUID()
  const results = await Promise.allSettled([
    fixtureValue.service.command(actors.author, request('comment', { caseId: first.id, message: 'First' }, operationId)),
    fixtureValue.other.command(actors.author, request('comment', { caseId: second.id, message: 'Second' }, operationId)),
  ])
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(results.find(item => item.status === 'rejected').reason.code, reuse.code)
  assert.equal((await fixtureValue.stored()).flatMap(item => item.history).filter(item => item.operationId === operationId).length, 1)
})

test('simultaneous invitation accept retries persist one response and conflicting responses cannot win twice', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const invited = await fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.owner.email, kind: 'owner' })
  const input = request('respond', { caseId: created.id, assignmentId: invited.assignments[0].id, accept: true })
  await Promise.all([fixtureValue.service.command(actors.owner, input), fixtureValue.other.command(actors.owner, input)])
  let stored = (await fixtureValue.stored())[0]
  assert.equal(stored.history.filter(item => item.type === 'respond').length, 1)
  assert.equal(stored.notifications.filter(item => item.type === 'respond').length, 1)
  const next = await fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.contributor.email, kind: 'contributor' })
  const assignmentId = next.assignments.at(-1).id
  const results = await Promise.allSettled([
    fixtureValue.service.command(actors.contributor, request('respond', { caseId: created.id, assignmentId, accept: true })),
    fixtureValue.other.command(actors.contributor, request('respond', { caseId: created.id, assignmentId, accept: false })),
  ])
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  stored = (await fixtureValue.stored())[0]
  assert.equal(stored.history.filter(item => item.type === 'respond').length, 2)
})

test('simultaneous approval retries are idempotent and approval versus return rechecks the fresh state', async t => {
  const fixtureValue = await fixture(t)
  const created = await ready(fixtureValue)
  const input = request('approve', { caseId: created.id, expectedRevision: created.revision })
  await Promise.all([fixtureValue.service.command(actors.leader, input), fixtureValue.other.command(actors.leader, input)])
  assert.equal((await fixtureValue.stored())[0].history.filter(item => item.type === 'approve').length, 1)
  const second = await ready(fixtureValue)
  const results = await Promise.allSettled([
    fixtureValue.service.command(actors.leader, request('approve', { caseId: second.id, expectedRevision: second.revision })),
    fixtureValue.other.command(actors.creator, request('return', { caseId: second.id, expectedRevision: second.revision, message: 'Need evidence' })),
  ])
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(results.find(item => item.status === 'rejected').reason.code, conflict.code)
})

test('directory membership is refreshed before writes and pending or removed accounts cannot operate', async t => {
  let calls = 0
  let current = structuredClone({ people, teams })
  const fixtureValue = await fixture(t, { getDirectory: () => {
    calls++
    return calls >= 2 ? { people: people.filter(person => person.email !== actors.author.email), teams } : current
  } })
  await assert.rejects(fixtureValue.create(), { code: 'AUTH_REQUIRED' })
  assert.equal(await fixtureValue.stored(), undefined)
  const independent = await fixture(t)
  independent.setDirectory({ people: people.filter(person => person.email !== actors.owner.email), teams })
  await assert.rejects(independent.service.command(actors.owner, request('create', suggestion)), { code: 'AUTH_REQUIRED' })
  current = null
})

test('untrusted directory data or malformed stored values fail closed rather than resetting shared cases', async t => {
  const fixtureValue = await fixture(t)
  for (const value of [null, { retained: true }, ['invalid case']]) {
    await fixtureValue.store.setAsync(KEY, value)
    await assert.rejects(fixtureValue.create(), { code: 'IMPROVEMENTS_INVALID_DATA' })
    assert.deepEqual(await fixtureValue.stored(), value)
  }
  await fixtureValue.store.deleteAsync(KEY)
  fixtureValue.setDirectory({ people: [...people, { email: 'pending@example.test', fullName: 'Pending', teamCode: 'UNKNOWN' }], teams })
  await assert.rejects(fixtureValue.create(), { code: 'IMPROVEMENTS_DIRECTORY' })
  assert.equal(await fixtureValue.stored(), undefined)
})

test('history capacity fails closed without pruning retry markers and change callbacks run only after mutations', async t => {
  let changes = 0
  const fixtureValue = await fixture(t, { onChanged: () => { changes++; throw new Error('Subscriber failed') } })
  const input = request('create', suggestion)
  const created = await fixtureValue.service.command(actors.author, input)
  assert.equal(changes, 1)
  await fixtureValue.other.command(actors.author, input)
  assert.equal(changes, 1)
  const stored = (await fixtureValue.stored())[0]
  const original = stored.history[0]
  stored.history = [original, ...Array.from({ length: 511 }, () => ({
    id: crypto.randomUUID(), type: 'comment', actorEmail: actors.author.email, actorName: people[0].fullName,
    at: new Date(NOW).toISOString(), message: 'Historical entry', operationId: crypto.randomUUID(), fingerprint: 'a'.repeat(64),
  }))]
  await fixtureValue.store.setAsync(KEY, [stored])
  await assert.rejects(fixtureValue.command(actors.author, 'comment', created.id, { message: 'Too much history' }), { code: 'IMPROVEMENTS_HISTORY_FULL' })
  assert.equal((await fixtureValue.stored())[0].history[0].operationId, input.operationId)
  assert.equal((await fixtureValue.other.command(actors.author, input)).id, created.id)
  assert.equal(changes, 1)
})

test('a persisted operation claim survives an interrupted write and resumes safely from another service', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const input = request('comment', { caseId: created.id, message: 'Resume after lost response' })
  const update = fixtureValue.store.updateAsync
  const interception = t.mock.method(fixtureValue.store, 'updateAsync', async (key, operation) => {
    const result = await update(key, operation)
    if (operation.op === 'compareAndSet') throw Object.assign(new Error('Lost response after durable claim'), { code: 'EIO' })
    return result
  })
  await assert.rejects(fixtureValue.service.command(actors.author, input), { code: 'EIO' })
  const pending = (await fixtureValue.stored())[0]
  assert.equal(pending.revision, 1)
  assert.equal(pending.history.at(-1).type, 'operation-reserved')
  const publicSnapshot = await fixtureValue.other.snapshot(actors.author)
  assert.equal(publicSnapshot.cases[0].history.length, 1)
  publicSnapshot.cases[0].history = []
  assert.equal((await fixtureValue.stored())[0].history.length, 2)
  await assert.rejects(fixtureValue.other.command(actors.author, { ...input, message: 'Changed retry' }), reuse)
  interception.mock.restore()
  const resumed = await fixtureValue.other.command(actors.author, input)
  assert.equal(resumed.revision, 2)
  assert.equal(resumed.history.filter(entry => entry.operationId === input.operationId).length, 1)
  assert.equal((await fixtureValue.service.command(actors.author, input)).revision, 2)
})

test('CAS retries stop after three real competing writes and leave a recoverable operation without lost comments', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const input = request('comment', { caseId: created.id, message: 'My eventual comment' })
  const update = fixtureValue.store.updateAsync
  let replacements = 0
  const interception = t.mock.method(fixtureValue.store, 'updateAsync', async (key, operation) => {
    assert.equal(key, KEY)
    if (operation.op === 'replaceItem') {
      replacements++
      await fixtureValue.other.command(actors.owner, request('comment', { caseId: created.id, message: `Competing comment ${replacements}` }))
    } else assert.equal(operation.op, 'compareAndSet')
    return update(key, operation)
  })
  await assert.rejects(fixtureValue.service.command(actors.author, input), { code: 'KV_CONFLICT' })
  assert.equal(replacements, 3)
  const snapshot = await fixtureValue.other.snapshot(actors.author)
  assert.equal(snapshot.cases[0].revision, 4)
  assert.equal(snapshot.cases[0].history.filter(entry => entry.type === 'comment').length, 3)
  interception.mock.restore()
  const resumed = await fixtureValue.other.command(actors.author, input)
  assert.equal(resumed.revision, 5)
  assert.equal(resumed.history.filter(entry => entry.type === 'comment').length, 4)
})

test('commands capture input before asynchronous work and reject nonfinite clocks and pending directory records', async t => {
  let release
  let block = false
  const gate = new Promise(resolve => { release = resolve })
  const fixtureValue = await fixture(t, { getDirectory: async () => {
    if (block) await gate
    return { people, teams }
  } })
  const created = await fixtureValue.create()
  const actor = structuredClone(actors.author)
  const input = request('comment', { caseId: created.id, message: 'Captured message' })
  block = true
  const pending = fixtureValue.service.command(actor, input)
  input.message = 'Changed during directory read'
  actor.role = 'manager'
  release()
  const result = await pending
  assert.equal(result.history.at(-1).message, 'Captured message')
  const badClock = await fixture(t, { now: () => Infinity })
  await assert.rejects(badClock.create(), invalid)
  assert.equal(await badClock.stored(), undefined)
  badClock.setDirectory({ people: [...people, { email: 'pending@example.test', fullName: 'Pending Person', teamCode: 'SC', status: 'pending' }], teams })
  await assert.rejects(badClock.create(), { code: 'IMPROVEMENTS_DIRECTORY' })
})

test('employees can report a mandatory title and problem without a known proposal', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create(actors.author, { proposal: '' })
  assert.equal(created.proposal, '')
  assert.equal((await fixtureValue.other.snapshot(actors.author)).cases[0].proposal, '')
  for (const fields of [{ title: ' ' }, { problem: '' }]) await assert.rejects(fixtureValue.create(actors.author, { proposal: '', ...fields }), invalid)
})

test('guarded commands require a positive safe integer displayed revision', async t => {
  const fixtureValue = await fixture(t)
  const created = await fixtureValue.create()
  const fields = {
    invite: { email: actors.owner.email, kind: 'owner' }, update: { priority: 'high' },
    submit: {}, approve: {}, return: { message: 'Need evidence' },
  }
  for (const type of Object.keys(fields)) {
    const payload = { caseId: created.id, ...fields[type] }
    await assert.rejects(fixtureValue.service.command(actors.leader, request(type, payload)), invalid)
    for (const expectedRevision of [undefined, null, 0, -1, 1.5, '1', true, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(fixtureValue.service.command(actors.leader, request(type, { ...payload, expectedRevision })), invalid)
    }
  }
  assert.deepEqual((await fixtureValue.stored())[0].history.map(entry => entry.type), ['create'])
})

test('every guarded command rejects an explicit stale displayed revision before reserving it', async t => {
  const fixtureValue = await fixture(t)
  const fields = { invite: { email: actors.contributor.email, kind: 'contributor' }, update: { priority: 'high' }, submit: {}, approve: {}, return: { message: 'Need evidence' } }
  for (const type of Object.keys(fields)) {
    const item = await atStatus(fixtureValue, ['approve', 'return'].includes(type) ? 'ready-for-approval' : 'in-progress')
    await fixtureValue.command(actors.author, 'comment', item.id, { message: 'Changed after form was displayed' })
    const before = await fixtureValue.stored()
    await assert.rejects(fixtureValue.command(type === 'submit' ? actors.owner : actors.leader, type, item.id, { ...fields[type], expectedRevision: item.revision }), conflict)
    assert.deepEqual(await fixtureValue.stored(), before)
  }
})

test('committed guarded receipts replay after revisions change but remain bound to actor and payload', async t => {
  const fixtureValue = await fixture(t)
  const fields = { invite: { email: actors.contributor.email, kind: 'contributor' }, update: { priority: 'high' }, submit: {}, approve: { message: 'Verified result' }, return: { message: 'Need evidence' } }
  for (const type of Object.keys(fields)) {
    const item = await atStatus(fixtureValue, ['approve', 'return'].includes(type) ? 'ready-for-approval' : 'in-progress')
    const actor = type === 'submit' ? actors.owner : actors.leader
    const input = request(type, { caseId: item.id, expectedRevision: item.revision, ...fields[type] })
    await fixtureValue.service.command(actor, input)
    await fixtureValue.command(actors.author, 'comment', item.id, { message: 'A later actual change' })
    const before = await fixtureValue.stored()
    const result = await fixtureValue.other.command(actor, input)
    assert.equal(result.id, item.id)
    assert.equal(result.history.filter(entry => entry.operationId === input.operationId).length, 1)
    assert.deepEqual(result, (await fixtureValue.other.snapshot(actor)).cases.find(current => current.id === item.id))
    assert.deepEqual(await fixtureValue.stored(), before)
    await assert.rejects(fixtureValue.other.command(actor, { ...input, expectedRevision: item.revision + 1 }), reuse)
    await assert.rejects(fixtureValue.other.command(actors.creator, input), reuse)
  }
})

test('a guarded reservation keeps the displayed revision valid until an actual change invalidates it', async t => {
  const fixtureValue = await fixture(t)
  const fields = { invite: { email: actors.contributor.email, kind: 'contributor' }, update: { priority: 'high' }, submit: {}, approve: {}, return: { message: 'Need evidence' } }
  for (const type of Object.keys(fields)) {
    for (const interveningChange of [false, true]) {
      const item = await atStatus(fixtureValue, ['approve', 'return'].includes(type) ? 'ready-for-approval' : 'in-progress')
      const actor = type === 'submit' ? actors.owner : actors.leader
      const input = request(type, { caseId: item.id, expectedRevision: item.revision, ...fields[type] })
      const publicBefore = (await fixtureValue.other.snapshot(actor)).cases.find(current => current.id === item.id)
      const update = fixtureValue.store.updateAsync
      const interception = t.mock.method(fixtureValue.store, 'updateAsync', async (key, operation) => {
        const result = await update(key, operation)
        if (operation.op === 'compareAndSet') throw Object.assign(new Error('Interrupted after claim'), { code: 'EIO' })
        return result
      })
      await assert.rejects(fixtureValue.service.command(actor, input), { code: 'EIO' })
      interception.mock.restore()
      const pending = (await fixtureValue.stored()).find(current => current.id === item.id)
      assert.equal(pending.revision, item.revision)
      assert.equal(pending.updatedAt, item.updatedAt)
      assert.equal(pending.history.at(-1).type, 'operation-reserved')
      assert.deepEqual((await fixtureValue.other.snapshot(actor)).cases.find(current => current.id === item.id), publicBefore)
      await assert.rejects(fixtureValue.other.command(actors.creator, input), reuse)
      if (interveningChange) {
        await fixtureValue.command(actors.author, 'comment', item.id, { message: 'Intervening actual mutation' })
        const before = await fixtureValue.stored()
        await assert.rejects(fixtureValue.other.command(actor, input), conflict)
        assert.deepEqual(await fixtureValue.stored(), before)
      } else {
        const resumed = await fixtureValue.other.command(actor, input)
        assert.equal(resumed.revision, item.revision + 1)
        assert.equal(resumed.history.at(-1).type, type)
      }
    }
  }
})

test('a real competing write invalidates a guarded CAS instead of autosquashing a stale update', async t => {
  const fixtureValue = await fixture(t)
  const item = await fixtureValue.create()
  const input = request('update', { caseId: item.id, expectedRevision: item.revision, priority: 'critical' })
  const update = fixtureValue.store.updateAsync
  let replacements = 0
  t.mock.method(fixtureValue.store, 'updateAsync', async (key, operation) => {
    if (operation.op === 'replaceItem') {
      replacements++
      await fixtureValue.other.command(actors.author, request('comment', { caseId: item.id, message: 'Concurrent actual mutation' }))
    }
    return update(key, operation)
  })
  await assert.rejects(fixtureValue.service.command(actors.leader, input), conflict)
  assert.equal(replacements, 1)
  const stored = (await fixtureValue.stored())[0]
  assert.equal(stored.revision, item.revision + 1)
  assert.equal(stored.priority, 'medium')
  assert.equal(stored.history.at(-1).message, 'Concurrent actual mutation')
})

test('accepted assignees and unassigned leaders obey every generic status transition', async t => {
  const fixtureValue = await fixture(t)
  const statuses = ['new', 'assessment', 'planned', 'in-progress', 'testing', 'ready-for-approval', 'completed', 'on-hold', 'declined']
  const early = ['new', 'assessment', 'planned']
  const frozen = ['ready-for-approval', 'completed', 'declined']
  for (const actor of [actors.owner, actors.leader]) {
    for (const from of statuses) {
      const item = await atStatus(fixtureValue, from)
      const baseline = await fixtureValue.stored()
      for (const to of statuses) {
        const payload = { status: to, ...(['on-hold', 'declined'].includes(to) ? { message: 'Required reason' } : {}) }
        const allowed = !frozen.includes(from) && (actor === actors.owner
          ? (early.includes(from) && to === 'in-progress') || (from === 'in-progress' && to === 'testing') || (from === 'testing' && to === 'in-progress')
          : (['assessment', 'planned'].includes(to) && [...early, 'on-hold'].includes(from)) || ['on-hold', 'declined'].includes(to))
        if (allowed) {
          assert.equal((await fixtureValue.command(actor, 'update', item.id, payload)).status, to, `${actor.role}: ${from} -> ${to}`)
          await fixtureValue.store.setAsync(KEY, baseline)
        } else {
          await assert.rejects(fixtureValue.command(actor, 'update', item.id, payload), ['new', 'ready-for-approval', 'completed'].includes(to) ? invalid : forbidden, `${actor.role}: ${from} -> ${to}`)
          assert.deepEqual(await fixtureValue.stored(), baseline)
        }
      }
    }
  }
})

test('accepted owners submit only from in-progress or testing and only leaders review ready cases', async t => {
  const fixtureValue = await fixture(t)
  for (const status of ['new', 'assessment', 'planned', 'in-progress', 'testing', 'ready-for-approval', 'completed', 'on-hold', 'declined']) {
    const item = await atStatus(fixtureValue, status)
    const baseline = await fixtureValue.stored()
    if (['in-progress', 'testing'].includes(status)) {
      assert.equal((await fixtureValue.command(actors.owner, 'submit', item.id)).status, 'ready-for-approval')
      await fixtureValue.store.setAsync(KEY, baseline)
    } else await assert.rejects(fixtureValue.command(actors.owner, 'submit', item.id), forbidden)
    await assert.rejects(fixtureValue.command(actors.leader, 'submit', item.id), forbidden)
    for (const type of ['approve', 'return']) {
      const fields = type === 'return' ? { message: 'Need evidence' } : {}
      await assert.rejects(fixtureValue.command(actors.owner, type, item.id, fields), forbidden)
      if (status === 'ready-for-approval') {
        assert.equal((await fixtureValue.command(actors.leader, type, item.id, fields)).status, type === 'approve' ? 'completed' : 'in-progress')
        await fixtureValue.store.setAsync(KEY, baseline)
      } else await assert.rejects(fixtureValue.command(actors.leader, type, item.id, fields), forbidden)
    }
  }
})

test('ready and final cases freeze every update and invitation but allow comments and own acknowledgements', async t => {
  const fixtureValue = await fixture(t)
  for (const status of ['ready-for-approval', 'completed', 'declined']) {
    const item = await atStatus(fixtureValue, status, true)
    const pending = item.assignments.find(assignment => assignment.email === actors.contributor.email)
    const baseline = await fixtureValue.stored()
    for (const actor of [actors.owner, actors.leader]) {
      for (const fields of [{ priority: 'high' }, { nextAction: 'Override' }, { dueDate: '2026-10-05' }, { dueDate: '' }, { status: 'planned' }, { status: 'on-hold', message: 'Override review' }, { status: 'declined', message: 'Override review' }]) {
        await assert.rejects(fixtureValue.command(actor, 'update', item.id, fields), forbidden)
      }
    }
    await assert.rejects(fixtureValue.command(actors.leader, 'invite', item.id, { email: actors.author.email, kind: 'contributor' }), forbidden)
    for (const accept of [true, false]) await assert.rejects(fixtureValue.command(actors.contributor, 'respond', item.id, { assignmentId: pending.id, accept }), forbidden)
    assert.deepEqual(await fixtureValue.stored(), baseline)
    const commented = await fixtureValue.command(actors.author, 'comment', item.id, { message: 'Final follow-up' })
    assert.equal(commented.status, status)
    const notificationId = item.notifications[0].id
    const input = request('acknowledge', { caseId: item.id, notificationId })
    const acknowledged = await fixtureValue.service.command(actors.owner, input)
    assert.equal(acknowledged.status, status)
    assert.equal(acknowledged.notifications.find(notification => notification.id === notificationId).readAt, new Date(NOW).toISOString())
    assert.deepEqual(await fixtureValue.other.command(actors.owner, input), acknowledged)
  }
})

test('pending additive responses reauthorize after a real status change instead of accepting a frozen invitation', async t => {
  const fixtureValue = await fixture(t)
  for (const status of ['ready-for-approval', 'completed', 'declined']) {
    const item = await atStatus(fixtureValue, 'in-progress', true)
    const assignment = item.assignments.find(current => current.email === actors.contributor.email)
    const input = request('respond', { caseId: item.id, assignmentId: assignment.id, accept: true })
    const update = fixtureValue.store.updateAsync
    const interception = t.mock.method(fixtureValue.store, 'updateAsync', async (key, operation) => {
      const result = await update(key, operation)
      if (operation.op === 'compareAndSet') throw Object.assign(new Error('Interrupted after response claim'), { code: 'EIO' })
      return result
    })
    await assert.rejects(fixtureValue.service.command(actors.contributor, input), { code: 'EIO' })
    interception.mock.restore()
    if (status === 'declined') await fixtureValue.command(actors.leader, 'update', item.id, { status, message: 'Budget declined' })
    else {
      await fixtureValue.command(actors.owner, 'submit', item.id)
      if (status === 'completed') await fixtureValue.command(actors.leader, 'approve', item.id)
    }
    await assert.rejects(fixtureValue.other.command(actors.contributor, input), forbidden)
    const stored = (await fixtureValue.stored()).find(current => current.id === item.id)
    assert.equal(stored.assignments.find(current => current.id === assignment.id).status, 'pending')
  }
})

test('approval result messages persist in immutable actor history and due dates explicitly clear', async t => {
  const fixtureValue = await fixture(t)
  const item = await atStatus(fixtureValue, 'in-progress')
  await fixtureValue.command(actors.owner, 'update', item.id, { dueDate: '2026-10-05' })
  const cleared = await fixtureValue.command(actors.owner, 'update', item.id, { dueDate: '' })
  assert.equal(cleared.dueDate, '')
  await fixtureValue.command(actors.owner, 'submit', item.id)
  const before = (await fixtureValue.stored())[0].history
  const approved = await fixtureValue.command(actors.leader, 'approve', item.id, { message: 'Night handover verified' })
  assert.equal(approved.history.at(-1).message, 'Night handover verified')
  assert.equal(approved.history.at(-1).actorEmail, actors.leader.email)
  assert.equal(approved.history.at(-1).actorName, people[3].fullName)
  assert.deepEqual((await fixtureValue.stored())[0].history.slice(0, -1), before)
})

test('public notification rows have only contract keys and never expose another recipient or internal metadata', async t => {
  const fixtureValue = await fixture(t)
  const item = await ready(fixtureValue)
  const stored = (await fixtureValue.stored())[0]
  for (const notification of stored.notifications) Object.assign(notification, { fingerprint: 'private', internal: 'private', recipient: actors.author.email, at: 'legacy' })
  await fixtureValue.store.setAsync(KEY, [stored])
  const assertPublic = (item, actor) => {
    assert.ok(item.history.every(entry => entry.type !== 'operation-reserved' && !Object.hasOwn(entry, 'fingerprint')))
    for (const notification of item.notifications) {
      assert.equal(notification.recipientEmail, actor.email)
      assert.deepEqual(Object.keys(notification).sort(), ['id', 'type', 'recipientEmail', 'createdAt', 'message', 'readAt', ...(notification.assignmentId ? ['assignmentId'] : [])].sort())
    }
  }
  for (const actor of Object.values(actors)) assertPublic((await fixtureValue.other.snapshot(actor)).cases[0], actor)
  const notificationId = stored.notifications.find(notification => notification.recipientEmail === actors.leader.email).id
  const input = request('acknowledge', { caseId: item.id, notificationId })
  assertPublic(await fixtureValue.service.command(actors.leader, input), actors.leader)
  assertPublic(await fixtureValue.other.command(actors.leader, input), actors.leader)
  assertPublic(await fixtureValue.command(actors.owner, 'comment', item.id, { message: 'Public result' }), actors.owner)
})

test('additive responses and acknowledgements retry fresh CAS while preserving concurrent comments', async t => {
  const fixtureValue = await fixture(t)
  for (const type of ['respond', 'acknowledge']) {
    const created = await fixtureValue.create()
    await fixtureValue.command(actors.leader, 'invite', created.id, { email: actors.owner.email, kind: 'owner' })
    const item = (await fixtureValue.other.snapshot(actors.owner)).cases.find(current => current.id === created.id)
    const fields = type === 'respond' ? { assignmentId: item.assignments[0].id, accept: true } : { notificationId: item.notifications[0].id }
    const input = request(type, { caseId: item.id, ...fields })
    const update = fixtureValue.store.updateAsync
    let replacements = 0
    const interception = t.mock.method(fixtureValue.store, 'updateAsync', async (key, operation) => {
      if (operation.op === 'replaceItem' && ++replacements === 1) {
        await fixtureValue.other.command(actors.author, request('comment', { caseId: item.id, message: 'Concurrent additive comment' }))
      }
      return update(key, operation)
    })
    const result = await fixtureValue.service.command(actors.owner, input)
    interception.mock.restore()
    assert.equal(replacements, 2)
    assert.equal(result.id, item.id)
    assert.equal(Object.hasOwn(result, 'cases'), false)
    assert.equal(result.revision, item.revision + 2)
    assert.equal(result.history.filter(entry => entry.type === type).length, 1)
    assert.equal(result.history.filter(entry => entry.message === 'Concurrent additive comment').length, 1)
    if (type === 'respond') assert.equal(result.assignments[0].status, 'accepted')
    else assert.equal(result.notifications[0].readAt, new Date(NOW).toISOString())
    assert.deepEqual(await fixtureValue.other.command(actors.owner, input), result)
  }
})

test('reservation-only CAS contention preserves displayed revisions and bounded domain conflicts are recoverable', async t => {
  const fixtureValue = await fixture(t)
  for (const collisions of [1, 3]) {
    const item = await fixtureValue.create()
    const input = request('update', { caseId: item.id, expectedRevision: item.revision, priority: 'high' })
    const otherUpdate = fixtureValue.otherStore.updateAsync
    const competitor = t.mock.method(fixtureValue.otherStore, 'updateAsync', async (key, operation) => {
      const result = await otherUpdate(key, operation)
      if (operation.op === 'compareAndSet') throw Object.assign(new Error('Interrupted competing reservation'), { code: 'EIO' })
      return result
    })
    const update = fixtureValue.store.updateAsync
    let replacements = 0
    const interception = t.mock.method(fixtureValue.store, 'updateAsync', async (key, operation) => {
      if (operation.op === 'replaceItem' && ++replacements <= collisions) {
        await assert.rejects(fixtureValue.other.command(actors.author, request('comment', { caseId: item.id, message: `Reserved competitor ${replacements}` })), { code: 'EIO' })
      }
      return update(key, operation)
    })
    if (collisions === 3) await assert.rejects(fixtureValue.service.command(actors.leader, input), conflict)
    else assert.equal((await fixtureValue.service.command(actors.leader, input)).priority, 'high')
    interception.mock.restore()
    competitor.mock.restore()
    assert.equal(replacements, collisions === 3 ? 3 : 2)
    const pending = (await fixtureValue.stored()).find(current => current.id === item.id)
    assert.equal(pending.revision, item.revision + (collisions === 3 ? 0 : 1))
    assert.ok((await fixtureValue.other.snapshot(actors.leader)).cases.find(current => current.id === item.id).history.every(entry => entry.type !== 'operation-reserved'))
    const resumed = await fixtureValue.other.command(actors.leader, input)
    assert.equal(resumed.priority, 'high')
    assert.equal(resumed.revision, item.revision + 1)
    assert.equal(resumed.history.filter(entry => entry.operationId === input.operationId).length, 1)
  }
})