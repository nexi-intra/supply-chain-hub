// Softwareload: a worker's own timed task of loading software on terminals. They choose the type, KIF or not, the target
// storage location and the version, then scan the serial numbers and mark the broken ones as failed. Like Stempelkort,
// each person writes only their own running task, so colleagues never wait for each other's locks. Finishing stops the
// time and moves the terminals in SAP; until every move is saved the task waits as `venter-<id>` and can be continued
// by its owner or a manager, or given up by a manager. "Flyt ind i KIF" moves terminals to D005 ahead of time without
// a task. Every move lands in a search index shared by TRR and TCD. No Electron imports: register.cjs wires it to IPC,
// tests drive it.
const crypto = require('node:crypto')
const { normalizeSerial } = require('../core/countState.cjs')
const { normalizeMatdoc } = require('../core/sapParsers.cjs')
const { monthsBetween } = require('../core/period.cjs')
const { KIF, BLOCKED_SLOC, USED_FAILED_SLOC, normalizeSloc, planMoves } = require('./core/planMoves.cjs')
const { bisect } = require('./core/bisect.cjs')
const { isSoftwareloadTarget } = require('./core/targets.cjs')
const { TRANSFER_CHUNK, BLOCK_CHUNK } = require('./softwareloadSap.cjs')

const TYPES = ['sw+key', 'sw', 'key']
const VERSION_MAX = 60
const VERSIONS_KEPT = 50
const NOTE_MAX = 200
const VERSIONS_KEY = 'versioner'
const PENDING_PREFIX = 'venter-'
const FINISHED_PREFIX = 'opgaver-'
const INDEX_PREFIX = 'serier-'
const TASK_ID_PATTERN = /^[\w-]{1,100}$/
const BLOCK_BWART = '344'
/** How long a claim on a pending task keeps others out; a run renews it on a timer and before every SAP call. */
const CLAIM_MS = 2 * 60 * 1000
const RENEW_CLAIM_MS = 30 * 1000
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
/** The local day of a moment, `YYYY-MM-DD`. */
const dayOf = ms => `${monthOf(ms)}-${pad(new Date(ms).getDate())}`
const pendingKey = id => `${PENDING_PREFIX}${id}`
const finishedKey = task => `${FINISHED_PREFIX}${writerOf(task.email)}-${monthOf(task.startedAt)}`
const indexKey = at => `${INDEX_PREFIX}${monthOf(at)}`
const kifKey = at => `kif-${monthOf(at)}`
const serialsOf = list => [...new Set((Array.isArray(list) ? list : []).map(normalizeSerial).filter(Boolean))]
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

/** Where a terminal ended up and with which SAP documents; the part every search line has. */
function movedOf(result) {
  const steps = result.steps || []
  return {
    from: result.from ?? null, to: lastTo(steps), docs: steps.map(step => step.doc).filter(Boolean), outcome: result.outcome,
    ...(steps.some(step => step.unverified) ? { unverified: true } : {}),
  }
}

/**
 * A run marks serials as `uncertain` before it asks SAP, and the mark goes when SAP's answer is saved. A mark left
 * behind means SAP may have posted without the app reading the answer, so the next run asks SAP where the serial is:
 * on the mark's `to` (or blocked on D000 after MIGO) it made the step, which is recorded without a document; anywhere
 * else it did not.
 */
function settledStep(mark, row) {
  if (!mark || !row) return null
  const made = mark.bwart ? row.blocked && row.sloc === BLOCKED_SLOC : row.sloc === mark.to
  if (!made) return null
  const { by, at, ...step } = mark
  return { ...step, doc: null, unverified: true, by, at }
}

/** The saved steps of a result plus the one its mark proves; the mark itself is left out. */
function stepsWithMark(result, row) {
  const settled = settledStep(result?.uncertain, row)
  return [...(result?.steps || []), ...(settled ? [settled] : [])]
}

const withoutMark = ({ uncertain, ...result } = {}) => result

/** One search line per serial; `to` is where the last Transfer put it. */
function indexLines(task) {
  return Object.entries(task.results).map(([serial, result]) => {
    const note = task.terminals?.[serial]?.failed?.note
    return {
      serial, team: task.team, kind: 'load', taskId: task.id, email: task.email, name: task.name, at: task.endedAt,
      type: task.type, version: task.version, kif: task.kif, ...movedOf(result), ...(note ? { note } : {}),
    }
  })
}

