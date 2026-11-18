// Hubert's live answers about Placeringer (Arbejdsværktøjer): read only, own team only, TCD and TRR only.
const test = require('node:test')
const assert = require('node:assert/strict')
const { createLocationsAssistant, locationsIntent } = require('./assistantLocations.cjs')

const ANNA = { email: 'anna@example.test', fullName: 'Anna Andersen', role: 'user', team: 'TCD' }
const DAY = 86400000
const NOW = Date.UTC(2026, 9, 21)
const place = (id, purpose, fixedMaterials = [], extra = {}) => ({ id, name: id, area: id.replace(/\d.*$/, ''), type: 'Palle', purpose, capacity: 1, fixedMaterials, active: true, note: '', ...extra })
const pallet = (id, location, material, days, quantity) => ({ id, location, material, quantity, receivedAt: NOW - days * DAY, ageDays: days, document: id === 'p1' ? '5000032337 2026 0001' : null, serials: [], sloc: 'D000', tags: [], note: '', description: 'Ethernet Cable RJ45 2m' })
const HOUR = 3600000
const person = name => ({ email: `${name.split(' ')[0].toLowerCase()}@example.test`, name })
const LOG = [
  { id: 'e1', tx: 't1', at: NOW + 11 * HOUR, by: person('Bo Berg'), type: 'take', location: 'A1.1', material: 'R162-0717', quantity: 5 },
  { id: 'e2', tx: 't2', at: NOW + 10 * HOUR, by: person('Anna Andersen'), type: 'move', from: 'C1.3', to: 'A1.1', material: 'R162-0717' },
  { id: 'e3', tx: 't3', at: NOW + 9 * HOUR, by: person('Carl Corp'), type: 'putaway', location: 'A1.10', material: 'R133-0032', quantity: 2 },
  { id: 'e4', tx: 't4', at: NOW - 2 * DAY, by: person('Dorte Dahl'), type: 'putaway', location: 'A1.1', material: 'R162-0717', quantity: 50 },
]
const TEXTS = { 'R162-0717': 'Ethernet Cable RJ45 2m', 'R133-0032': 'Move3500 12V DC car charger' }

