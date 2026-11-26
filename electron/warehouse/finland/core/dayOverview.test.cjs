const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSapList } = require('./sapList.cjs');
const { buildSheetIndex, parcelKey } = require('./sheetIndex.cjs');
const { dayOverview, defaultDay } = require('./dayOverview.cjs');

const parcels = parseSapList(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'zms-2026-11-24.tsv')));
const sheet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sheet-2026-11-24.json'), 'utf8'));
const days = dayOverview(parcels, buildSheetIndex(sheet.rows));
const day = (date) => days.find((d) => d.date === date);

test('44 dage fra 24.09.2026, sorteret', () => {
  assert.equal(days.length, 44);
  assert.equal(days[0].date, '2026-09-24');
  assert.equal(days[days.length - 1].date, '2026-11-24');
});

test('24.11 mangler helt', () => {
  const d = day('2026-11-24');
  assert.equal(d.total, 27);
  assert.equal(d.missing.length, 27);
  assert.equal(d.inSheet.length, 0);
  assert.equal(d.status, 'none');
});

test('23.11 står helt i arket', () => {
  const d = day('2026-11-23');
  assert.equal(d.total, 36);
  assert.equal(d.missing.length, 0);
  assert.equal(d.status, 'full');
});

test('09.11 mangler delvist', () => {
  const d = day('2026-11-09');
  assert.equal(d.total, 37);
  assert.equal(d.inSheet.length, 8);
  assert.equal(d.missing.length, 29);
  assert.equal(d.status, 'partial');
});

test('14.10 er grøn, men har ét kolli til tjek', () => {
  const d = day('2026-10-14');
  assert.equal(d.status, 'full');
  assert.deepEqual(d.review.map((r) => `${r.parcel.delivery}:${r.reason}`), ['82009862:nyt-tt']);
});

test('kolli uden Shipped-dato giver ingen dag', () => {
  const p = { delivery: '82099999', tracking: '00073215400799999999', orderType: 'ZRO', postalCode: '100', country: 'FI', createdOn: '2026-11-25', shippedOn: null };
  assert.deepEqual(dayOverview([p], buildSheetIndex([])), []);
});

test('ikke sendte kolli tæller med i SAP, men ikke som manglende', () => {
  const missing = day('2026-11-24').missing;
  const notSent = new Set(missing.slice(0, 2).map((p) => parcelKey(p.delivery, p.tracking)));
  const d = dayOverview(parcels, buildSheetIndex(sheet.rows), notSent).find((x) => x.date === '2026-11-24');
  assert.equal(d.total, 27);
  assert.equal(d.missing.length, 25);
  assert.equal(d.notSent.length, 2);
});

test('en dag, hvor kun ikke sendte kolli mangler, står som fuld', () => {
  const p = { delivery: '82099999', tracking: '00073215400799999999', orderType: 'ZRO', postalCode: '100', country: 'FI', createdOn: '2026-11-25', shippedOn: '2026-11-25' };
  const [d] = dayOverview([p], buildSheetIndex([]), new Set([parcelKey(p.delivery, p.tracking)]));
  assert.equal(d.status, 'full');
  assert.equal(d.missing.length, 0);
});

test('standarddagen er i dag, ellers den seneste dag med kolli', () => {
  assert.equal(defaultDay(days, '2026-11-24'), '2026-11-24');
  assert.equal(defaultDay(days, '2026-11-25'), '2026-11-24');
  assert.equal(defaultDay([], '2026-11-25'), null);
});
