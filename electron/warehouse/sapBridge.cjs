// Runs CountPoint's fixed SAP GUI scripts with the 32-bit script host (SAP GUI
// is 32-bit; 64-bit COM cannot load its type library). Only scripts on the
// allow-list can run, one SAP job at a time, each with a timeout.
const fs = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')
const { computeSapState, EXPECTED } = require('./sapState.cjs')

const SCRIPTS = Object.freeze({ status: 'status.vbs', export: 'export.vbs', matdoc: 'matdoc.vbs', longserno: 'longserno.vbs', stockcheck: 'stockcheck.vbs', mm60: 'mm60.vbs', 'sap-show': 'sap-show.vbs' })
// Scripts that CHANGE SAP. Their first argument is the SAP system, which must be on WRITE_SYSTEMS (the scripts check it again).
const WRITE_SCRIPTS = Object.freeze({ 'pidoc-create': 'pidoc-create.vbs', 'pidoc-print': 'pidoc-print.vbs', 'pidoc-serials': 'pidoc-serials.vbs', 'pidoc-count': 'pidoc-count.vbs', 'pidoc-post': 'pidoc-post.vbs', 'pidoc-delete': 'pidoc-delete.vbs' })
// PS4 enabled 2026-10-20 after the full flow was verified in QS4.
const WRITE_SYSTEMS = Object.freeze(['PS4', 'QS4'])
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

function createCscriptRunner({ scriptDir, cscriptPath = defaultCscriptPath(), execFile = childProcess.execFile, timeoutMs = 15000, writeSystems = WRITE_SYSTEMS, system = 'PS4' }) {
  // Read scripts pick the connection to this system (env COUNTPOINT_SAP_SYSTEM); write scripts get it as argument.
  const env = { ...process.env, COUNTPOINT_SAP_SYSTEM: system }
  return function runScript(name, args = [], options = {}) {
    const write = Object.hasOwn(WRITE_SCRIPTS, name)
    if (!write && !Object.hasOwn(SCRIPTS, name)) return Promise.reject(codeError('SAP_SCRIPT_NOT_ALLOWED'))
    if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string' && SAFE_ARGUMENT.test(arg))) return Promise.reject(codeError('SAP_INVALID_ARGUMENT'))
    if (write && !writeSystems.includes(args[0])) return Promise.reject(codeError('SAP_WRITE_SYSTEM_NOT_ALLOWED'))
    const script = path.join(scriptDir, write ? WRITE_SCRIPTS[name] : SCRIPTS[name])
    return new Promise((resolve, reject) => {
      execFile(cscriptPath, ['//NoLogo', '//E:vbscript', script, ...args], { timeout: options.timeoutMs || timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024, env }, (error, stdout) => {
        if (error) return reject(codeError(error.killed || error.signal ? 'SAP_TIMEOUT' : 'SAP_SCRIPT_FAILED'))
        resolve(String(stdout))
      })
    })
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

  return { status, exclusive }
}

module.exports = { createSapBridge, createCscriptRunner, defaultCscriptPath, SCRIPTS, WRITE_SCRIPTS, WRITE_SYSTEMS }