function fakes({ team = 'TCD' } = {}) {
  const calls = []
  const write = name => async () => { calls.push([name]); throw new Error('Hubert must not write') }
  const reserve = [pallet('p1', 'A2.1', 'R162-0717', 701, 1120), pallet('p2', 'A2.4', 'R162-0717', 690, 50)]
  const service = {
    async materialCard(user, { material }) {
      calls.push(['materialCard', material])
      if (material !== 'R162-0717') return { material, description: TEXTS[material] || '', stations: [], pickPlaces: [], reserve: [], total: 0, history: [] }
      return { material, description: TEXTS[material], stations: [place('I8', 'station', [material])], pickPlaces: [{ ...place('H26', 'pick', [material]), state: 'empty', stateAt: NOW - DAY }], reserve, shelves: [{ location: 'E9 H5', name: 'E9 H5', quantity: 40 }, { location: 'E9 H2', name: 'E9 H2', quantity: 10 }], refillShelf: 'E9 H5', total: 1220, history: [] }
    },
    async locationCard(user, { location }) {
      calls.push(['locationCard', location])
      if (location === 'H26') return { location: place('H26', 'pick', ['R162-0717']), fixed: [{ material: 'R162-0717', description: TEXTS['R162-0717'], state: 'empty' }], occupancy: { used: 0, capacity: 1, free: 1 }, pallets: [], history: [] }
      if (location === 'E9 H5') return { location: place('E9 H5', 'reserve', [], { type: 'Hylde', rack: 'E9', shelf: 5 }), fixed: [], occupancy: { used: 0, capacity: 0, free: 0 }, pallets: [], stock: [{ id: 'E9 H5|R162-0717', location: 'E9 H5', material: 'R162-0717', quantity: 40, description: TEXTS['R162-0717'] }], history: [] }
      if (location === 'A2.1') return { location: place('A2.1', 'reserve'), fixed: [], occupancy: { used: 1, capacity: 1, free: 0 }, pallets: [reserve[0]], history: [] }
      throw Object.assign(new Error('LOCATION_NOT_FOUND'), { code: 'LOCATION_NOT_FOUND' })
    },
    async search(user, { query }) {
      calls.push(['search', query])
      const q = query.toLowerCase()
      const materials = Object.entries(TEXTS).filter(([material, text]) => material.toLowerCase().startsWith(q) || q.split(/\s+/).every(word => text.toLowerCase().includes(word))).map(([material, description]) => ({ material, description }))
      const pallets = /^\d{4,}/.test(q.replace(/\s/g, '')) ? reserve.filter(item => String(item.document || '').replace(/\s/g, '').startsWith(q.replace(/\s/g, ''))) : []
      return { materials, locations: [], pallets }
    },
    async rackCard(user, { rack }) {
      calls.push(['rackCard', rack])
      if (rack !== 'E9') throw Object.assign(new Error('RACK_INVALID'), { code: 'RACK_INVALID' })
      const shelf = (n, stock) => ({ location: place(`E9 H${n}`, 'reserve', [], { type: 'Hylde', rack: 'E9', shelf: n }), stock })
      return { rack: 'E9', area: 'E', purpose: 'reserve', shelves: [shelf(3, []), shelf(2, [{ material: 'R162-0717', quantity: 10, description: TEXTS['R162-0717'] }]), shelf(1, [{ material: 'R133-0032', quantity: 3, description: TEXTS['R133-0032'] }])], history: [] }
    },
    async suggest(user, { material }) { calls.push(['suggest', material]); return { slots: [{ location: 'A3.1', reason: 'near' }, { location: 'C1.1', reason: 'free' }], pickEmpty: place('H26', 'pick', [material]) } },
    async overview() { calls.push(['overview']); return { areas: [{ area: 'A', capacity: 10, used: 8, free: 2, empty: 0 }, { area: 'C', capacity: 20, used: 5, free: 15, empty: 0 }], empty: [{ location: 'H26', material: 'R162-0717', description: TEXTS['R162-0717'], since: NOW - DAY, suggestion: reserve[0] }], counts: { locations: 31, pallets: 13 }, imported: true, live: true, tags: [] } },
    async palletCard(user, { pallet: id }) { calls.push(['palletCard', id]); return { pallet: reserve.find(item => item.id === id), location: place('A2.1', 'reserve'), history: [] } },
    async log(user, request = {}) {
      calls.push(['log', request])
      const q = String(request.query || '').toUpperCase()
      const events = LOG.filter(event => !q || [event.location, event.from, event.to, event.material].some(value => value && value.toUpperCase().startsWith(q)))
      return { events: events.map(event => ({ ...event, canUndo: false })), canUndo: false, people: [] }
    },
    undo: write('undo'),
    putAway: write('putAway'), take: write('take'), move: write('move'), markEmpty: write('markEmpty'), refill: write('refill'), changeSloc: write('changeSloc'), editPallet: write('editPallet'),
  }
  const userFor = async () => {
    if (team !== 'TCD' && team !== 'TRR') throw Object.assign(new Error('WAREHOUSE_TEAM_NOT_ALLOWED'), { code: 'WAREHOUSE_TEAM_NOT_ALLOWED' })
    return { ...ANNA, team }
  }
  return { assistant: createLocationsAssistant({ userFor, service, now: () => NOW + 12 * HOUR }), calls }
}

const ask = (assistant, question, language = 'da') => assistant.answer({ event: {}, question, language })

test('recognises where/refill/free/contents/document/empty questions in four languages and leaves other questions alone', () => {
  const cases = [
    ['where', ['hvor henter jeg R162-0717?', 'hvor står R162-0717?', 'where is R162-0717?', 'where do I get R162-0717?', 'missä R162-0717 on?', 'mistä haen R162-0717?', 'var står R162-0717?', 'var hämtar jag R162-0717?', 'hvor henter jeg ethernet kabler?', 'where is the pallet with r162-0717']],
    ['refill', ['H26 er tom', 'H26 er løbet tør', 'hvad skal jeg fylde H26 op med?', 'what do I refill H26 with?', 'H26 is empty', 'millä täytän H26?', 'H26 är tom', 'vad fyller jag på H26 med?']],
    ['free', ['hvor er der en ledig plads til R162-0717?', 'er der en ledig placering?', 'is there a free place for R133-0032?', 'onko vapaata paikkaa R162-0717?', 'finns det en ledig plats för R162-0717?']],
    ['contents', ['hvad står på A2.1?', 'what is on A2.1?', 'mitä A2.1:ssä on?', 'vad står på A2.1?']],
    ['find-document', ['hvor er 5000032337?', 'where is 4900229137 2026 01?', 'missä on 5000032337?', 'var är 5000032337?']],
    ['write', ['tag pallen på A2.1', 'flyt pallen fra A2.1 til A3.1', 'sæt pallen på A3.1', 'take the pallet on A2.1', 'move the pallet to A3.1', 'kan du tage pallen på A2.1?', 'siirrä lava A3.1', 'flytta pallen till A3.1']],
  ]
  for (const [intent, questions] of cases) for (const question of questions) assert.equal(locationsIntent(question)?.intent, intent, question)
  assert.equal(locationsIntent('hvor henter jeg R162-0717?').material, 'R162-0717')
  assert.equal(locationsIntent('hvad står på a2.1?').location, 'A2.1')
  assert.equal(locationsIntent('hvor er 5000032337?').document, '5000032337')
  assert.equal(locationsIntent('hvor henter jeg ethernet kabler?').query, 'ethernet kabler')
  for (const question of ['hvilke pluk-pladser er løbet tør?', 'which pick places have run empty?', 'hvordan sætter jeg en palle på plads?', 'how do I take a pallet?', 'hvor langt er optællingen?', 'hvor mange R162-0717 er der i optællingen?', 'hvem har ferie i dag?', 'hvor finder jeg vagtplanen?', 'hvad er MI31?', 'åbn optællingen', 'hvornår er der møde?', 'D000 storage location']) {
    assert.equal(locationsIntent(question), null, question)
  }
})

