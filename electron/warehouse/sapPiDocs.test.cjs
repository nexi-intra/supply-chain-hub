const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createPiDocWriter } = require('./sapPiDocs.cjs')
const { createSapBridge } = require('./sapBridge.cjs')
const { createFixtureRunner } = require('./sapFixtures.cjs')

const readyFor = system => JSON.stringify({ running: true, scripting: true, connections: [{ disabledByServer: false, sessions: [{ busy: false, popup: false, system, client: '100', user: 'JREMMER', transaction: 'SESSION_MANAGER' }] }] })
const BRIDGE = { exclusive: job => job(), handOver: job => job(() => {}) }

/** A queued SAP job must start soon; a stuck queue fails the test instead of hanging it. */
const soon = (promise, what = 'the queued job') => Promise.race([promise, new Promise((resolve, reject) => setTimeout(() => reject(new Error(`${what} never ran`)), 1000).unref())])
/** SAP is ready: the status check before each write is answered here, so `runScript` only sees the write scripts. */
function writerFor({ runScript, system, ...options }) {
  return createPiDocWriter({ bridge: BRIDGE, runScript: (name, ...rest) => (name === 'status' ? Promise.resolve(readyFor(system)) : runScript(name, ...rest)), system, ...options })
}

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', name), 'utf8')
const MI22 = [
  '\tMaterial\t\t\t\t\tMaterial Description\t\t\t\t\tPlnt\tLocation',
  '\tPhysInvDoc\tItem\tBatch\tPeriod\tPlan. Date\t\tCount Date\tSTy\tPhys. Inv. No.\tDoc. Status',
  '\tR133-0032\t\t\t\t\tcharger\t\t\t\t\tD301\tD000',
  '\t100000784\t1\t\t2026.06\t09.06.2026\t\t09.06.2026\t1\t\t',
  '\t105000900\t1\t\t0000.00\t19.10.2026\t\t\t1\tCPABC123\tDoc. Active',
  '\tR133-0033\t\t\t\t\tcharger\t\t\t\t\tD301\tD000',
  '\t105000900\t2\t\t0000.00\t19.10.2026\t\t\t1\tCPABC123\tDoc. Active',
].join('\r\n')

function setup({ testLog = fixture('mi31-test.txt'), createResult = { ok: true, title: 'PI Documents Were Created Directly' }, list = MI22 } = {}) {
  const calls = []
  const clip = []
  const runScript = async (name, args, options) => {
    calls.push({ name, args, options })
    const dir = args[5]
    if (args[1] === 'test') { fs.writeFileSync(path.join(dir, args[6]), testLog); return JSON.stringify({ ok: true, title: 'x' }) }
    options.onLine({ stage: 'waiting' })
    if (createResult.ok) fs.writeFileSync(path.join(dir, args[6]), list)
    return JSON.stringify(createResult)
  }
  const writer = writerFor({ runScript, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 600 })
  return { writer, calls, clip }
}

const REQUEST = { sloc: 'D000', stockType: 'unrestricted', reference: 'cpabc123', materials: ['R133-0032', 'r133-0033'] }

test('test run first, then the waiting MI31 screen; the documents are found by the reference', async () => {
  const { writer, calls, clip } = setup()
  let waited = 0
  const result = await writer.createDocument(REQUEST, { onWaiting: () => waited++ })
  assert.deepEqual(result, { docs: [{ docNo: '105000900', materials: ['R133-0032', 'R133-0033'] }], missing: [] })
  assert.equal(waited, 1)
  assert.deepEqual(calls.map(call => call.args[1]), ['test', 'create'])
  assert.deepEqual(calls[0].args.slice(0, 5), ['QS4', 'test', 'D000', 'unrestricted', 'CPABC123'])
  assert.deepEqual(calls[1].args.slice(-3), ['600', 'R133-0032', 'clipboard'])
  assert.ok(calls[1].options.timeoutMs > 600000)
  assert.deepEqual(clip, ['R133-0032\r\nR133-0033', 'R133-0032\r\nR133-0033'], 'the materials go on the clipboard before each run')
})

test('nothing is created when the test run does not list every material', async () => {
  const empty = '\uFEFF\r\n*** S t a t i s t i c s ***\r\nTotal Number of Stock Management Units for PI             0\r\nNumber of Errors Found                                    0\r\n'
  const { writer, calls } = setup({ testLog: empty })
  await assert.rejects(writer.createDocument(REQUEST), error => error.code === 'PIDOC_NOT_POSSIBLE' && error.missing.length === 2)
  assert.deepEqual(calls.map(call => call.args[1]), ['test'], 'the create screen is never opened')
})

test('closing SAP without F8 or a timeout is reported; nothing was created', async () => {
  await assert.rejects(setup({ createResult: { ok: false, error: 'cancelled' } }).writer.createDocument(REQUEST), { code: 'PIDOC_CANCELLED' })
  await assert.rejects(setup({ createResult: { ok: false, error: 'timeout' } }).writer.createDocument(REQUEST), { code: 'PIDOC_TIMEOUT' })
  await assert.rejects(setup({ createResult: { ok: false, error: 'mi31-screen-changed' } }).writer.createDocument(REQUEST), { code: 'PIDOC_SAP_FAILED' })
  await assert.rejects(setup({ createResult: { ok: false, error: 'field-not-set: wnd[0]/usr/txtINVNU' } }).writer.createDocument(REQUEST), { code: 'PIDOC_SAP_FAILED' })
})

