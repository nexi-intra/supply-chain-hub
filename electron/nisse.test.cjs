const test = require('node:test')
const assert = require('node:assert/strict')
const { SPOTS, createNisseService, danishParts, nisseDays, spotFor, startsAt } = require('./nisse.cjs')

test('the nisse hides on weekdays from 1 to 24 December', () => {
  const days = nisseDays(2026)
  assert.equal(days.length, 18)
  assert.equal(days[0], '2026-12-01')
  assert.equal(days[days.length - 1], '2026-12-24')
  assert.equal(days.includes('2026-12-05'), false)
  assert.equal(days.includes('2026-12-06'), false)
})

test('10:00 is Danish time in winter and summer', () => {
  assert.equal(danishParts(Date.parse('2026-12-01T09:00:00Z')).hour, 10)
  assert.equal(danishParts(Date.parse('2026-07-01T08:00:00Z')).hour, 10)
  assert.deepEqual(
    (({ year, month, day, weekday, date }) => ({ year, month, day, weekday, date }))(danishParts(Date.parse('2026-12-01T23:30:00Z'))),
    { year: 2026, month: 12, day: 2, weekday: 3, date: '2026-12-02' },
  )
  assert.equal(startsAt('2026-12-01'), Date.parse('2026-12-01T09:00:00Z'))
})

test('there are 24 places in three bands of eight', () => {
  assert.equal(SPOTS.easy.length, 8)
  assert.equal(SPOTS.medium.length, 8)
  assert.equal(SPOTS.hard.length, 8)
  assert.equal(new Set([...SPOTS.easy, ...SPOTS.medium, ...SPOTS.hard]).size, 24)
})

test('every hub uses a new place each day and it gets harder towards Christmas', () => {
  const days = nisseDays(2026)
  for (let hub = 0; hub < 8; hub++) {
    const spots = days.map(day => spotFor(day, hub))
    assert.equal(new Set(spots).size, spots.length)
    spots.forEach((spot, i) => {
      const band = i < 6 ? SPOTS.easy : i < 12 ? SPOTS.medium : SPOTS.hard
      assert.ok(band.includes(spot), `${days[i]} hub ${hub}: ${spot}`)
    })
  }
})

test('two hubs never share a place on the same day', () => {
  for (const day of nisseDays(2026)) {
    const spots = Array.from({ length: 8 }, (_, hub) => spotFor(day, hub))
    assert.equal(new Set(spots).size, 8, day)
  }
})

test('no nisse on weekends or outside December', () => {
  assert.equal(spotFor('2026-12-05', 0), null)
  assert.equal(spotFor('2026-11-30', 0), null)
  assert.equal(spotFor('2026-12-28', 0), null)
})

test('the order changes from year to year', () => {
  const order = year => nisseDays(year).map(day => spotFor(day, 0)).join()
  assert.notEqual(order(2026), order(2027))
})

// ---- The judge -------------------------------------------------------------------------------------------------

const TEAMS = [{ teamId: 'b-team', folderName: 'b', name: 'Lager Ballerup' }, { teamId: 'a-team', folderName: 'a', name: 'Terminal Configuration & Dispatch' }]
const PEOPLE = [
  { email: 'lasse@example.test', fullName: 'Lasse Hansen', teamCode: 'a', role: 'user' },
  { email: 'mia@example.test', fullName: 'Mia Berg', teamCode: 'a', role: 'user' },
  { email: 'ole@example.test', fullName: 'Ole Dam', teamCode: 'b', role: 'user' },
  { email: 'jacob@example.test', fullName: 'Jacob Remmer', teamCode: 'a', role: 'creator' },
]
const danish = (date, time) => Date.parse(`${date}T${time}:00+01:00`)
const actor = (email, team = TEAMS[1], homeRole = 'user') => ({ email, role: homeRole, homeRole, activeTeam: team })
const conflict = () => Object.assign(new Error('KV_CONFLICT'), { code: 'KV_CONFLICT' })

function harness({ now = danish('2026-12-01', '10:01'), drive } = {}) {
  const state = { now, drive: drive ?? now, value: undefined, storeCalls: 0, writes: 0, changed: 0, beforeWrite: null }
  const store = {
    async getAsync(key) { state.storeCalls++; assert.equal(key, 'nisse-finds-2026'); return structuredClone(state.value) },
    async updateAsync(key, op) {
      state.storeCalls++
      assert.equal(op.op, 'compareAndSet')
      if (state.beforeWrite) { const hook = state.beforeWrite; state.beforeWrite = null; await hook() }
      if (JSON.stringify(op.expected) !== JSON.stringify(state.value)) throw conflict()
      state.value = structuredClone(op.value)
      state.writes++
    },
  }
  const service = createNisseService({
    getStore: () => store,
    getDirectory: () => ({ people: PEOPLE, teams: TEAMS }),
    listTeams: () => TEAMS,
    now: () => state.now,
    driveNow: async () => state.drive,
    onChanged: () => { state.changed++ },
  })
  return { state, service }
}
// Hubs are numbered by teamId: a-team = 0, b-team = 1.
const spotA = date => spotFor(date, 0)
const spotB = date => spotFor(date, 1)

test('nothing is read or written in November – the surprise does not leak', async () => {
  const { state, service } = harness({ now: danish('2026-11-30', '12:00') })
  assert.deepEqual(await service.today(actor('lasse@example.test')), { status: 'off' })
  assert.deepEqual(await service.finds(actor('jacob@example.test', TEAMS[1], 'creator')), [])
  assert.equal(state.storeCalls, 0)
})

