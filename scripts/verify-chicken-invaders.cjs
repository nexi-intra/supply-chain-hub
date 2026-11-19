const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const NEW_KEY = 'chicken-invaders-global-leaderboard'
const LEGACY_KEY = 'endless-dodger-global-leaderboard'
const COUNTS_KEY = 'endless-dodger-play-counts'
const PASSWORD = 'Local-verification-only'
const PLAYER = 'player@example.test'
const CREATOR = 'creator@example.test'
const COLLEAGUE = 'colleague@example.test'

async function waitFor(check, message, timeoutMs = 15000) {
  const started = Date.now()
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() - started > timeoutMs) throw new Error(`Timeout: ${message}`)
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-chicken-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  const shots = path.join(temporary, 'screenshots')
  await fs.mkdir(profile, { recursive: true })
  await fs.mkdir(shots, { recursive: true })
  registry.writeTeams(root, { a: { name: 'Verification Operations', folderName: 'OPS', createdAt: new Date().toISOString() } })
  registry.writeUserDirectory(root, { [PLAYER]: 'a', [CREATOR]: 'a', [COLLEAGUE]: 'a' })
  await registry.setCreatorEmail(root, CREATOR)
  const team = () => createStore(path.join(root, 'OPS'))
  team().set('users', {
    [PLAYER]: { email: PLAYER, fullName: 'Verification Player', password: PASSWORD, status: 'approved', role: 'user' },
    [CREATOR]: { email: CREATOR, fullName: 'Verification Creator', password: PASSWORD, status: 'approved', role: 'manager' },
    [COLLEAGUE]: { email: COLLEAGUE, fullName: 'Verification Colleague', password: PASSWORD, status: 'approved', role: 'user' },
  })
  // Gamle Chickeninvasion-scorer; den ene er gemt uden id, som tidligere versioner gjorde.
  team().set(LEGACY_KEY, { easy: [], medium: [{ email: PLAYER, score: 777, timestamp: 1 }], hard: [{ id: 'legacy-x', email: COLLEAGUE, score: 999, timestamp: 2 }], expert: [] })
  team().set(COUNTS_KEY, { [PLAYER]: { medium: 4 } })

  const environment = { ...process.env, ELECTRON_START_URL: process.env.CHICKEN_VERIFY_URL || 'http://127.0.0.1:5019', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE
  const results = []
  const step = (name) => { results.push(name); console.log(`  ok - ${name}`) }
  let application
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile)
    let page = await application.firstWindow()
    await page.setViewportSize({ width: 1366, height: 860 }).catch(() => {})
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.waitForFunction(() => !!window.electronAuth)

    const loginAs = async (email) => {
      await page.locator('#email').fill(email)
      await page.locator('#password').fill(PASSWORD)
      await page.locator('form button[type="submit"]').click()
      await page.getByText(/^Spil\s*Hj[o\u00f8]rnet$/i).first().waitFor({ timeout: 30000 })
      // En frisk profil viser "Hvad er nyt"-dialogen efter login; den lukkes, så menuen kan bruges.
      await page.waitForTimeout(800)
      for (let i = 0; i < 3 && (await page.getByRole('dialog').first().isVisible().catch(() => false)); i++) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
      }
    }
    const openGame = async () => {
      await page.getByText(/^Spil\s*Hj[o\u00f8]rnet$/i).first().click()
      await page.getByText('Arcade', { exact: true }).first().click()
      await page.locator('.arcade-tile[data-game="endlessdodger"]').click()
      await page.getByRole('heading', { name: 'Chicken Invaders', level: 1 }).waitFor()
    }

    await loginAs(PLAYER)
    await page.getByText(/^Spil\s*Hj[o\u00f8]rnet$/i).first().click()
    await page.getByText('Arcade', { exact: true }).first().click()
    const tile = page.locator('.arcade-tile[data-game="endlessdodger"]')
    assert.match(await tile.innerText(), /Chicken Invaders/)
    await tile.click()
    await page.getByRole('heading', { name: 'Chicken Invaders', level: 1 }).waitFor()
    step('Arcade-flisen hedder Chicken Invaders og åbner kabinet-menuen')

    const checked = () => page.locator('[role="radio"][aria-checked="true"]').innerText()
    assert.match(await checked(), /Mellem/)
    await page.locator('[role="radio"][aria-checked="true"]').focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    assert.match(await checked(), /Ekspert/)
    assert.equal(await page.locator('[role="tab"][aria-selected="true"]').innerText(), 'Ekspert')
    const scores = await page.locator('.arcade-cabinet__scores').innerText()
    assert.ok(!scores.includes('777'), 'den gamle score må ikke vises som rekord')
    assert.match(scores, /Ingen endnu/)
    await page.screenshot({ path: path.join(shots, '01-menu.png') })
    step('Sværhedsgrad vælges med piletaster, highscore-fanen følger med, gammel score vises ikke')

    await page.clock.install()
    await page.getByRole('button', { name: 'Start spil' }).click()
    await page.locator('[data-arcade-ready]').waitFor()
    await page.keyboard.press('Space')
    await page.locator('[data-arcade-ready]').waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => document.body.getAttribute('data-game-active')), 'true')
    const layout = await page.evaluate(() => {
      const stage = document.querySelector('.arcade-stage[data-immersive]')?.getBoundingClientRect()
      const canvas = document.querySelector('.arcade-stage canvas')?.getBoundingClientRect()
      return { stage: stage && { width: stage.width, height: stage.height }, canvas: canvas && { width: canvas.width, height: canvas.height }, viewport: { width: innerWidth, height: innerHeight }, fame: !!document.querySelector('.arcade-fame') }
    })
    assert.ok(layout.stage && layout.stage.width === layout.viewport.width && layout.stage.height === layout.viewport.height, `spillefladen skal dække vinduet: ${JSON.stringify(layout)}`)
    assert.ok(layout.canvas && layout.canvas.width >= 1100, `lærredet skal være stort: ${JSON.stringify(layout)}`)
    assert.equal(layout.fame, false, 'highscores må ikke vises under spillet')
    step(`Fordybet spilleflade dækker vinduet, lærred ${Math.round(layout.canvas.width)}x${Math.round(layout.canvas.height)}, highscores skjult`)
    await page.keyboard.down('Space')
    await page.clock.runFor(4500)
    await page.keyboard.up('Space')
    await page.screenshot({ path: path.join(shots, '02-playing.png') })
    await page.keyboard.press('KeyM')
    await page.clock.runFor(250)
    await page.screenshot({ path: path.join(shots, '03-missile.png') })
    step('Spillet starter med mellemrum og kan skyde og affyre missil')

    const snapshot = () => page.evaluate(() => window.__chickenInvadersDev?.snapshot() ?? null)
    const before = await snapshot()
    assert.ok(before, 'udviklerhoppet skal findes i dev-bygget (window.__chickenInvadersDev)')
    assert.equal(before.kind, 'formation')
    assert.ok(before.shots > 0, 'der skal være skudt')
    await page.keyboard.down('ArrowUp')
    await page.keyboard.down('ArrowLeft')
    await page.clock.runFor(450)
    await page.keyboard.up('ArrowLeft')
    await page.keyboard.up('ArrowUp')
    const moved = await snapshot()
    assert.ok(moved.ship.y < before.ship.y - 40, `skibet skal kunne flyve op: ${before.ship.y} -> ${moved.ship.y}`)
    assert.ok(moved.ship.x < before.ship.x - 40, `skibet skal kunne flyve til venstre: ${before.ship.x} -> ${moved.ship.x}`)
    assert.equal(moved.practice, false, 'et almindeligt spil er aldrig en øvelse')
    step(`Skibet flyver frit i 2D (${Math.round(before.ship.x)},${Math.round(before.ship.y)} -> ${Math.round(moved.ship.x)},${Math.round(moved.ship.y)}) i en formationsbølge (${before.templateId})`)

    await page.keyboard.press('KeyP')
    await page.getByText('Pause', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(shots, '04-paused.png') })
    await page.keyboard.press('Space')
    await page.getByText('Pause', { exact: true }).waitFor({ state: 'detached' })
    step('P pauser og mellemrum genoptager')

    const gameOver = page.getByRole('heading', { name: 'Spillet er slut' })
    for (let i = 0; i < 40 && !(await gameOver.isVisible()); i++) await page.clock.runFor(5000)
    await gameOver.waitFor()
    await page.clock.runFor(1500)
    const overText = await page.locator('.arcade-over').innerText()
    for (const label of ['Slutscore', 'Bølge', 'Skudt ned', 'Træfsikkerhed', 'Længste combo', 'Spil igen', 'Tilbage til menu']) assert.ok(overText.includes(label), label)
    await page.screenshot({ path: path.join(shots, '05-game-over.png') })
    await page.clock.resume()
    step('Spillet ender med game over-overlay og statistik')

    const saved = await waitFor(() => {
      const board = team().get(NEW_KEY, { skipCache: true })
      return board?.expert?.find(entry => entry.email === PLAYER)
    }, 'scoren skal gemmes på den nye nøgle')
    assert.ok(saved.score > 0, 'scoren skal være over 0')
    const counts = await waitFor(() => {
      const value = team().get(COUNTS_KEY, { skipCache: true })
      return value?.[PLAYER]?.expert === 1 ? value : null
    }, 'runden skal tælles')
    assert.equal(counts[PLAYER].medium, 4)
    assert.deepEqual(team().get(LEGACY_KEY, { skipCache: true }).medium, [{ email: PLAYER, score: 777, timestamp: 1 }])
    step(`Score ${saved.score} gemt på ${NEW_KEY}, runden talt på ${COUNTS_KEY}, gammel tavle urørt`)

    await page.keyboard.press('Enter')
    await page.locator('[data-arcade-ready]').waitFor()
    step('Enter starter et nyt spil fra game over')

    // Øvelsestur gennem kampagnen med udviklerhoppet: hazard, bonusbane, bosser og Nyt+. Scoren gemmes ikke.
    const countsBefore = team().get(COUNTS_KEY, { skipCache: true })?.[PLAYER]?.expert
    const boardBefore = (team().get(NEW_KEY, { skipCache: true })?.expert ?? []).length
    await page.keyboard.press('Space')
    await page.locator('[data-arcade-ready]').waitFor({ state: 'detached' })
    await page.evaluate(() => window.__chickenInvadersDev.invulnerable())
    await page.keyboard.down('Space')
    const tour = [
      { wave: 3, name: '09-hazard', check: s => s.hazard !== null && s.kind === 'meteors' },
      { wave: 4, name: '10-bonus', check: s => s.bonus !== null && s.kind === 'bonus' },
      { wave: 6, name: '11-miniboss', check: s => s.boss === 'eggTrio' },
      { wave: 14, name: '12-cruiser', check: s => s.boss === 'chickenCruiser' },
      { wave: 24, name: '13-ice-queen', check: s => s.boss === 'iceQueen' },
      { wave: 40, name: '14-galactic', check: s => s.boss === 'galacticRooster' },
      { wave: 41, name: '15-new-plus', check: s => s.kind === 'formation' && s.wave === 41 },
    ]
    const visited = []
    for (const stop of tour) {
      assert.equal(await page.evaluate(wave => window.__chickenInvadersDev.jumpToWave(wave), stop.wave), true, `hop til bølge ${stop.wave}`)
      await page.waitForTimeout(stop.wave === 41 ? 900 : 3200)
      const state = await snapshot()
      assert.ok(stop.check(state), `bølge ${stop.wave}: ${JSON.stringify(state)}`)
      assert.equal(state.status, 'playing')
      await page.screenshot({ path: path.join(shots, `${stop.name}.png`) })
      visited.push(`${stop.wave}:${state.boss ?? state.hazard ?? state.bonus ?? state.templateId}`)
    }
    await page.keyboard.up('Space')
    const practice = await snapshot()
    assert.equal(practice.practice, true)
    await page.keyboard.press('Escape')
    await page.locator('.arcade-tile[data-game="endlessdodger"]').waitFor()
    await page.waitForTimeout(800)
    assert.equal(team().get(COUNTS_KEY, { skipCache: true })?.[PLAYER]?.expert, countsBefore, 'øvelsen må ikke tælles')
    assert.equal((team().get(NEW_KEY, { skipCache: true })?.expert ?? []).length, boardBefore, 'øvelsen må ikke give en highscore')
    step(`Øvelsestur: ${visited.join(', ')} uden fejl; ingen score eller runde gemt`)

    assert.equal(await page.evaluate(() => document.body.getAttribute('data-game-active')), null)
    await page.locator('.arcade-tile[data-game="endlessdodger"]').click()
    await page.getByRole('heading', { name: 'Chicken Invaders', level: 1 }).waitFor()
    // Hver tredje passage i marqueen er en boss-silhuet (ca. 18-29 s efter menuen åbner).
    await page.waitForTimeout(21000)
    await page.screenshot({ path: path.join(shots, '05b-menu-marquee.png') })
    await page.getByRole('tab', { name: 'Ekspert' }).click()
    const fame = page.locator('.arcade-fame__row[data-me]')
    await fame.waitFor()
    await fame.filter({ hasText: 'Verification Player' }).waitFor()
    assert.match(await page.locator('.arcade-cabinet__scores').innerText(), /Ingen endnu/)
    await page.screenshot({ path: path.join(shots, '06-highscores.png'), fullPage: true })
    step('Escape går til Arcade, og den nye score står i highscorelisten under Ekspert')

    await page.evaluate(() => window.electronAuth.logout())
    await application.close()
    // Ny app-start, så Creator-delen kører uden spillets falske ur.
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    page = await application.firstWindow()
    await page.setViewportSize({ width: 1366, height: 860 }).catch(() => {})
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.locator('#email').waitFor({ timeout: 30000 })
    await loginAs(CREATOR)
    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Hurtig-navigation', exact: true })
    await palette.waitFor()
    await palette.getByRole('combobox').fill('Creator')
    await palette.getByRole('option', { name: 'Creator Panel', exact: true }).click()
    await page.getByRole('tab', { name: 'Arcade' }).click()
    await page.getByRole('tab', { name: 'Chicken Invaders' }).click()
    await page.getByText('Verification Player').first().waitFor()
    await page.locator('text=Chicken Invaders Spil Statistik').locator('xpath=ancestor::*[@data-slot="card"][1]').getByText('Verification Player').first().waitFor()
    const legacy = page.locator(`[data-legacy-leaderboard="${LEGACY_KEY}"]`)
    await legacy.waitFor()
    await legacy.getByText('Gammel version', { exact: true }).first().waitFor()
    assert.equal(await legacy.getByText('Gammel version', { exact: true }).count(), 2)
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(shots, '07-creator-legacy.png'), fullPage: true })
    step('Creator Panel viser ny statistik og gamle Chickeninvasion-scores tydeligt markeret')

    await legacy.getByRole('button', { name: 'Slet score: Verification Player' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Slet score' }).click()
    await waitFor(() => (team().get(LEGACY_KEY, { skipCache: true }).medium || []).length === 0, 'den gamle række uden id skal slettes')
    assert.equal(team().get(LEGACY_KEY, { skipCache: true }).hard.length, 1)
    step('En gammel række uden id kan slettes enkeltvis')

    await legacy.getByRole('button', { name: 'Slet alle gamle highscores' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Slet alle gamle highscores' }).click()
    await waitFor(() => {
      const board = team().get(LEGACY_KEY, { skipCache: true })
      return Object.values(board).every(list => Array.isArray(list) && list.length === 0)
    }, 'alle gamle highscores skal slettes')
    assert.ok(team().get(NEW_KEY, { skipCache: true }).expert.some(entry => entry.email === PLAYER), 'den nye tavle må ikke røres')
    await legacy.getByRole('button', { name: 'Slet alle gamle highscores' }).waitFor({ state: 'detached' })
    await page.screenshot({ path: path.join(shots, '08-creator-legacy-cleared.png'), fullPage: true })
    step('Alle gamle highscores slettes samlet, den nye tavle er urørt')

    const relevantErrors = errors.filter(message => !/Failed to load resource|favicon/i.test(message))
    assert.deepEqual(relevantErrors, [])
    console.log(`PASS: ${results.length} checks; screenshots in ${shots}`)
  } finally {
    if (application) await application.close().catch(() => {})
  }
}

verify().catch(error => {
  console.error('FAIL:', error)
  process.exit(1)
})