test('any failure after the user\'s F8 in MI31 is unknown: SAP may have created the documents', async t => {
  t.mock.method(console, 'error', () => {})
  const unknown = { code: 'PIDOC_UNKNOWN', message: 'PIDOC_UNKNOWN: Optælling ved ikke, om SAP har gemt. Tjek dokumentet i SAP (MI03).' }
  for (const error of ['left-mi31', 'not-created: x', 'no-access-mi22', 'mi22-screen-changed', 'created-but-not-found', 'read-failed', 'field-not-set: wnd[0]/usr/ctxtIM_INVNU-LOW']) {
    await assert.rejects(setup({ createResult: { ok: false, error } }).writer.createDocument(REQUEST), error => error.code === unknown.code && error.message === unknown.message && typeof error.detail === 'string', error)
  }
  // A script killed at the time limit after the hand-over, or one whose MI22 list cannot be read.
  const killing = writerFor({ runScript: async (name, args, options) => { if (args[1] === 'test') { fs.writeFileSync(path.join(args[5], args[6]), fixture('mi31-test.txt')); return '{"ok":true}' } options.onLine({ stage: 'waiting' }); throw Object.assign(new Error('SAP_TIMEOUT'), { code: 'SAP_TIMEOUT' }) }, clipboard: { writeText: () => {}, readText: () => 'R133-0032\r\nR133-0033' }, system: 'QS4', waitSeconds: 600 })
  await assert.rejects(killing.createDocument(REQUEST), unknown)
  await assert.rejects(setup({ list: 'not a MI22 list' }).writer.createDocument(REQUEST), unknown)
})

test('a create script that breaks after the hand-over to F8 is unknown; one that breaks in the test run is passed on', async t => {
  t.mock.method(console, 'error', () => {})
  const writer = failAt => writerFor({
    runScript: async (name, args, options) => {
      if (args[1] === 'create') options.onLine({ stage: 'waiting' })
      if (args[1] === failAt) throw Object.assign(new Error('SAP_SCRIPT_FAILED'), { code: 'SAP_SCRIPT_FAILED' })
      fs.writeFileSync(path.join(args[5], args[6]), fixture('mi31-test.txt'))
      return '{"ok":true}'
    },
    clipboard: { writeText: () => {}, readText: () => 'R133-0032\r\nR133-0033' }, system: 'QS4', waitSeconds: 600,
  })
  await assert.rejects(writer('create').createDocument(REQUEST), { code: 'PIDOC_UNKNOWN', detail: 'SAP_SCRIPT_FAILED' })
  await assert.rejects(writer('test').createDocument(REQUEST), { code: 'SAP_SCRIPT_FAILED' })
})

test('a create run that fails before it hands MI31 over has created nothing, whatever the failure', async t => {
  const logged = t.mock.method(console, 'error', () => {})
  const writer = failure => writerFor({
    runScript: async (name, args) => {
      if (args[1] === 'test') { fs.writeFileSync(path.join(args[5], args[6]), fixture('mi31-test.txt')); return '{"ok":true}' }
      return failure()
    },
    clipboard: { writeText: () => {}, readText: () => 'R133-0032\r\nR133-0033' }, system: 'QS4', waitSeconds: 600,
  })
  await assert.rejects(writer(() => '{"ok":false,"error":"left-mi31"}').createDocument(REQUEST), { code: 'PIDOC_SAP_FAILED', message: 'PIDOC_SAP_FAILED: Oprettelsen i MI31 fejlede: left-mi31' })
  await assert.rejects(writer(() => '').createDocument(REQUEST), { code: 'PIDOC_SAP_FAILED' }, 'no answer at all')
  for (const code of ['SAP_TIMEOUT', 'SAP_SCRIPT_FAILED']) {
    await assert.rejects(writer(() => { throw Object.assign(new Error(code), { code }) }).createDocument(REQUEST), error => error.code === 'PIDOC_SAP_FAILED' && /intet er oprettet/i.test(error.message) && error.message.includes(code), code)
  }
  assert.equal(logged.mock.calls.length, 0, 'nothing is logged as unknown')
})

test('MI04, ZMS_COUNT_SERIAL and MI20 killed before the hand-over are a plain timeout: nothing is saved', async () => {
  const runScript = async () => { throw Object.assign(new Error('SAP_TIMEOUT'), { code: 'SAP_TIMEOUT' }) }
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: ['S1'] }), { code: 'SAP_TIMEOUT' })
  await assert.rejects(writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: 3 }] }), { code: 'SAP_TIMEOUT' })
  await assert.rejects(writer.postDocuments({ docNos: ['105000894'], year: '2026' }), { code: 'SAP_TIMEOUT' })
})

test('posting: MI20 or MI22 lists that cannot be read after the user posted are unknown, never "intet er gemt"', async t => {
  t.mock.method(console, 'error', () => {})
  const unknown = { code: 'PIDOC_UNKNOWN', message: 'PIDOC_UNKNOWN: Optælling ved ikke, om SAP har gemt. Tjek dokumentet i SAP (MI03).' }
  const posting = files => writerFor({
    runScript: async (name, args) => {
      for (const [index, text] of Object.entries(files)) fs.writeFileSync(path.join(args[2], args[Number(index)]), text)
      return '{"ok":true,"screens":"x"}'
    },
    clipboard: null, system: 'QS4', waitSeconds: 300,
  })
  await assert.rejects(posting({ 3: 'not a MI20 list', 4: MI22 }).postDocuments({ docNos: ['105000900'], year: '2026' }), unknown)
  await assert.rejects(posting({ 3: fixture('mi20-list.txt'), 4: 'not a MI22 list' }).postDocuments({ docNos: ['105000900'], year: '2026' }), unknown)
  await assert.rejects(posting({}).postDocuments({ docNos: ['105000900'], year: '2026' }), unknown, 'no lists at all')
})

test('a material SAP skipped after F8 is reported as missing', async () => {
  const list = MI22.split('\r\n').slice(0, 5).join('\r\n')
  const result = await setup({ list }).writer.createDocument(REQUEST)
  assert.deepEqual(result, { docs: [{ docNo: '105000900', materials: ['R133-0032'] }], missing: ['R133-0033'] })
})

test('printing: MI21 to the right system, spool only in QS4; cancelling is reported', async () => {
  const calls = []
  const runScript = async (name, args) => { calls.push({ name, args }); return JSON.stringify(args[1] === '105000999' ? { ok: false, error: 'cancelled' } : { ok: true, message: 'Spool request 123 generated' }) }
  const make = system => writerFor({ runScript, clipboard: null, system, waitSeconds: 300 })
  assert.deepEqual(await make('QS4').printDocument({ docNo: '105000893', year: '2026', sloc: 'd000' }), { message: 'Spool request 123 generated' })
  assert.deepEqual(calls[0], { name: 'pidoc-print', args: ['QS4', '105000893', '2026', 'D000', '0', '300'] })
  await make('PS4').printDocument({ docNo: '105000893', year: '2026', sloc: 'D000' })
  assert.equal(calls[1].args[4], '1', 'Print Now outside the test system')
  await assert.rejects(make('QS4').printDocument({ docNo: '105000999', year: '2026', sloc: 'D000' }), { code: 'PIDOC_CANCELLED' })
  await assert.rejects(make('QS4').printDocument({ docNo: 'x', year: '2026', sloc: 'D000' }), { code: 'PIDOC_INVALID' })
})

