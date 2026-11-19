const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { createMaterialCatalog, withLearning, CATALOG_KEY } = require('./catalog.cjs')

const NOW = Date.UTC(2026, 9, 20)
const sharedStore = () => createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-')))

test('describeFromSap uses MB52 first, MM60 for the rest, learns everything and reports unknown numbers', async () => {
  const store = sharedStore()
  const asked = []
  const fetcher = {
    fetchPlant: async () => { throw new Error('the import must not fetch IQ09') },
    fetchStock: async ({ onProgress } = {}) => { for (const step of ['check', 'mb52', 'done']) onProgress?.(step); return { mb52: [{ material: 'R162-0717', description: 'Ethernet Cable RJ45 2m', sloc: 'D000' }, { material: 'INT4300-4921-0', description: 'Move/5000', sloc: 'D000' }] } },
    fetchMaterialTexts: async ({ materials }) => { asked.push(...materials); return materials.filter(material => material === 'R133-0032').map(material => ({ material, description: 'Move3500 12V DC car charger' })) },
  }
  const catalog = createMaterialCatalog({ sharedStore: store, fetcher, now: () => NOW })
  const steps = []
  const result = await catalog.describeFromSap(['r162-0717', 'R133-0032', 'R999-9999'], { onProgress: step => steps.push(step) })
  assert.deepEqual(result, { texts: { 'R162-0717': 'Ethernet Cable RJ45 2m', 'R133-0032': 'Move3500 12V DC car charger' }, unknown: ['R999-9999'] })
  assert.deepEqual(asked, ['R133-0032', 'R999-9999'], 'MM60 only for what MB52 did not have')
  assert.deepEqual(steps, ['check', 'mb52', 'mm60', 'done'], 'only MB52 (no IQ09); done comes once, at the end')
  assert.deepEqual(await catalog.describe(['R162-0717', 'INT4300-4921-0', 'R133-0032', 'R999-9999']), { 'R162-0717': 'Ethernet Cable RJ45 2m', 'INT4300-4921-0': 'Move/5000', 'R133-0032': 'Move3500 12V DC car charger' }, 'all of MB52 is learned, not only what was asked')
  const stored = await store.getAsync(CATALOG_KEY)
  assert.deepEqual(stored['R133-0032'], { description: 'Move3500 12V DC car charger', source: 'mm60', at: NOW })
})

test('describeFromSap skips MM60 when MB52 knew everything, and SAP_NOT_READY passes through', async () => {
  let mm60 = 0
  let ready = true
  const fetcher = {
    fetchStock: async () => { if (!ready) throw Object.assign(new Error('SAP er ikke klar'), { code: 'SAP_NOT_READY' }); return { mb52: [{ material: 'R162-0717', description: 'Ethernet' }] } },
    fetchMaterialTexts: async () => { mm60++; return [] },
  }
  const catalog = createMaterialCatalog({ sharedStore: sharedStore(), fetcher, now: () => NOW })
  assert.deepEqual(await catalog.describeFromSap(['R162-0717']), { texts: { 'R162-0717': 'Ethernet' }, unknown: [] })
  assert.equal(mm60, 0)
  ready = false
  await assert.rejects(catalog.describeFromSap(['R162-0717']), { code: 'SAP_NOT_READY' })
})

test('learn keeps the newest text, ignores empty ones and writes nothing when nothing changed', async () => {
  const store = sharedStore()
  let clock = NOW
  const catalog = createMaterialCatalog({ sharedStore: store, fetcher: {}, now: () => clock })
  await catalog.learn([{ material: 'r162-0717', description: ' Ethernet ', source: 'mb52' }, { material: 'R133-0032', description: '', source: 'mb52' }, { material: '', description: 'x', source: 'mb52' }])
  assert.deepEqual(await catalog.describe(['R162-0717', 'R133-0032']), { 'R162-0717': 'Ethernet' })
  clock = NOW + 1000
  await catalog.learn([{ material: 'R162-0717', description: 'Ethernet', source: 'matdoc' }])
  assert.equal((await store.getAsync(CATALOG_KEY))['R162-0717'].at, NOW, 'same text: untouched')
  await catalog.learn([{ material: 'R162-0717', description: 'Ethernet Cable RJ45 2m', source: 'matdoc' }])
  assert.deepEqual((await store.getAsync(CATALOG_KEY))['R162-0717'], { description: 'Ethernet Cable RJ45 2m', source: 'matdoc', at: NOW + 1000 })
})

