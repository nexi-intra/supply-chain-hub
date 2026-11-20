// Softwareload: a worker's own timed task of loading software on terminals. They choose the type, KIF or not, the target
// storage location and the version, then scan the serial numbers and mark the broken ones as failed. Like Stempelkort,
// each person writes only their own running task, so colleagues never wait for each other's locks. No Electron imports:
// register.cjs wires it to IPC, tests drive it directly.
const crypto = require('node:crypto')
const { normalizeSerial } = require('../core/countState.cjs')
const { normalizeSloc } = require('./core/planMoves.cjs')

const TYPES = ['sw+key', 'sw', 'key']
const VERSION_MAX = 60
const VERSIONS_KEPT = 50
const NOTE_MAX = 200
const VERSIONS_KEY = 'versioner'
const PENDING_PREFIX = 'venter-'

function codeError(code, message) {
  return Object.assign(new Error(message || code), { code })
}

const lower = value => String(value || '').trim().toLowerCase()
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const writerOf = email => crypto.createHash('sha256').update(lower(email)).digest('hex').slice(0, 16)
const runningKey = email => `aktiv-${writerOf(email)}`
const pausedMs = (pauses, end) => pauses.reduce((sum, pause) => sum + Math.max(0, Math.min(pause.to ?? end, end) - pause.from), 0)
const isPaused = task => { const open = task.pauses.at(-1); return Boolean(open && open.to == null) }
const notRunning = () => codeError('SOFTWARELOAD_NOT_RUNNING', 'Der kører ikke nogen softwareload-opgave')

