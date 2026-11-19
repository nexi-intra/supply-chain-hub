const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { createStore } = require('./store.cjs')
const { createLinksService } = require('./links.cjs')

const people = [
  { email: 'anna@example.test', fullName: 'Anna Andersen', teamCode: 'TCD', role: 'user' },
  { email: 'mona@example.test', fullName: 'Mona Manager', teamCode: 'TCD', role: 'manager' },
  { email: 'bo@example.test', fullName: 'Bo Berg', teamCode: 'TRR', role: 'user' },
  { email: 'tore@example.test', fullName: 'Tore TRR-chef', teamCode: 'TRR', role: 'manager' },
  { email: 'sif@example.test', fullName: 'Sif SCN', teamCode: 'SCN', role: 'user' },
]
const teams = [{ folderName: 'TCD', name: 'TCD' }, { folderName: 'TRR', name: 'TRR' }, { folderName: 'SCN', name: 'SCN' }]
const actor = person => ({ email: person.email, role: person.role, home: { folderName: person.teamCode } })
const [anna, mona, bo, tore, sif] = people.map(actor)
const code = expected => error => error.code === expected
const op = (type, fields = {}) => ({ operationId: crypto.randomUUID(), type, ...fields })
const link = (fields = {}) => op('create', { url: 'https://portal.dhl.com/booking', title: 'DHL booking', description: 'Her booker vi afhentninger hos DHL', category: 'Transport', sharedWithTeamCodes: [], ...fields })

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-links-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const store = createStore(directory)
  let now = Date.UTC(2026, 9, 14, 8)
  const opened = []
  const service = createLinksService({
    getStore: () => store, getDirectory: async () => structuredClone({ people, teams }),
    now: () => (now += 1000), openExternal: async url => { opened.push(url) },
  })
  const ids = async who => (await service.snapshot(who)).links.map(item => item.title)
  return { service, store, opened, ids }
}

test('a colleague\'s new link waits for a manager in the same team and is hidden from everyone else', async t => {
  const f = await fixture(t)
  const created = await f.service.command(anna, link({ sharedWithTeamCodes: ['TRR'] }))
  assert.equal(created.status, 'pending')
  assert.deepEqual(await f.ids(anna), ['DHL booking'])
  assert.deepEqual(await f.ids(mona), ['DHL booking'])
  assert.deepEqual(await f.ids(bo), [])
  assert.deepEqual(await f.ids(tore), [])
  assert.deepEqual((await f.service.snapshot(mona)).review.pending.map(item => item.id), [created.id])
  assert.deepEqual((await f.service.snapshot(tore)).review.pending, [])
  await assert.rejects(f.service.command(tore, op('approve', { linkId: created.id })), code('LINKS_FORBIDDEN'))
  await assert.rejects(f.service.command(anna, op('approve', { linkId: created.id })), code('LINKS_FORBIDDEN'))
  await f.service.command(mona, op('approve', { linkId: created.id }))
  assert.deepEqual(await f.ids(bo), ['DHL booking'])
  assert.deepEqual(await f.ids(sif), [])
})

test('a manager\'s own link is approved straight away', async t => {
  const f = await fixture(t)
  assert.equal((await f.service.command(mona, link())).status, 'approved')
  assert.deepEqual(await f.ids(anna), ['DHL booking'])
})

test('a rejected link goes back to its creator with the reason and can be corrected', async t => {
  const f = await fixture(t)
  const created = await f.service.command(anna, link())
  await f.service.command(mona, op('reject', { linkId: created.id, note: 'Brug den officielle side' }))
  const mine = (await f.service.snapshot(anna)).links[0]
  assert.equal(mine.status, 'rejected')
  assert.equal(mine.reviewNote, 'Brug den officielle side')
  await f.service.command(anna, op('update', { linkId: created.id, url: 'https://www.dhl.com/booking', title: 'DHL booking', description: 'Officiel booking hos DHL', category: 'Transport', sharedWithTeamCodes: [] }))
  assert.equal((await f.service.snapshot(anna)).links[0].status, 'pending')
  await assert.rejects(f.service.command(bo, op('update', { linkId: created.id, url: 'https://evil.example', title: 'x', description: 'x'.repeat(12), category: '', sharedWithTeamCodes: [] })), code('LINKS_NOT_FOUND'))
})

test('unsafe or unknown input is refused before anything is stored', async t => {
  const f = await fixture(t)
  for (const fields of [{ url: 'javascript:alert(1)' }, { url: 'file:///C:/x.exe' }, { description: '' }, { title: '' }, { sharedWithTeamCodes: ['NOPE'] }, { extra: 1 }]) {
    await assert.rejects(f.service.command(anna, link(fields)), code('LINKS_INVALID'), JSON.stringify(fields))
  }
  assert.equal(await f.store.getAsync('link-library'), undefined)
})

test('the same address cannot be added twice in a team', async t => {
  const f = await fixture(t)
  await f.service.command(anna, link())
  await assert.rejects(f.service.command(anna, link({ url: 'https://PORTAL.dhl.com/booking' })), code('LINKS_DUPLICATE'))
})

test('a repeated operation id returns the first result instead of creating a second link', async t => {
  const f = await fixture(t)
  const command = link()
  const first = await f.service.command(anna, command)
  const again = await f.service.command(anna, command)
  assert.equal(again.id, first.id)
  assert.equal((await f.service.snapshot(anna)).links.length, 1)
})

