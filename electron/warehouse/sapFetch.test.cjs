const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createSapBridge } = require('./sapBridge.cjs')
const { createSapFetcher } = require('./sapFetch.cjs')

const FIXTURES = path.join(__dirname, 'fixtures', 'sap')
const READY = JSON.stringify({ running: true, scripting: true, connections: [{ disabledByServer: false, sessions: [{ busy: false, popup: false, system: 'PS4', client: '100', user: 'D00K418', transaction: 'SESSION_MANAGER' }] }] })
const NOT_LOGGED_IN = JSON.stringify({ running: true, scripting: true, connections: [{ disabledByServer: false, sessions: [{ busy: false, popup: false, system: 'PS4', client: '100', user: '', transaction: 'S000' }] }] })
const FILES = { mb52: 'mb52-sample.txt', '01': 'iq09-01-sample.txt', '07': 'iq09-07-sample.txt' }

function fakeSap({ status = READY, fail = null, failWith = '{"ok":false,"error":"Listen kunne ikke gemmes"}', empty = [], texts = {} } = {}) {
  const calls = []
  const dirs = []
  async function runScript(name, args = [], options = {}) {
    calls.push({ name, args, timeoutMs: options.timeoutMs })
    if (name === 'status') return status
    const [report, dir, file, stockType] = args
    dirs.push(dir)
    const key = report === 'mb52' ? 'mb52' : stockType
    if (fail === key) return failWith
    if (empty.includes(key)) return '{"ok":true,"rows":0}'
    if (texts[key] !== undefined) fs.writeFileSync(path.join(dir, file), texts[key], 'utf8')
    else fs.copyFileSync(path.join(FIXTURES, FILES[key]), path.join(dir, file))
    return '{"ok":true,"rows":3}'
  }
  return { runScript, calls, dirs }
}

function makeFetcher(sap) {
  const bridge = createSapBridge({ runScript: sap.runScript })
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-fetch-test-'))
  return { fetcher: createSapFetcher({ bridge, runScript: sap.runScript, tempRoot, now: () => 4242 }), tempRoot }
}

