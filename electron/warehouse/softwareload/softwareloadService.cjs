// Softwareload: a worker's own timed task of loading software on terminals. They choose the type, KIF or not, the target
// storage location and the version, then scan the serial numbers and mark the broken ones as failed. Like Stempelkort,
// each person writes only their own running task, so colleagues never wait for each other's locks. Finishing stops the
// time and moves the terminals in SAP; until every move is saved the task waits as `venter-<id>` and can be continued
// by its owner or a manager, or given up by a manager. "Stop tiden nu, flyt i SAP senere" stops the time without SAP
// and leaves the task waiting the same way; continuing shows SAP's plan first and moves only the confirmed one.
// "Flyt ind i KIF" moves terminals to D005 ahead of time without
// a task. Every move lands in a search index shared by TRR and TCD. A manager can delete a finished task or a KIF move
// (e.g. test data) from the app's records; SAP is never touched. The statistics and the comments that explain a period
// are for managers only. No Electron imports: register.cjs wires it to IPC, tests drive it.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { normalizeSerial } = require('../core/countState.cjs')
const { normalizeMatdoc } = require('../core/sapParsers.cjs')
const { monthsBetween } = require('../core/period.cjs')
const { MATERIAL_PATTERN } = require('../core/snapshot.cjs')
const { KIF, BLOCKED_SLOC, USED_FAILED_SLOC, normalizeSloc, planMoves } = require('./core/planMoves.cjs')
const { bisect } = require('./core/bisect.cjs')
const { isSoftwareloadTarget } = require('./core/targets.cjs')
const { TRANSFER_CHUNK, BLOCK_CHUNK } = require('./softwareloadSap.cjs')
const { LONG_RUN_MS } = require('../timeclockService.cjs')

const TYPES = ['sw+key', 'sw', 'key']
const VERSION_MAX = 60
const VERSIONS_KEPT = 50
const NOTE_MAX = 200
const VERSIONS_KEY = 'versioner'
/** The team's comments on periods of the statistics: `{ comments, history, deleted }` by comment id. */
const COMMENTS_KEY = 'kommentarer'
const COMMENT_MAX = 1000
const PENDING_PREFIX = 'venter-'
const FINISHED_PREFIX = 'opgaver-'
const INDEX_PREFIX = 'serier-'
const KIF_PREFIX = 'kif-'
const RUNNING_PREFIX = 'aktiv-'
const DELETED_PREFIX = 'slettet-'
const TASK_ID_PATTERN = /^[\w-]{1,100}$/
const BLOCK_BWART = '344'
/** How long a claim on a pending task keeps others out; a run renews it on a timer and before every SAP call. */
const CLAIM_MS = 2 * 60 * 1000
const RENEW_CLAIM_MS = 30 * 1000
/** A write of a SAP document to M: is tried this often, with a growing pause, before it fails. */
const SAVE_TRIES = 5
const SAVE_PAUSE_MS = 200
/** Outcomes that need nothing from SAP: the terminal stays where it is. */
const NOTHING_TO_MOVE = ['not-found', 'blocked-stock', 'already-blocked', 'skipped', 'manual']

function codeError(code, message) {
  return Object.assign(new Error(message || code), { code })
}

const lower = value => String(value || '').trim().toLowerCase()
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const writerOf = email => crypto.createHash('sha256').update(lower(email)).digest('hex').slice(0, 16)
const runningKey = email => `${RUNNING_PREFIX}${writerOf(email)}`
const pausedMs = (pauses, end) => pauses.reduce((sum, pause) => sum + Math.max(0, Math.min(pause.to ?? end, end) - pause.from), 0)
const isPaused = task => { const open = task.pauses.at(-1); return Boolean(open && open.to == null) }
/** The latest start, pause or resume of a task; while it is paused, when the pause began. */
const lastEventOf = task => Math.max(task.startedAt, ...task.pauses.flatMap(pause => [pause.from, pause.to ?? pause.from]))
/** The last start or resume: the earliest end a chosen end may have, also when the task has been paused since. */
const earliestEndOf = task => Math.max(task.startedAt, ...task.pauses.filter(pause => pause.to != null).map(pause => pause.to))
/** The pauses of a task ended at `end`, as in Stempelkort: those from `end` on are dropped, and an open one stops at `end`. */
const pausesUntil = (pauses, end) => pauses.filter(pause => pause.from < end).map(pause => ({ ...pause, to: Math.min(pause.to ?? end, end) }))

/**
 * When the time of a running task stops, as in Stempelkort: now, or after more than LONG_RUN_MS the `endAt` the person
 * chose. A chosen end lies between the last start or resume and now; a pause begun later (e.g. by Stempelkort the next
 * morning) is dropped, so a forgotten task can still end on the day it was forgotten.
 */
