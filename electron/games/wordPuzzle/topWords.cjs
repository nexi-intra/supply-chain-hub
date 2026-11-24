// The ten best Word-Puzzle moves across all games, kept in the shared multiplayer index.
const TOP_WORDS_LIMIT = 10

/** One entry per scored play from move `from` on: the main word, the whole move's points and who played it. */
function topWordsFromMoves(game, players, from = 0) {
  if (game.type === 'chess' || !Array.isArray(game.moves)) return []
  const entries = []
  game.moves.forEach((move, index) => {
    if (index < from || move.kind !== 'play' || !(move.score > 0) || !move.words?.length) return
    const email = players[move.by]?.email
    if (!email) return
    entries.push({ id: `${game.id}:${index}`, word: move.words[0].word, score: move.score, language: game.language, email, at: move.at })
  })
  return entries
}

const byRank = (a, b) => b.score - a.score || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) || (a.id < b.id ? -1 : 1)

function mergeTopWords(current, additions) {
  const byId = new Map()
  for (const entry of [...readTopWords(current), ...additions]) if (!byId.has(entry.id)) byId.set(entry.id, entry)
  return [...byId.values()].sort(byRank).slice(0, TOP_WORDS_LIMIT)
}

const isText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max

function readTopWords(value) {
  if (!Array.isArray(value)) return []
  return value.filter(entry => entry !== null && typeof entry === 'object' && isText(entry.id, 200) && isText(entry.word, 30) &&
    Number.isSafeInteger(entry.score) && entry.score > 0 && isText(entry.language, 8) && isText(entry.email, 254) && isText(entry.at, 40))
}

module.exports = { TOP_WORDS_LIMIT, topWordsFromMoves, mergeTopWords, readTopWords }
