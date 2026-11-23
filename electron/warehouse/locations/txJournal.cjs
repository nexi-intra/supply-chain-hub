// The write-ahead journal of a Placeringer transaction ("tx-pending" next to the data on M:).
// The store replaces a transaction's files one at a time, so when M: drops halfway some files are new and some old –
// and a replay of the action would apply it a second time. A transaction that changes more than one file therefore
// first writes the journal (what every file becomes, the log lines it adds and the action ids it records in meta), then
// the files – the places and pallets, then the log, meta last. The journal stays (finished once its action ids are in
// meta; one without action ids is deleted). The next transaction finishes a journal it finds, under the same locks,
// before it runs.
// 1.6.6/1.6.7 Hubs do not know the journal and write the same files under the same locks. The journal therefore keeps a
// fingerprint of every file before and after, and a file somebody wrote since is never overwritten: such a journal is
// only finished where the log proves how far it got, otherwise it is given up (as before the journal: the outbox replays).
const crypto = require('crypto')

const JOURNAL_KEY = 'tx-pending'
const META = 'meta'
// Objects by id: journalled by entry, so the journal stays small.
const MAP_KEYS = new Set(['locations', 'pallets', 'stock'])
// Written without a transaction (the admin's autosave): a newer value is kept, the rest of the journal is finished.
const SOLO_KEYS = new Set(['layout-draft'])
const isHistory = key => key.startsWith('history-')
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const json = value => JSON.stringify(value ?? null)
const fingerprint = text => crypto.createHash('sha256').update(text).digest('base64')
const same = (a, b) => a === b || json(a) === json(b)

/**
 * The transaction's view of its locked keys: reads see its own writes, and nothing reaches the store before commit.
 * Values read are the transaction's own copies; they must not be changed in place.
 */
function createStage(locked) {
  const disk = new Map()
  const next = new Map()
  const original = key => { if (!disk.has(key)) disk.set(key, locked.get(key)); return disk.get(key) }
  return {
    get: key => (next.has(key) ? next.get(key) : original(key)),
    set(key, value) { original(key); next.delete(key); next.set(key, value) },
    delete(key) { original(key); next.delete(key); next.set(key, undefined) },
    mark: () => new Map(next),
    reset(mark) { next.clear(); for (const [key, value] of mark) next.set(key, value) },
    /** What differs from M:, in the order it is written: the places and pallets, the log, meta last. */
    changes() {
      const list = []
      for (const [key, value] of next) {
        if (key === JOURNAL_KEY) continue
        const before = disk.get(key)
        if (isHistory(key)) { if (value !== before) list.push({ key, value, before }); continue }
        const beforeJson = json(before)
        const afterJson = json(value)
        if (beforeJson !== afterJson) list.push({ key, value, before, beforeJson, afterJson })
      }
      const rank = key => (key === META ? 2 : isHistory(key) ? 1 : 0)
      return list.sort((a, b) => rank(a.key) - rank(b.key))
    },
  }
}

/** A month's log as lines added and lines marked undone; null when the change is anything else. */
function historyOps(before, after) {
  if (!Array.isArray(after) || (before !== undefined && !Array.isArray(before))) return null
  const old = new Map((before || []).map(event => [event?.id, event]))
  if (old.has(undefined)) return null
  const append = []
  const marks = {}
  let kept = 0
  for (const event of after) {
    if (!event?.id) return null
    const was = old.get(event.id)
    if (!was) { append.push(event); continue }
    kept++
    if (was === event || same(was, event)) continue
    const { undoneAt, undoneBy, ...rest } = event
    const { undoneAt: wasAt, undoneBy: wasBy, ...restBefore } = was
    if (wasAt || !undoneAt || !same(rest, restBefore)) return null
    marks[event.id] = { undoneAt, undoneBy }
  }
  return kept === old.size ? { append, marks } : null
}

function entriesOf(before, after) {
  const was = isObject(before) ? before : {}
  const entries = []
  for (const [id, value] of Object.entries(after)) if (!same(was[id], value)) entries.push([id, value])
  for (const id of Object.keys(was)) if (!Object.hasOwn(after, id)) entries.push([id])
  return entries
}

