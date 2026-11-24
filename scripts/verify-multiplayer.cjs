// End-to-end check of Multiplayer / Word-Puzzle in the real Electron app with isolated temp data and profile.
//
// One Electron instance can only hold one session, so the script plays two roles:
//   - Electron (UI) is used as Anna (challenger), then as Bo (opponent), then as Anna again.
//   - A "colleague client" inside this script runs the real multiplayer service (electron/multiplayer.cjs,
//     real word checker) against the SAME temp storage, exactly as a second computer on the shared drive would.
//     It acts as the player Electron is not signed in as, which also produces genuine cross-client changes
//     (watcher -> multiplayer:changed -> bell, live match updates).
// The only direct storage edit is `patchGame`: racks and starting player are set so the moves below do not depend on
// random tiles. It writes the game file and bumps the index entry the same way a remote client would.
//
// Needs a Vite dev server: MULTIPLAYER_VERIFY_URL=http://127.0.0.1:5032 node scripts/verify-multiplayer.cjs
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')
const { createMultiplayerService } = require('../electron/multiplayer.cjs')
const { createHighFivesService } = require('../electron/highFives.cjs')
const { createWordChecker } = require('../electron/games/wordPuzzle/wordChecker.cjs')

const PASSWORD = 'Local-verification-only'
const ANNA = { email: 'anna@example.test', fullName: 'Anna Andersen', team: 'OPS' }
const BO = { email: 'bo@example.test', fullName: 'Bo Bertelsen', team: 'SUP' }
const CARA = { email: 'cara@example.test', fullName: 'Cara Christensen', team: 'OPS' }
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
  accept: 'Accept\u00e9r',
  open: '\u00c5bn',
  play: 'L\u00e6g ord',
  pass: 'Pas',
  resign: 'Giv op',
  approve: 'Godkend ord',
  reject: 'Afvis ord',
  callHubert: 'Kald p\u00e5 Hubert',
  sendHighFive: 'Send high-five',
  highFiveDialog: 'Send en high-five',
  customizeDashboard: 'Tilpas dashboard',
  done: 'Færdig',
}

