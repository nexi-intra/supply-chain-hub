const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSapList } = require('./sapList.cjs');
const { reviewAction } = require('./reviewAction.cjs');

const parcels = parseSapList(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'zms-2026-11-24.tsv')));
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sheet-2026-11-24.json'), 'utf8')).rows;
const parcel = (delivery, tracking) => parcels.find((p) => p.delivery === delivery && p.tracking === tracking);

test('82009862: det manglende DHL-kolli sættes ind under leveringens række', () => {
  assert.deepEqual(reviewAction(parcel('82009862', 'JD014600012876716352'), parcels, rows), { kind: 'add', afterRow: 695, afterDelivery: '82009862' });
});

test('82007482: det manglende PostNord-kolli sættes ind under leveringens række', () => {
  assert.deepEqual(reviewAction(parcel('82007482', '00073215400723868927'), parcels, rows), { kind: 'add', afterRow: 387, afterDelivery: '82007482' });
});

test('82011744: samme DHL-nummer på to rækker, den nederste rettes til PostNord', () => {
  assert.deepEqual(reviewAction(parcel('82011744', '00073215400753822517'), parcels, rows), {
    kind: 'replace-duplicate', row: 1030, oldTracking: 'JD014600012893529482', newTracking: '00073215400753822517', courier: 'Postnord',
  });
});

const sap = (tracking) => ({ delivery: '82099999', tracking, orderType: 'ZRO', postalCode: '00100', country: 'FI', createdOn: '2026-11-20', shippedOn: '2026-11-20' });

test('et nummer, SAP ikke kender, rettes til det manglende kolli', () => {
  const p = sap('JD014600012999999999');
  const sheet = [{ row: 40, delivery: '82099999', trackingText: '00073215400799999999', pickedUp: '2026-11-20' }];
  assert.deepEqual(reviewAction(p, [p], sheet), {
    kind: 'replace-unknown', row: 40, oldTracking: '00073215400799999999', newTracking: 'JD014600012999999999', courier: 'DHL',
  });
});

test('to manglende kolli og et ukendt nummer kan ikke rettes automatisk', () => {
  const a = sap('JD014600012999999991');
  const b = sap('JD014600012999999992');
  const sheet = [{ row: 40, delivery: '82099999', trackingText: '00073215400799999999', pickedUp: '2026-11-20' }];
  assert.deepEqual(reviewAction(a, [a, b], sheet), { kind: 'manual', rows: [40] });
});

test('et nyt nummer med ukendt courier skal rettes i hånden', () => {
  const p = sap('DSV123456');
  const sheet = [{ row: 40, delivery: '82099999', trackingText: '00073215400799999999', pickedUp: '2026-11-20' }];
  assert.deepEqual(reviewAction(p, [p], sheet), { kind: 'manual', rows: [40] });
});

test('en celle med to numre, hvor det ene er et rigtigt SAP-kolli, bliver aldrig overskrevet', () => {
  const x = sap('JD014600012999999991');
  const s2 = sap('JD014600012999999992');
  const n = sap('00073215400799999993');
  const sheet = [
    { row: 10, delivery: '82099999', trackingText: 'JD014600012999999991', pickedUp: '2026-11-20' },
    { row: 11, delivery: '82099999', trackingText: 'JD014600012999999991\nJD014600012999999992', pickedUp: '2026-11-20' },
  ];
  assert.deepEqual(reviewAction(n, [x, s2, n], sheet), { kind: 'manual', rows: [10, 11] });
});

test('rækker med et ukendt nummer ved siden af et kendt giver ikke en rettelse', () => {
  const x = sap('JD014600012999999991');
  const s2 = sap('JD014600012999999992');
  const n = sap('00073215400799999993');
  const sheet = [
    { row: 10, delivery: '82099999', trackingText: 'JD014600012999999991 00073215400700000001', pickedUp: '2026-11-20' },
    { row: 11, delivery: '82099999', trackingText: 'JD014600012999999992 00073215400700000001', pickedUp: '2026-11-20' },
  ];
  assert.deepEqual(reviewAction(n, [x, s2, n], sheet), { kind: 'manual', rows: [10, 11] });
});
