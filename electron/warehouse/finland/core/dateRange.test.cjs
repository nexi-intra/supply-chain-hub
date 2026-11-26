const test = require('node:test');
const assert = require('node:assert/strict');
const { sapDateRange } = require('./dateRange.cjs');

test('to måneder tilbage fra 24.11.2026', () => {
  assert.deepEqual(sapDateRange(new Date(2026, 10, 24)), { from: '24.09.2026', to: '24.11.2026' });
});

test('sidst på måneden giver en gyldig dato', () => {
  assert.equal(sapDateRange(new Date(2026, 11, 31)).from, '31.10.2026');
  assert.equal(sapDateRange(new Date(2026, 2, 31)).from, '31.01.2026');
  assert.equal(sapDateRange(new Date(2026, 3, 30)).from, '28.02.2026');
  assert.equal(sapDateRange(new Date(2028, 3, 30)).from, '29.02.2028');
});

test('over et årsskifte', () => {
  assert.deepEqual(sapDateRange(new Date(2027, 0, 15)), { from: '15.11.2026', to: '15.01.2027' });
});
