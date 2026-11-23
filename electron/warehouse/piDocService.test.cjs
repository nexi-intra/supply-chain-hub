const test = require('node:test')
const assert = require('node:assert/strict')
const { createPiDocService } = require('./piDocService.cjs')

const MONA = { email: 'Mona@x', fullName: 'Mona', role: 'manager', team: 'TCD' }
const ANNA = { email: 'anna@x', fullName: 'Anna', role: 'user', team: 'TCD' }
const row = (material, kind, extra = {}) => ({ material, description: material, kind, sloc: 'D000', stockType: 'unrestricted', serialManaged: kind !== 'accessory', status: 'approved', ...extra })
const ROWS = [row('INT1-0', 'new'), row('R1', 'accessory'), row('R2', 'accessory'), row('R3', 'accessory', { status: 'open' })]

function setup({ createResult = { docs: [{ docNo: '105000900', materials: ['R1', 'R2'] }], missing: [] }, roleOf = user => (user.email === 'anna@x' ? 'admin' : 'manager') } = {}) {
  let stored = {}
  const calls = []
  let clock = Date.UTC(2026, 9, 19)
  let counter = 0
  const repo = {
    getPiDocs: async () => structuredClone(stored),
    changePiDocs: async (team, id, change) => { const { all, result } = change(structuredClone(stored)); stored = all; return result },
  }
  const writer = {
    createDocument: async request => { calls.push(['create', request, structuredClone(stored)]); if (createResult instanceof Error) throw createResult; return createResult },
    printDocument: async request => { calls.push(['print', request]); return { message: 'Print request completed' } },
  }
  const service = createPiDocService({ counts: { countDoc: async () => ({ rows: ROWS }) }, repo, roles: { roleOf: async user => roleOf(user) }, writer, system: 'QS4', now: () => clock, newReference: () => `CPREF${++counter}` })
  return { service, calls, stored: () => stored, tick: ms => { clock += ms } }
}

