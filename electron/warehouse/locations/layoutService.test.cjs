// Tegningen af lageret: one draft at a time, previewed and published together with the places.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../../store.cjs')
const { createLocationRepository } = require('./repository.cjs')
const { createLocationService } = require('./service.cjs')
const { createLayoutService } = require('./layoutService.cjs')
const { normalizeLayout } = require('./layout.cjs')

const ANNA = { email: 'anna@x.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const ADA = { email: 'ada@x.test', fullName: 'Ada', role: 'user', team: 'TCD' }
const MONA = { email: 'mona@x.test', fullName: 'Mona', role: 'manager', team: 'TCD' }
const MONA_REF = { email: 'mona@x.test', name: 'Mona' }

const hall = { w: 59, h: 68 }
const P = (id, name) => ({ id, name, kind: 'pallet' })
const rackWith = slots => ({ id: 'r1', type: 'rack', x: 1, y: 1, w: 4, h: 1, name: 'A', slots })

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-layout-'))
  const stores = new Map()
  const storeFor = team => { if (!stores.has(team)) stores.set(team, createStore(path.join(root, team))); return stores.get(team) }
  let ids = 0
  const newId = () => `id${++ids}`
  const repo = createLocationRepository({ storeFor, now: () => 1000, newId })
  // Like roles.isLocationAdmin: a real manager, or Ada who has Placerings admin.
  const isLocationAdmin = async user => (user.role === 'manager' && !user.statusManager) || user.email === ADA.email
  const locations = createLocationService({ repo, catalog: { describe: async () => ({}), learn: async () => {} }, fetcher: {}, isLocationAdmin, now: () => 1000, newId })
  const layouts = createLayoutService({ repo, locations, now: () => 2000 })
  return { repo, locations, layouts }
}

// Like the publish panel: publish the revision of the draft that was previewed.
const publishNow = async (layouts, user) => layouts.publish(user, { rev: (await layouts.draft(user)).draft?.rev })

test('only admins see and change the draft; everyone in the hub reads the published drawing', async () => {
  const { layouts } = setup()
  await assert.rejects(layouts.draft(ANNA), { code: 'LOCATIONS_MANAGER_ONLY' })
  await assert.rejects(layouts.startDraft(ANNA), { code: 'LOCATIONS_MANAGER_ONLY' })
  assert.deepEqual(await layouts.layout(ANNA), { layout: null })
})

test('one draft at a time: another admin must take over', async () => {
  const { layouts } = setup()
  const { draft } = await layouts.startDraft(MONA); assert.equal(draft.basedOn, 0)
  assert.deepEqual(draft, { version: 0, hall, notes: '', items: [], basedOn: 0, rev: 1, decisions: { outside: [], remove: [] }, editedBy: MONA_REF, editedAt: 2000 })
  assert.deepEqual((await layouts.startDraft(ADA)).draft, draft, 'a draft that exists is returned as it is')
  await assert.rejects(layouts.saveDraft(ADA, { draft }), err => err.code === 'LAYOUT_DRAFT_BUSY' && /Mona/.test(err.message))
  await layouts.saveDraft(ADA, { draft, takeOver: true })
  assert.equal((await layouts.draft(MONA)).draft.editedBy.email, 'ada@x.test')
  const decisions = { outside: ['B1'], remove: [] }
  await assert.rejects(layouts.saveDraft(ADA, { draft: { ...draft, basedOn: 7, decisions } }), { code: 'LAYOUT_STALE' })
  assert.deepEqual((await layouts.draft(MONA)).draft.decisions, { outside: [], remove: [] }, 'nothing is written')
  await layouts.saveDraft(ADA, { draft: { ...draft, decisions } })
  const { draft: saved } = await layouts.draft(MONA)
  assert.deepEqual([saved.basedOn, saved.decisions], [0, decisions], 'basedOn stays the stored draft\'s; decisions are the editor\'s')
})

