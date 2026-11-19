const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { createDiagnosticsLog, installMainDiagnostics, createCrashRecovery } = require('./diagnostics.cjs')

function temporaryDir(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-diagnostics-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('the log is written to disk and rotated when it grows past maxBytes', t => {
  const directory = path.join(temporaryDir(t), 'logs')
  const log = createDiagnosticsLog(directory, { maxBytes: 200 })
  log.write('info', 'first', { n: 1 })
  assert.match(fs.readFileSync(log.file, 'utf8'), /INFO first \{ n: 1 \}/)
  for (let i = 0; i < 10; i++) log.write('warn', `line ${i}`)
  assert.ok(fs.existsSync(path.join(directory, 'main.1.log')))
  assert.ok(fs.statSync(log.file).size <= 200)
  assert.match(fs.readFileSync(log.file, 'utf8'), /line 9/)
})

test('a log that cannot be written never throws', t => {
  const blocker = path.join(temporaryDir(t), 'not-a-directory')
  fs.writeFileSync(blocker, 'x')
  const log = createDiagnosticsLog(path.join(blocker, 'logs'))
  assert.doesNotThrow(() => log.write('error', 'still fine'))
})

test('a broken stdout pipe cannot start an exception loop', t => {
  const directory = temporaryDir(t)
  const log = createDiagnosticsLog(directory)
  const processRef = new EventEmitter()
  processRef.stdout = new EventEmitter()
  processRef.stderr = new EventEmitter()
  let printed = 0
  const consoleRef = { log() { printed++ }, info() {}, warn() {}, error() { throw Object.assign(new Error('EPIPE: broken pipe, write'), { code: 'EPIPE' }) } }
  installMainDiagnostics(log, { processRef, consoleRef })

  assert.doesNotThrow(() => processRef.stdout.emit('error', Object.assign(new Error('EPIPE'), { code: 'EPIPE' })))
  assert.doesNotThrow(() => consoleRef.error('boom'))
  processRef.emit('uncaughtException', Object.assign(new Error('EPIPE: broken pipe, write'), { code: 'EPIPE' }))
  processRef.emit('uncaughtException', new Error('real failure'))
  consoleRef.log('hello')
  const text = fs.readFileSync(log.file, 'utf8')
  assert.equal((text.match(/MAIN UNCAUGHT EXCEPTION/g) || []).length, 1)
  assert.match(text, /real failure/)
  assert.match(text, /ERROR boom/)
  assert.equal(printed, 1)
})

test('a crashed renderer is reloaded at most three times in five minutes, never after a clean exit', () => {
  let clock = 0
  const recovery = createCrashRecovery({ now: () => clock })
  assert.equal(recovery.shouldReload('clean-exit'), false)
  assert.deepEqual([1, 2, 3, 4].map(() => recovery.shouldReload('crashed')), [true, true, true, false])
  clock += 5 * 60 * 1000 + 1
  assert.equal(recovery.shouldReload('oom'), true)
})
