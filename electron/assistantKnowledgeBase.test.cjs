const test = require('node:test')
const assert = require('node:assert/strict')
const { createAssistantContext } = require('./assistantContext.cjs')

const now = new Date(2026, 8, 15, 12)
const localMode = {
  id: 'k-lm', title: 'LocalMode result handling', version: '1.00', language: 'en', category: 'Error Codes', tags: ['baxi'],
  sections: [
    { heading: 'Rejection Source', steps: [{ text: '03 | Terminal', imageIds: [] }, { text: '05 | Host/PSP', imageIds: [] }] },
    { heading: 'Rejection Reason', steps: [
      { text: '1:0 | Busy', imageIds: [] },
      { text: '2:1 | Cancelled by Cancel Key Pressed | When transaction initiated by ECR, is cancelled by terminal by pressing cancel key, this rejection reason shall be send.', imageIds: [] },
      { text: '5:1 | PAN mismatch | Applies to contactless transactions only.', imageIds: [] },
    ] },
  ],
}

function fixture() {
  const teams = [{ teamId: 'TCD', abbreviation: 'TCD', name: 'Dispatch', folderName: 'TCD' }, { teamId: 'TRR', abbreviation: 'TRR', name: 'Returns', folderName: 'TRR' }]
  const stores = {
    TCD: {
      users: { 'me@test': { email: 'me@test', fullName: 'Test User', status: 'approved' } },
      guides: [{ id: 'own', title: 'Terminal setup', version: '1.02', sections: [{ heading: 'Power', steps: [{ text: 'Connect the terminal cable.', imageIds: [] }] }] }],
      'knowledge-articles': [localMode],
      'vacation-entries': [],
    },
    TRR: {
      users: { 'other@test': { fullName: 'Other User' } },
      'knowledge-articles': [{ id: 'k-out', title: 'Settlement outside knowledge', version: '1.00', sections: [{ heading: 'Settlement', steps: [{ text: 'OUTSIDE_KB_SECRET settlement cut-off is 22:00.', imageIds: [] }] }] }],
    },
  }
  const shared = { 'active-sessions': { valid: { email: 'me@test', expiresAt: Date.now() + 60000 } }, 'shared-guides': [], 'shared-knowledge-articles': [] }
  const reads = []
  const api = createAssistantContext({ listTeams: () => teams, lookupTeam: () => teams[0], creatorEmail: () => 'creator@test', currentFolder: () => 'TCD', readShared: key => { reads.push(`shared:${key}`); return shared[key] }, readTeam: (team, key) => { reads.push(`${team.teamId}:${key}`); return stores[team.teamId][key] } })
  return { api, stores, shared, reads }
}
const ask = (api, question, extra = {}) => api.query({ token: 'valid', question, language: 'da', ...extra }, now)
const knowledgeSources = answer => answer.sources.filter(source => source.library === 'knowledge')
const grant = (overrides = {}) => ({ id: 'g', guideId: 'k-out', requestingUserEmail: 'me@test', requestingTeamCode: 'TCD', status: 'approved', requestedAt: '2026-09-14T00:00:00Z', expiresAt: new Date(Date.now() + 600000).toISOString(), ...overrides })

test('Hubert answers a Danish question from an own-team knowledge article and cites it', () => {
  const { api } = fixture()
  const answer = ask(api, 'hvad betyder rejection reason 2:1?')
  assert.equal(answer.mode, 'retrieval')
  const [source] = knowledgeSources(answer)
  assert.ok(source, JSON.stringify(answer.sources))
  assert.equal(source.kind, 'guide')
  assert.equal(source.guideId, 'k-lm')
  assert.equal(source.teamId, 'TCD')
  assert.equal(source.title, 'LocalMode result handling')
  assert.match(answer.text, /Cancelled by Cancel Key Pressed/)
})

