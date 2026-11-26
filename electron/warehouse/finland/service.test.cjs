const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { parseSapList } = require('./core/sapList.cjs')
const { parcelKey } = require('./core/sheetIndex.cjs')
const { courierFor } = require('./core/courier.cjs')
const { createFinlandShared } = require('./shared.cjs')
const { createFinlandService } = require('./service.cjs')

const MONA = { email: 'mona@x.test', fullName: 'Mona Berg', role: 'user', team: 'TCD', tools: ['finland'] }
const ANNA = { email: 'anna@x.test', fullName: 'Anna Holm', role: 'user', team: 'BPO', tools: ['finland'] }
const ADA = { email: 'ada@x.test', fullName: 'Ada Admin', role: 'user', team: 'BPO', tools: ['finland'] }

const FIXTURES = path.join(__dirname, 'fixtures')
const SAP = parseSapList(fs.readFileSync(path.join(FIXTURES, 'zms-2026-11-24.tsv')))
const SHEET = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'sheet-2026-11-24.json'), 'utf8')).rows
// 16.11 has three parcels missing from the sheet in the fixtures.
const DAY = '2026-11-16'
const NOW = new Date(2026, 10, 24, 10).getTime()
const BLANK = { expected: '', received: '', sla: '', comment: '', terminal: '' }

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'finland-service-'))
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }))

const pn = n => `00073215${String(n).padStart(12, '0')}`
const parcel = (delivery, tracking, shippedOn = '2026-11-20') => ({ delivery, tracking, orderType: 'ZRO', postalCode: '00100', country: 'FI', createdOn: shippedOn, shippedOn })
const sheetRow = (row, delivery, trackingText, pickedUp = '2026-11-20', followUp = {}) => ({
  row, delivery, trackingText, pickedUp, orderType: 'ZRO', postalCode: '00100', courier: courierFor(trackingText), followUp: { ...BLANK, ...followUp },
})
const copyRow = r => ({ ...r, followUp: r.followUp ? { ...r.followUp } : r.followUp })

/** Excel as the service sees it: records every call and keeps the sheet in memory. `state.hook(kind)` runs inside a write. */
function fakeExcel(rows) {
  const state = { rows: rows.map(copyRow), hook: null }
  const calls = []
  const nextRow = () => Math.max(1, ...state.rows.map(r => r.row)) + 1
  async function write(kind, data) {
    calls.push({ kind, ...data })
    if (state.hook) await state.hook(kind)
  }
  return {
    state,
    calls,
    writes: () => calls.filter(c => c.kind !== 'read'),
    async readSheet() {
      calls.push({ kind: 'read' })
      return { rows: state.rows.map(copyRow), wasOpen: true, filterRemoved: false }
    },
    async appendRows(added, placement) {
      await write('append', { rows: added, placement })
      const first = nextRow()
      added.forEach((r, i) => state.rows.push(sheetRow(first + i, String(r.delivery), r.tracking, r.pickedUp)))
      return { added: added.length, skipped: 0, firstRow: first, lastRow: first + added.length - 1, weekFormulaOk: true }
    },
    async replaceTracking(fix) {
      await write('replace', { fix })
      const target = state.rows.find(r => r.row === fix.row)
      target.trackingText = fix.newTracking
      return { row: fix.row }
    },
    async writeFollowUp(list) {
      await write('followup', { list })
      for (const w of list) Object.assign(state.rows.find(r => r.row === w.row).followUp, w.cells)
      return { written: list.map(w => w.row), moved: [], conflicted: [] }
    },
    async deleteRow(target) {
      await write('delete', { target })
      state.rows = state.rows.filter(r => r.row !== target.row)
      return { row: target.row }
    },
  }
}

function setup({ sheet = SHEET, parcels = SAP, admins = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'finlandsforsendelser-'))
  const store = createStore(dir)
  const clock = { now: NOW }
  const shared = createFinlandShared({ store, now: () => clock.now })
  const ranges = []
  // Each PC has its own service and its own Excel, but they share the folder.
  const pc = (rows = sheet) => {
    const excel = fakeExcel(rows)
    const service = createFinlandService({
      shared,
      excel,
      fetchParcels: async range => { ranges.push(range); return parcels.map(p => ({ ...p })) },
      isAdmin: async user => admins.includes(user.email),
      now: () => clock.now,
    })
    return { excel, service }
  }
  return { dir, store, clock, shared, ranges, pc, ...pc() }
}

