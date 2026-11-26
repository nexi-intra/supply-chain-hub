// Finlandsforsendelser's service: holds the SAP list and the sheet as last read for this hub window, and decides what
// may be written to the shared sheet. Ported from Finland T&T's app/service.cjs. Every sheet write reads the shared
// not-sent list first, takes the shared write lock, reads the sheet again, writes, logs the write and frees the lock.
const { sapDateRange } = require('./core/dateRange.cjs')
const { buildSheetIndex, parcelKey, normalizeDelivery, trackingsInCell } = require('./core/sheetIndex.cjs')
const { normalizeTracking, courierFor } = require('./core/courier.cjs')
const { reviewAction } = require('./core/reviewAction.cjs')
const { compareParcels, REASONS } = require('./core/compare.cjs')
const { toSheetRows } = require('./core/newRows.cjs')
const { dayOverview, defaultDay } = require('./core/dayOverview.cjs')
const { insertionPoint } = require('./core/placement.cjs')
const { expectedSuggestion, receivedChoices, isFollowedUp, followUpDays, topComments, duplicateKeys } = require('./core/followUp.cjs')
const { planWrites, resolveDraft, mergeDraft } = require('./core/followUpSync.cjs')
const { checkManualRow } = require('./core/manualRow.cjs')
const { appendTimeoutMs, sheetStateText, MESSAGES } = require('./excel.cjs')

const BUSY_TEXT = 'Vent, programmet arbejder stadig.'
const MONTHS_BACK = 2
// Time limits of the Excel scripts (excel.cjs): reading and the single-row scripts get five minutes.
const SCRIPT_TIMEOUT_MS = 5 * 60000
const LOCK_MARGIN_MS = 60000
const COURIERS = ['DHL', 'Postnord', 'DSV']

function codeError(code, text) {
  return Object.assign(new Error(text ? `${code}: ${text}` : code), { code })
}

const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const sapToIso = s => s.split('.').reverse().join('-')
const busyError = () => codeError('FINLAND_BUSY', BUSY_TEXT)
const notInSapError = () => codeError('FINLAND_PARCEL_NOT_FOUND', 'Kolliet findes ikke i SAP-listen. Tryk "Hent igen".')
const notMarkedError = () => codeError('FINLAND_NOT_MARKED', 'Kolliet er ikke markeret som ikke sendt.')
const notSentText = 'Kolliet er markeret som ikke sendt. Tryk "Sæt ind igen" først.'
const sheetBusyText = 'Vent, arket bliver skrevet lige nu.'
const keyOfEntry = e => parcelKey(e.delivery, e.tracking)

/**
 * `fetchParcels(range)` runs ZMS_CONS_INFO for { from, to } (dd.mm.yyyy) and gives the parsed parcels; SAP readiness is
 * checked by the caller. `isAdmin(user)` says whether the user may delete rows. Users are { email, fullName, ... }.
 */