test('publish writes places, drawing and the next draft together, and keeps 20 versions', async () => {
  const { layouts, locations, repo } = setup()
  // A1.1 med palle; kladde omdøber slot s1 til A1.9
  await locations.createLocation(MONA, { name: 'A1.1', type: 'Palle', purpose: 'reserve' })
  await locations.putAway(ANNA, { pallets: [{ location: 'A1.1', material: 'R162-0717', quantity: 10 }] })
  await repo.transact('TCD', { withLayout: true }, tx => { tx.layout = normalizeLayout({ version: 0, hall, items: [rackWith([P('s1', 'A1.1')])] }) })
  const { draft } = await layouts.startDraft(MONA)
  draft.items[0].slots[0].name = 'A1.9'
  await layouts.saveDraft(MONA, { draft })
  assert.deepEqual((await layouts.previewPublish(MONA)).rename.map(entry => [entry.from, entry.to]), [['A1.1', 'A1.9']])
  const result = await publishNow(layouts, MONA)
  assert.deepEqual([result.version, result.counts.rename], [1, 1])
  assert.equal((await locations.locationCard(ANNA, { location: 'A1.9' })).pallets.length, 1)
  // The next draft is the new drawing, made in the publish's own write (the editor shows it without another save).
  const { draft: next } = await layouts.draft(MONA)
  assert.deepEqual(result.draft, next)
  assert.deepEqual([next.basedOn, next.rev, next.editedBy, next.items[0].slots[0].name, 'publishedAt' in next], [1, 1, MONA_REF, 'A1.9', false])
  assert.deepEqual((await repo.read('TCD')).meta.layout, { version: 1, linked: ['A1.9'] })
  const { layout } = await layouts.layout(ANNA)
  assert.deepEqual(Object.keys(layout), ['version', 'hall', 'notes', 'items', 'outside', 'publishedAt', 'publishedBy'])
  assert.deepEqual([layout.version, layout.publishedAt, layout.publishedBy, layout.items[0].slots[0].name], [1, 2000, MONA_REF, 'A1.9'])
  const [event] = await repo.history('TCD', { type: 'layout' })
  assert.deepEqual([event.by, event.changes, event.counts, event.detail], [
    MONA_REF, { version: [0, 1] }, { create: 0, rename: 1, change: 0, remove: 0 }, { created: [], renamed: [['A1.1', 'A1.9']], removed: [], changed: [] },
  ])
  for (let i = 0; i < 21; i++) { await layouts.startDraft(MONA); await publishNow(layouts, MONA) }
  const { versions } = await layouts.versions(MONA)
  assert.equal(versions.length, 20)
  assert.deepEqual([versions[0], versions.at(-1).version], [{ version: 21, publishedAt: 2000, publishedBy: MONA_REF }, 2])
})

test('a draft based on an older drawing is refused', async () => {
  const { layouts, repo } = setup()
  await layouts.startDraft(MONA); await publishNow(layouts, MONA)
  await layouts.startDraft(MONA)
  await repo.writeDraft('TCD', current => ({ ...current, basedOn: 0 }))   // efter én udgivelse
  await assert.rejects(publishNow(layouts, MONA), { code: 'LAYOUT_STALE' })
})

test('an autosave of a draft that was published away by another admin is refused', async () => {
  const { layouts } = setup()
  const { draft: stale } = await layouts.startDraft(MONA); assert.equal(stale.basedOn, 0)
  await layouts.saveDraft(ADA, { draft: stale, takeOver: true })
  assert.equal((await publishNow(layouts, ADA)).version, 1)
  assert.equal((await layouts.draft(MONA)).draft.editedBy.email, 'ada@x.test', 'the next draft is the publishing admin\'s')
  await assert.rejects(layouts.saveDraft(MONA, { draft: stale }), err => err.code === 'LAYOUT_STALE' && /udgivet af Ada/.test(err.message))
  assert.equal((await layouts.draft(MONA)).draft.basedOn, 1, 'the stale draft is not saved')
  const { draft: fresh } = await layouts.startDraft(MONA); assert.equal(fresh.basedOn, 1)
  assert.deepEqual(await layouts.saveDraft(MONA, { draft: fresh, takeOver: true }), { editedAt: 2000, rev: 1 })
  assert.equal((await layouts.draft(MONA)).draft.basedOn, 1)
})

test('taking over with a draft built on an older drawing is refused and keeps the newer draft', async () => {
  const { layouts } = setup()
  const { draft: v0Draft } = await layouts.startDraft(MONA)
  await layouts.saveDraft(ADA, { draft: v0Draft, takeOver: true })
  assert.equal((await publishNow(layouts, ADA)).version, 1)
  const { draft: adaDraft } = await layouts.startDraft(ADA); assert.equal(adaDraft.basedOn, 1)
  await assert.rejects(layouts.saveDraft(MONA, { draft: v0Draft, takeOver: true }), err => err.code === 'LAYOUT_STALE' && /udgivet af Ada/.test(err.message))
  assert.deepEqual((await layouts.draft(MONA)).draft, adaDraft)
})

