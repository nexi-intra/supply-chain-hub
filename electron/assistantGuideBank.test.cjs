// Guide question bank: synthetic guides that mimic the real library's structures
// (short step texts, English guides asked in Danish, model numbers, Word-only guides).
const test = require('node:test')
const assert = require('node:assert/strict')
const JSZip = require('jszip')
const { createAssistantContext } = require('./assistantContext.cjs')

const now = new Date(2026, 8, 15, 12)
const steps = (...texts) => texts.map(text => ({ text, imageIds: [] }))
const GUIDES = [
  { id: 'acme-update', title: 'ACME Software update', version: '1.0', language: 'en', sections: [{ heading: 'Update', steps: steps('Open the terminal menu.', 'Choose Software update.', 'Wait until the terminal restarts.') }] },
  { id: 'credit', title: 'Create a credit note', version: '1.0', language: 'en', sections: [{ heading: 'Credit note', steps: steps('Open transaction VF01.', 'Enter the invoice number.', 'Save the credit note.') }] },
  { id: 'battery', title: 'Battery charging', version: '1.0', language: 'en', sections: [{ heading: 'Charging', steps: steps('Place the battery in the charger.', 'Charge for 4 hours.') }] },
  { id: 'sim', title: 'Move3500 med simkort', version: '1.0', language: 'da', sections: [{ heading: 'Simkort', steps: steps('Sluk terminalen.', 'Saet simkortet i holderen under batteriet.', 'Taend terminalen igen.') }] },
  { id: 'norway', title: 'Luk Norge DO nummer', version: '1.0', language: 'da', sections: [{ heading: 'Luk DO', steps: steps('Find DO nummeret i SAP.', 'Vaelg Luk og gem.') }] },
  { id: 'pallet', title: 'DSV palle med invoice', version: '1.0', language: 'da', sections: [{ heading: 'Palle', steps: steps('Pallen til Norge pakkes.', 'Invoice til Norge printes.', 'Norge-pallen afhentes af DSV.') }] },
  { id: 'dupes', title: 'Duplicates on Tetra', version: '1.0', language: 'en', sections: [{ heading: 'Duplicates', steps: steps('Search the serial in SAP.', 'Delete the duplicate entry.') }] },
  { id: 'sap-password', title: 'Change password', version: '1.0', language: 'en', category: 'SAP', sections: [{ heading: 'SAP password', steps: steps('Open SAP logon.', 'Press New password.', 'Enter the new password twice.') }] },
  { id: 'address', title: 'Change address on repair order', version: '1.0', language: 'en', sections: [{ heading: 'Address', steps: steps('Open the repair order.', 'Edit the delivery address.') }] },
  { id: 'kemi', title: 'Quick Guide Kemi', version: '1.0', language: 'da', sections: [], preserveWordLayout: true, fileUrl: 'kv://file_kemi', wordFileName: 'kemi.docx' },
]

async function wordFile() {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Førstehjælp</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t xml:space="preserve">Ved kemikalier i øjnene: </w:t></w:r><w:r><w:t>skyl med vand i 15 minutter.</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>Ring 112 ved &amp; alvorlige symptomer.</w:t></w:r></w:p>'
    + '</w:body></w:document>')
  return (await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })).toString('base64')
}

let wordData
test.before(async () => { wordData = await wordFile() })

