const test = require('node:test')
const assert = require('node:assert/strict')
const { matchesHomeOfficePattern } = require('./homeOfficeRecurrence.cjs')

const date = value => new Date(`${value}T12:00:00`)

test('old weekly patterns remain weekly', () => {
  assert.equal(matchesHomeOfficePattern({ weekdays: [3] }, date('2026-09-23')), true)
  assert.equal(matchesHomeOfficePattern({ weekdays: [3] }, date('2026-09-30')), true)
})

test('two weekdays can have separate two- and three-week intervals', () => {
  const pattern = { weekdays: [3, 4], repeat: {
    3: { intervalWeeks: 2, startDate: '2026-09-23' },
    4: { intervalWeeks: 3, startDate: '2026-09-24' },
  } }
  for (const value of ['2026-09-23', '2026-10-07', '2026-09-24', '2026-10-15']) assert.equal(matchesHomeOfficePattern(pattern, date(value)), true, value)
  for (const value of ['2026-09-30', '2026-10-01', '2026-10-08']) assert.equal(matchesHomeOfficePattern(pattern, date(value)), false, value)
})

test('week intervals survive year and daylight-saving boundaries', () => {
  const pattern = { weekdays: [3], repeat: { 3: { intervalWeeks: 2, startDate: '2026-12-30' } } }
  assert.equal(matchesHomeOfficePattern(pattern, date('2027-01-06')), false)
  assert.equal(matchesHomeOfficePattern(pattern, date('2027-01-13')), true)
  pattern.repeat[3].startDate = '2026-03-25'
  assert.equal(matchesHomeOfficePattern(pattern, date('2026-04-01')), false)
  assert.equal(matchesHomeOfficePattern(pattern, date('2026-04-08')), true)
})

test('invalid anchors and zero-week intervals do not expose a weekly presence', () => {
  const pattern = { weekdays: [3], repeat: { 3: { intervalWeeks: 2, startDate: '2026-09-24' } } }
  assert.equal(matchesHomeOfficePattern(pattern, date('2026-09-30')), false)
  pattern.repeat[3] = { intervalWeeks: 0, startDate: '2026-09-23' }
  assert.equal(matchesHomeOfficePattern(pattern, date('2026-09-23')), false)
})