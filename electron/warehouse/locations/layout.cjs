// Tegningen af lageret: the drawing's document (things with slots) is checked here, and its slots become the places of one hub.
const { locationKey } = require('./model.cjs')

const ITEM_TYPES = Object.freeze(['rack', 'floorrow', 'shelfrack', 'floor', 'special', 'dock', 'station', 'receiving', 'gate', 'pc', 'office', 'text'])
const SLOT_KINDS = Object.freeze(['pallet', 'shelf', 'floor', 'special', 'pick-unnamed', 'aisle', 'blocked'])
const OWNERS = Object.freeze(['TCD', 'TRR', 'Andet'])
const PLACE_KINDS = Object.freeze(['pallet', 'shelf', 'floor', 'special'])
const FLOORS = ['ground', 'mezz']
const SLOT_PURPOSES = ['reserve', 'pick']
const POSITIONS = ['pos', 'level', 'unit', 'shelf', 'section']
const PLACE_TYPES = { pallet: 'Palle', shelf: 'Hylde', floor: 'Gulv', special: null }
const HALL_MIN = 10
const HALL_MAX = 300
const ITEMS_MAX = 500
const ITEM_SLOTS_MAX = 400
const SLOTS_MAX = 5000
const NAME_MAX = 30
const CAPACITY_MAX = 6
const BYTES_MAX = 2 * 1024 * 1024

const invalid = message => Object.assign(new Error(message), { code: 'LAYOUT_INVALID' })
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isString = value => typeof value === 'string'
const isBoolean = value => typeof value === 'boolean'
const isOwner = value => OWNERS.includes(value)
const isNames = value => Array.isArray(value) && value.every(isString)
const isWhole = (value, min, max = Infinity) => Number.isInteger(value) && value >= min && value <= max
const cleanName = value => (isString(value) ? value.trim().replace(/\s+/g, ' ') : '')

/** The value, the fallback when it is missing, or LAYOUT_INVALID when it is something else. */
function optional(value, fallback, valid, message) {
  if (value === undefined || value === null) return fallback
  if (!valid(value)) throw invalid(message)
  return value
}

/** A deep copy holding only JSON values (functions and undefined are dropped); refused above 2 MB as stored. */
function plainCopy(raw) {
  let json
  try { json = JSON.stringify(raw) } catch { throw invalid('Tegningen kan ikke læses') }
  if (json === undefined) throw invalid('Tegningen kan ikke læses')
  if (Buffer.byteLength(json) > BYTES_MAX) throw invalid('Tegningen fylder mere end 2 MB')
  return JSON.parse(json)
}

function slotFrom(raw, label, slotIds) {
  if (!isObject(raw) || !isString(raw.id) || !raw.id) throw invalid(`En plads i ${label} mangler id`)
  if (slotIds.has(raw.id)) throw invalid(`Plads-id ${raw.id} findes to gange på tegningen`)
  slotIds.add(raw.id)
  if (!SLOT_KINDS.includes(raw.kind)) throw invalid(`Ukendt slags plads i ${label}: ${raw.kind}`)
  const name = cleanName(raw.name)
  if (name.length > NAME_MAX) throw invalid(`${name} er længere end ${NAME_MAX} tegn`)
  if (!name && PLACE_KINDS.includes(raw.kind)) throw invalid(`En plads i ${label} mangler navn`)
  const what = name || label
  const slot = { id: raw.id, name, kind: raw.kind, purpose: optional(raw.purpose, 'reserve', value => SLOT_PURPOSES.includes(value), `${what}: formålet skal være reserve eller pluk`) }
  if (raw.kind === 'pallet') slot.capacity = optional(raw.capacity, 1, value => isWhole(value, 1, CAPACITY_MAX), `${what}: kapaciteten skal være 1–${CAPACITY_MAX}`)
  const manual = optional(raw.manual, undefined, isBoolean, `${what}: "rettet i hånden" kan ikke læses`)
  if (manual !== undefined) slot.manual = manual
  for (const field of POSITIONS) {
    const value = optional(raw[field], undefined, value => isWhole(value, 0), `${what}: positionen kan ikke læses`)
    if (value !== undefined) slot[field] = value
  }
  return slot
}

