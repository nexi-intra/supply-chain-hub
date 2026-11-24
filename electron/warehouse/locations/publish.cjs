// Udgivelse af tegningen: the drawing owns the places, so a publish first works out what happens to the hub's place list.
const { placesOf } = require('./layout.cjs')
const { locationKey, isShelf, areaFromName, shelfOf, DRAWN_PURPOSES } = require('./model.cjs')
const { stockId } = require('./shelves.cjs')

const codeError = (code, message) => Object.assign(new Error(message || code), { code })
const byName = (a, b) => a.localeCompare(b, 'da', { numeric: true })
const palletsText = n => (n === 1 ? '1 palle' : `${n} paller`)
const materialsText = n => (n === 1 ? '1 materiale' : `${n} materialer`)
const goodsText = ({ pallets, stock }) => [pallets && palletsText(pallets), stock && materialsText(stock)].filter(Boolean).join(' og ')

/** How many pallets or stock lines stand on each place. */
function countByLocation(entries) {
  const counts = new Map()
  for (const entry of Object.values(entries ?? {})) counts.set(entry.location, (counts.get(entry.location) ?? 0) + 1)
  return counts
}

/** What the drawing changes on a list place it keeps: the type, a Palle's capacity and pick/reserve. A special slot changes nothing. */
function changesOf(location, place) {
  const changes = {}
  if (!place.type) return changes
  if (location.type !== place.type) changes.type = [location.type, place.type]
  if (place.type === 'Palle' && location.capacity !== place.capacity) changes.capacity = [location.capacity ?? null, place.capacity]
  if (DRAWN_PURPOSES.includes(location.purpose) && location.purpose !== place.purpose) changes.purpose = [location.purpose, place.purpose]
  return changes
}

/** editLocation's refusals: no stock lines on what is not a lagerhylde, no pallets on what becomes one or becomes a pick place. */
function refusal(location, after, { pallets, stock }) {
  if (stock && !isShelf(after)) return `Der står ${materialsText(stock)} på ${location.name} – tøm hylden først`
  if (pallets && isShelf(after)) return `Der står ${palletsText(pallets)} på ${location.name} – flyt ${pallets === 1 ? 'den' : 'dem'} først`
  if (pallets && location.purpose === 'reserve' && after.purpose === 'pick') return `Der står ${palletsText(pallets)} på ${location.name} – flyt ${pallets === 1 ? 'den' : 'dem'}, før den bliver pluk-plads`
  return null
}

/** What publishing `next` does to the team's places: created, renamed, changed, removed, left outside, and what blocks it. Writes nothing. */
function planPublish({ next, previous, state, team }) {
  const locations = state.locations ?? {}
  const palletsAt = countByLocation(state.pallets)
  const linesAt = countByLocation(state.stock)
  const goods = id => ({ pallets: palletsAt.get(id) ?? 0, stock: linesAt.get(id) ?? 0 })
  const blocked = []
  const block = (code, name, detail) => blocked.push({ code, name, detail })

  const nextPlaces = placesOf(next, team)
  const previousPlaces = placesOf(previous, team)
  const prevBySlot = new Map(previousPlaces.map(place => [place.slotId, place]))
  const wasDrawn = new Set(previousPlaces.map(place => place.id))
  const toRemove = new Set((next.decisions?.remove ?? []).map(locationKey))
  const places = []
  for (const same of Map.groupBy(nextPlaces, place => place.id).values()) {
    places.push(same[0])
    if (same.length > 1) block('NAME_TWICE', same[0].name, `Navnet står ${same.length} gange på tegningen: ${same.map(place => place.name).join(', ')}`)
  }

  // A slot keeps its place under a new name, so its pallets and stock go along; a special slot can only adopt.
  // A new name of a list place outside the drawing adopts that place instead, and the slot's old place is dropped.
  const renameFrom = new Map()
  const adoptedBy = new Set()
  for (const place of places) {
    const was = prevBySlot.get(place.slotId)
    if (!place.type || !was || was.id === place.id || !locations[was.id]) continue
    if (locations[place.id] && !wasDrawn.has(place.id) && !toRemove.has(place.id)) adoptedBy.add(place.slotId)
    else renameFrom.set(place.slotId, locations[was.id])
  }
  const renamedAway = new Set([...renameFrom.values()].map(location => location.id))

  const create = []
  const rename = []
  const change = []
  const linked = []
  const kept = new Set()
  let unchanged = 0
  for (const place of places) {
    const from = renameFrom.get(place.slotId)
    const location = from ?? (renamedAway.has(place.id) ? null : locations[place.id])
    if (!location && !place.type) {
      block('SPECIAL_UNKNOWN', place.name, `${place.name} findes ikke i listen`)
      continue
    }
    linked.push(place.id)
    if (!location) {
      create.push({ slotId: place.slotId, name: place.name, type: place.type, purpose: place.purpose, capacity: place.capacity })
      continue
    }
    kept.add(location.id)
    const contents = goods(location.id)
    if (from) rename.push({ slotId: place.slotId, from: from.name, to: place.name, ...contents })
    const name = from ? place.name : location.name
    const changes = changesOf(location, place)
    if (!Object.keys(changes).length) {
      if (!from) unchanged++
      continue
    }
    change.push({ slotId: place.slotId, name, changes })
    const refused = (changes.type || changes.purpose) && refusal(location, { type: place.type, purpose: changes.purpose?.[1] ?? location.purpose }, contents)
    if (refused) block('TYPE_REFUSED', name, refused)
  }

  const remove = []
  const removed = new Set()
  const removeOne = location => {
    const contents = goods(location.id)
    removed.add(location.id)
    remove.push({ name: location.name, ...contents })
    if (contents.pallets || contents.stock) block('NOT_EMPTY', location.name, `Der står ${goodsText(contents)} på ${location.name}`)
  }
  const drawnSlots = new Set(nextPlaces.map(place => place.slotId))
  for (const was of prevBySlot.values()) {
    const location = locations[was.id]
    const dropped = !drawnSlots.has(was.slotId) || adoptedBy.has(was.slotId)
    if (location && dropped && !kept.has(location.id) && !removed.has(location.id)) removeOne(location)
  }
  const outside = []
  for (const location of Object.values(locations)) {
    if (kept.has(location.id) || removed.has(location.id)) continue
    if (toRemove.has(location.id)) removeOne(location)
    else outside.push({ name: location.name, type: location.type, purpose: location.purpose, ...goods(location.id) })
  }

  for (const { from, to } of rename) {
    const taken = locations[locationKey(to)]
    if (taken && !renamedAway.has(taken.id) && !removed.has(taken.id)) block('NAME_TAKEN', to, `${taken.name} findes allerede – ${from} kan ikke omdøbes`)
  }

  linked.sort(byName)
  return {
    basedOn: next.basedOn,
    version: previous?.version ?? 0,
    create, rename, change, remove, outside, blocked, linked,
    counts: { create: create.length, rename: rename.length, change: change.length, remove: remove.length, outside: outside.length, blocked: blocked.length, unchanged },
  }
}

