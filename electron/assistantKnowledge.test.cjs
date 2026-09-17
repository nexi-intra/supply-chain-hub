const test = require('node:test')
const assert = require('node:assert/strict')
const { createAssistantContext, resolveDates } = require('./assistantContext.cjs')
const { parsePlan, resolveAssistantAnswer } = require('./assistantPlanner.cjs')
const now = new Date(2026, 8, 15, 12)
function fixture() {
  const teams = [{ teamId: 'ONE', abbreviation: 'ONE', folderName: 'ONE', name: 'One' }, { teamId: 'TWO', abbreviation: 'TWO', folderName: 'TWO', name: 'Two' }]
  const stores = {
    ONE: {
      users: { 'me@test': { email: 'me@test', fullName: 'Test Person', status: 'approved', role: 'user', password: 'PASSWORD_SECRET' }, 'peer@test': { email: 'peer@test', fullName: 'Colleague Example', username: 'colleague', phone: '123456', role: 'manager', status: 'approved', password: 'OTHER_PASSWORD' }, 'pending@test': { email: 'pending@test', fullName: 'Pending Person', status: 'pending' } },
      'meal-plan-weeks': [{ year: 2026, weekNumber: 36, weekStart: 'localized/ignored', meals: { monday: 'Synthetic pasta', tuesday: 'Synthetic soup', wednesday: 'Synthetic salad', thursday: 'Synthetic rice', friday: '' } }, { year: 2026, weekNumber: 37, meals: { monday: 'Week37 test' } }, { year: 2025, weekNumber: 36, meals: { monday: 'Old year test' } }],
      projects: [{ id: 'p1', title: 'Terminal rollout', description: 'Synthetic terminal project', status: 'open', createdBy: 'me@test', createdByName: 'Test Person', createdAt: '2026-09-02T12:00:00Z', teamMembers: [{ email: 'peer@test', name: 'Colleague Example' }] }, { id: 'p2', title: 'Warehouse upgrade', description: 'Synthetic completed work', status: 'completed', createdBy: 'peer@test', createdAt: '2026-08-01T12:00:00Z', completedAt: '2026-09-02T12:00:00Z', teamMembers: [] }],
      'notebook-notes': [{ id: 'shared', title: 'Terminal handover', content: 'SHARED_SYNTHETIC_NOTE', creatorEmail: 'peer@test', creatorName: 'Colleague Example', isPersonal: false, tags: ['terminal'], updatedAt: '2026-09-04' }, { id: 'own', title: 'Own personal', content: 'OWN_PERSONAL_NOTE', creatorEmail: 'me@test', isPersonal: true }, { id: 'private', title: 'PRIVATE_TITLE', content: 'PRIVATE_NOTE_SECRET', creatorEmail: 'peer@test', isPersonal: true }],
      emails: [{ id: 'incoming', from: 'peer@test', to: 'me@test', subject: 'Terminal message', message: 'OWN_INCOMING_TEXT', read: false, timestamp: new Date(2026, 8, 2, 12).getTime() }, { id: 'outgoing', from: 'me@test', to: 'peer@test', subject: 'Reply', message: 'OWN_OUTGOING_TEXT', read: true, timestamp: new Date(2026, 8, 3, 12).getTime() }, { id: 'private', from: 'peer@test', to: 'someone@test', subject: 'PRIVATE_MESSAGE_TITLE', message: 'PRIVATE_MESSAGE_SECRET', read: false, timestamp: Date.now() }],
      'email-folders': [{ id: 'my-folder', name: 'Own folder', userId: 'me@test' }, { id: 'other-folder', name: 'PRIVATE_FOLDER', userId: 'peer@test' }],
      announcements: [{ id: 'a1', title: 'Terminal announcement', message: 'TEAM_ANNOUNCEMENT', createdByName: 'Colleague Example', createdAt: new Date(2026, 8, 2, 12).getTime() }],
      'employee-birthdays': [{ email: 'peer@test', fullName: 'Colleague Example', birthday: '09-20' }],
      'vacation-entries': [{ id: 'v1', userEmail: 'peer@test', startDate: '2026-09-21', endDate: '2026-09-25', status: 'approved', notes: 'OTHER_VACATION_NOTES' }, { id: 'v2', userEmail: 'peer@test', startDate: '2026-09-28', endDate: '2026-09-30', status: 'pending', notes: 'PENDING_PRIVATE_NOTES' }, { id: 'v3', userEmail: 'me@test', startDate: '2026-10-01', endDate: '2026-10-02', status: 'pending', notes: 'OWN_VACATION_NOTES' }],
      'sick-leave-entries': [{ id: 's1', userEmail: 'peer@test', startDate: '2026-09-14', status: 'approved', reason: 'HEALTH_REASON_SECRET' }],
      'guide-admin-emails': [],
      'guide-review-requests': [{ id: 'r1', guideId: 'g1', guideTitle: 'Own guide draft', submittedBy: 'me@test', status: 'pending', proposedGuide: { content: 'OWN_DRAFT' } }, { id: 'r2', guideId: 'g2', guideTitle: 'Other guide draft', submittedBy: 'peer@test', status: 'pending', proposedGuide: { content: 'OTHER_DRAFT_SECRET' } }],
      'archived-guides': [{ id: 'ar1', guide: { title: 'Archived title', content: 'ARCHIVE_SECRET' } }],
      guides: [{ id: 'g1', title: 'Terminal guide', content: 'AUTHORIZED_GUIDE_TEXT' }],
      'guide-versions-g1': [{ version: '1.01', changeNote: 'OLD_CHANGE', snapshot: { content: 'OLD_VERSION_SECRET' } }],
      'hub-dashboard-me@test': { teamTasks: { visible: false, size: 'compact' } },
      'hub-dashboard-peer@test': { teamTasks: { visible: true, size: 'large', content: 'OTHER_SETTINGS_SECRET' } },
      'active-theme-me@test': 'own-theme',
      'custom-themes': [{ id: 'own-theme', name: 'Own theme', colors: { primary: '#123456' } }],
      'shift-assignments': [{ id: 'shift1', employeeId: 'me@test', roleId: 'role1', date: '2026-09-02', comment: 'SHIFT_PRIVATE_COMMENT' }],
      'shift-roles': [{ id: 'role1', name: 'Synthetic shift role' }],
    },
    TWO: { users: { 'outside@test': { email: 'outside@test', fullName: 'Outside User' } }, guides: [{ id: 'outside', title: 'Terminal outside', content: 'OUTSIDE_GUIDE_SECRET' }], 'notebook-notes': [{ id: 'outside-note', isPersonal: false, content: 'OUTSIDE_NOTE_SECRET' }], projects: [{ id: 'outside-project', title: 'OUTSIDE_PROJECT_SECRET' }] },
  }
  const shared = { 'active-sessions': { valid: { email: 'me@test', expiresAt: Date.now() + 600000 } } }
  const reads = []
  const api = createAssistantContext({ listTeams: () => teams, lookupTeam: () => teams[0], listViews: () => [{ viewId: 'allowed', teamIds: ['ONE', 'TWO'] }], creatorEmail: () => 'creator@test', currentFolder: () => 'ONE', readTeam: (team, key) => { reads.push(`${team.teamId}:${key}`); return stores[team.teamId][key] }, readShared: key => shared[key] })
  const query = (question, extra = {}) => api.query({ token: 'valid', question, language: 'da', ...extra }, now)
  return { api, stores, shared, reads, query }
}

