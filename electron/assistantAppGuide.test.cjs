const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { APP_GUIDE, APP_TOPICS, matchAppGuide, appGuideOverview, formatAppGuide, isHowToQuestion } = require('./assistantAppGuide.cjs')

const ids = APP_GUIDE.map(module => module.id)

test('every module tile in the hub has app-guide coverage', () => {
  // Fanger at et NYT modul bliver tilfoejet til forsiden uden app-viden, saa
  // Hubert ikke stille og roligt bliver uvidende om halvdelen af appen.
  const hub = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'Hub.tsx'), 'utf8')
  // Ankeret maa ikke haenge paa et bestemt typenavn - saa knaekker testen bare
  // ved naeste omdoebning i stedet for at fange et modul uden app-viden.
  const start = hub.search(/^\s*const modules: \w+\[\] = \[$/m)
  assert.notEqual(start, -1, 'kunne ikke finde modul-kataloget i Hub.tsx')
  const catalogue = hub.slice(start)
  const tileIds = [...catalogue.matchAll(/^\s{6}id: '([a-z-]+)',$/gm)].map(match => match[1])
  assert.ok(tileIds.length >= 10, `forventede at finde modul-felterne i Hub.tsx, fandt ${tileIds.length}`)
  for (const id of tileIds) assert.ok(ids.includes(id), `modulet "${id}" mangler i assistantAppGuide.cjs`)
})

test('module and task ids are unique', () => {
  assert.equal(new Set(ids).size, ids.length)
  for (const module of APP_GUIDE) {
    const taskIds = module.tasks.map(task => task.id)
    assert.equal(new Set(taskIds).size, taskIds.length, `dubletter i ${module.id}`)
  }
})

test('every entry carries the fields the formatter relies on', () => {
  for (const module of APP_GUIDE) {
    assert.ok(module.title && module.summary && module.where, `${module.id} mangler tekst`)
    assert.ok(Array.isArray(module.keywords) && module.keywords.length, `${module.id} mangler noegleord`)
    for (const task of module.tasks) {
      assert.ok(task.title && task.keywords.length, `${module.id}/${task.id} mangler tekst`)
      assert.ok(Array.isArray(task.steps) && task.steps.length, `${module.id}/${task.id} mangler trin`)
    }
  }
  for (const topic of APP_TOPICS) assert.ok(topic.title && topic.summary && topic.keywords.length)
})

test('how-to questions are recognised across languages', () => {
  for (const question of ['Hvordan opretter jeg en ferieanmodning?', 'How do I request vacation?', 'Miten luon lomapyynnon?', 'Kan jeg aendre en vagt?', 'Hvor finder jeg vagtplanen?']) {
    assert.ok(isHowToQuestion(question), question)
  }
  for (const question of ['Hvem har ferie i uge 40?', 'Hvad er der paa madplanen i dag?']) {
    assert.equal(isHowToQuestion(question), false, question)
  }
})

test('data questions are never mistaken for how-to questions', () => {
  // "skal jeg" og "kan jeg" optraeder ofte i rene dataspoergsmaal. Bliver de
  // opfattet som how-to, mister brugeren sit dataopslag.
  for (const question of [
    'hvilke opgaver skal jeg lave naeste uge',
    'hvad skal jeg arbejde med i naeste uge?',
    'hvem kan jeg spoerge om ferie?',
    'hvilken uge har jeg fri?',
    'hvor mange har ferie i uge 40?',
  ]) {
    assert.equal(isHowToQuestion(question), false, question)
  }
})

test('the how-to questions from the baseline reach the right module', () => {
  const expected = [
    ['Hvordan opretter jeg en ferieanmodning?', 'calendar', 'request-vacation'],
    ['Hvor finder jeg vagtplanen?', 'shifts', null],
    ['Hvordan melder jeg mig syg?', 'calendar', 'sick-leave'],
    ['Hvordan laver jeg en gentagen vagt?', 'shifts', 'recurring'],
    ['Hvordan tilfoejer jeg en note i notesbogen?', 'notebook', 'create-note'],
    ['Hvordan opretter jeg en guide?', 'guides', 'create-guide'],
    ['Hvordan sender jeg en besked til en kollega?', 'email', 'send-message'],
    ['Hvordan registrerer jeg hjemmearbejde?', 'calendar', 'home-office'],
    ['Hvordan faar jeg adgang til en guide jeg ikke kan se?', 'guides', 'guide-access'],
  ]
  for (const [question, moduleId, taskId] of expected) {
    const [best] = matchAppGuide(question)
    assert.ok(best, `intet match: ${question}`)
    assert.equal(best.module?.id, moduleId, question)
    if (taskId) assert.equal(best.task?.id, taskId, question)
  }
})

test('the keyword collisions from the baseline now route correctly', () => {
  // "opgave" maatte ikke laengere kapre et to-do-spoergsmaal til vagtplanen,
  // og "besked" maatte ikke sende et fejlbesked-spoergsmaal i indbakken.
  const [todo] = matchAppGuide('Hvordan tilfoejer jeg en opgave til min to-do?')
  assert.equal(todo.module.id, 'projects')
  const [storage] = matchAppGuide('Hvad betyder beskeden om at lageret er optaget?')
  assert.equal(storage.topic?.id, 'storage')
})

test('"what can you help me with" is answered instead of refused', () => {
  const [best] = matchAppGuide('Hvad kan du hjaelpe mig med?')
  assert.equal(best.topic?.id, 'assistant')
  const overview = appGuideOverview()
  assert.match(overview, /Vagtplan/)
  assert.match(overview, /Endnu ikke bygget/)
})

test('manager-only guidance is hidden from ordinary users', () => {
  const question = 'Hvordan godkender jeg en ferieanmodning?'
  assert.ok(!matchAppGuide(question, { role: 'user' }).some(match => match.task?.id === 'approve-vacation'))
  assert.ok(matchAppGuide(question, { role: 'manager' }).some(match => match.task?.id === 'approve-vacation'))
  assert.ok(matchAppGuide(question, { role: 'creator' }).some(match => match.task?.id === 'approve-vacation'))
  assert.ok(!appGuideOverview('user').includes('Manager Panel'))
  assert.ok(appGuideOverview('manager').includes('Manager Panel'))
})

test('hiding manager guidance never leaves an ordinary user with nothing', () => {
  // Den der spoerger hvorfor et felt er laast, er pr. definition ikke manager.
  const [best] = matchAppGuide('Hvorfor kan jeg ikke se managerpanelet?', { role: 'user' })
  assert.equal(best?.topic?.id, 'roles')
})

test('accents and spelling variants match equally', () => {
  const withAccents = matchAppGuide('Hvordan ansøger jeg om ferie?')
  const without = matchAppGuide('Hvordan ansoeger jeg om ferie?')
  assert.equal(withAccents[0].task.id, 'request-vacation')
  assert.equal(without[0].task.id, 'request-vacation')
})

test('formatted evidence contains numbered steps and where to go', () => {
  const text = formatAppGuide(matchAppGuide('Hvordan laver jeg en gentagen vagt?'))
  assert.match(text, /Hvor: /)
  assert.match(text, /1\. /)
  assert.match(text, /Gentagne vagter/)
})

test('unknown questions return nothing rather than a wrong guess', () => {
  assert.deepEqual(matchAppGuide('xyzzy plugh'), [])
  assert.deepEqual(matchAppGuide(''), [])
})
