// One-off: fills the Word-Puzzle "Top 10 words" from games played before the list existed.
// Reads every Word-Puzzle game file under <data>/_shared/multiplayer, one at a time, and merges the best moves
// with the list already in the shared index. Dry run by default; --apply writes the list (compare-and-set).
// Safe to run again (entries are keyed by game and move), e.g. after 1.6.1 clients played more words.
//
//   node scripts\backfill-top-words.cjs [--data <dir>] [--apply]
// <dir> defaults to TCD_HUB_DATA_DIR, then the dataDir in supply-chan-hub.config.
const fs = require('node:fs')
const path = require('node:path')
const { createStore } = require('../electron/store.cjs')
const { topWordsFromMoves, mergeTopWords } = require('../electron/games/wordPuzzle/topWords.cjs')

const INDEX_KEY = 'multiplayer-index'
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

async function main() {
  const apply = process.argv.includes('--apply')
  const shared = path.join(dataDir(), '_shared')
  const indexStore = createStore(shared)
  const gameStore = createStore(path.join(shared, 'multiplayer'))
  const index = await indexStore.getAsync(INDEX_KEY, { skipCache: true })
  if (!index || !Array.isArray(index.games)) throw new Error(`No multiplayer index in ${shared}`)
  // The index holds the current e-mail of each player; a game file keeps the e-mail from when it started.
  const playersById = new Map(index.games.map(entry => [entry.id, entry.players]))

  const found = []
  let games = 0
  for (const key of (await gameStore.keysAsync()).filter(item => item.startsWith('game-'))) {
    const game = await gameStore.getAsync(key, { skipCache: true })
    if (!game || game.type === 'chess' || !Array.isArray(game.moves)) continue
    games++
    found.push(...topWordsFromMoves(game, playersById.get(game.id) || game.players || []))
  }
  const proposed = mergeTopWords(index.topWords, found)
  const names = new Map(index.games.flatMap(entry => entry.players.map(player => [player.email, player.name])))
  console.log(`Word-Puzzle games read: ${games}; scored moves found: ${found.length}`)
  proposed.forEach((entry, rank) => console.log(`${String(rank + 1).padStart(2)}. ${entry.word.padEnd(15)} ${String(entry.score).padStart(4)}  ${entry.language}  ${names.get(entry.email) || entry.email}  ${entry.at.slice(0, 10)}`))

  if (!apply) { console.log('Dry run: nothing written. Run again with --apply to save this list.'); return }
  for (let attempt = 0; attempt < 5; attempt++) {
    const actual = await indexStore.getAsync(INDEX_KEY, { skipCache: true })
    try {
      await indexStore.updateAsync(INDEX_KEY, { op: 'compareAndSet', expected: actual, value: { ...actual, topWords: mergeTopWords(actual.topWords, found) } })
      console.log('Saved the Top 10 to the shared multiplayer index.')
      return
    } catch (error) {
      if (error.code !== 'KV_CONFLICT') throw error
    }
  }
  throw new Error('The index kept changing; nothing was written. Try again.')
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