test('ordinary guide facts never load reviewer drafts/archive/history, even for a manager', () => {
  const { stores, query, reads } = fixture()
  stores.ONE.users['me@test'].role = 'manager'
  stores.ONE.guides = [{ id: 'g1', title: 'Synthetic cloud IP adresse', version: '1.02', content: 'NY CLOUD IP ADRESSE 192.0.2.10\nTEST CLOUD IP 192.0.2.20' }]
  stores.ONE['guide-versions-g1'] = [{ version: '1.01', snapshot: { content: 'NY CLOUD IP ADRESSE 192.0.2.30' } }]
  const result = query('hvad er den nye cloud ip adresse')
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0].kind, 'guide')
  assert.match(result.sources[0].text, /192\.0\.2\.10/)
  assert.ok(!result.text.includes('192.0.2.30'))
  assert.ok(!reads.some(key => /guide-versions|guide-review-requests|archived-guides/.test(key)))
  const { conciseGuideFact } = require('./assistantAnswers.cjs')
  assert.equal(conciseGuideFact(result, { question: 'hvad er den nye cloud ip adresse', language: 'da' }).text, 'Den nye IP-adresse er 192.0.2.10. [1]')
  assert.match(query('guide historik cloud').text, /192\.0\.2\.30/)
})

test('reported new -> old -> test -> source conversation works without an LLM and with fresh access', async () => {
  const { api, stores, shared } = fixture()
  const { conciseGuideFact } = require('./assistantAnswers.cjs')
  stores.ONE.users['me@test'].role = 'manager'
  stores.ONE.guides = [{ id: 'g1', title: 'Synthetic cloud IP adresse', version: '1.02', content: 'NY CLOUD IP ADRESSE 192.0.2.10\nTEST CLOUD IP 192.0.2.20' }]
  stores.ONE['guide-versions-g1'] = [{ version: '1.02', snapshot: { content: 'NY CLOUD IP ADRESSE 192.0.2.10\nTEST CLOUD IP 192.0.2.20' } }, { version: '1.01', snapshot: { content: 'NY CLOUD IP ADRESSE 192.0.2.30\nTEST CLOUD IP 192.0.2.20' } }]
  const ai = { status: () => ({ installed: true, freeGiB: 1, minimumFreeGiB: 2.75 }), complete: () => assert.fail('Clear follow-ups require no model') }
  const conversation = []
  async function ask(question) {
    const req = { token: 'valid', language: 'da', question, conversation: [...conversation] }
    const evidence = await resolveAssistantAnswer(api, ai, req)
    const result = conciseGuideFact(evidence, { ...req, question: evidence.contextQuestion }) || evidence
    conversation.push(result.contextQuestion)
    return result
  }
  assert.equal((await ask('hvad er den nye cloud ip adresse?')).text, 'Den nye IP-adresse er 192.0.2.10. [1]')
  const old = await ask('hvad er den gamle så?')
  assert.match(old.text, /tidligere guideversion står 192\.0\.2\.30/)
  assert.ok(!old.text.includes('192.0.2.20'))
  assert.equal((await ask('og test?')).text, 'Test-IP-adressen er 192.0.2.20. [1]')
  assert.match((await ask('hvilken guide?')).text, /Kilde: “Synthetic cloud IP adresse”/)
  assert.match((await ask('hvad fik vi at spise i uge 36?')).text, /Synthetic pasta/)
  shared['active-sessions'].valid.expiresAt = 1
  await assert.rejects(() => ask('og uge 37?'), /Log ind/)
})

