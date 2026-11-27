const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addWorkdays, expectedSuggestion, slaFor, receivedChoices, isFollowedUp, followUpDays, topComments, duplicateKeys,
} = require('./followUp.cjs');

test('arbejdsdage springer weekenden over', () => {
  assert.equal(addWorkdays('2026-11-20', 2), '2026-11-24');
  assert.equal(addWorkdays('2026-11-23', 1), '2026-11-24');
});

test('forslag til Expected for PostNord', () => {
  assert.equal(expectedSuggestion({ courier: 'Postnord', postalCode: 15540, country: 'FI', pickedUp: '2026-11-20' }), '2026-11-24');
  assert.equal(expectedSuggestion({ courier: 'Postnord', postalCode: 88200, country: 'FI', pickedUp: '2026-11-20' }), '2026-11-25');
  assert.equal(expectedSuggestion({ courier: 'Postnord', postalCode: '96100', country: 'FI', pickedUp: '2026-11-23' }), '2026-11-27');
});

test('Åland får en dag mere efter aftalens tabel', () => {
  assert.equal(expectedSuggestion({ courier: 'Postnord', postalCode: '22100', country: 'FI', pickedUp: '2026-11-23' }), '2026-11-26');
  assert.equal(expectedSuggestion({ courier: 'DHL', postalCode: '22100', country: 'FI', pickedUp: '2026-11-23' }), '2026-11-25');
});

test('intet forslag for postnumre uden for tabellen', () => {
  assert.equal(expectedSuggestion({ courier: 'Postnord', postalCode: 50, country: 'FI', pickedUp: '2026-11-23' }), null);
});

test('forslag til Expected for DHL, også med mistet nul foran', () => {
  assert.equal(expectedSuggestion({ courier: 'DHL', postalCode: 530, country: 'FI', pickedUp: '2026-11-20' }), '2026-11-23');
  assert.equal(expectedSuggestion({ courier: 'DHL', postalCode: '40320', country: 'FI', pickedUp: '2026-11-20' }), '2026-11-24');
  assert.equal(expectedSuggestion({ courier: 'DHL', postalCode: '96100', country: 'FI', pickedUp: '2026-11-23' }), '2026-11-26');
});

test('intet forslag uden for Finland eller uden afhentning', () => {
  assert.equal(expectedSuggestion({ courier: 'DHL', postalCode: 'LV-1010', country: 'LV', pickedUp: '2026-11-20' }), null);
  assert.equal(expectedSuggestion({ courier: 'Postnord', postalCode: 15540, country: 'FI', pickedUp: '' }), null);
  assert.equal(expectedSuggestion({ courier: 'Ukendt', postalCode: 15540, country: 'FI', pickedUp: '2026-11-20' }), null);
});

test('SLA ud fra Expected og Received', () => {
  assert.equal(slaFor('2026-11-24', '2026-11-24'), 'OK');
  assert.equal(slaFor('2026-11-24', '2026-11-23'), 'OK');
  assert.equal(slaFor('2026-11-24', '2026-11-25'), 'NOK');
  assert.equal(slaFor('2026-11-24', ''), '');
  assert.equal(slaFor('', '2026-11-25'), '');
});

test('datoknapper fra en fredag', () => {
  assert.deepEqual(receivedChoices('2026-11-20'), ['2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-30']);
});

const row = (n, courier, f) => ({ row: n, delivery: String(82016000 + n), trackingText: `T${n}`, pickedUp: '2026-11-20', courier, followUp: { expected: '', received: '', sla: '', comment: '', terminal: '', ...f } });

test('PostNord skal have terminal for at være fulgt op, DHL ikke', () => {
  assert.equal(isFollowedUp({ received: '2026-11-24', sla: 'OK', terminal: '' }, 'Postnord'), false);
  assert.equal(isFollowedUp({ received: '2026-11-24', sla: 'OK', terminal: 'Turku' }, 'Postnord'), true);
  assert.equal(isFollowedUp({ received: '2026-11-24', sla: 'OK', terminal: '' }, 'DHL'), true);
  assert.equal(isFollowedUp({ received: '', sla: '', terminal: 'Turku' }, 'Postnord'), false);
});

test('en DSV-række er fulgt op med Received og SLA, og Expected har intet forslag', () => {
  assert.equal(isFollowedUp({ received: '2026-11-26', sla: 'OK', terminal: '' }, 'DSV'), true);
  assert.equal(expectedSuggestion({ courier: 'DSV', postalCode: 530, country: 'FI', pickedUp: '2026-11-24' }), null);
});

test('dagens status i kalenderen', () => {
  const days = followUpDays([
    row(1, 'Postnord', { received: '2026-11-24', sla: 'OK', terminal: 'Vantaa' }),
    row(2, 'Postnord', { terminal: 'Turku' }),
    row(3, 'DHL', {}),
    { ...row(4, 'DHL', { received: '2026-11-25', sla: 'NOK' }), pickedUp: '2026-11-23' },
    { ...row(5, 'DHL', {}), pickedUp: '2026-11-24' },
  ]);
  assert.deepEqual(days.map((d) => `${d.date} ${d.done}/${d.total} ${d.status}`), [
    '2026-11-20 1/3 some', '2026-11-23 1/1 done', '2026-11-24 0/1 open',
  ]);
});

test('de hyppigste kommentarer først', () => {
  const rows = [
    row(1, 'Postnord', { comment: 'stuck in Køge' }), row(2, 'Postnord', { comment: '1 ekstra day in Køge' }),
    row(3, 'Postnord', { comment: '1 ekstra day in Køge ' }), row(4, 'Postnord', { comment: '' }),
  ];
  assert.deepEqual(topComments(rows, 6), ['1 ekstra day in Køge', 'stuck in Køge']);
});

test('samme levering og T&T to gange bliver fundet', () => {
  const rows = [
    { row: 1029, delivery: '82011744', trackingText: 'JD014600012893529482 ', pickedUp: '2026-10-27' },
    { row: 1030, delivery: '82011744', trackingText: 'JD014600012893529482', pickedUp: '2026-10-27' },
    { row: 1031, delivery: '82011748', trackingText: 'JD014600012895364994', pickedUp: '2026-10-27' },
  ];
  assert.deepEqual([...duplicateKeys(rows)], ['82011744|JD014600012893529482']);
});
