const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { createSoftwareloadService, CLAIM_MS } = require('./softwareloadService.cjs')

const ANNA = { email: 'Anna@example.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const BO = { email: 'bo@example.test', fullName: 'Bo', role: 'user', team: 'TCD' }
const MONA = { email: 'mona@example.test', fullName: 'Mona', role: 'manager', team: 'TCD' }
const TASK = { type: 'sw+key', kif: true, target: ' d006 ', version: 'v2.1.3' }
const MIN = 60_000

const NOT_READY = () => Object.assign(new Error('SAP er ikke klar'), { code: 'SAP_NOT_READY' })

/**
 * A fake SAP that remembers every call, moves its own stock and can refuse (`refuse`), throw (`throwWhen`) or hold
 * its n-th call of a kind open until the test opens the gate (`hold(kind, n)`).
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
    rows,
    refuse: new Set(),
    throwWhen: null,
    hold(kind, n) {
      const held = gate()
      holds.set(`${kind}#${n}`, held.promise)
      return held
    },
    async lookup({ team, serials }) {
      await call('lookup', { team, serials: [...serials] })
      return serials.filter(serial => rows.has(serial)).map(serial => ({ serial, plant: 'D301', userStatus: 'ONHA', ...rows.get(serial) }))
    },
    async transfer({ team, serials, to }) {
      await call('transfer', { team, serials: [...serials], to })
      if (serials.some(serial => sap.refuse.has(serial))) return { ok: false, message: 'Deficit of SL Unrestricted-use 1 EA' }
      for (const serial of serials) rows.get(serial).sloc = to
      return { ok: true, doc: `49${String(++docs).padStart(8, '0')}` }
    },
    async block({ material, serials, bwart }) {
      await call('block', { material, serials: [...serials], bwart })
      for (const serial of serials) rows.get(serial).blocked = true
      return { ok: true, doc: `49${String(++docs).padStart(8, '0')}` }
    },
  }
  return sap
}

const transfers = sap => sap.calls.filter(([kind]) => kind === 'transfer').map(([, call]) => [call.to, call.serials])
const doc = n => `49${String(n).padStart(8, '0')}`
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

function setup({ timeclockRunning = null, sap = { writeEnabled: false } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'softwareload-'))
  const stores = new Map()
  const storeAt = dir => {
    if (!stores.has(dir)) stores.set(dir, createStore(path.join(root, dir)))
    return stores.get(dir)
  }
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
    storeFor: team => storeAt(path.join(team, 'lagerstyring', 'softwareload')),
    indexStore: storeAt(path.join('_lagerstyring', 'softwareload')),
    sap,
    timeclock,
    now: () => clock.now,
    newId: () => `t${++ids}`,
  })
  const storeFor = team => storeAt(path.join(team, 'lagerstyring', 'softwareload'))
  const index = storeAt(path.join('_lagerstyring', 'softwareload'))
  /** The finished tasks of one month, whoever wrote them. */
  const finished = async month => {
    const store = storeFor('TCD')
    const keys = (await store.keysAsync()).filter(key => key.startsWith('opgaver-') && key.endsWith(month))
    return Object.assign({}, ...await Promise.all(keys.map(async key => (await store.getAsync(key)).tasks)))
  }
  return { root, clock, timeclock, stops, storeFor, index, finished, service, tick: ms => { clock.now += ms } }
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

test('start refuses an unknown type, an invalid target and an empty version', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await assert.rejects(svc.start(ANNA, { ...TASK, type: 'firmware' }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(svc.start(ANNA, { ...TASK, target: 'D5' }), { code: 'SOFTWARELOAD_INVALID' })
  await assert.rejects(svc.start(ANNA, { ...TASK, version: '   ' }), { code: 'SOFTWARELOAD_INVALID' })
  assert.equal((await svc.status(ANNA)).running, null)
  assert.deepEqual(await svc.versions(ANNA), [])
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
  await assert.rejects(svc.scan(ANNA, { serial: 'ABC123' }), { code: 'SOFTWARELOAD_NOT_RUNNING' })
  await svc.start(ANNA, TASK)
  assert.deepEqual(await svc.scan(ANNA, { serial: ' abc123 ' }), { serial: 'ABC123', count: 1 })
  await assert.rejects(svc.scan(ANNA, { serial: 'ABC123' }), { code: 'SOFTWARELOAD_DUPLICATE' })
  await assert.rejects(svc.scan(ANNA, { serial: '  ' }), { code: 'SOFTWARELOAD_INVALID' })
  ctx.tick(MIN)
  assert.deepEqual(await svc.scan(ANNA, { serial: 'xyz9' }), { serial: 'XYZ9', count: 2 })
  const { running } = await svc.status(ANNA)
  assert.deepEqual(running.terminals.map(terminal => terminal.serial), ['XYZ9', 'ABC123'], 'newest scan first')
  assert.deepEqual(await svc.unscan(ANNA, { serial: 'abc123' }), { serial: 'ABC123', count: 1 })
  assert.deepEqual((await svc.status(ANNA)).running.terminals.map(terminal => terminal.serial), ['XYZ9'])
})

test('a failed terminal needs a note and can be undone', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await svc.start(ANNA, TASK)
  await svc.scan(ANNA, { serial: 'ABC123' })
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

test('another person cannot see or change my running task', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await svc.start(BO, TASK)
  await svc.scan(BO, { serial: 'ABC123' })
  assert.equal((await svc.status(ANNA)).running, null)
  await assert.rejects(svc.scan(ANNA, { serial: 'XYZ9' }), { code: 'SOFTWARELOAD_NOT_RUNNING' })
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
  await svc.start(ANNA, task)
  for (const serial of serials) await svc.scan(ANNA, { serial })
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

test('finish in KIF moves via D005 and records every document per serial', async () => {
  const sap = fakeSap({ A: { material: 'M-0', sloc: 'D000' }, B: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A', 'B'])
  ctx.tick(30 * MIN)
  const endedAt = ctx.clock.now
  const progress = []
  const result = await svc.finish(ANNA, { onProgress: item => progress.push(item) })

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
  const { lines } = await ctx.index.getAsync('serier-2026-11')
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
  const result = await svc.finish(ANNA, {})

  assert.deepEqual(transfers(sap), [['D000', ['A']]])
  assert.deepEqual(sap.calls.at(-1), ['block', { material: 'M-0', serials: ['A'], bwart: '344' }])
  assert.deepEqual(result.results.A.steps.at(-1), { bwart: '344', doc: doc(2), by: 'anna@example.test', at: ctx.clock.now })
  assert.deepEqual(result.counts, { 'to-blocked': 1, skipped: 1 })
  assert.ok((await ctx.finished('2026-11')).t1, 'the task is kept in the month it started')
  const { lines } = await ctx.index.getAsync('serier-2026-12')
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
  const result = await svc.finish(ANNA, {})

  assert.deepEqual(transfers(sap), [
    ['D005', ['A', 'B', 'C', 'D']], ['D005', ['A', 'B']], ['D005', ['C', 'D']], ['D005', ['C']], ['D005', ['D']],
    ['D006', ['A', 'B', 'D']],
  ], 'C never reaches the target around D005')
  assert.deepEqual([result.results.C.outcome, result.results.C.message, result.results.C.steps], ['failed-sap', 'Deficit of SL Unrestricted-use 1 EA', []])
  assert.deepEqual(['A', 'B', 'D'].map(serial => result.results[serial].outcome), ['to-target', 'to-target', 'to-target'])
  assert.deepEqual(result.results.D.steps.map(step => step.doc), [doc(2), doc(3)])
  assert.deepEqual(result.counts, { 'to-target': 3, 'failed-sap': 1 })
  const { lines } = await ctx.index.getAsync('serier-2026-11')
  assert.deepEqual(lines.find(line => line.serial === 'C'), {
    serial: 'C', team: 'TCD', kind: 'load', taskId: 't1', email: 'anna@example.test', name: 'Anna', at: ctx.clock.now,
    type: 'sw+key', version: 'v2.1.3', kif: true, from: 'D001', to: null, docs: [], outcome: 'failed-sap',
  })
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
  const result = await svc.finish(ANNA, {})
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
  await assert.rejects(svc.finish(ANNA, {}), { code: 'SAP_NOT_READY' })
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
  const { lines } = await ctx.index.getAsync('serier-2026-11')
  assert.deepEqual(lines.map(line => [line.serial, line.from, line.to, line.docs]), [['A', 'D000', 'D006', [doc(1), doc(2)]], ['B', 'D000', 'D006', [doc(1), doc(2)]]])
})

test('the owner can start a new task while one is pending', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  sap.throwWhen = kind => kind === 'lookup'
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  await assert.rejects(svc.finish(ANNA, {}), { code: 'SAP_NOT_READY' })
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
  await assert.rejects(svc.finish(ANNA, {}), { code: 'SAP_NOT_READY' })
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
  await assert.rejects(svc.finish(ANNA, {}), { code: 'SAP_NOT_READY' })
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
  const { lines } = await ctx.index.getAsync('serier-2026-11')
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
  await assert.rejects(svc.finish(ANNA, {}), { code: 'SAP_NOT_READY' })
  sap.throwWhen = null
  sap.calls.length = 0
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual(sap.calls, [['lookup', { team: 'TCD', serials: ['A', 'C'] }], ['block', { material: 'M-0', serials: ['C'], bwart: '344' }]])
  assert.deepEqual(['A', 'C'].map(serial => [result.results[serial].outcome, result.results[serial].steps.length]), [['to-target', 1], ['to-blocked', 2]])
  assert.deepEqual(result.counts, { 'to-target': 1, 'to-blocked': 1 })
})

test('a second person cannot continue while the first holds a fresh claim, but can after it expires', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D000' } })
  const ctx = setup({ sap })
  const svc = await startWith(ctx, TASK, ['A'])
  const otherPc = ctx.service()
  const annaGate = sap.hold('lookup', 1)
  const anna = svc.finish(ANNA, {})
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
  const annaGate = sap.hold('lookup', 1)
  const anna = svc.finish(ANNA, {})
  anna.catch(() => {})
  await until(() => sap.calls.length === 1)

  await assert.rejects(svc.abandon(MONA, { taskId: 't1', reason: 'Væk' }), { code: 'SOFTWARELOAD_BUSY', message: 'Anna er ved at flytte opgaven i SAP' })
  assert.deepEqual((await svc.status(MONA)).pending.map(task => task.id), ['t1'])
  ctx.tick(CLAIM_MS)
  const result = await svc.abandon(MONA, { taskId: 't1', reason: 'Annas PC gik ned' })
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
  await assert.rejects(svc.finish(ANNA, {}), { code: 'SAP_NOT_READY' })
  assert.equal((await store.getAsync('venter-t1', { skipCache: true })).claim, undefined)
  await assert.rejects(svc.continueFinish(MONA, { taskId: 't1' }), { code: 'SAP_NOT_READY' })
  assert.equal((await store.getAsync('venter-t1', { skipCache: true })).claim, undefined, 'a manager\'s failed run lets go too')

  // Anna's PC died mid-run: her own fresh claim never stops her.
  await store.mutateAsync('venter-t1', task => ({ ...task, claim: { by: 'anna@example.test', name: 'Anna', at: ctx.clock.now } }))
  sap.throwWhen = null
  const result = await svc.continueFinish(ANNA, { taskId: 't1' })
  assert.deepEqual([result.state, result.counts], ['faerdig', { 'to-target': 1 }])
})

test('a run that keeps failing checks its claim before each SAP call and stops when someone else took over', async () => {
  const sap = fakeSap({ A: { material: 'M-R', sloc: 'D001' }, B: { material: 'M-R', sloc: 'D001' } })
  sap.refuse.add('A')
  sap.refuse.add('B')
  const ctx = setup({ sap })
  const svc = await startWith(ctx, { ...TASK, kif: false }, ['A', 'B'])
  const otherPc = ctx.service()
  const annaGate = sap.hold('transfer', 2)
  const anna = svc.finish(ANNA, {})
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
  const anna = svc.finish(ANNA, {})
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
  await assert.rejects(svc.finish(ANNA, {}), { code: 'SAP_NOT_READY' })
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
  const first = svc.finish(ANNA, {})
  await assert.rejects(svc.finish(ANNA, {}), { code: 'SOFTWARELOAD_BUSY', message: 'Opgaven er allerede ved at blive afsluttet' })
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
  await assert.rejects(svc.finish(ANNA, {}), { code: 'SOFTWARELOAD_WRITE_DISABLED' })
  assert.deepEqual(sap.calls, [])
  const status = await svc.status(ANNA)
  assert.deepEqual([status.running.id, status.running.paused, status.running.workedMs, status.pending], ['t1', false, 10 * MIN, []])
  assert.deepEqual(await svc.scan(ANNA, { serial: 'B' }), { serial: 'B', count: 2 }, 'the task still runs')
})
