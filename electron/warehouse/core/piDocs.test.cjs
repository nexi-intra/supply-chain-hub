const test = require('node:test')
const assert = require('node:assert/strict')
const { transactionFor, serialFormat, planDocument, refusal } = require('./piDocs.cjs')

test('transaction: everything with serial numbers in ZMS_COUNT_SERIAL, without in MI04', () => {
  assert.equal(transactionFor({ material: 'INT4300-4921-0', kind: 'new', serialManaged: true }), 'ZMS_COUNT_SERIAL')
  assert.equal(transactionFor({ material: 'INT4300-4921-9', kind: 'new', serialManaged: true }), 'ZMS_COUNT_SERIAL')
  assert.equal(transactionFor({ material: 'INT4300-4921-0-R', kind: 'used', serialManaged: true }), 'ZMS_COUNT_SERIAL')
  assert.equal(transactionFor({ material: 'R162-0717', kind: 'accessory', serialManaged: false }), 'MI04')
  assert.equal(transactionFor({ material: 'R170-0001', kind: 'accessory', serialManaged: true }), 'ZMS_COUNT_SERIAL')
})

test('serials: blocked always short; unrestricted long only where the rule says so', () => {
  assert.equal(serialFormat({ stockType: 'unrestricted', rule: { unrestricted: true } }), 'long')
  assert.equal(serialFormat({ stockType: 'unrestricted', rule: null }), 'short')
  assert.equal(serialFormat({ stockType: 'blocked', rule: { unrestricted: true, blocked: true } }), 'short')
})

const row = (material, kind, extra = {}) => ({ material, description: `${material} tekst`, kind, sloc: 'D000', stockType: 'unrestricted', serialManaged: kind !== 'accessory', status: 'approved', ...extra })
const rows = [row('INT1-0', 'new'), row('INT2-0', 'new'), row('INT1-0-R', 'used'), row('INT2-0-R', 'used'), row('R1', 'accessory'), row('R2', 'accessory'), row('R3', 'accessory', { status: 'open' }), row('R4', 'accessory', { stockType: 'blocked' }), row('R5', 'accessory', { serialManaged: true })]

