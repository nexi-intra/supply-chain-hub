const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSapList } = require('./sapList.cjs');
const { buildSheetIndex, parcelKey } = require('./sheetIndex.cjs');
const { compareParcels } = require('./compare.cjs');

const parcels = parseSapList(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'zms-2026-11-24.tsv')));
const sheet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sheet-2026-11-24.json'), 'utf8'));
const emptyIndex = () => buildSheetIndex([]);
const parcel = (over) => ({
  delivery: '82099999', tracking: '00073215400799999999', orderType: 'ZRO', postalCode: '00100',
  country: 'FI', createdOn: '2026-11-24', shippedOn: '2026-11-24', ...over,
});

test('de rigtige data fra 24.11.2026 giver 84 nye kolli og 5 til listen', () => {
  const result = compareParcels(parcels, buildSheetIndex(sheet.rows));
  assert.equal(result.toAdd.length, 84);
  assert.equal(result.alreadyInSheet, 1475);
  assert.equal(result.inSheet.length, result.alreadyInSheet);
  assert.equal(result.notShipped, 0);
  assert.deepEqual(
    result.review.map((r) => `${r.parcel.delivery}:${r.reason}`).sort(),
    ['82007482:nyt-tt', '82007540:nyt-tt', '82009862:nyt-tt', '82011744:nyt-tt', '82012851:nyt-tt'],
  );
});

test('en ny levering med to kolli giver to rækker', () => {
  const result = compareParcels([
    parcel({ tracking: '00073215400799999991' }),
    parcel({ tracking: '00073215400799999992' }),
  ], emptyIndex());
  assert.equal(result.toAdd.length, 2);
});

test('samme kolli to gange i SAP-listen giver én række', () => {
  const result = compareParcels([parcel(), parcel()], emptyIndex());
  assert.equal(result.toAdd.length, 1);
});

test('et kolli uden Shipped-dato tælles som ikke sendt', () => {
  const result = compareParcels([parcel({ shippedOn: null })], emptyIndex());
  assert.equal(result.notShipped, 1);
  assert.equal(result.toAdd.length, 0);
});

test('ukendt T&T og tom T&T kommer på listen', () => {
  const result = compareParcels([
    parcel({ delivery: '82099991', tracking: 'DSV123' }),
    parcel({ delivery: '82099992', tracking: '' }),
  ], emptyIndex());
  assert.deepEqual(result.review.map((r) => r.reason), ['ukendt-courier', 'mangler-tt']);
  assert.equal(result.toAdd.length, 0);
});

test('kolli sendt før startdatoen springes over og kommer ikke på listen', () => {
  const result = compareParcels([
    parcel({ delivery: '82099991', shippedOn: '2026-11-19' }),
    parcel({ delivery: '82099992', shippedOn: '2026-11-20' }),
    parcel({ delivery: '82099993', shippedOn: '2026-11-19', tracking: 'DSV123' }),
  ], emptyIndex(), '2026-11-20');
  assert.deepEqual(result.toAdd.map((p) => p.delivery), ['82099992']);
  assert.equal(result.beforeStart, 2);
  assert.equal(result.review.length, 0);
});

test('de rigtige data med startdato 24.11.2026 giver kun dagens kolli', () => {
  const result = compareParcels(parcels, buildSheetIndex(sheet.rows), '2026-11-24');
  assert.equal(result.toAdd.length, 27);
  assert.equal(result.review.length, 0);
});

test('et kolli markeret som ikke sendt bliver aldrig skrevet', () => {
  const p = parcel();
  const result = compareParcels([p], emptyIndex(), null, new Set([parcelKey(p.delivery, p.tracking)]));
  assert.equal(result.toAdd.length, 0);
  assert.deepEqual(result.notSent, [{ parcel: p, inSheet: false }]);
});

test('et kolli markeret som ikke sendt, der står i arket, vises som ikke sendt og i arket', () => {
  const p = parcel();
  const index = buildSheetIndex([{ delivery: p.delivery, trackingText: p.tracking }]);
  const result = compareParcels([p], index, null, new Set([parcelKey(p.delivery, p.tracking)]));
  assert.equal(result.inSheet.length, 0);
  assert.deepEqual(result.notSent, [{ parcel: p, inSheet: true }]);
});

test('et kolli markeret som ikke sendt kommer ikke på listen til tjek', () => {
  const p = parcel({ tracking: 'JJD014600012941465212' });
  const index = buildSheetIndex([{ delivery: p.delivery, trackingText: '00073215400799999990' }]);
  const result = compareParcels([p], index, null, new Set([parcelKey(p.delivery, p.tracking)]));
  assert.equal(result.review.length, 0);
  assert.equal(result.notSent.length, 1);
});

test('uden markeringer er listen over ikke sendte tom', () => {
  assert.deepEqual(compareParcels([parcel()], emptyIndex()).notSent, []);
});
