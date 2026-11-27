const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { parseSapList } = require('./core/sapList.cjs')
const { parcelKey } = require('./core/sheetIndex.cjs')
const { courierFor } = require('./core/courier.cjs')
const { createFinlandShared, TEST_WORKBOOK_URL } = require('./shared.cjs')
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

/** nShift as the service sees it: `answers[tracking]` is a timeline, null (unknown) or an Error to throw. */
function fakeNshift(answers = {}) {
  const calls = []
  return {
    calls,
    tests: 0,
    async lookup(tracking, pickedUp) {
      calls.push([tracking, pickedUp])
      const answer = answers[tracking]
      if (answer instanceof Error) throw answer
      return answer ? structuredClone(answer) : null
    },
    async test() {
      this.tests++
      return true
    },
  }
}

function setup({ sheet = SHEET, parcels = SAP, admins = [], nshift = fakeNshift() } = {}) {
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
      nshift,
      now: () => clock.now,
    })
    return { excel, service }
  }
  return { dir, store, clock, shared, ranges, nshift, pc, ...pc() }
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

test('what was fetched earlier is given back without reading SAP or the sheet again', async () => {
  const { service, excel, ranges } = setup()
  assert.equal(await service.current(MONA), null, 'nothing fetched yet')
  const loaded = await service.load(MONA)
  const reads = excel.calls.filter(c => c.kind === 'read').length
  const again = await service.current(ANNA)
  assert.equal(ranges.length, 1)
  assert.equal(excel.calls.filter(c => c.kind === 'read').length, reads)
  assert.equal(again.loadedAt, loaded.loadedAt)
  assert.deepEqual(again.days.map(d => d.date), loaded.days.map(d => d.date))
})

test('after only reading the sheet, it is given back too', async () => {
  const { service, excel } = setup()
  await service.loadSheet(MONA)
  const reads = excel.calls.length
  const again = await service.current(MONA)
  assert.ok(again.sheet)
  assert.equal(again.range, null)
  assert.equal(excel.calls.length, reads)
})

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
  assert.deepEqual(snap.dayLog[DAY], { byName: 'Mona Berg', at: NOW, count: 3, workbookUrl: TEST_WORKBOOK_URL })
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

const REAL = 'https://christianiabpos.sharepoint.com/sites/NordicSupplyChain/Ordre.xlsx'
const BOSS = { email: 'boss@x.test', fullName: 'Boss', role: 'manager', team: 'TCD', tools: ['finland'] }
const useRealSheet = shared => shared.settings.set(BOSS, { workbookUrl: REAL, sheetName: 'Sheet1', tableName: 'Table2' })
const excelFailure = excelCode => Object.assign(new Error('FINLAND_EXCEL_FAILED: Excel stoppede midt i skrivningen.'), { code: 'FINLAND_EXCEL_FAILED', excelCode })

test('a write stops before Excel when the lock ran out and a colleague wrote meanwhile', async () => {
  const { service, excel, shared, clock } = setup()
  await service.load(MONA)
  const read = excel.readSheet
  let interfered = false
  excel.readSheet = async () => {
    const result = await read()
    if (!interfered && await shared.lock.current()) {
      interfered = true
      // The read under the lock outlasts the lock; Anna takes it, writes and frees it before Mona's PC goes on.
      clock.now += 7 * 60000
      const anna = await shared.lock.acquire(ANNA, { day: DAY, action: 'skriver', ttlMs: 60000 })
      await anna()
    }
    return result
  }
  await assert.rejects(service.writeDay(MONA, DAY), { code: 'FINLAND_LOCKED', message: /Intet er skrevet/ })
  assert.ok(interfered)
  assert.deepEqual(excel.writes(), [], 'Excel is not called')
  assert.equal(await shared.lock.current(), null)
})