test('serials: ZMS_COUNT_SERIAL per material; Check errors come back per serial and nothing is updated', async () => {
  const calls = []
  let next = { ok: true, message: '', newSerials: 0, counted: '2', serials: '2' }
  const runScript = async (name, args) => {
    calls.push({ name, args, file: fs.readFileSync(path.join(args[4], args[5]), 'utf8') })
    if (next.error === 'check-errors') fs.writeFileSync(path.join(args[4], args[6]), '\uFEFFS9\tThis serialnumber is in storage loc D006 according to system (EQBS)\r\n')
    return JSON.stringify(next)
  }
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  assert.deepEqual(await writer.enterSerials({ docNo: '105000893', year: '2026', material: 'int1-0', serials: ['s1', 'S2', 'S1'] }), { counted: 2, serials: 2, newSerials: 0 })
  assert.deepEqual([calls[0].name, calls[0].args.slice(0, 4), calls[0].file], ['pidoc-serials', ['QS4', '105000893', '2026', 'INT1-0'], 'S1\r\nS2'])
  next = { ok: false, error: 'check-errors', errors: 1 }
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: ['S9'] }), error => error.code === 'PIDOC_CHECK_ERRORS' && error.errors[0].serial === 'S9' && /D006/.test(error.errors[0].message))
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: [] }), { code: 'PIDOC_INVALID' })
})

test('serials: SAP\'s counted quantity is read as a SAP number; a count that differs from the serials sent stops', async () => {
  let next
  const runScript = async () => JSON.stringify(next)
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  const many = Array.from({ length: 1234 }, (_, index) => `S${index}`)
  next = { ok: true, message: '', newSerials: 0, counted: '1.234', serials: '1234' }
  assert.equal((await writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: many })).counted, 1234, '"1.234" is 1234, not 1.234')
  next = { ok: true, message: '', newSerials: 0, counted: '12,000', serials: '12' }
  assert.equal((await writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: many.slice(0, 12) })).counted, 12, '"12,000" is 12')
  next = { ok: false, error: 'not-counted: 11' }
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: many.slice(0, 12) }), error => error.code === 'PIDOC_NOT_COUNTED' && error.counted === 11 && /11/.test(error.message) && /12 serienumre/.test(error.message))
  next = { ok: false, error: 'not-counted' }
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: ['S1'] }), { code: 'PIDOC_NOT_COUNTED', message: 'PIDOC_NOT_COUNTED: INT1-0 står ikke som talt i SAP' })
})

test('pidoc-serials.vbs compares SAP\'s counted quantity with the serials sent as text, independent of the Windows locale', () => {
  const source = fs.readFileSync(path.join(__dirname, 'sap', 'pidoc-serials.vbs'), 'utf8')
  const marked = source.indexOf('If list.GetCellValue(row, "XZAEL") <> "X" Then Finish False, "not-counted", ""')
  const read = source.indexOf('menge = Trim(list.GetCellValue(row, "MENGE"))')
  const compared = source.indexOf('If Not OnlyDigits(counted) Or counted <> CStr(count) Then Finish False, "not-counted: " & menge, ""')
  const done = source.indexOf('Finish True, message,')
  assert.ok(marked > 0 && read > marked && compared > read && done > compared)
  assert.doesNotMatch(source, /CDbl\(/, 'CDbl reads "1.234" by the Windows locale')
  assert.match(source, /^Dim [^\r\n]*\bcounted, comma, menge\b/m, 'declared (Option Explicit)')
  assert.match(source, /^Function OnlyDigits\(value\)\r$/m)
})

test('the MI04 read-back lets a wanted material missing from the grid pass, as before (until QS4 shows the grid lists non-serial materials)', () => {
  const source = fs.readFileSync(path.join(__dirname, 'sap', 'pidoc-count.vbs'), 'utf8')
  assert.doesNotMatch(source, /\bmatched\b/)
  assert.match(source, /^If Err\.Number <> 0 Then Err\.Clear : Finish False, "verify-failed", ""\r\nIf Len\(wrong\) > 0 Then Finish False, "not-counted: " & Trim\(wrong\), ""\r$/m)
})

test('quantities: MI04 for the whole document; 0 is allowed (Zero Count)', async () => {
  const calls = []
  const runScript = async (name, args) => { calls.push({ name, args, file: fs.readFileSync(path.join(args[3], args[4]), 'utf8') }); return '{"ok":true,"message":"Count entered for phys. inv. doc. 105000894","items":2}' }
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  assert.deepEqual(await writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'r133-0032', qty: 480 }, { material: 'R133-0033', qty: 0 }] }), { message: 'Count entered for phys. inv. doc. 105000894' })
  assert.deepEqual([calls[0].name, calls[0].args.slice(0, 3), calls[0].file], ['pidoc-count', ['QS4', '105000894', '2026'], 'R133-0032\t480\r\nR133-0033\t0'])
  await assert.rejects(writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: -1 }] }), { code: 'PIDOC_INVALID' })
  await assert.rejects(writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: 1.5 }] }), { code: 'PIDOC_INVALID' })
})

