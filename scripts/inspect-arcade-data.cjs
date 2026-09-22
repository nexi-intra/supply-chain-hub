// Læser de RIGTIGE arcade-nøgler fra det delte drev og rapporterer den faktiske
// form pr. team, så vi kan se præcis hvilke data der får spillene til at crashe.
const fs = require('fs')
const path = require('path')
const { parseFileContents, keyToFilename } = require('../electron/store.cjs')

const dataDir = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'supply-chan-hub.config'), 'utf8')).dataDir

const GAMES = [
  { name: 'brickbreak', board: 'brickbreak-global-leaderboard', counts: 'brickbreak-play-counts', shape: 'nested' },
  { name: 'neon-snake', board: 'neon-snake-global-leaderboard', counts: 'neon-snake-play-counts', shape: 'nested' },
  { name: 'nexi-flyer', board: 'nexi-flyer-global-leaderboard', counts: 'nexi-flyer-play-counts', shape: 'nested' },
  { name: 'endless-dodger', board: 'endless-dodger-global-leaderboard', counts: 'endless-dodger-play-counts', shape: 'nested' },
  { name: 'tetris', board: 'tetris-global-leaderboard', counts: 'tetris-play-counts', shape: 'flat' },
  { name: 'cube-basher', board: 'cube-basher-global-leaderboard', counts: 'cube-basher-play-counts', shape: '?' },
  { name: 'librarian2', board: 'librarian2-global-leaderboard', counts: 'librarian2-play-counts', shape: '?' },
]

function describe(value) {
  if (value === undefined) return 'MANGLER'
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${value.length})`
  if (typeof value !== 'object') return typeof value
  return `objekt{${Object.keys(value).map(k => `${k}:${Array.isArray(value[k]) ? `array(${value[k].length})` : describe(value[k])}`).join(', ')}}`
}

function read(teamDir, key) {
  const file = path.join(teamDir, keyToFilename(key))
  if (!fs.existsSync(file)) return undefined
  try {
    return parseFileContents(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    return { __READ_ERROR__: String(error) }
  }
}

const teams = fs.readdirSync(dataDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('_') && !['ai-model', 'Backup', 'translation-models', 'updates'].includes(entry.name))
  .map(entry => entry.name)

const problems = []

for (const team of teams) {
  const teamDir = path.join(dataDir, team)
  console.log(`\n===== ${team} =====`)
  for (const game of GAMES) {
    const board = read(teamDir, game.board)
    const counts = read(teamDir, game.counts)
    if (board === undefined && counts === undefined) continue
    console.log(`  ${game.name}`)
    console.log(`    board  (${game.shape}): ${describe(board)}`)
    console.log(`    counts          : ${describe(counts)}`)

    if (board !== undefined && board !== null) {
      if (game.shape === 'nested') {
        if (Array.isArray(board)) {
          problems.push(`${team}/${game.name}: board er FLAD array, men koden forventer objekt pr. svaerhedsgrad -> crash i migrerings-effekten`)
        } else if (typeof board === 'object') {
          for (const [k, v] of Object.entries(board)) {
            if (!Array.isArray(v)) problems.push(`${team}/${game.name}: board.${k} er ${describe(v)}, ikke et array -> board.some() crasher`)
          }
        } else {
          problems.push(`${team}/${game.name}: board er ${typeof board}`)
        }
      } else if (game.shape === 'flat' && !Array.isArray(board) && typeof board === 'object') {
        console.log('    (flad forventet, fandt objekt - haandteres af migrateLeaderboard)')
      }
      const lists = Array.isArray(board) ? [board] : Object.values(board).filter(Array.isArray)
      for (const list of lists) {
        for (const entry of list) {
          if (!entry || typeof entry !== 'object') { problems.push(`${team}/${game.name}: entry er ${describe(entry)}`); continue }
          if (!entry.id) problems.push(`${team}/${game.name}: entry uden id (${entry.email})`)
          if (typeof entry.score !== 'number' || !Number.isFinite(entry.score)) problems.push(`${team}/${game.name}: ${entry.email} har score=${JSON.stringify(entry.score)}`)
        }
      }
    }

    if (counts && typeof counts === 'object' && !Array.isArray(counts)) {
      for (const [email, value] of Object.entries(counts)) {
        if (!value || typeof value !== 'object') problems.push(`${team}/${game.name}: play-count for ${email} er ${describe(value)}`)
      }
    } else if (Array.isArray(counts)) {
      problems.push(`${team}/${game.name}: play-counts er et array, men laeses som opslagsobjekt`)
    }
  }
}

console.log('\n\n===== PROBLEMER =====')
if (problems.length === 0) console.log('ingen fundet')
else problems.forEach(p => console.log('  - ' + p))
