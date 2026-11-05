const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

// The creator makes a PIM user manager in BPO; the person picks a hub at login, works as manager there,
// switches hub without logging out, keeps personal settings at home and is sent home when access is removed.
async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-multi-hub-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  const shots = process.env.MULTI_HUB_SHOTS || ''
  await fs.mkdir(profile, { recursive: true })
  const at = new Date().toISOString()
  registry.writeTeams(root, { PIM: { name: 'Team PIM', abbreviation: 'PIM', folderName: 'PIM', createdAt: at }, BPO: { name: 'Team BPO', abbreviation: 'BPO', folderName: 'BPO', createdAt: at } })
  registry.writeUserDirectory(root, { 'creator@example.test': 'PIM', 'rasmus@example.test': 'PIM', 'bo@example.test': 'BPO', 'new@example.test': 'BPO' })
  registry.setCreatorEmail(root, 'creator@example.test')
  const password = 'Local-verification-only'
  const user = (email, fullName, role, status = 'approved') => [email, { email, fullName, password, status, role }]
  const pim = createStore(path.join(root, 'PIM')), bpo = createStore(path.join(root, 'BPO'))
  pim.set('users', Object.fromEntries([user('creator@example.test', 'Platform Creator', 'user'), user('rasmus@example.test', 'Rasmus Pim', 'user')]))
  bpo.set('users', Object.fromEntries([user('bo@example.test', 'Bo Bpo', 'manager'), user('new@example.test', 'New Person', 'user', 'pending')]))
  bpo.set('vacation-entries', [{ id: 'v1', userId: 'bo', userEmail: 'bo@example.test', startDate: '2026-11-02', endDate: '2026-11-03', status: 'pending' }])
  const environment = { ...process.env, ELECTRON_START_URL: process.env.MULTI_HUB_VERIFY_URL || 'http://127.0.0.1:5065', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE

  let application
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    const page = await application.firstWindow()
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900))
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const shot = async name => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }) }
    const navigate = view => application.evaluate(({ BrowserWindow }, target) => BrowserWindow.getAllWindows()[0].webContents.send('app:navigate', target), { view })
    const login = async email => {
      await page.waitForFunction(() => !!window.electronAuth)
      await page.locator('#email').fill(email)
      await page.locator('#password').fill(password)
      await page.locator('form button[type="submit"]').click()
    }
    const dismissWhatsNew = async () => {
      const dialog = page.getByRole('dialog', { name: /Nyheder i Supply Chain Hub/ })
      if (await dialog.waitFor({ timeout: 4000 }).then(() => true, () => false)) { await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }) }
    }
    const heading = name => page.getByRole('heading', { level: 1, name })

    // 1. The creator grants Rasmus (PIM) manager access in BPO from the Creator Panel.
    await login('creator@example.test')
    await dismissWhatsNew()
    await heading('Team PIM').waitFor()
    await navigate('creator')
    const card = page.locator('div.rounded-lg, div[class*="card"]').filter({ has: page.getByRole('heading', { name: 'Managere på tværs af teams' }) }).last()
    await card.getByRole('button', { name: 'Tilføj' }).click()
    await page.getByPlaceholder('Søg efter navn eller e-mail').fill('Rasmus')
    await page.getByRole('button', { name: /Rasmus Pim/ }).click()
    await page.getByRole('dialog').locator('label').filter({ hasText: 'Team BPO' }).getByRole('checkbox').click()
    assert.equal(await page.getByRole('dialog').locator('label').filter({ hasText: 'Team PIM' }).getByRole('checkbox').isDisabled(), true, 'the home team cannot be chosen')
    await page.getByRole('dialog').getByRole('button', { name: 'Gem' }).click()
    await card.getByText('rasmus@example.test').waitFor()
    assert.deepEqual(registry.listManagerAccess(root).map(({ email, teamIds }) => ({ email, teamIds })), [{ email: 'rasmus@example.test', teamIds: ['BPO'] }])
    await shot('1-creator-panel')
    await page.evaluate(() => window.electronAuth.logout())
    await page.reload()

    // 2. Rasmus chooses a hub after login and sees what waits for him in BPO.
    await login('rasmus@example.test')
    await page.getByRole('heading', { name: 'Vælg din hub' }).waitFor()
    const bpoCard = page.locator('div').filter({ has: page.getByRole('heading', { level: 2, name: 'Team BPO' }) }).last()
    await bpoCard.getByText('2 venter').waitFor()
    await shot('2-hub-picker')
    await bpoCard.getByRole('button', { name: 'Åbn' }).click()
    await dismissWhatsNew()
    await heading('Team BPO').waitFor()
    await page.getByText('Manager-adgang', { exact: true }).waitFor()
    const actor = await page.evaluate(() => window.electronAuth.current())
    assert.equal(actor.role, 'manager'); assert.equal(actor.activeTeam.teamId, 'BPO'); assert.equal(actor.home.teamId, 'PIM')
    await shot('3-hub-in-bpo')

    // 3. Manager rights in BPO: a manager-only write succeeds and the Manager Panel lists him as an extra manager.
    await page.evaluate(() => window.kv.set('guide-admin-emails', ['bo@example.test']))
    assert.deepEqual(await bpo.getAsync('guide-admin-emails', { skipCache: true }), ['bo@example.test'])
    await navigate('manager')
    await page.getByRole('heading', { name: 'Managere fra andre teams' }).waitFor()
    await page.getByText('fra PIM', { exact: true }).waitFor()
    await shot('4-manager-panel')

    // The modules shared by all teams keep working from the extra team, with the person's own role there.
    const shared = await page.evaluate(async () => Promise.all([window.electronImprovements.snapshot(), window.electronLinks.snapshot(), window.electronHighFives.snapshot(), window.electronMultiplayer.snapshot()]).then(list => list.map(item => !!item)))
    assert.deepEqual(shared, [true, true, true, true])
    assert.equal((await page.evaluate(() => window.electronImprovements.snapshot())).actor.role, 'user')

    // 4. Personal settings follow the person: written in BPO, stored at home in PIM.
    await page.evaluate(() => window.kv.set('user-theme-user_rasmus@example.test', 'dark'))
    assert.equal(await pim.getAsync('user-theme-user_rasmus@example.test', { skipCache: true }), 'dark')
    assert.equal(await bpo.getAsync('user-theme-user_rasmus@example.test', { skipCache: true }), undefined)

    // 5. Switch hub without logging out. A vacation request cleared from the bell no longer counts as waiting.
    await navigate('hub')
    const bell = page.locator('button.rounded-full:has(.absolute)').first()
    await bell.click()
    await page.getByRole('button', { name: /Ryd alle/ }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Skift hub' }).first().click()
    await page.locator('div').filter({ has: page.getByRole('heading', { level: 2, name: 'Team BPO' }) }).last().getByText('1 venter').waitFor()
    const pimCard = page.locator('div').filter({ has: page.getByRole('heading', { level: 2, name: 'Team PIM' }) }).last()
    await pimCard.getByRole('button', { name: 'Åbn' }).click()
    await heading('Team PIM').waitFor()
    assert.equal((await page.evaluate(() => window.electronAuth.current())).role, 'user')

    // 6. A team without access cannot be opened, and removing access sends the person home.
    await assert.rejects(page.evaluate(() => window.electronRegistry.switchToTeam('../BPO')))
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('hub:switch', { detail: { folderName: 'BPO' } })))
    await heading('Team BPO').waitFor()
    registry.setManagerAccess(root, 'rasmus@example.test', [])
    // The backend reuses a role snapshot for at most 500 ms.
    await page.waitForTimeout(700)
    await assert.rejects(page.evaluate(() => window.kv.set('guide-admin-emails', [])))
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('registry:hubs-changed'))
    await page.getByText('Din manager-adgang til Team BPO er fjernet').waitFor({ timeout: 15000 })
    await heading('Team PIM').waitFor()
    await assert.rejects(page.evaluate(() => window.electronRegistry.switchToTeam('BPO')))
    assert.equal(await page.getByRole('button', { name: 'Skift hub' }).count(), 0)

    assert.deepEqual(errors, [])
    console.log('PASS: creator grants cross-team manager access; hub picker with waiting count; manager rights and Manager Panel list in BPO; personal settings stay at home; switch without logout; removed access sends the person home.')
  } catch (error) {
    if (shots && application) await (await application.firstWindow()).screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {})
    throw error
  } finally {
    if (application) await application.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