async function waitFor(check) {
  for (let i = 0; i < 400; i++) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('timed out waiting')
}

const missingOn = (snap, day) => snap.days.find(d => d.date === day).missing
const keyOf = r => parcelKey(r.delivery, r.tracking)
const appended = excel => excel.writes().filter(c => c.kind === 'append').flatMap(c => c.rows.map(keyOf))

test('loading reads the sheet and fetches two months from SAP', async () => {
  const { service, excel, ranges } = setup()
  const snap = await service.load(MONA)
  assert.deepEqual(ranges, [{ from: '24.09.2026', to: '24.11.2026' }])
  assert.deepEqual(snap.range, { from: '2026-09-24', to: '2026-11-24' })
  assert.equal(snap.today, '2026-11-24')
  assert.equal(snap.defaultDay, '2026-11-24')
  assert.equal(snap.loadedAt, new Date(NOW).toISOString())
  assert.equal(missingOn(snap, DAY).length, 3)
  assert.deepEqual(snap.sheet, { wasOpen: true, filterRemoved: false, texts: ['Arket er åbent i Excel'], isTest: true })
  assert.deepEqual(snap.dayLog, {})
  assert.equal(snap.lock, null)
  assert.deepEqual(snap.followUp.othersByDay, {})
  assert.deepEqual(excel.writes(), [])
})

test('writing a day writes the missing parcels at the day and logs who wrote them', async () => {
  const { service, excel } = setup()
  const missing = missingOn(await service.load(MONA), DAY)
  const snap = await service.writeDay(MONA, DAY)
  assert.deepEqual(appended(excel), missing.map(keyOf))
  assert.equal(snap.result.added, 3)
  assert.equal(snap.days.find(d => d.date === DAY).status, 'full', 'the sheet is read again after writing')
  assert.deepEqual(snap.dayLog[DAY], { byName: 'Mona Berg', at: NOW, count: 3 })
  assert.equal(snap.lock, null)
  const again = await service.writeDay(MONA, DAY)
  assert.equal(again.result.added, 0)
  assert.equal(excel.writes().length, 1, 'a full day is not written again')
})

test('the sheet is read again before writing, so rows a colleague added are not written twice', async () => {
  const { service, excel } = setup()
  const missing = missingOn(await service.load(MONA), DAY)
  excel.state.rows.push(sheetRow(5000, String(missing[0].delivery), missing[0].tracking, DAY))
  await service.writeDay(MONA, DAY)
  assert.deepEqual(appended(excel), missing.slice(1).map(keyOf))
})

test('no sheet write when the shared not-sent list cannot be read', async () => {
  const { service, excel, dir, store } = setup()
  await service.load(MONA)
  const before = excel.calls.length
  fs.rmSync(dir, { recursive: true, force: true })
  store.invalidate()
  await assert.rejects(service.writeDay(MONA, DAY), { code: 'STORAGE_UNAVAILABLE' })
  await assert.rejects(service.saveFollowUp(MONA, null), { code: 'STORAGE_UNAVAILABLE' })
  assert.equal(excel.calls.length, before, 'Excel is not even read')
  assert.deepEqual(excel.writes(), [])
})

test('a day someone else is writing is refused', async () => {
  const { service, excel, shared } = setup()
  await service.load(MONA)
  const before = excel.calls.length
  await shared.lock.acquire(ANNA, { day: DAY, action: 'skriver', ttlMs: 60000 })
  const snap = await service.loadSheet(MONA)
  assert.deepEqual(snap.lock, { byName: 'Anna Holm', day: DAY, action: 'skriver', mine: false })
  await assert.rejects(service.writeDay(MONA, DAY), error => {
    assert.equal(error.code, 'FINLAND_LOCKED')
    assert.match(error.message, /Anna Holm skriver 16\.11/)
    return true
  })
  assert.equal(excel.calls.length, before + 1, 'only the read of "Læs arket"')
  assert.deepEqual(excel.writes(), [])
})

