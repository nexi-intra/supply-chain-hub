'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { after, describe, it } = require('node:test')
const { performance } = require('node:perf_hooks')

const { createWordChecker } = require('./wordChecker.cjs')
const { lineListContains } = require('./wordCheckWorker.cjs')

const FINNISH_LIST = path.join(__dirname, 'wordlists', 'fi.txt.gz')
const checker = createWordChecker()
after(() => checker.close())

async function timedFirstCheck(t, language, words) {
  const started = performance.now()
  const result = await checker.check(language, words)
  t.diagnostic(`first load ${language}: ${Math.round(performance.now() - started)} ms`)
  return result
}

describe('word checker (real worker, real dictionaries)', () => {
  it('validates Danish words, rejects proper nouns and nonsense', async t => {
    const result = await timedFirstCheck(t, 'da', ['HUS', 'BIL', 'HUSET', 'XQZT', 'KØBENHAVN', 'ØL', 'BLÅ'])
    assert.deepEqual(result, { HUS: true, BIL: true, HUSET: true, XQZT: false, KØBENHAVN: false, ØL: true, BLÅ: true })
  })

  it('validates English words', async t => {
    const result = await timedFirstCheck(t, 'en', ['HOUSE', 'QUIZ', 'ZXQW'])
    assert.deepEqual(result, { HOUSE: true, QUIZ: true, ZXQW: false })
  })

  it('validates Swedish words', async t => {
    const result = await timedFirstCheck(t, 'sv', ['HUS', 'BÅT', 'XQZT'])
    assert.deepEqual(result, { HUS: true, BÅT: true, XQZT: false })
  })

  it('validates Finnish words incl. inflected forms, rejects proper nouns, abbreviations and nonsense', async t => {
    assert.ok(fs.existsSync(FINNISH_LIST), 'fi.txt.gz is missing: run scripts/build-finnish-wordlist.cjs')
    const words = ['TALO', 'TALOSSA', 'KISSOILLE', 'JUOKSISIMME', 'HYVÄ', 'YÖ', 'JA', 'ALPINISMI', 'HELSINKI', 'KM', 'ATK', 'ALPPINISMI', 'XQZTW', 'PIZZA']
    assert.deepEqual(await timedFirstCheck(t, 'fi', words), {
      TALO: true, TALOSSA: true, KISSOILLE: true, JUOKSISIMME: true, HYVÄ: true, YÖ: true, JA: true, ALPINISMI: true,
      HELSINKI: false, KM: false, ATK: false, ALPPINISMI: false, XQZTW: false, PIZZA: false,
    })
  })

  it('rejects letters that are not in the language tile set', async () => {
    assert.deepEqual(await checker.check('en', ['CAFÆ', 'ÅR']), { CAFÆ: false, ÅR: false })
    assert.deepEqual(await checker.check('da', ['BÄR']), { BÄR: false })
  })

  it('rejects words shorter than 2 or longer than 15 letters', async () => {
    const sixteen = 'A'.repeat(16)
    assert.deepEqual(await checker.check('da', ['A', sixteen, '']), { A: false, [sixteen]: false, '': false })
  })

  it('rejects lower-case words and blank tiles', async () => {
    assert.deepEqual(await checker.check('da', ['hus', 'H?S']), { hus: false, 'H?S': false })
  })

  it('deduplicates words and answers every distinct word once', async () => {
    const result = await checker.check('da', ['HUS', 'HUS', 'BIL', 'HUS'])
    assert.deepEqual(result, { HUS: true, BIL: true })
  })

  it('resolves an empty request without a worker round trip', async () => {
    assert.deepEqual(await checker.check('da', []), {})
  })

  it('rejects an unknown language with WORD_CHECK_LANGUAGE', async () => {
    await assert.rejects(() => checker.check('xx', ['HUS']), { code: 'WORD_CHECK_LANGUAGE' })
  })

  it('restarts the worker after close()', async () => {
    const own = createWordChecker()
    assert.deepEqual(await own.check('en', ['HOUSE']), { HOUSE: true })
    await own.close()
    await own.close()
    assert.deepEqual(await own.check('en', ['HOUSE']), { HOUSE: true })
    await own.close()
  })

  it('rejects pending requests on close()', async () => {
    const own = createWordChecker()
    const outcome = assert.rejects(own.check('da', ['HUS']), { code: 'WORD_CHECK_CLOSED' })
    await own.close()
    await outcome
  })
})

