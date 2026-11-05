const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

// Link Library end to end: an employee adds a link, the department manager approves it from the bell, a colleague in a
// team it is shared with finds it with Ctrl+K, opens it in the browser and reports it as suspicious, which hides it.
async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-links-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  await fs.mkdir(profile, { recursive: true })
  registry.writeTeams(root, {
    a: { name: 'Verification Operations', folderName: 'OPS', createdAt: new Date().toISOString() },
    b: { name: 'Verification Logistics', folderName: 'LOG', createdAt: new Date().toISOString() },
  })
  registry.writeUserDirectory(root, { 'leader@example.test': 'a', 'anna@example.test': 'a', 'lars@example.test': 'b' })
  const password = 'Local-verification-only'
  createStore(path.join(root, 'OPS')).set('users', {
    'leader@example.test': { email: 'leader@example.test', fullName: 'Verification Leader', password, status: 'approved', role: 'manager' },
    'anna@example.test': { email: 'anna@example.test', fullName: 'Anna Andersen', password, status: 'approved', role: 'user' },
  })
  createStore(path.join(root, 'LOG')).set('users', {
    'lars@example.test': { email: 'lars@example.test', fullName: 'Lars Larsen', password, status: 'approved', role: 'user' },
  })
  const library = () => createStore(path.join(root, '_shared')).get('link-library', { skipCache: true })
  const environment = { ...process.env, ELECTRON_START_URL: process.env.LINKS_VERIFY_URL || 'http://127.0.0.1:5064', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE

  let application
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    // Nothing may reach the real browser: record what the main process would open.
    await application.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async url => { globalThis.__opened.push(url) } })
    const page = await application.firstWindow()
    await page.waitForFunction(() => !!window.electronAuth && !!window.electronLinks)
    const errors = []
    // Switching user logs out under mounted views; their last reads fail with AUTH_REQUIRED, which is expected here.
    page.on('pageerror', error => { if (!/AUTH_REQUIRED/.test(error.message)) errors.push(error.message) })
    const tile = page.getByText('Link Library', { exact: true }).first()
    const signIn = async email => {
      await page.evaluate(() => window.electronAuth.logout().catch(() => {}))
      // Forget the remembered session so the reloaded window shows the login form.
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForFunction(() => !!window.electronAuth && !!window.electronLinks)
      await page.locator('#email').fill(email)
      await page.locator('#password').fill(password)
      await page.locator('form button[type="submit"]').click()
      await page.getByText('Forbedringer og forslag', { exact: true }).waitFor()
      const whatsNew = page.getByRole('dialog', { name: /Nyheder i Supply Chain Hub/ })
      if (await whatsNew.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
        await page.keyboard.press('Escape')
        await whatsNew.waitFor({ state: 'detached' })
      }
    }
    const bell = page.locator('button[aria-haspopup="dialog"].rounded-full.relative')

    // 1. Anna adds a link and shares it with Logistics; it waits for approval.
    await signIn('anna@example.test')
    await tile.click()
    await page.getByRole('heading', { name: 'Link Library' }).waitFor()
    await page.locator('[data-links-add]').click()
    await page.locator('#link-url').fill('https://portal.example.test/fakturaer')
    await page.locator('#link-title').fill('Fakturaportal')
    await page.locator('#link-description').fill('Fakturaer og kreditnotaer for leverandører')
    await page.locator('#link-category').fill('Økonomi')
    await page.getByRole('dialog').locator('label', { hasText: 'Verification Logistics' }).locator('button[role="checkbox"]').click()
    await page.locator('[data-link-save]').click()
    await page.locator('[data-link-status="pending"]').waitFor()
    const [created] = library().links
    assert.equal(created.status, 'pending')
    assert.deepEqual(created.sharedWithTeamCodes, ['LOG'])

    // 2. Lars in Logistics cannot see a link that is not approved.
    await signIn('lars@example.test')
    assert.equal((await page.evaluate(() => window.electronLinks.snapshot())).links.length, 0)

    // 3. The manager gets it in the bell, opens the review tab from there and approves.
    await signIn('leader@example.test')
    await bell.click()
    await page.getByRole('button', { name: /Fakturaportal.*venter på godkendelse af et link/ }).click()
    const pending = page.locator(`[data-review-pending="${created.id}"]`)
    await pending.waitFor()
    await pending.getByRole('button', { name: 'Godkend', exact: true }).click()
    await pending.waitFor({ state: 'detached' })
    const approved = library().links[0]
    assert.equal(approved.status, 'approved')
    assert.equal(approved.reviewedBy, 'leader@example.test')

    // 4. Anna is told in the bell that her link was approved.
    await signIn('anna@example.test')
    await bell.click()
    await page.getByRole('button', { name: /Fakturaportal.*Dit link er godkendt/ }).waitFor()
    await page.keyboard.press('Escape')

    // 5. Lars finds it with Ctrl+K by its description, opens it in the browser and reports it as suspicious.
    await signIn('lars@example.test')
    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Hurtig-navigation', exact: true })
    await palette.waitFor()
    await palette.getByRole('combobox').fill('kreditnota')
    await palette.getByRole('option', { name: /Fakturaportal/ }).click()
    await palette.waitFor({ state: 'detached' })
    await page.locator(`[data-link-open="${created.id}"]`).click()
    let opened = []
    for (let tries = 0; !opened.length && tries < 40; tries++) {
      opened = await application.evaluate(() => globalThis.__opened)
      if (!opened.length) await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.deepEqual(opened, ['https://portal.example.test/fakturaer'])
    await page.locator(`[data-link-menu="${created.id}"]`).click()
    await page.getByRole('menuitem', { name: 'Rapportér' }).click()
    const report = page.getByRole('dialog', { name: 'Rapportér link' })
    await report.getByText('Mistænkeligt / farligt').click()
    await report.getByRole('button', { name: 'Rapportér', exact: true }).click()
    await report.waitFor({ state: 'detached' })
    await page.locator(`[data-link-id="${created.id}"]`).waitFor({ state: 'detached' })
    assert.equal(library().links[0].reports[0].reason, 'suspicious')

    // 6. The manager sees the report and clears it; the link is visible to Lars again.
    await signIn('leader@example.test')
    const review = await page.evaluate(() => window.electronLinks.snapshot())
    assert.equal(review.review.reports.length, 1)
    await page.evaluate(({ linkId, reportId }) => window.electronLinks.command({ operationId: crypto.randomUUID(), type: 'resolve-report', linkId, reportId, action: 'dismiss' }), { linkId: created.id, reportId: review.review.reports[0].id })
    await signIn('lars@example.test')
    assert.equal((await page.evaluate(() => window.electronLinks.snapshot())).links.length, 1)

    assert.deepEqual(errors, [])
    console.log('PASS: an employee adds a shared link that waits for approval; the manager approves it from the bell; the creator is told; a colleague in the shared team finds it with Ctrl+K, opens it through the main process and reports it as suspicious, which hides it until the manager clears the report.')
  } finally {
    if (application) await application.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
