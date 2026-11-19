// Placeringer's rules as pure functions over `state = { locations, pallets }`: occupancy, FIFO, where to put a
// pallet, what to refill a pick place with, and search. No storage, no SAP – the service feeds them.
const { locationKey, holdsPallets, palletLimit } = require('./model.cjs')

const DAY_MS = 86400000
const byName = (a, b) => a.name.localeCompare(b.name, 'da', { numeric: true })
const active = state => Object.values(state.locations || {}).filter(location => location.active !== false)
const fixedOf = location => location.fixedMaterials || []

/** Pallets per place and how many more fit (by type: a pallet place one, a floor any number – capacity and free null). */
function occupancy(state) {
  const used = {}
  for (const pallet of Object.values(state.pallets || {})) used[pallet.location] = (used[pallet.location] || 0) + 1
  return Object.fromEntries(Object.values(state.locations || {}).map(location => {
    const count = used[location.id] || 0
    const limit = palletLimit(location)
    return [location.id, Number.isFinite(limit) ? { used: count, capacity: limit, free: Math.max(limit - count, 0) } : { used: count, capacity: null, free: null }]
  }))
}

/** Capacity per area for active pallet places with a limit (no floors, no shelves; pick places hold no pallets). */
function areaSummary(state) {
  const occupied = occupancy(state)
  const areas = new Map()
  for (const location of active(state).filter(item => holdsPallets(item) && Number.isFinite(palletLimit(item)))) {
    const entry = areas.get(location.area) || { area: location.area, capacity: 0, used: 0, free: 0 }
    entry.capacity += occupied[location.id].capacity
    entry.used += occupied[location.id].used
    entry.free += occupied[location.id].free
    areas.set(location.area, entry)
  }
  return [...areas.values()].sort((a, b) => a.area.localeCompare(b.area, 'da'))
}

/** Reserve pallets of a material, oldest first: the one to take next. */
function fifo(state, material, { now = Date.now() } = {}) {
  const reserve = new Set(active(state).filter(location => location.purpose === 'reserve').map(location => location.id))
  return Object.values(state.pallets || {})
    .filter(pallet => pallet.material === material && reserve.has(pallet.location))
    .sort((a, b) => (a.receivedAt || 0) - (b.receivedAt || 0) || (a.createdAt || 0) - (b.createdAt || 0))
    .map(pallet => ({ ...pallet, ageDays: Math.floor((now - (pallet.receivedAt || now)) / DAY_MS) }))
}

const aisleOf = name => (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : null)

/** Free reserve places for a new pallet: its fixed place, then the aisles it already stands in, then its area, then the rest. */
function suggestSlots(state, material, { limit = 8 } = {}) {
  const occupied = occupancy(state)
  const free = active(state).filter(location => holdsPallets(location) && (occupied[location.id].free === null || occupied[location.id].free > 0) && (!fixedOf(location).length || fixedOf(location).includes(material)))
  const own = Object.values(state.pallets || {}).filter(pallet => pallet.material === material).map(pallet => state.locations[pallet.location]).filter(Boolean)
  const aisles = new Set(own.map(location => aisleOf(location.name)).filter(Boolean))
  const areas = new Set(own.map(location => location.area))
  const rank = location => (fixedOf(location).includes(material) ? 0 : aisles.has(aisleOf(location.name)) ? 1 : areas.has(location.area) ? 2 : 3)
  return free
    .map(location => ({ location, rank: rank(location) }))
    .sort((a, b) => a.rank - b.rank || byName(a.location, b.location))
    .slice(0, limit)
    .map(({ location, rank: order }) => ({ location: location.id, reason: order === 0 ? 'fixed' : order === 1 ? 'near' : 'free' }))
}

const fixedPlaces = (state, material, purpose) => active(state).filter(location => location.purpose === purpose && fixedOf(location).includes(material)).sort(byName)
const pickPlaces = (state, material) => fixedPlaces(state, material, 'pick')
const stations = (state, material) => fixedPlaces(state, material, 'station')

/** The pallet to refill a pick place with: the oldest reserve pallet of the material (needed when the place has several). */
function refillSuggestion(state, pickLocationId, { now = Date.now(), material } = {}) {
  const location = state.locations?.[pickLocationId]
  if (!location || location.purpose !== 'pick') return null
  const fixed = fixedOf(location)
  const wanted = material || (fixed.length === 1 ? fixed[0] : null)
  if (!wanted || !fixed.includes(wanted)) return null
  return fifo(state, wanted, { now })[0] || null
}

/** One search field: material (prefix), description (every word), place (prefix), 49/50 number (prefix) and serial (exact). */
function search(state, texts, query) {
  const q = String(query ?? '').trim()
  if (!q) return { materials: [], locations: [], pallets: [], racks: [] }
  const upper = q.toUpperCase()
  const words = q.toLowerCase().split(/\s+/)
  const pallets = Object.values(state.pallets || {})
  const known = new Set([...Object.keys(texts || {}), ...pallets.map(pallet => pallet.material), ...Object.values(state.locations || {}).flatMap(fixedOf)])
  const materials = [...known].filter(material => material.toUpperCase().startsWith(upper) || (texts?.[material] && words.every(word => texts[material].toLowerCase().includes(word)))).sort()
  const key = locationKey(q)
  const locations = Object.values(state.locations || {}).filter(location => location.id.startsWith(key)).sort(byName).map(location => location.id)
  const digits = q.replace(/\s+/g, '')
  const found = pallets.filter(pallet => (/^\d{4,}$/.test(digits) && String(pallet.document || '').replace(/\s+/g, '').startsWith(digits)) || (pallet.serials || []).includes(upper)).map(pallet => pallet.id)
  const racks = [...new Set(Object.values(state.locations || {}).map(location => location.rack).filter(rack => rack && rack.startsWith(key)))].sort((a, b) => a.localeCompare(b, 'da', { numeric: true }))
  return { materials, locations, pallets: found, racks }
}

module.exports = { occupancy, areaSummary, fifo, suggestSlots, pickPlaces, stations, refillSuggestion, search }
