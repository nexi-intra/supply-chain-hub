// Redder scorer der gik tabt, fordi en skrivning blev afbrudt efter at
// temp-filen var skrevet, men før den blev omdøbt på plads — og rydder de
// efterladte temp-filer op.
//
// Kør uden argumenter for kun at se hvad der ville ske:
//   node scripts/recover-arcade-scores.cjs
// Kør med --apply for rent faktisk at skrive:
//   node scripts/recover-arcade-scores.cjs --apply
const fs = require('fs')
const path = require('path')
const { createStore, parseFileContents } = require('../electron/store.cjs')

const apply = process.argv.includes('--apply')
const dataDir = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'supply-chan-hub.config'), 'utf8')).dataDir
const STALE_TMP_MS = 60 * 60 * 1000

const LEADERBOARD_SUFFIX = '-global-leaderboard.json'
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert']

function readMaybe(file) {
  try {
    return parseFileContents(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

let recovered = 0
let removed = 0

for (const team of fs.readdirSync(dataDir, { withFileTypes: true })) {
  if (!team.isDirectory()) continue
  const teamDir = path.join(dataDir, team.name)
  const temps = fs.readdirSync(teamDir).filter((name) => name.endsWith('.tmp'))
  if (temps.length === 0) continue

  const store = createStore(teamDir)

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

console.log(`\n${apply ? 'Udfoert' : 'Proevekoersel'}: ${recovered} score(r) genskabt, ${removed} efterladt(e) temp-fil(er) ryddet.`)
if (!apply) console.log('Koer med --apply for at gennemfoere.')
