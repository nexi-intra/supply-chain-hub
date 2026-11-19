// Opens two dev windows (Anna and Bo) on a local sandbox so Multiplayer can be played against yourself
// without writing test games to the shared M: drive.
//   node scripts/multiplayer-sandbox.cjs [viteUrl]        (default http://127.0.0.1:5021)
//   node scripts/multiplayer-sandbox.cjs --reset          (wipe the sandbox first)
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const PASSWORD = 'sandbox123'
const PLAYERS = [
  { email: 'anna@sandbox.test', fullName: 'Anna Andersen', team: 'OPS', teamId: 'ops' },
  { email: 'bo@sandbox.test', fullName: 'Bo Bertelsen', team: 'SUP', teamId: 'sup' },
]
const CREATOR = { email: 'creator@sandbox.test', fullName: 'Sandbox Creator', team: 'OPS', teamId: 'ops' }

const args = process.argv.slice(2)
const url = args.find(arg => /^https?:\/\//.test(arg)) || 'http://127.0.0.1:5021'
const base = path.join(process.env.LOCALAPPDATA || require('node:os').tmpdir(), 'SupplyChainHub', 'multiplayer-sandbox')
const root = path.join(base, 'data')

if (args.includes('--reset')) fs.rmSync(base, { recursive: true, force: true })

if (!fs.existsSync(path.join(root, 'OPS'))) {
  fs.mkdirSync(root, { recursive: true })
  const now = new Date().toISOString()
  registry.writeTeams(root, {
    ops: { name: 'Sandbox Operations', folderName: 'OPS', createdAt: now },
    sup: { name: 'Sandbox Support', folderName: 'SUP', createdAt: now },
  })
  registry.writeUserDirectory(root, Object.fromEntries([...PLAYERS, CREATOR].map(person => [person.email, person.teamId])))
  registry.setCreatorEmail(root, CREATOR.email)
  const account = person => [person.email, { email: person.email, fullName: person.fullName, password: PASSWORD, status: 'approved', role: 'user' }]
  for (const team of ['OPS', 'SUP']) {
    const members = [...PLAYERS, CREATOR].filter(person => person.team === team)
    createStore(path.join(root, team)).set('users', Object.fromEntries(members.map(account)))
  }
}

const electron = path.resolve(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
for (const player of PLAYERS) {
  const profile = path.join(base, `profile-${player.team.toLowerCase()}`)
  fs.mkdirSync(profile, { recursive: true })
  const env = { ...process.env, ELECTRON_START_URL: url, TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete env.ELECTRON_RUN_AS_NODE
  spawn(electron, ['.'], { cwd: path.resolve(__dirname, '..'), env, detached: true, stdio: 'ignore' }).unref()
  console.log(`Window for ${player.fullName}: ${player.email} / ${PASSWORD}`)
}
console.log(`Sandbox data: ${root}`)
