const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

async function verify() {
  const newFeatures = process.argv.includes('--new-features')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-improvements-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  await fs.mkdir(profile, { recursive: true })
  registry.writeTeams(root, {
    a: { name: 'Verification Operations', folderName: 'OPS', createdAt: new Date().toISOString() },
    b: { name: 'Verification Support', folderName: 'SUP', createdAt: new Date().toISOString() },
  })
  registry.writeUserDirectory(root, { 'leader@example.test': 'a', 'owner@example.test': 'b', ...(newFeatures ? { 'creator@example.test': 'a' } : {}) })
  if (newFeatures) registry.setCreatorEmail(root, 'creator@example.test')
  const password = 'Local-verification-only'
  createStore(path.join(root, 'OPS')).set('users', {
    'leader@example.test': { email: 'leader@example.test', fullName: 'Verification Leader', password, status: 'approved', role: 'manager' },
    ...(newFeatures ? { 'creator@example.test': { email: 'creator@example.test', fullName: 'Verification Creator', password, status: 'approved', role: 'user' } } : {}),
  })
  createStore(path.join(root, 'SUP')).set('users', {
    'owner@example.test': { email: 'owner@example.test', fullName: 'Verification Owner', password, status: 'approved', role: 'user' },
  })
  const environment = { ...process.env, ELECTRON_START_URL: process.env.IMPROVEMENTS_VERIFY_URL || 'http://127.0.0.1:5019', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE
  let application
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile)
    const page = await application.firstWindow()
    await page.waitForFunction(() => !!window.electronAuth && !!window.electronImprovements)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    // A fresh profile shows the asynchronous "what's new" dialog once after login.
    const dismissWhatsNew = async () => {
      const whatsNew = page.getByRole('dialog', { name: /Nyheder i Supply Chain Hub/ })
      if (await whatsNew.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
        await page.keyboard.press('Escape')
        await whatsNew.waitFor({ state: 'detached' })
      }
    }
    if (process.argv.includes('--navigation-only')) {
      await page.locator('#email').fill('leader@example.test')
      await page.locator('#password').fill(password)
      await page.locator('form button[type="submit"]').click()
      await page.getByText('Forbedringer og forslag', { exact: true }).waitFor()
      await dismissWhatsNew()
      const failures = []
      const gamesBeforeNotebook = await page.getByText(/^Spil\s*Hj[o\u00f8]rnet$/i).evaluate(element => {
        const notebook = Array.from(document.querySelectorAll('h3')).find(heading => heading.textContent === 'Notesbog')
        return !!notebook && !!(element.compareDocumentPosition(notebook) & Node.DOCUMENT_POSITION_FOLLOWING)
      })
      if (!gamesBeforeNotebook) failures.push('Game Corner must occupy the earlier corner slot before Notebook')
      const tileIcon = label => page.getByText(label, { exact: true }).evaluate(element =>
        element.closest('[role="button"], [data-slot="card"]')?.querySelector('svg')?.innerHTML || null)
      const improvementIcon = await tileIcon('Forbedringer og forslag')
      const todoIcon = await tileIcon('To Do')
      if (!improvementIcon || !todoIcon || improvementIcon === todoIcon) failures.push('Improvement and To Do tiles must have distinct icons')
      await page.getByText('Forbedringer og forslag', { exact: true }).click()
      await page.getByRole('button', { name: 'Nyt forslag', exact: true }).waitFor()
      await page.getByRole('heading', { name: 'Forbedringer og forslag', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Nyt forslag', exact: true }).click()
      const createDialog = page.getByRole('dialog', { name: 'Nyt forslag', exact: true })
      await createDialog.waitFor()
      await page.keyboard.press('Escape')
      await createDialog.waitFor({ state: 'detached' })
      await page.getByRole('heading', { name: 'Forbedringer og forslag', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      try {
        await page.getByRole('button', { name: 'Nyt forslag', exact: true }).waitFor({ state: 'hidden', timeout: 5000 })
      } catch {
        failures.push('Escape from the improvement list must return to the main Hub')
      }
      await page.keyboard.press('Control+k')
      const palette = page.getByRole('dialog', { name: 'Hurtig-navigation', exact: true })
      await palette.waitFor()
      await palette.getByRole('combobox').fill('Forbedringer')
      const option = palette.getByRole('option', { name: 'Forbedringer og forslag', exact: true })
      try {
        await option.waitFor({ timeout: 5000 })
        await option.click()
        await palette.waitFor({ state: 'detached' })
        await page.getByRole('heading', { name: 'Forbedringer og forslag', exact: true }).waitFor()
        await page.keyboard.press('Control+k')
        await palette.waitFor()
        await page.keyboard.press('Escape')
        await palette.waitFor({ state: 'detached' })
        await page.getByRole('heading', { name: 'Forbedringer og forslag', exact: true }).waitFor()
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Nyt forslag', exact: true }).waitFor({ state: 'hidden', timeout: 5000 })
      } catch (error) {
        failures.push(`Ctrl+K must list and open improvements, with Escape closing the palette before exiting the module: ${error.message}`)
      }
      assert.deepEqual(failures, [])
      assert.deepEqual(errors, [])
      console.log('PASS: native Hub click and Ctrl+K open improvements; distinct tile icons; Escape closes create/palette dialogs first, then returns to Hub; isolated data/profile; no browser errors.')
      return
    }
    const login = email => page.evaluate(async ({ email, password }) => {
      await window.electronAuth.logout().catch(() => {})
      return window.electronAuth.login({ email, password, rememberMe: false })
    }, { email, password })
    const command = payload => page.evaluate(payload => window.electronImprovements.command({ operationId: crypto.randomUUID(), ...payload }), payload)
    if (newFeatures) {
      // Leder opretter + inviterer; ejeren accepterer og indsender, så lederen får ulæste notifikationer.
      await login('leader@example.test')
      const snapshot = await page.evaluate(() => window.electronImprovements.snapshot())
      assert.equal(snapshot.people.find(person => person.email === 'creator@example.test')?.invitable, false)
      const bellCase = await command({ type: 'create', title: 'Hub bell verification', problem: 'Notifications are only visible inside the module', proposal: 'Show them in the hub bell', category: 'automation', affectedTeamCodes: ['SUP'], ownerEmail: 'owner@example.test' })
      await assert.rejects(command({ type: 'invite', caseId: bellCase.id, expectedRevision: bellCase.revision, email: 'creator@example.test', kind: 'contributor' }), /IMPROVEMENTS_INVALID/)
      let current = bellCase
      await login('owner@example.test')
      current = await command({ type: 'respond', caseId: bellCase.id, assignmentId: current.assignments[0].id, accept: true })
      current = await command({ type: 'update', caseId: bellCase.id, expectedRevision: current.revision, status: 'in-progress', nextAction: 'Verify the hub bell' })
      await command({ type: 'submit', caseId: bellCase.id, expectedRevision: current.revision })
      await page.evaluate(() => window.electronAuth.logout())

      await page.locator('#email').fill('leader@example.test')
      await page.locator('#password').fill(password)
      await page.locator('form button[type="submit"]').click()
      await page.getByText('Forbedringer og forslag', { exact: true }).waitFor()
      await dismissWhatsNew()
      const bell = page.locator('button[aria-haspopup="dialog"].rounded-full.relative')
      await bell.click()
      const bellItem = page.getByRole('button', { name: /Hub bell verification.*submitted Hub bell verification for approval/ })
      await bellItem.waitFor()
      await bellItem.click()
      const bellDetail = page.getByRole('dialog', { name: 'Hub bell verification', exact: true })
      await bellDetail.waitFor()

      await page.keyboard.press('Escape')
      await bellDetail.waitFor({ state: 'detached' })

      // Clicking a bell item removes it for good and marks it read in the module itself.
      const leaderNotes = () => createStore(path.join(root, '_shared')).get('improvement-cases', { skipCache: true })
        .find(entry => entry.id === bellCase.id).notifications.filter(note => note.recipientEmail === 'leader@example.test')
      for (let tries = 0; leaderNotes().find(note => note.type === 'submit').readAt === null; tries++) {
        if (tries > 60) throw new Error(`The clicked improvement notification was never acknowledged: ${JSON.stringify(leaderNotes())}`)
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      await page.keyboard.press('Escape')
      await page.getByText('Forbedringer og forslag', { exact: true }).waitFor()
      await bell.click()
      await page.getByText(/Ryd alle|Intet nyt lige nu/).first().waitFor()
      assert.equal(await bellItem.count(), 0, 'A clicked improvement notification must not come back in the bell')
      // Deleting with the cross removes it too, and marks it read in the module.
      const acceptedRow = page.locator('div.group', { has: page.getByRole('button', { name: /accepted the invitation/ }) })
      await acceptedRow.hover()
      await acceptedRow.getByTitle('Slet').click()
      await acceptedRow.waitFor({ state: 'detached' })
      for (let tries = 0; leaderNotes().find(note => note.type === 'respond').readAt === null; tries++) {
        if (tries > 60) throw new Error('The deleted improvement notification was never acknowledged')
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      await page.keyboard.press('Escape')
      await page.getByText('Forbedringer og forslag', { exact: true }).click()
      await page.getByRole('button', { name: 'Nyt forslag', exact: true }).click()
      const createDialog = page.getByRole('dialog', { name: 'Nyt forslag', exact: true })
      await createDialog.waitFor()
      await createDialog.locator('#improvement-create-title').fill('Custom category verification')
      await createDialog.locator('#improvement-create-problem').fill('Nothing in the list fits')
      await createDialog.locator('#improvement-create-category').selectOption('__new__')
      await createDialog.locator('#improvement-create-new-category').fill('  Lager   styring  ')
      assert.equal(await createDialog.locator('#improvement-create-owner option[value="creator@example.test"]').count(), 0, 'Creator must not be selectable as owner')
      assert.ok(await createDialog.getByRole('button', { name: 'Opret forslag', exact: true }).isDisabled(), 'An owner is required before creating')
      await createDialog.locator('#improvement-create-owner').selectOption('leader@example.test')
      await createDialog.getByRole('button', { name: 'Opret forslag', exact: true }).click()
      await createDialog.waitFor({ state: 'detached' })
      const storedCases = createStore(path.join(root, '_shared')).get('improvement-cases', { skipCache: true })
      assert.equal(storedCases.find(entry => entry.title === 'Custom category verification')?.category, 'Lager styring')
      assert.equal(storedCases.find(entry => entry.title === 'Custom category verification')?.assignments[0]?.status, 'accepted')
      const customDetail = page.getByRole('dialog', { name: 'Custom category verification', exact: true })
      await customDetail.waitFor()
      await customDetail.getByText('Lager styring').first().waitFor()
      const people = await customDetail.locator('#improvement-invite-person option').allTextContents()
      assert.ok(people.some(text => text.includes('owner@example.test')), 'Owner must be invitable')
      assert.ok(!people.some(text => text.includes('creator@example.test')), 'Creator must not be invitable')
      await page.keyboard.press('Escape')
      await customDetail.waitFor({ state: 'detached' })
      await page.getByRole('button', { name: 'Nyt forslag', exact: true }).click()
      await createDialog.waitFor()
      assert.equal(await createDialog.locator('#improvement-create-category option[value="Lager styring"]').count(), 1, 'Custom category must be offered for reuse')
      await page.keyboard.press('Escape')
      await createDialog.waitFor({ state: 'detached' })
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Nyt forslag', exact: true }).waitFor({ state: 'hidden' })

      const now = Date.now()
      const guide = { id: 'verify-guide', title: 'Guide til sletning', category: 'Test', tags: [], content: '', sections: [], createdAt: now, updatedAt: now }
      await page.evaluate(request => window.electronKv.set('guide-review-requests', [request]), {
        id: 'verify-delete-request', guideId: guide.id, guideTitle: guide.title, action: 'delete', status: 'pending', baseGuide: guide,
        submittedBy: 'owner@example.test', submittedByName: 'Verification Owner', submittedAt: now, updatedAt: now, claimedBy: 'leader@example.test', claimedAt: now,
      })
      await bell.click()
      await page.getByRole('button', { name: /Guides afventer review/ }).click()
      await page.getByRole('button', { name: 'Godkend og slet', exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Godkend og udgiv', exact: true }).count(), 0)
      assert.deepEqual(errors, [])
      console.log('PASS: creator flagged and rejected as invitee and absent from the invite list; improvement notifications in the hub bell open the case; clicked and deleted bell items stay gone and are marked read in the module; custom category created, normalised, stored and offered again; guide deletion review reads "Godkend og slet"; isolated data/profile; no browser errors.')
      return
    }
    await page.locator('#email').fill('leader@example.test')
    await page.locator('#password').fill(password)
    await page.locator('form button[type="submit"]').click()
    await page.getByText('Forbedringer og forslag', { exact: true }).waitFor()
    await dismissWhatsNew()
    const first = await page.evaluate(() => window.electronImprovements.snapshot())
    assert.equal(first.cases.length, 0)
    assert.equal(first.people.length, 2)
    assert.ok(first.people.every(person => !('password' in person)))
    const created = await command({ type: 'create', title: 'Native improvement verification', problem: 'A repeated task takes too long', proposal: 'Automate the repeated step', category: 'automation', affectedTeamCodes: ['SUP'], ownerEmail: 'owner@example.test' })
    assert.equal(created.assignments[0].status, 'pending')
    let current = await command({ type: 'set-deadlines', caseId: created.id, expectedRevision: created.revision, assignmentId: created.assignments[0].id, responseDueDate: '2026-10-03' })
    assert.equal(current.assignments[0].status, 'pending')
    assert.equal(current.assignments[0].responseDueDate, '2026-10-03')
    current = await command({ type: 'set-deadlines', caseId: created.id, expectedRevision: current.revision, feedbackDueDate: '2026-10-10' })
    assert.equal(current.feedbackDueDate, '2026-10-10')
    const assignmentId = current.assignments[0].id
    await login('owner@example.test')
    const invited = await page.evaluate(() => window.electronImprovements.snapshot())
    assert.equal(invited.cases[0].notifications.length, 1)
    current = await command({ type: 'respond', caseId: created.id, assignmentId, accept: true })
    assert.equal(current.assignments[0].status, 'accepted')
    current = await command({ type: 'update', caseId: created.id, expectedRevision: current.revision, status: 'in-progress', nextAction: 'Verify the result' })
    current = await command({ type: 'submit', caseId: created.id, expectedRevision: current.revision })
    assert.equal(current.status, 'ready-for-approval')
    await assert.rejects(command({ type: 'approve', caseId: created.id, expectedRevision: current.revision }), /IMPROVEMENTS_FORBIDDEN/)
    await login('leader@example.test')
    current = await command({ type: 'return', caseId: created.id, expectedRevision: current.revision, message: 'Check one remaining edge case' })
    assert.equal(current.status, 'in-progress')
    await login('owner@example.test')
    current = await command({ type: 'submit', caseId: created.id, expectedRevision: current.revision })
    await login('leader@example.test')
    current = await command({ type: 'approve', caseId: created.id, expectedRevision: current.revision, message: 'Result verified' })
    assert.equal(current.status, 'completed')
    await login('owner@example.test')
    await assert.rejects(command({ type: 'delete', caseId: created.id, expectedRevision: current.revision, message: 'Not permitted' }), /IMPROVEMENTS_FORBIDDEN/)
    current = await command({ type: 'request-deletion', caseId: created.id, message: 'Verification is finished' })
    assert.equal(current.deletionRequests[0].status, 'pending')
    await login('leader@example.test')
    const stored = createStore(path.join(root, '_shared')).get('improvement-cases', { skipCache: true })
    assert.equal(stored.length, 1)
    assert.equal(stored[0].status, 'completed')

    await page.getByText('Forbedringer og forslag', { exact: true }).click()
    await page.getByRole('button', { name: /^Igangværende/ }).waitFor()
    assert.equal(await page.getByText('Native improvement verification', { exact: true }).count(), 0, 'Completed cases must not fill the ongoing list')
    await page.getByRole('button', { name: /^Afviste/ }).click()
    assert.equal(await page.getByText('Native improvement verification', { exact: true }).count(), 0, 'Completed cases must not appear under declined')
    await page.getByRole('button', { name: /^Gennemførte/ }).click()
    await page.getByText('Native improvement verification', { exact: true }).waitFor()
    assert.ok(await page.getByRole('button', { name: /Nyt forslag|Ny forbedring|New suggestion/ }).count(), 'Real module must expose a create action')
    await page.getByText('Native improvement verification', { exact: true }).click()
    const detail = page.getByRole('dialog', { name: 'Native improvement verification', exact: true })
    await detail.waitFor()
    await detail.getByText('Status: Gennemf\u00f8rt', { exact: true }).waitFor()
    await detail.locator('time[datetime="2026-10-10"]').waitFor()
    await detail.locator('time[datetime="2026-10-03"]').waitFor()
    await detail.getByRole('region', { name: 'Sletning', exact: true }).getByText('Verification is finished', { exact: true }).waitFor()
    await detail.getByTestId('improvement-delete').click()
    await page.locator('#improvement-delete-reason').fill('Remove isolated verification case')
    await page.getByTestId('improvement-confirm-delete').click()
    await detail.waitFor({ state: 'hidden' })
    await page.locator('main').getByText('Native improvement verification', { exact: true }).waitFor({ state: 'hidden' })
    const afterDelete = await page.evaluate(() => window.electronImprovements.snapshot())
    assert.equal(afterDelete.cases.length, 0)
    assert.ok(createStore(path.join(root, '_shared')).get('improvement-cases', { skipCache: true })[0].deletedAt)
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Module must fit a mobile viewport')
    assert.deepEqual(errors, [])
    console.log('PASS: native cross-team workflow; separate response/feedback deadlines; completed status; user deletion request and denied deletion; actual leader confirmation removes case; encrypted audit tombstone; real Hub module; mobile fit; isolated profile and shared data.')
  } finally {
    if (application) await application.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })