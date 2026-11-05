// Hubert's how-to answers for Lagerstyring > Optælling (TCD/TRR), in all four languages.
const test = require('node:test')
const assert = require('node:assert/strict')
const { ask, DANISH_GUIDE } = require('./assistantTrainingBank.cjs')

const MODULE = { da: 'Lagerstyring', en: 'Warehouse Management', fi: 'Varastonhallinta', sv: 'Lagerstyrning' }
const starts = (language, title) => new RegExp(`^${MODULE[language]} - ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)

const QUESTIONS = [
  ['blocked-unblocked', { da: ['hvordan tæller jeg blocked lager?', 'Tæl blocked og unblocked lager'], en: ['how do I count blocked stock?', 'Count blocked and unblocked stock'], fi: ['miten inventoin blocked-varaston?', 'Inventoi blocked- ja unblocked-varasto'], sv: ['hur räknar jag blocked lager?', 'Räkna blocked och unblocked lager'] }],
  ['long-serials', { da: ['hvordan kopierer jeg lange serienumre til SAP?', 'Lange serienumre til SAP-dokumenter'], en: ['how do I copy long serial numbers to SAP?', 'Long serial numbers for SAP documents'], fi: ['miten kopioin pitkät sarjanumerot SAP:iin?', 'Pitkät sarjanumerot SAP-asiakirjoihin'], sv: ['hur kopierar jag långa serienummer till SAP?', 'Långa serienummer till SAP-dokument'] }],
  ['create-count', { da: ['hvordan opretter jeg en optælling?', 'Opret en optælling'], en: ['how do I create a stock count?', 'Create a count'], fi: ['miten luon inventoinnin?', 'Luo inventointi'], sv: ['hur skapar jag en inventering?', 'Skapa en inventering'] }],
  ['archive', { da: ['hvordan ser jeg difference i procent for en afholdt status?', 'Arkiv og difference i procent'], en: ['how do I see the percent difference of a held status?', 'Archive and difference in percent'], fi: ['miten näen erotus prosentteina aiemmasta statuksesta?', null], sv: ['hur ser jag differens i procent för en tidigare status?', null] }],
]

test('how-to questions about Optælling get the right task in every language, and en/fi/sv answers have no Danish guide words', () => {
  for (const [id, byLanguage] of QUESTIONS) {
    for (const [language, [question, title]] of Object.entries(byLanguage)) {
      const answer = ask({ q: question, lang: language })
      assert.equal(answer.mode, 'app-guide', `${id} ${language}: ${question} -> ${answer.text.slice(0, 80)}`)
      if (title) assert.match(answer.text, starts(language, title), `${id} ${language}: ${question}`)
      else assert.match(answer.text, new RegExp(`^${MODULE[language]} - `), `${id} ${language}: ${question}`)
      if (language !== 'da') assert.doesNotMatch(answer.text, DANISH_GUIDE, `${id} ${language}`)
    }
  }
})

test('the guide quotes the button names the Danish and English screens really show', () => {
  const da = ask({ q: 'hvordan opretter jeg et SAP-dokument i optællingen?', lang: 'da' }, { role: 'manager' }).text
  assert.match(da, /"Til optællingsdokument"/)
  const en = ask({ q: 'how do I create a SAP document in the stock count?', lang: 'en' }, { role: 'manager' }).text
  assert.match(en, /"To count document"/)
  assert.match(en, /"Enter quantity"/)
  assert.doesNotMatch(en, /Optælling/)
})

const LOCATION_QUESTIONS = [
  ['locations-put-away', { da: ['hvordan sætter jeg en palle på plads?', 'Sæt en palle på plads'], en: ['how do I put a pallet away?', 'Put a pallet away'], fi: ['miten laitan lavan paikalleen?', 'Laita lava paikalleen'], sv: ['hur sätter jag en pall på plats?', 'Sätt en pall på plats'] }],
  ['locations-take', { da: ['hvordan tager jeg en palle fra lageret?', 'Tag en palle (FIFO)'], en: ['how do I take a pallet from the warehouse?', 'Take a pallet (FIFO)'], fi: ['miten otan lavan varastosta?', 'Ota lava (FIFO)'], sv: ['hur tar jag en pall från lagret?', 'Ta en pall (FIFO)'] }],
  ['locations-refill', { da: ['hvordan fylder jeg en pluk-plads op?', 'Fyld en pluk-plads op'], en: ['how do I refill a pick place?', 'Refill a pick place'], fi: ['miten täytän keräilypaikan?', 'Täytä keräilypaikka'], sv: ['hur fyller jag på en plockplats?', 'Fyll på en plockplats'] }],
  ['locations-find', { da: ['hvordan finder jeg ud af hvor en palle står?', 'Find et materiale'], en: ['how do I find out where a pallet is?', 'Find a material'], fi: ['miten selvitän missä lava on?', 'Etsi materiaali'], sv: ['hur tar jag reda på var en pall står?', 'Hitta ett material'] }],
  ['locations-create', { da: ['hvordan opretter jeg nye placeringer?', 'Opret placeringer'], en: ['how do I create new locations?', 'Create locations'], fi: ['miten luon uusia sijainteja?', 'Luo sijainnit'], sv: ['hur skapar jag nya placeringar?', 'Skapa placeringar'] }],
  ['locations-import', { da: ['hvordan importerer jeg placeringsarket?', 'Importér placeringsarket'], en: ['how do I import the placement sheet?', 'Import the placement sheet'], fi: ['miten tuon sijoitustaulukon?', 'Tuo sijoitustaulukko'], sv: ['hur importerar jag placeringsarket?', 'Importera placeringsarket'] }],
]

test('the guide answers how-to questions about Placeringer in four languages', () => {
  for (const [id, byLanguage] of LOCATION_QUESTIONS) {
    for (const [language, [question, title]] of Object.entries(byLanguage)) {
      const answer = ask({ q: question, lang: language }, { role: 'manager' })
      assert.equal(answer.mode, 'app-guide', `${id} ${language}: ${question} -> ${answer.text.slice(0, 80)}`)
      assert.match(answer.text, starts(language, title), `${id} ${language}: ${question} -> ${answer.text.slice(0, 80)}`)
      if (language !== 'da') assert.doesNotMatch(answer.text, DANISH_GUIDE, `${id} ${language}`)
    }
  }
})

test('the guide tells a manager how to make a colleague Placerings admin, in four languages', () => {
  const QUESTIONS = { da: ['hvordan gør jeg en kollega til placerings admin?', 'Udnævn admin, status manager eller Placerings admin', /"Lagerstyringsroller"/], en: ['how do I make a colleague location admin?', 'Appoint an admin, a status manager or a Placerings admin', /"Warehouse roles"/], fi: ['miten teen kollegasta sijaintien admin?', 'Nimeä admin, status manager tai Placerings admin', /"Varastonhallinnan roolit"/], sv: ['hur gör jag en kollega till placeringsadmin?', 'Utse en admin, en status manager eller en Placerings admin', /"Lagerstyrningsroller"/] }
  for (const [language, [question, title, card]] of Object.entries(QUESTIONS)) {
    const answer = ask({ q: question, lang: language }, { role: 'manager' })
    assert.equal(answer.mode, 'app-guide', `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
    assert.match(answer.text, starts(language, title), `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
    assert.match(answer.text, card, language)
    if (language !== 'da') assert.doesNotMatch(answer.text, DANISH_GUIDE, language)
  }
})

test('the guide answers how to put on a shelf, create a rack and delete locations, in four languages', () => {
  const QUESTIONS = [
    ['hvordan lægger jeg noget på en hylde?', 'da', 'Læg på hylde'], ['how do I put goods on a shelf?', 'en', 'Put on a shelf'], ['miten laitan tavaraa hyllylle?', 'fi', 'Laita hyllylle'], ['hur lägger jag något på en hylla?', 'sv', 'Lägg på hylla'],
    ['hvordan opretter jeg en reol?', 'da', 'Opret reol'], ['how do I create a rack?', 'en', 'Create a rack'], ['miten luon hyllykön?', 'fi', 'Luo hyllykkö'], ['hur skapar jag en reol?', 'sv', 'Skapa en reol'],
    ['hvordan sletter jeg placeringer?', 'da', 'Slet placeringer'], ['how do I delete locations?', 'en', 'Delete locations'], ['miten poistan sijainteja?', 'fi', 'Poista sijainteja'], ['hur tar jag bort placeringar?', 'sv', 'Ta bort placeringar'],
  ]
  for (const [question, language, title] of QUESTIONS) {
    const answer = ask({ q: question, lang: language }, { role: 'manager' })
    assert.equal(answer.mode, 'app-guide', `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
    assert.match(answer.text, starts(language, title), `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
    if (language !== 'da') assert.doesNotMatch(answer.text, DANISH_GUIDE, language)
  }
  assert.match(ask({ q: 'hvordan tager jeg en palle fra lageret?', lang: 'da' }).text, /klik "Tag"\./, 'the take button is now called "Tag"')
})
