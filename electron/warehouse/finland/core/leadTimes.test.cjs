const test = require('node:test')
const assert = require('node:assert/strict')
const { LEAD_TIMES, leadDays } = require('./leadTimes.cjs')

test('hovedstadsområdet og mistet nul foran', () => {
  assert.equal(leadDays('Postnord', '00100'), 2)
  assert.equal(leadDays('DHL', '100'), 1)
  assert.equal(leadDays('DHL', 100), 1)
})

test('Åland vinder over 20000 til 25999', () => {
  assert.equal(leadDays('Postnord', '22100'), 3)
  assert.equal(leadDays('DHL', '22100'), 2)
  assert.equal(leadDays('Postnord', '21100'), 2)
  assert.equal(leadDays('DHL', '21100'), 1)
})

test('Lapland og nord', () => {
  assert.equal(leadDays('Postnord', '96100'), 4)
  assert.equal(leadDays('DHL', '96100'), 3)
})

test('rækker markeret forslag er med', () => {
  assert.equal(leadDays('Postnord', '93600'), 3)
  assert.equal(leadDays('DHL', '05800'), 1)
  assert.equal(leadDays('Postnord', '59100'), 2)
})

test('ukendt kurer eller postnummer giver null', () => {
  assert.equal(leadDays('DSV', '00100'), null)
  assert.equal(leadDays('Postnord', 'abc'), null)
  assert.equal(leadDays('Postnord', ''), null)
  assert.equal(leadDays('Postnord', null), null)
  assert.equal(leadDays('Postnord', '00050'), null)
  assert.equal(leadDays('Postnord', '123456'), null)
})

test('tabellen kan rettes som data', () => {
  const row = LEAD_TIMES.find((r) => r.from === 95000)
  const saved = row.Postnord
  row.Postnord = 5
  try {
    assert.equal(leadDays('Postnord', '96100'), 5)
  } finally {
    row.Postnord = saved
  }
})
