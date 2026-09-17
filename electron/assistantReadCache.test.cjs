const test = require('node:test')
const assert = require('node:assert/strict')
const { createReadCache } = require('./assistantReadCache.cjs')
const { indexGuide } = require('./assistantGuideIndex.cjs')
function fixture(options = {}) {
  let raw = '{"content":"original"}'
  let revision = 1n
  let problem
  const io = {
    statSync: () => { if (problem) throw Object.assign(new Error('Synthetic failure'), { code: problem }); return { isFile: () => true, mtimeNs: 1n, ctimeNs: revision, ino: revision, size: BigInt(raw.length) } },
    readFileSync: () => raw,
  }
  const cache = createReadCache({ io, decode: JSON.parse, ...options })
  return { cache, replace: value => { raw = JSON.stringify(value); revision++ }, fail: code => { problem = code } }
}
test('unchanged guide is decoded once and keeps its identity/index for repeated questions', () => {
  const { cache } = fixture()
  const first = cache.get('/test/guides.json', true)
  const second = cache.get('/test/guides.json', true)
  assert.strictEqual(first, second)
  assert.strictEqual(indexGuide(first), indexGuide(second))
  assert.equal(cache.stats().reads, 1)
  assert.equal(cache.stats().hits, 1)
})
test('authentication and other non-guide records are decoded fresh between requests', () => {
  const { cache } = fixture()
  assert.notStrictEqual(cache.get('/test/active-sessions.json'), cache.get('/test/active-sessions.json'))
  assert.equal(cache.stats().reads, 2)
  assert.equal(cache.stats().entries, 0)
})
test('fresh authority reads do not require repeated network metadata calls', () => {
  let reads = 0
  const cache = createReadCache({ io: { statSync: () => assert.fail('No stat round trip for uncached authority'), readFileSync: () => { reads++; return '{"valid":true}' } }, decode: JSON.parse })
  cache.get('/test/users.json')
  cache.get('/test/users.json')
  assert.equal(reads, 2)
})
test('same-size/mtime atomic replacement still refreshes cached guide and its search index', () => {
  const { cache, replace } = fixture()
  const first = cache.get('/test/guides.json', true)
  replace({ content: 'replaced' })
  const next = cache.get('/test/guides.json', true)
  assert.notStrictEqual(first, next)
  assert.notStrictEqual(indexGuide(first), indexGuide(next))
  assert.equal(next.content, 'replaced')
})
test('deleted or inaccessible files never return stale cached guides', () => {
  for (const code of ['ENOENT', 'EACCES', 'EIO']) {
    const { cache, fail } = fixture()
    cache.get('/test/guides.json', true)
    fail(code)
    if (code === 'ENOENT') assert.equal(cache.get('/test/guides.json', true), undefined)
    else assert.throws(() => cache.get('/test/guides.json', true), /Synthetic failure/)
    assert.equal(cache.stats().entries, 0)
  }
})
test('cache memory/entry bounds and explicit clear prevent an unbounded guide archive', () => {
  const { cache } = fixture({ maxEntries: 1, maxBytes: 100 })
  cache.get('/test/one.json', true)
  cache.get('/test/two.json', true)
  assert.equal(cache.stats().entries, 1)
  assert.ok(cache.stats().bytes <= 100)
  cache.clear()
  assert.equal(cache.stats().entries, 0)
  assert.equal(cache.stats().bytes, 0)
})
test('oversized files are rejected before reading/decoding', () => {
  const { cache } = fixture({ maxFileBytes: 1 })
  assert.throws(() => cache.get('/test/guides.json', true), /for stor/)
  assert.equal(cache.stats().reads, 0)
})
test('revision fingerprint changes even when a guide edit retains its version number', () => {
  const first = indexGuide({ title: 'Cloud', content: 'Synthetic original', version: '1.00' })
  const next = indexGuide({ title: 'Cloud', content: 'Synthetic replacement', version: '1.00' })
  assert.notEqual(first[0].revision, next[0].revision)
})