test('posting: MI20 for several documents; MI22 decides what was posted; the material document comes from the message', async () => {
  const calls = []
  const clip = []
  const runScript = async (name, args) => {
    calls.push({ name, args })
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi20-list.txt'), path.join(args[2], args[3]))
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi22-posted.txt'), path.join(args[2], args[4]))
    return JSON.stringify({ ok: true, ticked: 1, screens: 'SAPMSSY0/120/1 > SAPMM07I/701/1 [] > SAPMSSY0/120/1 [Diffs in phys. inv. doc. 105000894 posted with m. doc. 4905204847]' })
  }
  const writer = writerFor({ runScript, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, system: 'QS4', waitSeconds: 300 })
  const result = await writer.postDocuments({ docNos: ['105000893', '105000894', '105000999'], year: '2026' })
  assert.deepEqual(result.posted, ['105000893', '105000894'])
  assert.deepEqual(result.open, [], 'nothing MI22 lists as active')
  assert.deepEqual(result.unknown, ['105000999'], 'not in MI22 = unknown, never "open"')
  assert.deepEqual(result.materialDocs, { 105000894: '4905204847' })
  assert.equal(result.differences.length, 3)
  assert.deepEqual([calls[0].name, calls[0].args.slice(0, 2), calls[0].args.slice(-4)], ['pidoc-post', ['QS4', '2026'], ['105000893', '105000893', '105000999', 'clipboard']])
  assert.deepEqual(clip, ['105000893\r\n105000894\r\n105000999'])
  await assert.rejects(writer.postDocuments({ docNos: [], year: '2026' }), { code: 'PIDOC_INVALID' })
})

test('posting: MI22 gets the lowest and highest chosen number; a document in between that was not chosen is ignored', async () => {
  const calls = []
  const runScript = async (name, args) => {
    calls.push(args)
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi20-list.txt'), path.join(args[2], args[3]))
    fs.writeFileSync(path.join(args[2], args[4]), MI22)
    return JSON.stringify({ ok: true, ticked: 1, screens: 'SAPMSSY0/120/1' })
  }
  const clip = []
  const writer = writerFor({ runScript, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, system: 'QS4', waitSeconds: 300 })
  const result = await writer.postDocuments({ docNos: ['105000999', '100000784'], year: '2026' })
  assert.deepEqual(calls[0].slice(6), ['105000999', '100000784', '105000999', 'clipboard'], 'not sorted: still the smallest and largest')
  assert.deepEqual([result.posted, result.open, result.unknown], [['100000784'], [], ['105000999']], '105000900 is in the interval but was not chosen')
  await writer.postDocuments({ docNos: ['999999999', '1000000000', '999999998'], year: '2026' })
  assert.deepEqual(calls[1].slice(7, 9), ['999999998', '1000000000'], 'compared as numbers, not as text')
  await writer.postDocuments({ docNos: ['105000894'], year: '2026' })
  assert.deepEqual(calls[2].slice(6), ['105000894', '105000894', '105000894'], 'one document: low = high, no clipboard')
})

const UNKNOWN = { code: 'PIDOC_UNKNOWN', message: 'PIDOC_UNKNOWN: Optælling ved ikke, om SAP har gemt. Tjek dokumentet i SAP (MI03).' }

test('posting: after a timeout MI22 still decides what was posted; a timeout without a status is unknown, never "intet er gemt"', async () => {
  let next
  const runScript = async (name, args) => {
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi20-list.txt'), path.join(args[2], args[3]))
    if (next.ok) fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi22-posted.txt'), path.join(args[2], args[4]))
    return JSON.stringify(next)
  }
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  next = { ok: true, ticked: 1, timedOut: true, screens: 'SAPMSSY0/120/1 > SAPMM07I/701/1 []' }
  const result = await writer.postDocuments({ docNos: ['105000894'], year: '2026' })
  assert.deepEqual([result.posted, result.open], [['105000894'], []])
  for (const error of ['read-failed', 'status-not-found', 'mi22-screen-changed']) {
    next = { ok: false, error, timedOut: true, screens: '' }
    await assert.rejects(writer.postDocuments({ docNos: ['105000894'], year: '2026' }), UNKNOWN)
  }
  next = { ok: false, error: 'closed-unknown', screens: '' }
  await assert.rejects(writer.postDocuments({ docNos: ['105000894'], year: '2026' }), UNKNOWN, 'window closed and no session to read the status')
  next = { ok: false, error: 'read-failed', screens: '' }
  await assert.rejects(writer.postDocuments({ docNos: ['105000894'], year: '2026' }), { code: 'PIDOC_SAP_FAILED' }, 'before the hand-over nothing is posted')
})

test('MI04 and ZMS_COUNT_SERIAL after a timeout: the read-back decides; when it fails the state is unknown', async () => {
  let next
  const runScript = async () => JSON.stringify(next)
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  const counts = () => writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: 3 }] })
  const serials = () => writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: ['S1', 'S2'] })
  next = { ok: true, message: '', items: 1, timedOut: true }
  assert.deepEqual(await counts(), { message: '' }, 'saved and read back: done')
  next = { ok: true, message: '', newSerials: 0, counted: '2', serials: '2', timedOut: true }
  assert.equal((await serials()).counted, 2)
  next = { ok: false, error: 'verify-failed', timedOut: true }
  await assert.rejects(counts(), UNKNOWN)
  await assert.rejects(serials(), UNKNOWN)
  next = { ok: false, error: 'not-counted: R1', timedOut: true }
  await assert.rejects(counts(), { code: 'PIDOC_NOT_COUNTED' }, 'read back: SAP does not have it')
  next = { ok: false, error: 'not-counted', timedOut: true }
  await assert.rejects(serials(), { code: 'PIDOC_NOT_COUNTED' })
})

test('posting: a document MI22 lists as active is open; one MI22 does not list is unknown', async () => {
  const runScript = async (name, args) => {
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi20-list.txt'), path.join(args[2], args[3]))
    fs.writeFileSync(path.join(args[2], args[4]), MI22)
    return JSON.stringify({ ok: true, ticked: 1, screens: 'SAPMSSY0/120/1' })
  }
  const clip = []
  const writer = writerFor({ runScript, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, system: 'QS4', waitSeconds: 300 })
  const result = await writer.postDocuments({ docNos: ['100000784', '105000900', '105000999'], year: '2026' })
  assert.deepEqual([result.posted, result.open, result.unknown], [['100000784'], ['105000900'], ['105000999']])
})

