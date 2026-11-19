// App-guide answers follow the question language and use the labels the localized UI really shows.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { APP_GUIDE, APP_TOPICS, appGuidance, appGuideOverview, formatAppGuide, describeAppTerm, matchAppGuide } = require('./assistantAppGuide.cjs')
const { LOCALIZED } = require('./assistantAppGuideI18n.cjs')
const { DANISH_GUIDE } = require('./assistantTrainingBank.cjs')

const LANGUAGES = ['en', 'fi', 'sv']
const readUi = language => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', `translations.${language}.json`), 'utf8'))

test('every module, task and topic has an en/fi/sv text with the same number of steps', () => {
  for (const language of LANGUAGES) {
    const texts = LOCALIZED[language]
    assert.ok(texts, language)
    for (const module of APP_GUIDE) {
      const local = texts.modules[module.id]
      assert.ok(local?.title && local.summary && local.where, `${language} module ${module.id}`)
      for (const task of module.tasks) {
        const localTask = local.tasks?.[task.id]
        assert.ok(localTask?.title, `${language} task ${task.id}`)
        assert.equal(localTask.steps?.length, task.steps.length, `${language} steps ${task.id}`)
        assert.equal(!!localTask.notes, !!task.notes, `${language} notes ${task.id}`)
      }
    }
    for (const topic of APP_TOPICS) assert.ok(texts.topics[topic.id]?.title && texts.topics[topic.id]?.summary, `${language} topic ${topic.id}`)
  }
})

test('localized module names equal the tile names of the localized UI', () => {
  const tile = { shifts: 'shifts', calendar: 'calendar', projects: 'projects', guides: 'guides', knowledge: 'knowledge', notebook: 'notebook', email: 'email', team: 'team', meals: 'meals', games: 'games', manager: 'manager', documents: 'documents', chat: 'chat' }
  for (const language of ['fi', 'sv']) {
    const modules = readUi(language).hub.modules
    for (const [id, key] of Object.entries(tile)) assert.equal(LOCALIZED[language].modules[id].title, modules[key], `${language} ${id}`)
  }
  assert.equal(LOCALIZED.en.modules.shifts.title, 'Shift Schedule')
  assert.equal(LOCALIZED.en.modules.games.title, 'Game Corner')
})

test('how-to answers come in the question language with the real button labels', () => {
  const cases = [
    ['how do I request vacation?', 'en', /Request Vacation/],
    ['miten pyydän lomaa?', 'fi', /Pyyntö loma/],
    ['hur ansöker jag om semester?', 'sv', /Ansök om semester/],
    ['how do I register home office?', 'en', /Home office/],
    ['miten ilmoitan etätyöstä?', 'fi', /Kotitoimisto/],
    ['hur registrerar jag hemarbete?', 'sv', /Hemarbete/],
  ]
  for (const [question, language, label] of cases) {
    const answer = appGuidance(question, { requireTask: true, language })
    assert.match(answer.text, label, question)
    assert.doesNotMatch(answer.text, DANISH_GUIDE, question)
    assert.doesNotMatch(answer.title, /Ansoeg|Registrer hjemme/, question)
  }
})

test('Danish answers use real Danish spelling', () => {
  const text = appGuidance('hvordan ansoeger jeg om ferie', { requireTask: true }).text
  assert.match(text, /^Kalender - Ansøg om ferie\nHvor: Åbn feltet "Kalender" på forsiden\.\n1\. Åbn Kalender og klik "Anmod om Ferie"\./)
  assert.match(text, /\nBemærk: Anmodningen sendes/)
  assert.match(formatAppGuide(matchAppGuide('Hvordan ansoeger jeg om ferie?')), /Ansøg om ferie/)
  assert.match(appGuideOverview('user'), /^Moduler i Supply Chain Hub:/)
})

