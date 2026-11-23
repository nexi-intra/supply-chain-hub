// Placeringer for one Hub person: put a pallet away, take one (FIFO), refill a pick place, move it, change its storage
// location, edit it, and look things up. Every change is one repository transaction, so the first of two people wins.
const { isAllowedTeam } = require('../teams.cjs')
const { normalizeMatdoc } = require('../core/sapParsers.cjs')
const { locationKey, areaFromName, PURPOSES, DRAWN_PURPOSES, TYPES, isShelf, palletLimit, shelfOf } = require('./model.cjs')
const shelves = require('./shelves.cjs')
const rules = require('./rules.cjs')
const { undoCheck, drawingBlock, placesUsedBy, placesUsedSince } = require('./undo.cjs')
const { readSheet, planImport } = require('./sheetImport.cjs')
const path = require('node:path')

const DAY_MS = 86400000
const SLOC = /^[A-Z]\d{3}$/
const lower = value => String(value || '').trim().toLowerCase()

function codeError(code, message) {
  return Object.assign(new Error(message || code), { code })
}

// `isLocationAdmin(user)`: a real Hub manager or a Placerings admin (roles.isLocationAdmin) – Optælling's roles give no rights here.
function createLocationService({ repo, catalog, fetcher, sheetSource, isLocationAdmin = async user => user.role === 'creator' || (user.role === 'manager' && !user.statusManager), now = Date.now, newId }) {
  const by = user => ({ email: lower(user.email), name: user.fullName || user.email })

  function teamOf(user) {
    if (!isAllowedTeam(user?.team)) throw codeError('WAREHOUSE_TEAM_NOT_ALLOWED')
    return user.team
  }

  const isWholeNumber = (value, min) => Number.isInteger(value) && value >= min
  function quantityOf(value, { min = 1, optional = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (optional) return null
      throw codeError('QUANTITY_INVALID', 'Skriv et helt antal')
    }
    if (!isWholeNumber(value, min)) throw codeError('QUANTITY_INVALID', 'Skriv et helt antal')
    return value
  }
  const materialOf = value => {
    const material = String(value || '').trim().toUpperCase()
    if (!material || material.length > 40) throw codeError('MATERIAL_INVALID', 'Skriv et materialenummer')
    return material
  }
  const serialsOf = list => [...new Set((Array.isArray(list) ? list : []).map(serial => String(serial || '').trim().toUpperCase()).filter(Boolean))]
  const tagsOf = list => [...new Set((Array.isArray(list) ? list : []).map(tag => String(tag || '').trim()).filter(Boolean))]

  // The first daily action after an import makes the data live; from then on the import is locked.
  const goLive = tx => { if (!tx.meta.liveAt) tx.meta.liveAt = now() }

  function placeIn(tx, name) {
    const key = locationKey(name)
    const location = tx.locations[key]
    if (!location) throw codeError('LOCATION_NOT_FOUND', `Placeringen ${name} findes ikke`)
    return location
  }
  /** A place a pallet may be put on: active, not reserved or a station, and with room. A pick place holds no pallets, so it never is full. */
  function roomIn(tx, name) {
    const location = placeIn(tx, name)
    if (location.active === false) throw codeError('LOCATION_INACTIVE', `${location.name} er deaktiveret`)
    if (location.purpose === 'reserved' || location.purpose === 'station') throw codeError('LOCATION_RESERVED', `${location.name} er reserveret`)
    if (isShelf(location)) throw codeError('LOCATION_IS_SHELF', `${location.name} er en hylde – brug Læg på hylde`)
    if (location.purpose === 'pick') return location
    const used = Object.values(tx.pallets).filter(pallet => pallet.location === location.id).length
    if (used >= palletLimit(location)) throw codeError('LOCATION_FULL', `${location.name} er fuld`)
    return location
  }
  /** A lagerhylde (stock goes here only); `active` when something is put on it. */
  function shelfIn(tx, name, { active = false } = {}) {
    const location = placeIn(tx, name)
    if (!isShelf(location)) throw codeError('NOT_A_SHELF', `${location.name} er ikke en lagerhylde`)
    if (active && location.active === false) throw codeError('LOCATION_INACTIVE', `${location.name} er deaktiveret`)
    return location
  }
  function palletIn(tx, id) {
    const pallet = tx.pallets[id]
    if (!pallet) throw codeError('PALLET_GONE', 'Pallen er ikke der længere – en anden har taget eller flyttet den')
    return pallet
  }
  const pickIn = (tx, name) => {
    const location = placeIn(tx, name)
    if (location.purpose !== 'pick') throw codeError('NOT_PICK_PLACE', `${location.name} er ikke en pluk-plads`)
    return location
  }
  /** Which of a pick place's materials is meant: the one given, or the only one. */
  function pickMaterial(location, material) {
    const fixed = location.fixedMaterials || []
    const wanted = material ? String(material).trim().toUpperCase() : fixed.length === 1 ? fixed[0] : null
    if (!wanted) throw codeError('MATERIAL_INVALID', `Vælg hvilket materiale på ${location.name}`)
    if (!fixed.includes(wanted)) throw codeError('MATERIAL_MISMATCH', `${wanted} hører ikke til pluk-pladsen ${location.name}`)
    return wanted
  }
  /**
   * Takes all or part of a pallet; returns what is left (null when it is gone) and how much was taken. A pallet with an
   * unknown quantity is only gone when all of it is taken: after some pieces it stays, still unknown, and the log has them.
   */
  function takeFrom(tx, pallet, quantity) {
    const amount = quantityOf(quantity, { optional: true })
    if (amount === null || (pallet.quantity !== null && amount >= pallet.quantity)) {
      delete tx.pallets[pallet.id]
      return { left: null, taken: pallet.quantity }
    }
    if (pallet.quantity === null) return { left: pallet, taken: amount }
    pallet.quantity -= amount
    return { left: pallet, taken: amount }
  }

  async function describe(materials) {
    const list = [...new Set(materials.filter(Boolean))]
    return list.length ? (await catalog.describe(list)) || {} : {}
  }
  const age = pallet => ({ ...pallet, ageDays: Math.floor((now() - (pallet.receivedAt || now())) / DAY_MS) })

  // ---------- Daily actions ----------
  async function putAway(user, { pallets, actionId } = {}) {
    const team = teamOf(user)
    if (!Array.isArray(pallets) || !pallets.length || pallets.length > 200) throw codeError('PALLETS_INVALID', 'Ingen paller at sætte på plads')
    const result = await repo.transact(team, { actionId, writes: ['pallets'] }, tx => {
      const created = []
      const filled = []
      for (const [index, input] of pallets.entries()) {
        // The id comes from the action, so a replay after M: dropped halfway (the pallets written, the rest not) finds
        // the pallet it already made instead of making a second one.
        const id = actionId ? `${actionId}:${index}` : newId()
        const made = actionId ? tx.pallets[id] : null
        if (made) {
          // Made by this action's first try (its log line and id did not land): taken over, so the undo removes it.
          tx.adopt(id)
          tx.event({ type: 'putaway', by: by(user), pallet: id, location: made.location, material: made.material, quantity: made.quantity })
          created.push(made)
          continue
        }
        const location = roomIn(tx, input.location)
        if (location.purpose === 'pick') {
          // Straight onto a pick place: the pallet is used up there (pick places hold no pallets and have no quantity).
          const material = pickMaterial(location, materialOf(input.material))
          tx.event({ type: 'putaway', by: by(user), location: location.id, material, quantity: quantityOf(input.quantity, { min: 0, optional: true }) })
          filled.push(location.id)
          continue
        }
        const sloc = String(input.sloc || 'D000').trim().toUpperCase()
        if (!SLOC.test(sloc)) throw codeError('SLOC_INVALID', 'Storage location skal være som D000')
        const pallet = {
          id, location: location.id, material: materialOf(input.material), quantity: quantityOf(input.quantity, { min: 0, optional: true }),
          receivedAt: Number.isFinite(input.receivedAt) ? input.receivedAt : now(), document: normalizeMatdoc(input.document) || null,
          serials: serialsOf(input.serials), sloc, tags: tagsOf(input.tags), note: String(input.note || '').trim().slice(0, 500), createdAt: now(), createdBy: by(user),
        }
        tx.pallets[pallet.id] = pallet
        tx.event({ type: 'putaway', by: by(user), pallet: pallet.id, location: location.id, material: pallet.material, quantity: pallet.quantity })
        created.push(pallet)
      }
      goLive(tx)
      return { created, filled }
    })
    lookUpTexts(pallets.map(input => input?.material))
    return result
  }

  async function take(user, { pallet: id, quantity, actionId } = {}) {
    const team = teamOf(user)
    return repo.transact(team, { actionId, writes: ['pallets'] }, tx => {
      const pallet = palletIn(tx, id)
      const older = rules.fifo(tx, pallet.material, { now: now() }).find(item => item.id !== pallet.id && (item.receivedAt || 0) < (pallet.receivedAt || 0)) || null
      const { left, taken } = takeFrom(tx, pallet, quantity)
      tx.event({ type: 'take', by: by(user), pallet: pallet.id, location: pallet.location, material: pallet.material, quantity: taken })
      goLive(tx)
      return { pallet: left, olderPallet: older }
    })
  }

  async function refill(user, { location, pallet: id, shelf, material, quantity, actionId } = {}) {
    const team = teamOf(user)
    // From a shelf (when there is no reserve pallet): the quantity taken is required, the shelf line goes down by it.
    if (shelf) {
      const amount = quantityOf(quantity)
      return repo.transact(team, { actionId, writes: ['stock'] }, tx => {
        const place = pickIn(tx, location)
        const from = shelfIn(tx, shelf)
        const wanted = pickMaterial(place, material)
        const { left, taken } = shelves.takeStock(tx.stock, { location: from.id, material: wanted, quantity: amount })
        tx.event({ type: 'refill', by: by(user), from: from.id, to: place.id, location: place.id, material: wanted, quantity: taken })
        goLive(tx)
        return { line: left }
      })
    }
    return repo.transact(team, { actionId, writes: ['pallets'] }, tx => {
      const place = pickIn(tx, location)
      const pallet = palletIn(tx, id)
      pickMaterial(place, pallet.material)
      const { left, taken } = takeFrom(tx, pallet, quantity)
      tx.event({ type: 'refill', by: by(user), pallet: pallet.id, from: pallet.location, to: place.id, location: place.id, material: pallet.material, quantity: taken })
      goLive(tx)
      return { pallet: left }
    })
  }

  async function move(user, { pallet: id, to, actionId } = {}) {
    const team = teamOf(user)
    return repo.transact(team, { actionId, writes: ['pallets'] }, tx => {
      const pallet = palletIn(tx, id)
      const target = roomIn(tx, to)
      const from = pallet.location
      if (target.purpose === 'pick') {
        // Moved onto a pick place: it is used up there.
        pickMaterial(target, pallet.material)
        delete tx.pallets[pallet.id]
        tx.event({ type: 'move', by: by(user), pallet: pallet.id, from, to: target.id, material: pallet.material, quantity: pallet.quantity })
        goLive(tx)
        return { pallet: null }
      }
      pallet.location = target.id
      tx.event({ type: 'move', by: by(user), pallet: pallet.id, from, to: target.id, material: pallet.material })
      goLive(tx)
      return { pallet }
    })
  }

  /** Registered in the Hub; the SAP transfer (MIGO) comes later as its own step. */
  async function changeSloc(user, { pallet: id, sloc, actionId } = {}) {
    const team = teamOf(user)
    const next = String(sloc || '').trim().toUpperCase()
    if (!SLOC.test(next)) throw codeError('SLOC_INVALID', 'Storage location skal være som D000')
    return repo.transact(team, { actionId, writes: ['pallets'] }, tx => {
      const pallet = palletIn(tx, id)
      const from = pallet.sloc
      pallet.sloc = next
      tx.event({ type: 'sloc', by: by(user), pallet: pallet.id, location: pallet.location, material: pallet.material, from, to: next })
      goLive(tx)
      return { pallet }
    })
  }

  // ---------- Hylder: material + quantity per lagerhylde (everyone in the team) ----------
  async function shelfPut(user, { location, material, quantity, actionId } = {}) {
    const team = teamOf(user)
    const code = materialOf(material)
    const amount = quantityOf(quantity)
    const result = await repo.transact(team, { actionId, writes: ['stock'] }, tx => {
      const place = shelfIn(tx, location, { active: true })
      const line = shelves.putStock(tx.stock, { location: place.id, material: code, quantity: amount, by: by(user), at: now() })
      tx.event({ type: 'shelf-put', by: by(user), location: place.id, material: code, quantity: amount })
      goLive(tx)
      return { line }
    })
    lookUpTexts([code])
    return result
  }

  async function shelfTake(user, { location, material, quantity, actionId } = {}) {
    const team = teamOf(user)
    const code = materialOf(material)
    const amount = quantityOf(quantity, { optional: true })
    return repo.transact(team, { actionId, writes: ['stock'] }, tx => {
      const place = shelfIn(tx, location)
      const { left, taken } = shelves.takeStock(tx.stock, { location: place.id, material: code, quantity: amount })
      tx.event({ type: 'shelf-take', by: by(user), location: place.id, material: code, quantity: taken })
      goLive(tx)
      return { left, taken }
    })
  }

  async function shelfMove(user, { from, to, material, quantity, actionId } = {}) {
    const team = teamOf(user)
    const code = materialOf(material)
    const amount = quantityOf(quantity, { optional: true })
    return repo.transact(team, { actionId, writes: ['stock'] }, tx => {
      const source = shelfIn(tx, from)
      const target = shelfIn(tx, to, { active: true })
      const { taken } = shelves.takeStock(tx.stock, { location: source.id, material: code, quantity: amount })
      const line = shelves.putStock(tx.stock, { location: target.id, material: code, quantity: taken, by: by(user), at: now() })
      tx.event({ type: 'shelf-move', by: by(user), location: source.id, from: source.id, to: target.id, material: code, quantity: taken })
      goLive(tx)
      return { line }
    })
  }

  /**
   * "Ret antal": the exact quantity after a count or a correction; 0 removes the line. `expected` (optional; an older Hub
   * sends without it, and so does "Gem alligevel") is the quantity the dialog showed: when the shelf no longer has it,
   * someone changed it meanwhile and the count is refused, so their take or put is never written over in silence.
   */
  async function shelfSet(user, { location, material, quantity, expected, actionId } = {}) {
    const team = teamOf(user)
    const code = materialOf(material)
    const amount = quantityOf(quantity, { min: 0 })
    const shown = quantityOf(expected, { min: 0, optional: true })
    try {
      return await repo.transact(team, { actionId, writes: ['stock'] }, tx => {
        const place = shelfIn(tx, location)
        const id = shelves.stockId(place.id, code)
        const before = tx.stock[id]?.quantity ?? 0
        if (before === amount) return { line: tx.stock[id] || null }
        if (shown !== null && before !== shown) throw Object.assign(codeError('STOCK_CHANGED'), { id, quantity: before })
        if (amount === 0) delete tx.stock[id]
        else if (tx.stock[id]) Object.assign(tx.stock[id], { quantity: amount, updatedAt: now(), updatedBy: by(user) })
        else shelves.putStock(tx.stock, { location: place.id, material: code, quantity: amount, by: by(user), at: now() })
        tx.event({ type: 'shelf-set', by: by(user), location: place.id, material: code, quantity: amount, changes: { quantity: [before, amount] } })
        goLive(tx)
        return { line: tx.stock[id] || null }
      })
    } catch (error) {
      if (error.code !== 'STOCK_CHANGED') throw error
      const latest = await latestChange(team, { kind: 'stock', id: error.id }, change => (change.before.stock?.[error.id]?.quantity ?? 0) !== (change.after.stock?.[error.id]?.quantity ?? 0))
      const who = `${latest?.by?.name ? ` af ${latest.by.name}` : ''}${latest ? ` kl. ${clock(latest.at)}` : ''}`
      throw codeError('STOCK_CHANGED', `Antallet er ændret til ${error.quantity}${who || ' imens'}. Tæl igen, eller gem alligevel.`)
    }
  }

  /**
   * The latest action in the log that changed `target` as `changed(change)` says (else the latest that changed it at
   * all), to name who changed something meanwhile. The whole log is read, not only the target's events: a transaction's
   * change is kept on its first event, which can be about something else. An action that changed nothing is skipped.
   */
  async function latestChange(team, target, changed) {
    const events = await repo.history(team, { months: 2 }).catch(() => [])
    const changes = changesOf(events)
    const mine = events.filter(event => !(event.tx && !changes.has(event.tx)) && touches(event, target))
    return mine.find(event => event.tx && changes.has(event.tx) && changed(changes.get(event.tx))) || mine[0]
  }

  const EDITABLE = {
    material: materialOf,
    quantity: value => quantityOf(value, { min: 0, optional: true }),
    receivedAt: value => { if (!Number.isFinite(value) || value <= 0) throw codeError('DATE_INVALID', 'Ugyldig dato'); return value },
    document: value => (value ? normalizeMatdoc(value) || (() => { throw codeError('MATDOC_INVALID', 'Skriv 49/50-nummeret som fx "5000032337" eller "5000032337 2026 0001"') })() : null),
    serials: serialsOf,
    tags: tagsOf,
    note: value => String(value || '').trim().slice(0, 500),
  }
  /**
   * Only the fields in `changes` are written. `expected` (optional; an older Hub sends every field without it) holds what
   * the dialog showed for each changed field: when the pallet no longer has that, someone changed it meanwhile and the
   * edit is refused, so a stale value is never written back over their change.
   */
  async function editPallet(user, { pallet: id, changes, expected, actionId } = {}) {
    const team = teamOf(user)
    const clean = Object.fromEntries(Object.entries(changes || {}).filter(([field]) => Object.hasOwn(EDITABLE, field)).map(([field, value]) => [field, EDITABLE[field](value)]))
    const shown = expected && typeof expected === 'object' ? Object.entries(expected).filter(([field]) => Object.hasOwn(EDITABLE, field)) : []
    try {
      return await repo.transact(team, { actionId, writes: ['pallets'] }, tx => {
        const pallet = palletIn(tx, id)
        const stale = shown.filter(([field, value]) => JSON.stringify(pallet[field] ?? null) !== JSON.stringify(value ?? null)).map(([field]) => field)
        if (stale.length) throw Object.assign(codeError('PALLET_CHANGED'), { fields: stale })
        const diff = {}
        for (const [field, value] of Object.entries(clean)) {
          if (JSON.stringify(pallet[field] ?? null) === JSON.stringify(value ?? null)) continue
          diff[field] = [pallet[field] ?? null, value]
          pallet[field] = value
        }
        if (Object.keys(diff).length) tx.event({ type: 'edit-pallet', by: by(user), pallet: pallet.id, location: pallet.location, material: pallet.material, changes: diff })
        goLive(tx)
        return { pallet }
      })
    } catch (error) {
      if (error.code !== 'PALLET_CHANGED') throw error
      // Who changed it: the latest action that changed one of the refused fields of the pallet; else the latest that
      // changed the pallet at all, as an undo names the one that blocks it.
      const latest = await latestChange(team, { kind: 'pallet', id }, change => (error.fields || []).some(field => JSON.stringify(change.before.pallets?.[id]?.[field] ?? null) !== JSON.stringify(change.after.pallets?.[id]?.[field] ?? null)))
      throw codeError('PALLET_CHANGED', latest?.by?.name ? `Pallen er ændret af ${latest.by.name} imens. Se den igen.` : 'Pallen er ændret imens. Se den igen.')
    }
  }

  // A material typed by hand gets SAP's text in the background (MM60), so it is never shown as a bare number for long.
  const lookUpTexts = materials => { Promise.resolve().then(() => catalog.describeMissing?.([...new Set(materials.filter(Boolean).map(material => String(material).trim().toUpperCase()))])).catch(() => {}) }

  // ---------- Look-ups ----------
  const publicEvent = ({ change, ...event }) => event
  /** When the hub's Placeringer last changed, from any PC; the screens poll it to read again. */
  async function stamp(user) {
    return { changedAt: (await repo.meta(teamOf(user))).changedAt || 0 }
  }

  /**
   * The one-time migration of pallets on lagerhylder to stock (spec, section 1). Checked again under the lock, so two
   * PCs opening at once migrate once; logged as one action that cannot be undone.
   */
  // A migrated hub stays migrated, so it is checked once per session (repo.meta reads M: past the cache).
  const shelvesMigrated = new Set()
  async function ensureShelves(team) {
    if (shelvesMigrated.has(team)) return
    if ((await repo.meta(team)).shelvesMigratedAt) { shelvesMigrated.add(team); return }
    await repo.transact(team, { snapshot: false }, tx => {
      if (tx.meta.shelvesMigratedAt) return
      const racksBefore = JSON.stringify(Object.values(tx.locations).map(location => [location.rack, location.shelf]))
      const result = shelves.migrateShelves(tx, { at: now(), by: { email: '', name: 'Hubben' } })
      for (const id of result.removedPallets) delete tx.pallets[id]
      tx.stock = result.stock
      tx.meta.shelvesMigratedAt = now()
      const racksAfter = JSON.stringify(Object.values(tx.locations).map(location => [location.rack, location.shelf]))
      if (result.removedPallets.length || result.kept.length || racksBefore !== racksAfter) tx.event({ type: 'migrate', by: { email: '', name: 'Hubben' }, changes: { shelves: [null, result.shelved.length], pallets: [result.removedPallets.length, 0], ...(result.kept.length ? { kept: [null, result.kept.length] } : {}) } })
    })
    shelvesMigrated.add(team)
  }

  async function overview(user) {
    await ensureShelves(teamOf(user))
    const state = await repo.read(teamOf(user))
    return {
      areas: rules.areaSummary(state),
      counts: { locations: Object.keys(state.locations).length, pallets: Object.keys(state.pallets).length, stock: Object.keys(state.stock || {}).length },
      imported: Boolean(state.meta.importedAt), live: Boolean(state.meta.liveAt), tags: state.tags,
      drawing: state.meta.layout ? { version: state.meta.layout.version, linked: state.meta.layout.linked } : null,
    }
  }

  async function lookupDocument(user, { document } = {}) {
    const team = teamOf(user)
    const fetched = await fetcher.fetchMatdoc({ team, document })
    const materials = new Map()
    for (const row of fetched.rows) {
      const entry = materials.get(row.material) || { material: row.material, description: row.description || '', quantity: 0, serials: [] }
      entry.quantity++
      entry.serials.push(row.serial)
      materials.set(row.material, entry)
    }
    const list = [...materials.values()]
    await catalog.learn(list.filter(entry => entry.description).map(entry => ({ material: entry.material, description: entry.description, source: 'matdoc' })))
    return { document: fetched.document, materials: list }
  }

  async function suggest(user, { material } = {}) {
    const state = await repo.read(teamOf(user))
    const code = materialOf(material)
    return { slots: rules.suggestSlots(state, code) }
  }

  async function search(user, { query } = {}) {
    const state = await repo.read(teamOf(user))
    const known = [...new Set([...Object.values(state.pallets).map(pallet => pallet.material), ...Object.values(state.stock || {}).map(line => line.material), ...Object.values(state.locations).flatMap(location => location.fixedMaterials || [])])]
    const texts = await describe(known)
    const found = rules.search(state, texts, query)
    return {
      materials: found.materials.slice(0, 50).map(material => ({ material, description: texts[material] || '' })),
      locations: found.locations.slice(0, 50).map(id => state.locations[id]),
      pallets: found.pallets.slice(0, 50).map(id => ({ ...age(state.pallets[id]), description: texts[state.pallets[id].material] || '' })),
      racks: found.racks.slice(0, 20),
    }
  }

  async function materialCard(user, { material } = {}) {
    const team = teamOf(user)
    const code = materialOf(material)
    // Independent reads at once: each is a round trip to M:.
    const [state, texts, history] = await Promise.all([repo.read(team), describe([code]), repo.history(team, { material: code })])
    if (!texts[code]) lookUpTexts([code])
    const reserve = rules.fifo(state, code, { now: now() })
    const onShelves = shelves.stockOf(state, code).map(line => ({ location: line.location, name: state.locations[line.location]?.name || line.location, quantity: line.quantity }))
    return {
      material: code,
      description: texts[code] || '',
      stations: rules.stations(state, code),
      pickPlaces: rules.pickPlaces(state, code),
      reserve,
      shelves: onShelves,
      refillShelf: shelves.shelfForRefill(state, code)?.location || null,
      total: reserve.reduce((sum, pallet) => sum + (pallet.quantity || 0), 0) + onShelves.reduce((sum, line) => sum + line.quantity, 0),
      history: history.slice(0, 50).map(publicEvent),
    }
  }

  async function locationCard(user, { location } = {}) {
    const team = teamOf(user)
    const key = locationKey(location)
    const [state, history] = await Promise.all([repo.read(team), repo.history(team, { location: key })])
    const place = state.locations[key]
    if (!place) throw codeError('LOCATION_NOT_FOUND', `Placeringen ${location} findes ikke`)
    const pallets = Object.values(state.pallets).filter(pallet => pallet.location === key)
    const fixed = place.fixedMaterials || []
    const lines = shelves.stockOn(state, key)
    const texts = await describe([...pallets.map(pallet => pallet.material), ...fixed, ...lines.map(line => line.material)])
    return {
      location: place,
      stock: lines.map(line => ({ ...line, description: texts[line.material] || '' })),
      fixed: fixed.map(material => ({ material, description: texts[material] || '' })),
      occupancy: rules.occupancy(state)[key],
      pallets: pallets.map(pallet => ({ ...age(pallet), description: texts[pallet.material] || '' })).sort((a, b) => (a.receivedAt || 0) - (b.receivedAt || 0)),
      history: history.slice(0, 50).map(publicEvent),
    }
  }

  async function palletCard(user, { pallet: id } = {}) {
    const team = teamOf(user)
    const [state, history] = await Promise.all([repo.read(team), repo.history(team, { pallet: id })])
    const pallet = state.pallets[id]
    if (!pallet) throw codeError('PALLET_GONE', 'Pallen er ikke der længere')
    const texts = await describe([pallet.material])
    return { pallet: { ...age(pallet), description: texts[pallet.material] || '' }, location: state.locations[pallet.location] || null, history: history.slice(0, 50).map(publicEvent) }
  }

  /** A rack: its shelves highest first, each with its stock lines. */
  async function rackCard(user, { rack } = {}) {
    const team = teamOf(user)
    const [state, allHistory] = await Promise.all([repo.read(team), repo.history(team)])
    const name = locationKey(rack)
    const list = Object.values(state.locations).filter(location => location.rack === name).sort((a, b) => (b.shelf || 0) - (a.shelf || 0))
    if (!name || !list.length) throw codeError('RACK_INVALID', `Reolen ${rack} findes ikke`)
    const ids = new Set(list.map(location => location.id))
    const lines = Object.values(state.stock || {}).filter(line => ids.has(line.location))
    const texts = await describe(lines.map(line => line.material))
    const history = allHistory.filter(event => [event.location, event.from, event.to].some(id => ids.has(id))).slice(0, 50).map(publicEvent)
    return {
      rack: name,
      area: list[0].area,
      purpose: list[0].purpose,
      shelves: list.map(location => ({ location, stock: shelves.stockOn(state, location.id).map(line => ({ ...line, description: texts[line.material] || '' })) })),
      history,
    }
  }

  /**
   * What stands on every place for the map: pallets and shelf stock merged per material (oldest pallet first), plus the
   * fixed materials of pick places and stations. Empty places are left out; `oldest` is the place of each material's
   * oldest pallet, the same one Tag points to.
   */
  async function mapContents(user) {
    const state = await repo.read(teamOf(user))
    const places = {}
    const entry = (location, material) => {
      const materials = places[location] || (places[location] = new Map())
      if (!materials.has(material)) materials.set(material, { material, description: '', pallets: 0, quantity: null, oldestAt: null, fixed: false })
      return materials.get(material)
    }
    const add = (item, quantity) => { if (typeof quantity === 'number') item.quantity = (item.quantity || 0) + quantity }
    for (const pallet of Object.values(state.pallets)) {
      const item = entry(pallet.location, pallet.material)
      item.pallets++
      add(item, pallet.quantity)
      if (pallet.receivedAt != null && (item.oldestAt === null || pallet.receivedAt < item.oldestAt)) item.oldestAt = pallet.receivedAt
    }
    for (const line of Object.values(state.stock || {})) add(entry(line.location, line.material), line.quantity)
    for (const location of Object.values(state.locations)) {
      if (location.purpose !== 'pick' && location.purpose !== 'station') continue
      for (const material of location.fixedMaterials || []) entry(location.id, material).fixed = true
    }
    const materials = new Set(Object.values(places).flatMap(list => [...list.keys()]))
    const texts = await describe([...materials])
    const order = (a, b) => (a.oldestAt ?? Infinity) - (b.oldestAt ?? Infinity) || (b.quantity ?? -1) - (a.quantity ?? -1)
    const result = {}
    for (const [location, list] of Object.entries(places)) result[location] = { materials: [...list.values()].map(item => ({ ...item, description: texts[item.material] || '' })).sort(order) }
    const oldest = {}
    for (const material of new Set(Object.values(state.pallets).map(pallet => pallet.material))) {
      const first = rules.fifo(state, material, { now: now() })[0]
      if (first) oldest[material] = first.location
    }
    return { places: result, oldest }
  }

  /** Every place of the hub in name order with how full it is (the administration list). */
  async function list(user) {
    const team = teamOf(user)
    // Independent round trips to M: at once.
    const [state, canAdmin] = await Promise.all([repo.read(team), requireAdmin(user).then(() => true, () => false)])
    const occupied = rules.occupancy(state)
    const lines = {}
    for (const line of Object.values(state.stock || {})) lines[line.location] = (lines[line.location] || 0) + 1
    const locations = Object.values(state.locations).sort((a, b) => a.name.localeCompare(b.name, 'da', { numeric: true })).map(location => ({ ...location, used: occupied[location.id].used, stockCount: lines[location.id] || 0 }))
    const drawing = state.meta.layout ? { version: state.meta.layout.version, linked: state.meta.layout.linked } : null
    return { locations, tags: state.tags, canAdmin, imported: Boolean(state.meta.importedAt), live: Boolean(state.meta.liveAt), drawing }
  }

  // ---------- Administration (managers, status managers and Optælling's admins) ----------
  async function requireAdmin(user) {
    const team = teamOf(user)
    if (!(await isLocationAdmin(user))) throw codeError('LOCATIONS_MANAGER_ONLY', 'Kun managere og Placerings admins kan vedligeholde placeringer og fortryde')
    return team
  }
  const invalid = message => codeError('LOCATION_INVALID', message)
  // A published drawing (meta.layout) makes the places; its linked ones keep the physical fields it sets.
  const refuseWhenDrawn = meta => { if (meta.layout) throw codeError('LAYOUT_OWNS_PLACES', 'Pladser oprettes nu på tegningen') }
  const onDrawing = (tx, id) => Boolean(tx.meta.layout?.linked?.includes(id))
  /**
   * A complete, checked location from user input; `previous` keeps what is not changed. The type decides the capacity
   * (a new pallet place 1 – an existing one keeps its own, e.g. S0's 2 – a floor 0 = no limit) and a Hylde named like
   * "E9 H5" gets its rack and shelf. `emptyPick`: shelves of a new pick rack get their materials afterwards.
   */
  function locationFrom(input, previous = {}, { emptyPick = false } = {}) {
    const name = String(input.name ?? previous.name ?? '').trim().replace(/\s+/g, ' ')
    if (!name || name.length > 30) throw invalid('Giv placeringen et navn (højst 30 tegn)')
    const type = input.type ?? previous.type
    if (!TYPES.includes(type)) throw invalid('Ukendt type')
    const purpose = input.purpose ?? previous.purpose ?? 'reserve'
    if (!PURPOSES.includes(purpose)) throw invalid('Ukendt formål')
    const capacity = type === 'Palle' ? (previous.type === 'Palle' ? previous.capacity || 1 : 1) : type === 'Gulv' ? 0 : input.capacity ?? (previous.capacity || 1)
    if (type !== 'Palle' && type !== 'Gulv' && (!isWholeNumber(capacity, 1) || capacity > 50)) throw invalid('Kapaciteten skal være 1–50')
    const fixed = input.fixedMaterials !== undefined ? [...new Set((Array.isArray(input.fixedMaterials) ? input.fixedMaterials : []).filter(Boolean).map(materialOf))] : previous.fixedMaterials ?? []
    if ((purpose === 'pick' || purpose === 'station') && !fixed.length && !emptyPick) throw invalid('En pluk-plads eller arbejdsstation skal have sine materialer')
    const area = String(input.area ?? previous.area ?? areaFromName(name)).trim().toUpperCase() || areaFromName(name)
    const rack = type === 'Hylde' ? shelfOf(name) : null
    return { id: locationKey(name), name, area, type, purpose, capacity, fixedMaterials: fixed, ...(rack || {}), active: previous.active ?? true, note: String(input.note ?? previous.note ?? '').trim().slice(0, 500) }
  }

  async function createLocation(user, input = {}) {
    const team = await requireAdmin(user)
    return repo.transact(team, tx => {
      refuseWhenDrawn(tx.meta)
      const location = { ...locationFrom(input), updatedAt: now(), updatedBy: by(user) }
      if (tx.locations[location.id]) throw codeError('LOCATION_EXISTS', `${location.name} findes allerede`)
      tx.locations[location.id] = location
      tx.event({ type: 'location', by: by(user), location: location.id, changes: { created: [null, location.name] } })
      return { location }
    })
  }

  const SERIES_MAX = 500
  async function createSeries(user, { prefix, aisles, places, type, purpose = 'reserve', capacity = 1 } = {}) {
    const team = await requireAdmin(user)
    const range = pair => (Array.isArray(pair) && isWholeNumber(pair[0], 0) && isWholeNumber(pair[1], pair[0]) ? pair : null)
    return repo.transact(team, tx => {
      refuseWhenDrawn(tx.meta)
      const [a, p] = [range(aisles), range(places)]
      const start = String(prefix || '').trim()
      if (!start || !a || !p) throw invalid('Skriv forbogstaver, gange og pladser')
      const total = (a[1] - a[0] + 1) * (p[1] - p[0] + 1)
      if (total > SERIES_MAX) throw codeError('SERIES_TOO_LARGE', `Højst ${SERIES_MAX} placeringer ad gangen`)
      const wanted = []
      for (let aisle = a[0]; aisle <= a[1]; aisle++) for (let place = p[0]; place <= p[1]; place++) wanted.push(locationFrom({ name: `${start}${aisle}.${place}`, type, purpose, capacity }))
      const created = []
      const skipped = []
      for (const location of wanted) {
        if (tx.locations[location.id]) { skipped.push(location.name); continue }
        tx.locations[location.id] = { ...location, updatedAt: now(), updatedBy: by(user) }
        created.push(location)
      }
      if (created.length) tx.event({ type: 'location', by: by(user), changes: { series: [null, `${created[0].name}–${created.at(-1).name} (${created.length})`] } })
      return { created, skipped }
    })
  }

  const palletsOn = (tx, id) => Object.values(tx.pallets).filter(pallet => pallet.location === id)
  const linesOn = (tx, id) => Object.values(tx.stock || {}).filter(line => line.location === id)
  const palletsText = n => (n === 1 ? '1 palle' : `${n} paller`)
  const materialsText = n => (n === 1 ? '1 materiale' : `${n} materialer`)
  async function editLocation(user, { location, changes = {}, usePallets = false } = {}) {
    const team = await requireAdmin(user)
    return repo.transact(team, tx => {
      const previous = placeIn(tx, location)
      const drawn = onDrawing(tx, previous.id)
      const pallets = palletsOn(tx, previous.id)
      // A reserve place turned into a pick place (confirmed with usePallets): its pallets become the pick pallet – used up
      // there like a pallet moved onto a pick place – and their materials are fixed there.
      const toPick = Boolean(usePallets) && pallets.length > 0 && changes.purpose === 'pick' && previous.purpose !== 'pick'
      const input = toPick ? { ...changes, fixedMaterials: [...new Set([...(changes.fixedMaterials ?? previous.fixedMaterials ?? []), ...pallets.map(pallet => pallet.material)])] } : changes
      // A pick place made by the drawing may still be without its materials.
      const next = { ...locationFrom(input, previous, { emptyPick: drawn }), updatedAt: now(), updatedBy: by(user) }
      // Saved without a change: nothing is written (not even the edit time), so M: is not touched.
      const FIELDS = ['name', 'area', 'type', 'purpose', 'capacity', 'fixedMaterials', 'rack', 'shelf', 'note']
      if (!toPick && next.id === previous.id && FIELDS.every(field => JSON.stringify(previous[field] ?? null) === JSON.stringify(next[field] ?? null))) return { location: previous }
      const physical = next.id !== previous.id || next.name !== previous.name || next.type !== previous.type || next.capacity !== previous.capacity
        || (next.purpose !== previous.purpose && DRAWN_PURPOSES.includes(next.purpose) && DRAWN_PURPOSES.includes(previous.purpose))
      if (drawn && physical) throw codeError('LOCATION_ON_DRAWING', 'Ret navn, type og kapacitet på tegningen')
      // Anything can be changed. Only a pick place needs the confirmation, since its pallets are used up; on a station, a
      // reserved place or below the capacity the pallets simply stay (shown on the place, left out of FIFO).
      if (pallets.length && next.purpose === 'pick' && previous.purpose !== 'pick' && !toPick) throw codeError('LOCATION_NOT_EMPTY', `Der står ${pallets.length === 1 ? 'en palle' : `${pallets.length} paller`} på ${previous.name} – bekræft at ${pallets.length === 1 ? 'den' : 'de'} bliver pluk-pallen`)
      const lines = linesOn(tx, previous.id)
      if (lines.length && !isShelf(next)) throw codeError('LOCATION_NOT_EMPTY', `Der står ${materialsText(lines.length)} på ${previous.name} – tøm hylden først`)
      if (pallets.length && isShelf(next)) throw codeError('LOCATION_NOT_EMPTY', `Der står ${palletsText(pallets.length)} på ${previous.name} – flyt ${pallets.length === 1 ? 'den' : 'dem'} først`)
      if (next.id !== previous.id) {
        if (tx.locations[next.id]) throw codeError('LOCATION_EXISTS', `${next.name} findes allerede`)
        delete tx.locations[previous.id]
        if (!toPick) for (const pallet of pallets) pallet.location = next.id
        // The shelf's lines follow the new name (their id holds the place).
        for (const line of lines) {
          delete tx.stock[line.id]
          const id = shelves.stockId(next.id, line.material)
          tx.stock[id] = { ...line, id, location: next.id }
        }
      }
      if (toPick) {
        for (const pallet of pallets) {
          delete tx.pallets[pallet.id]
          tx.event({ type: 'move', by: by(user), pallet: pallet.id, from: previous.id, to: next.id, material: pallet.material, quantity: pallet.quantity })
        }
      }
      tx.locations[next.id] = next
      const diff = Object.fromEntries(FIELDS.filter(field => JSON.stringify(previous[field] ?? null) !== JSON.stringify(next[field] ?? null)).map(field => [field, [previous[field] ?? null, next[field]]]))
      if (Object.keys(diff).length) tx.event({ type: 'location', by: by(user), location: next.id, from: previous.id, to: next.id, changes: diff })
      return { location: next }
    })
  }

  async function setActive(user, { location, active } = {}) {
    const team = await requireAdmin(user)
    return repo.transact(team, tx => {
      const place = placeIn(tx, location)
      if (place.active !== Boolean(active)) tx.event({ type: 'location', by: by(user), location: place.id, changes: { active: [place.active !== false, Boolean(active)] } })
      place.active = Boolean(active)
      return { location: place }
    })
  }

  const RACK_SHELVES_MAX = 20
  /** A rack: its shelves "E9 H1"…"E9 Hn" in one action (spec, section 3). */
  async function createRack(user, { name, shelves: count, area, purpose = 'reserve' } = {}) {
    const team = await requireAdmin(user)
    return repo.transact(team, tx => {
      refuseWhenDrawn(tx.meta)
      const rack = String(name || '').trim().replace(/\s+/g, ' ').toUpperCase()
      if (!rack || rack.length > 25 || !isWholeNumber(count, 1) || count > RACK_SHELVES_MAX) throw codeError('RACK_INVALID', `Giv reolen et navn og 1–${RACK_SHELVES_MAX} hylder`)
      if (purpose !== 'reserve' && purpose !== 'pick') throw invalid('En reol er lager eller pluk')
      const wanted = Array.from({ length: count }, (_, index) => locationFrom({ name: `${rack} H${index + 1}`, type: 'Hylde', purpose, ...(area ? { area } : {}) }, {}, { emptyPick: true }))
      const taken = wanted.filter(location => tx.locations[location.id])
      if (taken.length) throw codeError('LOCATION_EXISTS', `${taken.map(location => location.name).join(', ')} findes allerede`)
      for (const location of wanted) tx.locations[location.id] = { ...location, updatedAt: now(), updatedBy: by(user) }
      tx.event({ type: 'location', by: by(user), changes: { rack: [null, `${rack} (${count} hylder)`] } })
      return { created: wanted }
    })
  }

  /** The rack's next shelf, with its area and purpose. */
  async function addShelf(user, { rack } = {}) {
    const team = await requireAdmin(user)
    const key = locationKey(rack)
    return repo.transact(team, tx => {
      refuseWhenDrawn(tx.meta)
      const list = Object.values(tx.locations).filter(location => location.rack === key)
      if (!key || !list.length) throw codeError('RACK_INVALID', `Reolen ${rack} findes ikke`)
      const number = Math.max(...list.map(location => location.shelf || 0)) + 1
      if (number > 99) throw codeError('RACK_INVALID', 'Reolen har ikke plads til flere hylder')
      const base = list[0]
      const location = { ...locationFrom({ name: `${key} H${number}`, type: 'Hylde', purpose: base.purpose, area: base.area }, {}, { emptyPick: true }), updatedAt: now(), updatedBy: by(user) }
      if (tx.locations[location.id]) throw codeError('LOCATION_EXISTS', `${location.name} findes allerede`)
      tx.locations[location.id] = location
      tx.event({ type: 'location', by: by(user), location: location.id, changes: { created: [null, location.name] } })
      return { location }
    })
  }

  const DELETE_MAX = 500
  /**
   * Deletes the empty places among `locations`; the others are kept with the reason. `allOrNothing` (a rack): nothing is
   * deleted when one is kept. One action in the log, so it can be undone.
   */
  async function deleteLocations(user, { locations, allOrNothing = false } = {}) {
    const team = await requireAdmin(user)
    const names = [...new Set((Array.isArray(locations) ? locations : []).map(name => String(name || '').trim()).filter(Boolean))]
    if (names.length > DELETE_MAX) throw codeError('SERIES_TOO_LARGE', `Højst ${DELETE_MAX} placeringer ad gangen`)
    return repo.transact(team, tx => {
      const doomed = []
      const kept = []
      for (const name of names) {
        const place = tx.locations[locationKey(name)]
        if (!place) { kept.push({ name, reason: `${name} findes ikke` }); continue }
        if (onDrawing(tx, place.id)) { kept.push({ name: place.name, reason: `${place.name} er på tegningen – fjern den på tegningen` }); continue }
        const pallets = palletsOn(tx, place.id).length
        const lines = linesOn(tx, place.id).length
        if (pallets) kept.push({ name: place.name, reason: `Der står ${palletsText(pallets)} på ${place.name}` })
        else if (lines) kept.push({ name: place.name, reason: `Der står ${materialsText(lines)} på ${place.name}` })
        else if (!doomed.includes(place)) doomed.push(place)
      }
      if (allOrNothing && kept.length) throw codeError('RACK_NOT_EMPTY', `Tøm først: ${kept.map(item => item.name).join(', ')}`)
      for (const place of doomed) delete tx.locations[place.id]
      if (doomed.length) tx.event({ type: 'location', by: by(user), ...(doomed.length === 1 ? { location: doomed[0].id } : {}), changes: { deleted: [doomed.map(place => place.name).join(', '), null] } })
      return { deleted: doomed.map(place => place.name), kept }
    })
  }

  async function setActiveMany(user, { locations, active } = {}) {
    const team = await requireAdmin(user)
    const keys = [...new Set((Array.isArray(locations) ? locations : []).map(locationKey).filter(Boolean))]
    if (keys.length > DELETE_MAX) throw codeError('SERIES_TOO_LARGE', `Højst ${DELETE_MAX} placeringer ad gangen`)
    return repo.transact(team, tx => {
      const changed = keys.map(key => tx.locations[key]).filter(place => place && (place.active !== false) !== Boolean(active))
      for (const place of changed) place.active = Boolean(active)
      if (changed.length) tx.event({ type: 'location', by: by(user), ...(changed.length === 1 ? { location: changed[0].id } : {}), count: changed.length, changes: { active: [!active, Boolean(active)] } })
      return { changed: changed.length }
    })
  }

  async function setTags(user, { tags } = {}) {
    const team = await requireAdmin(user)
    return repo.transact(team, tx => {
      tx.tags = tagsOf(tags).slice(0, 100)
      return { tags: tx.tags }
    })
  }

  // A preview is held in memory per team for 30 minutes and used once; applying it never reads the sheet again.
  const previews = new Map()
  const PREVIEW_MS = 30 * 60000

  async function previewImport(user, { onProgress } = {}) {
    const team = await requireAdmin(user)
    const state = await repo.read(team)
    refuseWhenDrawn(state.meta)
    const progress = step => { try { onProgress?.(step) } catch {} }
    const file = await sheetSource?.find?.(team)
    if (!file) throw codeError('PLACEMENTS_NOT_FOUND', 'Placeringsarket blev ikke fundet')
    progress('sheet')
    const rows = await readSheet(file)
    const materials = [...new Set(rows.map(row => row.material).filter(material => material && material !== '999-999'))]
    const { texts, unchecked = [], mm60Error = null } = await catalog.describeFromSap(materials, { onProgress: step => { if (step !== 'done') progress(step) } })
    progress('plan')
    const plan = planImport(rows, { sapTexts: texts, unchecked, now: now() })
    const token = newId()
    previews.set(team, { token, plan, file: path.basename(file), until: now() + PREVIEW_MS })
    const examples = plan.pallets.slice(0, 5).map(pallet => ({ ...pallet, description: texts[pallet.material] || '' }))
    progress('done')
    return { file: path.basename(file), mm60Error, stats: plan.stats, warnings: plan.warnings, examples, token, existing: Object.keys(state.locations).length, live: Boolean(state.meta.liveAt) }
  }

  async function applyImport(user, { token, replace = false } = {}) {
    const team = await requireAdmin(user)
    // Used up only when it lands, so "replace?" can follow a refusal over existing places.
    // No snapshot: an import cannot be undone as one action ("Erstat alt" is there until go-live).
    const result = await repo.transact(team, { snapshot: false }, tx => {
      refuseWhenDrawn(tx.meta)
      const preview = previews.get(team)
      if (!preview || preview.token !== token || preview.until < now()) throw codeError('PREVIEW_EXPIRED', 'Forhåndsvisningen er udløbet – læs arket igen')
      const { plan, file } = preview
      if (tx.meta.liveAt) throw codeError('LOCATIONS_LIVE', 'Placeringer er taget i brug – arket kan ikke importeres igen')
      if (Object.keys(tx.locations).length && !replace) throw codeError('LOCATIONS_NOT_EMPTY', 'Der findes allerede placeringer')
      tx.locations = Object.fromEntries(plan.locations.map(location => [location.id, location]))
      tx.pallets = Object.fromEntries(plan.pallets.map(pallet => [pallet.id, pallet]))
      tx.stock = Object.fromEntries((plan.stock || []).map(line => [line.id, line]))
      // The sheet already puts shelf rows as stock: nothing left for the one-time migration.
      tx.meta.shelvesMigratedAt = now()
      tx.tags = [...new Set([...tx.tags, ...plan.tags])]
      tx.meta.importedAt = now()
      tx.meta.importedFrom = file
      tx.event({ type: 'import', by: by(user), file, locations: plan.locations.length, pallets: plan.pallets.length })
      return { locations: plan.locations.length, pallets: plan.pallets.length }
    })
    previews.delete(team)
    return result
  }

  // ---------- The log and undo (managers and Placerings admins undo; everyone reads) ----------
  const DAY = 86400000
  const LOG_LIMIT = 500
  const clock = at => {
    const date = new Date(at)
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    return date.toDateString() === new Date(now()).toDateString() ? time : `${date.toLocaleDateString('da-DK', { day: 'numeric', month: 'numeric' })} ${time}`
  }
  /** "Bo tog 5 stk. fra A1.1" – how a later event is named when it blocks an undo. */
  function said(event) {
    const qty = event.quantity === null || event.quantity === undefined ? '' : ` ${event.quantity} stk.`
    switch (event.type) {
      case 'putaway': return `satte${qty} ${event.material || ''} på ${event.location}`.replace(/\s+/g, ' ')
      case 'take': return `tog${qty} fra ${event.location}`
      case 'refill': return `fyldte ${event.location} op fra ${event.from}`
      case 'move': return `flyttede pallen ${event.from} → ${event.to}`
      case 'sloc': return `skiftede storage location til ${event.to}`
      case 'edit-pallet': return 'rettede pallen'
      case 'location': return `rettede placeringen ${event.location || ''}`.trim()
      case 'undo': return 'fortrød en handling'
      case 'shelf-put': return `lagde${qty} ${event.material} på ${event.location}`
      case 'shelf-take': return `tog${qty} ${event.material} fra ${event.location}`
      case 'shelf-move': return `flyttede${qty} ${event.material} ${event.from} → ${event.to}`
      case 'shelf-set': return `rettede antallet af ${event.material} på ${event.location}`
      case 'migrate': return 'lagde hyldepaller om til hyldelager'
      default: return event.type
    }
  }
  const touches = (event, { kind, id }) => {
    if (kind === 'pallet') return event.pallet === id || Boolean(event.change?.after?.pallets && Object.hasOwn(event.change.after.pallets, id))
    if (kind === 'stock') {
      const [location, material] = id.split('|')
      return (event.material === material && [event.location, event.from, event.to].includes(location)) || Boolean(event.change?.after?.stock && Object.hasOwn(event.change.after.stock, id))
    }
    return event.location === id || event.from === id || event.to === id || Boolean(event.change?.after?.locations && Object.hasOwn(event.change.after.locations, id))
  }
  /** The change each transaction recorded, by tx id. */
  const changesOf = events => new Map(events.filter(event => event.change).map(event => [event.tx, event.change]))
  const PLACE_REASONS = { full: 'er fuld', reserved: 'er reserveret', station: 'er en arbejdsstation', inactive: 'er deaktiveret' }
  /** Whether a change made a place unfit for a pallet put back (`reason`): a pallet came onto it, or the place was changed. */
  const usedPlace = (change, { id, reason }) => {
    if (!change) return false
    const { changed, arrived } = placesUsedBy(change)
    return changed.includes(id) || (reason === 'full' && arrived.includes(id))
  }
  /**
   * The latest later event that touched what blocks the undo, as a sentence. An undo is never named (it cannot be undone),
   * nor an action that changed nothing (a take of some pieces from a pallet with an unknown quantity): it hides nothing.
   * A place that cannot take the pallet back is blamed on the latest action that used or changed it; else the place is named.
   */
  function blocker(events, origin, conflict, changes = changesOf(events)) {
    const later = event => event.at >= origin.at && event.tx !== origin.tx && event.type !== 'undo' && !event.undoneAt && !(event.tx && !changes.has(event.tx)) && touches(event, conflict)
    const named = conflict.reason ? events.find(event => later(event) && usedPlace(changes.get(event.tx), conflict)) : events.find(later)
    if (named) return `Kan ikke fortrydes. ${named.by?.name || 'En anden'} ${said(named)} kl. ${clock(named.at)}. Fortryd den først.`
    return conflict.reason && PLACE_REASONS[conflict.reason] ? `Kan ikke fortrydes. ${conflict.id} ${PLACE_REASONS[conflict.reason]}.` : 'Kan ikke fortrydes. Noget er ændret siden.'
  }

  /** What undoing a whole action does, for the confirmation: pallets removed, put back or changed; places likewise. */
  function effectOf(change, state) {
    const name = id => state.locations?.[id]?.name || change.before.locations?.[id]?.name || change.after.locations?.[id]?.name || id
    const effect = { pallets: { remove: [], restore: [], change: [] }, places: { remove: [], restore: [], change: [] } }
    for (const id of new Set([...Object.keys(change.before.pallets || {}), ...Object.keys(change.after.pallets || {})])) {
      const was = change.before.pallets?.[id] ?? null
      const is = change.after.pallets?.[id] ?? null
      if (is && !was) effect.pallets.remove.push(name(is.location))
      else if (was && !is) effect.pallets.restore.push(name(was.location))
      else if (was && is) effect.pallets.change.push({ location: name(was.location), from: is.quantity, to: was.quantity, ...(is.location !== was.location ? { now: name(is.location) } : {}) })
    }
    for (const id of new Set([...Object.keys(change.before.locations || {}), ...Object.keys(change.after.locations || {})])) {
      const was = change.before.locations?.[id] ?? null
      const is = change.after.locations?.[id] ?? null
      if (is && !was) effect.places.remove.push(is.name || id)
      else if (was && !is) effect.places.restore.push(was.name || id)
      else if (was && is) effect.places.change.push(was.name || id)
    }
    const stockIds = new Set([...Object.keys(change.before.stock || {}), ...Object.keys(change.after.stock || {})])
    if (stockIds.size) {
      effect.stock = [...stockIds].map(id => {
        const was = change.before.stock?.[id] ?? null
        const is = change.after.stock?.[id] ?? null
        const line = was || is
        return { location: name(line.location), material: line.material, from: is?.quantity ?? null, to: was?.quantity ?? null }
      })
    }
    return effect
  }

  /** The log; `verdicts: false` (Hubert) skips the undo check. */
  async function log(user, { query, person, type, days = 90, verdicts: withVerdicts = true } = {}) {
    const team = teamOf(user)
    const [state, all, admin] = await Promise.all([repo.read(team), repo.history(team, { months: Math.min(Math.ceil(days / 30) + 1, 4) }), isLocationAdmin(user)])
    const canUndo = admin && withVerdicts !== false
    const since = now() - days * DAY
    const q = String(query || '').trim().toUpperCase()
    const digits = q.replace(/\s+/g, '')
    const pallets = event => Object.values({ ...(event.change?.before?.pallets || {}), ...(event.change?.after?.pallets || {}) }).filter(Boolean)
    const matches = event => !q
      || [event.material, event.location, event.from, event.to, event.pallet].some(value => value && String(value).toUpperCase().startsWith(locationKey(q)))
      || (digits.length >= 4 && pallets(event).some(pallet => String(pallet.document || '').replace(/\s+/g, '').startsWith(digits)))
    const changes = changesOf(all)
    const groups = new Map()
    for (const event of all) if (event.tx) groups.set(event.tx, [...(groups.get(event.tx) || []), event])
    const verdicts = new Map()
    // Which actions used each place (placesUsedBy), built once on the first verdict that asks: an undo needs room only
    // where a later action used the place.
    let uses = null
    const usedIndex = () => {
      if (uses) return uses
      uses = new Map()
      for (const event of all) {
        if (!event.change) continue
        const { changed, arrived } = placesUsedBy(event.change)
        for (const id of new Set([...changed, ...arrived])) {
          if (!uses.has(id)) uses.set(id, [])
          uses.get(id).push({ tx: event.tx, at: event.at })
        }
      }
      return uses
    }
    const verdict = event => {
      if (!event.tx) return { canUndo: false, reason: 'Fra før loggen kunne fortryde' }
      if (verdicts.has(event.tx)) return verdicts.get(event.tx)
      const change = changes.get(event.tx)
      const group = groups.get(event.tx) || [event]
      let result
      if (group.some(item => item.type === 'import' || item.type === 'undo' || item.type === 'migrate' || item.type === 'layout')) result = { canUndo: false, reason: 'Kan ikke fortrydes' }
      else if (group.some(item => item.undoneAt)) result = { canUndo: false, reason: 'Allerede fortrudt' }
      else if (!change) result = { canUndo: false, reason: group.some(item => (item.type === 'take' || item.type === 'refill') && item.pallet) ? 'Pallens antal er ukendt, så der er intet at fortryde' : 'Fra før loggen kunne fortryde' }
      else {
        const origin = group[group.length - 1]
        const check = undoCheck(change, state, { used: { has: id => (usedIndex().get(id) || []).some(use => use.tx !== origin.tx && use.at >= origin.at) } })
        const drawn = check.ok && drawingBlock(change, state)
        if (drawn) result = { canUndo: false, reason: drawn }
        else result = check.ok ? { canUndo: true, effect: effectOf(change, state) } : { canUndo: false, reason: blocker(all, origin, check.conflict, changes) }
      }
      verdicts.set(event.tx, result)
      return result
    }
    const events = all.filter(event => event.at >= since && (!person || String(event.by?.email || '').toLowerCase() === String(person).toLowerCase()) && (!type || event.type === type) && matches(event)).slice(0, LOG_LIMIT)
    const people = [...new Map(all.filter(event => event.by?.email).map(event => [event.by.email, { email: event.by.email, name: event.by.name }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'da'))
    return { events: events.map(event => ({ ...publicEvent(event), ...(canUndo ? verdict(event) : { canUndo: false }) })), canUndo: admin, people }
  }

  async function undo(user, { eventId, at, actionId } = {}) {
    const team = await requireAdmin(user)
    // The places later actions used (an undo needs room only there): from the log, read before; the repository adds what
    // it sees under its lock. The event itself is looked up under the repository's lock: with M: down that fails as a
    // storage error, so it is queued. Its time (from the log line) picks the month file, so only that one is locked.
    const read = await repo.history(team, { months: 4 })
    const found = read.find(item => item.id === eventId)
    const group = found?.tx ? read.filter(item => item.tx === found.tx) : []
    const used = group.length ? placesUsedSince(read, group[group.length - 1]) : new Set()
    try {
      return await repo.undo(team, { eventId, ...(Number.isFinite(at) ? { at } : {}), by: by(user), actionId, used })
    } catch (error) {
      if (error.code !== 'UNDO_CONFLICT') throw error
      const all = await repo.history(team, { months: 4 })
      const group = all.filter(item => item.tx === error.tx)
      throw codeError('UNDO_CONFLICT', blocker(all, group[group.length - 1] || { at: 0, tx: error.tx }, error.conflict))
    }
  }

  return { teamOf, requireAdmin, log, undo, createRack, addShelf, deleteLocations, setActiveMany, shelfPut, shelfTake, shelfMove, shelfSet, rackCard, mapContents, ensureShelves, createLocation, createSeries, editLocation, setActive, setTags, previewImport, applyImport, list, stamp, putAway, take, refill, move, changeSloc, editPallet, overview, lookupDocument, suggest, search, materialCard, locationCard, palletCard }
}

module.exports = { createLocationService, codeError }