test('old IP follow-up never substitutes test or unchanged current values and honors reviewer privilege', async () => {
  const { api, stores, reads } = fixture()
  const { conciseGuideFact } = require('./assistantAnswers.cjs')
  stores.ONE.guides = [{ id: 'g1', title: 'Synthetic cloud IP adresse', content: 'NY CLOUD IP ADRESSE 192.0.2.10\nTEST CLOUD IP 192.0.2.20' }]
  const req = { token: 'valid', language: 'da', question: 'hvad er den gamle så?', conversation: ['hvad er den nye cloud ip adresse?'] }
  const evidence = api.query(req, now)
  const result = conciseGuideFact(evidence, { ...req, question: evidence.contextQuestion })
  assert.match(result.text, /kan ikke finde en dokumenteret gammel/)
  assert.ok(!result.text.includes('192.0.2.20'))
  assert.ok(!reads.some(key => key.includes('guide-versions-')))
  stores.ONE.users['me@test'].role = 'manager'
  stores.ONE['guide-versions-g1'] = [{ version: '1.00', snapshot: { content: 'NY CLOUD IP ADRESSE 192.0.2.10\nTEST CLOUD IP 192.0.2.20' } }]
  const unchanged = api.query(req, now)
  assert.match(conciseGuideFact(unchanged, { ...req, question: unchanged.contextQuestion }).text, /kan ikke finde en dokumenteret gammel/)
})

