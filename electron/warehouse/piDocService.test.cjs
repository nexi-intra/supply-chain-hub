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
  const rows = [row('R1', 'accessory', { docQty: 97 }), row('R2', 'accessory', { docQty: 0 }), row('INT1-0', 'new', { docQty: 2 })]
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { const { all } = change(structuredClone(stored)); stored = all } }
  const writer = {
    enterSerials: async request => { calls.push(['serials', request]); if (failOn === request.material) throw Object.assign(new Error('x'), { code: 'PIDOC_CHECK_ERRORS' }); return { counted: request.serials.length, serials: request.serials.length, newSerials: 0 } },
    enterCounts: async request => { calls.push(['counts', request]); return { message: 'ok' } },
  }
  const serials = { 'INT1-0': ['S1', 'S2'], R5: ['A1'], R6: [] }
  // Only the list of the day may go into SAP; the serials found in the count may be days old.
  const counts = { countDoc: async () => ({ rows }), copySerials: async (user, id, { material, forDoc }) => ({ serials: forDoc === true ? serials[material] : ['STALE'] }) }
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
  assert.deepEqual(calls, [['serials', { docNo: '105000912', year: '2026', material: 'R5', serials: ['A1'] }], ['counts', { docNo: '105000912', year: '2026', entries: [{ material: 'R6', qty: 0 }] }]], 'no serials found = Zero Count in MI04')
  assert.equal(stored.D3.status, 'counted')
})

test('quantities need the SAP numbers of the day', async () => {
  let stored = { D2: { id: 'D2', docNo: '105000911', year: '2026', status: 'printed', sloc: 'D000', stockType: 'unrestricted', createdBy: { email: 'mona@x' }, lines: [{ material: 'R1', transaction: 'MI04' }] } }
  const repo = { getPiDocs: async () => structuredClone(stored), changePiDocs: async (team, id, change) => { stored = change(structuredClone(stored)).all } }
  const service = createPiDocService({ counts: { countDoc: async () => ({ rows: [row('R1', 'accessory', { docQty: null })] }) }, repo, roles: { roleOf: async () => 'admin' }, writer: {}, system: 'QS4' })
  await assert.rejects(service.count(ANNA, 'c1', 'D2'), { code: 'PIDOC_NO_QTY' })
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
