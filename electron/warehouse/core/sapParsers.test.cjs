const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { parseSapNumber, parseMb52, parseIq09, parseMatdoc, normalizeMatdoc, parseLongSerno, parseStockCheck, parseMi31Log, parseMi22, parseMi20, parseMm60 } = require('./sapParsers.cjs')

const fixture = name => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sap', name), 'utf8')

test('MI20 (QS4): book, counted, difference and amount per item; MI22 after posting has no "Doc. Active"', () => {
  const items = parseMi20(fixture('pidoc/mi20-list.txt'))
  assert.deepEqual(items.map(item => `${item.docNo}/${item.item} ${item.material} ${item.book}>${item.counted} ${item.diff} ${item.amount}`), [
    '105000893/1 INT4100-7920-0 1>1 0 0',
    '105000894/1 R133-0032 483>480 -3 151.59',
    '105000894/2 R133-0033 23>0 -23 3877.2',
  ])
  const status = parseMi22(fixture('pidoc/mi22-posted.txt'))
  assert.deepEqual(status.map(doc => `${doc.docNo}/${doc.item}:${doc.status || 'afsluttet'}`), ['105000893/1:afsluttet', '105000894/1:afsluttet', '105000894/2:afsluttet'])
  assert.throws(() => parseMi20('x'), { code: 'SAP_FORMAT' })
})

test('MI31 test log (QS4): the items it would create, without errors', () => {
  const log = parseMi31Log(fixture('pidoc/mi31-test.txt'))
  assert.deepEqual([log.units, log.possible, log.errors], [2, 2, 0])
  assert.deepEqual(log.items.map(item => `${item.plant}/${item.sloc}/${item.material}`), ['D301/D000/R133-0032', 'D301/D000/R133-0033'])
  const empty = parseMi31Log('\uFEFF\n*** S t a t i s t i c s ***\nTotal Number of Stock Management Units for PI             0\nNumber of Errors Found                                    0\n')
  assert.deepEqual([empty.units, empty.items.length], [0, 0], 'already counted this year without "Include Inventoried Materials"')
  assert.throws(() => parseMi31Log('noget andet'), { code: 'SAP_FORMAT' })
})

test('MI22 (QS4): documents per material, with the physical inventory number and status', () => {
  const docs = parseMi22(fixture('pidoc/mi22-list.txt'))
  assert.equal(docs.length, 5)
  assert.deepEqual(docs[4], { material: 'INT4100-7920-0', plant: 'D301', sloc: 'D000', docNo: '105000893', item: 1, planned: '19.10.2026', stockType: '1', physInvNo: '', status: 'Doc. Active' })
  assert.throws(() => parseMi22('x\ty'), { code: 'SAP_FORMAT' })
})

test('ZMS_STOCK_SER_CHK2: stock and serial counts per material and location; a blank location repeats the one above', () => {
  const rows = parseStockCheck(fixture('stockcheck-sample.txt'))
  assert.equal(rows.length, 6)
  assert.deepEqual(rows[2], { material: 'R092-0036', plant: 'D301', sloc: 'D000', unrestricted: 3724, serialsUnrestricted: 1, blocked: 813, serialsBlocked: 1 })
  const blank = parseStockCheck('MATNR\tWERKS\tLGORT\tLABST\tSNO_UNR\tSPEME\tSNO_BLK\nA1\tD301\tD003\t1,000\t0,000\t0,000\t0,000\nA2\tD301\t\t2,000\t1,000\t0,000\t0,000\n')
  assert.equal(blank[1].sloc, 'D003')
  assert.throws(() => parseStockCheck('MATNR\tWERKS\n'), { code: 'SAP_FORMAT' })
})

test('SAP numbers: Danish thousands/decimals and SAP trailing minus', () => {
  assert.equal(parseSapNumber('            1.985'), 1985)
  assert.equal(parseSapNumber('2.240.469,51'), 2240469.51)
  assert.equal(parseSapNumber('0,00'), 0)
  assert.equal(parseSapNumber('12-'), -12)
  assert.equal(parseSapNumber('1.234,5-'), -1234.5)
  assert.equal(parseSapNumber(''), 0)
  assert.ok(Number.isNaN(parseSapNumber('abc')))
})

test('MB52 export: one row per material and storage location, totals and page headers skipped', () => {
  const rows = parseMb52(fixture('mb52-sample.txt'))
  assert.equal(rows.length, 13)
  assert.deepEqual(rows[0], {
    material: 'INT4300-4921-0', description: 'SmartPOS N950 PCI PTS 6.x P2PE', plant: 'D301', sloc: 'D000',
    unrestricted: 1985, blocked: 0, valueUnrestricted: 2240469.51, valueBlocked: 0,
  })
  const simcardD003 = rows.find(row => row.material === 'R092-0036' && row.sloc === 'D003')
  assert.deepEqual([simcardD003.unrestricted, simcardD003.blocked], [0, 629])
  assert.ok(rows.every(row => /^D\d{3}$/.test(row.sloc)))
})

