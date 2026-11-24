// A period chosen on screen, `YYYY-MM-DD` to `YYYY-MM-DD`, read as the month files it touches. Stempelkort and
// Softwareload both keep one file per person per month and allow at most a year at a time.
const RANGE_MAX_DAYS = 370
const DATE = /^\d{4}-\d{2}-\d{2}$/

const pad = number => String(number).padStart(2, '0')

/** The months `YYYY-MM` from `from` to `to`; a bad or too long period throws with the caller's error code. */
function monthsBetween(from, to, code) {
  const invalid = message => Object.assign(new Error(message), { code })
  if (!DATE.test(String(from)) || !DATE.test(String(to)) || from > to) throw invalid('Ugyldig periode')
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  if (!Number.isFinite(days) || days > RANGE_MAX_DAYS) throw invalid('Vælg højst et år ad gangen')
  const months = []
  for (let [year, month] = from.split('-').map(Number); `${year}-${pad(month)}` <= to.slice(0, 7); month === 12 ? (year++, month = 1) : month++) months.push(`${year}-${pad(month)}`)
  return months
}

module.exports = { monthsBetween }
