const test = require('node:test');
const assert = require('node:assert/strict');
const { planWrites } = require('./followUpSync.cjs');

const empty = { expected: '', received: '', sla: '', comment: '', terminal: '' };
const sheetRow = (row, f = {}) => ({
  row, delivery: '82016081', trackingText: '00073215400786040476', pickedUp: '2026-11-20', courier: 'Postnord',
  followUp: { ...empty, expected: '2026-11-24', ...f },
});
const draft = (fields, original = {}) => ({
  delivery: '82016081', tracking: '00073215400786040476', pickedUp: '2026-11-20',
  fields, original: { ...empty, expected: '2026-11-24', ...original }, slaManual: false,
});
const other = { row: 1690, delivery: '82016062', trackingText: '00073215400785871439', pickedUp: '2026-11-20', courier: 'Postnord', followUp: empty };

test('ændrede felter bliver skrevet i den rigtige række', () => {
  const plan = planWrites([draft({ received: '2026-11-25', sla: 'NOK', terminal: 'Turku' })], [other, sheetRow(1691)]);
  assert.deepEqual(plan.writes, [{
    row: 1691, delivery: '82016081', tracking: '00073215400786040476',
    cells: { received: '2026-11-25', sla: 'NOK', terminal: 'Turku' }, expect: { received: '', sla: '', terminal: '' },
  }]);
  assert.deepEqual(plan.conflicts, []);
});

test('en række, der er flyttet ned, findes på levering og T&T', () => {
  const plan = planWrites([draft({ terminal: 'Turku' })], [other, sheetRow(1692)]);
  assert.equal(plan.writes[0].row, 1692);
});

test('en kollega har udfyldt Received siden læsning: konflikt, og intet skrives for kolliet', () => {
  const plan = planWrites([draft({ received: '2026-11-25', sla: 'NOK', terminal: 'Turku' })], [sheetRow(1691, { received: '2026-11-26' })]);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.done, []);
  assert.deepEqual(plan.conflicts, [{ key: '82016081|00073215400786040476', field: 'received', original: '', current: '2026-11-26', wanted: '2026-11-25' }]);
});

test('står den nye værdi allerede i arket, er kladden færdig', () => {
  const plan = planWrites([draft({ terminal: 'Turku' })], [sheetRow(1691, { terminal: 'Turku' })]);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.done, ['82016081|00073215400786040476']);
});

test('samme levering og T&T på to rækker skrives ikke', () => {
  const plan = planWrites([draft({ terminal: 'Turku' })], [sheetRow(1691), sheetRow(1692)]);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.notFound, ['82016081|00073215400786040476']);
});

test('en række, der er væk, skrives ikke', () => {
  const plan = planWrites([draft({ terminal: 'Turku' })], [other]);
  assert.deepEqual(plan.notFound, ['82016081|00073215400786040476']);
});

test('JJD i arket og mellemrum i kommentaren tæller som det samme', () => {
  const d = { ...draft({ comment: 'stuck in Køge' }), delivery: '82016510', tracking: 'JD014600012941077521' };
  const row = { row: 1700, delivery: '82016510', trackingText: 'JJD014600012941077521', pickedUp: '2026-11-24', courier: 'DHL', followUp: { ...empty, expected: '2026-11-24', comment: 'stuck in Køge ' } };
  assert.deepEqual(planWrites([d], [row]).done, ['82016510|JD014600012941077521']);
});

const { resolveDraft } = require('./followUpSync.cjs');

test('"Brug arkets" for Received tager arkets dato og regner SLA om', () => {
  const d = draft({ received: '2026-11-24', sla: 'OK' });
  const c = { key: 'k', field: 'received', original: '', current: '2026-11-26', wanted: '2026-11-24' };
  const next = resolveDraft(d, c, 'sheet');
  assert.deepEqual(next.fields, { sla: 'NOK' });
  assert.equal(next.original.received, '2026-11-26');
});

test('"Brug min" beholder min dato og skriver over arkets ved næste gem', () => {
  const d = draft({ received: '2026-11-24', sla: 'OK' });
  const c = { key: 'k', field: 'received', original: '', current: '2026-11-26', wanted: '2026-11-24' };
  const next = resolveDraft(d, c, 'mine');
  assert.deepEqual(next.fields, { received: '2026-11-24', sla: 'OK' });
  assert.equal(next.original.received, '2026-11-26');
});

test('SLA valgt i hånden bliver ikke regnet om', () => {
  const d = { ...draft({ received: '2026-11-24', sla: 'OK' }), slaManual: true };
  const c = { key: 'k', field: 'received', original: '', current: '2026-11-26', wanted: '2026-11-24' };
  assert.deepEqual(resolveDraft(d, c, 'sheet').fields, { sla: 'OK' });
});

test('ingen felter tilbage giver null', () => {
  const d = draft({ terminal: 'Turku' });
  const c = { key: 'k', field: 'terminal', original: '', current: 'Vantaa', wanted: 'Turku' };
  assert.equal(resolveDraft(d, c, 'sheet'), null);
});

const { mergeDraft } = require('./followUpSync.cjs');
const who = { delivery: '82016081', tracking: '00073215400786040476', pickedUp: '2026-11-20' };

test('kun de felter brugeren rører kommer i kladden, og en kollegas nye kommentar bliver stående', () => {
  // The form was opened when Comment was empty; a colleague has since written one in the sheet.
  const base = { ...empty, expected: '2026-11-24' };
  const d = mergeDraft({ existing: null, base, wanted: { terminal: 'Turku' }, slaManual: false, ...who });
  assert.deepEqual(d.fields, { terminal: 'Turku' });
  const plan = planWrites([d], [sheetRow(1691, { comment: 'Damaged, colleague' })]);
  assert.deepEqual(plan.writes.map((w) => w.cells), [{ terminal: 'Turku' }]);
});

test('en eksisterende kladde beholder de felter, der ikke er rørt nu', () => {
  const existing = { ...who, fields: { received: '2026-11-24', sla: 'OK' }, original: { ...empty, expected: '2026-11-24' }, slaManual: false };
  const d = mergeDraft({ existing, base: { ...empty }, wanted: { terminal: 'Vantaa' }, slaManual: false, ...who });
  assert.deepEqual(d.fields, { received: '2026-11-24', sla: 'OK', terminal: 'Vantaa' });
  assert.equal(d.original.expected, '2026-11-24');
});

test('sætter man et felt tilbage, forsvinder det, og en tom kladde bliver null', () => {
  const existing = { ...who, fields: { terminal: 'Vantaa' }, original: { ...empty, terminal: 'Turku' }, slaManual: false };
  assert.equal(mergeDraft({ existing, base: empty, wanted: { terminal: 'Turku' }, slaManual: false, ...who }), null);
});

test('hver skrivning har de værdier, cellerne skal have, før der skrives', () => {
  const plan = planWrites([draft({ received: '2026-11-25', sla: 'NOK' })], [sheetRow(1691)]);
  assert.deepEqual(plan.writes[0].expect, { received: '', sla: '' });
});
