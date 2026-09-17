// Read-only, bounded in-memory guide cache. Metadata is checked before reuse;
// authentication/permissions are deliberately never cached between requests.
const fs = require('node:fs')
const { parseFileContents } = require('./store.cjs')

function createReadCache({ io = fs, decode = parseFileContents, maxBytes = 32 * 1024 ** 2, maxFileBytes = 64 * 1024 ** 2, maxEntries = 128 } = {}) {
  const entries = new Map()
  let bytes = 0
  const stats = { reads: 0, hits: 0 }
  function remove(file) { const entry = entries.get(file); if (entry) bytes -= entry.bytes; entries.delete(file) }
  function stamp(stat) { return [stat.mtimeNs ?? stat.mtimeMs, stat.ctimeNs ?? stat.ctimeMs, stat.size, stat.ino].join(':') }
  function get(file, reusable = false) {
    // Stores are replaced atomically. Non-cacheable authority/data records need
    // one fresh read, not a metadata/read/metadata round trip across SMB.
    if (!reusable) {
      let raw
      try { raw = io.readFileSync(file, 'utf8') } catch (error) {
        if (error.code === 'ENOENT') return undefined
        throw error
      }
      stats.reads++
      if (Buffer.byteLength(raw, 'utf8') > maxFileBytes) throw new Error('Datafilen er for stor til chatbotten')
      return decode(raw)
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      let before
      try { before = io.statSync(file, { bigint: true }) } catch (error) {
        remove(file)
        if (error.code === 'ENOENT') return undefined
        throw error // No stale fallback when access cannot be confirmed.
      }
      if (!before.isFile() || Number(before.size) > maxFileBytes) { remove(file); throw new Error('Datafilen er ugyldig eller for stor til chatbotten') }
      const cached = reusable && entries.get(file)
      if (cached && cached.stamp === stamp(before)) {
        stats.hits++
        entries.delete(file); entries.set(file, cached) // LRU
        return cached.value
      }
      remove(file)
      const raw = io.readFileSync(file, 'utf8')
      stats.reads++
      const after = io.statSync(file, { bigint: true })
      if (stamp(before) !== stamp(after)) continue // Atomic replace during read.
      const value = decode(raw)
      const cost = Number(after.size) * 2
      if (reusable && cost <= maxBytes) {
        while (entries.size && (bytes + cost > maxBytes || entries.size >= maxEntries)) remove(entries.keys().next().value)
        entries.set(file, { stamp: stamp(after), value, bytes: cost }); bytes += cost
      }
      return value
    }
    throw new Error('Data blev ændret under opslaget. Prøv igen.')
  }
  function invalidate(keys) {
    for (const file of entries.keys()) if (keys.some(key => file.endsWith(`${require('node:path').sep}${encodeURIComponent(key)}.json`))) remove(file)
  }
  return { get, invalidate, clear: () => { entries.clear(); bytes = 0 }, stats: () => ({ ...stats, entries: entries.size, bytes }) }
}
module.exports = { createReadCache }