test('Hubert answers an English question about a rejection source from the same article', () => {
  const { api } = fixture()
  const answer = api.query({ token: 'valid', question: 'what does rejection source 05 mean in LocalMode?', language: 'en' }, now)
  assert.ok(knowledgeSources(answer).some(source => source.guideId === 'k-lm'), JSON.stringify(answer.sources))
  assert.match(answer.text, /Host\/PSP/)
})

test('guide sources stay unmarked so existing guide answers are unchanged', () => {
  const { api } = fixture()
  const answer = ask(api, 'terminal cable')
  const guide = answer.sources.find(source => source.guideId === 'own')
  assert.ok(guide)
  assert.equal(guide.library, undefined)
})

test('source fetch rechecks the library: an article is not a guide and a guide is not an article', () => {
  const { api } = fixture()
  assert.equal(api.getGuide('valid', 'TCD', 'k-lm', 'knowledge').guide.title, 'LocalMode result handling')
  assert.throws(() => api.getGuide('valid', 'TCD', 'k-lm'), /ikke adgang/)
  assert.throws(() => api.getGuide('valid', 'TCD', 'own', 'knowledge'), /ikke adgang/)
  assert.throws(() => api.getGuide('valid', 'TCD', 'k-lm', 'unknown'), /ikke adgang/)
})

test('another team\'s article is only used with an approved, unexpired knowledge grant', () => {
  const { api, stores } = fixture()
  assert.ok(!JSON.stringify(ask(api, 'settlement cut-off outside knowledge')).includes('OUTSIDE_KB_SECRET'))
  assert.throws(() => api.getGuide('valid', 'TRR', 'k-out', 'knowledge'), /ikke adgang/)

  stores.TRR['guide-access-requests'] = [grant()]
  assert.ok(!JSON.stringify(ask(api, 'settlement cut-off outside knowledge')).includes('OUTSIDE_KB_SECRET'), 'a guide grant must not unlock an article')
  assert.throws(() => api.getGuide('valid', 'TRR', 'k-out', 'knowledge'), /ikke adgang/)

  stores.TRR['knowledge-access-requests'] = [grant()]
  const granted = ask(api, 'settlement cut-off outside knowledge')
  assert.ok(knowledgeSources(granted).some(source => source.guideId === 'k-out' && source.teamId === 'TRR'))
  assert.equal(api.getGuide('valid', 'TRR', 'k-out', 'knowledge').guide.id, 'k-out')

  stores.TRR['knowledge-access-requests'] = [grant({ expiresAt: '2000-01-01T00:00:00Z' })]
  assert.ok(!JSON.stringify(ask(api, 'settlement cut-off outside knowledge')).includes('OUTSIDE_KB_SECRET'))
  assert.throws(() => api.getGuide('valid', 'TRR', 'k-out', 'knowledge'), /ikke adgang/)

  stores.TRR['knowledge-access-requests'] = [grant(), grant({ id: 'r', status: 'rejected', requestedAt: '2026-09-15T00:00:00Z' })]
  assert.throws(() => api.getGuide('valid', 'TRR', 'k-out', 'knowledge'), /ikke adgang/)
})

test('shared articles are only visible to the teams they are shared with', () => {
  const { api, shared } = fixture()
  shared['shared-knowledge-articles'] = [{ id: 'k-shared', title: 'Chargeback rules', version: '1.00', sharedWithTeamCodes: ['TRR'], sections: [{ heading: 'Chargeback', steps: [{ text: 'SHARED_KB_SECRET chargeback window is 120 days.', imageIds: [] }] }] }]
  assert.ok(!JSON.stringify(ask(api, 'chargeback window rules')).includes('SHARED_KB_SECRET'))
  shared['shared-knowledge-articles'][0].sharedWithTeamCodes = ['TRR', 'TCD']
  const answer = ask(api, 'chargeback window rules')
  assert.ok(knowledgeSources(answer).some(source => source.guideId === 'k-shared'))
  assert.equal(api.getGuide('valid', 'TCD', 'k-shared', 'knowledge').guide.id, 'k-shared')
})

