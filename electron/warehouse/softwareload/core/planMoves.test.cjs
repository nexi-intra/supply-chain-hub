const test = require('node:test')
const assert = require('node:assert/strict')
const { materialKind, normalizeSloc, planMoves } = require('./planMoves.cjs')

const row = (serial, material, sloc, blocked = false) => ({ serial, material, sloc, blocked })

test('materialKind: -0 is new, -R is used, the rest is other', () => {
  assert.equal(materialKind('INT4100-7883-0'), 'new')
  assert.equal(materialKind('INT4100-7922-0-R'), 'used')
  assert.equal(materialKind('R162-0717'), 'other')
})

test('normalizeSloc uppercases and rejects anything but a letter and three digits', () => {
  assert.equal(normalizeSloc(' d002 '), 'D002')
  assert.equal(normalizeSloc('D5'), null)
  assert.equal(normalizeSloc('D0055'), null)
})

test('in KIF a terminal on D000 goes D000 -> D005 (wave 1) and D005 -> target (wave 2)', () => {
  const p = planMoves({ kif: true, target: 'D006', terminals: [{ serial: 'A', failed: false }], sapRows: [row('A', 'M-0', 'D000')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [{ wave: 1, from: 'D000', to: 'D005', serials: ['A'] }, { wave: 2, from: 'D005', to: 'D006', serials: ['A'] }])
  assert.equal(p.outcomes.A, 'to-target')
})

test('in KIF a terminal already on the target still goes via D005', () => {
  const p = planMoves({ kif: true, target: 'D006', terminals: [{ serial: 'A', failed: false }], sapRows: [row('A', 'M-0', 'D006')], passedD005: new Set() })
  assert.deepEqual(p.transfers.map(t => [t.wave, t.from, t.to]), [[1, 'D006', 'D005'], [2, 'D005', 'D006']])
})

test('in KIF with target D005 there is one move only', () => {
  const p = planMoves({ kif: true, target: 'D005', terminals: [{ serial: 'A', failed: false }, { serial: 'B', failed: false }], sapRows: [row('A', 'M-0', 'D000'), row('B', 'M-0', 'D005')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [{ wave: 1, from: 'D000', to: 'D005', serials: ['A'] }])
})

test('outside KIF a terminal on the target is skipped and the rest move directly', () => {
  const p = planMoves({ kif: false, target: 'D006', terminals: [{ serial: 'A', failed: false }, { serial: 'B', failed: false }], sapRows: [row('A', 'M-0', 'D006'), row('B', 'M-0', 'D000')], passedD005: new Set() })
  assert.equal(p.outcomes.A, 'skipped')
  assert.deepEqual(p.transfers, [{ wave: 1, from: 'D000', to: 'D006', serials: ['B'] }])
})

test('failed new terminals go to D000 and into blocked stock; in KIF via D005', () => {
  const p = planMoves({ kif: true, target: 'D006', terminals: [{ serial: 'A', failed: true }], sapRows: [row('A', 'M-0', 'D005')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [{ wave: 2, from: 'D005', to: 'D000', serials: ['A'] }])
  assert.deepEqual(p.blocks, [{ material: 'M-0', serials: ['A'] }])
  assert.equal(p.outcomes.A, 'to-blocked')
})

test('failed used terminals go to D002; outside KIF directly', () => {
  const p = planMoves({ kif: false, target: 'D006', terminals: [{ serial: 'A', failed: true }], sapRows: [row('A', 'M-0-R', 'D000')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [{ wave: 1, from: 'D000', to: 'D002', serials: ['A'] }])
  assert.deepEqual(p.blocks, [])
  assert.equal(p.outcomes.A, 'to-d002')
})

test('a failed new terminal already on D000 outside KIF is only blocked', () => {
  const p = planMoves({ kif: false, target: 'D006', terminals: [{ serial: 'A', failed: true }], sapRows: [row('A', 'M-0', 'D000')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [])
  assert.deepEqual(p.blocks, [{ material: 'M-0', serials: ['A'] }])
})

test('not in SAP, blocked stock, already blocked and other materials are never moved', () => {
  const p = planMoves({ kif: false, target: 'D006', terminals: [{ serial: 'X', failed: false }, { serial: 'B', failed: false }, { serial: 'C', failed: true }, { serial: 'O', failed: true }], sapRows: [row('B', 'M-0', 'D000', true), row('C', 'M-0', 'D000', true), row('O', 'R162-0717', 'D000')], passedD005: new Set() })
  assert.deepEqual([p.outcomes.X, p.outcomes.B, p.outcomes.C, p.outcomes.O], ['not-found', 'blocked-stock', 'already-blocked', 'manual'])
  assert.deepEqual(p.transfers, [])
  assert.deepEqual(p.blocks, [])
})

test('resume: a terminal that passed D005 in this task and stands on the target is done', () => {
  const p = planMoves({ kif: true, target: 'D006', terminals: [{ serial: 'A', failed: false }, { serial: 'B', failed: false }], sapRows: [row('A', 'M-0', 'D006'), row('B', 'M-0', 'D005')], passedD005: new Set(['A', 'B']) })
  assert.deepEqual(p.transfers, [{ wave: 2, from: 'D005', to: 'D006', serials: ['B'] }])
  assert.equal(p.outcomes.A, 'to-target')
})

test('terminals with the same wave, from and to share one transfer', () => {
  const p = planMoves({ kif: false, target: 'D006', terminals: [{ serial: 'A', failed: false }, { serial: 'B', failed: false }], sapRows: [row('A', 'M-0', 'D000'), row('B', 'N-0', 'D000')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [{ wave: 1, from: 'D000', to: 'D006', serials: ['A', 'B'] }])
})
