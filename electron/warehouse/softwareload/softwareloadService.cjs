// Softwareload: a worker's own timed task of loading software on terminals. They choose the type, KIF or not, the target
// storage location and the version, then scan the serial numbers and mark the broken ones as failed. Like Stempelkort,
// each person writes only their own running task, so colleagues never wait for each other's locks. Finishing stops the
// time and moves the terminals in SAP; until every move is saved the task waits as `venter-<id>` and can be continued
// by its owner or a manager, or given up by a manager. No Electron imports: register.cjs wires it to IPC, tests drive it.
const crypto = require('node:crypto')
const { normalizeSerial } = require('../core/countState.cjs')
const { KIF, USED_FAILED_SLOC, normalizeSloc, planMoves } = require('./core/planMoves.cjs')
const { bisect } = require('./core/bisect.cjs')
const { TRANSFER_CHUNK, BLOCK_CHUNK } = require('./softwareloadSap.cjs')

const TYPES = ['sw+key', 'sw', 'key']
const VERSION_MAX = 60
const VERSIONS_KEPT = 50
const NOTE_MAX = 200
const VERSIONS_KEY = 'versioner'
const PENDING_PREFIX = 'venter-'
const TASK_ID_PATTERN = /^[\w-]{1,100}$/
const BLOCK_BWART = '344'
/** Outcomes that need nothing from SAP: the terminal stays where it is. */
const NOTHING_TO_MOVE = ['not-found', 'blocked-stock', 'already-blocked', 'skipped', 'manual']

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
const notPending = () => codeError('SOFTWARELOAD_NOT_PENDING', 'Opgaven venter ikke på SAP')
const upper = value => String(value ?? '').trim().toUpperCase()
const pad = number => String(number).padStart(2, '0')
/** The local month of a moment (the PCs run Danish time). */
const monthOf = ms => { const date = new Date(ms); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}` }
const pendingKey = id => `${PENDING_PREFIX}${id}`
const finishedKey = task => `opgaver-${writerOf(task.email)}-${monthOf(task.startedAt)}`
const indexKey = task => `serier-${monthOf(task.endedAt)}`
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size))
const lastTo = steps => steps.filter(step => step.to).at(-1)?.to ?? null
const countOutcomes = results => Object.values(results).reduce((counts, { outcome }) => ({ ...counts, [outcome]: (counts[outcome] || 0) + 1 }), {})
const terminalsOf = task => Object.entries(task.terminals || {}).map(([serial, terminal]) => ({ serial, failed: Boolean(terminal.failed) }))
/** planMoves compares sloc and material in capitals; the lookup gives them so already, this only makes sure. */
const sapRowsOf = rows => rows.map(row => ({ ...row, material: upper(row.material), sloc: upper(row.sloc) }))

/** Whether a terminal already stands where its planned outcome wants it, judged from the steps saved in this task. */
function reached(task, result) {
  if (!result) return false
  if (NOTHING_TO_MOVE.includes(result.outcome)) return true
  const steps = result.steps || []
  if (result.outcome === 'to-target') return lastTo(steps) === task.target
  if (result.outcome === 'to-d002') return lastTo(steps) === USED_FAILED_SLOC
  if (result.outcome === 'to-blocked') return steps.some(step => step.bwart === BLOCK_BWART)
  return false
}

/** One search line per serial; `to` is where the last Transfer put it. */
function indexLines(task) {
  return Object.entries(task.results).map(([serial, result]) => {
    const note = task.terminals?.[serial]?.failed?.note
    return {
      serial, team: task.team, kind: 'load', taskId: task.id, email: task.email, name: task.name, at: task.endedAt,
      type: task.type, version: task.version, kif: task.kif, from: result.from ?? null, to: lastTo(result.steps),
      docs: result.steps.map(step => step.doc), outcome: result.outcome, ...(note ? { note } : {}),
    }
  })
}

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

  function requireWrite() {
    if (!sap?.writeEnabled) throw codeError('SOFTWARELOAD_WRITE_DISABLED', 'Softwareload må ikke flytte terminaler i det SAP-system, du er logget ind i')
  }

  async function readPending(user, taskId) {
    const id = String(taskId ?? '')
    const task = TASK_ID_PATTERN.test(id) ? await storeFor(user.team).getAsync(pendingKey(id), { skipCache: true }) : null
    if (!task) throw notPending()
    return task
  }

  /** Changes a task waiting for SAP under its lock; `change` returns the new task. */
  function changePending(user, taskId, change) {
    return storeFor(user.team).mutateAsync(pendingKey(taskId), current => {
      if (!current) throw notPending()
      return change(current)
    })
  }

  /** The plan for the running task, without moving anything. */
  async function preview(user) {
    const task = await readRunning(user, { skipCache: true })
    if (!task) throw notRunning()
    const serials = Object.keys(task.terminals)
    const rows = serials.length ? sapRowsOf(await sap.lookup({ team: task.team, serials })) : []
    const { outcomes, transfers, blocks } = planMoves({ kif: task.kif, target: task.target, terminals: terminalsOf(task), sapRows: rows, passedD005: new Set() })
    return { outcomes, transfers, blocks, rows }
  }

  /**
   * Writes a pending task as finished: the month file of its owner first, then the search index, and the pending file
   * last. Until then the task stays pending, and both writes replace rather than add, so running it again is harmless.
   */
  async function complete(user, taskId, change) {
    const current = await readPending(user, taskId)
    const task = { ...change(current), state: 'faerdig' }
    await storeFor(user.team).mutateAsync(finishedKey(task), month => ({ ...month, tasks: { ...month?.tasks, [task.id]: task } }))
    await indexStore.mutateAsync(indexKey(task), index => ({
      ...index,
      lines: [...(index?.lines || []).filter(line => !(line.kind === 'load' && line.taskId === task.id)), ...indexLines(task)],
    }))
    await storeFor(user.team).deleteAsync(pendingKey(taskId))
    return { taskId: task.id, results: task.results, counts: countOutcomes(task.results), state: task.state }
  }

  /**
   * Moves a pending task's terminals in SAP. Every SAP document is saved on its serials before the next call, so a
   * crash or a closed SAP leaves the task pending and a later run starts from what SAP and the saved steps say.
   */
  async function execute(user, taskId, onProgress) {
    const report = (step, done, total) => { try { onProgress?.({ done, total, step }) } catch { /* the screen is gone */ } }
    const by = lower(user.email)
    const task = await readPending(user, taskId)
    const serials = Object.keys(task.terminals || {})
    const passedD005 = new Set(serials.filter(serial => (task.results?.[serial]?.steps || []).some(step => step.to === KIF)))

    report('lookup', 0, serials.length)
    const rows = serials.length ? sapRowsOf(await sap.lookup({ team: task.team, serials })) : []
    report('lookup', serials.length, serials.length)
    const plan = planMoves({ kif: task.kif, target: task.target, terminals: terminalsOf(task), sapRows: rows, passedD005 })

    const rowOf = new Map(rows.map(row => [row.serial, row]))
    await changePending(user, taskId, current => {
      const results = {}
      for (const serial of serials) {
        const before = current.results?.[serial]
        const steps = before?.steps || []
        let outcome = plan.outcomes[serial]
        // A terminal this task already moved needs nothing more; it keeps the outcome it was moved for.
        if (steps.length && before.outcome && ['skipped', 'already-blocked'].includes(outcome)) outcome = before.outcome
        const row = rowOf.get(serial)
        results[serial] = { material: before?.material ?? row?.material ?? null, from: before?.from ?? row?.sloc ?? null, outcome, steps }
      }
      return { ...current, results }
    })

    const failures = new Map()
    const addSteps = (items, step) => changePending(user, taskId, current => {
      const results = { ...current.results }
      for (const serial of items) results[serial] = { ...results[serial], steps: [...(results[serial]?.steps || []), step] }
      return { ...current, results }
    })
    const keepFailures = async failed => {
      if (!failed.length) return
      for (const { item, message } of failed) failures.set(item, message)
      await changePending(user, taskId, current => {
        const results = { ...current.results }
        for (const { item, message } of failed) results[item] = { ...results[item], message }
        return { ...current, results }
      })
    }

    /** Runs one step for groups of serials; a serial that failed earlier (also in wave 1) is left out. */
    async function run(step, groups, size, attempt, stepOf) {
      const total = groups.reduce((sum, group) => sum + group.serials.length, 0)
      if (!total) return
      let done = 0
      report(step, done, total)
      for (const group of groups) {
        const waiting = group.serials.filter(serial => !failures.has(serial))
        done += group.serials.length - waiting.length
        for (const part of chunks(waiting, size)) {
          const { failed } = await bisect(part, items => attempt(group, items), async ({ items, doc }) => {
            await addSteps(items, { ...stepOf(group), doc, by, at: now() })
            done += items.length
            report(step, done, total)
          })
          await keepFailures(failed)
          done += failed.length
        }
        report(step, done, total)
      }
    }

    await run('transfer', plan.transfers, TRANSFER_CHUNK,
      (move, items) => sap.transfer({ team: task.team, serials: items, to: move.to }),
      move => ({ from: move.from, to: move.to }))
    await run('block', plan.blocks, BLOCK_CHUNK,
      (block, items) => sap.block({ material: block.material, serials: items, bwart: BLOCK_BWART }),
      () => ({ bwart: BLOCK_BWART }))

    return complete(user, taskId, current => {
      const results = {}
      for (const serial of serials) {
        const { message, ...result } = current.results[serial]
        results[serial] = failures.has(serial) ? { ...result, outcome: 'failed-sap', message: failures.get(serial) } : result
      }
      return { ...current, results }
    })
  }

  /** Stops the time and hands the running task over to SAP; it waits as `venter-<id>` until every move is done. */
  async function finish(user, { onProgress } = {}) {
    requireWrite()
    const store = storeFor(user.team)
    let ended = null
    await store.mutateAsync(runningKey(user.email), current => {
      if (!current) throw notRunning()
      const endedAt = now()
      const pauses = current.pauses.map(pause => (pause.to == null ? { ...pause, to: endedAt } : pause))
      const paused = pausedMs(pauses, endedAt)
      ended = { ...current, pauses, endedAt, pausedMs: paused, workedMs: endedAt - current.startedAt - paused, state: 'mangler-sap' }
      return undefined
    })
    // After a crash between these two writes both files exist; the pending one wins, so saved steps are never lost.
    const pending = await store.mutateAsync(pendingKey(ended.id), current => current ?? ended)
    await store.deleteAsync(runningKey(user.email))
    return execute(user, pending.id, onProgress)
  }

  async function continueFinish(user, { taskId, onProgress } = {}) {
    requireWrite()
    const task = await readPending(user, taskId)
    if (task.email !== lower(user.email) && !isManager(user)) throw codeError('MANAGER_ONLY', 'Kun ejeren eller en manager kan fortsætte opgaven i SAP')
    return execute(user, task.id, onProgress)
  }

  /** A manager gives up the remaining moves; terminals that still had a move to make are marked `abandoned`. */
  async function abandon(user, { taskId, reason } = {}) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun en manager kan opgive flytningerne')
    const why = clean(reason, NOTE_MAX)
    if (!why) throw codeError('SOFTWARELOAD_INVALID', 'Skriv hvorfor flytningerne opgives')
    return complete(user, taskId, current => {
      const results = {}
      for (const serial of Object.keys(current.terminals || {})) {
        const result = current.results?.[serial]
        results[serial] = reached(current, result)
          ? result
          : { material: null, from: null, ...result, outcome: 'abandoned', steps: result?.steps || [] }
      }
      return { ...current, results, abandoned: { by: lower(user.email), reason: why, at: now() } }
    })
  }

  return {
    status, start, scan, unscan, markFailed, unmarkFailed,
    pause: user => changePause(user, true), resume: user => changePause(user, false), pauseIfRunning,
    cancel, versions, preview, finish, continueFinish, abandon, isManager,
  }
}

module.exports = { createSoftwareloadService }