test('the snapshot tells the window whether the person is admin and whether the lock is their own', async () => {
  const { pc, shared } = setup({ admins: [ADA.email] })
  const mona = pc()
  const ada = pc()
  assert.equal((await mona.service.loadSheet(MONA)).isAdmin, false)
  assert.equal((await ada.service.loadSheet(ADA)).isAdmin, true)
  // Same name, different person: only the e-mail makes the lock one's own.
  const namesake = { ...MONA, email: 'mona.berg@x.test' }
  const release = await shared.lock.acquire({ ...MONA, email: 'MONA@x.test' }, { day: DAY, action: 'skriver', ttlMs: 60000 })
  assert.equal((await mona.service.loadSheet(MONA)).lock.mine, true)
  assert.equal((await mona.service.loadSheet(namesake)).lock.mine, false)
  assert.equal((await ada.service.loadSheet(ADA)).lock.mine, false)
  await release()
})

test('a write holds the lock with the day and what is done', async () => {
  const { service, excel, shared } = setup()
  await service.load(MONA)
  let held = null
  excel.state.hook = async () => { held = await shared.lock.current() }
  await service.writeDay(MONA, DAY)
  assert.equal(held.name, 'Mona Berg')
  assert.equal(held.day, DAY)
  assert.equal(held.action, 'skriver')
  assert.ok(held.expiresAt - held.at >= 2 * 60000 + 3 * 5000 + 60000, 'the Excel time limit plus a margin')
  assert.equal(await shared.lock.current(), null)
})

test('the lock is released when Excel fails', async () => {
  const { service, excel, shared } = setup()
  await service.load(MONA)
  excel.state.hook = async () => { throw Object.assign(new Error('FINLAND_EXCEL_FAILED: Excel brugte for lang tid.'), { code: 'FINLAND_EXCEL_FAILED' }) }
  await assert.rejects(service.writeDay(MONA, DAY), { code: 'FINLAND_EXCEL_FAILED' })
  assert.equal(await shared.lock.current(), null)
  assert.deepEqual(await shared.dayLog.days(), {}, 'nothing is logged as written')
  const release = await shared.lock.acquire(ANNA, { day: DAY, action: 'skriver' })
  await release()
})

test('parcels written by a colleague in the last 30 minutes are not written again', async () => {
  const { service, excel, shared, clock } = setup()
  const missing = missingOn(await service.load(MONA), DAY)
  await shared.dayLog.record(ANNA, DAY, [keyOf(missing[0])])
  await service.writeDay(MONA, DAY)
  assert.deepEqual(appended(excel), missing.slice(1).map(keyOf), "Anna's parcel is not written although Mona's sheet lacks it")
  clock.now += 31 * 60000
  await service.writeDay(MONA, DAY)
  assert.deepEqual(appended(excel), [...missing.slice(1), missing[0]].map(keyOf), 'after 30 minutes the sheet decides again')
})

test('not-sent parcels are never written', async () => {
  const { service, excel, shared } = setup()
  const missing = missingOn(await service.load(MONA), DAY)
  // Anna marks a parcel on her PC after Mona loaded.
  await shared.notSent.mark(ANNA, { delivery: String(missing[1].delivery), tracking: missing[1].tracking, shippedOn: DAY })
  const snap = await service.writeDay(MONA, DAY)
  assert.deepEqual(appended(excel), [keyOf(missing[0]), keyOf(missing[2])])
  const notSent = snap.days.find(d => d.date === DAY).notSent
  assert.deepEqual(notSent.map(x => [x.key, x.markedBy]), [[keyOf(missing[1]), 'Anna Holm']])
  await assert.rejects(service.fixReview(MONA, String(missing[1].delivery), missing[1].tracking), { code: 'FINLAND_NOT_SENT' })
  await assert.rejects(service.markNotSent(MONA, '123', pn(99)), { code: 'FINLAND_PARCEL_NOT_FOUND' })
  const restored = await service.restoreNotSent(MONA, keyOf(missing[1]))
  assert.deepEqual(restored.days.find(d => d.date === DAY).missing.map(keyOf), [keyOf(missing[1])])
  await assert.rejects(service.restoreNotSent(MONA, keyOf(missing[1])), { code: 'FINLAND_NOT_MARKED' })
})

