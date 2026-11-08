// Nisselegen: every weekday in December a nisse hides in each hub from 10:00 Danish time, and the first to click it
// wins a chocolate. The schedule lives only here (main) – the renderer asks main where today's nisse is.

const ZONE = 'Europe/Copenhagen'

// 24 hiding places in three bands. The renderer has one <NisseSpot spot="…"> per id (test: nisseSpots.test.ts).
const SPOTS = Object.freeze({
  easy: Object.freeze(['front-logo', 'front-board', 'front-tile', 'front-greeting', 'front-customize', 'front-drift', 'front-garland', 'front-sick']),
  medium: Object.freeze(['calendar', 'shifts', 'meals', 'email', 'team', 'todo', 'guides', 'notebook']),
  hard: Object.freeze(['knowledge', 'links', 'improvements', 'profile-menu', 'command-palette', 'calendar-approved', 'shifts-tasks', 'front-bottom']),
})
const BANDS = [SPOTS.easy, SPOTS.medium, SPOTS.hard]

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
})
const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
const pad = value => String(value).padStart(2, '0')

/** The date and time in Denmark at `ms`; "today" and 10:00 are Danish for everyone, also colleagues in Finland. */
function danishParts(ms) {
  const parts = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map(part => [part.type, part.value]))
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day)
  return { year, month, day, weekday: WEEKDAYS[parts.weekday], hour: Number(parts.hour), minute: Number(parts.minute), date: `${year}-${pad(month)}-${pad(day)}` }
}

/** Monday–Friday from 1 to 24 December. */
function nisseDays(year) {
  const days = []
  for (let day = 1; day <= 24; day++) {
    const weekday = new Date(Date.UTC(year, 11, day)).getUTCDay()
    if (weekday !== 0 && weekday !== 6) days.push(`${year}-12-${pad(day)}`)
  }
  return days
}

/** Epoch ms of 10:00 Danish time on `date` (handles summer and winter time). */
function startsAt(date) {
  const [year, month, day] = date.split('-').map(Number)
  let guess = Date.UTC(year, month - 1, day, 10)
  for (let i = 0; i < 2; i++) {
    const parts = danishParts(guess)
    const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    guess += Date.UTC(year, month - 1, day, 10) - shown
  }
  return guess
}

function shuffled(seed) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const order = [0, 1, 2, 3, 4, 5, 6, 7]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/**
 * Where the nisse hides in hub number `teamIndex` (hubs sorted by teamId) on `date`, or null if it is no nisse day.
 * Days are split into easy, medium and hard thirds. Within a band each hub walks the same shuffled order shifted by its
 * index, so a hub never repeats a place and two hubs (up to eight) never share one on the same day.
 */
function spotFor(date, teamIndex) {
  const year = Number(date.slice(0, 4))
  const days = nisseDays(year)
  const index = days.indexOf(date)
  if (index < 0 || !Number.isInteger(teamIndex) || teamIndex < 0) return null
  const band = Math.floor((index * 3) / days.length)
  const bandStart = Math.ceil((band * days.length) / 3)
  const order = shuffled(year * 31 + band * 7919)
  return BANDS[band][(order[index - bandStart] + teamIndex) % 8]
}

// ---- The judge ---------------------------------------------------------------------------------------------------

const RETRIES = 12

function fail(code, message) {
  const error = new Error(`${code}: ${message}`)
  error.code = code
  throw error
}

const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const findsKey = year => `nisse-finds-${year}`

function readFinds(value) {
  if (value === undefined || value === null) return { finds: [] }
  if (typeof value !== 'object' || !Array.isArray(value.finds)) fail('NISSE_INVALID_DATA', 'Invalid shared nisse finds')
  return { finds: value.finds.filter(find => find && typeof find === 'object' && typeof find.teamId === 'string' && isDate(find.date)) }
}

const publicFinder = find => ({ name: find.name, email: find.email, at: find.at })

/**
 * Decides who found today's nisse first. Finds live in the shared store under `nisse-finds-<year>`; the first find of a
 * hub on a day wins, settled with compareAndSet. 10:00 is checked against the shared drive's clock (`driveNow`).
 */
