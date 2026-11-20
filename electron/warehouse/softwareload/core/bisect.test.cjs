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