test('posting: any failure after the hand-over (the screens are logged) is unknown; MI22 checks its document selection', async () => {
  let next
  const runScript = async (name, args) => { fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi20-list.txt'), path.join(args[2], args[3])); return JSON.stringify(next) }
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  next = { ok: false, error: "field-not-set: wnd[0]/usr/txtIM_IBLNR-LOW = 'HELLO'", screens: 'SAPMSSY0/120/1 > SAPMM07I/701/1 []' }
  await assert.rejects(writer.postDocuments({ docNos: ['105000894'], year: '2026' }), UNKNOWN)
  next = { ok: false, error: "field-not-set: wnd[0]/usr/txtIM_IBLNR-LOW = ''", screens: '' }
  await assert.rejects(writer.postDocuments({ docNos: ['105000894'], year: '2026' }), { code: 'PIDOC_SAP_FAILED' }, 'MI20 before the hand-over: nothing posted')
  const source = fs.readFileSync(path.join(__dirname, 'sap', 'pidoc-post.vbs'), 'utf8')
  const mi22 = source.indexOf('okcd").Text = "/nMI22"')
  assert.ok(mi22 > 0)
  assert.equal(source.slice(mi22).includes('UploadClipboard'), false, 'MI22 never reads the clipboard, which the user may have changed while posting')
  const lines = source.slice(mi22).split('\r\n')
  const cleared = lines.findIndex(line => line.endsWith('"txtBUCHP-LOW", "txtBUCHP-HIGH", "ctxtPA_VARI"), ""'))
  assert.ok(cleared > 0)
  assert.deepEqual(lines.slice(cleared + 1, cleared + 5), [
    's.findById("wnd[0]/usr/txtIM_IBLNR-LOW").Text = lowDoc',
    's.findById("wnd[0]/usr/txtIM_IBLNR-HIGH").Text = highDoc',
    'Check "wnd[0]/usr/txtIM_IBLNR-LOW", lowDoc',
    'Check "wnd[0]/usr/txtIM_IBLNR-HIGH", highDoc',
  ], 'MI22 is filled with the interval after the fields are cleared, and both ends are checked')
  assert.ok(source.includes('\r\nlowDoc = WScript.Arguments(7)\r\nhighDoc = WScript.Arguments(8)\r\nfromClipboard = (WScript.Arguments.Count > 9)\r\n'))
  const sub = source.indexOf('Sub UploadClipboard(')
  assert.match(source.slice(sub, source.indexOf('End Sub', sub)), /\r\n  Next\r\n  Finish False, "multiple-selection-failed"\r\n$/, 'three failed uploads stop the script')
})

test('MI04 and ZMS_COUNT_SERIAL: a failed read-back is unknown, also without a timeout', async () => {
  const runScript = async () => '{"ok":false,"error":"verify-failed"}'
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  await assert.rejects(writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: 3 }] }), UNKNOWN)
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: ['S1'] }), UNKNOWN)
})

test('a script killed at the time limit while the user may have saved is unknown, not "Prøv igen"', async () => {
  const runScript = async (name, args, options) => { options.onLine({ stage: 'waiting' }); throw Object.assign(new Error('SAP_TIMEOUT'), { code: 'SAP_TIMEOUT' }) }
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: ['S1'] }), UNKNOWN)
  await assert.rejects(writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: 3 }] }), UNKNOWN)
  await assert.rejects(writer.postDocuments({ docNos: ['105000894'], year: '2026' }), UNKNOWN)
  const failing = writerFor({ runScript: async () => { throw Object.assign(new Error('SAP_SCRIPT_FAILED'), { code: 'SAP_SCRIPT_FAILED' }) }, clipboard: null, system: 'QS4', waitSeconds: 300 })
  await assert.rejects(failing.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: 3 }] }), { code: 'SAP_SCRIPT_FAILED' }, 'other failures are passed on')
})

test('an unknown state is logged with the script and SAP\'s detail; the message stays the plain text', async t => {
  const logged = t.mock.method(console, 'error', () => {})
  let next = '{"ok":false,"error":"verify-failed"}'
  const runScript = async (name, args, options) => { if (next instanceof Error) { options.onLine({ stage: 'waiting' }); throw next } return next }
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  await assert.rejects(writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: 3 }] }), UNKNOWN)
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: ['S1'] }), UNKNOWN)
  next = '{"ok":false,"error":"read-failed","screens":"SAPMSSY0/120/1"}'
  await assert.rejects(writer.postDocuments({ docNos: ['105000894'], year: '2026' }), UNKNOWN)
  next = Object.assign(new Error('SAP_TIMEOUT'), { code: 'SAP_TIMEOUT' })
  await assert.rejects(writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: 3 }] }), UNKNOWN)
  assert.deepEqual(logged.mock.calls.map(call => call.arguments), [
    ['CountPoint: PI document state unknown', 'pidoc-count', 'verify-failed'],
    ['CountPoint: PI document state unknown', 'pidoc-serials', 'verify-failed'],
    ['CountPoint: PI document state unknown', 'pidoc-post', 'read-failed'],
    ['CountPoint: PI document state unknown', 'pidoc-count', 'SAP_TIMEOUT'],
  ])
})

test('the waiting scripts read SAP back after a timeout instead of ending with "timeout"', () => {
  for (const name of ['pidoc-post.vbs', 'pidoc-count.vbs', 'pidoc-serials.vbs']) {
    const source = fs.readFileSync(path.join(__dirname, 'sap', name), 'utf8')
    assert.doesNotMatch(source, /Finish False, "timeout"/, `${name} does not give up on a timeout`)
    assert.match(source, /^Dim [^\r\n]*\btimedOut\b/m, `${name}: timedOut is declared (Option Explicit)`)
    assert.match(source, /^\s*(If i > waitSeconds \* 2 Then )?timedOut = True\r$/m, `${name}: a timeout is remembered`)
    assert.match(source, /If timedOut Then [^\r\n]*""timedOut"":true/, `${name}: the answer says it timed out`)
  }
})