test('a manager creates one document for several accessories; it is reserved while SAP waits for F8', async () => {
  const { service, calls, stored } = setup()
  const result = await service.create(MONA, 'c1', { materials: ['R1', 'R2'], sloc: 'D000', stockType: 'unrestricted' })
  assert.deepEqual(result.created, ['105000900'])
  assert.deepEqual(calls[0][1], { sloc: 'D000', stockType: 'unrestricted', reference: 'CPREF1', materials: ['R1', 'R2'] })
  assert.equal(calls[0][2].CPREF1.status, 'creating', 'reserved during the SAP step')
  const doc = stored()['105000900']
  assert.deepEqual([doc.status, doc.year, doc.reference, doc.kind, doc.transaction, doc.createdBy.email, doc.lines.map(line => line.material)], ['created', '2026', 'CPREF1', 'accessory', 'MI04', 'mona@x', ['R1', 'R2']])
  assert.equal(stored().CPREF1, undefined)
  assert.deepEqual([result.docs[0].next, result.docs[0].canNext], ['print', true])
  await assert.rejects(service.create(MONA, 'c1', { materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_EXISTS' })
})

test('SAP splitting into several documents gives one CountPoint document each', async () => {
  const { service, stored } = setup({ createResult: { docs: [{ docNo: '105000901', materials: ['R1'] }, { docNo: '105000902', materials: ['R2'] }], missing: [] } })
  await service.create(MONA, 'c1', { materials: ['R1', 'R2'], sloc: 'D000', stockType: 'unrestricted' })
  assert.deepEqual(Object.keys(stored()).sort(), ['105000901', '105000902'])
  assert.deepEqual(stored()['105000902'].lines.map(line => line.material), ['R2'])
})

test('a failed or cancelled SAP step frees the materials again', async () => {
  const { service, stored } = setup({ createResult: Object.assign(new Error('x'), { code: 'PIDOC_CANCELLED' }) })
  await assert.rejects(service.create(MONA, 'c1', { materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_CANCELLED' })
  assert.deepEqual(stored(), {})
  const empty = setup({ createResult: { docs: [], missing: ['R1'] } })
  await assert.rejects(empty.service.create(MONA, 'c1', { materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_NOT_CREATED' })
  assert.deepEqual(empty.stored(), {})
})

test('a document is not created in SAP for a count deleted meanwhile', async () => {
  let stored = {}
  let deleted = false
  const created = []
  const repo = {
    getPiDocs: async () => structuredClone(stored),
    // The count is deleted on another PC right after the reservation is written.
    changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all; deleted = true },
    isDeleted: async () => deleted,
  }
  const writer = { createDocument: async request => { created.push(request); return { docs: [{ docNo: '105000905', materials: ['R1'] }], missing: [] } } }
  const service = createPiDocService({ counts: { countDoc: async () => ({ rows: ROWS }) }, repo, roles: { roleOf: async () => 'manager' }, writer, system: 'QS4' })
  await assert.rejects(service.create(MONA, 'c1', { materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'COUNT_DELETED' })
  assert.deepEqual(created, [], 'SAP is never asked')
})

test('a stale reservation (crashed app) does not block the material forever', async () => {
  const { service, stored, tick } = setup({ createResult: { docs: [{ docNo: '105000903', materials: ['R1'] }], missing: [] } })
  await service.create(MONA, 'c1', { materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' }).catch(() => {})
  const all = stored()
  all.CPOLD = { id: 'CPOLD', status: 'creating', startedAt: 0, sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R2' }] }
  tick(1)
  assert.equal((await service.list(MONA, 'c1')).docs.some(doc => doc.id === 'CPOLD'), false)
})

test('the admin enters the count: serials per material in ZMS_COUNT_SERIAL, quantities in MI04, remembered per material', async () => {
  let stored = {
    D1: { id: 'D1', docNo: '105000910', year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'INT1-0', transaction: 'ZMS_COUNT_SERIAL' }] },
    D2: { id: 'D2', docNo: '105000911', year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'R1', transaction: 'MI04' }, { material: 'R2', transaction: 'MI04' }] },
    D3: { id: 'D3', docNo: '105000912', year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'R5', transaction: 'ZMS_COUNT_SERIAL' }, { material: 'R6', transaction: 'ZMS_COUNT_SERIAL' }] },
  }
  const calls = []
  let failOn = null
  const rows = [row('R1', 'accessory', { docQty: 97 }), row('R2', 'accessory', { docQty: 0 }), row('INT1-0', 'new', { docQty: 2 }), row('R6', 'accessory', { serialManaged: true, docQty: 0, sapToday: 0 })]
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { const { all } = change(structuredClone(stored)); stored = all } }
  const writer = {
    enterSerials: async request => { calls.push(['serials', request]); if (failOn === request.material) throw Object.assign(new Error('x'), { code: 'PIDOC_CHECK_ERRORS' }); return { counted: request.serials.length, serials: request.serials.length, newSerials: 0 } },
    enterCounts: async request => { calls.push(['counts', request]); return { message: 'ok' } },
  }
  const serials = { 'INT1-0': ['S1', 'S2'], R5: ['A1'], R6: [] }
  // Only the list of the day may go into SAP; the serials found in the count may be days old.
  const counts = { countDoc: async () => ({ fetchedAt: Date.now(), rows }), copySerials: async (user, id, { material, forDoc }) => ({ serials: forDoc === true ? serials[material] : ['STALE'] }) }
  const service = createPiDocService({ counts, repo, roles: { roleOf: async user => (user.email === 'anna@x' ? 'admin' : 'manager') }, writer, system: 'QS4' })

  await assert.rejects(service.count(MONA, 'c1', 'D1'), { code: 'PIDOC_FORBIDDEN' }, 'the manager does not count')
  await service.count(ANNA, 'c1', 'D1')
  assert.deepEqual(calls.shift(), ['serials', { docNo: '105000910', year: '2026', material: 'INT1-0', serials: ['S1', 'S2'] }])
  assert.deepEqual([stored.D1.status, stored.D1.countedBy.email, stored.D1.entered['INT1-0'].serials], ['counted', 'anna@x', 2])

  await service.count(ANNA, 'c1', 'D2')
  assert.deepEqual(calls.shift(), ['counts', { docNo: '105000911', year: '2026', entries: [{ material: 'R1', qty: 97 }, { material: 'R2', qty: 0 }] }])

  failOn = 'R5'
  await assert.rejects(service.count(ANNA, 'c1', 'D3'), { code: 'PIDOC_CHECK_ERRORS' })
  assert.equal(stored.D3.status, 'printed')
  failOn = null
  calls.length = 0
  await service.count(ANNA, 'c1', 'D3')
  assert.deepEqual(calls, [['serials', { docNo: '105000912', year: '2026', material: 'R5', serials: ['A1'] }], ['counts', { docNo: '105000912', year: '2026', entries: [{ material: 'R6', qty: 0 }] }]], 'no serials found and SAP has none today = Zero Count in MI04')
  assert.equal(stored.D3.status, 'counted')
})

test('an empty serial list with SAP stock today is never a silent Zero Count: refused before anything goes into SAP, entered when confirmed', async () => {
  const lines = [{ material: 'INT1-0', transaction: 'ZMS_COUNT_SERIAL' }, { material: 'INT2-0', transaction: 'ZMS_COUNT_SERIAL' }, { material: 'INT3-0', transaction: 'ZMS_COUNT_SERIAL' }]
  let stored = { D4: { id: 'D4', docNo: '105000913', year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines } }
  const calls = []
  // INT1-0 has serials; INT2-0 has none although SAP has 5 today (an empty IQ09); INT3-0 has none and SAP has none.
  const rows = [row('INT1-0', 'new', { docQty: 1, sapToday: 1 }), row('INT2-0', 'new', { docQty: 0, sapToday: 5 }), row('INT3-0', 'new', { docQty: 0, sapToday: 0 })]
  const serials = { 'INT1-0': ['S1'], 'INT2-0': [], 'INT3-0': [] }
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const writer = {
    enterSerials: async request => { calls.push(['serials', request]); return { counted: request.serials.length, serials: request.serials.length, newSerials: 0 } },
    enterCounts: async request => { calls.push(['counts', request]); return { message: 'ok' } },
  }
  const counts = { countDoc: async () => ({ fetchedAt: Date.now(), rows }), copySerials: async (user, id, { material }) => ({ serials: serials[material] }) }
  const service = createPiDocService({ counts, repo, roles: { roleOf: async () => 'admin' }, writer, system: 'QS4' })

  await assert.rejects(service.count(ANNA, 'c1', 'D4'), error => error.code === 'PIDOC_ZERO_CONFIRM' && /: INT2-0$/.test(error.message))
  for (const confirmZero of [true, 'INT2-0', ['INT3-0']]) {
    await assert.rejects(service.count(ANNA, 'c1', 'D4', { confirmZero }), { code: 'PIDOC_ZERO_CONFIRM' }, 'only a list holding the empty materials confirms')
  }
  assert.deepEqual(calls, [], 'nothing went into SAP, not even the material with serials')
  assert.equal(stored.D4.status, 'printed')

  await service.count(ANNA, 'c1', 'D4', { confirmZero: ['INT2-0'] })
  assert.deepEqual(calls, [['serials', { docNo: '105000913', year: '2026', material: 'INT1-0', serials: ['S1'] }], ['counts', { docNo: '105000913', year: '2026', entries: [{ material: 'INT2-0', qty: 0 }, { material: 'INT3-0', qty: 0 }] }]])
  assert.equal(stored.D4.status, 'counted')

  // Someone fetched again between the dialog and the click: INT4-0 is empty now too, and was never shown.
  calls.length = 0
  stored.D6 = { ...stored.D4, id: 'D6', docNo: '105000915', status: 'printed', entered: undefined, countedBy: undefined, lines: [{ material: 'INT2-0', transaction: 'ZMS_COUNT_SERIAL' }, { material: 'INT4-0', transaction: 'ZMS_COUNT_SERIAL' }] }
  rows.push(row('INT4-0', 'new', { docQty: 0, sapToday: 3 }))
  serials['INT4-0'] = []
  await assert.rejects(service.count(ANNA, 'c1', 'D6', { confirmZero: ['INT2-0'] }), error => error.code === 'PIDOC_ZERO_CONFIRM' && /: INT2-0, INT4-0$/.test(error.message))
  assert.deepEqual(calls, [])
  await service.count(ANNA, 'c1', 'D6', { confirmZero: ['INT4-0', 'INT2-0'] })
  assert.deepEqual(calls, [['counts', { docNo: '105000915', year: '2026', entries: [{ material: 'INT2-0', qty: 0 }, { material: 'INT4-0', qty: 0 }] }]])
})

test('quantities are never entered from day figures that lack an approved material SAP had at approval (an empty export), unless exactly those were confirmed', async () => {
  const doc = (id, docNo, materials) => ({ id, docNo, year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: materials.map(material => ({ material, transaction: 'MI04' })) })
  let stored = { D7: doc('D7', '105000916', ['R1', 'R2', 'R4']), D8: doc('D8', '105000917', ['R2']) }
  const calls = []
  // R1: SAP had 5 at approval, the stored day figures have no line for it (1.6.7 saved an empty export). R2 is in the
  // figures; R4 had no stock at approval either, so 0 today is no surprise.
  const rows = [row('R1', 'accessory', { serialManaged: false, sapAtApproval: 5, sapToday: 0, docQty: 0 }), row('R2', 'accessory', { serialManaged: false, sapAtApproval: 3, sapToday: 3, docQty: 3 }), row('R4', 'accessory', { serialManaged: false, sapAtApproval: 0, sapToday: 0, docQty: 1 })]
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const writer = { enterCounts: async request => { calls.push(request); return { message: 'ok' } } }
  const counts = { countDoc: async () => ({ fetchedAt: Date.now(), rows }), copySerials: async () => ({ serials: [] }) }
  const service = createPiDocService({ counts, repo, roles: { roleOf: async () => 'admin' }, writer, system: 'QS4' })

  await assert.rejects(service.count(ANNA, 'c1', 'D7'), error => error.code === 'PIDOC_MISSING_CONFIRM' && /: R1 D000$/.test(error.message))
  for (const confirmMissing of [true, 'R1 D000', ['R2 D000']]) {
    await assert.rejects(service.count(ANNA, 'c1', 'D7', { confirmMissing }), { code: 'PIDOC_MISSING_CONFIRM' }, 'only a list holding the missing materials confirms')
  }
  assert.deepEqual(calls, [], 'nothing went into SAP')
  assert.equal(stored.D7.status, 'printed')

  await service.count(ANNA, 'c1', 'D7', { confirmMissing: ['R1 D000'] })
  assert.deepEqual(calls, [{ docNo: '105000916', year: '2026', entries: [{ material: 'R1', qty: 0 }, { material: 'R2', qty: 3 }, { material: 'R4', qty: 1 }] }])
  assert.equal(stored.D7.status, 'counted')

  // Confirmed already at "Hent dagens SAP-tal" for these very figures (same fetchedAt): not asked again. Figures saved
  // by 1.6.7 (no list) or a list from other figures still ask.
  const fetchedAt = Date.now()
  counts.countDoc = async () => ({ fetchedAt, rows, confirmedMissing: { fetchedAt, materials: ['R1 D000'] } })
  stored.D9 = doc('D9', '105000918', ['R1'])
  calls.length = 0
  await service.count(ANNA, 'c1', 'D9')
  assert.deepEqual(calls, [{ docNo: '105000918', year: '2026', entries: [{ material: 'R1', qty: 0 }] }])
  stored.D10 = doc('D10', '105000919', ['R1'])
  for (const confirmedMissing of [undefined, { fetchedAt: fetchedAt - 1, materials: ['R1 D000'] }, { fetchedAt, materials: ['R2 D000'] }]) {
    counts.countDoc = async () => ({ fetchedAt, rows, ...(confirmedMissing ? { confirmedMissing } : {}) })
    await assert.rejects(service.count(ANNA, 'c1', 'D10'), { code: 'PIDOC_MISSING_CONFIRM' })
  }
  counts.countDoc = async () => ({ fetchedAt: Date.now(), rows })

  // A document whose materials are all in the figures is entered at once.
  calls.length = 0
  await service.count(ANNA, 'c1', 'D8')
  assert.deepEqual(calls, [{ docNo: '105000917', year: '2026', entries: [{ material: 'R2', qty: 3 }] }])
})

test('the Zero Count check comes after the stale-figures and quantity-line checks', async () => {
  let stored = { D5: { id: 'D5', docNo: '105000914', year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'INT2-0', transaction: 'ZMS_COUNT_SERIAL' }] } }
  const state = { fetchedAt: null, rows: [row('INT2-0', 'new', { docQty: 0, sapToday: 5 })] }
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const counts = { countDoc: async () => state, copySerials: async () => { throw Object.assign(new Error('x'), { code: 'APPROVED_WITH_SERIAL_LINES' }) } }
  const service = createPiDocService({ counts, repo, roles: { roleOf: async () => 'admin' }, writer: {}, system: 'QS4' })
  await assert.rejects(service.count(ANNA, 'c1', 'D5', { confirmZero: ['INT2-0'] }), { code: 'PIDOC_DOC_STALE' })
  state.fetchedAt = Date.now()
  state.rows = [row('INT2-0', 'new', { docQty: null, sapToday: 5, serialLinesAtApproval: true })]
  await assert.rejects(service.count(ANNA, 'c1', 'D5'), { code: 'APPROVED_WITH_SERIAL_LINES' })
})

test('quantities need the SAP numbers of the day', async () => {
  let stored = { D2: { id: 'D2', docNo: '105000911', year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'R1', transaction: 'MI04' }] } }
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const service = createPiDocService({ counts: { countDoc: async () => ({ fetchedAt: Date.now(), rows: [row('R1', 'accessory', { docQty: null })] }) }, repo, roles: { roleOf: async () => 'admin' }, writer: {}, system: 'QS4' })
  await assert.rejects(service.count(ANNA, 'c1', 'D2'), { code: 'PIDOC_NO_QTY' })
})

/** A document for R1 made Monday 23.11.2026 from the SAP figures of the day; `at(day, hour)` is local time. */
function staleSetup({ fetchedAt, docFetchedAt }) {
  const at = (day, hour) => new Date(2026, 10, day, hour).getTime()
  const state = { clock: at(23, 8), countDoc: { fetchedAt: fetchedAt(at), rows: [row('R1', 'accessory', { docQty: 97 })] } }
  const doc = { id: 'D9', docNo: '105000920', year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x', at: at(23, 8) }, lines: [{ material: 'R1', transaction: 'MI04' }] }
  let stored = { D9: docFetchedAt === undefined ? doc : { ...doc, docFetchedAt: docFetchedAt(at) } }
  const entered = []
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const writer = { enterCounts: async request => { entered.push(request); return { message: 'ok' } } }
  const service = createPiDocService({ counts: { countDoc: async () => state.countDoc }, repo, roles: { roleOf: async user => (user.email === 'anna@x' ? 'admin' : 'manager') }, writer, system: 'QS4', now: () => state.clock })
  return { at, state, service, entered, stored: () => stored }
}

test('a new document remembers when the SAP figures of the day it was made from were fetched', async () => {
  const at = (day, hour) => new Date(2026, 10, day, hour).getTime()
  let stored = {}
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const writer = { createDocument: async () => ({ docs: [{ docNo: '105000921', materials: ['R1'] }], missing: [] }) }
  const service = createPiDocService({ counts: { countDoc: async () => ({ fetchedAt: at(23, 7), rows: ROWS }) }, repo, roles: { roleOf: async () => 'manager' }, writer, system: 'QS4', now: () => at(23, 8), newReference: () => 'CPREF1' })
  await service.create(MONA, 'c1', { materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' })
  assert.equal(stored['105000921'].docFetchedAt, at(23, 7))
})

test('"Læg antal på" refuses SAP figures of the day from an earlier day', async () => {
  const { at, state, service, entered, stored } = staleSetup({ fetchedAt: at => at(23, 7), docFetchedAt: at => at(23, 7) })
  state.clock = at(25, 9)
  await assert.rejects(service.count(ANNA, 'c1', 'D9'), { code: 'PIDOC_DOC_STALE', message: 'PIDOC_DOC_STALE: Hent dagens SAP-tal igen, før antallet lægges på. Tallene er fra 23.11.2026 07:00.' })
  assert.deepEqual(entered, [], 'nothing goes into SAP')
  assert.equal(stored().D9.status, 'printed')
})

test('"Læg antal på" refuses SAP figures of the day older than the ones the document was made from', async () => {
  const { at, state, service, entered } = staleSetup({ fetchedAt: at => at(25, 7), docFetchedAt: at => at(25, 9) })
  state.clock = at(25, 10)
  await assert.rejects(service.count(ANNA, 'c1', 'D9'), { code: 'PIDOC_DOC_STALE', message: 'PIDOC_DOC_STALE: Hent dagens SAP-tal igen, før antallet lægges på. Tallene er fra 25.11.2026 07:00.' })
  state.countDoc = { ...state.countDoc, fetchedAt: null }
  await assert.rejects(service.count(ANNA, 'c1', 'D9'), { code: 'PIDOC_DOC_STALE' }, 'no SAP figures of the day at all')
  assert.deepEqual(entered, [])
})

test('a document from an older client (no docFetchedAt) is counted when the SAP figures are from today', async () => {
  const { at, state, service, entered, stored } = staleSetup({ fetchedAt: at => at(25, 8) })
  state.clock = at(25, 9)
  await service.count(ANNA, 'c1', 'D9')
  assert.deepEqual(entered, [{ docNo: '105000920', year: '2026', entries: [{ material: 'R1', qty: 97 }] }])
  assert.equal(stored().D9.status, 'counted')
  const other = staleSetup({ fetchedAt: at => at(25, 8) })
  other.state.clock = at(26, 9)
  await assert.rejects(other.service.count(ANNA, 'c1', 'D9'), { code: 'PIDOC_DOC_STALE' }, 'yesterday is still refused')
})

test('the manager posts counted documents; only what MI22 confirms is posted, and the materials become "Bogført i SAP"', async () => {
  let stored = {
    D1: { id: 'D1', docNo: '105000893', year: '2026', status: 'counted', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'INT1-0' }] },
    D2: { id: 'D2', docNo: '105000894', year: '2026', status: 'counted', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'R1' }, { material: 'R2' }] },
  }
  const approvals = []
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const writer = { postDocuments: async () => ({ posted: ['105000894'], open: ['105000893'], materialDocs: { 105000894: '4905204847' }, differences: [{ docNo: '105000894', material: 'R1', book: 483, counted: 480, diff: -3, amount: 151.59 }, { docNo: '105000893', material: 'INT1-0', book: 1, counted: 1, diff: 0, amount: 0 }] }) }
  const counts = { countDoc: async () => ({ rows: [] }), markPosted: async (user, id, materials) => { approvals.push(materials); return { posted: materials, skipped: [] } } }
  const service = createPiDocService({ counts, repo, roles: { roleOf: async user => (user.email === 'anna@x' ? 'admin' : 'manager') }, writer, system: 'QS4' })
  await assert.rejects(service.post(ANNA, 'c1', ['D2']), { code: 'PIDOC_FORBIDDEN' })
  const result = await service.post(MONA, 'c1', ['D1', 'D2'])
  assert.deepEqual([result.posted, result.open], [['105000894'], ['105000893']])
  assert.deepEqual([stored.D2.status, stored.D2.materialDoc, stored.D2.differences[0].diff, stored.D2.postedBy.email], ['posted', '4905204847', -3, 'mona@x'])
  assert.equal(stored.D1.status, 'counted', 'not confirmed by MI22: stays ready to post')
  assert.deepEqual(approvals, [['R1', 'R2']], 'every material of the posted documents is marked in one write')
  assert.deepEqual(result.marked, { posted: ['R1', 'R2'], skipped: [] })
})

