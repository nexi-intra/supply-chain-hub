const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('./store.cjs')
const { purgeStore, scrubBackup, isFinishedEntry, isFinishedNotice } = require('./sickLeaveRetention.cjs')

const TODAY = '2026-10-13'
// The sick dialog stores local midnight as an ISO timestamp, i.e. the evening before in UTC.
const localMidnight = day => new Date(`${day}T00:00:00`).toISOString()

test('a sick leave entry is kept until its last day is over', () => {
  assert.equal(isFinishedEntry({ startDate: '2026-10-12' }, TODAY), true)
  assert.equal(isFinishedEntry({ startDate: '2026-10-13' }, TODAY), false)
  assert.equal(isFinishedEntry({ startDate: localMidnight('2026-10-13') }, TODAY), false, 'local midnight of today is today, not yesterday')
  assert.equal(isFinishedEntry({ startDate: localMidnight('2026-10-12') }, TODAY), true)
  assert.equal(isFinishedEntry({ startDate: '2026-10-10', endDate: '2026-10-14' }, TODAY), false, 'a sick leave over several days lasts to its end date')
  assert.equal(isFinishedEntry({ startDate: '2026-10-10', endDate: '2026-10-12' }, TODAY), true)
  assert.equal(isFinishedEntry({ startDate: '2026-10-15' }, TODAY), false, 'sick leave reported for the coming days stays')
  assert.equal(isFinishedEntry({}, TODAY), true, 'an undated entry is never kept')
})

test('only the automatic sick leave notices from before today are finished', () => {
  assert.equal(isFinishedNotice({ type: 'sick-leave', timestamp: '2026-10-12T08:00:00.000Z' }, TODAY), true)
  assert.equal(isFinishedNotice({ type: 'sick-leave', timestamp: new Date(`${TODAY}T07:00:00`).toISOString() }, TODAY), false)
  assert.equal(isFinishedNotice({ type: 'vacation', timestamp: '2026-01-01T08:00:00.000Z' }, TODAY), false)
  assert.equal(isFinishedNotice({ type: 'email', timestamp: Date.parse('2026-01-01') }, TODAY), false)
})

test('purgeStore deletes finished sick leave and notices in a real store, and leaves everything else alone', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sick-purge-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const store = createStore(dir)
  store.set('sick-leave-entries', [
    { id: 'old', userEmail: 'a@test', startDate: '2026-09-01', status: 'approved', reason: 'OLD_REASON' },
    { id: 'today', userEmail: 'b@test', startDate: localMidnight(TODAY), status: 'approved' },
    { id: 'long', userEmail: 'c@test', startDate: '2026-10-10', endDate: '2026-10-16', status: 'approved' },
    { id: 'next', userEmail: 'd@test', startDate: '2026-10-14', status: 'approved' },
  ])
  store.set('email-notifications', [
    { id: 'n-old', type: 'sick-leave', timestamp: '2026-09-01T08:00:00.000Z', body: 'OLD_REASON' },
    { id: 'n-today', type: 'sick-leave', timestamp: new Date(`${TODAY}T08:00:00`).toISOString() },
    { id: 'mail', type: 'email', timestamp: Date.parse('2026-01-01') },
  ])
  store.set('vacation-entries', [{ id: 'v', startDate: '2026-01-01', endDate: '2026-01-02' }])
  assert.equal(purgeStore(store, TODAY), 2)
  assert.deepEqual(store.get('sick-leave-entries', { skipCache: true }).map(entry => entry.id), ['today', 'long', 'next'])
  assert.deepEqual(store.get('email-notifications', { skipCache: true }).map(entry => entry.id), ['n-today', 'mail'])
  assert.equal(store.get('vacation-entries', { skipCache: true }).length, 1)
  assert.equal(purgeStore(store, TODAY), 0, 'a second run finds nothing')
})

test('purgeStore never takes a lock when there is nothing to delete', () => {
  let mutated = false
  const store = { get: () => [{ id: 'x', startDate: TODAY }], mutate: () => { mutated = true } }
  assert.equal(purgeStore(store, TODAY), 0)
  assert.equal(mutated, false)
})

test('a backup carries no finished sick leave', () => {
  const data = scrubBackup({
    'sick-leave-entries': [{ id: 'old', startDate: '2026-09-01' }, { id: 'today', startDate: TODAY }],
    'email-notifications': [{ id: 'n-old', type: 'sick-leave', timestamp: '2026-09-01T08:00:00.000Z' }, { id: 'mail', type: 'email' }],
    users: { 'a@test': {} },
  }, TODAY)
  assert.deepEqual(data['sick-leave-entries'].map(entry => entry.id), ['today'])
  assert.deepEqual(data['email-notifications'].map(entry => entry.id), ['mail'])
  assert.deepEqual(data.users, { 'a@test': {} })
  assert.equal(JSON.stringify(data).includes('2026-09-01'), false)
})
