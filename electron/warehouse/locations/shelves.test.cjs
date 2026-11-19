// Hyldelager: material + quantity per shelf, merged per material; and the one-time migration of shelf pallets.
const test = require('node:test')
const assert = require('node:assert/strict')
const { shelfOf, isShelf, holdsPallets, palletLimit } = require('./model.cjs')
const { stockId, putStock, takeStock, stockOn, stockOf, shelfForRefill, migrateShelves } = require('./shelves.cjs')

const by = { email: 'anna@x.test', name: 'Anna' }
const place = (name, extra = {}) => ({ id: name, name, area: name.replace(/[\d. ].*$/, ''), type: 'Palle', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '', ...extra })
const pallet = (id, location, extra = {}) => ({ id, location, material: 'R162-0717', quantity: 10, receivedAt: 1, document: null, serials: [], sloc: 'D000', tags: [], note: '', createdAt: 1, ...extra })

test('shelfOf reads "E9 H5" as rack E9, shelf 5, and nothing else', () => {
  assert.deepEqual(shelfOf('E9 H5'), { rack: 'E9', shelf: 5 })
  assert.deepEqual(shelfOf('reol x 1 h12'), { rack: 'REOL X 1', shelf: 12 })
  for (const name of ['A1.1', 'H26', 'E9H5', 'E9 H', 'E9 H123']) assert.equal(shelfOf(name), null, name)
})

test('the type decides what a place holds: one pallet, any number on the floor, stock on a lagerhylde', () => {
  assert.equal(palletLimit(place('A1.1')), 1)
  assert.equal(palletLimit(place('A1.2', { capacity: 2 })), 2, 'a pallet place with room for two (S0) takes two')
  assert.equal(palletLimit(place('F1.0', { type: 'Gulv', capacity: 3 })), Infinity)
  assert.equal(palletLimit(place('B1', { type: 'Bord', capacity: 4 })), 4)
  assert.equal(isShelf(place('E9 H5', { type: 'Hylde' })), true)
  assert.equal(isShelf(place('H26', { type: 'Hylde', purpose: 'pick' })), false)
  assert.equal(holdsPallets(place('E9 H5', { type: 'Hylde' })), false)
  assert.equal(holdsPallets(place('F1.0', { type: 'Gulv' })), true)
  assert.equal(holdsPallets(place('H26', { type: 'Hylde', purpose: 'pick' })), false)
})

test('putStock merges the same material on a shelf; takeStock removes the line at 0', () => {
  const stock = {}
  putStock(stock, { location: 'E9 H5', material: 'R162-0717', quantity: 40, by, at: 1 })
  putStock(stock, { location: 'E9 H5', material: 'R162-0717', quantity: 10, by, at: 2 })
  assert.equal(stockId('E9 H5', 'R162-0717'), 'E9 H5|R162-0717')
  assert.equal(stock['E9 H5|R162-0717'].quantity, 50)
  assert.equal(stock['E9 H5|R162-0717'].updatedAt, 2)
  assert.equal(takeStock(stock, { location: 'E9 H5', material: 'R162-0717', quantity: 5 }).taken, 5)
  assert.throws(() => takeStock(stock, { location: 'E9 H5', material: 'R162-0717', quantity: 46 }), { code: 'STOCK_TOO_LOW' })
  assert.equal(stock['E9 H5|R162-0717'].quantity, 45, 'a refusal changes nothing')
  assert.deepEqual(takeStock(stock, { location: 'E9 H5', material: 'R162-0717' }), { left: null, taken: 45 })
  assert.equal(stock['E9 H5|R162-0717'], undefined)
  assert.throws(() => takeStock(stock, { location: 'E9 H5', material: 'R162-0717', quantity: 1 }), { code: 'STOCK_GONE' })
})

test('stockOn, stockOf and shelfForRefill read the lines', () => {
  const state = { locations: { 'E9 H5': place('E9 H5', { type: 'Hylde' }), 'E9 H2': place('E9 H2', { type: 'Hylde' }), 'E8 H1': place('E8 H1', { type: 'Hylde', active: false }) }, pallets: {}, stock: {} }
  putStock(state.stock, { location: 'E9 H5', material: 'R162-0717', quantity: 10, by, at: 1 })
  putStock(state.stock, { location: 'E9 H5', material: 'R133-0032', quantity: 3, by, at: 1 })
  putStock(state.stock, { location: 'E9 H2', material: 'R162-0717', quantity: 40, by, at: 1 })
  putStock(state.stock, { location: 'E8 H1', material: 'R162-0717', quantity: 99, by, at: 1 })
  assert.deepEqual(stockOn(state, 'E9 H5').map(line => line.material), ['R133-0032', 'R162-0717'])
  assert.deepEqual(stockOf(state, 'R162-0717').map(line => line.location), ['E8 H1', 'E9 H2', 'E9 H5'])
  assert.equal(shelfForRefill(state, 'R162-0717').location, 'E9 H2', 'the largest line on an active lagerhylde')
  assert.equal(shelfForRefill(state, 'R999-0000'), null)
})

test('migrateShelves turns pallets on lagerhylder into stock, merged, with 49/50 and serials in the note', () => {
  const state = {
    locations: { 'E9 H5': place('E9 H5', { type: 'Hylde' }), 'H26': place('H26', { type: 'Hylde', purpose: 'pick' }), 'A1.1': place('A1.1') },
    pallets: {
      p1: pallet('p1', 'E9 H5', { quantity: 10, document: '5000032337', serials: ['S1'] }),
      p2: pallet('p2', 'E9 H5', { quantity: 5 }),
      p3: pallet('p3', 'A1.1'),
    },
    stock: {},
  }
  const result = migrateShelves(state, { at: 5, by })
  assert.equal(result.stock['E9 H5|R162-0717'].quantity, 15)
  assert.match(result.stock['E9 H5|R162-0717'].note, /5000032337/)
  assert.match(result.stock['E9 H5|R162-0717'].note, /S1/)
  assert.deepEqual(result.removedPallets.sort(), ['p1', 'p2'])
  assert.deepEqual(result.shelved, ['E9 H5'])
  assert.deepEqual([state.locations['E9 H5'].rack, state.locations['E9 H5'].shelf], ['E9', 5])
  assert.equal(state.locations.H26.rack, undefined, 'H26 is not a rack shelf name')
})

test('the migration leaves a pallet without a quantity (or 0) where it is instead of dropping it', () => {
  const state = {
    locations: { 'E9 H5': place('E9 H5', { type: 'Hylde' }) },
    pallets: { p1: pallet('p1', 'E9 H5', { quantity: null }), p2: pallet('p2', 'E9 H5', { quantity: 0 }), p3: pallet('p3', 'E9 H5', { quantity: 4 }) },
    stock: {},
  }
  const result = migrateShelves(state, { at: 5, by })
  assert.deepEqual(result.removedPallets, ['p3'])
  assert.deepEqual(result.kept.sort(), ['p1', 'p2'], 'kept as pallets, shown on the shelf so someone can count them')
  assert.equal(result.stock['E9 H5|R162-0717'].quantity, 4)
})
