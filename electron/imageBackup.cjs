// Image blobs (file_*_meta / file_*_chunk_*) never change - a new upload gets a new fileId. Copying all of them into
// the daily full backup took 401 s on M: (07.11: 523 of 652 keys, 39.9 of 40.4 MB) and held up the drive for
// everyone. Instead each blob is copied ONCE, as the stored (encrypted) file, into Backup/billeder/; the daily backup
// then leaves out exactly the blobs that already have a copy here, so every image is always in at least one backup.
// Restore: copy the file from Backup/billeder/ back into the hub folder under the same name.
const fsp = require('node:fs/promises')
const path = require('node:path')
const { keyToFilename } = require('./store.cjs')

const IMAGE_BACKUP_DIR = 'billeder'
// When a blob has gone from the hub, keyed by file name. Lives beside the folder so the folder holds only copies.
const DELETED_INDEX = 'billeder-fjernet.index'
const DAY_MS = 24 * 60 * 60 * 1000
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
// Straight from the hub folder: the offline layer's key list can come from the local mirror, which has no blobs -
// and then every image would look deleted.
const listKeys = async dataDir => (await fsp.readdir(dataDir)).filter(name => name.endsWith('.json')).map(name => decodeURIComponent(name.slice(0, -'.json'.length)))

/**
 * Copies blobs that have no copy yet (within `budgetMs`, so the first ~500 are spread over several runs), and
 * removes the copy of a blob that has been gone from the hub for `keepDays` - like the daily backups are rotated.
 * @returns {Promise<{ backedUp: Set<string>, copied: number, pruned: number }>} backedUp: keys in the hub with a copy.
 */
async function backupImmutableBlobs({ dataDir, backupDir, keys, isImmutableBlobKey, today, keepDays = 14, budgetMs = 3 * 60 * 1000, now = Date.now }) {
  const dir = path.join(backupDir, IMAGE_BACKUP_DIR)
  await fsp.mkdir(dir, { recursive: true })
  const names = await fsp.readdir(dir)
  // A copy cut off half-way is only ever a .tmp file; the real name appears with the rename.
  await Promise.all(names.filter(name => name.endsWith('.tmp')).map(name => fsp.unlink(path.join(dir, name)).catch(() => {})))
  const copies = new Set(names.filter(name => name.endsWith('.json')))

  const blobs = (keys || await listKeys(dataDir)).filter(isImmutableBlobKey)
  const inHub = new Set(blobs.map(keyToFilename))
  const backedUp = new Set(blobs.filter(key => copies.has(keyToFilename(key))))
  let copied = 0
  const startedAt = now()
  for (const key of blobs) {
    if (backedUp.has(key)) continue
    if (now() - startedAt >= budgetMs) break
    const name = keyToFilename(key)
    const tmp = path.join(dir, `${name}.${process.pid}.tmp`)
    try {
      await fsp.copyFile(path.join(dataDir, name), tmp)
      await fsp.rename(tmp, path.join(dir, name))
    } catch (error) {
      await fsp.unlink(tmp).catch(() => {})
      if (error.code === 'ENOENT') continue // Deleted since the listing.
      // Stop here: blobs without a copy simply stay in the daily backup.
      console.warn('TCD Hub: billed-backup stoppede:', error.message)
      break
    }
    backedUp.add(key)
    copied++
  }

  const indexPath = path.join(backupDir, DELETED_INDEX)
  let index = {}
  try { index = JSON.parse(await fsp.readFile(indexPath, 'utf8')) || {} } catch { /* none yet */ }
  const stillKept = {}
  let pruned = 0
  for (const name of copies) {
    if (inHub.has(name)) continue
    const goneSince = typeof index[name] === 'string' ? index[name] : today
    if (daysBetween(goneSince, today) >= keepDays) {
      await fsp.unlink(path.join(dir, name)).catch(() => {})
      pruned++
    } else {
      stillKept[name] = goneSince
    }
  }
  if (JSON.stringify(stillKept) !== JSON.stringify(index)) {
    if (Object.keys(stillKept).length === 0) await fsp.unlink(indexPath).catch(() => {})
    else {
      const tmp = `${indexPath}.${process.pid}.tmp`
      await fsp.writeFile(tmp, JSON.stringify(stillKept))
      await fsp.rename(tmp, indexPath)
    }
  }
  return { backedUp, copied, pruned }
}

module.exports = { backupImmutableBlobs, IMAGE_BACKUP_DIR }