test('the same admin on two PCs: the one with an older drawing cannot save over the newer draft', async () => {
  const { layouts } = setup()
  const { draft: pc1 } = await layouts.startDraft(MONA)
  await publishNow(layouts, MONA)
  const { draft: pc2 } = await layouts.startDraft(MONA)
  await layouts.saveDraft(MONA, { draft: { ...pc2, notes: 'pc2' } })
  await assert.rejects(layouts.saveDraft(MONA, { draft: { ...pc1, notes: 'pc1' } }), { code: 'LAYOUT_STALE' })
  const { draft: stored } = await layouts.draft(MONA)
  assert.deepEqual([stored.basedOn, stored.notes, stored.editedBy], [1, 'pc2', MONA_REF])
})

test('the same admin on two PCs with the same drawing: the PC that saves on an old revision is refused', async () => {
  const { layouts } = setup()
  const { draft: pc1 } = await layouts.startDraft(MONA)
  const { draft: pc2 } = await layouts.startDraft(MONA)
  assert.deepEqual(await layouts.saveDraft(MONA, { draft: { ...pc1, notes: 'pc1' } }), { editedAt: 2000, rev: 2 })
  await assert.rejects(layouts.saveDraft(MONA, { draft: { ...pc2, notes: 'pc2' } }), err => err.code === 'LAYOUT_STALE' && err.message === 'Kladden er gemt et andet sted imens – hent den nye')
  assert.deepEqual([(await layouts.draft(MONA)).draft.notes, (await layouts.draft(MONA)).draft.rev], ['pc1', 2], 'nothing is written')
  assert.deepEqual(await layouts.saveDraft(MONA, { draft: { ...pc1, notes: 'pc1', rev: 2, editedAt: 1 } }), { editedAt: 2000, rev: 2 }, 'an unchanged draft keeps its revision')
})

test('taking over without a draft keeps the stored content and makes the caller the editor', async () => {
  const { layouts } = setup()
  await assert.rejects(layouts.saveDraft(ADA, { takeOver: true }), { code: 'LAYOUT_NO_DRAFT' })
  const { draft } = await layouts.startDraft(MONA)
  await layouts.saveDraft(MONA, { draft: { ...draft, notes: 'Monas' } })
  const taken = await layouts.saveDraft(ADA, { takeOver: true })
  assert.deepEqual([taken.editedAt, taken.rev, taken.draft.rev, taken.draft.notes, taken.draft.editedBy], [2000, 3, 3, 'Monas', { email: 'ada@x.test', name: 'Ada' }])
  assert.deepEqual((await layouts.draft(MONA)).draft, taken.draft)
  await assert.rejects(layouts.saveDraft(MONA, { draft: { ...draft, rev: 2 } }), { code: 'LAYOUT_DRAFT_BUSY' })
  await assert.rejects(layouts.saveDraft(MONA, { draft: { ...draft, rev: 2, notes: 'gammel' }, takeOver: true }), { code: 'LAYOUT_STALE' }, 'an old copy cannot take over')
  assert.equal((await layouts.draft(MONA)).draft.notes, 'Monas')
})

test('a publish of another revision than the previewed one is refused and writes nothing', async () => {
  const { layouts, repo } = setup()
  const { draft } = await layouts.startDraft(MONA)
  await layouts.saveDraft(MONA, { draft: { ...draft, items: [rackWith([P('s1', 'A1.1')])] } })
  const { rev, create } = await layouts.previewPublish(MONA)
  assert.deepEqual([rev, create.map(entry => entry.name)], [2, ['A1.1']])
  await layouts.saveDraft(MONA, { draft: { ...draft, rev: 2, items: [rackWith([P('s1', 'A1.2')])] } })
  const before = await repo.read('TCD')
  await assert.rejects(layouts.publish(MONA, { rev }), err => err.code === 'LAYOUT_STALE' && err.message === 'Kladden er ændret efter oversigten – se den igen')
  await assert.rejects(layouts.publish(MONA), { code: 'LAYOUT_STALE' })
  assert.equal((await layouts.layout(ANNA)).layout, null)
  assert.deepEqual(await repo.read('TCD'), before)
  assert.equal((await layouts.draft(MONA)).draft.rev, 3, 'the draft is kept')
  assert.equal((await layouts.publish(MONA, { rev: 3 })).version, 1)
})

