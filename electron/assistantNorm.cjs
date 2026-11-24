// Emails and names are normalized thousands of times per question (every record is compared with the asker): short strings are cached.
const CACHE = new Map()
const LIMIT = 20000

function norm(value) {
  const text = typeof value === 'string' ? value : String(value || '')
  if (text.length > 200) return text.normalize('NFKC').trim().toLowerCase()
  let result = CACHE.get(text)
  if (result === undefined) {
    result = text.normalize('NFKC').trim().toLowerCase()
    if (CACHE.size >= LIMIT) CACHE.clear()
    CACHE.set(text, result)
  }
  return result
}

module.exports = { norm }