function metaChange({ before, value, beforeJson, afterJson }) {
  const pre = isObject(before) ? before : {}
  const post = isObject(value) ? value : {}
  const known = new Set(pre.applied || [])
  const fields = {}
  for (const field of new Set([...Object.keys(pre), ...Object.keys(post)])) {
    if (field !== 'applied' && field !== 'changedAt' && !same(pre[field], post[field])) fields[field] = { before: pre[field], after: post[field] }
  }
  return {
    pre: fingerprint(beforeJson), post: fingerprint(afterJson), added: (post.applied || []).filter(id => !known.has(id)), fields,
    ...(post.changedAt !== pre.changedAt && Number.isFinite(post.changedAt) ? { changedAt: post.changedAt } : {}),
  }
}

/** The journal of `changes` (from stage.changes()). */
function journalOf(changes, at) {
  const journal = { v: 1, at, actionIds: [], keys: {}, history: {}, meta: null }
  for (const change of changes) {
    const { key, value, before } = change
    if (key === META) { journal.meta = metaChange(change); journal.actionIds = journal.meta.added; continue }
    if (isHistory(key)) {
      const ops = historyOps(before, value)
      if (ops) { journal.history[key] = ops; continue }
      change.beforeJson = json(before)
      change.afterJson = json(value)
    }
    journal.keys[key] = {
      pre: fingerprint(change.beforeJson), post: fingerprint(change.afterJson),
      ...(value === undefined ? { deleted: true } : MAP_KEYS.has(key) && isObject(value) ? { entries: entriesOf(before, value) } : { value }),
    }
  }
  return journal
}

/** Every key a journal may write: they must all be locked to finish it. */
const keysOf = journal => [...new Set([...Object.keys(journal.keys || {}), ...Object.keys(journal.history || {}), META])]

function mergeHistory(list, ops) {
  const next = Array.isArray(list) ? [...list] : []
  const at = new Map(next.map((event, index) => [event?.id, index]))
  let changed = false
  for (const event of ops.append) if (!at.has(event.id)) { at.set(event.id, next.length); next.push(event); changed = true }
  for (const [id, mark] of Object.entries(ops.marks)) {
    const index = at.get(id)
    if (index === undefined || next[index].undoneAt) continue
    next[index] = { ...next[index], ...mark }
    changed = true
  }
  return changed ? next : null
}

/** meta with the journal's action ids, change stamp and other fields; null when a field was changed otherwise since. */
function mergeMeta(current, change, keepApplied) {
  const next = structuredClone(isObject(current) ? current : {})
  for (const [field, { before, after }] of Object.entries(change.fields || {})) {
    if (same(next[field], after)) continue
    if (!same(next[field], before)) return null
    if (after === undefined) delete next[field]
    else next[field] = after
  }
  const have = new Set(next.applied || [])
  const added = (change.added || []).filter(id => !have.has(id))
  if (added.length) next.applied = [...(next.applied || []), ...added].slice(-keepApplied)
  if (Number.isFinite(change.changedAt) && !(next.changedAt >= change.changedAt)) next.changedAt = change.changedAt
  return next
}

const historySeen = (list, ops) => Array.isArray(list) && list.some(event => ops.append.some(added => added.id === event?.id) || (ops.marks[event?.id] && event.undoneAt === ops.marks[event.id].undoneAt))

/** Every action id of the journal is in meta, which is written last: all of it reached M:. */
const isDone = (journal, meta) => {
  const ids = journal.actionIds || []
  const applied = new Set(meta?.applied || [])
  return ids.length > 0 && ids.every(id => applied.has(id))
}

/**
 * What finishing `journal` writes, with `read(key)` the value on M: now.
 * - Its action ids are all in meta: everything reached M: (meta is written last). Nothing to do.
 * - meta is as before or after the transaction: nobody acted since (every action writes meta). Every file still as
 *   before is written; a file changed since is never overwritten – the journal is given up (the draft is just skipped).
 * - meta was changed by somebody else (a 1.6.6/1.6.7 Hub acted since): only proof that the files landed counts – the
 *   last file renamed as the transaction left it, or a log line of the action (the log is written after the files).
 *   Then the log and meta are finished (both only added to); the files are left as they are. Without proof the
 *   journal is given up and the outbox replays the action.
 */