function itemFrom(raw, hall, slotIds) {
  if (!isObject(raw) || !isString(raw.id) || !raw.id) throw invalid('En ting på tegningen mangler id')
  if (!ITEM_TYPES.includes(raw.type)) throw invalid(`Ukendt slags ting: ${raw.type}`)
  const name = cleanName(raw.name)
  const label = name || raw.type
  const { x, y, w, h } = raw
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw invalid(`${label} har ingen gyldig størrelse`)
  if (x < 0 || y < 0 || x + w > hall.w || y + h > hall.h) throw invalid(`${label} ligger uden for hallen`)
  optional(raw.pull?.owner, null, isOwner, `Udtrækket i ${label} har en ukendt ejer`)
  const slots = optional(raw.slots, [], Array.isArray, `Pladserne i ${label} kan ikke læses`)
  if (slots.length > ITEM_SLOTS_MAX) throw invalid(`${label} har mere end ${ITEM_SLOTS_MAX} pladser`)
  const item = {
    ...raw,
    name,
    note: optional(raw.note, '', isString, `Noten på ${label} kan ikke læses`),
    owner: optional(raw.owner, 'TCD', isOwner, `${label} har en ukendt ejer`),
    floor: optional(raw.floor, 'ground', value => FLOORS.includes(value), `${label} har en ukendt etage`),
    slots: slots.map(slot => slotFrom(slot, label, slotIds)),
  }
  const visual = optional(raw.visual, undefined, isBoolean, `${label}: "kun visuelt" kan ikke læses`)
  if (visual === undefined) delete item.visual
  return item
}

function layoutFrom(doc) {
  if (!isObject(doc)) throw invalid('Tegningen kan ikke læses')
  const { hall } = doc
  if (!isObject(hall) || ![hall.w, hall.h].every(side => Number.isFinite(side) && side >= HALL_MIN && side <= HALL_MAX)) throw invalid(`Hallen skal være ${HALL_MIN}–${HALL_MAX} på hver led`)
  const items = optional(doc.items, [], Array.isArray, 'Tingene på tegningen kan ikke læses')
  if (items.length > ITEMS_MAX) throw invalid(`Højst ${ITEMS_MAX} ting på tegningen`)
  if (items.reduce((sum, item) => sum + (Array.isArray(item?.slots) ? item.slots.length : 0), 0) > SLOTS_MAX) throw invalid(`Højst ${SLOTS_MAX} pladser på tegningen`)
  const slotIds = new Set()
  return {
    version: optional(doc.version, 0, value => isWhole(value, 0), 'Tegningens version kan ikke læses'),
    hall: { w: hall.w, h: hall.h },
    notes: optional(doc.notes, '', isString, 'Tegningens noter kan ikke læses'),
    items: items.map(item => itemFrom(item, hall, slotIds)),
  }
}

/** The drawing as it is stored: checked, defaults filled, names cleaned, editor fields kept as JSON. Throws LAYOUT_INVALID. */
function normalizeLayout(raw) {
  const doc = plainCopy(raw)
  const layout = layoutFrom(doc)
  // The published drawing's list places decided to stay outside it; they start the next draft's decisions.
  const outside = optional(doc.outside, undefined, isNames, 'Pladserne uden for tegningen kan ikke læses')
  return outside ? { ...layout, outside } : layout
}

/** A draft: the drawing plus the version it builds on, its revision and the admin's decisions about places outside it. */
function normalizeDraft(raw) {
  const doc = plainCopy(raw)
  const layout = layoutFrom(doc)
  if (!isWhole(doc.basedOn, 0)) throw invalid('Kladden mangler den version, den bygger på')
  const rev = optional(doc.rev, undefined, value => isWhole(value, 0), 'Kladdens revision kan ikke læses')
  const decisions = optional(doc.decisions, {}, isObject, 'Kladdens beslutninger kan ikke læses')
  const names = list => optional(list, [], isNames, 'Kladdens beslutninger kan ikke læses')
  return { ...layout, basedOn: doc.basedOn, ...(rev === undefined ? null : { rev }), decisions: { outside: names(decisions.outside), remove: names(decisions.remove) } }
}

/** Who a slot belongs to: a pull-out has the pull-out's owner, every other slot its thing's. */
const slotOwner = (item, slot) => (item.pull && slot.unit != null ? item.pull.owner : item.owner) ?? 'TCD'

/** The slots that are places in the team's hub, in drawing order. A special place keeps the list's type and purpose (null here). */
function placesOf(layout, team) {
  const places = []
  for (const item of layout?.items ?? []) {
    if (item.visual) continue
    for (const slot of item.slots ?? []) {
      if (!PLACE_KINDS.includes(slot.kind) || !slot.name || slotOwner(item, slot) !== team) continue
      const type = PLACE_TYPES[slot.kind]
      places.push({
        slotId: slot.id, itemId: item.id, name: slot.name, id: locationKey(slot.name), type,
        purpose: type ? slot.purpose ?? 'reserve' : null,
        capacity: { Palle: slot.capacity ?? 1, Hylde: 1, Gulv: 0 }[type] ?? null,
      })
    }
  }
  return places
}

module.exports = { ITEM_TYPES, SLOT_KINDS, OWNERS, PLACE_KINDS, normalizeLayout, normalizeDraft, slotOwner, placesOf }
