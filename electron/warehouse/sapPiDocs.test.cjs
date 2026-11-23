const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createPiDocWriter } = require('./sapPiDocs.cjs')

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
  const bridge = { exclusive: job => job() }
  const runScript = async (name, args, options) => {
    calls.push({ name, args, options })
    const dir = args[5]
    if (args[1] === 'test') { fs.writeFileSync(path.join(dir, args[6]), testLog); return JSON.stringify({ ok: true, title: 'x' }) }
    if (createResult.ok) fs.writeFileSync(path.join(dir, args[6]), list)
    return JSON.stringify(createResult)
  }
  const writer = createPiDocWriter({ bridge, runScript, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 600 })
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
  await assert.rejects(setup({ createResult: { ok: false, error: 'not-created: x' } }).writer.createDocument(REQUEST), { code: 'PIDOC_NOT_CREATED' })
})

test('a material SAP skipped after F8 is reported as missing', async () => {
  const list = MI22.split('\r\n').slice(0, 5).join('\r\n')
  const result = await setup({ list }).writer.createDocument(REQUEST)
  assert.deepEqual(result, { docs: [{ docNo: '105000900', materials: ['R133-0032'] }], missing: ['R133-0033'] })
})

test('printing: MI21 to the right system, spool only in QS4; cancelling is reported', async () => {
  const calls = []
  const runScript = async (name, args) => { calls.push({ name, args }); return JSON.stringify(args[1] === '105000999' ? { ok: false, error: 'cancelled' } : { ok: true, message: 'Spool request 123 generated' }) }
  const make = system => createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard: null, system, waitSeconds: 300 })
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
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
  assert.deepEqual(await writer.enterSerials({ docNo: '105000893', year: '2026', material: 'int1-0', serials: ['s1', 'S2', 'S1'] }), { counted: 2, serials: 2, newSerials: 0 })
  assert.deepEqual([calls[0].name, calls[0].args.slice(0, 4), calls[0].file], ['pidoc-serials', ['QS4', '105000893', '2026', 'INT1-0'], 'S1\r\nS2'])
  next = { ok: false, error: 'check-errors', errors: 1 }
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: ['S9'] }), error => error.code === 'PIDOC_CHECK_ERRORS' && error.errors[0].serial === 'S9' && /D006/.test(error.errors[0].message))
  await assert.rejects(writer.enterSerials({ docNo: '105000893', year: '2026', material: 'INT1-0', serials: [] }), { code: 'PIDOC_INVALID' })
})

test('serials: SAP\'s counted quantity is read as a SAP number; a count that differs from the serials sent stops', async () => {
  let next
  const runScript = async () => JSON.stringify(next)
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
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

test('pidoc-serials.vbs compares SAP\'s counted quantity with the serials sent, like pidoc-count.vbs', () => {
  const source = fs.readFileSync(path.join(__dirname, 'sap', 'pidoc-serials.vbs'), 'utf8')
  const marked = source.indexOf('If list.GetCellValue(row, "XZAEL") <> "X" Then Finish False, "not-counted", ""')
  const compared = source.indexOf('If CDbl(list.GetCellValue(row, "MENGE")) <> count Then Finish False, "not-counted: " & list.GetCellValue(row, "MENGE"), ""')
  const done = source.indexOf('Finish True, message,')
  assert.ok(marked > 0 && compared > marked && done > compared)
})

test('quantities: MI04 for the whole document; 0 is allowed (Zero Count)', async () => {
  const calls = []
  const runScript = async (name, args) => { calls.push({ name, args, file: fs.readFileSync(path.join(args[3], args[4]), 'utf8') }); return '{"ok":true,"message":"Count entered for phys. inv. doc. 105000894","items":2}' }
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
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
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, system: 'QS4', waitSeconds: 300 })
  const result = await writer.postDocuments({ docNos: ['105000893', '105000894', '105000999'], year: '2026' })
  assert.deepEqual(result.posted, ['105000893', '105000894'])
  assert.deepEqual(result.open, ['105000999'], 'not in MI22 = not confirmed')
  assert.deepEqual(result.materialDocs, { 105000894: '4905204847' })
  assert.equal(result.differences.length, 3)
  assert.deepEqual([calls[0].name, calls[0].args.slice(0, 2), calls[0].args.slice(-2)], ['pidoc-post', ['QS4', '2026'], ['105000893', 'clipboard']])
  assert.deepEqual(clip, ['105000893\r\n105000894\r\n105000999'])
  await assert.rejects(writer.postDocuments({ docNos: [], year: '2026' }), { code: 'PIDOC_INVALID' })
})

const UNKNOWN = { code: 'PIDOC_UNKNOWN', message: 'PIDOC_UNKNOWN: Optælling ved ikke, om SAP har gemt. Tjek dokumentet i SAP (MI03).' }

test('posting: after a timeout MI22 still decides what was posted; a timeout without a status is unknown, never "intet er gemt"', async () => {
  let next
  const runScript = async (name, args) => {
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi20-list.txt'), path.join(args[2], args[3]))
    if (next.ok) fs.copyFileSync(path.join(__dirname, 'fixtures', 'sap', 'pidoc', 'mi22-posted.txt'), path.join(args[2], args[4]))
    return JSON.stringify(next)
  }
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
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
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
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
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard: null, system: 'QS4', waitSeconds: 300 })
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
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 600 })
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
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 600 })
  await assert.rejects(writer.createDocument(REQUEST), /OpenClipboard failed/)
  await assert.rejects(writer.postDocuments({ docNos: ['105000893', '105000894'], year: '2026' }), /OpenClipboard failed/)
  assert.deepEqual(calls, [], 'no SAP script ran with whatever was on the clipboard before')
})

test('Windows silently refusing the clipboard (Electron 44 still resolves) stops SAP before it reads old text', async () => {
  const calls = []
  const runScript = async name => { calls.push(name); return '{"ok":true}' }
  const clipboard = { writeText: async () => {}, readText: async () => '105000111\r\n105000222' }
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard, system: 'QS4', tempRoot: os.tmpdir(), waitSeconds: 600 })
  await assert.rejects(writer.createDocument(REQUEST), { code: 'CLIPBOARD_REFUSED', message: /^CLIPBOARD_REFUSED: Udklipsholderen/ })
  await assert.rejects(writer.postDocuments({ docNos: ['105000893', '105000894'], year: '2026' }), { code: 'CLIPBOARD_REFUSED', message: /^CLIPBOARD_REFUSED: Udklipsholderen/ })
  assert.deepEqual(calls, [], 'MI31/MI20 never start with the old clipboard text')
})

test('a SAP session not logged on in English stops every PI script with "Log på SAP på engelsk"', async () => {
  const names = []
  const runScript = async name => { names.push(name); return '{"ok":false,"error":"language-not-supported"}' }
  const writer = createPiDocWriter({ bridge: { exclusive: job => job() }, runScript, clipboard: null, system: 'PS4', tempRoot: os.tmpdir(), waitSeconds: 300 })
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