/** One search line per serial of a move into KIF; it belongs to no task. */
function kifLines(move) {
  return Object.entries(move.results).map(([serial, result]) => ({
    serial, team: move.team, kind: 'kif', email: move.email, name: move.name, at: move.at, ...movedOf(result),
  }))
}

/**
 * Runs one SAP step for groups of serials, at most `size` per call, each call split by bisect until a refused serial
 * stands alone. A serial already in `failures` is left out, and a refused one is added with SAP's message. `saved`
 * is awaited for every document before the next call, so a crash never loses one that was saved.
 */
async function runChunks({ groups, size, failures, attempt, saved, refused = async () => {}, report = () => {} }) {
  const total = groups.reduce((sum, group) => sum + group.serials.length, 0)
  if (!total) return
  let done = 0
  report(done, total)
  for (const group of groups) {
    const waiting = group.serials.filter(serial => !failures.has(serial))
    done += group.serials.length - waiting.length
    for (const part of chunks(waiting, size)) {
      const { failed } = await bisect(part, items => attempt(group, items), async ({ items, doc }) => {
        await saved(group, items, doc)
        done += items.length
        report(done, total)
      })
      for (const { item, message } of failed) failures.set(item, message)
      await refused(failed)
      done += failed.length
    }
    report(done, total)
  }
}

