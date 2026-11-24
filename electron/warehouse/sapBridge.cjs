// Runs CountPoint's fixed SAP GUI scripts with the 32-bit script host (SAP GUI
// is 32-bit; 64-bit COM cannot load its type library). Only scripts on the
// allow-list can run, one SAP job at a time (a write frees the queue once it has
// handed SAP to the user), each with a timeout.
const fs = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')
const { computeSapState, EXPECTED } = require('./sapState.cjs')

const SCRIPTS = Object.freeze({ status: 'status.vbs', export: 'export.vbs', matdoc: 'matdoc.vbs', longserno: 'longserno.vbs', stockcheck: 'stockcheck.vbs', mm60: 'mm60.vbs', 'sap-show': 'sap-show.vbs', 'sl-lookup': 'sl-lookup.vbs' })
// Scripts that CHANGE SAP. Their first argument is the SAP system. The runner refuses it unless it is the system this
// installation is configured for AND on WRITE_SYSTEMS; the scripts themselves do not check it.
const WRITE_SCRIPTS = Object.freeze({ 'pidoc-create': 'pidoc-create.vbs', 'pidoc-print': 'pidoc-print.vbs', 'pidoc-serials': 'pidoc-serials.vbs', 'pidoc-count': 'pidoc-count.vbs', 'pidoc-post': 'pidoc-post.vbs', 'pidoc-delete': 'pidoc-delete.vbs', 'sl-transfer': 'sl-transfer.vbs', 'sl-block': 'sl-block.vbs' })
// PS4 enabled 2026-10-20 after the full flow was verified in QS4.
const WRITE_SYSTEMS = Object.freeze(['PS4', 'QS4'])
// Write scripts with their own list of systems (instead of WRITE_SYSTEMS). Softwareload: PS4 enabled 2026-11-23 after
// the full flow (KIF from several locations, failed -0/-R, resume after a lost answer, abandon) was verified in QS4.
const SCRIPT_WRITE_SYSTEMS = Object.freeze({ 'sl-transfer': Object.freeze(['PS4', 'QS4']), 'sl-block': Object.freeze(['PS4', 'QS4']) })
const SOFTWARELOAD_WRITE_SYSTEMS = SCRIPT_WRITE_SYSTEMS['sl-transfer']
const SAFE_ARGUMENT = /^[A-Za-z0-9 _.:\\/-]{0,260}$/

function codeError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function defaultCscriptPath(env = process.env, exists = fs.existsSync) {
  const root = env.SystemRoot || env.windir || 'C:\\Windows'
  const wow64 = path.join(root, 'SysWOW64', 'cscript.exe')
  return exists(wow64) ? wow64 : path.join(root, 'System32', 'cscript.exe')
}

function createCscriptRunner({ scriptDir, cscriptPath = defaultCscriptPath(), execFile = childProcess.execFile, timeoutMs = 15000, writeSystems = WRITE_SYSTEMS, system = 'PS4', client = EXPECTED.client }) {
  // `system` is the configured SAP system and `client` the expected client. Scripts pick the connection to them (env
  // COUNTPOINT_SAP_SYSTEM, COUNTPOINT_SAP_CLIENT); write scripts also get the system as their first argument, and only it.
  const env = { ...process.env, COUNTPOINT_SAP_SYSTEM: system, COUNTPOINT_SAP_CLIENT: client }
  return function runScript(name, args = [], options = {}) {
    const write = Object.hasOwn(WRITE_SCRIPTS, name)
    if (!write && !Object.hasOwn(SCRIPTS, name)) return Promise.reject(codeError('SAP_SCRIPT_NOT_ALLOWED'))
    if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string' && SAFE_ARGUMENT.test(arg))) return Promise.reject(codeError('SAP_INVALID_ARGUMENT'))
    if (write && (args[0] !== system || !(SCRIPT_WRITE_SYSTEMS[name] || writeSystems).includes(args[0]))) return Promise.reject(codeError('SAP_WRITE_SYSTEM_NOT_ALLOWED'))
    const script = path.join(scriptDir, write ? WRITE_SCRIPTS[name] : SCRIPTS[name])
    return new Promise((resolve, reject) => {
      const child = execFile(cscriptPath, ['//NoLogo', '//E:vbscript', script, ...args], { timeout: options.timeoutMs || timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024, env }, (error, stdout) => {
        if (error) return reject(codeError(error.killed || error.signal ? 'SAP_TIMEOUT' : 'SAP_SCRIPT_FAILED'))
        resolve(String(stdout))
      })
      if (options.onLine && child?.stdout) child.stdout.on('data', stageLines(options.onLine))
    })
  }
}

/** A `data` listener that passes each complete stdout line that is JSON with a `stage` field to `onLine`. */
function stageLines(onLine) {
  let pending = ''
  return chunk => {
    const lines = (pending + String(chunk)).split(/\r?\n/)
    pending = lines.pop()
    for (const line of lines) {
      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      if (!parsed || typeof parsed !== 'object' || !Object.hasOwn(parsed, 'stage')) continue
      try {
        onLine(parsed)
      } catch (error) {
        console.error('CountPoint: SAP stage line handler failed', error)
      }
    }
  }
}

function parseLastJsonLine(output) {
  const line = String(output).trim().split(/\r?\n/).pop()
  return JSON.parse(line)
}

function createSapBridge({ runScript, expected = EXPECTED, now = Date.now, cacheMs = 2000 }) {
  let queue = Promise.resolve()
  let last = null
  let pendingStatus = null

  /** Every SAP job goes through here so two scripts never drive SAP at the same time. */
  function exclusive(job) {
    const run = queue.then(job, job)
    queue = run.catch(() => {})
    return run
  }

  /**
   * A job that hands SAP to the user: it gets `release` and holds the queue until it calls it (the user has the screen)
   * or ends, also when it fails. Other SAP jobs may run while the user works in SAP.
   */
  function handOver(job) {
    let release
    const released = new Promise(resolve => { release = () => resolve() })
    const start = () => job(release)
    const run = queue.then(start, start)
    queue = Promise.race([released, run.then(() => {}, () => {})])
    return run
  }

  function status({ fresh = false } = {}) {
    if (!fresh && last && now() - last.at < cacheMs) return Promise.resolve(last.value)
    if (pendingStatus) return pendingStatus
    pendingStatus = exclusive(async () => {
      let value
      try {
        value = computeSapState(parseLastJsonLine(await runScript('status')), expected)
      } catch (error) {
        value = { state: 'error', ready: false, system: null, client: null, user: null, reason: error.code === 'SAP_TIMEOUT' ? 'timeout' : 'failed' }
      }
      last = { at: now(), value }
      return value
    }).finally(() => { pendingStatus = null })
    return pendingStatus
  }

  return { status, exclusive, handOver }
}

module.exports = { createSapBridge, createCscriptRunner, defaultCscriptPath, SCRIPTS, WRITE_SCRIPTS, WRITE_SYSTEMS, SCRIPT_WRITE_SYSTEMS, SOFTWARELOAD_WRITE_SYSTEMS }
