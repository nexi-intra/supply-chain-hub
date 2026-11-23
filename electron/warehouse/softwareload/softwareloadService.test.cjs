const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { createSoftwareloadService, CLAIM_MS } = require('./softwareloadService.cjs')

const ANNA = { email: 'Anna@example.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const BO = { email: 'bo@example.test', fullName: 'Bo', role: 'user', team: 'TCD' }
const MONA = { email: 'mona@example.test', fullName: 'Mona', role: 'manager', team: 'TCD' }
const TRINE = { email: 'trine@example.test', fullName: 'Trine', role: 'user', team: 'TRR' }
const TOM = { email: 'tom@example.test', fullName: 'Tom', role: 'manager', team: 'TRR' }
const TASK = { type: 'sw+key', kif: true, target: ' d006 ', version: 'v2.1.3' }
const MIN = 60_000

const NOT_READY = () => Object.assign(new Error('SAP er ikke klar'), { code: 'SAP_NOT_READY' })
const TIMEOUT = () => Object.assign(new Error('SAP_TIMEOUT'), { code: 'SAP_TIMEOUT' })

/**
 * A fake SAP that remembers every call, moves its own stock and can refuse (`refuse`), throw (`throwWhen`), post and
 * then lose the answer (`postThenThrow`, as a SAP_TIMEOUT after the document exists) or hold its n-th call of a kind
 * open until the test opens the gate (`hold(kind, n)`).
 */
function fakeSap(stock, { writeEnabled = true } = {}) {
  let docs = 0
  const rows = new Map(Object.entries(stock).map(([serial, row]) => [serial, { blocked: false, ...row }]))
  const counts = { lookup: 0, transfer: 0, block: 0 }
  const holds = new Map()
  const call = async (kind, input) => {
    sap.calls.push([kind, input])
    if (sap.throwWhen?.(kind, input)) throw NOT_READY()
    await holds.get(`${kind}#${++counts[kind]}`)
  }
  const sap = {
    writeEnabled,
    calls: [],
    moves: [],
    rows,
    refuse: new Set(),
    throwWhen: null,
    postThenThrow: null,
    hold(kind, n) {
      const held = gate()
      holds.set(`${kind}#${n}`, held.promise)
      return held
    },
    async lookup({ team, serials }) {
      await call('lookup', { team, serials: [...serials] })
      return serials.filter(serial => rows.has(serial)).map(serial => ({ serial, plant: 'D301', userStatus: 'ONHA', ...rows.get(serial) }))
    },
    async transfer({ team, serials, from, to }) {
      await call('transfer', { team, serials: [...serials], from, to })
      if (serials.some(serial => sap.refuse.has(serial))) return { ok: false, message: 'Deficit of SL Unrestricted-use 1 EA' }
      // Like sl-transfer.vbs: nothing moves when a row no longer stands where the plan said.
      if (serials.some(serial => rows.get(serial).sloc !== from)) return { ok: false, message: `Står ikke længere på ${from} i SAP` }
      for (const serial of serials) {
        sap.moves.push({ serial, from: rows.get(serial).sloc, to })
        rows.get(serial).sloc = to
      }
      const posted = `49${String(++docs).padStart(8, '0')}`
      if (sap.postThenThrow?.('transfer', { serials, to })) throw TIMEOUT()
      return { ok: true, doc: posted }
    },
    async block({ material, serials, bwart }) {
      await call('block', { material, serials: [...serials], bwart })
      for (const serial of serials) rows.get(serial).blocked = true
      const posted = `49${String(++docs).padStart(8, '0')}`
      if (sap.postThenThrow?.('block', { material, serials, bwart })) throw TIMEOUT()
      return { ok: true, doc: posted }
    },
  }
  return sap
}

const transfers = sap => sap.calls.filter(([kind]) => kind === 'transfer').map(([, call]) => [call.to, call.serials])
/** Every Transfer SAP made for one serial, as [from, to]; refused calls moved nothing and are left out. */
const movesOf = (sap, serial) => sap.moves.filter(move => move.serial === serial).map(move => [move.from, move.to])
const doc = n => `49${String(n).padStart(8, '0')}`
/** Every line of the search index, by serial and then in the order they were written. */
async function allIndexLines(ctx) {
  const keys = (await ctx.index.keysAsync()).filter(key => key.startsWith('serier-')).sort()
  const files = await Promise.all(keys.map(key => ctx.index.getAsync(key)))
  return files.flatMap(file => file?.lines || []).sort((a, b) => a.serial.localeCompare(b.serial))
}
/** The key of the person's running task. */
const runningKeyOf = user => `aktiv-${crypto.createHash('sha256').update(user.email.toLowerCase()).digest('hex').slice(0, 16)}`
/** The person's running task as saved on M:. */
const savedRunning = (ctx, user) => ctx.storeFor(user.team).getAsync(runningKeyOf(user), { skipCache: true })
/** What the finish screen confirms: the running task and its choices as the preview showed them. */
async function confirmed(ctx, user) {
  const task = await savedRunning(ctx, user)
  return task ? { taskId: task.id, choice: { type: task.type, kif: task.kif, target: task.target, version: task.version } } : {}
}
/** A promise the test releases by hand, to hold a SAP call open. */
function gate() {
  let open
  const promise = new Promise(resolve => { open = resolve })
  return { promise, open }
}
/** Waits until the service has got as far as `ready` says. */
async function until(ready) {
  for (let i = 0; i < 500 && !ready(); i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(ready(), 'the service never got there')
}

function setup({ timeclockRunning = null, sap = { writeEnabled: false }, matdocs, renewClaimMs, sleep = async () => {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'softwareload-'))
  const stores = new Map()
  const storeAt = dir => {
    if (!stores.has(dir)) stores.set(dir, createStore(path.join(root, dir)))
    return stores.get(dir)
  }
  // `faults.venter = n` makes the next n writes to a pending task fail as if M: were gone; `faults.kif` and
  // `faults.versioner` the same for KIF records and the version list. `gates.venter = gate()` holds every write to a
  // pending task until the test opens it, as a slow M:.
  const faults = { venter: 0, kif: 0, versioner: 0 }
  const gates = {}
  const hurdle = async key => {
    const kind = Object.keys(faults).find(prefix => key === prefix || key.startsWith(`${prefix}-`))
    if (kind && gates[kind]) await gates[kind].promise
    if (kind && faults[kind] > 0) {
      faults[kind]--
      throw Object.assign(new Error('M: svarer ikke'), { code: 'STORAGE_UNAVAILABLE' })
    }
  }
  const faulty = store => new Proxy(store, {
    get: (target, name) => {
      if (name === 'mutateAsync') return async (key, change) => { await hurdle(key); return target.mutateAsync(key, change) }
      if (name === 'withLockedKeysAsync') return async (keys, change) => { for (const key of keys) await hurdle(key); return target.withLockedKeysAsync(keys, change) }
      return target[name]
    },
  })
  const journalDir = path.join(root, 'journal')
  // The shared search index records the files a search reads; a key in `unreadableIndex` fails like a broken file.
  const indexReads = []
  const unreadableIndex = new Set()
  const sharedIndex = new Proxy(storeAt(path.join('_lagerstyring', 'softwareload')), {
    get: (target, name) => (name !== 'getAsync' ? target[name] : (key, options) => {
      indexReads.push(key)
      if (unreadableIndex.has(key)) return Promise.reject(new Error('Filen kan ikke læses'))
      return target.getAsync(key, options)
    }),
  })
  // 18 November 2026, 07:00 local time.
  const clock = { now: new Date(2026, 10, 18, 7, 0, 0).getTime() }
  const stops = []
  // Like Stempelkort's stop: it reads past the cache, so it is the only call start may rely on (no status here).
  const timeclock = {
    running: timeclockRunning,
    async stop(user, input) {
      stops.push([user.email, input])
      if (!this.running) throw Object.assign(new Error('Der kører ikke noget ur'), { code: 'TIMECLOCK_NOT_RUNNING' })
      if (this.running.longRun) throw Object.assign(new Error('Uret har kørt i over 10 timer'), { code: 'TIMECLOCK_LONG_RUN' })
      const { taskName } = this.running
      this.running = null
      return { taskName, workedMs: 25 * MIN, pausedMs: 0 }
    },
  }
  let ids = 0
  const service = () => createSoftwareloadService({
    storeFor: team => faulty(storeAt(path.join(team, 'lagerstyring', 'softwareload'))),
    indexStore: sharedIndex,
    sap,
    timeclock,
    now: () => clock.now,
    newId: () => `t${++ids}`,
    matdocs,
    journalDir,
    sleep,
    ...(renewClaimMs ? { renewClaimMs } : {}),
  })
  const storeFor = team => storeAt(path.join(team, 'lagerstyring', 'softwareload'))
  const index = storeAt(path.join('_lagerstyring', 'softwareload'))
  /** The local journal's files: SAP documents not yet saved on M:. */
  const journal = () => (fs.existsSync(journalDir) ? fs.readdirSync(journalDir).filter(name => name.endsWith('.json')) : [])
  /** The finished tasks of one month, whoever wrote them. */
  const finished = async month => {
    const store = storeFor('TCD')
    const keys = (await store.keysAsync()).filter(key => key.startsWith('opgaver-') && key.endsWith(month))
    return Object.assign({}, ...await Promise.all(keys.map(async key => (await store.getAsync(key)).tasks)))
  }
  return { root, clock, timeclock, stops, storeFor, index, indexReads, unreadableIndex, finished, service, faults, gates, journal, tick: ms => { clock.now += ms } }
}

test('start saves type, KIF, target and version, and remembers the version', async () => {
  const ctx = setup()
  const svc = ctx.service()
  const started = await svc.start(ANNA, TASK)
  assert.deepEqual(
    [started.id, started.type, started.kif, started.target, started.version, started.startedAt, started.paused, started.terminals],
    ['t1', 'sw+key', true, 'D006', 'v2.1.3', ctx.clock.now, false, []],
  )
  assert.equal(started.stoppedTimeclock, undefined)
  assert.deepEqual(await svc.versions(ANNA), ['v2.1.3'])
  const status = await svc.status(ANNA)
  assert.deepEqual([status.running.id, status.running.target, status.pending, status.isManager, status.writeEnabled], ['t1', 'D006', [], false, false])
})

test('start never fails after the task is saved: the version list is best effort', async () => {
  const ctx = setup()
  const svc = ctx.service()
  ctx.faults.versioner = 1
  const started = await svc.start(ANNA, TASK)
  assert.equal(started.id, 't1')
  assert.equal((await svc.status(ANNA)).running.id, 't1')
  assert.deepEqual(await svc.versions(ANNA), [])
})

test('start refuses an unknown type, an invalid target and an empty version', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await assert.rejects(svc.start(ANNA, { ...TASK, type: 'firmware' }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(svc.start(ANNA, { ...TASK, target: 'D5' }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(svc.start(ANNA, { ...TASK, version: '   ' }), { code: 'SOFTWARELOAD_INVALID' })
  assert.equal((await svc.status(ANNA)).running, null)
  assert.deepEqual(await svc.versions(ANNA), [])
})

test('start refuses a target outside the list, e.g. D102', async () => {
  const ctx = setup()
  const svc = ctx.service()
  for (const target of ['D102', 'D106', 'D007', 'X000']) {
    await assert.rejects(svc.start(ANNA, { ...TASK, target }), { code: 'SOFTWARELOAD_INVALID', message: 'Vælg en lokation fra listen' })
  }
  assert.equal((await svc.status(ANNA)).running, null)
  const started = await svc.start(ANNA, { ...TASK, target: ' d002 ' })
  assert.equal(started.target, 'D002')
})

test('the target list is the seven SAP locations with description and team, frozen', () => {
  const { SOFTWARELOAD_TARGETS, isSoftwareloadTarget } = require('./core/targets.cjs')
  assert.deepEqual(SOFTWARELOAD_TARGETS.map(item => [item.sloc, item.description, item.team]), [
    ['D000', 'Central Warehous', 'TCD'],
    ['D001', 'Raw Terminals', 'TRR'],
    ['D002', 'Repair', 'TRR'],
    ['D003', 'SWAP Inbound', 'TRR'],
    ['D004', 'SWAP Outbound', 'TCD'],
    ['D005', 'SA \u2013 secure room', 'TCD'],
    ['D006', 'Forecast Prep', 'TCD'],
  ])
  assert.ok(Object.isFrozen(SOFTWARELOAD_TARGETS) && SOFTWARELOAD_TARGETS.every(Object.isFrozen))
  assert.deepEqual(['D000', 'D006', 'd003', 'D102', '', null].map(isSoftwareloadTarget), [true, true, false, false, false, false])
})

test('start stops a running Stempelkort task and reports it', async () => {
  const ctx = setup({ timeclockRunning: { taskName: 'Pakning' } })
  const started = await ctx.service().start(ANNA, TASK)
  assert.deepEqual(ctx.stops, [[ANNA.email, {}]])
  assert.deepEqual(started.stoppedTimeclock, { taskName: 'Pakning', workedMs: 25 * MIN })
  assert.equal(started.target, 'D006')
  assert.equal(ctx.timeclock.running, null)
})

test('start when Stempelkort was already stopped on another PC still starts', async () => {
  const ctx = setup()
  const started = await ctx.service().start(ANNA, TASK)
  assert.deepEqual(ctx.stops, [[ANNA.email, {}]])
  assert.equal(started.stoppedTimeclock, undefined)
  assert.equal((await ctx.service().status(ANNA)).running.id, 't1')
})

test('start refuses when Stempelkort has run over 10 hours and leaves both untouched', async () => {
  const ctx = setup({ timeclockRunning: { taskName: 'Pakning', longRun: true } })
  const svc = ctx.service()
  await assert.rejects(svc.start(ANNA, TASK), { code: 'SOFTWARELOAD_TIMECLOCK_LONG_RUN' })
  assert.equal((await svc.status(ANNA)).running, null)
  assert.deepEqual(ctx.timeclock.running, { taskName: 'Pakning', longRun: true }, 'Stempelkort keeps running')
  assert.deepEqual(await svc.versions(ANNA), [])
})

test('a second start while one runs is refused', async () => {
  const ctx = setup()
  await ctx.service().start(ANNA, TASK)
  ctx.timeclock.running = { taskName: 'Pakning' }
  await assert.rejects(ctx.service().start(ANNA, { ...TASK, version: 'v3' }), { code: 'SOFTWARELOAD_RUNNING' })
  assert.equal(ctx.stops.length, 1, 'a refused start does not call Stempelkort')
  assert.deepEqual(ctx.timeclock.running, { taskName: 'Pakning' }, 'a refused start leaves Stempelkort running')
  assert.equal((await ctx.service().status(ANNA)).running.version, 'v2.1.3')
})

test('scan normalizes and refuses duplicates', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await assert.rejects(svc.scan(ANNA, { serial: 'ABC123', taskId: 't1' }), { code: 'SOFTWARELOAD_NOT_RUNNING' })
  await svc.start(ANNA, TASK)
  assert.deepEqual(await svc.scan(ANNA, { serial: ' abc123 ', taskId: 't1' }), { serial: 'ABC123', count: 1 })
  await assert.rejects(svc.scan(ANNA, { serial: 'ABC123', taskId: 't1' }), { code: 'SOFTWARELOAD_DUPLICATE' })
  await assert.rejects(svc.scan(ANNA, { serial: '  ', taskId: 't1' }), { code: 'SOFTWARELOAD_INVALID' })
  ctx.tick(MIN)
  assert.deepEqual(await svc.scan(ANNA, { serial: 'xyz9', taskId: 't1' }), { serial: 'XYZ9', count: 2 })
  const { running } = await svc.status(ANNA)
  assert.deepEqual(running.terminals.map(terminal => terminal.serial), ['XYZ9', 'ABC123'], 'newest scan first')
  assert.deepEqual(await svc.unscan(ANNA, { serial: 'abc123', taskId: 't1' }), { serial: 'ABC123', count: 1 })
  assert.deepEqual((await svc.status(ANNA)).running.terminals.map(terminal => terminal.serial), ['XYZ9'])
})

test('a scan or unscan for another task than the running one is refused and never lands in it', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await svc.start(ANNA, TASK)
  await svc.scan(ANNA, { serial: 'OLD1', taskId: 't1' })
  await svc.cancel(ANNA)
  await svc.start(ANNA, { ...TASK, version: 'v3' })
  await svc.scan(ANNA, { serial: 'NEW1', taskId: 't2' })
  await assert.rejects(svc.scan(ANNA, { serial: 'OLD2', taskId: 't1' }), { code: 'SOFTWARELOAD_NOT_RUNNING' })
  await assert.rejects(svc.scan(ANNA, { serial: 'OLD3' }), { code: 'SOFTWARELOAD_NOT_RUNNING' }, 'a scan must name its task')
  await assert.rejects(svc.unscan(ANNA, { serial: 'NEW1', taskId: 't1' }), { code: 'SOFTWARELOAD_NOT_RUNNING' })
  assert.deepEqual((await svc.status(ANNA)).running.terminals.map(terminal => terminal.serial), ['NEW1'])
})

test('a failed terminal needs a note and can be undone', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await svc.start(ANNA, TASK)
  await svc.scan(ANNA, { serial: 'ABC123', taskId: 't1' })
  await assert.rejects(svc.markFailed(ANNA, { serial: 'ABC123', note: '  ' }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(svc.markFailed(ANNA, { serial: 'NOPE1', note: 'Skærm død' }), { code: 'SOFTWARELOAD_INVALID' })
  const marked = await svc.markFailed(ANNA, { serial: 'abc123', note: ' Skærm   død ' })
  assert.deepEqual(marked.terminals[0].failed, { note: 'Skærm død' })
  assert.deepEqual((await svc.status(ANNA)).running.terminals[0].failed, { note: 'Skærm død' })
  const unmarked = await svc.unmarkFailed(ANNA, { serial: 'ABC123' })
  assert.equal(unmarked.terminals[0].failed, undefined)
  assert.equal((await svc.status(ANNA)).running.terminals[0].failed, undefined)
})

test('pause and resume, and pauseIfRunning never throws', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await assert.doesNotReject(svc.pauseIfRunning(ANNA))
  await assert.rejects(svc.pause(ANNA), { code: 'SOFTWARELOAD_NOT_RUNNING' })
  await svc.start(ANNA, TASK)
  ctx.tick(30 * MIN)
  assert.equal((await svc.pause(ANNA)).paused, true)
  await assert.rejects(svc.pause(ANNA), { code: 'SOFTWARELOAD_PAUSED' })
  ctx.tick(15 * MIN)
  const resumed = await svc.resume(ANNA)
  assert.deepEqual([resumed.paused, resumed.pausedMs, resumed.workedMs], [false, 15 * MIN, 30 * MIN])
  await assert.rejects(svc.resume(ANNA), { code: 'SOFTWARELOAD_NOT_PAUSED' })
  ctx.tick(10 * MIN)
  await svc.pauseIfRunning(ANNA)
  await assert.doesNotReject(svc.pauseIfRunning(ANNA), 'already paused')
  ctx.tick(5 * MIN)
  const { running } = await svc.status(ANNA)
  assert.deepEqual([running.paused, running.pausedMs, running.workedMs], [true, 20 * MIN, 40 * MIN])
  await svc.cancel(ANNA)
  assert.equal((await svc.status(ANNA)).running, null)
  await assert.rejects(svc.cancel(ANNA), { code: 'SOFTWARELOAD_NOT_RUNNING' })
})

test('resuming the task stops a running Stempelkort like start does, and refuses after 10 hours', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await svc.start(ANNA, TASK)
  await svc.pause(ANNA)
  ctx.timeclock.running = { taskName: 'Pakning' }
  ctx.stops.length = 0
  const resumed = await svc.resume(ANNA)
  assert.deepEqual(ctx.stops, [[ANNA.email, {}]])
  assert.deepEqual([resumed.paused, resumed.stoppedTimeclock], [false, { taskName: 'Pakning', workedMs: 25 * MIN }])
  assert.equal(ctx.timeclock.running, null)

  await assert.rejects(svc.resume(ANNA), { code: 'SOFTWARELOAD_NOT_PAUSED' })
  assert.equal(ctx.stops.length, 1, 'a refused resume leaves Stempelkort alone')
  await svc.pause(ANNA)
  ctx.timeclock.running = { taskName: 'Pakning', longRun: true }
  await assert.rejects(svc.resume(ANNA), { code: 'SOFTWARELOAD_TIMECLOCK_LONG_RUN' })
  assert.equal((await svc.status(ANNA)).running.paused, true, 'the task stays on its break')
})

test('another person cannot see or change my running task', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await svc.start(BO, TASK)
  await svc.scan(BO, { serial: 'ABC123', taskId: 't1' })
  assert.equal((await svc.status(ANNA)).running, null)
  await assert.rejects(svc.scan(ANNA, { serial: 'XYZ9', taskId: 't1' }), { code: 'SOFTWARELOAD_NOT_RUNNING' })
  await assert.rejects(svc.markFailed(ANNA, { serial: 'ABC123', note: 'Død' }), { code: 'SOFTWARELOAD_NOT_RUNNING' })
  await assert.rejects(svc.cancel(ANNA), { code: 'SOFTWARELOAD_NOT_RUNNING' })
  const started = await svc.start(ANNA, { ...TASK, version: 'v3' })
  assert.deepEqual(started.terminals, [])
  assert.deepEqual((await svc.status(BO)).running.terminals.map(terminal => terminal.serial), ['ABC123'])
  assert.deepEqual(await svc.versions(BO), ['v3', 'v2.1.3'], 'versions are shared by the team, newest first')

  await ctx.storeFor('TCD').setAsync('venter-old', { id: 'old', email: 'bo@example.test', name: 'Bo', endedAt: 5, terminals: { A1: { at: 1 }, B2: { at: 2 } } })
  assert.deepEqual((await svc.status(ANNA)).pending, [], 'a task waiting for SAP is shown to its owner and managers only')
  assert.deepEqual((await svc.status(BO)).pending, [{ id: 'old', name: 'Bo', email: 'bo@example.test', endedAt: 5, count: 2 }])
  assert.deepEqual((await svc.status(MONA)).pending.map(task => task.id), ['old'])
})

/** Starts Anna's task and scans the serials; `failed` maps a serial to its note. */
async function startWith(ctx, task, serials, failed = {}) {
  const svc = ctx.service()
  const started = await svc.start(ANNA, task)
  for (const serial of serials) await svc.scan(ANNA, { serial, taskId: started.id })
  for (const [serial, note] of Object.entries(failed)) await svc.markFailed(ANNA, { serial, note })
  return svc
}

test('preview plans the moves without changing anything', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } }, { writeEnabled: false })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A', 'B'])
  const preview = await svc.preview(ANNA)
  assert.deepEqual(preview.outcomes, { A: 'to-target', B: 'not-found' })
  assert.deepEqual(preview.transfers, [{ wave: 1, from: 'D000', to: 'D005', serials: ['A'] }, { wave: 2, from: 'D005', to: 'D006', serials: ['A'] }])
  assert.deepEqual([preview.blocks, preview.rows.map(row => row.serial)], [[], ['A']])
  assert.deepEqual(sap.calls, [['lookup', { team: 'TCD', serials: ['A', 'B'] }]])
  const status = await svc.status(ANNA)
  assert.deepEqual([status.running.id, status.running.terminals.length, status.pending], ['t1', 2, []])
})