test('local semantic follow-ups use question history only, then fetch fresh authorized module data', async () => {
  const { api, stores } = fixture()
  stores.ONE['shift-assignments'].push({ id: 'peer-shift', employeeId: 'peer@test', roleId: 'role1', date: '2026-09-22' })
  let calls = 0
  const ai = { status: () => ({ installed: true, freeGiB: 5, minimumFreeGiB: 2.75 }), complete: async messages => {
    calls++
    const payload = JSON.parse(messages[1].content)
    assert.equal(payload.latestQuestion, 'og ham?')
    assert.deepEqual(payload.precedingQuestions, ['hvem er Colleague Example?', 'hvad skal jeg arbejde med næste uge?'])
    assert.ok(!JSON.stringify(messages).includes('PASSWORD_SECRET'))
    return { text: JSON.stringify({ modules: ['shifts'], terms: [], question: 'hvad skal Colleague Example arbejde med næste uge?' }) }
  } }
  const result = await resolveAssistantAnswer(api, ai, { token: 'valid', question: 'og ham?', language: 'da', conversation: ['hvem er Colleague Example?', 'hvad skal jeg arbejde med næste uge?'] })
  assert.equal(calls, 1)
  assert.match(result.text, /Synthetic shift role/)
  assert.match(result.contextQuestion, /Colleague Example/)
  assert.throws(() => parsePlan('{"modules":["guides"],"terms":[],"question":42}'), /Ugyldigt/)
})

