// Repeatable performance measurement of the Multiplayer games (Word-Puzzle and Chess rooms with Hubert) in the real
// Electron app, with isolated temp data and profile. Run it before and after an optimisation and compare the JSON.
//
// Needs a Vite dev server started from this folder:
//   node_modules\.bin\vite.cmd --port 5043 --strictPort
//   $env:MULTIPLAYER_VERIFY_URL='http://127.0.0.1:5043'
//   node scripts\measure-multiplayer-perf.cjs --label baseline [--out <file.json>] [--scale 0.25]
// --out defaults to %TEMP%\mp-perf-<label>.json; --scale shortens every scenario (smoke test only, not comparable).
//
// Electron runs exactly as the user's laptops do (no GPU flags). The "colleague client" is the real multiplayer
// service on the same temp storage, as in verify-multiplayer.cjs; it is not part of the measured processes.
// Measured per scenario: renderer main-thread busy time (CDP Performance.getMetrics), per-process CPU
// (app.getAppMetrics), frame gaps + long tasks (rAF loop / PerformanceObserver), memory, and IPC counts.
// IPC is counted in the main process (ipcMain handlers + webContents.send) because contextBridge objects are read-only.
// The first word check loads the dictionary, so Scenario 2 includes that one-off cost.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')
const { createMultiplayerService } = require('../electron/multiplayer.cjs')
const { createWordChecker } = require('../electron/games/wordPuzzle/wordChecker.cjs')

// Scenario durations (seconds) and pacing.
const WP_IDLE_SECONDS = 20
const WP_INTERACT_SECONDS = 20
const WP_REMOTE_SECONDS = 20
const CHESS_IDLE_SECONDS = 20
const LOBBY_IDLE_SECONDS = 15
const INTERACT_PAUSE_MS = 400
const REMOTE_FIRST_MS = 1500
const REMOTE_SPACING_MS = 3000
const SETTLE_MS = 3000

const PASSWORD = 'Local-verification-only'
const ANNA = { email: 'anna@example.test', fullName: 'Anna Andersen', team: 'OPS' }
const BO = { email: 'bo@example.test', fullName: 'Bo Bertelsen', team: 'SUP' }
const CARA = { email: 'cara@example.test', fullName: 'Cara Christensen', team: 'OPS' }
const CREATOR = { email: 'creator@example.test', fullName: 'Test Creator', team: 'OPS' }

const L = {
  gameCorner: /^Spil\s*Hj[o\u00f8]rnet$/i,
  backToLobby: 'Tilbage til lobbyen',
  backToMultiplayer: 'Tilbage til Multiplayer',
  recall: 'Tag tilbage',
}

const IPC_CHANNELS = ['multiplayer:snapshot', 'multiplayer:game', 'multiplayer:preview', 'multiplayer:command']

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const LABEL = argument('label', 'run')
const OUT = argument('out', path.join(os.tmpdir(), `mp-perf-${LABEL}.json`))
const SCALE = Number(argument('scale', '1'))
const seconds = value => Math.max(2, value * SCALE)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const round = (value, digits = 1) => (value === null || value === undefined || Number.isNaN(value) ? null : Number(value.toFixed(digits)))