function createSoftwareloadService({ storeFor, indexStore, sap, timeclock, now = Date.now, newId = () => crypto.randomUUID(), matdocs, renewClaimMs = RENEW_CLAIM_MS }) {
  /** A Hub manager or creator; a status manager from Optælling is a manager there only. */
  const isManager = user => (user.role === 'manager' || user.role === 'creator') && !user.statusManager
  const me = user => ({ email: lower(user.email), name: user.fullName || user.email })

  function choice(input) {
    const type = TYPES.includes(input?.type) ? input.type : null
    if (!type) throw codeError('SOFTWARELOAD_INVALID', 'Vælg om der lægges software, nøgle eller begge dele på')
    const target = normalizeSloc(input?.target)
    if (!isSoftwareloadTarget(target)) throw codeError('SOFTWARELOAD_INVALID', 'Vælg en lokation fra listen')
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
    const fresh = claim => claim && now() - claim.at < CLAIM_MS
    return tasks
      .filter(task => task && (isManager(user) || task.email === email))
      .map(task => ({
        id: task.id, name: task.name, email: task.email, endedAt: task.endedAt, count: Object.keys(task.terminals || {}).length,
        ...(fresh(task.claim) ? { movingBy: { name: task.claim.name } } : {}),
      }))
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

  const claimOf = (user, runId) => ({ by: lower(user.email), name: user.fullName || user.email, runId, at: now() })
  const busy = claim => codeError('SOFTWARELOAD_BUSY', `${claim.name} er ved at flytte opgaven i SAP`)
  // Runs in this process; a run on another PC (also of the same person) is kept out by the claim and its runId.
  const finishing = new Set()
  const inFlight = new Set()
  const alreadyMoving = () => codeError('SOFTWARELOAD_BUSY', 'Opgaven er allerede ved at blive flyttet i SAP')
  const newRunId = () => crypto.randomUUID()

  /** Refuses while another run holds a fresh claim; that includes a run of the same person on another PC. */
  function requireFreeClaim(task, runId) {
    const { claim } = task
    if (claim && claim.runId !== runId && now() - claim.at < CLAIM_MS) throw busy(claim)
  }

  /** Takes the claim for a run under the pending task's lock. */
  function takeClaim(user, taskId, runId) {
    return changePending(user, taskId, current => {
      requireFreeClaim(current, runId)
      return { ...current, claim: claimOf(user, runId) }
    })
  }

  /** Clears the run's own claim after a failed run, so someone else can continue at once. Best effort: it expires anyway. */
  async function releaseClaim(user, taskId, runId) {
    try {
      await storeFor(user.team).mutateAsync(pendingKey(taskId), current => {
        if (!current?.claim || current.claim.runId !== runId) return undefined
        const { claim, ...task } = current
        return task
      })
    } catch { /* the claim runs out after CLAIM_MS */ }
  }

  /** Keeps the run's claim fresh while SAP works on a long call; a claim that another run took is left alone. */
  function renewWhileRunning(user, taskId, runId) {
    let renewing = false
    const timer = setInterval(() => {
      // A slow drive must not pile up renewals in front of the run's own writes.
      if (renewing) return
      renewing = true
      storeFor(user.team).mutateAsync(pendingKey(taskId), current => {
        if (!current?.claim || current.claim.runId !== runId) return undefined
        return { ...current, claim: { ...current.claim, at: now() } }
      }).catch(() => { /* the next SAP call checks the claim again */ }).finally(() => { renewing = false })
    }, renewClaimMs)
    timer.unref?.()
    return () => clearInterval(timer)
  }

  /** Adds lines to the search index of the month of `at`; `replaces` drops the lines of an earlier run of the same event. */
  function addToIndex(at, lines, replaces = () => false) {
    return indexStore.mutateAsync(indexKey(at), index => ({ ...index, lines: [...(index?.lines || []).filter(line => !replaces(line)), ...lines] }))
  }

  /**
   * Writes a pending task as finished: the month file of its owner first, then the search index, and the pending file
   * last. Until then the task stays pending, and both writes replace rather than add, so running it again is harmless.
   */
  async function complete(user, taskId, change) {
    const current = await readPending(user, taskId)
    const { claim, ...task } = { ...change(current), state: 'faerdig' }
    await storeFor(user.team).mutateAsync(finishedKey(task), month => ({ ...month, tasks: { ...month?.tasks, [task.id]: task } }))
    await addToIndex(task.endedAt, indexLines(task), line => line.kind === 'load' && line.taskId === task.id)
    await storeFor(user.team).deleteAsync(pendingKey(taskId))
    return { taskId: task.id, results: task.results, counts: countOutcomes(task.results), state: task.state }
  }

  /**
   * Moves a pending task's terminals in SAP. Every SAP document is saved on its serials before the next call, so a
   * crash or a closed SAP leaves the task pending and a later run starts from what SAP and the saved steps say.
   * The caller holds the claim for `runId`; the run keeps it fresh and gives it back when it fails.
   */
  async function execute(user, taskId, runId, onProgress) {
    const stopRenewing = renewWhileRunning(user, taskId, runId)
    try {
      return await moveInSap(user, taskId, runId, onProgress)
    } catch (error) {
      await releaseClaim(user, taskId, runId)
      throw error
    } finally {
      stopRenewing()
    }
  }

  async function moveInSap(user, taskId, runId, onProgress) {
    const report = (step, done, total) => { try { onProgress?.({ done, total, step }) } catch { /* the screen is gone */ } }
    const by = lower(user.email)
    const task = await readPending(user, taskId)
    const serials = Object.keys(task.terminals || {})

    report('lookup', 0, serials.length)
    const rows = serials.length ? sapRowsOf(await sap.lookup({ team: task.team, serials })) : []
    report('lookup', serials.length, serials.length)
    const rowOf = new Map(rows.map(row => [row.serial, row]))
    // A mark that put the serial on D005 counts as passing it, like a saved step.
    const passedD005 = new Set(serials.filter(serial => stepsWithMark(task.results?.[serial], rowOf.get(serial)).some(step => step.to === KIF)))
    const plan = planMoves({ kif: task.kif, target: task.target, terminals: terminalsOf(task), sapRows: rows, passedD005 })

    // Another run took over a stale claim while SAP answered; it moves the task now, so this run stops before SAP.
    const takenBy = current => (current.claim && current.claim.runId !== runId ? current.claim : null)
    await changePending(user, taskId, current => {
      if (takenBy(current)) throw busy(current.claim)
      const results = {}
      for (const serial of serials) {
        const before = current.results?.[serial]
        const row = rowOf.get(serial)
        const steps = stepsWithMark(before, row)
        let outcome = plan.outcomes[serial]
        // A terminal this task already moved needs nothing more; it keeps the outcome it was moved for.
        if (steps.length && before.outcome && ['skipped', 'already-blocked'].includes(outcome)) outcome = before.outcome
        results[serial] = { material: before?.material ?? row?.material ?? null, from: before?.from ?? row?.sloc ?? null, outcome, steps }
      }
      return { ...current, results }
    })

    const failures = new Map()
    const addSteps = async (items, step) => {
      let taken = null
      await changePending(user, taskId, current => {
        const results = { ...current.results }
        for (const serial of items) {
          const result = withoutMark(results[serial])
          results[serial] = { ...result, steps: [...(result.steps || []), step] }
        }
        taken = takenBy(current)
        return { ...current, results, claim: taken || claimOf(user, runId) }
      })
      // The document is saved either way; then the run stops, so two people never move the same task at once.
      if (taken) throw busy(taken)
    }
    const keepFailures = async failed => {
      if (!failed.length) return
      await changePending(user, taskId, current => {
        const results = { ...current.results }
        for (const { item, message } of failed) results[item] = { ...withoutMark(results[item]), message }
        return { ...current, results }
      })
    }

    /** Renews the claim and marks the serials SAP is about to get, so a lost answer is found again on the next run. */
    const beforeSap = (items, mark) => changePending(user, taskId, current => {
      if (takenBy(current)) throw busy(current.claim)
      const results = { ...current.results }
      for (const serial of items) results[serial] = { ...results[serial], uncertain: mark }
      return { ...current, results, claim: claimOf(user, runId) }
    })

    /** Runs one step for groups of serials; a serial that failed earlier (also in wave 1) is left out. */
    const run = (step, groups, size, attempt, stepOf) => runChunks({
      groups, size, failures,
      // Every SAP call renews the claim first, so a long run of refusals keeps it, and a run that lost it stops.
      attempt: async (group, items) => { await beforeSap(items, { ...stepOf(group), by, at: now() }); return attempt(group, items) },
      saved: (group, items, doc) => addSteps(items, { ...stepOf(group), doc, by, at: now() }),
      refused: keepFailures,
      report: (done, total) => report(step, done, total),
    })

    await run('transfer', plan.transfers, TRANSFER_CHUNK,
      (move, items) => sap.transfer({ team: task.team, serials: items, to: move.to }),
      move => ({ from: move.from, to: move.to }))
    await run('block', plan.blocks, BLOCK_CHUNK,
      (block, items) => sap.block({ material: block.material, serials: items, bwart: BLOCK_BWART }),
      () => ({ bwart: BLOCK_BWART }))

    return complete(user, taskId, current => {
      if (takenBy(current)) throw busy(current.claim)
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
    const email = lower(user.email)
    if (finishing.has(email)) throw codeError('SOFTWARELOAD_BUSY', 'Opgaven er allerede ved at blive afsluttet')
    finishing.add(email)
    let taskId = null
    try {
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
      if (inFlight.has(ended.id)) throw alreadyMoving()
      inFlight.add(taskId = ended.id)
      const runId = newRunId()
      // After a crash between these two writes both files exist; the pending one wins, so saved steps are never lost.
      await store.mutateAsync(pendingKey(ended.id), current => {
        const task = current ?? ended
        requireFreeClaim(task, runId)
        return { ...task, claim: claimOf(user, runId) }
      })
      await store.deleteAsync(runningKey(user.email))
      return await execute(user, ended.id, runId, onProgress)
    } finally {
      finishing.delete(email)
      if (taskId) inFlight.delete(taskId)
    }
  }

  async function continueFinish(user, { taskId, onProgress } = {}) {
    requireWrite()
    const task = await readPending(user, taskId)
    if (task.email !== lower(user.email) && !isManager(user)) throw codeError('MANAGER_ONLY', 'Kun ejeren eller en manager kan fortsætte opgaven i SAP')
    if (inFlight.has(task.id)) throw alreadyMoving()
    inFlight.add(task.id)
    try {
      const runId = newRunId()
      await takeClaim(user, task.id, runId)
      return await execute(user, task.id, runId, onProgress)
    } finally {
      inFlight.delete(task.id)
    }
  }

  /**
   * A manager gives up the remaining moves; terminals that still had a move to make are marked `abandoned`. It takes
   * the claim first, like a run, so nobody starts moving the task while it is written as finished.
   */
  async function abandon(user, { taskId, reason } = {}) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun en manager kan opgive flytningerne')
    const why = clean(reason, NOTE_MAX)
    if (!why) throw codeError('SOFTWARELOAD_INVALID', 'Skriv hvorfor flytningerne opgives')
    const task = await readPending(user, taskId)
    if (inFlight.has(task.id)) throw alreadyMoving()
    inFlight.add(task.id)
    const runId = newRunId()
    try {
      await takeClaim(user, task.id, runId)
      return await complete(user, task.id, current => {
        if (current.claim?.runId !== runId) throw busy(current.claim || claimOf(user, runId))
        const results = {}
        for (const serial of Object.keys(current.terminals || {})) {
          const result = current.results?.[serial]
          results[serial] = reached(current, result)
            ? result
            : { material: null, from: null, ...result, outcome: 'abandoned', steps: result?.steps || [] }
        }
        return { ...current, results, abandoned: { by: lower(user.email), reason: why, at: now() } }
      })
    } catch (error) {
      await releaseClaim(user, task.id, runId)
      throw error
    } finally {
      inFlight.delete(task.id)
    }
  }

  const noSerials = () => codeError('SOFTWARELOAD_INVALID', 'Scan eller indsæt mindst ét serienummer')
  // A double click on "Flyt til D005" in this process; a second PC would find the moved ones on D005 and skip them.
  const movingToKif = new Set()

  /** The serials to move into KIF: those of the material document when one is given, else the scanned or pasted ones. */
  async function kifSerials(user, { serials, document } = {}) {
    if (!String(document ?? '').trim()) {
      const typed = serialsOf(serials)
      if (!typed.length) throw noSerials()
      return typed
    }
    const fetched = await matdocs({ team: user.team, document })
    const found = serialsOf(fetched.rows.map(row => row.serial))
    if (!found.length) throw codeError('SOFTWARELOAD_INVALID', 'Materialedokumentet har ingen serienumre')
    return found
  }

  /** Plans the moves to D005 from where SAP says the terminals stand now; nothing is failed and nothing goes via D005. */
  async function kifPlan(team, serials) {
    const rows = sapRowsOf(await sap.lookup({ team, serials }))
    const terminals = serials.map(serial => ({ serial, failed: false }))
    return { rows, ...planMoves({ kif: false, target: KIF, terminals, sapRows: rows, passedD005: new Set() }) }
  }

  async function kifPreview(user, input = {}) {
    const serials = await kifSerials(user, input)
    const { outcomes, transfers } = await kifPlan(user.team, serials)
    return { serials, outcomes, transfers }
  }

  /** Moves the serials the user confirmed to D005. SAP is asked again, as stock may have moved since the preview. */
  async function kifMove(user, { serials, document } = {}, { onProgress } = {}) {
    requireWrite()
    const confirmed = serialsOf(serials)
    if (!confirmed.length) throw noSerials()
    const given = String(document ?? '').trim()
    const matdoc = given ? normalizeMatdoc(given) : null
    if (given && !matdoc) throw codeError('SOFTWARELOAD_INVALID', 'Skriv materialedokumentet som fx "4900229137 2026 01"')
    const email = lower(user.email)
    if (movingToKif.has(email)) throw codeError('SOFTWARELOAD_BUSY', 'Du er allerede ved at flytte terminaler til D005')
    movingToKif.add(email)
    try {
      return await moveToKif(user, confirmed, matdoc, onProgress)
    } finally {
      movingToKif.delete(email)
    }
  }

  /**
   * Saves the record in `kif-<yyyy-mm>` after every SAP document and once more at the end, then adds the search lines.
   * When SAP throws midway, what was posted is still saved and indexed, the rest is `interrupted`, and the error goes on.
   */
  async function moveToKif(user, serials, document, onProgress) {
    const report = (step, done, total) => { try { onProgress?.({ done, total, step }) } catch { /* the screen is gone */ } }
    const at = now()
    const by = lower(user.email)
    report('lookup', 0, serials.length)
    const { rows, outcomes, transfers } = await kifPlan(user.team, serials)
    report('lookup', serials.length, serials.length)
    const rowOf = new Map(rows.map(row => [row.serial, row]))
    const results = Object.fromEntries(serials.map(serial => {
      const row = rowOf.get(serial)
      return [serial, { material: row?.material ?? null, from: row?.sloc ?? null, outcome: outcomes[serial], steps: [] }]
    }))
    const move = { id: newId(), team: user.team, ...me(user), at, ...(document ? { document } : {}), results }
    const save = () => storeFor(user.team).mutateAsync(kifKey(at), month => ({ ...month, moves: { ...month?.moves, [move.id]: move } }))

    const failures = new Map()
    const settle = async interrupted => {
      for (const [serial, message] of failures) results[serial] = { ...withoutMark(results[serial]), outcome: 'failed-sap', message }
      if (interrupted) {
        for (const serial of serials) if (results[serial].outcome === 'to-target' && !results[serial].steps.length) results[serial] = { ...results[serial], outcome: 'interrupted' }
      }
      await save()
      const lines = kifLines(move)
      await addToIndex(at, interrupted ? lines.filter(line => line.docs.length) : lines)
    }
    try {
      await runChunks({
        groups: transfers, size: TRANSFER_CHUNK, failures,
        // The record keeps an `uncertain` mark until SAP's answer is saved; a lost answer leaves it in the history.
        attempt: async (group, items) => {
          for (const serial of items) results[serial] = { ...results[serial], uncertain: { from: group.from, to: group.to, by, at: now() } }
          await save()
          const answer = await sap.transfer({ team: user.team, serials: items, to: group.to })
          // A refusal moved nothing, so the mark goes; the next save writes that down.
          if (!answer.ok) for (const serial of items) results[serial] = withoutMark(results[serial])
          return answer
        },
        saved: (group, items, doc) => {
          for (const serial of items) {
            const result = withoutMark(results[serial])
            results[serial] = { ...result, steps: [...result.steps, { from: group.from, to: group.to, doc, by, at: now() }] }
          }
          return save()
        },
        report: (done, total) => report('transfer', done, total),
      })
    } catch (error) {
      // SAP's error is the one to show; a failing drive here loses at most the lines, never the error.
      await settle(true).catch(() => {})
      throw error
    }
    await settle(false)
    return { id: move.id, results, counts: countOutcomes(results) }
  }

  /** Every event for a serial in either team, newest first. Anyone in TRR or TCD may search. */
  async function search(user, { serial } = {}) {
    const wanted = normalizeSerial(serial)
    if (!wanted) return []
    const keys = (await indexStore.keysAsync()).filter(key => key.startsWith(INDEX_PREFIX))
    const files = await Promise.all(keys.map(key => indexStore.getAsync(key).catch(() => null)))
    return files.flatMap(file => (file?.lines || []).filter(line => line.serial === wanted)).sort((a, b) => b.at - a.at)
  }

  /** Finished tasks started (local day) in the period: the person's own, or the whole team's for a manager. */
  async function tasks(user, { from, to } = {}) {
    const months = new Set(monthsBetween(from, to, 'SOFTWARELOAD_INVALID'))
    const prefix = isManager(user) ? FINISHED_PREFIX : `${FINISHED_PREFIX}${writerOf(user.email)}-`
    const store = storeFor(user.team)
    const keys = (await store.keysAsync()).filter(key => key.startsWith(prefix) && months.has(key.slice(-7)))
    const files = await Promise.all(keys.map(key => store.getAsync(key).catch(() => null)))
    const inPeriod = task => dayOf(task.startedAt) >= from && dayOf(task.startedAt) <= to
    return files.flatMap(file => Object.values(file?.tasks || {}))
      .filter(task => task.state === 'faerdig' && inPeriod(task))
      .sort((a, b) => b.startedAt - a.startedAt)
  }

  return {
    status, start, scan, unscan, markFailed, unmarkFailed,
    pause: user => changePause(user, true), resume: user => changePause(user, false), pauseIfRunning,
    cancel, versions, preview, finish, continueFinish, abandon, kifPreview, kifMove, search, tasks, isManager,
  }
}

module.exports = { createSoftwareloadService, CLAIM_MS }
