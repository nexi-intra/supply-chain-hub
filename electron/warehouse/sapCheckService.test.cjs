const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../store.cjs')
const { createSapCheckService } = require('./sapCheckService.cjs')

const stock = (material, sloc, unrestricted, blocked = 0) => ({ material, description: `${material} tekst`, plant: 'D301', sloc, unrestricted, blocked })
const serial = (serialNo, material, sloc, stockType = 'unrestricted') => ({ serial: serialNo, material, description: material, plant: 'D301', sloc, userStatus: '', stockType })

const ANNA = { email: 'anna@example.test', fullName: 'Anna', role: 'user', team: 'TCD' }
const ADA = { email: 'ada@example.test', fullName: 'Ada', role: 'user', team: 'TCD' }
const MONA = { email: 'mona@example.test', fullName: 'Mona', role: 'manager', team: 'TCD' }
const TRINE = { email: 'trine@example.test', fullName: 'Trine', role: 'user', team: 'TRR' }
const reportRow = (material, sloc, unrestricted, serialsUnrestricted, blocked = 0, serialsBlocked = 0) => ({ material, plant: 'D301', sloc, unrestricted, serialsUnrestricted, blocked, serialsBlocked })

function setup({ keep } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'countpoint-sapcheck-'))
  const stores = new Map()
  const storeFor = team => {
    if (!stores.has(team)) stores.set(team, createStore(path.join(root, team)))
    return stores.get(team)
  }
  const clock = { now: Date.UTC(2026, 9, 19, 8) }
  const sap = {
    mb52: [stock('INT4100-4921-0', 'D000', 3), stock('INT4300-4921-0-R', 'D005', 2), stock('INT4300-4921-0-R', 'D004', 1)],
    serials: [serial('N1', 'INT4100-4921-0', 'D000'), serial('N2', 'INT4100-4921-0', 'D000'), serial('N3', 'INT4100-4921-0', 'D000'), serial('N4', 'INT4100-4921-0', 'D000'), serial('U9', 'INT4300-4921-0-R', 'D004')],
    report: [],
    reportFails: false,
  }
  const drafts = []
  const outlook = { fail: false }
  let ids = 0
  const service = createSapCheckService({
    sharedStore: createStore(path.join(root, 'Faelles')),
    storeFor,
    fetcher: {
      fetchPlant: async () => ({ mb52: sap.mb52, serials: sap.serials, sapUser: 'D00K418', fetchedAt: clock.now }),
      fetchStockCheck: async () => { if (sap.reportFails) throw Object.assign(new Error('timeout'), { code: 'SAP_TIMEOUT' }); return sap.report },
    },
    roles: { roleOf: async user => (user.role === 'manager' ? 'manager' : user.email === ADA.email ? 'admin' : 'user') },
    reportWriter: { sapCheck: async (team, data) => path.join(root, 'rapporter', `SAP-fejl ${team} ${data.mode} ${data.errors.length}${data.language === 'en' ? ' en' : ''}.xlsx`) },
    drafter: { draft: async draft => { if (outlook.fail) throw Object.assign(new Error('no-outlook'), { code: 'OUTLOOK_UNAVAILABLE' }); drafts.push(draft) } },
    now: () => clock.now,
    newId: () => `chk${String(++ids).padStart(4, '0')}`,
    keep,
  })
  return { service, sap, clock, drafts, outlook, storeFor, tick: ms => { clock.now += ms } }
}