test('the catalog learns descriptions when Optælling fetches from SAP and when a material document is looked up', async () => {
  const learned = []
  const catalog = { learn: async entries => { learned.push(...entries) } }
  const plant = { mb52: [{ material: 'R162-0717', description: 'Ethernet', sloc: 'D000' }], serials: [] }
  const matdoc = { document: '5000032337 2026 0001', rows: [{ serial: 'S1', material: 'R133-0032', description: 'Charger' }] }
  const fetcher = { fetchPlant: async () => plant, fetchMatdoc: async () => matdoc, fetchLongSerials: async () => ['x'] }
  const learning = withLearning(fetcher, catalog)
  assert.equal(await learning.fetchPlant(), plant, 'the answer is unchanged')
  assert.equal(await learning.fetchMatdoc({ team: 'TCD', document: '5000032337' }), matdoc)
  assert.deepEqual(await learning.fetchLongSerials(), ['x'], 'other functions pass through')
  assert.deepEqual(learned, [{ material: 'R162-0717', description: 'Ethernet', source: 'mb52' }, { material: 'R133-0032', description: 'Charger', source: 'matdoc' }])
  const failing = withLearning(fetcher, { learn: async () => { throw new Error('disk full') } })
  assert.equal(await failing.fetchPlant(), plant, 'a failing catalog never breaks Optælling')
})

test('describeMissing looks up only unknown materials in MM60, learns them, never twice in a row, and never fails', async () => {
  const store = sharedStore()
  let clock = NOW
  let ready = true
  const asked = []
  const fetcher = { fetchMaterialTexts: async ({ materials }) => { if (!ready) throw Object.assign(new Error('SAP er ikke klar'), { code: 'SAP_NOT_READY' }); asked.push(...materials); return materials.filter(material => material === 'R133-0032').map(material => ({ material, description: 'Move3500 12V DC car charger' })) } }
  const catalog = createMaterialCatalog({ sharedStore: store, fetcher, now: () => clock })
  await catalog.learn([{ material: 'R162-0717', description: 'Ethernet', source: 'mb52' }])
  ready = false
  await catalog.describeMissing(['R133-0032'])
  assert.deepEqual(asked, [], 'SAP not ready: nothing asked, nothing thrown')
  ready = true
  await catalog.describeMissing(['R162-0717', 'r133-0032', 'R999-9999'])
  assert.deepEqual(asked, ['R133-0032', 'R999-9999'])
  assert.deepEqual(await catalog.describe(['R133-0032']), { 'R133-0032': 'Move3500 12V DC car charger' })
  await catalog.describeMissing(['R999-9999'])
  assert.deepEqual(asked, ['R133-0032', 'R999-9999'], 'not asked again right away')
  clock += 11 * 60000
  await catalog.describeMissing(['R999-9999'])
  assert.deepEqual(asked, ['R133-0032', 'R999-9999', 'R999-9999'], 'asked again later')
})

test('describeMissing never touches the clipboard and asks for at most five materials', async () => {
  const seen = []
  const fetcher = { fetchMaterialTexts: async options => { seen.push(options); return [] } }
  const catalog = createMaterialCatalog({ sharedStore: sharedStore(), fetcher, now: () => NOW })
  await catalog.describeMissing(['A1-1', 'A1-2', 'A1-3', 'A1-4', 'A1-5', 'A1-6', 'A1-7'])
  assert.equal(seen[0].useClipboard, false)
  assert.equal(seen[0].materials.length, 5)
})

test('when MM60 fails, MB52\'s texts are kept and the rest is reported as unchecked, not as unknown', async () => {
  const fetcher = {
    fetchStock: async () => ({ mb52: [{ material: 'R162-0717', description: 'Ethernet' }] }),
    fetchMaterialTexts: async () => { throw Object.assign(new Error('MM60 fejlede: read-failed'), { code: 'SAP_EXPORT_FAILED' }) },
  }
  const catalog = createMaterialCatalog({ sharedStore: sharedStore(), fetcher, now: () => NOW })
  const result = await catalog.describeFromSap(['R162-0717', 'R133-0032'])
  assert.deepEqual(result.texts, { 'R162-0717': 'Ethernet' })
  assert.deepEqual(result.unknown, [])
  assert.deepEqual(result.unchecked, ['R133-0032'])
  assert.match(result.mm60Error, /read-failed/)
})