function createSoftwareloadService({ storeFor, indexStore, sap, timeclock, now = Date.now, newId = () => crypto.randomUUID(), matdocs }) {
  /** A Hub manager or creator; a status manager from Optælling is a manager there only. */
  const isManager = user => (user.role === 'manager' || user.role === 'creator') && !user.statusManager
  const me = user => ({ email: lower(user.email), name: user.fullName || user.email })

  function choice(input) {
    const type = TYPES.includes(input?.type) ? input.type : null
    if (!type) throw codeError('SOFTWARELOAD_INVALID', 'Vælg om der lægges software, nøgle eller begge dele på')
    const target = normalizeSloc(input?.target)
    if (!target) throw codeError('SOFTWARELOAD_INVALID', 'Lagerstedet skal være et bogstav og tre cifre, fx D006')
    const version = clean(input?.version, VERSION_MAX)
    if (!version) throw codeError('SOFTWARELOAD_INVALID', 'Skriv softwareversionen')
    return { type, kif: input?.kif === true, target, version }
  }

  function serialOf(input) {
    const serial = normalizeSerial(input?.serial)
    if (!serial) throw codeError('SOFTWARELOAD_INVALID', 'Ugyldigt serienummer')
    return serial
  }

  /** What the screen shows of a running task; the times come from this PC's clock, so the screen can count on. */
  function view(task) {
    if (!task) return null
    const at = now()
    const paused = pausedMs(task.pauses, at)
    const terminals = Object.entries(task.terminals).reverse()
      .map(([serial, terminal]) => ({ serial, at: terminal.at, ...(terminal.failed ? { failed: { note: terminal.failed.note } } : {}) }))
      .sort((a, b) => b.at - a.at)
    return {
      id: task.id, type: task.type, kif: task.kif, target: task.target, version: task.version, startedAt: task.startedAt,
      paused: isPaused(task), pausedMs: paused, workedMs: at - task.startedAt - paused, now: at, terminals,
    }
  }

  const readRunning = (user, options) => storeFor(user.team).getAsync(runningKey(user.email), options)

  /** Changes the person's running task under its lock; `change` returns the new task. */
  async function changeRunning(user, change) {
    let next = null
    await storeFor(user.team).mutateAsync(runningKey(user.email), current => {
      if (!current) throw notRunning()
      next = change(current)
      return next
    })
    return next
  }

  async function pendingTasks(user) {
    const store = storeFor(user.team)
    const keys = (await store.keysAsync()).filter(key => key.startsWith(PENDING_PREFIX))
    const tasks = await Promise.all(keys.map(key => store.getAsync(key).catch(() => null)))
    const email = lower(user.email)
    return tasks
      .filter(task => task && (isManager(user) || task.email === email))
      .map(task => ({ id: task.id, name: task.name, email: task.email, endedAt: task.endedAt, count: Object.keys(task.terminals || {}).length }))
      .sort((a, b) => a.endedAt - b.endedAt)
  }

  async function status(user) {
    const [running, pending] = await Promise.all([readRunning(user), pendingTasks(user)])
    return { running: view(running), pending, isManager: isManager(user), writeEnabled: Boolean(sap?.writeEnabled) }
  }

  async function rememberVersion(user, version) {
    await storeFor(user.team).mutateAsync(VERSIONS_KEY, current => {
      const list = Array.isArray(current) ? current : []
      return [version, ...list.filter(item => item !== version)].slice(0, VERSIONS_KEPT)
    })
  }

  /** Stops Stempelkort when it runs. stop() reads past the cache, so it is asked directly rather than a (possibly stale) status. */
  async function stopTimeclock(user) {
    try {
      const stopped = await timeclock.stop(user, {})
      return { taskName: stopped.taskName, workedMs: stopped.workedMs }
    } catch (error) {
      if (error?.code === 'TIMECLOCK_NOT_RUNNING') return null
      if (error?.code === 'TIMECLOCK_LONG_RUN') throw codeError('SOFTWARELOAD_TIMECLOCK_LONG_RUN', 'Stempelkortet har kørt i over 10 timer. Stop det i Stempelkort med det rigtige sluttidspunkt, og start så softwareload-opgaven')
      throw error
    }
  }

  async function start(user, input = {}) {
    const chosen = choice(input)
    if (await readRunning(user, { skipCache: true })) throw codeError('SOFTWARELOAD_RUNNING', 'Der kører allerede en softwareload-opgave')
    const stoppedTimeclock = await stopTimeclock(user)
    let started = null
    await storeFor(user.team).mutateAsync(runningKey(user.email), current => {
      if (current) throw codeError('SOFTWARELOAD_RUNNING', 'Der kører allerede en softwareload-opgave')
      started = { id: newId(), team: user.team, ...me(user), ...chosen, startedAt: now(), pauses: [], terminals: {}, state: 'running' }
      return started
    })
    await rememberVersion(user, chosen.version)
    return { ...view(started), ...(stoppedTimeclock ? { stoppedTimeclock } : {}) }
  }

  async function scan(user, input) {
    const serial = serialOf(input)
    const task = await changeRunning(user, current => {
      if (current.terminals[serial]) throw codeError('SOFTWARELOAD_DUPLICATE', 'Serienummeret er allerede scannet i opgaven')
      return { ...current, terminals: { ...current.terminals, [serial]: { at: now() } } }
    })
    return { serial, count: Object.keys(task.terminals).length }
  }

  /** Changes one scanned terminal of the running task; `change` returns the new terminal, or null to remove it. */
  function changeTerminal(user, serial, change) {
    return changeRunning(user, current => {
      const terminal = current.terminals[serial]
      if (!terminal) throw codeError('SOFTWARELOAD_INVALID', 'Serienummeret er ikke scannet i opgaven')
      const terminals = { ...current.terminals }
      const next = change(terminal)
      if (next) terminals[serial] = next
      else delete terminals[serial]
      return { ...current, terminals }
    })
  }

  async function unscan(user, input) {
    const serial = serialOf(input)
    const task = await changeTerminal(user, serial, () => null)
    return { serial, count: Object.keys(task.terminals).length }
  }

  async function markFailed(user, input) {
    const serial = serialOf(input)
    const note = clean(input?.note, NOTE_MAX)
    if (!note) throw codeError('SOFTWARELOAD_INVALID', 'Skriv hvad der fejlede')
    return view(await changeTerminal(user, serial, terminal => ({ ...terminal, failed: { note, at: now(), by: me(user) } })))
  }

  async function unmarkFailed(user, input) {
    const serial = serialOf(input)
    return view(await changeTerminal(user, serial, ({ failed, ...terminal }) => terminal))
  }

  function withPause(task, pause) {
    return { ...task, pauses: pause ? [...task.pauses, { from: now(), to: null }] : task.pauses.map((item, index) => (index === task.pauses.length - 1 ? { ...item, to: now() } : item)) }
  }

  async function changePause(user, pause) {
    return view(await changeRunning(user, current => {
      const paused = isPaused(current)
      if (pause && paused) throw codeError('SOFTWARELOAD_PAUSED', 'Opgaven holder allerede pause')
      if (!pause && !paused) throw codeError('SOFTWARELOAD_NOT_PAUSED', 'Opgaven holder ikke pause')
      return withPause(current, pause)
    }))
  }

  /** Pauses the running task when Stempelkort starts. Never fails: no task, a task already paused or a drive error leave it be. */
  async function pauseIfRunning(user) {
    try {
      let next = null
      await storeFor(user.team).mutateAsync(runningKey(user.email), current => {
        if (!current || isPaused(current)) return undefined
        next = withPause(current, true)
        return next
      })
      return view(next)
    } catch {
      return null
    }
  }

  async function cancel(user) {
    if (!await readRunning(user, { skipCache: true })) throw notRunning()
    await storeFor(user.team).deleteAsync(runningKey(user.email))
    return { ok: true }
  }

  async function versions(user) {
    const list = await storeFor(user.team).getAsync(VERSIONS_KEY)
    return Array.isArray(list) ? list : []
  }

  return {
    status, start, scan, unscan, markFailed, unmarkFailed,
    pause: user => changePause(user, true), resume: user => changePause(user, false), pauseIfRunning,
    cancel, versions, isManager,
  }
}

module.exports = { createSoftwareloadService }