test('the decisions to keep places outside the drawing are published and start the next draft', async () => {
  const { layouts, locations } = setup()
  for (const name of ['A1.1', 'K1.1', 'K1.2']) await locations.createLocation(MONA, { name, type: 'Palle', purpose: 'reserve' })
  const { draft } = await layouts.startDraft(MONA)
  await layouts.saveDraft(MONA, { draft: { ...draft, items: [rackWith([P('s1', 'A1.1'), P('s2', 'K1.2')])], decisions: { outside: ['k1.1', 'K1.2', 'X9'], remove: [] } } })
  await publishNow(layouts, MONA)
  assert.deepEqual((await layouts.layout(ANNA)).layout.outside, ['k1.1'], 'only names still outside the drawing')
  const { draft: next } = await layouts.startDraft(MONA)
  assert.deepEqual(next.decisions, { outside: ['k1.1'], remove: [] })
})

test('a drawing without places cannot be published over a list with places; an empty hub can', async () => {
  const { layouts, locations, repo } = setup()
  for (const name of ['A1.1', 'A1.2']) await locations.createLocation(MONA, { name, type: 'Palle', purpose: 'reserve' })
  await layouts.startDraft(MONA)
  const before = await repo.read('TCD')
  await assert.rejects(publishNow(layouts, MONA), err => err.code === 'LAYOUT_BLOCKED' && err.message === 'Tegningen har ingen pladser – alle 2 pladser ville stå uden for tegningen')
  assert.equal((await layouts.layout(ANNA)).layout, null)
  assert.deepEqual(await repo.read('TCD'), before)
  const empty = setup()
  await empty.layouts.startDraft(MONA)
  assert.equal((await publishNow(empty.layouts, MONA)).version, 1)
})

test('a blocked plan writes nothing', async () => {
  const { layouts, locations, repo } = setup()
  // kladde med to slots 'A1.1'
  await locations.createLocation(MONA, { name: 'A1.1', type: 'Palle', purpose: 'reserve' })
  const { draft } = await layouts.startDraft(MONA)
  await layouts.saveDraft(MONA, { draft: { ...draft, items: [rackWith([P('s1', 'A1.1'), P('s2', 'A1.1')])] } })
  await assert.rejects(publishNow(layouts, MONA), { code: 'LAYOUT_BLOCKED', message: /A1\.1/ })
  assert.equal((await layouts.layout(ANNA)).layout, null); assert.deepEqual(Object.keys((await repo.read('TCD')).locations), ['A1.1'])
  assert.ok((await layouts.draft(MONA)).draft, 'the draft is kept')
})

test('without a draft there is nothing to preview or publish; a discarded draft is replaced by a fresh one in the same write', async () => {
  const { layouts } = setup()
  await assert.rejects(layouts.previewPublish(MONA), { code: 'LAYOUT_NO_DRAFT' })
  await assert.rejects(layouts.publish(MONA), { code: 'LAYOUT_NO_DRAFT' })
  const { draft: started } = await layouts.startDraft(MONA)
  await layouts.saveDraft(MONA, { draft: { ...started, items: [rackWith([P('s1', 'A1.1')])] } })
  const { ok, draft } = await layouts.discardDraft(MONA)
  assert.equal(ok, true)
  assert.deepEqual([draft.items, draft.basedOn, draft.editedBy.email], [[], 0, 'mona@x.test'], 'the published drawing (none yet) again')
  assert.equal(draft.rev, 3, 'above the discarded revision, so a PC holding it cannot save it back')
  assert.deepEqual(await layouts.draft(MONA), { draft, version: 0 })
  await assert.rejects(layouts.saveDraft(MONA, { draft: { ...started, rev: 2 } }), { code: 'LAYOUT_STALE' })
})