function endOf(task, endAt, at) {
  if (endAt !== undefined && endAt !== null) {
    const wanted = Number(endAt)
    if (!Number.isFinite(wanted) || wanted < earliestEndOf(task) || wanted > at) throw codeError('SOFTWARELOAD_INVALID', 'Sluttiden skal ligge mellem seneste start eller pause og nu')
    return { endedAt: wanted, corrected: wanted !== at }
  }
  if (at - task.startedAt > LONG_RUN_MS) throw Object.assign(codeError('SOFTWARELOAD_LONG_RUN', 'Opgaven har kørt i over 10 timer. Vælg hvornår du stoppede'), { startedAt: task.startedAt })
  return { endedAt: at, corrected: false }
}
const notRunning = () => codeError('SOFTWARELOAD_NOT_RUNNING', 'Der kører ikke nogen softwareload-opgave')
const notPending = () => codeError('SOFTWARELOAD_NOT_PENDING', 'Opgaven venter ikke på SAP')
/** The four choices of a task; finishing moves with exactly the ones the user confirmed in the preview. */
const CHOICE_KEYS = ['type', 'kif', 'target', 'version']
const choiceOf = task => Object.fromEntries(CHOICE_KEYS.map(key => [key, task[key]]))
const sameChoice = (a, b) => Boolean(a && b) && CHOICE_KEYS.every(key => a[key] === b[key])
const changedMeanwhile = () => codeError('SOFTWARELOAD_CHANGED', 'Opgaven er rettet imens. Se oversigten igen')
const kifChanged = () => codeError('SOFTWARELOAD_KIF_CHANGED', 'Terminalerne er flyttet i SAP, siden du så planen. Se planen igen')
const planChanged = () => codeError('SOFTWARELOAD_PLAN_CHANGED', 'Terminalerne står et andet sted i SAP, end da du så planen. Se planen igen')
const beingFinished = () => codeError('SOFTWARELOAD_BUSY', 'Opgaven er ved at blive afsluttet. Vent til flytningen er færdig, eller se under "Venter på SAP"')
const alreadyFinished = () => codeError('SOFTWARELOAD_ALREADY_FINISHED', 'Opgaven er allerede afsluttet. Se Venter på SAP eller søg på et af serienumrene')
const upper = value => String(value ?? '').trim().toUpperCase()
const pad = number => String(number).padStart(2, '0')
/** The local month of a moment (the PCs run Danish time). */
const monthOf = ms => { const date = new Date(ms); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}` }
/** The local day of a moment, `YYYY-MM-DD`. */
const dayOf = ms => `${monthOf(ms)}-${pad(new Date(ms).getDate())}`
const pendingKey = id => `${PENDING_PREFIX}${id}`
const finishedKey = task => `${FINISHED_PREFIX}${writerOf(task.email)}-${monthOf(task.startedAt)}`
/** A month file holds its finished tasks and, under `deleted`, the ids a manager deleted (with who, when and the serials). */
const inMonth = (month, id) => Boolean(month?.tasks?.[id] || month?.deleted?.[id])
/**
 * The search index is split by year and serial: `serier-<yyyy>-<hh>`, where hh is the first two hex characters of
 * the serial's sha256 and yyyy the (local) year of the event. A search reads one file per year.
 */
const shardOf = serial => crypto.createHash('sha256').update(String(serial)).digest('hex').slice(0, 2)
const indexKey = line => `${INDEX_PREFIX}${new Date(line.at).getFullYear()}-${shardOf(line.serial)}`
const kifKey = at => `${KIF_PREFIX}${monthOf(at)}`
/** Who deleted which task or KIF move and when, by the month of the deletion. */
const deletedKey = at => `${DELETED_PREFIX}${monthOf(at)}`
const notFound = () => codeError('SOFTWARELOAD_NOT_FOUND', 'Opgaven eller flytningen findes ikke (længere)')
const notFinished = () => codeError('SOFTWARELOAD_NOT_FINISHED', 'Opgaven er ikke afsluttet. En opgave, der kører eller venter på SAP, kan ikke slettes')
const managerOnly = (message = 'Kun en manager kan slette') => codeError('MANAGER_ONLY', message)
const statisticsForManagers = () => managerOnly('Statistikken er kun for managere')
const commentsForManagers = () => managerOnly('Kun en manager kan skrive kommentarer')
const commentNotFound = () => codeError('SOFTWARELOAD_NOT_FOUND', 'Kommentaren findes ikke (længere)')
/** The comment's text: line breaks are kept (at most one empty line in a row); other control characters and runs of spaces become one space. */
const commentText = value => String(value ?? '').replace(/\r\n?/g, '\n').split('\n')
  .map(line => line.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
/** An own field of a saved object, so an id such as `__proto__` never finds anything. */
const own = (object, key) => (object && Object.hasOwn(object, key) ? object[key] : null)
const serialsOf = list => [...new Set((Array.isArray(list) ? list : []).map(normalizeSerial).filter(Boolean))]
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size))
const lastTo = steps => steps.filter(step => step.to).at(-1)?.to ?? null
const countOutcomes = results => Object.values(results).reduce((counts, { outcome }) => ({ ...counts, [outcome]: (counts[outcome] || 0) + 1 }), {})
const terminalsOf = task => Object.entries(task.terminals || {}).map(([serial, terminal]) => ({ serial, failed: Boolean(terminal.failed) }))
/** planMoves compares sloc and material in capitals; the lookup gives them so already, this only makes sure. */
const sapRowsOf = rows => rows.map(row => ({ ...row, material: upper(row.material), sloc: upper(row.sloc) }))
const listOf = value => (Array.isArray(value) ? value : [])
/**
 * Every SAP step of a plan (`transfers` and `blocks`, as planMoves gives them), one `serial|step` each and sorted: a
 * Transfer with its wave, from and to, or MIGO 344 with its material. Two plans move alike when these are equal.
 */
const planStepsOf = plan => [
  ...listOf(plan?.transfers).flatMap(move => listOf(move?.serials).map(serial => `${normalizeSerial(serial)}|${Number(move.wave)}|${normalizeSloc(move.from)}>${normalizeSloc(move.to)}`)),
  ...listOf(plan?.blocks).flatMap(block => listOf(block?.serials).map(serial => `${normalizeSerial(serial)}|${BLOCK_BWART}|${upper(block.material)}`)),
].sort()
const sameSteps = (plan, planned) => {
  const [a, b] = [planStepsOf(plan), planStepsOf(planned)]
  return a.length === b.length && a.every((step, index) => step === b[index])
}
/** A confirmed plan as the screen sends it: an object with `transfers` and `blocks`. */
const isPlan = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

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
const withoutFinishing = ({ finishing, ...task }) => task
const sameMove = (a, b) => Boolean(a && b) && (a.bwart ? a.bwart === b.bwart : a.from === b.from && a.to === b.to)

/** A KIF move stopped midway: a terminal it still meant to move but never did is `interrupted`. */
const interruptedResults = results => Object.fromEntries(Object.entries(results).map(([serial, result]) => [
  serial, result.outcome === 'to-target' && !result.steps.length ? { ...result, outcome: 'interrupted' } : result,
]))

/**
 * SAP documents on their way to M:, kept in a folder on this PC. An entry is written before the M: write it stands for
 * and removed after it, so a document SAP posted survives a drive that fails. Without a folder it does nothing.
 */
function createJournal(dir) {
  const file = name => path.join(dir, `${name}.json`)
  // Entries a run of this process is still writing to M:; a merge leaves them alone until they are released.
  const held = new Set()
  let sequence = 0
  return {
    /** A name that sorts in the order the entries were made. */
    nameFor: prefix => `${prefix}-${String(Date.now()).padStart(15, '0')}-${String(++sequence).padStart(6, '0')}`,
    hold: name => { held.add(name) },
    release: name => { held.delete(name) },
    async put(name, entry) {
      if (!dir) return
      try {
        await fs.promises.mkdir(dir, { recursive: true })
        await fs.promises.writeFile(`${file(name)}.tmp`, JSON.stringify(entry), 'utf8')
        await fs.promises.rename(`${file(name)}.tmp`, file(name))
      } catch { /* this PC's disk failing too leaves the uncertain mark on M: as the last guard */ }
    },
    async remove(name) {
      held.delete(name)
      if (dir) await fs.promises.rm(file(name), { force: true }).catch(() => {})
    },
    async list() {
      if (!dir) return []
      const names = (await fs.promises.readdir(dir).catch(() => [])).filter(name => name.endsWith('.json')).sort()
      const entries = []
      for (const name of names) {
        if (held.has(name.slice(0, -'.json'.length))) continue
        try {
          entries.push({ name: name.slice(0, -'.json'.length), entry: JSON.parse(await fs.promises.readFile(path.join(dir, name), 'utf8')) })
        } catch { /* unreadable: left for a person to look at */ }
      }
      return entries
    },
  }
}

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

/** SAP refused a whole group for one shared reason; the run stops and the task can be continued when it is fixed. */
const refusedAll = message => codeError('SOFTWARELOAD_SAP_FAILED', `SAP afviste alle terminalerne i gruppen af samme grund: ${message}`)

/**
 * Runs one SAP step for groups of serials, at most `size` per call, each call split by bisect until a refused serial
 * stands alone; a refusal SAP gives every serial for one shared reason stops the run (`refusedAll`). A serial already
 * in `failures` is left out, and a refused one is added with SAP's message. `saved` is awaited for every document
 * before the next call, so a crash never loses one that was saved.
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
      }, { systemic: refusedAll })
      for (const { item, message } of failed) failures.set(item, message)
      await refused(failed)
      done += failed.length
    }
    report(done, total)
  }
}

function createSoftwareloadService({
  storeFor, peekFor = null, indexStore, sap, timeclock, now = Date.now, newId = () => crypto.randomUUID(), matdocs, renewClaimMs = RENEW_CLAIM_MS,
  journalDir = null, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  const journal = createJournal(journalDir)
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
      paused: isPaused(task), pausedMs: paused, workedMs: at - task.startedAt - paused, now: at, lastEventAt: lastEventOf(task), earliestEndAt: earliestEndOf(task), terminals,
    }
  }

  const readRunning = (user, options) => storeFor(user.team).getAsync(runningKey(user.email), options)

  /**
   * Changes the person's running task under its lock; `change` returns the new task. A task marked `finishing` is on its
   * way to SAP, so nothing more may land in it: a change would be lost when the running file is deleted.
   */
  async function changeRunning(user, change) {
    let next = null
    await storeFor(user.team).mutateAsync(runningKey(user.email), current => {
      if (!current) throw notRunning()
      if (current.finishing) throw beingFinished()
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
    // SAP documents this PC could not save on M: earlier go there first; a drive still away leaves them for later.
    await mergeJournal(user).catch(() => {})
    const [found, pending] = await Promise.all([readRunning(user), pendingTasks(user)])
    // A running file left behind by a finish that handed the task over is never shown as running again.
    const leftBehind = found && (found.finishing || pending.some(task => task.id === found.id)) && await wasHandedOver(user, found).catch(() => false)
    if (leftBehind) await retireRunning(user, found.id).catch(() => {})
    const running = leftBehind ? null : found
    return { running: view(running), pending, isManager: isManager(user), writeEnabled: Boolean(sap?.writeEnabled) }
  }

  /**
   * Whether a running task was handed over to SAP already: it waits as `venter-<id>` or is in its owner's month file,
   * finished or deleted by a manager. A deleted task stays handed over, so its id is never finished again.
   */
  async function wasHandedOver(user, task) {
    const store = storeFor(user.team)
    const [pending, month] = await Promise.all([store.getAsync(pendingKey(task.id), { skipCache: true }), store.getAsync(finishedKey(task), { skipCache: true })])
    return Boolean(pending || inMonth(month, task.id))
  }

  /** Deletes the person's running file under its lock, only while it still holds task `id`. */
  function retireRunning(user, id) {
    const key = runningKey(user.email)
    return storeFor(user.team).withLockedKeysAsync([key], transaction => {
      if (transaction.get(key)?.id === id) transaction.delete(key)
    })
  }

  async function rememberVersion(user, version) {
    await storeFor(user.team).mutateAsync(VERSIONS_KEY, current => {
      const list = Array.isArray(current) ? current : []
      return [version, ...list.filter(item => item !== version)].slice(0, VERSIONS_KEPT)
    })
  }

  /**
   * Stops Stempelkort when it runs. stop() reads past the cache, so it is asked directly rather than a (possibly stale)
   * status. `then` ends the message when Stempelkort has run too long, e.g. "start så softwareload-opgaven".
   */
  async function stopTimeclock(user, then = 'start så softwareload-opgaven') {
    try {
      const stopped = await timeclock.stop(user, {})
      return { taskName: stopped.taskName, workedMs: stopped.workedMs }
    } catch (error) {
      if (error?.code === 'TIMECLOCK_NOT_RUNNING') return null
      if (error?.code === 'TIMECLOCK_LONG_RUN') throw codeError('SOFTWARELOAD_TIMECLOCK_LONG_RUN', `Stempelkortet har kørt i over 10 timer. Stop det i Stempelkort med det rigtige sluttidspunkt, og ${then}`)
      throw error
    }
  }

  /**
   * Another hub the person belongs to (`user.otherTeams`) where their task counts time now (running, not paused and not
   * on its way to SAP), or null. One read per hub, past the cache and never creating its folder; a hub that cannot be
   * read counts as not running.
   */
  async function runningElsewhere(user) {
    const teams = peekFor && Array.isArray(user.otherTeams) ? user.otherTeams.filter(team => team !== user.team) : []
    const counting = await Promise.all(teams.map(team => Promise.resolve()
      .then(() => peekFor(team).getAsync(runningKey(user.email), { skipCache: true }))
      .then(task => Boolean(task) && !isPaused(task) && !task.finishing, () => false)))
    return teams[counting.indexOf(true)] ?? null
  }

  /** Stempelkort only stops in the open hub, so a start or resume is refused while it counts time in another hub. */
  const timeclockElsewhere = user => (typeof timeclock?.runningElsewhere === 'function' ? timeclock.runningElsewhere(user) : null)
  function refuseTimeclockElsewhere(team) {
    if (team) throw codeError('SOFTWARELOAD_TIMECLOCK_ELSEWHERE', `Stempelkort kører i ${team}. Stop det der først`)
  }

  async function start(user, input = {}) {
    const chosen = choice(input)
    // The other hub is read alongside the own running task, so a slow drive is waited for once.
    const [running, elsewhere] = await Promise.all([readRunning(user, { skipCache: true }), timeclockElsewhere(user)])
    if (running) throw codeError('SOFTWARELOAD_RUNNING', 'Der kører allerede en softwareload-opgave')
    refuseTimeclockElsewhere(elsewhere)
    const stoppedTimeclock = await stopTimeclock(user)
    let started = null
    await storeFor(user.team).mutateAsync(runningKey(user.email), current => {
      if (current) throw codeError('SOFTWARELOAD_RUNNING', 'Der kører allerede en softwareload-opgave')
      started = { id: newId(), team: user.team, ...me(user), ...chosen, startedAt: now(), pauses: [], terminals: {}, state: 'running' }
      return started
    })
    await rememberVersion(user, chosen.version).catch(() => { /* only suggestions; the task is saved and runs */ })
    return { ...view(started), ...(stoppedTimeclock ? { stoppedTimeclock } : {}) }
  }

  /**
   * Corrects the choices of the person's own running task: the same rules as at start, and every change is kept in
   * `edits` with what it was before. Nothing is moved in SAP yet, so finishing uses the corrected values. A task that
   * waits for SAP is no longer running and cannot be edited; `taskId` names the task, so an edit for an ended task is refused.
   */
  async function edit(user, input = {}) {
    const chosen = choice(input)
    if (finishing.has(lower(user.email))) throw codeError('SOFTWARELOAD_BUSY', 'Opgaven er ved at blive afsluttet')
    let before = null
    const edited = await changeRunning(user, current => {
      if (current.id !== input.taskId) throw codeError('SOFTWARELOAD_NOT_RUNNING', 'Opgaven kører ikke længere')
      before = current
      const from = choiceOf(current)
      if (sameChoice(from, chosen)) return undefined
      return { ...current, ...chosen, edits: [...(current.edits || []), { at: now(), by: lower(user.email), from, to: chosen }] }
    })
    if (edited && chosen.version !== before.version) {
      await rememberVersion(user, chosen.version).catch(() => { /* only suggestions; the edit is saved */ })
    }
    return view(edited || before)
  }

  /**
   * Scans and unscans name their task: a scan the screen kept for a task that has since ended must never land in the
   * next one, so another id (or none) is refused as not running.
   */
  function requireTask(current, taskId) {
    if (current.id !== taskId) throw codeError('SOFTWARELOAD_NOT_RUNNING', 'Scanningen hører til en opgave, der ikke kører længere')
  }

  async function scan(user, input) {
    const serial = serialOf(input)
    const task = await changeRunning(user, current => {
      requireTask(current, input?.taskId)
      if (current.terminals[serial]) throw codeError('SOFTWARELOAD_DUPLICATE', 'Serienummeret er allerede scannet i opgaven')
      return { ...current, terminals: { ...current.terminals, [serial]: { at: now() } } }
    })
    return { serial, count: Object.keys(task.terminals).length }
  }

  /**
   * Changes one scanned terminal of the running task; `change` returns the new terminal, or null to remove it. With
   * `taskId` the change only applies to that task.
   */
  function changeTerminal(user, serial, change, taskId) {
    return changeRunning(user, current => {
      if (taskId !== undefined) requireTask(current, taskId)
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
    const task = await changeTerminal(user, serial, () => null, input?.taskId ?? null)
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

  /** Resumes the task; a running Stempelkort is stopped first, as at start, so the same time is never counted twice. */
  async function resume(user) {
    const [current, elsewhere] = await Promise.all([readRunning(user, { skipCache: true }), timeclockElsewhere(user)])
    if (!current) throw notRunning()
    if (current.finishing) throw beingFinished()
    if (!isPaused(current)) throw codeError('SOFTWARELOAD_NOT_PAUSED', 'Opgaven holder ikke pause')
    refuseTimeclockElsewhere(elsewhere)
    const stoppedTimeclock = await stopTimeclock(user, 'fortsæt så softwareload-opgaven')
    return { ...await changePause(user, false), ...(stoppedTimeclock ? { stoppedTimeclock } : {}) }
  }

  /**
   * Pauses the running task when Stempelkort starts. Never throws: no task, a task already paused or being finished
   * give null. After a drive error the running file is read again: `{ failed: true }` only when a running task is there
   * (or it cannot be read), so Stempelkort tells the person to pause it themselves, and nobody else hears of it.
   */
  async function pauseIfRunning(user) {
    try {
      let next = null
      await storeFor(user.team).mutateAsync(runningKey(user.email), current => {
        if (!current || isPaused(current) || current.finishing) return undefined
        next = withPause(current, true)
        return next
      })
      return view(next)
    } catch {
      const unreadable = Symbol('unreadable')
      const current = await readRunning(user, { skipCache: true }).catch(() => unreadable)
      return current === unreadable || (current && !isPaused(current) && !current.finishing) ? { failed: true } : null
    }
  }

  /** A finish marks the running task before it hands it to SAP; a marker older than CLAIM_MS is left by a finish that stopped. */
  const finishingNow = task => Boolean(task.finishing) && now() - task.finishing.at < CLAIM_MS

  async function cancel(user) {
    const current = await readRunning(user, { skipCache: true })
    if (!current) throw notRunning()
    if (finishingNow(current)) throw beingFinished()
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

  /** The plan for the running task, without moving anything. `taskId` and `choice` are what finishing must be confirmed with. */
  async function preview(user) {
    const task = await readRunning(user, { skipCache: true })
    if (!task) throw notRunning()
    const serials = Object.keys(task.terminals)
    const rows = serials.length ? sapRowsOf(await sap.lookup({ team: task.team, serials })) : []
    const { outcomes, transfers, blocks } = planMoves({ kif: task.kif, target: task.target, terminals: terminalsOf(task), sapRows: rows, passedD005: new Set() })
    return { taskId: task.id, choice: choiceOf(task), outcomes, transfers, blocks, rows }
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

  /**
   * Adds search lines, each to the file of its year and serial; `replaces` drops the lines of an earlier run of the
   * same event from those files.
   */
  async function addToIndex(lines, replaces = () => false) {
    const byKey = new Map()
    for (const line of lines) byKey.set(indexKey(line), [...(byKey.get(indexKey(line)) || []), line])
    for (const [key, added] of byKey) {
      await indexStore.mutateAsync(key, index => ({ ...index, lines: [...(index?.lines || []).filter(line => !replaces(line)), ...added] }))
    }
  }

  /** Runs a write to M: again with a growing pause while the drive fails; the service's own refusals go straight through. */
  async function retried(write) {
    let failure = null
    for (let attempt = 0; attempt < SAVE_TRIES; attempt++) {
      try {
        return await write()
      } catch (error) {
        if (/^(SOFTWARELOAD_|MANAGER_ONLY)/.test(String(error?.code || ''))) throw error
        failure = error
        if (attempt < SAVE_TRIES - 1) await sleep(SAVE_PAUSE_MS * 2 ** attempt)
      }
    }
    throw failure
  }

  const saveFailed = (doc, later) => codeError('SOFTWARELOAD_SAVE_FAILED', `SAP har lavet materialedokument ${doc}, men det kunne ikke gemmes på M:. Det er gemt på denne PC og kommer med, ${later}`)
  /** Saves a KIF move record; false when a manager deleted the move meanwhile, which is never brought back. */
  async function writeKif(move) {
    let kept = true
    await storeFor(move.team).mutateAsync(kifKey(move.at), month => {
      kept = !month?.deleted?.[move.id]
      return kept ? { ...month, moves: { ...month?.moves, [move.id]: move } } : undefined
    })
    return kept
  }
  const kifLinesOf = move => line => line.kind === 'kif' && line.email === move.email && line.at === move.at

  /** Adds a journalled SAP step to the pending task, once, in place of the unverified step it may have got since. */
  function mergeStep(user, { taskId, serials, step }) {
    return changePending(user, taskId, current => {
      const results = { ...current.results }
      let changed = false
      for (const serial of serials) {
        const result = results[serial]
        if (!result) continue
        const steps = result.steps || []
        const unverified = steps.findIndex(item => item.unverified && sameMove(item, step))
        const next = steps.some(item => item.doc === step.doc) ? steps
          : unverified === -1 ? [...steps, step] : steps.map((item, index) => (index === unverified ? step : item))
        results[serial] = { ...(sameMove(result.uncertain, step) ? withoutMark(result) : result), steps: next }
        changed = true
      }
      return changed ? { ...current, results } : undefined
    })
  }

  /**
   * Writes what this PC's journal holds for the user's team to M: and empties it: SAP steps of pending tasks (`pendingTasks`,
   * `taskId` limits it to one task) and KIF move records (`kif`). A task that is no longer pending has nothing to add to.
   */
  async function mergeJournal(user, { pendingTasks: withTasks = true, taskId = null, kif = true } = {}) {
    for (const { name, entry } of await journal.list()) {
      if (entry?.team !== user.team) continue
      if (entry.kind === 'task' && withTasks && (!taskId || entry.taskId === taskId)) {
        try {
          await mergeStep(user, entry)
        } catch (error) {
          if (error?.code !== 'SOFTWARELOAD_NOT_PENDING') throw error
        }
        await journal.remove(name)
      } else if (entry.kind === 'kif' && kif) {
        const move = entry.final ? entry.move : { ...entry.move, results: interruptedResults(entry.move.results) }
        if (await writeKif(move)) {
          const lines = kifLines(move)
          await addToIndex(entry.final ? lines : lines.filter(line => line.docs.length), kifLinesOf(move))
        }
        await journal.remove(name)
      }
    }
  }

  /**
   * Writes a pending task as finished: the month file of its owner first, then the search index, and the pending file
   * last. Until then the task stays pending, and both writes replace rather than add, so running it again is harmless.
   */
  async function complete(user, taskId, change) {
    const current = await readPending(user, taskId)
    const { claim, ...task } = { ...change(current), state: 'faerdig' }
    await storeFor(user.team).mutateAsync(finishedKey(task), month => ({ ...month, tasks: { ...month?.tasks, [task.id]: task } }))
    await addToIndex(indexLines(task), line => line.kind === 'load' && line.taskId === task.id)
    await storeFor(user.team).deleteAsync(pendingKey(taskId))
    return { taskId: task.id, results: task.results, counts: countOutcomes(task.results), state: task.state }
  }

  /**
   * Where SAP has a pending task's terminals now and the plan from there, as a run makes it: a step this task saved (or
   * a mark SAP proves it made) counts as passing D005.
   */
  async function planPending(task) {
    const serials = Object.keys(task.terminals || {})
    const rows = serials.length ? sapRowsOf(await sap.lookup({ team: task.team, serials })) : []
    const rowOf = new Map(rows.map(row => [row.serial, row]))
    // A step to D005 or out of it (also one a mark proves) means the terminal passed D005; one that started on D005
    // only ever gets the step out of it.
    const passedD005 = new Set(serials.filter(serial => stepsWithMark(task.results?.[serial], rowOf.get(serial)).some(step => step.to === KIF || step.from === KIF)))
    return { serials, rows, rowOf, plan: planMoves({ kif: task.kif, target: task.target, terminals: terminalsOf(task), sapRows: rows, passedD005 }) }
  }

  /**
   * Moves a pending task's terminals in SAP. Every SAP document is saved on its serials before the next call, so a
   * crash or a closed SAP leaves the task pending and a later run starts from what SAP and the saved steps say.
   * The caller holds the claim for `runId`; the run keeps it fresh and gives it back when it fails. With `planned` (a
   * continue from Venter på SAP) a plan that moves otherwise than the confirmed one stops the run before SAP moves.
   */
  async function execute(user, taskId, runId, onProgress, planned) {
    const stopRenewing = renewWhileRunning(user, taskId, runId)
    try {
      return await moveInSap(user, taskId, runId, onProgress, planned)
    } catch (error) {
      await releaseClaim(user, taskId, runId)
      throw error
    } finally {
      stopRenewing()
    }
  }

  async function moveInSap(user, taskId, runId, onProgress, planned) {
    const report = (step, done, total) => { try { onProgress?.({ done, total, step }) } catch { /* the screen is gone */ } }
    const by = lower(user.email)
    await mergeJournal(user, { taskId, kif: false })
    const task = await readPending(user, taskId)
    const total = Object.keys(task.terminals || {}).length

    report('lookup', 0, total)
    const { serials, rowOf, plan } = await planPending(task)
    report('lookup', total, total)
    if (planned !== undefined && !sameSteps(plan, planned)) throw planChanged()

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
        if (steps.length && before.outcome && NOTHING_TO_MOVE.includes(outcome)) outcome = before.outcome
        results[serial] = { material: before?.material ?? row?.material ?? null, from: before?.from ?? row?.sloc ?? null, outcome, steps }
      }
      return { ...current, results }
    })

    const failures = new Map()
    /** Saves a SAP document on its serials: in this PC's journal first, then on M:, tried again while the drive fails. */
    const addSteps = async (items, step) => {
      const name = journal.nameFor(`task-${taskId}`)
      journal.hold(name)
      await journal.put(name, { kind: 'task', team: user.team, taskId, serials: items, step })
      let taken = null
      try {
        await retried(() => changePending(user, taskId, current => {
          const results = { ...current.results }
          for (const serial of items) {
            const result = withoutMark(results[serial])
            const steps = result.steps || []
            results[serial] = { ...result, steps: steps.some(item => item.doc === step.doc) ? steps : [...steps, step] }
          }
          taken = takenBy(current)
          return { ...current, results, claim: taken || claimOf(user, runId) }
        }))
      } catch (error) {
        // The journal keeps the document; the next status or continue on this PC merges it.
        journal.release(name)
        if (/^SOFTWARELOAD_/.test(String(error?.code || ''))) throw error
        throw saveFailed(step.doc, 'når opgaven fortsættes på denne PC')
      }
      await journal.remove(name)
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
      (move, items) => sap.transfer({ team: task.team, serials: items, from: move.from, to: move.to }),
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

  /**
   * Gives the running task back the marker it had before this finish (`runId`) marked it, when the finish stopped before
   * the task was handed over. Only this finish's own marker is touched. Best effort: a marker left behind no longer stops
   * finish or cancel after CLAIM_MS.
   */
  async function restoreFinishing(user, runId, previous) {
    try {
      await storeFor(user.team).mutateAsync(runningKey(user.email), current => {
        if (current?.finishing?.runId !== runId) return undefined
        return previous ? { ...current, finishing: previous } : withoutFinishing(current)
      })
    } catch { /* see above */ }
  }

  /** Runs `work` as the person's one finish or stop in this process; a second press meanwhile is refused. */
  async function whileFinishing(user, work) {
    const email = lower(user.email)
    if (finishing.has(email)) throw codeError('SOFTWARELOAD_BUSY', 'Opgaven er allerede ved at blive afsluttet')
    finishing.add(email)
    try {
      return await work()
    } finally {
      finishing.delete(email)
    }
  }

  /**
   * Stops the time and hands the running task over to SAP; it waits as `venter-<id>` until every move is done.
   * `confirmedId` and `confirmedChoice` are the task and the choices the user confirmed: a task edited since is refused
   * with SOFTWARELOAD_CHANGED, so SAP never moves with choices nobody saw. Under the same lock the task is marked
   * `finishing`, so an edit or scan from another PC cannot land in it and get lost when the running file is deleted.
   * A task already handed over (pending or finished) is never handed over again: its running file is a leftover and
   * goes, and the hand-over is refused with SOFTWARELOAD_ALREADY_FINISHED. After more than 10 hours the time only stops
   * at an `endAt` the person chose (SOFTWARELOAD_LONG_RUN without it), as in Stempelkort; the end is frozen in the
   * marker, so a hand-over resumed later keeps it. With `runId` the pending task is claimed for the run that moves it
   * next; without, it waits for "Fortsæt i SAP". With `needsPlan` (finish) a missing `planned` is refused with
   * SOFTWARELOAD_PLAN_CHANGED after every other check and before the task is marked. Returns the task as handed over
   * and whether this resumed the hand-over of an earlier finish that stopped after marking it.
   */
  async function handOver(user, confirmedId, confirmedChoice, { endAt, runId, needsPlan = false, planned } = {}) {
    const store = storeFor(user.team)
    const markId = runId ?? newRunId()
    const found = await readRunning(user, { skipCache: true })
    if (found && await wasHandedOver(user, found)) {
      await retireRunning(user, found.id).catch(() => { /* status retires it later */ })
      throw alreadyFinished()
    }
    let ended = null
    let previous = null
    await store.mutateAsync(runningKey(user.email), current => {
      if (!current) throw notRunning()
      if (finishingNow(current)) throw codeError('SOFTWARELOAD_BUSY', 'Opgaven er allerede ved at blive afsluttet')
      if (current.id !== confirmedId || !sameChoice(choiceOf(current), confirmedChoice)) throw changedMeanwhile()
      previous = current.finishing ?? null
      const task = withoutFinishing(current)
      // After a finish that stopped once marked, the time stopped then: the time it hung does not count.
      const { endedAt, corrected } = previous
        ? { endedAt: previous.endedAt ?? previous.at, corrected: previous.endCorrected === true }
        : endOf(task, endAt, now())
      if (needsPlan && !isPlan(planned)) throw planChanged()
      const pauses = pausesUntil(task.pauses, endedAt)
      const paused = pausedMs(pauses, endedAt)
      const correctedMark = corrected ? { endCorrected: true } : {}
      ended = { ...task, pauses, endedAt, pausedMs: paused, workedMs: endedAt - task.startedAt - paused, state: 'mangler-sap', ...correctedMark }
      return { ...task, finishing: { at: now(), endedAt, runId: markId, ...correctedMark } }
    })
    let handedOver = false
    try {
      // Under the locks of the pending file and the month file, so a continue that completes the task meanwhile is seen.
      handedOver = await store.withLockedKeysAsync([pendingKey(ended.id), finishedKey(ended)], transaction => {
        if (transaction.get(pendingKey(ended.id)) || inMonth(transaction.get(finishedKey(ended)), ended.id)) return true
        transaction.set(pendingKey(ended.id), runId ? { ...ended, claim: claimOf(user, runId) } : ended)
        return false
      })
    } catch (error) {
      await restoreFinishing(user, markId, previous)
      throw error
    }
    // The task is handed over now (or was already); the running file is a leftover, and status retires it if this fails.
    await retireRunning(user, ended.id).catch(() => {})
    if (handedOver) throw alreadyFinished()
    return { ended, resumed: Boolean(previous) }
  }

  /**
   * "Afslut og flyt i SAP": hands the running task over (see handOver) with the choices the preview showed, and moves
   * it in SAP at once; on an error it waits under Venter på SAP to be continued. `planned` is the `transfers` and
   * `blocks` of that preview: when the run's fresh lookup gives a plan that moves otherwise, nothing moves, the task
   * waits under Venter på SAP with its time stopped, and SOFTWARELOAD_PLAN_CHANGED asks for the new plan to be seen.
   * A finish that resumes the hand-over of an earlier one (its marker) is not compared, as ruled for 4.5.
   */
  async function finish(user, { taskId: confirmedId, choice: confirmed, endAt, planned, onProgress } = {}) {
    requireWrite()
    return whileFinishing(user, async () => {
      const runId = newRunId()
      const { ended, resumed } = await handOver(user, confirmedId, confirmed, { endAt, runId, needsPlan: true, planned })
      inFlight.add(ended.id)
      try {
        return await execute(user, ended.id, runId, onProgress, resumed ? undefined : planned)
      } finally {
        inFlight.delete(ended.id)
      }
    })
  }

  /**
   * "Stop tiden nu, flyt i SAP senere": hands the running task over exactly as finish does, but asks SAP nothing, so the
   * time stops also when SAP is closed or logged out. The task waits under Venter på SAP, where "Fortsæt i SAP" looks
   * the terminals up and moves them once the person has confirmed the plan.
   */
  async function stop(user, { taskId: confirmedId, choice: confirmed, endAt } = {}) {
    requireWrite()
    const { ended } = await whileFinishing(user, () => handOver(user, confirmedId, confirmed, { endAt }))
    return {
      taskId: ended.id, endedAt: ended.endedAt, workedMs: ended.workedMs, pausedMs: ended.pausedMs,
      count: Object.keys(ended.terminals || {}).length, state: ended.state,
    }
  }

  function requireOwnerOrManager(user, task) {
    if (task.email !== lower(user.email) && !isManager(user)) throw codeError('MANAGER_ONLY', 'Kun ejeren eller en manager kan fortsætte opgaven i SAP')
  }

  /**
   * The plan for a task waiting for SAP from where SAP has its terminals now, without moving anything. "Fortsæt i SAP"
   * must be confirmed with its `transfers` and `blocks`. A terminal this task already moved shows the outcome it was
   * moved for, as the run keeps it.
   */
  async function pendingPreview(user, { taskId } = {}) {
    const waiting = await readPending(user, taskId)
    requireOwnerOrManager(user, waiting)
    // SAP documents this PC still holds for the task count, as they do when the run merges them first.
    await mergeJournal(user, { taskId: waiting.id, kif: false }).catch(() => {})
    const task = await readPending(user, waiting.id)
    const { rows, rowOf, plan } = await planPending(task)
    const outcomes = Object.fromEntries(Object.entries(plan.outcomes).map(([serial, outcome]) => {
      const before = task.results?.[serial]
      const moved = stepsWithMark(before, rowOf.get(serial)).length && before?.outcome && NOTHING_TO_MOVE.includes(outcome)
      return [serial, moved ? before.outcome : outcome]
    }))
    return { taskId: task.id, choice: choiceOf(task), outcomes, transfers: plan.transfers, blocks: plan.blocks, rows }
  }

  /**
   * "Fortsæt i SAP": looks the terminals up again and moves them. `planned` is the `transfers` and `blocks` of the
   * preview the person confirmed; without it, or when SAP now gives a plan that moves otherwise, nothing moves and
   * SOFTWARELOAD_PLAN_CHANGED asks for the plan to be seen again.
   */
  async function continueFinish(user, { taskId, planned, onProgress } = {}) {
    requireWrite()
    const task = await readPending(user, taskId)
    requireOwnerOrManager(user, task)
    if (!isPlan(planned)) throw planChanged()
    if (inFlight.has(task.id)) throw alreadyMoving()
    inFlight.add(task.id)
    try {
      const runId = newRunId()
      await takeClaim(user, task.id, runId)
      return await execute(user, task.id, runId, onProgress, planned)
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

  /**
   * The serials to move into KIF: those of the material document when one is given, else the scanned or pasted ones.
   * `document` is the one SAP found, with its year (the lookup tries this year and the two before when none is typed).
   */
  async function kifSerials(user, { serials, document } = {}) {
    if (!String(document ?? '').trim()) {
      const typed = serialsOf(serials)
      if (!typed.length) throw noSerials()
      return { serials: typed }
    }
    const fetched = await matdocs({ team: user.team, document })
    const found = serialsOf(fetched.rows.map(row => row.serial))
    if (!found.length) throw codeError('SOFTWARELOAD_INVALID', 'Materialedokumentet har ingen serienumre. Skriv det som fx "4905204948" eller "4905204948 2026"')
    return { serials: found, document: fetched.document }
  }

  /** Plans the moves to D005 from where SAP says the terminals stand now; nothing is failed and nothing goes via D005. */
  async function kifPlan(team, serials) {
    const rows = sapRowsOf(await sap.lookup({ team, serials }))
    const terminals = serials.map(serial => ({ serial, failed: false }))
    return { rows, ...planMoves({ kif: false, target: KIF, terminals, sapRows: rows, passedD005: new Set() }) }
  }

  async function kifPreview(user, input = {}) {
    const { serials, document } = await kifSerials(user, input)
    const { outcomes, transfers } = await kifPlan(user.team, serials)
    return { serials, ...(document ? { document } : {}), outcomes, transfers }
  }

  /**
   * Moves the serials the user confirmed to D005. SAP is asked again, as stock may have moved since the preview; `planned`
   * is the from-location of every serial the confirmed preview moved, and a new plan that differs is refused with
   * SOFTWARELOAD_KIF_CHANGED before anything moves, so SAP never moves along a plan nobody saw.
   */
  async function kifMove(user, { serials, document, planned } = {}, { onProgress } = {}) {
    requireWrite()
    const confirmed = serialsOf(serials)
    if (!confirmed.length) throw noSerials()
    const given = String(document ?? '').trim()
    const matdoc = given ? normalizeMatdoc(given) : null
    if (given && !matdoc) throw codeError('SOFTWARELOAD_INVALID', 'Skriv materialedokumentet som fx "4900229137" eller "4900229137 2026 01"')
    if (!planned || typeof planned !== 'object' || Array.isArray(planned)) throw kifChanged()
    const email = lower(user.email)
    if (movingToKif.has(email)) throw codeError('SOFTWARELOAD_BUSY', 'Du er allerede ved at flytte terminaler til D005')
    movingToKif.add(email)
    try {
      await mergeJournal(user, { pendingTasks: false }).catch(() => {})
      return await moveToKif(user, confirmed, matdoc, planned, onProgress)
    } finally {
      movingToKif.delete(email)
    }
  }

  /** Whether the transfers of a new plan take exactly the confirmed serials from exactly the confirmed locations. */
  function samePlan(transfers, planned) {
    const now = new Map(transfers.flatMap(move => move.serials.map(serial => [serial, normalizeSloc(move.from)])))
    const seen = new Map(Object.entries(planned).map(([serial, from]) => [normalizeSerial(serial), normalizeSloc(from)]))
    return now.size === seen.size && [...now].every(([serial, from]) => from && seen.get(serial) === from)
  }

  /**
   * Saves the record in `kif-<yyyy-mm>` after every SAP document and once more at the end, then adds the search lines.
   * When SAP throws midway, what was posted is still saved and indexed, the rest is `interrupted`, and the error goes on.
   */
  async function moveToKif(user, serials, document, planned, onProgress) {
    const report = (step, done, total) => { try { onProgress?.({ done, total, step }) } catch { /* the screen is gone */ } }
    const at = now()
    const by = lower(user.email)
    report('lookup', 0, serials.length)
    const { rows, outcomes, transfers } = await kifPlan(user.team, serials)
    if (!samePlan(transfers, planned)) throw kifChanged()
    report('lookup', serials.length, serials.length)
    const rowOf = new Map(rows.map(row => [row.serial, row]))
    const results = Object.fromEntries(serials.map(serial => {
      const row = rowOf.get(serial)
      return [serial, { material: row?.material ?? null, from: row?.sloc ?? null, outcome: outcomes[serial], steps: [] }]
    }))
    const move = { id: newId(), team: user.team, ...me(user), at, ...(document ? { document } : {}), results }
    const journalName = `kif-${move.id}`
    // Held while this run writes it, so a status poll meanwhile does not merge a record still on its way.
    journal.hold(journalName)
    /** Writes the record to this PC's journal and then to M:; `doc` names the SAP document in the error when M: fails. */
    const save = async ({ doc = null, final = false } = {}) => {
      await journal.put(journalName, { kind: 'kif', team: user.team, final, move })
      try {
        return await retried(() => writeKif(move))
      } catch (error) {
        throw doc ? saveFailed(doc, 'næste gang Softwareload åbnes på denne PC') : error
      }
    }

    const failures = new Map()
    const settle = async interrupted => {
      for (const [serial, message] of failures) results[serial] = { ...withoutMark(results[serial]), outcome: 'failed-sap', message }
      if (interrupted) {
        for (const serial of serials) if (results[serial].outcome === 'to-target' && !results[serial].steps.length) results[serial] = { ...results[serial], outcome: 'interrupted' }
      }
      if (await save({ final: !interrupted })) {
        const lines = kifLines(move)
        await addToIndex(interrupted ? lines.filter(line => line.docs.length) : lines, kifLinesOf(move))
      }
      await journal.remove(journalName)
    }
    try {
      await runChunks({
        groups: transfers, size: TRANSFER_CHUNK, failures,
        // The record keeps an `uncertain` mark until SAP's answer is saved; a lost answer leaves it in the history.
        attempt: async (group, items) => {
          for (const serial of items) results[serial] = { ...results[serial], uncertain: { from: group.from, to: group.to, by, at: now() } }
          await save()
          const answer = await sap.transfer({ team: user.team, serials: items, from: group.from, to: group.to })
          // A refusal moved nothing, so the mark goes; the next save writes that down.
          if (!answer.ok) for (const serial of items) results[serial] = withoutMark(results[serial])
          return answer
        },
        saved: (group, items, doc) => {
          for (const serial of items) {
            const result = withoutMark(results[serial])
            results[serial] = { ...result, steps: [...result.steps, { from: group.from, to: group.to, doc, by, at: now() }] }
          }
          return save({ doc })
        },
        report: (done, total) => report('transfer', done, total),
      })
    } catch (error) {
      // SAP's error is the one to show; a failing drive here leaves the record in this PC's journal, never the error.
      await settle(true).catch(() => {})
      journal.release(journalName)
      throw error
    }
    try {
      await settle(false)
    } finally {
      journal.release(journalName)
    }
    return { id: move.id, results, counts: countOutcomes(results) }
  }

  /**
   * Every event for a serial in either team, newest first; anyone in TRR or TCD may search. Only the serial's own
   * files are read (one per year), and `unreadable` counts those that could not be read.
   */
  async function search(user, { serial } = {}) {
    const wanted = normalizeSerial(serial)
    if (!wanted) return { lines: [], unreadable: 0 }
    const own = new RegExp(`^${INDEX_PREFIX}\\d{4}-${shardOf(wanted)}$`)
    const keys = (await indexStore.keysAsync()).filter(key => own.test(key))
    const files = await Promise.all(keys.map(key => indexStore.getAsync(key).then(file => ({ file }), () => ({ unreadable: true }))))
    const lines = files.flatMap(({ file }) => (file?.lines || []).filter(line => line.serial === wanted)).sort((a, b) => b.at - a.at)
    return {
      lines: await withDeletions(user, lines).catch(() => lines),
      unreadable: files.filter(item => item.unreadable).length,
    }
  }

  /** The team's month file that knows the event of a search line: `kif-<month>`, or the owner's task file of the month it ended. */
  const eventFileOf = line => (line.kind === 'kif' ? kifKey(line.at) : `${FINISHED_PREFIX}${writerOf(line.email)}-${monthOf(line.at)}`)
  /** The move of a KIF search line, kept or deleted: a line names no move, so it is matched on email and time. */
  function kifMoveOf(file, line) {
    const kept = Object.values(file?.moves || {}).find(move => move.email === line.email && move.at === line.at)
    if (kept) return { id: kept.id, deleted: false }
    const gone = Object.entries(file?.deleted || {}).find(([, item]) => item.email === line.email && item.movedAt === line.at)
    return gone ? { id: gone[0], deleted: true } : null
  }

  /**
   * Leaves out the lines of a deleted task or KIF move: a deletion whose index write failed midway, or a line written
   * just after the deletion, is never shown. A manager's KIF lines of the own team get `moveId`, the move "Slet" deletes,
   * also for lines saved before moves could be deleted. The month files are the team's own, read from either team.
   */
  async function withDeletions(user, lines) {
    const fileKey = line => `${line.team}|${eventFileOf(line)}`
    const wanted = new Map(lines.map(line => [fileKey(line), line]))
    const read = await Promise.all([...wanted].map(async ([key, line]) => [key, await storeFor(line.team).getAsync(eventFileOf(line)).catch(() => null)]))
    const files = new Map(read)
    return lines.flatMap(line => {
      const file = files.get(fileKey(line))
      if (line.kind === 'load') return file?.deleted?.[line.taskId] ? [] : [line]
      const move = kifMoveOf(file, line)
      if (move?.deleted) return []
      return move && isManager(user) && line.team === user.team ? [{ ...line, moveId: move.id }] : [line]
    })
  }

  /** Finished tasks of the whole team started (local day) in the period; the statistics are for managers only. */
  async function tasks(user, { from, to } = {}) {
    if (!isManager(user)) throw statisticsForManagers()
    const months = new Set(monthsBetween(from, to, 'SOFTWARELOAD_INVALID'))
    const store = storeFor(user.team)
    const keys = (await store.keysAsync()).filter(key => key.startsWith(FINISHED_PREFIX) && months.has(key.slice(-7)))
    const files = await Promise.all(keys.map(key => store.getAsync(key).catch(() => null)))
    const inPeriod = task => dayOf(task.startedAt) >= from && dayOf(task.startedAt) <= to
    return files.flatMap(file => Object.values(file?.tasks || {}))
      .filter(task => task.state === 'faerdig' && inPeriod(task))
      .sort((a, b) => b.startedAt - a.startedAt)
  }

  const TASK_MONTH = new RegExp(`^${FINISHED_PREFIX}[0-9a-f]{16}-\\d{4}-\\d{2}$`)
  const KIF_MONTH = new RegExp(`^${KIF_PREFIX}\\d{4}-\\d{2}$`)

  /**
   * The team's month file (matching `pattern`) that has `id` under `field` or under `deleted`, read past the cache. An
   * unreadable file is passed over; only when no file has the id does its error stand, as the id may be in it.
   */
  async function findInMonths(store, pattern, field, id) {
    const keys = (await store.keysAsync()).filter(key => pattern.test(key))
    const read = await Promise.all(keys.map(key => store.getAsync(key, { skipCache: true }).then(file => ({ file }), error => ({ error }))))
    // A file that still has the id itself wins over one that only marks it deleted.
    const kept = read.findIndex(({ file }) => file?.[field]?.[id])
    const index = kept !== -1 ? kept : read.findIndex(({ file }) => file?.deleted?.[id])
    if (index !== -1) return { key: keys[index], file: read[index].file }
    const unreadable = read.find(item => item.error)
    if (unreadable) throw unreadable.error
    return null
  }

  async function isRunning(store, id) {
    const keys = (await store.keysAsync()).filter(key => key.startsWith(RUNNING_PREFIX))
    const tasks = await Promise.all(keys.map(key => store.getAsync(key, { skipCache: true })))
    return tasks.some(task => task?.id === id)
  }

  /** Adds a line to the deletion log of the month, inside the transaction that deletes. */
  function logDeletion(transaction, entry) {
    const key = deletedKey(entry.at)
    const log = transaction.get(key)
    transaction.set(key, { ...log, entries: [...(log?.entries || []), entry] })
  }

  /**
   * Removes the lines `belongs` picks from the search files of the serials in the year of `at`, each file tried again
   * while M: fails. Lines a failure leaves are hidden by the search and go when the deletion is run again.
   */
  async function dropFromIndex(serials, at, belongs) {
    for (const key of new Set(serials.map(serial => indexKey({ serial, at })))) {
      await retried(() => indexStore.mutateAsync(key, index => {
        const lines = index?.lines || []
        const kept = lines.filter(line => !belongs(line))
        return kept.length === lines.length ? undefined : { ...index, lines: kept }
      }))
    }
  }

  const idOf = value => {
    const id = String(value ?? '')
    if (!TASK_ID_PATTERN.test(id)) throw notFound()
    return id
  }

  /**
   * A manager deletes a finished task of the team, e.g. test data: it leaves its month file, and so the list and the
   * statistics, and the search. SAP is never touched. The id stays in the month file under `deleted`, so the task is
   * never finished again, and a running file left behind with the same id goes too. A task that runs or waits for SAP
   * is refused. Deleting a deleted task again only cleans the search once more, as a retry after M: failed midway.
   */
  async function deleteTask(user, { taskId } = {}) {
    if (!isManager(user)) throw managerOnly()
    const id = idOf(taskId)
    const store = storeFor(user.team)
    const found = await findInMonths(store, TASK_MONTH, 'tasks', id)
    if (!found) {
      if (await store.getAsync(pendingKey(id), { skipCache: true }) || await isRunning(store, id)) throw notFinished()
      throw notFound()
    }
    const known = found.file.tasks?.[id] || found.file.deleted[id]
    const owner = known.email
    // The search finds a task's lines by the month it ended, so a task started in an earlier month is marked there too.
    const endedKey = `${FINISHED_PREFIX}${writerOf(owner)}-${monthOf(known.endedAt)}`
    const at = now()
    const by = lower(user.email)
    const running = runningKey(owner)
    const gone = await store.withLockedKeysAsync([pendingKey(id), found.key, endedKey, running, deletedKey(at)], transaction => {
      // A finish that has written the month file but not yet removed the pending one is still on its way.
      if (transaction.get(pendingKey(id))) throw notFinished()
      const month = transaction.get(found.key)
      const task = month?.tasks?.[id]
      const deleted = task
        ? { by, at, email: task.email, endedAt: task.endedAt, serials: [...new Set([...Object.keys(task.terminals || {}), ...Object.keys(task.results || {})])] }
        : month?.deleted?.[id]
      if (!deleted) throw notFound()
      if (task) {
        const tasks = { ...month.tasks }
        delete tasks[id]
        // The task's own file first: a write that stops after it still leaves the task deleted.
        transaction.set(found.key, { ...month, tasks, deleted: { ...month.deleted, [id]: deleted } })
        logDeletion(transaction, { kind: 'task', id, by, at, serials: deleted.serials })
      }
      const ended = transaction.get(endedKey)
      if (endedKey !== found.key && !ended?.deleted?.[id]) transaction.set(endedKey, { ...ended, deleted: { ...ended?.deleted, [id]: deleted } })
      if (transaction.get(running)?.id === id) transaction.delete(running)
      return deleted
    })
    await dropFromIndex(gone.serials, gone.endedAt, line => line.kind === 'load' && line.taskId === id && line.team === user.team)
    return { ok: true }
  }

  /**
   * A manager deletes a move into KIF of the team: the record leaves `kif-<yyyy-mm>` and its lines leave the search.
   * SAP is never touched. The id stays under `deleted`, so a copy still in a PC's journal never brings it back.
   */
  async function deleteKifMove(user, { id: moveId } = {}) {
    if (!isManager(user)) throw managerOnly()
    const id = idOf(moveId)
    const store = storeFor(user.team)
    const found = await findInMonths(store, KIF_MONTH, 'moves', id)
    if (!found) throw notFound()
    const at = now()
    const by = lower(user.email)
    const gone = await store.withLockedKeysAsync([found.key, deletedKey(at)], transaction => {
      const month = transaction.get(found.key)
      const move = month?.moves?.[id]
      const deleted = move ? { by, at, email: move.email, movedAt: move.at, serials: Object.keys(move.results || {}) } : month?.deleted?.[id]
      if (!deleted) throw notFound()
      if (move) {
        const moves = { ...month.moves }
        delete moves[id]
        transaction.set(found.key, { ...month, moves, deleted: { ...month.deleted, [id]: deleted } })
        logDeletion(transaction, { kind: 'kif', id, by, at, serials: deleted.serials })
      }
      return deleted
    })
    await dropFromIndex(gone.serials, gone.movedAt, line => line.kind === 'kif' && line.team === user.team && line.email === gone.email && line.at === gone.movedAt)
    return { ok: true }
  }

  /**
   * A comment's fields from the screen: a period checked like the statistics' (at most a year), an optional material
   * (in capitals, as SAP writes it) and version (cleaned as at start), and a text of at most COMMENT_MAX characters.
   * Without a material or a version the comment concerns the whole period.
   */
  function commentFields(input) {
    const from = String(input?.from ?? '')
    const to = String(input?.to ?? '')
    monthsBetween(from, to, 'SOFTWARELOAD_INVALID')
    const material = upper(input?.material)
    if (material && !MATERIAL_PATTERN.test(material)) throw codeError('SOFTWARELOAD_INVALID', 'Ugyldigt materialenummer')
    const version = clean(input?.version, VERSION_MAX)
    const text = commentText(input?.text)
    if (!text) throw codeError('SOFTWARELOAD_INVALID', 'Skriv kommentaren')
    if (text.length > COMMENT_MAX) throw codeError('SOFTWARELOAD_INVALID', `Skriv højst ${COMMENT_MAX} tegn`)
    return { from, to, ...(material ? { material } : {}), ...(version ? { version } : {}), text }
  }

  const commentIdOf = value => {
    const id = String(value ?? '')
    if (!TASK_ID_PATTERN.test(id)) throw commentNotFound()
    return id
  }

  /** The team's comments whose period overlaps the chosen one, by start date; for managers, like the statistics. */
  async function comments(user, { from, to } = {}) {
    if (!isManager(user)) throw statisticsForManagers()
    monthsBetween(from, to, 'SOFTWARELOAD_INVALID')
    const file = await storeFor(user.team).getAsync(COMMENTS_KEY)
    return Object.values(file?.comments || {})
      .filter(comment => comment.from <= to && comment.to >= from)
      .sort((a, b) => a.from.localeCompare(b.from) || a.at - b.at)
  }

  /** A manager explains the numbers of a period, e.g. that new software for a material took longer to load. */
  async function addComment(user, input = {}) {
    if (!isManager(user)) throw commentsForManagers()
    const comment = { id: newId(), ...commentFields(input), by: me(user), at: now() }
    await storeFor(user.team).mutateAsync(COMMENTS_KEY, file => ({ ...file, comments: { ...file?.comments, [comment.id]: comment } }))
    return comment
  }

  /** A manager rewrites a comment: it keeps who wrote it and when, gets who edited it and when, and the earlier wording goes to `history`. */
  async function updateComment(user, { id, ...input } = {}) {
    if (!isManager(user)) throw commentsForManagers()
    const key = commentIdOf(id)
    const fields = commentFields(input)
    let next = null
    await storeFor(user.team).mutateAsync(COMMENTS_KEY, file => {
      const current = own(file?.comments, key)
      if (!current) throw commentNotFound()
      next = { id: key, ...fields, by: current.by, at: current.at, editedBy: me(user), editedAt: now() }
      return { ...file, comments: { ...file.comments, [key]: next }, history: { ...file.history, [key]: [...(own(file.history, key) || []), current] } }
    })
    return next
  }

  /** A manager deletes a comment: it stays under `deleted` with who and when, and the deletion is logged like a task's. */
  async function deleteComment(user, { id } = {}) {
    if (!isManager(user)) throw commentsForManagers()
    const key = commentIdOf(id)
    const at = now()
    const by = me(user)
    await storeFor(user.team).withLockedKeysAsync([COMMENTS_KEY, deletedKey(at)], transaction => {
      const file = transaction.get(COMMENTS_KEY)
      const comment = own(file?.comments, key)
      if (!comment) {
        // A second click finds it deleted already.
        if (own(file?.deleted, key)) return
        throw commentNotFound()
      }
      const kept = { ...file.comments }
      delete kept[key]
      transaction.set(COMMENTS_KEY, { ...file, comments: kept, deleted: { ...file.deleted, [key]: { ...comment, deletedBy: by, deletedAt: at } } })
      logDeletion(transaction, { kind: 'comment', id: key, by: by.email, at })
    })
    return { ok: true }
  }

  return {
    status, start, edit, scan, unscan, markFailed, unmarkFailed,
    pause: user => changePause(user, true), resume, pauseIfRunning, runningElsewhere,
    cancel, versions, preview, finish, stop, pendingPreview, continueFinish, abandon, kifPreview, kifMove, search, tasks, deleteTask, deleteKifMove, isManager,
    comments, addComment, updateComment, deleteComment,
  }
}

module.exports = { createSoftwareloadService, CLAIM_MS }
