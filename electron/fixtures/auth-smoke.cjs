// Separate Electron entry point. NEVER imports main.cjs or reads actual app
// configuration/storage. Both windows and all data use one fresh test root.
const { app, BrowserWindow, ipcMain: native } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { createStore } = require('../store.cjs')
const registry = require('../registry.cjs')
const { createAuthService, loadDeviceSecret } = require('../authService.cjs')
const { createSecuredIpc } = require('../securedIpc.cjs')
const { createTrustedWindow } = require('../trustedWindow.cjs')
const { publicUsers, updateUsers } = require('../userPolicy.cjs')
const { createTeamReader } = require('../teamReadPolicy.cjs')
const { exportBackup } = require('../backupPolicy.cjs')
const { createAccountService } = require('../accountService.cjs')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-native-auth-smoke-'))
const local = path.join(root, 'isolated-user-data')
fs.mkdirSync(local)
app.setPath('userData', local)
app.disableHardwareAcceleration()
const page = path.join(__dirname, 'auth-smoke.html'), pageUrl = pathToFileURL(page).href
let assertions = 0
function check(actual, expected) { assert.deepEqual(actual, expected); assertions++ }
async function denied(promise, code) { await assert.rejects(promise, error => String(error).includes(code)); assertions++ }
const invoke = (win, expression) => win.webContents.executeJavaScript(expression)
const watchdog = setTimeout(() => { console.error('Isolated Electron auth smoke timed out'); app.exit(1) }, 45000)
app.whenReady().then(async () => {
  let exitCode = 1
  try {
    const platform = path.join(root, 'platform')
    registry.createTeam(platform, { teamId: 'a', folderName: 'A', name: 'Synthetic A' })
    registry.createTeam(platform, { teamId: 'b', folderName: 'B', name: 'Synthetic B' })
    registry.setCreatorEmail(platform, 'creator@example.test')
    for (const email of ['user@example.test', 'creator@example.test']) registry.assignUserToTeam(platform, email, 'a')
    const store = createStore(path.join(platform, 'A')), sessions = createStore(path.join(platform, '_shared'))
    store.set('users', {
      'user@example.test': { email: 'user@example.test', fullName: 'Synthetic User', password: 'test123', phone: '123', role: 'user', status: 'approved' },
      'creator@example.test': { email: 'creator@example.test', fullName: 'Synthetic Creator', password: 'creator123', role: 'creator', status: 'approved' },
    })
    createStore(path.join(platform, 'B')).set('guides', [{ id: 'g', title: 'Synthetic external guide', content: 'SECRET CONTENT', sections: [] }])
    const view = registry.createAccessView(platform, { name: 'Synthetic Combined', teamIds: ['a', 'b'], userEmails: ['user@example.test'] })
    let folder = 'A'
    let failMigration = false
    const accounts = createAccountService({ getRoot: () => platform, registry, openStore: createStore, beforeStep: ({ index }) => { if (failMigration && index === 1) throw new Error('SYNTHETIC MIGRATION FAILURE') } })
    const auth = createAuthService({ registry, getRoot: () => platform, runWrite: accounts.runWrite, runAuthentication: accounts.runAuthentication, assertAvailable: accounts.assertAvailable, openTeam: team => createStore(path.join(platform, team.folderName)), openSessions: () => sessions, switchTeam: team => { folder = team.folderName }, deviceSecret: loadDeviceSecret(path.join(local, 'auth-device-key')) })
    const ipc = createSecuredIpc(native, { auth: () => auth, accounts: () => accounts, trusted: createTrustedWindow(BrowserWindow, () => pageUrl), currentFolder: () => folder, listTeams: () => registry.listTeams(platform) })
    const reader = createTeamReader({ getRoot: () => platform, listTeams: () => registry.listTeams(platform), listViews: email => registry.listAccessViewsForEmail(platform, email), openStore: createStore })
    for (const name of ['login', 'signup', 'resume', 'current', 'renew', 'logout', 'profile']) ipc.handle(`auth:${name}`, (event, input) => auth[name](event.sender.id, input))
    ipc.handle('auth:select-view', (event, id) => auth.selectView(event.sender.id, id))
    ipc.handle('accounts:status', event => accounts.status(auth.current(event.sender.id)))
    for (const action of ['resume', 'rollback']) ipc.handle(`accounts:${action}`, (event, id) => accounts[action](auth.current(event.sender.id), id))
    ipc.handle('kv:get', (_, key) => key === 'users' ? publicUsers(store.get(key, { skipCache: true })) : store.get(key, { skipCache: true }))
    ipc.handle('kv:update', (event, key, op) => {
      if (key === 'users' && op.op === 'renameField' && op.field !== op.newField) return accounts.rename(auth.current(event.sender.id), folder, op)
      return key === 'users' ? updateUsers(store, op, auth.current(event.sender.id), registry.getCreatorEmail(platform)) : store.update(key, op)
    })
    ipc.handle('kv:set', (_, key, value) => store.set(key, value))
    ipc.handle('backup:export', () => exportBackup(createStore(store.dataDir)))
    ipc.handle('registry:update-team', (_, _email, id, input) => registry.updateTeam(platform, id, input))
    ipc.handle('registry:read-team-key', (event, name, key) => reader.readTeam(auth.current(event.sender.id), name, key))
    ipc.handle('registry:read-access-view-key', (event, _email, id, team, key) => reader.readView(auth.current(event.sender.id), id, team, key))
    async function window(url = pageUrl) {
      const win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '..', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
      const senderId = win.webContents.id
      win.webContents.on('destroyed', () => auth.forget(senderId))
      await win.loadURL(url)
      return win
    }
    const user = await window(), creator = await window()
    await denied(invoke(user, "window.electronKv.get('users')"), 'AUTH_REQUIRED')
    const actor = await invoke(user, "window.electronAuth.login({email:'user@example.test',password:'test123',role:'creator'})")
    check(actor.role, 'user')
    check(await invoke(user, "window.electronKv.get('users').then(users => users['user@example.test'].password === undefined)"), true)
    await denied(invoke(user, "window.electronRegistry.updateTeam('creator@example.test','a',{name:'FORGED',abbreviation:'FORGED'})"), 'AUTH_FORBIDDEN')
    await denied(invoke(user, "window.electronKv.get('active-sessions')"), 'AUTH_FORBIDDEN')
    check(await invoke(creator, "window.electronAuth.login({email:'creator@example.test',password:'creator123'}).then(actor=>actor.role)"), 'creator')
    await denied(invoke(user, 'window.electronBackup.export()'), 'AUTH_FORBIDDEN')
    check(await invoke(creator, "window.electronBackup.export().then(backup => backup.data.users['user@example.test'].password.startsWith('pbkdf2$'))"), true)
    check(await invoke(creator, "window.electronRegistry.updateTeam('spoofed','a',{name:'Renamed Synthetic A',abbreviation:'SYNA'}).then(team=>team.name)"), 'Renamed Synthetic A')
    check(await invoke(user, "window.electronRegistry.readTeamKey('B','guides').then(guides=>guides[0].content)"), '')
    await denied(invoke(user, "window.electronRegistry.readTeamKey('../_shared','active-sessions')"), 'AUTH_FORBIDDEN')
    await invoke(user, `window.electronAuth.selectView(${JSON.stringify(view.viewId)})`)
    check(await invoke(user, `window.electronRegistry.readAccessViewKey('creator@example.test',${JSON.stringify(view.viewId)},'b','guides').then(guides=>guides[0].content)`), 'SECRET CONTENT')
    await denied(invoke(user, "window.electronKv.set('guides',[])"), 'AUTH_FORBIDDEN')
    await invoke(user, 'window.electronAuth.selectView(null)')
    await invoke(user, "window.electronAuth.profile({phone:'456',role:'creator'})")
    check(store.get('users', { skipCache: true })['user@example.test'].role, 'user')
    const untrusted = await window('data:text/html,<html><body>Untrusted test frame</body></html>')
    await denied(invoke(untrusted, "window.electronAuth.login({email:'user@example.test',password:'test123'})"), 'AUTH_UNTRUSTED_WINDOW')
    await invoke(user, 'window.electronAuth.logout()')
    await denied(invoke(user, 'window.electronAuth.current()'), 'AUTH_REQUIRED')
    check(await invoke(creator, 'window.electronAuth.current().then(actor=>actor.role)'), 'creator')
    store.set('vacation-entries', [{ id: 'synthetic-vacation', userEmail: 'user@example.test', userId: 'user_user@example.test', status: 'approved' }])
    store.set('app-language-user_user@example.test', 'fi')
    await invoke(user, "window.electronAuth.login({email:'user@example.test',password:'test123'})")
    check(await invoke(creator, "window.electronKv.get('users').then(users=>window.electronKv.update('users',{op:'renameField',field:'user@example.test',newField:'renamed@example.test',expected:users['user@example.test'],value:{email:'renamed@example.test',password:''}})).then(users=>users['renamed@example.test'].password===undefined)"), true)
    await denied(invoke(user, 'window.electronAuth.current()'), 'AUTH_REQUIRED')
    check(await invoke(user, "window.electronAuth.login({email:'renamed@example.test',password:'test123'}).then(actor=>actor.email)"), 'renamed@example.test')
    check(await invoke(user, "window.electronKv.get('app-language-user_renamed@example.test')"), 'fi')
    check(registry.listAccessViewsForEmail(platform, 'renamed@example.test')[0].viewId, view.viewId)
    await denied(invoke(user, "window.electronAuth.signup({email:'user@example.test',password:'new123',fullName:'Synthetic duplicate',phone:'123'})"), 'ACCOUNT_EMAIL_RETIRED')
    failMigration = true
    await denied(invoke(creator, "window.electronKv.get('users').then(users=>window.electronKv.update('users',{op:'renameField',field:'renamed@example.test',newField:'recovered@example.test',expected:users['renamed@example.test'],value:{email:'recovered@example.test',password:''}}))"), 'SYNTHETIC MIGRATION FAILURE')
    await denied(invoke(user, "window.electronKv.get('guides')"), 'ACCOUNT_MIGRATION_PENDING')
    await denied(invoke(user, "window.electronAccounts.resume('spoofed')"), 'AUTH_FORBIDDEN')
    const pending = await invoke(creator, 'window.electronAccounts.status()')
    check(pending.state, 'failed'); check(pending.steps, undefined)
    await denied(invoke(creator, 'window.electronAuth.logout()'), 'ACCOUNT_MIGRATION_PENDING')
    check(await invoke(creator, "window.electronAuth.login({email:'creator@example.test',password:'creator123'}).then(actor=>actor.role)"), 'creator')
    failMigration = false
    check(await invoke(creator, `window.electronAccounts.resume(${JSON.stringify(pending.id)}).then(result=>result.state)`), 'committed')
    check(await invoke(user, "window.electronAuth.login({email:'recovered@example.test',password:'test123'}).then(actor=>actor.email)"), 'recovered@example.test')
    check(await invoke(user, "window.electronKv.get('vacation-entries').then(entries=>entries[0].userEmail)"), 'recovered@example.test')
    check(await invoke(user, "window.electronKv.get('app-language-user_recovered@example.test')"), 'fi')
    check(await invoke(creator, 'window.electronAccounts.status()'), null)
    console.log(`Isolated Electron auth smoke: ${assertions} assertions passed, two authenticated windows, no real hub data`)
    exitCode = 0
  } catch (error) { console.error(error.stack) }
  finally {
    clearTimeout(watchdog)
    for (const win of BrowserWindow.getAllWindows()) win.destroy()
    // Chromium may still hold local cache handles. Do not force broader cleanup.
    try { fs.rmSync(root, { recursive: true, force: true }) } catch { console.warn('Only isolated test directory retained:', root) }
    app.exit(exitCode)
  }
})
