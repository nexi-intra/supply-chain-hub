// Sick leave is kept only until its day is over: the hub may show who is sick today (and sick leave already reported
// for the coming days), but never keeps sickness as history or statistics. Finished sick leave and the automatic
// "Sygemelding / Barn syg" notices about it are deleted from every team, and backups never carry them.
const ENTRIES = 'sick-leave-entries'
const NOTICES = 'email-notifications'
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

const localDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** The local calendar day of a stored date: 'yyyy-mm-dd' as is, a timestamp in the local time zone, else ''. */
function dayOf(value) {
  if (typeof value === 'string' && ISO_DAY.test(value)) return value
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : localDay(date)
}

/** A sick leave entry is finished when its last day (end date, else start date) is before today; an undated one is junk. */
function isFinishedEntry(entry, today) {
  const last = dayOf(entry?.endDate) || dayOf(entry?.startDate)
  return !last || last < today
}

function isFinishedNotice(notice, today) {
  if (notice?.type !== 'sick-leave') return false
  const day = dayOf(notice.timestamp)
  return !day || day < today
}

const RULES = [[ENTRIES, isFinishedEntry], [NOTICES, isFinishedNotice]]

/** Deletes finished sick leave and its notices from one team store; reads first so a store with nothing to delete is never locked. */
function purgeStore(store, today) {
  let removed = 0
  for (const [key, finished] of RULES) {
    const current = store.get(key, { skipCache: true })
    if (!Array.isArray(current) || !current.some(item => finished(item, today))) continue
    store.mutate(key, list => {
      if (!Array.isArray(list)) return undefined
      const kept = list.filter(item => !finished(item, today))
      removed += list.length - kept.length
      return kept.length === list.length ? undefined : kept
    })
  }
  return removed
}

/** A backup's data without finished sick leave or its notices. */
function scrubBackup(data, today) {
  if (!data || typeof data !== 'object') return data
  const out = { ...data }
  for (const [key, finished] of RULES) {
    if (Array.isArray(out[key])) out[key] = out[key].filter(item => !finished(item, today))
  }
  return out
}

module.exports = { purgeStore, scrubBackup, isFinishedEntry, isFinishedNotice, localDay }
