// Word-Puzzle rules engine: pure functions, no I/O. Randomness is injected via randomInt(maxExclusive).
const { SIZE, CENTER, premiumAt } = require('./board.cjs')
const { letterPoints, isLetter } = require('./tileSets.cjs')

const RACK_SIZE = 7
const BINGO_BONUS = 50
const MAX_SCORELESS_TURNS = 6
const BLANK = '?'

const emptyBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null))

const inBounds = (row, col) => Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < SIZE && col >= 0 && col < SIZE
const cellAt = (board, row, col) => (inBounds(row, col) ? board[row][col] : null)
const fail = error => ({ ok: false, error })

function validatePlacement(board, placements, language) {
  if (!Array.isArray(placements) || placements.length === 0) return fail('EMPTY')

  const seen = new Set()
  for (const { row, col, letter } of placements) {
    if (!inBounds(row, col)) return fail('OUT_OF_BOUNDS')
    if (!isLetter(language, letter)) return fail('INVALID_LETTER')
    if (board[row][col]) return fail('OCCUPIED')
    const key = row * SIZE + col
    if (seen.has(key)) return fail('DUPLICATE_SQUARE')
    seen.add(key)
  }

  const sameRow = placements.every(p => p.row === placements[0].row)
  const sameCol = placements.every(p => p.col === placements[0].col)
  if (!sameRow && !sameCol) return fail('NOT_IN_LINE')

  if (placements.length > 1) {
    const horizontal = sameRow
    const positions = placements.map(p => (horizontal ? p.col : p.row))
    const fixed = horizontal ? placements[0].row : placements[0].col
    for (let at = Math.min(...positions); at <= Math.max(...positions); at++) {
      const row = horizontal ? fixed : at
      const col = horizontal ? at : fixed
      if (!seen.has(row * SIZE + col) && !board[row][col]) return fail('GAP')
    }
  }

  const boardIsEmpty = board.every(line => line.every(cell => !cell))
  if (boardIsEmpty) {
    if (!placements.some(p => p.row === CENTER && p.col === CENTER)) return fail('MUST_COVER_CENTER')
    if (placements.length < 2) return fail('FIRST_MOVE_TOO_SHORT')
    return { ok: true }
  }

  const touches = placements.some(({ row, col }) =>
    [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => cellAt(board, row + dr, col + dc)))
  return touches ? { ok: true } : fail('NOT_CONNECTED')
}

function applyPlacements(board, placements) {
  const next = board.map(line => line.slice())
  for (const { row, col, letter, blank } of placements) next[row][col] = { letter, blank: Boolean(blank) }
  return next
}

function extractWords(board, placements) {
  if (placements.length === 0) return []
  const newTiles = new Map(placements.map(p => [p.row * SIZE + p.col, p]))
  const grid = applyPlacements(board, placements)

  const run = (row, col, dr, dc) => {
    let r = row
    let c = col
    while (cellAt(grid, r - dr, c - dc)) { r -= dr; c -= dc }
    const cells = []
    while (cellAt(grid, r, c)) {
      const tile = grid[r][c]
      cells.push({ row: r, col: c, letter: tile.letter, blank: tile.blank, isNew: newTiles.has(r * SIZE + c) })
      r += dr
      c += dc
    }
    return cells
  }
  const toWord = cells => ({ word: cells.map(c => c.letter.toUpperCase()).join(''), cells })

  const first = placements[0]
  let horizontal
  if (placements.length > 1) horizontal = placements.every(p => p.row === first.row)
  else horizontal = run(first.row, first.col, 0, 1).length >= 2 || run(first.row, first.col, 1, 0).length < 2

  const [mainDr, mainDc] = horizontal ? [0, 1] : [1, 0]
  const [crossDr, crossDc] = horizontal ? [1, 0] : [0, 1]

  const words = []
  const main = run(first.row, first.col, mainDr, mainDc)
  if (main.length >= 2) words.push(toWord(main))
  for (const { row, col } of placements) {
    const cross = run(row, col, crossDr, crossDc)
    if (cross.length >= 2) words.push(toWord(cross))
  }
  return words
}