test('posting says which materials were marked "Bogført i SAP" and which were not', async () => {
  const counted = (id, docNo, materials) => ({ id, docNo, year: '2026', status: 'counted', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: materials.map(material => ({ material })) })
  const make = markPosted => {
    let stored = { D1: counted('D1', '105000898', ['R1', 'R2']) }
    const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
    const writer = { postDocuments: async request => ({ posted: request.docNos, open: [], materialDocs: {}, differences: [] }) }
    return { service: createPiDocService({ counts: { countDoc: async () => ({ rows: [] }), markPosted }, repo, roles: { roleOf: async () => 'manager' }, writer, system: 'QS4' }), stored: () => stored }
  }
  const partly = make(async () => ({ posted: ['R1'], skipped: ['R2'], serialLines: [] }))
  assert.deepEqual((await partly.service.post(MONA, 'c1', ['D1'])).marked, { posted: ['R1'], skipped: ['R2'] })
  const before = make(async () => ({ posted: ['R1'], skipped: [], serialLines: [], already: ['R2'] }))
  assert.deepEqual((await before.service.post(MONA, 'c1', ['D1'])).marked, { posted: ['R1', 'R2'], skipped: [] }, 'marked by an earlier document: marked, not skipped')

  const failing = make(async () => { throw Object.assign(new Error('x'), { code: 'KV_LOCK_BUSY' }) })
  const result = await failing.service.post(MONA, 'c1', ['D1'])
  assert.deepEqual([result.posted, result.marked], [['105000898'], { posted: [], skipped: ['R1', 'R2'], failed: true }], 'the document is posted, but nothing was marked')
  assert.equal(failing.stored().D1.status, 'posted')

  const nothing = createPiDocService({ counts: { countDoc: async () => ({ rows: [] }), markPosted: async () => assert.fail('nothing was posted') }, repo: { getPiDocs: async () => ({ D1: counted('D1', '105000899', ['R1']) }), changePiDocs: async () => {} }, roles: { roleOf: async () => 'manager' }, writer: { postDocuments: async () => ({ posted: [], open: ['105000899'], materialDocs: {}, differences: [] }) }, system: 'QS4' })
  assert.deepEqual((await nothing.post(MONA, 'c1', ['D1'])).marked, { posted: [], skipped: [] }, 'SAP posted nothing: nothing to mark')
})

