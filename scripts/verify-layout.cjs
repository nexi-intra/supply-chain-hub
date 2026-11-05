// Tegning af lageret in the Hub on a temporary platform (manager chef@example.test, employee anna@example.test); M: is
// never touched. `--open` signs the manager in and leaves the window open for manual checks; without flags a smoke flow
// runs the whole Phase 1 flow (draw, reconcile, publish, rename with a pallet, employee locked out) and the Phase 2 map flow
// ("Kort over lageret" for the employee: search a material, the rack front, "Vis på kort") with fixed assertions and
// leaves screenshots in the evidence folder. Prints "ALLE TJEK OK" at the end; any failed check exits with code 1.
// Needs Vite:  npm run dev -- --host 127.0.0.1 --port 5066 --strictPort   then  WAREHOUSE_VERIFY_URL=http://127.0.0.1:5066 node scripts/verify-layout.cjs [--open]
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const ROOT = path.join(__dirname, '..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-layout-'))
const root = path.join(work, 'data')
const evidence = path.join(work, 'evidence')
const placements = path.join(work, 'placeringer')
fs.mkdirSync(evidence, { recursive: true })
fs.mkdirSync(placements, { recursive: true })
const PASSWORD = 'Local-verification-only'
const SPIKE_FILE = path.join(ROOT, 'plans', 'lager-tegning-tcd.json')
const CANVAS = 'svg[aria-label="Tegning af lageret"]'

function makePlatform() {
  const createdAt = new Date().toISOString()
  registry.writeTeams(root, { TCD: { name: 'Terminal Configuration & Dispatch', folderName: 'TCD', createdAt } })
  registry.writeUserDirectory(root, { 'chef@example.test': 'TCD', 'anna@example.test': 'TCD' })
  createStore(path.join(root, 'TCD')).set('users', {
    'chef@example.test': { email: 'chef@example.test', fullName: 'Chef Christensen', password: PASSWORD, status: 'approved', role: 'manager' },
    'anna@example.test': { email: 'anna@example.test', fullName: 'Anna Andersen', password: PASSWORD, status: 'approved', role: 'user' },
  })
}

async function launch(name) {
  const env = {
    ...process.env,
    ELECTRON_START_URL: process.env.WAREHOUSE_VERIFY_URL || 'http://127.0.0.1:5064',
    TCD_HUB_DATA_DIR: root,
    TCD_HUB_USER_DATA_DIR: path.join(work, `profile-${name}`),
    TCD_HUB_SAP_SYSTEM: 'PS4',
    TCD_HUB_SAP_FIXTURES_DIR: path.join(ROOT, 'electron', 'warehouse', 'fixtures', 'sap'),
    TCD_HUB_PLACEMENTS_DIR: placements,
  }
  delete env.ELECTRON_RUN_AS_NODE
  // A window behind others still paints, so screenshots do not wait forever while someone works on the PC.
  const paint = ['--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
  const app = await _electron.launch({ executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [...paint, '.'], cwd: ROOT, env })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 920 }).catch(() => {})
  await page.waitForFunction(() => !!window.electronAuth && !!window.electronWarehouse)
  return { app, page }
}

async function signIn(page, email) {
  await page.evaluate(() => window.electronAuth.logout().catch(() => {}))
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => !!window.electronAuth && !!window.electronWarehouse)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await page.getByText('Forbedringer og forslag', { exact: true }).waitFor({ timeout: 30000 })
  await closeWhatsNew(page)
}

async function closeWhatsNew(page) {
  const whatsNew = page.getByRole('dialog', { name: /Nyheder i Supply Chain Hub/ })
  if (await whatsNew.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
    await page.keyboard.press('Escape')
    await whatsNew.waitFor({ state: 'detached' })
  }
}

const shot = (page, name) => page.screenshot({ path: path.join(evidence, `${name}.jpg`), type: 'jpeg', quality: 80 })
/** The rack front and its panel, clipped from the page so it never waits for the element to stop moving. */
async function frontShot(page, name) {
  const panel = page.getByTestId('rack-front').locator('..')
  await panel.evaluate(element => element.scrollIntoView({ block: 'nearest' }))
  const box = await panel.boundingBox()
  const view = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  const x = Math.max(0, box.x)
  const y = Math.max(0, box.y)
  const clip = { x, y, width: Math.min(box.x + box.width, view.width) - x, height: Math.min(box.y + box.height, view.height) - y }
  await page.screenshot({ path: path.join(evidence, `${name}.jpg`), type: 'jpeg', quality: 85, clip, animations: 'disabled' })
}
const api = (page, method, request) => page.evaluate(([name, payload]) => window.electronWarehouse.locations[name](payload).then(result => ({ ok: true, result }), error => ({ ok: false, error: String(error.message) })), [method, request])
const status = page => page.getByTestId('layout-status')

/** Lagerstyring → Placeringer → Administrér placeringer → Tegning af lageret. */
async function openEditor(page) {
  await page.getByText('Lagerstyring', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Placeringer', exact: true }).click({ timeout: 30000 })
  await page.getByLabel('Søg i placeringer').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: /^(Administrér placeringer|Opret placeringer)$/ }).first().click()
  await page.getByRole('button', { name: 'Tegning af lageret' }).click({ timeout: 30000 })
  await page.getByRole('heading', { name: 'Tegning af lageret' }).waitFor({ timeout: 30000 })
  await status(page).waitFor({ timeout: 30000 })
}

/** Waits for the autosave after a change. */
async function autosaved(page) {
  await page.waitForFunction(() => /Kladde gemt/.test(document.querySelector('[data-testid="layout-status"]')?.textContent || ''), null, { timeout: 15000 })
}

/** Screen position of a cell (x, y in hall units) on the drawing. */
async function cellPoint(page, x, y) {
  return page.evaluate(([cx, cy, selector]) => {
    const svg = document.querySelector(selector)
    const point = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM())
    return { x: point.x, y: point.y }
  }, [x, y, CANVAS])
}

const draftItem = async (page, id) => (await api(page, 'layoutDraft')).result.draft.items.find(item => item.id === id)

