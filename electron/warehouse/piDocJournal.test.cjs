const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createPiDocJournal } = require('./piDocJournal.cjs')

let dirs = 0
/** A folder next to the test (ignored by git as *.local), removed after the test. */
function folder(t) {
  const dir = path.join(__dirname, `.pidoc-journal-test-${process.pid}-${++dirs}.local`)
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('entries are kept encrypted on this PC, listed in the order they were made, and removed', async t => {
  const dir = folder(t)
  const journal = createPiDocJournal(dir)
  const first = journal.nameFor('pidoc')
  const second = journal.nameFor('pidoc')
  await journal.put(second, { team: 'TCD', countId: 'c1', changes: [{ kind: 'step', docId: '105000900' }] })
  await journal.put(first, { team: 'TCD', countId: 'c1', changes: [{ kind: 'created', reference: 'CPREF1' }] })
  const raw = fs.readdirSync(dir).map(name => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n')
  assert.ok(!raw.includes('CPREF1') && !raw.includes('105000900') && raw.includes('"__enc":1'), 'nothing readable on disk')
  assert.deepEqual((await journal.list()).map(item => [item.name, item.entry.changes[0].kind]), [[first, 'created'], [second, 'step']])
  await journal.remove(first)
  assert.deepEqual((await journal.list()).map(item => item.name), [second])
})

test('an entry a running action still writes to M: is left out of the list until it is released', async t => {
  const journal = createPiDocJournal(folder(t))
  const name = journal.nameFor('pidoc')
  journal.hold(name)
  await journal.put(name, { team: 'TCD', countId: 'c1', changes: [] })
  assert.deepEqual(await journal.list(), [])
  journal.release(name)
  assert.equal((await journal.list()).length, 1)
})

test('a fresh journal reads what an earlier run of the app left; without a folder it keeps nothing', async t => {
  const dir = folder(t)
  const name = createPiDocJournal(dir).nameFor('pidoc')
  await createPiDocJournal(dir).put(name, { team: 'TCD', countId: 'c1', changes: [] })
  assert.deepEqual((await createPiDocJournal(dir).list()).map(item => item.entry.countId), ['c1'])
  const none = createPiDocJournal(null)
  await none.put('x', { team: 'TCD' })
  assert.deepEqual(await none.list(), [])
})
