const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// Hubert's morning briefing: shown by itself the first time Hubert is opened on a day, not again after closing/reopening, and on request ("godmorgen").
async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-briefing-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  await fs.mkdir(profile, { recursive: true })
  registry.writeTeams(root, { a: { name: 'Verification Operations', folderName: 'OPS', createdAt: new Date().toISOString() } })
  registry.writeUserDirectory(root, { 'leader@example.test': 'a', 'anne@example.test': 'a' })
  const password = 'Local-verification-only'
  const now = new Date()
  const today = iso(now)
  const yesterday = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const isoDay = now.getDay() || 7
  const monday = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - isoDay + 1))
  const team = createStore(path.join(root, 'OPS'))
  team.set('users', {
    'leader@example.test': { email: 'leader@example.test', fullName: 'Verification Leader', password, status: 'approved', role: 'manager' },
    'anne@example.test': { email: 'anne@example.test', fullName: 'Anne Absent', password, status: 'approved', role: 'user' },
  })
  team.set('shift-roles', [{ id: 'role-single', name: 'Pakkelinje', color: '#3366cc' }, { id: 'role-repeat', name: 'Aftenvagt', color: '#cc6633' }])
  team.set('shift-assignments', [{ id: 'a-mine', employeeId: 'leader@example.test', employeeName: 'Verification Leader', roleId: 'role-single', date: today, comment: 'Privat kommentar' }])
  team.set('shift-patterns', [{ id: 'p-mine', employeeId: 'leader@example.test', employeeName: 'Verification Leader', roleId: 'role-repeat', weekdays: [now.getDay()], intervalWeeks: 1, anchorDate: monday }])
  team.set('vacation-entries', [{ id: 'v-anne', userId: 'anne@example.test', userEmail: 'anne@example.test', startDate: today, endDate: today, status: 'approved', type: 'vacation' }])
  team.set('todos-personal-leader@example.test', [
    { id: 'todo-today', title: 'Bestil pallelabels', status: 'open', createdAt: new Date().toISOString(), dueDate: today },
    { id: 'todo-overdue', title: 'Ring til fragtmanden', status: 'open', createdAt: new Date().toISOString(), dueDate: yesterday },
  ])
  const environment = { ...process.env, ELECTRON_START_URL: process.env.HUBERT_BRIEFING_VERIFY_URL || 'http://127.0.0.1:5064', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE

  let application
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile)
    const page = await application.firstWindow()
    await page.waitForFunction(() => !!window.electronAuth)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: 1400, height: 1000 })

    await page.locator('#email').fill('leader@example.test')
    await page.locator('#password').fill(password)
    await page.locator('form button[type="submit"]').click()
    await page.getByText('Forbedringer og forslag', { exact: true }).waitFor()
    const whatsNew = page.getByRole('dialog', { name: /Nyheder i Supply Chain Hub/ })
    if (await whatsNew.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
      await page.keyboard.press('Escape')
      await whatsNew.waitFor({ state: 'detached' })
    }

    const hubert = page.locator('[data-assistant-window]')
    const briefings = () => hubert.getByText(/^Godmorgen Verification/).count()
    const marker = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('hubert-briefing-')).map(key => [key, localStorage.getItem(key)])))
    assert.deepEqual(await marker(), {}, 'No marker before Hubert was ever opened')

    // 1. First open of the day: the briefing appears by itself, with my shift, my due to-dos and the colleague who is away.
    await page.getByRole('button', { name: /Spørg Hubert/ }).click()
    await hubert.getByText(/^Godmorgen Verification/).waitFor({ timeout: 30000 })
    const text = await hubert.innerText()
    assert.match(text, /Vagter i dag: .*Pakkelinje/)
    assert.match(text, /Aftenvagt/)
    assert.match(text, /To-dos der forfalder i dag eller er overskredet \(2, heraf 1 overskredet\): Ring til fragtmanden, Bestil pallelabels/)
    assert.match(text, /Væk i dag: Anne Absent/)
    assert.equal(text.includes('Privat kommentar'), false, 'Shift comments must not show')
    assert.equal(text.includes('@'), false, 'No e-mail address in the panel')
    assert.equal(await briefings(), 1)
    assert.deepEqual(await marker(), { 'hubert-briefing-leader@example.test': today })
    const sample = (await hubert.locator('p.whitespace-pre-wrap').first().innerText()).trim()
    await page.screenshot({ path: path.join(os.tmpdir(), 'hubert-briefing.png') })

    // 2. Close and reopen: it is not asked for again. Clearing the chat first proves no second briefing is generated.
    await hubert.getByLabel('Indstillinger').click()
    await hubert.getByRole('button', { name: 'Ryd chat' }).click()
    await hubert.getByLabel('Luk').click()
    await hubert.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: /Spørg Hubert/ }).click()
    await hubert.getByRole('status', { name: 'Guidesøgning klar' }).waitFor({ timeout: 30000 })
    await page.waitForTimeout(2500)
    assert.equal(await briefings(), 0, 'The briefing must not come back the same day')
    await hubert.getByText(/^Vuf!/).waitFor()

    // 3. Asking for it: "godmorgen" shows the briefing again.
    const composer = hubert.getByPlaceholder('Spørg Hubert…')
    await composer.fill('godmorgen')
    await composer.press('Enter')
    await hubert.getByText(/^Godmorgen Verification/).waitFor({ timeout: 30000 })
    assert.equal(await briefings(), 1)
    assert.match(await hubert.innerText(), /Væk i dag: Anne Absent/)

    // 4. A lunch question is not hijacked by the briefing.
    await composer.fill('hvad er der til frokost i dag?')
    await composer.press('Enter')
    await page.waitForFunction(() => document.querySelectorAll('[data-assistant-window] p.whitespace-pre-wrap').length >= 2, null, { timeout: 30000 })
    assert.equal(await briefings(), 1)

    assert.deepEqual(errors, [])
    console.log(`PASS: Hubert shows the morning briefing by itself on the first open of the day (${today}), not again after closing and reopening, shows it on request ("godmorgen") and leaves lunch questions alone. Screenshot: ${path.join(os.tmpdir(), 'hubert-briefing.png')}`)
    console.log(`SAMPLE:\n${sample}`)
  } catch (error) {
    if (application) await application.windows()[0]?.screenshot({ path: path.join(os.tmpdir(), 'hubert-briefing-failure.png') }).catch(() => {})
    throw error
  } finally {
    if (application) await application.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
