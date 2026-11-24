const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../store.cjs')
const { createTimeclockService, LONG_RUN_MS } = require('./timeclockService.cjs')

const ANNA = { email: 'Anna@example.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const BO = { email: 'bo@example.test', fullName: 'Bo', role: 'user', team: 'TCD' }
const MONA = { email: 'mona@example.test', fullName: 'Mona', role: 'manager', team: 'TCD' }
const STATUS_MANAGER = { email: 'sm@example.test', fullName: 'Sam', role: 'manager', statusManager: true, team: 'TCD' }
const TRINE = { email: 'trine@example.test', fullName: 'Trine', role: 'manager', team: 'TRR' }
const PACKING = { taskId: 'r1', taskName: 'Pakning', taskColor: '#3b82f6' }
const RETURNS = { taskId: 'r2', taskName: 'Returvarer', taskColor: '#ef4444' }
const MIN = 60_000
const HOUR = 60 * MIN

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'timeclock-'))
  const stores = new Map()
  const storeFor = team => {
    if (!stores.has(team)) stores.set(team, createStore(path.join(root, team)))
    return stores.get(team)
  }
  // 18 November 2026, 07:00 local time.
  const clock = { now: new Date(2026, 10, 18, 7, 0, 0).getTime() }
  let ids = 0
  const service = () => createTimeclockService({ storeFor, now: () => clock.now, newId: () => `e${++ids}` })
  return { root, clock, storeFor, service, tick: ms => { clock.now += ms } }
}

test('start, pause, resume and stop: the worked time leaves out the pauses', async () => {
  const ctx = setup()
  const svc = ctx.service()
  assert.equal((await svc.status(ANNA)).running, null)
  const started = await svc.start(ANNA, PACKING)
  assert.deepEqual([started.taskName, started.startedAt, started.paused], ['Pakning', ctx.clock.now, false])
  ctx.tick(30 * MIN)
  assert.equal((await svc.pause(ANNA)).paused, true)
  await assert.rejects(svc.pause(ANNA), { code: 'TIMECLOCK_PAUSED' })
  ctx.tick(15 * MIN)
  assert.equal((await svc.resume(ANNA)).paused, false)
  ctx.tick(45 * MIN)
  const stopped = await svc.stop(ANNA)
  assert.deepEqual([stopped.taskName, stopped.workedMs, stopped.pausedMs], ['Pakning', 75 * MIN, 15 * MIN])
  assert.equal((await svc.status(ANNA)).running, null)
  await assert.rejects(svc.stop(ANNA), { code: 'TIMECLOCK_NOT_RUNNING' })
})

test('the running clock is kept on the drive: another PC sees it and can stop it', async () => {
  const ctx = setup()
  await ctx.service().start(ANNA, PACKING)
  ctx.tick(20 * MIN)
  const otherPc = ctx.service()
  assert.equal((await otherPc.status(ANNA)).running.taskName, 'Pakning')
  assert.equal((await otherPc.stop(ANNA)).workedMs, 20 * MIN)
  await assert.rejects(ctx.service().start(ANNA, { taskId: '', taskName: '' }), { code: 'TIMECLOCK_INVALID' })

  await ctx.service().start(ANNA, RETURNS)
  ctx.tick(5 * MIN)
  await Promise.allSettled([ctx.service().stop(ANNA), ctx.service().stop(ANNA)])
  const { entries } = await ctx.service().entries(MONA, { from: '2026-11-18', to: '2026-11-18' })
  assert.deepEqual(entries.map(entry => entry.taskName).sort(), ['Pakning', 'Returvarer'], 'stopped on two PCs at once: saved once')
})

test('one clock at a time; switching task saves the running one and starts the new in one go', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await svc.start(ANNA, PACKING)
  ctx.tick(40 * MIN)
  await assert.rejects(svc.start(ANNA, RETURNS), { code: 'TIMECLOCK_RUNNING' })
  const switched = await svc.start(ANNA, { ...RETURNS, switchTask: true })
  assert.deepEqual([switched.taskName, switched.startedAt, switched.saved.taskName, switched.saved.workedMs], ['Returvarer', ctx.clock.now, 'Pakning', 40 * MIN])
  ctx.tick(10 * MIN)
  await svc.cancel(ANNA)
  assert.equal((await svc.status(ANNA)).running, null)
  const { entries } = await svc.entries(MONA, { from: '2026-11-18', to: '2026-11-18' })
  assert.deepEqual(entries.map(entry => entry.taskName), ['Pakning'], 'a cancelled clock is not saved')
})

