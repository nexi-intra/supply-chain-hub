// End-to-end check of Multiplayer / chess in the real Electron app with isolated temp data and profile.
//
// Electron (UI) is signed in as Anna (white). A "colleague client" inside this script runs the real multiplayer service
// (electron/multiplayer.cjs, chess.js rules) against the SAME temp storage as Bo, the way a second computer on the
// shared drive would, so every move of Bo is a genuine cross-client change (watcher -> multiplayer:changed).
// No direct storage edits.
//
// Game: 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4 4.O-O Nxf3+ 5.Qxf3 (Bo offers a draw, Anna declines) d6 6.Qxf7# (scholar's-mate finish).
// Every move of Anna is only staged on the board until "Bekræft" (Enter also confirms; "Fortryd"/Escape put it back).
//
// Needs a Vite dev server: MULTIPLAYER_VERIFY_URL=http://127.0.0.1:5021 node scripts/verify-chess.cjs
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

const PASSWORD = 'Local-verification-only'
const ANNA = { email: 'anna@example.test', fullName: 'Anna Andersen', team: 'OPS' }
const BO = { email: 'bo@example.test', fullName: 'Bo Bertelsen', team: 'SUP' }
const CREATOR = { email: 'creator@example.test', fullName: 'Test Creator', team: 'OPS' }
const DASH = '\u2013'

// Danish UI labels (src/lib/multiplayerLabels.ts, da).
const L = {
  gameCorner: /^Spil\s*Hj[o\u00f8]rnet$/i,
  backToGameCorner: 'Tilbage til Spilhj\u00f8rnet',
  backToMultiplayer: 'Tilbage til Multiplayer',
  backToHub: 'Tilbage til Hub',
  backToLobby: 'Tilbage til lobbyen',
  challenge: 'Udfordr en kollega',
  send: 'Send udfordring',
  decline: 'Afvis',
}