test('deleting: only CountPoint documents; deleted = SAP message and no longer active in MI22', async () => {
  let next = { ok: true, message: 'Physical inventory document 105000903 deleted', screens: '' }
  const calls = []
  const runScript = async (name, args) => { calls.push({ name, args }); fs.writeFileSync(path.join(args[4], args[5]), '\tMaterial\tPlnt\tLocation\r\n\tPhysInvDoc\tItem\tPlan. Date\tSTy\tPhys. Inv. No.\tDoc. Status\r\n\tList does not contain any data'); return JSON.stringify(next) }
  const writer = writerFor({ runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  assert.deepEqual(await writer.deleteDocument({ docNo: '105000903', year: '2026', reference: 'cpmvgftism' }), { deleted: true, message: 'Physical inventory document 105000903 deleted' })
  assert.deepEqual([calls[0].name, calls[0].args.slice(0, 4)], ['pidoc-delete', ['QS4', '105000903', '2026', 'CPMVGFTISM']])
  next = { ok: false, error: 'not-countpoint-document' }
  await assert.rejects(writer.deleteDocument({ docNo: '105000903', year: '2026', reference: 'CPX12345' }), { code: 'PIDOC_FORBIDDEN' })
  next = { ok: true, message: '', screens: '' }
  await assert.rejects(writer.deleteDocument({ docNo: '105000903', year: '2026', reference: 'CPX12345' }), { code: 'PIDOC_NOT_DELETED' })
  await assert.rejects(writer.deleteDocument({ docNo: '105000903', year: '2026', reference: '' }), { code: 'PIDOC_INVALID' })
})

// Electron 44's clipboard is async: the text is on the system clipboard only once writeText has resolved.
function electron44Clipboard() {
  const clipboard = { current: 'old clipboard text' }
  clipboard.writeText = text => new Promise(resolve => setTimeout(() => { clipboard.current = text; resolve() }, 5))
  clipboard.readText = () => Promise.resolve(clipboard.current)
  return clipboard
}

test('Electron 44 clipboard: MI31 and MI20 start only when the clipboard really holds the list', async () => {
  const clipboard = electron44Clipboard()
  const seen = []
  const runScript = async (name, args) => {
    seen.push({ name, mode: args[1], clipboard: clipboard.current })
    if (name === 'pidoc-post') {
      fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi20-list.txt'), path.join(args[2], args[3]))
      fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi22-posted.txt'), path.join(args[2], args[4]))
      return JSON.stringify({ ok: true, ticked: 1, screens: '' })
    }
    fs.writeFileSync(path.join(args[5], args[6]), args[1] === 'test' ? fixture('mi31-test.txt') : MI22)
    return JSON.stringify({ ok: true, title: 'x' })
  }
  const writer = writerFor({ runScript, clipboard, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 600 })
  await writer.createDocument(REQUEST)
  await writer.postDocuments({ docNos: ['105000893', '105000894'], year: '2026' })
  assert.deepEqual(seen, [
    { name: 'pidoc-create', mode: 'test', clipboard: 'R133-0032\r\nR133-0033' },
    { name: 'pidoc-create', mode: 'create', clipboard: 'R133-0032\r\nR133-0033' },
    { name: 'pidoc-post', mode: '2026', clipboard: '105000893\r\n105000894' },
  ])
})

test('a clipboard that refuses the text stops the SAP document before SAP is touched', async () => {
  const calls = []
  const runScript = async name => { calls.push(name); return '{"ok":true}' }
  const clipboard = { writeText: () => Promise.reject(new Error('OpenClipboard failed')) }
  const writer = writerFor({ runScript, clipboard, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 600 })
  await assert.rejects(writer.createDocument(REQUEST), /OpenClipboard failed/)
  await assert.rejects(writer.postDocuments({ docNos: ['105000893', '105000894'], year: '2026' }), /OpenClipboard failed/)
  assert.deepEqual(calls, [], 'no SAP script ran with whatever was on the clipboard before')
})

test('Windows silently refusing the clipboard (Electron 44 still resolves) stops SAP before it reads old text', async () => {
  const calls = []
  const runScript = async name => { calls.push(name); return '{"ok":true}' }
  const clipboard = { writeText: async () => {}, readText: async () => '105000111\r\n105000222' }
  const writer = writerFor({ runScript, clipboard, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 600 })
  await assert.rejects(writer.createDocument(REQUEST), { code: 'CLIPBOARD_REFUSED', message: /^CLIPBOARD_REFUSED: Udklipsholderen/ })
  await assert.rejects(writer.postDocuments({ docNos: ['105000893', '105000894'], year: '2026' }), { code: 'CLIPBOARD_REFUSED', message: /^CLIPBOARD_REFUSED: Udklipsholderen/ })
  assert.deepEqual(calls, [], 'MI31/MI20 never start with the old clipboard text')
})

test('a SAP session not logged on in English stops every PI script with "Log på SAP på engelsk"', async () => {
  const names = []
  const runScript = async name => { names.push(name); return '{"ok":false,"error":"language-not-supported"}' }
  const writer = writerFor({ runScript, clipboard: null, system: 'PS4', tempRoot: os.tmpdir(), waitSeconds: 300 })
  const refused = { code: 'PIDOC_SAP_LANGUAGE', message: 'PIDOC_SAP_LANGUAGE: Log på SAP på engelsk (EN), og prøv igen' }
  await assert.rejects(writer.createDocument({ ...REQUEST, materials: ['R133-0032'] }), refused)
  await assert.rejects(writer.printDocument({ docNo: '105000893', year: '2026', sloc: 'D000' }), refused)
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: ['S1'] }), refused)
  await assert.rejects(writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: 1 }] }), refused)
  await assert.rejects(writer.postDocuments({ docNos: ['105000894'], year: '2026' }), refused)
  await assert.rejects(writer.deleteDocument({ docNo: '105000903', year: '2026', reference: 'CPX12345' }), refused)
  assert.deepEqual(names, ['pidoc-create', 'pidoc-print', 'pidoc-serials', 'pidoc-count', 'pidoc-post', 'pidoc-delete'])
})

// The scripts cannot run here (they change SAP); their source is checked instead.
const PI_SCRIPTS = fs.readdirSync(path.join(__dirname, 'sap')).filter(name => /^pidoc-.*\.vbs$/.test(name))

