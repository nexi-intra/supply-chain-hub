// Shift schedule for the assistant: single shifts plus recurring patterns ("shift-patterns"), expanded per day
// exactly like src/lib/shiftPatterns.ts. Rows carry person id, role and date only - comments are never copied.
const { norm } = require('./assistantNorm.cjs')

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const dayOf = value => String(value || '').slice(0, 10)
const parseLocal = value => {
  const [year, month, day] = dayOf(value).split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}
const isoOf = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const mondayOf = date => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  copy.setDate(copy.getDate() - (copy.getDay() || 7) + 1)
  return copy
}

// Elapsed Mondays from the anchor week (ISO week numbers reset at new year); the anchor week itself matches.
function matchesShiftInterval(dateString, anchorDateString, intervalWeeks) {
  const target = mondayOf(parseLocal(dateString))
  const anchor = mondayOf(parseLocal(anchorDateString))
  if (target.getTime() < anchor.getTime()) return false
  const weeks = Math.round((target.getTime() - anchor.getTime()) / (7 * 86400000))
  return weeks % intervalWeeks === 0
}

const validPattern = pattern => pattern && typeof pattern === 'object' && Array.isArray(pattern.weekdays)
  && Number.isInteger(pattern.intervalWeeks) && pattern.intervalWeeks >= 1 && ISO_DAY.test(dayOf(pattern.anchorDate))

/** The patterns that fall on one date. A real shift for the same person and role wins; `isUnavailable` gets the employee id. */
function expandPatterns(patterns, assignments, dateString, isUnavailable = () => false) {
  const weekday = parseLocal(dateString).getDay()
  const sameDay = (assignments || []).filter(item => dayOf(item.date) === dateString)
  const rows = []
  for (const pattern of patterns || []) {
    if (!validPattern(pattern) || !pattern.weekdays.includes(weekday)) continue
    if (dateString < dayOf(pattern.anchorDate)) continue
    if (ISO_DAY.test(dayOf(pattern.endDate)) && dateString > dayOf(pattern.endDate)) continue
    if (!matchesShiftInterval(dateString, pattern.anchorDate, pattern.intervalWeeks)) continue
    if (sameDay.some(item => item.employeeId === pattern.employeeId && item.roleId === pattern.roleId)) continue
    if (rows.some(row => row.employeeId === pattern.employeeId && row.roleId === pattern.roleId)) continue
    if (isUnavailable(pattern.employeeId, dateString)) continue
    rows.push({ date: dateString, employeeId: pattern.employeeId, roleId: pattern.roleId, pattern: true })
  }
  return rows
}

// Approved vacation (also parental leave) or approved sick leave covers the day; an open sick entry covers its start day only.
function absenceLookup(team, readTeam) {
  const list = key => { const value = readTeam(team, key); return Array.isArray(value) ? value : [] }
  const users = readTeam(team, 'users')
  const emails = new Map()
  const entries = Array.isArray(users) ? users.map(user => [user?.email, user]) : Object.entries(users || {})
  for (const [key, user] of entries) {
    if (!user || typeof user !== 'object') continue
    const email = norm(user.email || key)
    if (!email) continue
    for (const id of [key, user.id, user.email]) if (id) emails.set(norm(id), email)
  }
  const byUser = new Map()
  for (const entry of [...list('vacation-entries'), ...list('sick-leave-entries')]) {
    if (!entry || entry.status !== 'approved') continue
    const own = byUser.get(norm(entry.userEmail))
    if (own) own.push(entry); else byUser.set(norm(entry.userEmail), [entry])
  }
  return (employeeId, date) => (byUser.get(emails.get(norm(employeeId)) || norm(employeeId)) || []).some(entry => dayOf(entry.startDate) <= date && dayOf(entry.endDate || entry.startDate) >= date)
}

