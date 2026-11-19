// Persistent diagnostics for the main process. A packaged Windows app has no
// console, so without this a crash or a "Not responding" freeze leaves no trace.
// Writes go to the LOCAL userData folder (never the network share) and every
// failure is swallowed: logging must never be the thing that takes the app down.
const fs = require('node:fs')
const path = require('node:path')
const util = require('node:util')

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

function createDiagnosticsLog(directory, { maxBytes = DEFAULT_MAX_BYTES, now = () => new Date() } = {}) {
  const file = path.join(directory, 'main.log')
  const previous = path.join(directory, 'main.1.log')
  let size = null
  let ready = false

  function prepare() {
    if (ready) return
    fs.mkdirSync(directory, { recursive: true })
    try { size = fs.statSync(file).size } catch { size = 0 }
    ready = true
  }

  function write(level, ...parts) {
    try {
      prepare()
      const text = parts.map(part => (typeof part === 'string' ? part : util.inspect(part, { depth: 4, breakLength: Infinity }))).join(' ')
      const line = `${now().toISOString()} [${process.pid}] ${level.toUpperCase()} ${text}\n`
      if (size + Buffer.byteLength(line) > maxBytes) {
        try { fs.rmSync(previous, { force: true }); fs.renameSync(file, previous) } catch { /* keep writing to the current file */ }
        size = 0
      }
      fs.appendFileSync(file, line)
      size += Buffer.byteLength(line)
    } catch { /* never let diagnostics throw */ }
  }

  return { file, write }
}

/**
 * Mirrors console output into the log and makes stdout/stderr failures harmless.
 * Measured: with a closed stdout pipe, console.error in an uncaughtException
 * handler threw EPIPE again, re-entering the handler ~15,000 times a minute
 * (931 MB). Stream errors are now swallowed and EPIPE is never re-logged.
 */
function installMainDiagnostics(log, { processRef = process, consoleRef = console } = {}) {
  for (const stream of [processRef.stdout, processRef.stderr]) stream?.on?.('error', () => {})
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = consoleRef[level].bind(consoleRef)
    consoleRef[level] = (...args) => {
      log.write(level, ...args)
      try { original(...args) } catch { /* a broken console must not throw */ }
    }
  }
  const isBrokenPipe = error => error && (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED')
  processRef.on('uncaughtException', error => { if (!isBrokenPipe(error)) log.write('fatal', 'MAIN UNCAUGHT EXCEPTION', error) })
  processRef.on('unhandledRejection', reason => { if (!isBrokenPipe(reason)) log.write('error', 'MAIN UNHANDLED REJECTION', reason) })
}

/** Reloads a crashed renderer at most `limit` times per `windowMs`, so a page that crashes on load cannot loop forever. */
function createCrashRecovery({ limit = 3, windowMs = 5 * 60 * 1000, now = Date.now } = {}) {
  const crashes = []
  return {
    shouldReload(reason) {
      if (reason === 'clean-exit') return false
      const at = now()
      while (crashes.length && at - crashes[0] > windowMs) crashes.shift()
      crashes.push(at)
      return crashes.length <= limit
    },
  }
}

module.exports = { createDiagnosticsLog, installMainDiagnostics, createCrashRecovery }