test('a document holding a material approved with quantity lines is posted only when a manager confirms it with a reason (corrected in MI05); the others still are', async () => {
  const counted = (id, docNo, material) => ({ id, docNo, year: '2026', status: 'counted', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material }] })
  let stored = { D1: counted('D1', '105000895', 'INT1-0'), D2: counted('D2', '105000896', 'R1'), D3: counted('D3', '105000897', 'INT2-0') }
  const posted = []
  const marked = []
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const writer = { postDocuments: async request => { posted.push(request.docNos); return { posted: request.docNos, open: [], materialDocs: {}, differences: [] } } }
  const rows = [row('INT1-0', 'new', { serialLinesAtApproval: true }), row('INT1-0', 'new', { sloc: 'D004' }), row('R1', 'accessory'), row('INT2-0', 'new', { serialLinesAtApproval: true })]
  const counts = { countDoc: async () => ({ rows }), markPosted: async (user, id, materials) => { marked.push(...materials); return { posted: materials, skipped: [], serialLines: materials.filter(material => material.startsWith('INT')) } } }
  const service = createPiDocService({ counts, repo, roles: { roleOf: async user => (user.email === 'anna@x' ? 'admin' : 'manager') }, writer, system: 'QS4', now: () => 5000 })
  const text = 'Dokumentet kan ikke bogføres, fordi et materiale blev godkendt med tællelinjer med antal. Ret antallet i SAP med MI05. Bagefter kan en manager bogføre dokumentet her med en begrundelse.'
  await assert.rejects(service.post(MONA, 'c1', ['D2', 'D1']), { code: 'PIDOC_SERIAL_LINES', message: `PIDOC_SERIAL_LINES: ${text} Gælder: 105000895` })
  const confirm = { docIds: ['D1'], reason: 'Rettet til 2 i MI05' }
  await assert.rejects(service.post(ANNA, 'c1', ['D2', 'D1'], { confirmSerialLines: confirm }), { code: 'PIDOC_FORBIDDEN' }, 'not a manager')
  for (const reason of ['', '   ', undefined]) {
    await assert.rejects(service.post(MONA, 'c1', ['D2', 'D1'], { confirmSerialLines: { docIds: ['D1'], reason } }), { code: 'PIDOC_INVALID' }, 'a reason is required')
  }
  await assert.rejects(service.post(MONA, 'c1', ['D1', 'D3'], { confirmSerialLines: confirm }), { code: 'PIDOC_SERIAL_LINES', message: `PIDOC_SERIAL_LINES: ${text} Gælder: 105000897` }, 'only the listed documents')
  assert.deepEqual(posted, [], 'MI20 is never started')
  assert.deepEqual([stored.D1.status, stored.D1.serialLinesReason], ['counted', undefined])

  await service.post(MONA, 'c1', ['D2', 'D1'], { confirmSerialLines: confirm })
  assert.deepEqual(posted, [['105000896', '105000895']])
  assert.deepEqual([stored.D1.status, stored.D1.serialLinesConfirmedBy, stored.D1.serialLinesConfirmedAt, stored.D1.serialLinesReason], ['posted', { email: 'mona@x', name: 'Mona', at: 5000 }, 5000, 'Rettet til 2 i MI05'])
  assert.equal(stored.D2.serialLinesReason, undefined, 'logged on the confirmed document only')
  assert.deepEqual(marked.sort(), ['INT1-0', 'R1'], 'its materials are marked "Bogført i SAP"')
  assert.equal(stored.D3.status, 'counted')
})

