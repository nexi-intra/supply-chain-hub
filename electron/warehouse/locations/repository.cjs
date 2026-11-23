// A team's Placeringer in "<team>\lagerstyring\placeringer": places, pallets, tags, meta and a monthly history.
// Every change is one transaction under the store's file locks, so two people acting at once never overwrite each other.
// Each transaction records its change (the pallets and places before and after) on its first history event, so the
// action can be undone later – one action at a time, and only while nothing it touched has changed since.
const { KEYS, STATE_KEYS, LAYOUT_KEYS } = require('./model.cjs')
const { changeOf, undoPlan, drawingBlock } = require('./undo.cjs')
const { JOURNAL_KEY, createStage, finishLeftover, commitStage } = require('./txJournal.cjs')

const EMPTY = { locations: {}, pallets: {}, stock: {}, tags: [], meta: {} }
// The drawing's keys by their name on `tx` (only with `withLayout`).
const LAYOUT_TX = Object.freeze({ layout: LAYOUT_KEYS.layout, layoutVersions: LAYOUT_KEYS.versions, draft: LAYOUT_KEYS.draft })
const LAYOUT_EMPTY = { layout: null, layoutVersions: [], draft: null }
const KEEP_APPLIED = 2000
const pad = value => String(value).padStart(2, '0')
const monthKey = ms => { const date = new Date(ms); return `history-${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}` }
const codeError = (code, message, extra = {}) => Object.assign(new Error(message || code), { code }, extra)
const lower = value => String(value || '').trim().toLowerCase()
const placesOf = state => ({ locations: state.locations, pallets: state.pallets, stock: state.stock })

// How far back an action can be undone (the log shows 3 months).
const UNDO_MONTHS = 4
// How often a leftover journal that needs other locks is finished on its own before the action gives up (as busy).
const JOURNAL_ROUNDS = 3
class Thrown { constructor(error) { this.error = error } }

function createLocationRepository({ storeFor, now = Date.now, newId }) {
  /**
   * Runs `work(locked, prepared)` under the locks of `keys` and the journal (see txJournal.cjs): a journal left by a
   * transaction that M: dropped halfway is finished first. `work` gets the same get/set/delete as a store transaction;
   * a throw writes nothing of it – the finished journal is still written. A journal that needs keys `keys` lacks is
   * finished in a transaction of its own first; `prepare` (reads before the locks) runs again after that.
   */
  async function inTransaction(store, keys, work, prepare = async () => null) {
    const at = Date.now()
    for (let round = 0; ; round++) {
      try {
        const prepared = await prepare()
        const allowed = new Set([...keys, JOURNAL_KEY])
        const out = await store.withLockedKeysAsync([...allowed], locked => {
          const stage = createStage(locked)
          const hadJournal = finishLeftover(stage, allowed, { keepApplied: KEEP_APPLIED })
          const finished = stage.mark()
          let result
          try {
            result = work(stage, prepared)
          } catch (error) {
            if (!hadJournal) throw error
            stage.reset(finished)
            commitStage(locked, stage, { at, hadJournal })
            return new Thrown(error)
          }
          commitStage(locked, stage, { at, hadJournal })
          return result
        })
        if (out instanceof Thrown) throw out.error
        return out
      } catch (error) {
        if (error?.code !== 'TX_JOURNAL_KEYS') throw error
        if (round >= JOURNAL_ROUNDS) throw codeError('KV_LOCK_BUSY', 'Lageret er optaget lige nu. Prøv igen om et øjeblik.')
        await finishAlone(store, error.keys, at).catch(failure => { if (failure?.code !== 'TX_JOURNAL_KEYS') throw failure })
      }
    }
  }

  async function finishAlone(store, keys, at) {
    const allowed = new Set([...keys, KEYS.meta, JOURNAL_KEY])
    return store.withLockedKeysAsync([...allowed], locked => {
      const stage = createStage(locked)
      const hadJournal = finishLeftover(stage, allowed, { keepApplied: KEEP_APPLIED })
      commitStage(locked, stage, { at, hadJournal })
    })
  }

  async function read(team) {
    const store = storeFor(team)
    const values = await Promise.all(STATE_KEYS.map(name => store.getAsync(KEYS[name])))
    return Object.fromEntries(STATE_KEYS.map((name, index) => [name, values[index] ?? structuredClone(EMPTY[name])]))
  }

  const readLocked = (locked, names = STATE_KEYS) => Object.fromEntries(names.map(name => [name, locked.get(KEYS[name]) ?? structuredClone(EMPTY[name])]))
  /** Writes the changed keys, the change stamp and the applied action id. */
  function writeState(locked, before, next, { at, actionId, changed }) {
    if (actionId) next.meta.applied = [...(next.meta.applied || []), actionId].slice(-KEEP_APPLIED)
    // The change stamp lets the other PCs see that they should read again.
    if (changed || STATE_KEYS.some(name => name !== 'meta' && JSON.stringify(next[name]) !== JSON.stringify(before[name]))) next.meta.changedAt = at
    for (const name of STATE_KEYS) if (JSON.stringify(next[name]) !== JSON.stringify(before[name])) locked.set(KEYS[name], next[name])
  }

  const readLayoutLocked = locked => Object.fromEntries(Object.entries(LAYOUT_TX).map(([name, key]) => [name, locked.get(key) ?? structuredClone(LAYOUT_EMPTY[name])]))
  /** Writes the changed drawing keys; `null` deletes the key. */
  function writeLayout(locked, before, next) {
    for (const [name, key] of Object.entries(LAYOUT_TX)) {
      if (JSON.stringify(next[name]) === JSON.stringify(before[name])) continue
      if (next[name] == null) locked.delete(key)
      else locked.set(key, next[name])
    }
  }

  /** The published drawing, the draft and the published versions, read past the cache. */
  async function readLayout(team) {
    const store = storeFor(team)
    const [layout, draft, versions] = await Promise.all([LAYOUT_KEYS.layout, LAYOUT_KEYS.draft, LAYOUT_KEYS.versions].map(key => store.getAsync(key, { skipCache: true })))
    return { layout: layout ?? null, draft: draft ?? null, versions: versions ?? [] }
  }

  /** Saves the draft under its own lock only, so autosave never touches the places; `fn` returning null deletes it, undefined writes nothing. */
  async function writeDraft(team, fn) {
    return storeFor(team).withLockedKeysAsync([LAYOUT_KEYS.draft], locked => {
      const current = locked.get(LAYOUT_KEYS.draft) ?? null
      const next = fn(current)
      if (next === undefined) return current
      if (next === null) locked.delete(LAYOUT_KEYS.draft)
      else locked.set(LAYOUT_KEYS.draft, next)
      return next
    })
  }

  /**
   * `fn(tx)` changes the clones and calls `tx.event(...)`; a throw writes nothing. Only changed keys are written.
   * With an `actionId` (`transact(team, { actionId }, fn)`) the id is recorded in the same transaction, and an id that is
   * already recorded returns { duplicate: true } without running `fn`: a replayed action is never applied twice.
   * All events of the transaction share one `tx` id; the first carries the change, unless `snapshot: false` (import).
   * With `withLayout` the drawing's keys are locked too and on `tx` as `layout`, `layoutVersions` and `draft`.
   * `writes` (a daily action: e.g. ['pallets']) locks only those keys, the places, meta and the history: every lock file
   * costs seconds on M:. The other keys (which such an action never reads to decide) are read without a lock, and
   * changing one of them fails the transaction.
   * A transaction that writes more than one file goes through the journal (txJournal.cjs), so M: dropping halfway never
   * leaves half an action: the next transaction finishes it, and its replay is then recognised by its action id.
   */
  async function transact(team, options, fn) {
    if (typeof options === 'function') [fn, options] = [options, {}]
    const actionId = options?.actionId
    const withLayout = options?.withLayout === true
    const store = storeFor(team)
    const at = now()
    const historyKey = monthKey(at)
    const layoutKeys = withLayout ? Object.values(LAYOUT_TX) : []
    const lockedNames = Array.isArray(options?.writes) ? STATE_KEYS.filter(name => name === 'meta' || name === 'locations' || options.writes.includes(name)) : STATE_KEYS
    const readOnly = STATE_KEYS.filter(name => !lockedNames.includes(name))
    const readOutside = async () => {
      const unlocked = await Promise.all(readOnly.map(name => store.getAsync(KEYS[name], { skipCache: true })))
      return Object.fromEntries(readOnly.map((name, index) => [name, unlocked[index] ?? structuredClone(EMPTY[name])]))
    }
    return inTransaction(store, [...lockedNames.map(name => KEYS[name]), ...layoutKeys, historyKey], (locked, outside) => {
      const state = { ...readLocked(locked, lockedNames), ...outside }
      const before = withLayout ? { ...state, ...readLayoutLocked(locked) } : state
      if (actionId && (before.meta.applied || []).includes(actionId)) return { duplicate: true }
      const tx = structuredClone(before)
      const events = []
      const txId = actionId || newId()
      tx.event = event => { events.push({ id: newId(), at, tx: txId, ...(actionId ? { actionId } : {}), ...event }) }
      const result = fn(tx)
      delete tx.event
      const change = options?.snapshot === false ? null : changeOf(placesOf(before), placesOf(tx))
      if (change && events.length) events[0].change = change
      writeState(locked, before, tx, { at, actionId, changed: events.length > 0 })
      if (withLayout) writeLayout(locked, before, tx)
      if (events.length) locked.set(historyKey, [...(locked.get(historyKey) || []), ...events])
      return result
    }, readOutside)
  }

  /**
   * Undoes the action `tx` (whose events are in the month of `at`): the state goes back to the recorded "before".
   * Throws UNDO_NOT_FOUND, UNDO_NOT_POSSIBLE (no change recorded, an import, a drawing publish or an undo), UNDO_ALREADY or UNDO_CONFLICT
   * (with `conflict: { kind, id }`: what was changed since). The original events are marked; the undo is its own event.
   */
  async function undo(team, { eventId, tx: wantedTx, at, by, actionId }) {
    const store = storeFor(team)
    const undoneAt = now()
    const currentKey = monthKey(undoneAt)
    // By event id the event is looked up under the lock in the last UNDO_MONTHS months, so nothing is read before it;
    // with its time as well, only that month is locked (one lock file less per month on M:).
    const start = new Date(undoneAt)
    const recent = Array.from({ length: UNDO_MONTHS }, (_, back) => monthKey(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - back, 1)))
    const months = !eventId ? [monthKey(at)] : Number.isFinite(at) && recent.includes(monthKey(at)) ? [monthKey(at)] : recent
    return inTransaction(store, [...STATE_KEYS.map(name => KEYS[name]), ...months, currentKey], locked => {
      const before = readLocked(locked)
      if (actionId && (before.meta.applied || []).includes(actionId)) return { duplicate: true }
      const originKey = eventId ? months.find(key => (locked.get(key) || []).some(event => event.id === eventId)) : months[0]
      const found = originKey && (locked.get(originKey) || []).find(event => (eventId ? event.id === eventId : event.tx === wantedTx))
      if (!found) throw codeError('UNDO_NOT_FOUND', 'Handlingen findes ikke i loggen')
      if (!found.tx) throw codeError('UNDO_NOT_POSSIBLE', 'Handlingen er fra før loggen kunne fortryde')
      const tx = found.tx
      const origin = [...(locked.get(originKey) || [])]
      const events = origin.filter(event => event.tx === tx)
      if (!events.length) throw codeError('UNDO_NOT_FOUND', 'Handlingen findes ikke i loggen')
      const change = events.find(event => event.change)?.change
      if (!change || events.some(event => event.type === 'import' || event.type === 'undo' || event.type === 'layout')) throw codeError('UNDO_NOT_POSSIBLE', 'Handlingen kan ikke fortrydes')
      if (events.some(event => event.undoneAt)) throw codeError('UNDO_ALREADY', 'Handlingen er allerede fortrudt')
      const plan = undoPlan(change, placesOf(before))
      if (!plan.ok) throw codeError('UNDO_CONFLICT', 'Noget er ændret siden', { conflict: plan.conflict, tx })
      const drawn = drawingBlock(change, before)
      if (drawn) throw codeError('UNDO_NOT_POSSIBLE', drawn)
      const next = { ...structuredClone(before), locations: plan.state.locations, pallets: plan.state.pallets, stock: plan.state.stock ?? before.stock }
      writeState(locked, before, next, { at: undoneAt, actionId, changed: true })
      const marked = origin.map(event => (event.tx === tx ? { ...event, undoneAt, undoneBy: by } : event))
      const first = events[0]
      const undoEvent = {
        id: newId(), at: undoneAt, tx: actionId || newId(), ...(actionId ? { actionId } : {}), type: 'undo', by, undoes: tx,
        ...(first.pallet ? { pallet: first.pallet } : {}), ...(first.location ? { location: first.location } : {}), ...(first.material ? { material: first.material } : {}),
        change: changeOf(placesOf(before), plan.state),
      }
      if (originKey === currentKey) locked.set(currentKey, [...marked, undoEvent])
      else {
        locked.set(originKey, marked)
        locked.set(currentKey, [...(locked.get(currentKey) || []), undoEvent])
      }
      return { undone: events.length }
    })
  }

  /** The team's meta (import, go-live and the change stamp) without reading the rest. */
  const meta = async team => (await storeFor(team).getAsync(KEYS.meta, { skipCache: true })) || {}

  async function history(team, { months = 3, location, pallet, material, person, type, since } = {}) {
    const store = storeFor(team)
    const start = new Date(now())
    const keys = Array.from({ length: months }, (_, back) => monthKey(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - back, 1)))
    const lists = await Promise.all(keys.map(key => store.getAsync(key)))
    const who = person ? lower(person) : null
    // Reversed before the stable sort, so events from the same millisecond also come newest first.
    return lists.flatMap(list => list || []).reverse()
      .filter(event => (!location || event.location === location || event.from === location || event.to === location) && (!pallet || event.pallet === pallet) && (!material || event.material === material)
        && (!who || lower(event.by?.email) === who) && (!type || event.type === type) && (!since || event.at >= since))
      .sort((a, b) => b.at - a.at)
  }

  return { read, readLayout, writeDraft, transact, undo, history, meta }
}

module.exports = { createLocationRepository }
