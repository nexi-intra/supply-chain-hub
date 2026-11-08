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

module.exports = { SPOTS, danishParts, nisseDays, spotFor, startsAt }
