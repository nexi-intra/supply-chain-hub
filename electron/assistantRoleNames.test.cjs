// Training round 1.6.3: short shift-role names ("Lead", "TL", "Pick", "Kran") asked the way people talk, in four languages.
// A who-question that names a role lists who in the team has it; the asker's own plan is never the answer to "who".
const test = require('node:test')
const assert = require('node:assert/strict')
const { createAssistantContext } = require('./assistantContext.cjs')

const now = new Date(2026, 8, 15, 12) // Tuesday 15 Sep 2026
const TEAMS = [{ teamId: 'TCD', abbreviation: 'TCD', name: 'Dispatch', folderName: 'TCD' }]
const DATA = {
  TCD: {
    users: {
      'me@test': { email: 'me@test', fullName: 'Test User', status: 'approved' },
      'anna@test': { email: 'anna@test', fullName: 'Anna Dahl', status: 'approved' },
      'bo@test': { email: 'bo@test', fullName: 'Bo Berg', status: 'approved' },
    },
    'shift-roles': [{ id: 'lead', name: 'Lead' }, { id: 'pick', name: 'Pick' }, { id: 'kran', name: 'Kran' }, { id: 'tl', name: 'TL' }, { id: 'lager', name: 'Lager' }],
    'shift-assignments': [
      { id: 'a1', employeeId: 'anna@test', roleId: 'lead', date: '2026-09-15' }, { id: 'a2', employeeId: 'bo@test', roleId: 'pick', date: '2026-09-15' },
      { id: 'a3', employeeId: 'me@test', roleId: 'kran', date: '2026-09-15' }, { id: 'a4', employeeId: 'bo@test', roleId: 'tl', date: '2026-09-16' },
      { id: 'a5', employeeId: 'anna@test', roleId: 'lager', date: '2026-09-16' },
    ],
  },
}
const sessions = { valid: { email: 'me@test', expiresAt: Date.now() + 3600000 } }
const api = createAssistantContext({
  listTeams: () => TEAMS, lookupTeam: () => TEAMS[0], creatorEmail: () => 'creator@test', currentFolder: () => 'TCD',
  readShared: key => (key === 'active-sessions' ? sessions : undefined), readTeam: (team, key) => DATA[team.teamId][key],
})
const ask = (question, language) => api.query({ token: 'valid', question, language }, now)

test('who-questions naming a short role list the people with that role, in all four languages', () => {
  const cases = [
    ['da', 'hvem er lead i dag?', /^Lead · TCD[\s\S]*Anna Dahl — Lead/], ['da', 'hvem er leader i dag?', /Anna Dahl — Lead/], ['da', 'hvem har lead i dag?', /Anna Dahl — Lead/],
    ['en', 'who is the lead today?', /^Lead · TCD[\s\S]*Anna Dahl — Lead/], ['en', 'who is picking today?', /Bo Berg — Pick/],
    ['fi', 'kuka on lead tänään?', /Anna Dahl — Lead/], ['sv', 'vem är lead idag?', /Anna Dahl — Lead/],
    ['da', 'hvem kører kran i dag?', /Test User — Kran/], ['da', 'hvem har kranen i dag?', /Test User — Kran/],
    ['da', 'hvem er TL i morgen?', /Bo Berg — TL/], ['da', 'hvem har lageret i morgen?', /Anna Dahl — Lager/],
  ]
  const wrong = []
  for (const [language, question, expected] of cases) {
    const answer = ask(question, language)
    if (answer.mode !== 'data' || !expected.test(answer.text)) wrong.push(`${language} ${question} -> [${answer.mode}] ${String(answer.text).slice(0, 120)}`)
  }
  assert.deepEqual(wrong, [])
})

test('a role filter never adds other roles, and a question without a role name keeps its own route', () => {
  const lead = ask('hvem er lead i dag?', 'da')
  for (const other of ['Pick', 'Kran', 'TL', 'Lager']) assert.ok(!lead.text.includes(`— ${other}`), other)
  assert.doesNotMatch(ask('hvem er min leder?', 'da').text, /— Lead/)
  assert.doesNotMatch(ask('hvem er syg i dag?', 'da').text, /— (?:Lead|Pick|Kran)/)
})