async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-multiplayer-'))
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
  registry.writeUserDirectory(root, { [ANNA.email]: 'a', [CARA.email]: 'a', [CREATOR.email]: 'a', [BO.email]: 'b' })
  registry.setCreatorEmail(root, CREATOR.email)
  const account = person => [person.email, { email: person.email, fullName: person.fullName, password: PASSWORD, status: 'approved', role: 'user' }]
  createStore(path.join(root, 'OPS')).set('users', Object.fromEntries([ANNA, CARA, CREATOR].map(account)))
  createStore(path.join(root, 'SUP')).set('users', Object.fromEntries([BO].map(account)))

  const environment = { ...process.env, ELECTRON_START_URL: process.env.MULTIPLAYER_VERIFY_URL || 'http://127.0.0.1:5032', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE

  // The colleague client: same service code and the same shared files, its own stores and word checker.
  const sharedDir = path.join(root, '_shared')
  const colleagueChecker = createWordChecker()
  const directory = {
    teams: [{ folderName: 'OPS', name: 'Verification Operations' }, { folderName: 'SUP', name: 'Verification Support' }],
    people: [ANNA, BO, CARA].map(person => ({ email: person.email, fullName: person.fullName, teamCode: person.team, role: 'user' }))
      .concat([{ email: CREATOR.email, fullName: CREATOR.fullName, teamCode: CREATOR.team, role: 'creator' }]),
  }
  const colleagueIndex = createStore(sharedDir)
  const colleagueGames = createStore(path.join(sharedDir, 'multiplayer'))
  const colleagueHighFivesStore = createStore(sharedDir)
  const colleagueHighFives = createHighFivesService({ getStore: () => colleagueHighFivesStore, getDirectory: () => structuredClone(directory) })
  const colleague = createMultiplayerService({
    getIndexStore: () => colleagueIndex, getGameStore: () => colleagueGames, getDirectory: () => structuredClone(directory), wordChecker: colleagueChecker,
  })
  const actor = person => ({ email: person.email, role: 'user', home: { folderName: person.team } })
  const command = (person, type, fields = {}) => colleague.command(actor(person), { operationId: crypto.randomUUID(), type, ...fields })
  const colleagueGame = (person, gameId) => colleague.game(actor(person), gameId)
  const colleagueMove = async (person, gameId, type, fields = {}) => {
    const { revision } = await colleagueGame(person, gameId)
    return command(person, type, { gameId, expectedRevision: revision, ...fields })
  }
  const tiles = (row, col, letters, horizontal) => [...letters].map((letter, index) => ({ row: horizontal ? row : row + index, col: horizontal ? col + index : col, letter, blank: false }))

  // Documented direct edit (see header): deterministic racks + starting player, written like a remote change.
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
    const dismissWhatsNew = async () => {
      const whatsNew = page.getByRole('dialog', { name: /Nyheder i Supply Chain Hub/ })
      if (await whatsNew.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
        await page.keyboard.press('Escape')
        await whatsNew.waitFor({ state: 'detached' })
      }
    }
    const signIn = async person => {
      await page.locator('#email').waitFor({ timeout: 90000 })
      await page.locator('#email').fill(person.email)
      await page.locator('#password').fill(PASSWORD)
      await page.locator('form button[type="submit"]').click()
      await hubTile.waitFor({ timeout: 60000 })
      await dismissWhatsNew()
      // A Windows toast per hub notification would pop up on the developer's desktop during the run.
      await page.evaluate(() => window.electronDesktopNotifications.setEnabled(false))
    }
    const signOut = async () => {
      // The renderer does not notice an API logout by itself; reloading shows the login form for the next person.
      await page.evaluate(() => window.electronAuth.logout())
      await page.reload()
      await page.locator('#email').waitFor({ timeout: 90000 })
    }
    const api = (method, ...args) => page.evaluate(([name, params]) => window.electronMultiplayer[name](...params), [method, args])
    const bell = page.locator('button[aria-haspopup="dialog"].rounded-full.relative')
    const lobby = page.locator('.wp-lobby')
    const room = page.locator('.bgr-room')
    const button = (name, scope = page) => scope.getByRole('button', { name, exact: true })
    const cell = (row, col) => page.locator(`#wp-cell-${row}-${col}`)
    const poll = async (label, check, timeout = 30000) => {
      const end = Date.now() + timeout
      for (;;) {
        const value = await check()
        if (value) return value
        if (Date.now() > end) throw new Error(`Timed out waiting for: ${label}`)
        await new Promise(resolve => setTimeout(resolve, 250))
      }
    }
    const openLobbyFromHub = async () => {
      await page.getByText(L.gameCorner).first().click()
      await page.getByText('Multiplayer', { exact: true }).click()
      await page.locator('.arcade-tile[data-game="wordpuzzle"]').click()
      await lobby.waitFor()
    }
    const goToHub = async () => {
      if (await room.isVisible()) await button(L.backToLobby).first().click()
      await button(L.backToMultiplayer).click()
      await button(L.backToGameCorner).click()
      await button(L.backToHub).click()
      await hubTile.waitFor()
    }

    // ------------------------------------------------------------------ High-fives: Anna (OPS) -> Bo (SUP) from the Hub widget
    const highFiveMessage = 'Tak for hjælpen med vagtplanen! ÆØÅ'
    const highFiveCard = page.locator('#high-fives-card')
    await signIn(ANNA)
    await highFiveCard.waitFor()
    await highFiveCard.getByRole('heading', { name: 'High-fives', level: 3 }).waitFor()
    await highFiveCard.getByText('Du har ikke fået nogen high-fives endnu.').waitFor()
    await highFiveCard.getByText('Ingen high-fives i dit team endnu.').waitFor()
    await button(L.sendHighFive, highFiveCard).click()
    const highFiveDialog = page.getByRole('dialog', { name: L.highFiveDialog })
    await highFiveDialog.waitFor()
    const highFivePeople = highFiveDialog.getByRole('radiogroup', { name: 'Find kollega' }).getByRole('radio')
    await highFivePeople.first().waitFor()
    assert.deepEqual([...(await highFivePeople.locator('.font-semibold').allTextContents())].sort(), [BO.fullName, CARA.fullName], 'people list: Bo (other team) and Cara, never Anna herself or the creator')
    await highFiveDialog.locator('#high-five-search').fill('support')
    await poll('search narrows to Bo by team name', async () => (await highFivePeople.count()) === 1)
    assert.ok((await highFivePeople.first().innerText()).includes(BO.fullName))
    await highFiveDialog.locator('#high-five-search').fill('')
    await highFivePeople.filter({ hasText: BO.fullName }).click()
    assert.ok(await button(L.sendHighFive, highFiveDialog).isDisabled(), 'sending needs a message')
    await highFiveDialog.getByRole('radio', { name: 'Fest' }).click()
    await highFiveDialog.getByLabel('Besked').fill(highFiveMessage)
    await button(L.sendHighFive, highFiveDialog).click()
    await page.getByText(`High-five sendt til ${BO.fullName}`).waitFor()
    await highFiveDialog.waitFor({ state: 'detached' })
    await highFiveCard.locator('[data-list="team"]').getByText(highFiveMessage).waitFor()
    await highFiveCard.locator('[data-list="team"]').getByText(`${ANNA.fullName} til ${BO.fullName}`).waitFor()
    const storedHighFives = await colleagueHighFivesStore.getAsync('high-fives', { skipCache: true })
    assert.equal(storedHighFives.items.length, 1)
    assert.deepEqual(
      { from: storedHighFives.items[0].senderEmail, to: storedHighFives.items[0].recipientEmail, emoji: storedHighFives.items[0].emoji, message: storedHighFives.items[0].message, readAt: storedHighFives.items[0].readAt },
      { from: ANNA.email, to: BO.email, emoji: '🎉', message: highFiveMessage, readAt: null },
    )
    const caraView = await colleagueHighFives.snapshot(actor(CARA))
    assert.deepEqual([caraView.received.length, caraView.team.map(item => item.message)], [0, [highFiveMessage]], 'a colleague in Anna\'s team sees it in the team feed only')
    await assert.rejects(
      page.evaluate(email => window.electronHighFives.command({ operationId: crypto.randomUUID(), type: 'send', recipientEmail: email, emoji: '🙌', message: 'hi' }), CREATOR.email),
      /HIGH_FIVES_INVALID/,
    )
    assert.equal(await page.evaluate(email => window.electronHighFives.command({ operationId: crypto.randomUUID(), type: 'send', recipientEmail: email, emoji: '🙌', message: 'hi' }).then(() => 'sent', error => String(error)), ANNA.email).then(text => /HIGH_FIVES_INVALID/.test(text)), true, 'not to herself')
    step('Anna: the Hub "High-fives" card lists Bo and Cara (not herself or the creator), search by team works, and a high-five (emoji + message) is sent and shown in her team feed')
    await signOut()

    await signIn(BO)
    await highFiveCard.waitFor()
    await bell.click()
    const highFiveItem = page.getByRole('button', { name: new RegExp(`${ANNA.fullName} sendte dig en high-five 🎉`) })
    await highFiveItem.waitFor({ timeout: 30000 })
    assert.ok((await highFiveItem.innerText()).includes(highFiveMessage), 'the bell shows the message')
    assert.equal(await page.locator('[data-sonner-toast]', { hasText: /high-five/i }).count(), 0, 'no pop-up toast for an incoming high-five')
    await highFiveCard.locator('[data-list="received"]').getByText(highFiveMessage).waitFor()
    await highFiveCard.locator('[data-list="received"]').getByText('Ny', { exact: true }).waitFor()
    await highFiveItem.click()
    await poll('the service marks it read', async () => (await colleagueHighFives.snapshot(actor(BO))).received[0]?.readAt !== null)
    await highFiveCard.locator('[data-list="received"]').getByText(highFiveMessage).waitFor()
    await highFiveCard.locator('[data-list="received"]').getByText('Ny', { exact: true }).waitFor({ state: 'detached' })
    await highFiveCard.locator('[data-list="team"]').getByText(`${ANNA.fullName} til ${BO.fullName}`).waitFor()
    await bell.click()
    await page.getByText(/Intet nyt lige nu/).waitFor()
    assert.equal(await highFiveItem.count(), 0, 'a clicked high-five stays out of the bell')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: path.join(shots, 'hub-high-fives.png') })
    step('Bo: the high-five arrives in the bell (message, no toast), clicking it removes it from the bell and marks it read in the service; the Hub card still lists it')

    await button(L.customizeDashboard).click()
    const dashboardDialog = page.getByRole('dialog')
    await dashboardDialog.locator('#dashboard-highFives').click()
    await button(L.done, dashboardDialog).click()
    await highFiveCard.waitFor({ state: 'detached' })
    await button(L.customizeDashboard).click()
    await dashboardDialog.locator('#dashboard-highFives').click()
    await button(L.done, dashboardDialog).click()
    await highFiveCard.waitFor()
    step('Bo: the High-fives card can be hidden and shown again in "Tilpas dashboard"')
    await signOut()

    // ------------------------------------------------------------------ Anna: lobby + challenge via the UI
    await signIn(ANNA)
    await openLobbyFromHub()
    await page.getByRole('heading', { name: 'Word-Puzzle', level: 1 }).waitFor()
    assert.ok(await page.locator('.arcade-cabinet__marquee').isVisible(), 'arcade-style marquee')
    assert.ok(await page.locator('.wp-marquee-tile').count() > 3, 'marquee shows crossword tiles')
    step('Anna: Game Corner -> Multiplayer hub -> Word-Puzzle tile opens the lobby with the arcade marquee')

    await page.locator('.arcade-cabinet__start').click()
    const challengeDialog = page.getByRole('dialog', { name: L.challenge })
    await challengeDialog.waitFor()
    await challengeDialog.locator('.wp-person').first().waitFor()
    const names = await challengeDialog.locator('.wp-person .font-semibold').allTextContents()
    assert.deepEqual([...names].sort(), [BO.fullName, CARA.fullName], 'people list: Bo (other team) and Cara, never Anna herself or the creator')
    assert.ok(!(await challengeDialog.innerText()).includes(CREATOR.fullName), 'the creator is not challengeable')
    await challengeDialog.locator('.wp-person', { hasText: BO.fullName }).click()
    await challengeDialog.locator('.wp-lang', { hasText: 'Dansk' }).click()
    assert.ok((await challengeDialog.locator('.wp-lang[aria-checked="true"]').innerText()).includes('Dansk'))
    await button(L.send, challengeDialog).click()
    await page.getByText(`Udfordring sendt til ${BO.fullName}`).waitFor()
    await challengeDialog.waitFor({ state: 'detached' })
    const sent = await api('snapshot')
    assert.equal(sent.games.length, 1)
    assert.equal(sent.games[0].status, 'invited')
    assert.equal(sent.games[0].language, 'da')
    assert.equal(sent.games[0].players[1].email, BO.email)
    await page.locator('.wp-section', { hasText: 'Invitationer' }).getByText('Inviteret').waitFor()
    step('Anna: "Challenge a colleague" lists Bo and Cara (not the creator), sends a Danish challenge; invitation shows as sent')
    const gameId = sent.games[0].id
    await signOut()

    // ------------------------------------------------------------------ Bo: bell -> lobby -> accept -> match
    await signIn(BO)
    await bell.click()
    const invitation = page.getByRole('button', { name: /udfordret dig til Word-Puzzle/ })
    await invitation.waitFor()
    await invitation.click()
    await lobby.waitFor()
    const inviteRow = page.locator('.wp-game-row', { hasText: ANNA.fullName })
    await inviteRow.waitFor()
    assert.equal(await page.locator('.wp-news').count(), 0, 'the lobby has no notification list of its own')
    step('Bo: the hub bell shows the Word-Puzzle invitation; clicking it opens Game Corner -> Multiplayer')

    await button(L.accept, inviteRow).click()
    await room.waitFor()
    await page.getByRole('grid', { name: 'Spilbr\u00e6t' }).waitFor()
    await poll('7 rack tiles', async () => (await page.locator('.wp-rack__tile').count()) === 7)
    await page.locator('.hb-dog').first().waitFor({ state: 'attached' })
    assert.ok(await page.locator('.hb-dog').first().boundingBox(), 'Hubert has a box')
    const opened = await api('game', gameId)
    assert.equal(opened.status, 'active')
    assert.equal(opened.rack.length, 7)
    assert.ok(!('racks' in opened) && !('bag' in opened), 'the projection never carries the bag or the opponent rack')
    assert.equal(opened.opponentRackCount, 7)
    step('Bo: accepting opens the match: board, rack of 7 tiles, room and Hubert; projection hides the opponent rack and the bag')

    // Deterministic racks (documented edit); Bo starts. The open match picks the change up through the watcher.
    await patchGame(gameId, { turn: 1, racks: [[...'USERLAT'], [...'HUNDBKK']] })
    await poll('patched rack on screen', async () => (await page.locator('.wp-rack__tile').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')?.[0]).join(''))) === 'HUNDBKK')
    await poll('your turn', async () => (await page.locator('.bgr-turn').innerText()).trim() === 'Din tur')
    assert.equal(await page.locator('.wp-rack__tile').count(), 7)
    step('Bo: the match shows the (edited) rack and "Din tur" after a remote change arrives')

    // ------------------------------------------------------------------ move 1 by Bo through the UI (known word)
    await cell(7, 4).click()
    await page.keyboard.type('HUND', { delay: 60 })
    await button(L.play).waitFor()
    await poll('play enabled', async () => await button(L.play).isEnabled())
    await button(L.play).click()
    await poll('HUND on the board', async () => /^D,/.test(await cell(7, 7).getAttribute('aria-label')))
    await poll('their turn', async () => (await page.locator('.bgr-turn').innerText()).includes(`${ANNA.fullName} er ved at l`))
    const afterHund = await colleagueGame(ANNA, gameId)
    assert.equal(afterHund.status, 'active')
    assert.equal(afterHund.turn, ANNA.email)
    assert.ok(afterHund.scores[1] > 0, 'Bo scored')
    assert.equal(afterHund.rack.length, 7, 'Anna still has a full rack')
    const annaSnapshot = await colleague.snapshot(actor(ANNA))
    assert.ok(annaSnapshot.notifications.some(note => note.type === 'turn' && note.actorEmail === BO.email && note.readAt === null), 'Anna got a turn notification')
    step('Bo: places HUND with the keyboard, the word is in the dictionary and counts at once; Anna is notified (turn)')

    await button(L.backToLobby).first().click()
    const topWordsPanel = page.locator('.wp-top-words')
    await topWordsPanel.getByText('HUND').waitFor()
    const topRow = await topWordsPanel.locator('.arcade-fame__row').first().innerText()
    assert.ok(topRow.includes(BO.fullName) && topRow.includes(`${afterHund.scores[1]} point`), `Top 10 row shows who and how many points: ${topRow}`)
    step('Bo: the lobby\'s "Top 10 ord" lists HUND with Bo\'s name and the points it scored')

    // ------------------------------------------------------------------ move 2 by Anna (colleague client) -> hub bell at Bo
    await goToHub()
    await colleagueMove(ANNA, gameId, 'move', { placements: tiles(8, 4, 'US', false) })
    await bell.click()
    const turnItem = page.getByRole('button', { name: new RegExp(`Det er din tur mod ${ANNA.fullName}`) })
    await turnItem.waitFor({ timeout: 30000 })
    assert.equal(await page.locator('[data-sonner-toast]', { hasText: `Det er din tur mod ${ANNA.fullName}` }).count(), 0, 'no in-app multiplayer toast')
    step('Bo: while on the Hub, Anna\'s move shows up only in the hub bell ("Det er din tur mod Anna Andersen"), no in-app toast')
    await turnItem.click()
    await room.waitFor()
    await poll('HUS on the board', async () => /^S,/.test(await cell(9, 4).getAttribute('aria-label')))
    await poll('your turn again', async () => (await page.locator('.bgr-turn').innerText()).trim() === 'Din tur')
    step('Bo: the bell item deep-links straight into the match, which shows Anna\'s word')

    // ------------------------------------------------------------------ unknown word: Bo plays, Anna rejects
    await cell(9, 5).click()
    await page.keyboard.type('KBK', { delay: 60 })
    await page.getByText('Ikke i ordlisten').first().waitFor()
    await poll('play enabled for the unknown word', async () => await button(L.play).isEnabled())
    await button(L.play).click()
    await page.locator('.wp-decision').getByText(`Venter p\u00e5 at ${ANNA.fullName} godkender dine ord`).waitFor()
    const waiting = await api('game', gameId)
    assert.equal(waiting.status, 'awaiting-approval')
    assert.equal(waiting.turn, ANNA.email, 'the approver is the one to act')
    assert.equal(waiting.pending.words.some(word => word.known === false), true)
    await colleagueMove(ANNA, gameId, 'approve-word', { accept: false })
    await poll('Bo gets his tiles back', async () => (await api('game', gameId)).status === 'active')
    await page.locator('.wp-decision').waitFor({ state: 'detached' })
    await poll('rack is whole again', async () => (await page.locator('.wp-rack__tile').count()) === 7)
    assert.equal(await cell(9, 5).locator('.wp-cell__tile').count(), 0, 'the rejected word is off the board')
    assert.equal((await api('game', gameId)).turn, BO.email, 'same player tries again')
    await poll('Bo is told the word was rejected', async () => (await api('snapshot')).notifications.some(note => note.type === 'word-rejected'))
    step('Unknown word: Bo submits "SKBK" -> awaiting Anna\'s approval; Anna rejects -> Bo gets the tiles back and keeps the turn')

    // ------------------------------------------------------------------ Bo passes through the confirm dialog
    await button(L.pass).click()
    const confirmPass = page.getByRole('alertdialog')
    await confirmPass.getByText('Pas denne tur?').waitFor()
    await button(L.pass, confirmPass).click()
    await poll('turn passed to Anna', async () => (await colleagueGame(ANNA, gameId)).turn === ANNA.email)
    step('Bo: passing asks for confirmation and hands the turn to Anna')

    // ------------------------------------------------------------------ unknown word: Anna plays, Bo rejects then approves in the UI
    await colleagueMove(ANNA, gameId, 'move', { placements: tiles(8, 7, 'RLAT', false) })
    const approveBox = page.locator('.wp-decision')
    await approveBox.getByText(`${ANNA.fullName} har lagt ord, der ikke er i ordlisten`).waitFor({ timeout: 30000 })
    await button(L.reject, approveBox).click()
    await poll('Anna keeps the turn after the rejection', async () => {
      const current = await colleagueGame(ANNA, gameId)
      return current.status === 'active' && current.turn === ANNA.email && current.rack.length === 7 && current.board[8][7] === null
    })
    await approveBox.waitFor({ state: 'detached' })
    await colleagueMove(ANNA, gameId, 'move', { placements: tiles(8, 7, 'RLAT', false) })
    await approveBox.getByText(`${ANNA.fullName} har lagt ord, der ikke er i ordlisten`).waitFor({ timeout: 30000 })
    const scoreBefore = (await api('game', gameId)).scores[0]
    await button(L.approve, approveBox).click()
    await poll('approved word stands', async () => {
      const current = await api('game', gameId)
      return current.status === 'active' && current.turn === BO.email && current.board[8][7]?.letter === 'R'
    })
    assert.ok((await api('game', gameId)).scores[0] > scoreBefore, 'the approved word scored for Anna')
    await poll('word on the board', async () => /^R,/.test(await cell(8, 7).getAttribute('aria-label')))
    step('Unknown word: Anna plays "DRLAT" -> Bo rejects in the UI (tiles back) -> Anna plays it again -> Bo approves in the UI and it scores')

    // ------------------------------------------------------------------ chat through the UI
    const message = 'Hej Anna, god leg! \u00c6\u00d8\u00c5'
    const chatInput = page.getByPlaceholder(`Skriv til ${ANNA.fullName}`)
    await chatInput.fill(message)
    await chatInput.press('Enter')
    const bubble = page.locator('.bgr-bubble', { hasText: message })
    await bubble.waitFor()
    assert.equal(await bubble.getAttribute('data-own'), '', 'own bubble')
    await poll('chat stored', async () => (await api('game', gameId)).chat.some(item => item.text === message))
    assert.ok((await colleague.snapshot(actor(ANNA))).notifications.some(note => note.type === 'chat' && note.readAt === null), 'Anna has an unread chat notification')
    step('Bo: sends a chat message with its text visible in the notebook; Anna gets a chat notification')
    await signOut()

    // ------------------------------------------------------------------ Anna returns: chat, Hubert, resign, leaderboard
    await signIn(ANNA)
    await bell.click()
    const chatItem = page.getByRole('button', { name: new RegExp(`${BO.fullName} har skrevet til dig`) })
    await chatItem.waitFor()
    await chatItem.click()
    await room.waitFor({ timeout: 20000 }).catch(async error => {
      await page.screenshot({ path: path.join(shots, 'after-bell-click.png') })
      throw error
    })
    await page.locator('.bgr-bubble', { hasText: message }).waitFor()
    assert.equal(await page.locator('.bgr-bubble', { hasText: message }).getAttribute('data-own'), null, 'the opponent\'s bubble is not styled as own')
    step('Anna: the hub bell announces the chat message; the match opens with Bo\'s text in the notebook')

    await goToHub()
    await bell.click()
    await page.getByText(/Ryd alle|Intet nyt lige nu/).first().waitFor()
    assert.equal(await chatItem.count(), 0, 'a clicked bell item stays gone after leaving and returning to the Hub')
    await page.keyboard.press('Escape')
    await openLobbyFromHub()
    await page.locator('.wp-game-row', { hasText: BO.fullName }).locator('.wp-game-row__main').first().click()
    await room.waitFor()
    await page.locator('.bgr-bubble', { hasText: message }).waitFor()
    step('Anna: the clicked chat notification is gone from the bell after leaving and returning to the Hub')

    // ------------------------------------------------------------------ emoji reactions: in the room only, no move, no notification
    const pop = emoji => room.locator(`.bgr-react-pop[data-emoji="${emoji}"]`)
    const emojiButton = page.locator('.bgr-react-call > .bgr-chip')
    const emojiTray = room.getByRole('group', { name: 'Vælg en emoji' })
    const reopenMatch = async () => {
      await button(L.backToLobby).first().click()
      await lobby.waitFor()
      await page.locator('.wp-game-row', { hasText: BO.fullName }).locator('.wp-game-row__main').first().click()
      await room.waitFor()
      await page.locator('.bgr-bubble', { hasText: message }).waitFor()
    }
    const revisionBeforeEmoji = (await api('game', gameId)).revision
    const annaNotesBefore = (await colleague.snapshot(actor(ANNA))).notifications.length
    const boNotesBefore = (await colleague.snapshot(actor(BO))).notifications.length

    await command(BO, 'react', { gameId, emoji: '🔥' })
    await assert.rejects(command(BO, 'react', { gameId, emoji: '🎉' }), /MULTIPLAYER_TOO_SOON/, 'the service spaces one player\'s reactions 3 seconds apart')
    await pop('🔥').waitFor({ timeout: 30000 })
    assert.equal(await pop('🔥').getAttribute('data-from'), 'opponent')
    assert.equal(await room.locator('.bgr-react-pop').count(), 1, 'one pop-up for one reaction')
    assert.equal(await page.locator('[data-sonner-toast]').count(), 0, 'no toast for an emoji')
    await pop('🔥').waitFor({ state: 'detached', timeout: 10000 })
    assert.equal((await api('game', gameId)).revision, revisionBeforeEmoji, 'a reaction is not a move: the revision stays')
    assert.equal((await colleague.snapshot(actor(ANNA))).notifications.length, annaNotesBefore, 'no bell item for an emoji')
    step('Anna (match open): Bo\'s emoji floats up in the room live and is gone afterwards; no toast, no bell item, no revision change; the service refuses a second one within 3 seconds')

    await reopenMatch()
    await page.waitForTimeout(1500)
    assert.equal(await room.locator('.bgr-react-pop').count(), 0, 'a reaction that was shown is not shown again when the match is reopened')
    step('Anna: reopening the match does not show the same emoji again')

    await button(L.backToLobby).first().click()
    await lobby.waitFor()
    await command(BO, 'react', { gameId, emoji: '🎉' })
    await page.locator('.wp-game-row', { hasText: BO.fullName }).locator('.wp-game-row__main').first().click()
    await room.waitFor()
    await pop('🎉').waitFor({ timeout: 30000 })
    await pop('🎉').waitFor({ state: 'detached', timeout: 10000 })
    await reopenMatch()
    await page.waitForTimeout(1500)
    assert.equal(await room.locator('.bgr-react-pop').count(), 0, 'the emoji sent while she was away shows once')
    step('Anna: an emoji Bo sent while she was in the lobby pops up when she opens the match, once')

    await emojiButton.focus()
    await page.keyboard.press('Enter')
    await emojiTray.waitFor()
    assert.equal(await emojiTray.getByRole('button').count(), 8, 'eight emoji in the tray')
    await poll('the first emoji has focus', async () => (await page.evaluate(() => document.activeElement?.getAttribute('data-emoji'))) === '👏')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-emoji')), '😂', 'arrow keys move through the tray')
    await page.keyboard.press('Enter')
    await pop('😂').waitFor({ timeout: 5000 })
    assert.equal(await pop('😂').getAttribute('data-from'), 'me', 'our own emoji pops at once')
    await emojiTray.waitFor({ state: 'detached' })
    await poll('the service has Anna\'s emoji', async () => (await colleagueGame(BO, gameId)).reactions.some(item => item.by === 0 && item.emoji === '😂'))
    const sentGame = await colleagueGame(BO, gameId)
    assert.equal(sentGame.revision, revisionBeforeEmoji, 'sending an emoji does not bump the revision')
    assert.equal((await colleague.snapshot(actor(BO))).notifications.length, boNotesBefore, 'Bo gets no bell item for it')
    await emojiButton.press('Enter')
    await emojiTray.waitFor()
    assert.equal(await emojiTray.locator('button:disabled').count(), 8, 'the tray rests during the cooldown')
    await page.keyboard.press('Escape')
    await emojiTray.waitFor({ state: 'detached' })
    assert.ok(await room.isVisible() && !(await lobby.isVisible()), 'Escape only closes the tray, it does not leave the match')
    await pop('😂').waitFor({ state: 'detached', timeout: 10000 })
    step('Anna: sends an emoji with the keyboard only (tray opens on the first emoji, arrows move, Enter sends); it pops locally, is stored for Bo without a revision change or notification, the tray rests during the cooldown and Escape only closes it')

    await page.screenshot({ path: path.join(shots, 'match-reactions.png') })

    const menuItem = pattern => page.getByRole('menuitem', { name: pattern })
    const feed = async pattern => {
      await button(L.callHubert).click()
      await menuItem(pattern).click()
      await poll('Hubert call enabled again', async () => await button(L.callHubert).isEnabled())
    }
    await feed(/^Giv en godbid \(10 tilbage\)/)
    await button(L.callHubert).click()
    await menuItem(/^Giv en godbid \(9 tilbage\)/).waitFor()
    await page.keyboard.press('Escape')
    await feed(/^Giv et k\u00f8dben \(2 tilbage\)/)
    await feed(/^Giv et k\u00f8dben \(1 tilbage\)/)
    await button(L.callHubert).click()
    const lastBone = menuItem(/^Giv et k\u00f8dben \(0 tilbage\)/)
    await lastBone.waitFor()
    assert.ok(await lastBone.isDisabled(), 'bones are disabled at 0')
    await lastBone.getByText('Ikke flere k\u00f8dben i dette spil').waitFor()
    assert.ok(await menuItem(/^Giv en godbid \(9 tilbage\)/).isEnabled(), 'treats still available')
    await page.keyboard.press('Escape')
    const fed = await colleagueGame(ANNA, gameId)
    assert.deepEqual(fed.hubert.treats, [1, 0])
    assert.deepEqual(fed.hubert.bones, [2, 0])
    await assert.rejects(
      page.evaluate(id => window.electronMultiplayer.command({ operationId: crypto.randomUUID(), type: 'hubert', gameId: id, kind: 'bone' }), gameId),
      /MULTIPLAYER_HUBERT_LIMIT/,
    )
    step('Anna: gives Hubert a treat (9 left), then 2 bones; bones are disabled at 0 with the friendly text; the service refuses a third')

    await button(L.resign).click()
    const confirmResign = page.getByRole('alertdialog')
    await confirmResign.getByText('Giv op?').waitFor()
    await button(L.resign, confirmResign).click()
    const banner = page.locator('.wp-banner')
    await banner.getByText(`${BO.fullName} vandt`).waitFor()
    await banner.getByText('Slutstilling').waitFor()
    assert.equal((await api('game', gameId)).status, 'finished')
    step('Anna: resigning shows the finished banner with Bo as the winner')

    await button(L.backToLobby).first().click()
    await lobby.waitFor()
    await page.locator('.wp-section', { hasText: 'Afsluttede' }).getByText('Du tabte').waitFor()
    const record = page.locator('.arcade-cabinet__scores')
    await record.getByText(`0${DASH}1${DASH}0`).waitFor()
    const boRow = page.locator('.arcade-fame__row', { hasText: BO.fullName })
    const annaRow = page.locator('.arcade-fame__row', { hasText: ANNA.fullName })
    await boRow.getByText(`1${DASH}0${DASH}0`).waitFor()
    await annaRow.getByText(`0${DASH}1${DASH}0`).waitFor()
    assert.equal(await page.locator('.arcade-fame__row').first().getAttribute('data-rank'), '1')
    assert.ok((await page.locator('.arcade-fame__row').first().innerText()).includes(BO.fullName), 'the winner leads the leaderboard')
    step('Anna: the lobby lists the finished game ("Du tabte") and the leaderboard/record show Bo 1-0-0 and Anna 0-1-0')

    assert.deepEqual(errors, [], 'no renderer page errors')
    step('no renderer page errors during the whole run')
    console.log(`PASS: ${results.length} checks - challenge, invitation bell, accept, match room with Hubert, keyboard move, Top 10 words, bell (no toast) + deep link, clicked bell items stay gone, unknown-word reject/approve, pass, chat, Hubert treats/bones, resign, leaderboard; isolated data/profile.`)
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {})
      await fs.writeFile(path.join(temporary, 'failure-ui.txt'), await page.locator('body').innerText().catch(() => '')).catch(() => {})
      await fs.writeFile(path.join(temporary, 'console.txt'), (typeof consoleLog === 'undefined' ? [] : consoleLog).join('\n')).catch(() => {})
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
