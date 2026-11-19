const test = require('node:test')
const assert = require('node:assert/strict')
const { createActivityTracker } = require('./mainActivity.cjs')

test('describe lists in-flight labels with their age and the last started label', () => {
  let t = 0
  const tracker = createActivityTracker({ now: () => t })
  tracker.begin('ipc:a')
  t = 100
  const endB = tracker.begin('ipc:b')
  endB()
  t = 500
  const text = tracker.describe()
  assert.match(text, /ipc:a \(500 ms\)/)
  assert.match(text, /sidst startet: ipc:b/)
  assert.doesNotMatch(text, /ipc:b \(/)
})

test('an ended label is not reported twice and end is idempotent', () => {
  const tracker = createActivityTracker({ now: () => 0 })
  const end = tracker.begin('ipc:a')
  end()
  end()
  const text = tracker.describe()
  assert.match(text, /i gang: –/)
  assert.equal(text, 'i gang: – · sidst startet: ipc:a')
})

test('an empty tracker describes nothing in flight', () => {
  assert.equal(createActivityTracker().describe(), 'i gang: – · sidst startet: –')
})

const isKv = label => label.startsWith('ipc:kv:')

test('whenIdle resolves true at once when nothing matching is in flight', async () => {
  const tracker = createActivityTracker()
  tracker.begin('ipc:auth:current')
  assert.equal(await tracker.whenIdle(isKv, 1000), true)
})

test('whenIdle waits for a matching in-flight entry to end', async () => {
  const tracker = createActivityTracker()
  const end = tracker.begin('ipc:kv:set')
  setTimeout(end, 50)
  const started = Date.now()
  assert.equal(await tracker.whenIdle(isKv, 2000), true)
  assert.ok(Date.now() - started >= 40)
})

test('whenIdle also waits for matching entries begun while waiting', async () => {
  const tracker = createActivityTracker()
  const endFirst = tracker.begin('ipc:kv:set')
  let endSecond = null
  setTimeout(() => { endSecond = tracker.begin('ipc:kv:delete'); endFirst() }, 20)
  setTimeout(() => endSecond(), 80)
  let settledAt = null
  const started = Date.now()
  const result = await tracker.whenIdle(isKv, 2000).then(value => { settledAt = Date.now(); return value })
  assert.equal(result, true)
  assert.ok(settledAt - started >= 70)
})

test('whenIdle resolves false on timeout when the entry never ends', async () => {
  const tracker = createActivityTracker()
  tracker.begin('ipc:kv:set')
  assert.equal(await tracker.whenIdle(isKv, 50), false)
})

test('whenIdle ignores in-flight entries that do not match', async () => {
  const tracker = createActivityTracker()
  tracker.begin('ipc:assistant:ask')
  assert.equal(await tracker.whenIdle(isKv, 50), true)
})
