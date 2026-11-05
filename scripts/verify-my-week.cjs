const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// "Min uge" on the Hub lists my own shifts (single and recurring), pending vacation, home office and to-dos on the right days, and opens the right place.
async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-my-week-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  await fs.mkdir(profile, { recursive: true })
  registry.writeTeams(root, { a: { name: 'Verification Operations', folderName: 'OPS', createdAt: new Date().toISOString() } })
  registry.writeUserDirectory(root, { 'leader@example.test': 'a' })
  const password = 'Local-verification-only'
  createStore(path.join(root, 'OPS')).set('users', {
    'leader@example.test': { email: 'leader@example.test', fullName: 'Verification Leader', password, status: 'approved', role: 'manager' },
  })
  const environment = { ...process.env, ELECTRON_START_URL: process.env.MY_WEEK_VERIFY_URL || 'http://127.0.0.1:5063', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE

  const now = new Date()
  const isoDay = now.getDay() || 7
  const week = Array.from({ length: 7 }, (_, index) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - isoDay + 1 + index)))
  const [monday, tuesday, wednesday, thursday, friday, saturday] = week
  const screenshot = path.join(os.tmpdir(), 'my-week-hub.png')

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

    const card = page.locator('#my-week-card')
    await card.waitFor()
    await card.getByText('Ingen planer denne uge', { exact: true }).waitFor()

    // Seed through the app's own atomic KV API after login, so live invalidation is exercised.
    await page.evaluate(async ({ monday, tuesday, wednesday, thursday, friday, saturday }) => {
      const append = (key, items) => window.kv.update(key, { op: 'append', items })
      await append('shift-roles', [{ id: 'role-single', name: 'Pakkelinje', color: '#3366cc', startTime: '07:00', endTime: '15:00' }, { id: 'role-repeat', name: 'Aftenvagt', color: '#cc6633' }])
      await append('shift-assignments', [
        { id: 'a-mine', employeeId: 'leader@example.test', employeeName: 'Verification Leader', roleId: 'role-single', date: wednesday, comment: 'Privat kommentar' },
        { id: 'a-foreign', employeeId: 'colleague@example.test', employeeName: 'Colleague', roleId: 'role-single', date: monday },
      ])
      await append('shift-patterns', [{ id: 'p-mine', employeeId: 'leader@example.test', employeeName: 'Verification Leader', roleId: 'role-repeat', weekdays: [4], intervalWeeks: 1, anchorDate: monday, startTime: '12:00' }])
      await append('vacation-entries', [{ id: 'v-pending', userId: 'leader@example.test', userEmail: 'leader@example.test', startDate: friday, endDate: friday, status: 'pending' }])
      await append('home-office-exceptions', [{ id: 'h-sat', userEmail: 'leader@example.test', date: saturday, isHomeOffice: true }])
      await append('todos-personal-leader@example.test', [{ id: 'e2e-my-week-todo', title: 'Bestil pallelabels', status: 'open', createdAt: new Date().toISOString(), dueDate: tuesday }])
    }, { monday, tuesday, wednesday, thursday, friday, saturday })

    const row = date => card.locator(`[data-my-week-day="${date}"]`)
    await row(wednesday).locator('[data-my-week-item="shift-a-mine"]').waitFor({ timeout: 10000 })
    await row(thursday).locator('[data-my-week-item^="shift-pattern-p-mine-"]').waitFor({ timeout: 10000 })
    await row(friday).locator('[data-kind="vacation"]').waitFor({ timeout: 10000 })
    await row(tuesday).locator('[data-my-week-item="todo-personal-e2e-my-week-todo"]').waitFor({ timeout: 10000 })
    await row(saturday).locator('[data-kind="homeOffice"]').waitFor({ timeout: 10000 })

    assert.equal(await card.getByText('Ingen planer denne uge', { exact: true }).count(), 0)
    assert.match(await row(wednesday).innerText(), /Pakkelinje/)
    assert.match(await row(wednesday).locator('[data-my-week-item="shift-a-mine"]').innerText(), /07:00–15:00/, 'The role default time shows')
    assert.match(await row(thursday).innerText(), /Aftenvagt/)
    assert.match(await row(thursday).locator('[data-my-week-item^="shift-pattern-p-mine-"]').innerText(), /12:00/, 'The pattern time shows')
    assert.match(await row(friday).innerText(), /Ferie/)
    assert.match(await row(friday).innerText(), /afventer/)
    assert.match(await row(tuesday).innerText(), /Bestil pallelabels/)
    assert.match(await row(saturday).innerText(), /Hjemmearbejde/)
    // Another person's shift on Monday and my own comment are never listed.
    assert.equal((await row(monday).innerText()).includes('Pakkelinje'), false, 'A colleague\'s shift must not show')
    assert.match(await row(monday).innerText(), /—/)
    assert.equal((await card.innerText()).includes('Privat kommentar'), false, 'Comments must not show')
    assert.equal(await card.locator('[data-today="true"]').count(), 1)
    assert.equal(await card.locator(`[data-today="true"]`).getAttribute('data-my-week-day'), iso(now))

    await page.screenshot({ path: screenshot })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.screenshot({ path: path.join(os.tmpdir(), 'my-week-hub-dark.png') })
    await page.evaluate(() => document.documentElement.classList.remove('dark'))

    // The card can be hidden and shown again under "Tilpas dashboard".
    await page.getByRole('button', { name: 'Tilpas dashboard' }).click()
    const dialog = page.getByRole('dialog', { name: 'Tilpas dit dashboard' })
    await dialog.getByText('Min uge', { exact: true }).waitFor()
    await dialog.locator('#dashboard-myWeek').click()
    await card.waitFor({ state: 'detached' })
    await dialog.locator('#dashboard-myWeek').click()
    await card.waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })

    // A shift opens the schedule; clicking the shift there sets its own time, which Min uge then shows.
    if (wednesday.slice(0, 7) === iso(now).slice(0, 7)) {
      await row(wednesday).locator('[data-my-week-item="shift-a-mine"]').click()
      const chip = page.locator('[data-shift-chip="a-mine"]')
      await chip.waitFor({ timeout: 10000 })
      assert.match(await chip.innerText(), /07:00–15:00/)
      await chip.click()
      const editor = page.locator('[data-shift-time-editor]')
      await editor.waitFor()
      await editor.locator('#shift-time-a-mine-start').fill('11:00')
      await editor.locator('#shift-time-a-mine-end').fill('09:30')
      await editor.getByRole('button', { name: 'Gem tid' }).click()
      await page.getByText('Sluttiden skal ligge efter starttiden').waitFor()
      await editor.locator('#shift-time-a-mine-start').fill('09:30')
      await editor.locator('#shift-time-a-mine-end').fill('11:00')
      await editor.getByRole('button', { name: 'Gem tid' }).click()
      await editor.waitFor({ state: 'detached' })
      await page.waitForFunction(() => document.querySelector('[data-shift-chip="a-mine"]')?.textContent?.includes('09:30–11:00'))
      await page.screenshot({ path: path.join(os.tmpdir(), 'my-week-shift-time.png') })
      const saved = await page.evaluate(async () => (await window.kv.get('shift-assignments')).find(entry => entry.id === 'a-mine'))
      assert.equal(saved.startTime, '09:30')
      assert.equal(saved.endTime, '11:00')
      await page.keyboard.press('Escape')
      await card.waitFor()
      await page.waitForFunction(day => document.querySelector(`[data-my-week-day="${day}"] [data-my-week-item="shift-a-mine"]`)?.textContent?.includes('09:30–11:00'), wednesday)
    }

    // "+" on today adds an appointment; the time typed in the text becomes its time.
    const todayIso = iso(now)
    await row(todayIso).locator(`[data-my-week-add="${todayIso}"]`).click()
    const quick = page.locator('[data-my-week-quick-add]')
    await quick.waitFor()
    await quick.getByRole('radio', { name: 'Aftale' }).click()
    await quick.getByRole('textbox').fill('Møde med Anna kl. 13-14')
    await quick.getByText('13:00–14:00', { exact: true }).waitFor()
    await quick.getByRole('textbox').press('Enter')
    await quick.waitFor({ state: 'detached' })
    const meeting = row(todayIso).locator('[data-kind="event"]')
    await meeting.waitFor({ timeout: 10000 })
    assert.match(await meeting.innerText(), /13:00–14:00/)
    assert.match(await meeting.innerText(), /Møde med Anna/)
    const stored = await page.evaluate(async () => (await window.kv.get('todos-personal-leader@example.test')).find(todo => todo.kind === 'event'))
    assert.deepEqual({ title: stored.title, dueDate: stored.dueDate, startTime: stored.startTime, endTime: stored.endTime }, { title: 'Møde med Anna', dueDate: todayIso, startTime: '13:00', endTime: '14:00' })
    await page.screenshot({ path: path.join(os.tmpdir(), 'my-week-quick-add.png') })

    // Clicking the to-do opens To Do on the personal tab.
    await row(tuesday).locator('[data-my-week-item="todo-personal-e2e-my-week-todo"]').click()
    await page.getByRole('tab', { name: "Personlige to-do's" }).waitFor()
    assert.equal(await page.getByRole('tab', { name: "Personlige to-do's" }).getAttribute('aria-selected'), 'true')
    await page.getByText('Bestil pallelabels', { exact: true }).waitFor()
    // The appointment is in To Do too, with its time and without the to-do buttons.
    const meetingCard = page.locator(`[data-personal-todo="${stored.id}"]`)
    await meetingCard.waitFor()
    assert.match(await meetingCard.innerText(), /Aftale/)
    assert.match(await meetingCard.innerText(), /kl\. 13:00–14:00/)
    assert.equal(await meetingCard.getByRole('button', { name: 'Start' }).count(), 0)
    await page.screenshot({ path: path.join(os.tmpdir(), 'my-week-todo-board.png') })

    // Privacy: the app hands out only your own messages and personal notes, never another person's to-dos.
    createStore(path.join(root, 'OPS')).update('notebook-notes', { op: 'append', items: [{ id: 'e2e-foreign-note', isPersonal: true, creatorEmail: 'colleague@example.test', title: 'x', content: 'x' }] })
    const privacy = await page.evaluate(async () => {
      const mail = (id, from, to) => ({ id, from, to, subject: id, message: 'x', timestamp: Date.now(), read: false })
      await window.kv.update('emails', { op: 'append', items: [mail('e2e-mine', 'colleague@example.test', 'leader@example.test'), mail('e2e-foreign', 'a@example.test', 'b@example.test')] })
      const view = await window.kv.get('emails')
      // A whole-list save from the own view (what useKV does) must keep the foreign message.
      await window.kv.compareAndSet('emails', view, view.map(item => ({ ...item, read: true })))
      const after = await window.kv.get('emails')
      const refused = async run => { try { await run(); return false } catch { return true } }
      return {
        ids: view.map(item => item.id),
        allRead: after.every(item => item.read),
        notes: (await window.kv.get('notebook-notes') || []).map(item => item.id),
        foreignNoteRefused: await refused(() => window.kv.update('notebook-notes', { op: 'append', items: [{ id: 'forged', isPersonal: true, creatorEmail: 'colleague@example.test' }] })),
        otherTodos: await refused(() => window.kv.get('todos-personal-colleague@example.test')),
        deleteAll: await refused(() => window.kv.delete('emails')),
        outbox: await window.kv.get('email-notifications'),
      }
    })
    assert.deepEqual(privacy.ids, ['e2e-mine'])
    assert.equal(privacy.allRead, true)
    assert.ok(!privacy.notes.includes('e2e-foreign-note'))
    assert.equal(privacy.foreignNoteRefused, true)
    assert.equal(privacy.otherTodos, true)
    assert.equal(privacy.deleteAll, true)
    assert.deepEqual(privacy.outbox ?? [], [])
    const storedMails = createStore(path.join(root, 'OPS')).get('emails', { skipCache: true }).map(item => item.id)
    assert.deepEqual(storedMails.sort(), ['e2e-foreign', 'e2e-mine'])

    assert.deepEqual(errors, [])
    console.log(`PASS: Min uge lists my shift, recurring shift, pending vacation, home office and to-do on the right days (${iso(now)} is highlighted) with role and pattern times, a shift's own time set in the schedule wins, colleagues' shifts and comments stay hidden, the card can be hidden under Tilpas dashboard, and the to-do opens the personal tab. Screenshot: ${screenshot}`)
  } catch (error) {
    if (application) await application.windows()[0]?.screenshot({ path: path.join(os.tmpdir(), 'my-week-failure.png') }).catch(() => {})
    throw error
  } finally {
    if (application) await application.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
