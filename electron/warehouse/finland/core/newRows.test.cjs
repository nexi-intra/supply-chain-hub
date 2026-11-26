const test = require('node:test');
const assert = require('node:assert/strict');
const { toSheetRows } = require('./newRows.cjs');

const parcel = (over) => ({
  delivery: '82016477', tracking: '00073215400790439396', orderType: 'ZAO', postalCode: '00610',
  country: 'FI', createdOn: '2026-11-23', shippedOn: '2026-11-23', ...over,
});

test('en række får kolonnerne B til G', () => {
  assert.deepEqual(toSheetRows([parcel()]), [{
    delivery: 82016477, orderType: 'ZAO', postalCode: 610, courier: 'Postnord',
    tracking: '00073215400790439396', pickedUp: '2026-11-23',
  }]);
});

test('postal codes: kun cifre bliver tal, ellers tekst', () => {
  const rows = toSheetRows([
    parcel({ postalCode: '02920' }),
    parcel({ postalCode: '411 03', tracking: '00073215400790439397' }),
    parcel({ postalCode: '66-002', tracking: '00073215400790439398' }),
    parcel({ postalCode: '', tracking: '00073215400790439399' }),
  ]);
  assert.deepEqual(rows.map((r) => r.postalCode), [2920, '411 03', '66-002', '']);
});

test('DHL-nummer giver DHL', () => {
  assert.equal(toSheetRows([parcel({ tracking: 'JD014600012939586731' })])[0].courier, 'DHL');
});

test('rækkerne sorteres efter dato, så levering, så T&T', () => {
  const rows = toSheetRows([
    parcel({ delivery: '82016500', shippedOn: '2026-11-24' }),
    parcel({ delivery: '82016477', tracking: '00073215400790439399', shippedOn: '2026-11-23' }),
    parcel({ delivery: '82016477', tracking: '00073215400790439396', shippedOn: '2026-11-23' }),
    parcel({ delivery: '82016400', shippedOn: '2026-11-24' }),
  ]);
  assert.deepEqual(rows.map((r) => `${r.pickedUp} ${r.delivery} ${r.tracking.slice(-2)}`), [
    '2026-11-23 82016477 96', '2026-11-23 82016477 99', '2026-11-24 82016400 96', '2026-11-24 82016500 96',
  ]);
});
