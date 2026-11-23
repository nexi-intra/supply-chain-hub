const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createSapBridge, createCscriptRunner, defaultCscriptPath } = require('./sapBridge.cjs')

const READY = JSON.stringify({ running: true, scripting: true, connections: [{ disabledByServer: false, sessions: [{ busy: false, popup: false, system: 'PS4', client: '100', user: 'JREMMER', transaction: 'SESSION_MANAGER' }] }] })

test('status runs the status script and returns the computed state', async () => {
  const calls = []
  const bridge = createSapBridge({ runScript: async (name) => { calls.push(name); return `noise\r\n${READY}\r\n` } })
  const state = await bridge.status()
  assert.equal(state.state, 'ready')
  assert.equal(state.user, 'JREMMER')
  assert.deepEqual(calls, ['status'])
})

test('status is cached briefly, coalesced while running, and fresh bypasses the cache', async () => {
  let clock = 0, runs = 0
  const bridge = createSapBridge({ runScript: async () => { runs++; return READY }, now: () => clock, cacheMs: 2000 })
  await Promise.all([bridge.status(), bridge.status(), bridge.status()])
  assert.equal(runs, 1)
  await bridge.status()
  assert.equal(runs, 1)
  await bridge.status({ fresh: true })
  assert.equal(runs, 2)
  clock = 2500
  await bridge.status()
  assert.equal(runs, 3)
})

test('a failing or timed-out script becomes an error state, never a crash', async () => {
  const timeout = Object.assign(new Error('SAP_TIMEOUT'), { code: 'SAP_TIMEOUT' })
  const timedOut = createSapBridge({ runScript: async () => { throw timeout } })
  assert.deepEqual(await timedOut.status(), { state: 'error', ready: false, system: null, client: null, user: null, reason: 'timeout' })
  const garbage = createSapBridge({ runScript: async () => 'not json' })
  assert.equal((await garbage.status()).reason, 'failed')
})

test('SAP jobs never overlap', async () => {
  const bridge = createSapBridge({ runScript: async () => READY })
  const order = []
  let release
  const first = bridge.exclusive(async () => { order.push('first:start'); await new Promise(resolve => { release = resolve }); order.push('first:end') })
  const second = bridge.exclusive(async () => { order.push('second') })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(order, ['first:start'])
  release()
  await Promise.all([first, second])
  assert.deepEqual(order, ['first:start', 'first:end', 'second'])
  await assert.rejects(bridge.exclusive(async () => { throw new Error('boom') }), /boom/)
  assert.equal(await bridge.exclusive(async () => 'still works'), 'still works')
})

test('the runner only starts allow-listed scripts with the 32-bit host and safe arguments', async () => {
  const calls = []
  const execFile = (file, args, options, callback) => { calls.push({ file, args, options }); callback(null, READY) }
  const run = createCscriptRunner({ scriptDir: 'C:\\app\\sap', cscriptPath: 'C:\\Windows\\SysWOW64\\cscript.exe', execFile, timeoutMs: 1234 })
  assert.equal(await run('status'), READY)
  assert.deepEqual(calls[0].args, ['//NoLogo', '//E:vbscript', path.join('C:\\app\\sap', 'status.vbs')])
  assert.equal(calls[0].file, 'C:\\Windows\\SysWOW64\\cscript.exe')
  assert.equal(calls[0].options.timeout, 1234)
  assert.equal(calls[0].options.windowsHide, true)
  assert.equal(calls[0].options.env.COUNTPOINT_SAP_SYSTEM, 'PS4', 'read scripts pick the connection to the configured system')
  await assert.rejects(run('../evil'), { code: 'SAP_SCRIPT_NOT_ALLOWED' })
  await assert.rejects(run('toString'), { code: 'SAP_SCRIPT_NOT_ALLOWED' })
  await assert.rejects(run('status', ['a" & calc']), { code: 'SAP_INVALID_ARGUMENT' })
  assert.equal(calls.length, 1)
})

test('the export script is allowed and may run with a longer timeout', async () => {
  const calls = []
  const execFile = (file, args, options, callback) => { calls.push({ args, options }); callback(null, '{"ok":true,"rows":1}') }
  const run = createCscriptRunner({ scriptDir: 'C:\\app\\sap', cscriptPath: 'cscript.exe', execFile, timeoutMs: 1000 })
  await run('export', ['iq09', 'C:\\Temp\\countpoint-sap-x', 'iq09-01.txt', '01'], { timeoutMs: 240000 })
  assert.deepEqual(calls[0].args.slice(2), [path.join('C:\\app\\sap', 'export.vbs'), 'iq09', 'C:\\Temp\\countpoint-sap-x', 'iq09-01.txt', '01'])
  assert.equal(calls[0].options.timeout, 240000)
  await run('status')
  assert.equal(calls[1].options.timeout, 1000)
})