test('edit changes type, KIF, target and version of the running task and keeps the history', async () => {
  const ctx = setup()
  const svc = await startWith(ctx, TASK, ['A'])
  ctx.tick(5 * MIN)
  const editedAt = ctx.clock.now
  const edited = await svc.edit(ANNA, { type: 'sw', kif: false, target: ' d002 ', version: ' v3.0 ', taskId: 't1' })
  assert.deepEqual(
    [edited.id, edited.type, edited.kif, edited.target, edited.version, edited.startedAt, edited.terminals.map(terminal => terminal.serial)],
    ['t1', 'sw', false, 'D002', 'v3.0', editedAt - 5 * MIN, ['A']],
  )
  const { running } = await svc.status(ANNA)
  assert.deepEqual([running.type, running.kif, running.target, running.version], ['sw', false, 'D002', 'v3.0'])
  assert.deepEqual((await savedRunning(ctx, ANNA)).edits, [{
    at: editedAt, by: 'anna@example.test',
    from: { type: 'sw+key', kif: true, target: 'D006', version: 'v2.1.3' },
    to: { type: 'sw', kif: false, target: 'D002', version: 'v3.0' },
  }])
  assert.deepEqual(await svc.versions(ANNA), ['v3.0', 'v2.1.3'], 'the new version is a suggestion too')

  ctx.tick(MIN)
  const same = await svc.edit(ANNA, { type: 'sw', target: 'D002', version: 'v3.0', taskId: 't1' })
  assert.equal(same.target, 'D002')
  assert.equal((await savedRunning(ctx, ANNA)).edits.length, 1, 'no change writes nothing')

  await svc.edit(ANNA, { type: 'key', kif: true, target: 'D002', version: 'v3.0', taskId: 't1' })
  const { edits } = await savedRunning(ctx, ANNA)
  assert.deepEqual(edits.map(item => [item.at, item.from.type, item.from.kif, item.to.type, item.to.kif]), [[editedAt, 'sw+key', true, 'sw', false], [ctx.clock.now, 'sw', false, 'key', true]])
})

