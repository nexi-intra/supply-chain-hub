// Placeringer (Lagerstyring): names, purposes and types shared by the repository, rules and service.
const PURPOSES = Object.freeze(['reserve', 'pick', 'station', 'reserved'])
// The purposes a drawing sets; reserved and station stay Placeringer's.
const DRAWN_PURPOSES = Object.freeze(['reserve', 'pick'])
const TYPES = Object.freeze(['Palle', 'Hylde', 'Reol', 'Bord', 'Swap', 'Gulv'])
const KEYS = Object.freeze({ locations: 'locations', pallets: 'pallets', stock: 'stock', tags: 'tags', meta: 'meta' })
const STATE_KEYS = Object.freeze(Object.keys(KEYS))
// The warehouse drawing: published layout, the admin's draft and the last published versions (newest first).
const LAYOUT_KEYS = Object.freeze({ layout: 'layout', draft: 'layout-draft', versions: 'layout-versions' })

/** One place, however it is typed: " a2.4 " and "A2.4" are the same, so are "Reol  X 1" and "REOL X 1". */
const locationKey = name => String(name ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

/** The area is the letters before the first digit or space, like the sheet's prefix lookup (also for K, Prep, Reol). */
function areaFromName(name) {
  const match = /^[A-Za-zÆØÅæøå]+/.exec(String(name ?? '').trim())
  return match ? match[0].toUpperCase() : ''
}

/** "E9 H5" is rack E9, shelf 5 (the sheet's names); anything else is not a rack shelf. */
function shelfOf(name) {
  const match = /^(.+?)\s+H(\d{1,2})$/i.exec(String(name ?? '').trim().replace(/\s+/g, ' '))
  return match ? { rack: match[1].toUpperCase(), shelf: Number(match[2]) } : null
}

/** A lagerhylde: a shelf holding stock (material + quantity). A pick shelf is a pick place like today. */
const isShelf = location => location?.type === 'Hylde' && location.purpose === 'reserve'

/** Whether pallets may be put here: not a lagerhylde, and not a pick place, station or reserved place. */
const holdsPallets = location => !isShelf(location) && location?.purpose === 'reserve'

/** How many pallets fit, decided by the type: a pallet place one (or its capacity, like S0 with two), a floor any number; a lagerhylde none. */
function palletLimit(location) {
  if (isShelf(location)) return 0
  if (location?.type === 'Palle') return location.capacity > 1 ? location.capacity : 1
  if (location?.type === 'Gulv') return Infinity
  return location?.capacity ?? 1
}

module.exports = { PURPOSES, DRAWN_PURPOSES, TYPES, KEYS, STATE_KEYS, LAYOUT_KEYS, locationKey, areaFromName, shelfOf, isShelf, holdsPallets, palletLimit }