async function measureAll() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-mpperf-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  const shots = path.join(os.tmpdir(), `mp-perf-${LABEL}-shots`)
  await fs.mkdir(profile, { recursive: true })
  await fs.mkdir(shots, { recursive: true })
  const now = new Date().toISOString()
  registry.writeTeams(root, {
    a: { name: 'Verification Operations', folderName: 'OPS', createdAt: now },
    b: { name: 'Verification Support', folderName: 'SUP', createdAt: now },
  })
  registry.writeUserDirectory(root, { [ANNA.email]: 'a', [CARA.email]: 'a', [CREATOR.email]: 'a', [BO.email]: 'b' })
  registry.setCreatorEmail(root, CREATOR.email)
  const account = person => [person.email, { email: person.email, fullName: person.fullName, password: PASSWORD, status: 'approved', role: 'user' }]
  createStore(path.join(root, 'OPS')).set('users', Object.fromEntries([ANNA, CARA, CREATOR].map(account)))
  createStore(path.join(root, 'SUP')).set('users', Object.fromEntries([BO].map(account)))

  const environment = { ...process.env, ELECTRON_START_URL: process.env.MULTIPLAYER_VERIFY_URL || 'http://127.0.0.1:5043', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE

  // Colleague client: the real service on the same shared files (see verify-multiplayer.cjs).
  const sharedDir = path.join(root, '_shared')
  const colleagueChecker = createWordChecker()
  const directory = {
    teams: [{ folderName: 'OPS', name: 'Verification Operations' }, { folderName: 'SUP', name: 'Verification Support' }],
    people: [ANNA, BO, CARA].map(person => ({ email: person.email, fullName: person.fullName, teamCode: person.team, role: 'user' }))
      .concat([{ email: CREATOR.email, fullName: CREATOR.fullName, teamCode: CREATOR.team, role: 'creator' }]),
  }
  const colleagueIndex = createStore(sharedDir)
  const colleagueGames = createStore(path.join(sharedDir, 'multiplayer'))
  const colleague = createMultiplayerService({
    getIndexStore: () => colleagueIndex, getGameStore: () => colleagueGames, getDirectory: () => structuredClone(directory), wordChecker: colleagueChecker,
  })
  const actor = person => ({ email: person.email, role: 'user', home: { folderName: person.team } })
  const command = (person, type, fields = {}) => colleague.command(actor(person), { operationId: crypto.randomUUID(), type, ...fields })

  // Deterministic racks and starting player, written like a remote change (same helper as verify-multiplayer.cjs).
  async function patchGame(gameId, { turn, racks }) {
    const games = createStore(path.join(sharedDir, 'multiplayer'))
    const raw = await games.getAsync(`game-${gameId}`, { skipCache: true })
    await games.updateAsync(`game-${gameId}`, { op: 'compareAndSet', expected: raw, value: { ...structuredClone(raw), turn, racks } })
    const index = createStore(sharedDir)
    const before = await index.getAsync('multiplayer-index', { skipCache: true })
    const value = structuredClone(before)
    const entry = value.games.find(item => item.id === gameId)
    entry.turn = entry.players[turn].email
    entry.updatedAt = new Date(Date.parse(entry.updatedAt) + 1000).toISOString()
    await index.updateAsync('multiplayer-index', { op: 'compareAndSet', expected: before, value })
  }
  const startGame = async (challenger, opponent, fields) => {
    const { entry } = await command(challenger, 'challenge', { opponentEmail: opponent.email, ...fields })
    const gameId = entry.id
    await command(opponent, 'respond', { gameId, accept: true })
    return gameId
  }

  const results = {}
  let application
  let page
  let cdp
  const consoleLog = []
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile, 'Electron must use the temp profile')
    page = await application.firstWindow()
    await page.setViewportSize({ width: 1440, height: 1000 })
    page.setDefaultTimeout(60000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleLog.push(`${message.type()}: ${message.text()}`.slice(0, 400)) })
    // A hidden or occluded window would throttle rAF and skew the numbers.
    await application.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.show(); win.focus(); win.moveTop() })

    const hubTile = page.getByText('Forbedringer og forslag', { exact: true })
    const lobby = page.locator('.wp-lobby')
    const chessLobby = page.locator('.cx-lobby')
    const room = page.locator('.bgr-room')
    const button = (name, scope = page) => scope.getByRole('button', { name, exact: true })
    const poll = async (label, check, timeout = 30000) => {
      const end = Date.now() + timeout
      for (;;) {
        const value = await check()
        if (value) return value
        if (Date.now() > end) throw new Error(`Timed out waiting for: ${label}`)
        await sleep(250)
      }
    }

    // ------------------------------------------------------------------ sign in as Anna
    await page.locator('#email').waitFor({ timeout: 90000 })
    await page.locator('#email').fill(ANNA.email)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('form button[type="submit"]').click()
    await hubTile.waitFor({ timeout: 60000 })
    const whatsNew = page.getByRole('dialog', { name: /Nyheder i Supply Chain Hub/ })
    if (await whatsNew.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
      await page.keyboard.press('Escape')
      await whatsNew.waitFor({ state: 'detached' })
    }
    await page.evaluate(() => window.electronDesktopNotifications.setEnabled(false))

    // ------------------------------------------------------------------ games (colleague client)
    const wordGame = await startGame(ANNA, BO, { language: 'da' })
    await patchGame(wordGame, { turn: 0, racks: [[...'USERLAT'], [...'HUNDBKK']] })
    const chessGame = await startGame(ANNA, BO, { gameType: 'chess', color: 'white' })
    const sideGame = await startGame(BO, CARA, { language: 'da' })
    console.log('setup - games created: Anna/Bo Word-Puzzle, Anna/Bo chess, Bo/Cara Word-Puzzle (side game for remote activity)')

    // ------------------------------------------------------------------ instrumentation
    cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    await page.evaluate(() => {
      const state = { gaps: [], tasks: [], last: 0, fresh: true }
      const tick = time => {
        if (state.fresh) state.fresh = false
        else state.gaps.push(time - state.last)
        state.last = time
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      new PerformanceObserver(list => { for (const entry of list.getEntries()) state.tasks.push(entry.duration) }).observe({ entryTypes: ['longtask'] })
      window.__perf = {
        reset() { state.gaps = []; state.tasks = []; state.fresh = true },
        read() { return { gaps: state.gaps, tasks: state.tasks, heap: performance.memory ? performance.memory.usedJSHeapSize : null } },
      }
    })
    const ipcCounting = await application.evaluate(({ ipcMain, BrowserWindow }, channels) => {
      const handlers = ipcMain._invokeHandlers
      if (!handlers || typeof handlers.get !== 'function') return false
      const counts = (globalThis.__ipcCounts = {})
      for (const channel of channels) {
        const original = handlers.get(channel)
        if (!original) continue
        counts[channel] = 0
        handlers.set(channel, (...args) => { counts[channel] += 1; return original(...args) })
      }
      counts['send:multiplayer:changed'] = 0
      for (const win of BrowserWindow.getAllWindows()) {
        const send = win.webContents.send.bind(win.webContents)
        win.webContents.send = (channel, ...args) => { if (channel === 'multiplayer:changed') counts['send:multiplayer:changed'] += 1; return send(channel, ...args) }
      }
      return true
    }, IPC_CHANNELS)
    const readIpc = () => (ipcCounting ? application.evaluate(() => ({ ...globalThis.__ipcCounts })) : Promise.resolve(null))
    const resetIpc = () => (ipcCounting ? application.evaluate(() => { for (const key of Object.keys(globalThis.__ipcCounts)) globalThis.__ipcCounts[key] = 0 }) : Promise.resolve())
    const appMetrics = () => application.evaluate(({ app }) => app.getAppMetrics().map(item => ({
      pid: item.pid, type: item.type, cumulative: item.cpu.cumulativeCPUUsage ?? null, percent: item.cpu.percentCPUUsage, workingSet: item.memory.workingSetSize,
    })))
    const gpuStatus = await application.evaluate(({ app }) => ({ electron: process.versions.electron, chrome: process.versions.chrome, gpu: app.getGPUFeatureStatus() }))
    const metricsOf = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))

    // ------------------------------------------------------------------ one measured scenario
    const measure = async (key, title, duration, drive, after) => {
      await sleep(SETTLE_MS)
      await page.evaluate(() => window.__perf.reset())
      await resetIpc()
      const before = await metricsOf()
      const processesBefore = await appMetrics()
      const started = Date.now()
      await drive(started + duration * 1000)
      const wallMs = Date.now() - started
      const afterMetrics = await metricsOf()
      const processesAfter = await appMetrics()
      const perf = await page.evaluate(() => window.__perf.read())
      const ipc = await readIpc()
      if (after) await after()
      await page.screenshot({ path: path.join(shots, `${key}.png`) }).catch(() => {})

      const renderWall = afterMetrics.Timestamp - before.Timestamp
      const delta = name => afterMetrics[name] - before[name]
      const cpu = {}
      const addCpu = (type, value) => { cpu[type] = (cpu[type] ?? 0) + value; cpu.Total = (cpu.Total ?? 0) + value }
      const startPids = new Map(processesBefore.map(item => [item.pid, item]))
      for (const item of processesAfter) {
        const previous = startPids.get(item.pid)
        const used = item.cumulative === null
          ? item.percent * (wallMs / 1000) / 100
          : item.cumulative - (previous?.cumulative ?? 0)
        addCpu(item.type, used)
      }
      for (const type of Object.keys(cpu)) cpu[type] = round((cpu[type] / (wallMs / 1000)) * 100)
      const gaps = perf.gaps
      const gapSum = gaps.reduce((total, value) => total + value, 0)
      const mb = kilobytes => round(kilobytes / 1024)
      const scenario = {
        title,
        wallSeconds: round(wallMs / 1000),
        renderer: {
          busyPercent: round((delta('TaskDuration') / renderWall) * 100),
          scriptPercent: round((delta('ScriptDuration') / renderWall) * 100),
          layoutPercent: round((delta('LayoutDuration') / renderWall) * 100),
          styleRecalcPercent: round((delta('RecalcStyleDuration') / renderWall) * 100),
        },
        cpuPercentOfOneCore: cpu,
        jank: {
          frames: gaps.length,
          avgFps: gapSum > 0 ? round((gaps.length / gapSum) * 1000) : 0,
          maxGapMs: round(gaps.length ? Math.max(...gaps) : 0),
          gapsOver50: gaps.filter(value => value > 50).length,
          gapsOver100: gaps.filter(value => value > 100).length,
          longTasks: perf.tasks.length,
          longTaskMs: round(perf.tasks.reduce((total, value) => total + value, 0)),
        },
        memory: {
          jsHeapMB: perf.heap === null ? null : round(perf.heap / 1048576),
          workingSetTotalMB: mb(processesAfter.reduce((total, item) => total + item.workingSet, 0)),
          workingSetRendererMB: mb(processesAfter.filter(item => item.type === 'Tab').reduce((total, item) => total + item.workingSet, 0)),
        },
        ipc,
      }
      results[key] = scenario
      console.log(`done - ${title}: renderer busy ${scenario.renderer.busyPercent}%, total CPU ${scenario.cpuPercentOfOneCore.Total}%, ${scenario.jank.avgFps} fps`)
    }
    const idle = end => sleep(Math.max(0, end - Date.now()))

    // ------------------------------------------------------------------ navigation helpers
    await page.getByText(L.gameCorner).first().click()
    await page.getByText('Multiplayer', { exact: true }).click()
    await page.locator('.arcade-tile[data-game="wordpuzzle"]').click()
    await lobby.waitFor()
    await poll('Word-Puzzle game in the lobby', async () => (await page.locator('.wp-game-row[data-game-type="word-puzzle"]').count()) >= 1)

    // ------------------------------------------------------------------ 5. lobby idle (measured first, while the lobby is open)
    await measure('lobbyIdle', '5. Word-Puzzle lobby idle', seconds(LOBBY_IDLE_SECONDS), idle)

    // ------------------------------------------------------------------ open the Word-Puzzle game
    await page.locator('.wp-game-row[data-game-type="word-puzzle"] .wp-game-row__main', { hasText: BO.fullName }).click()
    await room.waitFor()
    await page.getByRole('grid', { name: 'Spilbr\u00e6t' }).waitFor()
    await poll('7 rack tiles', async () => (await page.locator('.wp-rack__tile').count()) === 7)
    await page.locator('.hb-dog').first().waitFor({ state: 'attached' })
    await poll('your turn', async () => (await page.locator('.bgr-turn').innerText()).trim() === 'Din tur')

    // ------------------------------------------------------------------ 1. Word-Puzzle idle
    await measure('wpIdle', '1. Word-Puzzle game idle', seconds(WP_IDLE_SECONDS), idle)

    // ------------------------------------------------------------------ 2. Word-Puzzle interaction
    const cell = (row, col) => page.locator(`#wp-cell-${row}-${col}`)
    const rackTile = () => page.locator('.wp-rack__tile').first()
    const chatInput = page.getByPlaceholder(`Skriv til ${BO.fullName}`)
    const recallButton = button(L.recall)
    const actionErrors = []
    let interactEnd = 0
    const attempt = async (name, action) => {
      if (Date.now() >= interactEnd) return
      try { await action() } catch (error) { actionErrors.push(`${name}: ${String(error.message).split('\n')[0]}`) }
      await sleep(INTERACT_PAUSE_MS)
    }
    const recall = async () => { if (await recallButton.isEnabled()) await recallButton.click({ timeout: 3000 }) }
    const dragTileTo = async (row, col) => {
      const from = await rackTile().boundingBox()
      const to = await cell(row, col).boundingBox()
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 - 8, { steps: 3 })
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 14 })
      await page.mouse.up()
    }
    // Never presses Enter on the board and never uses "Læg ord", so no move is submitted.
    const interact = async end => {
      interactEnd = end
      while (Date.now() < end) {
        await attempt('select rack tile', () => rackTile().click({ timeout: 3000 }))
        await attempt('place on centre', () => cell(7, 7).click({ timeout: 3000 }))
        await attempt('select rack tile', () => rackTile().click({ timeout: 3000 }))
        await attempt('place next to it', () => cell(7, 8).click({ timeout: 3000 }))
        await attempt('focus chat', () => chatInput.click({ timeout: 3000 }))
        await attempt('type chat', () => page.keyboard.type('Hej Bo', { delay: 70 }))
        await attempt('clear chat', () => chatInput.fill(''))
        await attempt('drag tile to board', () => dragTileTo(8, 7))
        await attempt('cursor on board', () => cell(7, 9).click({ timeout: 3000 }))
        await attempt('type letter on board', () => page.keyboard.type('E', { delay: 60 }))
        await attempt('recall tiles', recall)
      }
    }
    const finishInteraction = async () => {
      await chatInput.fill('')
      await recall()
      await poll('no tiles on the board draft', async () => !(await recallButton.isEnabled()), 5000).catch(() => {})
    }
    await measure('wpInteract', '2. Word-Puzzle interaction', seconds(WP_INTERACT_SECONDS), interact, finishInteraction)
    results.wpInteract.actionErrors = actionErrors.length
    if (actionErrors.length) results.wpInteract.actionErrorSamples = actionErrors.slice(0, 5)
    const afterInteraction = await colleague.game(actor(ANNA), wordGame)
    assert.deepEqual([afterInteraction.status, afterInteraction.turn, afterInteraction.scores], ['active', ANNA.email, [0, 0]], 'no move was submitted')

    // ------------------------------------------------------------------ 3. remote activity
    const remoteActions = [
      () => command(BO, 'chat', { gameId: wordGame, text: 'Remote 1: hej fra Bo' }),
      () => command(CARA, 'chat', { gameId: sideGame, text: 'Remote 2: Cara i sidespillet' }),
      () => command(BO, 'chat', { gameId: wordGame, text: 'Remote 3: god leg' }),
      () => command(CARA, 'chat', { gameId: sideGame, text: 'Remote 4: din tur Bo' }),
      () => command(BO, 'chat', { gameId: wordGame, text: 'Remote 5: sidste besked' }),
    ]
    let remoteDone = 0
    const remote = async end => {
      let next = Date.now() + REMOTE_FIRST_MS * Math.min(1, SCALE)
      for (const action of remoteActions) {
        const wait = next - Date.now()
        if (wait > 0) await sleep(wait)
        await action()
        remoteDone += 1
        next += REMOTE_SPACING_MS * Math.min(1, SCALE)
      }
      await idle(end)
    }
    await measure('wpRemote', '3. Remote activity (5 index changes)', seconds(WP_REMOTE_SECONDS), remote)
    results.wpRemote.remoteActionsDone = remoteDone

    // ------------------------------------------------------------------ 4. chess idle
    await button(L.backToLobby).first().click()
    await lobby.waitFor()
    await button(L.backToMultiplayer).click()
    await page.locator('.arcade-tile[data-game="chess"]').click()
    await chessLobby.waitFor()
    await page.locator('.wp-game-row[data-game-type="chess"] .wp-game-row__main', { hasText: BO.fullName }).click()
    await page.locator('.cx-room').waitFor()
    await page.getByRole('grid', { name: 'Skakbr\u00e6t' }).waitFor()
    await page.locator('.hb-dog').first().waitFor({ state: 'attached' })
    await poll('32 pieces', async () => (await page.locator('.cx-piece').count()) === 32)
    await measure('chessIdle', '4. Chess game idle', seconds(CHESS_IDLE_SECONDS), idle)

    assert.deepEqual(errors, [], 'no renderer page errors')
    const output = {
      label: LABEL,
      measuredAt: new Date().toISOString(),
      scale: SCALE,
      platform: `${os.platform()} ${os.release()} ${os.cpus()[0]?.model ?? ''} x${os.cpus().length}`,
      runtime: gpuStatus,
      ipcCounting: ipcCounting ? 'main process (ipcMain handlers + webContents.send)' : 'not available',
      scenarios: results,
    }
    await fs.writeFile(OUT, JSON.stringify(output, null, 2))
    printTable(results)
    console.log(`JSON: ${OUT}\nScreenshots: ${shots}`)
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {})
    if (consoleLog.length) await fs.writeFile(path.join(shots, 'console.txt'), consoleLog.join('\n')).catch(() => {})
    console.error(`Failure evidence: ${shots}`)
    throw error
  } finally {
    if (cdp) await cdp.detach().catch(() => {})
    if (application) {
      const child = application.process()
      const closed = await Promise.race([application.close().then(() => true, () => true), sleep(20000).then(() => false)])
      if (!closed && child && !child.killed) child.kill()
    }
    await colleagueChecker.close().catch(() => {})
    await fs.rm(temporary, { recursive: true, force: true }).catch(() => {})
  }
}