test('rows Excel may have written before it failed are not written again by a colleague', async () => {
  for (const excelCode of ['write-failed', 'write-timeout', 'save-failed']) {
    const { service, excel, shared, pc } = setup()
    const missing = missingOn(await service.load(MONA), DAY)
    excel.state.hook = async kind => { if (kind === 'append') throw excelFailure(excelCode) }
    await assert.rejects(service.writeDay(MONA, DAY), { code: 'FINLAND_EXCEL_FAILED', message: /først skrives igen om 30 minutter/ }, excelCode)
    assert.deepEqual([...await shared.dayLog.recentKeys()].sort(), missing.map(keyOf).sort(), excelCode)
    assert.deepEqual(await shared.dayLog.days(), {}, 'no day summary for a write that failed')
    const anna = pc()
    await anna.service.load(ANNA)
    await anna.service.writeDay(ANNA, DAY)
    assert.deepEqual(appended(anna.excel), [], `${excelCode}: Anna's PC does not write what may be in the sheet already`)
  }
  // Excel refused before writing anything: nothing is held back.
  const { service, excel, shared } = setup()
  await service.load(MONA)
  excel.state.hook = async kind => { if (kind === 'append') throw excelFailure('sheet-moved') }
  await assert.rejects(service.writeDay(MONA, DAY), { code: 'FINLAND_EXCEL_FAILED' })
  assert.deepEqual([...await shared.dayLog.recentKeys()], [])
})

