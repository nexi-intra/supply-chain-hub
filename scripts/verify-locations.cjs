// Lagerstyring > Placeringer end to end in the Hub, with a manager and an employee in two real Electron windows.
// Everything runs against a temporary platform (registry, TCD/PIM users), SAP fixture files instead of SAP and a
// generated placement sheet. Production data on M: and SAP are never touched.
// Needs Vite:  npm run dev -- --host 127.0.0.1 --port 5064 --strictPort   then  node scripts/verify-locations.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ExcelJS = require('exceljs')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const ROOT = path.join(__dirname, '..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-locations-'))
const root = path.join(work, 'data')
const evidence = path.join(work, 'evidence')
const placements = path.join(work, 'placeringer')
fs.mkdirSync(evidence, { recursive: true })
fs.mkdirSync(placements, { recursive: true })
const PASSWORD = 'Local-verification-only'
const SHEET = 'Placeringsark_20_10_2026_15_38.xlsx'
const locationsDir = path.join(root, 'TCD', 'lagerstyring', 'placeringer')

function makePlatform() {
  const createdAt = new Date().toISOString()
  registry.writeTeams(root, {
    TCD: { name: 'Terminal Configuration & Dispatch', folderName: 'TCD', createdAt },
    PIM: { name: 'Planning, Inventory & Materials', folderName: 'PIM', createdAt },
  })
  registry.writeUserDirectory(root, { 'chef@example.test': 'TCD', 'anna@example.test': 'TCD', 'per@example.test': 'PIM' })
  createStore(path.join(root, 'TCD')).set('users', {
    'chef@example.test': { email: 'chef@example.test', fullName: 'Chef Christensen', password: PASSWORD, status: 'approved', role: 'manager' },
    'anna@example.test': { email: 'anna@example.test', fullName: 'Anna Andersen', password: PASSWORD, status: 'approved', role: 'user' },
  })
  createStore(path.join(root, 'PIM')).set('users', {
    'per@example.test': { email: 'per@example.test', fullName: 'Per Planner', password: PASSWORD, status: 'approved', role: 'user' },
  })
}

