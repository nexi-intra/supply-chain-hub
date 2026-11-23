// Undo of one Placeringer action, as pure functions. A transaction records its change: the pallets and places that
// differ, as they were before and after (null = did not exist). An undo puts the "before" back – but only when every
// one of them still is as the action left it, so later work by anyone is never rolled back.
const { isShelf, palletLimit, DRAWN_PURPOSES } = require('./model.cjs')

const KINDS = Object.freeze([['pallets', 'pallet'], ['locations', 'location'], ['stock', 'stock']])
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** What differs between two states `{ locations, pallets }`, or null when nothing does. */
function changeOf(before, after) {
  const change = { before: { pallets: {}, locations: {} }, after: { pallets: {}, locations: {} } }
  let any = false
  for (const [key] of KINDS) {
    const ids = new Set([...Object.keys(before[key] || {}), ...Object.keys(after[key] || {})])
    for (const id of ids) {
      const was = before[key]?.[id] ?? null
      const is = after[key]?.[id] ?? null
      if (same(was, is)) continue
      // Pallets and locations are always there (the shape the log has stored since the start); stock only when it changed.
      ;(change.before[key] ||= {})[id] = structuredClone(was)
      ;(change.after[key] ||= {})[id] = structuredClone(is)
      any = true
    }
  }
  return any ? change : null
}

/**
 * Whether `change` can be undone in `state`, without building the new state (the log asks this for every line):
 * everything the action left must still be as it left it; a pallet put back needs its place, and never a pick place
 * (pick places hold no pallets); a shelf line put back needs a lagerhylde; a place the undo removes must have no other
 * pallet or shelf line on it. A pallet put back on a place it had left, which a later action used (`options.used`, see
 * placesUsedSince), needs room there and a place that takes pallets: the conflict then says why (`reason`: full,
 * reserved, station or inactive). Without `options.used` no place is checked for that.
 */
function undoCheck(change, state, options = {}) {
  for (const [key, kind] of KINDS) {
    for (const [id, after] of Object.entries(change.after[key] || {})) {
      if (!same(state[key]?.[id], after)) return { ok: false, conflict: { kind, id } }
    }
  }
  const beforePlaces = change.before.locations || {}
  const beforePallets = change.before.pallets || {}
  const beforeStock = change.before.stock || {}
  const placeAfter = id => (Object.hasOwn(beforePlaces, id) ? beforePlaces[id] : state.locations?.[id]) ?? null
  for (const pallet of Object.values(beforePallets)) {
    if (!pallet) continue
    const place = placeAfter(pallet.location)
    if (!place || place.purpose === 'pick' || isShelf(place)) return { ok: false, conflict: { kind: 'location', id: pallet.location } }
  }
  // A pallet the undo puts (back) on a place it had left must fit there as a put-away or move would (roomIn), but only
  // where a later action used the place (`used`: changed it or brought a pallet onto it). Pallets stay on a place an
  // admin deactivates, reserves or cuts the capacity of, so a place that was so already takes its pallet back.
  const used = options.used
  const arriving = used ? Object.entries(beforePallets).filter(([id, pallet]) => pallet && change.after.pallets?.[id]?.location !== pallet.location && used.has(pallet.location)).map(([, pallet]) => pallet.location) : []
  if (arriving.length) {
    const count = {}
    for (const [id, pallet] of Object.entries(state.pallets || {})) if (!Object.hasOwn(beforePallets, id)) count[pallet.location] = (count[pallet.location] || 0) + 1
    for (const pallet of Object.values(beforePallets)) if (pallet) count[pallet.location] = (count[pallet.location] || 0) + 1
    for (const id of new Set(arriving)) {
      const place = placeAfter(id)
      const reason = Object.hasOwn(beforePlaces, id) ? null : place.active === false ? 'inactive' : place.purpose === 'reserved' || place.purpose === 'station' ? place.purpose : null
      if (reason) return { ok: false, conflict: { kind: 'location', id, reason } }
      if (count[id] > palletLimit(place)) return { ok: false, conflict: { kind: 'location', id, reason: 'full' } }
    }
  }
  for (const line of Object.values(beforeStock)) {
    if (line && !isShelf(placeAfter(line.location))) return { ok: false, conflict: { kind: 'location', id: line.location } }
  }
  // A place the undo brings back as it was: what stands there now (and stays) must fit it – no pallet on a lagerhylde,
  // no shelf line on anything else.
  const restored = Object.entries(beforePlaces).filter(([, record]) => record)
  if (restored.length) {
    const palletsOn = new Set(Object.entries(state.pallets || {}).filter(([id]) => !Object.hasOwn(beforePallets, id)).map(([, pallet]) => pallet.location))
    const linesOn = new Set(Object.entries(state.stock || {}).filter(([id]) => !Object.hasOwn(beforeStock, id)).map(([, line]) => line.location))
    for (const [id, record] of restored) {
      if (isShelf(record) ? palletsOn.has(id) : linesOn.has(id)) return { ok: false, conflict: { kind: 'location', id } }
    }
  }
  const removed = new Set(Object.keys(beforePlaces).filter(id => beforePlaces[id] === null))
  if (removed.size) {
    for (const [id, pallet] of Object.entries(state.pallets || {})) {
      if (!Object.hasOwn(beforePallets, id) && removed.has(pallet.location)) return { ok: false, conflict: { kind: 'location', id: pallet.location } }
    }
    for (const [id, line] of Object.entries(state.stock || {})) {
      if (!Object.hasOwn(beforeStock, id) && removed.has(line.location)) return { ok: false, conflict: { kind: 'location', id: line.location } }
    }
  }
  return { ok: true }
}