test('the checks are shared by TCD and TRR: chosen scope, follow-up per storage location, SAP\'s own report and mail per team', async () => {
  const ctx = setup()
  ctx.sap.mb52.push(stock('INT4300-4921-0-R', 'D002', 5))
  ctx.sap.report = [reportRow('INT4100-4921-0', 'D000', 3, 4), reportRow('INT9100-1000-0', 'D005', 5, 4), reportRow('INT4300-4921-0-R', 'D002', 5, 0)]
  const tcd = await ctx.service.run(ANNA)
  assert.equal(tcd.scope, 'TCD')
  assert.deepEqual(tcd.errors.map(error => `${error.material}:${error.sloc}:${error.source}`), ['INT4100-4921-0:D000:both', 'INT9100-1000-0:D005:sap-report', 'INT4300-4921-0-R:D005:countpoint'])
  assert.deepEqual(tcd.comparison, { ran: true, error: null, rows: 3, both: 1, onlyCountPoint: 1, onlyReport: 1 })

  ctx.tick(1000)
  const all = await ctx.service.run(TRINE, { scope: 'D301' })
  assert.equal(all.slocs.length, 12)
  assert.deepEqual(all.errors.map(error => `${error.material}:${error.sloc}:${error.status}`), ['INT4100-4921-0:D000:open', 'INT9100-1000-0:D005:open', 'INT4300-4921-0-R:D002:new', 'INT4300-4921-0-R:D005:open'], 'TCD errors are followed up from the TCD check, TRR errors are new')
  assert.equal(all.by.team, 'TRR')
  assert.equal((await ctx.service.overview(ANNA)).latest.id, all.id, 'TCD sees the check TRR made')
  assert.equal((await ctx.service.latest(ANNA)).id, all.id)
  await assert.rejects(ctx.service.run(ANNA, { scope: 'X' }), { code: 'SAP_CHECK_SCOPE_INVALID' })

  const mail = await ctx.service.createMail(MONA, { id: all.id, mode: 'all', scope: 'TRR' })
  assert.equal(mail.count, 1)
  assert.match(ctx.drafts[0].subject, /^SAP-fejl D301 TRR /)
  assert.match(ctx.drafts[0].html, /D001, D002, D003/)
  await ctx.service.createMail(MONA, { id: all.id, mode: 'all' })
  assert.match(ctx.drafts[1].subject, /^SAP-fejl D301 TCD \+ TRR .* 4 fejl/)
  assert.deepEqual((await ctx.service.overview(TRINE)).latest.mails.map(item => item.scope), ['TRR', 'D301'])

  ctx.sap.reportFails = true
  ctx.tick(1000)
  const failed = await ctx.service.run(ANNA)
  assert.deepEqual([failed.comparison.ran, /ZMS_STOCK_SER_CHK2/.test(failed.comparison.error)], [false, true], 'the check is kept when SAP\'s report fails')
})

test('the SAP team address saved by a team before the checks were shared is still used', async () => {
  const ctx = setup()
  await ctx.storeFor('TCD').setAsync('sap-tjek-indstillinger', { to: 'old@example.test', cc: '', language: 'en' })
  assert.deepEqual([(await ctx.service.overview(ANNA)).settings.to, (await ctx.service.overview(ANNA)).settings.language], ['old@example.test', 'en'])
})

test('anyone in the team runs the check; the next check shows what is new, still open and fixed', async () => {
  const ctx = setup()
  const first = await ctx.service.run(ANNA)
  assert.deepEqual(first.errors.map(error => `${error.type}:${error.status}`), ['count-mismatch:new', 'stock-without-serials:new'])
  assert.deepEqual(first.slocs, ['D000', 'D004', 'D005', 'D006', 'D102', 'D103', 'D104', 'D105', 'D106'])
  assert.deepEqual([first.by.name, first.sapUser, first.summary.total, first.summary.new], ['Anna', 'D00K418', 2, 2])

  ctx.tick(86_400_000)
  ctx.sap.mb52 = [stock('INT4100-4921-0', 'D000', 4), stock('INT4300-4921-0-R', 'D005', 2), stock('INT4300-4921-0-R', 'D004', 1)]
  ctx.sap.serials = [...ctx.sap.serials, serial('B1', 'INT4100-4921-0', 'D000', 'blocked')]
  const second = await ctx.service.run(ANNA)
  assert.deepEqual(second.errors.map(error => `${error.type}:${error.status}:${error.firstSeen === first.at}`), ['stock-without-serials:open:true', 'serials-without-stock:new:false'])
  assert.deepEqual(second.fixed.map(error => error.type), ['count-mismatch'])

  const overview = await ctx.service.overview(ANNA)
  assert.equal(overview.latest.id, second.id)
  assert.deepEqual(overview.history.map(entry => entry.id), [second.id, first.id])
  assert.deepEqual([overview.role, overview.canMail], ['user', false])
  assert.deepEqual((await ctx.service.latest(ANNA)).summary, second.summary)
})

