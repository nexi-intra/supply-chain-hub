const test = require('node:test')
const assert = require('node:assert/strict')
const { SPOTS, danishParts, nisseDays, spotFor, startsAt } = require('./nisse.cjs')

test('the nisse hides on weekdays from 1 to 24 December', () => {
  const days = nisseDays(2026)
  assert.equal(days.length, 18)
  assert.equal(days[0], '2026-12-01')
  assert.equal(days[days.length - 1], '2026-12-24')
  assert.equal(days.includes('2026-12-05'), false)
  assert.equal(days.includes('2026-12-06'), false)
})

test('10:00 is Danish time in winter and summer', () => {
  assert.equal(danishParts(Date.parse('2026-12-01T09:00:00Z')).hour, 10)
  assert.equal(danishParts(Date.parse('2026-07-01T08:00:00Z')).hour, 10)
  assert.deepEqual(
    (({ year, month, day, weekday, date }) => ({ year, month, day, weekday, date }))(danishParts(Date.parse('2026-12-01T23:30:00Z'))),
    { year: 2026, month: 12, day: 2, weekday: 3, date: '2026-12-02' },
  )
  assert.equal(startsAt('2026-12-01'), Date.parse('2026-12-01T09:00:00Z'))
})

test('there are 24 places in three bands of eight', () => {
  assert.equal(SPOTS.easy.length, 8)
  assert.equal(SPOTS.medium.length, 8)
  assert.equal(SPOTS.hard.length, 8)
  assert.equal(new Set([...SPOTS.easy, ...SPOTS.medium, ...SPOTS.hard]).size, 24)
})

test('every hub uses a new place each day and it gets harder towards Christmas', () => {
  const days = nisseDays(2026)
  for (let hub = 0; hub < 8; hub++) {
    const spots = days.map(day => spotFor(day, hub))
    assert.equal(new Set(spots).size, spots.length)
    spots.forEach((spot, i) => {
      const band = i < 6 ? SPOTS.easy : i < 12 ? SPOTS.medium : SPOTS.hard
      assert.ok(band.includes(spot), `${days[i]} hub ${hub}: ${spot}`)
    })
  }
})

test('two hubs never share a place on the same day', () => {
  for (const day of nisseDays(2026)) {
    const spots = Array.from({ length: 8 }, (_, hub) => spotFor(day, hub))
    assert.equal(new Set(spots).size, 8, day)
  }
})

test('no nisse on weekends or outside December', () => {
  assert.equal(spotFor('2026-12-05', 0), null)
  assert.equal(spotFor('2026-11-30', 0), null)
  assert.equal(spotFor('2026-12-28', 0), null)
})

test('the order changes from year to year', () => {
  const order = year => nisseDays(year).map(day => spotFor(day, 0)).join()
  assert.notEqual(order(2026), order(2027))
})