async function smoke(page) {
  await signIn(page, 'chef@example.test')
  await openEditor(page)
  await page.getByTestId('layout-editor').getByText(/^· Redigeres af Chef Christensen siden \d\d[:.]\d\d$/).waitFor({ timeout: 15000 })
  await shot(page, '01-editor-tom')
  console.log('ok - Placeringer → Administrér placeringer → Tegning af lageret åbner editoren med en ny kladde; overskriften viser "Redigeres af Chef Christensen siden hh:mm"')

  const spike = JSON.parse(fs.readFileSync(SPIKE_FILE, 'utf8'))
  await page.locator('input[type="file"]').setInputFiles(SPIKE_FILE)
  await page.getByRole('button', { name: 'Erstat', exact: true }).click({ timeout: 15000 })
  await autosaved(page)
  const loaded = (await api(page, 'layoutDraft')).result.draft
  assert.equal(loaded.items.length, spike.items.length)
  await shot(page, '02-hentet-fra-fil')
  console.log(`ok - lager-tegning-tcd.json hentet og autogemt (${loaded.items.length} ting)`)

  // Zoom 200 % for a close look at bay lines, names and hatching.
  await page.getByLabel('Zoom').selectOption('2')
  await page.waitForTimeout(300)
  await page.locator(CANVAS).locator('..').screenshot({ path: path.join(evidence, '03-zoom-200.jpg'), type: 'jpeg', quality: 85 })
  await page.getByLabel('Zoom').selectOption('1')

  const rack = loaded.items.find(item => item.type === 'rack' && item.name === 'C')
  const centre = await cellPoint(page, rack.x + rack.w / 2, rack.y + rack.h / 2)
  const target = await cellPoint(page, rack.x + rack.w / 2 + 3, rack.y + rack.h / 2 + 4)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move((centre.x + target.x) / 2, (centre.y + target.y) / 2, { steps: 5 })
  await page.mouse.move(target.x, target.y, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('heading', { name: 'Pallereol (række)' }).waitFor()
  await page.keyboard.press('r')
  await page.keyboard.press('Control+c')
  const pasteAt = await cellPoint(page, 52.5, 30.5)
  await page.mouse.move(pasteAt.x, pasteAt.y)
  await page.keyboard.press('Control+v')
  await autosaved(page)
  const moved = await draftItem(page, rack.id)
  const afterPaste = (await api(page, 'layoutDraft')).result.draft
  await shot(page, '04-flyttet-roteret-kopieret')
  assert.equal(afterPaste.items.length, loaded.items.length + 1, 'the copy is in the draft')
  assert.deepEqual([moved.w, moved.h], [rack.h, rack.w], 'the rack is turned')
  console.log(`ok - reol C flyttet (${rack.x},${rack.y} → ${moved.x},${moved.y} efter rotation), roteret med R og kopieret med Ctrl+C / Ctrl+V`)

  await page.keyboard.press('Control+z')
  await autosaved(page)
  const afterUndo = (await api(page, 'layoutDraft')).result.draft
  assert.equal(afterUndo.items.length, loaded.items.length, 'Ctrl+Z takes the copy away')
  await shot(page, '05-fortrudt')
  console.log('ok - Ctrl+Z fjerner kopien igen')

  await page.reload()
  await page.waitForFunction(() => !!window.electronAuth && !!window.electronWarehouse)
  await page.getByText('Forbedringer og forslag', { exact: true }).waitFor({ timeout: 30000 })
  await closeWhatsNew(page)
  await openEditor(page)
  const reloaded = (await api(page, 'layoutDraft')).result.draft
  assert.equal(reloaded.items.length, afterUndo.items.length)
  assert.deepEqual(reloaded.items.find(item => item.id === rack.id), afterUndo.items.find(item => item.id === rack.id))
  await page.locator(`[data-item="${rack.id}"]`).first().waitFor()
  await shot(page, '06-efter-genindlaes')
  console.log('ok - efter genindlæsning er kladden der stadig (samme ting, reol C som før)')
}

/** Selects an item by clicking on it, with the floor filter set so nothing upstairs is on top. */
async function selectItem(page, item, at = { x: item.x + item.w / 2, y: item.y + item.h / 2 }) {
  await page.getByLabel('Vis etage').selectOption(item.floor === 'mezz' ? 'mezz' : 'ground')
  const point = await cellPoint(page, at.x, at.y)
  await page.mouse.click(point.x, point.y)
  await page.waitForFunction(no => document.querySelector('#item-firstNo')?.value === no, String(item.firstNo))
  await page.getByTestId('rack-front').waitFor()
  await page.getByLabel('Vis etage').selectOption('all')
}

const slotIn = (item, test) => item.slots.find(test)
const front = page => page.getByTestId('rack-front')
const slotButton = (page, id) => page.locator(`[data-slot="${id}"]`)
const nameOf = async (page, itemId, slotId) => slotIn(await draftItem(page, itemId), slot => slot.id === slotId).name

/** One plain click on a slot = its next kind. */
async function clickSlot(page, id) {
  await slotButton(page, id).click()
  // Longer than a double-click, so the next click counts as a new single click.
  await page.waitForTimeout(700)
}

async function rackFront(page) {
  const draft = (await api(page, 'layoutDraft')).result.draft
  const s = draft.items.find(item => item.type === 'rack' && item.name === 'S' && item.firstNo === 31)
  assert.ok(s, 'the S rack (S31–S40) is in the drawing')
  await selectItem(page, s, { x: s.x + s.w / 2, y: s.y + 1.5 })
  await page.locator('#item-level-new').selectOption('1')
  await page.getByRole('button', { name: 'Mønster for niveau', exact: true }).click()
  await page.locator('#item-level-pattern-1').fill('{reol}{fag} GULV')
  await page.locator('#item-level-pattern-1').press('Enter')
  await page.locator('#item-level-new').selectOption('2')
  await page.getByRole('button', { name: 'Mønster for niveau', exact: true }).click()
  await page.locator('#item-level-pattern-2').fill('{reol}{fag}')
  await page.locator('#item-level-pattern-2').press('Enter')
  await autosaved(page)
  const named = await draftItem(page, s.id)
  const bay31 = level => slotIn(named, slot => slot.pos != null && slot.level === level && slot.name.startsWith('S31')).name
  assert.deepEqual(named.levelPatterns, { 1: '{reol}{fag} GULV', 2: '{reol}{fag}' })
  assert.deepEqual([bay31(1), bay31(2)], ['S31 GULV', 'S31'])
  await front(page).getByText('GULV').first().waitFor()
  await frontShot(page, '08-s-reol-niveau-moenstre')
  console.log(`ok - S-reolens niveau-mønstre: niveau 1 hedder ${bay31(1)}, niveau 2 ${bay31(2)}`)

  const p = draft.items.find(item => item.type === 'rack' && item.name.toUpperCase() === 'P' && item.firstNo === 22)
  assert.ok(p, 'the P rack with bay 22 is in the drawing')
  await selectItem(page, p)
  const bay = (await draftItem(page, p.id)).slots.filter(slot => slot.pos === 1 && slot.level != null).sort((a, b) => a.level - b.level)
  const [l1, , l3, l4] = bay.map(slot => slot.id)
  const kinds = async () => (await draftItem(page, p.id)).slots.filter(slot => slot.pos === 1 && slot.level != null).sort((a, b) => a.level - b.level).map(slot => `${slot.kind}:${slot.name}`)
  const before = await kinds()
  console.log(`   P22 i tegningen: ${before.join(' | ')}`)
  // Bring level 1 to a pallet place, so level 3 is P22.2; then pick without a name makes it P22.1 again.
  for (let i = 0; i < 6 && (await kinds())[0].split(':')[0] !== 'pallet'; i++) { await clickSlot(page, l1); await autosaved(page) }
  assert.deepEqual((await kinds()).slice(0, 3).map(x => x.split(':')[0]), ['pallet', 'blocked', 'pallet'])
  assert.equal(await nameOf(page, p.id, l3), `${p.name}22.2`)
  await frontShot(page, '09-p22-niveau1-palle')
  await clickSlot(page, l1)
  await clickSlot(page, l1)
  await autosaved(page)
  assert.deepEqual((await kinds())[0], 'pick-unnamed:')
  assert.equal(await nameOf(page, p.id, l3), `${p.name}22.1`)
  assert.match(await slotButton(page, l1).getAttribute('title'), /Pluk under p22/i)
  await frontShot(page, '10-p22-pluk-uden-navn')
  console.log(`ok - P22 niveau 1 → pluk uden navn: ${p.name}22.2 bliver ${p.name}22.1 (${(await kinds()).join(' | ')})`)

  const kindOf = async id => slotIn(await draftItem(page, p.id), slot => slot.id === id).kind
  await slotButton(page, l4).dblclick()
  await front(page).getByLabel('Pladsens navn').fill(`${p.name}22.1`)
  await front(page).getByLabel('Pladsens navn').press('Enter')
  await autosaved(page)
  assert.equal(await nameOf(page, p.id, l4), `${p.name}22.1`)
  assert.equal(await kindOf(l4), 'pallet')
  for (const id of [l3, l4]) assert.match(await slotButton(page, id).getAttribute('style'), /2px solid (rgb\(220, 38, 38\)|#dc2626)/)
  await page.getByText(/navne bruges to gange/).waitFor()
  await frontShot(page, '11-dublet-roed')
  console.log('ok - dobbeltklik retter navnet; to ens navne har rød kant')

  // A slow double-click: the first click's kind change has already happened when the second click lands.
  const l3Before = slotIn(await draftItem(page, p.id), slot => slot.id === l3)
  const box = await slotButton(page, l3).boundingBox()
  const kindShown = async () => (await slotButton(page, l3).getAttribute('title')).split(' – ')[1]
  const shownBefore = await kindShown()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(650)
  assert.notEqual(await kindShown(), shownBefore, 'the first click has changed the kind before the second click')
  await page.mouse.down({ clickCount: 2 }); await page.mouse.up({ clickCount: 2 })
  await front(page).getByLabel('Pladsens navn').fill(`${p.name}22 TOP`)
  await front(page).getByLabel('Pladsens navn').press('Enter')
  await autosaved(page)
  assert.deepEqual([await kindOf(l3), await nameOf(page, p.id, l3)], [l3Before.kind, `${p.name}22 TOP`])
  assert.equal(await kindShown(), shownBefore)
  console.log(`ok - langsomt dobbeltklik retter navnet uden at skifte slags (${l3Before.kind} bliver ${l3Before.kind})`)

  // A wanted kind change, then a double-click within 1 s of it to rename: the kind change stays.
  const l3Kept = slotIn(await draftItem(page, p.id), slot => slot.id === l3)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(650)
  const shownCycled = await kindShown()
  assert.notEqual(shownCycled, shownBefore, 'the single click changed the kind')
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await front(page).getByLabel('Pladsens navn').fill(`${p.name}22 OP`)
  await front(page).getByLabel('Pladsens navn').press('Enter')
  await autosaved(page)
  const l3After = slotIn(await draftItem(page, p.id), slot => slot.id === l3)
  assert.equal(l3After.name, `${p.name}22 OP`)
  assert.equal(await kindShown(), shownCycled, 'the wanted kind change is kept')
  assert.notDeepEqual([l3After.kind, l3After.purpose], [l3Kept.kind, l3Kept.purpose])
  console.log(`ok - klik skifter slags, dobbeltklik lige efter retter navnet og beholder den nye slags (${shownBefore} → ${shownCycled})`)

  await page.getByRole('button', { name: 'Navngiv igen', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: /Navngiv .* igen\?/ })
  await confirm.waitFor()
  await confirm.getByText('(rettet i hånden)').first().waitFor()
  await shot(page, '12-navngiv-igen-bekraeft')
  await confirm.getByRole('button', { name: 'Navngiv igen', exact: true }).click()
  await autosaved(page)
  const reset = slotIn(await draftItem(page, p.id), slot => slot.id === l4)
  assert.deepEqual([reset.name, reset.manual], [`${p.name}22.2`, undefined])
  console.log('ok - Navngiv igen spørger først og giver den håndrettede plads mønsterets navn igen')

  await slotButton(page, l3).click({ modifiers: ['Shift'] })
  await slotButton(page, l4).click({ modifiers: ['Shift'] })
  await front(page).getByText('2 valgt').waitFor()
  await front(page).getByRole('button', { name: 'Giv navne efter mønster …' }).click()
  const ask = page.getByRole('dialog', { name: /Giv 2 pladser navne/ })
  await ask.getByLabel('Mønster', { exact: true }).fill(`{reol}{fag}-{niveau} ${'X'.repeat(30)}`)
  await ask.getByTestId('pattern-too-long').getByText('2 navne bliver længere end 30 tegn').waitFor()
  await ask.getByLabel('Mønster', { exact: true }).fill('{reol}{fag}-{niveau}')
  assert.equal(await ask.getByTestId('pattern-too-long').count(), 0)
  console.log('ok - mønster-dialogen advarer, når et navn bliver længere end 30 tegn')
  await ask.getByRole('button', { name: 'Giv navne', exact: true }).click()
  await autosaved(page)
  assert.deepEqual([await nameOf(page, p.id, l3), await nameOf(page, p.id, l4)], [`${p.name}22-3`, `${p.name}22-4`])
  await frontShot(page, '13-moenster-paa-valgte')
  await shot(page, '14-editor-med-reolen-forfra')
  console.log('ok - Shift-klik vælger to pladser; "Giv navne efter mønster" giver dem navne')
}

/** Leaving while an autosave is on its way still saves the edit made after it was sent. */
async function leaveDuringSave(app, page) {
  const before = (await api(page, 'layoutDraft')).result.draft
  const rack = before.items.find(item => item.type === 'rack' && item.name === 'C')
  // Saves take 4 s in the main process, so the leave lands while the first one is in flight. Each save's item count is logged.
  const slowed = await app.evaluate(({ ipcMain }, ms) => {
    const handlers = ipcMain._invokeHandlers
    const channel = 'warehouse:locations:layout-save-draft'
    const original = handlers?.get(channel)
    if (!original) return false
    globalThis.__layoutSave = original
    globalThis.__layoutSaves = []
    globalThis.__layoutResults = []
    handlers.set(channel, async (...args) => {
      globalThis.__layoutSaves.push(args[1]?.draft?.items?.length)
      if (globalThis.__layoutSaves.length === 1) await new Promise(resolve => setTimeout(resolve, ms))
      try {
        const result = await original(...args)
        globalThis.__layoutResults.push(JSON.stringify(result)?.slice(0, 200))
        return result
      } catch (error) {
        globalThis.__layoutResults.push(`${error.code || ''} ${error.message}`)
        throw error
      }
    })
    return true
  }, 4000)
  assert.ok(slowed, 'the save handler could be slowed down')
  let target
  try {
    const centre = await cellPoint(page, rack.x + rack.w / 2, rack.y + rack.h / 2)
    // Whatever is drawn on top at C's centre gets selected; that item is rotated and then deleted.
    target = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-item]')?.getAttribute('data-item'), [centre.x, centre.y])
    assert.ok(target, 'an item is under the pointer')
    await page.mouse.click(centre.x, centre.y)
    await page.keyboard.press('r')
    await page.waitForFunction(() => /Gemmer/.test(document.querySelector('[data-testid="layout-status"]')?.textContent || ''), null, { timeout: 15000 })
    await page.keyboard.press('Delete')
    assert.equal(await page.locator(`[data-item="${target}"]`).count(), 0, 'the item is deleted in the editor while the save is in flight')
    await page.keyboard.press('Escape')
    await page.getByRole('heading', { name: 'Tegning af lageret' }).waitFor({ state: 'detached', timeout: 5000 })
    // Re-opening reads the draft, so the leave-save must have been answered first (not only seen in a read).
    const answered = async () => (await app.evaluate(() => globalThis.__layoutResults.length)) >= 2
    const deadline = Date.now() + 60000
    while (!(await answered()) && Date.now() < deadline) await page.waitForTimeout(500)
    // Give a stray extra save a moment to show up before counting.
    await page.waitForTimeout(2000)
  } finally {
    await app.evaluate(({ ipcMain }) => { ipcMain._invokeHandlers.set('warehouse:locations:layout-save-draft', globalThis.__layoutSave) })
  }
  const saves = await app.evaluate(() => globalThis.__layoutSaves)
  assert.deepEqual(saves, [before.items.length, before.items.length - 1], 'the rotation is saved first, then the delete exactly once')
  await page.getByRole('button', { name: /^(Administrér placeringer|Opret placeringer)$/ }).first().click({ timeout: 30000 })
  await page.getByRole('button', { name: 'Tegning af lageret' }).click({ timeout: 30000 })
  await page.getByRole('heading', { name: 'Tegning af lageret' }).waitFor({ timeout: 30000 })
  const reopened = (await api(page, 'layoutDraft')).result.draft
  assert.equal(reopened.items.length, before.items.length - 1, `the delete made during the autosave is saved (saves answered: ${(await app.evaluate(() => globalThis.__layoutResults)).join(' | ')})`)
  assert.ok(!reopened.items.some(item => item.id === target), 'the deleted item is gone after re-opening')
  assert.equal(await page.locator(`[data-item="${target}"]`).count(), 0)
  await shot(page, '07-forladt-under-gem')
  console.log('ok - forlad mens autogem er i gang: sletningen bagefter er gemt, når editoren åbnes igen')
}

/** Afstemning og udgiv: list places made before any drawing, a small drawing, the reconciliation and the publish. */
async function publishFlow(page) {
  for (const name of ['A1.1', 'A1.2', 'K9.9', 'GAMMEL1', 'K1.1']) {
    const made = await api(page, 'createLocation', { name, type: 'Palle', purpose: 'reserve' })
    assert.ok(made.ok, `${name}: ${made.error}`)
  }
  const put = await api(page, 'putAway', { pallets: [{ location: 'K9.9', material: 'R162-0717', quantity: 10 }, { location: 'A1.1', material: 'R162-0717', quantity: 5 }] })
  assert.ok(put.ok, put.error)

  const slot = (bay, level) => ({ id: `s${bay}${level}`, name: `A${bay}.${level}`, kind: 'pallet', purpose: bay === 3 && level === 1 ? 'pick' : 'reserve', pos: bay, level })
  const rack = { id: 'rack-a', type: 'rack', x: 5, y: 5, w: 6, h: 1, name: 'A', note: '', owner: 'TCD', bays: 3, levels: 2, firstNo: 1, firstBay: 'start', aisles: [], slots: [1, 2, 3].flatMap(bay => [slot(bay, 1), slot(bay, 2)]) }
  const row = { id: 'row-s', type: 'floorrow', x: 5, y: 10, w: 2, h: 4, name: 'S', note: '', owner: 'TCD', count: 1, depth: 2, slots: [{ id: 's0', name: 'S0', kind: 'pallet', purpose: 'reserve', capacity: 2, pos: 1 }] }
  const file = path.join(work, 'lille-tegning.json')
  fs.writeFileSync(file, JSON.stringify({ hall: { w: 40, h: 30 }, notes: '', items: [rack, row], decisions: { outside: [], remove: [] } }))
  await page.locator('input[type="file"]').setInputFiles(file)
  await page.getByRole('button', { name: 'Erstat', exact: true }).click({ timeout: 15000 })
  await autosaved(page)

  const panel = page.getByTestId('publish-panel')
  const outsideRow = name => panel.getByTestId('publish-outside').locator(`[data-place="${name}"]`)
  await page.getByRole('button', { name: 'Udgiv …', exact: true }).click()
  await outsideRow('K9.9').waitFor({ timeout: 30000 })
  await outsideRow('K9.9').getByText('1 palle', { exact: false }).waitFor()
  assert.equal(await outsideRow('K9.9').getByRole('button', { name: 'Nedlæg' }).isDisabled(), true, 'a place with a pallet cannot be removed')
  await outsideRow('K1.1').waitFor()
  const created = panel.getByTestId('publish-create')
  await created.locator('li', { hasText: 'S0' }).waitFor()
  assert.equal(await created.locator('li', { hasText: 'A1.1' }).count(), 0, 'A1.1 is adopted, not created')
  assert.equal(await panel.getByTestId('publish-count-create').locator('div').first().textContent(), '5')
  await shot(page, '15-udgiv-kun-i-listen')
  console.log('ok - "Udgiv …": K9.9 med 1 palle og K1.1 står under "Kun i listen", Nedlæg er slået fra for K9.9; S0 er blandt 5 nye pladser')

  await outsideRow('GAMMEL1').getByRole('button', { name: 'Nedlæg' }).click()
  await panel.getByTestId('publish-remove').getByText('GAMMEL1').waitFor({ timeout: 30000 })
  await outsideRow('K1.1').getByRole('button', { name: 'Uden for tegningen' }).click()
  await outsideRow('K1.1').getByText('Bliver uden for tegningen').waitFor({ timeout: 30000 })
  await created.locator('li', { hasText: 'A2.1' }).getByRole('button', { name: 'Ikke en plads' }).click()
  await panel.getByTestId('publish-count-create').getByText('4', { exact: true }).waitFor({ timeout: 30000 })
  assert.equal(slotIn(await draftItem(page, rack.id), x => x.id === 's21').kind, 'blocked')
  assert.deepEqual((await api(page, 'layoutDraft')).result.draft.decisions.outside, ['K1.1'])
  console.log('ok - GAMMEL1 nedlægges; K1.1 markeres "Uden for tegningen"; "Ikke en plads" spærrer A2.1 (4 nye tilbage)')

  await outsideRow('K9.9').getByRole('button', { name: 'Find på tegningen' }).click()
  await page.getByTestId('layout-picking').getByText('Klik på den plads på tegningen, der skal hedde K9.9').waitFor()
  await selectItem(page, rack)
  await frontShot(page, '16-farver-efter-planen')
  await shot(page, '17-vaelg-plads-banner')
  await slotButton(page, 's32').click()
  await panel.waitFor({ timeout: 15000 })
  await outsideRow('K9.9').waitFor({ state: 'detached', timeout: 30000 })
  assert.equal(await nameOf(page, rack.id, 's32'), 'K9.9')
  await shot(page, '18-k99-fundet')
  console.log('ok - "Find på tegningen" → klik på A3.2 i reolen forfra: sloten hedder nu K9.9, og panelet åbner igen')

  await panel.getByRole('button', { name: 'Udgiv …', exact: true }).click()
  await panel.getByTestId('publish-summary').waitFor()
  await panel.getByTestId('publish-first').getByText('Første udgivelse: herefter oprettes og ændres pladser kun på tegningen.').waitFor()
  await shot(page, '19-bekraeft-udgiv')
  console.log('ok - bekræftelsen af den første udgivelse siger "Første udgivelse: herefter oprettes og ændres pladser kun på tegningen"')
  await panel.getByRole('button', { name: 'Udgiv', exact: true }).click()
  await page.getByText('Tegningen er udgivet (version 1)').waitFor({ timeout: 30000 })
  await page.getByText('Kladde til version 2').waitFor({ timeout: 30000 })
  await shot(page, '20-udgivet')
  const published = (await api(page, 'layout')).result.layout
  assert.equal(published.version, 1)
  assert.deepEqual([published.outside, (await api(page, 'layoutDraft')).result.draft.decisions.outside], [['K1.1'], ['K1.1']])
  console.log('ok - udgivet: toast "Tegningen er udgivet (version 1)", editoren fortsætter på en kladde til version 2, og K1.1 står stadig som "uden for tegningen"')

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Log', exact: true }).click({ timeout: 30000 })
  const line = page.getByText(/Tegningen udgivet \(version 1\)/).first()
  await line.waitFor({ timeout: 30000 })
  await shot(page, '21-log-udgivet')
  console.log(`ok - loggen viser "${await line.textContent()}"`)
  return rack
}

/** After the publish: Administrér placeringer leads to the drawing, and a place on it keeps its physical fields. */
async function adminAfterPublish(page) {
  await page.getByRole('button', { name: 'Placeringer', exact: true }).click({ timeout: 30000 })
  await page.getByRole('button', { name: 'Tegning af lageret' }).waitFor({ timeout: 30000 })
  await shot(page, '22-forside-efter-udgiv')
  await page.getByRole('button', { name: 'Administrér placeringer' }).click({ timeout: 30000 })
  await page.getByText('Pladser oprettes og ændres nu på tegningen').waitFor({ timeout: 30000 })
  for (const name of ['Opret placering', 'Opret serie', 'Opret reol', 'Importér placeringsarket']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0, `${name} is hidden`)
  await page.getByRole('button', { name: 'Tegning af lageret' }).waitFor()
  const row = name => page.locator('tbody tr').filter({ has: page.getByRole('button', { name, exact: true }) })
  await row('K1.1').getByText('ikke på kortet').waitFor()
  assert.equal(await row('A1.1').getByText('ikke på kortet').count(), 0)
  await row('S0').waitFor()
  await row('A3.1').getByText('mangler materiale').waitFor()
  await shot(page, '23-admin-efter-udgiv')
  console.log('ok - Administrér placeringer: ingen Opret/Importér, hint og "Tegning af lageret"; K1.1 "ikke på kortet", S0 oprettet, A3.1 "mangler materiale"')

  await page.getByRole('button', { name: 'Ret A1.1' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ret A1.1' })
  await dialog.getByText('Rettes på tegningen').waitFor()
  assert.deepEqual([await dialog.locator('#loc-name').isDisabled(), await dialog.locator('#loc-type').isDisabled()], [true, true])
  assert.deepEqual(await dialog.locator('#loc-purpose option').evaluateAll(options => options.map(option => option.value)), ['reserve', 'reserved'])
  await dialog.locator('#loc-note').fill('Ved porten')
  await shot(page, '24-ret-linket-plads')
  await dialog.getByRole('button', { name: 'Gem', exact: true }).click()
  await page.getByText('A1.1 er rettet').waitFor({ timeout: 30000 })
  const listed = async name => (await api(page, 'list')).result.locations.find(location => location.name === name)
  assert.equal((await listed('A1.1')).note, 'Ved porten')
  console.log('ok - Ret A1.1 (på tegningen): navn og type er låst med "Rettes på tegningen", noten gemmes')

  await page.getByRole('button', { name: 'Ret A1.2' }).click()
  const second = page.getByRole('dialog', { name: 'Ret A1.2' })
  await second.locator('#loc-purpose').selectOption('reserved')
  await second.getByRole('button', { name: 'Gem', exact: true }).click()
  await page.getByText('A1.2 er rettet').waitFor({ timeout: 30000 })
  assert.equal((await listed('A1.2')).purpose, 'reserved')
  await page.getByRole('button', { name: 'Ret A1.2' }).click()
  // The drawing's purpose is read when the dialog opens; until then only Reserveret is offered.
  await page.getByRole('dialog', { name: 'Ret A1.2' }).locator('#loc-purpose option').nth(1).waitFor({ state: 'attached', timeout: 15000 })
  assert.deepEqual(await page.getByRole('dialog', { name: 'Ret A1.2' }).locator('#loc-purpose option').evaluateAll(options => options.map(option => option.value)), ['reserved', 'reserve'])
  await shot(page, '25-reserveret-tilbage')
  await page.keyboard.press('Escape')
  console.log('ok - A1.2 kan sættes til reserveret og tilbage kun til tegningens Reserve')
}

/** The place follows the drawing: slot A1.1 (with a pallet) is renamed to A1.9 and published as version 2. */
async function renameFollows(page, rack) {
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 15000 })
  await page.getByRole('button', { name: 'Tegning af lageret' }).click({ timeout: 30000 })
  await page.getByRole('heading', { name: 'Tegning af lageret' }).waitFor({ timeout: 30000 })
  await page.getByText('Kladde til version 2').waitFor({ timeout: 30000 })

  // The same admin saves the draft on another PC meanwhile: this editor's next save is refused, and it fetches the stored draft.
  const stored = (await api(page, 'layoutDraft')).result.draft
  const other = await api(page, 'saveLayoutDraft', { draft: { ...stored, notes: 'Fra den anden pc' } })
  assert.ok(other.ok, other.error)
  assert.equal(other.result.rev, stored.rev + 1)
  await page.locator('#hall-w').fill(String(stored.hall.w + 1))
  await page.locator('#hall-w').press('Enter')
  await page.getByTestId('layout-stale').getByText(/Kladden er gemt et andet sted imens – hent den nye/).waitFor({ timeout: 15000 })
  assert.equal((await api(page, 'layoutDraft')).result.draft.hall.w, stored.hall.w, 'the stale save wrote nothing')
  await shot(page, '26a-kladde-gemt-andet-sted')
  await page.getByRole('button', { name: 'Hent den nye kladde', exact: true }).click()
  await page.getByTestId('layout-stale').waitFor({ state: 'detached', timeout: 15000 })
  assert.equal(await page.locator('#hall-w').inputValue(), String(stored.hall.w))
  assert.equal((await api(page, 'layoutDraft')).result.draft.notes, 'Fra den anden pc')
  console.log('ok - kladden gemt på en anden pc imens: næste autogem afvises ("Kladden er gemt et andet sted imens"), og "Hent den nye kladde" henter den gemte')

  await selectItem(page, rack)
  await slotButton(page, 's11').dblclick()
  await front(page).getByLabel('Pladsens navn').fill('A1.9')
  await front(page).getByLabel('Pladsens navn').press('Enter')
  await autosaved(page)
  const renamed = slotIn(await draftItem(page, rack.id), slot => slot.id === 's11')
  assert.deepEqual([renamed.name, renamed.kind], ['A1.9', 'pallet'])
  await frontShot(page, '26-a11-omdoebt-til-a19')

  const panel = page.getByTestId('publish-panel')
  await page.getByRole('button', { name: 'Udgiv …', exact: true }).click()
  const renameRow = panel.getByTestId('publish-rename').locator('li', { hasText: 'A1.1 → A1.9' })
  await renameRow.waitFor({ timeout: 30000 })
  await renameRow.getByText('1 palle').waitFor()
  assert.equal(await panel.getByTestId('publish-count-rename').locator('div').first().textContent(), '1')
  assert.equal(await panel.getByTestId('publish-count-blocked').locator('div').first().textContent(), '0')
  await shot(page, '27-udgiv-omdoeb')
  await panel.getByRole('button', { name: 'Udgiv …', exact: true }).click()
  await panel.getByTestId('publish-summary').waitFor()
  assert.equal(await panel.getByTestId('publish-first').count(), 0, 'only the first publish warns')
  await panel.getByRole('button', { name: 'Udgiv', exact: true }).click()
  await page.getByText('Tegningen er udgivet (version 2)').waitFor({ timeout: 30000 })
  assert.equal((await api(page, 'layout')).result.layout.version, 2)
  console.log('ok - slot A1.1 omdøbt til A1.9 på tegningen; "Udgiv …" viser "A1.1 → A1.9" med 1 palle; udgivet som version 2')

  await page.keyboard.press('Escape')
  await page.getByLabel('Søg i placeringer').waitFor({ timeout: 30000 })
  assert.equal(await page.getByRole('button', { name: 'Opret placeringer', exact: true }).count(), 0, 'Opret placeringer is hidden')
  await page.getByRole('button', { name: 'Administrér placeringer' }).click({ timeout: 30000 })
  await page.getByText('Pladser oprettes og ændres nu på tegningen').waitFor({ timeout: 30000 })
  assert.equal(await page.getByRole('button', { name: 'Opret placering', exact: true }).count(), 0, 'Opret placering (ny placering) is hidden')
  const row = name => page.locator('tbody tr').filter({ has: page.getByRole('button', { name, exact: true }) })
  await row('K1.1').getByText('ikke på kortet').waitFor()
  assert.equal(await row('A1.1').count(), 0, 'A1.1 is gone from the list')
  const list = (await api(page, 'list')).result.locations.map(location => location.name)
  assert.ok(list.includes('A1.9') && list.includes('K1.1') && !list.includes('A1.1'), `the list after version 2: ${list.join(', ')}`)
  console.log('ok - ingen "Opret placering(er)"; A1.1 hedder nu A1.9; K1.1 (uden for tegningen) står stadig i listen')

  await row('A1.9').getByRole('button', { name: 'A1.9', exact: true }).click()
  await page.getByRole('heading', { name: 'A1.9', exact: true }).waitFor({ timeout: 30000 })
  await page.getByText('Ved porten').waitFor()
  await page.getByRole('button', { name: /R162-0717/ }).first().waitFor({ timeout: 30000 })
  const card = (await api(page, 'locationCard', { location: 'A1.9' })).result
  assert.deepEqual(card.pallets.map(pallet => [pallet.material, pallet.quantity]), [['R162-0717', 5]])
  await shot(page, '28-pladskort-a19-med-palle')
  console.log('ok - pladskortet for A1.9 viser pallen (R162-0717, 5) og noten fra A1.1')

  const refused = await api(page, 'editLocation', { location: 'A1.9', changes: { name: 'A1.8' } })
  assert.equal(refused.ok, false, 'renaming a drawn place in the list is refused')
  assert.match(refused.error, /LOCATION_ON_DRAWING/)
  console.log('ok - editLocation A1.9 → A1.8 afvises med LOCATION_ON_DRAWING')
}

/** A plain employee can use Placeringer but cannot open the drawing. */
async function employeeLockedOut(page) {
  await signIn(page, 'anna@example.test')
  await page.getByText('Lagerstyring', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Placeringer', exact: true }).click({ timeout: 30000 })
  await page.getByLabel('Søg i placeringer').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Log', exact: true }).waitFor({ timeout: 30000 })
  assert.equal(await page.getByRole('button', { name: 'Tegning af lageret' }).count(), 0, 'no drawing button for an employee')
  assert.equal(await page.getByRole('button', { name: 'Administrér placeringer' }).count(), 0)
  const draft = await api(page, 'layoutDraft')
  assert.equal(draft.ok, false, 'an employee cannot read the draft')
  assert.match(draft.error, /LOCATIONS_MANAGER_ONLY/)
  await shot(page, '29-medarbejder-placeringer')
  console.log('ok - medarbejderen anna ser ingen "Tegning af lageret", og layoutDraft() afvises med LOCATIONS_MANAGER_ONLY')
}

/** The cell of a place in the map's rack front: its title starts with the place name. */
const mapCell = name => `[data-testid="map-front"] button[data-slot][title^="${name} "]`
/** Waits until the place's cell carries the highlight outline (and, with `visible`, is scrolled into the window). */
async function mapHighlighted(page, name, visible = false) {
  await page.waitForFunction(([selector, inView]) => {
    const cell = document.querySelector(selector)
    if (!cell || !cell.classList.contains('outline-amber-500')) return false
    if (!inView) return true
    const box = cell.getBoundingClientRect()
    return box.bottom > 0 && box.top < innerHeight
  }, [mapCell(name), visible], { timeout: 15000 })
}

/** "Kort over lageret" for everyone: anna finds R162-0717 on the map, sees the rack front and lands on A1.9 from "Vis på kort". */
async function mapForEveryone(page) {
  const hits = page.getByTestId('map-hits')
  const mapFront = page.getByTestId('map-front')
  const search = page.getByLabel('Søg på kortet')
  const showOnMap = page.getByRole('button', { name: 'Vis på kort', exact: true })

  await page.getByRole('button', { name: /Kort over lageret/ }).click({ timeout: 30000 })
  await page.locator(CANVAS).waitFor({ timeout: 30000 })
  await search.waitFor()
  console.log('ok - kort: anna (medarbejder) ser "Kort over lageret" på Placeringers forside, og tegningen åbner')

  await search.pressSequentially('r162-0717')
  await hits.getByText('R162-0717', { exact: false }).first().waitFor({ timeout: 15000 })
  // Two pallets of R162-0717: K9.9 (10, put away first, so the oldest – the one Tag points to) and A1.9 (5).
  const a19Hit = hits.getByRole('button', { name: /^A1\.9/ })
  const k99Hit = hits.getByRole('button', { name: /^K9\.9/ })
  await a19Hit.waitFor()
  assert.match(await k99Hit.textContent(), /ældste/, 'K9.9 holds the oldest pallet of R162-0717')
  assert.doesNotMatch(await a19Hit.textContent(), /ældste/)
  await mapFront.waitFor({ timeout: 15000 })
  await mapHighlighted(page, 'K9.9')
  const box = await search.boundingBox()
  const height = (page.viewportSize() ?? await page.evaluate(() => ({ height: innerHeight }))).height
  assert.ok(box && box.y >= 0 && box.y + box.height <= height, `the search field stays on screen while typing (y ${box?.y}, height ${height})`)
  const contents = (await api(page, 'mapContents')).result
  const k99 = (await api(page, 'list')).result.locations.find(location => location.name === 'K9.9')
  assert.equal(contents.oldest['R162-0717'], k99.id, 'mapContents points R162-0717 to K9.9')
  assert.equal(String(contents.oldest['R162-0717']).toUpperCase(), 'K9.9')
  assert.ok(contents.places['A1.9'].materials.some(item => item.material === 'R162-0717' && item.quantity === 5), 'mapContents has R162-0717 × 5 on A1.9')
  await shot(page, '30-kort-soeg-materiale')
  console.log('ok - kort: "r162-0717" i "Søg på kortet" viser A1.9 og K9.9 (K9.9 "ældste", som Tag); K9.9 fremhæves i reolen forfra; søgefeltet bliver på skærmen; mapContents.oldest peger på K9.9')

  await a19Hit.click()
  await mapFront.waitFor()
  await mapHighlighted(page, 'A1.9', true)
  const cell = page.locator(mapCell('A1.9'))
  assert.match(await cell.textContent(), /R162-0717/)
  assert.match(await cell.getAttribute('title'), /^A1\.9/)
  await frontShot(page, '31-kort-reol-forfra')
  console.log('ok - kort: klik på A1.9 i hitlisten ruller reolen forfra frem med A1.9 fremhævet og "R162-0717" i cellen')

  await search.fill('K1.1')
  await hits.getByRole('button', { name: /^K1\.1/ }).getByText('ikke på kortet').waitFor({ timeout: 15000 })
  await search.fill('zz-findes-ikke')
  await hits.getByText('Ingen plads eller materiale på kortet matcher').waitFor({ timeout: 15000 })
  console.log('ok - kort: K1.1 (uden for tegningen) står som "ikke på kortet"; en ukendt søgning giver "Ingen plads eller materiale på kortet matcher"')

  await page.locator(mapCell('A1.9')).click()
  await page.getByRole('heading', { name: 'A1.9', exact: true }).waitFor({ timeout: 30000 })
  await showOnMap.click({ timeout: 30000 })
  await page.locator(CANVAS).waitFor({ timeout: 30000 })
  await mapFront.waitFor({ timeout: 30000 })
  await mapHighlighted(page, 'A1.9', true)
  await shot(page, '32-vis-paa-kort')
  console.log('ok - kort: klik på cellen A1.9 åbner pladskortet; "Vis på kort" åbner kortet med A1.9 fremhævet')

  await page.keyboard.press('Escape')
  const homeSearch = page.getByLabel('Søg i placeringer')
  await homeSearch.waitFor({ timeout: 30000 })
  await homeSearch.fill('A1.9')
  const a19Row = page.locator('div')
    .filter({ has: page.getByRole('button', { name: /^A1\.9/ }) })
    .filter({ has: showOnMap })
    .last()
  await a19Row.getByRole('button', { name: 'Vis på kort', exact: true }).click({ timeout: 30000 })
  await page.locator(CANVAS).waitFor({ timeout: 30000 })
  await mapHighlighted(page, 'A1.9', true)
  console.log('ok - kort: "Vis på kort" på søgerækken A1.9 på forsiden åbner kortet med A1.9 fremhævet')

  await page.keyboard.press('Escape')
  await homeSearch.waitFor({ timeout: 30000 })
  await homeSearch.fill('K1.1')
  await page.getByRole('button', { name: /^K1\.1/ }).first().click({ timeout: 30000 })
  await page.getByRole('heading', { name: 'K1.1', exact: true }).waitFor({ timeout: 30000 })
  assert.equal(await showOnMap.count(), 0, 'K1.1 is not on the drawing: no "Vis på kort"')
  console.log('ok - kort: pladskortet for K1.1 (uden for tegningen) har ingen "Vis på kort"')
}

async function main() {
  makePlatform()
  const chef = await launch('chef')
  try {
    if (process.argv.includes('--open')) {
      await signIn(chef.page, 'chef@example.test')
      console.log(`Logget ind som chef@example.test på midlertidige data: ${root}\nLuk vinduet for at stoppe.`)
      await chef.app.waitForEvent('close', { timeout: 0 })
      return
    }
    await smoke(chef.page)
    await rackFront(chef.page)
    await leaveDuringSave(chef.app, chef.page)
    const rack = await publishFlow(chef.page)
    await adminAfterPublish(chef.page)
    await renameFollows(chef.page, rack)
    await employeeLockedOut(chef.page)
    await mapForEveryone(chef.page)
  } finally {
    await chef.app.close().catch(() => {})
  }
  console.log(`\nALLE TJEK OK. Skærmbilleder: ${evidence}`)
}

main().catch(error => {
  console.error('FEJL:', error)
  console.error(`Skærmbilleder: ${evidence}`)
  process.exit(1)
})
