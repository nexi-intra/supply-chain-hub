const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const NEW_KEY = 'parcel-pilot-global-leaderboard'
const LEGACY_KEY = 'nexi-flyer-global-leaderboard'
const COUNTS_KEY = 'nexi-flyer-play-counts'
const PASSWORD = 'Local-verification-only'
const PLAYER = 'player@example.test'
const CREATOR = 'creator@example.test'
const COLLEAGUE = 'colleague@example.test'
// Løft og tyngde udligner hinanden efter 2 * 500 / 1700 s, så dronen holder højden.
const HOVER_PERIOD_MS = 588
const MAX_ATTEMPTS = 12

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
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-parcel-'))
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
  // Gamle Nexi Flyer-scorer; den ene er gemt uden id, som tidligere versioner gjorde.
  team().set(LEGACY_KEY, { easy: [{ email: PLAYER, score: 777, timestamp: 1 }], medium: [], hard: [{ id: 'legacy-x', email: COLLEAGUE, score: 999, timestamp: 2 }], expert: [] })
  team().set(COUNTS_KEY, { [PLAYER]: { medium: 4 } })

  const environment = { ...process.env, ELECTRON_START_URL: process.env.PARCEL_VERIFY_URL || 'http://127.0.0.1:5019', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
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
    }

    await loginAs(PLAYER)
    await page.getByText(/^Spil\s*Hj[o\u00f8]rnet$/i).first().click()
    await page.getByText('Arcade', { exact: true }).first().click()
    const tile = page.locator('.arcade-tile[data-game="nexiflyer"]')
    assert.match(await tile.innerText(), /Parcel Pilot/)
    assert.match(await tile.innerText(), /containerhavnen/)
    await tile.click()
    await page.getByRole('heading', { name: 'Parcel Pilot', level: 1 }).waitFor()
    assert.equal(await page.locator('.arcade-cabinet[data-arcade-theme="parcel"]').count(), 1)
    step('Arcade-flisen hedder Parcel Pilot og åbner kabinet-menuen i havne-temaet')

    const checked = () => page.locator('[role="radio"][aria-checked="true"]').innerText()
    assert.match(await checked(), /Mellem/)
    await page.locator('[role="radio"][aria-checked="true"]').focus()
    await page.keyboard.press('ArrowLeft')
    assert.match(await checked(), /Let/)
    assert.equal(await page.locator('[role="tab"][aria-selected="true"]').innerText(), 'Let')
    const scores = await page.locator('.arcade-cabinet__scores').innerText()
    assert.ok(!scores.includes('777'), 'den gamle score må ikke vises som rekord')
    assert.match(scores, /Ingen endnu/)
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(shots, '01-menu.png') })
    step('Sværhedsgrad vælges med piletaster, highscore-fanen følger med, gammel score vises ikke')

    await page.clock.install()
    await page.getByRole('button', { name: 'Start spil' }).click()
    await page.locator('.arcade-stage[data-immersive] canvas').waitFor()
    assert.equal(await page.evaluate(() => document.body.getAttribute('data-game-active')), 'true')
    const layout = await page.evaluate(() => {
      const stage = document.querySelector('.arcade-stage[data-immersive]')?.getBoundingClientRect()
      const canvas = document.querySelector('.arcade-stage canvas')?.getBoundingClientRect()
      return {
        theme: document.querySelector('.arcade-stage')?.getAttribute('data-arcade-theme'),
        stage: stage && { width: stage.width, height: stage.height },
        canvas: canvas && { width: canvas.width, height: canvas.height },
        viewport: { width: innerWidth, height: innerHeight },
        fame: !!document.querySelector('.arcade-fame'),
      }
    })
    assert.equal(layout.theme, 'parcel')
    assert.ok(layout.stage && layout.stage.width === layout.viewport.width && layout.stage.height === layout.viewport.height, `spillefladen skal dække vinduet: ${JSON.stringify(layout)}`)
    assert.ok(layout.canvas && layout.canvas.width >= 1100, `lærredet skal være stort: ${JSON.stringify(layout)}`)
    assert.equal(layout.fame, false, 'highscores må ikke vises under spillet')
    await page.clock.runFor(700)
    await page.screenshot({ path: path.join(shots, '02-ready.png') })
    step(`Fordybet spilleflade dækker vinduet, lærred ${Math.round(layout.canvas.width)}x${Math.round(layout.canvas.height)}, highscores skjult`)

    const canvasHash = () => page.evaluate(() => {
      const canvas = document.querySelector('.arcade-stage canvas')
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
      let hash = 0
      for (let i = 0; i < data.length; i += 997) hash = (hash * 31 + data[i]) >>> 0
      return hash
    })
    const hover = async (milliseconds) => {
      for (let elapsed = 0; elapsed < milliseconds; elapsed += HOVER_PERIOD_MS) {
        await page.keyboard.press('Space')
        await page.clock.runFor(HOVER_PERIOD_MS)
      }
    }
    await hover(HOVER_PERIOD_MS * 3)
    const before = await canvasHash()
    await hover(HOVER_PERIOD_MS)
    assert.notEqual(await canvasHash(), before, 'billedet skal ændre sig mens dronen flyver')
    const box = await page.locator('.arcade-stage__screen').boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.clock.runFor(HOVER_PERIOD_MS)
    await page.screenshot({ path: path.join(shots, '03-flying.png') })
    step('Mellemrum letter, dronen flyver, og klik på spillefladen løfter også')

    await page.keyboard.press('KeyP')
    await page.getByText('Pause', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(shots, '04-paused.png') })
    await page.keyboard.press('Space')
    await page.getByText('Pause', { exact: true }).waitFor({ state: 'detached' })
    step('P pauser og mellemrum genoptager')

    const gameOver = page.getByRole('heading', { name: 'Spillet er slut' })
    const playUntilOver = async () => {
      for (let i = 0; i < 100 && !(await gameOver.isVisible()); i++) await hover(HOVER_PERIOD_MS)
      for (let i = 0; i < 20 && !(await gameOver.isVisible()); i++) await page.clock.runFor(500)
      await gameOver.waitFor()
    }
    const savedScore = () => team().get(NEW_KEY, { skipCache: true })?.easy?.find(entry => entry.email === PLAYER)
    const roundsCounted = () => team().get(COUNTS_KEY, { skipCache: true })?.[PLAYER]?.easy ?? 0
    let attempts = 0
    let saved = null
    while (attempts < MAX_ATTEMPTS && !(saved && saved.score > 0)) {
      if (attempts > 0) {
        await page.keyboard.press('Enter')
        await gameOver.waitFor({ state: 'detached' })
        await page.clock.runFor(300)
      }
      await playUntilOver()
      await page.clock.runFor(1500)
      attempts++
      // Runden tælles først, når scoren er gemt, så tælleren viser at gemningen er færdig.
      await waitFor(() => roundsCounted() === attempts, `runde ${attempts} skal tælles`)
      saved = savedScore()
    }
    const overText = await page.locator('.arcade-over').innerText()
    for (const label of ['Slutscore', 'Zone', 'Porte', 'Pakker', 'Perfekte', 'Længste række', 'Spil igen', 'Tilbage til menu']) assert.ok(overText.includes(label), label)
    await page.screenshot({ path: path.join(shots, '05-game-over.png') })
    await page.clock.resume()
    step(`Spillet ender med game over-overlay og statistik (${attempts} runde(r) til første passerede port)`)

    assert.ok(saved && saved.score > 0, 'scoren skal være over 0')
    assert.ok(Number.isInteger(saved.level) && saved.level >= 1, 'zonen skal gemmes sammen med scoren')
    const counts = team().get(COUNTS_KEY, { skipCache: true })
    assert.equal(counts[PLAYER].easy, attempts)
    assert.equal(counts[PLAYER].medium, 4)
    assert.deepEqual(team().get(LEGACY_KEY, { skipCache: true }).easy, [{ email: PLAYER, score: 777, timestamp: 1 }])
    step(`Score ${saved.score} (zone ${saved.level}) gemt på ${NEW_KEY}, ${attempts} runde(r) talt, gammel tavle urørt`)

    await page.keyboard.press('Enter')
    await gameOver.waitFor({ state: 'detached' })
    await page.locator('.arcade-stage[data-immersive] canvas').waitFor()
    step('Enter starter et nyt spil fra game over')

    await page.keyboard.press('Escape')
    await page.locator('.arcade-tile[data-game="nexiflyer"]').waitFor()
    assert.equal(await page.evaluate(() => document.body.getAttribute('data-game-active')), null)
    assert.equal(await page.locator('.arcade-stage').count(), 0)
    await page.locator('.arcade-tile[data-game="nexiflyer"]').click()
    await page.getByRole('heading', { name: 'Parcel Pilot', level: 1 }).waitFor()
    await page.getByRole('tab', { name: 'Let' }).click()
    const fame = page.locator('.arcade-fame__row[data-me]')
    await fame.waitFor()
    await fame.filter({ hasText: 'Verification Player' }).waitFor()
    await page.screenshot({ path: path.join(shots, '06-highscores.png'), fullPage: true })
    step('Escape går til Arcade, og den nye score står i highscorelisten under Let')

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
    await page.getByRole('tab', { name: 'Parcel Pilot' }).click()
    await page.getByText('Verification Player').first().waitFor()
    await page.locator('text=Parcel Pilot Spil Statistik').locator('xpath=ancestor::*[@data-slot="card"][1]').getByText('Verification Player').first().waitFor()
    const legacy = page.locator(`[data-legacy-leaderboard="${LEGACY_KEY}"]`)
    await legacy.waitFor()
    await legacy.getByText('Gammel version', { exact: true }).first().waitFor()
    assert.equal(await legacy.getByText('Gammel version', { exact: true }).count(), 2)
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(shots, '07-creator-legacy.png'), fullPage: true })
    step('Creator Panel viser Parcel Pilot-statistik og gamle Nexi Flyer-scores tydeligt markeret')

    await legacy.getByRole('button', { name: 'Slet score: Verification Player' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Slet score' }).click()
    await waitFor(() => (team().get(LEGACY_KEY, { skipCache: true }).easy || []).length === 0, 'den gamle række uden id skal slettes')
    assert.equal(team().get(LEGACY_KEY, { skipCache: true }).hard.length, 1)
    step('En gammel række uden id kan slettes enkeltvis')

    await legacy.getByRole('button', { name: 'Slet alle gamle highscores' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Slet alle gamle highscores' }).click()
    await waitFor(() => {
      const board = team().get(LEGACY_KEY, { skipCache: true })
      return Object.values(board).every(list => Array.isArray(list) && list.length === 0)
    }, 'alle gamle highscores skal slettes')
    assert.ok(team().get(NEW_KEY, { skipCache: true }).easy.some(entry => entry.email === PLAYER), 'den nye tavle må ikke røres')
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