test('a wrong document is deleted by a manager (created or printed only) and frees its materials', async () => {
  let stored = { D1: { id: 'D1', docNo: '105000903', year: '2026', reference: 'CPREF9', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'R1' }] } }
  const calls = []
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const writer = {
    deleteDocument: async request => { calls.push(request); return { deleted: true, message: 'Physical inventory document 105000903 deleted' } },
    createDocument: async () => ({ docs: [{ docNo: '105000904', materials: ['R1'] }], missing: [] }),
  }
  const service = createPiDocService({ counts: { countDoc: async () => ({ rows: ROWS }) }, repo, roles: { roleOf: async user => (user.email === 'anna@x' ? 'admin' : 'manager') }, writer, system: 'QS4', newReference: () => 'CPNEW1' })
  await assert.rejects(service.remove(ANNA, 'c1', 'D1'), { code: 'PIDOC_FORBIDDEN' })
  await assert.rejects(service.create(MONA, 'c1', { materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_EXISTS' })
  await service.remove(MONA, 'c1', 'D1')
  assert.deepEqual(calls, [{ docNo: '105000903', year: '2026', reference: 'CPREF9' }])
  assert.deepEqual([stored.D1.status, stored.D1.deletedBy.email], ['deleted', 'mona@x'])
  await service.create(MONA, 'c1', { materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' })
  assert.equal(stored['105000904'].status, 'created', 'the material can get a new document')
})

test('only managers create and print; admins and users cannot', async () => {
  const { service, calls } = setup()
  await assert.rejects(service.create(ANNA, 'c1', { materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_FORBIDDEN' })
  assert.equal((await service.list(ANNA, 'c1')).canCreate, false)
  await service.create(MONA, 'c1', { materials: ['R1', 'R2'], sloc: 'D000', stockType: 'unrestricted' })
  await assert.rejects(service.print(ANNA, 'c1', '105000900'), { code: 'PIDOC_FORBIDDEN' })
  const printed = await service.print(MONA, 'c1', '105000900')
  assert.deepEqual(calls[1], ['print', { docNo: '105000900', year: '2026', sloc: 'D000' }])
  assert.deepEqual([printed.docs[0].status, printed.docs[0].printedBy.message, printed.docs[0].next], ['printed', 'Print request completed', 'count'])
  assert.equal(printed.docs[0].canNext, false, 'the manager does not count')
  assert.equal((await service.list(ANNA, 'c1')).docs[0].canNext, true, 'the admin counts')
  await assert.rejects(service.print(MONA, 'c1', '105000900'), { code: 'PIDOC_FORBIDDEN' })
})
