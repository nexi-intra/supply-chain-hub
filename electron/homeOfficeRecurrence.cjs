function matchesHomeOfficePattern(pattern, date) {
  const weekday = date.getDay()
  if (!pattern?.weekdays?.includes(weekday)) return false
  const repeat = pattern.repeat?.[weekday]
  if (!repeat) return true
  if (!Number.isInteger(repeat.intervalWeeks) || repeat.intervalWeeks < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(repeat.startDate)) return false
  const first = new Date(`${repeat.startDate}T12:00:00`)
  if (Number.isNaN(first.getTime()) || first.getDay() !== weekday ||
      `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}` !== repeat.startDate) return false
  const monday = value => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate() - (value.getDay() + 6) % 7)
  const weeksElapsed = Math.round((monday(date) - monday(first)) / (7 * 86400000))
  return weeksElapsed >= 0 && weeksElapsed % repeat.intervalWeeks === 0
}

module.exports = { matchesHomeOfficePattern }