test('edit refuses a target outside the list and an empty version', async () => {
  const ctx = setup()
  const svc = await startWith(ctx, TASK, [])
  for (const target of ['D102', 'D5', '']) {
    await assert.rejects(svc.edit(ANNA, { ...TASK, target, taskId: 't1' }), { code: 'SOFTWARELOAD_INVALID', message: 'Vælg en lokation fra listen' })
  }
  await assert.rejects(svc.edit(ANNA, { ...TASK, version: '   ', taskId: 't1' }), { code: 'SOFTWARELOAD_INVALID', message: 'Skriv softwareversionen' })
  await assert.rejects(svc.edit(ANNA, { ...TASK, type: 'firmware', taskId: 't1' }), { code: 'SOFTWARELOAD_INVALID' })
  const saved = await savedRunning(ctx, ANNA)
  assert.deepEqual([saved.type, saved.kif, saved.target, saved.version, saved.edits], ['sw+key', true, 'D006', 'v2.1.3', undefined])
  assert.deepEqual(await svc.versions(ANNA), ['v2.1.3'])
})

test('edit without a running task is refused, and a pending task cannot be edited', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  sap.throwWhen = kind => kind === 'lookup'
  const ctx = setup({ sap })
  const svc = ctx.service()
  await assert.rejects(svc.edit(ANNA, { ...TASK, version: 'v3' }), { code: 'SOFTWARELOAD_NOT_RUNNING' })
  await svc.start(BO, TASK)
  await assert.rejects(svc.edit(ANNA, { ...TASK, version: 'v3' }), { code: 'SOFTWARELOAD_NOT_RUNNING' }, 'another person\'s task is not mine to edit')
  assert.equal((await svc.status(BO)).running.version, 'v2.1.3')

  await svc.start(ANNA, TASK)
  await svc.scan(ANNA, { serial: 'A', taskId: 't2' })
  await assert.rejects(svc.edit(ANNA, { ...TASK, target: 'D004' }), { code: 'SOFTWARELOAD_NOT_RUNNING' }, 'an edit must name its task')
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  await assert.rejects(svc.edit(ANNA, { ...TASK, target: 'D004', taskId: 't2' }), { code: 'SOFTWARELOAD_NOT_RUNNING' })
  const pending = await ctx.storeFor('TCD').getAsync('venter-t2', { skipCache: true })
  assert.deepEqual([pending.target, pending.edits], ['D006', undefined])

  await svc.start(ANNA, { ...TASK, version: 'v4' })
  await assert.rejects(svc.edit(ANNA, { ...TASK, target: 'D004', taskId: 't2' }), { code: 'SOFTWARELOAD_NOT_RUNNING' }, 'an edit for an ended task never lands in the next one')
  assert.equal((await svc.status(ANNA)).running.target, 'D006')
})

test('finish uses the edited target and KIF', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  await svc.edit(ANNA, { type: 'sw', kif: false, target: 'D004', version: 'v3', taskId: 't1' })
  const result = await svc.finish(ANNA, await confirmed(ctx, ANNA))
  assert.deepEqual(transfers(sap), [['D004', ['A']]], 'outside KIF: straight to the new target, not via D005')
  assert.deepEqual(result.counts, { 'to-target': 1 })
  const task = (await ctx.finished('2026-11')).t1
  assert.deepEqual([task.type, task.kif, task.target, task.version, task.edits.length], ['sw', false, 'D004', 'v3', 1])
  const [line] = await allIndexLines(ctx)
  assert.deepEqual([line.type, line.kif, line.version, line.to], ['sw', false, 'v3', 'D004'])

  sap.calls.length = 0
  const started = await svc.start(ANNA, { ...TASK, kif: false })
  await svc.scan(ANNA, { serial: 'B', taskId: started.id })
  await svc.edit(ANNA, { ...TASK, kif: true, taskId: started.id })
  await svc.finish(ANNA, await confirmed(ctx, ANNA))
  assert.deepEqual(transfers(sap), [['D005', ['B']], ['D006', ['B']]], 'put in KIF afterwards: the whole task goes via D005')
})

test('an edit between the preview and the confirmation is refused at finish, and nothing moves in SAP', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  const preview = await svc.preview(ANNA)
  assert.deepEqual([preview.taskId, preview.choice], ['t1', { type: 'sw+key', kif: true, target: 'D006', version: 'v2.1.3' }])
  await ctx.service().edit(ANNA, { ...TASK, kif: false, target: 'D004', taskId: 't1' })

  await assert.rejects(svc.finish(ANNA, { taskId: preview.taskId, choice: preview.choice }), { code: 'SOFTWARELOAD_CHANGED', message: 'Opgaven er rettet imens. Se oversigten igen' })
  assert.deepEqual(transfers(sap), [])
  const { running, pending } = await svc.status(ANNA)
  assert.deepEqual([running.id, running.paused, running.kif, running.target, pending], ['t1', false, false, 'D004', []], 'the time still runs')
  assert.equal((await savedRunning(ctx, ANNA)).finishing, undefined, 'a refused finish marks nothing')
  await assert.rejects(svc.finish(ANNA, { taskId: 't9', choice: { ...preview.choice, kif: false, target: 'D004' } }), { code: 'SOFTWARELOAD_CHANGED' }, 'another task')
  await assert.rejects(svc.finish(ANNA, {}), { code: 'SOFTWARELOAD_CHANGED' }, 'nothing confirmed')

  const again = await svc.preview(ANNA)
  const result = await svc.finish(ANNA, { taskId: again.taskId, choice: again.choice })
  assert.deepEqual([result.state, transfers(sap)], ['faerdig', [['D004', ['A']]]])
})

test('a task being finished takes no edit, scan or cancel from another PC, so nothing is lost', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  const otherPc = ctx.service()
  const slowDrive = gate()
  ctx.gates.venter = slowDrive
  const finishing = svc.finish(ANNA, await confirmed(ctx, ANNA))
  for (let i = 0; i < 300 && !(await savedRunning(ctx, ANNA)).finishing; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok((await savedRunning(ctx, ANNA)).finishing, 'the running task is marked before it is handed to SAP')

  const busy = { code: 'SOFTWARELOAD_BUSY', message: /^Opgaven er ved at blive afsluttet/ }
  await assert.rejects(otherPc.edit(ANNA, { ...TASK, target: 'D004', taskId: 't1' }), busy)
  await assert.rejects(otherPc.scan(ANNA, { serial: 'B', taskId: 't1' }), busy)
  await assert.rejects(otherPc.markFailed(ANNA, { serial: 'A', note: 'Død' }), busy)
  await assert.rejects(otherPc.cancel(ANNA), busy)
  await assert.rejects(otherPc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SOFTWARELOAD_BUSY', message: 'Opgaven er allerede ved at blive afsluttet' })
  assert.equal(await otherPc.pauseIfRunning(ANNA), null)

  delete ctx.gates.venter
  slowDrive.open()
  const result = await finishing
  assert.deepEqual([result.state, Object.keys(result.results), transfers(sap)], ['faerdig', ['A'], [['D005', ['A']], ['D006', ['A']]]])
  const task = (await ctx.finished('2026-11')).t1
  assert.deepEqual([task.target, task.edits, task.pauses, 'finishing' in task], ['D006', undefined, [], false])
  assert.equal(await savedRunning(ctx, ANNA), undefined)
})

test('a finish that stops before the task waits for SAP takes its mark off, and a mark left behind runs out', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  ctx.faults.venter = 1
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'STORAGE_UNAVAILABLE' })
  assert.equal((await savedRunning(ctx, ANNA)).finishing, undefined)
  assert.deepEqual((await svc.status(ANNA)).pending, [])
  assert.deepEqual(await svc.scan(ANNA, { serial: 'B', taskId: 't1' }), { serial: 'B', count: 2 }, 'the task goes on')

  // A PC that stopped between the mark and the hand-over leaves the mark; finish and cancel wait for it to run out.
  await svc.pause(ANNA)
  const markedAt = ctx.clock.now
  await ctx.storeFor('TCD').mutateAsync(runningKeyOf(ANNA), task => ({ ...task, finishing: { at: markedAt, runId: 'gone' } }))
  ctx.timeclock.running = { taskName: 'Pakning' }
  ctx.stops.length = 0
  await assert.rejects(svc.resume(ANNA), { code: 'SOFTWARELOAD_BUSY', message: /Venter på SAP/ })
  assert.deepEqual([ctx.stops, ctx.timeclock.running], [[], { taskName: 'Pakning' }], 'a refused resume leaves Stempelkort running')
  await assert.rejects(svc.scan(ANNA, { serial: 'C', taskId: 't1' }), { code: 'SOFTWARELOAD_BUSY' })
  await assert.rejects(svc.cancel(ANNA), { code: 'SOFTWARELOAD_BUSY' })
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SOFTWARELOAD_BUSY' })
  ctx.tick(CLAIM_MS)
  ctx.faults.venter = 1
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'STORAGE_UNAVAILABLE' })
  assert.deepEqual((await savedRunning(ctx, ANNA)).finishing, { at: markedAt, runId: 'gone' }, 'a failed finish gives back the mark it found, never clears it')
  ctx.tick(10 * MIN)
  const result = await svc.finish(ANNA, await confirmed(ctx, ANNA))
  assert.deepEqual([result.state, Object.keys(result.results).sort()], ['faerdig', ['A', 'B']])
  const task = (await ctx.finished('2026-11')).t1
  assert.deepEqual([task.endedAt, task.workedMs, 'finishing' in task], [markedAt, markedAt - task.startedAt, false], 'the time stopped when the first finish marked the task')
})

test('a running file left next to a task already handed over to SAP is retired, and the task is never moved again', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  sap.throwWhen = kind => kind === 'lookup'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  const before = await savedRunning(ctx, ANNA)
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  // The PC crashed after writing venter-t1 and before deleting the running file.
  const leaveBehind = () => ctx.storeFor('TCD').setAsync(runningKeyOf(ANNA), { ...before, finishing: { at: ctx.clock.now, runId: 'crashed' } })
  await leaveBehind()
  ctx.tick(CLAIM_MS)
  sap.throwWhen = null
  sap.calls.length = 0
  const finishAgain = { taskId: 't1', choice: { type: 'sw+key', kif: true, target: 'D006', version: 'v2.1.3' } }
  await assert.rejects(svc.finish(ANNA, finishAgain), { code: 'SOFTWARELOAD_ALREADY_FINISHED', message: 'Opgaven er allerede afsluttet. Se Venter på SAP eller statistikken' })
  assert.deepEqual(sap.calls, [])
  assert.equal(await savedRunning(ctx, ANNA), undefined, 'the leftover running file is gone')
  assert.equal((await ctx.storeFor('TCD').getAsync('venter-t1', { skipCache: true })).claim, undefined, 'the pending task is untouched')

  await leaveBehind()
  const status = await svc.status(ANNA)
  assert.deepEqual([status.running, status.pending.map(task => task.id)], [null, ['t1']], 'the screen shows it waiting for SAP, not running')
  assert.equal(await savedRunning(ctx, ANNA), undefined)

  // Continued and finished from Venter på SAP; a leftover after that is retired too, and the documents stay.
  const done = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(transfers(sap), [['D005', ['A']], ['D006', ['A']]])
  await leaveBehind()
  sap.calls.length = 0
  await assert.rejects(svc.finish(ANNA, finishAgain), { code: 'SOFTWARELOAD_ALREADY_FINISHED' })
  assert.deepEqual(sap.calls, [], 'never D006 to D005 and back again')
  assert.equal(await savedRunning(ctx, ANNA), undefined)
  assert.equal(await ctx.storeFor('TCD').getAsync('venter-t1', { skipCache: true }), undefined, 'no new pending task')
  assert.deepEqual((await ctx.finished('2026-11')).t1.results.A.steps.map(step => step.doc), done.results.A.steps.map(step => step.doc))
  assert.deepEqual((await allIndexLines(ctx)).map(line => line.docs), [[doc(1), doc(2)]])
})

