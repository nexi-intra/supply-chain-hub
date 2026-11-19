const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { LIBRARIES, PLATFORM_SHARED_KV_KEYS, libraryForItemsKey, libraryForRequestsKey } = require('./libraryKeys.cjs')

test('guide library keys are unchanged', () => {
  assert.deepEqual(LIBRARIES.guides, { items: 'guides', shared: 'shared-guides', requests: 'guide-access-requests' })
})
test('knowledge base uses its own keys that never overlap the guide keys', () => {
  assert.deepEqual(LIBRARIES.knowledge, { items: 'knowledge-articles', shared: 'shared-knowledge-articles', requests: 'knowledge-access-requests' })
  const guideKeys = new Set(Object.values(LIBRARIES.guides))
  for (const key of Object.values(LIBRARIES.knowledge)) assert.equal(guideKeys.has(key), false, key)
})
test('library lookups resolve item and request keys and reject everything else', () => {
  assert.equal(libraryForItemsKey('knowledge-articles'), 'knowledge')
  assert.equal(libraryForItemsKey('guides'), 'guides')
  assert.equal(libraryForRequestsKey('knowledge-access-requests'), 'knowledge')
  assert.equal(libraryForRequestsKey('guide-access-requests'), 'guides')
  for (const key of ['shared-knowledge-articles', 'knowledge-versions-k1', 'users', '__proto__', 'constructor']) {
    assert.equal(libraryForItemsKey(key), null, key)
    assert.equal(libraryForRequestsKey(key), null, key)
  }
})
test('both shared catalogues live in the platform store next to the existing shared keys', () => {
  assert.deepEqual([...PLATFORM_SHARED_KV_KEYS].sort(), ['active-sessions', 'meal-plan-weeks', 'shared-guides', 'shared-knowledge-articles'])
})
test('main process, assistant worker and preload use the shared key list and knowledge access IPC', () => {
  const source = name => fs.readFileSync(path.join(__dirname, name), 'utf8')
  for (const name of ['main.cjs', 'assistantWorker.cjs']) {
    assert.match(source(name), /PLATFORM_SHARED_KV_KEYS/, name)
    assert.doesNotMatch(source(name), /new Set\(\['meal-plan-weeks'/, name)
  }
  assert.match(source('main.cjs'), /'registry:submit-knowledge-access-request'/)
  assert.match(source('preload.cjs'), /submitKnowledgeAccessRequest:.*'registry:submit-knowledge-access-request'/)
  assert.match(source('securedIpc.cjs'), /IDENTITY_WRITES = new Set\([^)]*'registry:submit-knowledge-access-request'/)
})