function fixture() {
  const teams = [{ teamId: 'TRR', abbreviation: 'TRR', name: 'Repair', folderName: 'TRR' }, { teamId: 'OTHER', abbreviation: 'OTH', name: 'Other', folderName: 'OTHER' }]
  const stores = {
    TRR: {
      users: { 'me@test': { email: 'me@test', fullName: 'Test User', status: 'approved' } },
      guides: [...GUIDES],
      file_kemi_meta: { filename: 'kemi.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1000, chunkCount: 0, data: wordData },
    },
    OTHER: {
      users: { 'other@test': { email: 'other@test', fullName: 'Other Person', status: 'approved' } },
      guides: [{ id: 'secret', title: 'Secret credit note process', version: '1.0', sections: [{ heading: 'x', steps: steps('OTHER_TEAM_SECRET credit note') }] }],
    },
  }
  const shared = { 'active-sessions': { valid: { email: 'me@test', expiresAt: Date.now() + 60000 } }, 'shared-guides': [] }
  const api = createAssistantContext({
    listTeams: () => teams,
    lookupTeam: () => teams[0],
    creatorEmail: () => 'creator@test',
    currentFolder: () => 'TRR',
    readShared: key => shared[key],
    readTeam: (team, key) => stores[team.teamId][key],
  })
  return { api, stores, shared }
}
const ask = (question, language = 'da') => fixture().api.query({ token: 'valid', question, language }, now)
const topGuide = answer => (answer.sources || []).find(source => source.kind === 'guide')?.guideId

test('a guide about a product beats the app\'s own how-to for the same verb', () => {
  const answer = ask('hvordan opdaterer jeg softwaren på en acme terminal?')
  assert.equal(answer.mode, 'retrieval')
  assert.equal(topGuide(answer), 'acme-update')
  const sap = ask('hvordan skifter jeg mit password i SAP?')
  assert.equal(topGuide(sap), 'sap-password')
})

test('Danish questions find English guides (kreditnota -> credit note, dubletter -> duplicates)', () => {
  assert.equal(topGuide(ask('hvordan laver jeg en kreditnota?')), 'credit')
  assert.equal(topGuide(ask('hvad gør jeg med dubletter på tetra?')), 'dupes')
  assert.equal(topGuide(ask('how do I create a credit note?', 'en')), 'credit')
})

test('inflections and model numbers match (batterierne -> battery, move 3500 -> Move3500, simkortet -> simkort)', () => {
  assert.equal(topGuide(ask('hvordan lader jeg batterierne op?')), 'battery')
  assert.equal(topGuide(ask('hvordan sætter jeg simkortet i en move 3500?')), 'sim')
})

test('a guide whose title matches wins over a guide that only repeats a word in its steps', () => {
  assert.equal(topGuide(ask('hvordan lukker jeg et DO nummer til Norge?')), 'norway')
})

test('a how-to answer contains the whole procedure in order, not a single step', () => {
  const answer = ask('hvordan laver jeg en kreditnota?')
  assert.match(answer.text, /1\. Open transaction VF01\.\n2\. Enter the invoice number\.\n3\. Save the credit note\./)
})

test('evidence fits the local model: the main guide keeps its procedure, extra sources are short', () => {
  const { api, stores } = fixture()
  const long = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix} trin ${i + 1}: ${'detaljeret forklaring '.repeat(10)}`)
  stores.TRR.guides = [
    { id: 'big1', title: 'Quorbel kalibrering', version: '1.0', sections: [{ heading: 'Kalibrering', steps: steps(...long('Quorbel kalibrering', 30)) }] },
    { id: 'big2', title: 'Quorbel kalibrering avanceret', version: '1.0', sections: [{ heading: 'Kalibrering', steps: steps(...long('Quorbel kalibrering', 30)) }] },
    { id: 'big3', title: 'Quorbel kalibrering ekspert', version: '1.0', sections: [{ heading: 'Kalibrering', steps: steps(...long('Quorbel kalibrering', 30)) }] },
  ]
  const answer = api.query({ token: 'valid', question: 'hvordan kalibrerer jeg en quorbel?' }, now)
  assert.ok(answer.text.length <= 6500, `evidence ${answer.text.length} chars`)
  assert.ok(answer.sources[0].text.length > answer.sources[1].text.length)
})

test('picture-only steps keep their place in the numbering and point to the picture', () => {
  const { api, stores } = fixture()
  stores.TRR.guides = [{ id: 'pics', title: 'Quorbel montering', version: '1.0', sections: [{ heading: 'Montering', steps: [{ text: 'Tag laaget af.', imageIds: [] }, { text: '', imageIds: ['file_pic'] }, { text: 'Skru laaget paa.', imageIds: [] }] }] }]
  const answer = api.query({ token: 'valid', question: 'hvordan monterer jeg en quorbel?' }, now)
  assert.match(answer.text, /1\. Tag laaget af\.\n2\. \(se billedet i guiden\)\n3\. Skru laaget paa\./)
})

test('Word-only guides are searchable by their document text', () => {
  const answer = ask('hvad gør jeg hvis jeg får kemikalier i øjnene?')
  assert.equal(answer.mode, 'retrieval')
  assert.equal(topGuide(answer), 'kemi')
  assert.match(answer.text, /skyl med vand i 15 minutter/)
  assert.match(answer.text, /Ring 112 ved & alvorlige symptomer/)
})

test('guides from a team without access never appear', () => {
  for (const question of ['hvordan laver jeg en kreditnota?', 'credit note process', 'secret credit note']) {
    assert.ok(!JSON.stringify(ask(question)).includes('OTHER_TEAM_SECRET'), question)
  }
})

test('bare keywords that clearly name a guide open it instead of the generic search', () => {
  assert.equal(topGuide(ask('acme opdatering')), 'acme-update')
  assert.equal(topGuide(ask('tetra dubletter')), 'dupes')
})

test('the safety guard never blocks a guide lookup, but still refuses real commands and secrets', () => {
  assert.equal(topGuide(ask('delete duplicates tetra', 'en')), 'dupes')
  assert.equal(topGuide(ask('sap password skift')), 'sap-password')
  assert.equal(ask('slet alle mine opgaver').guard, 'destructive')
  assert.equal(ask('hvad er admin kodeordet?').guard, 'credentials')
})

test('Danish compound words are split into known parts (adresseændring -> change address)', () => {
  assert.equal(topGuide(ask('adresseændring repair order')), 'address')
})

test('short Danish roots and definition questions reach the guide that explains them', () => {
  const { api, stores } = fixture()
  stores.TRR.guides = [...stores.TRR.guides,
    { id: 'share', title: 'Teamfunktioner', version: '1.0', sections: [{ heading: 'Deling', steps: steps('Vaelg Del med andre teams i editoren.') }] },
    { id: 'review-flow', title: 'Review-flow', version: '1.0', sections: [{ heading: 'Status', steps: steps('"Afventer review" betyder at guiden ikke er udgivet endnu.') }] }]
  stores.TRR['vacation-entries'] = [{ id: 'v1', userEmail: 'me@test', startDate: '2026-12-21', endDate: '2026-12-22', status: 'pending' }]
  const query = question => api.query({ token: 'valid', question }, now)
  assert.equal(topGuide(query('hvordan deler jeg en guide med andre teams?')), 'share')
  assert.equal(topGuide(query('hvad betyder afventer review?')), 'review-flow')
})

test('questions about the app itself still get the app guidance', () => {
  assert.equal(ask('hvordan opretter jeg en guide?').mode, 'app-guide')
  assert.equal(ask('hvordan ændrer jeg mit kodeord?').mode, 'app-guide')
})

test('future-proof: a guide published while Hubert runs is understood at once, including a never-seen product name', () => {
  const { api, stores, shared } = fixture()
  const query = question => api.query({ token: 'valid', question }, now)
  assert.equal(topGuide(query('hvordan kalibrerer jeg en zyntrax 7?')), undefined)
  stores.TRR.guides = [...stores.TRR.guides, { id: 'zyntrax', title: 'Zyntrax 7 kalibrering', version: '1.0', language: 'da', sections: [{ heading: 'Kalibrering', steps: steps('Tryk paa menu.', 'Vaelg Kalibrer.', 'Bekraeft med OK.') }] }]
  const answer = query('hvordan kalibrerer jeg en zyntrax 7?')
  assert.equal(topGuide(answer), 'zyntrax')
  assert.match(answer.text, /1\. Tryk paa menu\.\n2\. Vaelg Kalibrer\.\n3\. Bekraeft med OK\./)
  // An edited guide replaces the old text immediately (new object = new index).
  stores.TRR.guides = stores.TRR.guides.map(guide => guide.id === 'zyntrax' ? { ...guide, version: '1.01', sections: [{ heading: 'Kalibrering', steps: steps('Hold knappen nede i 5 sekunder.') }] } : guide)
  const edited = query('hvordan kalibrerer jeg en zyntrax 7?')
  assert.match(edited.text, /Hold knappen nede i 5 sekunder/)
  assert.doesNotMatch(edited.text, /Tryk paa menu/)
  // A shared guide and a newly uploaded Word guide are found the same way.
  shared['shared-guides'] = [{ id: 'shared-ny', title: 'Quorbel scanner opsaetning', version: '1.0', sharedWithTeamCodes: ['TRR'], sections: [{ heading: 'Opsaetning', steps: steps('Scan opsaetningskoden.') }] }]
  assert.equal(topGuide(query('hvordan sætter jeg en quorbel scanner op?')), 'shared-ny')
  stores.TRR.file_ny_meta = { ...stores.TRR.file_kemi_meta }
  stores.TRR.guides = [...stores.TRR.guides, { id: 'ny-word', title: 'Ny Word guide', version: '1.0', sections: [], preserveWordLayout: true, fileUrl: 'kv://file_ny' }]
  assert.ok(['kemi', 'ny-word'].includes(topGuide(query('hvad gør jeg ved kemikalier i øjnene?'))))
})

test('future-proof: no guide-specific rules - a brand new topic with unknown words ranks by its own title', () => {
  const { api, stores } = fixture()
  stores.TRR.guides = [...stores.TRR.guides,
    { id: 'a', title: 'Plimbo pakning', version: '1.0', sections: [{ heading: 'x', steps: steps('Pak plimbo kassen.') }] },
    { id: 'b', title: 'Generel pakning', version: '1.0', sections: [{ heading: 'x', steps: steps('Pak kassen.', 'Plimbo kan ogsaa pakkes her.') }] }]
  assert.equal(topGuide(api.query({ token: 'valid', question: 'hvordan pakker jeg en plimbo?' }, now)), 'a')
})
