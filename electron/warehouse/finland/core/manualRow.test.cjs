const test = require('node:test');
const assert = require('node:assert/strict');
const { checkManualRow } = require('./manualRow.cjs');

const today = new Date(2026, 10, 25);
const sheet = [
  { row: 1700, delivery: '82016477', trackingText: '00073215400790439396', pickedUp: '2026-11-23' },
  { row: 1701, delivery: '82016510', trackingText: 'JJD014600012941077521', pickedUp: '2026-11-24' },
];
const dsv = { delivery: '82099001', orderType: 'ZRO', postalCode: '00530', courier: 'DSV', tracking: '00157145952719835363', pickedUp: '2026-11-24' };

test('en DSV-række bliver til en række til arket', () => {
  assert.deepEqual(checkManualRow(dsv, sheet, today), {
    ok: true,
    row: { delivery: 82099001, orderType: 'ZRO', postalCode: 530, courier: 'DSV', tracking: '00157145952719835363', pickedUp: '2026-11-24' },
  });
});

test('T&T med mellemrum og små bogstaver bliver normaliseret', () => {
  const r = checkManualRow({ ...dsv, courier: 'DHL', tracking: ' jjd 0146 0001 2999 9999 99 ' }, sheet, today);
  assert.equal(r.ok, true);
  assert.equal(r.row.tracking, 'JD014600012999999999');
});

test('manglende felter giver fejl pr. felt', () => {
  const r = checkManualRow({ delivery: '', orderType: '', postalCode: '', courier: 'DSV', tracking: '', pickedUp: '' }, sheet, today);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['delivery', 'pickedUp', 'postalCode', 'tracking']);
});

test('ugyldigt T&T, levering med bogstaver og dato i fremtiden afvises', () => {
  const r = checkManualRow({ ...dsv, tracking: '12345', delivery: 'ABC', pickedUp: '2026-11-26' }, sheet, today);
  assert.deepEqual(Object.keys(r.errors).sort(), ['delivery', 'pickedUp', 'tracking']);
});

test('courier skal passe til et kendt mønster', () => {
  const r = checkManualRow({ ...dsv, courier: 'Postnord' }, sheet, today);
  assert.match(r.errors.courier, /DSV/);
  assert.equal(checkManualRow({ ...dsv, tracking: '00999999952719835363', courier: 'DSV' }, sheet, today).ok, true);
});

test('samme levering og T&T i arket afvises med rækkenummer', () => {
  const r = checkManualRow({ ...dsv, delivery: '82016477', tracking: '00073215400790439396', courier: 'Postnord' }, sheet, today);
  assert.match(r.errors.tracking, /række 1700/);
});

test('T&T, der står på en anden levering, afvises', () => {
  const r = checkManualRow({ ...dsv, courier: 'DHL', tracking: 'JD014600012941077521' }, sheet, today);
  assert.match(r.errors.tracking, /levering 82016510 i række 1701/);
});

test('order type må kun have bogstaver og cifre, så Excel ikke laver den om', () => {
  assert.ok(checkManualRow({ ...dsv, orderType: '=1+1' }, sheet, today).errors.orderType);
  assert.ok(checkManualRow({ ...dsv, orderType: '1-2' }, sheet, today).errors.orderType);
  assert.equal(checkManualRow({ ...dsv, orderType: 'zsw' }, sheet, today).row.orderType, 'ZSW');
});

test('en dato, der ikke findes, afvises', () => {
  assert.ok(checkManualRow({ ...dsv, pickedUp: '2026-02-30' }, sheet, today).errors.pickedUp);
});

test('et leveringsnummer med kun nuller afvises', () => {
  assert.ok(checkManualRow({ ...dsv, delivery: '000' }, sheet, today).errors.delivery);
});
