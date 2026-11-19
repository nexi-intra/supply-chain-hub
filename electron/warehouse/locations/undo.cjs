// Undo of one Placeringer action, as pure functions. A transaction records its change: the pallets and places that
// differ, as they were before and after (null = did not exist). An undo puts the "before" back – but only when every
// one of them still is as the action left it, so later work by anyone is never rolled back.
const { isShelf, DRAWN_PURPOSES } = require('./model.cjs')

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
 * pallet or shelf line on it.
 */
function undoCheck(change, state) {
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
function undoPlan(change, state) {
  const check = undoCheck(change, state)
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

module.exports = { changeOf, undoCheck, undoPlan, drawingBlock }