/** The state after undoing `change`, or the first thing that is no longer as the action left it (see undoCheck). */
function undoPlan(change, state, options = {}) {
  const check = undoCheck(change, state, options)
  if (!check.ok) return check
  const next = { locations: { ...(state.locations || {}) }, pallets: { ...(state.pallets || {}) }, ...(state.stock || change.before.stock ? { stock: { ...(state.stock || {}) } } : {}) }
  for (const [key] of KINDS) {
    for (const [id, before] of Object.entries(change.before[key] || {})) {
      if (before === null) delete next[key][id]
      else next[key][id] = structuredClone(before)
    }
  }
  return { ok: true, state: next }
}

/**
 * Why undoing `change` is refused because it would remove a place on the published drawing, or change what the drawing
 * owns (name, type, capacity, reserve↔pick); null when it may be undone. `state` is the current state with its meta.
 */
function drawingBlock(change, state) {
  const linked = state.meta?.layout?.linked || []
  const beforePlaces = change.before?.locations || {}
  for (const id of linked) {
    if (!Object.hasOwn(beforePlaces, id)) continue
    const now = state.locations?.[id] ?? null
    const back = beforePlaces[id]
    const purposeFlip = back && now && back.purpose !== now.purpose && DRAWN_PURPOSES.includes(back.purpose) && DRAWN_PURPOSES.includes(now.purpose)
    if (!back || !now || back.name !== now.name || back.type !== now.type || back.capacity !== now.capacity || purposeFlip) {
      return `Handlingen rører ${now?.name ?? id}, som er på tegningen – ret den på tegningen`
    }
  }
  return null
}

/**
 * The places a recorded change used: those it created, deleted or changed in what decides whether a pallet may stand
 * there (`changed`: active, purpose, type, capacity; not a note), and those it brought a pallet onto (`arrived`). A place
 * in either may no longer take back a pallet an earlier action took away from it.
 */
function placesUsedBy(change) {
  const changed = Object.entries(change?.after?.locations || {}).filter(([id, after]) => {
    const before = change.before?.locations?.[id] ?? null
    if (!before || !after) return before !== after
    return (before.active !== false) !== (after.active !== false) || ['purpose', 'type', 'capacity'].some(field => (before[field] ?? null) !== (after[field] ?? null))
  }).map(([id]) => id)
  const arrived = Object.entries(change?.after?.pallets || {}).filter(([id, after]) => after && change.before?.pallets?.[id]?.location !== after.location).map(([, after]) => after.location)
  return { changed, arrived }
}

/** The places used (see placesUsedBy) by actions after `origin` ({ tx, at }), undos included. */
function placesUsedSince(events, origin) {
  const used = new Set()
  for (const event of events) {
    if (!event.change || event.tx === origin.tx || !(event.at >= origin.at)) continue
    const { changed, arrived } = placesUsedBy(event.change)
    for (const id of [...changed, ...arrived]) used.add(id)
  }
  return used
}

module.exports = { changeOf, undoCheck, undoPlan, drawingBlock, placesUsedBy, placesUsedSince }
