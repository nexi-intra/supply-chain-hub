// Placeringer's local queue on this PC. Every daily action is written to a JSON file here before it is run (write-ahead)
// and leaves it when M: has it, so an action the screen has shown as done survives the Hub being closed, reloaded or
// crashing and the PC being switched off; whatever is left in the file is replayed at the next start. The actions run
// one at a time in the order they came, also when several are sent at once. When M: is down an action simply stays in
// the file and is replayed in order when the folder is back. An action that is no longer possible then (the pallet was
// taken by someone else) is kept as a failure until a window has shown it, never retried. Every action id is applied at
// most once (here and in the shared data, so a replay of an action M: already had changes nothing). After a storage
// error new actions are only queued for a while, so the Hub does not keep hanging on a dead share; the timer's flush is
// the retry. A busy share (the store gave up on its locks before writing anything) is handled the same way with a short
// random pause, since it is usually over in seconds, and the outbox itself tries again when that pause is over, so PCs
// that collided once do not collide again in step.
const fs = require('node:fs')
const path = require('node:path')

const QUEUED_METHODS = Object.freeze(new Set(['putAway', 'take', 'refill', 'move', 'changeSloc', 'editPallet', 'undo', 'shelfPut', 'shelfTake', 'shelfMove', 'shelfSet']))
const FILE = 'locations-outbox.json'
const KEEP_APPLIED = 1000
const KEEP_FAILURES = 200
const PAUSE_MS = 30000
const BUSY_PAUSE_MS = 5000
const BUSY_JITTER_MS = 5000
// Windows refuses a rename for a moment while a virus scanner or the indexer has the file open (as in store.cjs).
const SAVE_ATTEMPTS = 10
const SAVE_RETRY_MS = 50
const RETRIED_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

function codeError(code) {
  return Object.assign(new Error(code), { code })
}