/** One team's shift data, loaded once; `onDay` / `inRange` return rows {date, employeeId, roleId, roleName, pattern}. */
function loadShifts(team, readTeam) {
  const list = key => { const value = readTeam(team, key); return Array.isArray(value) ? value : [] }
  const roles = list('shift-roles')
  const assignments = list('shift-assignments')
    .filter(item => item && ISO_DAY.test(dayOf(item.date)))
    .map(item => ({ date: dayOf(item.date), employeeId: item.employeeId, roleId: item.roleId }))
  const patterns = list('shift-patterns').filter(validPattern)
  const roleNames = new Map()
  for (const role of roles) if (role && !roleNames.has(role.id)) roleNames.set(role.id, String(role.name || ''))
  const byDate = new Map()
  for (const item of assignments) { const own = byDate.get(item.date); if (own) own.push(item); else byDate.set(item.date, [item]) }
  let absence = null
  const unavailable = (employeeId, date) => { absence = absence || absenceLookup(team, readTeam); return absence(employeeId, date) }
  const named = row => ({ ...row, roleName: roleNames.get(row.roleId) || '' })
  const onDay = date => [
    ...(byDate.get(date) || []).map(item => named({ ...item, pattern: false })),
    ...(patterns.length ? expandPatterns(patterns, byDate.get(date) || [], date, unavailable).map(named) : []),
  ]
  function inRange(range, { patternDays = 366 } = {}) {
    const rows = assignments.filter(item => item.date >= range.start && item.date <= range.end).map(item => named({ ...item, pattern: false }))
    if (!patterns.length) return rows
    const cursor = parseLocal(range.start)
    for (let i = 0; i < patternDays; i++, cursor.setDate(cursor.getDate() + 1)) {
      const date = isoOf(cursor)
      if (date > range.end) break
      rows.push(...expandPatterns(patterns, byDate.get(date) || [], date, unavailable).map(named))
    }
    return rows
  }
  return { roles, onDay, inRange }
}

const shiftsInRange = (team, readTeam, range) => loadShifts(team, readTeam).inRange(range)

// A role that is itself the everyday word for a shift ("Vagt") would match every shift question.
const GENERIC_ROLE = new Set(['vagt', 'vagter', 'vagtplan', 'shift', 'shifts', 'task', 'tasks', 'opgave', 'opgaver', 'vuoro', 'vuorot', 'tehtävä', 'tehtävät', 'pass', 'uppgift', 'uppgifter', 'schema', 'plan'])
// Short role names that are also ordinary words ("AM" / "am") only match when typed exactly like the role.
const COMMON_WORD = new Set(['am', 'is', 'at', 'on', 'in', 'to', 'of', 'or', 'it', 'as', 'by', 'be', 'do', 'so', 'no', 'up', 'us', 'we', 'me', 'my', 'he', 'if', 'og', 'på', 'af', 'en', 'et', 'er', 'de', 'du', 'vi', 'den', 'det', 'som', 'har', 'var', 'ja', 'oli', 'och', 'är', 'jag', 'att', 'sig'])
const fold = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The roles a question names. Names of 4+ letters also match endings of up to 5 letters ("lukkevagten", "lukkevagter");
 * shorter names match as a whole word only. Of nested hits ("Lukkevagt" inside "Lukkevagt weekend") the longest wins.
 */
function rolesNamedIn(question, roles) {
  const text = fold(question)
  const raw = String(question || '').normalize('NFKC')
  if (!text) return []
  const hits = []
  for (const role of roles || []) {
    const original = String(role?.name || '').trim()
    if (!original) continue
    for (const name of new Set([fold(original), fold(original.replace(/\([^)]*\)/g, ' '))].filter(Boolean))) {
      const letters = [...name].filter(char => /\p{L}/u.test(char)).length
      if (!letters || GENERIC_ROLE.has(name)) continue
      const long = letters >= 4
      const match = new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}${long ? '\\p{L}{0,5}' : ''}(?![\\p{L}\\p{N}])`, 'u').exec(text)
      if (!match) continue
      if (!long && COMMON_WORD.has(name) && !new RegExp(`(?<![\\p{L}\\p{N}])${escape(original)}(?![\\p{L}\\p{N}])`, 'u').test(raw)) continue
      hits.push({ role, start: match.index, end: match.index + match[0].length })
      break
    }
  }
  return hits.filter(hit => !hits.some(other => other !== hit && other.start <= hit.start && other.end >= hit.end && other.end - other.start > hit.end - hit.start)).map(hit => hit.role)
}

module.exports = { matchesShiftInterval, expandPatterns, loadShifts, shiftsInRange, rolesNamedIn }
