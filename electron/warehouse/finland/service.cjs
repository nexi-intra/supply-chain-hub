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
const { planWrites, resolveDraft, mergeDraft, FIELDS } = require('./core/followUpSync.cjs')
const { facts, suggest } = require('./core/nshiftRules.cjs')
const { checkManualRow } = require('./core/manualRow.cjs')
const { appendTimeoutMs, sheetStateText, MESSAGES } = require('./excel.cjs')
const { workbookOf } = require('./shared.cjs')

const BUSY_TEXT = 'Vent, programmet arbejder stadig.'
const MONTHS_BACK = 2
// Time limits of the Excel scripts (excel.cjs): reading and the single-row scripts get five minutes.
const SCRIPT_TIMEOUT_MS = 5 * 60000
const LOCK_MARGIN_MS = 60000
const COURIERS = ['DHL', 'Postnord', 'DSV']
// nShift knows the parcels booked with these; DSV is followed up by hand.
const NSHIFT_COURIERS = ['Postnord', 'DHL']
// A key that is missing or refused fails every parcel the same way, so the first such error stops the day.
const NSHIFT_STOPS = new Set(['FINLAND_NSHIFT_NOT_SET', 'FINLAND_NSHIFT_REFUSED'])

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
const DELETE_ACTION = 'sletter række'
const keyOfEntry = e => parcelKey(e.delivery, e.tracking)
const forWorkbook = (list, workbookUrl) => list.filter(entry => workbookOf(entry) === workbookUrl)
// Excel stopped while writing rows, or wrote them without saving: some of them may be in the sheet.
const PARTLY_WRITTEN = new Set(['write-failed', 'write-timeout', 'save-failed'])
const PARTLY_WRITTEN_TEXT = 'Kolli, der ikke nåede at komme i arket, kan først skrives igen om 30 minutter, så intet kommer to gange.'
const NOT_LOGGED_TEXT = 'Arket er skrevet, men programmet kunne ikke notere det på M:. Bed kollegaer vente et par minutter, før de skriver samme dag.'
const isManager = user => (user?.role === 'manager' || user?.role === 'creator') && !user.statusManager
const notInSheetError = () => codeError('FINLAND_NOT_IN_SHEET', 'Kolliet findes ikke i arket. Tryk "Hent igen".')

/** What a row shows from nShift: the timeline, the first attempt and delivery, and the suggestions from the rules. */
function nshiftOf(timeline, { courier, pickedUp, effective, suggestedExpected }) {
  if (!timeline) return null
  const s = suggest({ timeline, courier, pickedUp, expected: effective.expected || suggestedExpected })
  return {
    fetchedAt: timeline.fetchedAt,
    events: timeline.events,
    firstAttempt: s.firstAttempt,
    delivered: s.delivered,
    suggestion: { received: s.received, sla: s.sla, terminal: s.terminal, comment: s.comment },
  }
}

/**
 * `fetchParcels(range)` runs ZMS_CONS_INFO for { from, to } (dd.mm.yyyy) and gives the parsed parcels; SAP readiness is
 * checked by the caller. `isAdmin(user)` says whether the user may delete rows. `nshift` is the nShift client
 * (nshift.cjs). Users are { email, fullName, ... }.
 */