test('marking a parcel not sent is refused while a job runs', async () => {
  const { service, excel } = setup()
  const missing = missingOn(await service.load(MONA), DAY)
  let open
  const gate = new Promise(resolve => { open = resolve })
  excel.state.hook = () => gate
  const writing = service.writeDay(MONA, DAY)
  await waitFor(() => excel.writes().length === 1)
  await assert.rejects(service.loadSheet(MONA), { code: 'FINLAND_BUSY', message: 'FINLAND_BUSY: Vent, programmet arbejder stadig.' })
  await assert.rejects(service.markNotSent(MONA, String(missing[0].delivery), missing[0].tracking), { code: 'FINLAND_BUSY' })
  open()
  await writing
  await service.markNotSent(MONA, String(missing[0].delivery), missing[0].tracking)
})

test('a review fix adds the parcel under its delivery or replaces a duplicated T&T', async () => {
  const parcels = [parcel('82100001', pn(1)), parcel('82100001', pn(2)), parcel('82100002', pn(3)), parcel('82100002', pn(4)), parcel('82100003', pn(5)), parcel('82100003', pn(6))]
  const sheet = [sheetRow(2, '82100001', pn(1)), sheetRow(3, '82100002', pn(3)), sheetRow(4, '82100002', pn(3)), sheetRow(5, '82100003', pn(5)), sheetRow(6, '82100009', pn(9))]
  const { service, excel, shared } = setup({ sheet, parcels })
  const snap = await service.load(MONA)
  assert.deepEqual(snap.days[0].review.map(r => r.action.kind), ['add', 'replace-duplicate', 'add'])

  const added = await service.fixReview(MONA, '82100001', pn(2))
  assert.deepEqual(added.fixed, { kind: 'add', tracking: pn(2), row: 7, skipped: 0 })
  assert.deepEqual(excel.writes()[0].placement, { afterRow: 2, afterDelivery: '82100001' })
  const replaced = await service.fixReview(MONA, '82100002', pn(4))
  assert.deepEqual(replaced.fixed, { kind: 'replace', tracking: pn(4), row: 4, oldTracking: pn(3) })
  assert.deepEqual(excel.writes()[1].fix, { kind: 'replace-duplicate', row: 4, oldTracking: pn(3), newTracking: pn(4), courier: 'Postnord', delivery: '82100002' })
  assert.deepEqual([...await shared.dayLog.recentKeys()].sort(), [parcelKey('82100001', pn(2)), parcelKey('82100002', pn(4))])

  // Written by a colleague a moment ago: counted as in the sheet.
  await shared.dayLog.record(ANNA, '2026-11-20', [parcelKey('82100003', pn(6))])
  const already = await service.fixReview(MONA, '82100003', pn(6))
  assert.deepEqual(already.fixed, { kind: 'already', tracking: pn(6) })
  assert.equal(excel.writes().length, 2)
})

test('a review fix that needs a person names the rows', async () => {
  const parcels = [parcel('82100002', pn(3)), parcel('82100002', pn(4))]
  const sheet = [sheetRow(3, '82100002', pn(7)), sheetRow(4, '82100002', pn(8))]
  const { service, excel, shared } = setup({ sheet, parcels })
  await service.load(MONA)
  await assert.rejects(service.fixReview(MONA, '82100002', pn(4)), {
    code: 'FINLAND_FIX_MANUAL',
    message: 'FINLAND_FIX_MANUAL: Kolliet kan ikke rettes automatisk. Leveringen står i række 3, 4. Ret det i hånden i arket.',
  })
  assert.deepEqual(excel.writes(), [])
  assert.equal(await shared.lock.current(), null)
})

const FOLLOW_SHEET = [
  sheetRow(2, '82100001', pn(1), '2026-11-20'),
  sheetRow(3, '82100002', pn(2), '2026-11-20'),
  sheetRow(4, '82100003', pn(3), '2026-11-23'),
]
const K1 = parcelKey('82100001', pn(1))
const K2 = parcelKey('82100002', pn(2))
const K3 = parcelKey('82100003', pn(3))
const rowOf = (snap, key) => snap.followUp.rows.find(r => r.key === key)

