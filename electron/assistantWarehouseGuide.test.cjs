// Hubert's how-to answers for Arbejdsværktøjer (Optælling, Placeringer, Stempelkort and Softwareload, TCD/TRR), in all four languages.
const test = require('node:test')
const assert = require('node:assert/strict')
const { ask, DANISH_GUIDE } = require('./assistantTrainingBank.cjs')
const { APP_GUIDE, APP_TOPICS } = require('./assistantAppGuide.cjs')
const { LOCALIZED } = require('./assistantAppGuideI18n.cjs')

const MODULE = { da: 'Arbejdsværktøjer', en: 'Work Tools', fi: 'Työkalut', sv: 'Arbetsverktyg' }
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
  const QUESTIONS = { da: ['hvordan gør jeg en kollega til placerings admin?', 'Udnævn admin, status manager eller Placerings admin', /"Roller i Arbejdsværktøjer"/], en: ['how do I make a colleague location admin?', 'Appoint an admin, a status manager or a Placerings admin', /"Work tools roles"/], fi: ['miten teen kollegasta sijaintien admin?', 'Nimeä admin, status manager tai Placerings admin', /"Työkalujen roolit"/], sv: ['hur gör jag en kollega till placeringsadmin?', 'Utse en admin, en status manager eller en Placerings admin', /"Roller i Arbetsverktyg"/] }
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

