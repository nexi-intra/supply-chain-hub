// Hyldelager as pure functions: one line per lagerhylde and material (material + quantity, merged per material,
// removed at 0), and the one-time migration of pallets that stood on lagerhylder before. No storage – the service feeds them.
const { isShelf, shelfOf } = require('./model.cjs')

const codeError = (code, message) => Object.assign(new Error(message || code), { code })
const NOTE_MAX = 500

/** "E9 H5|R162-0717": a line's id, so the same material on the same shelf is always one line. */
const stockId = (location, material) => `${location}|${material}`

/** Adds `quantity` of a material to a shelf (a new line, or more on the existing one); returns the line. */
function putStock(stock, { location, material, quantity, by, at, note }) {
  const id = stockId(location, material)
  const line = stock[id]
  if (line) {
    line.quantity += quantity
    line.updatedAt = at
    line.updatedBy = by
    if (note) line.note = [line.note, note].filter(Boolean).join(' · ').slice(0, NOTE_MAX)
    return line
  }
  stock[id] = { id, location, material, quantity, updatedAt: at, updatedBy: by, note: note ? String(note).slice(0, NOTE_MAX) : '' }
  return stock[id]
}

/** Takes `quantity` (all when left out) of a material from a shelf; the line goes at 0. */
function takeStock(stock, { location, material, quantity }) {
  const id = stockId(location, material)
  const line = stock[id]
  if (!line) throw codeError('STOCK_GONE', `${material} er ikke på ${location} længere`)
  if (quantity === undefined || quantity === null) {
    delete stock[id]
    return { left: null, taken: line.quantity }
  }
  if (quantity > line.quantity) throw codeError('STOCK_TOO_LOW', `Der er kun ${line.quantity} stk. ${material} på ${location}`)
  if (quantity === line.quantity) {
    delete stock[id]
    return { left: null, taken: quantity }
  }
  line.quantity -= quantity
  return { left: line, taken: quantity }
}

/** The lines on one shelf, by material. */
const stockOn = (state, locationId) => Object.values(state.stock || {}).filter(line => line.location === locationId).sort((a, b) => a.material.localeCompare(b.material))

/** A material's lines on all shelves, largest first. */
const stockOf = (state, material) => Object.values(state.stock || {}).filter(line => line.material === material)
  .sort((a, b) => b.quantity - a.quantity || a.location.localeCompare(b.location, 'da', { numeric: true }))

/** The shelf line to refill a pick place from when there is no reserve pallet: the largest on an active lagerhylde. */
function shelfForRefill(state, material) {
  return stockOf(state, material).find(line => {
    const place = state.locations?.[line.location]
    return place && place.active !== false && isShelf(place)
  }) || null
}

/**
 * The one-time migration: every Hylde named like "E9 H5" gets rack and shelf (mutated on `state.locations`), and the
 * pallets on lagerhylder become stock, merged per material, their 49/50 numbers and serials kept in the line's note.
 * A pallet without a quantity (or 0) is kept as it is (`kept`): it is shown on the shelf, so someone can count it.
 */
function migrateShelves(state, { at, by }) {
  for (const location of Object.values(state.locations || {})) {
    if (location.type !== 'Hylde' || location.rack) continue
    const parsed = shelfOf(location.name)
    if (parsed) Object.assign(location, parsed)
  }
  const stock = structuredClone(state.stock || {})
  const removedPallets = []
  const kept = []
  const shelved = new Set()
  const notes = new Map()
  for (const pallet of Object.values(state.pallets || {})) {
    const place = state.locations?.[pallet.location]
    if (!place || !isShelf(place)) continue
    if (!(pallet.quantity >= 1)) { kept.push(pallet.id); continue }
    removedPallets.push(pallet.id)
    shelved.add(place.id)
    putStock(stock, { location: place.id, material: pallet.material, quantity: pallet.quantity, by, at })
    const id = stockId(place.id, pallet.material)
    const entry = notes.get(id) || { documents: new Set(), serials: new Set() }
    if (pallet.document) entry.documents.add(pallet.document)
    for (const serial of pallet.serials || []) entry.serials.add(serial)
    notes.set(id, entry)
  }
  for (const [id, { documents, serials }] of notes) {
    const note = [documents.size ? `49/50: ${[...documents].join(', ')}` : '', serials.size ? `Serienumre: ${[...serials].join(', ')}` : ''].filter(Boolean).join(' · ')
    if (note) stock[id].note = [stock[id].note, note].filter(Boolean).join(' · ').slice(0, NOTE_MAX)
  }
  return { stock, removedPallets, kept, shelved: [...shelved].sort() }
}

module.exports = { stockId, putStock, takeStock, stockOn, stockOf, shelfForRefill, migrateShelves }