function scoreMove(board, placements, language) {
  const words = extractWords(board, placements).map(({ word, cells }) => {
    let sum = 0
    let multiplier = 1
    for (const cell of cells) {
      let points = cell.blank ? 0 : letterPoints(language, cell.letter)
      if (cell.isNew) {
        const premium = premiumAt(cell.row, cell.col)
        if (premium === 'DL') points *= 2
        else if (premium === 'TL') points *= 3
        else if (premium === 'DW') multiplier *= 2
        else if (premium === 'TW') multiplier *= 3
      }
      sum += points
    }
    return { word, score: sum * multiplier }
  })
  const bingo = placements.length === RACK_SIZE
  const total = words.reduce((sum, w) => sum + w.score, 0) + (bingo ? BINGO_BONUS : 0)
  return { words, bingo, total }
}

function removeFromRack(rack, placements) {
  const remaining = rack.slice()
  for (const { letter, blank } of placements) {
    if (!blank && letter === BLANK) return { ok: false, error: 'TILES_NOT_IN_RACK' }
    const index = remaining.indexOf(blank ? BLANK : letter)
    if (index === -1) return { ok: false, error: 'TILES_NOT_IN_RACK' }
    remaining.splice(index, 1)
  }
  return { ok: true, rack: remaining }
}

function drawTiles(bag, count, randomInt) {
  const rest = bag.slice()
  const drawn = []
  for (let i = Math.min(count, rest.length); i > 0; i--) drawn.push(...rest.splice(randomInt(rest.length), 1))
  return { drawn, bag: rest }
}

function exchangeTiles(rack, bag, letters, randomInt) {
  const unchanged = error => ({ ok: false, rack: rack.slice(), bag: bag.slice(), error })
  if (!letters || letters.length === 0) return unchanged('EMPTY')
  if (bag.length < RACK_SIZE) return unchanged('BAG_TOO_SMALL')
  const kept = rack.slice()
  for (const letter of letters) {
    const index = kept.indexOf(letter)
    if (index === -1) return unchanged('TILES_NOT_IN_RACK')
    kept.splice(index, 1)
  }
  const { drawn, bag: rest } = drawTiles(bag, letters.length, randomInt)
  return { ok: true, rack: [...kept, ...drawn], bag: [...rest, ...letters] }
}

function rackValue(rack, language) {
  return rack.reduce((sum, letter) => sum + letterPoints(language, letter), 0)
}

function isGameOver({ bagSize, racks, consecutiveScoreless }) {
  if (consecutiveScoreless >= MAX_SCORELESS_TURNS) return true
  return bagSize === 0 && Object.values(racks).some(rack => rack.length === 0)
}

function finalScores(scores, racks, language) {
  const ids = Object.keys(scores)
  const rackOf = id => racks[id] || []
  const values = Object.fromEntries(ids.map(id => [id, rackValue(rackOf(id), language)]))
  const emptyIds = ids.filter(id => rackOf(id).length === 0)
  const outPlayer = emptyIds.length === 1 ? emptyIds[0] : null

  const result = {}
  for (const id of ids) {
    result[id] = scores[id] - values[id]
    if (id === outPlayer) result[id] += ids.reduce((sum, other) => (other === id ? sum : sum + values[other]), 0)
  }

  const best = Math.max(...Object.values(result))
  const leaders = ids.filter(id => result[id] === best)
  return { scores: result, winner: leaders.length === 1 ? leaders[0] : 'draw' }
}

module.exports = {
  emptyBoard, validatePlacement, extractWords, scoreMove, applyPlacements,
  removeFromRack, drawTiles, exchangeTiles, rackValue, isGameOver, finalScores,
}
