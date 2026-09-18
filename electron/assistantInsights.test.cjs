// Kryds-modul-indsigter testet gennem den fulde pipeline (createAssistantContext),
// saa intents, adgangskontrol, sprogdetektion og integration daekkes samlet.
const test = require('node:test')
const assert = require('node:assert/strict')
const { createAssistantContext } = require('./assistantContext.cjs')

const now = new Date(2026, 8, 15, 12) // tirsdag 2026-09-15

function fixture() {
  const teams = [{ teamId: 'TCD', abbreviation: 'TCD', name: 'Dispatch', folderName: 'TCD' }, { teamId: 'TRR', abbreviation: 'TRR', name: 'Returns', folderName: 'TRR' }]
  const stores = {
    TCD: {
      users: {
        'me@test': { email: 'me@test', fullName: 'Test User', password: 'NEVER_SEND_PASSWORD', status: 'approved' },
        'anne@test': { email: 'anne@test', fullName: 'Anne Holm', status: 'approved', password: 'ANNE_PASSWORD' },
        'bo@test': { email: 'bo@test', fullName: 'Bo Berg', status: 'approved' },
      },
      'shift-roles': [{ id: 'pack', name: 'Packing' }, { id: 'receive', name: 'Receiving' }],
      'shift-assignments': [
        { id: 's1', employeeId: 'me@test', roleId: 'pack', date: '2026-09-21' },
        { id: 's2', employeeId: 'me@test', roleId: 'receive', date: '2026-09-22' },
        { id: 's3', employeeId: 'bo@test', roleId: 'pack', date: '2026-09-22' },
        { id: 's4', employeeId: 'anne@test', roleId: 'receive', date: '2026-09-17' }, // kolliderer med Annes ferie
        { id: 's5', employeeId: 'bo@test', roleId: 'pack', date: '2026-09-15' },
      ],
      'home-office-patterns': { 'bo@test': { weekdays: [2] } }, // tirsdag
      'home-office-exceptions': [],
      'vacation-entries': [
        { userEmail: 'anne@test', startDate: '2026-09-16', endDate: '2026-09-18', status: 'approved', notes: 'SECRET_NOTES' },
        { userEmail: 'bo@test', startDate: '2026-10-05', endDate: '2026-10-09', status: 'pending', notes: 'PENDING_SECRET' },
      ],
      'sick-leave-entries': [{ userEmail: 'me@test', startDate: '2026-09-15', endDate: '2026-09-15', status: 'approved', reason: 'SICK_SECRET' }],
      guides: [],
    },
    TRR: { users: { 'other@test': { fullName: 'Other User', password: 'OTHER_PASSWORD', status: 'approved' } }, 'shift-assignments': [{ employeeId: 'other@test', roleId: 'x', date: '2026-09-21' }], guides: [] },
  }
  const shared = { 'active-sessions': { valid: { email: 'me@test', expiresAt: Date.now() + 60000 } }, 'shared-guides': [] }
  const reads = []
  const api = createAssistantContext({
    listTeams: () => teams,
    lookupTeam: () => teams[0],
    listViews: () => [],
    creatorEmail: () => 'creator@test',
    currentFolder: () => 'TCD',
    readShared: key => { reads.push(`shared:${key}`); return shared[key] },
    readTeam: (team, key) => { reads.push(`${team.teamId}:${key}`); return stores[team.teamId][key] },
  })
  return { api, stores, reads }
}
const ask = (api, question, language = 'da') => api.query({ token: 'valid', question, language }, now)

test('whereIs: kombinerer ferie, sygdom, hjemmearbejde og vagter for en navngiven person', () => {
  const { api } = fixture()
  const answer = ask(api, 'hvor er Anne på torsdag?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Status for Anne Holm \(2026-09-17\)/)
  assert.match(answer.text, /2026-09-17: Ferie/)
  assert.ok(!JSON.stringify(answer).includes('SECRET_NOTES'))
  assert.ok(!JSON.stringify(answer).includes('PASSWORD'))
})

test('whereIs: viser vagt + hjemmearbejde kombineret og svarer på engelsk', () => {
  const { api } = fixture()
  const answer = ask(api, 'where is Bo today?', 'en')
  assert.equal(answer.mode, 'data')
  // Bo har hjemmearbejdsmønster tirsdag OG en vagt i dag -> arbejder hjemmefra med opgave
  assert.match(answer.text, /Status for Bo Berg \(2026-09-15\)/)
  assert.match(answer.text, /Working from home — Task: Packing/)
})

test('whereIs: finsk spørgsmål giver finsk svar', () => {
  const { api } = fixture()
  const answer = ask(api, 'missä Anne on huomenna?', 'da')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Tilanne: Anne Holm \(2026-09-16\)/)
  assert.match(answer.text, /Loma/)
})