/** A Hylde named like "E9 H5" has its rack and shelf; any other place has none. */
function setShelf(location) {
  delete location.rack
  delete location.shelf
  if (location.type === 'Hylde') Object.assign(location, shelfOf(location.name))
}

/** Carries out a plan on tx's places, pallets and stock lines (no drawing keys, no event); LAYOUT_BLOCKED before touching anything. */
function applyPublish(tx, plan, { at, by }) {
  if (plan.blocked.length) {
    const names = [...new Set(plan.blocked.map(entry => entry.name))]
    const more = names.length > 3 ? ` og ${names.length - 3} mere` : ''
    throw codeError('LAYOUT_BLOCKED', `Tegningen kan ikke udgives – ret først ${names.slice(0, 3).join(', ')}${more}`)
  }
  const stamp = { updatedAt: at, updatedBy: by }

  // The ids from before the renames: a place may be renamed onto the name of one removed here.
  for (const { name } of plan.remove) delete tx.locations[locationKey(name)]

  // All renamed places out first, then in under their new ids, so a swap or a chain loses nothing.
  const moved = new Map(plan.rename.map(({ from, to }) => [locationKey(from), locationKey(to)]))
  const renamed = plan.rename.map(({ from, to }) => {
    const location = tx.locations[locationKey(from)]
    delete tx.locations[location.id]
    return { ...location, id: locationKey(to), name: to, ...stamp }
  })
  for (const location of renamed) {
    setShelf(location)
    tx.locations[location.id] = location
  }
  for (const pallet of Object.values(tx.pallets)) if (moved.has(pallet.location)) pallet.location = moved.get(pallet.location)
  const lines = Object.values(tx.stock).filter(entry => moved.has(entry.location))
  for (const entry of lines) delete tx.stock[entry.id]
  for (const entry of lines) {
    const location = moved.get(entry.location)
    const id = stockId(location, entry.material)
    tx.stock[id] = { ...entry, id, location }
  }

  for (const { name, type, purpose, capacity } of plan.create) {
    const id = locationKey(name)
    tx.locations[id] = { id, name, area: areaFromName(name), type, purpose, capacity, fixedMaterials: [], ...(type === 'Hylde' ? shelfOf(name) : null), active: true, note: '', ...stamp }
  }

  for (const { name, changes } of plan.change) {
    const location = tx.locations[locationKey(name)]
    if (changes.purpose) location.purpose = changes.purpose[1]
    if (changes.capacity) location.capacity = changes.capacity[1]
    if (changes.type) {
      // Without a capacity change a new Palle already has the drawn capacity; a Hylde keeps its own.
      location.capacity = changes.type[1] === 'Gulv' ? 0 : location.capacity || 1
      location.type = changes.type[1]
      setShelf(location)
    }
    Object.assign(location, stamp)
  }
  return { linked: plan.linked }
}

module.exports = { planPublish, applyPublish }
