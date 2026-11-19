const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

// Text written in another language is shown translated with "Oversat fra finsk · Vis original", and the original is one click away.
async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-translation-note-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  await fs.mkdir(profile, { recursive: true })
  registry.writeTeams(root, { a: { name: 'Verification Operations', folderName: 'OPS', createdAt: new Date().toISOString() } })
  registry.writeUserDirectory(root, { 'leader@example.test': 'a' })
  const password = 'Local-verification-only'
  const team = createStore(path.join(root, 'OPS'))
  team.set('users', { 'leader@example.test': { email: 'leader@example.test', fullName: 'Verification Leader', password, status: 'approved', role: 'manager' } })
  const finnish = 'Tämä sivu on hätätilanteita varten ja kun palo syttyy, valitse lähin uloskäynti.'
  const at = new Date().toISOString()
  team.set('notebook-notes', [{ id: 'fi-note', title: 'Hätätilanne', content: finnish, creatorEmail: 'leader@example.test', creatorName: 'Verification Leader', isPersonal: false, tags: [], createdAt: at, updatedAt: at }])
  createStore(path.join(root, '_shared')).set('link-library', { operations: [], links: [{
    id: 'fi-link', url: 'https://example.test/hata', title: 'Hätätilanne', description: finnish, category: '', ownerTeamCode: 'OPS', sharedWithTeamCodes: [],
    status: 'approved', reports: [], suggestions: [], createdBy: 'leader@example.test', createdByName: 'Verification Leader', createdAt: at, updatedAt: at,
  }] })
  const environment = { ...process.env, ELECTRON_START_URL: process.env.TRANSLATION_NOTE_VERIFY_URL || 'http://127.0.0.1:5065', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE

  let application
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    const page = await application.firstWindow()
    await page.waitForFunction(() => !!window.electronAuth)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.locator('#email').fill('leader@example.test')
    await page.locator('#password').fill(password)
    await page.locator('form button[type="submit"]').click()
    await page.getByText('Forbedringer og forslag', { exact: true }).waitFor()
    const whatsNew = page.getByRole('dialog', { name: /Nyheder i Supply Chain Hub/ })
    if (await whatsNew.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
      await page.keyboard.press('Escape')
      await whatsNew.waitFor({ state: 'detached' })
    }

    const check = async (container, where) => {
      const note = container.locator('[data-translation-note="fi"]')
      await note.waitFor({ timeout: 20000 })
      assert.match(await note.innerText(), /Oversat fra finsk/, where)
      assert.equal(await container.getByText(finnish, { exact: true }).count(), 0, `${where}: the Finnish text should be shown translated`)
      await note.getByRole('button', { name: 'Vis original' }).click()
      await container.getByText(finnish, { exact: true }).waitFor()
      assert.match(await note.innerText(), /Original \(finsk\)/, where)
      await note.getByRole('button', { name: 'Vis oversættelse' }).click()
      await container.getByText(finnish, { exact: true }).waitFor({ state: 'detached' })
    }

    await page.getByText('Link Library', { exact: true }).first().click()
    await check(page.locator('[data-link-id="fi-link"]'), 'Link Library')
    await page.keyboard.press('Escape')

    await page.getByText('Notesbog', { exact: true }).first().click()
    await check(page.locator('div.relative').filter({ has: page.locator('[data-translation-note]') }).first(), 'Notebook')

    assert.deepEqual(errors, [])
    console.log('PASS: Finnish link and note text is shown in Danish with "Oversat fra finsk · Vis original", and the original can be toggled.')
  } finally {
    if (application) await application.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
