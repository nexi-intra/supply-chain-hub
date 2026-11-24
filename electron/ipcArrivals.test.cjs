const test = require('node:test')
const assert = require('node:assert/strict')
const { createArrivalOrder } = require('./ipcArrivals.cjs')

const tick = () => new Promise(resolve => setImmediate(resolve))

test('a call on an ordered channel waits until every earlier ordered call has let go, never for a later one', async () => {
  const arrivals = createArrivalOrder()
  arrivals.order('warehouse:locations:take')
  arrivals.order('warehouse:locations:move')
  const [first, second, third, read] = [{}, {}, {}, {}]
  arrivals.arrive('warehouse:locations:take', first)
  arrivals.arrive('warehouse:locations:move', second)
  arrivals.arrive('warehouse:locations:list', read)
  arrivals.arrive('warehouse:locations:take', third)
  const went = []
  const go = (name, event) => arrivals.turn(event).then(() => went.push(name))
  void go('third', third)
  void go('second', second)
  void go('read', read)
  await go('first', first)
  await tick()
  assert.deepEqual(went, ['read', 'first'], 'an unordered channel never waits; the first goes at once')
  arrivals.leave(first)
  arrivals.leave(first)
  await tick()
  assert.deepEqual(went, ['read', 'first', 'second'], 'the third still waits for the second')
  arrivals.leave(second)
  await tick()
  assert.deepEqual(went, ['read', 'first', 'second', 'third'])
})

test('a call that never arrived (a test, or a channel registered later) goes at once', async () => {
  const arrivals = createArrivalOrder()
  await arrivals.turn({})
  arrivals.leave({})
  arrivals.order('warehouse:locations:take')
  const late = {}
  arrivals.arrive('warehouse:locations:take', late)
  await arrivals.turn(late)
})