function createOutbox({ dir, run, isStorageError, isBusyError = () => false, now = Date.now, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout, onQueued = () => {}, onFailed = () => {}, pauseMs = PAUSE_MS, busyPauseMs = BUSY_PAUSE_MS, busyJitterMs = BUSY_JITTER_MS, rename = fs.promises.rename, openFile = fs.promises.open, saveRetryMs = SAVE_RETRY_MS }) {
  const file = path.join(dir, FILE)
  let state = load()
  let draining = null
  let downUntil = 0
  // The one retry scheduled after a busy share; a new pause replaces it.
  let retry = null
  // Set by close(): a flush still running then must not schedule a new retry.
  let closed = false
  // The saves, one after another; each writes the state as it is when it starts.
  let saving = Promise.resolve()
  let temps = 0
  // Actions written ahead whose save has not reached the disk yet: none of them is run before it has.
  const ahead = new Map()
  // Actions whose submit() waits for the answer (the person sees it): not "waiting for M:", and an error is not kept.
  const waiting = new Map()
  // whenWritten() calls waiting for every write-ahead to be on disk.
  const writtenWaiters = new Set()

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      const list = value => (Array.isArray(value) ? value : [])
      return { queue: list(parsed.queue), applied: list(parsed.applied), failures: list(parsed.failures) }
    } catch {
      return { queue: [], applied: [], failures: [] }
    }
  }

  async function writeFile(json) {
    await fs.promises.mkdir(dir, { recursive: true })
    const temp = `${file}.${process.pid}.${++temps}.tmp`
    try {
      // On the disk before the rename, so a power cut never leaves an empty or half file behind.
      const handle = await openFile(temp, 'w')
      try {
        await handle.writeFile(json, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      for (let attempt = 1; ; attempt++) {
        try {
          await rename(temp, file)
          return
        } catch (error) {
          if (!RETRIED_CODES.has(error?.code) || attempt >= SAVE_ATTEMPTS) throw error
          await new Promise(resolve => setTimeout(resolve, saveRetryMs))
        }
      }
    } catch (error) {
      // Whatever failed (write, fsync or rename), no temp file is left behind.
      await fs.promises.unlink(temp).catch(() => {})
      throw error
    }
  }

  function save({ onFail } = {}) {
    const link = saving.then(async () => {
      const ids = state.queue.map(action => action.id)
      await writeFile(JSON.stringify(state))
      for (const id of ids) ahead.get(id)?.resolve()
    }).catch(error => {
      onFail?.(error)
      throw error
    })
    saving = link.catch(() => {})
    return link
  }
  // A save after the fact (done, dropped, shown): when it fails the next save writes it, and a replay is applied once.
  const persist = () => save().catch(() => {})

  const applied = id => state.applied.includes(id)
  const queued = id => state.queue.some(action => action.id === id)
  function dequeue(id) {
    state.queue = state.queue.filter(action => action.id !== id)
  }
  function markApplied(id) {
    state.applied = [...state.applied, id].slice(-KEEP_APPLIED)
    dequeue(id)
    return persist()
  }
  function answer(id, outcome) {
    const resolve = waiting.get(id)
    if (!resolve) return
    waiting.delete(id)
    resolve(outcome)
  }

  /** Puts the action last in the queue and resolves when that is on disk; a save that keeps failing refuses it. */
  function writeAhead(entry) {
    state.queue.push(entry)
    const pending = {}
    const written = () => {
      ahead.delete(entry.id)
      if (!ahead.size) for (const done of [...writtenWaiters]) done()
    }
    pending.promise = new Promise((resolve, reject) => {
      pending.resolve = () => { written(); resolve() }
      pending.reject = error => { written(); reject(error) }
    })
    ahead.set(entry.id, pending)
    save({
      onFail: error => {
        // Already on disk through an earlier save: it is kept.
        if (ahead.get(entry.id) !== pending) return
        dequeue(entry.id)
        pending.reject(Object.assign(codeError('OUTBOX_SAVE_FAILED'), { cause: error }))
      },
    }).catch(() => {})
    return pending.promise
  }

  const wentDown = (ms = pauseMs) => { downUntil = now() + ms }
  function cancelRetry() {
    if (retry) clearTimer(retry)
    retry = null
  }
  // Many PCs replay at once when M: is back; the random part keeps them from all trying again in the same instant.
  function wasBusy() {
    const pause = busyPauseMs + Math.floor(random() * busyJitterMs)
    wentDown(pause)
    cancelRetry()
    if (closed) return
    const timer = setTimer(() => {
      if (retry === timer) retry = null
      if (closed) return
      flush().catch(() => {})
    }, pause)
    timer?.unref?.()
    retry = timer
  }
  /** True when the action is kept for a retry: M: is down or busy. */
  function pausedBy(error) {
    // Down: the 30 s timer is the retry; a short one would only hit the dead share sooner.
    if (isStorageError(error)) { cancelRetry(); wentDown(); return true }
    if (isBusyError(error)) { wasBusy(); return true }
    return false
  }
  function announce(entry) {
    try { onQueued(entry) } catch {}
    return { queued: true }
  }

  /** Runs the queue in order, one action at a time; stops at the first storage or busy error so the order is kept. */
  function drain() {
    if (draining) return draining
    let finished = false
    let current = null
    current = (async () => {
      let done = 0
      const failed = []
      try {
        while (state.queue.length) {
          const action = state.queue[0]
          const written = ahead.get(action.id)
          if (written) { await written.promise.catch(() => {}); continue }
          if (applied(action.id)) {
            dequeue(action.id)
            await persist()
            answer(action.id, { duplicate: true })
            continue
          }
          let result
          try {
            result = await run(action)
          } catch (error) {
            if (pausedBy(error)) break
            if (waiting.has(action.id)) {
              // The person waiting sees the error, so it is not kept as a failure to report later.
              dequeue(action.id)
              await persist()
              answer(action.id, { error })
              continue
            }
            const failure = { id: action.id, method: action.method, request: action.request, label: action.label || '', email: action.user?.email || '', team: action.user?.team || '', name: action.user?.fullName || '', code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR', message: String(error?.message || ''), at: now() }
            failed.push({ action, ...failure })
            // Kept until a window has shown it: whichever flush finds it, and also when Placeringer is not open.
            state.failures = [...state.failures, failure].slice(-KEEP_FAILURES)
            await markApplied(action.id)
            // Told at once: the actions behind it may take a while.
            try { onFailed([{ action, ...failure }]) } catch {}
            continue
          }
          downUntil = 0
          cancelRetry()
          done++
          await markApplied(action.id)
          answer(action.id, { result })
        }
        return { done, failed: failed.map(({ action, code, message }) => ({ action, code, message })) }
      } finally {
        finished = true
        if (draining === current) draining = null
        // Stopped by M: (or by something unexpected): whoever still waits is told the action is kept here.
        for (const id of [...waiting.keys()]) if (queued(id)) answer(id, { queued: true })
      }
    })()
    if (!finished) draining = current
    return current
  }
  const flush = () => drain()

  async function submit(action) {
    if (!action || typeof action.id !== 'string' || !action.id) throw codeError('OUTBOX_ID_INVALID')
    if (!QUEUED_METHODS.has(action.method)) throw codeError('OUTBOX_METHOD_NOT_ALLOWED')
    if (applied(action.id)) return { queued: false, duplicate: true }
    if (queued(action.id)) return { queued: true }
    const entry = { id: action.id, method: action.method, user: action.user, request: action.request, label: action.label || '', at: now() }
    const outcome = new Promise(resolve => waiting.set(entry.id, resolve))
    try {
      await writeAhead(entry)
    } catch (error) {
      waiting.delete(entry.id)
      throw error
    }
    if (now() < downUntil) {
      // M: failed or was busy a moment ago: keep the action here and let a retry find out when it can be reached.
      waiting.delete(entry.id)
      return announce(entry)
    }
    // Behind whatever is in the queue, so a take never overtakes the put-away it depends on.
    drain().catch(() => {})
    const answered = await outcome
    if (answered.error) throw answered.error
    if (answered.queued) return announce(entry)
    if (answered.duplicate) return { queued: false, duplicate: true }
    return { queued: false, result: answered.result }
  }

  /** Replayed actions that could not be done and have not been shown yet; `filter` picks a person's own. */
  const failures = (filter = () => true) => state.failures.filter(filter)
  function acknowledge(ids) {
    const gone = new Set(ids)
    state.failures = state.failures.filter(item => !gone.has(item.id))
    return persist()
  }

  /**
   * Resolves true when every action handed in is on this PC's disk (written ahead, and the saves so far are done), false
   * after `timeoutMs`. What is on disk is safe: it is replayed at the next start, so a close need not wait for M:.
   */
  function whenWritten(timeoutMs) {
    return new Promise(resolve => {
      let timer = null
      let done = false
      const finish = value => {
        if (done) return
        done = true
        writtenWaiters.delete(check)
        if (timer) clearTimeout(timer)
        resolve(value)
      }
      const check = () => { writtenWaiters.delete(check); saving.then(() => finish(true)) }
      timer = setTimeout(() => finish(false), Math.max(0, timeoutMs))
      timer.unref?.()
      if (!ahead.size) check()
      else writtenWaiters.add(check)
    })
  }

  /** Stops the retries; resolves when the last save is on disk. */
  function close() {
    closed = true
    cancelRetry()
    return saving
  }

  return {
    submit,
    flush,
    // Kept here for M: (shown as "venter på M:"), not the ones running right now with a person waiting for them.
    pending: () => state.queue.filter(action => !waiting.has(action.id)).length,
    // Everything not yet on M:, also what is running right now (diagnostics).
    unsettled: () => state.queue.length,
    // Handed in but not yet on this PC's disk: the only actions a close has to wait for.
    unwritten: () => ahead.size,
    whenWritten,
    failures,
    acknowledge,
    close,
  }
}

module.exports = { createOutbox, QUEUED_METHODS }
