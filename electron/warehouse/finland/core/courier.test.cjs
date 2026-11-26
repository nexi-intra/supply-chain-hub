const test = require('node:test');
const assert = require('node:assert/strict');
const { courierFor, normalizeTracking } = require('./courier.cjs');

test('DHL-numre med JD og JJD giver DHL', () => {
  assert.equal(courierFor('JD014600012939586731'), 'DHL');
  assert.equal(courierFor('JJD014600012707878753'), 'DHL');
});

test('PostNord-numre med 00073215 og 20 cifre giver Postnord', () => {
  assert.equal(courierFor('00073215400790439396'), 'Postnord');
});

test('DSV-numre med 00157145 og 20 cifre giver DSV', () => {
  assert.equal(courierFor('00157145952719835363'), 'DSV');
});

test('alt andet giver Ukendt', () => {
  assert.equal(courierFor(''), 'Ukendt');
  assert.equal(courierFor('12345'), 'Ukendt');
  assert.equal(courierFor('00073215400790439'), 'Ukendt');
  assert.equal(courierFor('DSV123'), 'Ukendt');
});

test('normalizeTracking fjerner mellemrum og regner JJD som JD', () => {
  assert.equal(normalizeTracking(' jjd014600012707878753 '), 'JD014600012707878753');
  assert.equal(normalizeTracking('00073215400790439396'), '00073215400790439396');
});
