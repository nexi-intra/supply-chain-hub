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

test('a failed or cancelled SAP step before F8 frees the materials again', async () => {
  for (const code of ['PIDOC_CANCELLED', 'PIDOC_TIMEOUT', 'PIDOC_NOT_POSSIBLE', 'SAP_NOT_READY']) {
    const { service, stored } = setup({ createResult: Object.assign(new Error('x'), { code }) })
    await assert.rejects(service.create(MONA, 'c1', { materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' }), { code })
    assert.deepEqual(stored(), {}, code)
  }
})

test('a document is not created in SAP for a count deleted meanwhile', async () => {
  let stored = {}
  let deleted = false
  const created = []
  const repo = {
    getPiDocs: async () => structuredClone(stored),
    // The count is deleted on another PC right after the reservation is written.
    changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all; deleted = true },
    // Read past the 3 s read cache: a cached index may not have the tombstone yet.
    isDeleted: async (team, id, options) => options?.fresh === true && deleted,
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

/** A printed document with two serial materials; `enterSerials` answers what the test sets. */
function serialSetup(enterSerials) {
  let stored = { D6: { id: 'D6', docNo: '105000915', year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'INT1-0', transaction: 'ZMS_COUNT_SERIAL' }, { material: 'INT2-0', transaction: 'ZMS_COUNT_SERIAL' }] } }
  const calls = []
  const rows = [row('INT1-0', 'new', { docQty: 2, sapToday: 2 }), row('INT2-0', 'new', { docQty: 1, sapToday: 1 })]
  const serials = { 'INT1-0': ['S1', 'S2'], 'INT2-0': ['S3'] }
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const writer = {
    enterSerials: async request => { calls.push(['serials', request.material]); return enterSerials(request) },
    enterCounts: async request => { calls.push(['counts', request]); return { message: 'ok' } },
  }
  const counts = { countDoc: async () => ({ fetchedAt: Date.now(), rows }), copySerials: async (user, id, { material }) => ({ serials: serials[material] }) }
  const service = createPiDocService({ counts, repo, roles: { roleOf: async () => 'admin' }, writer, system: 'QS4' })
  return { service, calls, stored: () => stored }
}

test('SAP counting another quantity than the serials sent stops the count; the material is not remembered as entered', async () => {
  const { service, calls, stored } = serialSetup(request => ({ counted: request.serials.length - 1, serials: request.serials.length - 1, newSerials: 0 }))
  await assert.rejects(service.count(ANNA, 'c1', 'D6'), error => error.code === 'PIDOC_NOT_COUNTED' && /INT1-0/.test(error.message) && /\b1\b/.test(error.message) && /\b2 serienumre/.test(error.message))
  assert.deepEqual(calls, [['serials', 'INT1-0']], 'nothing more goes into SAP')
  assert.equal(stored().D6.status, 'printed')
  assert.equal(stored().D6.entered, undefined, 'a retry does not skip it')
})

test('an unknown SAP state is passed on as it is; nothing is marked counted and SAP is not asked again', async () => {
  const unknown = Object.assign(new Error('PIDOC_UNKNOWN: Optælling ved ikke, om SAP har gemt. Tjek dokumentet i SAP (MI03).'), { code: 'PIDOC_UNKNOWN' })
  const { service, calls, stored } = serialSetup(request => { if (request.material === 'INT2-0') throw unknown; return { counted: request.serials.length, serials: request.serials.length, newSerials: 0 } })
  await assert.rejects(service.count(ANNA, 'c1', 'D6'), unknown)
  assert.deepEqual(calls, [['serials', 'INT1-0'], ['serials', 'INT2-0']])
  assert.equal(stored().D6.status, 'printed')
  assert.deepEqual(Object.keys(stored().D6.entered), ['INT1-0'], 'only what SAP confirmed is remembered')
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

test('posting passes on the documents MI22 did not list as unknown; the confirmed ones are still marked', async () => {
  let stored = {
    D1: { id: 'D1', docNo: '105000893', year: '2026', status: 'counted', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'INT1-0' }] },
    D2: { id: 'D2', docNo: '105000894', year: '2026', status: 'counted', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'R1' }] },
  }
  const approvals = []
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const writer = { postDocuments: async () => ({ posted: ['105000894'], open: [], unknown: ['105000893'], materialDocs: {}, differences: [] }) }
  const counts = { countDoc: async () => ({ rows: [] }), markPosted: async (user, id, materials) => { approvals.push(materials); return { posted: materials, skipped: [] } } }
  const service = createPiDocService({ counts, repo, roles: { roleOf: async () => 'manager' }, writer, system: 'QS4' })
  const result = await service.post(MONA, 'c1', ['D1', 'D2'])
  assert.deepEqual([result.posted, result.open, result.unknown], [['105000894'], [], ['105000893']])
  assert.deepEqual([stored.D1.status, stored.D2.status], ['counted', 'posted'])
  assert.deepEqual(approvals, [['R1']])
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

// ---- Unknown SAP results and the journal on this PC (count.md I6) ----

const fs = require('node:fs')
const path = require('node:path')
const { RESERVATION_MS } = require('./core/piDocs.cjs')

const UNKNOWN_TEXT = 'Optælling ved ikke, om SAP har gemt. Tjek dokumentet i SAP (MI03).'
const sapUnknown = () => Object.assign(new Error(`PIDOC_UNKNOWN: ${UNKNOWN_TEXT}`), { code: 'PIDOC_UNKNOWN', detail: 'no-access-mi22' })
const COUNT_ROWS = [
  row('R1', 'accessory', { serialManaged: false, docQty: 5, sapToday: 5, sapAtApproval: 5 }),
  row('R2', 'accessory', { serialManaged: false, docQty: 2, sapToday: 2, sapAtApproval: 2 }),
  row('INT1-0', 'new', { docQty: 1, sapToday: 1, sapAtApproval: 1 }),
]
const sapDoc = (docNo, status, extra = {}) => ({ id: docNo, docNo, year: '2026', system: 'PS4', reference: `CP${docNo}`, status, sloc: 'D000', stockType: 'unrestricted', kind: 'accessory', transaction: 'MI04', createdBy: { email: 'mona@x', name: 'Mona', at: 1 }, lines: [{ material: 'R1', transaction: 'MI04' }], ...extra })

let journals = 0
/** This PC's journal folder for one test, next to the test (ignored by git as *.local) and removed after it. */
function journalFolder(t) {
  const dir = path.join(__dirname, `.pidoc-service-journal-${process.pid}-${++journals}.local`)
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

/**
 * One stored documents file and a writer that answers what the test sets on `sap`. `state.down` makes every write to M:
 * fail (reads still work); `state.failAfterSap` sets it as soon as SAP has answered, like a drive that fails right after.
 */
function flow(t, { docs = {}, rows = ROWS } = {}) {
  const state = { stored: structuredClone(docs), down: false, failAfterSap: false, clock: new Date(2026, 10, 23, 9).getTime(), marked: [], calls: [], writes: [], deleted: new Set() }
  let counter = 0
  const repo = {
    getPiDocs: async () => structuredClone(state.stored),
    changePiDocs: async (team, id, change) => {
      if (state.down) throw Object.assign(new Error('EIO: M: is away'), { code: 'STORAGE_UNAVAILABLE' })
      state.writes.push(id)
      const { all, result } = change(structuredClone(state.stored))
      if (all !== undefined) state.stored = all
      return result
    },
    isDeleted: async (team, id) => state.deleted.has(id),
  }
  const sap = {
    create: async () => ({ docs: [{ docNo: '105000900', materials: ['R1', 'R2'] }], missing: [] }),
    counts: async () => ({ message: 'ok' }),
    post: async request => ({ posted: request.docNos, open: [], unknown: [], materialDocs: {}, differences: [] }),
  }
  const answered = async (name, request, answer) => {
    state.calls.push([name, request])
    const result = await answer(request)
    if (state.failAfterSap) state.down = true
    return result
  }
  const writer = {
    createDocument: request => answered('create', request, sap.create),
    printDocument: request => answered('print', request, async () => ({ message: 'ok' })),
    enterCounts: request => answered('counts', request, sap.counts),
    postDocuments: request => answered('post', request, sap.post),
    deleteDocument: request => answered('delete', request, async () => ({ deleted: true, message: 'deleted' })),
  }
  const counts = {
    countDoc: async () => ({ fetchedAt: state.clock, rows }),
    markPosted: async (user, id, materials) => { state.marked.push(...materials); return { posted: materials, skipped: [] } },
  }
  const journalDir = journalFolder(t)
  const service = createPiDocService({ counts, repo, roles: { roleOf: async user => (user.email === 'anna@x' ? 'admin' : 'manager') }, writer, system: 'PS4', now: () => state.clock, newReference: () => `CPREF${++counter}`, journalDir })
  const journal = () => (fs.existsSync(journalDir) ? fs.readdirSync(journalDir).filter(name => name.endsWith('.json')) : [])
  const heal = () => { state.down = false; state.failAfterSap = false }
  return { state, sap, service, journal, heal }
}

const CREATE = { materials: ['R1', 'R2'], sloc: 'D000', stockType: 'unrestricted' }

test('MI31 that may have created documents after F8 (the MI22 lookup failed) keeps the entry as unknown with its reference', async t => {
  const { state, sap, service } = flow(t)
  sap.create = async () => { throw sapUnknown() }
  await assert.rejects(service.create(MONA, 'c1', CREATE), { code: 'PIDOC_UNKNOWN', message: `PIDOC_UNKNOWN: ${UNKNOWN_TEXT}` })
  const kept = state.stored.CPREF1
  // Stored as 1.6.7 can show it (it knows no 'unknown' status): created without a document number, the unknown step beside it.
  assert.deepEqual([kept.reference, kept.status, kept.docNo, kept.sapUnknown.step, kept.sapUnknown.status, kept.sapUnknown.by.email, kept.sapUnknown.detail], ['CPREF1', 'created', undefined, 'create', 'created', 'mona@x', 'no-access-mi22'])
  assert.deepEqual(kept.lines.map(line => line.material), ['R1', 'R2'])
  state.clock += 2 * RESERVATION_MS
  const [doc] = (await service.list(MONA, 'c1')).docs
  assert.deepEqual([doc.id, doc.status, doc.next, doc.canNext, doc.canDelete, doc.canResolve], ['CPREF1', 'unknown', null, false, false, true], 'never a stale reservation')
  await assert.rejects(service.create(MONA, 'c1', { ...CREATE, materials: ['R1'] }), { code: 'PIDOC_EXISTS' })
  assert.equal((await service.list(ANNA, 'c1')).docs[0].canResolve, false, 'admins do not resolve')
})

test('MI31 saying Created while MI22 lists nothing under the reference is unknown too, never "not created"', async t => {
  const { state, sap, service } = flow(t)
  sap.create = async () => ({ docs: [], missing: ['R1', 'R2'] })
  await assert.rejects(service.create(MONA, 'c1', CREATE), { code: 'PIDOC_UNKNOWN' })
  assert.deepEqual([state.stored.CPREF1.status, state.stored.CPREF1.sapUnknown.step], ['created', 'create'])
})

test('MI04 or MI20 whose result is unknown marks the document unknown; SAP is not asked again until a manager decides', async t => {
  const docs = { 105000901: sapDoc('105000901', 'printed'), 105000902: sapDoc('105000902', 'counted', { lines: [{ material: 'R2' }] }), 105000903: sapDoc('105000903', 'counted', { lines: [{ material: 'INT1-0' }] }) }
  const { state, sap, service } = flow(t, { docs, rows: COUNT_ROWS })
  sap.counts = async () => { throw sapUnknown() }
  await assert.rejects(service.count(ANNA, 'c1', '105000901'), { code: 'PIDOC_UNKNOWN' })
  assert.deepEqual([state.stored['105000901'].status, state.stored['105000901'].sapUnknown.step, state.stored['105000901'].sapUnknown.by.email], ['printed', 'count', 'anna@x'])
  sap.post = async () => { throw sapUnknown() }
  await assert.rejects(service.post(MONA, 'c1', ['105000902']), { code: 'PIDOC_UNKNOWN' })
  assert.deepEqual([state.stored['105000902'].status, state.stored['105000902'].sapUnknown.step], ['counted', 'post'])
  // Not listed by MI22 at all after MI20: posted or not is unknown too.
  sap.post = async request => ({ posted: [], open: [], unknown: request.docNos, materialDocs: {}, differences: [] })
  assert.deepEqual((await service.post(MONA, 'c1', ['105000903'])).unknown, ['105000903'])
  assert.deepEqual([state.stored['105000903'].status, state.stored['105000903'].sapUnknown.step], ['counted', 'post'])
  state.calls.length = 0
  await assert.rejects(service.count(ANNA, 'c1', '105000901'), { code: 'PIDOC_FORBIDDEN' })
  await assert.rejects(service.post(MONA, 'c1', ['105000902']), { code: 'PIDOC_FORBIDDEN' })
  await assert.rejects(service.remove(MONA, 'c1', '105000901'), { code: 'PIDOC_FORBIDDEN' })
  assert.deepEqual(state.calls, [])
  assert.deepEqual((await service.list(MONA, 'c1')).docs.map(doc => doc.status), ['unknown', 'unknown', 'unknown'])
  assert.deepEqual(state.marked, [], 'nothing is marked "Bogført i SAP" on a guess')
})

test('a normal create, print, count and post still work and leave nothing in the journal', async t => {
  const { state, service, journal } = flow(t, { rows: COUNT_ROWS })
  await service.create(MONA, 'c1', CREATE)
  await service.print(MONA, 'c1', '105000900')
  await service.count(ANNA, 'c1', '105000900')
  assert.deepEqual(state.calls.at(-1), ['counts', { docNo: '105000900', year: '2026', entries: [{ material: 'R1', qty: 5 }, { material: 'R2', qty: 2 }] }])
  const result = await service.post(MONA, 'c1', ['105000900'])
  assert.deepEqual([result.posted, state.stored['105000900'].status, state.marked], [['105000900'], 'posted', ['R1', 'R2']])
  assert.deepEqual(journal(), [])
})

test('what SAP did while M: fails is kept on this PC and written to M: on the next look at the documents', async t => {
  const { state, service, journal, heal } = flow(t, { rows: COUNT_ROWS })
  state.failAfterSap = true
  await assert.rejects(service.create(MONA, 'c1', CREATE), error => error.code === 'PIDOC_SAVE_FAILED' && /105000900/.test(error.message))
  assert.equal(state.stored.CPREF1.status, 'creating', 'M: still has the reservation only')
  assert.equal(journal().length, 1)
  // M: still away: the journal is kept.
  await service.list(MONA, 'c1')
  assert.equal(journal().length, 1)
  heal()
  await service.list(MONA, 'c1')
  assert.deepEqual([state.stored.CPREF1, state.stored['105000900'].status, state.stored['105000900'].reference], [undefined, 'created', 'CPREF1'])
  assert.deepEqual(journal(), [])

  for (const [step, run, status] of [
    ['print', () => service.print(MONA, 'c1', '105000900'), 'printed'],
    ['count', () => service.count(ANNA, 'c1', '105000900'), 'counted'],
    ['post', () => service.post(MONA, 'c1', ['105000900']), 'posted'],
  ]) {
    state.failAfterSap = true
    await assert.rejects(run(), { code: 'PIDOC_SAVE_FAILED' }, step)
    assert.notEqual(state.stored['105000900'].status, status, step)
    heal()
    const [doc] = (await service.list(MONA, 'c1')).docs
    assert.equal(doc.status, status, step)
    assert.deepEqual(journal(), [], step)
  }
  assert.deepEqual(Object.keys(state.stored['105000900'].entered).sort(), ['R1', 'R2'])
  assert.equal(state.stored['105000900'].postedBy.email, 'mona@x')
})

test('an unknown create is never lost to a failing drive: the journal brings it to M: after the reservation went stale', async t => {
  const { state, sap, service, journal, heal } = flow(t)
  sap.create = async () => { state.down = true; throw sapUnknown() }
  await assert.rejects(service.create(MONA, 'c1', CREATE), { code: 'PIDOC_UNKNOWN' })
  assert.equal(state.stored.CPREF1.status, 'creating')
  state.clock += 2 * RESERVATION_MS
  heal()
  const [doc] = (await service.list(MONA, 'c1')).docs
  assert.deepEqual([doc.id, doc.status], ['CPREF1', 'unknown'])
  assert.deepEqual(journal(), [])
  await assert.rejects(service.create(MONA, 'c1', CREATE), { code: 'PIDOC_EXISTS' })
})

test('a manager resolves an unknown create: created in SAP with its number, or not in SAP (released); a reason is needed and logged', async t => {
  const { state, sap, service } = flow(t)
  sap.create = async () => { throw sapUnknown() }
  await assert.rejects(service.create(MONA, 'c1', CREATE), { code: 'PIDOC_UNKNOWN' })
  await assert.rejects(service.resolve(ANNA, 'c1', 'CPREF1', { outcome: 'saved', docNo: '105000900', reason: 'Fundet i MI22' }), { code: 'PIDOC_FORBIDDEN' })
  for (const reason of ['', '   ', undefined]) await assert.rejects(service.resolve(MONA, 'c1', 'CPREF1', { outcome: 'saved', docNo: '105000900', reason }), { code: 'PIDOC_INVALID' }, 'a reason is required')
  for (const docNo of [undefined, '', '12345', '10500090A', '10500090012']) await assert.rejects(service.resolve(MONA, 'c1', 'CPREF1', { outcome: 'saved', docNo, reason: 'Fundet' }), { code: 'PIDOC_INVALID' }, String(docNo))
  await assert.rejects(service.resolve(MONA, 'c1', 'CPREF1', { outcome: 'maybe', reason: 'Fundet' }), { code: 'PIDOC_INVALID' })
  assert.equal(state.stored.CPREF1.sapUnknown.step, 'create', 'nothing changed')

  state.clock += 1000
  const result = await service.resolve(MONA, 'c1', 'CPREF1', { outcome: 'saved', docNo: ' 105000900 ', reason: 'Fundet i MI22 på referencen' })
  const doc = state.stored['105000900']
  assert.equal(state.stored.CPREF1, undefined)
  assert.deepEqual([doc.id, doc.docNo, doc.year, doc.reference, doc.status, doc.sapUnknown], ['105000900', '105000900', '2026', 'CPREF1', 'created', undefined])
  assert.deepEqual(doc.sapResolutions.map(item => [item.step, item.outcome, item.docNo, item.reason, item.resolvedBy.email, item.resolvedBy.at, item.by.email]), [['create', 'saved', '105000900', 'Fundet i MI22 på referencen', 'mona@x', state.clock, 'mona@x']])
  assert.deepEqual([result.docs[0].status, result.docs[0].next], ['created', 'print'])
  assert.deepEqual(state.calls.map(call => call[0]), ['create'], 'SAP is not touched')
  await assert.rejects(service.resolve(MONA, 'c1', '105000900', { outcome: 'missing', reason: 'igen' }), { code: 'PIDOC_FORBIDDEN' }, 'resolved once')

  const other = flow(t)
  other.sap.create = async () => { throw sapUnknown() }
  await assert.rejects(other.service.create(MONA, 'c1', CREATE), { code: 'PIDOC_UNKNOWN' })
  await other.service.resolve(MONA, 'c1', 'CPREF1', { outcome: 'missing', reason: 'MI22 har intet på referencen' })
  const released = other.state.stored.CPREF1
  assert.deepEqual([released.status, released.sapUnknown, released.sapResolutions[0].outcome, released.sapResolutions[0].reason], ['deleted', undefined, 'missing', 'MI22 har intet på referencen'])
  other.sap.create = async () => ({ docs: [{ docNo: '105000905', materials: ['R1'] }], missing: [] })
  await other.service.create(MONA, 'c1', { ...CREATE, materials: ['R1'] })
  assert.equal(other.state.stored['105000905'].status, 'created', 'the materials are free again')
})

test('an unknown count or posting is resolved by a manager to counted or posted (its own number) or back to the step before', async t => {
  const docs = { 105000901: sapDoc('105000901', 'printed'), 105000902: sapDoc('105000902', 'counted', { lines: [{ material: 'R2' }] }), 105000904: sapDoc('105000904', 'printed', { lines: [{ material: 'R2' }] }) }
  const { state, sap, service } = flow(t, { docs, rows: COUNT_ROWS })
  sap.counts = async () => { throw sapUnknown() }
  sap.post = async () => { throw sapUnknown() }
  await assert.rejects(service.count(ANNA, 'c1', '105000901'), { code: 'PIDOC_UNKNOWN' })
  await assert.rejects(service.count(ANNA, 'c1', '105000904'), { code: 'PIDOC_UNKNOWN' })
  await assert.rejects(service.post(MONA, 'c1', ['105000902']), { code: 'PIDOC_UNKNOWN' })

  await assert.rejects(service.resolve(MONA, 'c1', '105000902', { outcome: 'saved', docNo: '105000901', reason: 'MI22 viser bogført' }), { code: 'PIDOC_INVALID' }, 'the number of this document')
  await service.resolve(MONA, 'c1', '105000902', { outcome: 'saved', docNo: '105000902', reason: 'MI22 viser bogført' })
  const posted = state.stored['105000902']
  assert.deepEqual([posted.status, posted.postedBy.email, posted.sapUnknown, posted.sapResolutions[0].step, posted.sapResolutions[0].outcome], ['posted', 'mona@x', undefined, 'post', 'saved'])
  assert.deepEqual(state.marked, ['R2'], 'its materials are marked "Bogført i SAP" like a posting')

  await service.resolve(MONA, 'c1', '105000904', { outcome: 'saved', docNo: '105000904', reason: 'MI03 viser antallet' })
  assert.deepEqual([state.stored['105000904'].status, state.stored['105000904'].countedBy.email], ['counted', 'anna@x'])

  await service.resolve(MONA, 'c1', '105000901', { outcome: 'missing', reason: 'MI03 viser intet antal' })
  assert.deepEqual([state.stored['105000901'].status, state.stored['105000901'].sapUnknown, state.stored['105000901'].sapResolutions[0].outcome], ['printed', undefined, 'missing'])
  sap.counts = async () => ({ message: 'ok' })
  await service.count(ANNA, 'c1', '105000901')
  assert.equal(state.stored['105000901'].status, 'counted', 'the admin can enter it again')
})
test('a SAP result in the journal is not lost when the document was marked unknown meanwhile; the mark goes and the journal is logged', async t => {
  const { state, service, journal, heal } = flow(t, { docs: { 105000901: sapDoc('105000901', 'printed') }, rows: COUNT_ROWS })
  state.failAfterSap = true
  await assert.rejects(service.count(ANNA, 'c1', '105000901'), { code: 'PIDOC_SAVE_FAILED' })
  heal()
  // Meanwhile the same document was marked unknown on M: (another attempt, another PC).
  state.stored['105000901'].sapUnknown = { step: 'count', status: 'printed', by: { email: 'bo@x', name: 'Bo', at: 1 }, detail: 'verify-failed' }
  await service.list(MONA, 'c1')
  const doc = state.stored['105000901']
  assert.deepEqual([doc.status, doc.sapUnknown, doc.countedBy.email], ['counted', undefined, 'anna@x'])
  assert.deepEqual(doc.sapResolutions.map(item => [item.step, item.outcome, item.reason, item.resolvedBy.email, item.by.email]), [['count', 'saved', 'løst af journalen', 'anna@x', 'bo@x']])
  assert.deepEqual(journal(), [])
})

test('looking at any count\'s documents writes every journalled count of the team to M:, never a deleted count or another team\'s', async t => {
  const { state, service, journal, heal } = flow(t)
  state.failAfterSap = true
  await assert.rejects(service.create(MONA, 'c1', CREATE), { code: 'PIDOC_SAVE_FAILED' })
  heal()
  state.writes.length = 0
  await service.list({ ...MONA, team: 'TRR' }, 'c2')
  state.deleted.add('c1')
  await service.list(MONA, 'c2')
  assert.deepEqual([state.writes, journal().length], [[], 1], 'kept for its own team, and while its count is deleted')
  state.deleted.delete('c1')
  await service.list(MONA, 'c2')
  assert.deepEqual(state.writes, ['c1'])
  assert.equal(state.stored['105000900'].status, 'created')
  assert.deepEqual(journal(), [])
  state.writes.length = 0
  await service.list(MONA, 'c2')
  assert.deepEqual(state.writes, [], 'an empty journal writes nothing')
})
test('a journalled delete does not settle an unknown count as saved: the mark stays and is logged as superseded', async t => {
  const { state, service, journal, heal } = flow(t, { docs: { 105000901: sapDoc('105000901', 'printed') }, rows: COUNT_ROWS })
  state.failAfterSap = true
  await assert.rejects(service.remove(MONA, 'c1', '105000901'), { code: 'PIDOC_SAVE_FAILED' })
  heal()
  const mark = { step: 'count', status: 'printed', by: { email: 'anna@x', name: 'Anna', at: 1 }, detail: 'verify-failed' }
  state.stored['105000901'].sapUnknown = mark
  const [doc] = (await service.list(MONA, 'c1')).docs
  const stored = state.stored['105000901']
  assert.deepEqual([doc.status, stored.status, stored.sapUnknown], ['deleted', 'deleted', mark])
  assert.deepEqual(stored.sapResolutions.map(item => [item.step, item.outcome, item.status, item.resolvedBy.email]), [['count', 'superseded', 'deleted', 'mona@x']])
  assert.deepEqual(journal(), [])
})