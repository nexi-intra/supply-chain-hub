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

const systemic = message => Object.assign(new Error(message), { code: 'SYSTEMIC' })

test('with the systemic policy a group SAP refuses for one shared reason stops after two single serials fail the same way', async () => {
  const items = Array.from({ length: 200 }, (_, i) => `S${i}`)
  const calls = []
  const refuseAll = async group => { calls.push(group); return { ok: false, message: 'No authorization for plant D301' } }
  await assert.rejects(bisect(items, refuseAll, undefined, { systemic }), { code: 'SYSTEMIC', message: 'No authorization for plant D301' })
  assert.ok(calls.length <= 4, `${calls.length} calls`)
  assert.deepEqual(calls.map(group => group.length), [200, 1, 1])
  assert.deepEqual([calls[1], calls[2]], [['S0'], ['S199']], 'the first and the last serial are tried alone')
})

test('with the systemic policy one bad serial is still isolated, and a single serial that differs or goes through stops the probing', async () => {
  const saved = []
  const attempt = async items => (items.includes('C') ? { ok: false, message: 'Deficit' } : { ok: true, doc: items.join('') })
  const r = await bisect(['A', 'B', 'C', 'D'], attempt, async entry => { saved.push(entry.items.join('')) }, { systemic })
  assert.deepEqual(r.failed, [{ item: 'C', message: 'Deficit' }])
  assert.deepEqual(r.done.flatMap(entry => entry.items).sort(), ['A', 'B', 'D'])
  assert.deepEqual(saved, ['A', 'B', 'D'])

  const calls = []
  const twoReasons = async items => { calls.push(items.join('')); return items.includes('A') && items.length === 1 ? { ok: false, message: 'Other' } : { ok: false, message: 'Deficit' } }
  const mixed = await bisect(['A', 'B', 'C'], twoReasons, undefined, { systemic })
  assert.deepEqual(mixed.failed.map(entry => entry.item).sort(), ['A', 'B', 'C'], 'a first single serial with another message is no shared reason')
  assert.equal(calls[1], 'A')
  assert.notEqual(calls[2], 'C', 'no second probe after a different message')
})

test('without the policy a group refused for one shared reason is still split all the way', async () => {
  const calls = []
  const r = await bisect(['A', 'B', 'C', 'D'], async items => { calls.push(items.length); return { ok: false, message: 'Same' } })
  assert.equal(r.failed.length, 4)
  assert.deepEqual(calls, [4, 2, 1, 1, 2, 1, 1])
})
