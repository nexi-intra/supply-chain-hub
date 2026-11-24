const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// Hubert's actions end to end: each proposal is written only after "Bekræft", through the same shared functions as the module screens,
// and lands in the real stores (sick leave + manager notice, home office, note, internal mail + notification, shared to-do, high-five across teams).
async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-hubert-actions-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  await fs.mkdir(profile, { recursive: true })
  registry.writeTeams(root, {
    a: { name: 'Verification Operations', folderName: 'OPS', createdAt: new Date().toISOString() },
    b: { name: 'Verification Support', folderName: 'SUP', createdAt: new Date().toISOString() },
  })
  registry.writeUserDirectory(root, { 'leader@example.test': 'a', 'anne@example.test': 'a', 'bo@example.test': 'a', 'zoe@example.test': 'b' })
  const password = 'Local-verification-only'
  const now = new Date()
  const tomorrow = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const inTwoDays = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2))
  const ops = createStore(path.join(root, 'OPS'))
  ops.set('users', {
    'leader@example.test': { email: 'leader@example.test', fullName: 'Verification Leader', password, status: 'approved', role: 'manager' },
    'anne@example.test': { email: 'anne@example.test', fullName: 'Anne Andersen', password, status: 'approved', role: 'user' },
    'bo@example.test': { email: 'bo@example.test', fullName: 'Bo Berg', password, status: 'approved', role: 'user' },
  })
  createStore(path.join(root, 'SUP')).set('users', {
    'zoe@example.test': { email: 'zoe@example.test', fullName: 'Zoe Lind', password, status: 'approved', role: 'user' },
  })
  const environment = { ...process.env, ELECTRON_START_URL: process.env.HUBERT_ACTIONS_VERIFY_URL || 'http://127.0.0.1:5064', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE

  let application
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
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
    await page.getByRole('button', { name: /Spørg Hubert/ }).click()
    // The first open of the day starts with the morning briefing; wait for it so the next question is not dropped while Hubert is busy.
    await hubert.getByText(/^Godmorgen Verification/).waitFor({ timeout: 30000 })
    const composer = hubert.getByPlaceholder('Spørg Hubert…')
    const confirm = () => hubert.getByRole('button', { name: 'Bekræft', exact: true })
    const ask = async (question, proposal) => {
      const before = await confirm().count()
      await composer.fill(question)
      await composer.press('Enter')
      await hubert.getByText(proposal).last().waitFor({ timeout: 30000 })
      await page.waitForFunction(count => document.querySelectorAll('[data-assistant-window] button').length > 0 && [...document.querySelectorAll('[data-assistant-window] button')].filter(button => button.textContent === 'Bekræft').length > count, before)
    }
    const accept = async success => {
      await confirm().last().click()
      await hubert.getByText(success).last().waitFor({ timeout: 30000 })
    }

    await ask('meld mig syg i morgen', /^Meld dig syg i morgen \(.+\)\? Din leder får automatisk besked\.$/)
    await accept('Sygemeldingen er registreret, og din leder har fået besked.')
    await ask('registrer hjemmearbejde i overmorgen', /^Registrer hjemmearbejde /)
    await accept('Hjemmearbejdet er registreret.')
    await ask('opret en note: Husk nye pallelabels', 'Opret en personlig note i Notesbog: "Husk nye pallelabels"?')
    await accept('Noten er oprettet i Notesbog.')
    await ask('send en besked til Anne: Mødet er flyttet til kl. 10', 'Send en intern besked til Anne Andersen: "Mødet er flyttet til kl. 10"?')
    await accept('Beskeden er sendt.')
    await ask('opret en team to-do: Ryd op på lageret', 'Opret en fælles to-do for teamet: "Ryd op på lageret"?')
    await accept('Den fælles to-do er oprettet.')
    await ask('send en high-five til Zoe for hjælpen 🎉', 'Send en high-five 🎉 til Zoe Lind: "Tak for hjælpen"?')
    await accept('High-fiven er sendt.')
    // Cancel writes nothing.
    await ask('send en besked til Bo: Skal ikke sendes', 'Send en intern besked til Bo Berg: "Skal ikke sendes"?')
    await hubert.getByRole('button', { name: 'Annuller', exact: true }).last().click()
    await hubert.getByText('Annulleret — der er ikke skrevet noget.').last().waitFor()
    // A question about the same things is answered, not turned into a proposal.
    const proposalsBefore = await confirm().count()
    await composer.fill('hvem er syg i morgen?')
    await composer.press('Enter')
    await page.waitForTimeout(3000)
    assert.equal(await confirm().count(), proposalsBefore, 'a lookup must not become a proposal')
    await page.screenshot({ path: path.join(os.tmpdir(), 'hubert-actions.png') })
    const panelText = await hubert.innerText()
    assert.equal(/@example\.test/.test(panelText), false, 'No e-mail address shown in the chat')
    assert.deepEqual(errors, [])

    await application.close()
    application = null

    const read = async key => ops.getAsync(key, { skipCache: true })
    const sick = await read('sick-leave-entries')
    assert.equal(sick.length, 1)
    assert.deepEqual([sick[0].userEmail, sick[0].type, sick[0].status, iso(new Date(sick[0].startDate))], ['leader@example.test', 'self', 'approved', tomorrow])
    const notices = await read('email-notifications')
    assert.ok(notices.some(item => item.type === 'sick-leave' && item.to === 'Jacob.remmer@nexigroup.com' && /Sygemelding - Verification Leader/.test(item.subject)), 'manager notice')
    const home = await read('home-office-exceptions')
    assert.deepEqual(home.map(item => [item.userEmail, item.date, item.isHomeOffice]), [['leader@example.test', inTwoDays, true]])
    const notes = await read('notebook-notes')
    assert.deepEqual(notes.map(item => [item.title, item.content, item.isPersonal, item.creatorEmail]), [['Husk nye pallelabels', 'Husk nye pallelabels', true, 'leader@example.test']])
    const emails = await read('emails')
    assert.deepEqual(emails.map(item => [item.from, item.to, item.message]), [['leader@example.test', 'anne@example.test', 'Mødet er flyttet til kl. 10']], 'only the confirmed message, not the cancelled one')
    assert.ok(notices.some(item => item.type === 'email' && item.emailId === emails[0].id), 'recipient notification')
    const projects = await read('projects')
    assert.deepEqual(projects.map(item => [item.title, item.status, item.createdBy]), [['Ryd op på lageret', 'open', 'leader@example.test']])
    const highFives = await createStore(path.join(root, '_shared')).getAsync('high-fives', { skipCache: true })
    assert.deepEqual(highFives.items.map(item => [item.senderEmail, item.recipientEmail, item.emoji, item.message]), [['leader@example.test', 'zoe@example.test', '🎉', 'Tak for hjælpen']])

    console.log(`PASS: Hubert proposes and, only after "Bekræft", writes sick leave (+ manager notice), a home-office day, a note, an internal message (+ notification), a shared to-do and a cross-team high-five; "Annuller" writes nothing and a lookup stays a lookup. Screenshot: ${path.join(os.tmpdir(), 'hubert-actions.png')}`)
  } catch (error) {
    if (application) await application.windows()[0]?.screenshot({ path: path.join(os.tmpdir(), 'hubert-actions-failure.png') }).catch(() => {})
    throw error
  } finally {
    if (application) await application.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
