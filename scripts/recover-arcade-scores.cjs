// Vedligehold af spillenes highscores mod det delte drev:
//  - redder scorer der gik tabt, fordi en skrivning blev afbrudt efter at
//    temp-filen var skrevet, men før den blev omdøbt på plads
//  - rydder de efterladte temp-filer op
//  - fjerner Creator-kontoens scorer, som kun stammer fra afprøvning
//
// Kør uden argumenter for kun at se hvad der ville ske:
//   node scripts/recover-arcade-scores.cjs
// Kør med --apply for rent faktisk at skrive:
//   node scripts/recover-arcade-scores.cjs --apply
const fs = require('fs')
const path = require('path')
const { createStore, parseFileContents, keyToFilename } = require('../electron/store.cjs')

const apply = process.argv.includes('--apply')
const dataDir = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'supply-chan-hub.config'), 'utf8')).dataDir
const STALE_TMP_MS = 60 * 60 * 1000

const LEADERBOARD_SUFFIX = '-global-leaderboard.json'
const GAMES = ['brickbreak', 'neon-snake', 'nexi-flyer', 'endless-dodger', 'tetris']
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert']

function readCreatorEmail() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(dataDir, '_registry', 'platform-config.json'), 'utf8'))
    return String(config.creatorEmail || '').trim().toLowerCase() || null
  } catch {
    return null
  }
}

const creatorEmail = readCreatorEmail()
const isCreator = (email) => !!creatorEmail && String(email || '').trim().toLowerCase() === creatorEmail

function readMaybe(file) {
  try {
    return parseFileContents(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

let recovered = 0
let removed = 0
let creatorScores = 0

for (const team of fs.readdirSync(dataDir, { withFileTypes: true })) {
  if (!team.isDirectory() || team.name.startsWith('_')) continue
  const teamDir = path.join(dataDir, team.name)
  const store = createStore(teamDir)

  // Creator-kontoen afproever kun spillene, saa dens scorer hoerer ikke til paa listerne.
  if (creatorEmail) {
    for (const game of GAMES) {
      const key = `${game}-global-leaderboard`
      if (!fs.existsSync(path.join(teamDir, keyToFilename(key)))) continue
      const board = store.get(key, { skipCache: true })
      if (!board || typeof board !== 'object') continue

      if (Array.isArray(board)) {
        if (!board.some((entry) => entry && isCreator(entry.email))) continue
        console.log(`  FJERNER creator-score: ${team.name}/${key}`)
        creatorScores++
        if (apply) store.update(key, { op: 'remove', ids: board.filter((entry) => entry && isCreator(entry.email)).map((entry) => entry.id || entry.email) })
        continue
      }

      for (const difficulty of DIFFICULTIES) {
        const list = Array.isArray(board[difficulty]) ? board[difficulty] : []
        const doomed = list.filter((entry) => entry && isCreator(entry.email))
        if (doomed.length === 0) continue
        for (const entry of doomed) console.log(`  FJERNER creator-score: ${team.name}/${key} [${difficulty}] = ${entry.score}`)
        creatorScores += doomed.length
        if (apply) store.update(key, { op: 'remove', path: [difficulty], ids: doomed.map((entry) => entry.id || entry.email) })
      }
    }

    // Samme for spil-statistikken, hvor creator ellers stod som en rå email.
    for (const game of GAMES) {
      const key = `${game}-play-counts`
      if (!fs.existsSync(path.join(teamDir, keyToFilename(key)))) continue
      const counts = store.get(key, { skipCache: true })
      if (!counts || typeof counts !== 'object' || Array.isArray(counts)) continue
      const field = Object.keys(counts).find((email) => isCreator(email))
      if (!field) continue
      console.log(`  FJERNER creator fra statistik: ${team.name}/${key}`)
      creatorScores++
      if (apply) store.update(key, { op: 'deleteField', field })
    }
  }

  const temps = fs.readdirSync(teamDir).filter((name) => name.endsWith('.tmp'))
  if (temps.length === 0) continue

  for (const tempName of temps) {
    const tempPath = path.join(teamDir, tempName)
    const age = Date.now() - fs.statSync(tempPath).mtimeMs
    if (age < STALE_TMP_MS) {
      console.log(`  springer over (for ny, kan vaere en igangvaerende skrivning): ${team.name}/${tempName}`)
      continue
    }

    const targetName = tempName.slice(0, tempName.indexOf('.json.') + '.json'.length)
    if (targetName.endsWith(LEADERBOARD_SUFFIX)) {
      const key = targetName.slice(0, -'.json'.length)
      const abandoned = readMaybe(tempPath)
      const live = store.get(key, { skipCache: true })

      if (abandoned && typeof abandoned === 'object' && !Array.isArray(abandoned)) {
        for (const difficulty of DIFFICULTIES) {
          const lost = Array.isArray(abandoned[difficulty]) ? abandoned[difficulty] : []
          const current = live && Array.isArray(live[difficulty]) ? live[difficulty] : []
          for (const entry of lost) {
            if (!entry || typeof entry.email !== 'string' || typeof entry.score !== 'number') continue
            if (isCreator(entry.email)) continue
            const existing = current.find((item) => item && item.email === entry.email)
            if (existing && existing.score >= entry.score) continue
            console.log(`  GENSKABER ${team.name}/${key} [${difficulty}] ${entry.email} = ${entry.score}${existing ? ` (havde ${existing.score})` : ' (manglede helt)'}`)
            recovered++
            if (apply) {
              store.update(key, {
                op: 'upsert',
                path: [difficulty],
                items: [{ ...entry, id: entry.id || entry.email }],
              })
            }
          }
        }
      }
    }

    console.log(`  rydder efterladt temp-fil: ${team.name}/${tempName}`)
    removed++
    if (apply) fs.unlinkSync(tempPath)
  }
}

console.log(`\n${apply ? 'Udfoert' : 'Proevekoersel'}: ${recovered} score(r) genskabt, ${creatorScores} creator-score(r) fjernet, ${removed} efterladt(e) temp-fil(er) ryddet.`)
if (!apply) console.log('Koer med --apply for at gennemfoere.')
