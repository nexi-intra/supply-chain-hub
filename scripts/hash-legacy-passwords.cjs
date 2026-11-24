// One-off: finds accounts whose password is still stored in plain text (from before passwords were
// hashed - they are only upgraded at the next login) and hashes them in place.
// Dry run by default: prints only counts per team, never an address or a password.
// --apply hashes them (the person keeps the same password; an old remembered session ends).
//
//   node scripts\hash-legacy-passwords.cjs [--data <dir>] [--apply]
// <dir> defaults to TCD_HUB_DATA_DIR, then the dataDir in supply-chan-hub.config.
const fs = require('node:fs')
const path = require('node:path')
const { createStore } = require('../electron/store.cjs')
const { listTeams } = require('../electron/registry.cjs')
const { hashPassword } = require('../electron/authService.cjs')

const argument = name => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function dataDir() {
  const explicit = argument('data') || process.env.TCD_HUB_DATA_DIR
  if (explicit) return explicit
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'supply-chan-hub.config'), 'utf8'))
  if (!config.dataDir) throw new Error('No dataDir in supply-chan-hub.config')
  return config.dataDir
}

const isLegacy = user => typeof user?.password === 'string' && user.password && !user.password.startsWith('pbkdf2$')

async function main() {
  const apply = process.argv.includes('--apply')
  const root = dataDir()
  let total = 0
  for (const team of listTeams(root)) {
    const store = createStore(path.join(root, team.folderName))
    const users = store.get('users', { skipCache: true }) || {}
    const legacy = Object.keys(users).filter(key => isLegacy(users[key]))
    total += legacy.length
    console.log(`${team.folderName}: ${legacy.length} konto(er) med klartekst-adgangskode`)
    if (!apply || !legacy.length) continue
    // Hash outside the lock (slow), then swap in only if the stored value is still the same plain text.
    const hashed = Object.fromEntries(await Promise.all(legacy.map(async key => [key, { from: users[key].password, to: await hashPassword(users[key].password) }])))
    store.mutate('users', current => {
      const next = { ...(current || {}) }
      for (const [key, { from, to }] of Object.entries(hashed)) if (next[key]?.password === from) next[key] = { ...next[key], password: to }
      return next
    })
    console.log(`${team.folderName}: hashet`)
  }
  console.log(apply ? `Faerdig: ${total} konto(er) hashet.` : `Dry run: ${total} konto(er) ville blive hashet. Koer med --apply for at hashe dem.`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