test('every PI script refuses a non-English logon after the system check and before any transaction is filled', () => {
  assert.deepEqual(PI_SCRIPTS.sort(), ['pidoc-count.vbs', 'pidoc-create.vbs', 'pidoc-delete.vbs', 'pidoc-post.vbs', 'pidoc-print.vbs', 'pidoc-serials.vbs'])
  for (const name of PI_SCRIPTS) {
    const source = fs.readFileSync(path.join(__dirname, 'sap', name), 'utf8')
    const system = source.indexOf('"wrong-system"')
    const refusal = source.indexOf('If logonLanguage <> "EN" And logonLanguage <> "E" Then Finish False, "language-not-supported"')
    const firstTransaction = source.indexOf('okcd").Text = "/n', source.indexOf('\nsystemName = WScript.Arguments(0)'))
    assert.ok(system > 0 && refusal > system, `${name}: the language is checked after the system`)
    assert.ok(firstTransaction > refusal, `${name}: the language is checked before the first transaction`)
    assert.match(source, /^Dim logonLanguage\r$/m, `${name}: logonLanguage is declared (Option Explicit)`)
    assert.match(source, /^logonLanguage = UCase\(Trim\(CStr\(s\.Info\.Language\)\)\)\r$/m, `${name}: reads the session's logon language`)
  }
})

// Every script that opens its own SAP session: the six PI scripts, sap-show and the two Softwareload writes.
const SESSION_SCRIPTS = [...PI_SCRIPTS, 'sap-show.vbs', 'sl-transfer.vbs', 'sl-block.vbs']
const CONNECTION_FUNCTIONS = [
  'Function ConnectionMatches(c, wantedSystem, wantedClient)',
  '  On Error Resume Next',
  '  Dim n, sys, cl',
  '  ConnectionMatches = False',
  '  n = 0',
  '  sys = ""',
  '  cl = ""',
  '  Err.Clear',
  '  n = c.Children.Count',
  '  If Err.Number <> 0 Or n = 0 Then Err.Clear : Exit Function',
  '  sys = CStr(c.Children(0).Info.SystemName)',
  '  cl = CStr(c.Children(0).Info.Client)',
  '  If Err.Number <> 0 Then Err.Clear : Exit Function',
  '  ConnectionMatches = (sys = wantedSystem And cl = wantedClient)',
  'End Function',
  '',
  "' The first connection to <wantedSystem> in <wantedClient>; never another system or client.",
  'Function SystemConnection(engine, wantedSystem, wantedClient)',
  '  On Error Resume Next',
  '  Dim n, total, candidate',
  '  Set SystemConnection = Nothing',
  '  total = 0',
  '  total = engine.Children.Count',
  '  For n = 0 To total - 1',
  '    Set candidate = Nothing',
  '    Set candidate = engine.Children(CInt(n))',
  '    If ConnectionMatches(candidate, wantedSystem, wantedClient) Then Set SystemConnection = candidate : Exit Function',
  '  Next',
  '  Err.Clear',
  'End Function',
].join('\r\n')

test('every session script picks the first connection to the system and client, waits 30 s for its session and checks both', () => {
  for (const name of SESSION_SCRIPTS) {
    const source = fs.readFileSync(path.join(__dirname, 'sap', name), 'utf8')
    const lines = source.split('\r\n')
    assert.ok(/^Dim [^\r\n]*\bclient\b/m.test(source), `${name}: client is declared (Option Explicit)`)
    const read = lines.indexOf('client = CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_CLIENT")')
    assert.ok(read > 0, `${name}: reads the client CountPoint expects`)
    assert.match(lines[read + 1], /^If Len\(client\) = 0 Then Finish False, "arguments"(, "")?$/, `${name}: no client, no run`)
    assert.ok(read < lines.findIndex(line => line.includes('GetObject("SAPGUI")')), `${name}: the client is known before SAP is touched`)
    // Under On Error Resume Next an error in an If condition runs the Then branch: the connection's details are read only
    // in ConnectionMatches, which cannot raise, and the search stops only on its confirmed match.
    assert.ok(source.includes(CONNECTION_FUNCTIONS), `${name}: the guarded connection pick`)
    assert.equal(source.split('Function ConnectionMatches(').length, 2, `${name}: one matcher`)
    assert.deepEqual(lines.filter(line => /\bInfo\.(SystemName|Client)\b/.test(line) && !/^If s\.Info\.SystemName <> /.test(line.trim())), ['  sys = CStr(c.Children(0).Info.SystemName)', '  cl = CStr(c.Children(0).Info.Client)'], `${name}: no other place reads a connection's system or client`)
    assert.deepEqual(lines.filter(line => line.includes('SystemConnection(app')), ['Set conn = SystemConnection(app, systemName, client)'], `${name}: asks for the system and the client`)
    const created = lines.flatMap((line, index) => (line.trim() === 'base.CreateSession' ? [index] : []))
    assert.ok(created.length > 0, name)
    for (const index of created) {
      assert.deepEqual(lines.slice(index + 1, index + 5).map(line => line.trim()), ['For i = 1 To 300', 'If conn.Children.Count > before Then Exit For', 'WScript.Sleep 100', 'Next'], `${name}: waits up to 30 s for the new session`)
    }
    const checks = lines.filter(line => line.includes('"wrong-system"'))
    assert.equal(checks.length, created.length, `${name}: every new session is checked`)
    for (const line of checks) assert.match(line.trim(), /^If s\.Info\.SystemName <> systemName Or s\.Info\.Client <> client Then (Err\.Clear : )?Finish False, "wrong-system"(, "")?$/, `${name}: system and client`)
  }
})

test('every PI script says {"stage":"waiting"} right before it waits for the user; pidoc-create only when creating', () => {
  const STAGE = 'WScript.StdOut.WriteLine "{""stage"":""waiting""}"'
  for (const name of PI_SCRIPTS) {
    const lines = fs.readFileSync(path.join(__dirname, 'sap', name), 'utf8').split('\r\n')
    assert.equal(lines.filter(line => line.includes('stage')).length, 1, `${name}: one stage line`)
    const wait = lines.indexOf('For i = 1 To waitSeconds * 2')
    assert.ok(wait > 0, name)
    assert.equal(lines.indexOf('For i = 1 To waitSeconds * 2', wait + 1), -1, `${name}: one wait for the user`)
    assert.equal(lines[wait - 1], STAGE, `${name}: the stage line comes right before the wait`)
  }
  const create = fs.readFileSync(path.join(__dirname, 'sap', 'pidoc-create.vbs'), 'utf8').split('\r\n')
  const createMode = create.indexOf('If Not s.findById("wnd[0]/usr/radCALL_FB").Selected Then Finish False, "field-not-set: CALL_FB"')
  assert.ok(createMode > create.indexOf('If mode = "test" Then', create.indexOf('Check "wnd[0]/usr/txtINVNU", reference')), 'the test run has ended before')
  assert.ok(create.indexOf(STAGE) > createMode, 'never in test mode')
})