test('"hvor henter jeg R162-0717?" gives station, pick place with status and reserve pallets oldest first, with descriptions', async () => {
  const { assistant } = fakes()
  const answer = await ask(assistant, 'hvor henter jeg R162-0717?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /R162-0717 · Ethernet Cable RJ45 2m/)
  assert.match(answer.text, /I8/)
  assert.match(answer.text, /Pluk-plads: H26$/m, 'pick places have no status')
  assert.doesNotMatch(answer.text, /løbet tør|fyldt/)
  assert.ok(answer.text.indexOf('A2.1') < answer.text.indexOf('A2.4'), 'oldest first')
  assert.match(answer.text, /701 dage/)
  assert.deepEqual(answer.navigation, { view: 'warehouse', params: { tab: 'locations', itemId: 'material:R162-0717' }, label: 'Åbn R162-0717' })
  assert.deepEqual(answer.sources, [{ kind: 'warehouse', teamId: 'TCD', title: 'TCD · Placeringer' }])
  const english = await ask(assistant, 'where is R162-0717?', 'en')
  assert.match(english.text, /Pick place: H26$/m)
  assert.match(english.text, /701 days/)
})

test('"hvor henter jeg ethernet kabler?" finds the material by its description', async () => {
  const { assistant, calls } = fakes()
  const answer = await ask(assistant, 'hvor henter jeg ethernet kabler?')
  assert.match(answer.text, /R162-0717 · Ethernet Cable RJ45 2m/)
  assert.ok(calls.some(([name]) => name === 'search'))
  assert.equal(await ask(assistant, 'hvor henter jeg flyvende tallerkener?'), null, 'nothing found: the question is left to Hubert')
  assert.match((await ask(assistant, 'hvor står pallerne med flyvende tallerkener?')).text, /fandt intet/i, 'naming pallets keeps the answer')
})

test('"H26 er tom" suggests the oldest reserve pallet with a button', async () => {
  const { assistant } = fakes()
  const answer = await ask(assistant, 'H26 er tom')
  assert.match(answer.text, /H26/)
  assert.match(answer.text, /A2\.1/)
  assert.doesNotMatch(answer.text, /A2\.4/, 'only the oldest is suggested')
  assert.deepEqual(answer.navigation.params, { tab: 'locations', itemId: 'refill:H26|R162-0717' })
  assert.equal(await ask(assistant, 'hvilke pluk-pladser er løbet tør?'), null, 'no "run empty" list any more')
  const free = await ask(assistant, 'hvor er der en ledig plads til R162-0717?')
  assert.match(free.text, /A3\.1/)
  assert.doesNotMatch(free.text, /H26/, 'no empty pick place is offered')
  const contents = await ask(assistant, 'hvad står på A2.1?')
  assert.match(contents.text, /1\.120/)
  const document = await ask(assistant, 'hvor er 5000032337?')
  assert.match(document.text, /A2\.1/)
  assert.deepEqual(document.navigation.params, { tab: 'locations', itemId: 'pallet:p1' })
})

test('Hubert never changes anything: write requests get "kun læse" and no service write is called', async () => {
  const { assistant, calls } = fakes()
  for (const question of ['tag pallen på A2.1', 'flyt pallen fra A2.1 til A3.1', 'move the pallet to A3.1']) {
    const answer = await ask(assistant, question, question.startsWith('move') ? 'en' : 'da')
    assert.match(answer.text, /kun læse|only read/)
    assert.deepEqual(answer.navigation.params, { tab: 'locations' })
  }
  assert.deepEqual(calls.filter(([name]) => ['putAway', 'take', 'move', 'markEmpty', 'refill', 'changeSloc', 'editPallet'].includes(name)), [])
  assert.equal(await ask(assistant, 'hvad står på Z99?'), null, 'an unknown place-like token falls through')
})

test('another hub is told Placeringer is only for TCD and TRR', async () => {
  const { assistant, calls } = fakes({ team: 'PIM' })
  const answer = await ask(assistant, 'hvor henter jeg R162-0717?')
  assert.match(answer.text, /kun i TCD- og TRR-hubben/)
  assert.deepEqual(calls, [])
  assert.equal(await ask(assistant, 'hvem har ferie i dag?'), null)
})

test('questions that only look like Placeringer fall through to Hubert\'s other answers, in every hub', async () => {
  const OTHERS = ['hvor får jeg adgang til SharePoint?', 'where do I get a new password?', 'hvor er printer P2?', 'hvor får jeg A4 papir?', 'Hvor er mødelokale M3?', 'hvor er W11 opdateringen?', 'var får jag ett nytt lösenord?']
  const tcd = fakes()
  for (const question of OTHERS) assert.equal(await ask(tcd.assistant, question), null, `TCD: ${question}`)
  const pim = fakes({ team: 'PIM' })
  for (const question of OTHERS) assert.equal(await ask(pim.assistant, question), null, `PIM: ${question}`)
  assert.match((await ask(pim.assistant, 'hvor står pallen med R162-0717?')).text, /kun i TCD- og TRR-hubben/, 'a real Placeringer question still gets the hub answer')
  assert.match((await ask(tcd.assistant, 'hvad står der på placeringen Z99?')).text, /Z99/, 'naming Placeringer keeps the "does not exist" answer')
})

test('history questions about a place, material or 49/50 number are recognised in four languages', () => {
  const cases = [['hvad er der sket med A1.1 i dag?', 'A1.1'], ['hvem flyttede pallen fra C1.3?', 'C1.3'], ['what happened to A1.1 today?', 'A1.1'], ['mitä A1.1:lle on tapahtunut?', 'A1.1'], ['vad har hänt med A1.1?', 'A1.1'], ['hvad er der sket med R162-0717?', 'R162-0717']]
  for (const [question, token] of cases) {
    const asked = locationsIntent(question)
    assert.equal(asked?.intent, 'history', question)
    assert.equal(asked.token, token, question)
  }
  assert.equal(locationsIntent('hvad er der sket med A1.1 i dag?').today, true)
  assert.equal(locationsIntent('hvem flyttede pallen fra C1.3?').today, false)
})

test('Hubert answers from the log: the latest lines newest first, only the place asked about, with a button to the log', async () => {
  const { assistant } = fakes()
  const today = await ask(assistant, 'hvad er der sket med A1.1 i dag?')
  assert.equal(today.mode, 'data')
  assert.match(today.text, /\d{2}[:.]\d{2} · Bo Berg · Taget fra A1\.1 · 5/)
  assert.match(today.text, /Anna Andersen · Flyttet C1\.3 → A1\.1/)
  assert.ok(today.text.indexOf('Bo Berg') < today.text.indexOf('Anna Andersen'), 'newest first')
  assert.doesNotMatch(today.text, /Carl Corp/, 'A1.10 is another place')
  assert.doesNotMatch(today.text, /Dorte Dahl/, 'two days ago is not today')
  assert.deepEqual(today.navigation, { view: 'warehouse', params: { tab: 'locations', itemId: 'log:A1.1' }, label: 'Åbn loggen' })
  const all = await ask(assistant, 'hvad er der sket med A1.1?')
  assert.match(all.text, /Dorte Dahl/, 'without "i dag" older lines count too')
  const moved = await ask(assistant, 'hvem flyttede pallen fra C1.3?')
  assert.match(moved.text, /Anna Andersen · Flyttet C1\.3 → A1\.1/)
  assert.equal(moved.navigation.params.itemId, 'log:C1.3')
  assert.match((await ask(assistant, 'what happened to A1.1 today?', 'en')).text, /Bo Berg · Taken from A1\.1 · 5/)
  assert.match((await ask(assistant, 'vad har hänt med A1.1?', 'sv')).text, /Bo Berg · Tagen från A1\.1 · 5/)
  assert.match((await ask(assistant, 'mitä A1.1:lle on tapahtunut?', 'fi')).text, /Bo Berg · Otettu paikasta A1\.1 · 5/)
  assert.match((await ask(assistant, 'hvad er der sket med placeringen C9.9?')).text, /Ingen handlinger i loggen for C9\.9/)
  assert.equal(await ask(assistant, 'hvad er der sket med P2?'), null, 'a place-like token with nothing in the log falls through')
})

test('Hubert never undoes: "fortryd" requests get a read-only answer pointing to the log, and undo is never called', async () => {
  const { assistant, calls } = fakes()
  const answer = await ask(assistant, 'fortryd at Anna tog pallen')
  assert.match(answer.text, /fortryder aldrig/)
  assert.match(answer.text, /Placerings admin/)
  assert.deepEqual(answer.navigation.params, { tab: 'locations', itemId: 'log' })
  const place = await ask(assistant, 'kan du fortryde det Bo gjorde på A1.1?')
  assert.deepEqual(place.navigation.params, { tab: 'locations', itemId: 'log:A1.1' })
  assert.match((await ask(assistant, 'undo the move of the pallet on A1.1', 'en')).text, /never undo/)
  assert.deepEqual(calls.filter(([name]) => name === 'undo'), [])
  assert.equal(locationsIntent('peru lavan siirto A1.1')?.intent, 'undo')
  assert.equal(locationsIntent('ångra flytten av pallen på A1.1')?.intent, 'undo')
  assert.notEqual(locationsIntent('perustiedot A1.1')?.intent, 'undo', 'a Finnish word that only starts like "peru"')
})

test('shelves and racks: "E9 H5" is one place, rack questions in four languages, and write requests stay read-only', () => {
  assert.deepEqual(locationsIntent('hvad står på E9 H5?'), { intent: 'contents', location: 'E9 H5', strong: true }, 'a shelf name is specific enough to be Placeringer')
  for (const question of ['hvad står i reol E9?', 'what is in rack E9?', 'mitä hyllykössä E9 on?', 'vad står i reol E9?']) {
    assert.deepEqual([locationsIntent(question)?.intent, locationsIntent(question)?.rack], ['rack', 'E9'], question)
  }
  for (const question of ['læg 10 på E9 H5', 'slet placeringen A1.1', 'delete the rack E9']) assert.equal(locationsIntent(question)?.intent, 'write', question)
  assert.equal(locationsIntent('slet P2'), null, 'a place-like token alone is not enough to answer')
})

test('Hubert names the shelves where a material stands, lists a shelf and a rack with a button', async () => {
  const { assistant } = fakes()
  assert.match((await ask(assistant, 'hvor henter jeg R162-0717?')).text, /^Hylder: E9 H5 \(40 stk\.\), E9 H2 \(10 stk\.\)$/m)
  assert.match((await ask(assistant, 'where is R162-0717?', 'en')).text, /^Shelves: E9 H5 \(40 pcs\)/m)
  const shelf = await ask(assistant, 'hvad står på E9 H5?')
  assert.match(shelf.text, /R162-0717 · Ethernet Cable RJ45 2m – 40 stk\./)
  assert.deepEqual(shelf.navigation.params, { tab: 'locations', itemId: 'location:E9 H5' })
  const rack = await ask(assistant, 'hvad står i reol E9?')
  assert.ok(rack.text.indexOf('E9 H3') < rack.text.indexOf('E9 H2'), 'highest shelf first')
  assert.match(rack.text, /E9 H3: tom/)
  assert.match(rack.text, /E9 H2: R162-0717 · Ethernet Cable RJ45 2m – 10 stk\./)
  assert.deepEqual(rack.navigation, { view: 'warehouse', params: { tab: 'locations', itemId: 'rack:E9' }, label: 'Åbn reol E9' })
  assert.match((await ask(assistant, 'what is in rack E9?', 'en')).text, /^Rack E9:/)
  assert.match((await ask(assistant, 'hvad står i reol X1?')).text, /Reolen X1 findes ikke/)
})

test('shelf and rack words alone do not take other questions; a shelf name needs a real place', () => {
  const quarter = locationsIntent('hvad var tallene i Q3 H1?')
  assert.ok(quarter === null || (quarter.location !== 'Q3 H1' && !quarter.strong), 'Q3 H1 is a quarter, not a shelf')
  for (const question of ['where are the tiles on my rack?', 'hvor er hylden til returvarer?', 'var ligger hyllan med kartonger?']) {
    assert.equal(locationsIntent(question), null, question)
  }
  assert.equal(locationsIntent('hvor står R162-0717 på hylderne?')?.intent, 'where', 'with a material it is still Placeringer')
  assert.equal(locationsIntent('hvad står i reol E9?')?.intent, 'rack')
})