describe('word checker lifecycle (stand-in worker scripts)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordcheck-'))
  after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const workerPath = path.join(dir, 'worker.cjs')
  fs.writeFileSync(
    workerPath,
    `const { parentPort } = require('node:worker_threads')
parentPort.on('message', ({ id, words }) => {
  if (words.includes('CRASH')) throw new Error('boom')
  if (words.includes('HANG')) return
  parentPort.postMessage({ id, result: Object.fromEntries(words.map(word => [word, true])) })
})`,
  )

  it('rejects with WORD_CHECK_WORKER when the worker crashes and restarts on the next call', async () => {
    const own = createWordChecker({ workerPath })
    await assert.rejects(() => own.check('da', ['CRASH']), { code: 'WORD_CHECK_WORKER' })
    assert.deepEqual(await own.check('da', ['HUS']), { HUS: true })
    await own.close()
  })

  it('rejects with WORD_CHECK_TIMEOUT and recovers on the next call', async () => {
    // Long enough for the restarted worker to boot while the whole suite runs in parallel.
    const own = createWordChecker({ workerPath, timeoutMs: 1500 })
    await assert.rejects(() => own.check('da', ['HANG']), { code: 'WORD_CHECK_TIMEOUT' })
    assert.deepEqual(await own.check('da', ['HUS']), { HUS: true })
    await own.close()
  })

  it('releases an idle worker and starts a fresh one on the next call', async () => {
    const own = createWordChecker({ workerPath, idleMs: 50 })
    assert.deepEqual(await own.check('da', ['HUS']), { HUS: true })
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.deepEqual(await own.check('da', ['BIL']), { BIL: true })
    await own.close()
  })

  it('warm() reaches the worker with an empty word list, rejects unknown languages and still lets the worker go idle', async () => {
    const messages = path.join(dir, 'warm-messages.json')
    const warmWorker = path.join(dir, 'warm-worker.cjs')
    fs.writeFileSync(
      warmWorker,
      `const fs = require('node:fs')
const { parentPort } = require('node:worker_threads')
parentPort.on('message', ({ id, language, words }) => {
  fs.appendFileSync(${JSON.stringify(messages)}, JSON.stringify({ language, words }) + '\\n')
  parentPort.postMessage({ id, result: {} })
})`,
    )
    const own = createWordChecker({ workerPath: warmWorker, idleMs: 50 })
    await own.warm('da')
    await assert.rejects(() => own.warm('xx'), { code: 'WORD_CHECK_LANGUAGE' })
    assert.deepEqual(fs.readFileSync(messages, 'utf8').trim().split('\n').map(line => JSON.parse(line)), [{ language: 'da', words: [] }])
    await new Promise(resolve => setTimeout(resolve, 150))
    await own.warm('da')
    assert.equal(fs.readFileSync(messages, 'utf8').trim().split('\n').length, 2)
    await own.close()
  })
})

describe('lineListContains (sorted word list, binary search)', () => {
  const words = ['AA', 'AB', 'ABC', 'BIL', 'HUS', 'TALO', 'ÖLJY', 'ÖÖ']
  const text = `${words.join('\n')}\n`

  it('finds every word, first and last included', () => {
    for (const word of words) assert.equal(lineListContains(text, word), true, word)
  })

  it('does not match prefixes, suffixes or missing words', () => {
    for (const word of ['A', 'AB ', 'BI', 'US', 'ZZ', '', 'TALOT', 'ÖÖÖ', '0']) {
      assert.equal(lineListContains(text, word), false, word)
    }
  })

  it('handles empty and single-line lists', () => {
    assert.equal(lineListContains('', 'HUS'), false)
    assert.equal(lineListContains('HUS\n', 'HUS'), true)
    assert.equal(lineListContains('HUS\n', 'BIL'), false)
  })
})