test('a document: approved materials only, one new terminal or several used terminals or accessories, never twice', () => {
  const terminal = planDocument({ rows, materials: ['int1-0'], sloc: 'D000', stockType: 'unrestricted' })
  assert.deepEqual([terminal.kind, terminal.lines[0].material, terminal.lines[0].transaction], ['new', 'INT1-0', 'ZMS_COUNT_SERIAL'])
  const used = planDocument({ rows, materials: ['INT1-0-R', 'INT2-0-R'], sloc: 'D000', stockType: 'unrestricted' })
  assert.deepEqual([used.kind, used.transaction, used.lines.length], ['used', 'ZMS_COUNT_SERIAL', 2], 'used terminals (-0-R) may share a document')
  const accessories = planDocument({ rows, materials: ['R1', 'R2', 'R1'], sloc: 'D000', stockType: 'unrestricted' })
  assert.deepEqual([accessories.kind, accessories.transaction, accessories.lines.map(line => line.material)], ['accessory', 'MI04', ['R1', 'R2']])
  assert.throws(() => planDocument({ rows, materials: ['R1', 'R5'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_MIXED' }, 'with and without serial numbers never together')
  assert.equal(planDocument({ rows, materials: ['R5'], sloc: 'D000', stockType: 'unrestricted' }).transaction, 'ZMS_COUNT_SERIAL')

  assert.throws(() => planDocument({ rows, materials: ['INT1-0', 'INT2-0'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_ONE_NEW' })
  assert.throws(() => planDocument({ rows, materials: ['INT1-0', 'INT1-0-R'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_ONE_NEW' })
  assert.throws(() => planDocument({ rows, materials: ['INT1-0', 'R1'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_ONE_NEW' })
  assert.throws(() => planDocument({ rows, materials: ['INT1-0-R', 'R5'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_MIXED' }, 'used terminals and accessories never together')
  assert.throws(() => planDocument({ rows, materials: ['R3'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_NOT_APPROVED' })
  assert.throws(() => planDocument({ rows, materials: ['R4'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_INVALID' }, 'blocked row is not on an unrestricted document')
  assert.equal(planDocument({ rows, materials: ['R4'], sloc: 'D000', stockType: 'blocked' }).stockType, 'blocked')
  assert.throws(() => planDocument({ rows, materials: [], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_EMPTY' })
  const many = Array.from({ length: 21 }, (_, index) => row(`R9${String(index).padStart(2, '0')}`, 'accessory'))
  assert.equal(planDocument({ rows: many, materials: many.slice(0, 20).map(item => item.material), sloc: 'D000', stockType: 'unrestricted' }).lines.length, 20)
  assert.throws(() => planDocument({ rows: many, materials: many.map(item => item.material), sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_TOO_MANY' }, 'at most 20 materials per document')

  const docs = [{ status: 'created', sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R1' }] }, { status: 'deleted', sloc: 'D000', stockType: 'unrestricted', lines: [{ material: 'R2' }] }]
  assert.throws(() => planDocument({ rows, docs, materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_EXISTS' })
  assert.equal(planDocument({ rows, docs, materials: ['R2'], sloc: 'D000', stockType: 'unrestricted' }).lines.length, 1, 'a deleted document frees the material')
})

test('who does what: managers create, print, post and delete; admins count, never the creator', () => {
  const doc = status => ({ status, createdBy: { email: 'mona@x' } })
  assert.equal(refusal({ action: 'create', role: 'status-manager' }), null)
  assert.match(refusal({ action: 'create', role: 'admin' }), /Kun managers/)
  assert.equal(refusal({ action: 'print', role: 'manager', doc: doc('created') }), null)
  assert.match(refusal({ action: 'count', role: 'admin', doc: doc('created') }), /ikke klar/)
  assert.equal(refusal({ action: 'count', role: 'admin', email: 'anna@x', doc: doc('printed') }), null)
  assert.match(refusal({ action: 'count', role: 'admin', email: 'MONA@x', doc: doc('printed') }), /oprettede/)
  assert.match(refusal({ action: 'count', role: 'manager', doc: doc('printed') }), /Kun admins/)
  assert.match(refusal({ action: 'count', role: 'user', doc: doc('printed') }), /Kun admins/)
  assert.equal(refusal({ action: 'post', role: 'manager', doc: doc('counted') }), null)
  assert.equal(refusal({ action: 'delete', role: 'manager', doc: doc('printed') }), null)
  assert.match(refusal({ action: 'delete', role: 'manager', doc: doc('counted') }), /lagt antal på/)
  assert.match(refusal({ action: 'delete', role: 'manager', doc: doc('posted') }), /lagt antal på/)
  assert.match(refusal({ action: 'delete', role: 'admin', doc: doc('created') }), /Kun managers/)
})

test('a document SAP may or may not have (unknown) holds its materials and waits for a manager; nothing else can be done to it', () => {
  const lines = [{ material: 'R1' }]
  // Stored as 1.6.7 can read it: the status it had, with the unknown step beside it. A plain 'unknown' status holds too.
  const flagged = { status: 'created', sloc: 'D000', stockType: 'unrestricted', lines, sapUnknown: { step: 'create', status: 'created' } }
  for (const doc of [flagged, { status: 'unknown', sloc: 'D000', stockType: 'unrestricted', lines }]) {
    assert.throws(() => planDocument({ rows, docs: [doc], materials: ['R1'], sloc: 'D000', stockType: 'unrestricted' }), { code: 'PIDOC_EXISTS' })
  }
  for (const action of ['print', 'delete']) assert.notEqual(refusal({ action, role: 'manager', doc: flagged }), null, action)
  assert.notEqual(refusal({ action: 'count', role: 'admin', email: 'a@x', doc: { ...flagged, status: 'printed', sapUnknown: { step: 'count', status: 'printed' } } }), null)
  assert.equal(refusal({ action: 'resolve', role: 'manager', doc: flagged }), null)
  assert.equal(refusal({ action: 'resolve', role: 'status-manager', doc: flagged }), null)
  assert.notEqual(refusal({ action: 'resolve', role: 'admin', doc: flagged }), null, 'managers decide')
  assert.notEqual(refusal({ action: 'resolve', role: 'manager', doc: { ...flagged, sapUnknown: undefined } }), null, 'only an unknown document is resolved')
  // The step was taken since (an older client went on): the mark is old and the document is what its status says.
  assert.equal(refusal({ action: 'print', role: 'manager', doc: { ...flagged, status: 'created', sapUnknown: { step: 'count', status: 'printed' } } }), null)
})