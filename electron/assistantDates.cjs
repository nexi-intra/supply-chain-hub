// Calendar arithmetic belongs to the application, not to a language model.
const day = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
function isoWeek(number, year) {
  if (!Number.isInteger(number) || number < 1 || number > 53 || !Number.isInteger(year) || year < 1900 || year > 2200) return null
  const jan4 = new Date(year, 0, 4, 12)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - (jan4.getDay() + 6) % 7 + (number - 1) * 7)
  const thursday = new Date(monday); thursday.setDate(monday.getDate() + 3)
  if (thursday.getFullYear() !== year) return null
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  return { start: day(monday), end: day(sunday) }
}
function extraDates(question, now) {
  const q = String(question).toLowerCase()
  const week = q.match(/(?:uge|week|viik(?:ko|olla|on))\s*(\d{1,2})(?!\d)/u)
  const year = Number(q.match(/\b(19\d{2}|20\d{2}|21\d{2}|2200)\b/)?.[1] || now.getFullYear())
  if (week) return { matched: true, range: isoWeek(Number(week[1]), year) }
  if (/sidste uge|forrige uge|last week|viime viik/u.test(q)) {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7 - 7, 12)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    return { matched: true, range: { start: day(monday), end: day(sunday) } }
  }
  // A person's name can also be a month (e.g. Maj). Relative weeks take priority.
  if (/næste uge|denne uge|next week|this week|ensi viik|tällä viik/u.test(q)) return { matched: false, range: null }
  const months = [['januar', 'january', 'tammi'], ['februar', 'february', 'helmi'], ['marts', 'march', 'maalis'], ['april', 'april', 'huhti'], ['maj', 'may', 'touko'], ['juni', 'june', 'kesä'], ['juli', 'july', 'heinä'], ['august', 'august', 'elo'], ['september', 'september', 'syys'], ['oktober', 'october', 'loka'], ['november', 'november', 'marras'], ['december', 'december', 'joulu']]
  let month = months.findIndex(names => names.some(name => new RegExp(`(?:^|[^\\p{L}])${name}(?:kuu[^\\s]*)?(?=$|[^\\p{L}])`, 'u').test(q)))
  let monthYear = year
  if (/denne måned|this month|tässä kuussa/u.test(q)) month = now.getMonth()
  if (/næste måned|next month|ensi kuussa/u.test(q)) { const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12); month = next.getMonth(); monthYear = next.getFullYear() }
  if (/sidste måned|last month|viime kuussa/u.test(q)) { const last = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12); month = last.getMonth(); monthYear = last.getFullYear() }
  if (month >= 0) return { matched: true, range: { start: day(new Date(monthYear, month, 1, 12)), end: day(new Date(monthYear, month + 1, 0, 12)) } }
  if (/hele året|this year|i år|tänä vuonna/u.test(q)) return { matched: true, range: { start: `${year}-01-01`, end: `${year}-12-31` } }
  return { matched: false, range: null }
}
module.exports = { isoWeek, extraDates }
