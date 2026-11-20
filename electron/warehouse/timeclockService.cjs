// Stempelkort: a person's own start, pause and stop on a task, with the times hidden from colleagues. Only Hub managers
// read registrations. Each person writes only their own files (the running clock and one file per month), so colleagues
// never wait for each other's locks. No Electron imports: register.cjs wires it to IPC, tests drive it directly.
const crypto = require('node:crypto')
const { monthsBetween } = require('./core/period.cjs')

const LONG_RUN_MS = 10 * 60 * 60 * 1000
const TASK_ID_MAX = 64
const TASK_NAME_MAX = 80
const COLOR = /^#[0-9a-f]{6}$/i

function codeError(code, message) {
  return Object.assign(new Error(message || code), { code })
}

const lower = value => String(value || '').trim().toLowerCase()
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const pad = number => String(number).padStart(2, '0')
/** The local day of a moment (the PCs run Danish time). */
const dayOf = ms => { const date = new Date(ms); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }
const writerOf = email => crypto.createHash('sha256').update(lower(email)).digest('hex').slice(0, 16)
const runningKey = email => `aktiv-${writerOf(email)}`
const monthKey = (email, day) => `tider-${writerOf(email)}-${day.slice(0, 7)}`
const pausedMs = (pauses, end) => pauses.reduce((sum, pause) => sum + Math.max(0, Math.min(pause.to ?? end, end) - pause.from), 0)