function createFinlandService({ shared, excel, fetchParcels, isAdmin, nshift = null, now = Date.now }) {
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
   * taken for reading the sheet and, through `extend(writeMs)`, renewed for the write's own time limit once its size is
   * known; a lock that ran out meanwhile (a colleague may have written) stops the write. `work(extend, workbookUrl)`
   * reads the sheet, writes and logs; the lock is freed whatever happens.
   */
  async function sheetWrite(user, { day, action }, work) {
    await shared.notSent.list()
    const release = await shared.lock.acquire(user, { day, action, ttlMs: SCRIPT_TIMEOUT_MS + LOCK_MARGIN_MS })
    const extend = writeMs => shared.lock.renew(release.token, { ttlMs: writeMs + LOCK_MARGIN_MS })
    try {
      const { workbookUrl } = await shared.settings.get()
      return await work(extend, workbookUrl)
    } finally {
      // A lock that cannot be freed runs out by itself; the result of the write must not be lost over it.
      await release().catch(() => {})
    }
  }

  const currentWorkbook = async () => (await shared.settings.get()).workbookUrl

  /**
   * Appends rows to the sheet. When Excel stopped partway (or did not save), the rows are logged as written anyway (as
   * far as M: allows), so no one writes them a second time while this PC's sheet read may not show them.
   */
  async function append(user, rows, placement, workbookUrl) {
    try {
      return await excel.appendRows(rows, placement)
    } catch (error) {
      if (error?.code === 'FINLAND_EXCEL_FAILED' && PARTLY_WRITTEN.has(error.excelCode)) {
        await shared.dayLog.record(user, '', rows.map(r => parcelKey(r.delivery, r.tracking)), { workbookUrl }).catch(() => {})
        error.message = `${error.message} ${PARTLY_WRITTEN_TEXT}`
      }
      throw error
    }
  }

  /** Logs a write that is in the sheet. When M: fails here the write still stands, so it becomes a warning, not an error. */
  async function logWrite(user, day, recorded, workbookUrl, warnings) {
    try {
      await shared.dayLog.record(user, day, recorded, { workbookUrl })
    } catch {
      if (!warnings.includes(NOT_LOGGED_TEXT)) warnings.push(NOT_LOGGED_TEXT)
    }
  }

  async function notSentKeys(workbookUrl) {
    return new Set((await shared.notSent.list(workbookUrl)).map(keyOfEntry))
  }

  /** Keys that must not be written to the sheet: marked not sent, or written by someone in the last 30 minutes. */
  async function blockedKeys(workbookUrl) {
    const [notSent, recent] = await Promise.all([notSentKeys(workbookUrl), shared.dayLog.recentKeys(undefined, workbookUrl)])
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

  /** `timelines` holds the stored nShift timeline per T&T (shared.statuses.get). */
  function followUpRows(own, others, conflicts, timelines = {}) {
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
        const suggestedExpected = expectedSuggestion({
          courier, postalCode: sap ? sap.postalCode : r.postalCode, country: sap ? sap.country : 'FI', pickedUp: r.pickedUp,
        })
        const timeline = tracking && Object.hasOwn(timelines, tracking) ? timelines[tracking] : null
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
          suggestedExpected,
          receivedChoices: receivedChoices(r.pickedUp),
          duplicate: !!key && dups.has(key),
          noTracking: !tracking,
          conflicts: conflicts.get(key) || [],
          done: isFollowedUp(effective, courier),
          nshift: nshiftOf(timeline, { courier, pickedUp: r.pickedUp, effective, suggestedExpected }),
        }
      })
  }

  /** The stored nShift timelines for the first T&T of every row in the sheet as last read. */
  function timelinesForSheet() {
    const trackings = [...new Set(sheetRows.map(r => trackingsInCell(r.trackingText)[0]).filter(Boolean))]
    return trackings.length ? shared.statuses.get(trackings) : {}
  }

  function othersByDay(others) {
    const result = {}
    for (const person of others) {
      for (const [day, count] of Object.entries(person.byDay)) (result[day] = result[day] || []).push({ name: person.name, count })
    }
    return result
  }

  function followUpSnapshot(user, own, others, timelines) {
    const rows = followUpRows(own, others, conflictsOf(user), timelines)
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
    const settings = await shared.settings.get()
    const book = settings.workbookUrl
    // Only what belongs to the sheet written now: drafts and marks made in the test sheet stay out of the real one.
    const [notSent, dayLog, lock, allOwn, others, admin, timelines] = await Promise.all([
      shared.notSent.list(book), shared.dayLog.days(book), shared.lock.current(), draftsOf(user).all(), shared.drafts.others(user.email, book),
      isAdmin(user), timelinesForSheet(),
    ])
    const own = forWorkbook(allOwn, book)
    const myEmail = String(user.email || '').trim().toLowerCase()
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
      // The window shows the delete button only to admins; deleteNotSentRow checks again.
      isAdmin: !!admin,
      // `mine` by e-mail, since two people can share a name.
      lock: lock ? { byName: lock.name || lock.email, day: lock.day, action: lock.action, mine: lock.email === myEmail } : null,
      followUp: followUpSnapshot(user, own, others, timelines),
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

  /** The person's follow-up changes for the current sheet not in it yet; known without reading the sheet. */
  async function pending(user) {
    const [all, book] = await Promise.all([draftsOf(user).all(), currentWorkbook()])
    return forWorkbook(all, book).length
  }

  // What was fetched earlier in this Hub, so leaving the tool or switching hub keeps it; reads neither SAP nor the sheet.
  async function current(user) {
    if (!parcels && !sheet) return null
    return snapshot(user)
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
      const warnings = []
      const written = await sheetWrite(user, { day: date, action: 'skriver' }, async (extend, book) => {
        // Someone may have added rows since the list was shown, so the day is compared again first.
        await refreshSheet(true)
        const { notSent, recent } = await blockedKeys(book)
        const rows = toSheetRows(compareParcels(dayParcels, indexWithRecent(recent), null, notSent).toAdd)
        if (!rows.length) return false
        await extend(appendTimeoutMs(rows.length))
        result = await append(user, rows, insertionPoint(sheetRows, date), book)
        await logWrite(user, date, rows.map(r => parcelKey(r.delivery, r.tracking)), book, warnings)
        return true
      })
      if (written) await refreshSheet(true)
      return { result, warnings, ...(await snapshot(user)) }
    })
  }

  function fixReview(user, delivery, tracking) {
    return exclusive('fix', async () => {
      if (!parcels) throw codeError('FINLAND_NO_SAP_LIST', 'Hent fra SAP først.')
      const parcel = findParcel(delivery, tracking)
      if (!parcel) throw notInSapError()
      const key = parcelKey(delivery, tracking)
      if ((await notSentKeys(await currentWorkbook())).has(key)) throw codeError('FINLAND_NOT_SENT', notSentText)
      let fixed = null
      const warnings = []
      await sheetWrite(user, { day: parcel.shippedOn, action: 'retter' }, async (extend, book) => {
        // The sheet is read again and the action worked out anew, so it is based on what is there now.
        await refreshSheet(true)
        const { notSent, recent } = await blockedKeys(book)
        if (notSent.has(key)) throw codeError('FINLAND_NOT_SENT', notSentText)
        if (recent.has(key) || buildSheetIndex(sheetRows).keys.has(key)) {
          fixed = { kind: 'already', tracking }
          return
        }
        const action = reviewAction(parcel, parcels, sheetRows)
        if (action.kind === 'add') {
          await extend(appendTimeoutMs(1))
          const result = await append(user, toSheetRows([parcel]), { afterRow: action.afterRow, afterDelivery: action.afterDelivery }, book)
          fixed = { kind: 'add', tracking, row: result.firstRow, skipped: result.skipped }
        } else if (action.kind === 'replace-duplicate' || action.kind === 'replace-unknown') {
          await extend(SCRIPT_TIMEOUT_MS)
          await excel.replaceTracking({ ...action, delivery: normalizeDelivery(delivery) })
          fixed = { kind: 'replace', tracking, row: action.row, oldTracking: action.oldTracking }
        } else {
          const where = action.rows.length ? ` Leveringen står i række ${action.rows.join(', ')}.` : ''
          throw codeError('FINLAND_FIX_MANUAL', `Kolliet kan ikke rettes automatisk.${where} Ret det i hånden i arket.`)
        }
        await logWrite(user, parcel.shippedOn, [key], book, warnings)
      })
      if (fixed.kind !== 'already') await refreshSheet(true)
      return { fixed, warnings, ...(await snapshot(user)) }
    })
  }

  // Keeps the fields the user touched. "base" is what the form showed from the sheet when the parcel was opened.
  function saveDraft(user, key, wanted, slaManual, base) {
    return quick(() => busy === 'followup' && codeError('FINLAND_BUSY', sheetBusyText), async () => {
      const drafts = draftsOf(user)
      const book = await currentWorkbook()
      const own = forWorkbook(await drafts.all(), book)
      const r = followUpRows(own, [], conflictsOf(user)).find(x => x.key === key)
      if (!r) throw codeError('FINLAND_NOT_IN_SHEET', 'Kolliet findes ikke i arket. Tryk "Hent igen".')
      if (r.duplicate) throw codeError('FINLAND_DUPLICATE', 'Kolliet står to gange i arket. Ret det under Skriv ind først.')
      const existing = own.find(d => parcelKey(d.delivery, d.tracking) === key) || null
      const next = mergeDraft({ existing, base: { ...r.sheet, ...(base || {}) }, wanted, slaManual, delivery: r.delivery, tracking: r.tracking, pickedUp: r.pickedUp })
      // The draft belongs to the sheet written now; one left from another sheet under the same key is replaced.
      if (next) await drafts.set(key, { ...next, workbookUrl: book })
      else if (existing) await drafts.remove([key])
      return snapshot(user)
    })
  }

  /** Writes the person's own drafts for `date` (all days when null). Other people's drafts are never sent. */
  function saveFollowUp(user, date) {
    return exclusive('followup', async () => {
      const drafts = draftsOf(user)
      const conflicts = conflictsOf(user)
      let book = await currentWorkbook()
      const forDay = async () => forWorkbook(await drafts.all(), book).filter(d => !date || d.pickedUp === date)
      const days = [...new Set((await forDay()).map(d => d.pickedUp).filter(Boolean))].sort()
      const lockDay = date || days[0] || today()
      let result = { written: [], moved: [] }
      const warnings = []
      const written = await sheetWrite(user, { day: lockDay, action: 'gemmer opfølgning' }, async (extend, lockedBook) => {
        book = lockedBook
        await refreshSheet(true)
        const list = await forDay()
        const plan = planWrites(list, sheetRows)
        if (!plan.writes.length) return false
        await extend(appendTimeoutMs(plan.writes.length))
        result = await excel.writeFollowUp(plan.writes)
        const dayOf = new Map(list.map(d => [parcelKey(d.delivery, d.tracking), d.pickedUp]))
        const writtenDays = [...new Set(plan.writes.map(w => dayOf.get(parcelKey(w.delivery, w.tracking))).filter(Boolean))].sort()
        for (const day of writtenDays) await logWrite(user, day, [], book, warnings)
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
        warnings,
        ...(await snapshot(user)),
      }
    })
  }

  function resolveConflict(user, key, field, choice) {
    return quick(() => busy === 'followup' && codeError('FINLAND_BUSY', sheetBusyText), async () => {
      const drafts = draftsOf(user)
      const conflicts = conflictsOf(user)
      const [draft, book] = await Promise.all([drafts.get(key), currentWorkbook()])
      const conflict = (conflicts.get(key) || []).find(c => c.field === field)
      if (!draft || workbookOf(draft) !== book || !conflict) throw codeError('FINLAND_CONFLICT_GONE', 'Konflikten findes ikke længere. Tryk "Hent igen".')
      const next = resolveDraft(draft, conflict, choice)
      if (next) await drafts.set(key, next)
      else await drafts.remove([key])
      const left = (conflicts.get(key) || []).filter(c => c.field !== field)
      if (left.length) conflicts.set(key, left)
      else conflicts.delete(key)
      return snapshot(user)
    })
  }

  const nshiftNotSetError = () => codeError('FINLAND_NSHIFT_NOT_SET', 'nShift er ikke sat op. En manager kan sætte det op under Administration.')

  /**
   * Looks up the day's PostNord and DHL parcels in nShift (`{ date }`), or one parcel (`{ key }`), and stores the
   * timelines for everyone. For a day, parcels whose stored timeline is delivered are not fetched again. A failed
   * parcel is counted and the rest go on. Reads neither SAP nor the sheet.
   */
  function fetchStatus(user, { date, key } = {}) {
    return exclusive('nshift', async () => {
      if (!date && !key) throw codeError('FINLAND_INVALID_INPUT', 'Vælg en dag eller et kolli.')
      const rows = followUpRows([], [], conflictsOf(user)).filter(r => (key ? r.key === key : r.pickedUp === date))
      if (key && !rows.length) throw notInSheetError()
      const wanted = new Map()
      for (const r of rows) {
        if (NSHIFT_COURIERS.includes(r.courier) && r.tracking && !r.duplicate && !wanted.has(r.tracking)) wanted.set(r.tracking, r.pickedUp)
      }
      const stored = key || !wanted.size ? {} : await shared.statuses.get([...wanted.keys()])
      const todo = [...wanted].filter(([tracking]) => !(stored[tracking] && facts(stored[tracking]).delivered))
      if (todo.length && !nshift) throw nshiftNotSetError()
      const statusResult = { fetched: 0, notFound: 0, failed: 0 }
      const found = []
      let stop = null
      for (const [tracking, pickedUp] of todo) {
        try {
          const timeline = await nshift.lookup(tracking, pickedUp)
          if (timeline) {
            found.push({ ...timeline, tracking, fetchedAt: new Date(now()).toISOString() })
            statusResult.fetched++
          } else {
            statusResult.notFound++
          }
        } catch (error) {
          if (!statusResult.failed && NSHIFT_STOPS.has(error?.code)) {
            stop = error
            break
          }
          statusResult.failed++
        }
      }
      if (found.length) await shared.statuses.put(found)
      if (stop) throw stop
      return { statusResult, ...(await snapshot(user)) }
    })
  }

  /**
   * Turns nShift's suggestions into the person's drafts for every delivered parcel on `date`, as if Enter was pressed on
   * each: only fields that are empty in the sheet and not changed by the person, with the suggested Expected the rules
   * used. The sheet is not touched; it is written by "Gem i arket" as always.
   */
  function applySuggestions(user, { date } = {}) {
    return quick(() => busy === 'followup' && codeError('FINLAND_BUSY', sheetBusyText), async () => {
      if (!date) throw codeError('FINLAND_INVALID_INPUT', 'Vælg en dag.')
      const drafts = draftsOf(user)
      const book = await currentWorkbook()
      const own = forWorkbook(await drafts.all(), book)
      const rows = followUpRows(own, [], conflictsOf(user), await timelinesForSheet())
      let applied = 0
      for (const r of rows) {
        if (r.pickedUp !== date || !r.key || r.duplicate || !r.nshift?.delivered) continue
        const existing = own.find(d => parcelKey(d.delivery, d.tracking) === r.key) || null
        const touched = existing ? existing.fields : {}
        const proposed = { expected: r.suggestedExpected, ...r.nshift.suggestion }
        const wanted = {}
        for (const field of FIELDS) {
          if (proposed[field] && !String(r.effective[field] ?? '').trim() && !(field in touched)) wanted[field] = proposed[field]
        }
        if (!Object.keys(wanted).length) continue
        // A suggested SLA follows the dates like an automatic one; a manual SLA the person set stays manual.
        const slaManual = !!existing?.slaManual && !('sla' in wanted)
        const next = mergeDraft({ existing, base: r.sheet, wanted, slaManual, delivery: r.delivery, tracking: r.tracking, pickedUp: r.pickedUp })
        if (!next) continue
        await drafts.set(r.key, { ...next, workbookUrl: book })
        applied++
      }
      return { applied, ...(await snapshot(user)) }
    })
  }

  /** What the window may know about the nShift key: { configured, clientIdEnding }. */
  function nshiftStatus() {
    return shared.nshift.status()
  }

  function setNshift(user, values) {
    return shared.nshift.set(user, values)
  }

  /** Asks nShift for a new token with the stored key. Only a manager or creator. */
  async function testNshift(user) {
    if (!isManager(user)) throw codeError('MANAGER_ONLY', 'Kun managers kan teste forbindelsen til nShift')
    if (!nshift) throw nshiftNotSetError()
    await nshift.test()
    return { ok: true, ...(await shared.nshift.status()) }
  }

  // A row typed in by hand. "check" only validates against the sheet as last read; "add" reads it again and writes.
  function checkManual(user, input) {
    return checkManualRow(input, sheetRows, new Date(now()))
  }

  function addManualRow(user, input) {
    return exclusive('manual', async () => {
      let manual = null
      const warnings = []
      const written = await sheetWrite(user, { day: String(input?.pickedUp || ''), action: 'skriver' }, async (extend, book) => {
        await refreshSheet(true)
        const check = checkManualRow(input, sheetRows, new Date(now()))
        if (check.ok) {
          // Not in this PC's sheet yet is not enough: a colleague may just have written it, or it is marked not sent.
          const { notSent, recent } = await blockedKeys(book)
          const key = parcelKey(check.row.delivery, check.row.tracking)
          if (notSent.has(key)) Object.assign(check, { ok: false, errors: { tracking: notSentText } })
          else if (recent.has(key)) Object.assign(check, { ok: false, errors: { tracking: 'Kolliet er skrevet i arket for lidt siden. Tryk "Læs arket".' } })
        }
        if (!check.ok) {
          manual = { ok: false, errors: check.errors }
          return false
        }
        await extend(appendTimeoutMs(1))
        const result = await append(user, [check.row], insertionPoint(sheetRows, check.row.pickedUp), book)
        await logWrite(user, check.row.pickedUp, [parcelKey(check.row.delivery, check.row.tracking)], book, warnings)
        manual = { ok: true, row: result.firstRow, skipped: result.skipped, weekFormulaOk: result.weekFormulaOk, tracking: check.row.tracking }
        return true
      })
      if (written) await refreshSheet(true)
      return { manual, warnings, ...(await snapshot(user)) }
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
        workbookUrl: await currentWorkbook(),
      })
      return snapshot(user)
    })
  }

  function restoreNotSent(user, key) {
    return quick(() => busy && busy !== 'sheet' && busyError(), async () => {
      // A delete reads the list again under its lock, but the parcel should not come back halfway through one.
      const lock = await shared.lock.current()
      if (lock?.action === DELETE_ACTION) throw codeError('FINLAND_LOCKED', `${lock.name || lock.email} sletter en række i arket lige nu. Prøv igen om lidt.`)
      if (!(await shared.notSent.restore(key, await currentWorkbook()))) throw notMarkedError()
      return snapshot(user)
    })
  }

  // Deletes the parcel's row from the sheet. "row" is the row number the user saw in the confirmation.
  function deleteNotSentRow(user, key, row) {
    return exclusive('delete', async () => {
      if (!(await isAdmin(user))) throw codeError('FINLAND_ADMIN_ONLY', 'Kun admin kan slette en række i arket.')
      const entry = (await shared.notSent.list(await currentWorkbook())).find(e => keyOfEntry(e) === key)
      if (!entry) throw notMarkedError()
      let deleted = null
      const warnings = []
      await sheetWrite(user, { day: entry.shippedOn, action: DELETE_ACTION }, async (extend, book) => {
        await refreshSheet(true)
        // A colleague may have pressed "Sæt ind igen" while the lock was taken and the sheet read; restoring takes no lock.
        const current = (await shared.notSent.list(book)).find(e => keyOfEntry(e) === key)
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
        deleted = { kind: 'deleted', tracking: current.tracking, row }
        await logWrite(user, current.shippedOn, [], book, warnings)
      })
      if (deleted.kind === 'deleted') {
        await draftsOf(user).remove([key])
        conflictsOf(user).delete(key)
        await refreshSheet(true)
      }
      return { deleted, warnings, ...(await snapshot(user)) }
    })
  }

  return {
    load, loadSheet, writeDay, fixReview, saveDraft, saveFollowUp, resolveConflict, checkManual, addManualRow,
    markNotSent, restoreNotSent, deleteNotSentRow, pending, current, snapshot,
    fetchStatus, applySuggestions, nshiftStatus, setNshift, testNshift,
  }
}

module.exports = { createFinlandService, BUSY_TEXT }