test('rows written while M: cannot log them are a success with a warning', async () => {
  const { service, shared } = setup()
  await service.load(MONA)
  shared.dayLog.record = async () => { throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' }) }
  const snap = await service.writeDay(MONA, DAY)
  assert.equal(snap.result.added, 3)
  assert.deepEqual(snap.warnings, ['Arket er skrevet, men programmet kunne ikke notere det på M:. Bed kollegaer vente et par minutter, før de skriver samme dag.'])
  assert.equal(snap.days.find(d => d.date === DAY).status, 'full')
  assert.equal(await shared.lock.current(), null)
})

test('after switching to the real sheet the test sheet\'s marks and written keys do not hold it back', async () => {
  const { service, excel, shared } = setup()
  const missing = missingOn(await service.load(MONA), DAY)
  await service.markNotSent(MONA, String(missing[0].delivery), missing[0].tracking)
  await shared.dayLog.record(ANNA, DAY, [keyOf(missing[1])])
  await useRealSheet(shared)
  const snap = await service.writeDay(MONA, DAY)
  assert.deepEqual(appended(excel), missing.map(keyOf))
  assert.deepEqual(snap.days.find(d => d.date === DAY).notSent, [])
  assert.deepEqual(snap.dayLog[DAY], { byName: 'Mona Berg', at: NOW, count: 3, workbookUrl: REAL })
  await assert.rejects(service.restoreNotSent(MONA, keyOf(missing[0])), { code: 'FINLAND_NOT_MARKED' })

  // A mark made now belongs to the real sheet.
  await service.markNotSent(MONA, String(missing[2].delivery), missing[2].tracking)
  assert.deepEqual((await shared.notSent.list(REAL)).map(keyOf), [keyOf(missing[2])])
})

test('after switching to the real sheet the test sheet\'s drafts are neither counted, shown nor sent', async () => {
  const { pc, shared } = setup({ sheet: FOLLOW_SHEET })
  const anna = pc()
  const mona = pc()
  await anna.service.loadSheet(ANNA)
  await anna.service.saveDraft(ANNA, K1, { comment: 'Test' }, false, BLANK)
  await mona.service.loadSheet(MONA)
  await mona.service.saveDraft(MONA, K2, { comment: 'Test' }, false, BLANK)
  await useRealSheet(shared)

  assert.equal(await mona.service.pending(MONA), 0)
  const seen = await mona.service.loadSheet(MONA)
  assert.equal(seen.followUp.pendingTotal, 0)
  assert.deepEqual(seen.followUp.pendingByDay, {})
  assert.deepEqual(seen.followUp.othersByDay, {})
  assert.deepEqual(rowOf(seen, K1).othersPending, [])
  assert.equal(rowOf(seen, K2).pending, false)
  const saved = await mona.service.saveFollowUp(MONA, null)
  assert.deepEqual(mona.excel.writes(), [], 'nothing from the test sheet is sent to the real one')
  assert.deepEqual(saved.followUpResult, { written: 0, moved: 0, conflicts: 0, notFound: 0 })

  await mona.service.saveDraft(MONA, K3, { comment: 'Rigtig' }, false, BLANK)
  assert.equal(await mona.service.pending(MONA), 1)
  await mona.service.saveFollowUp(MONA, null)
  assert.deepEqual(mona.excel.writes()[0].list.map(w => [w.row, w.cells]), [[4, { comment: 'Rigtig' }]])
  assert.deepEqual((await shared.drafts(MONA.email).all()).map(d => d.workbookUrl), [TEST_WORKBOOK_URL], 'the test sheet\'s draft stays until a manager clears it')
})

// Made-up timelines: only times, status codes and place names.
const AT_VANTAA = { at: '2026-11-21T08:00:00.000Z', statusId: 2003, status: 'Arrived', text: 'Arrived at terminal', place: 'VANTAA Vantaa FIN' }
const DELIVERED = { at: '2026-11-23T10:00:00.000Z', statusId: 3000, status: 'Delivered', text: 'Delivered', place: 'HELSINKI Helsinki FIN' }
const timelineOf = (tracking, events) => ({ tracking, carrier: 'Postnord API', events })
const NSHIFT_ANSWERS = { [pn(1)]: timelineOf(pn(1), [AT_VANTAA, DELIVERED]), [pn(2)]: timelineOf(pn(2), [AT_VANTAA]) }
const FETCHED_AT = new Date(NOW).toISOString()
const codeErr = code => Object.assign(new Error(`${code}: test`), { code })

test('fetching a day stores timelines and gives suggestions on the rows', async () => {
  const nshift = fakeNshift(NSHIFT_ANSWERS)
  const { service, shared, pc, excel } = setup({ sheet: FOLLOW_SHEET, nshift })
  await service.loadSheet(MONA)
  const before = excel.calls.length
  const snap = await service.fetchStatus(MONA, { date: '2026-11-20' })
  assert.deepEqual(nshift.calls, [[pn(1), '2026-11-20'], [pn(2), '2026-11-20']])
  assert.deepEqual(snap.statusResult, { fetched: 2, notFound: 0, failed: 0 })
  assert.equal(excel.calls.length, before, 'the sheet is neither read nor written')
  assert.deepEqual(rowOf(snap, K1).nshift, {
    fetchedAt: FETCHED_AT,
    events: [AT_VANTAA, DELIVERED],
    firstAttempt: '2026-11-23',
    delivered: '2026-11-23',
    suggestion: { received: '2026-11-23', sla: 'OK', terminal: 'Vantaa', comment: 'Delay Finland, Vanta term' },
  })
  assert.deepEqual(rowOf(snap, K2).nshift.suggestion, { received: null, sla: null, terminal: 'Vantaa', comment: null })
  assert.equal(rowOf(snap, K2).nshift.delivered, null)
  assert.equal(rowOf(snap, K3).nshift, null, 'another day is not fetched')
  assert.deepEqual(await shared.statuses.get([pn(1)]), { [pn(1)]: { ...NSHIFT_ANSWERS[pn(1)], fetchedAt: FETCHED_AT } })
  // A colleague sees the timelines without fetching.
  const anna = pc()
  const seen = await anna.service.loadSheet(ANNA)
  assert.deepEqual(rowOf(seen, K1).nshift, rowOf(snap, K1).nshift)
})

test('a delivered timeline is not fetched again for the day but is for one parcel', async () => {
  const nshift = fakeNshift(NSHIFT_ANSWERS)
  const { service, clock } = setup({ sheet: FOLLOW_SHEET, nshift })
  await service.loadSheet(MONA)
  await service.fetchStatus(MONA, { date: '2026-11-20' })
  clock.now = NOW + 60000
  const again = await service.fetchStatus(MONA, { date: '2026-11-20' })
  assert.deepEqual(nshift.calls.slice(2), [[pn(2), '2026-11-20']], 'only the parcel not delivered yet')
  assert.deepEqual(again.statusResult, { fetched: 1, notFound: 0, failed: 0 })
  assert.equal(rowOf(again, K1).nshift.fetchedAt, FETCHED_AT)
  const one = await service.fetchStatus(MONA, { key: K1 })
  assert.deepEqual(nshift.calls.slice(3), [[pn(1), '2026-11-20']])
  assert.deepEqual(one.statusResult, { fetched: 1, notFound: 0, failed: 0 })
  assert.equal(rowOf(one, K1).nshift.fetchedAt, new Date(NOW + 60000).toISOString())
  await assert.rejects(service.fetchStatus(MONA, { key: parcelKey('1', pn(9)) }), { code: 'FINLAND_NOT_IN_SHEET' })
})

test('one failed parcel does not stop the day', async () => {
  const sheet = [...FOLLOW_SHEET, sheetRow(5, '82100004', pn(4), '2026-11-20')]
  const nshift = fakeNshift({ [pn(1)]: codeErr('FINLAND_NSHIFT_FAILED'), [pn(4)]: timelineOf(pn(4), [DELIVERED]) })
  const { service, shared } = setup({ sheet, nshift })
  await service.loadSheet(MONA)
  const snap = await service.fetchStatus(MONA, { date: '2026-11-20' })
  assert.equal(nshift.calls.length, 3)
  assert.deepEqual(snap.statusResult, { fetched: 1, notFound: 1, failed: 1 })
  assert.deepEqual(Object.keys(await shared.statuses.get([pn(1), pn(2), pn(4)])), [pn(4)])
  assert.equal(rowOf(snap, K1).nshift, null)

  // Without a key that works every parcel would fail the same way, so the first such error stops the day.
  for (const code of ['FINLAND_NSHIFT_NOT_SET', 'FINLAND_NSHIFT_REFUSED']) {
    const refusing = fakeNshift({ [pn(1)]: codeErr(code), [pn(2)]: codeErr(code) })
    const other = setup({ sheet: FOLLOW_SHEET, nshift: refusing })
    await other.service.loadSheet(MONA)
    await assert.rejects(other.service.fetchStatus(MONA, { date: '2026-11-20' }), { code })
    assert.equal(refusing.calls.length, 1)
    await other.service.loadSheet(MONA)
  }
})

test('apply suggestions never overwrites a filled field', async () => {
  const sheet = [sheetRow(2, '82100001', pn(1), '2026-11-20', { comment: 'Kept' }), ...FOLLOW_SHEET.slice(1)]
  const nshift = fakeNshift(NSHIFT_ANSWERS)
  const { service } = setup({ sheet, nshift })
  await service.loadSheet(MONA)
  await service.saveDraft(MONA, K1, { terminal: 'Turku' }, false, { ...BLANK, comment: 'Kept' })
  await service.fetchStatus(MONA, { date: '2026-11-20' })
  const snap = await service.applySuggestions(MONA, { date: '2026-11-20' })
  assert.equal(snap.applied, 1, 'the parcel not delivered yet gets nothing')
  assert.deepEqual(rowOf(snap, K1).effective, { expected: '2026-11-24', received: '2026-11-23', sla: 'OK', comment: 'Kept', terminal: 'Turku' })
  assert.equal(rowOf(snap, K1).slaManual, false, 'the SLA is the automatic one')
  assert.equal(rowOf(snap, K2).pending, false)
  const again = await service.applySuggestions(MONA, { date: '2026-11-20' })
  assert.equal(again.applied, 0, 'nothing left to fill')
})

test('apply suggestions makes drafts, never sheet writes', async () => {
  const nshift = fakeNshift(NSHIFT_ANSWERS)
  const { service, excel, shared } = setup({ sheet: FOLLOW_SHEET, nshift })
  await service.loadSheet(MONA)
  await service.fetchStatus(MONA, { date: '2026-11-20' })
  const before = excel.calls.length
  const snap = await service.applySuggestions(MONA, { date: '2026-11-20' })
  assert.equal(excel.calls.length, before, 'Excel is not touched')
  assert.deepEqual(excel.writes(), [])
  assert.equal(snap.applied, 1)
  assert.equal(snap.followUp.pendingTotal, 1)
  const [{ updatedAt, ...draft }] = await shared.drafts(MONA.email).all()
  assert.equal(updatedAt, FETCHED_AT)
  assert.deepEqual(draft, {
    delivery: '82100001', tracking: pn(1), pickedUp: '2026-11-20', workbookUrl: TEST_WORKBOOK_URL, slaManual: false, original: BLANK,
    fields: { expected: '2026-11-24', received: '2026-11-23', sla: 'OK', comment: 'Delay Finland, Vanta term', terminal: 'Vantaa' },
  })
  assert.deepEqual(await shared.drafts(ANNA.email).all(), [])
  // Saving in the sheet is still its own step.
  await service.saveFollowUp(MONA, '2026-11-20')
  assert.deepEqual(excel.writes()[0].list.map(w => w.row), [2])
})

test('DSV parcels are not looked up', async () => {
  const dsv = `00157145${'1'.padStart(12, '0')}`
  const dhl = `JD${'1'.padStart(18, '0')}`
  const sheet = [
    sheetRow(2, '82100001', dsv, '2026-11-20'),
    sheetRow(3, '82100002', dhl, '2026-11-20'),
    sheetRow(4, '82100003', pn(3), '2026-11-20'),
    sheetRow(5, '82100003', pn(3), '2026-11-20'),
  ]
  const nshift = fakeNshift()
  const { service } = setup({ sheet, nshift })
  await service.loadSheet(MONA)
  const snap = await service.fetchStatus(MONA, { date: '2026-11-20' })
  assert.deepEqual(nshift.calls, [[dhl, '2026-11-20']], 'DSV and a parcel twice in the sheet are skipped')
  assert.deepEqual(snap.statusResult, { fetched: 0, notFound: 1, failed: 0 })
  const one = await service.fetchStatus(MONA, { key: parcelKey('82100001', dsv) })
  assert.equal(nshift.calls.length, 1)
  assert.deepEqual(one.statusResult, { fetched: 0, notFound: 0, failed: 0 })
})

test('only managers set and test the nShift key, and the window never gets the secret', async () => {
  const { service, nshift } = setup()
  const MANAGER = { ...MONA, role: 'manager' }
  assert.deepEqual(await service.nshiftStatus(), { configured: false, clientIdEnding: '' })
  await assert.rejects(service.setNshift(MONA, { clientId: 'test-client-0001', clientSecret: 'fake-secret' }), { code: 'MANAGER_ONLY' })
  const status = await service.setNshift(MANAGER, { clientId: 'test-client-0001', clientSecret: 'fake-secret' })
  assert.deepEqual(status, { configured: true, clientIdEnding: '0001' })
  assert.deepEqual(await service.nshiftStatus(), status)
  await assert.rejects(service.testNshift(MONA), { code: 'MANAGER_ONLY' })
  await assert.rejects(service.testNshift({ ...MANAGER, statusManager: true }), { code: 'MANAGER_ONLY' })
  assert.equal(nshift.tests, 0)
  const tested = await service.testNshift(MANAGER)
  assert.equal(nshift.tests, 1)
  assert.ok(!JSON.stringify(tested).includes('fake-secret'))
})