test('scripts that change SAP only run against the configured system', async () => {
  const calls = []
  const execFile = (file, args, options, callback) => { calls.push(args); callback(null, '{"ok":true}') }
  const run = createCscriptRunner({ scriptDir: 'C:\\app\\sap', cscriptPath: 'cscript.exe', execFile, system: 'PS4' })
  await run('pidoc-create', ['PS4', 'D000'])
  assert.deepEqual(calls[0].slice(2), [path.join('C:\\app\\sap', 'pidoc-create.vbs'), 'PS4', 'D000'])
  await assert.rejects(run('pidoc-create', ['QS4', 'D000']), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' }, 'QS4 is allowed, but not the configured system')
  await assert.rejects(run('pidoc-create', ['XS4', 'D000']), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' })
  await assert.rejects(run('pidoc-create', []), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' })
  await assert.rejects(run('pidoc-create', ['ps4']), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' })
  assert.equal(calls.length, 1, 'a refused write never starts cscript')
})

test('a QS4 installation cannot write to PS4', async () => {
  const calls = []
  const execFile = (file, args, options, callback) => { calls.push(args); callback(null, '{"ok":true}') }
  const run = createCscriptRunner({ scriptDir: 'C:\\app\\sap', cscriptPath: 'cscript.exe', execFile, system: 'QS4' })
  for (const name of ['pidoc-create', 'pidoc-print', 'pidoc-serials', 'pidoc-count', 'pidoc-post', 'pidoc-delete', 'sl-transfer', 'sl-block']) {
    await assert.rejects(run(name, ['PS4', 'x']), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' }, name)
  }
  assert.equal(calls.length, 0)
  await run('pidoc-post', ['QS4', '2026'])
  assert.deepEqual(calls[0].slice(2), [path.join('C:\\app\\sap', 'pidoc-post.vbs'), 'QS4', '2026'])
})

test('a configured system that is not on the allow-list cannot write', async () => {
  const calls = []
  const execFile = (file, args, options, callback) => { calls.push(args); callback(null, '{"ok":true}') }
  const run = createCscriptRunner({ scriptDir: 'C:\\app\\sap', cscriptPath: 'cscript.exe', execFile, system: 'XS4' })
  await assert.rejects(run('pidoc-create', ['XS4', 'D000']), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' })
  await assert.rejects(run('sl-transfer', ['XS4', 'prep']), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' })
  assert.equal(calls.length, 0)
})

test('softwareload write scripts run on the configured system only', async () => {
  const calls = []
  const execFile = (file, args, options, callback) => { calls.push(args); callback(null, '{"ok":true}') }
  const run = createCscriptRunner({ scriptDir: 'C:\\app\\sap', cscriptPath: 'cscript.exe', execFile, system: 'PS4' })
  await assert.rejects(run('sl-transfer', ['XS4', 'prep', 'D005', 'C:\\t', 'in.txt', 'err.txt', 'D000']), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' })
  await assert.rejects(run('sl-block', ['XS4', 'C:\\t', 'in.txt', 'INT4100-7883-0', '344']), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' })
  await assert.rejects(run('sl-transfer', ['QS4', 'prep', 'D005', 'C:\\t', 'in.txt', 'err.txt', 'D000']), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' })
  await assert.rejects(run('sl-block', ['QS4', 'C:\\t', 'in.txt', 'INT4100-7883-0', '344']), { code: 'SAP_WRITE_SYSTEM_NOT_ALLOWED' })
  assert.equal(calls.length, 0)
  await run('sl-transfer', ['PS4', 'prep', 'D005', 'C:\\t', 'in.txt', 'err.txt', 'D000'])
  assert.deepEqual(calls[0].slice(2), [path.join('C:\\app\\sap', 'sl-transfer.vbs'), 'PS4', 'prep', 'D005', 'C:\\t', 'in.txt', 'err.txt', 'D000'])
  await run('sl-block', ['PS4', 'C:\\t', 'in.txt', 'INT4100-7883-0', '344'])
  await run('pidoc-post', ['PS4', '2026'])
  await run('sl-lookup', ['prep', 'C:\\t', 'out.txt', '393031157352189282'])
  assert.deepEqual(calls.map(args => path.basename(args[2])), ['sl-transfer.vbs', 'sl-block.vbs', 'pidoc-post.vbs', 'sl-lookup.vbs'])
})

test('read scripts are not tied to the configured system', async () => {
  const calls = []
  const execFile = (file, args, options, callback) => { calls.push({ args, options }); callback(null, '{"ok":true}') }
  const run = createCscriptRunner({ scriptDir: 'C:\\app\\sap', cscriptPath: 'cscript.exe', execFile, system: 'QS4' })
  await run('status')
  await run('sap-show', ['PS4', 'pidoc', '105900001', '2026'])
  await run('sl-lookup', ['prep', 'C:\\t', 'out.txt', '393031157352189282'])
  assert.deepEqual(calls.map(call => path.basename(call.args[2])), ['status.vbs', 'sap-show.vbs', 'sl-lookup.vbs'])
  assert.equal(calls[0].options.env.COUNTPOINT_SAP_SYSTEM, 'QS4')
})

test('the runner maps a killed process to a timeout', async () => {
  const run = createCscriptRunner({ scriptDir: 'C:\\sap', cscriptPath: 'cscript.exe', execFile: (f, a, o, cb) => cb(Object.assign(new Error('killed'), { killed: true })) })
  await assert.rejects(run('status'), { code: 'SAP_TIMEOUT' })
  const failing = createCscriptRunner({ scriptDir: 'C:\\sap', cscriptPath: 'cscript.exe', execFile: (f, a, o, cb) => cb(new Error('exit 1')) })
  await assert.rejects(failing('status'), { code: 'SAP_SCRIPT_FAILED' })
})

test('the 32-bit script host is preferred, falling back to System32', () => {
  assert.equal(defaultCscriptPath({ SystemRoot: 'C:\\Windows' }, () => true), path.join('C:\\Windows', 'SysWOW64', 'cscript.exe'))
  assert.equal(defaultCscriptPath({ SystemRoot: 'C:\\Windows' }, () => false), path.join('C:\\Windows', 'System32', 'cscript.exe'))
})