test('finish in KIF moves via D005 and records every document per serial', async () => {
  const sap = fakeSap({ A: { material: 'M-0', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A', 'B'])
  ctx.tick(30 * MIN)
  const endedAt = ctx.clock.now
  const progress = []
  const result = await svc.finish(ANNA, { ...await confirmed(ctx, ANNA), onProgress: item => progress.push(item) })

  assert.deepEqual(sap.calls[0], ['lookup', { team: 'TCD', serials: ['A', 'B'] }])
  assert.deepEqual(transfers(sap), [['D005', ['A', 'B']], ['D006', ['A', 'B']]])
  assert.deepEqual(result.results.A.steps.map(step => step.to), ['D005', 'D006'])
  assert.deepEqual(result.results.A.steps[0], { from: 'D000', to: 'D005', doc: doc(1), by: 'anna@example.test', at: endedAt })
  assert.deepEqual([result.results.B.material, result.results.B.from, result.results.B.outcome], ['M-R', 'D000', 'to-target'])
  assert.deepEqual([result.taskId, result.state, result.counts], ['t1', 'faerdig', { 'to-target': 2 }])
  assert.deepEqual(progress[0], { done: 0, total: 2, step: 'lookup' })
  assert.deepEqual(progress.at(-1), { done: 4, total: 4, step: 'transfer' })

  const status = await svc.status(ANNA)
  assert.deepEqual([status.running, status.pending], [null, []])
  const task = (await ctx.finished('2026-11')).t1
  assert.deepEqual([task.state, task.email, task.endedAt, task.workedMs, task.results.A.steps.length], ['faerdig', 'anna@example.test', endedAt, 30 * MIN, 2])
  const lines = await allIndexLines(ctx)
  assert.deepEqual(lines.map(line => [line.serial, line.kind, line.team]), [['A', 'load', 'TCD'], ['B', 'load', 'TCD']])
  assert.deepEqual(lines[0], {
    serial: 'A', team: 'TCD', kind: 'load', taskId: 't1', email: 'anna@example.test', name: 'Anna', at: endedAt,
    type: 'sw+key', version: 'v2.1.3', kif: true, from: 'D000', to: 'D006', docs: [doc(1), doc(2)], outcome: 'to-target',
  })
})

test('a failed new terminal ends in blocked stock with its note in the index', async () => {
  const sap = fakeSap({ A: { material: 'M-0', sloc: 'D006' }, B: { material: 'M-0', sloc: 'D006' } })
  const ctx = setup({ sap })
  ctx.clock.now = new Date(2026, 10, 30, 23, 50).getTime()
  const svc = await startWith(ctx, { ...TASK, kif: false }, ['A', 'B'], { A: 'Skærm død' })
  ctx.tick(20 * MIN)
  const result = await svc.finish(ANNA, await confirmed(ctx, ANNA))

  assert.deepEqual(transfers(sap), [['D000', ['A']]])
  assert.deepEqual(sap.calls.at(-1), ['block', { material: 'M-0', serials: ['A'], bwart: '344' }])
  assert.deepEqual(result.results.A.steps.at(-1), { bwart: '344', doc: doc(2), by: 'anna@example.test', at: ctx.clock.now })
  assert.deepEqual(result.counts, { 'to-blocked': 1, skipped: 1 })
  assert.ok((await ctx.finished('2026-11')).t1, 'the task is kept in the month it started')
  const lines = await allIndexLines(ctx)
  assert.deepEqual(
    lines.map(line => [line.serial, line.outcome, line.from, line.to, line.docs, line.note]),
    [['A', 'to-blocked', 'D006', 'D000', [doc(1), doc(2)], 'Skærm død'], ['B', 'skipped', 'D006', null, [], undefined]],
  )
  assert.equal('note' in lines[1], false)
})

test('one serial SAP refuses is isolated and the rest still move', async () => {
  const sap = fakeSap(Object.fromEntries(['A', 'B', 'C', 'D'].map(serial => [serial, { material: 'M-R', sloc: 'D001' }])))
  sap.refuse.add('C')
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A', 'B', 'C', 'D'])
  const result = await svc.finish(ANNA, await confirmed(ctx, ANNA))

  assert.deepEqual(transfers(sap), [
    ['D005', ['A', 'B', 'C', 'D']], ['D005', ['A']], ['D005', ['B', 'C', 'D']], ['D005', ['B', 'C']], ['D005', ['B']], ['D005', ['C']], ['D005', ['D']],
    ['D006', ['A', 'B', 'D']],
  ], 'C never reaches the target around D005')
  assert.deepEqual([result.results.C.outcome, result.results.C.message, result.results.C.steps], ['failed-sap', 'Deficit of SL Unrestricted-use 1 EA', []])
  assert.deepEqual(['A', 'B', 'D'].map(serial => result.results[serial].outcome), ['to-target', 'to-target', 'to-target'])
  assert.deepEqual(result.results.D.steps.map(step => step.doc), [doc(3), doc(4)])
  assert.deepEqual(result.counts, { 'to-target': 3, 'failed-sap': 1 })
  const lines = await allIndexLines(ctx)
  assert.deepEqual(lines.find(line => line.serial === 'C'), {
    serial: 'C', team: 'TCD', kind: 'load', taskId: 't1', email: 'anna@example.test', name: 'Anna', at: ctx.clock.now,
    type: 'sw+key', version: 'v2.1.3', kif: true, from: 'D001', to: null, docs: [], outcome: 'failed-sap',
  })
})

test('a terminal moved by someone else after the lookup is refused by the Transfer and the rest still move', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A', 'B'])
  const held = sap.hold('transfer', 1)
  const running = svc.finish(ANNA, await confirmed(ctx, ANNA))
  await until(() => transfers(sap).length === 1)
  sap.rows.get('B').sloc = 'D002'
  held.open()
  const result = await running
  assert.deepEqual(sap.calls.filter(([kind]) => kind === 'transfer').map(([, call]) => [call.from, call.to, call.serials]), [
    ['D000', 'D005', ['A', 'B']], ['D000', 'D005', ['A']], ['D000', 'D005', ['B']], ['D005', 'D006', ['A']],
  ])
  assert.deepEqual([result.results.B.outcome, result.results.B.message], ['failed-sap', 'Står ikke længere på D000 i SAP'])
  assert.equal(result.results.A.outcome, 'to-target')
})

/** Makes every Transfer leave M: failing for the next `n` writes of `kind`, as if the drive went away right after SAP posted. */
function dropDriveAfterTransfer(sap, ctx, kind, n) {
  const transfer = sap.transfer
  sap.transfer = async input => {
    const answer = await transfer(input)
    ctx.faults[kind] = n
    return answer
  }
  return () => { sap.transfer = transfer }
}

test('saving a SAP document on M: is tried again before it fails', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, ['A'])
  dropDriveAfterTransfer(sap, ctx, 'venter', 4)
  const result = await svc.finish(ANNA, await confirmed(ctx, ANNA))
  assert.deepEqual(result.results.A.steps.map(step => step.doc), [doc(1)])
  assert.deepEqual(ctx.journal(), [])
})

test('a SAP document M: would not take is kept on this PC, named in the error and merged before the task goes on', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  const restore = dropDriveAfterTransfer(sap, ctx, 'venter', 5)
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SOFTWARELOAD_SAVE_FAILED', message: new RegExp(doc(1)) })
  assert.equal(ctx.journal().length, 1)
  restore()

  const pending = (await svc.status(ANNA)).pending
  assert.deepEqual(pending.map(task => task.id), ['t1'])
  assert.deepEqual(ctx.journal(), [], 'the status merged the journal into the task')
  const saved = await ctx.storeFor('TCD').getAsync('venter-t1', { skipCache: true })
  assert.deepEqual([saved.results.A.steps.map(step => [step.to, step.doc]), 'uncertain' in saved.results.A], [[['D005', doc(1)]], false])

  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(transfers(sap), [['D005', ['A']], ['D006', ['A']]], 'never moved to D005 twice')
  assert.deepEqual(result.results.A.steps.map(step => [step.to, step.doc, step.unverified]), [['D005', doc(1), undefined], ['D006', doc(2), undefined]])
})

test('a status while a SAP document is still on its way to M: leaves it to the run, so it is saved once', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const pause = gate()
  let paused = false
  const ctx = setup({ sap, sleep: async () => { paused = true; await pause.promise } })
  const svc = await startWith(ctx, TASK, ['A'])
  const restore = dropDriveAfterTransfer(sap, ctx, 'venter', 1)
  const running = svc.finish(ANNA, await confirmed(ctx, ANNA))
  await until(() => paused)
  restore()
  await svc.status(ANNA)
  assert.equal(ctx.journal().length, 1, 'the entry of the running save is left alone')
  pause.open()
  const result = await running
  assert.deepEqual(result.results.A.steps.map(step => [step.to, step.doc]), [['D005', doc(1)], ['D006', doc(2)]])
  assert.deepEqual(ctx.journal(), [])
})

test('continue merges the journal itself when no status came first', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  const restore = dropDriveAfterTransfer(sap, ctx, 'venter', 5)
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SOFTWARELOAD_SAVE_FAILED' })
  restore()
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(result.results.A.steps.map(step => [step.to, step.doc, step.unverified]), [['D005', doc(1), undefined], ['D006', doc(2), undefined]])
  assert.deepEqual(ctx.journal(), [])
})

test('a KIF move whose record M: would not take keeps it on this PC and saves and indexes it later', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' } })
  const ctx = setup({ sap })
  const svc = ctx.service()
  const at = ctx.clock.now
  const restore = dropDriveAfterTransfer(sap, ctx, 'kif', 100)
  await assert.rejects(svc.kifMove(ANNA, { serials: ['A'] }), { code: 'SOFTWARELOAD_SAVE_FAILED', message: new RegExp(doc(1)) })
  assert.equal(ctx.journal().length, 1)
  restore()
  ctx.faults.kif = 0

  await svc.status(ANNA)
  assert.deepEqual(ctx.journal(), [])
  const { results } = (await ctx.storeFor('TCD').getAsync('kif-2026-11')).moves.t1
  assert.deepEqual(results.A.steps, [{ from: 'D001', to: 'D005', doc: doc(1), by: 'anna@example.test', at }])
  assert.deepEqual((await svc.search(TRINE, { serial: 'A' })).lines.map(line => [line.kind, line.to, line.docs]), [['kif', 'D005', [doc(1)]]])
})

test('SAP refusing a whole group for one shared reason stops after a few calls and leaves the task pending', async () => {
  const { TRANSFER_CHUNK } = require('./softwareloadSap.cjs')
  const serials = Array.from({ length: TRANSFER_CHUNK }, (_, i) => `R${i}`)
  const sap = fakeSap(Object.fromEntries(serials.map(serial => [serial, { material: 'M-R', sloc: 'D001' }])))
  for (const serial of serials) sap.refuse.add(serial)
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, [])
  const store = ctx.storeFor('TCD')
  const [key] = (await store.keysAsync()).filter(name => name.startsWith('aktiv-'))
  await store.mutateAsync(key, task => ({ ...task, terminals: Object.fromEntries(serials.map(serial => [serial, { at: 1 }])) }))
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SOFTWARELOAD_SAP_FAILED', message: /Deficit of SL Unrestricted-use 1 EA/ })
  assert.ok(transfers(sap).length <= 4, `${transfers(sap).length} Transfers`)
  assert.deepEqual((await svc.status(ANNA)).pending.map(task => task.id), ['t1'], 'the task waits to be continued')
})

test('groups larger than one SAP call go in chunks', async () => {
  const { TRANSFER_CHUNK, BLOCK_CHUNK } = require('./softwareloadSap.cjs')
  const moving = Array.from({ length: TRANSFER_CHUNK + 1 }, (_, i) => `R${i}`)
  const blocking = Array.from({ length: BLOCK_CHUNK + 1 }, (_, i) => `N${i}`)
  const sap = fakeSap({
    ...Object.fromEntries(moving.map(serial => [serial, { material: 'M-R', sloc: 'D001' }])),
    ...Object.fromEntries(blocking.map(serial => [serial, { material: 'M-0', sloc: 'D000' }])),
  })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, [])
  const store = ctx.storeFor('TCD')
  const [key] = (await store.keysAsync()).filter(name => name.startsWith('aktiv-'))
  const failed = { note: 'Død', at: 1, by: { email: 'anna@example.test', name: 'Anna' } }
  await store.mutateAsync(key, task => ({
    ...task,
    terminals: Object.fromEntries([...moving.map(serial => [serial, { at: 1 }]), ...blocking.map(serial => [serial, { at: 1, failed }])]),
  }))
  const result = await svc.finish(ANNA, await confirmed(ctx, ANNA))
  assert.deepEqual(
    sap.calls.filter(([kind]) => kind !== 'lookup').map(([kind, call]) => [kind, call.serials.length]),
    [['transfer', TRANSFER_CHUNK], ['transfer', 1], ['block', BLOCK_CHUNK], ['block', 1]],
  )
  assert.deepEqual(result.counts, { 'to-target': TRANSFER_CHUNK + 1, 'to-blocked': BLOCK_CHUNK + 1 })
})