test('a personal data question never reads the Knowledge Base', () => {
  const { api, reads } = fixture()
  ask(api, 'hvem holder ferie i dag?')
  assert.ok(!reads.some(key => /knowledge-(articles|access-requests)/.test(key)), reads.join(', '))
})

test('a changed article is detected when the source is revalidated by its library', () => {
  const { api, stores } = fixture()
  const before = api.getGuide('valid', 'TCD', 'k-lm', 'knowledge').guide
  stores.TCD['knowledge-articles'] = [{ ...localMode, version: '1.01' }]
  assert.notEqual(api.getGuide('valid', 'TCD', 'k-lm', 'knowledge').guide, before)
})

test('the planner catalog lets the local model choose the Knowledge Base', () => {
  const { api } = fixture()
  assert.ok(api.moduleCatalog().some(module => module.id === 'knowledge'))
})

test('article sources can load only their own original PDF and Word attachments', () => {
  const { api, stores } = fixture()
  stores.TCD['knowledge-articles'][0] = { ...localMode, originalPdfUrl: 'kv://file_pdf', fileUrl: 'kv://file_word' }
  stores.TCD.file_pdf_meta = { size: 5, contentType: 'application/pdf', data: Buffer.from('%PDF-').toString('base64') }
  stores.TCD.file_word_meta = { size: 4, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: 'UEsDBA==' }
  assert.match(api.getImage('valid', 'TCD', 'k-lm', 'file_pdf', 'knowledge'), /^data:application\/pdf;base64,/)
  assert.match(api.getImage('valid', 'TCD', 'k-lm', 'file_word', 'knowledge'), /^data:application\/vnd.openxmlformats/)
  assert.throws(() => api.getImage('valid', 'TCD', 'k-lm', 'file_unrelated', 'knowledge'), /ikke del/)
  assert.throws(() => api.getImage('valid', 'TCD', 'k-lm', 'file_pdf'), /ikke adgang/)
  stores.TCD.file_pdf_meta.contentType = 'text/html'
  assert.throws(() => api.getImage('valid', 'TCD', 'k-lm', 'file_pdf', 'knowledge'), /Ugyldigt/)
})

test('the knowledge catalog recognizes article queries in da/en/fi/sv and isolates an explicit library search', () => {
  const { createKnowledge } = require('./assistantKnowledge.cjs')
  const knowledge = createKnowledge({ readTeam: () => [], readShared: () => [], creatorEmail: () => '', resolveDates: () => null })
  for (const question of ['vidensartikel', 'Knowledge Base', 'artikkeli', 'kunskapsbas']) assert.ok(knowledge.matchedModules(question).includes('knowledge'), question)
  const { api } = fixture()
  const answer = ask(api, 'LocalMode', { searchPlan: { modules: ['knowledge'], terms: [] } })
  assert.ok(answer.sources.length)
  assert.ok(answer.sources.every(source => source.library === 'knowledge'), JSON.stringify(answer.sources))
})

test('a short result code selects its PDF-imported explanation rather than another article or the heading alone', () => {
  const { api, stores } = fixture()
  stores.TCD['knowledge-articles'] = [
    { ...localMode, title: 'Imported Word Reference', id: 'word', sections: [{ heading: 'Terminal result', steps: [{ text: 'Rejection source 05 means Host/PSP.', imageIds: [] }] }] },
    { ...localMode, title: 'Imported PDF Reference', sections: [{ heading: 'Overview', steps: [{ text: 'Rejection Reason', imageIds: [] }, { text: '2:1 - Cancelled by Cancel Key Pressed', imageIds: [] }] }] },
  ]
  const answer = ask(api, 'what does rejection reason 2:1 mean?', { language: 'en' })
  assert.match(answer.text, /Cancelled by Cancel Key Pressed/)
  assert.ok(knowledgeSources(answer).some(source => source.guideId === 'k-lm' && source.reference === '1.2'), JSON.stringify(answer))
  assert.doesNotMatch(answer.text, /Host\/PSP/)
})