test('only admins and managers set the SAP team address and make the mail; it opens as an Outlook draft', async () => {
  const ctx = setup()
  const check = await ctx.service.run(ANNA)
  await assert.rejects(ctx.service.setSettings(ANNA, { to: 'sap@example.test' }), { code: 'ADMIN_ONLY' })
  await assert.rejects(ctx.service.createMail(ANNA, { id: check.id, mode: 'all' }), { code: 'ADMIN_ONLY' })
  await assert.rejects(ctx.service.setSettings(ADA, { to: 'not an address' }), { code: 'SAP_CHECK_SETTINGS_INVALID' })
  await assert.rejects(ctx.service.setSettings(ADA, { to: 'a@example.test<script>' }), { code: 'SAP_CHECK_SETTINGS_INVALID' })
  const settings = await ctx.service.setSettings(ADA, { to: 'SAP-Team@Example.test, sap2@example.test', cc: 'mona@example.test', language: 'en' })
  assert.deepEqual([settings.to, settings.cc, settings.language, settings.updatedBy.name], ['sap-team@example.test; sap2@example.test', 'mona@example.test', 'en', 'Ada'])

  const mail = await ctx.service.createMail(ADA, { id: check.id, mode: 'all', language: 'en' })
  assert.deepEqual([mail.count, mail.file], [2, 'SAP-fejl TCD all 2 en.xlsx'])
  const draft = ctx.drafts[0]
  assert.deepEqual([draft.to, draft.cc], ['sap-team@example.test; sap2@example.test', 'mona@example.test'])
  assert.match(draft.subject, /^SAP errors D301 TCD 2026-10-19 – 2 errors/)
  assert.match(draft.html, /Stock without serial numbers/)
  assert.match(draft.attachment, /SAP-fejl TCD all 2 en\.xlsx$/)
  const overview = await ctx.service.overview(MONA)
  assert.deepEqual([overview.latest.mail.by.name, overview.latest.mail.mode, overview.latest.mail.language, overview.history[0].mail.count, overview.canMail, overview.settings.language], ['Ada', 'all', 'en', 2, true, 'en'])
  await ctx.service.createMail(ADA, { id: check.id, mode: 'all', language: 'xx' })
  assert.match(ctx.drafts[1].subject, /^SAP-fejl D301/, 'unknown language = Danish')

  ctx.tick(1000)
  const again = await ctx.service.run(MONA)
  await assert.rejects(ctx.service.createMail(MONA, { id: again.id, mode: 'new' }), { code: 'SAP_CHECK_NOTHING' })
  ctx.outlook.fail = true
  await assert.rejects(ctx.service.createMail(MONA, { id: again.id, mode: 'all' }), error => error.code === 'OUTLOOK_UNAVAILABLE' && /SAP-fejl TCD all 2 en\.xlsx/.test(error.message))
  assert.equal((await ctx.service.overview(MONA)).latest.mail, null, 'no draft = not marked')
  await assert.rejects(ctx.service.createMail(MONA, { id: '../x', mode: 'all' }), { code: 'SAP_CHECK_NOT_FOUND' })
})

test('only the newest checks are kept', async () => {
  const ctx = setup({ keep: 3 })
  for (let i = 0; i < 5; i++) { ctx.tick(1000); await ctx.service.run(ANNA) }
  const overview = await ctx.service.overview(ANNA)
  assert.deepEqual(overview.history.map(entry => entry.id), ['chk0005', 'chk0004', 'chk0003'])
})
