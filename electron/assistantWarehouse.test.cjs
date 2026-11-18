// Hubert's live answers about Optælling (Arbejdsværktøjer): read only, own team only, TCD and TRR only.
const test = require('node:test')
const assert = require('node:assert/strict')
const { createWarehouseAssistant, warehouseIntent } = require('./assistantWarehouse.cjs')

const ANNA = { email: 'anna@example.test', fullName: 'Anna Andersen', role: 'user', team: 'TCD' }
const person = (email, name) => ({ email, name })
const entry = (id, name, status, percent, owner) => ({ id, name, status, owner, summary: { percent, reached: percent, total: 100, valueDiff: -10, updatedAt: 1 }, scope: { type: 'slocs', slocs: ['D000'] }, members: 1, requests: 0, myStatus: null, createdAt: 1, fetchedAt: 1 })
const ACTIVE = { id: 'st1', team: 'TCD', name: 'Status Q4 2026', state: 'open', startedBy: person('mona@example.test', 'Mona'), startedAt: Date.UTC(2026, 9, 1), history: [], progress: { counts: 2, closed: 1, reached: 450, total: 1000, percent: 45, valueDiff: -1234.5 }, counts: [entry('c1', 'D000 terminaler', 'open', 30, person('anna@example.test', 'Anna Andersen')), entry('c2', 'D000 tilbehør', 'closed', 100, person('mona@example.test', 'Mona'))] }
const LOCKED = { ...ACTIVE, id: 'st0', name: 'Status Q3 2026', state: 'locked', lockedAt: Date.UTC(2026, 6, 30), lockedBy: person('mona@example.test', 'Mona'), counts: [] }
const row = (material, diff, valueDiff, stockType = 'unrestricted') => ({ material, description: `${material} tekst`, sloc: 'D000', stockType, sapQty: 10, counted: 10 + diff, diff, valueDiff })

