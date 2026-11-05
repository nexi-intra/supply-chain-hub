'use strict'

const path = require('node:path')
const { Worker } = require('node:worker_threads')
const { LANGUAGES } = require('./tileSets.cjs')

const DEFAULT_WORKER_PATH = path.join(__dirname, 'wordCheckWorker.cjs')

function codedError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function createWordChecker({ timeoutMs = 20000, workerPath = DEFAULT_WORKER_PATH, idleMs = 10 * 60 * 1000 } = {}) {
  let worker = null
  let nextId = 1
  let idleTimer = null
  const pending = new Map()

  // Loaded dictionaries hold 150-450 MB, so an unused worker is released.
  function scheduleIdle() {
    clearTimeout(idleTimer)
    if (!worker || pending.size || !idleMs) return
    idleTimer = setTimeout(() => { if (!pending.size) void close() }, idleMs)
    idleTimer.unref?.()
  }

  function settleAllFor(target, error) {
    for (const [id, entry] of pending) {
      if (entry.worker !== target) continue
      pending.delete(id)
      clearTimeout(entry.timer)
      entry.reject(error)
    }
  }

  function dropWorker(target, error) {
    if (worker === target) worker = null
    settleAllFor(target, error)
  }

  function ensureWorker() {
    if (worker) return worker
    const created = new Worker(workerPath)
    created.unref()
    created.on('message', ({ id, result, error }) => {
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      clearTimeout(entry.timer)
      if (error) entry.reject(codedError('WORD_CHECK_WORKER', error))
      else entry.resolve(result)
      scheduleIdle()
    })
    created.on('error', error => dropWorker(created, codedError('WORD_CHECK_WORKER', `Word-check worker failed: ${error.message}`)))
    created.on('exit', code => dropWorker(created, codedError('WORD_CHECK_WORKER', `Word-check worker exited (${code})`)))
    worker = created
    return created
  }

  function request(language, words) {
    const target = ensureWorker()
    clearTimeout(idleTimer)
    const id = nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(codedError('WORD_CHECK_TIMEOUT', `Word check timed out after ${timeoutMs} ms`))
        // The worker may be wedged; restart it for the next call.
        const dead = codedError('WORD_CHECK_WORKER', 'Word-check worker restarted after a timeout')
        dropWorker(target, dead)
        target.terminate()
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer, worker: target })
      target.postMessage({ id, language, words })
    })
  }

  async function check(language, words) {
    if (!LANGUAGES.includes(language)) throw codedError('WORD_CHECK_LANGUAGE', `Unknown language: ${language}`)
    const unique = [...new Set(words)]
    if (unique.length === 0) return {}
    return request(language, unique)
  }

  /** Loads the language's dictionary in the worker now; the idle release still applies afterwards. */
  async function warm(language) {
    if (!LANGUAGES.includes(language)) throw codedError('WORD_CHECK_LANGUAGE', `Unknown language: ${language}`)
    await request(language, [])
  }

  async function close() {
    clearTimeout(idleTimer)
    const target = worker
    worker = null
    if (!target) return
    settleAllFor(target, codedError('WORD_CHECK_CLOSED', 'Word checker closed'))
    await target.terminate()
  }

  return { check, warm, close }
}

module.exports = { createWordChecker }