/** A small sheet shaped like TCD's: reserve pallets of different age, a pick place, a station, a reserved place and an unknown material. */
async function makePlacementSheet() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Data')
  sheet.addRow(['Lokation 1/0', 'Alder - dage', 'Område', 'Placering', 'Type', 'Højde', 'SAP mat. No.', 'SAP Description', 'Antal', 'Dato', 'Leverandør mat. no.', 'Kommentarer'])
  const row = (area, name, type, material = '', description = '', quantity = null, date = null, comment = '') => sheet.addRow([1, 0, area, name, type, null, material, description, quantity, date, '', comment])
  row('A', 'A1.1', 'Palle', 'R162-0717', 'Kabel', 100, new Date(Date.UTC(2025, 0, 1)))
  row('A', 'A1.2', 'Palle', 'R162-0717', 'Kabel', 50, new Date(Date.UTC(2026, 0, 1)))
  row('A', 'A9.9', 'Palle', '999-999', 'TERMINAL REOL', 0)
  row('B', 'B1.1', 'Palle', 'R999-9999', 'Ukendt', 5)
  row('C', 'C1.1', 'Palle')
  row('C', 'C1.2', 'Palle')
  row('C', 'C1.3', 'Palle')
  row('H', 'H1', 'Hylde', 'R162-0717', '', 10, null, 'PLUK')
  row('I', 'I1', 'Bord', 'R162-0717', '', null, null, 'PLUK')
  await workbook.xlsx.writeFile(path.join(placements, SHEET))
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
  const app = await _electron.launch({ executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'), args: ['.'], cwd: ROOT, env })
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
  const whatsNew = page.getByRole('dialog', { name: /Nyheder i Supply Chain Hub/ })
  if (await whatsNew.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
    await page.keyboard.press('Escape')
    await whatsNew.waitFor({ state: 'detached' })
  }
}

const tile = page => page.getByText('Lagerstyring', { exact: true }).first()
const shot = (page, name) => page.screenshot({ path: path.join(evidence, `${name}.jpg`), type: 'jpeg', quality: 80 })
const toast = (page, text) => page.locator('[data-sonner-toast]').getByText(text, { exact: false }).first().waitFor({ timeout: 30000 })
const task = (page, title) => page.getByRole('button', { name: new RegExp(`^${title}`) })
const backToLocations = page => page.getByRole('button', { name: 'Placeringer', exact: true }).first()

/** The front-page tile opens the Lagerstyring hub; its "Placeringer" tile opens Placeringer. */
async function openLocations(page) {
  await tile(page).click()
  await page.getByRole('button', { name: 'Placeringer', exact: true }).click({ timeout: 30000 })
  await page.getByLabel('Søg i placeringer').waitFor({ timeout: 30000 })
}

const api = (page, method, request) => page.evaluate(([name, payload]) => window.electronWarehouse.locations[name](payload).then(result => ({ ok: true, result }), error => ({ ok: false, error: String(error.message) })), [method, request])

async function main() {
  makePlatform()
  await makePlacementSheet()
  const anna = await launch('anna')
  const chef = await launch('chef')
  try {
    // 1. Another hub (PIM) has no tile, and the backend refuses Placeringer.
    await signIn(anna.page, 'per@example.test')
    await anna.page.waitForTimeout(1500)
    assert.equal(await tile(anna.page).count(), 0, 'PIM ser ikke Lagerstyring')
    const refused = await api(anna.page, 'overview')
    assert.match(refused.error, /WAREHOUSE_TEAM_NOT_ALLOWED/)
    console.log('ok - andre hubs (PIM) ser ingen Lagerstyring-flise, og backend afviser Placeringer')

    // 2. The manager imports the placement sheet: preview with SAP's descriptions and warnings, then import.
    await signIn(chef.page, 'chef@example.test')
    await openLocations(chef.page)
    await chef.page.getByText('Der er ingen placeringer i TCD endnu', { exact: false }).waitFor()
    await shot(chef.page, '00-placeringer-tom')
    await chef.page.getByRole('button', { name: 'Importér placeringsarket' }).click()
    await chef.page.getByRole('button', { name: 'Læs arket og tjek i SAP' }).click({ timeout: 30000 })
    await chef.page.getByText(SHEET, { exact: true }).waitFor({ timeout: 120000 })
    await chef.page.locator('summary').getByText('Findes ikke i SAP', { exact: false }).waitFor()
    await shot(chef.page, '01-import-forhaandsvisning')
    await chef.page.getByRole('button', { name: 'Importér', exact: true }).click()
    await toast(chef.page, 'placeringer og 2 paller er importeret')
    await chef.page.getByText('Kapacitet pr. område').waitFor()
    const imported = await api(chef.page, 'list')
    assert.equal(imported.result.locations.length, 9)
    assert.equal(imported.result.locations.find(location => location.id === 'H1').purpose, 'pick')
    assert.equal(imported.result.locations.find(location => location.id === 'I1').purpose, 'station')
    assert.equal(imported.result.locations.find(location => location.id === 'A9.9').purpose, 'reserved')
    const card = await api(chef.page, 'materialCard', { material: 'R162-0717' })
    assert.equal(card.result.description, 'Universal RJ45 - RJ45 Cat5e cable 2m', 'beskrivelsen kommer fra SAP, ikke fra arket')
    console.log('ok - manager importerer placeringsarket: forhåndsvisning med SAP-beskrivelser og advarsler, 9 placeringer og 2 paller')

    // 3. The employee puts two pallets away; the 49/50 number fills material, quantity and serial numbers from SAP.
    await signIn(anna.page, 'anna@example.test')
    await openLocations(anna.page)
    await task(anna.page, 'Sæt palle på plads').click()
    const documentField = anna.page.getByLabel('49/50-nummer (materialedokument)').first()
    await documentField.fill('5000032337 2026 0001')
    await documentField.press('Enter')
    await anna.page.getByText('3 serienumre fra SAP').waitFor({ timeout: 60000 })
    assert.equal(await anna.page.getByLabel('Materiale', { exact: true }).first().inputValue(), 'INT4100-4921-0')
    await anna.page.getByLabel('Plads', { exact: true }).first().fill('C1.1')
    await anna.page.getByRole('button', { name: 'Tilføj næste palle' }).click()
    const second = anna.page.getByLabel('Materiale', { exact: true }).nth(1)
    await second.fill('R133-0032')
    await second.press('Enter')
    await anna.page.getByLabel('Antal', { exact: true }).nth(1).fill('20')
    await anna.page.getByLabel('Plads', { exact: true }).nth(1).fill('C1.2')
    await shot(anna.page, '02-saet-paa-plads')
    await anna.page.getByRole('button', { name: 'Gem alle' }).click()
    await toast(anna.page, '2 paller er sat på plads')
    console.log('ok - medarbejderen sætter to paller på plads; 49/50-nummeret udfylder materiale, antal og serienumre fra SAP')

    // 4. A pick place is refilled from the oldest reserve pallet (FIFO), partly; there is no "run empty" any more.
    await backToLocations(anna.page).click()
    assert.equal(await anna.page.getByText('Løbet tør', { exact: true }).count(), 0, 'no run-empty list on the front page')
    await task(anna.page, 'Fyld pluk-plads op').click()
    await anna.page.getByLabel('Søg pluk-plads').fill('H1')
    await anna.page.getByRole('button', { name: /^H1\b/ }).click()
    await anna.page.getByRole('button', { name: 'Fyldt op fra A1.1' }).waitFor({ timeout: 30000 })
    await anna.page.getByLabel('Antal taget fra pallen').fill('10')
    await shot(anna.page, '03-fyld-op')
    await anna.page.getByRole('button', { name: 'Fyldt op fra A1.1' }).click()
    await toast(anna.page, 'H1 er fyldt op fra A1.1')
    const afterRefill = await api(anna.page, 'materialCard', { material: 'R162-0717' })
    assert.equal(afterRefill.result.reserve[0].quantity, 90)
    assert.equal(afterRefill.result.pickPlaces[0].state, undefined, 'pick places have no status')
    console.log('ok - "Fyld pluk-plads op": vælg H1, forslaget er den ældste reservepalle A1.1, og 10 stk. tages derfra')

    // 4b. "Hvor henter jeg?": typing part of the number suggests the material with its description; choosing it shows
    // the pick place H1 and the reserve pallets oldest first.
    await backToLocations(anna.page).click()
    await task(anna.page, 'Hvor henter jeg?').click()
    await anna.page.getByLabel('Materialenummer').fill('r162')
    const suggestion = anna.page.getByRole('option', { name: /R162-0717.*Universal RJ45/ })
    await suggestion.waitFor({ timeout: 30000 })
    await shot(anna.page, '03b-hvor-henter-jeg-forslag')
    await suggestion.click()
    await anna.page.getByRole('button', { name: 'H1', exact: true }).waitFor({ timeout: 30000 })
    await anna.page.getByText('Reservepaller – ældste først').waitFor()
    await shot(anna.page, '03c-hvor-henter-jeg')
    await anna.page.getByRole('button', { name: 'H1', exact: true }).click()
    await anna.page.getByRole('heading', { name: 'H1', exact: true }).waitFor({ timeout: 30000 })
    console.log('ok - "Hvor henter jeg?": "r162" foreslår R162-0717 med beskrivelse; valget viser pluk-pladsen H1 og reservepallerne')

    // 5. Take X pieces of the oldest pallet, then the younger whole pallet with the FIFO warning.
    await backToLocations(anna.page).click()
    await task(anna.page, 'Tag').click()
    await anna.page.getByLabel('Materiale', { exact: true }).fill('R162-0717')
    await anna.page.getByRole('button', { name: 'Find', exact: true }).click()
    await anna.page.getByLabel('Antal at tage').first().fill('5')
    await anna.page.getByRole('button', { name: 'Tag 5 stk.' }).first().click()
    await toast(anna.page, '5 stk. taget fra A1.1')
    await anna.page.getByRole('button', { name: 'Tag hele pallen' }).nth(1).click()
    await anna.page.getByText('Der står en ældre palle på A1.1', { exact: false }).waitFor()
    await shot(anna.page, '04-fifo-advarsel')
    await anna.page.getByRole('button', { name: 'Tag alligevel' }).click()
    await toast(anna.page, 'Pallen på A1.2 er taget')
    const afterTake = await api(anna.page, 'materialCard', { material: 'R162-0717' })
    assert.deepEqual(afterTake.result.reserve.map(pallet => `${pallet.location}:${pallet.quantity}`), ['A1.1:85'])
    console.log('ok - "Tag 5 stk." tager fra den ældste palle; en yngre palle giver en FIFO-advarsel og kan tages alligevel')

    // 6. Move a pallet and change its storage location from the pallet card.
    await backToLocations(anna.page).click()
    await anna.page.getByLabel('Søg i placeringer').fill('C1.1')
    await anna.page.getByRole('button', { name: /^C1\.1/ }).first().click()
    await anna.page.getByRole('button', { name: /INT4100-4921-0/ }).first().click()
    await anna.page.getByRole('button', { name: 'Flyt', exact: true }).click()
    await anna.page.getByLabel('Ny plads').fill('C1.3')
    await anna.page.getByRole('dialog').getByRole('button', { name: 'Flyt', exact: true }).click()
    await toast(anna.page, 'Pallen står nu på C1.3')
    await anna.page.getByRole('button', { name: 'Skift storage location' }).click()
    await anna.page.getByRole('dialog').getByLabel('Storage location').fill('D004')
    await anna.page.getByRole('dialog').getByRole('button', { name: 'Skift', exact: true }).click()
    await toast(anna.page, 'Storage location er nu D004')
    await anna.page.getByText('Flyttet C1.1 → C1.3').waitFor({ timeout: 30000 })
    await shot(anna.page, '05-pallekort')
    console.log('ok - pallen flyttes fra C1.1 til C1.3 og får storage location D004; begge står i historikken')

    // 6b. "Flyt": scan the place, the single pallet is chosen, type the new place and move.
    await backToLocations(anna.page).click()
    await task(anna.page, 'Flyt').click()
    const what = anna.page.getByLabel('Hvad skal flyttes')
    await what.fill('c1.3')
    await what.press('Enter')
    await anna.page.getByRole('radio', { name: /C1\.3.*INT4100-4921-0/ }).waitFor({ timeout: 30000 })
    await anna.page.getByLabel('Ny plads').fill('C1.2')
    await anna.page.getByText('C1.2 er fuld – vælg en anden plads').waitFor()
    assert.equal(await anna.page.getByRole('button', { name: 'Flyt', exact: true }).isDisabled(), true, 'a full place cannot be chosen')
    await anna.page.getByLabel('Ny plads').fill('C1.1')
    await shot(anna.page, '05b-flyt-palle')
    await anna.page.getByRole('button', { name: 'Flyt', exact: true }).click()
    await toast(anna.page, 'er flyttet fra C1.3 til C1.1')
    await anna.page.getByText('klar til næste palle', { exact: false }).waitFor()
    const afterMove = await api(anna.page, 'locationCard', { location: 'C1.1' })
    assert.deepEqual(afterMove.result.pallets.map(item => item.material), ['INT4100-4921-0'])
    console.log('ok - "Flyt": scan C1.3, pallen vælges selv, ny plads C1.1, flyt – og klar til næste palle')

    // 7. Hubert: where to fetch a material, with a button that opens the material card; write requests are only read.
    await anna.page.getByRole('button', { name: 'Spørg Hubert' }).click()
    const chat = anna.page.getByPlaceholder('Spørg Hubert…', { exact: true })
    await chat.fill('tag pallen på A1.1')
    await chat.press('Enter')
    await anna.page.getByText('Jeg kan kun læse i Placeringer', { exact: false }).waitFor({ timeout: 30000 })
    await chat.fill('hvor henter jeg R162-0717?')
    await chat.press('Enter')
    await anna.page.getByText('Reservepaller, ældste først: A1.1', { exact: false }).waitFor({ timeout: 30000 })
    await shot(anna.page, '06-hubert')
    await anna.page.getByRole('button', { name: 'Åbn R162-0717' }).last().click()
    await anna.page.getByRole('heading', { name: 'R162-0717', exact: true }).waitFor({ timeout: 30000 })
    console.log('ok - Hubert svarer "hvor henter jeg R162-0717?" med reservepallerne, og knappen åbner materialekortet')

    // 8. Two people take the same pallet at the same time: the second is told it is gone.
    const pallet = (await api(chef.page, 'materialCard', { material: 'R133-0032' })).result.reserve[0].id
    const [first, last] = await Promise.all([api(chef.page, 'take', { actionId: 'e2e-chef', pallet }), api(anna.page, 'take', { actionId: 'e2e-anna', pallet })])
    const outcomes = [first, last]
    assert.equal(outcomes.filter(outcome => outcome.ok).length, 1, JSON.stringify(outcomes))
    assert.match(outcomes.find(outcome => !outcome.ok).error, /PALLET_GONE/)
    console.log('ok - to tager samme palle på samme tid: den første får den, den anden får "Pallen er ikke der længere"')

    // 9. The log and undo: a plain user cannot undo; the manager makes Anna Placerings admin in Manager Panel; Anna
    // takes 5 stk. and undoes it in the log, and the pallet has them back.
    const plain = await api(anna.page, 'log', {})
    assert.equal(plain.result.canUndo, false, 'a plain user cannot undo')
    assert.match((await api(anna.page, 'undo', { actionId: 'e2e-undo-refused', eventId: plain.result.events[0].id })).error, /LOCATIONS_MANAGER_ONLY/)
    await signIn(chef.page, 'chef@example.test')
    await chef.page.getByText('Manager Panel', { exact: true }).first().click()
    await chef.page.getByRole('button', { name: 'Åbn Administration' }).click()
    const roles = chef.page.locator('[data-tool-roles="locations"]')
    await roles.getByRole('heading', { name: 'Placeringer' }).waitFor({ timeout: 20000 })
    await roles.getByLabel('Placeringsrolle for Anna Andersen').selectOption('location-admin')
    await toast(chef.page, 'Anna Andersen er nu Placerings admin')
    await roles.screenshot({ path: path.join(evidence, '07-lagerstyringsroller.jpg'), type: 'jpeg', quality: 80 })
    console.log('ok - manageren gør Anna til Placerings admin under Administration i Arbejdsværktøjer; en almindelig bruger kan ikke fortryde')

    const oldest = (await api(anna.page, 'materialCard', { material: 'R162-0717' })).result.reserve[0]
    assert.equal(`${oldest.location}:${oldest.quantity}`, 'A1.1:85')
    assert.ok((await api(anna.page, 'take', { actionId: 'e2e-take-5', pallet: oldest.id, quantity: 5 })).ok)
    await signIn(anna.page, 'anna@example.test')
    await openLocations(anna.page)
    await anna.page.getByRole('button', { name: 'Log', exact: true }).click()
    const row = anna.page.locator('.divide-y > div').filter({ hasText: 'Taget fra A1.1 · 5' }).first()
    await row.getByRole('button', { name: 'Fortryd' }).click({ timeout: 30000 })
    await anna.page.getByRole('dialog').getByText('Pallen på A1.1 får 85 stk. igen (nu 80)').waitFor()
    await shot(anna.page, '08a-fortryd-dialog')
    await anna.page.getByRole('dialog').getByRole('button', { name: 'Fortryd' }).click()
    await toast(anna.page, 'Handlingen er fortrudt')
    await anna.page.getByText('Fortrød en handling på A1.1').first().waitFor({ timeout: 30000 })
    await anna.page.getByText(/Fortrudt af Anna Andersen kl\./).first().waitFor()
    await shot(anna.page, '08-log-fortryd')
    const undone = await api(anna.page, 'materialCard', { material: 'R162-0717' })
    assert.equal(`${undone.result.reserve[0].location}:${undone.result.reserve[0].quantity}`, 'A1.1:85', 'the 5 stk. are back on the pallet')
    console.log('ok - Anna tager 5 stk. og fortryder i loggen: pallen har dem igen, og loggen viser den overstregede linje og fortrydelsen')

    // 10. A rack with shelves: the manager creates E9 with 3 shelves; Anna puts 40 and then 10 more on E9 H2, takes 5,
    // and "Hvor henter jeg?" shows the shelf; the manager deletes an empty shelf, is refused deleting the rack, and
    // deletes the empty places of area C in one go.
    await signIn(chef.page, 'chef@example.test')
    await openLocations(chef.page)
    await chef.page.getByRole('button', { name: 'Administrér placeringer' }).click()
    await chef.page.getByRole('button', { name: 'Opret reol' }).click()
    await chef.page.locator('#rack-name').fill('E9')
    await chef.page.locator('#rack-shelves').fill('3')
    await chef.page.getByRole('dialog').getByRole('button', { name: 'Opret', exact: true }).click()
    await toast(chef.page, 'Reol E9 oprettet med 3 hylder')
    await chef.page.getByRole('button', { name: 'E9 H3', exact: true }).waitFor({ timeout: 30000 })
    assert.deepEqual((await api(chef.page, 'rackCard', { rack: 'E9' })).result.shelves.map(shelf => shelf.location.name), ['E9 H3', 'E9 H2', 'E9 H1'])
    console.log('ok - manageren opretter reol E9 med 3 hylder (E9 H1–H3)')

    await backToLocations(anna.page).click()
    await task(anna.page, 'Læg på hylde').click()
    await anna.page.locator('#shelf-name').fill('E9 H2')
    const shelfMaterial = anna.page.getByRole('combobox', { name: 'Materiale' })
    await shelfMaterial.fill('R162-0717')
    await shelfMaterial.press('Enter')
    await anna.page.locator('#shelf-amount').fill('40')
    await anna.page.getByRole('button', { name: 'Gem', exact: true }).click()
    await toast(anna.page, 'Lagt på E9 H2: 40 stk. R162-0717')
    await shelfMaterial.fill('R162-0717')
    await shelfMaterial.press('Enter')
    await anna.page.locator('#shelf-amount').fill('10')
    await anna.page.locator('strong', { hasText: '50 stk.' }).waitFor({ timeout: 30000 })
    await shot(anna.page, '09-laeg-paa-hylde')
    await anna.page.getByRole('button', { name: 'Gem', exact: true }).click()
    await toast(anna.page, 'Lagt på E9 H2: 10 stk. R162-0717')
    assert.equal((await api(anna.page, 'locationCard', { location: 'E9 H2' })).result.stock[0].quantity, 50)
    console.log('ok - Anna lægger 40 og så 10 stk. R162-0717 på E9 H2: forhåndsvisningen viser 40 → 50, og hylden har 50')

    await backToLocations(anna.page).click()
    await task(anna.page, 'Tag').click()
    await anna.page.getByLabel('Materiale', { exact: true }).fill('R162-0717')
    await anna.page.getByRole('button', { name: 'Find', exact: true }).click()
    const shelfRow = anna.page.locator('[data-shelf="E9 H2"]')
    await shelfRow.getByLabel('Antal at tage fra hylden').fill('5', { timeout: 30000 })
    await shelfRow.getByRole('button', { name: 'Tag 5 stk.' }).click()
    await toast(anna.page, '5 stk. taget fra E9 H2')
    assert.equal((await api(anna.page, 'locationCard', { location: 'E9 H2' })).result.stock[0].quantity, 45)
    await backToLocations(anna.page).click()
    await task(anna.page, 'Hvor henter jeg?').click()
    const fetchField = anna.page.getByRole('combobox', { name: 'Materialenummer' })
    await fetchField.fill('R162-0717')
    await fetchField.press('Enter')
    await anna.page.getByRole('button', { name: /E9 H2 · 45 stk\./ }).waitFor({ timeout: 30000 })
    await shot(anna.page, '10-hvor-henter-jeg-hylde')
    console.log('ok - Anna tager 5 stk. fra E9 H2 under "På hylder" (45 tilbage), og "Hvor henter jeg?" viser hylden')

    await chef.page.getByRole('button', { name: 'E9 H3', exact: true }).click()
    await chef.page.getByRole('button', { name: 'Slet', exact: true }).click()
    await toast(chef.page, 'E9 H3 er slettet')
    await chef.page.getByRole('button', { name: 'Slet reol' }).click({ timeout: 30000 })
    await chef.page.getByRole('dialog').getByRole('button', { name: 'Slet reol' }).click()
    await toast(chef.page, 'Tøm først: E9 H2')
    await chef.page.keyboard.press('Escape')
    assert.deepEqual((await api(chef.page, 'rackCard', { rack: 'E9' })).result.shelves.map(shelf => shelf.location.name), ['E9 H2', 'E9 H1'], 'the rack is not deleted while a shelf has stock')
    console.log('ok - manageren sletter den tomme E9 H3; "Slet reol" afvises, fordi E9 H2 har varer')

    await backToLocations(chef.page).click()
    await chef.page.getByRole('button', { name: 'Administrér placeringer' }).click()
    await chef.page.getByLabel('Område').selectOption('C')
    await chef.page.getByLabel('Kun tomme').check()
    const emptyC = (await api(chef.page, 'list')).result.locations.filter(location => location.area === 'C' && location.used === 0 && location.stockCount === 0).map(location => location.name)
    assert.ok(emptyC.length > 0, 'area C has empty places')
    await chef.page.getByRole('button', { name: 'Vælg alle i søgningen' }).click()
    await chef.page.getByRole('button', { name: 'Slet valgte' }).click()
    await shot(chef.page, '11-slet-valgte')
    await chef.page.getByRole('dialog').getByRole('button', { name: 'Slet', exact: true }).click()
    await toast(chef.page, `${emptyC.length} placeringer slettet`)
    const leftC = (await api(chef.page, 'list')).result.locations.filter(location => location.area === 'C').map(location => location.name)
    assert.ok(emptyC.every(name => !leftC.includes(name)), `${emptyC.join(', ')} are deleted`)
    assert.ok(leftC.length > 0, 'places with pallets stay')
    const deletedLine = (await api(chef.page, 'log', {})).result.events.find(event => event.changes?.deleted)
    assert.ok(deletedLine.canUndo, 'the deletion can be undone')
    console.log(`ok - manageren filtrerer "Kun tomme" i område C, vælger alle og sletter ${emptyC.length} placeringer i én handling, der kan fortrydes`)
  } finally {
    await anna.app.close().catch(() => {})
    await chef.app.close().catch(() => {})
  }
  assert.ok(fs.readdirSync(locationsDir).some(name => name.includes('locations')), 'placeringerne ligger i TCD\\lagerstyring\\placeringer')
  assert.deepEqual(fs.readdirSync(path.join(root, 'TCD')).filter(name => /location|pallet|placering/i.test(name)), [], 'intet i Hubbens egen teammappe')
  assert.equal(fs.existsSync(path.join(root, 'PIM', 'lagerstyring')), false, 'PIM får ingen lagerstyrings-mappe')
  assert.ok(fs.existsSync(path.join(placements, SHEET)), 'arket er urørt')
  console.log('ok - Placeringers data ligger kun i TCD\\lagerstyring\\placeringer; arket på M: er kun læst')
  console.log(`\nALLE TJEK OK. Skærmbilleder: ${evidence}`)
}

main().catch(error => {
  console.error('FEJL:', error)
  console.error(`Skærmbilleder: ${evidence}`)
  process.exit(1)
})