test('the guide explains Stempelkort to everyone and the registered times to managers, in four languages', () => {
  const CLOCK = [
    ['hvordan stempler jeg ind på en opgave?', 'da', 'Stempl ind og ud på en opgave'], ['how do I clock in on a task?', 'en', 'Clock in and out on a task'],
    ['miten leimaan sisään tehtävälle?', 'fi', 'Leimaa sisään ja ulos tehtävälle'], ['hur stämplar jag in på en uppgift?', 'sv', 'Stämpla in och ut på en uppgift'],
  ]
  for (const [question, language, title] of CLOCK) {
    const answer = ask({ q: question, lang: language })
    assert.equal(answer.mode, 'app-guide', `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
    assert.match(answer.text, starts(language, title), `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
    if (language !== 'da') assert.doesNotMatch(answer.text, DANISH_GUIDE, language)
  }
  const TIMES = [
    ['hvor kan jeg se registrerede tider pr. opgave?', 'da', 'Se registrerede tider og statistik'], ['where do I see the registered times per task?', 'en', 'See registered times and statistics'],
    ['mistä näen kirjatut ajat tehtävittäin?', 'fi', 'Katso kirjatut ajat ja tilastot'], ['var ser jag registrerade tider per uppgift?', 'sv', 'Se registrerade tider och statistik'],
  ]
  for (const [question, language, title] of TIMES) {
    const answer = ask({ q: question, lang: language }, { role: 'manager' })
    assert.equal(answer.mode, 'app-guide', `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
    assert.match(answer.text, starts(language, title), `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
  }
  assert.doesNotMatch(ask({ q: 'hvor kan jeg se registrerede tider pr. opgave?', lang: 'da' }, { role: 'user' }).text, /^Arbejdsværktøjer - Se registrerede tider/, 'an employee is not handed the managers\' overview')
})

const SOFTWARELOAD_QUESTIONS = [
  ['softwareload-start', { da: ['hvordan starter jeg en softwareload-opgave?', 'Start en softwareload-opgave'], en: ['how do I start a softwareload task?', 'Start a softwareload task'], fi: ['miten aloitan softwareload-tehtävän?', 'Aloita softwareload-tehtävä'], sv: ['hur startar jag en softwareload-uppgift?', 'Starta en softwareload-uppgift'] }],
  ['softwareload-failed', { da: ['hvordan markerer jeg en terminal som fejlet?', 'Markér en terminal som fejlet'], en: ['how do I mark a terminal as failed?', 'Mark a terminal as failed'], fi: ['miten merkitsen päätteen epäonnistuneeksi?', 'Merkitse pääte epäonnistuneeksi'], sv: ['hur markerar jag en terminal som misslyckad?', 'Markera en terminal som misslyckad'] }],
  ['softwareload-finish', { da: ['hvordan afslutter jeg softwareload og flytter i SAP?', 'Afslut og flyt i SAP'], en: ['how do I finish and move the terminals in SAP?', 'Finish and move in SAP'], fi: ['miten päätän tehtävän ja siirrän päätteet SAPissa?', 'Päätä ja siirrä SAPissa'], sv: ['hur avslutar jag och flyttar terminalerna i SAP?', 'Avsluta och flytta i SAP'] }],
  ['softwareload-kif', { da: ['hvordan flytter jeg terminaler ind i KIF?', 'Flyt ind i KIF'], en: ['how do I move terminals into KIF?', 'Move into KIF'], fi: ['miten siirrän päätteet KIF:iin?', 'Siirrä KIF:iin'], sv: ['hur flyttar jag terminaler in i KIF?', 'Flytta in i KIF'] }],
  ['softwareload-search', { da: ['hvordan søger jeg på et serienummer i softwareload?', 'Søg på et serienummer'], en: ['how do I search a serial number in softwareload?', 'Search a serial number'], fi: ['miten haen sarjanumerolla softwareloadissa?', 'Hae sarjanumerolla'], sv: ['hur söker jag på ett serienummer i softwareload?', 'Sök på ett serienummer'] }],
  ['softwareload-stats', { da: ['hvordan ser jeg statistik for softwareload?', 'Se softwareload-statistik'], en: ['how do I see the softwareload statistics?', 'See softwareload statistics'], fi: ['miten näen softwareload-tilastot?', 'Katso softwareload-tilastot'], sv: ['hur ser jag statistik för softwareload?', 'Visa softwareload-statistik'] }],
]

test('the guide answers how-to questions about Softwareload in four languages', () => {
  for (const [id, byLanguage] of SOFTWARELOAD_QUESTIONS) {
    for (const [language, [question, title]] of Object.entries(byLanguage)) {
      const answer = ask({ q: question, lang: language })
      assert.equal(answer.mode, 'app-guide', `${id} ${language}: ${question} -> ${answer.text.slice(0, 80)}`)
      assert.match(answer.text, starts(language, title), `${id} ${language}: ${question} -> ${answer.text.slice(0, 80)}`)
      if (language !== 'da') assert.doesNotMatch(answer.text, DANISH_GUIDE, `${id} ${language}`)
    }
  }
})

test('"where can I see" questions about Softwareload get the search and the statistics directly, also for an employee', () => {
  const WHERE = [
    ['hvor kan jeg se hvem der har loadet en terminal?', 'da', 'Søg på et serienummer'], ['where can I see who loaded a terminal?', 'en', 'Search a serial number'],
    ['mistä näen kuka latasi päätteen?', 'fi', 'Hae sarjanumerolla'], ['var ser jag vem som laddade en terminal?', 'sv', 'Sök på ett serienummer'],
    ['hvor kan jeg se softwareload-statistik?', 'da', 'Se softwareload-statistik'], ['where can I see the softwareload statistics?', 'en', 'See softwareload statistics'],
    ['mistä näen softwareload-tilastot?', 'fi', 'Katso softwareload-tilastot'], ['var ser jag softwareload-statistik?', 'sv', 'Visa softwareload-statistik'],
  ]
  for (const [question, language, title] of WHERE) {
    const answer = ask({ q: question, lang: language }, { role: 'user' })
    assert.equal(answer.mode, 'app-guide', `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
    assert.match(answer.text, starts(language, title), `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
  }
})

test('the Softwareload guide states the facts of the tool: Stempelkort stops, -0 to D000 and -R to D002, KIF via D005, "Venter på SAP"', () => {
  const start = ask({ q: 'hvordan starter jeg en softwareload-opgave?', lang: 'da' }).text
  assert.match(start, /"Softwareload \+ keyload", "Softwareload" eller "Keyload"/)
  assert.match(start, /Kører Stempelkort, bliver det stoppet/)
  assert.match(start, /Vælg målet på listen under "Mål \(storage location\)"/)
  const failed = ask({ q: 'hvordan markerer jeg en terminal som fejlet?', lang: 'da' }).text
  assert.match(failed, /-0\) til D000 og blocked stock/)
  assert.match(failed, /\(-R\) går til D002/)
  const finish = ask({ q: 'hvordan afslutter jeg softwareload og flytter i SAP?', lang: 'da' }).text
  assert.match(finish, /"Afslut og flyt i SAP"/)
  assert.match(finish, /I KIF går alt via D005/)
  assert.match(finish, /"Venter på SAP"/)
  const en = ask({ q: 'how do I finish and move the terminals in SAP?', lang: 'en' }).text
  assert.match(en, /"Finish and move in SAP"/)
  assert.match(en, /"Waiting for SAP"/)
})

test('continuing or giving up a task that waits for SAP reaches the finish task, and general "does not load" questions never reach Softwareload', () => {
  const WAITING = [
    ['hvordan fortsætter jeg en softwareload-opgave i SAP?', 'da', 'Afslut og flyt i SAP'], ['hvordan opgiver jeg en opgave der venter på SAP?', 'da', 'Afslut og flyt i SAP'],
    ['hvad gør jeg når opgaven venter på SAP?', 'da', 'Afslut og flyt i SAP'],
    ['how do I continue a task that is waiting for SAP?', 'en', 'Finish and move in SAP'], ['how do I give up a task that is waiting for SAP?', 'en', 'Finish and move in SAP'],
    ['miten jatkan tehtävää, joka odottaa SAPia?', 'fi', 'Päätä ja siirrä SAPissa'], ['miten luovun tehtävästä, joka odottaa SAPia?', 'fi', 'Päätä ja siirrä SAPissa'],
    ['hur fortsätter jag en softwareload-uppgift i SAP?', 'sv', 'Avsluta och flytta i SAP'], ['hur ger jag upp en uppgift som väntar på SAP?', 'sv', 'Avsluta och flytta i SAP'],
  ]
  for (const [question, language, title] of WAITING) {
    const answer = ask({ q: question, lang: language }, { role: 'user' })
    assert.equal(answer.mode, 'app-guide', `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
    assert.match(answer.text, starts(language, title), `${language}: ${question} -> ${answer.text.slice(0, 80)}`)
  }
  const SOFTWARELOAD_TITLES = /^(?:Arbejdsværktøjer|Work Tools|Työkalut|Arbetsverktyg) - (?:Start en softwareload|Markér en terminal|Afslut og flyt|Flyt ind i KIF|Søg på et serienummer|Se softwareload|Start a softwareload|Mark a terminal|Finish and move|Move into KIF|Search a serial|See softwareload|Aloita softwareload|Merkitse pääte|Päätä ja siirrä|Siirrä KIF|Hae sarjanumerolla|Katso softwareload|Starta en softwareload|Markera en terminal|Avsluta och flytta|Flytta in i KIF|Sök på ett serienummer|Visa softwareload)/
  const GENERAL = [
    ['what do I do if a link does not load?', 'en'], ['hvad gør jeg hvis hubben loader ikke?', 'da'], ['sovellus ei lataudu', 'fi'], ['appen laddar inte', 'sv'],
    // Optælling also continues in SAP: those questions belong to Optælling, not to Softwareload.
    ['hvordan fortsætter jeg i SAP med optællingen?', 'da'], ['how do I continue in SAP with the stock count?', 'en'], ['hur fortsätter jag i SAP med inventeringen?', 'sv'],
  ]
  for (const [question, language] of GENERAL) assert.doesNotMatch(String(ask({ q: question, lang: language }, { role: 'user' }).text), SOFTWARELOAD_TITLES, `${language}: ${question}`)
  assert.match(ask({ q: 'what do I do if a link does not load?', lang: 'en' }, { role: 'user' }).text, /^Link Library - Report a link that does not work/)
  const FAILED = [
    ['what do I do if a terminal does not load?', 'en', 'Mark a terminal as failed'], ['hvad gør jeg hvis en terminal ikke loader?', 'da', 'Markér en terminal som fejlet'],
    ['mitä teen, jos pääte ei lataudu?', 'fi', 'Merkitse pääte epäonnistuneeksi'], ['mitä teen, jos ohjelmisto ei lataudu päätteeseen?', 'fi', 'Merkitse pääte epäonnistuneeksi'],
    ['vad gör jag om terminalen inte laddar?', 'sv', 'Markera en terminal som misslyckad'], ['vad gör jag om en terminal inte laddar?', 'sv', 'Markera en terminal som misslyckad'],
  ]
  for (const [question, language, title] of FAILED) assert.match(ask({ q: question, lang: language }, { role: 'user' }).text, starts(language, title), `${language}: ${question}`)
})

test('no guide text has two or more spaces in a row (answers are shown with whitespace-pre-wrap)', () => {
  const doubled = []
  const walk = (value, where) => {
    if (typeof value === 'string') { if (/ {2,}/.test(value)) doubled.push(`${where}: ${value.slice(0, 60)}`) }
    else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${where}[${index}]`))
    else if (value && typeof value === 'object' && !(value instanceof RegExp)) for (const [key, item] of Object.entries(value)) walk(item, `${where}.${key}`)
  }
  walk(APP_GUIDE, 'da')
  walk(APP_TOPICS, 'topics')
  walk(LOCALIZED, 'localized')
  assert.deepEqual(doubled, [])
})
