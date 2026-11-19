// Danske arbejdsdage (weekender + helligdage); spejler src/lib/dateUtils.ts og src/lib/absence.ts.
const pad = value => String(value).padStart(2, '0')
const fromParts = (year, month, day) => new Date(year, month - 1, day)
const toIso = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parseIso = value => { const [year, month, day] = String(value).slice(0, 10).split('-').map(Number); return fromParts(year, month || 1, day || 1) }

function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  return fromParts(year, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1)
}

const cache = new Map()
function holidaysOf(year) {
  if (cache.has(year)) return cache.get(year)
  const easter = easterSunday(year)
  const offset = days => { const d = new Date(easter); d.setDate(d.getDate() + days); return toIso(d) }
  const set = new Set([`${year}-01-01`, offset(-3), offset(-2), offset(0), offset(1), offset(39), offset(49), offset(50), `${year}-06-05`, `${year}-12-24`, `${year}-12-25`, `${year}-12-26`, `${year}-12-31`])
  cache.set(year, set)
  return set
}

const isDanishHoliday = iso => holidaysOf(Number(String(iso).slice(0, 4))).has(String(iso).slice(0, 10))
function isWorkingDay(iso) {
  const day = parseIso(iso).getDay()
  return day !== 0 && day !== 6 && !isDanishHoliday(iso)
}

/** Foerste arbejdsdag strengt efter `iso`. */
function nextWorkingDay(iso) {
  const date = parseIso(iso)
  do date.setDate(date.getDate() + 1); while (!isWorkingDay(toIso(date)))
  return toIso(date)
}

/** Slutdato for den sammenhaengende periode der starter i `endIso`: perioder der overlapper eller grænser op (over weekend/helligdag) slaas sammen. */
function runEnd(periods, endIso) {
  let end = endIso
  for (;;) {
    const back = nextWorkingDay(end)
    const next = periods.filter(period => period.start <= back && period.end > end)
    if (!next.length) return end
    for (const period of next) if (period.end > end) end = period.end
  }
}

module.exports = { isDanishHoliday, isWorkingDay, nextWorkingDay, runEnd }