test('before 10 the nisse waits, at 10 it hides at the hub\'s place, never on Saturdays', async () => {
  const early = harness({ now: danish('2026-12-01', '09:59') })
  assert.deepEqual(await early.service.today(actor('lasse@example.test')), { status: 'waiting', date: '2026-12-01', startsAt: startsAt('2026-12-01') })
  const ten = harness({ now: danish('2026-12-01', '10:00') })
  assert.deepEqual(await ten.service.today(actor('lasse@example.test')), { status: 'hiding', date: '2026-12-01', spot: spotA('2026-12-01') })
  assert.deepEqual(await ten.service.today(actor('ole@example.test', TEAMS[0])), { status: 'hiding', date: '2026-12-01', spot: spotB('2026-12-01') })
  const saturday = harness({ now: danish('2026-12-05', '11:00') })
  assert.deepEqual(await saturday.service.today(actor('lasse@example.test')), { status: 'off' })
})

test('the first to click wins, the next is told who was first', async () => {
  const { state, service } = harness()
  const date = '2026-12-01'
  const won = await service.claim(actor('lasse@example.test'), { date, spot: spotA(date) })
  assert.equal(won.result, 'won')
  assert.equal(state.writes, 1)
  assert.deepEqual(state.value.finds.map(find => [find.teamId, find.date, find.name]), [['a-team', date, 'Lasse Hansen']])
  assert.equal(state.changed, 1)
  const taken = await service.claim(actor('mia@example.test'), { date, spot: spotA(date) })
  assert.deepEqual(taken, { result: 'taken', finder: { name: 'Lasse Hansen', email: 'lasse@example.test', at: won.at } })
  assert.deepEqual(await service.today(actor('mia@example.test')), { status: 'found', date, finder: { name: 'Lasse Hansen', email: 'lasse@example.test', at: won.at } })
})

test('two clicks at the same moment: exactly one winner', async () => {
  const { state, service } = harness()
  const date = '2026-12-01'
  // Mia's find lands between Lasse's read and Lasse's write.
  state.beforeWrite = async () => { assert.equal((await service.claim(actor('mia@example.test'), { date, spot: spotA(date) })).result, 'won') }
  const lasse = await service.claim(actor('lasse@example.test'), { date, spot: spotA(date) })
  assert.equal(lasse.result, 'taken')
  assert.equal(lasse.finder.name, 'Mia Berg')
  assert.equal(state.value.finds.length, 1)
})

test('the clock on M: decides 10:00, not the PC', async () => {
  const { service } = harness({ now: danish('2026-12-01', '10:05'), drive: danish('2026-12-01', '09:58') })
  await assert.rejects(service.claim(actor('lasse@example.test'), { date: '2026-12-01', spot: spotA('2026-12-01') }), { code: 'NISSE_TOO_EARLY' })
})

test('wrong place, wrong day or no hub is refused', async () => {
  const { service } = harness()
  const date = '2026-12-01'
  const wrong = SPOTS.easy.find(spot => spot !== spotA(date))
  await assert.rejects(service.claim(actor('lasse@example.test'), { date, spot: wrong }), { code: 'NISSE_WRONG_SPOT' })
  await assert.rejects(service.claim(actor('lasse@example.test'), { date: '2026-11-30', spot: spotA(date) }), { code: 'NISSE_NOT_TODAY' })
  await assert.rejects(service.claim({ email: 'lasse@example.test', role: 'user', homeRole: 'user', activeTeam: null }, { date, spot: spotA(date) }), { code: 'NISSE_NO_HUB' })
})

test('each hub has its own nisse', async () => {
  const { state, service } = harness()
  const date = '2026-12-01'
  assert.equal((await service.claim(actor('lasse@example.test'), { date, spot: spotA(date) })).result, 'won')
  assert.equal((await service.claim(actor('ole@example.test', TEAMS[0]), { date, spot: spotB(date) })).result, 'won')
  assert.equal(state.value.finds.length, 2)
})

test('the creator may play, sees every find and has a preview that never counts', async () => {
  const { state, service } = harness({ now: danish('2026-11-08', '15:00') })
  const jacob = actor('jacob@example.test', TEAMS[1], 'creator')
  assert.deepEqual(await service.today(jacob, '2026-12-16'), { status: 'hiding', date: '2026-12-16', spot: spotA('2026-12-16') })
  assert.deepEqual(await service.claim(jacob, { date: '2026-12-16', spot: spotA('2026-12-16'), preview: '2026-12-16' }), { result: 'preview' })
  assert.equal(state.writes, 0)
  assert.deepEqual(await service.today(actor('lasse@example.test'), '2026-12-16'), { status: 'off' })
  const december = harness()
  await december.service.claim(actor('jacob@example.test', TEAMS[1], 'creator'), { date: '2026-12-01', spot: spotA('2026-12-01') })
  await december.service.claim(actor('ole@example.test', TEAMS[0]), { date: '2026-12-01', spot: spotB('2026-12-01') })
  assert.deepEqual((await december.service.finds(actor('jacob@example.test', TEAMS[1], 'creator'))).map(find => find.name), ['Jacob Remmer', 'Ole Dam'])
  assert.deepEqual(await december.service.finds(actor('lasse@example.test')), [])
})