function printTable(results) {
  const order = ['wpIdle', 'wpInteract', 'wpRemote', 'chessIdle', 'lobbyIdle'].filter(key => results[key])
  const names = { wpIdle: 'S1 WP idle', wpInteract: 'S2 WP interact', wpRemote: 'S3 WP remote', chessIdle: 'S4 chess idle', lobbyIdle: 'S5 lobby idle' }
  const ipc = (scenario, channel) => scenario.ipc?.[channel] ?? '-'
  const rows = [
    ['seconds', s => s.wallSeconds],
    ['renderer busy %', s => s.renderer.busyPercent],
    ['  script %', s => s.renderer.scriptPercent],
    ['  layout %', s => s.renderer.layoutPercent],
    ['  style recalc %', s => s.renderer.styleRecalcPercent],
    ['CPU Browser %', s => s.cpuPercentOfOneCore.Browser ?? 0],
    ['CPU Tab(renderer) %', s => s.cpuPercentOfOneCore.Tab ?? 0],
    ['CPU GPU %', s => s.cpuPercentOfOneCore.GPU ?? 0],
    ['CPU Utility %', s => s.cpuPercentOfOneCore.Utility ?? 0],
    ['CPU total %', s => s.cpuPercentOfOneCore.Total],
    ['frames', s => s.jank.frames],
    ['avg FPS', s => s.jank.avgFps],
    ['max frame gap ms', s => s.jank.maxGapMs],
    ['gaps > 50 ms', s => s.jank.gapsOver50],
    ['gaps > 100 ms', s => s.jank.gapsOver100],
    ['long tasks', s => s.jank.longTasks],
    ['long task ms', s => s.jank.longTaskMs],
    ['JS heap MB', s => s.memory.jsHeapMB],
    ['working set total MB', s => s.memory.workingSetTotalMB],
    ['working set renderer MB', s => s.memory.workingSetRendererMB],
    ['IPC snapshot', s => ipc(s, 'multiplayer:snapshot')],
    ['IPC game', s => ipc(s, 'multiplayer:game')],
    ['IPC preview', s => ipc(s, 'multiplayer:preview')],
    ['IPC command', s => ipc(s, 'multiplayer:command')],
    ['changed events sent', s => ipc(s, 'send:multiplayer:changed')],
  ]
  const width = 24
  const column = 15
  const line = cells => cells.map((cell, index) => (index === 0 ? String(cell).padEnd(width) : String(cell).padStart(column))).join('')
  console.log(`\n${line(['', ...order.map(key => names[key])])}`)
  for (const [title, read] of rows) console.log(line([title, ...order.map(key => read(results[key]) ?? '-')]))
}

measureAll().catch(error => { console.error(error); process.exitCode = 1 })
