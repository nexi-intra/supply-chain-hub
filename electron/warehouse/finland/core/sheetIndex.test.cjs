const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSheetIndex, parcelKey } = require('./sheetIndex.cjs');

const sheet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sheet-2026-11-24.json'), 'utf8'));

test('en celle med både udgående og indgående nummer giver DHL-nøglen', () => {
  const index = buildSheetIndex(sheet.rows.filter((r) => r.delivery === '81992621'));
  assert.ok(index.keys.has('81992621|JD014600012710642036'));
});

test('JJD i arket giver samme nøgle som JD i SAP', () => {
  const index = buildSheetIndex(sheet.rows);
  assert.ok(index.keys.has(parcelKey('81992006', 'JD014600012707878753')));
  assert.ok(index.keys.has('81992006|JD014600012707878753'));
});

test('en levering med fire kolli giver fire nøgler', () => {
  const index = buildSheetIndex(sheet.rows);
  assert.ok(index.deliveries.has('82013278'));
  assert.equal([...index.keys].filter((k) => k.startsWith('82013278|')).length, 4);
});

test('leveringsnummer fra Excel som tal eller med nuller foran giver samme nøgle', () => {
  assert.equal(parcelKey(82013278, 'jd014600012707878753'), '82013278|JD014600012707878753');
  assert.equal(parcelKey('0082013278', 'JD014600012707878753'), '82013278|JD014600012707878753');
});

test('rækker uden leveringsnummer bliver sprunget over', () => {
  const index = buildSheetIndex([{ row: 1728, delivery: '', trackingText: '' }]);
  assert.equal(index.keys.size, 0);
  assert.equal(index.deliveries.size, 0);
});
