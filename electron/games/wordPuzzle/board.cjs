// Word-Puzzle board geometry: 15x15 grid with the standard premium-square layout.
const SIZE = 15
const CENTER = 7

const LAYOUT = {
  TW: [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]],
  DW: [
    [1, 1], [2, 2], [3, 3], [4, 4], [1, 13], [2, 12], [3, 11], [4, 10],
    [13, 1], [12, 2], [11, 3], [10, 4], [13, 13], [12, 12], [11, 11], [10, 10], [7, 7],
  ],
  TL: [
    [1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13],
    [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9],
  ],
  DL: [
    [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14], [6, 2], [6, 6], [6, 8], [6, 12], [7, 3],
    [7, 11], [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14], [12, 6], [12, 8], [14, 3], [14, 11],
  ],
}

const PREMIUMS = new Map()
for (const [kind, squares] of Object.entries(LAYOUT)) {
  for (const [row, col] of squares) PREMIUMS.set(row * SIZE + col, kind)
}

const PREMIUM_COUNTS = Object.freeze(
  Object.fromEntries(Object.entries(LAYOUT).map(([kind, squares]) => [kind, squares.length])),
)

function premiumAt(row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return null
  return PREMIUMS.get(row * SIZE + col) || null
}

module.exports = { SIZE, CENTER, premiumAt, PREMIUM_COUNTS }