function fakes({ active = ACTIVE, team = 'TCD' } = {}) {
  const calls = []
  const counts = {
    async statusOverview(user) { calls.push(['statusOverview', user.email]); return { active, statuses: [active, LOCKED].filter(Boolean), unassigned: [], canManage: false } },
    async readCount(user, id) {
      calls.push(['readCount', id])
      if (id === 'c1') return { meta: { id, name: 'D000 terminaler' }, rows: [row('INT4300-4921-0', -2, -2000), row('R162-0717', 0, 0)], approvals: {}, claims: [{ area: 'A', name: 'Bo Berg', email: 'bo@example.test' }], materialLocks: [{ material: 'INT4300-4921-0', holder: person('anna@example.test', 'Anna Andersen'), helpers: [], requests: [] }], progress: {} }
      return { meta: { id, name: 'D000 tilbehør' }, rows: [row('R092-0039', -22, -13586.98), row('R133-0032', 3, 15)], approvals: { 'R092-0039': { status: 'posted' } }, claims: [], materialLocks: [], progress: {} }
    },
    async statusArchive(user, id) { calls.push(['statusArchive', id]); return { totals: { absPercent: 71.75, valuePercent: 99.49, absDiff: 6239, sapQty: 8695, valueAbs: 2274011.77, sapValue: 2285763.75 }, counts: [], lines: [] } },
  }
  const piDocs = {
    async list(user, id) {
      calls.push(['piDocs.list', id])
      if (id !== 'c2') return { docs: [] }
      return { docs: [{ id: 'd1', docNo: '105900001', sloc: 'D000', status: 'printed', next: 'count', lines: [{ material: 'R092-0039' }] }, { id: 'd2', docNo: '105900002', sloc: 'D000', status: 'counted', next: 'post', lines: [{ material: 'R133-0032' }] }, { id: 'd3', docNo: '105900003', status: 'deleted', next: null, lines: [] }] }
    },
  }
  const userFor = async () => {
    if (team !== 'TCD' && team !== 'TRR') throw Object.assign(new Error('WAREHOUSE_TEAM_NOT_ALLOWED'), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' })
    return { ...ANNA, team }
  }
  return { assistant: createWarehouseAssistant({ userFor, counts, piDocs }), calls }
}

const ask = (assistant, question, language = 'da') => assistant.answer({ event: {}, question, language })

test('recognises what is asked about Optælling in all four languages, and leaves how-to, SAP codes and other topics to Hubert', () => {
  const cases = [
    ['status', ['hvor langt er optællingen?', 'how far is the stock count?', 'kuinka pitkällä inventointi on?', 'hur långt har inventeringen kommit?', 'hvad er fremdriften i optællingen?']],
    ['counts', ['hvilke optællinger er åbne?', 'which stock counts are open?', 'mitkä inventoinnit ovat avoinna?', 'vilka inventeringar är öppna?']],
    ['differences', ['hvilke materialer har difference i optællingen?', 'which materials have a difference in the stock count?', 'millä materiaaleilla on erotus inventoinnissa?', 'vilka material har differens i inventeringen?']],
    ['documents', ['hvilke SAP-dokumenter venter?', 'which SAP documents are waiting?', 'mitkä SAP-asiakirjat odottavat?', 'vilka SAP-dokument väntar?']],
    ['who', ['hvem tæller hvad i optællingen?', 'who is counting what in the stock count?', 'kuka laskee mitä inventoinnissa?', 'vem räknar vad i inventeringen?']],
    ['archive', ['hvad var differencen i sidste låste status i optællingen?', 'what was the difference in the last locked stock count status?', 'mikä oli erotus viimeisin lukittu inventointi status?', 'vad var differensen i senaste låsta inventering status?']],
    ['open', ['åbn optællingen', 'open the stock count', 'avaa inventointi', 'öppna inventeringen', 'åbn arkivet i optælling']],
    ['write', ['slet optællingen', 'opret en optælling for D004', 'lås statussen i optællingen', 'delete the stock count', 'bogfør SAP-dokumentet', 'kan du godkende alle materialer i optællingen?', 'poista inventointi', 'ta bort inventeringen']],
  ]
  for (const [intent, questions] of cases) for (const question of questions) assert.equal(warehouseIntent(question)?.intent, intent, question)
  for (const question of ['hvordan opretter jeg en optælling?', 'how do I create a stock count?', 'hvem har ferie i dag?', 'hvad er status på min ferie?', 'MI31 optællingsdokument', 'hvordan bruger jeg ZMS_COUNT_SERIAL?', 'hvem er i TCD?']) assert.equal(warehouseIntent(question), null, question)
})

test('progress of the status in progress, with a button that opens it', async () => {
  const { assistant } = fakes()
  const answer = await ask(assistant, 'hvor langt er optællingen?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Status Q4 2026/)
  assert.match(answer.text, /45 %/)
  assert.match(answer.text, /1 af 2 optællinger er afsluttet/)
  assert.doesNotMatch(answer.text, /\.\./, 'no double full stop after "kr."')
  assert.deepEqual(answer.navigation, { view: 'warehouse', params: { itemId: 'status:st1' }, label: 'Åbn "Status Q4 2026"' })
  const english = await ask(assistant, 'how far is the stock count?', 'en')
  assert.match(english.text, /1 of 2 counts are closed/)
  assert.doesNotMatch(english.text, /[æøå]|Optælling/)
  assert.equal(english.navigation.label, 'Open "Status Q4 2026"')
})

test('without a status in progress Hubert says so and names the last locked one', async () => {
  const { assistant } = fakes({ active: null })
  const answer = await ask(assistant, 'hvor langt er optællingen?')
  assert.match(answer.text, /ingen igangværende status/)
  assert.match(answer.text, /Status Q3 2026/)
  assert.deepEqual(answer.navigation, { view: 'warehouse', params: { tab: 'counts' }, label: 'Åbn Optælling' })
})

test('the counts, the materials with a difference (largest value first), the SAP documents waiting and who counts what', async () => {
  const { assistant } = fakes()
  const counts = await ask(assistant, 'hvilke optællinger er åbne?')
  assert.match(counts.text, /D000 terminaler — Åben · 30 % · Anna Andersen/)
  assert.match(counts.text, /D000 tilbehør — Afsluttet/)

  const diff = await ask(assistant, 'hvilke materialer har difference i optællingen?')
  const lines = diff.text.split('\n').filter(line => line.startsWith('•'))
  assert.deepEqual(lines.map(line => line.split(' ')[1]), ['R092-0039', 'INT4300-4921-0', 'R133-0032'])
  assert.match(lines[0], /-22 stk\..*bogført i SAP/i)
  assert.doesNotMatch(diff.text, /R162-0717/, 'no difference, not listed')

  const docs = await ask(assistant, 'hvilke SAP-dokumenter venter?')
  assert.match(docs.text, /105900001.*D000 tilbehør/)
  assert.match(docs.text, /antal/i)
  assert.match(docs.text, /105900002/)
  assert.doesNotMatch(docs.text, /105900003/, 'deleted documents wait for nothing')

  const who = await ask(assistant, 'hvem tæller hvad i optællingen?')
  assert.match(who.text, /Anna Andersen.*INT4300-4921-0/)
  assert.match(who.text, /Bo Berg.*område A/)
})

test('the last locked status shows its difference in percent and opens in the Archive', async () => {
  const { assistant } = fakes()
  const answer = await ask(assistant, 'hvad var differencen i sidste låste status i optællingen?')
  assert.match(answer.text, /Status Q3 2026/)
  assert.match(answer.text, /71,75 %/)
  assert.match(answer.text, /99,49 %/)
  assert.deepEqual(answer.navigation, { view: 'warehouse', params: { tab: 'archive', itemId: 'status:st0' }, label: 'Åbn "Status Q3 2026"' })
})

test('"open ..." gives a button: Optælling, the Archive or a named count', async () => {
  const { assistant } = fakes()
  assert.deepEqual((await ask(assistant, 'åbn optællingen')).navigation, { view: 'warehouse', params: { tab: 'counts' }, label: 'Åbn Optælling' })
  assert.deepEqual((await ask(assistant, 'åbn arkivet i optælling')).navigation, { view: 'warehouse', params: { tab: 'archive' }, label: 'Åbn Arkiv' })
  assert.deepEqual((await ask(assistant, 'åbn optællingen D000 tilbehør')).navigation, { view: 'warehouse', params: { itemId: 'c2' }, label: 'Åbn "D000 tilbehør"' })
  assert.equal((await ask(assistant, 'open the stock count', 'en')).navigation.label, 'Open Stock count')
})

test('Hubert never changes anything in Optælling: write requests get "I only read" and a button, and no service is called', async () => {
  const { assistant, calls } = fakes()
  for (const [question, language] of [['slet optællingen', 'da'], ['lås statussen i optællingen', 'da'], ['delete the stock count', 'en'], ['poista inventointi', 'fi'], ['ta bort inventeringen', 'sv']]) {
    const answer = await ask(assistant, question, language)
    assert.equal(answer.mode, 'data', question)
    assert.match(answer.text, /kun læse|only read|vain lukea|bara läsa/, question)
    assert.equal(answer.navigation.view, 'warehouse')
  }
  assert.deepEqual(calls, [])
})

test('other hubs are told Optælling is only for TCD and TRR, and nothing is read', async () => {
  const { assistant, calls } = fakes({ team: 'PIM' })
  const answer = await ask(assistant, 'hvor langt er optællingen?')
  assert.match(answer.text, /kun i TCD- og TRR-hubben/)
  assert.equal(answer.navigation, undefined)
  assert.match((await ask(assistant, 'which stock counts are open?', 'en')).text, /only in the TCD and TRR hubs/)
  assert.deepEqual(calls, [])
})

test('questions that are not about Optælling are left alone', async () => {
  const { assistant, calls } = fakes()
  assert.equal(await ask(assistant, 'hvem har ferie i dag?'), null)
  assert.equal(await ask(assistant, 'hvordan opretter jeg en optælling?'), null)
  assert.deepEqual(calls, [])
})