test('suggestions are reviewed by a manager and only then change the link', async t => {
  const f = await fixture(t)
  const created = await f.service.command(mona, link({ sharedWithTeamCodes: ['TRR'] }))
  await f.service.command(bo, op('suggest', { linkId: created.id, url: 'https://www.dhl.com/new-booking', note: 'Den gamle side er død' }))
  assert.equal((await f.service.snapshot(anna)).links[0].url, 'https://portal.dhl.com/booking')
  const [suggestion] = (await f.service.snapshot(mona)).review.suggestions
  assert.equal(suggestion.url, 'https://www.dhl.com/new-booking')
  assert.equal(suggestion.byName, 'Bo Berg')
  await assert.rejects(f.service.command(tore, op('resolve-suggestion', { linkId: created.id, suggestionId: suggestion.id, accept: true })), code('LINKS_FORBIDDEN'))
  await f.service.command(mona, op('resolve-suggestion', { linkId: created.id, suggestionId: suggestion.id, accept: true }))
  assert.equal((await f.service.snapshot(bo)).links[0].url, 'https://www.dhl.com/new-booking')
  assert.deepEqual((await f.service.snapshot(mona)).review.suggestions, [])
})

test('a suspicious report hides the link from everyone but the team\'s managers until it is resolved', async t => {
  const f = await fixture(t)
  const created = await f.service.command(mona, link({ sharedWithTeamCodes: ['TRR'] }))
  await f.service.command(bo, op('report', { linkId: created.id, reason: 'suspicious', note: 'Beder om login' }))
  assert.deepEqual(await f.ids(anna), [])
  assert.deepEqual(await f.ids(bo), [])
  assert.deepEqual(await f.ids(mona), ['DHL booking'])
  await assert.rejects(f.service.open(anna, created.id), code('LINKS_NOT_FOUND'))
  const [report] = (await f.service.snapshot(mona)).review.reports
  assert.equal(report.reason, 'suspicious')
  await f.service.command(mona, op('resolve-report', { linkId: created.id, reportId: report.id, action: 'dismiss' }))
  assert.deepEqual(await f.ids(anna), ['DHL booking'])
})

test('a dead-link report keeps the link visible; resolving it with delete removes the link', async t => {
  const f = await fixture(t)
  const created = await f.service.command(mona, link())
  await f.service.command(anna, op('report', { linkId: created.id, reason: 'dead', note: '' }))
  await assert.rejects(f.service.command(anna, op('report', { linkId: created.id, reason: 'dead', note: '' })), code('LINKS_CONFLICT'))
  assert.deepEqual(await f.ids(anna), ['DHL booking'])
  const [report] = (await f.service.snapshot(mona)).review.reports
  await f.service.command(mona, op('resolve-report', { linkId: created.id, reportId: report.id, action: 'delete' }))
  assert.deepEqual(await f.ids(mona), [])
})

test('opening uses the stored address of a link you may see, never one from the screen', async t => {
  const f = await fixture(t)
  const created = await f.service.command(anna, link())
  await assert.rejects(f.service.open(bo, created.id), code('LINKS_NOT_FOUND'))
  await f.service.open(anna, created.id)
  await f.service.open(mona, created.id)
  await f.service.command(mona, op('approve', { linkId: created.id }))
  await assert.rejects(f.service.open(anna, 'missing'), code('LINKS_NOT_FOUND'))
  assert.deepEqual(f.opened, ['https://portal.dhl.com/booking', 'https://portal.dhl.com/booking'])
})

test('managers edit and delete their team\'s links directly; colleagues cannot', async t => {
  const f = await fixture(t)
  const created = await f.service.command(mona, link({ sharedWithTeamCodes: ['TRR'] }))
  const edit = { linkId: created.id, url: 'https://www.dhl.com/', title: 'DHL', description: 'Forsiden hos DHL Danmark', category: 'Transport', sharedWithTeamCodes: ['TRR', 'SCN'] }
  await assert.rejects(f.service.command(anna, op('update', edit)), code('LINKS_FORBIDDEN'))
  await assert.rejects(f.service.command(tore, op('update', edit)), code('LINKS_FORBIDDEN'))
  await f.service.command(mona, op('update', edit))
  assert.deepEqual(await f.ids(sif), ['DHL'])
  await assert.rejects(f.service.command(anna, op('delete', { linkId: created.id })), code('LINKS_FORBIDDEN'))
  await f.service.command(mona, op('delete', { linkId: created.id }))
  assert.deepEqual(await f.ids(sif), [])
})

test('the snapshot carries warnings for managers and never leaks e-mail addresses', async t => {
  const f = await fixture(t)
  await f.service.command(anna, link({ url: 'http://bit.ly/abc', title: 'Kort link' }))
  const snapshot = await f.service.snapshot(mona)
  assert.deepEqual(snapshot.review.pending[0].warnings.sort(), ['not-https', 'shortener'])
  assert.equal(snapshot.review.pending[0].createdByName, 'Anna Andersen')
  assert.ok(!JSON.stringify(await f.service.snapshot(bo)).includes('anna@example.test'))
  assert.ok(!JSON.stringify(snapshot).includes('anna@example.test'))
})