test('whereIs: egen sygemelding vises uden årsag', () => {
  const { api } = fixture()
  const answer = ask(api, 'er Test User på arbejde i dag?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Sygemeldt/)
  assert.ok(!JSON.stringify(answer).includes('SICK_SECRET'))
})

test('available: grupperer på arbejde / hjemmearbejde / fravær og respekterer datoen', () => {
  const { api } = fixture()
  const answer = ask(api, 'hvem er ledige på torsdag?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Tilgængelighed \(2026-09-17\)/)
  assert.match(answer.text, /Fraværende \(1\):\n• Anne Holm \(Ferie\)/)
  assert.match(answer.text, /På arbejde \(2\)/) // me + Bo (torsdag er ikke Bos hjemmedag)
  // pending ferie (Bo i oktober) må ALDRIG tælle som fravær
  assert.ok(!answer.text.includes('PENDING'))
})

test('available: engelsk formulering og hjemmearbejds-gruppen', () => {
  const { api } = fixture()
  const answer = ask(api, 'who is available today?', 'en')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Working from home \(1\):\n• Bo Berg/)
  assert.match(answer.text, /Absent \(1\):\n• Test User \(Sick leave\)/)
})

test('back: aktiv ferie giver slutdato og tilbage-dato', () => {
  const { api } = fixture()
  const answer = ask(api, 'hvornår er Anne tilbage?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Anne Holm har ferie fra 2026-09-16 til 2026-09-18 og er tilbage 2026-09-19\.|Anne Holm er på ferie til og med 2026-09-18 og er tilbage 2026-09-19\./)
})

test('back: engelsk + ingen fravær', () => {
  const { api } = fixture()
  const answer = ask(api, 'when is Bo back?', 'en')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Bo Berg has no active or upcoming recorded absence\./)
})

test('workload: tæller vagter pr. person i perioden og rangerer', () => {
  const { api } = fixture()
  const answer = ask(api, 'hvem har flest opgaver i næste uge?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Flest registrerede opgaver \(2026-09-21 – 2026-09-27\)/)
  const meIndex = answer.text.indexOf('Test User — 2 opgaver')
  const boIndex = answer.text.indexOf('Bo Berg — 1 opgave')
  assert.ok(meIndex > 0 && boIndex > meIndex)
})

test('workload: finsk og engelsk formulering', () => {
  const { api } = fixture()
  assert.match(ask(api, 'who has the most tasks next week?', 'en').text, /Most recorded tasks/)
  assert.match(ask(api, 'kenellä on eniten tehtäviä ensi viikolla?', 'da').text, /Eniten kirjattuja tehtäviä/)
})

test('conflicts: finder vagter der overlapper godkendt fravær', () => {
  const { api } = fixture()
  const answer = ask(api, 'kolliderer nogen vagter med ferie i denne uge?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /2026-09-17 · Anne Holm: Receiving — samtidig på ferie/)
})

test('conflicts: melder rent når intet overlapper', () => {
  const { api } = fixture()
  const answer = ask(api, 'are any shifts conflicting with vacation next week?', 'en')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /No shifts overlap approved absence/)
})

test('hijacker ikke eksisterende spor: hjemmearbejde, ferieoversigt og opgavespørgsmål', () => {
  const { api } = fixture()
  assert.match(ask(api, 'hvem arbejder hjemme i dag?').text, /Registreret hjemmearbejde/)
  assert.match(ask(api, 'hvem har ferie i næste uge?').text, /Godkendt ferie/)
  assert.match(ask(api, 'hvad skal Bo lave i næste uge?').text, /Registrerede opgaver for Bo Berg/)
})

test('ukendt person falder videre i stedet for at fejle', () => {
  const { api } = fixture()
  const answer = ask(api, 'hvor er kantinen?')
  assert.ok(answer.mode === 'unsupported' || answer.mode === 'data')
})

test('flertydig person giver personvalg og accepterer selectedPerson', () => {
  const { api, stores } = fixture()
  stores.TCD.users['anne2@test'] = { email: 'anne2@test', fullName: 'Anne Vest', status: 'approved' }
  const first = ask(api, 'hvor er Anne på torsdag?')
  assert.ok(Array.isArray(first.personChoices) && first.personChoices.length === 2)
  const chosen = api.query({ token: 'valid', question: 'hvor er Anne på torsdag?', language: 'da', selectedPerson: 'anne@test' }, now)
  assert.match(chosen.text, /Anne Holm/)
})

test('læser aldrig andre teams uden adgang', () => {
  const { api, reads } = fixture()
  ask(api, 'hvem er ledige i dag?')
  assert.ok(!reads.some(key => key.startsWith('TRR:')))
})

test('update-spørgsmål udløser ikke tilgængelighed', () => {
  const { api } = fixture()
  const answer = ask(api, 'when is the update available?', 'en')
  assert.ok(!answer.text.includes('Availability'))
})

test('opfølgning "og Bo?" skifter person men beholder intent og dato', () => {
  const { api } = fixture()
  const answer = api.query({ token: 'valid', question: 'og Bo?', language: 'da', previousQuestion: 'hvor er Anne på torsdag?' }, now)
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Status for Bo Berg \(2026-09-17\)/)
})

test('opfølgning "og fredag?" skifter dato men beholder personen', () => {
  const { api } = fixture()
  const answer = api.query({ token: 'valid', question: 'og fredag?', language: 'da', previousQuestion: 'hvor er Anne på torsdag?' }, now)
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Anne Holm \(2026-09-18\)/)
})

test('opfølgning på tilbage-spørgsmål: "and Bo?"', () => {
  const { api } = fixture()
  const answer = api.query({ token: 'valid', question: 'and Bo?', language: 'en', previousQuestion: 'when is Anne back?' }, now)
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /Bo Berg has no active or upcoming recorded absence\./)
})
