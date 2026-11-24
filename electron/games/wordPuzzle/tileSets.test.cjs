const test = require('node:test')
const assert = require('node:assert/strict')
const { LANGUAGES, TILE_SETS, letterPoints, isLetter, createBag } = require('./tileSets.cjs')

const TOTALS = { da: 100, en: 100, sv: 100, fi: 101 }

test('languages are listed in fixed order', () => {
  assert.deepEqual([...LANGUAGES], ['da', 'en', 'sv', 'fi'])
})

test('tile totals including blanks', () => {
  for (const lang of LANGUAGES) {
    const set = TILE_SETS[lang]
    const total = Object.values(set.letters).reduce((sum, l) => sum + l.count, 0) + set.blanks
    assert.equal(total, TOTALS[lang], lang)
    assert.equal(createBag(lang).length, TOTALS[lang], `${lang} bag`)
  }
})

test('every letter has count>=1 and points>=1, blanks 2', () => {
  for (const lang of LANGUAGES) {
    for (const [letter, def] of Object.entries(TILE_SETS[lang].letters)) {
      assert.equal(letter.length, 1)
      assert.equal(letter, letter.toUpperCase())
      assert.ok(def.count >= 1, `${lang} ${letter} count`)
      assert.ok(def.points >= 1, `${lang} ${letter} points`)
    }
    assert.equal(TILE_SETS[lang].blanks, 2)
  }
})

test('blank scores zero', () => {
  for (const lang of LANGUAGES) assert.equal(letterPoints(lang, '?'), 0)
})

test('letterPoints and isLetter', () => {
  assert.equal(letterPoints('da', 'Æ'), 4)
  assert.equal(letterPoints('en', 'Q'), 10)
  assert.equal(letterPoints('sv', 'C'), 10)
  assert.equal(letterPoints('fi', 'Ö'), 7)
  assert.equal(letterPoints('en', 'Æ'), 0)
  assert.equal(isLetter('da', 'Å'), true)
  assert.equal(isLetter('en', 'Å'), false)
  assert.equal(isLetter('fi', 'Q'), false)
  assert.equal(isLetter('sv', '?'), false)
  assert.equal(isLetter('da', 'AB'), false)
  assert.equal(isLetter('xx', 'A'), false)
})

test('known distributions', () => {
  assert.deepEqual(TILE_SETS.en.letters.E, { count: 12, points: 1 })
  assert.deepEqual(TILE_SETS.da.letters.E, { count: 9, points: 1 })
  assert.deepEqual(TILE_SETS.sv.letters.Ä, { count: 2, points: 3 })
  assert.deepEqual(TILE_SETS.fi.letters.Ä, { count: 5, points: 2 })
})

test('data is deep-frozen', () => {
  assert.ok(Object.isFrozen(TILE_SETS))
  assert.ok(Object.isFrozen(TILE_SETS.da))
  assert.ok(Object.isFrozen(TILE_SETS.da.letters))
  assert.ok(Object.isFrozen(TILE_SETS.da.letters.A))
  assert.ok(Object.isFrozen(LANGUAGES))
})

test('createBag counts match the distribution', () => {
  for (const lang of LANGUAGES) {
    const bag = createBag(lang)
    const tally = {}
    for (const tile of bag) {
      assert.equal(typeof tile, 'string')
      assert.equal(tile.length, 1)
      tally[tile] = (tally[tile] || 0) + 1
    }
    for (const [letter, def] of Object.entries(TILE_SETS[lang].letters)) assert.equal(tally[letter], def.count, `${lang} ${letter}`)
    assert.equal(tally['?'], 2)
  }
})

test('createBag returns a fresh array and rejects unknown language', () => {
  assert.notEqual(createBag('da'), createBag('da'))
  assert.throws(() => createBag('xx'))
})
