const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSapList } = require('./sapList.cjs');

const fixture = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'zms-2026-11-24.tsv'));

test('hele ZMS_cons_info-listen fra 24.11.2026 giver 1.564 kolli', () => {
  assert.equal(parseSapList(fixture).length, 1564);
});

test('et kolli får de rigtige felter og datoer som ÅÅÅÅ-MM-DD', () => {
  const p = parseSapList(fixture).find((x) => x.delivery === '82006464');
  assert.deepEqual(p, {
    delivery: '82006464',
    tracking: '00073215400717246984',
    orderType: 'ZRO',
    postalCode: '11130',
    country: 'FI',
    createdOn: '2026-09-24',
    shippedOn: '2026-09-24',
  });
});

test('UTF-8 uden BOM giver det samme', () => {
  const text = fixture.toString('utf16le').replace(/^\uFEFF/, '').split('\r\n').slice(0, 4).join('\r\n');
  const fromUtf8 = parseSapList(Buffer.from(text, 'utf8'));
  assert.deepEqual(fromUtf8, parseSapList(fixture).slice(0, 3));
});

test('tom Shipped-dato giver null', () => {
  const text = fixture.toString('utf16le').replace(/^\uFEFF/, '').split('\r\n').slice(0, 2);
  const head = text[0].split('\t');
  const cells = text[1].split('\t');
  cells[head.indexOf('SHIPPED_DATE')] = '';
  const [p] = parseSapList(Buffer.from(`${text[0]}\r\n${cells.join('\t')}\r\n`, 'utf8'));
  assert.equal(p.shippedOn, null);
});

test('mangler TRACKINGNO i første linje, stopper det med en tydelig fejl', () => {
  const bad = Buffer.from('VBELN\tAUART\tPOST_CODE\r\n82006464\tZRO\t11130\r\n', 'utf8');
  assert.throws(() => parseSapList(bad), /ZMS_cons_info har ændret kolonner/);
});
