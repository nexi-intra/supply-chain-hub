const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

// Ctrl+K searches guides, notes, to-dos, colleagues, improvements and messages, and opens the right place.
async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-command-search-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  await fs.mkdir(profile, { recursive: true })
  registry.writeTeams(root, {
    a: { name: 'Verification Operations', folderName: 'OPS', createdAt: new Date().toISOString() },
    b: { name: 'Verification Support', folderName: 'SUP', createdAt: new Date().toISOString() },
  })
  registry.writeUserDirectory(root, { 'leader@example.test': 'a', 'owner@example.test': 'b' })
  const password = 'Local-verification-only'
  createStore(path.join(root, 'OPS')).set('users', {
    'leader@example.test': { email: 'leader@example.test', fullName: 'Verification Leader', password, status: 'approved', role: 'manager' },
  })
  createStore(path.join(root, 'SUP')).set('users', {
    'owner@example.test': { email: 'owner@example.test', fullName: 'Verification Owner', password, status: 'approved', role: 'user' },
  })
  const environment = { ...process.env, ELECTRON_START_URL: process.env.COMMAND_SEARCH_VERIFY_URL || 'http://127.0.0.1:5063', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE
  let application
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile)
    const page = await application.firstWindow()
    await page.waitForFunction(() => !!window.electronAuth && !!window.electronImprovements)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    await page.locator('#email').fill('leader@example.test')
    await page.locator('#password').fill(password)
    await page.locator('form button[type="submit"]').click()
    await page.getByText('Forbedringer og forslag', { exact: true }).waitFor()
    const whatsNew = page.getByRole('dialog', { name: /Nyheder i Supply Chain Hub/ })
    if (await whatsNew.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
      await page.keyboard.press('Escape')
      await whatsNew.waitFor({ state: 'detached' })
    }

    // Seed through the app's own atomic KV and improvement APIs, after login, so live invalidation is exercised.
    const now = Date.now()
    // Someone else's personal note: the app refuses to create it for them, so it goes straight into the store.
    createStore(path.join(root, 'OPS')).update('notebook-notes', { op: 'append', items: [{ id: 'e2e-secret', title: 'Hemmelig pallenote', content: 'Indhold af Hemmelig pallenote', creatorEmail: 'owner@example.test', creatorName: 'owner@example.test', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), isPersonal: true, tags: ['lager'] }] })
    await page.evaluate(async ({ now }) => {
      const append = (key, items) => window.kv.update(key, { op: 'append', items })
      await append('guides', [{
        id: 'e2e-guide', schemaVersion: 2, title: 'Pakning af pallekolli', category: 'Lager', tags: ['palle'], content: '',
        sections: [{ id: 's1', heading: 'Forberedelse', steps: [{ id: 'st1', text: 'Find en tom palle', imageIds: [] }] }], createdAt: now, updatedAt: now,
      }])
      const note = (id, title, creatorEmail, isPersonal) => ({ id, title, content: `Indhold af ${title}`, creatorEmail, creatorName: creatorEmail, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), isPersonal, tags: ['lager'] })
      await append('notebook-notes', [
        note('e2e-note', 'Delt pallenote', 'owner@example.test', false),
        note('e2e-note-2', 'Anden delt arbejdsnote', 'owner@example.test', false),
      ])
      await append('todos-personal-leader@example.test', [{ id: 'e2e-todo', title: 'Bestil nye pallelabels', status: 'open', createdAt: new Date(now).toISOString() }])
      await append('projects', [{ id: 'e2e-project', title: 'Pallekampagne for lageret', description: '', createdBy: 'owner@example.test', createdByName: 'Verification Owner', createdAt: new Date(now).toISOString(), status: 'open', teamMembers: [] }])
      await append('emails', [
        { id: 'e2e-mail', from: 'owner@example.test', to: 'leader@example.test', subject: 'Palleaftale til fredag', message: 'Hej', timestamp: now, read: false },
        { id: 'e2e-mail-foreign', from: 'owner@example.test', to: 'other@example.test', subject: 'Palleaftale mellem andre', message: 'Privat', timestamp: now, read: false },
      ])
      await window.electronImprovements.command({
        operationId: crypto.randomUUID(), type: 'create', title: 'Palleoptimering forslag', problem: 'For mange tomme pladser', proposal: 'Brug flere lag',
        category: 'automation', affectedTeamCodes: ['SUP'], ownerEmail: 'leader@example.test',
      })
    }, { now })

    const palette = page.getByRole('dialog', { name: 'Hurtig-navigation', exact: true })
    const input = palette.getByRole('combobox')
    const openPalette = async () => { await page.keyboard.press('Control+k'); await palette.waitFor() }
    const search = async text => { await input.fill(text) }
    const option = pattern => palette.getByRole('option', { name: pattern })
    const hubBell = page.locator('button[aria-haspopup="dialog"].rounded-full.relative')
    const backToHub = async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (await hubBell.isVisible().catch(() => false)) return
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
      }
      await hubBell.waitFor()
    }
    const pick = async (query, name) => {
      await openPalette()
      await search(query)
      await option(name).waitFor()
      await page.keyboard.press('Enter')
      await palette.waitFor({ state: 'detached', timeout: 5000 })
    }

    // First open loads the remaining sources in one batch; typing afterwards must not read anything.
    await page.waitForTimeout(3000)
    await page.evaluate(() => {
      const original = window.kv.get.bind(window.kv)
      window.__kvReads = []
      window.kv.get = (...args) => { window.__kvReads.push(args[0]); return original(...args) }
    })
    await openPalette()
    await search('palle')
    for (const name of [/Pakning af pallekolli/, /Delt pallenote/, /Bestil nye pallelabels/, /Pallekampagne for lageret/, /Palleaftale til fredag/, /Palleoptimering forslag/]) await option(name).waitFor()
    await page.waitForTimeout(1000)
    const readsAfterOpen = await page.evaluate(() => window.__kvReads.slice())
    for (const text of ['palle', 'pall', 'pallel', 'pallelabels', 'palle']) { await search(text); await page.waitForTimeout(150) }
    assert.deepEqual(await page.evaluate(() => window.__kvReads.slice()), readsAfterOpen, 'Typing must not read from the store')
    for (const key of ['shared-guides', 'knowledge-articles', 'shared-knowledge-articles', 'users', 'notebook-notes', 'email-folders']) {
      assert.ok(readsAfterOpen.filter(read => read === key).length <= 1, `Opening may read ${key} at most once: ${JSON.stringify(readsAfterOpen)}`)
    }

    for (const heading of ['Guides', 'Noter', 'To-dos', 'Beskeder', 'Forbedringer']) await palette.getByText(heading, { exact: true }).waitFor()
    assert.ok(await option(/Pakning af pallekolli/).getByText(/^Guide · /).count(), 'Guide rows show "Guide · <team>"')
    await option(/Delt pallenote/).getByText('Note · delt', { exact: true }).waitFor()
    await option(/Bestil nye pallelabels/).getByText('To-do · personlig', { exact: true }).waitFor()
    await option(/Palleaftale til fredag/).getByText(/^Besked · fra /).waitFor()
    assert.equal(await palette.getByText(/Hemmelig pallenote|Palleaftale mellem andre/).count(), 0, 'Other people\'s private notes and messages must never be listed')

    // A note saved while the palette is open shows up without reopening it.
    await page.evaluate(now => window.kv.update('notebook-notes', { op: 'append', items: [{ id: 'e2e-live', title: 'Livenote pallesag', content: 'x', creatorEmail: 'owner@example.test', creatorName: 'Owner', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), isPersonal: false }] }), now)
    await option(/Livenote pallesag/).waitFor({ timeout: 10000 })

    await search('xyzzy-ingen-match')
    await palette.getByText('Intet fundet', { exact: true }).waitFor()
    await search('forbedringer')
    await option(/^Forbedringer og forslag$/).waitFor()
    await page.keyboard.press('Escape')
    await palette.waitFor({ state: 'detached' })
    await openPalette()
    assert.equal(await input.inputValue(), '', 'The palette starts empty after being closed')
    assert.ok(await option(/^Kalender$/).count(), 'Empty query lists modules')
    await page.keyboard.press('Escape')
    await palette.waitFor({ state: 'detached' })

    // Guide: Enter opens the viewer on the right guide.
    await pick('pallekolli', /Pakning af pallekolli/)
    await page.getByRole('dialog', { name: 'Pakning af pallekolli', exact: true }).waitFor()
    await backToHub()

    // Shared note opens the notebook searched on its title; a second pick inside the open notebook must update the search.
    await pick('delt pallenote', /Delt pallenote/)
    await page.getByRole('heading', { name: 'Delt pallenote' }).waitFor()
    await pick('anden delt', /Anden delt arbejdsnote/)
    await page.getByRole('heading', { name: 'Anden delt arbejdsnote' }).waitFor()
    assert.equal(await page.getByRole('heading', { name: 'Delt pallenote' }).count(), 0, 'Picking a second note inside the notebook must apply the new search')
    await backToHub()

    // Personal to-do opens the personal tab.
    await pick('pallelabels', /Bestil nye pallelabels/)
    await page.getByText('Bestil nye pallelabels', { exact: true }).waitFor()
    await backToHub()

    // Team to-do opens the team tab with the title searched.
    await pick('pallekampagne', /Pallekampagne for lageret/)
    await page.getByText('Pallekampagne for lageret', { exact: true }).waitFor()
    await backToHub()

    // Colleague from another team opens Team Overview with the name searched and that team expanded.
    await pick('verification owner', /Verification Owner/)
    await page.getByPlaceholder('Søg efter navn eller e-mail').waitFor()
    assert.equal(await page.getByPlaceholder('Søg efter navn eller e-mail').inputValue(), 'Verification Owner')
    await page.getByText('owner@example.test', { exact: true }).waitFor()
    assert.equal(await page.getByText('leader@example.test', { exact: true }).count(), 0, 'Team Overview is filtered by the search')
    await backToHub()

    // Improvement opens its detail dialog.
    await pick('palleoptimering', /Palleoptimering forslag/)
    await page.getByRole('dialog', { name: 'Palleoptimering forslag', exact: true }).waitFor()
    await backToHub()

    // Message opens the mailbox searched on its subject.
    await pick('palleaftale', /Palleaftale til fredag/)
    await page.getByText('Palleaftale til fredag').first().waitFor()
    assert.equal(await page.getByText('Palleaftale mellem andre').count(), 0)
    await backToHub()

    assert.deepEqual(errors, [])
    console.log('PASS: Ctrl+K groups guides, notes, to-dos, colleagues, improvements and messages; no store reads while typing; Enter opens the right view and item; other people\'s private data is never listed; Escape closes the palette.')
  } catch (error) {
    if (application) await application.windows()[0]?.screenshot({ path: path.join(os.tmpdir(), 'command-search-failure.png') }).catch(() => {})
    throw error
  } finally {
    if (application) await application.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
