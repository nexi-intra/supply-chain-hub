// Round 13: coverage audit. The inventory (tiles, views, panel tabs, profile menu, dashboard cards, games, UI components) is derived from the real UI source in src/;
// the test fails when something the UI offers has no app-guide entry (title + at least one task) in all four languages, or when fi/sv text still falls back to Danish or English.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { APP_GUIDE, APP_TOPICS, formatAppGuide } = require('./assistantAppGuide.cjs')
const { LOCALIZED } = require('./assistantAppGuideI18n.cjs')
const { ask } = require('./assistantTrainingBank.cjs')
const { COMPONENT_MAP, COMPONENT_FOLDERS, TAB_MAP, PROFILE_MAP, DASHBOARD_TASK, PROBES, INTERNAL, resolveTarget, firstLine } = require('./assistantCoverageManifest.cjs')

const SRC = path.join(__dirname, '..', 'src')
const LANGUAGES = ['da', 'en', 'fi', 'sv']
const read = relative => fs.readFileSync(path.join(SRC, relative), 'utf8')

// da/en live in translations.ts, fi/sv in JSON files: load all four the way the app does.
function loadTranslations() {
  const output = ts.transpileModule(read('lib/translations.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const module_ = { exports: {} }
  const requireJson = name => JSON.parse(fs.readFileSync(path.join(SRC, 'lib', name), 'utf8'))
  vm.runInNewContext(`(function (require, module, exports) {${output}\n})`, {})(requireJson, module_, module_.exports)
  return module_.exports.translations
}
const translations = loadTranslations()

// ---------- Guide lookups ----------
// The texts the user reads for a target in a language (Danish base for da).
function textsOf(match, language) {
  const local = language === 'da' ? null : LOCALIZED[language]
  if (match.kind === 'topic') { const entry = local ? local.topics[match.topic.id] : match.topic; return entry ? { title: entry.title, body: [entry.summary] } : null }
  const module_ = local ? local.modules[match.module.id] : match.module
  if (!module_) return null
  if (match.kind === 'module') return { title: module_.title, body: [module_.summary, module_.where] }
  const task = local ? module_.tasks?.[match.task.id] : match.task
  return task ? { title: task.title, body: [...(task.steps || []), task.notes || '', task.where || ''].filter(Boolean), steps: task.steps || [] } : null
}

// ---------- Inventory derived from src ----------
function deriveInventory() {
  const hub = read('views/Hub.tsx')
  const catalogue = hub.slice(hub.search(/^\s*const modules: \w+\[\] = \[$/m))
  const tiles = [...catalogue.matchAll(/^\s{6}id: '([a-z-]+)',$/gm)].map(match => match[1])
  const views = [...read('App.tsx').match(/type View = ([^\n]+)/)[1].matchAll(/'([a-z]+)'/g)].map(match => match[1])
  const tabs = ['ManagerPanel', 'AdminPanel', 'CreatorPanel'].flatMap(file => {
    // Only the outermost TabsList (first Tabs block) is a panel tab; the nested game-score tabs of the Creator Panel belong to the "games" tab.
    const source = read(`views/${file}.tsx`)
    const outer = source.slice(source.indexOf('<TabsList'), source.indexOf('</TabsList>'))
    return [...outer.matchAll(/<TabsTrigger value="([a-z-]+)"/g)].map(match => `${file}:${match[1]}`)
  })
  const profileMenu = Object.keys(translations.da.profile).filter(key => /^menu/.test(key) && key !== 'menuMyAccount')
  const dashboardCards = [...hub.slice(hub.indexOf('const dashboardOptions')).split('const iconAnimation')[0].matchAll(/\{ id: '([A-Za-z]+)', label: ([^\n]+) \}/g)].map(match => ({ id: match[1], source: match[2] }))
  const components = [
    ...fs.readdirSync(path.join(SRC, 'views')).filter(file => /\.tsx$/.test(file) && !/\.test\./.test(file)).map(file => `views/${file}`),
    ...fs.readdirSync(path.join(SRC, 'components')).filter(file => /\.tsx$/.test(file) && !/\.test\./.test(file)).map(file => `components/${file}`),
  ]
  const folders = fs.readdirSync(path.join(SRC, 'components'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  const arcadeGames = [...read('views/Arcade.tsx').matchAll(/^\s+title: '([^']+)',$/gm)].map(match => match[1])
  const modernGames = [...read('views/Modern.tsx').matchAll(/title="([^"]+)"/g)].map(match => match[1])
  const gameSections = [...read('views/GameCorner.tsx').matchAll(/^\s+title: ('?[^,\n]+'?),$/gm)].map(match => match[1])
  return { tiles, views, tabs, profileMenu, dashboardCards, components, folders, arcadeGames, modernGames, gameSections }
}

// The widget label in every language: translation key for most cards, a per-language literal for the rest (Hub.tsx).
function cardLabels(card) {
  const key = /t\.hub\.dashboard\.widgets\.(\w+)/.exec(card.source)?.[1]
  if (key) return Object.fromEntries(LANGUAGES.map(language => [language, translations[language].hub.dashboard.widgets[key]]))
  const literals = [...card.source.matchAll(/language === '(da|fi|sv)' \? '([^']+)'/g)].map(match => [match[1], match[2]])
  const fallback = /: '([^']+)'\s*\}?$/.exec(card.source.trim())?.[1]
  return { en: fallback, ...Object.fromEntries(literals) }
}

const ENTRY_LABEL = target => target.replace(/^topic:/, 'topic ')

/** All gaps between the inventory and the guide (empty = full coverage). */
function findCoverageGaps(inventory) {
  const gaps = []
  const need = (target, why) => {
    const match = resolveTarget(target)
    if (!match) { gaps.push(`${why}: no app-guide entry "${target}"`); return null }
    for (const language of LANGUAGES) {
      const texts = textsOf(match, language)
      if (!texts?.title || !texts.body?.some(Boolean)) gaps.push(`${why}: "${target}" has no ${language} text`)
      if (match.kind === 'task' && !texts?.steps?.length) gaps.push(`${why}: "${target}" has no ${language} steps`)
    }
    return match
  }

  for (const id of inventory.tiles) {
    const match = need(id, `tile ${id}`)
    if (match?.module.available !== false && !match?.module.tasks.length) gaps.push(`tile ${id}: the module has no task`)
  }
  const known = new Set([...inventory.tiles, 'hub', 'admin', 'creator'])
  for (const view of inventory.views) if (!known.has(view)) gaps.push(`view ${view}: not a tile and not mapped`)
  for (const view of ['hub', 'admin', 'creator']) if (inventory.views.includes(view)) need(view, `view ${view}`)

  for (const tab of inventory.tabs) {
    const targets = TAB_MAP[tab]
    if (!targets?.length) { gaps.push(`panel tab ${tab}: not mapped to any task`); continue }
    for (const target of targets) need(target, `panel tab ${tab}`)
  }
  for (const tab of Object.keys(TAB_MAP)) if (!inventory.tabs.includes(tab)) gaps.push(`panel tab ${tab}: mapped, but the UI no longer has it`)

  for (const key of inventory.profileMenu) {
    const target = PROFILE_MAP[key]
    if (!target) { gaps.push(`profile menu ${key}: not mapped`); continue }
    const match = need(target, `profile menu ${key}`)
    // The entry must name the item exactly as the localized menu shows it.
    if (match) for (const language of LANGUAGES) {
      const label = translations[language].profile[key]
      const text = (textsOf(match, language)?.body || []).join(' ')
      if (!text.includes(label)) gaps.push(`profile menu ${key}: the ${language} text does not mention "${label}"`)
    }
  }

  const dashboard = need(DASHBOARD_TASK, 'dashboard cards')
  if (dashboard) for (const card of inventory.dashboardCards) {
    const labels = cardLabels(card)
    for (const language of LANGUAGES) {
      const text = (textsOf(dashboard, language)?.body || []).join(' ')
      if (!labels[language] || !text.includes(labels[language])) gaps.push(`dashboard card ${card.id}: the ${language} text does not mention "${labels[language]}"`)
    }
  }

  const games = need('games:game-sections', 'game corner')
  if (games) for (const title of [...inventory.arcadeGames, ...inventory.modernGames]) {
    for (const language of LANGUAGES) if (!(textsOf(games, language)?.body || []).join(' ').includes(title)) gaps.push(`game ${title}: the ${language} game-corner text does not mention it`)
  }
  if (inventory.gameSections.length < 3) gaps.push('game corner: expected three sections (Arcade, Modern, Multiplayer)')

  for (const file of inventory.components) {
    const target = COMPONENT_MAP[file]
    if (!target) { gaps.push(`UI component ${file}: not mapped to an app-guide entry (add it to COMPONENT_MAP, or mark it internal)`); continue }
    if (target !== INTERNAL) need(target, `UI component ${file}`)
  }
  for (const file of Object.keys(COMPONENT_MAP)) if (!inventory.components.includes(file)) gaps.push(`UI component ${file}: mapped, but the file no longer exists`)
  for (const folder of inventory.folders) {
    const target = COMPONENT_FOLDERS[folder]
    if (!target) gaps.push(`UI folder components/${folder}: not mapped`)
    else if (target !== INTERNAL) need(target, `UI folder components/${folder}`)
  }
  return gaps
}

test('the real UI inventory is found (the audit is not vacuously green)', () => {
  const inventory = deriveInventory()
  assert.ok(inventory.tiles.length >= 14, `tiles ${inventory.tiles}`)
  assert.ok(inventory.views.includes('admin') && inventory.views.includes('creator'))
  assert.equal(inventory.tabs.length, 10, inventory.tabs.join(', '))
  assert.deepEqual(inventory.profileMenu.sort(), ['menuAdminPanel', 'menuCreatorPanel', 'menuLogout', 'menuSettings'])
  assert.equal(inventory.dashboardCards.length, 10, JSON.stringify(inventory.dashboardCards))
  assert.deepEqual(inventory.arcadeGames, ['Chicken Invaders', 'Prism Break', 'Parcel Pilot', 'Cargo Stack', 'Route Runner'])
  assert.deepEqual(inventory.modernGames, ['Cube Basher'])
  assert.ok(inventory.components.length >= 60)
})

test('every tile, view, panel tab, profile-menu item, dashboard card, game and UI component has an app-guide entry in da/en/fi/sv', () => {
  assert.deepEqual(findCoverageGaps(deriveInventory()), [])
})

test('the audit reports a new tab, view, component, card or tile that has no guide entry', () => {
  const real = deriveInventory()
  const gaps = findCoverageGaps({
    ...real,
    tiles: [...real.tiles, 'new-module'],
    views: [...real.views, 'new-view'],
    tabs: [...real.tabs, 'ManagerPanel:new-tab'],
    profileMenu: [...real.profileMenu, 'menuNewThing'],
    dashboardCards: [...real.dashboardCards, { id: 'newCard', source: "language === 'da' ? 'Nyt kort' : 'New card'" }],
    components: [...real.components, 'components/BrandNewDialog.tsx'],
    folders: [...real.folders, 'newFolder'],
  })
  for (const expected of ['tile new-module', 'view new-view', 'panel tab ManagerPanel:new-tab', 'profile menu menuNewThing', 'dashboard card newCard', 'UI component components/BrandNewDialog.tsx', 'UI folder components/newFolder']) {
    assert.ok(gaps.some(gap => gap.startsWith(expected)), `${expected} -> ${JSON.stringify(gaps)}`)
  }
})

// ---------- Language quality ----------
const DANISH_ONLY = /\b(og|ikke|hvis|naar|ogsaa|også|jeg|hvor|skal|klik|åbn|vælg)\b/i
const ENGLISH_ONLY = /\b(and|your|with|you|click|open|choose|only)\b/i
// Quoted UI labels and example questions are allowed to be in another language; Hubert's own sentences are not.
const withoutQuotes = text => String(text).replace(/"[^"]*"|«[^»]*»|“[^”]*”/g, ' ')
// Product names that are the same in every language.
const SAME_TITLE = /^(Knowledge Base|Manager Panel|Admin Panel|Creator Panel|Multiplayer|To Do)$/

test('every guide module, task and topic has complete fi/sv/en text with the same structure as the Danish one, and fi/sv never fall back to Danish or English', () => {
  const problems = []
  const entries = [
    ...APP_GUIDE.flatMap(module_ => [{ kind: 'module', module: module_ }, ...module_.tasks.map(task => ({ kind: 'task', module: module_, task }))]),
    ...APP_TOPICS.map(topic => ({ kind: 'topic', topic })),
  ]
  for (const match of entries) {
    const id = match.kind === 'topic' ? `topic ${match.topic.id}` : match.kind === 'module' ? `module ${match.module.id}` : `task ${match.module.id}:${match.task.id}`
    const da = textsOf(match, 'da')
    const en = textsOf(match, 'en')
    if (!da?.title) { problems.push(`${id}: no Danish text`); continue }
    for (const language of ['en', 'fi', 'sv']) {
      const local = textsOf(match, language)
      if (!local?.title || !local.body.length) { problems.push(`${id}: no ${language} text`); continue }
      if (match.kind === 'task') {
        if (local.steps.length !== da.steps.length) problems.push(`${id}: ${language} has ${local.steps.length} steps, Danish ${da.steps.length}`)
        const base = match.task
        const translated = LOCALIZED[language].modules[match.module.id].tasks[match.task.id]
        if (!!base.notes !== !!translated.notes) problems.push(`${id}: ${language} notes differ from Danish`)
        if (!!base.where !== !!translated.where) problems.push(`${id}: ${language} where differs from Danish`)
      }
      if (language === 'en') continue
      for (const part of local.body) {
        if (DANISH_ONLY.test(withoutQuotes(part))) problems.push(`${id}: ${language} text still contains Danish: ${part.slice(0, 70)}`)
        if (ENGLISH_ONLY.test(withoutQuotes(part))) problems.push(`${id}: ${language} text still contains English: ${part.slice(0, 70)}`)
        if (en.body.includes(part) || da.body.includes(part)) problems.push(`${id}: ${language} text equals the ${en.body.includes(part) ? 'English' : 'Danish'}: ${part.slice(0, 70)}`)
      }
      if ((local.title === en.title || local.title === da.title) && !SAME_TITLE.test(local.title) && /\s[a-zæøåäö]{4,}/.test(local.title)) problems.push(`${id}: ${language} title is not translated: ${local.title}`)
    }
  }
  assert.deepEqual(problems, [])
})

test('Hubert quotes the localized module names verbatim in en/fi/sv', () => {
  const tileKey = { shifts: 'shifts', calendar: 'calendar', projects: 'projects', guides: 'guides', knowledge: 'knowledge', notebook: 'notebook', email: 'email', team: 'team', meals: 'meals', games: 'games', manager: 'manager', documents: 'documents', chat: 'chat' }
  const problems = []
  for (const language of ['en', 'fi', 'sv']) {
    for (const [id, key] of Object.entries(tileKey)) if (LOCALIZED[language].modules[id].title !== translations[language].hub.modules[key]) problems.push(`${language} ${id}: "${LOCALIZED[language].modules[id].title}" != "${translations[language].hub.modules[key]}"`)
  }
  assert.deepEqual(problems, [])
})

// ---------- Probes: the right entry answers, in every language, with the right role gating ----------
const expectedLine = (target, language) => firstLine(target, language)

test('every probe question reaches its guide entry in da/en/fi/sv for the right role, and other roles are not handed that entry', () => {
  const problems = []
  for (const probe of PROBES) {
    for (const language of LANGUAGES) {
      const question = probe.q[language]
      const answer = ask({ q: question, lang: language }, { role: probe.role || 'user' })
      const line = expectedLine(probe.id, language)
      if (answer.mode !== 'app-guide' || answer.unmatched || String(answer.text).split('\n')[0] !== line) problems.push(`${probe.id} ${language} (${probe.role || 'user'}): "${question}" -> ${answer.mode} ${String(answer.text).split('\n')[0].slice(0, 60)} (expected "${line}")`)
      for (const role of probe.gated || []) {
        const other = ask({ q: question, lang: language }, { role })
        if (String(other.text).split('\n')[0] === line) problems.push(`${probe.id} ${language}: ${role} must not get "${line}"`)
        if (other.unmatched) problems.push(`${probe.id} ${language}: ${role} got the generic overview instead of the role explanation`)
      }
    }
  }
  assert.deepEqual(problems, [])
})
