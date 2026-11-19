// End-to-end check of Multiplayer / backgammon in the real Electron app with isolated temp data and profile.
//
// Electron (UI) is signed in as Anna (white). A "colleague client" inside this script runs the real multiplayer service
// against the SAME temp storage as Bo, the way a second computer on the shared drive would. The dice are rolled by the
// service (random), so both players simply play the first legal move offered until a few turns are done; then Bo resigns.
// No direct storage edits.
//
// Needs a Vite dev server: MULTIPLAYER_VERIFY_URL=http://127.0.0.1:5021 node scripts/verify-backgammon.cjs
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
const rules = require('../electron/games/backgammon/rules.cjs')

const PASSWORD = 'Local-verification-only'
const ANNA = { email: 'anna@example.test', fullName: 'Anna Andersen', team: 'OPS' }
const BO = { email: 'bo@example.test', fullName: 'Bo Bertelsen', team: 'SUP' }
const CREATOR = { email: 'creator@example.test', fullName: 'Test Creator', team: 'OPS' }
const DASH = '\u2013'
const TURNS = 6

const L = {
  gameCorner: /^Spil\s*Hj[o\u00f8]rnet$/i,
  backToGameCorner: 'Tilbage til Spilhj\u00f8rnet',
  backToMultiplayer: 'Tilbage til Multiplayer',
  backToHub: 'Tilbage til Hub',
  backToLobby: 'Tilbage til lobbyen',
  challenge: 'Udfordr en kollega',
  send: 'Send udfordring',
  confirm: 'Afslut tur',
  pass: 'Videre',
  undo: 'Fortryd',
}