test('SAP closing mid-finish leaves the task pending and continueFinish never moves a terminal twice', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D000' } })
  sap.throwWhen = (kind, call) => kind === 'transfer' && call.to === 'D006'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A', 'B'])
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  assert.deepEqual(transfers(sap), [['D005', ['A', 'B']], ['D006', ['A', 'B']]])
  const status = await svc.status(ANNA)
  assert.equal(status.running, null)
  assert.deepEqual(status.pending.map(task => [task.id, task.count]), [['t1', 2]])
  assert.deepEqual([...sap.rows.values()].map(row => row.sloc), ['D005', 'D005'], 'SAP now answers D005 for all')

  sap.throwWhen = null
  sap.calls.length = 0
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(sap.calls.map(([kind]) => kind), ['lookup', 'transfer'])
  assert.deepEqual(transfers(sap), [['D006', ['A', 'B']]])
  for (const serial of ['A', 'B']) assert.deepEqual(result.results[serial].steps.map(step => step.to), ['D005', 'D006'])
  assert.deepEqual([result.results.A.from, result.results.A.outcome, result.state], ['D000', 'to-target', 'faerdig'])
  assert.deepEqual((await svc.status(ANNA)).pending, [])
  assert.equal(await ctx.storeFor('TCD').getAsync('venter-t1', { skipCache: true }), undefined)
  const lines = await allIndexLines(ctx)
  assert.deepEqual(lines.map(line => [line.serial, line.from, line.to, line.docs]), [['A', 'D000', 'D006', [doc(1), doc(2)]], ['B', 'D000', 'D006', [doc(1), doc(2)]]])
})

test('the owner can start a new task while one is pending', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  sap.throwWhen = kind => kind === 'lookup'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  const started = await svc.start(ANNA, { ...TASK, version: 'v3' })
  assert.equal(started.id, 't2')
  let status = await svc.status(ANNA)
  assert.deepEqual([status.running.id, status.pending.map(task => task.id)], ['t2', ['t1']])

  sap.throwWhen = null
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(result.counts, { 'to-target': 1 })
  status = await svc.status(ANNA)
  assert.deepEqual([status.running.id, status.running.version, status.pending], ['t2', 'v3', []])
})

test('only the owner or a manager can continue, only a manager can abandon', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  sap.throwWhen = kind => kind === 'lookup'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  sap.throwWhen = null
  sap.calls.length = 0

  await assert.rejects(svc.continueFinish(BO, { taskId: 't1' }), { code: 'MANAGER_ONLY' })
  await assert.rejects(svc.abandon(BO, { taskId: 't1', reason: 'Væk' }), { code: 'MANAGER_ONLY' })
  await assert.rejects(svc.abandon(ANNA, { taskId: 't1', reason: 'Væk' }), { code: 'MANAGER_ONLY' })
  await assert.rejects(svc.continueFinish(MONA, { taskId: 'nope' }), { code: 'SOFTWARELOAD_NOT_PENDING' })
  assert.deepEqual(sap.calls, [], 'a refused continue never reaches SAP')
  assert.deepEqual((await svc.status(ANNA)).pending.map(task => task.id), ['t1'])

  const result = await svc.continueFinish(MONA, { taskId: 't1' })
  assert.deepEqual(result.results.A.steps.map(step => step.by), ['mona@example.test', 'mona@example.test'])
  const task = (await ctx.finished('2026-11')).t1
  assert.deepEqual([task.email, task.name, task.state], ['anna@example.test', 'Anna', 'faerdig'], 'the task still belongs to its owner')
})

test('abandon marks the unmoved terminals and keeps who and why', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' }, C: { material: 'M-0', sloc: 'D001' } })
  sap.throwWhen = kind => kind === 'block'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, ['A', 'C', 'N'], { C: 'Knap i stykker' })
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  assert.deepEqual(transfers(sap), [['D006', ['A']], ['D000', ['C']]])

  await assert.rejects(svc.abandon(MONA, { taskId: 't1', reason: '   ' }), { code: 'SOFTWARELOAD_INVALID' })
  ctx.tick(MIN)
  const result = await svc.abandon(MONA, { taskId: 't1', reason: ' SAP   nede hele dagen ' })
  assert.deepEqual(
    ['A', 'C', 'N'].map(serial => [result.results[serial].outcome, result.results[serial].steps.map(step => step.to)]),
    [['to-target', ['D006']], ['abandoned', ['D000']], ['not-found', []]],
  )
  assert.deepEqual([result.state, result.counts], ['faerdig', { 'to-target': 1, abandoned: 1, 'not-found': 1 }])
  const task = (await ctx.finished('2026-11')).t1
  assert.deepEqual(task.abandoned, { by: 'mona@example.test', reason: 'SAP nede hele dagen', at: ctx.clock.now })
  assert.equal(task.state, 'faerdig')
  assert.deepEqual((await svc.status(MONA)).pending, [])
  const lines = await allIndexLines(ctx)
  assert.deepEqual(lines.find(line => line.serial === 'C'), {
    serial: 'C', team: 'TCD', kind: 'load', taskId: 't1', email: 'anna@example.test', name: 'Anna', at: task.endedAt,
    type: 'sw+key', version: 'v2.1.3', kif: false, from: 'D001', to: 'D000', docs: [doc(2)], outcome: 'abandoned', note: 'Knap i stykker',
  })
  assert.equal(sap.calls.filter(([kind]) => kind === 'block').length, 1, 'abandon never calls SAP')
})

test('a terminal moved before SAP closed keeps its outcome when the task continues', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' }, C: { material: 'M-0', sloc: 'D001' } })
  sap.throwWhen = kind => kind === 'block'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, ['A', 'C'], { C: 'Knap i stykker' })
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  sap.throwWhen = null
  sap.calls.length = 0
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(sap.calls, [['lookup', { team: 'TCD', serials: ['A', 'C'] }], ['block', { material: 'M-0', serials: ['C'], bwart: '344' }]])
  assert.deepEqual(['A', 'C'].map(serial => [result.results[serial].outcome, result.results[serial].steps.length]), [['to-target', 1], ['to-blocked', 2]])
  assert.deepEqual(result.counts, { 'to-target': 1, 'to-blocked': 1 })
})

test('a KIF Transfer SAP posted without an answer is never repeated: D000, D005, D004 once each', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  sap.postThenThrow = kind => kind === 'transfer'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, target: 'D004' }, ['A'])
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_TIMEOUT' })
  const pending = await ctx.storeFor('TCD').getAsync('venter-t1', { skipCache: true })
  assert.deepEqual(pending.results.A.uncertain, { from: 'D000', to: 'D005', by: 'anna@example.test', at: ctx.clock.now }, 'the run marks the serial before SAP is asked')

  await assert.rejects(svc.continueFinish(ANNA, { taskId: 't1' }), { code: 'SAP_TIMEOUT' })
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(transfers(sap), [['D005', ['A']], ['D004', ['A']]], 'no further Transfer for A')
  assert.deepEqual(result.results.A.steps, [
    { from: 'D000', to: 'D005', doc: null, unverified: true, by: 'anna@example.test', at: ctx.clock.now },
    { from: 'D005', to: 'D004', doc: null, unverified: true, by: 'anna@example.test', at: ctx.clock.now },
  ])
  assert.deepEqual([result.results.A.outcome, 'uncertain' in result.results.A], ['to-target', false])
  const lines = await allIndexLines(ctx)
  assert.deepEqual(lines.map(line => [line.serial, line.from, line.to, line.docs, line.unverified]), [['A', 'D000', 'D004', [], true]])
})

test('a KIF terminal that started on D005 is not moved again after a lost answer', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D005' } })
  sap.postThenThrow = kind => kind === 'transfer'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_TIMEOUT' })
  sap.postThenThrow = null
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(movesOf(sap, 'A'), [['D005', 'D006']], 'no further Transfer for A')
  assert.deepEqual(result.results.A.steps.map(step => [step.from, step.to, step.doc, step.unverified]), [['D005', 'D006', null, true]])
  assert.equal(result.results.A.outcome, 'to-target')
})

test('a KIF terminal that started on D005 and was saved is not moved again when a later step failed', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D005' }, C: { material: 'M-0', sloc: 'D005' } })
  sap.throwWhen = kind => kind === 'block'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A', 'C'], { C: 'Død' })
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  sap.throwWhen = null
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(movesOf(sap, 'A'), [['D005', 'D006']], 'no further Transfer for A')
  assert.deepEqual(movesOf(sap, 'C'), [['D005', 'D000']], 'no further Transfer for C')
  assert.deepEqual(result.results.A.steps.map(step => [step.from, step.to, step.doc]), [['D005', 'D006', doc(1)]])
  assert.deepEqual([result.results.C.outcome, result.results.C.steps.map(step => step.to ?? step.bwart)], ['to-blocked', ['D000', '344']])
})

test('a MIGO 344 SAP posted without an answer is recorded as unverified and never repeated', async () => {
  const sap = fakeSap({ A: { material: 'M-0', sloc: 'D006' } })
  sap.postThenThrow = kind => kind === 'block'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, ['A'], { A: 'Død' })
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_TIMEOUT' })
  sap.calls.length = 0
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(sap.calls.map(([kind]) => kind), ['lookup'], 'neither a Transfer nor MIGO again')
  assert.deepEqual(result.results.A.steps.map(step => [step.to ?? step.bwart, step.doc, step.unverified]), [['D000', doc(1), undefined], ['344', null, true]])
  assert.equal(result.results.A.outcome, 'to-blocked')
})

test('a serial still where it stood when SAP did not answer is moved again', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' } })
  sap.throwWhen = kind => kind === 'transfer'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, ['A'])
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  sap.throwWhen = null
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(transfers(sap), [['D006', ['A']], ['D006', ['A']]])
  assert.deepEqual(result.results.A.steps.map(step => [step.to, step.doc, step.unverified]), [['D006', doc(1), undefined]])
})

test('a terminal this task already moved keeps its outcome when SAP later shows it blocked or not at all', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' }, B: { material: 'M-R', sloc: 'D001' }, C: { material: 'M-0', sloc: 'D001' } })
  sap.throwWhen = kind => kind === 'block'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, ['A', 'B', 'C'], { C: 'Knap i stykker' })
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  sap.throwWhen = null
  sap.rows.get('A').blocked = true
  sap.rows.delete('B')
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(['A', 'B'].map(serial => [result.results[serial].outcome, result.results[serial].steps.map(step => step.to)]), [['to-target', ['D006']], ['to-target', ['D006']]])
})

test('a second person cannot continue while the first holds a fresh claim, but can after it expires', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  const otherPc = ctx.service()
  const annaGate = sap.hold('lookup', 1)
  const anna = svc.finish(ANNA, await confirmed(ctx, ANNA))
  anna.catch(() => {})
  await until(() => sap.calls.length === 1)

  await assert.rejects(otherPc.continueFinish(MONA, { taskId: 't1' }), { code: 'SOFTWARELOAD_BUSY', message: 'Anna er ved at flytte opgaven i SAP' })
  ctx.tick(CLAIM_MS - 1)
  await assert.rejects(otherPc.continueFinish(MONA, { taskId: 't1' }), { code: 'SOFTWARELOAD_BUSY' })
  ctx.tick(1)
  const monaGate = sap.hold('lookup', 2)
  const mona = otherPc.continueFinish(MONA, { taskId: 't1' })
  await until(() => sap.calls.length === 2)

  annaGate.open()
  await assert.rejects(anna, { code: 'SOFTWARELOAD_BUSY', message: 'Mona er ved at flytte opgaven i SAP' }, 'the run that lost its claim stops before SAP')
  monaGate.open()
  const result = await mona
  assert.deepEqual(transfers(sap), [['D005', ['A']], ['D006', ['A']]], 'each move once')
  assert.deepEqual(result.results.A.steps.map(step => [step.to, step.by]), [['D005', 'mona@example.test'], ['D006', 'mona@example.test']])
  assert.equal('claim' in (await ctx.finished('2026-11')).t1, false, 'the claim is not kept on the finished task')
})

test('abandon is refused while someone else is moving the task', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  const otherPc = ctx.service()
  const annaGate = sap.hold('lookup', 1)
  const anna = svc.finish(ANNA, await confirmed(ctx, ANNA))
  anna.catch(() => {})
  await until(() => sap.calls.length === 1)

  await assert.rejects(otherPc.abandon(MONA, { taskId: 't1', reason: 'Væk' }), { code: 'SOFTWARELOAD_BUSY', message: 'Anna er ved at flytte opgaven i SAP' })
  assert.deepEqual((await svc.status(MONA)).pending.map(task => [task.id, task.movingBy]), [['t1', { name: 'Anna' }]])
  ctx.tick(CLAIM_MS)
  await assert.rejects(svc.abandon(MONA, { taskId: 't1', reason: 'Væk' }), { code: 'SOFTWARELOAD_BUSY', message: 'Opgaven er allerede ved at blive flyttet i SAP' }, 'never while this PC runs it')
  const result = await otherPc.abandon(MONA, { taskId: 't1', reason: 'Annas PC gik ned' })
  assert.deepEqual([result.results.A.outcome, result.counts], ['abandoned', { abandoned: 1 }])

  annaGate.open()
  await assert.rejects(anna, { code: 'SOFTWARELOAD_NOT_PENDING' })
  assert.deepEqual(transfers(sap), [], 'nothing moves after the task was given up')
})