test('one material needs no clipboard; bad requests and a second run at once are refused', async () => {
  const { writer, calls, clip } = setup()
  await writer.createDocument({ ...REQUEST, materials: ['R133-0032'] })
  assert.equal(calls[0].args.includes('clipboard'), false)
  assert.equal(clip.length, 0)
  await assert.rejects(writer.createDocument({ ...REQUEST, reference: 'x y' }), { code: 'PIDOC_INVALID' })
  await assert.rejects(writer.createDocument({ ...REQUEST, stockType: 'qi' }), { code: 'PIDOC_INVALID' })
  const slow = setup()
  const first = slow.writer.createDocument(REQUEST)
  await assert.rejects(slow.writer.createDocument(REQUEST), { code: 'PIDOC_BUSY' })
  await first
})

// Every write in createPiDocWriter, with the options (onWaiting) it is called with.
const WRITES = {
  create: (writer, options) => writer.createDocument(REQUEST, options),
  print: (writer, options) => writer.printDocument({ docNo: '105000893', year: '2026', sloc: 'D000' }, options),
  serials: (writer, options) => writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: ['S1', 'S2'] }, options),
  count: (writer, options) => writer.enterCounts({ docNo: '105000894', year: '2026', entries: [{ material: 'R1', qty: 3 }] }, options),
  post: (writer, options) => writer.postDocuments({ docNos: ['105000893', '105000894'], year: '2026' }, options),
  delete: (writer, options) => writer.deleteDocument({ docNo: '105000903', year: '2026', reference: 'CPX12345' }, options),
}
const isHandOver = (name, args) => name !== 'status' && !(name === 'pidoc-create' && args[1] === 'test')

test('every PI write checks SAP (system and client 100) first and runs no write script when SAP is not ready', async () => {
  const names = []
  const clip = []
  const otherClient = JSON.stringify({ running: true, scripting: true, connections: [{ disabledByServer: false, sessions: [{ busy: false, popup: false, system: 'QS4', client: '200', user: 'JREMMER', transaction: 'SESSION_MANAGER' }] }] })
  const runScript = async name => { names.push(name); return name === 'status' ? otherClient : '{"ok":true}' }
  const writer = createPiDocWriter({ bridge: BRIDGE, runScript, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 300 })
  for (const [name, write] of Object.entries(WRITES)) {
    let waited = 0
    await assert.rejects(write(writer, { onWaiting: () => waited++ }), { code: 'SAP_NOT_READY', sapState: 'wrong-system' }, name)
    assert.equal(waited, 0, name)
  }
  assert.deepEqual(names, Object.keys(WRITES).map(() => 'status'), 'only the status script ran')
  assert.deepEqual(clip, [], 'not even the clipboard was touched')
})

test('every PI write holds the SAP queue from the status check until the script hands SAP to the user', async () => {
  for (const [name, write] of Object.entries(WRITES)) {
    const order = []
    const clip = []
    const fixtures = createFixtureRunner(path.join(__dirname, 'fixtures', 'sap'), { readClipboard: () => clip.at(-1), system: 'QS4' })
    let other, finish
    const bridge = createSapBridge({ runScript: fixtures, expected: { system: 'QS4', client: '100' } })
    const runScript = async (script, args, options) => {
      if (script === 'status') {
        order.push('status')
        other = bridge.exclusive(async () => order.push('other'))
      } else if (isHandOver(script, args)) {
        order.push('script')
        await new Promise(resolve => setImmediate(resolve))
        options.onLine({ stage: 'waiting' })
        await new Promise(resolve => { finish = resolve })
        order.push('script:end')
      } else order.push('test run')
      return fixtures(script, args, options)
    }
    const writer = createPiDocWriter({ bridge, runScript, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 300 })
    const writing = write(writer, { onWaiting: () => order.push('onWaiting') })
    writing.catch(() => {})
    for (let turn = 0; !finish && turn < 100; turn++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.ok(finish, `${name}: the script hands SAP over (${order.join(', ')})`)
    await soon(other, `${name}: another SAP job`)
    assert.deepEqual(order, ['status', ...(name === 'create' ? ['test run'] : []), 'script', 'onWaiting', 'other'], `${name}: another SAP job runs only once the user has SAP`)
    finish()
    await writing
    assert.equal(order.at(-1), 'script:end', name)
  }
})

test('a PI script that fails before the hand-over never calls onWaiting and frees the SAP queue', async t => {
  t.mock.method(console, 'error', () => {})
  for (const [name, write] of Object.entries(WRITES)) {
    for (const failure of [() => '{"ok":false,"error":"sap-busy"}', () => { throw Object.assign(new Error('SAP_SCRIPT_FAILED'), { code: 'SAP_SCRIPT_FAILED' }) }]) {
      const clip = []
      const fixtures = createFixtureRunner(path.join(__dirname, 'fixtures', 'sap'), { readClipboard: () => clip.at(-1), system: 'QS4' })
      const bridge = createSapBridge({ runScript: fixtures, expected: { system: 'QS4', client: '100' } })
      let other
      const runScript = async (script, args, options) => {
        if (script === 'status') other = bridge.exclusive(async () => 'other ran')
        if (isHandOver(script, args)) return failure()
        return fixtures(script, args, options)
      }
      const writer = createPiDocWriter({ bridge, runScript, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 300 })
      let waited = 0
      await assert.rejects(write(writer, { onWaiting: () => waited++ }), undefined, name)
      assert.equal(waited, 0, name)
      assert.equal(await soon(other, `${name}: another SAP job`), 'other ran', `${name}: the queue is free again`)
    }
  }
})