test('fetch exports MB52 and IQ09 (unrestricted and blocked) one after another and parses them', async () => {
  const sap = fakeSap()
  const { fetcher, tempRoot } = makeFetcher(sap)
  const steps = []
  const result = await fetcher.fetchPlant({ onProgress: step => steps.push(step) })
  assert.deepEqual(sap.calls.map(call => call.name === 'status' ? 'status' : `${call.args[0]}${call.args[3] ? `:${call.args[3]}` : ''}`), ['status', 'mb52', 'iq09:01', 'iq09:07'])
  assert.ok(sap.calls.slice(1).every(call => call.timeoutMs >= 120000))
  assert.deepEqual(steps, ['check', 'mb52', 'iq09-unrestricted', 'iq09-blocked', 'done'])
  assert.ok(result.mb52.length > 0)
  assert.ok(result.serials.some(row => row.stockType === 'unrestricted'))
  assert.ok(result.serials.some(row => row.stockType === 'blocked'))
  assert.equal(result.sapUser, 'D00K418')
  assert.equal(result.fetchedAt, 4242)
  assert.equal(fs.existsSync(sap.dirs[0]), false, 'the temporary export folder is removed')
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

test('fetch refuses to start when SAP is not ready and never runs an export', async () => {
  const sap = fakeSap({ status: NOT_LOGGED_IN })
  const { fetcher } = makeFetcher(sap)
  await assert.rejects(fetcher.fetchPlant(), error => error.code === 'SAP_NOT_READY' && error.sapState === 'not-logged-in')
  assert.deepEqual(sap.calls.map(call => call.name), ['status'])
})

test('a failed export stops the fetch with a clear error and still cleans up', async () => {
  const sap = fakeSap({ fail: '01' })
  const { fetcher, tempRoot } = makeFetcher(sap)
  await assert.rejects(fetcher.fetchPlant(), error => error.code === 'SAP_EXPORT_FAILED' && /iq09/i.test(error.message))
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

test('an empty blocked-stock list is simply no serials', async () => {
  const sap = fakeSap({ empty: ['07'] })
  const { fetcher } = makeFetcher(sap)
  const result = await fetcher.fetchPlant()
  assert.equal(result.serials.some(row => row.stockType === 'blocked'), false)
})

test('export.vbs refusing (SAP message on the selection screen, or no result) is a failed export, never an empty one', async () => {
  for (const answer of ['{"ok":false,"error":"sap: Ingen autorisation til fabrik D301"}', '{"ok":false,"error":"export-no-result"}']) {
    const sap = fakeSap({ fail: 'mb52', failWith: answer })
    const { fetcher, tempRoot } = makeFetcher(sap)
    const detail = JSON.parse(answer).error
    await assert.rejects(fetcher.fetchPlant(), error => error.code === 'SAP_EXPORT_FAILED' && error.message.includes(detail))
    assert.deepEqual(sap.calls.map(call => call.args[0] || call.name), ['status', 'mb52'], 'IQ09 is not run')
    assert.deepEqual(fs.readdirSync(tempRoot), [])
  }
})

test('an MB52 export without rows for D301 is refused, also when only MB52 is fetched', async () => {
  const sap = fakeSap({ empty: ['mb52'] })
  const { fetcher, tempRoot } = makeFetcher(sap)
  await assert.rejects(fetcher.fetchPlant(), error => error.code === 'SAP_EXPORT_EMPTY' && /MB52/.test(error.message))
  assert.deepEqual(sap.calls.map(call => call.args[0] || call.name), ['status', 'mb52'], 'IQ09 is not run')
  assert.deepEqual(fs.readdirSync(tempRoot), [])
  await assert.rejects(fetcher.fetchStock(), { code: 'SAP_EXPORT_EMPTY' })
  const header = (await fs.promises.readFile(path.join(FIXTURES, FILES.mb52), 'utf8')).split(/\r?\n/).slice(0, 3).join('\r\n')
  await assert.rejects(makeFetcher(fakeSap({ texts: { mb52: header } })).fetcher.fetchPlant(), { code: 'SAP_EXPORT_EMPTY' }, 'a list with only the header')
})

test('an empty unrestricted IQ09 is refused while MB52 has INT materials in unrestricted stock', async () => {
  const sap = fakeSap({ empty: ['01'] })
  const { fetcher, tempRoot } = makeFetcher(sap)
  await assert.rejects(fetcher.fetchPlant(), error => error.code === 'SAP_EXPORT_EMPTY' && /IQ09/.test(error.message))
  assert.deepEqual(fs.readdirSync(tempRoot), [])

  // Without INT stock an empty serial list is believable.
  const lines = (await fs.promises.readFile(path.join(FIXTURES, FILES.mb52), 'utf8')).split(/\r?\n/)
  const noTerminals = lines.filter(line => !/\tINT/.test(line)).join('\r\n')
  const result = await makeFetcher(fakeSap({ empty: ['01'], texts: { mb52: noTerminals } })).fetcher.fetchPlant()
  assert.ok(result.mb52.length > 0)
  assert.equal(result.serials.some(row => row.stockType === 'unrestricted'), false)
})

test('ZMS_STOCK_SER_CHK2 runs in its own script and is parsed; no access gives a clear error', async () => {
  const calls = []
  let answer = null
  const runScript = async (name, args = []) => {
    calls.push({ name, args })
    if (name === 'status') return READY
    if (answer) return answer
    fs.copyFileSync(path.join(FIXTURES, 'stockcheck-sample.txt'), path.join(args[0], args[1]))
    return '{"ok":true,"rows":6}'
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-stockcheck-test-'))
  const fetcher = createSapFetcher({ bridge: createSapBridge({ runScript }), runScript, tempRoot })
  const rows = await fetcher.fetchStockCheck()
  assert.equal(rows.length, 6)
  assert.deepEqual(calls.map(call => call.name), ['status', 'stockcheck'])
  answer = '{"ok":false,"error":"no-access-zms_stock_ser_chk2"}'
  await assert.rejects(fetcher.fetchStockCheck(), error => error.code === 'SAP_NO_ACCESS' && /ZMS_STOCK_SER_CHK2/.test(error.message))
  answer = '{"ok":true,"rows":0}'
  assert.deepEqual(await fetcher.fetchStockCheck(), [])
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

test('a material document is looked up in ZMS_REP for TCD and ZMS_PREP for TRR', async () => {
  const calls = []
  let answer = null
  const runScript = async (name, args = []) => {
    calls.push({ name, args })
    if (name === 'status') return READY
    if (answer) return answer
    fs.copyFileSync(path.join(FIXTURES, 'matdoc-rep-sample.txt'), path.join(args[1], args[2]))
    return '{"ok":true,"rows":3}'
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-matdoc-test-'))
  const fetcher = createSapFetcher({ bridge: createSapBridge({ runScript }), runScript, tempRoot })
  const tcd = await fetcher.fetchMatdoc({ team: 'TCD', document: ' 4900229137  2026 01 ' })
  assert.equal(tcd.document, '4900229137 2026 01')
  assert.equal(tcd.rows.length, 3)
  assert.equal(tcd.rows[0].serial, 'NXC600007186')
  const exportCall = calls.filter(call => call.name === 'matdoc')
  assert.deepEqual([exportCall[0].args[0], exportCall[0].args[3]], ['rep', '4900229137 2026 01'])
  await fetcher.fetchMatdoc({ team: 'TRR', document: '4900229137' })
  assert.equal(calls.filter(call => call.name === 'matdoc')[1].args[0], 'prep')
  await assert.rejects(fetcher.fetchMatdoc({ team: 'TCD', document: '4900 & calc' }), { code: 'MATDOC_INVALID' })
  answer = '{"ok":false,"error":"no-access-zms_rep"}'
  await assert.rejects(fetcher.fetchMatdoc({ team: 'TCD', document: '4900229137' }), error => error.code === 'SAP_NO_ACCESS' && /ZMS_REP/.test(error.message))
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

function matdocYears({ found = [], now = new Date(2026, 0, 5, 8, 0).getTime() } = {}) {
  const asked = []
  const calls = []
  const runScript = async (name, args = []) => {
    calls.push(name)
    if (name === 'status') return READY
    asked.push(args[3])
    if (!found.includes(args[3])) return '{"ok":true,"rows":0}'
    fs.copyFileSync(path.join(FIXTURES, 'matdoc-rep-sample.txt'), path.join(args[1], args[2]))
    return '{"ok":true,"rows":3}'
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-matdoc-year-test-'))
  const fetcher = createSapFetcher({ bridge: createSapBridge({ runScript }), runScript, tempRoot, now: () => now })
  return { fetcher, asked, calls, tempRoot }
}

test('a material document without year is tried with this year and then the two years before, in one SAP job', async () => {
  const lastYear = matdocYears({ found: ['4905204948 2025'] })
  const result = await lastYear.fetcher.fetchMatdoc({ team: 'TCD', document: ' 4905204948 ' })
  assert.deepEqual(lastYear.asked, ['4905204948 2026', '4905204948 2025'])
  assert.deepEqual(lastYear.calls, ['status', 'matdoc', 'matdoc'])
  assert.equal(result.document, '4905204948 2025', 'the document used is returned with its year')
  assert.equal(result.rows.length, 3)
  assert.equal(result.transaction, 'ZMS_REP')
  assert.deepEqual(fs.readdirSync(lastYear.tempRoot), [])
  const thisYear = matdocYears({ found: ['4905204948 2026'] })
  const first = await thisYear.fetcher.fetchMatdoc({ team: 'TRR', document: '4905204948' })
  assert.deepEqual(thisYear.asked, ['4905204948 2026'], 'it stops at the first year with serials')
  assert.equal(first.document, '4905204948 2026')
  const twoYearsBack = matdocYears({ found: ['4905204948 2024'] })
  const oldest = await twoYearsBack.fetcher.fetchMatdoc({ team: 'TCD', document: '4905204948' })
  assert.deepEqual(twoYearsBack.asked, ['4905204948 2026', '4905204948 2025', '4905204948 2024'])
  assert.deepEqual(twoYearsBack.calls, ['status', 'matdoc', 'matdoc', 'matdoc'])
  assert.deepEqual([oldest.document, oldest.rows.length], ['4905204948 2024', 3])
})

test('a material document with a year is looked up exactly as given', async () => {
  const sap = matdocYears({ found: ['4905204948 2026'] })
  const result = await sap.fetcher.fetchMatdoc({ team: 'TCD', document: '4905204948 2024' })
  assert.deepEqual(sap.asked, ['4905204948 2024'], 'no other year is tried')
  assert.deepEqual([result.document, result.rows], ['4905204948 2024', []])
})

test('a material document without year that no year finds gives no rows and the last document tried', async () => {
  const sap = matdocYears()
  const result = await sap.fetcher.fetchMatdoc({ team: 'TCD', document: '4905204949' })
  assert.deepEqual(sap.asked, ['4905204949 2026', '4905204949 2025', '4905204949 2024'])
  assert.deepEqual(result, { document: '4905204949 2024', rows: [], transaction: 'ZMS_REP' })
  assert.deepEqual(fs.readdirSync(sap.tempRoot), [])
})

test('a failed script on the first year of a material document without year stops the lookup', async () => {
  const asked = []
  const runScript = async (name, args = []) => {
    if (name === 'status') return READY
    asked.push(args[3])
    return '{"ok":false,"error":"x"}'
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-matdoc-fail-test-'))
  const fetcher = createSapFetcher({ bridge: createSapBridge({ runScript }), runScript, tempRoot, now: () => new Date(2026, 0, 5, 8, 0).getTime() })
  await assert.rejects(fetcher.fetchMatdoc({ team: 'TCD', document: '4905204948' }), { code: 'SAP_EXPORT_FAILED' })
  assert.deepEqual(asked, ['4905204948 2026'], 'no second year is tried')
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

test('long serial numbers: material + short serials via the clipboard, in chunks; never a lookup without serials', async () => {
  const calls = []
  const clip = []
  let answer = null
  const runScript = async (name, args = []) => {
    calls.push({ name, args })
    if (name === 'status') return READY
    if (answer) return answer
    const [dir, outFile, inFile, material] = args
    const serials = fs.readFileSync(path.join(dir, inFile), 'utf8').split(/\r?\n/).filter(Boolean)
    assert.equal(clip.at(-1), serials.join('\r\n'), 'the clipboard holds exactly this chunk')
    const lines = ['SERNR\tSERGE\tMATNR', ...serials.filter(serial => serial !== 'S3').map(serial => `${serial}\t251427${serial}\t${material}`)]
    fs.writeFileSync(path.join(dir, outFile), lines.join('\r\n'))
    return JSON.stringify({ ok: true, rows: lines.length - 1 })
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-long-test-'))
  const fetcher = createSapFetcher({ bridge: createSapBridge({ runScript }), runScript, tempRoot, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, longChunk: 2 })
  const result = await fetcher.fetchLongSerials({ material: 'int4300-7825-0', serials: ['s1', 'S2', 'S3', 'S1'] })
  assert.deepEqual(result, [{ serial: 'S1', long: '251427S1', material: 'INT4300-7825-0' }, { serial: 'S2', long: '251427S2', material: 'INT4300-7825-0' }])
  const lookups = calls.filter(call => call.name === 'longserno')
  assert.equal(lookups.length, 2, 'S1+S2, then S3')
  assert.equal(lookups[0].args[3], 'INT4300-7825-0')
  assert.deepEqual(await fetcher.fetchLongSerials({ material: 'INT4300-7825-0', serials: [] }), [])
  assert.equal(calls.filter(call => call.name === 'longserno').length, 2, 'no lookup without serials')
  await assert.rejects(fetcher.fetchLongSerials({ material: 'X & Y', serials: ['S1'] }), { code: 'MATERIAL_INVALID' })
  answer = '{"ok":false,"error":"no-access-sq01"}'
  await assert.rejects(fetcher.fetchLongSerials({ material: 'INT4300-7825-0', serials: ['S1'] }), error => error.code === 'SAP_NO_ACCESS' && /ZMS_LONG_SERNO/.test(error.message))
  answer = '{"ok":false,"error":"too-many-rows"}'
  await assert.rejects(fetcher.fetchLongSerials({ material: 'INT4300-7825-0', serials: ['S1'] }), { code: 'SAP_EXPORT_FAILED' })
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

test('only one fetch runs at a time; a second request joins the running one', async () => {
  const sap = fakeSap()
  const { fetcher } = makeFetcher(sap)
  const [first, second] = await Promise.all([fetcher.fetchPlant(), fetcher.fetchPlant()])
  assert.equal(first, second)
  assert.equal(sap.calls.filter(call => call.name === 'status').length, 1)
})

test('fetchMaterialTexts puts the materials on the clipboard in chunks and parses the list', async () => {
  const calls = []
  const clip = []
  let answer = null
  const runScript = async (name, args = []) => {
    calls.push({ name, args })
    if (name === 'status') return READY
    if (answer) return answer
    const [dir, outFile, inFile] = args
    const materials = fs.readFileSync(path.join(dir, inFile), 'utf8').split(/\r?\n/).filter(Boolean)
    assert.equal(clip.at(-1), materials.join('\r\n'), 'the clipboard holds exactly this chunk')
    const lines = ['\tMaterial\tMaterial Description\tPlnt', ...materials.filter(material => material !== 'R999-9999').map(material => `\t${material}\tText ${material}\tD301`)]
    fs.writeFileSync(path.join(dir, outFile), lines.join('\r\n'))
    return '{"ok":true,"rows":-1}'
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-mm60-test-'))
  const fetcher = createSapFetcher({ bridge: createSapBridge({ runScript }), runScript, tempRoot, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) }, textChunk: 2 })
  const result = await fetcher.fetchMaterialTexts({ materials: ['r162-0717', 'R133-0032', 'R999-9999', 'R162-0717', 'bad & code'] })
  assert.deepEqual(result, [{ material: 'R162-0717', description: 'Text R162-0717' }, { material: 'R133-0032', description: 'Text R133-0032' }])
  assert.equal(calls.filter(call => call.name === 'mm60').length, 2, 'R162-0717+R133-0032, then R999-9999')
  assert.deepEqual(await fetcher.fetchMaterialTexts({ materials: [] }), [])
  assert.equal(calls.filter(call => call.name === 'mm60').length, 2, 'no lookup without materials')
  answer = '{"ok":false,"error":"no-access-mm60"}'
  await assert.rejects(fetcher.fetchMaterialTexts({ materials: ['R133-0032'] }), error => error.code === 'SAP_NO_ACCESS' && /MM60/.test(error.message))
  answer = '{"ok":false,"error":"material-filter-missing"}'
  await assert.rejects(fetcher.fetchMaterialTexts({ materials: ['R133-0032'] }), { code: 'SAP_EXPORT_FAILED' })
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

test('fetchMaterialTexts without the clipboard passes one material at a time as an argument', async () => {
  const calls = []
  const runScript = async (name, args = []) => {
    calls.push({ name, args })
    if (name === 'status') return READY
    const [dir, outFile, , material] = args
    fs.writeFileSync(path.join(dir, outFile), `MATNR\tMAKTX\r\n${material}\tText ${material}\r\n`)
    return '{"ok":true,"rows":1}'
  }
  const clip = []
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-mm60-single-'))
  const fetcher = createSapFetcher({ bridge: createSapBridge({ runScript }), runScript, tempRoot, clipboard: { writeText: text => clip.push(text), readText: () => clip.at(-1) } })
  const result = await fetcher.fetchMaterialTexts({ materials: ['R133-0032', 'R162-0717'], useClipboard: false })
  assert.deepEqual(result.map(row => row.material), ['R133-0032', 'R162-0717'])
  assert.deepEqual(calls.filter(call => call.name === 'mm60').map(call => call.args[3]), ['R133-0032', 'R162-0717'])
  assert.deepEqual(clip, [], 'the clipboard is left alone')
})

test('Electron 44 clipboard: long serials and MM60 start only when the clipboard really holds the chunk', async () => {
  const clipboard = { current: 'old clipboard text' }
  clipboard.writeText = text => new Promise(resolve => setTimeout(() => { clipboard.current = text; resolve() }, 5))
  clipboard.readText = () => Promise.resolve(clipboard.current)
  const seen = []
  const runScript = async (name, args = []) => {
    if (name === 'status') return READY
    seen.push({ name, clipboard: clipboard.current })
    fs.writeFileSync(path.join(args[0], args[1]), name === 'longserno' ? 'SERNR\tSERGE\tMATNR\r\nS1\t251427S1\tINT4300-7825-0' : '\tMaterial\tMaterial Description\tPlnt\r\n\tR133-0032\tText\tD301')
    return '{"ok":true,"rows":1}'
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-clip44-'))
  const fetcher = createSapFetcher({ bridge: createSapBridge({ runScript }), runScript, tempRoot, clipboard })
  await fetcher.fetchLongSerials({ material: 'INT4300-7825-0', serials: ['S1', 'S2'] })
  await fetcher.fetchMaterialTexts({ materials: ['R133-0032', 'R162-0717'] })
  assert.deepEqual(seen, [{ name: 'longserno', clipboard: 'S1\r\nS2' }, { name: 'mm60', clipboard: 'R133-0032\r\nR162-0717' }])
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

test('Windows silently refusing the clipboard stops long serials and MM60 before SAP reads old text', async () => {
  const calls = []
  const runScript = async name => { calls.push(name); return name === 'status' ? READY : '{"ok":true,"rows":0}' }
  const clipboard = { writeText: async () => {}, readText: async () => 'old clipboard text' }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-clipdenied-'))
  const fetcher = createSapFetcher({ bridge: createSapBridge({ runScript }), runScript, tempRoot, clipboard })
  await assert.rejects(fetcher.fetchLongSerials({ material: 'INT4300-7825-0', serials: ['S1', 'S2'] }), { code: 'CLIPBOARD_REFUSED', message: /Udklipsholderen/ })
  await assert.rejects(fetcher.fetchMaterialTexts({ materials: ['R133-0032', 'R162-0717'] }), { code: 'CLIPBOARD_REFUSED', message: /Udklipsholderen/ })
  assert.deepEqual(calls.filter(name => name !== 'status'), [], 'ZMS_LONG_SERNO/MM60 never start')
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

test('fetchStock exports only MB52 – no IQ09 – for descriptions', async () => {
  const sap = fakeSap()
  const { fetcher, tempRoot } = makeFetcher(sap)
  const steps = []
  const result = await fetcher.fetchStock({ onProgress: step => steps.push(step) })
  assert.ok(result.mb52.length > 0)
  assert.deepEqual(sap.calls.filter(call => call.name === 'export').map(call => call.args[0]), ['mb52'])
  assert.deepEqual(steps, ['check', 'mb52', 'done'])
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})