test("a colleague's unsaved change is shown on the parcel but does not block", async () => {
  const { pc } = setup({ sheet: FOLLOW_SHEET })
  const anna = pc()
  const mona = pc()
  await anna.service.loadSheet(ANNA)
  await anna.service.saveDraft(ANNA, K1, { received: '2026-11-23', sla: 'OK' }, false, BLANK)
  assert.equal(await anna.service.pending(ANNA), 1)

  const seen = await mona.service.loadSheet(MONA)
  assert.deepEqual(rowOf(seen, K1).othersPending, ['Anna Holm'])
  assert.deepEqual(rowOf(seen, K2).othersPending, [])
  assert.deepEqual(seen.followUp.othersByDay, { '2026-11-20': [{ name: 'Anna Holm', count: 1 }] })
  assert.equal(seen.followUp.pendingTotal, 0, "Anna's drafts are not Mona's")
  assert.equal(rowOf(seen, K1).pending, false)

  const saved = await mona.service.saveDraft(MONA, K1, { received: '2026-11-24', sla: 'NOK' }, false, BLANK)
  assert.equal(rowOf(saved, K1).pending, true)
  assert.deepEqual(rowOf(saved, K1).effective, { ...BLANK, received: '2026-11-24', sla: 'NOK' })
  assert.deepEqual(rowOf(saved, K1).othersPending, ['Anna Holm'])
  assert.equal(await mona.service.pending(MONA), 1)
})

test("follow-up save sends only the person's own drafts", async () => {
  const { pc, shared } = setup({ sheet: FOLLOW_SHEET })
  const anna = pc()
  const mona = pc()
  await anna.service.loadSheet(ANNA)
  await anna.service.saveDraft(ANNA, K2, { comment: 'Annas' }, false, BLANK)
  await mona.service.loadSheet(MONA)
  await mona.service.saveDraft(MONA, K1, { received: '2026-11-23', sla: 'OK' }, false, BLANK)
  await mona.service.saveDraft(MONA, K3, { comment: 'Monas' }, false, BLANK)

  let held = null
  mona.excel.state.hook = async () => { held = await shared.lock.current() }
  const snap = await mona.service.saveFollowUp(MONA, null)
  const sent = mona.excel.writes()
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].list.map(w => [w.row, w.cells]), [[2, { received: '2026-11-23', sla: 'OK' }], [4, { comment: 'Monas' }]])
  assert.deepEqual(snap.followUpResult, { written: 2, moved: 0, conflicts: 0, notFound: 0 })
  assert.equal(snap.followUp.pendingTotal, 0)
  assert.deepEqual([held.name, held.day, held.action], ['Mona Berg', '2026-11-20', 'gemmer opfølgning'])
  assert.equal(await shared.lock.current(), null)
  assert.equal(snap.dayLog['2026-11-20'].byName, 'Mona Berg')
  assert.equal(snap.dayLog['2026-11-23'].byName, 'Mona Berg')
  assert.equal((await shared.drafts(ANNA.email).all()).length, 1, "Anna's draft stays hers")
  assert.equal(rowOf(snap, K2).effective.comment, '', "Anna's change is not in the sheet")
})

test('a parcel changed in the sheet since it was read is skipped until the conflict is resolved', async () => {
  const { service, excel } = setup({ sheet: FOLLOW_SHEET })
  await service.loadSheet(MONA)
  await service.saveDraft(MONA, K1, { received: '2026-11-23', sla: 'OK' }, false, BLANK)
  await service.saveDraft(MONA, K2, { comment: 'Ok' }, false, BLANK)
  // A colleague writes Received on the same parcel in the meantime.
  excel.state.rows[0].followUp.received = '2026-11-24'
  const snap = await service.saveFollowUp(MONA, '2026-11-20')
  assert.deepEqual(excel.writes()[0].list.map(w => w.row), [3], 'the parcel with the conflict is not written at all')
  assert.deepEqual(snap.followUpResult, { written: 1, moved: 0, conflicts: 1, notFound: 0 })
  assert.deepEqual(rowOf(snap, K1).conflicts, [{ key: K1, field: 'received', original: '', current: '2026-11-24', wanted: '2026-11-23' }])
  assert.equal(snap.followUp.pendingTotal, 1)

  const resolved = await service.resolveConflict(MONA, K1, 'received', 'mine')
  assert.deepEqual(rowOf(resolved, K1).conflicts, [])
  await assert.rejects(service.resolveConflict(MONA, K1, 'received', 'mine'), { code: 'FINLAND_CONFLICT_GONE' })
  await service.saveFollowUp(MONA, '2026-11-20')
  assert.deepEqual(excel.writes()[1].list.map(w => [w.row, w.cells]), [[2, { received: '2026-11-23', sla: 'OK' }]])
  assert.equal(await service.pending(MONA), 0)
})

