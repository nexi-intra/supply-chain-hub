const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const PASSWORD = 'Local-verification-only'
const PLAYER = 'player@example.test'

async function waitFor(check, message, timeoutMs = 15000) {
  const started = Date.now()
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() - started > timeoutMs) throw new Error(`Timeout: ${message}`)
    await new Promise(resolve => setTimeout(resolve, 150))
  }
}

async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-cube-basher-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  const shots = process.env.CUBE_SHOTS || path.join(temporary, 'screenshots')
  await fs.mkdir(profile, { recursive: true })
  await fs.mkdir(shots, { recursive: true })
  registry.writeTeams(root, { a: { name: 'Verification Operations', folderName: 'OPS', createdAt: new Date().toISOString() } })
  registry.writeUserDirectory(root, { [PLAYER]: 'a' })
  createStore(path.join(root, 'OPS')).set('users', {
    [PLAYER]: { email: PLAYER, fullName: 'Verification Player', password: PASSWORD, status: 'approved', role: 'user' },
  })

  const environment = { ...process.env, ELECTRON_START_URL: process.env.CUBE_VERIFY_URL || 'http://127.0.0.1:5019', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE
  const step = name => console.log(`  ok - ${name}`)
  let application
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile)
    const page = await application.firstWindow()
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error' && !/fonts\.g/.test(message.text())) errors.push(message.text()) })
    await page.waitForFunction(() => !!window.electronAuth)

    await page.locator('#email').fill(PLAYER)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('form button[type="submit"]').click()
    await page.getByText(/^Spil\s*Hj[o\u00f8]rnet$/i).first().click({ timeout: 30000 })
    await page.getByText('Modern', { exact: true }).first().click()
    const card = page.getByText('Cube Basher', { exact: true }).first()
    await card.waitFor()
    assert.match(await page.locator('main, body').first().innerText(), /udvikl dem til super-v\u00e5ben/)
    await card.click()

    const iframe = page.locator('iframe[title="Cube Basher"]')
    await iframe.waitFor()
    assert.match(await iframe.getAttribute('src'), /cube-basher\/index\.html\?lang=da$/)
    const frame = await (await iframe.elementHandle()).contentFrame()
    await frame.waitForFunction(() => !!window.BB, null, { timeout: 30000 })
    await frame.evaluate(() => { window.__cbErrors = []; addEventListener('error', e => window.__cbErrors.push(e.message)) })
    assert.equal(await frame.evaluate(() => window.BB.LANG), 'da')
    assert.equal(await frame.locator('#startBtn').innerText(), 'BANK L\u00d8S!')
    assert.match(await frame.locator('#menuBest').innerText(), /Ingen rekord endnu/)
    assert.equal(await frame.locator('.charCard').count(), 3)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(shots, '01-menu.png') })
    step('Modern-kortet beskriver det nye indhold, spillet får sproget fra hubben og menuen er på dansk')

    await frame.locator('#startBtn').click()
    await waitFor(() => frame.evaluate(() => window.BB.G.state === 'play'), 'spillet starter')
    assert.match(await frame.locator('#phase').innerText(), /Daggry/)
    assert.equal(await frame.locator('#weaponTray .wslot').count(), 1)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(shots, '02-dawn.png') })
    step('Runden starter ved daggry med HUD, v\u00e5benbakke og helt')

    await frame.evaluate(() => window.BB.gainXP(30))
    await waitFor(() => frame.evaluate(() => window.BB.G.state === 'levelup'), 'niveau op-sk\u00e6rmen')
    assert.equal(await frame.locator('#cardRow .upCard').count(), 3)
    assert.match(await frame.locator('#lvluptitle').innerText(), /NIVEAU OP/)
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(shots, '03-levelup.png') })
    while (await frame.evaluate(() => window.BB.G.state === 'levelup')) {
      await frame.locator('#cardRow .upCard').first().click()
      await page.waitForTimeout(150)
    }
    step('Niveau op viser tre kort p\u00e5 dansk, og et valg forts\u00e6tter spillet')

    await frame.evaluate(() => {
      const { P, G } = window.BB
      P.xp = 0; P.xpNext = 1e9
      P.weapons.hammer = 8
      P.passives.dmg = (P.passives.dmg || 0) + 1
      G.pendingLevelups = 1
      window.BB.showLevelup()
    })
    await waitFor(() => frame.evaluate(() => window.BB.G.state === 'levelup'), 'evolutionskortet')
    const evolution = frame.locator('#cardRow .upCard').first()
    assert.match(await evolution.getAttribute('class'), /evolution/)
    assert.match(await evolution.innerText(), /Jordsk\u00e6lvshammer/)
    await page.waitForTimeout(450)
    await page.screenshot({ path: path.join(shots, '04-evolution-card.png') })
    await evolution.click()
    await waitFor(() => frame.evaluate(() => window.BB.G.state === 'play'), 'spillet forts\u00e6tter efter evolution')
    assert.equal(await frame.evaluate(() => window.BB.P.evolved.hammer), true)
    assert.equal(await frame.locator('#weaponTray .wslot.evolved').count(), 1)
    step('Max-v\u00e5ben + partner-passiv giver et gyldent evolutionskort, og hammeren bliver til Jordsk\u00e6lvshammer')

    await frame.evaluate(() => window.BB.dropChest(window.BB.P.pos, true))
    await waitFor(() => frame.evaluate(() => window.BB.G.state === 'chest'), 'kisten \u00e5bnes')
    assert.match(await frame.locator('#chestTitle').innerText(), /BOSSENS SKAT/)
    assert.ok(await frame.locator('#chestRow .upCard').count() >= 1, 'kisten skal indeholde mindst \u00e9n ting')
    assert.match(await frame.locator('#chestGold').innerText(), /guld/)
    await page.waitForTimeout(900)
    await page.screenshot({ path: path.join(shots, '05-chest.png') })
    await frame.locator('#chestBtn').click()
    await waitFor(() => frame.evaluate(() => window.BB.G.state === 'play'), 'spillet forts\u00e6tter efter kisten')
    step('En kiste samles op, viser indhold og guld p\u00e5 dansk og lukkes igen')

    await frame.evaluate(() => {
      const { P, G } = window.BB
      P.weapons = { hammer: 8, chain: 8, blades: 8, poison: 8, meteor: 8 }
      P.evolved = { hammer: true, blades: true }
      P.maxhp = 5000; P.hp = 5000
      P.xp = 0; P.xpNext = 1e9 // no level-up screens pausing the event checks below
      G.pendingLevelups = 0
      window.BB.syncOrbs()
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2
        window.BB.spawnEnemy(i % 3 === 0 ? 'bomber' : i % 3 === 1 ? 'armored' : 'blinker', { x: P.pos.x + Math.cos(a) * 9, z: P.pos.z + Math.sin(a) * 9 }, true)
      }
    })
    const fxSeen = { blade: false, puddles: false, meteors: false }
    const killsBefore = await frame.evaluate(() => window.BB.G.kills)
    for (let i = 0; i < 30; i++) {
      const fx = await frame.evaluate(() => window.BB.fx())
      if (fx.projectiles.includes('blade')) fxSeen.blade = true
      if (fx.puddles) fxSeen.puddles = true
      if (fx.meteors) fxSeen.meteors = true
      if (i === 8) await page.screenshot({ path: path.join(shots, '06-new-weapons.png') })
      await page.waitForTimeout(150)
      await frame.evaluate(() => { if (window.BB.G.state === 'levelup' || window.BB.G.state === 'chest') { window.BB.G.pendingLevelups = 0; window.BB.G.pendingChests = []; document.querySelectorAll('.screen').forEach(s => { if (s.id !== 'menu') s.style.display = 'none' }); window.BB.G.state = 'play' } })
    }
    assert.deepEqual(fxSeen, { blade: true, puddles: true, meteors: true })
    assert.ok(await frame.evaluate(() => window.BB.G.kills) > killsBefore, 'de nye v\u00e5ben skal dr\u00e6be terninger')
    const seen = await frame.evaluate(() => [...window.BB.G.seenTypes].sort())
    assert.deepEqual(seen, ['armored', 'blinker', 'bomber'])
    step('Savklinger, giftsky og meteor virker; bombe-, panser- og blinkterninger dukker op og bliver introduceret')

    const added = await frame.evaluate(() => {
      const before = window.BB.enemies.length
      window.BB.startEvent('swarm')
      return window.BB.enemies.length - before
    })
    assert.ok(added >= 24, `sv\u00e6rmen skal omringe spilleren (${added})`)
    await waitFor(async () => /SV\u00c6RM/.test(await frame.locator('#eventPill').innerText()), 'event-pillen viser sv\u00e6rmen')
    await frame.evaluate(() => { window.BB.G.event.left = 0 })
    await waitFor(() => frame.evaluate(() => !window.BB.G.event), 'sv\u00e6rmen slutter')
    await frame.evaluate(() => {
      const { G, R } = window.BB
      for (const bossTime of R.BOSS_TIMES) G.bossSpawned[bossTime] = true
      G.t = 1700
      window.BB.startEvent('bloodmoon')
    })
    await waitFor(async () => /Nat/.test(await frame.locator('#phase').innerText()), 'natten falder p\u00e5')
    assert.match(await frame.locator('#eventPill').innerText(), /BLODM\u00c5NE/)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(shots, '07-night-bloodmoon.png') })
    await frame.evaluate(() => { window.BB.G.event.left = 0 })
    await frame.evaluate(() => window.BB.startEvent('meteor'))
    await waitFor(() => frame.evaluate(() => window.BB.fx().meteors > 0), 'meteorregn falder')
    step('Events: sv\u00e6rm omringer, blodm\u00e5ne om natten, meteorregn; d\u00f8gnfasen skifter til Nat')

    await frame.evaluate(() => {
      const { G, P } = window.BB
      G.event = null
      window.BB.applyChoice({ kind: 'passive', id: 'revive' })
      P.invuln = 0
      window.BB.hurtPlayer(P.hp + 50)
    })
    const revived = await frame.evaluate(() => ({ state: window.BB.G.state, hp: window.BB.P.hp, max: window.BB.P.maxhp, revives: window.BB.P.revives }))
    assert.equal(revived.state, 'play')
    assert.equal(revived.revives, 0)
    assert.ok(Math.abs(revived.hp - revived.max / 2) < 1, `genopst\u00e5et med halvt liv: ${JSON.stringify(revived)}`)
    await frame.evaluate(() => window.BB.hurtPlayer(window.BB.P.hp + 50))
    await waitFor(() => frame.evaluate(() => window.BB.G.state === 'dead'), 'runden slutter')
    assert.match(await frame.locator('#deadTitle').innerText(), /DU BLEV BANKET/)
    assert.match(await frame.locator('#deadRecord').innerText(), /NY REKORD/)
    assert.equal(await frame.locator('#deadStats .endStat').count(), 6)
    const best = await frame.evaluate(() => JSON.parse(localStorage.getItem('cubebasher_v1')).best)
    assert.ok(best && best.time >= 1700, `rekorden gemmes: ${JSON.stringify(best)}`)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(shots, '08-dead.png') })
    step('Skytsengel genopliver \u00e9n gang; derefter slutter runden med ny rekord, der gemmes')

    await frame.locator('#deadShopBtn').click()
    assert.match(await frame.locator('#shopTitle').innerText(), /OPGRADERINGS-LAB/)
    assert.match(await frame.locator('#shopGrid').innerText(), /Kraft/)
    await page.screenshot({ path: path.join(shots, '09-shop.png') })
    step('Opgraderings-lab er p\u00e5 dansk')

    const frameErrors = await frame.evaluate(() => window.__cbErrors)
    assert.deepEqual(frameErrors, [], `fejl i spillet: ${frameErrors.join(' | ')}`)
    assert.deepEqual(errors, [], `fejl i appen: ${errors.join(' | ')}`)
    console.log(`PASS: Cube Basher redesign verificeret. Sk\u00e6rmbilleder: ${shots}`)
  } finally {
    if (application) await application.close()
    if (!process.env.CUBE_SHOTS) await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    else await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {})
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
