const test = require('node:test')
const assert = require('node:assert/strict')
const { isPrivateKey, readView, planWrite } = require('./privateViews.cjs')

const ANNE = { email: 'anne@test', role: 'user' }
const BO = { email: 'bo@test', role: 'user' }
const BOSS = { email: 'boss@test', role: 'manager' }
const code = expected => error => error.code === expected || String(error.message).startsWith(expected)

const mail = (id, from, to, extra = {}) => ({ id, from, to, subject: id, message: 'secret', timestamp: 1, read: false, ...extra })
const MAILS = [mail('a-b', 'anne@test', 'bo@test'), mail('b-a', 'bo@test', 'anne@test'), mail('c-d', 'carl@test', 'dina@test')]

test('only the private keys get a view', () => {
  for (const key of ['emails', 'notebook-notes', 'sick-leave-entries', 'email-notifications']) assert.equal(isPrivateKey(key), true, key)
  for (const key of ['users', 'shift-assignments', 'todos-personal-anne@test']) assert.equal(isPrivateKey(key), false, key)
})

test('messages: you see what you sent and received, nothing else', () => {
  assert.deepEqual(readView('emails', MAILS, ANNE).map(item => item.id), ['a-b', 'b-a'])
  assert.deepEqual(readView('emails', MAILS, { email: 'DINA@test', role: 'manager' }).map(item => item.id), ['c-d'])
  assert.deepEqual(readView('emails', undefined, ANNE), undefined)
})

test('notes: shared notes and your own personal notes', () => {
  const notes = [{ id: 'shared', isPersonal: false, creatorEmail: 'bo@test' }, { id: 'mine', isPersonal: true, creatorEmail: 'anne@test' }, { id: 'his', isPersonal: true, creatorEmail: 'bo@test' }]
  assert.deepEqual(readView('notebook-notes', notes, ANNE).map(item => item.id), ['shared', 'mine'])
})

test('sickness: everyone sees who is away, only the person, the reporter and managers see the note', () => {
  const entries = [{ id: 's1', userEmail: 'bo@test', reason: 'går hjem kl. 12', reportedBy: 'carl@test' }]
  assert.equal(readView('sick-leave-entries', entries, ANNE)[0].reason, undefined)
  assert.equal(readView('sick-leave-entries', entries, ANNE)[0].userEmail, 'bo@test')
  assert.equal(readView('sick-leave-entries', entries, BO)[0].reason, 'går hjem kl. 12')
  assert.equal(readView('sick-leave-entries', entries, { email: 'carl@test', role: 'user' })[0].reason, 'går hjem kl. 12')
  assert.equal(readView('sick-leave-entries', entries, BOSS)[0].reason, 'går hjem kl. 12')
})

test('the notification outbox can be written but never read back', () => {
  assert.deepEqual(readView('email-notifications', [{ id: 'n', body: 'Sygemelding' }], BOSS), [])
  assert.deepEqual(planWrite('email-notifications', { op: 'append', items: [{ id: 'n2' }] }, [], ANNE), { op: 'append', items: [{ id: 'n2' }] })
  assert.throws(() => planWrite('email-notifications', { op: 'remove', ids: ['n'] }, [{ id: 'n' }], BOSS), code('AUTH_FORBIDDEN'))
})

test('append passes through, but a personal note can only be created by its owner', () => {
  const op = { op: 'append', items: [mail('new', 'anne@test', 'bo@test')] }
  assert.deepEqual(planWrite('emails', op, MAILS, ANNE), op)
  assert.throws(() => planWrite('notebook-notes', { op: 'append', items: [{ id: 'x', isPersonal: true, creatorEmail: 'bo@test' }] }, [], ANNE), code('AUTH_FORBIDDEN'))
})

test('upsert and remove only touch records you can see', () => {
  assert.deepEqual(planWrite('emails', { op: 'upsert', items: [{ ...MAILS[1], read: true }] }, MAILS, ANNE), { op: 'upsert', items: [{ ...MAILS[1], read: true }] })
  assert.throws(() => planWrite('emails', { op: 'upsert', items: [{ ...MAILS[2], read: true }] }, MAILS, ANNE), code('AUTH_FORBIDDEN'))
  assert.deepEqual(planWrite('emails', { op: 'remove', ids: ['a-b'] }, MAILS, ANNE), { op: 'remove', ids: ['a-b'] })
  assert.throws(() => planWrite('emails', { op: 'remove', ids: ['c-d'] }, MAILS, ANNE), code('AUTH_FORBIDDEN'))
  assert.throws(() => planWrite('emails', { op: 'upsert', path: ['x'], items: [] }, MAILS, ANNE), code('AUTH_FORBIDDEN'))
})

test('a hidden sickness note survives an edit by someone who cannot see it', () => {
  const stored = [{ id: 's1', userEmail: 'bo@test', reason: 'privat', startDate: '2026-10-14' }]
  const view = readView('sick-leave-entries', stored, ANNE)[0]
  const planned = planWrite('sick-leave-entries', { op: 'replaceItem', id: 's1', expected: view, item: { ...view, startDate: '2026-10-15' } }, stored, ANNE)
  assert.deepEqual(planned, { op: 'replaceItem', id: 's1', expected: stored[0], item: { ...stored[0], startDate: '2026-10-15' } })
  assert.throws(() => planWrite('sick-leave-entries', { op: 'replaceItem', id: 's1', expected: { ...view, startDate: 'old' }, item: view }, stored, ANNE), code('KV_CONFLICT'))
})

test('a whole-list save from your own view becomes one compare-and-set that keeps everybody else\'s records', () => {
  const view = readView('emails', MAILS, ANNE)
  const next = [{ ...view[1], read: true }, mail('new', 'anne@test', 'bo@test')]
  const planned = planWrite('emails', { op: 'compareAndSet', expected: view, value: next }, MAILS, ANNE)
  assert.equal(planned.op, 'compareAndSet')
  assert.deepEqual(planned.expected, MAILS)
  assert.deepEqual(planned.value.map(item => item.id), ['b-a', 'c-d', 'new'])
  assert.equal(planned.value[0].read, true)
  assert.throws(() => planWrite('emails', { op: 'compareAndSet', expected: [], value: next }, MAILS, ANNE), code('KV_CONFLICT'))
  assert.deepEqual(planWrite('emails', { op: 'compareAndSet', expected: [], value: view }, MAILS, ANNE), { op: null })
  assert.throws(() => planWrite('emails', { op: 'set', value: [mail('c-d', 'anne@test', 'bo@test')] }, MAILS, ANNE), code('AUTH_FORBIDDEN'))
  assert.deepEqual(planWrite('emails', { op: 'set', value: [] }, MAILS, ANNE).value.map(item => item.id), ['c-d'])
})

test('field operations are refused on the private lists', () => {
  assert.throws(() => planWrite('emails', { op: 'setField', field: 'x', value: 1 }, MAILS, ANNE), code('AUTH_FORBIDDEN'))
})
