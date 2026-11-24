// What SAP did to a count's PI documents, kept on this PC until M: has it. An entry is written right after a script
// answers and removed once its write to M: landed, so a drive that fails after SAP changed never loses the result.
// Encrypted like the shared storage (one file per entry, written atomically). Without a folder it keeps nothing.
const fs = require('node:fs')
const path = require('node:path')
const { encryptPayload, parseFileContents } = require('../store.cjs')

function createPiDocJournal(dir) {
  const file = name => path.join(dir, `${name}.json`)
  // Entries an action of this process is still writing to M:; a merge leaves them alone until they are released.
  const held = new Set()
  let sequence = 0
  return {
    /** A name that sorts in the order the entries were made. */
    nameFor: prefix => `${prefix}-${String(Date.now()).padStart(15, '0')}-${process.pid}-${String(++sequence).padStart(6, '0')}`,
    hold: name => { held.add(name) },
    release: name => { held.delete(name) },
    async put(name, entry) {
      if (!dir) return
      try {
        await fs.promises.mkdir(dir, { recursive: true })
        await fs.promises.writeFile(`${file(name)}.tmp`, encryptPayload(JSON.stringify(entry)), 'utf8')
        await fs.promises.rename(`${file(name)}.tmp`, file(name))
      } catch (error) {
        console.error('CountPoint: PI document journal not written', name, error?.code || error?.message)
      }
    },
    async remove(name) {
      held.delete(name)
      if (dir) await fs.promises.rm(file(name), { force: true }).catch(() => {})
    },
    async list() {
      if (!dir) return []
      const names = (await fs.promises.readdir(dir).catch(() => [])).filter(name => name.endsWith('.json')).sort()
      const entries = []
      for (const name of names) {
        if (held.has(name.slice(0, -'.json'.length))) continue
        try {
          entries.push({ name: name.slice(0, -'.json'.length), entry: parseFileContents(await fs.promises.readFile(path.join(dir, name), 'utf8')) })
        } catch { /* unreadable: left for a person to look at */ }
      }
      return entries
    },
  }
}

module.exports = { createPiDocJournal }
