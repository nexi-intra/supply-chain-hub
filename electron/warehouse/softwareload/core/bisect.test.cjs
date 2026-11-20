const test = require('node:test')
const assert = require('node:assert/strict')
const { bisect } = require('./bisect.cjs')

test('all at once when SAP accepts the group', async () => {
  const calls = []
  const r = await bisect(['A', 'B', 'C'], async items => { calls.push(items); return { ok: true, doc: '49' } })
  assert.deepEqual(calls, [['A', 'B', 'C']]); assert.deepEqual(r, { done: [{ items: ['A', 'B', 'C'], doc: '49' }], failed: [] })
})
test('one bad item is isolated and the rest still move', async () => {
  const r = await bisect(['A', 'B', 'C', 'D'], async items => items.includes('C') ? { ok: false, message: 'Deficit' } : { ok: true, doc: items.join('') })
  assert.deepEqual(r.done.flatMap(d => d.items).sort(), ['A', 'B', 'D']); assert.deepEqual(r.failed, [{ item: 'C', message: 'Deficit' }])
})
test('an empty group never calls SAP', async () => {
  const r = await bisect([], async () => { throw new Error('should not be called') })
  assert.deepEqual(r, { done: [], failed: [] })
})
test('an exception (SAP closed) is not swallowed', async () => {
  await assert.rejects(bisect(['A'], async () => { throw Object.assign(new Error('x'), { code: 'SAP_NOT_READY' }) }), { code: 'SAP_NOT_READY' })
})
test('onDone is awaited for each success before the next attempt', async () => {
  const log = []
  const saved = []
  const r = await bisect(
    ['A', 'B', 'C', 'D'],
    async items => { log.push(`attempt ${items.join('')}`); return items.includes('C') ? { ok: false, message: 'Deficit' } : { ok: true, doc: items.join('') } },
    async entry => { await new Promise(resolve => setTimeout(resolve, 5)); log.push(`onDone ${entry.items.join('')}`); saved.push(entry) }
  )
  assert.deepEqual(log, ['attempt ABCD', 'attempt AB', 'onDone AB', 'attempt CD', 'attempt C', 'attempt D', 'onDone D'])
  assert.deepEqual(saved, [{ items: ['A', 'B'], doc: 'AB' }, { items: ['D'], doc: 'D' }])
  assert.deepEqual(r.done, saved)
})
test('results passed to onDone survive an exception later in the run', async () => {
  const saved = []
  const attempt = async items => {
    if (items.length === 4) return { ok: false, message: 'Deficit' }
    if (items[0] === 'A') return { ok: true, doc: '49' }
    throw Object.assign(new Error('x'), { code: 'SAP_NOT_READY' })
  }
  await assert.rejects(bisect(['A', 'B', 'C', 'D'], attempt, async entry => { saved.push(entry) }), { code: 'SAP_NOT_READY' })
  assert.deepEqual(saved, [{ items: ['A', 'B'], doc: '49' }])
})
