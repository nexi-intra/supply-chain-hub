// Word-Puzzle tile sets (letter count / points per language).
// Source: published Scrabble letter distributions, Wikipedia "Scrabble letter distributions".
// Blank tiles are written '?' and are worth 0 points.
const LANGUAGES = Object.freeze(['da', 'en', 'sv', 'fi'])

// Format per letter: <LETTER><count>/<points>
const RAW = {
  da: {
    letters: 'A7/1 B4/3 C2/8 D5/2 E9/1 F3/3 G3/3 H2/4 I4/3 J2/4 K4/3 L5/2 M3/4 N6/1 O5/2 P2/4 R6/1 S5/2 T5/2 U3/3 V3/3 X1/8 Y2/4 Z1/8 Æ2/4 Ø2/4 Å2/4',
    blanks: 2,
  },
  en: {
    letters: 'A9/1 B2/3 C2/3 D4/2 E12/1 F2/4 G3/2 H2/4 I9/1 J1/8 K1/5 L4/1 M2/3 N6/1 O8/1 P2/3 Q1/10 R6/1 S4/1 T6/1 U4/1 V2/4 W2/4 X1/8 Y2/4 Z1/10',
    blanks: 2,
  },
  sv: {
    letters: 'A8/1 B2/4 C1/10 D5/1 E7/1 F2/3 G3/2 H2/2 I5/1 J1/7 K3/2 L5/1 M3/2 N6/1 O5/2 P2/4 R8/1 S8/1 T8/1 U3/4 V2/3 X1/8 Y1/7 Z1/10 Å2/4 Ä2/3 Ö2/4',
    blanks: 2,
  },
  fi: {
    letters: 'A10/1 B1/8 C1/10 D1/7 E8/1 F1/8 G1/8 H2/4 I10/1 J2/4 K5/2 L5/2 M3/3 N9/1 O5/2 P2/4 R2/4 S7/1 T9/1 U4/3 V2/4 W1/8 Y2/4 Ä5/2 Ö1/7',
    blanks: 2,
  },
}

function parseSet({ letters, blanks }) {
  const parsed = {}
  for (const token of letters.split(' ')) {
    const [, letter, count, points] = /^(\S)(\d+)\/(\d+)$/u.exec(token)
    parsed[letter] = Object.freeze({ count: Number(count), points: Number(points) })
  }
  return Object.freeze({ letters: Object.freeze(parsed), blanks })
}

const TILE_SETS = Object.freeze(Object.fromEntries(LANGUAGES.map(lang => [lang, parseSet(RAW[lang])])))

function letterPoints(language, letter) {
  const entry = TILE_SETS[language]?.letters[letter]
  return entry ? entry.points : 0
}

function isLetter(language, letter) {
  const set = TILE_SETS[language]
  return Boolean(set) && typeof letter === 'string' && Object.hasOwn(set.letters, letter)
}

function createBag(language) {
  const set = TILE_SETS[language]
  if (!set) throw new Error(`Unknown language: ${language}`)
  const bag = []
  for (const [letter, { count }] of Object.entries(set.letters)) for (let i = 0; i < count; i++) bag.push(letter)
  for (let i = 0; i < set.blanks; i++) bag.push('?')
  return bag
}

module.exports = { LANGUAGES, TILE_SETS, letterPoints, isLetter, createBag }