test('a claim is released when SAP fails, so the owner can continue at once', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  sap.throwWhen = kind => kind === 'lookup'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  const store = ctx.storeFor('TCD')
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  assert.equal((await store.getAsync('venter-t1', { skipCache: true })).claim, undefined)
  await assert.rejects(svc.continueFinish(MONA, { taskId: 't1' }), { code: 'SAP_NOT_READY' })
  assert.equal((await store.getAsync('venter-t1', { skipCache: true })).claim, undefined, 'a manager\'s failed run lets go too')

  // Anna's PC died mid-run: the claim of that dead run keeps everyone out, Anna too, until it runs out.
  await store.mutateAsync('venter-t1', task => ({ ...task, claim: { by: 'anna@example.test', name: 'Anna', runId: 'dead-run', at: ctx.clock.now } }))
  sap.throwWhen = null
  await assert.rejects(svc.continueFinish(ANNA, { taskId: 't1' }), { code: 'SOFTWARELOAD_BUSY', message: 'Anna er ved at flytte opgaven i SAP' })
  assert.deepEqual((await svc.status(ANNA)).pending.map(task => task.movingBy), [{ name: 'Anna' }], 'the screen shows who moves it')
  ctx.tick(CLAIM_MS)
  assert.equal((await svc.status(ANNA)).pending[0].movingBy, undefined)
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual([result.state, result.counts], ['faerdig', { 'to-target': 1 }])
})

test('the same person on two PCs cannot run the same task twice', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  sap.throwWhen = kind => kind === 'lookup'
  const ctx = setup({ sap })
  await assert.rejects((await startWith(ctx, TASK, ['A'])).finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  sap.throwWhen = null
  sap.calls.length = 0
  const pc1 = ctx.service()
  const pc2 = ctx.service()
  const held = sap.hold('lookup', 2)
  const first = pc1.continueFinish(ANNA, { taskId: 't1' })
  await until(() => sap.calls.length === 1)
  await assert.rejects(pc2.continueFinish(ANNA, { taskId: 't1' }), { code: 'SOFTWARELOAD_BUSY', message: 'Anna er ved at flytte opgaven i SAP' })
  held.open()
  const result = await first
  assert.equal(result.state, 'faerdig')
  assert.deepEqual(sap.calls.map(([kind]) => kind), ['lookup', 'transfer', 'transfer'], 'one SAP sequence')
})

test('a run renews its claim while SAP works, and a run that lost it to the same person on another PC lets it be', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap, renewClaimMs: 20 })
  const svc = await startWith(ctx, TASK, ['A'])
  const store = ctx.storeFor('TCD')
  const annaGate = sap.hold('lookup', 1)
  const anna = svc.finish(ANNA, await confirmed(ctx, ANNA))
  anna.catch(() => {})
  await until(() => sap.calls.length === 1)
  ctx.tick(CLAIM_MS)
  const claimAt = async () => (await store.getAsync('venter-t1', { skipCache: true }))?.claim?.at
  for (let i = 0; i < 300 && await claimAt() !== ctx.clock.now; i++) await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(await claimAt(), ctx.clock.now, 'the timer renewed the claim while SAP was busy')
  await assert.rejects(ctx.service().continueFinish(MONA, { taskId: 't1' }), { code: 'SOFTWARELOAD_BUSY' }, 'the renewed claim still holds')
  annaGate.open()
  assert.equal((await anna).state, 'faerdig')
  assert.deepEqual(transfers(sap), [['D005', ['A']], ['D006', ['A']]])

  // A second task: PC 1 of Bo hangs, its claim runs out and Bo goes on from PC 2.
  const other = fakeSap({ B: { material: 'M-R', sloc: 'D000' } })
  const ctx2 = setup({ sap: other })
  const pc1 = ctx2.service()
  await pc1.start(BO, TASK)
  await pc1.scan(BO, { serial: 'B', taskId: 't1' })
  const stuck = other.hold('lookup', 1)
  const hanging = pc1.finish(BO, await confirmed(ctx2, BO))
  hanging.catch(() => {})
  await until(() => other.calls.length === 1)
  ctx2.tick(CLAIM_MS)
  const pc2Gate = other.hold('lookup', 2)
  const pc2 = ctx2.service().continueFinish(BO, { taskId: 't1' })
  await until(() => other.calls.length === 2)
  stuck.open()
  await assert.rejects(hanging, { code: 'SOFTWARELOAD_BUSY', message: 'Bo er ved at flytte opgaven i SAP' })
  const kept = (await ctx2.storeFor('TCD').getAsync('venter-t1', { skipCache: true })).claim
  assert.ok(kept?.runId, 'the run that stopped did not release the claim of PC 2')
  pc2Gate.open()
  assert.equal((await pc2).state, 'faerdig')
  assert.deepEqual(transfers(other), [['D005', ['B']], ['D006', ['B']]])
})

test('a run that keeps failing checks its claim before each SAP call and stops when someone else took over', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' }, B: { material: 'M-R', sloc: 'D001' } })
  sap.refuse.add('A')
  sap.refuse.add('B')
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, ['A', 'B'])
  const otherPc = ctx.service()
  const annaGate = sap.hold('transfer', 2)
  const anna = svc.finish(ANNA, await confirmed(ctx, ANNA))
  anna.catch(() => {})
  await until(() => transfers(sap).length === 2)

  ctx.tick(CLAIM_MS)
  const monaGate = sap.hold('lookup', 2)
  const mona = otherPc.continueFinish(MONA, { taskId: 't1' })
  await until(() => sap.calls.filter(([kind]) => kind === 'lookup').length === 2)
  annaGate.open()
  await assert.rejects(anna, { code: 'SOFTWARELOAD_BUSY', message: 'Mona er ved at flytte opgaven i SAP' })
  assert.deepEqual(transfers(sap), [['D006', ['A', 'B']], ['D006', ['A']]], 'no SAP call from the first run after the takeover')
  const pending = await ctx.storeFor('TCD').getAsync('venter-t1', { skipCache: true })
  assert.equal(pending.claim.by, 'mona@example.test', 'the first run neither deleted the task nor took the claim back')

  sap.refuse.clear()
  monaGate.open()
  const result = await mona
  assert.deepEqual(transfers(sap).slice(2), [['D006', ['A', 'B']]])
  assert.deepEqual(result.counts, { 'to-target': 2 })
})

test('a run whose last SAP call fails after a takeover leaves the task to the new holder', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' } })
  sap.refuse.add('A')
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, ['A'])
  const otherPc = ctx.service()
  const annaGate = sap.hold('transfer', 1)
  const anna = svc.finish(ANNA, await confirmed(ctx, ANNA))
  anna.catch(() => {})
  await until(() => transfers(sap).length === 1)

  ctx.tick(CLAIM_MS)
  const monaGate = sap.hold('lookup', 2)
  const mona = otherPc.continueFinish(MONA, { taskId: 't1' })
  await until(() => sap.calls.filter(([kind]) => kind === 'lookup').length === 2)
  annaGate.open()
  await assert.rejects(anna, { code: 'SOFTWARELOAD_BUSY', message: 'Mona er ved at flytte opgaven i SAP' })
  assert.equal((await ctx.storeFor('TCD').getAsync('venter-t1', { skipCache: true })).claim.by, 'mona@example.test', 'not completed under the new holder')

  sap.refuse.clear()
  monaGate.open()
  const result = await mona
  assert.deepEqual([result.results.A.outcome, result.results.A.steps.map(step => step.by)], ['to-target', ['mona@example.test']])
})

test('a second continue of the same task in the same process is refused while the first runs', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  sap.throwWhen = kind => kind === 'lookup'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  sap.throwWhen = null

  const held = sap.hold('lookup', 1)
  const first = svc.continueFinish(ANNA, { taskId: 't1' })
  await until(() => sap.calls.length === 2)
  await assert.rejects(svc.continueFinish(ANNA, { taskId: 't1' }), { code: 'SOFTWARELOAD_BUSY', message: 'Opgaven er allerede ved at blive flyttet i SAP' })
  await assert.rejects(svc.continueFinish(MONA, { taskId: 't1' }), { code: 'SOFTWARELOAD_BUSY' })
  held.open()
  const result = await first
  assert.equal(result.state, 'faerdig')
  assert.deepEqual(transfers(sap), [['D005', ['A']], ['D006', ['A']]])
  assert.equal(sap.calls.filter(([kind]) => kind === 'lookup').length, 2, 'the refused runs never reached SAP')
})

test('a double finish is refused while the first runs', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  ctx.tick(30 * MIN)
  const held = sap.hold('lookup', 1)
  const first = svc.finish(ANNA, await confirmed(ctx, ANNA))
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SOFTWARELOAD_BUSY', message: 'Opgaven er allerede ved at blive afsluttet' })
  await assert.rejects(svc.edit(ANNA, { ...TASK, version: 'v3', taskId: 't1' }), { code: 'SOFTWARELOAD_BUSY', message: 'Opgaven er ved at blive afsluttet' })
  await until(() => sap.calls.length === 1)
  await assert.rejects(svc.continueFinish(ANNA, { taskId: 't1' }), { code: 'SOFTWARELOAD_BUSY' })
  held.open()
  const result = await first
  assert.deepEqual([result.state, transfers(sap)], ['faerdig', [['D005', ['A']], ['D006', ['A']]]])
  assert.equal(sap.calls.filter(([kind]) => kind === 'lookup').length, 1)
  assert.equal((await ctx.finished('2026-11')).t1.workedMs, 30 * MIN)
})

test('writing disabled: finish is refused before the clock stops', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } }, { writeEnabled: false })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  ctx.tick(10 * MIN)
  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SOFTWARELOAD_WRITE_DISABLED' })
  assert.deepEqual(sap.calls, [])
  const status = await svc.status(ANNA)
  assert.deepEqual([status.running.id, status.running.paused, status.running.workedMs, status.pending], ['t1', false, 10 * MIN, []])
  assert.deepEqual(await svc.scan(ANNA, { serial: 'B', taskId: 't1' }), { serial: 'B', count: 2 }, 'the task still runs')
})

