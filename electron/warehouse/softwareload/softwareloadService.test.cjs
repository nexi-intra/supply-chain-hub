const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { createSoftwareloadService } = require('./softwareloadService.cjs')

const ANNA = { email: 'Anna@example.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const BO = { email: 'bo@example.test', fullName: 'Bo', role: 'user', team: 'TCD' }
const MONA = { email: 'mona@example.test', fullName: 'Mona', role: 'manager', team: 'TCD' }
const TASK = { type: 'sw+key', kif: true, target: ' d006 ', version: 'v2.1.3' }
const MIN = 60_000

function setup({ timeclockRunning = null } = {}) {
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
    sap: { writeEnabled: false },
    timeclock,
    now: () => clock.now,
    newId: () => `t${++ids}`,
  })
  const storeFor = team => storeAt(path.join(team, 'lagerstyring', 'softwareload'))
  return { root, clock, timeclock, stops, storeFor, service, tick: ms => { clock.now += ms } }
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