test('an entry without a translation falls back to Danish behind a short localized header', () => {
  const module = { id: 'zz-future', title: 'Fremtidigt modul', summary: 'Kun dansk tekst.', where: 'Aabn feltet.' }
  const sv = formatAppGuide([{ kind: 'module', module }], 'sv')
  assert.match(sv, /^\(Guiden finns bara på danska\)\n/)
  assert.match(sv, /Fremtidigt modul/)
  assert.match(formatAppGuide([{ kind: 'module', module }], 'en'), /^\(This guide is only available in Danish\)\n/)
  assert.match(formatAppGuide([{ kind: 'module', module }], 'fi'), /^\(Ohje on saatavilla vain tanskaksi\)\n/)
  assert.doesNotMatch(formatAppGuide([{ kind: 'module', module }]), /\(/)
})

test('overview, "what is X" and no-access explanations are localized too', () => {
  assert.match(appGuideOverview('user', 'en'), /^Modules in Supply Chain Hub:\n- Shift Schedule:/)
  assert.match(appGuideOverview('user', 'fi'), /^Supply Chain Hubin moduulit:/)
  assert.match(appGuideOverview('user', 'sv'), /^Moduler i Supply Chain Hub:\n- Schema:/)
  assert.match(describeAppTerm('what is team chat?', { language: 'en' }).text, /Team Chat[\s\S]*not built yet/)
  assert.match(describeAppTerm('what is the manager panel?', { role: 'user', language: 'en' }).title, /Roles and who can do what/)
  assert.match(appGuidance('how do I approve a new user?', { role: 'user', requireTask: true, language: 'sv' }).title, /Roller och vem som kan vad/)
})

test('Knowledge Base creation, import, access and translation guidance uses its own module in every language', () => {
  const questions = {
    da: ['hvordan opretter jeg en vidensartikel i Knowledge Base?', 'hvordan importerer jeg en PDF i Knowledge Base?', 'hvordan anmoder jeg om adgang i Knowledge Base?', 'hvordan oversaetter jeg en artikel i Knowledge Base?'],
    en: ['how do I create an article in Knowledge Base?', 'how do I import a PDF in Knowledge Base?', 'how do I request access in Knowledge Base?', 'how do I translate an article in Knowledge Base?'],
    fi: ['miten luon artikkelin Knowledge Base?', 'miten tuon PDF Knowledge Base?', 'miten pyydaen paeaesyae Knowledge Base?', 'miten kaeaennaen artikkelin Knowledge Base?'],
    sv: ['hur skapar jag en artikel i Knowledge Base?', 'hur importerar jag en PDF i Knowledge Base?', 'hur begaer jag aatkomst i Knowledge Base?', 'hur oever saetter jag en artikel i Knowledge Base?'],
  }
  const tasks = ['create-article', 'import-article', 'article-access', 'translate-article']
  for (const [language, cases] of Object.entries(questions)) {
    assert.match(appGuideOverview('user', language), /- Knowledge Base:/)
    assert.match(describeAppTerm('what is Knowledge Base?', { language }).text, /Knowledge Base/)
    for (const [index, question] of cases.entries()) {
      const match = matchAppGuide(question)[0]
      assert.equal(match?.module?.id, 'knowledge', `${language}: ${question}`)
      assert.equal(match.task?.id, tasks[index], `${language}: ${question}`)
      const answer = appGuidance(question, { requireTask: true, language })
      assert.ok(answer, question)
      assert.match(answer.title, /^Knowledge Base/)
      assert.doesNotMatch(answer.text, /only available in Danish|vain tanskaksi|bara på danska/)
      if (index === 1) { assert.match(answer.text, /PDF/); assert.match(answer.text, /Word/); assert.match(answer.text, /\.docx/) }
      if (index === 2) assert.match(answer.text, /2/)
    }
    const { nextStep } = require('./assistantNextStep.cjs')
    assert.match(nextStep(language, 'knowledge'), /Knowledge Base/)
  }
})

test('Word-Puzzle multiplayer guidance (challenge, turn, chat, Hubert treats) uses the real labels of each language', () => {
  const cases = {
    da: [
      ['hvor kan jeg se de bedste ord i Word-Puzzle?', 'top-words', [/"Top 10 ord"/, /"Rangliste"/]],
      ['hvordan udfordrer jeg en kollega i Word-Puzzle?', 'challenge-colleague', [/"Udfordr en kollega"/, /"Send udfordring"/, /"Spilhjørnet"/, /"Multiplayer"/]],
      ['hvordan spiller jeg min tur i Word-Puzzle?', 'play-turn', [/"Læg ord"/, /"Giv op"/, /"Godkend ord"/]],
      ['hvordan chatter jeg med min modstander i Word-Puzzle?', 'match-chat', [/"Chat"/]],
      ['hvordan giver jeg Hubert en godbid?', 'feed-hubert', [/"Kald på Hubert"/, /"Giv en godbid"/, /"Giv et kødben"/, /10 godbidder og 2 kødben/]],
      ['hvordan sender jeg en emoji til min modstander?', 'send-emoji', [/"Emoji"/, /"Kald på Hubert"/, /otte emojis/, /hver tredje sekund/]],
    ],
    en: [
      ['where can I see the best words in Word-Puzzle?', 'top-words', [/"Top 10 words"/, /"Leaderboard"/]],
      ['how do I challenge a colleague in Word-Puzzle?', 'challenge-colleague', [/"Challenge a colleague"/, /"Send challenge"/, /"Game Corner"/, /"Multiplayer"/]],
      ['how do I play my turn in Word-Puzzle?', 'play-turn', [/"Play word"/, /"Resign"/, /"Approve words"/]],
      ['how do I chat with my opponent in Word-Puzzle?', 'match-chat', [/"Chat"/]],
      ['how do I give Hubert a treat?', 'feed-hubert', [/"Call Hubert"/, /"Give a treat"/, /"Give a meat bone"/, /10 treats and 2 meat bones/]],
      ['how do I send an emoji to my opponent?', 'send-emoji', [/"Emoji"/, /"Call Hubert"/, /eight emoji/, /every three seconds/]],
    ],
    fi: [
      ['missä näen Word-Puzzlen parhaat sanat?', 'top-words', [/"Top 10 sanat"/, /"Tulostaulukko"/]],
      ['miten haastan tyoekaverin Word-Puzzle-peliin?', 'challenge-colleague', [/"Haasta työkaveri"/, /"Lähetä haaste"/, /"Pelikulma"/, /"Multiplayer"/]],
      ['miten pelaan vuoroni Word-Puzzlessa?', 'play-turn', [/"Pelaa sana"/, /"Luovuta"/, /"Hyväksy sanat"/]],
      ['miten kirjoitan vastustajalle Word-Puzzlessa?', 'match-chat', [/"Keskustelu"/]],
      ['miten annan Hubertille herkun?', 'feed-hubert', [/"Kutsu Hubert"/, /"Anna herkku"/, /"Anna lihaluu"/]],
      ['miten lähetän emojin vastustajalle?', 'send-emoji', [/"Emoji"/, /"Kutsu Hubert"/, /kahdeksasta emojista/, /kolmen sekunnin välein/]],
    ],
    sv: [
      ['var ser jag de bästa orden i Word-Puzzle?', 'top-words', [/"Topp 10 ord"/, /"Ranking"/]],
      ['hur utmanar jag en kollega i Word-Puzzle?', 'challenge-colleague', [/"Utmana en kollega"/, /"Skicka utmaning"/, /"Spelhörnan"/, /"Multiplayer"/]],
      ['hur spelar jag min tur i Word-Puzzle?', 'play-turn', [/"Lägg ord"/, /"Ge upp"/, /"Godkänn ord"/]],
      ['hur chattar jag med min motstandare i Word-Puzzle?', 'match-chat', [/"Chatt"/]],
      ['hur ger jag Hubert en godbit?', 'feed-hubert', [/"Ropa på Hubert"/, /"Ge en godbit"/, /"Ge ett köttben"/]],
      ['hur skickar jag en emoji till min motståndare?', 'send-emoji', [/"Emoji"/, /"Ropa på Hubert"/, /åtta emojierna/, /var tredje sekund/]],
    ],
  }
  for (const [language, list] of Object.entries(cases)) {
    for (const [question, taskId, labels] of list) {
      const match = matchAppGuide(question)[0]
      assert.equal(match?.module?.id, 'multiplayer', `${language}: ${question}`)
      assert.equal(match.task?.id, taskId, `${language}: ${question}`)
      assert.equal(match.module.view, 'games')
      const answer = appGuidance(question, { requireTask: true, language })
      assert.ok(answer, question)
      assert.match(answer.title, /^Multiplayer/)
      for (const label of labels) assert.match(answer.text, label, `${language}: ${question}`)
      assert.doesNotMatch(answer.text, /only available in Danish|vain tanskaksi|bara på danska/)
      if (language === 'da') assert.doesNotMatch(answer.text, /[a-z](?:ae|oe)[a-z]|\baa\b|paa |Aabn|vaelg/i, question)
    }
    assert.match(appGuideOverview('user', language), /- Multiplayer:/)
    assert.match(describeAppTerm('what is multiplayer?', { language: 'en' }).text, /Word-Puzzle/)
  }
  for (const language of ['da', ...LANGUAGES]) {
    const games = formatAppGuide([{ kind: 'module', module: APP_GUIDE.find(module => module.id === 'games') }], language)
    assert.match(games, /Multiplayer/, `${language} games summary mentions Multiplayer`)
  }
})