test('kif move by material document moves to D005 and is found by search from the other team', async () => {
  const sap = fakeSap({ A: { material: 'M-0', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D001' } })
  const asked = []
  const matdocs = async input => {
    asked.push(input)
    const rows = [{ serial: 'a', material: 'M-0' }, { serial: 'B', material: 'M-R' }, { serial: 'B', material: 'M-R' }, { serial: 'N', material: 'M-0' }]
    return { document: '4900229137 2026 01', transaction: 'ZMS_REP', rows }
  }
  const ctx = setup({ sap, matdocs })
  const svc = ctx.service()
  const preview = await svc.kifPreview(BO, { document: ' 4900229137  2026 01 ' })
  assert.deepEqual(asked, [{ team: 'TCD', document: ' 4900229137  2026 01 ' }])
  assert.deepEqual(preview, {
    serials: ['A', 'B', 'N'],
    document: '4900229137 2026 01',
    outcomes: { A: 'to-target', B: 'to-target', N: 'not-found' },
    transfers: [{ wave: 1, from: 'D000', to: 'D005', serials: ['A'] }, { wave: 1, from: 'D001', to: 'D005', serials: ['B'] }],
  })
  assert.deepEqual(sap.calls, [['lookup', { team: 'TCD', serials: ['A', 'B', 'N'] }]], 'the preview moves nothing')

  ctx.tick(MIN)
  sap.rows.get('B').sloc = 'D005'
  sap.calls.length = 0
  const at = ctx.clock.now
  const moved = await svc.kifMove(BO, { serials: preview.serials, document: ' 4900229137  2026 01 ' })
  assert.deepEqual(sap.calls, [['lookup', { team: 'TCD', serials: ['A', 'B', 'N'] }], ['transfer', { team: 'TCD', serials: ['A'], from: 'D000', to: 'D005' }]], 'SAP is asked again, B moved since the preview')
  const results = {
    A: { material: 'M-0', from: 'D000', outcome: 'to-target', steps: [{ from: 'D000', to: 'D005', doc: doc(1), by: 'bo@example.test', at }] },
    B: { material: 'M-R', from: 'D005', outcome: 'skipped', steps: [] },
    N: { material: null, from: null, outcome: 'not-found', steps: [] },
  }
  assert.deepEqual(moved, { id: 't1', results, counts: { 'to-target': 1, skipped: 1, 'not-found': 1 } })
  assert.deepEqual((await ctx.storeFor('TCD').getAsync('kif-2026-11')).moves, {
    t1: { id: 't1', team: 'TCD', email: 'bo@example.test', name: 'Bo', at, document: '4900229137 2026 01', results },
  })

  assert.deepEqual(await svc.search(TRINE, { serial: ' a ' }), { lines: [
    { serial: 'A', team: 'TCD', kind: 'kif', email: 'bo@example.test', name: 'Bo', at, from: 'D000', to: 'D005', docs: [doc(1)], outcome: 'to-target' },
  ], unreadable: 0 })
  assert.deepEqual((await svc.search(TRINE, { serial: 'N' })).lines.map(line => [line.kind, line.outcome, line.to, line.docs]), [['kif', 'not-found', null, []]])
})

test('kif move skips terminals already on D005', async () => {
  const sap = fakeSap({ A: { material: 'M-0', sloc: 'D005' }, B: { material: 'M-0', sloc: 'D000', blocked: true } })
  const ctx = setup({ sap })
  const svc = ctx.service()
  const preview = await svc.kifPreview(ANNA, { serials: [' a ', 'b', 'A', '  '] })
  assert.deepEqual(preview, { serials: ['A', 'B'], outcomes: { A: 'skipped', B: 'blocked-stock' }, transfers: [] })
  const moved = await svc.kifMove(ANNA, { serials: ['a', 'B'] })
  assert.deepEqual(transfers(sap), [])
  assert.deepEqual(moved.results.A, { material: 'M-0', from: 'D005', outcome: 'skipped', steps: [] })
  assert.deepEqual(moved.counts, { skipped: 1, 'blocked-stock': 1 })
  assert.equal('document' in (await ctx.storeFor('TCD').getAsync('kif-2026-11')).moves[moved.id], false)
  const lines = await allIndexLines(ctx)
  assert.deepEqual(
    lines.map(line => [line.serial, line.kind, line.outcome, line.from, line.to, line.docs]),
    [['A', 'kif', 'skipped', 'D005', null, []], ['B', 'kif', 'blocked-stock', 'D000', null, []]],
  )
})

test('kif move moves terminals from several storage locations, one transfer per location', async () => {
  const sap = fakeSap({
    A: { material: 'M-0', sloc: 'D000' }, B: { material: 'M-3', sloc: 'D003' }, C: { material: 'M-6', sloc: 'D006' }, D: { material: 'M-0', sloc: 'D005' },
  })
  const ctx = setup({ sap })
  const svc = ctx.service()
  const moved = await svc.kifMove(ANNA, { serials: ['A', 'B', 'C', 'D'] })
  const calls = sap.calls.filter(([kind]) => kind === 'transfer').map(([, call]) => call)
  assert.equal(calls.length, 3)
  assert.deepEqual(calls.map(({ from, to, serials }) => ({ from, to, serials })).sort((a, b) => a.from.localeCompare(b.from)), [
    { from: 'D000', to: 'D005', serials: ['A'] },
    { from: 'D003', to: 'D005', serials: ['B'] },
    { from: 'D006', to: 'D005', serials: ['C'] },
  ])
  assert.equal(moved.results.D.outcome, 'skipped')
  assert.deepEqual(moved.results.D.steps, [])
  for (const [serial, from] of [['A', 'D000'], ['B', 'D003'], ['C', 'D006']]) {
    assert.equal(moved.results[serial].outcome, 'to-target')
    assert.deepEqual(moved.results[serial].steps.map(step => [step.from, step.to]), [[from, 'D005']], serial)
  }
})

test('a material document without year is shown and saved with the year SAP found it under', async () => {
  const sap = fakeSap({ A: { material: 'M-0', sloc: 'D000' } })
  const asked = []
  const matdocs = async ({ document }) => {
    asked.push(document)
    return document.trim() === '4905204948'
      ? { document: '4905204948 2025', transaction: 'ZMS_REP', rows: [{ serial: 'a', material: 'M-0' }] }
      : { document: `${document} 2025`, transaction: 'ZMS_REP', rows: [] }
  }
  const ctx = setup({ sap, matdocs })
  const svc = ctx.service()
  const preview = await svc.kifPreview(ANNA, { document: ' 4905204948 ' })
  assert.deepEqual(asked, [' 4905204948 '], 'the lookup is asked once; it tries the years itself')
  assert.deepEqual(preview.serials, ['A'])
  assert.equal(preview.document, '4905204948 2025', 'the document used is returned with its year')
  const moved = await svc.kifMove(ANNA, { serials: preview.serials, document: preview.document })
  assert.equal((await ctx.storeFor('TCD').getAsync('kif-2026-11')).moves[moved.id].document, '4905204948 2025')

  await assert.rejects(svc.kifPreview(ANNA, { document: '4905204949' }), {
    code: 'SOFTWARELOAD_INVALID', message: 'Materialedokumentet har ingen serienumre. Skriv det som fx "4905204948" eller "4905204948 2026"',
  })
})

test('kif move needs writing in SAP, refuses a double click, and a serial SAP refuses gets its message', async () => {
  const stock = () => ({ A: { material: 'M-R', sloc: 'D001' }, B: { material: 'M-R', sloc: 'D001' } })
  const off = fakeSap(stock(), { writeEnabled: false })
  const offline = setup({ sap: off }).service()
  assert.deepEqual((await offline.kifPreview(ANNA, { serials: ['A'] })).outcomes, { A: 'to-target' }, 'the preview works without writing')
  off.calls.length = 0
  await assert.rejects(offline.kifMove(ANNA, { serials: ['A'] }), { code: 'SOFTWARELOAD_WRITE_DISABLED' })
  await assert.rejects(offline.kifMove(ANNA, {}), { code: 'SOFTWARELOAD_WRITE_DISABLED' })
  assert.deepEqual(off.calls, [])

  const sap = fakeSap(stock())
  sap.refuse.add('B')
  const svc = setup({ sap }).service()
  await assert.rejects(svc.kifPreview(ANNA, {}), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(svc.kifMove(ANNA, { serials: ['  '] }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(svc.kifMove(ANNA, { serials: ['A'], document: 'nonsense' }), { code: 'SOFTWARELOAD_INVALID' })
  assert.deepEqual(sap.calls, [])
  const held = sap.hold('lookup', 1)
  const first = svc.kifMove(ANNA, { serials: ['A', 'B'] })
  await until(() => sap.calls.length === 1)
  await assert.rejects(svc.kifMove(ANNA, { serials: ['A'] }), { code: 'SOFTWARELOAD_BUSY' })
  held.open()
  const moved = await first
  assert.equal(sap.calls.filter(([kind]) => kind === 'lookup').length, 1, 'the refused click never reached SAP')
  assert.deepEqual(transfers(sap), [['D005', ['A', 'B']], ['D005', ['A']], ['D005', ['B']]])
  assert.deepEqual(moved.results.B, { material: 'M-R', from: 'D001', outcome: 'failed-sap', steps: [], message: 'Deficit of SL Unrestricted-use 1 EA' })
  assert.deepEqual(moved.counts, { 'to-target': 1, 'failed-sap': 1 })
})

test('kif move reports progress like finish', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' }, B: { material: 'M-0', sloc: 'D000' }, C: { material: 'M-0', sloc: 'D005' } })
  const svc = setup({ sap }).service()
  const progress = []
  const moved = await svc.kifMove(ANNA, { serials: ['A', 'B', 'C', 'N'] }, { onProgress: item => progress.push(item) })
  const steps = progress.map(item => item.step)
  assert.ok(steps.includes('lookup'), 'the lookup is reported')
  assert.deepEqual(progress[0], { done: 0, total: 4, step: 'lookup' })
  const last = progress.filter(item => item.step === 'transfer').at(-1)
  assert.equal(last.done, last.total)
  assert.equal(last.total, Object.values(moved.results).filter(result => result.outcome === 'to-target').length)
  assert.equal(last.total, 2)
  // A closed window must never stop the move.
  const other = setup({ sap: fakeSap({ A: { material: 'M-R', sloc: 'D001' } }) }).service()
  const after = await other.kifMove(ANNA, { serials: ['A'] }, { onProgress: () => { throw new Error('window closed') } })
  assert.deepEqual(after.counts, { 'to-target': 1 })
})

test('a kif move interrupted by SAP keeps its posted moves searchable', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' }, C: { material: 'M-R', sloc: 'D001' }, B: { material: 'M-R', sloc: 'D002' } })
  sap.refuse.add('C')
  sap.throwWhen = (kind, call) => kind === 'transfer' && call.serials.includes('B')
  const ctx = setup({ sap })
  const svc = ctx.service()
  const at = ctx.clock.now
  await assert.rejects(svc.kifMove(ANNA, { serials: ['A', 'C', 'B', 'N'] }), { code: 'SAP_NOT_READY' })
  assert.deepEqual(transfers(sap), [['D005', ['A', 'C']], ['D005', ['A']], ['D005', ['C']], ['D005', ['B']]])

  const { results } = (await ctx.storeFor('TCD').getAsync('kif-2026-11')).moves.t1
  assert.deepEqual(results, {
    A: { material: 'M-R', from: 'D001', outcome: 'to-target', steps: [{ from: 'D001', to: 'D005', doc: doc(1), by: 'anna@example.test', at }] },
    C: { material: 'M-R', from: 'D001', outcome: 'failed-sap', steps: [], message: 'Deficit of SL Unrestricted-use 1 EA' },
    B: { material: 'M-R', from: 'D002', outcome: 'interrupted', steps: [], uncertain: { from: 'D002', to: 'D005', by: 'anna@example.test', at } },
    N: { material: null, from: null, outcome: 'not-found', steps: [] },
  })
  assert.deepEqual((await svc.search(TRINE, { serial: 'A' })).lines, [
    { serial: 'A', team: 'TCD', kind: 'kif', email: 'anna@example.test', name: 'Anna', at, from: 'D001', to: 'D005', docs: [doc(1)], outcome: 'to-target' },
  ])
  assert.deepEqual((await allIndexLines(ctx)).map(line => line.serial), ['A'], 'only what SAP posted is indexed')
})

test('search returns every event for a serial, newest first, across months and years', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = ctx.service()
  ctx.clock.now = new Date(2025, 11, 30, 9, 0).getTime()
  const lastYear = ctx.clock.now
  await svc.kifMove(TRINE, { serials: ['A', 'B'] })
  ctx.clock.now = new Date(2026, 10, 18, 7, 0).getTime()
  await svc.start(ANNA, TASK)
  await svc.scan(ANNA, { serial: 'A', taskId: 't2' })
  ctx.tick(30 * MIN)
  const finished = ctx.clock.now
  await svc.finish(ANNA, await confirmed(ctx, ANNA))
  ctx.tick(MIN)
  const later = ctx.clock.now
  await svc.kifMove(BO, { serials: ['A'] })

  const found = await svc.search(TRINE, { serial: 'a' })
  assert.deepEqual(
    found.lines.map(line => [line.kind, line.team, line.name, line.at, line.from, line.to]),
    [['kif', 'TCD', 'Bo', later, 'D006', 'D005'], ['load', 'TCD', 'Anna', finished, 'D005', 'D006'], ['kif', 'TRR', 'Trine', lastYear, 'D000', 'D005']],
  )
  assert.equal(found.lines[1].taskId, 't2')
  assert.equal(found.unreadable, 0)
  assert.deepEqual((await svc.search(ANNA, { serial: 'B' })).lines.map(line => [line.team, line.at]), [['TRR', lastYear]])
  assert.deepEqual(await svc.search(ANNA, { serial: '  ' }), { lines: [], unreadable: 0 })
  assert.deepEqual(await svc.search(ANNA, { serial: 'NOPE1' }), { lines: [], unreadable: 0 })

  // One file per year and per the first two hex characters of the serial's sha256; a search reads only its own.
  const shard = serial => crypto.createHash('sha256').update(serial).digest('hex').slice(0, 2)
  const keys = (await ctx.index.keysAsync()).filter(key => key.startsWith('serier-')).sort()
  assert.deepEqual(keys, [...new Set([`serier-2025-${shard('A')}`, `serier-2025-${shard('B')}`, `serier-2026-${shard('A')}`])].sort())
  ctx.indexReads.length = 0
  await svc.search(TRINE, { serial: 'A' })
  assert.deepEqual(ctx.indexReads.sort(), [`serier-2025-${shard('A')}`, `serier-2026-${shard('A')}`])

  ctx.unreadableIndex.add(`serier-2025-${shard('A')}`)
  const partly = await svc.search(TRINE, { serial: 'A' })
  assert.deepEqual([partly.lines.map(line => line.at), partly.unreadable], [[later, finished], 1], 'an unreadable file is reported, the rest is shown')
})

test('tasks: an employee gets own tasks, a manager all in the period', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D000' }, C: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = ctx.service()
  const finishTask = async (user, startAt, serial) => {
    ctx.clock.now = startAt
    const started = await svc.start(user, { ...TASK, kif: false })
    await svc.scan(user, { serial, taskId: started.id })
    ctx.tick(30 * MIN)
    return (await svc.finish(user, await confirmed(ctx, user))).taskId
  }
  assert.equal(await finishTask(ANNA, new Date(2026, 9, 31, 23, 50).getTime(), 'A'), 't1')
  assert.equal(await finishTask(ANNA, new Date(2026, 10, 18, 7, 0).getTime(), 'B'), 't2')
  assert.equal(await finishTask(BO, new Date(2026, 10, 19, 7, 0).getTime(), 'C'), 't3')
  await svc.start(ANNA, TASK)

  const ids = async (user, period) => (await svc.tasks(user, period)).map(task => task.id)
  const november = { from: '2026-11-01', to: '2026-11-30' }
  assert.deepEqual(await ids(ANNA, november), ['t2'], 'a task started 31 October belongs to October; a running one is not listed')
  assert.deepEqual(await ids(BO, november), ['t3'])
  assert.deepEqual(await ids(MONA, november), ['t3', 't2'], 'newest first')
  assert.deepEqual(await ids(MONA, { from: '2026-10-31', to: '2026-11-18' }), ['t2', 't1'])
  assert.deepEqual(await ids(TOM, november), [], 'another team\'s manager sees only their own team')
  const [task] = await svc.tasks(ANNA, november)
  assert.deepEqual([task.state, task.email, task.workedMs, task.results.B.outcome], ['faerdig', 'anna@example.test', 30 * MIN, 'to-target'])

  await assert.rejects(svc.tasks(MONA, { from: '2026-11-30', to: '2026-11-01' }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(svc.tasks(MONA, { from: '2025-11-01', to: '2026-11-30' }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(svc.tasks(ANNA, { from: '18-11-2026', to: '2026-11-30' }), { code: 'SOFTWARELOAD_INVALID' })
})

const NOVEMBER = { from: '2026-11-01', to: '2026-11-30' }
/** Starts, scans and finishes a task outside KIF to D006; returns its id. */
async function finishedTask(ctx, svc, user, serials) {
  const started = await svc.start(user, { ...TASK, kif: false })
  for (const serial of serials) await svc.scan(user, { serial, taskId: started.id })
  ctx.tick(30 * MIN)
  return (await svc.finish(user, await confirmed(ctx, user))).taskId
}

test('a manager deletes a finished task: it leaves the task list, the statistics and the search', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D000' }, C: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = ctx.service()
  assert.equal(await finishedTask(ctx, svc, ANNA, ['A', 'B']), 't1')
  ctx.tick(MIN)
  assert.equal(await finishedTask(ctx, svc, BO, ['C']), 't2')
  ctx.tick(MIN)
  await svc.kifMove(BO, { serials: ['A'] })
  assert.deepEqual((await svc.tasks(MONA, NOVEMBER)).map(task => task.id), ['t2', 't1'])
  sap.calls.length = 0

  assert.deepEqual(await svc.deleteTask(MONA, { taskId: 't1' }), { ok: true })
  assert.deepEqual((await svc.tasks(MONA, NOVEMBER)).map(task => task.id), ['t2'], 'gone from the list and so from the statistics')
  assert.deepEqual(await svc.tasks(ANNA, NOVEMBER), [])
  assert.deepEqual((await svc.search(MONA, { serial: 'A' })).lines.map(line => [line.kind, line.name]), [['kif', 'Bo']], 'the KIF move of the same serial stays')
  assert.deepEqual((await svc.search(MONA, { serial: 'B' })).lines, [])
  assert.deepEqual((await allIndexLines(ctx)).map(line => [line.serial, line.kind, line.taskId]), [['A', 'kif', undefined], ['C', 'load', 't2']])
  assert.deepEqual(sap.calls, [], 'SAP is never touched')

  // A second click, or a retry after M: failed midway, finds it deleted and cleans the search again.
  assert.deepEqual(await svc.deleteTask(MONA, { taskId: 't1' }), { ok: true })
  await assert.rejects(svc.deleteTask(MONA, { taskId: 'nope' }), { code: 'SOFTWARELOAD_NOT_FOUND' })
  await assert.rejects(svc.deleteTask(MONA, {}), { code: 'SOFTWARELOAD_NOT_FOUND' })
  await assert.rejects(svc.deleteTask(TOM, { taskId: 't2' }), { code: 'SOFTWARELOAD_NOT_FOUND' }, 'another team\'s manager cannot reach it')
  assert.deepEqual((await svc.tasks(MONA, NOVEMBER)).map(task => task.id), ['t2'])
})

test('a manager deletes a KIF move and its search lines', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' }, B: { material: 'M-R', sloc: 'D001' }, C: { material: 'M-R', sloc: 'D001' } })
  const ctx = setup({ sap })
  const svc = ctx.service()
  assert.equal((await svc.kifMove(BO, { serials: ['A', 'B'] })).id, 't1')
  ctx.tick(MIN)
  assert.equal((await svc.kifMove(BO, { serials: ['C'] })).id, 't2')
  ctx.tick(MIN)
  assert.equal((await svc.kifMove(TRINE, { serials: ['A'] })).id, 't3')

  // A search line knows no move; a manager is given the id of the own team's moves, also of lines saved before this.
  assert.deepEqual((await svc.search(MONA, { serial: 'A' })).lines.map(line => [line.team, line.moveId]), [['TRR', undefined], ['TCD', 't1']])
  assert.deepEqual((await svc.search(ANNA, { serial: 'A' })).lines.map(line => line.moveId), [undefined, undefined], 'an employee gets no ids')
  sap.calls.length = 0

  assert.deepEqual(await svc.deleteKifMove(MONA, { id: 't1' }), { ok: true })
  assert.deepEqual(Object.keys((await ctx.storeFor('TCD').getAsync('kif-2026-11', { skipCache: true })).moves), ['t2'])
  assert.deepEqual((await svc.search(MONA, { serial: 'A' })).lines.map(line => line.team), ['TRR'], 'the other team\'s move of the same serial stays')
  assert.deepEqual((await svc.search(MONA, { serial: 'B' })).lines, [])
  assert.deepEqual((await svc.search(MONA, { serial: 'C' })).lines.map(line => line.moveId), ['t2'])
  assert.deepEqual(sap.calls, [], 'SAP is never touched')

  assert.deepEqual(await svc.deleteKifMove(MONA, { id: 't1' }), { ok: true }, 'a second click finds it deleted')
  await assert.rejects(svc.deleteKifMove(MONA, { id: 't3' }), { code: 'SOFTWARELOAD_NOT_FOUND' }, 'another team\'s move')
  await assert.rejects(svc.deleteKifMove(MONA, { id: 'nope' }), { code: 'SOFTWARELOAD_NOT_FOUND' })
})

test('an employee cannot delete', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D001' } })
  const ctx = setup({ sap })
  const svc = ctx.service()
  assert.equal(await finishedTask(ctx, svc, ANNA, ['A']), 't1')
  assert.equal((await svc.kifMove(ANNA, { serials: ['B'] })).id, 't2')
  const STATUS_MANAGER = { ...BO, role: 'manager', statusManager: true }
  for (const user of [ANNA, BO, STATUS_MANAGER]) {
    await assert.rejects(svc.deleteTask(user, { taskId: 't1' }), { code: 'MANAGER_ONLY' }, user.email)
    await assert.rejects(svc.deleteKifMove(user, { id: 't2' }), { code: 'MANAGER_ONLY' }, user.email)
  }
  assert.deepEqual((await svc.tasks(ANNA, NOVEMBER)).map(task => task.id), ['t1'])
  assert.deepEqual((await allIndexLines(ctx)).map(line => [line.serial, line.kind]), [['A', 'load'], ['B', 'kif']])
  assert.equal(await ctx.storeFor('TCD').getAsync('slettet-2026-11'), undefined)
})

test('a running or pending task cannot be deleted', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  sap.throwWhen = kind => kind === 'lookup'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  await assert.rejects(svc.deleteTask(MONA, { taskId: 't1' }), { code: 'SOFTWARELOAD_NOT_FINISHED' })
  assert.equal((await savedRunning(ctx, ANNA)).id, 't1', 'the running task is untouched')

  await assert.rejects(svc.finish(ANNA, await confirmed(ctx, ANNA)), { code: 'SAP_NOT_READY' })
  const store = ctx.storeFor('TCD')
  await assert.rejects(svc.deleteTask(MONA, { taskId: 't1' }), { code: 'SOFTWARELOAD_NOT_FINISHED' })
  assert.equal((await store.getAsync('venter-t1', { skipCache: true })).id, 't1', 'the pending task is untouched')

  // A finish that has written the month file but not yet removed the pending one is still on its way.
  const pending = await store.getAsync('venter-t1', { skipCache: true })
  const monthKey = `opgaver-${runningKeyOf(ANNA).slice('aktiv-'.length)}-2026-11`
  await store.setAsync(monthKey, { tasks: { t1: { ...pending, state: 'faerdig', results: {} } } })
  await assert.rejects(svc.deleteTask(MONA, { taskId: 't1' }), { code: 'SOFTWARELOAD_NOT_FINISHED' })
  assert.deepEqual(Object.keys((await store.getAsync(monthKey, { skipCache: true })).tasks), ['t1'])
  assert.equal(await store.getAsync('slettet-2026-11'), undefined)
})

test('deletion is logged', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D000' }, C: { material: 'M-R', sloc: 'D001' } })
  const ctx = setup({ sap })
  const svc = ctx.service()
  assert.equal(await finishedTask(ctx, svc, ANNA, ['A', 'B']), 't1')
  assert.equal((await svc.kifMove(BO, { serials: ['C'] })).id, 't2')
  ctx.tick(MIN)
  const at = ctx.clock.now
  await svc.deleteTask(MONA, { taskId: 't1' })
  await svc.deleteKifMove(MONA, { id: 't2' })
  const log = {
    entries: [
      { kind: 'task', id: 't1', by: 'mona@example.test', at, serials: ['A', 'B'] },
      { kind: 'kif', id: 't2', by: 'mona@example.test', at, serials: ['C'] },
    ],
  }
  assert.deepEqual(await ctx.storeFor('TCD').getAsync('slettet-2026-11', { skipCache: true }), log)
  await svc.deleteTask(MONA, { taskId: 't1' })
  await svc.deleteKifMove(MONA, { id: 't2' })
  assert.deepEqual(await ctx.storeFor('TCD').getAsync('slettet-2026-11', { skipCache: true }), log, 'a second click logs nothing more')
})

test('a deleted task id can never be finished again', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  const before = await savedRunning(ctx, ANNA)
  await svc.finish(ANNA, await confirmed(ctx, ANNA))
  // Another PC wrote a stale copy of the running file back after the finish.
  const leaveBehind = (extra = {}) => ctx.storeFor('TCD').setAsync(runningKeyOf(ANNA), { ...before, ...extra })
  await leaveBehind()
  await svc.deleteTask(MONA, { taskId: 't1' })
  assert.equal(await savedRunning(ctx, ANNA), undefined, 'the leftover running file is retired with the task')

  sap.calls.length = 0
  const finishAgain = { taskId: 't1', choice: { type: 'sw+key', kif: true, target: 'D006', version: 'v2.1.3' } }
  for (const extra of [{}, { finishing: { at: ctx.clock.now, runId: 'crashed' } }]) {
    await leaveBehind(extra)
    await assert.rejects(svc.finish(ANNA, finishAgain), { code: 'SOFTWARELOAD_ALREADY_FINISHED' })
    assert.equal(await savedRunning(ctx, ANNA), undefined)
  }
  await leaveBehind({ finishing: { at: ctx.clock.now, runId: 'crashed' } })
  assert.equal((await svc.status(ANNA)).running, null, 'the screen never shows it running again')
  assert.equal(await savedRunning(ctx, ANNA), undefined)

  assert.deepEqual(sap.calls, [])
  assert.equal(await ctx.storeFor('TCD').getAsync('venter-t1', { skipCache: true }), undefined, 'no new pending task')
  assert.deepEqual(await ctx.finished('2026-11'), {})
  assert.deepEqual(await allIndexLines(ctx), [])
  assert.deepEqual(await svc.tasks(MONA, NOVEMBER), [])
})

test('a KIF move deleted while a PC still holds its record is never brought back', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' } })
  const ctx = setup({ sap })
  const svc = ctx.service()
  const restore = dropDriveAfterTransfer(sap, ctx, 'kif', 100)
  await assert.rejects(svc.kifMove(ANNA, { serials: ['A'] }), { code: 'SOFTWARELOAD_SAVE_FAILED' })
  assert.equal(ctx.journal().length, 1)
  restore()
  ctx.faults.kif = 0

  await svc.deleteKifMove(MONA, { id: 't1' })
  await svc.status(ANNA)
  assert.deepEqual(ctx.journal(), [], 'the journal is emptied')
  assert.deepEqual((await ctx.storeFor('TCD').getAsync('kif-2026-11', { skipCache: true })).moves, {})
  assert.deepEqual(await allIndexLines(ctx), [])
})