test('only the admin who edits the draft can publish it; another admin takes over first', async () => {
  const { layouts, repo } = setup()
  const { draft } = await layouts.startDraft(MONA)
  await layouts.saveDraft(MONA, { draft: { ...draft, items: [rackWith([P('s1', 'A1.1')])] } })
  const before = await repo.read('TCD')
  await assert.rejects(publishNow(layouts, ADA), err => err.code === 'LAYOUT_DRAFT_BUSY' && /Mona redigerer tegningen/.test(err.message))
  assert.equal((await layouts.layout(ANNA)).layout, null, 'no drawing is published')
  assert.deepEqual(await repo.read('TCD'), before, 'no place or event is written')
  assert.equal((await layouts.draft(MONA)).draft.editedBy.email, 'mona@x.test', 'the draft is kept as it is')
  const { draft: mona } = await layouts.draft(ADA)
  await layouts.saveDraft(ADA, { draft: mona, takeOver: true })
  assert.equal((await publishNow(layouts, ADA)).version, 1)
})

test('after a publish or a discard the fresh draft is free: the next admin edits it without being told someone else is', async () => {
  const { layouts } = setup()
  const { draft: started } = await layouts.startDraft(ADA)
  await layouts.saveDraft(ADA, { draft: { ...started, items: [rackWith([P('s1', 'A1.1')])] } })
  assert.equal((await publishNow(layouts, ADA)).version, 1)
  const { draft: afterPublish } = await layouts.draft(MONA)
  assert.equal(afterPublish.editedBy.email, 'ada@x.test', 'still names who published, for 1.6.6')
  const saved = await layouts.saveDraft(MONA, { draft: { ...afterPublish, notes: 'Monas' } })
  assert.equal((await layouts.draft(MONA)).draft.editedBy.email, 'mona@x.test', 'Mona edits it now, without a takeover')
  assert.equal('free' in (await layouts.draft(MONA)).draft, false, 'once edited it is owned again')
  assert.equal(saved.rev, afterPublish.rev + 1)
  await assert.rejects(layouts.saveDraft(ADA, { draft: (await layouts.draft(ADA)).draft }), { code: 'LAYOUT_DRAFT_BUSY' })

  await layouts.discardDraft(MONA)
  const { draft: afterDiscard } = await layouts.draft(ADA)
  await layouts.saveDraft(ADA, { draft: { ...afterDiscard, notes: 'Adas' } })
  assert.equal((await layouts.draft(ADA)).draft.editedBy.email, 'ada@x.test')
})

test('only the admin who edits the draft can discard it; another admin takes over first', async () => {
  const { layouts } = setup()
  const { draft } = await layouts.startDraft(MONA)
  await assert.rejects(layouts.discardDraft(ADA), err => err.code === 'LAYOUT_DRAFT_BUSY' && /Mona/.test(err.message))
  assert.ok((await layouts.draft(MONA)).draft, 'the draft is kept')
  await layouts.saveDraft(ADA, { draft, takeOver: true })
  const discarded = await layouts.discardDraft(ADA)
  assert.equal(discarded.ok, true)
  assert.equal((await layouts.draft(MONA)).draft.editedBy.email, 'ada@x.test', 'the fresh draft is the discarding admin\'s')
})

test('openVersion puts an old drawing back as a draft on top of the current one', async () => {
  const { layouts } = setup()
  const first = (await layouts.startDraft(MONA)).draft
  await layouts.saveDraft(MONA, { draft: { ...first, notes: 'første' } })
  await publishNow(layouts, MONA)
  const second = (await layouts.startDraft(MONA)).draft
  await layouts.saveDraft(MONA, { draft: { ...second, notes: 'anden' } })
  await publishNow(layouts, MONA)
  const { draft } = await layouts.openVersion(MONA, { version: 1 })
  assert.equal(draft.basedOn, 2)
  assert.deepEqual([draft.notes, draft.publishedAt, (await layouts.draft(MONA)).draft.basedOn], ['første', undefined, 2])
  await assert.rejects(layouts.openVersion(ADA, { version: 2 }), { code: 'LAYOUT_DRAFT_BUSY' })
  const { draft: opened } = await layouts.openVersion(ADA, { version: 2, takeOver: true })
  assert.equal(opened.notes, 'anden')
  await layouts.saveDraft(ADA, { draft: { ...opened, notes: 'tilbage' } })
  assert.deepEqual([(await layouts.draft(ADA)).draft.notes, (await publishNow(layouts, ADA)).version], ['tilbage', 3], 'an opened version saves and publishes')
  await assert.rejects(layouts.openVersion(ADA, { version: 9 }), { code: 'LAYOUT_INVALID' })
})
