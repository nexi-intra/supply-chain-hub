const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

// Deleting an account removes the person's team data, pseudonymises shared records and frees the address.
async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-erasure-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  await fs.mkdir(profile, { recursive: true })
  registry.writeTeams(root, { a: { name: 'Verification Operations', folderName: 'OPS', createdAt: new Date().toISOString() } })
  registry.writeUserDirectory(root, { 'leader@example.test': 'a', 'gone@example.test': 'a', 'stay@example.test': 'a' })
  const password = 'Local-verification-only'
  const team = createStore(path.join(root, 'OPS'))
  team.set('users', {
    'leader@example.test': { email: 'leader@example.test', fullName: 'Verification Leader', password, status: 'approved', role: 'manager' },
    'gone@example.test': { email: 'gone@example.test', fullName: 'Gitte Gone', password, status: 'approved', role: 'user' },
    'stay@example.test': { email: 'stay@example.test', fullName: 'Stig Stay', password, status: 'approved', role: 'user' },
  })
  team.set('shift-assignments', [{ id: 's-gone', employeeId: 'gone@example.test', employeeName: 'Gitte Gone', roleId: 'r', date: '2026-10-14' }, { id: 's-stay', employeeId: 'stay@example.test', employeeName: 'Stig Stay', roleId: 'r', date: '2026-10-14' }])
  team.set('todos-personal-gone@example.test', [{ id: 't', title: 'Privat', status: 'open', createdAt: new Date().toISOString() }])
  team.set('emails', [{ id: 'm-to-gone', from: 'stay@example.test', to: 'gone@example.test', subject: 'x', message: 'x', timestamp: 1, read: false }, { id: 'm-from-gone', from: 'gone@example.test', to: 'stay@example.test', subject: 'x', message: 'x', timestamp: 1, read: false }])
  const shared = createStore(path.join(root, '_shared'))
  const five = (id, from, to) => ({ id, senderEmail: from, senderName: 'x', senderTeamCode: 'OPS', recipientEmail: to, recipientName: 'y', recipientTeamCode: 'OPS', emoji: '🙌', message: 'Tak', at: '2026-10-01T12:00:00.000Z', readAt: null })
  shared.set('high-fives', { items: [five('h-gone', 'gone@example.test', 'stay@example.test'), five('h-stay', 'stay@example.test', 'leader@example.test')], operations: [] })
  const environment = { ...process.env, ELECTRON_START_URL: process.env.ERASURE_VERIFY_URL || 'http://127.0.0.1:5063', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE

  let application
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    const page = await application.firstWindow()
    await page.waitForFunction(() => !!window.electronAuth)
    await page.locator('#email').fill('leader@example.test')
    await page.locator('#password').fill(password)
    await page.locator('form button[type="submit"]').click()
    await page.getByText('Forbedringer og forslag', { exact: true }).waitFor()

    await page.evaluate(() => window.kv.updateField('users', { op: 'deleteField', field: 'gone@example.test' }))
    // The cleanup runs in the background after the delete returns.
    const deadline = Date.now() + 60000
    let done = false
    while (!done && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 500))
      done = registry.lookupTeamForEmail(root, 'gone@example.test') === null
    }
    assert.ok(done, 'The address was not removed from the team directory')
    const fresh = key => createStore(path.join(root, 'OPS')).get(key, { skipCache: true })
    assert.deepEqual(fresh('shift-assignments').map(item => item.id), ['s-stay'])
    assert.equal(fresh('todos-personal-gone@example.test'), undefined)
    assert.deepEqual(fresh('emails').map(item => item.id), ['m-from-gone'])
    assert.deepEqual(createStore(path.join(root, '_shared')).get('high-fives', { skipCache: true }).items.map(item => item.id), ['h-stay'])
    assert.equal(registry.lookupTeamForEmail(root, 'stay@example.test').teamId, 'a')
    console.log('PASS: deleting an account removes the person\'s shifts, personal to-dos, inbox and high-fives, keeps colleagues\' data, and frees the address in the team directory.')
  } finally {
    if (application) await application.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