function finishPlan(journal, read, { keepApplied }) {
  const meta = read(META)
  if (isDone(journal, meta)) return { outcome: 'done', writes: [] }
  const metaNow = journal.meta && fingerprint(json(meta))
  const metaTouched = !journal.meta || (metaNow !== journal.meta.pre && metaNow !== journal.meta.post)
  const writes = []
  const history = Object.entries(journal.history || {}).map(([key, ops]) => ({ key, ops, now: read(key) }))
  if (!metaTouched) {
    const files = Object.entries(journal.keys || {}).map(([key, entry]) => {
      const now = read(key)
      const text = fingerprint(json(now))
      return { key, entry, now, state: text === entry.post ? 'post' : text === entry.pre ? 'pre' : 'other' }
    })
    const changed = files.filter(file => file.state === 'other' && !SOLO_KEYS.has(file.key))
    if (changed.length) return { outcome: 'abandoned', reason: `ændret siden: ${changed.map(file => file.key).join(', ')}`, writes: [] }
    for (const { key, entry, now, state } of files) {
      if (state !== 'pre') continue
      if (entry.deleted) writes.push([key, undefined])
      else if (entry.entries) {
        const value = structuredClone(isObject(now) ? now : {})
        for (const [id, ...set] of entry.entries) { if (set.length) value[id] = set[0]; else delete value[id] }
        writes.push([key, value])
      } else writes.push([key, entry.value])
    }
  } else {
    // The files are renamed in order, so the last one as the transaction left it proves they all landed.
    const last = Object.keys(journal.keys || {}).at(-1)
    const landed = last !== undefined && fingerprint(json(read(last))) === journal.keys[last].post
    if (!landed && !history.some(({ now, ops }) => historySeen(now, ops))) {
      return { outcome: 'abandoned', reason: 'en anden Hub har skrevet siden, og intet viser at handlingen nåede M:', writes: [] }
    }
  }
  for (const { key, ops, now } of history) {
    const merged = mergeHistory(now, ops)
    if (merged) writes.push([key, merged])
  }
  if (journal.meta) {
    const merged = mergeMeta(meta, journal.meta, keepApplied)
    if (!merged) return { outcome: 'abandoned', reason: 'meta er ændret siden', writes: [] }
    if (!same(merged, meta)) writes.push([META, merged])
  }
  return { outcome: 'rolled', writes }
}

/**
 * Finishes a journal left on M: inside a transaction (`stage` over the locked keys `allowed`). Returns null without
 * one, else 'done' (finished before: nothing to do), 'rolled' or 'abandoned'. Throws TX_JOURNAL_KEYS (before anything
 * is changed) when an unfinished one needs keys that are not locked.
 */
function finishLeftover(stage, allowed, { keepApplied, warn = console.warn }) {
  const journal = stage.get(JOURNAL_KEY)
  if (!journal) return null
  if (journal.v !== 1) {
    warn('Placeringer: en efterladt transaktion i et ukendt format er opgivet', journal?.v)
    return 'abandoned'
  }
  // Only meta (always locked) is needed to see that it is finished: the kept journal costs no extra locks.
  if (isDone(journal, stage.get(META))) return 'done'
  const keys = keysOf(journal)
  if (keys.some(key => !allowed.has(key))) throw Object.assign(new Error('TX_JOURNAL_KEYS'), { code: 'TX_JOURNAL_KEYS', keys })
  const plan = finishPlan(journal, key => stage.get(key), { keepApplied })
  if (plan.outcome === 'abandoned') warn(`Placeringer: en efterladt transaktion (${(journal.actionIds || []).join(', ') || 'uden handlings-id'}) er opgivet: ${plan.reason}`)
  for (const [key, value] of plan.writes) {
    if (value === undefined) stage.delete(key)
    else stage.set(key, value)
  }
  return plan.outcome
}

/**
 * Hands the stage's changes to the store transaction: more than one file goes journal first, then the files; a single
 * file is one rename and needs none. A journal with action ids is kept – it is finished once they are all in meta –
 * so the file is always there and a PC never misses a new one through its SMB cache of "file not found"; one without
 * is deleted once every file landed. A leftover journal that was not finished before is deleted.
 */
function commitStage(locked, stage, { at, leftover }) {
  const changes = stage.changes()
  const write = ({ key, value }) => (value === undefined ? locked.delete(key) : locked.set(key, value))
  if (changes.length > 1) {
    const journal = journalOf(changes, at)
    locked.set(JOURNAL_KEY, journal)
    changes.forEach(write)
    if (!journal.actionIds.length) locked.deleteAfterCommit(JOURNAL_KEY)
    return
  }
  changes.forEach(write)
  if (leftover && leftover !== 'done') locked.delete(JOURNAL_KEY)
}

module.exports = { JOURNAL_KEY, createStage, finishLeftover, commitStage, journalOf, finishPlan, keysOf }