function createTimeclockService({ storeFor, now = Date.now }) {
  /** A Hub manager or creator; a status manager from Optælling is a manager there only. */
  const isManager = user => (user.role === 'manager' || user.role === 'creator') && !user.statusManager
  const me = user => ({ email: lower(user.email), name: user.fullName || user.email })

  function requireManager(user) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managere kan se registrerede tider')
  }

  function task(input) {
    const taskId = clean(input?.taskId, TASK_ID_MAX)
    const taskName = clean(input?.taskName, TASK_NAME_MAX)
    if (!taskId || !taskName) throw codeError('TIMECLOCK_INVALID', 'Vælg en opgave')
    return { taskId, taskName, taskColor: COLOR.test(String(input?.taskColor || '')) ? input.taskColor : '#64748b' }
  }

  /** What the screen shows of a running clock; the times come from this PC's clock, so the screen can count on. */
  function view(running) {
    if (!running) return null
    const at = now()
    const open = running.pauses.at(-1)
    const paused = Boolean(open && open.to == null)
    return { taskId: running.taskId, taskName: running.taskName, taskColor: running.taskColor, startedAt: running.startedAt, paused, pausedMs: pausedMs(running.pauses, at), workedMs: at - running.startedAt - pausedMs(running.pauses, at), now: at }
  }

  const readRunning = (user, options) => storeFor(user.team).getAsync(runningKey(user.email), options)

  async function status(user) {
    return { running: view(await readRunning(user)), isManager: isManager(user) }
  }

  /** The running clock as a saved registration ending at `end`. The id comes from the person and the start, so a stop on two PCs at once saves it once. */
  function entryOf(running, end, corrected) {
    const pauses = running.pauses.map(pause => ({ from: pause.from, to: Math.min(pause.to ?? end, end) })).filter(pause => pause.to > pause.from)
    const paused = pausedMs(pauses, end)
    return {
      id: `${writerOf(running.email).slice(0, 8)}-${running.startedAt.toString(36)}`, email: running.email, name: running.name,
      taskId: running.taskId, taskName: running.taskName, taskColor: running.taskColor,
      date: dayOf(running.startedAt), startedAt: running.startedAt, endedAt: end, pauses,
      pausedMs: paused, workedMs: end - running.startedAt - paused, savedAt: now(), ...(corrected ? { endCorrected: true } : {}),
    }
  }

  async function saveEntry(user, entry) {
    await storeFor(user.team).mutateAsync(monthKey(entry.email, entry.date), current => {
      const value = current && typeof current === 'object' ? current : { email: entry.email, entries: {} }
      value.name = entry.name
      value.entries = { ...(value.entries || {}), [entry.id]: entry }
      return value
    })
  }

  /** The running clock read past the cache (it may have been started or stopped on another PC), or an error when there is none. */
  async function requireRunning(user) {
    const running = await readRunning(user, { skipCache: true })
    if (!running) throw codeError('TIMECLOCK_NOT_RUNNING', 'Der kører ikke noget ur')
    return running
  }

  async function finish(user, running, { endAt } = {}) {
    const at = now()
    const lastEvent = Math.max(running.startedAt, ...running.pauses.flatMap(pause => [pause.from, pause.to ?? pause.from]))
    let end = at
    if (endAt !== undefined && endAt !== null) {
      const wanted = Number(endAt)
      if (!Number.isFinite(wanted) || wanted < lastEvent || wanted > at) throw codeError('TIMECLOCK_INVALID', 'Sluttiden skal ligge mellem seneste start eller pause og nu')
      end = wanted
    } else if (at - running.startedAt > LONG_RUN_MS) {
      throw Object.assign(codeError('TIMECLOCK_LONG_RUN', 'Uret har kørt i over 10 timer – hvornår stoppede du?'), { startedAt: running.startedAt })
    }
    const entry = entryOf(running, end, end !== at)
    await saveEntry(user, entry)
    await storeFor(user.team).deleteAsync(runningKey(user.email))
    return entry
  }

  async function start(user, input = {}) {
    const chosen = task(input)
    const store = storeFor(user.team)
    let saved = null
    if (input.switchTask === true) {
      const running = await readRunning(user, { skipCache: true })
      if (running) saved = await finish(user, running, {})
    }
    let started = null
    await store.mutateAsync(runningKey(user.email), current => {
      if (current) throw codeError('TIMECLOCK_RUNNING', `Uret kører allerede på ${current.taskName}`)
      started = { ...me(user), ...chosen, startedAt: now(), pauses: [] }
      return started
    })
    return { ...view(started), ...(saved ? { saved: { taskName: saved.taskName, workedMs: saved.workedMs } } : {}) }
  }

  async function changePause(user, pause) {
    let next = null
    await storeFor(user.team).mutateAsync(runningKey(user.email), current => {
      if (!current) throw codeError('TIMECLOCK_NOT_RUNNING', 'Der kører ikke noget ur')
      const open = current.pauses.at(-1)
      const paused = Boolean(open && open.to == null)
      if (pause && paused) throw codeError('TIMECLOCK_PAUSED', 'Uret holder allerede pause')
      if (!pause && !paused) throw codeError('TIMECLOCK_NOT_PAUSED', 'Uret holder ikke pause')
      next = { ...current, pauses: pause ? [...current.pauses, { from: now(), to: null }] : current.pauses.map((item, index) => (index === current.pauses.length - 1 ? { ...item, to: now() } : item)) }
      return next
    })
    return view(next)
  }

  async function stop(user, { endAt } = {}) {
    const entry = await finish(user, await requireRunning(user), { endAt })
    return { taskName: entry.taskName, workedMs: entry.workedMs, pausedMs: entry.pausedMs }
  }

  async function cancel(user) {
    await requireRunning(user)
    await storeFor(user.team).deleteAsync(runningKey(user.email))
    return { ok: true }
  }

  // ---------- Managers ----------
  /** Every registration of the team in the period, and who is on the clock right now. */
  async function entries(user, { from, to } = {}) {
    requireManager(user)
    const months = new Set(monthsBetween(from, to, 'TIMECLOCK_INVALID'))
    const store = storeFor(user.team)
    const keys = await store.keysAsync()
    const monthKeys = keys.filter(key => key.startsWith('tider-') && months.has(key.slice(-7)))
    const runningKeys = keys.filter(key => key.startsWith('aktiv-'))
    const [files, clocks] = await Promise.all([
      Promise.all(monthKeys.map(key => store.getAsync(key).catch(() => null))),
      Promise.all(runningKeys.map(key => store.getAsync(key).catch(() => null))),
    ])
    const list = files.flatMap(file => Object.values(file?.entries || {})).filter(entry => entry.date >= from && entry.date <= to).sort((a, b) => b.startedAt - a.startedAt)
    const running = clocks.filter(Boolean).map(clock => ({ email: clock.email, name: clock.name, ...view(clock) })).sort((a, b) => a.name.localeCompare(b.name, 'da'))
    return { entries: list, running }
  }

  async function changeEntry(user, { email, id }, change) {
    requireManager(user)
    const owner = lower(email)
    const store = storeFor(user.team)
    const keys = (await store.keysAsync()).filter(key => key.startsWith(`tider-${writerOf(owner)}-`))
    for (const key of keys) {
      const file = await store.getAsync(key, { skipCache: true })
      if (!file?.entries?.[id]) continue
      let result = null
      await store.mutateAsync(key, current => {
        const entry = current?.entries?.[id]
        if (!entry) throw codeError('TIMECLOCK_NOT_FOUND', 'Registreringen findes ikke (længere)')
        result = change(entry)
        if (result) current.entries[id] = result
        else delete current.entries[id]
        return current
      })
      return result
    }
    throw codeError('TIMECLOCK_NOT_FOUND', 'Registreringen findes ikke (længere)')
  }

  /** A manager corrects the times or the task. The day the registration is filed under stays the same. */
  function updateEntry(user, input = {}) {
    return changeEntry(user, input, entry => {
      const startedAt = input.startedAt === undefined ? entry.startedAt : Number(input.startedAt)
      const endedAt = input.endedAt === undefined ? entry.endedAt : Number(input.endedAt)
      if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt || dayOf(startedAt) !== entry.date) throw codeError('TIMECLOCK_INVALID', 'Sluttiden skal ligge efter starttiden, og starten på samme dag')
      const chosen = input.taskId === undefined ? { taskId: entry.taskId, taskName: entry.taskName, taskColor: entry.taskColor } : task(input)
      const pauses = entry.pauses.map(pause => ({ from: Math.max(pause.from, startedAt), to: Math.min(pause.to, endedAt) })).filter(pause => pause.to > pause.from)
      const paused = pausedMs(pauses, endedAt)
      return { ...entry, ...chosen, startedAt, endedAt, pauses, pausedMs: paused, workedMs: endedAt - startedAt - paused, editedBy: me(user), editedAt: now() }
    })
  }

  async function deleteEntry(user, input = {}) {
    await changeEntry(user, input, () => null)
    return { ok: true }
  }

  return { status, start, pause: user => changePause(user, true), resume: user => changePause(user, false), stop, cancel, entries, updateEntry, deleteEntry, isManager }
}

module.exports = { createTimeclockService, LONG_RUN_MS }