test('a draft is refused for a parcel the sheet does not have once', async () => {
  const sheet = [...FOLLOW_SHEET, sheetRow(5, '82100003', pn(3), '2026-11-23')]
  const { service } = setup({ sheet })
  await service.loadSheet(MONA)
  await assert.rejects(service.saveDraft(MONA, parcelKey('1', pn(9)), { comment: 'x' }, false, BLANK), { code: 'FINLAND_NOT_IN_SHEET' })
  await assert.rejects(service.saveDraft(MONA, K3, { comment: 'x' }, false, BLANK), { code: 'FINLAND_DUPLICATE' })
})

const DELETE_PARCELS = [parcel('82100001', pn(1)), parcel('82100002', pn(2))]
const DELETE_KEY = parcelKey('82100001', pn(1))

test('only admins delete a row', async () => {
  const sheet = [sheetRow(2, '82100002', pn(2)), sheetRow(3, '82100001', pn(1), '2026-11-20', { comment: 'x' })]
  const { pc, shared } = setup({ sheet, parcels: DELETE_PARCELS, admins: [ADA.email] })
  const mona = pc()
  await mona.service.load(MONA)
  await mona.service.markNotSent(MONA, '82100001', pn(1))
  const before = mona.excel.calls.length
  await assert.rejects(mona.service.deleteNotSentRow(MONA, DELETE_KEY, 3), { code: 'FINLAND_ADMIN_ONLY' })
  assert.equal(mona.excel.calls.length, before, 'Excel is not touched')

  const ada = pc(sheet)
  await ada.service.load(ADA)
  let held = null
  ada.excel.state.hook = async () => { held = await shared.lock.current() }
  const snap = await ada.service.deleteNotSentRow(ADA, DELETE_KEY, 3)
  assert.deepEqual(ada.excel.writes().map(c => c.target), [{ row: 3, delivery: '82100001', tracking: pn(1) }])
  assert.deepEqual(snap.deleted, { kind: 'deleted', tracking: pn(1), row: 3 })
  assert.equal(held.action, 'sletter række')
  assert.equal(snap.dayLog['2026-11-20'].byName, 'Ada Admin')
  assert.equal(await shared.lock.current(), null)
  const gone = await ada.service.deleteNotSentRow(ADA, DELETE_KEY, 3)
  assert.deepEqual(gone.deleted, { kind: 'gone', tracking: pn(1) })
})

test('a row is deleted only when the parcel is on exactly that one row', async () => {
  const cases = [
    { sheet: [sheetRow(3, '82100001', pn(1)), sheetRow(4, '82100001', pn(1))], row: 3, code: 'FINLAND_ROW_NOT_UNIQUE' },
    { sheet: [sheetRow(2, '82100002', pn(2)), sheetRow(4, '82100001', pn(1))], row: 3, code: 'FINLAND_ROW_MOVED' },
    { sheet: [sheetRow(3, '82100001', `${pn(1)}\n${pn(8)}`)], row: 3, code: 'FINLAND_ROW_SHARED' },
  ]
  for (const c of cases) {
    const { service, excel, shared } = setup({ sheet: c.sheet, parcels: DELETE_PARCELS, admins: [ADA.email] })
    await service.load(ADA)
    await service.markNotSent(ADA, '82100001', pn(1))
    await assert.rejects(service.deleteNotSentRow(ADA, DELETE_KEY, c.row), { code: c.code })
    assert.deepEqual(excel.writes(), [], c.code)
    assert.equal(await shared.lock.current(), null)
  }
  const { service } = setup({ parcels: DELETE_PARCELS, admins: [ADA.email] })
  await assert.rejects(service.deleteNotSentRow(ADA, DELETE_KEY, 3), { code: 'FINLAND_NOT_MARKED' })
})