async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-chess-'))
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
  const colleagueIndex = createStore(sharedDir)
  const colleagueGames = createStore(path.join(sharedDir, 'multiplayer'))
  const colleague = createMultiplayerService({
    getIndexStore: () => colleagueIndex, getGameStore: () => colleagueGames, getDirectory: () => structuredClone(directory), wordChecker: colleagueChecker,
  })
  const actor = person => ({ email: person.email, role: 'user', home: { folderName: person.team } })
  const command = (person, type, fields = {}) => colleague.command(actor(person), { operationId: crypto.randomUUID(), type, ...fields })
  const colleagueGame = (person, gameId) => colleague.game(actor(person), gameId)
  const boCommand = async (gameId, type, fields = {}) => {
    const { revision } = await colleagueGame(BO, gameId)
    return command(BO, type, { gameId, expectedRevision: revision, ...fields })
  }
  const boMove = (gameId, from, to) => boCommand(gameId, 'chess-move', { from, to })

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
    const bell = page.locator('button[aria-haspopup="dialog"].rounded-full.relative')
    const lobby = page.locator('.cx-lobby')
    const room = page.locator('.cx-room')
    const button = (name, scope = page) => scope.getByRole('button', { name, exact: true })
    const square = name => page.locator(`.cx-sq[data-square="${name}"]`)
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

    // ------------------------------------------------------------------ hub tile -> chess lobby -> challenge with colour
    await page.getByText(L.gameCorner).first().click()
    await page.getByText('Multiplayer', { exact: true }).click()
    const chessTile = page.locator('.arcade-tile[data-game="chess"]')
    await chessTile.waitFor()
    assert.ok(await chessTile.locator('.cx-tile-pieces img').count() >= 3, 'the chess tile has its own piece art')
    await chessTile.click()
    await lobby.waitFor()
    await page.getByRole('heading', { name: 'Skak', level: 1 }).waitFor()
    assert.ok(await page.locator('.cx-marquee-piece').count() >= 4, 'chess marquee shows pieces')
    step('Anna: Multiplayer hub has a Chess tile with piece art; it opens the chess lobby with the chess marquee')

    await page.locator('.arcade-cabinet__start').click()
    const dialog = page.getByRole('dialog', { name: L.challenge })
    await dialog.waitFor()
    assert.equal(await dialog.locator('.wp-lang').count(), 0, 'chess asks for a colour, not a language')
    assert.equal(await dialog.locator('.cx-color').count(), 3)
    await dialog.locator('.wp-person', { hasText: BO.fullName }).click()
    await dialog.locator('.cx-color[data-color="white"]').click()
    assert.equal(await dialog.locator('.cx-color[aria-checked="true"]').getAttribute('data-color'), 'white')
    await button(L.send, dialog).click()
    await page.getByText(`Udfordring sendt til ${BO.fullName}`).waitFor()
    await dialog.waitFor({ state: 'detached' })
    const sent = await api('snapshot')
    assert.equal(sent.games.length, 1)
    assert.equal(sent.games[0].type, 'chess')
    assert.equal(sent.games[0].challengerColor, 'white')
    assert.equal(sent.games[0].status, 'invited')
    const gameId = sent.games[0].id
    step('Anna: the challenge dialog offers White/Black/Random; a chess challenge as White is sent to Bo')

    // ------------------------------------------------------------------ Bo accepts remotely; hub badge; bell deep-link opens the chess game
    await command(BO, 'respond', { gameId, accept: true })
    await button(L.backToMultiplayer).click()
    await poll('chess tile badge', async () => (await chessTile.innerText()).includes('Din tur i 1 spil'))
    assert.ok(!(await page.locator('.arcade-tile[data-game="wordpuzzle"]').innerText()).includes('Din tur'), 'the Word-Puzzle tile has no chess badge')
    step('Bo accepts (colleague client); the hub\'s Chess tile shows "Din tur i 1 spil"')

    await button(L.backToGameCorner).click()
    await button(L.backToHub).click()
    await hubTile.waitFor()
    await bell.click()
    const accepted = page.getByRole('button', { name: new RegExp(`${BO.fullName} har accepteret din udfordring`) })
    await accepted.waitFor()
    await accepted.click()
    await room.waitFor()
    await page.getByRole('grid', { name: 'Skakbr\u00e6t' }).waitFor()
    assert.equal(await page.locator('.cx-board').getAttribute('data-bottom'), 'white', 'white at the bottom for Anna')
    assert.equal(await page.locator('.cx-piece').count(), 32)
    await page.locator('.hb-dog').first().waitFor({ state: 'attached' })
    await poll('your move', async () => (await page.locator('.bgr-turn').innerText()).trim() === 'Dit tr\u00e6k')
    step('Anna: the bell notification deep-links straight into the chess game (room, Hubert, 32 pieces, white at the bottom, "Dit træk")')

    // Record piece animations and knocked-off pieces between checkpoints.
    await page.evaluate(() => {
      window.__cx = { anims: 0, falling: 0 }
      setInterval(() => {
        const anims = document.getAnimations().filter(animation => animation.effect?.target?.closest?.('.cx-pieces')).length
        window.__cx.anims = Math.max(window.__cx.anims, anims)
        window.__cx.falling = Math.max(window.__cx.falling, document.querySelectorAll('.cx-piece[data-falling]').length)
      }, 25)
    })
    const resetFx = () => page.evaluate(() => { window.__cx.anims = 0; window.__cx.falling = 0 })
    const fx = () => page.evaluate(() => ({ ...window.__cx }))
    const center = async name => {
      const box = await square(name).boundingBox()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const clickMove = async (from, to) => {
      const a = await center(from)
      await page.mouse.click(a.x, a.y)
      await poll(`${from} lifted`, async () => (await square(from).getAttribute('data-selected')) === '')
      assert.ok(await page.locator('.cx-sq[data-target]').count() > 0, 'legal targets are marked')
      const b = await center(to)
      await page.mouse.click(b.x, b.y)
    }
    const dragMove = async (from, to) => {
      const a = await center(from)
      const b = await center(to)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(a.x + 8, a.y - 6, { steps: 3 })
      await page.mouse.move(b.x, b.y, { steps: 14 })
      assert.equal(await square(to).getAttribute('data-over'), '', 'the drop square is highlighted while dragging')
      await page.mouse.up()
    }
    const serverMoves = async () => (await colleagueGame(BO, gameId)).chess.moves.length
    const labelOf = name => square(name).getAttribute('aria-label')
    const waitTurn = () => poll('Anna to move', async () => (await page.locator('.bgr-turn').innerText()).trim().startsWith('Dit tr\u00e6k'))
    const PENDING_HINT = 'Tr\u00e6kket er ikke sendt endnu \u2013 tryk Bekr\u00e6ft eller Fortryd'
    const hintText = async () => (await page.locator('.bgr-hint').innerText()).trim()
    const waitStaged = () => poll('move staged (Fortryd/Bekræft and the hint shown)', async () =>
      (await hintText()) === PENDING_HINT && await button('Fortryd').isVisible() && await button('Bekr\u00e6ft').isVisible())
    const waitUnstaged = () => poll('no staged move', async () => (await button('Bekr\u00e6ft').count()) === 0 && (await button('Fortryd').count()) === 0)
    // A board move is only staged: nothing reaches the service until "Bekræft", and then exactly one move is stored.
    // With double, the button gets two clicks in the same task (before React re-renders) to pin "no double send".
    const confirmMove = async ({ double = false } = {}) => {
      await waitStaged()
      const before = await serverMoves()
      await page.waitForTimeout(400)
      assert.equal(await serverMoves(), before, 'a staged move is not sent before Bekræft')
      if (double) await button('Bekr\u00e6ft').evaluate(element => { element.click(); element.click() })
      else await button('Bekr\u00e6ft').click()
      await poll(`move ${before + 1} stored`, async () => (await serverMoves()) === before + 1)
      await waitUnstaged()
      await poll('sending finished', async () => (await page.locator('.bgr-turn', { hasText: 'Sender dit tr\u00e6k' }).count()) === 0)
      assert.equal(await serverMoves(), before + 1, 'Bekræft sends the move exactly once')
    }

    // ------------------------------------------------------------------ staged move: Fortryd puts it back, nothing is sent
    const emptyE3 = await labelOf('e3')
    assert.equal(emptyE3, 'e3, tomt felt')
    assert.equal(await labelOf('e2'), 'Hvid bonde p\u00e5 e2')
    // Dragged, not clicked: a lifted e2 pawn's (transparent) image box covers the centre of e3, so a click there hits the pawn.
    await dragMove('e2', 'e3')
    await waitStaged()
    await poll('e3 staged on the board', async () => (await labelOf('e3')) === 'Hvid bonde p\u00e5 e3')
    assert.equal(await serverMoves(), 0, 'the staged move is not sent')
    await button('Fortryd').click()
    await waitUnstaged()
    await poll('e2 back', async () => (await labelOf('e2')) === 'Hvid bonde p\u00e5 e2')
    assert.equal(await labelOf('e3'), emptyE3, 'e3 is empty again')
    assert.notEqual(await hintText(), PENDING_HINT)
    assert.equal(await serverMoves(), 0, 'Fortryd sends nothing')
    await waitTurn()
    step('Anna: e2-e3 (drag) is only staged (Fortryd/Bekræft and "Trækket er ikke sendt endnu" shown, nothing stored); Fortryd puts the pawn back on e2')

    // ------------------------------------------------------------------ moves via click and drag; opponent moves arrive animated
    await clickMove('e2', 'e4')
    await confirmMove()
    assert.equal(await labelOf('e4'), 'Hvid bonde p\u00e5 e4')
    step('Anna: 1.e4 by click (piece lifts, legal targets marked); stored only after Bekræft, exactly once')

    await resetFx()
    await boMove(gameId, 'e7', 'e5')
    await poll('e5 on the board', async () => (await labelOf('e5')) === 'Sort bonde p\u00e5 e5')
    await waitTurn()
    assert.equal(await square('e5').getAttribute('data-last'), '', 'last move highlighted')
    assert.ok((await fx()).anims > 0, 'the opponent move is animated')
    step('Bo: 1...e5 arrives through the watcher, is animated and marked as the last move')

    await dragMove('g1', 'f3')
    await confirmMove()
    assert.equal(await labelOf('f3'), 'Hvid springer p\u00e5 f3')
    await boMove(gameId, 'b8', 'c6')
    await poll('Nc6', async () => (await labelOf('c6')) === 'Sort springer p\u00e5 c6')
    await waitTurn()
    step('Anna: 2.Nf3 by drag-and-drop (drop square highlighted), stored after Bekræft; Bo answers Nc6')

    const movesBeforeEscape = await serverMoves()
    await clickMove('f1', 'c4')
    await waitStaged()
    await page.keyboard.press('Escape')
    await waitUnstaged()
    await poll('bishop back on f1', async () => (await labelOf('f1')) === 'Hvid l\u00f8ber p\u00e5 f1')
    assert.ok(await room.isVisible(), 'Escape with a staged move stays in the game')
    assert.ok(await page.getByRole('grid', { name: 'Skakbr\u00e6t' }).isVisible(), 'the board is still shown')
    assert.equal(await lobby.count(), 0, 'Escape with a staged move does not go to the lobby')
    assert.equal(await serverMoves(), movesBeforeEscape, 'Escape sends nothing')
    await waitTurn()
    step('Anna: a staged Bc4 + Escape puts the bishop back on f1; the game stays open (not the lobby), nothing is sent')

    await clickMove('f1', 'c4')
    await waitStaged()
    const movesBeforeEnter = await serverMoves()
    await page.getByRole('grid', { name: 'Skakbr\u00e6t' }).focus()
    assert.equal(await page.evaluate(() => document.activeElement?.closest('input, textarea, select, button, a[href]') ? 'control' : 'page'), 'page', 'focus is on the board, not a button')
    await page.keyboard.press('Enter')
    await poll('Bc4 stored by Enter', async () => (await serverMoves()) === movesBeforeEnter + 1)
    await waitUnstaged()
    assert.equal(await labelOf('c4'), 'Hvid l\u00f8ber p\u00e5 c4')
    await boMove(gameId, 'c6', 'd4')
    await poll('Nd4', async () => (await labelOf('d4')) === 'Sort springer p\u00e5 d4')
    await waitTurn()
    assert.equal(await serverMoves(), movesBeforeEnter + 2, 'Enter sent Bc4 exactly once')
    step('Anna: 3.Bc4 staged by click and confirmed with Enter (focus on the board) - stored once; Bo answers Nd4')

    await resetFx()
    await clickMove('e1', 'g1')
    await confirmMove()
    await poll('castled', async () => (await labelOf('g1')) === 'Hvid konge p\u00e5 g1' && (await labelOf('f1')) === 'Hvidt t\u00e5rn p\u00e5 f1')
    await poll('O-O stored', async () => (await colleagueGame(BO, gameId)).chess.moves.at(-1)?.san === 'O-O')
    assert.ok((await fx()).anims >= 2, 'king and rook both travel')
    step('Anna: 4.O-O by moving the king two squares and Bekræft; king and rook both animate to g1/f1')

    await resetFx()
    await boMove(gameId, 'd4', 'f3')
    await poll('Nxf3+ on the board', async () => (await labelOf('f3')) === 'Sort springer p\u00e5 f3')
    await waitTurn()
    await poll('check on g1', async () => (await square('g1').getAttribute('data-check')) === '')
    assert.ok((await page.locator('.bgr-turn').innerText()).includes('Skak!'), 'check is announced')
    assert.ok((await fx()).falling > 0, 'the captured knight is knocked off the board')
    await poll('tray shows the white knight', async () => (await page.locator('.cx-tray[data-place="top"] .cx-tray__piece').count()) === 1)
    step('Bo: 4...Nxf3+ captures (white knight topples into the tray), the king glows in check and "Skak!" is shown')

    await resetFx()
    await dragMove('d1', 'f3')
    await confirmMove({ double: true })
    assert.equal(await labelOf('f3'), 'Hvid dronning p\u00e5 f3')
    assert.ok((await fx()).falling > 0, 'Anna\'s capture knocks the knight off')
    await poll('both trays', async () => (await page.locator('.cx-tray[data-place="bottom"] .cx-tray__piece').count()) === 1)
    step('Anna: 5.Qxf3 recaptures by drag; a double click on Bekræft stores it exactly once; the black knight is knocked off into her tray')

    // ------------------------------------------------------------------ draw offer declined
    await boCommand(gameId, 'offer-draw')
    const offer = page.locator('.cx-banner', { hasText: `${BO.fullName} tilbyder remis` })
    await offer.waitFor({ timeout: 30000 })
    await button(L.decline, offer).click()
    await offer.waitFor({ state: 'detached' })
    await poll('offer gone', async () => (await colleagueGame(BO, gameId)).drawOffer === null)
    assert.ok((await colleague.snapshot(actor(BO))).notifications.some(note => note.type === 'draw-declined' && note.readAt === null), 'Bo is told')
    assert.equal((await colleagueGame(BO, gameId)).status, 'active')
    step('Bo offers a draw; Anna sees the banner and declines; Bo gets "draw-declined"; the game goes on')

    // ------------------------------------------------------------------ emoji reactions: in the room only, no move, no notification
    const pop = emoji => room.locator(`.bgr-react-pop[data-emoji="${emoji}"]`)
    const emojiButton = page.locator('.bgr-react-call > .bgr-chip')
    const react = async (person, emoji) => {
      for (let attempt = 0; ; attempt++) {
        try { return await command(person, 'react', { gameId, emoji }) } catch (error) {
          if (!/MULTIPLAYER_TOO_SOON/.test(String(error)) || attempt > 10) throw error
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    }
    const reopenMatch = async () => {
      await button(L.backToLobby).first().click()
      await lobby.waitFor()
      await page.locator('.wp-game-row[data-game-type="chess"]').first().locator('.wp-game-row__main').first().click()
      await room.waitFor()
      await page.getByRole('grid', { name: 'Skakbr\u00e6t' }).waitFor()
    }
    const revisionBeforeEmoji = (await colleagueGame(BO, gameId)).revision
    const annaNotesBefore = (await colleague.snapshot(actor(ANNA))).notifications.length
    const boNotesBefore = (await colleague.snapshot(actor(BO))).notifications.length

    await react(BO, '🤔')
    await pop('🤔').waitFor({ timeout: 30000 })
    assert.equal(await pop('🤔').getAttribute('data-from'), 'opponent')
    assert.equal(await page.locator('[data-sonner-toast]').count(), 0, 'no toast for an emoji')
    await pop('🤔').waitFor({ state: 'detached', timeout: 10000 })
    assert.equal((await colleagueGame(BO, gameId)).revision, revisionBeforeEmoji, 'a reaction is not a move: the revision stays')
    assert.equal((await colleague.snapshot(actor(ANNA))).notifications.length, annaNotesBefore, 'no bell item for an emoji')
    step('Anna (chess open): Bo\'s emoji floats up in the room live and is gone afterwards; no toast, no bell item, no revision change')

    await reopenMatch()
    await page.waitForTimeout(1500)
    assert.equal(await room.locator('.bgr-react-pop').count(), 0, 'a reaction that was shown is not shown again when the match is reopened')
    step('Anna: reopening the chess game does not show the same emoji again')

    await button(L.backToLobby).first().click()
    await lobby.waitFor()
    await react(BO, '😮')
    await page.locator('.wp-game-row[data-game-type="chess"]').first().locator('.wp-game-row__main').first().click()
    await room.waitFor()
    await pop('😮').waitFor({ timeout: 30000 })
    await pop('😮').waitFor({ state: 'detached', timeout: 10000 })
    step('Anna: an emoji Bo sent while she was in the lobby pops up when she opens the game')

    await emojiButton.click()
    const emojiTray = room.getByRole('group', { name: 'V\u00e6lg en emoji' })
    await emojiTray.waitFor()
    assert.equal(await emojiTray.getByRole('button').count(), 8)
    await button('Klapsalver', emojiTray).click()
    await pop('👏').waitFor({ timeout: 5000 })
    assert.equal(await pop('👏').getAttribute('data-from'), 'me', 'our own emoji pops at once')
    await poll('the service has Anna\'s emoji', async () => (await colleagueGame(BO, gameId)).reactions.some(item => item.by === 0 && item.emoji === '👏'))
    assert.equal((await colleagueGame(BO, gameId)).revision, revisionBeforeEmoji, 'sending an emoji does not bump the revision')
    assert.equal((await colleague.snapshot(actor(BO))).notifications.length, boNotesBefore, 'Bo gets no bell item for it')
    assert.ok(await button('Kald p\u00e5 Hubert').isVisible(), 'Hubert\'s button is still next to the emoji button')
    await pop('👏').waitFor({ state: 'detached', timeout: 10000 })
    step('Anna: sends an emoji from the tray with the mouse; it pops locally and is stored for Bo without a revision change or notification')

    // ------------------------------------------------------------------ Qxf7#
    await boMove(gameId, 'd7', 'd6')
    await poll('d6', async () => (await labelOf('d6')) === 'Sort bonde p\u00e5 d6')
    await waitTurn()
    await clickMove('f3', 'f7')
    await confirmMove()
    const banner = page.locator('.cx-banner', { hasText: 'Skakmat!' })
    await banner.waitFor({ timeout: 30000 })
    await banner.getByText('Slutstilling').waitFor()
    const finished = await colleagueGame(BO, gameId)
    assert.equal(finished.status, 'finished')
    assert.equal(finished.finishedReason, 'checkmate')
    assert.equal(finished.winner, ANNA.email)
    await poll('black king topples', async () => (await page.locator('.cx-piece[data-type="k"][data-color="b"][data-fallen]').count()) === 1)
    const sheet = await page.locator('.cx-sheet').innerText()
    assert.ok(sheet.includes('O-O') && sheet.includes('#'), 'score sheet lists castling and mate')
    step('Anna: 6.Qxf7# - checkmate banner, the black king topples, the score sheet ends in #')

    await react(BO, '🎉')
    await pop('🎉').waitFor({ timeout: 30000 })
    await pop('🎉').waitFor({ state: 'detached', timeout: 10000 })
    assert.ok(await banner.locator('.bgr-react-call').isVisible(), 'the emoji button is also in the finished banner')
    step('Anna: after the mate Bo\'s "gg" emoji still pops up in the finished game, and the emoji button is in the finished banner')

    // ------------------------------------------------------------------ record in "Dine opgør" and the leaderboard
    await button(L.backToLobby).first().click()
    await lobby.waitFor()
    await page.locator('.wp-section', { hasText: 'Afsluttede' }).locator('.wp-game-row[data-game-type="chess"]').waitFor()
    await page.locator('.arcade-cabinet__scores').getByText(`1${DASH}0${DASH}0`).waitFor()
    const rival = page.locator('.wp-rival', { hasText: BO.fullName })
    await rival.waitFor()
    assert.equal((await rival.locator('.wp-rival__wins').innerText()).trim(), '1')
    assert.equal((await rival.locator('.wp-rival__losses').innerText()).trim(), '0')
    await page.locator('.arcade-fame__row[data-rank="1"]', { hasText: ANNA.fullName }).getByText(`1${DASH}0${DASH}0`).waitFor()
    step('Anna: the chess lobby lists the finished game; record 1-0-0, "Dine opgør" shows 1-0 against Bo, Anna leads the chess leaderboard')

    assert.deepEqual(errors, [], 'no renderer page errors')
    step('no renderer page errors during the whole run')
    console.log(`PASS: ${results.length} checks - chess tile, lobby, colour challenge, accept, badge, bell deep link, staged moves (Bekræft/Fortryd/Escape/Enter, no double send), click/drag moves, opponent moves, capture, castling, check, draw offer declined, checkmate, record; isolated data/profile.`)
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
  await fs.rm(temporary, { recursive: true, force: true }).catch(() => {})
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