test('a clock left running for more than 10 hours asks when the work really stopped', async () => {
  const ctx = setup()
  const svc = ctx.service()
  const startedAt = ctx.clock.now
  await svc.start(ANNA, PACKING)
  ctx.tick(LONG_RUN_MS + MIN)
  await assert.rejects(svc.stop(ANNA), error => error.code === 'TIMECLOCK_LONG_RUN')
  await assert.rejects(svc.stop(ANNA, { endAt: startedAt - MIN }), { code: 'TIMECLOCK_INVALID' })
  await assert.rejects(svc.stop(ANNA, { endAt: ctx.clock.now + MIN }), { code: 'TIMECLOCK_INVALID' })
  const stopped = await svc.stop(ANNA, { endAt: startedAt + 8 * HOUR })
  assert.equal(stopped.workedMs, 8 * HOUR)
  const [entry] = (await svc.entries(MONA, { from: '2026-11-18', to: '2026-11-18' })).entries
  assert.deepEqual([entry.endedAt, entry.endCorrected], [startedAt + 8 * HOUR, true])
})

test('saved times are only for managers; nobody can read a colleague\'s times or running clock', async () => {
  const ctx = setup()
  const svc = ctx.service()
  await svc.start(ANNA, PACKING)
  ctx.tick(60 * MIN)
  await svc.stop(ANNA)
  await svc.start(BO, RETURNS)
  ctx.tick(5 * MIN)

  for (const user of [ANNA, BO, STATUS_MANAGER]) {
    await assert.rejects(svc.entries(user, { from: '2026-11-01', to: '2026-11-30' }), { code: 'MANAGER_ONLY' })
    await assert.rejects(svc.deleteEntry(user, { email: ANNA.email, id: 'e1' }), { code: 'MANAGER_ONLY' })
  }
  assert.deepEqual([(await svc.status(ANNA)).running, (await svc.status(ANNA)).isManager], [null, false], 'Anna sees neither her saved time nor Bo\'s clock')

  const result = await svc.entries(MONA, { from: '2026-11-01', to: '2026-11-30' })
  assert.deepEqual(result.entries.map(entry => [entry.email, entry.name, entry.taskName, entry.workedMs, entry.date]), [['anna@example.test', 'Anna', 'Pakning', 60 * MIN, '2026-11-18']])
  assert.deepEqual(result.running.map(item => [item.email, item.taskName, item.workedMs]), [['bo@example.test', 'Returvarer', 5 * MIN]])
  assert.equal((await svc.status(MONA)).isManager, true)
  assert.deepEqual((await svc.entries(TRINE, { from: '2026-11-01', to: '2026-11-30' })).entries, [], 'another team\'s manager sees only their own team')
  const raw = fs.readdirSync(path.join(ctx.root, 'TCD')).map(name => fs.readFileSync(path.join(ctx.root, 'TCD', name), 'utf8')).join('\n')
  assert.equal(raw.includes('Pakning'), false, 'the files on the drive are not plain text')
})

test('a manager corrects and deletes a registration; the change is logged', async () => {
  const ctx = setup()
  const svc = ctx.service()
  const startedAt = ctx.clock.now
  await svc.start(ANNA, PACKING)
  ctx.tick(2 * HOUR)
  await svc.stop(ANNA)
  const [entry] = (await svc.entries(MONA, { from: '2026-11-18', to: '2026-11-18' })).entries
  ctx.tick(MIN)
  const edited = await svc.updateEntry(MONA, { email: entry.email, id: entry.id, endedAt: startedAt + HOUR, ...RETURNS })
  assert.deepEqual([edited.workedMs, edited.taskName, edited.editedBy.name, edited.editedAt], [HOUR, 'Returvarer', 'Mona', ctx.clock.now])
  await assert.rejects(svc.updateEntry(MONA, { email: entry.email, id: entry.id, endedAt: startedAt - MIN }), { code: 'TIMECLOCK_INVALID' })
  await svc.deleteEntry(MONA, { email: entry.email, id: entry.id })
  assert.deepEqual((await svc.entries(MONA, { from: '2026-11-18', to: '2026-11-18' })).entries, [])
  await assert.rejects(svc.deleteEntry(MONA, { email: entry.email, id: entry.id }), { code: 'TIMECLOCK_NOT_FOUND' })
})

test('registrations are filed by the day they started and found by period', async () => {
  const ctx = setup()
  const svc = ctx.service()
  ctx.clock.now = new Date(2026, 9, 31, 22, 0).getTime()
  await svc.start(ANNA, PACKING)
  ctx.tick(3 * HOUR)
  await svc.stop(ANNA)
  ctx.tick(10 * HOUR)
  await svc.start(ANNA, RETURNS)
  ctx.tick(HOUR)
  await svc.stop(ANNA)
  const october = await svc.entries(MONA, { from: '2026-10-01', to: '2026-10-31' })
  const november = await svc.entries(MONA, { from: '2026-11-01', to: '2026-11-30' })
  assert.deepEqual([october.entries.map(entry => entry.taskName), november.entries.map(entry => entry.taskName)], [['Pakning'], ['Returvarer']])
  await assert.rejects(svc.entries(MONA, { from: '2026-11-30', to: '2026-11-01' }), { code: 'TIMECLOCK_INVALID' })
  await assert.rejects(svc.entries(MONA, { from: '2024-01-01', to: '2026-11-30' }), { code: 'TIMECLOCK_INVALID' })
})