test('no row is deleted when a colleague restores the parcel while the sheet is read under the lock', async () => {
  const sheet = [sheetRow(2, '82100002', pn(2)), sheetRow(3, '82100001', pn(1), '2026-11-20', { received: '2026-11-22' })]
  const { pc, shared } = setup({ sheet, parcels: DELETE_PARCELS, admins: [ADA.email] })
  const mona = pc()
  await mona.service.load(MONA)
  await mona.service.markNotSent(MONA, '82100001', pn(1))
  const ada = pc(sheet)
  await ada.service.load(ADA)
  const read = ada.excel.readSheet
  let restoredUnderLock = false
  ada.excel.readSheet = async () => {
    if (!restoredUnderLock && await shared.lock.current()) {
      restoredUnderLock = true
      // A colleague's restore that looked at the lock just before it was taken.
      assert.equal(await shared.notSent.restore(DELETE_KEY), true)
    }
    return read()
  }
  await assert.rejects(ada.service.deleteNotSentRow(ADA, DELETE_KEY, 3), { code: 'FINLAND_NOT_MARKED' })
  assert.ok(restoredUnderLock, 'the restore ran during the read under the lock')
  assert.equal(ada.excel.writes().filter(c => c.kind === 'delete').length, 0, 'deleteRow is never called')
  assert.deepEqual(ada.excel.state.rows.map(r => r.row), [2, 3])
  assert.equal(await shared.lock.current(), null)
  assert.deepEqual(await shared.notSent.list(), [])
})

test('a parcel cannot be restored while someone deletes a row in the sheet', async () => {
  const { service, shared } = setup({ parcels: DELETE_PARCELS })
  await service.load(MONA)
  await service.markNotSent(MONA, '82100001', pn(1))
  const release = await shared.lock.acquire(ADA, { day: '2026-11-20', action: 'sletter række', ttlMs: 60000 })
  await assert.rejects(service.restoreNotSent(MONA, DELETE_KEY), { code: 'FINLAND_LOCKED', message: 'FINLAND_LOCKED: Ada Admin sletter en række i arket lige nu. Prøv igen om lidt.' })
  assert.equal((await shared.notSent.list()).length, 1, 'still marked')
  await release()
  // Writing other rows does not touch the parcel's row, so it does not hold a restore back.
  const writing = await shared.lock.acquire(ADA, { day: '2026-11-20', action: 'skriver', ttlMs: 60000 })
  await service.restoreNotSent(MONA, DELETE_KEY)
  assert.deepEqual(await shared.notSent.list(), [])
  await writing()
})

test('a row typed in by hand is checked against the sheet as it is now before it is written', async () => {
  const sheet = [sheetRow(2, '82100001', pn(1), '2026-11-20')]
  const { service, excel, shared } = setup({ sheet })
  await service.loadSheet(MONA)
  const input = { delivery: '82100005', orderType: 'zro', postalCode: '00100', courier: 'DSV', tracking: '00157145000000000005', pickedUp: '2026-11-23' }
  assert.equal(service.checkManual(MONA, input).ok, true)

  await shared.dayLog.record(ANNA, '2026-11-23', [parcelKey('82100005', '00157145000000000005')])
  const recent = await service.addManualRow(MONA, input)
  assert.equal(recent.manual.ok, false)
  assert.ok(recent.manual.errors.tracking)
  assert.deepEqual(excel.writes(), [])

  const other = { ...input, tracking: '00157145000000000006' }
  const snap = await service.addManualRow(MONA, other)
  assert.equal(snap.manual.ok, true)
  assert.equal(snap.manual.row, 3)
  assert.deepEqual(excel.writes()[0].rows, [{ delivery: 82100005, orderType: 'ZRO', postalCode: 100, courier: 'DSV', tracking: '00157145000000000006', pickedUp: '2026-11-23' }])
  assert.equal(snap.dayLog['2026-11-23'].byName, 'Mona Berg')
  const twice = await service.addManualRow(MONA, other)
  assert.equal(twice.manual.ok, false, 'the sheet now has it')
  assert.equal(excel.writes().length, 1)
})