test('reported meal-plan question retrieves stored week 36 with explicit dates and no guessing', () => {
  const { query, reads } = fixture()
  const answer = query('hvordan så madplanen ud i uge 36?')
  assert.equal(answer.mode, 'data')
  assert.match(answer.text, /2026-08-31 – 2026-09-06/)
  assert.match(answer.text, /Mandag: Synthetic pasta/)
  assert.match(answer.text, /Fredag: Ikke registreret/)
  assert.ok(!answer.text.includes('Week37 test'))
  assert.ok(!answer.text.includes('Old year test'))
  assert.ok(!reads.some(key => key.startsWith('TWO:')))
})
test('meal-plan historical year, missing period, unknown week and missing record are explicit', () => {
  const { query } = fixture()
  assert.match(query('madplan uge 36 2025').text, /Old year test/)
  assert.match(query('madplan').text, /Hvilken dato/)
  assert.match(query('madplan uge 54').text, /Hvilken dato/)
  assert.match(query('madplan uge 35').text, /Ingen tilgængelige/)
})
for (const [question, language, weekday] of [
  ['hvad fik vi at spise i uge 36?', 'da', 'Mandag'],
  ['hvad får vi at spise i uge 36?', 'da', 'Mandag'],
  ['hvad skal vi have at spise i uge 36?', 'da', 'Mandag'],
  ['hvad har vi fået at spise i uge 36?', 'da', 'Mandag'],
  ['hvad spiste vi i uge 36?', 'da', 'Mandag'],
  ['hvad fik vi til frokost i uge 36?', 'da', 'Mandag'],
  ['hvad var der af mad i uge 36?', 'da', 'Mandag'],
  ['what did we eat in week 36?', 'en', 'Monday'],
  ['what did we have for lunch in week 36?', 'en', 'Monday'],
  ['what food was served in week 36?', 'en', 'Monday'],
  ['mitä söimme viikolla 36?', 'fi', 'Maanantai'],
]) test(`ordinary meal question selects its week without searching for grammar: ${question}`, () => {
  const { query, reads } = fixture()
  const answer = query(question, { language })
  assert.equal(answer.mode, 'data')
  assert.equal(answer.total, 1)
  assert.match(answer.text, new RegExp(`${weekday}: Synthetic pasta`))
  assert.match(answer.text, /2026-08-31 – 2026-09-06/)
  assert.ok(!answer.text.includes('Old year test'))
  assert.ok(!reads.some(key => key.startsWith('TWO:')))
})
test('meal wording preserves actual menu filters and the requested historical year', () => {
  const { query } = fixture()
  assert.match(query('hvad fik vi at spise i uge 36 2025?').text, /Old year test/)
  assert.equal(query('madplan med pasta uge 36').total, 1)
  assert.equal(query('madplan med pizza uge 36').total, 0)
  assert.equal(query('fik vi pizza at spise i uge 36?').total, 0)
  assert.equal(query('hvad fik vi at spise i uge 35?').total, 0)
})
test('reported meal question works with low RAM without invoking the local model', async () => {
  const { api } = fixture()
  const ai = {
    status: () => ({ installed: true, freeGiB: 1, minimumFreeGiB: 2.75 }),
    complete: async () => { assert.fail('A dated meal overview requires no model invocation') },
  }
  const answer = await resolveAssistantAnswer(api, ai, { token: 'valid', question: 'hvad fik vi at spise i uge 36?', language: 'da' }, now)
  assert.equal(answer.total, 1)
  assert.match(answer.text, /Synthetic pasta/)
})
test('calendar supports ISO weeks, invalid week 53, previous weeks and leap-year months', () => {
  assert.deepEqual(resolveDates('uge 36', now), { start: '2026-08-31', end: '2026-09-06' })
  assert.deepEqual(resolveDates('week 1 2026', now), { start: '2025-12-29', end: '2026-01-04' })
  assert.equal(resolveDates('uge 53 2025', now), null)
  assert.deepEqual(resolveDates('uge 53 2026', now), { start: '2026-12-28', end: '2027-01-03' })
  assert.deepEqual(resolveDates('sidste uge', now), { start: '2026-09-07', end: '2026-09-13' })
  assert.deepEqual(resolveDates('februar 2024', now), { start: '2024-02-01', end: '2024-02-29' })
  assert.deepEqual(resolveDates('hvad skal Maj arbejde med næste uge?', now), { start: '2026-09-21', end: '2026-09-27' })
})
test('calendar follow-ups retain module but replace week and year; new topic clears inheritance', () => {
  const { query } = fixture()
  let answer = query('madplan uge 36 2025')
  answer = query('og uge 36 2026?', { previousQuestion: answer.contextQuestion })
  assert.match(answer.text, /Synthetic pasta/)
  answer = query('og uge 37?', { previousQuestion: answer.contextQuestion })
  assert.match(answer.text, /Week37 test/)
  const projects = query('hvilke projekter har vi?', { previousQuestion: answer.contextQuestion })
  assert.match(projects.text, /Terminal rollout/)
  assert.ok(!projects.text.includes('Synthetic pasta'))
})
test('projects expose status/members, counts and historical activity without outside-team records', () => {
  const { query } = fixture()
  assert.match(query('hvor mange åbne projekter har vi?').text, /registreringer: 1/)
  assert.match(query('mine projekter').text, /Terminal rollout/)
  assert.ok(!query('mine projekter').text.includes('Warehouse upgrade'))
  assert.match(query('afsluttede projekter').text, /Warehouse upgrade/)
  assert.match(query('projekter uge 36').text, /Terminal rollout/)
  assert.match(query('projekter uge 36').text, /Warehouse upgrade/)
})
test('notebook projects permission before search, including direct source fetch after role changes', () => {
  const { query, api, stores } = fixture()
  const answer = query('noter')
  assert.match(answer.text, /SHARED_SYNTHETIC_NOTE/)
  assert.match(answer.text, /OWN_PERSONAL_NOTE/)
  assert.ok(!JSON.stringify(answer).includes('PRIVATE_NOTE_SECRET'))
  assert.ok(!JSON.stringify(answer).includes('PRIVATE_TITLE'))
  stores.ONE.users['me@test'].role = 'manager'
  assert.throws(() => api.getRecord({ token: 'valid', moduleId: 'notes', recordId: 'private', teamId: 'ONE' }), /ikke adgang/)
  stores.ONE['notebook-notes'].find(item => item.id === 'shared').isPersonal = true
  assert.throws(() => api.getRecord({ token: 'valid', moduleId: 'notes', recordId: 'shared', teamId: 'ONE' }), /ikke adgang/)
})
test('messages and folders are participant/owner-filtered even for managers', () => {
  const { query, api, stores } = fixture()
  stores.ONE.users['me@test'].role = 'manager'
  const answer = query('beskeder')
  assert.match(answer.text, /OWN_INCOMING_TEXT/)
  assert.match(answer.text, /OWN_OUTGOING_TEXT/)
  for (const forbidden of ['PRIVATE_MESSAGE_TITLE', 'PRIVATE_MESSAGE_SECRET', 'PRIVATE_FOLDER']) assert.ok(!JSON.stringify(answer).includes(forbidden))
  assert.match(query('hvor mange ulæste mails?').text, /registreringer: 1/)
  assert.ok(!query('sendte beskeder').text.includes('OWN_INCOMING_TEXT'))
  assert.throws(() => api.getRecord({ token: 'valid', moduleId: 'messages', recordId: 'private', teamId: 'ONE' }), /ikke adgang/)
})
test('team overview reads approved contacts/roles/birthdays, never passwords or pending users', () => {
  const { query } = fixture()
  const answer = query('teamoversigt')
  assert.match(answer.text, /123456/)
  assert.match(answer.text, /09-20/)
  assert.ok(!JSON.stringify(answer).includes('PASSWORD'))
  assert.ok(!JSON.stringify(answer).includes('Pending Person'))
  const managers = query('hvem er manageren i teamet?')
  assert.match(managers.text, /Colleague Example/)
  assert.ok(!managers.text.includes('Test Person'))
})
test('absence masks other people’s health/notes and pending requests except for real managers', () => {
  const { query, stores } = fixture()
  let answer = query('fravær')
  for (const forbidden of ['OTHER_VACATION_NOTES', 'PENDING_PRIVATE_NOTES', 'HEALTH_REASON_SECRET']) assert.ok(!answer.text.includes(forbidden))
  assert.match(answer.text, /OWN_VACATION_NOTES/)
  assert.match(query('hvor mange ferieanmodninger afventer?').text, /registreringer: 1/)
  stores.ONE.users['me@test'].role = 'manager'
  answer = query('fravær')
  assert.match(answer.text, /HEALTH_REASON_SECRET/)
  assert.match(query('hvor mange ferieanmodninger afventer?').text, /registreringer: 2/)
})
test('guide reviews, archives and version history honor reviewer/author permission and draft labels', () => {
  const { query, stores, api } = fixture()
  let answer = query('guide review')
  assert.match(answer.text, /OWN_DRAFT/)
  assert.match(answer.text, /KLADDE/)
  for (const forbidden of ['OTHER_DRAFT_SECRET', 'ARCHIVE_SECRET', 'OLD_VERSION_SECRET']) assert.ok(!answer.text.includes(forbidden))
  stores.ONE['guide-admin-emails'] = ['me@test']
  answer = query('guide review')
  assert.match(answer.text, /OTHER_DRAFT_SECRET/)
  assert.match(answer.text, /ARCHIVE_SECRET/)
  assert.match(answer.text, /OLD_VERSION_SECRET/)
  stores.ONE['guide-admin-emails'] = []
  assert.throws(() => api.getRecord({ token: 'valid', moduleId: 'reviews', recordId: 'review:r2', teamId: 'ONE' }), /ikke adgang/)
})
test('dashboard/theme queries use only own settings and explicitly projected fields', () => {
  const { query, reads } = fixture()
  const answer = query('dashboard widgets')
  assert.match(answer.text, /Skjult/)
  assert.match(answer.text, /compact/)
  assert.match(answer.text, /own-theme/)
  assert.ok(!JSON.stringify(answer).includes('OTHER_SETTINGS_SECRET'))
  assert.ok(!reads.includes('ONE:hub-dashboard-peer@test'))
})
test('announcements, module catalog and not-yet-implemented modules return supported facts', () => {
  const { query } = fixture()
  assert.match(query('opslagstavle uge 36').text, /TEAM_ANNOUNCEMENT/)
  assert.match(query('moduler').text, /Notesbog/)
  assert.match(query('document library').text, /ikke implementeret/)
})
test('general free-text search can combine module evidence, with no private/outside content', () => {
  const { query } = fixture()
  const answer = query('terminal')
  assert.equal(answer.mode, 'knowledge')
  assert.ok(answer.sources.some(source => source.moduleId === 'projects'))
  assert.ok(answer.sources.some(source => source.moduleId === 'notes'))
  assert.ok(answer.sources.some(source => source.moduleId === 'messages'))
  for (const forbidden of ['PRIVATE_NOTE', 'PRIVATE_MESSAGE', 'OUTSIDE_', 'PASSWORD', 'HEALTH_REASON_SECRET']) assert.ok(!JSON.stringify(answer).includes(forbidden))
})
test('pagination reports total, exposes no omitted source content, and source fetch reauthorizes', () => {
  const { query, stores, api, shared } = fixture()
  stores.ONE.projects = Array.from({ length: 21 }, (_, i) => ({ id: `p${i}`, title: `Project ${i}`, description: `Body ${i}`, status: 'open' }))
  const first = query('projekter')
  assert.equal(first.total, 21)
  assert.equal(first.sources.length, 8)
  assert.equal(first.nextPage, 1)
  const second = query('projekter', { page: 1 })
  assert.equal(second.sources.length, 8)
  assert.ok(first.sources.every(source => !second.sources.some(other => source.recordId === other.recordId)))
  assert.equal(query('projekter', { page: 2 }).nextPage, undefined)
  const source = first.sources[0]
  assert.match(api.getRecord({ token: 'valid', ...source }).text, /Body 0/)
  assert.throws(() => query('projekter', { page: -1 }), /resultatside/)
  assert.throws(() => api.getRecord({ token: 'valid', moduleId: '../../users', recordId: 'p0', teamId: 'ONE' }), /Ukendt modul/)
  shared['active-sessions'].valid.expiresAt = 1
  assert.throws(() => api.getRecord({ token: 'valid', ...source }), /Log ind/)
})
test('observer scope grants no extra modules, private row privileges or other teams', () => {
  const { query, stores, reads, api } = fixture()
  stores.ONE.users['me@test'].role = 'manager'
  const viewId = 'allowed'
  for (const question of ['madplan uge 36', 'projekter', 'noter', 'beskeder', 'guide review', 'dashboard']) assert.match(query(question, { viewId }).text, /ikke tilgængeligt/)
  const absence = query('fravær', { viewId })
  assert.ok(!absence.text.includes('HEALTH_REASON_SECRET'))
  assert.ok(!absence.text.includes('PENDING_PRIVATE_NOTES'))
  assert.ok(!reads.includes('TWO:notebook-notes'))
  assert.throws(() => api.getRecord({ token: 'valid', moduleId: 'projects', recordId: 'outside-project', teamId: 'TWO' }), /Ingen adgang/)
  assert.throws(() => query('projekter i TWO'), /ikke adgang/)
})
test('semantic planner validates its schema and is a local classification-only fallback', async () => {
  const { api } = fixture()
  let calls = 0
  const ai = { status: () => ({ installed: true, freeGiB: 5, minimumFreeGiB: 2.75 }), complete: async messages => {
    calls++
    assert.ok(!JSON.stringify(messages).includes('PASSWORD_SECRET'))
    assert.ok(!JSON.stringify(messages).includes('OWN_INCOMING_TEXT'))
    return { text: '{"modules":["meals"],"terms":[]}' }
  } }
  const answer = await resolveAssistantAnswer(api, ai, { token: 'valid', question: 'hvad serverede køkkenet uge 36 2026?', language: 'da' })
  assert.equal(calls, 1)
  assert.match(answer.text, /Synthetic pasta/)
  for (const json of ['{"modules":["users"],"terms":[]}', '{"modules":["../../secrets"],"terms":[]}', '{"modules":[],"terms":[{"code":"x"}]}', 'not json']) assert.throws(() => parsePlan(json))
})
test('semantic planner skips model when low RAM, and revalidates auth after async generation', async () => {
  const { api, shared } = fixture()
  const request = { token: 'valid', question: 'unrecognized question', language: 'da' }
  const ai = { status: () => ({ installed: true, freeGiB: 1, minimumFreeGiB: 2.75 }), complete: () => { throw new Error('must not start') } }
  assert.equal((await resolveAssistantAnswer(api, ai, request)).mode, 'unsupported')
  ai.status = () => ({ installed: true, freeGiB: 5, minimumFreeGiB: 2.75 })
  ai.complete = async () => { shared['active-sessions'].valid.expiresAt = 1; return { text: '{"modules":["messages"],"terms":[]}' } }
  await assert.rejects(() => resolveAssistantAnswer(api, ai, request), /Log ind/)
})
test('localized meal-plan rows and weekly periods work in English and Finnish', () => {
  const { query } = fixture()
  assert.match(query('meal plan week 36', { language: 'en' }).text, /Monday: Synthetic pasta/)
  assert.match(query('ruokalista viikko 36', { language: 'fi' }).text, /Maanantai: Synthetic pasta/)
})