function createFinlandService({ shared, excel, fetchParcels, isAdmin, now = Date.now }) {
  let busy = null
  // Quick changes to shared data (drafts, not-sent marks) run one after the other, and no sheet job starts meanwhile.
  let quickCount = 0
  let quickTail = Promise.resolve()
  let parcels = null
  let range = null
  let sheetRows = []
  let sheet = null
  let loadedAt = null
  const conflictsByUser = new Map()

  const draftsOf = user => shared.drafts(user.email, user.fullName)
  const today = () => isoDate(new Date(now()))

  function conflictsOf(user) {
    const email = String(user.email || '').trim().toLowerCase()
    if (!conflictsByUser.has(email)) conflictsByUser.set(email, new Map())
    return conflictsByUser.get(email)
  }

  async function exclusive(label, fn) {
    if (busy || quickCount) throw busyError()
    busy = label
    try {
      return await fn()
    } finally {
      busy = null
    }
  }

  /** `refusal()` gives the error to refuse with now, or a falsy value. */
  function quick(refusal, fn) {
    const refused = refusal()
    if (refused) return Promise.reject(refused)
    quickCount++
    const run = quickTail.then(fn)
    quickTail = run.catch(() => {})
    return run.finally(() => { quickCount-- })
  }

  /**
   * The order every sheet write follows. The shared not-sent list must be readable before Excel is touched. The lock is
   * taken for reading the sheet and, through `extend(writeMs)`, again for the write's own time limit once its size is
   * known. `work` reads the sheet, writes and logs; the lock is freed whatever happens.
   */
  async function sheetWrite(user, { day, action }, work) {
    await shared.notSent.list()
    let release = await shared.lock.acquire(user, { day, action, ttlMs: SCRIPT_TIMEOUT_MS + LOCK_MARGIN_MS })
    const extend = async writeMs => {
      release = await shared.lock.acquire(user, { day, action, ttlMs: writeMs + LOCK_MARGIN_MS })
    }
    try {
      return await work(extend)
    } finally {
      // A lock that cannot be freed runs out by itself; the result of the write must not be lost over it.
      await release().catch(() => {})
    }
  }

  async function notSentKeys() {
    return new Set((await shared.notSent.list()).map(keyOfEntry))
  }

  /** Keys that must not be written: marked not sent, or written by someone in the last 30 minutes. */
  async function blockedKeys() {
    const [notSent, recent] = await Promise.all([notSentKeys(), shared.dayLog.recentKeys()])
    return { notSent, recent }
  }

  /** The sheet index with recently written parcels counted as in the sheet, though this PC's Excel may not show them yet. */
  function indexWithRecent(recent) {
    const index = buildSheetIndex(sheetRows)
    for (const key of recent) {
      index.keys.add(key)
      index.deliveries.add(key.split('|')[0])
    }
    return index
  }

  async function refreshSheet(keepFilterNote = false) {
    const read = await excel.readSheet()
    sheetRows = read.rows
    const filterRemoved = read.filterRemoved || (keepFilterNote && !!sheet?.filterRemoved)
    sheet = { wasOpen: read.wasOpen, filterRemoved, texts: sheetStateText({ wasOpen: read.wasOpen, filterRemoved }) }
  }

  const row = p => toSheetRows([p])[0]

  function sheetRowsFor(delivery, tracking) {
    const d = normalizeDelivery(delivery)
    const t = normalizeTracking(tracking)
    return sheetRows.filter(r => normalizeDelivery(r.delivery) === d && trackingsInCell(r.trackingText).includes(t))
  }

  function findParcel(delivery, tracking) {
    const key = parcelKey(delivery, tracking)
    return (parcels || []).find(p => parcelKey(p.delivery, p.tracking) === key) || null
  }

  function followUpRows(own, others, conflicts) {
    const dups = duplicateKeys(sheetRows)
    const sapByKey = new Map((parcels || []).map(p => [parcelKey(p.delivery, p.tracking), p]))
    const draftByKey = new Map(own.map(d => [parcelKey(d.delivery, d.tracking), d]))
    return sheetRows
      .filter(r => normalizeDelivery(r.delivery) && r.pickedUp)
      .map(r => {
        const tracking = trackingsInCell(r.trackingText)[0] || ''
        const key = tracking ? parcelKey(r.delivery, tracking) : ''
        const draft = key ? draftByKey.get(key) : null
        const sheetValues = r.followUp || { expected: '', received: '', sla: '', comment: '', terminal: '' }
        const effective = { ...sheetValues, ...(draft ? draft.fields : {}) }
        const courier = COURIERS.includes(r.courier) ? r.courier : courierFor(tracking)
        const sap = sapByKey.get(key)
        return {
          key,
          row: r.row,
          delivery: normalizeDelivery(r.delivery),
          orderType: r.orderType || '',
          postalCode: r.postalCode || '',
          courier,
          tracking,
          pickedUp: r.pickedUp,
          sheet: sheetValues,
          effective,
          pending: !!draft,
          slaManual: !!draft?.slaManual,
          othersPending: key ? others.filter(o => o.keys.includes(key)).map(o => o.name) : [],
          suggestedExpected: expectedSuggestion({
            courier, postalCode: sap ? sap.postalCode : r.postalCode, country: sap ? sap.country : 'FI', pickedUp: r.pickedUp,
          }),
          receivedChoices: receivedChoices(r.pickedUp),
          duplicate: !!key && dups.has(key),
          noTracking: !tracking,
          conflicts: conflicts.get(key) || [],
          done: isFollowedUp(effective, courier),
        }
      })
  }

  function othersByDay(others) {
    const result = {}
    for (const person of others) {
      for (const [day, count] of Object.entries(person.byDay)) (result[day] = result[day] || []).push({ name: person.name, count })
    }
    return result
  }

  function followUpSnapshot(user, own, others) {
    const rows = followUpRows(own, others, conflictsOf(user))
    return {
      days: followUpDays(rows.map(x => ({ row: x.row, delivery: x.delivery, pickedUp: x.pickedUp, courier: x.courier, followUp: x.effective }))),
      rows,
      comments: topComments(sheetRows),
      pendingTotal: own.length,
      pendingByDay: own.reduce((acc, d) => ({ ...acc, [d.pickedUp]: (acc[d.pickedUp] || 0) + 1 }), {}),
      othersByDay: othersByDay(others),
    }
  }

  async function snapshot(user) {
    const [notSent, settings, dayLog, lock, own, others] = await Promise.all([
      shared.notSent.list(), shared.settings.get(), shared.dayLog.days(), shared.lock.current(), draftsOf(user).all(), shared.drafts.others(user.email),
    ])
    const notSentByKey = new Map(notSent.map(e => [keyOfEntry(e), e]))
    const days = parcels ? dayOverview(parcels, buildSheetIndex(sheetRows), new Set(notSentByKey.keys())) : []
    const todayIso = today()
    return {
      range: range ? { from: sapToIso(range.from), to: sapToIso(range.to) } : null,
      today: todayIso,
      defaultDay: defaultDay(days, todayIso),
      loadedAt,
      sheet: sheet ? { ...sheet, isTest: !!settings.isTest } : null,
      dayLog,
      lock: lock ? { byName: lock.name || lock.email, day: lock.day, action: lock.action } : null,
      followUp: followUpSnapshot(user, own, others),
      days: days.map(d => ({
        date: d.date,
        total: d.total,
        status: d.status,
        missing: toSheetRows(d.missing),
        review: d.review.map(r => ({
          ...row(r.parcel),
          reason: REASONS[r.reason] || r.reason,
          action: r.reason === 'nyt-tt' ? reviewAction(r.parcel, parcels, sheetRows) : { kind: 'manual', rows: [] },
        })),
        inSheet: toSheetRows(d.inSheet),
        notSent: d.notSent.map(({ parcel }) => {
          const key = parcelKey(parcel.delivery, parcel.tracking)
          const rows = sheetRowsFor(parcel.delivery, parcel.tracking).map(r => ({
            row: r.row, pickedUp: r.pickedUp, orderType: r.orderType, postalCode: r.postalCode, courier: r.courier,
            trackingText: r.trackingText, shared: trackingsInCell(r.trackingText).length > 1, followUp: r.followUp || null,
          }))
          return { ...row(parcel), key, markedBy: notSentByKey.get(key)?.byName || '', sheetRows: rows }
        }),
      })),
    }
  }

  /** The person's follow-up changes not in the sheet yet; known without reading the sheet. */
  async function pending(user) {
    return (await draftsOf(user).all()).length
  }

  // Reads only the sheet, so Opfølgning works while SAP is not ready.
  function loadSheet(user) {
    return exclusive('sheet', async () => {
      await refreshSheet()
      return snapshot(user)
    })
  }

  function load(user) {
    return exclusive('load', async () => {
      await refreshSheet()
      const wanted = sapDateRange(new Date(now()), MONTHS_BACK)
      parcels = await fetchParcels(wanted)
      range = wanted
      loadedAt = new Date(now()).toISOString()
      return snapshot(user)
    })
  }

  function writeDay(user, date) {
    return exclusive('write', async () => {
      if (!parcels) throw codeError('FINLAND_NO_SAP_LIST', 'Hent fra SAP først.')
      const dayParcels = parcels.filter(p => p.shippedOn === date)
      let result = { added: 0, skipped: 0, firstRow: null, lastRow: null, weekFormulaOk: true }
      const written = await sheetWrite(user, { day: date, action: 'skriver' }, async extend => {
        // Someone may have added rows since the list was shown, so the day is compared again first.
        await refreshSheet(true)
        const { notSent, recent } = await blockedKeys()
        const rows = toSheetRows(compareParcels(dayParcels, indexWithRecent(recent), null, notSent).toAdd)
        if (!rows.length) return false
        await extend(appendTimeoutMs(rows.length))
        result = await excel.appendRows(rows, insertionPoint(sheetRows, date))
        await shared.dayLog.record(user, date, rows.map(r => parcelKey(r.delivery, r.tracking)))
        return true
      })
      if (written) await refreshSheet(true)
      return { result, ...(await snapshot(user)) }
    })
  }

  function fixReview(user, delivery, tracking) {
    return exclusive('fix', async () => {
      if (!parcels) throw codeError('FINLAND_NO_SAP_LIST', 'Hent fra SAP først.')
      const parcel = findParcel(delivery, tracking)
      if (!parcel) throw notInSapError()
      const key = parcelKey(delivery, tracking)
      if ((await notSentKeys()).has(key)) throw codeError('FINLAND_NOT_SENT', notSentText)
      let fixed = null
      await sheetWrite(user, { day: parcel.shippedOn, action: 'retter' }, async extend => {
        // The sheet is read again and the action worked out anew, so it is based on what is there now.
        await refreshSheet(true)
        const { notSent, recent } = await blockedKeys()
        if (notSent.has(key)) throw codeError('FINLAND_NOT_SENT', notSentText)
        if (recent.has(key) || buildSheetIndex(sheetRows).keys.has(key)) {
          fixed = { kind: 'already', tracking }
          return
        }
        const action = reviewAction(parcel, parcels, sheetRows)
        if (action.kind === 'add') {
          await extend(appendTimeoutMs(1))
          const result = await excel.appendRows(toSheetRows([parcel]), { afterRow: action.afterRow, afterDelivery: action.afterDelivery })
          fixed = { kind: 'add', tracking, row: result.firstRow, skipped: result.skipped }
        } else if (action.kind === 'replace-duplicate' || action.kind === 'replace-unknown') {
          await extend(SCRIPT_TIMEOUT_MS)
          await excel.replaceTracking({ ...action, delivery: normalizeDelivery(delivery) })
          fixed = { kind: 'replace', tracking, row: action.row, oldTracking: action.oldTracking }
        } else {
          const where = action.rows.length ? ` Leveringen står i række ${action.rows.join(', ')}.` : ''
          throw codeError('FINLAND_FIX_MANUAL', `Kolliet kan ikke rettes automatisk.${where} Ret det i hånden i arket.`)
        }
        await shared.dayLog.record(user, parcel.shippedOn, [key])
      })
      if (fixed.kind !== 'already') await refreshSheet(true)
      return { fixed, ...(await snapshot(user)) }
    })
  }

  // Keeps the fields the user touched. "base" is what the form showed from the sheet when the parcel was opened.
  function saveDraft(user, key, wanted, slaManual, base) {
    return quick(() => busy === 'followup' && codeError('FINLAND_BUSY', sheetBusyText), async () => {
      const drafts = draftsOf(user)
      const own = await drafts.all()
      const r = followUpRows(own, [], conflictsOf(user)).find(x => x.key === key)
      if (!r) throw codeError('FINLAND_NOT_IN_SHEET', 'Kolliet findes ikke i arket. Tryk "Hent igen".')
      if (r.duplicate) throw codeError('FINLAND_DUPLICATE', 'Kolliet står to gange i arket. Ret det under Skriv ind først.')
      const existing = own.find(d => parcelKey(d.delivery, d.tracking) === key) || null
      const next = mergeDraft({ existing, base: { ...r.sheet, ...(base || {}) }, wanted, slaManual, delivery: r.delivery, tracking: r.tracking, pickedUp: r.pickedUp })
      if (next) await drafts.set(key, next)
      else if (existing) await drafts.remove([key])
      return snapshot(user)
    })
  }

  /** Writes the person's own drafts for `date` (all days when null). Other people's drafts are never sent. */
  function saveFollowUp(user, date) {
    return exclusive('followup', async () => {
      const drafts = draftsOf(user)
      const conflicts = conflictsOf(user)
      const forDay = async () => (await drafts.all()).filter(d => !date || d.pickedUp === date)
      const days = [...new Set((await forDay()).map(d => d.pickedUp).filter(Boolean))].sort()
      const lockDay = date || days[0] || today()
      let result = { written: [], moved: [] }
      const written = await sheetWrite(user, { day: lockDay, action: 'gemmer opfølgning' }, async extend => {
        await refreshSheet(true)
        const list = await forDay()
        const plan = planWrites(list, sheetRows)
        if (!plan.writes.length) return false
        await extend(appendTimeoutMs(plan.writes.length))
        result = await excel.writeFollowUp(plan.writes)
        const dayOf = new Map(list.map(d => [parcelKey(d.delivery, d.tracking), d.pickedUp]))
        const writtenDays = [...new Set(plan.writes.map(w => dayOf.get(parcelKey(w.delivery, w.tracking))).filter(Boolean))].sort()
        for (const day of writtenDays) await shared.dayLog.record(user, day, [])
        return true
      })
      if (written) await refreshSheet(true)
      // Worked out again from the sheet as it is now: what is in the sheet is done, the rest stays.
      const after = planWrites(await forDay(), sheetRows)
      await drafts.remove(after.done)
      for (const k of after.done) conflicts.delete(k)
      for (const c of after.conflicts) conflicts.set(c.key, after.conflicts.filter(x => x.key === c.key))
      return {
        followUpResult: {
          written: result.written.length,
          moved: result.moved.length,
          conflicts: new Set(after.conflicts.map(c => c.key)).size,
          notFound: after.notFound.length,
        },
        ...(await snapshot(user)),
      }
    })
  }

  function resolveConflict(user, key, field, choice) {
    return quick(() => busy === 'followup' && codeError('FINLAND_BUSY', sheetBusyText), async () => {
      const drafts = draftsOf(user)
      const conflicts = conflictsOf(user)
      const draft = await drafts.get(key)
      const conflict = (conflicts.get(key) || []).find(c => c.field === field)
      if (!draft || !conflict) throw codeError('FINLAND_CONFLICT_GONE', 'Konflikten findes ikke længere. Tryk "Hent igen".')
      const next = resolveDraft(draft, conflict, choice)
      if (next) await drafts.set(key, next)
      else await drafts.remove([key])
      const left = (conflicts.get(key) || []).filter(c => c.field !== field)
      if (left.length) conflicts.set(key, left)
      else conflicts.delete(key)
      return snapshot(user)
    })
  }

  // A row typed in by hand. "check" only validates against the sheet as last read; "add" reads it again and writes.
  function checkManual(user, input) {
    return checkManualRow(input, sheetRows, new Date(now()))
  }

  function addManualRow(user, input) {
    return exclusive('manual', async () => {
      let manual = null
      const written = await sheetWrite(user, { day: String(input?.pickedUp || ''), action: 'skriver' }, async extend => {
        await refreshSheet(true)
        const check = checkManualRow(input, sheetRows, new Date(now()))
        if (check.ok) {
          // Not in this PC's sheet yet is not enough: a colleague may just have written it, or it is marked not sent.
          const { notSent, recent } = await blockedKeys()
          const key = parcelKey(check.row.delivery, check.row.tracking)
          if (notSent.has(key)) Object.assign(check, { ok: false, errors: { tracking: notSentText } })
          else if (recent.has(key)) Object.assign(check, { ok: false, errors: { tracking: 'Kolliet er skrevet i arket for lidt siden. Tryk "Læs arket".' } })
        }
        if (!check.ok) {
          manual = { ok: false, errors: check.errors }
          return false
        }
        await extend(appendTimeoutMs(1))
        const result = await excel.appendRows([check.row], insertionPoint(sheetRows, check.row.pickedUp))
        await shared.dayLog.record(user, check.row.pickedUp, [parcelKey(check.row.delivery, check.row.tracking)])
        manual = { ok: true, row: result.firstRow, skipped: result.skipped, weekFormulaOk: result.weekFormulaOk, tracking: check.row.tracking }
        return true
      })
      if (written) await refreshSheet(true)
      return { manual, ...(await snapshot(user)) }
    })
  }

  // Marking only changes the shared list; the sheet is not touched.
  function markNotSent(user, delivery, tracking) {
    return quick(() => busy && busy !== 'sheet' && busyError(), async () => {
      const parcel = findParcel(delivery, tracking)
      if (!parcel) throw notInSapError()
      await shared.notSent.mark(user, {
        delivery: normalizeDelivery(parcel.delivery),
        tracking: normalizeTracking(parcel.tracking),
        shippedOn: parcel.shippedOn,
        orderType: parcel.orderType,
        postalCode: parcel.postalCode,
      })
      return snapshot(user)
    })
  }

  function restoreNotSent(user, key) {
    return quick(() => busy && busy !== 'sheet' && busyError(), async () => {
      if (!(await shared.notSent.restore(key))) throw notMarkedError()
      return snapshot(user)
    })
  }

  // Deletes the parcel's row from the sheet. "row" is the row number the user saw in the confirmation.
  function deleteNotSentRow(user, key, row) {
    return exclusive('delete', async () => {
      if (!(await isAdmin(user))) throw codeError('FINLAND_ADMIN_ONLY', 'Kun admin kan slette en række i arket.')
      const entry = (await shared.notSent.list()).find(e => keyOfEntry(e) === key)
      if (!entry) throw notMarkedError()
      let deleted = null
      await sheetWrite(user, { day: entry.shippedOn, action: 'sletter række' }, async extend => {
        await refreshSheet(true)
        // A colleague may have pressed "Sæt ind igen" while the lock was taken and the sheet read; restoring takes no lock.
        const current = (await shared.notSent.list()).find(e => keyOfEntry(e) === key)
        if (!current) throw codeError('FINLAND_NOT_MARKED', 'Kolliet er ikke længere markeret som ikke sendt. Intet er slettet.')
        const matches = sheetRowsFor(current.delivery, current.tracking)
        if (!matches.length) {
          deleted = { kind: 'gone', tracking: current.tracking }
          return
        }
        if (matches.length > 1) throw codeError('FINLAND_ROW_NOT_UNIQUE', `Kolliet står i række ${matches.map(m => m.row).join(', ')}. Intet er slettet. Slet den forkerte række i hånden.`)
        if (matches[0].row !== row) throw codeError('FINLAND_ROW_MOVED', `Arket er ændret, og kolliet står nu i række ${matches[0].row}. Intet er slettet. Tjek rækken, og prøv igen.`)
        if (trackingsInCell(matches[0].trackingText).length !== 1) throw codeError('FINLAND_ROW_SHARED', MESSAGES['row-shared'])
        await extend(SCRIPT_TIMEOUT_MS)
        await excel.deleteRow({ row, delivery: current.delivery, tracking: current.tracking })
        await shared.dayLog.record(user, current.shippedOn, [])
        deleted = { kind: 'deleted', tracking: current.tracking, row }
      })
      if (deleted.kind === 'deleted') {
        await draftsOf(user).remove([key])
        conflictsOf(user).delete(key)
        await refreshSheet(true)
      }
      return { deleted, ...(await snapshot(user)) }
    })
  }

  return {
    load, loadSheet, writeDay, fixReview, saveDraft, saveFollowUp, resolveConflict, checkManual, addManualRow,
    markNotSent, restoreNotSent, deleteNotSentRow, pending, snapshot,
  }
}

module.exports = { createFinlandService, BUSY_TEXT }
