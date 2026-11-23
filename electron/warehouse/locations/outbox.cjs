// Placeringer's local queue for when M: is down: a daily action that cannot reach the shared folder is kept in a JSON
// file on this PC and replayed in order when the folder is back. An action that is no longer possible then (the
// pallet was taken by someone else) is kept as a failure until a window has shown it, never retried. Every action id
// is applied at most once. After a storage error new actions are only queued for a while, so the Hub does not keep
// hanging on a dead share; the timer's flush is the retry. A busy share (the store gave up on its locks before
// writing anything) is handled the same way with a short random pause, since it is usually over in seconds, and the
// outbox itself tries again when that pause is over, so PCs that collided once do not collide again in step.
const fs = require('node:fs')
const path = require('node:path')

const QUEUED_METHODS = Object.freeze(new Set(['putAway', 'take', 'refill', 'move', 'changeSloc', 'editPallet', 'undo', 'shelfPut', 'shelfTake', 'shelfMove', 'shelfSet']))
const FILE = 'locations-outbox.json'
const KEEP_APPLIED = 1000
const KEEP_FAILURES = 200
const PAUSE_MS = 30000
const BUSY_PAUSE_MS = 5000
const BUSY_JITTER_MS = 5000

function codeError(code) {
  return Object.assign(new Error(code), { code })
}

function createOutbox({ dir, run, isStorageError, isBusyError = () => false, now = Date.now, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout, onQueued = () => {}, onFailed = () => {}, pauseMs = PAUSE_MS, busyPauseMs = BUSY_PAUSE_MS, busyJitterMs = BUSY_JITTER_MS }) {
  const file = path.join(dir, FILE)
  let state = load()
  let flushing = null
  let downUntil = 0
  // The one retry scheduled after a busy share; a new pause replaces it.
  let retry = null
  // Set by close(): a flush still running then must not schedule a new retry.
  let closed = false
  // What happened to an action replayed while its own submit() waits on the flush.
  const outcomes = new Map()

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      const list = value => (Array.isArray(value) ? value : [])
      return { queue: list(parsed.queue), applied: list(parsed.applied), failures: list(parsed.failures) }
    } catch {
      return { queue: [], applied: [], failures: [] }
    }
  }

  function save() {
    fs.mkdirSync(dir, { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temp, JSON.stringify(state), 'utf8')
    fs.renameSync(temp, file)
  }

  const applied = id => state.applied.includes(id)
  const queued = id => state.queue.some(action => action.id === id)
  function markApplied(id) {
    state.applied = [...state.applied, id].slice(-KEEP_APPLIED)
    state.queue = state.queue.filter(action => action.id !== id)
    save()
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
  function keep(entry) {
    state.queue.push(entry)
    save()
  }
  function announce(entry) {
    try { onQueued(entry) } catch {}
    return { queued: true }
  }

  /** Replays the queue in order; stops at the first storage or busy error so the order is kept. */
  function flush() {
    if (flushing) return flushing
    flushing = (async () => {
      let done = 0
      const failed = []
      const seen = []
      while (state.queue.length) {
        const action = state.queue[0]
        seen.push(action.id)
        if (applied(action.id)) { state.queue.shift(); save(); continue }
        try {
          outcomes.set(action.id, { result: await run(action) })
          markApplied(action.id)
          downUntil = 0
          cancelRetry()
          done++
        } catch (error) {
          if (pausedBy(error)) break
          outcomes.set(action.id, { error })
          const failure = { id: action.id, method: action.method, request: action.request, label: action.label || '', email: action.user?.email || '', team: action.user?.team || '', name: action.user?.fullName || '', code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR', message: String(error?.message || ''), at: now() }
          failed.push({ action, ...failure })
          // Kept until a window has shown it: whichever flush finds it, and also when Placeringer is not open.
          state.failures = [...state.failures, failure].slice(-KEEP_FAILURES)
          markApplied(action.id)
        }
      }
      // A waiting submit() reads its outcome right after this resolves; the rest is dropped.
      setTimeout(() => { for (const id of seen) outcomes.delete(id) }, 0)
      if (failed.length) { try { onFailed(failed) } catch {} }
      return { done, failed: failed.map(({ action, code, message }) => ({ action, code, message })) }
    })().finally(() => { flushing = null })
    return flushing
  }

  async function submit(action) {
    if (!action || typeof action.id !== 'string' || !action.id) throw codeError('OUTBOX_ID_INVALID')
    if (!QUEUED_METHODS.has(action.method)) throw codeError('OUTBOX_METHOD_NOT_ALLOWED')
    if (applied(action.id)) return { queued: false, duplicate: true }
    if (queued(action.id)) return { queued: true }
    const entry = { id: action.id, method: action.method, user: action.user, request: action.request, label: action.label || '', at: now() }
    if (now() < downUntil) {
      // M: failed or was busy a moment ago: keep the action here and let a retry find out when it can be reached.
      keep(entry)
      return announce(entry)
    }
    if (state.queue.length || flushing) {
      // Behind the queue, so a take never overtakes the put-away it depends on.
      keep(entry)
      await flush()
      const outcome = outcomes.get(entry.id)
      outcomes.delete(entry.id)
      if (!outcome) return announce(entry)
      if (outcome.error) {
        // The person is waiting and sees the error, so it is not kept as a failure to report later.
        state.failures = state.failures.filter(item => item.id !== entry.id)
        save()
        throw outcome.error
      }
      return { queued: false, result: outcome.result }
    }
    try {
      const result = await run(entry)
      state.applied = [...state.applied, entry.id].slice(-KEEP_APPLIED)
      save()
      return { queued: false, result }
    } catch (error) {
      if (!pausedBy(error)) throw error
      keep(entry)
      return announce(entry)
    }
  }

  /** Replayed actions that could not be done and have not been shown yet; `filter` picks a person's own. */
  const failures = (filter = () => true) => state.failures.filter(filter)
  function acknowledge(ids) {
    const gone = new Set(ids)
    state.failures = state.failures.filter(item => !gone.has(item.id))
    save()
  }

  function close() {
    closed = true
    cancelRetry()
  }

  return { submit, flush, pending: () => state.queue.length, failures, acknowledge, close }
}

module.exports = { createOutbox, QUEUED_METHODS }
