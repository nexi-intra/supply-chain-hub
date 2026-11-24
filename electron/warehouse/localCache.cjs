// Local copies of what is needed to keep counting when M: is unreachable: the count's meta data,
// SAP snapshot, placements and members. Encrypted like the shared storage, written atomically.
const fs = require('node:fs')
const path = require('node:path')
const { encryptPayload, parseFileContents } = require('../store.cjs')

const SAFE = /^[A-Za-z0-9-]{1,64}$/

function createLocalCache(dir) {
  function file(team, id, part) {
    if (![team, id, part].every(value => SAFE.test(String(value)))) throw new Error('CACHE_INVALID_KEY')
    return path.join(dir, team, `${id}-${part}.json`)
  }

  async function save(team, id, part, value) {
    const target = file(team, id, part)
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    const temp = `${target}.${process.pid}.tmp`
    await fs.promises.writeFile(temp, encryptPayload(JSON.stringify(value)))
    await fs.promises.rename(temp, target)
  }

  async function load(team, id, part) {
    try {
      return parseFileContents(await fs.promises.readFile(file(team, id, part), 'utf8'))
    } catch {
      return undefined
    }
  }

  async function remove(team, id) {
    file(team, id, 'x')
    let names
    try { names = await fs.promises.readdir(path.join(dir, team)) } catch { return }
    for (const name of names.filter(item => item.startsWith(`${id}-`))) await fs.promises.rm(path.join(dir, team, name), { force: true })
  }

  return { save, load, remove }
}

module.exports = { createLocalCache }