async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-backgammon-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  const shots = path.join(temporary, 'screenshots')
  await fs.mkdir(profile, { recursive: true })
  await fs.mkdir(shots)
  const now = new Date().toISOString()
  registry.writeTeams(root, {
    a: { name: 'Verification Operations', folderName: 'OPS', createdAt: now },
    b: { name: 'Verification Support', folderName: 'SUP', createdAt: now },
  })
  registry.writeUserDirectory(root, { [ANNA.email]: 'a', [CREATOR.email]: 'a', [BO.email]: 'b' })
  registry.setCreatorEmail(root, CREATOR.email)
  const account = person => [person.email, { email: person.email, fullName: person.fullName, password: PASSWORD, status: 'approved', role: 'user' }]
  createStore(path.join(root, 'OPS')).set('users', Object.fromEntries([ANNA, CREATOR].map(account)))
  createStore(path.join(root, 'SUP')).set('users', Object.fromEntries([BO].map(account)))

  const environment = { ...process.env, ELECTRON_START_URL: process.env.MULTIPLAYER_VERIFY_URL || 'http://127.0.0.1:5021', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE

  const sharedDir = path.join(root, '_shared')
  const colleagueChecker = createWordChecker()
  const directory = {
    teams: [{ folderName: 'OPS', name: 'Verification Operations' }, { folderName: 'SUP', name: 'Verification Support' }],
    people: [ANNA, BO].map(person => ({ email: person.email, fullName: person.fullName, teamCode: person.team, role: 'user' }))
      .concat([{ email: CREATOR.email, fullName: CREATOR.fullName, teamCode: CREATOR.team, role: 'creator' }]),
  }
  const colleague = createMultiplayerService({
    getIndexStore: () => createStore(sharedDir), getGameStore: () => createStore(path.join(sharedDir, 'multiplayer')),
    getDirectory: () => structuredClone(directory), wordChecker: colleagueChecker,
  })
  const actor = person => ({ email: person.email, role: 'user', home: { folderName: person.team } })
  const command = (person, type, fields = {}) => colleague.command(actor(person), { operationId: crypto.randomUUID(), type, ...fields })
  const colleagueGame = (person, gameId) => colleague.game(actor(person), gameId)

  /** Bo plays the first legal move offered for every die, like the board would offer it. */
  const boTurn = async gameId => {
    const game = await colleagueGame(BO, gameId)
    const color = game.bg.myColor
    const plan = rules.turnPlan(game.bg, color, game.bg.dice)
    let position = { points: game.bg.points, bar: game.bg.bar, off: game.bg.off }
    let remaining = plan.dice
    const steps = []
    for (;;) {
      const options = rules.nextSteps(position, color, plan, steps, remaining)
      if (!options.length) break
      const step = options[0]
      position = rules.applyStep(position, color, step).position
      remaining = [...remaining]
      remaining.splice(remaining.indexOf(step.die), 1)
      steps.push(step)
    }
    await command(BO, 'bg-move', { gameId, expectedRevision: game.revision, steps })
    return steps.length
  }

  const results = []
  const step = name => { results.push(name); console.log(`ok - ${name}`) }
  let application
  let page
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

    const hubTile = page.getByText('Forbedringer og forslag', { exact: true })
    const api = (method, ...args) => page.evaluate(([name, params]) => window.electronMultiplayer[name](...params), [method, args])
    const lobby = page.locator('.bgm-lobby')
    const room = page.locator('.bgm-room')
    const button = (name, scope = page) => scope.getByRole('button', { name, exact: true })
    const poll = async (label, check, timeout = 30000) => {
      const end = Date.now() + timeout
      for (;;) {
        const value = await check()
        if (value) return value
        if (Date.now() > end) throw new Error(`Timed out waiting for: ${label}`)
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

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

    // ------------------------------------------------------------------ hub tile -> lobby -> challenge with colour
    await page.getByText(L.gameCorner).first().click()
    await page.getByText('Multiplayer', { exact: true }).click()
    const tile = page.locator('.arcade-tile[data-game="backgammon"]')
    await tile.waitFor()
    assert.ok(await tile.locator('.bgm-board .bgm-checker').count() >= 30, 'the backgammon tile shows a board with checkers')
    await tile.click()
    await lobby.waitFor()
    await page.getByRole('heading', { name: 'Backgammon', level: 1 }).waitFor()
    await page.locator('.bgm-marquee .bgm-board').waitFor()
    step('Anna: Multiplayer hub has a Backgammon tile; it opens the backgammon lobby with a board in the marquee')

    await page.locator('.arcade-cabinet__start').click()
    const dialog = page.getByRole('dialog', { name: L.challenge })
    await dialog.waitFor()
    assert.equal(await dialog.locator('.wp-lang').count(), 0, 'backgammon asks for a colour, not a language')
    assert.equal(await dialog.locator('.cx-color .bgm-chip-checker').count(), 4, 'the colour cards show checkers')
    await dialog.locator('.wp-person', { hasText: BO.fullName }).click()
    await dialog.locator('.cx-color[data-color="white"]').click()
    await button(L.send, dialog).click()
    await page.getByText(`Udfordring sendt til ${BO.fullName}`).waitFor()
    await dialog.waitFor({ state: 'detached' })
    const sent = await api('snapshot')
    assert.equal(sent.games.length, 1)
    assert.equal(sent.games[0].type, 'backgammon')
    assert.equal(sent.games[0].challengerColor, 'white')
    const gameId = sent.games[0].id
    step('Anna: the challenge dialog offers White/Black/Random as checkers; a backgammon challenge as White is sent to Bo')

    // ------------------------------------------------------------------ Bo accepts; Anna opens the game
    await command(BO, 'respond', { gameId, accept: true })
    const row = page.locator('.wp-game-row[data-game-type="backgammon"]').first()
    await poll('the game is active in the lobby', async () => {
      const text = await row.innerText()
      return text.includes('Du spiller hvid') && (text.includes('Din tur') || text.includes('Venter'))
    })
    await row.locator('.wp-game-row__main').first().click()
    await room.waitFor()
    const board = page.getByRole('group', { name: 'Backgammonbr\u00e6t' })
    await board.waitFor()
    assert.equal(await board.locator('.bgm-checker').count(), 30, '15 checkers each')
    assert.equal(await board.getAttribute('data-me'), 'white')
    await page.locator('.hb-dog').first().waitFor({ state: 'attached' })
    const opening = (await colleagueGame(ANNA, gameId)).bg.opening
    assert.ok(opening && opening.white !== opening.black, 'the opening roll has two different dice')
    step(`Bo accepts; Anna's room shows the board with 30 checkers, Hubert and the opening roll (white ${opening.white}, black ${opening.black})`)

    // ------------------------------------------------------------------ turns: Anna on the board, Bo through the colleague client
    const turnCount = async () => (await colleagueGame(ANNA, gameId)).bg.turnCount
    let annaTurns = 0
    let boTurns = 0
    while (annaTurns + boTurns < TURNS) {
      const game = await colleagueGame(ANNA, gameId)
      const before = game.bg.turnCount
      if (game.turn === BO.email) {
        await boTurn(gameId)
        boTurns++
        await poll('Bo\'s turn reaches Anna', async () => (await page.locator('.bgr-turn').innerText()).trim() === 'Din tur')
        continue
      }
      await poll('Anna to move', async () => (await page.locator('.bgr-turn').innerText()).trim() === 'Din tur')
      const pass = button(L.pass)
      if (await pass.isVisible()) {
        await pass.click()
      } else {
        for (let moves = 0; moves < 4; moves++) {
          const source = board.locator('.bgm-point[data-source], .bgm-barzone[data-source]').first()
          if (!(await source.count())) break
          await source.dispatchEvent('click')
          const target = board.locator('.bgm-point[data-target], .bgm-offzone[data-target]').first()
          await target.waitFor({ state: 'attached' })
          await target.dispatchEvent('click')
        }
        const confirm = button(L.confirm)
        await poll('the turn is ready', async () => confirm.isEnabled())
        if (annaTurns === 0) {
          await button(L.undo).click()
          assert.equal(await board.locator('.bgm-point[data-source], .bgm-barzone[data-source]').count() > 0, true, 'undo gives the moves back')
          for (let moves = 0; moves < 4; moves++) {
            const source = board.locator('.bgm-point[data-source], .bgm-barzone[data-source]').first()
            if (!(await source.count())) break
            await source.dispatchEvent('click')
            await board.locator('.bgm-point[data-target], .bgm-offzone[data-target]').first().dispatchEvent('click')
          }
        }
        await confirm.click()
      }
      annaTurns++
      await poll('Anna\'s turn is stored', async () => (await turnCount()) === before + 1)
    }
    assert.ok(annaTurns >= 2 && boTurns >= 2, `both played (Anna ${annaTurns}, Bo ${boTurns})`)
    assert.equal((await colleagueGame(ANNA, gameId)).bg.turnCount, TURNS)
    step(`${TURNS} turns played: Anna on the board (pick a checker, click a marked point, undo once, "Afslut tur"), Bo from his own client`)

    await page.screenshot({ path: path.join(shots, 'backgammon-room.png') })

    // ------------------------------------------------------------------ Bo resigns: Anna wins
    const current = await colleagueGame(BO, gameId)
    await command(BO, 'resign', { gameId, expectedRevision: current.revision })
    const banner = page.locator('.bgm-banner')
    await banner.waitFor({ timeout: 30000 })
    await banner.getByText(/Du vandt/).waitFor()
    const finished = await colleagueGame(ANNA, gameId)
    assert.equal(finished.winner, ANNA.email)
    assert.equal(finished.winPoints, 1)
    step('Bo resigns; Anna sees "Du vandt - enkelt sejr (1 point)!" in the room')

    await button(L.backToLobby).first().click()
    await lobby.waitFor()
    await page.locator('.wp-section', { hasText: 'Afsluttede' }).locator('.wp-game-row[data-game-type="backgammon"]').waitFor()
    await page.locator('.arcade-cabinet__scores').getByText(`1${DASH}0${DASH}0`).waitFor()
    step('Anna: the backgammon lobby lists the finished game and her record 1-0-0')

    assert.deepEqual(errors, [], 'no renderer page errors')
    step('no renderer page errors during the whole run')
    console.log(`PASS: ${results.length} checks - backgammon tile, lobby, colour challenge, accept, board, turns from both clients, undo, resign, record; isolated data/profile.`)
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {})
      await fs.writeFile(path.join(temporary, 'failure-ui.txt'), await page.locator('body').innerText().catch(() => '')).catch(() => {})
      await fs.writeFile(path.join(temporary, 'console.txt'), consoleLog.join('\n')).catch(() => {})
    }
    console.error(`Verification evidence: ${temporary}`)
    throw error
  } finally {
    if (application) await application.close().catch(() => {})
    await colleagueChecker.close().catch(() => {})
  }
  if (process.env.MULTIPLAYER_KEEP_EVIDENCE) { console.log(`Evidence kept: ${temporary}`); return }
  await fs.rm(temporary, { recursive: true, force: true }).catch(() => {})
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