test('MB52 export without the expected columns is rejected', () => {
  assert.throws(() => parseMb52('just\ttext\n1\t2'), { code: 'SAP_FORMAT' })
  assert.deepEqual(parseMb52('\uFEFF\r\n\t\tMaterial\tMaterial Description\tPlnt\tLoca\tUnrestricted\tBlocked\tValue Unrestricted\tValue BlockedStock\r\n'), [])
})

test('material document lists from ZMS_REP and ZMS_PREP give the same rows', () => {
  const expected = { serial: 'NXC600007186', material: 'INT4100-4921-0', description: 'SmartPOS P300 PCI PTS 6.x P2PE', plant: 'D301', sloc: 'D006' }
  const rep = parseMatdoc(fixture('matdoc-rep-sample.txt'))
  const prep = parseMatdoc(fixture('matdoc-prep-sample.txt'))
  assert.equal(rep.length, 3)
  assert.equal(prep.length, 3)
  assert.deepEqual({ ...rep[0], userStatus: undefined }, { ...expected, userStatus: undefined })
  assert.deepEqual({ ...prep[0], userStatus: undefined }, { ...expected, userStatus: undefined })
  assert.equal(rep[0].userStatus, 'Prepared Viking')
  assert.equal(prep[0].userStatus, 'PRVI')
  assert.deepEqual(parseMatdoc('SERNR\tMATNR\r\n'), [])
  assert.throws(() => parseMatdoc('nothing'), { code: 'SAP_FORMAT' })
})

test('ZMS_LONG_SERNO list: short serial, long serial (SERGE) and material; empty long kept as missing', () => {
  const text = 'SERNR\tSERGE\tMATNR\r\n303201349258058038\t251427303201349258058038\tINT4300-7825-0\r\nabc1\t\tINT4300-7825-0\r\n\t999\tX\r\n'
  assert.deepEqual(parseLongSerno(text), [
    { serial: '303201349258058038', long: '251427303201349258058038', material: 'INT4300-7825-0' },
    { serial: 'ABC1', long: '', material: 'INT4300-7825-0' },
  ])
  assert.throws(() => parseLongSerno('A\tB\r\n1\t2'), { code: 'SAP_FORMAT' })
})

test('material document numbers are normalised to "document year item"', () => {
  assert.equal(normalizeMatdoc(' 4900229137  2026 01 '), '4900229137 2026 01')
  assert.equal(normalizeMatdoc('4900229137 2026'), '4900229137 2026')
  assert.equal(normalizeMatdoc('4900229137'), '4900229137')
  assert.equal(normalizeMatdoc('4900229137 26 01'), null)
  assert.equal(normalizeMatdoc('49002291 2026 01'), null)
  assert.equal(normalizeMatdoc('4900229137 2026 01 & calc'), null)
})

test('IQ09 export: serial numbers with storage location and the stock type of the export', () => {
  const unrestricted = parseIq09(fixture('iq09-01-sample.txt'), 'unrestricted')
  assert.ok(unrestricted.length >= 8)
  const first = unrestricted[0]
  assert.equal(first.material, 'INT4300-4921-0')
  assert.equal(first.sloc, 'D000')
  assert.equal(first.plant, 'D301')
  assert.equal(first.stockType, 'unrestricted')
  assert.match(first.serial, /^\S+$/)
  const blocked = parseIq09(fixture('iq09-07-sample.txt'), 'blocked')
  assert.ok(blocked.every(row => row.stockType === 'blocked'))
  assert.equal(blocked.find(row => row.material === 'R092-0036').sloc, 'D000')
})

test('IQ09: serial numbers are trimmed and upper-cased, empty serials dropped', () => {
  const text = '\t\tPlnt\tLocation\tSerial Number\tMaterial\tMaterial Description\tUserStatus\r\n\t\tD301\tD000\t  ab12 \tR092-0036\tSim\tONHA\r\n\t\tD301\tD000\t\tR092-0036\tSim\tONHA\r\n'
  const rows = parseIq09(text, 'unrestricted')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].serial, 'AB12')
  assert.throws(() => parseIq09(text, 'other'), { code: 'SAP_FORMAT' })
})

test('parseMm60 reads material and description from the MM60 list in English or Danish column names', () => {
  assert.deepEqual(parseMm60(fixture('mm60-sample.txt')), [
    { material: 'R162-0717', description: 'Ethernet Cable RJ45 2m' },
    { material: 'R133-0032', description: 'Move3500 12V DC car charger' },
  ], 'one row per material, also when it is in several plants')
  assert.deepEqual(parseMm60('MATNR\tMAKTX\r\nr133-0049\tPSU 5V\r\n'), [{ material: 'R133-0049', description: 'PSU 5V' }])
  assert.deepEqual(parseMm60('\tMateriale\tMaterialekorttekst\r\n\tR133-0049\tPSU 5V\r\n'), [{ material: 'R133-0049', description: 'PSU 5V' }])
  assert.throws(() => parseMm60('foo\tbar\r\n'), { code: 'SAP_FORMAT' })
})
