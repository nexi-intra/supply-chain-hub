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