test('combined meal/shift question returns both modules and no private shift comments', () => {
  const { query } = fixture()
  const answer = query('madplan og opgaver uge 36')
  assert.match(answer.text, /Synthetic pasta/)
  assert.match(answer.text, /Synthetic shift role/)
  assert.ok(answer.sources.some(source => source.moduleId === 'meals'))
  assert.ok(answer.sources.some(source => source.moduleId === 'shifts'))
  assert.ok(!answer.text.includes('SHIFT_PRIVATE_COMMENT'))
})
test('when-person-has-vacation can search all stored approved periods without assuming a day off', () => {
  const { query } = fixture()
  const answer = query('hvornår har Colleague ferie?')
  assert.match(answer.text, /2026-09-21/)
  assert.ok(!answer.text.includes('2026-09-28'))
  assert.ok(!answer.text.includes('OTHER_VACATION_NOTES'))
})
test('administration respects real manager status, projects credentials out and never grants observer privilege', () => {
  const { query, stores, api } = fixture()
  assert.ok(!JSON.stringify(query('administration')).includes('Pending Person'))
  stores.ONE.users['me@test'].role = 'manager'
  const answer = query('brugeranmodninger afventer')
  assert.match(answer.text, /Pending Person/)
  assert.ok(!JSON.stringify(answer).includes('PASSWORD'))
  assert.match(query('administration', { viewId: 'allowed' }).text, /ikke tilgængeligt/)
  stores.ONE.users['me@test'].role = 'user'
  assert.throws(() => api.getRecord({ token: 'valid', moduleId: 'administration', recordId: 'user:pending@test', teamId: 'ONE' }), /ikke adgang/)
})
test('expired external guide grants never become evidence or permit source fetch', () => {
  const { query, stores, api } = fixture()
  stores.TWO['guide-access-requests'] = [{ id: 'grant', guideId: 'outside', requestingUserEmail: 'me@test', requestingTeamCode: 'ONE', status: 'approved', expiresAt: new Date(Date.now() + 600000).toISOString() }]
  const answer = query('terminal outside guide')
  assert.ok(answer.sources.some(source => source.guideId === 'outside'))
  stores.TWO['guide-access-requests'][0].expiresAt = '2000-01-01T00:00:00Z'
  assert.throws(() => api.getGuide('valid', undefined, 'TWO', 'outside'), /ikke adgang/)
  assert.ok(!JSON.stringify(query('terminal outside guide')).includes('OUTSIDE_GUIDE_SECRET'))
  assert.ok(!JSON.stringify(query('terminal outside guide', { viewId: 'allowed' })).includes('PRIVATE_NOTE_SECRET'))
})
test('local classification cannot override an explicitly unauthorized team', async () => {
  const { api } = fixture()
  const ai = { status: () => ({ installed: true, freeGiB: 5, minimumFreeGiB: 2.75 }), complete: async () => ({ text: '{"modules":["projects"],"terms":[]}' }) }
  await assert.rejects(() => resolveAssistantAnswer(api, ai, { token: 'valid', question: 'show work in TWO', language: 'en' }), /ikke adgang/)
})
test('notification source/count includes own unread events but no other people’s private messages', () => {
  const { query } = fixture()
  const answer = query('notifikationer')
  assert.match(answer.text, /Terminal message/)
  assert.ok(!answer.text.includes('PRIVATE_MESSAGE'))
  assert.match(query('hvor mange notifikationer har jeg?').text, /registreringer: 1/)
})
test('birthdays filter by actual day/month and date range, not merely every team member', () => {
  const { query } = fixture()
  assert.match(query('fødselsdage i september').text, /Colleague Example/)
  assert.ok(!query('fødselsdage i september').text.includes('Test Person'))
  assert.match(query('fødselsdage i oktober').text, /Ingen tilgængelige/)
})
