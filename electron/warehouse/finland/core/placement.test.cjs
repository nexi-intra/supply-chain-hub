const test = require('node:test');
const assert = require('node:assert/strict');
const { insertionPoint } = require('./placement.cjs');

// Shaped like the test sheet on 25.11.2026: mostly by date, with 30.09 written in again after 12.10.
const rows = [
  { row: 2, delivery: '82006400', trackingText: '', pickedUp: '2026-09-24' },
  { row: 3, delivery: '82006838', trackingText: '', pickedUp: '2026-09-25' },
  { row: 4, delivery: '82007400', trackingText: '', pickedUp: '2026-09-30' },
  { row: 5, delivery: '82009100', trackingText: '', pickedUp: '2026-10-12' },
  { row: 6, delivery: '82007482', trackingText: '', pickedUp: '2026-09-30' },
  { row: 7, delivery: '', trackingText: '', pickedUp: '' },
  { row: 8, delivery: '82016477', trackingText: '', pickedUp: '2026-11-23' },
  { row: 9, delivery: '82016732', trackingText: '', pickedUp: '2026-11-24' },
  { row: 10, delivery: '', trackingText: '', pickedUp: '' },
];

test('en dato, der står to steder, giver den nederste', () => {
  assert.deepEqual(insertionPoint(rows, '2026-09-30'), { afterRow: 6, afterDelivery: '82007482' });
});

test('en dato, der mangler, kommer efter den nærmeste tidligere dato', () => {
  assert.deepEqual(insertionPoint(rows, '2026-10-01'), { afterRow: 6, afterDelivery: '82007482' });
  assert.deepEqual(insertionPoint(rows, '2026-11-02'), { afterRow: 5, afterDelivery: '82009100' });
});

test('ældre end alt kommer øverst', () => {
  assert.deepEqual(insertionPoint(rows, '2026-09-01'), { afterRow: 1, afterDelivery: '' });
});

test('nyere end alt kommer nederst', () => {
  assert.equal(insertionPoint(rows, '2026-11-25'), null);
});

test('nyere end alt kommer nederst, også når en efterskrevet række står nederst', () => {
  const late = [
    { row: 2, delivery: '82016400', trackingText: '', pickedUp: '2026-11-19' },
    { row: 3, delivery: '82016477', trackingText: '', pickedUp: '2026-11-20' },
    { row: 4, delivery: '82016100', trackingText: '', pickedUp: '2026-11-19' },
    { row: 5, delivery: '', trackingText: '', pickedUp: '' },
  ];
  assert.equal(insertionPoint(late, '2026-11-21'), null);
});

test('samme dato som den nyeste, der står nederst, kommer nederst', () => {
  assert.equal(insertionPoint(rows, '2026-11-24'), null);
});

test('et tomt ark giver nederst', () => {
  assert.equal(insertionPoint([], '2026-11-24'), null);
});
