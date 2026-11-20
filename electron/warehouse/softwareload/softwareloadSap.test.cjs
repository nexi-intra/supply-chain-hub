const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createSapBridge } = require('../sapBridge.cjs')
const { createSoftwareloadSap, LOOKUP_CHUNK, TRANSFER_CHUNK, BLOCK_CHUNK } = require('./softwareloadSap.cjs')

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'sap')
const EXPECTED = { system: 'QS4', client: '100' }
const READY = JSON.stringify({ running: true, scripting: true, connections: [{ disabledByServer: false, sessions: [{ busy: false, popup: false, system: 'QS4', client: '100', user: 'JREMMER', transaction: 'SESSION_MANAGER' }] }] })
const NOT_LOGGED_IN = JSON.stringify({ running: true, scripting: true, connections: [{ disabledByServer: false, sessions: [{ busy: false, popup: false, system: 'QS4', client: '100', user: '', transaction: 'S000' }] }] })

function makeSap({ handle, system = 'QS4', status = READY }) {
  const calls = []
  const clip = ['the user text']
  const clipboard = { writeText: text => { clip.push(text) }, readText: () => clip.at(-1) }
  const runScript = async (name, args = [], options = {}) => {
    calls.push({ name, args, clipboard: clip.at(-1), timeoutMs: options.timeoutMs })
    if (name === 'status') return status
    return handle(name, args, calls.filter(call => call.name === name).length)
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-softwareload-test-'))
  const sap = createSoftwareloadSap({ bridge: createSapBridge({ runScript }), runScript, clipboard, system, expected: EXPECTED, tempRoot })
  return { sap, calls, clip, tempRoot, scriptCalls: name => calls.filter(call => call.name === name) }
}

test('chunk sizes are shared with the service', () => {
  assert.deepEqual([LOOKUP_CHUNK, TRANSFER_CHUNK, BLOCK_CHUNK], [500, 200, 20])
})

test('lookup uses ZMS_REP for TCD, falls back to ZMS_PREP on no access, and restores the clipboard', async () => {
  const { sap, clip, tempRoot, scriptCalls } = makeSap({
    handle: (name, [mode, dir, outFile]) => {
      if (mode === 'rep') return '{"ok":false,"error":"no-access-zms_rep"}'
      fs.copyFileSync(path.join(FIXTURES, 'sl-lookup-prep-sample.txt'), path.join(dir, outFile))
      return '{"ok":true,"rows":2}'
    },
  })
  const rows = await sap.lookup({ team: 'TCD', serials: ['393031157352189282', ' 393031157352189283 ', '393031157352189282'] })
  assert.deepEqual(rows.map(row => `${row.serial} ${row.material} ${row.sloc} ${row.blocked}`), ['393031157352189282 INT4100-7883-0 D000 true', '393031157352189283 INT4100-7883-0 D005 false'])
  const lookups = scriptCalls('sl-lookup')
  assert.deepEqual(lookups.map(call => call.args[0]), ['rep', 'prep'])
  assert.ok(lookups.every(call => call.clipboard === '393031157352189282\r\n393031157352189283'), 'SAP reads the serials from the clipboard')
  assert.equal(clip.at(-1), 'the user text')
  assert.deepEqual(await sap.lookup({ team: 'TCD', serials: [] }), [])
  assert.equal(scriptCalls('sl-lookup').length, 2, 'an empty list never reaches SAP')
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

test('lookup without access to either cockpit fails, splits big lists and still restores the clipboard', async () => {
  const denied = makeSap({ handle: (name, [mode]) => `{"ok":false,"error":"no-access-zms_${mode}"}` })
  await assert.rejects(denied.sap.lookup({ team: 'TRR', serials: ['S1'] }), { code: 'SAP_NO_ACCESS' })
  assert.deepEqual(denied.scriptCalls('sl-lookup').map(call => call.args[0]), ['prep', 'rep'])
  assert.equal(denied.clip.at(-1), 'the user text')

  const serials = Array.from({ length: LOOKUP_CHUNK + 1 }, (_, index) => `S${index}`)
  const many = makeSap({ handle: () => '{"ok":true,"rows":0}' })
  assert.deepEqual(await many.sap.lookup({ team: 'TRR', serials }), [])
  assert.deepEqual(many.scriptCalls('sl-lookup').map(call => call.clipboard.split('\r\n').length), [LOOKUP_CHUNK, 1])

  const notReady = makeSap({ status: NOT_LOGGED_IN, handle: () => '{"ok":true,"rows":0}' })
  await assert.rejects(notReady.sap.lookup({ team: 'TRR', serials: ['S1'] }), { code: 'SAP_NOT_READY' })
  assert.equal(notReady.scriptCalls('sl-lookup').length, 0)
})

test('transfer returns the document number', async () => {
  const { sap, clip, tempRoot, scriptCalls } = makeSap({
    handle: (name, [, , , dir, inFile]) => {
      assert.equal(fs.readFileSync(path.join(dir, inFile), 'utf8'), 'S1\r\nS2')
      return '{"ok":true,"doc":"4905204921"}'
    },
  })
  assert.equal(sap.writeEnabled, true)
  assert.deepEqual(await sap.transfer({ team: 'TRR', serials: ['S1', 's2'], to: 'd005' }), { ok: true, doc: '4905204921' })
  const [call] = scriptCalls('sl-transfer')
  assert.deepEqual([call.args[0], call.args[1], call.args[2], call.args[4], call.args[5]], ['QS4', 'prep', 'D005', 'in.txt', 'errors.txt'])
  assert.equal(call.clipboard, 'S1\r\nS2')
  assert.equal(clip.at(-1), 'the user text')
  await assert.rejects(sap.transfer({ team: 'TRR', serials: Array.from({ length: TRANSFER_CHUNK + 1 }, (_, index) => `S${index}`), to: 'D005' }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(sap.transfer({ team: 'TRR', serials: ['S1'], to: 'D005 & calc' }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(sap.transfer({ team: 'TRR', serials: [], to: 'D005' }), { code: 'SOFTWARELOAD_INVALID' })
  assert.equal(scriptCalls('sl-transfer').length, 1)
  assert.deepEqual(fs.readdirSync(tempRoot), [])
})

test('transfer with SAP errors returns the message, not an exception', async () => {
  let answer = 'sap-errors'
  const { sap, clip, scriptCalls } = makeSap({
    handle: (name, [, , , dir, , errFile]) => {
      if (answer !== 'sap-errors') return answer
      fs.writeFileSync(path.join(dir, errFile), 'Deficit of SL Unrestricted-use 1 EA : INT4320-7842-0 D301 D000\tINT4320-7842-0\tD301 D000\r\n')
      return '{"ok":false,"error":"sap-errors"}'
    },
  })
  const result = await sap.transfer({ team: 'TCD', serials: ['S1'], to: 'D005' })
  assert.equal(result.ok, false)
  assert.match(result.message, /Deficit/)
  assert.equal(scriptCalls('sl-transfer')[0].args[1], 'rep')
  answer = '{"ok":false,"error":"rows-mismatch"}'
  assert.deepEqual(await sap.transfer({ team: 'TCD', serials: ['S1'], to: 'D005' }), { ok: false, message: 'SAP fandt ikke præcis de serienumre' })
  answer = '{"ok":false,"error":"unknown-result: SAPLSPO4/0300"}'
  await assert.rejects(sap.transfer({ team: 'TCD', serials: ['S1'], to: 'D005' }), { code: 'SOFTWARELOAD_SAP_FAILED' })
  answer = '{"ok":false,"error":"not-logged-in-QS4"}'
  await assert.rejects(sap.transfer({ team: 'TCD', serials: ['S1'], to: 'D005' }), { code: 'SAP_NOT_READY' })
  assert.equal(clip.at(-1), 'the user text', 'restored after an exception too')
})

test('block posts 344 for one material in MIGO and returns the document number or SAP\'s message', async () => {
  let answer = '{"ok":true,"doc":"4905204925"}'
  const { sap, clip, scriptCalls } = makeSap({
    handle: (name, [, dir, inFile]) => {
      assert.equal(fs.readFileSync(path.join(dir, inFile), 'utf8'), '393031157352189282')
      return answer
    },
  })
  assert.deepEqual(await sap.block({ material: 'int4100-7883-0', serials: ['393031157352189282'] }), { ok: true, doc: '4905204925' })
  const [call] = scriptCalls('sl-block')
  assert.deepEqual([call.args[0], call.args[2], call.args[3], call.args[4]], ['QS4', 'in.txt', 'INT4100-7883-0', '344'])
  assert.deepEqual(clip, ['the user text'], 'MIGO does not use the clipboard')
  answer = '{"ok":false,"error":"sap: Serial number 393031157352189282 not in stock"}'
  assert.deepEqual(await sap.block({ material: 'INT4100-7883-0', serials: ['393031157352189282'], bwart: '343' }), { ok: false, message: 'Serial number 393031157352189282 not in stock' })
  assert.equal(scriptCalls('sl-block')[1].args[4], '343')
  await assert.rejects(sap.block({ material: 'INT4100-7883-0', serials: Array.from({ length: BLOCK_CHUNK + 1 }, (_, index) => `S${index}`) }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(sap.block({ material: 'INT4100-7883-0', serials: ['S1'], bwart: '101' }), { code: 'SOFTWARELOAD_INVALID' })
  answer = '{"ok":false,"error":"no-access-migo"}'
  await assert.rejects(sap.block({ material: 'INT4100-7883-0', serials: ['393031157352189282'] }), { code: 'SAP_NO_ACCESS' })
})

test('writing is refused when the system is not enabled', async () => {
  const { sap, scriptCalls } = makeSap({ system: 'PS4', handle: () => '{"ok":true,"doc":"1"}' })
  assert.equal(sap.writeEnabled, false)
  await assert.rejects(sap.transfer({ team: 'TRR', serials: ['S1'], to: 'D005' }), { code: 'SOFTWARELOAD_WRITE_DISABLED' })
  await assert.rejects(sap.block({ material: 'INT4100-7883-0', serials: ['S1'] }), { code: 'SOFTWARELOAD_WRITE_DISABLED' })
  assert.equal(scriptCalls('sl-transfer').length + scriptCalls('sl-block').length, 0)
})