function createNisseService({ getStore, getDirectory, listTeams, now = Date.now, driveNow, onChanged } = {}) {
  if (typeof getStore !== 'function' || typeof getDirectory !== 'function' || typeof listTeams !== 'function' ||
    typeof now !== 'function' || typeof driveNow !== 'function' || (onChanged !== undefined && typeof onChanged !== 'function')) {
    throw new TypeError('Invalid nisse service dependencies')
  }

  const isCreator = actor => actor?.homeRole === 'creator'

  async function teamIndexOf(actor) {
    const teamId = actor?.activeTeam?.teamId
    if (typeof teamId !== 'string') return -1
    const teams = [...(await listTeams())].sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0))
    return teams.findIndex(team => team.teamId === teamId)
  }

  async function readYear(year) {
    return readFinds(await (await getStore()).getAsync(findsKey(year), { skipCache: true }))
  }

  async function today(actor, preview) {
    const usePreview = isCreator(actor) && isDate(preview)
    const date = usePreview ? preview : danishParts(now()).date
    // Outside the nisse days nothing is read: no trace on the shared drive before December.
    if (!nisseDays(Number(date.slice(0, 4))).includes(date)) return { status: 'off' }
    const index = await teamIndexOf(actor)
    if (index < 0) return { status: 'off' }
    if (!usePreview && now() < startsAt(date)) return { status: 'waiting', date, startsAt: startsAt(date) }
    const found = (await readYear(date.slice(0, 4))).finds.find(find => find.teamId === actor.activeTeam.teamId && find.date === date)
    return found ? { status: 'found', date, finder: publicFinder(found) } : { status: 'hiding', date, spot: spotFor(date, index) }
  }

  async function nameOf(email) {
    try {
      const person = (await getDirectory())?.people?.find(item => String(item.email).toLowerCase() === email)
      if (person?.fullName) return String(person.fullName)
    } catch { /* the name is a courtesy; the find still counts */ }
    return email
  }

  async function claim(actor, input) {
    if (!input || typeof input !== 'object' || !isDate(input.date) || typeof input.spot !== 'string') fail('NISSE_INVALID', 'Invalid claim')
    const index = await teamIndexOf(actor)
    if (index < 0) fail('NISSE_NO_HUB', 'No active hub')
    if (isCreator(actor) && isDate(input.preview)) {
      if (input.spot !== spotFor(input.preview, index)) fail('NISSE_WRONG_SPOT', 'The nisse is not there')
      return { result: 'preview' }
    }
    const driveMs = await driveNow()
    const { date } = danishParts(driveMs)
    if (input.date !== date || !nisseDays(Number(date.slice(0, 4))).includes(date)) fail('NISSE_NOT_TODAY', 'Not today\'s nisse')
    if (input.spot !== spotFor(date, index)) fail('NISSE_WRONG_SPOT', 'The nisse is not there')
    if (driveMs < startsAt(date)) fail('NISSE_TOO_EARLY', 'The nisse hunt starts at 10:00')

    const email = String(actor.email).trim().toLowerCase()
    const teamId = actor.activeTeam.teamId
    const store = await getStore()
    const key = findsKey(date.slice(0, 4))
    // Read the name before the loop: the window between read and write must stay short at 10:00, when several hubs
    // write the same key. A conflict always means someone else wrote, so keep trying until this hub's find exists.
    const name = await nameOf(email)
    for (let attempt = 0; ; attempt++) {
      const actual = await store.getAsync(key, { skipCache: true })
      const data = readFinds(actual)
      const existing = data.finds.find(find => find.teamId === teamId && find.date === date)
      if (existing) return { result: 'taken', finder: publicFinder(existing) }
      const at = new Date(driveMs).toISOString()
      const next = { finds: [...data.finds, { teamId, teamName: String(actor.activeTeam.name || teamId), date, email, name, at }] }
      try {
        await store.updateAsync(key, { op: 'compareAndSet', expected: actual, value: next })
      } catch (error) {
        if (error?.code === 'KV_CONFLICT' && attempt < RETRIES - 1) continue
        if (error?.code === 'KV_CONFLICT') fail('NISSE_CONFLICT', 'The finds changed while saving')
        throw error
      }
      onChanged?.()
      return { result: 'won', at }
    }
  }

  /** Every find this season, for the creator only (he hands out the chocolate). */
  async function finds(actor) {
    if (!isCreator(actor)) return []
    const { month, year, day } = danishParts(now())
    const season = month === 12 ? year : month === 1 && day <= 1 ? year - 1 : null
    if (season === null) return []
    return (await readYear(season)).finds.slice().sort((a, b) => (a.at < b.at ? -1 : 1))
  }

  return { today, claim, finds }
}

/**
 * M:'s clock, not the PC's: rewriting one byte in place (cheap on M:) stamps the file with the drive's time. Only
 * asynchronous calls – a hanging drive must never freeze the app. Any failure falls back to this PC's clock.
 */
function createDriveClock({ fsp, file, fallback = Date.now }) {
  return async function driveNow() {
    try {
      const path = file()
      let handle
      try {
        handle = await fsp.open(path, 'r+')
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
        handle = await fsp.open(path, 'w')
      }
      try { await handle.write('n', 0) } finally { await handle.close() }
      return (await fsp.stat(path)).mtimeMs
    } catch (error) {
      console.warn('TCD Hub: nisse could not read the shared drive clock, using this PC', error?.message || error)
      return fallback()
    }
  }
}

module.exports = { SPOTS, createDriveClock, createNisseService, danishParts, nisseDays, spotFor, startsAt }
