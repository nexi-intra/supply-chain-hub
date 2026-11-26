// Lagerstyring (Optælling) end to end in the Hub, with two users at the same time in two real Electron windows.
// Everything runs against a temporary platform (registry, TCD/TRR/PIM users), SAP fixture files instead of SAP and a
// generated placement sheet. Production data on M: and SAP are never touched.
// Needs Vite:  npm run dev -- --host 127.0.0.1 --port 5064 --strictPort   then  node scripts/verify-warehouse.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ExcelJS = require('exceljs')
const { _electron } = require('playwright-core')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const ROOT = path.join(__dirname, '..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-warehouse-'))
const root = path.join(work, 'data')
const evidence = path.join(work, 'evidence')
const placements = path.join(work, 'placeringer')
fs.mkdirSync(evidence, { recursive: true })
fs.mkdirSync(placements, { recursive: true })
const PASSWORD = 'Local-verification-only'
const STATUS = 'Status Q4 2026'
const COUNT_NAME = 'E2E status D000 D004'
const ACC_NAME = 'E2E tilbehør D000'
const warehouseDir = path.join(root, 'TCD', 'lagerstyring')
const reportsDir = path.join(warehouseDir, 'rapporter')

function makePlatform() {
  const createdAt = new Date().toISOString()
  registry.writeTeams(root, {
    TCD: { name: 'Terminal Configuration & Dispatch', folderName: 'TCD', createdAt },
    TRR: { name: 'Terminal Return & Repair', folderName: 'TRR', createdAt },
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

async function makePlacementSheet() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Data')
  sheet.addRow(['Lokation 1/0', 'Alder - dage', 'Område', 'Placering', 'Type', 'Højde', 'SAP mat. No.', 'SAP Description', 'Antal', 'Dato', 'Leverandør mat. no.', 'Kommentarer'])
  sheet.addRow([1, 10, 'A', 'A1.1', 'Palle', null, 'R162-0717', 'Label', 2458])
  sheet.addRow([1, 10, 'A', 'A1.2', 'Palle', null, 'R133-0032', 'Kabel', 400])
  sheet.addRow([1, 10, 'B', 'B1.1', 'Hylde', null, '331-0194', 'Emballage', 72])
  await workbook.xlsx.writeFile(path.join(placements, 'Placeringsark_15_10_2026_10_00.xlsx'))
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
  page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'E2E kommentar' : undefined))
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
const moduleNav = page => page.getByRole('navigation', { name: 'Optælling' })

/** The front-page tile opens the Lagerstyring hub; its "Optælling" tile opens the counts. */
async function openWarehouse(page) {
  await tile(page).click()
  await page.getByRole('button', { name: 'Optælling', exact: true }).click({ timeout: 30000 })
  await page.getByRole('heading', { name: 'Optællinger', exact: true }).waitFor({ timeout: 30000 })
}

/** The header's "Tilbage": from Optælling to the Lagerstyring hub, from there to the front page. */
const headerBack = page => page.getByRole('button', { name: 'Tilbage', exact: true }).first()
async function toFrontPage(page) {
  await headerBack(page).click()
  await page.getByRole('button', { name: 'Optælling', exact: true }).waitFor()
  await headerBack(page).click()
  await page.getByText('Forbedringer og forslag', { exact: true }).waitFor()
}

async function scan(page, serial, expected) {
  const input = page.getByLabel('Scan serienummer')
  await input.fill(serial)
  await input.press('Enter')
  await page.locator('[aria-live="assertive"]').getByText(expected, { exact: true }).waitFor({ timeout: 15000 })
  await page.locator('[aria-live="assertive"]').getByText(serial, { exact: true }).waitFor({ timeout: 15000 })
}

const shot = (page, name) => page.screenshot({ path: path.join(evidence, `${name}.jpg`), type: 'jpeg', quality: 80 })

/** Windows refuses the clipboard while the PC is locked; clipboard checks are skipped then. Electron 44's clipboard is async. */
async function clipboardWorks(app) {
  return app.evaluate(async ({ clipboard }) => { await clipboard.writeText('warehouse-probe'); return (await clipboard.readText()) === 'warehouse-probe' }).catch(() => false)
}

async function approveAll(page) {
  await page.getByRole('tab', { name: 'Godkendelse' }).click()
  await page.getByRole('button', { name: 'Godkend alle uden difference' }).click()
  await page.waitForTimeout(1500)
  for (let round = 0; round < 300; round++) {
    const next = page.getByRole('button', { name: 'Godkend', exact: true }).first()
    if (!(await next.count())) return
    await next.click()
    await page.waitForTimeout(250)
  }
  throw new Error('For mange materialer at godkende')
}

async function openCount(page, name) {
  await page.getByRole('button', { name: 'Tilbage til optællinger' }).click()
  await page.getByRole('button', { name: new RegExp(name) }).click({ timeout: 20000 })
  await page.getByRole('heading', { name }).waitFor()
}

const sheetRows = sheet => { const rows = []; sheet.eachRow(row => rows.push(row.values.slice(1))); return rows }

async function main() {
  makePlatform()
  await makePlacementSheet()
  const anna = await launch('anna')
  const chef = await launch('chef')
  try {
    // 1. Another hub (PIM) has no tile, and the backend refuses the module.
    await signIn(anna.page, 'per@example.test')
    await anna.page.waitForTimeout(1500)
    assert.equal(await tile(anna.page).count(), 0, 'PIM ser ikke Lagerstyring')
    const refused = await anna.page.evaluate(() => window.electronWarehouse.me().then(() => 'ok', error => String(error.message)))
    assert.match(refused, /WAREHOUSE_TEAM_NOT_ALLOWED/)
    console.log('ok - andre hubs (PIM) ser ingen Lagerstyring-flise, og backend afviser modulet')

    // 2. Without a status the employee waits; the manager starts one.
    await signIn(anna.page, 'anna@example.test')
    await tile(anna.page).click()
    await anna.page.getByRole('button', { name: 'Optælling', exact: true }).waitFor({ timeout: 30000 })
    assert.equal(await anna.page.getByRole('heading', { name: 'Optællinger', exact: true }).count(), 0, 'Lagerstyring åbner sin egen side, ikke Optælling')
    await shot(anna.page, '00-lagerstyring')
    await anna.page.getByRole('button', { name: 'Optælling', exact: true }).click()
    await anna.page.getByRole('heading', { name: 'Optællinger', exact: true }).waitFor()
    await anna.page.keyboard.press('Escape')
    await anna.page.getByRole('button', { name: 'Optælling', exact: true }).waitFor()
    await anna.page.keyboard.press('Escape')
    await anna.page.getByText('Forbedringer og forslag', { exact: true }).waitFor()
    console.log('ok - flisen åbner Lagerstyrings egen side med feltet "Optælling"; Escape går ét niveau op ad gangen')
    await openWarehouse(anna.page)
    await anna.page.getByText('Venter på at en manager starter næste status').waitFor()
    assert.equal(await anna.page.getByRole('button', { name: 'Ny optælling' }).isDisabled(), true, 'ingen optælling uden status')
    assert.equal(await anna.page.getByRole('button', { name: 'Start ny status' }).count(), 0, 'kun managers starter en status')
    assert.equal(await moduleNav(anna.page).getByRole('button', { name: 'Roller' }).count(), 0, 'roller styres i Manager Panel')
    console.log('ok - uden status venter medarbejderen på en manager; Optælling har ingen Roller-fane')

    await signIn(chef.page, 'chef@example.test')
    await openWarehouse(chef.page)
    await chef.page.getByRole('button', { name: 'Start ny status' }).click()
    await chef.page.getByRole('radio', { name: 'Q4' }).click()
    await chef.page.getByLabel('År', { exact: true }).fill('2026')
    await chef.page.getByRole('button', { name: 'Start status' }).click()
    await chef.page.getByRole('heading', { name: STATUS }).waitFor()
    await anna.page.getByRole('heading', { name: STATUS }).waitFor({ timeout: 30000 })
    assert.ok(fs.readdirSync(warehouseDir).length > 0, 'data ligger i TCD\\lagerstyring')
    await shot(chef.page, '01-status-startet')
    console.log(`ok - manager starter "${STATUS}", medarbejderen ser den, og data ligger i TCD\\lagerstyring`)

    // Hubert: live figures from Optælling with a button that opens the status; write requests are only read.
    await anna.page.getByRole('button', { name: 'Spørg Hubert' }).click()
    const chat = anna.page.getByPlaceholder('Spørg Hubert…', { exact: true })
    await chat.fill('slet optællingen')
    await chat.press('Enter')
    await anna.page.getByText('Jeg kan kun læse i Optælling', { exact: false }).waitFor({ timeout: 30000 })
    await chat.fill('hvor langt er optællingen?')
    await chat.press('Enter')
    await anna.page.getByText(`${STATUS}: 0 % samlet fremdrift`, { exact: false }).waitFor({ timeout: 30000 })
    await shot(anna.page, '01b-hubert')
    await anna.page.getByRole('button', { name: `Åbn "${STATUS}"` }).last().click()
    await anna.page.getByText('Igangværende', { exact: true }).waitFor({ timeout: 20000 })
    await anna.page.getByRole('button', { name: 'Tilbage til forsiden' }).click()
    await anna.page.getByRole('button', { name: 'Ny optælling' }).waitFor()
    console.log('ok - Hubert svarer med statussens fremdrift og en knap, der åbner den; "slet optællingen" får "kun læse"')

    // 3. A count from SAP (fixtures), scanning and the material in focus.
    await anna.page.getByRole('button', { name: 'Ny optælling' }).click()
    await anna.page.getByRole('heading', { name: 'Ny optælling' }).waitFor()
    assert.equal(await anna.page.getByRole('radio', { name: 'Terminaler', exact: true }).getAttribute('aria-checked'), 'true', 'terminaler er standard')
    await anna.page.getByRole('checkbox', { name: 'D000' }).click()
    await anna.page.getByRole('checkbox', { name: 'D004' }).click()
    await anna.page.getByRole('button', { name: 'Hent fra SAP' }).click()
    await anna.page.getByText('2. Forhåndsvisning fra SAP').waitFor({ timeout: 30000 })
    await anna.page.getByText('Placeringsark: Placeringsark_15_10_2026_10_00.xlsx', { exact: false }).waitFor()
    await shot(anna.page, '02-forhaandsvisning')
    await anna.page.getByLabel('Navn').fill(COUNT_NAME)
    await anna.page.getByRole('button', { name: 'Opret optælling' }).click()
    await anna.page.getByRole('heading', { name: COUNT_NAME }).waitFor()
    console.log('ok - "Ny optælling" henter fra SAP (fixtures), viser forhåndsvisning med placeringsark og opretter optællingen')

    await anna.page.getByLabel('Sted (placering, palle, reol …)').fill('A1.1')
    await scan(anna.page, 'NCC202796019', 'Fundet')
    await scan(anna.page, '470060250206000009', 'Uden for optællingen')
    await scan(anna.page, 'NCB200492180', 'Fundet')
    await scan(anna.page, 'NCB200492185', 'Anden storage location')
    await scan(anna.page, 'ZZZ999', 'Ukendt serienummer')
    await scan(anna.page, 'NCC202796019', 'Allerede scannet')
    await shot(anna.page, '03-scanning')
    await anna.page.keyboard.press('Control+z')
    await anna.page.getByText('Fortrudt: NCC202796019').waitFor()
    console.log('ok - scanninger giver fundet / uden for / anden sloc / ukendt / allerede scannet, og Ctrl+Z fortryder')

    await anna.page.getByRole('combobox', { name: 'Vælg materiale' }).selectOption('INT4300-4921-0')
    const focus = anna.page.getByRole('table').filter({ hasText: 'Serienummer' }).first()
    await focus.getByRole('cell', { name: 'NCC202796020' }).waitFor()
    await anna.page.getByRole('tab', { name: /^Fundet/ }).first().click()
    await focus.getByRole('cell', { name: 'NCC202796019', exact: true }).waitFor()
    await focus.getByRole('button', { name: 'Fjern NCC202796019' }).click()
    await anna.page.getByText('NCC202796019 er fjernet fra fundne').waitFor()
    await anna.page.getByRole('button', { name: 'Fortryd', exact: true }).click()
    await anna.page.getByRole('tab', { name: /^Fundet/ }).first().click()
    await focus.getByRole('cell', { name: 'NCC202796019', exact: true }).waitFor({ timeout: 15000 })
    console.log('ok - materiale i fokus viser serienumre; et fundet serienummer kan fjernes og fortrydes')

    // 4. Two counters: join request, shared scans and material locks.
    await chef.page.getByRole('button', { name: new RegExp(COUNT_NAME) }).click({ timeout: 30000 })
    await chef.page.getByRole('heading', { name: COUNT_NAME }).waitFor()
    await chef.page.getByRole('button', { name: 'Anmod om at deltage' }).click()
    await chef.page.getByText('Afventer godkendelse').first().waitFor()
    await anna.page.getByRole('tab', { name: /Deltagere/ }).click()
    await anna.page.getByRole('button', { name: 'Godkend' }).click()
    await anna.page.getByText('Deltageren er godkendt').waitFor()
    await chef.page.getByRole('tab', { name: 'Scan serienumre' }).waitFor({ timeout: 20000 })
    await chef.page.waitForTimeout(6000)
    await chef.page.getByRole('tab', { name: 'Scan serienumre' }).click()
    await chef.page.getByLabel('Sted (placering, palle, reol …)').fill('B1.1')
    await scan(chef.page, '470060250206000009', 'Allerede scannet')
    await chef.page.getByText('Scannet af Anna Andersen', { exact: false }).waitFor()
    await scan(chef.page, 'X7D500001060', 'Fundet')
    console.log('ok - kollegaen anmoder om at deltage, bliver godkendt, og de ser hinandens scanninger')

    const lockedOption = chef.page.getByRole('combobox', { name: 'Vælg materiale' }).locator('option', { hasText: 'tælles af Anna Andersen' })
    await lockedOption.first().waitFor({ state: 'attached', timeout: 20000 })
    assert.equal(await lockedOption.first().isDisabled(), true, 'Annas materiale kan ikke vælges af andre')
    await chef.page.getByRole('button', { name: 'Anmod om at tælle med på INT4300-4921-0' }).click()
    await anna.page.getByText('Chef Christensen vil tælle med på INT4300-4921-0').waitFor({ timeout: 20000 })
    await anna.page.getByRole('button', { name: 'Tillad', exact: true }).first().click()
    await chef.page.getByText('Du må nu tælle med på INT4300-4921-0').waitFor({ timeout: 20000 })
    console.log('ok - et materiale låses til den, der tæller det; kollegaen anmoder og får lov')

    // 5. An accessory count: count lists, send to approval with a difference, approve and mark posted.
    await chef.page.getByRole('button', { name: 'Tilbage til optællinger' }).click()
    await chef.page.getByRole('button', { name: 'Ny optælling' }).click()
    await chef.page.getByRole('radio', { name: 'Tilbehør', exact: true }).click()
    await chef.page.getByRole('checkbox', { name: /^D000/ }).click()
    await chef.page.getByRole('button', { name: 'Hent fra SAP' }).click()
    await chef.page.getByText('2. Forhåndsvisning fra SAP').waitFor({ timeout: 30000 })
    await chef.page.getByLabel('Navn').fill(ACC_NAME)
    await chef.page.getByRole('button', { name: 'Opret optælling' }).click()
    await chef.page.getByRole('heading', { name: ACC_NAME }).waitFor()
    await chef.page.getByRole('tab', { name: 'Tilbehør og tællelister' }).click()
    await chef.page.getByLabel('Placering for R162-0717', { exact: true }).selectOption('A1.1')
    await chef.page.getByLabel('Antal for R162-0717', { exact: true }).fill('2450')
    await chef.page.getByLabel('Antal for R162-0717', { exact: true }).press('Enter')
    await chef.page.getByText('· talt 2.450', { exact: false }).first().waitFor()
    await chef.page.getByLabel('Placering', { exact: true }).fill('Arbejdsstation 4')
    await chef.page.getByLabel('Materiale', { exact: true }).fill('R162-0717')
    await chef.page.getByLabel('Antal', { exact: true }).fill('5')
    await chef.page.getByRole('button', { name: 'Gem linje' }).click()
    await chef.page.getByText('Gemt: 5 × R162-0717 på Arbejdsstation 4').waitFor()
    await shot(chef.page, '04-tilbehoer')
    await chef.page.getByRole('button', { name: 'Send R162-0717 til godkendelse' }).first().click()
    await chef.page.getByRole('alert').filter({ hasText: 'difference på -3 stk.' }).waitFor()
    await chef.page.getByLabel(/Kommentar til manageren/).fill('3 stk. til reparation')
    await chef.page.getByRole('button', { name: 'Send med difference' }).click()
    await chef.page.getByText('R162-0717 er sendt til godkendelse').waitFor()
    await chef.page.getByRole('tab', { name: 'Godkendelse' }).click()
    await chef.page.getByRole('row', { name: /R162-0717/ }).getByText('Med difference -3').waitFor()
    await chef.page.getByRole('row', { name: /R162-0717/ }).getByRole('button', { name: 'Godkend' }).click()
    await chef.page.getByRole('row', { name: /R162-0717/ }).getByText('Godkendt', { exact: true }).waitFor()
    await chef.page.getByRole('row', { name: /R162-0717/ }).getByRole('button', { name: 'Bogført i SAP' }).click()
    await chef.page.getByRole('row', { name: /R162-0717/ }).getByText('Bogført i SAP', { exact: true }).first().waitFor()
    console.log('ok - tælleliste, "Send til godkendelse" med difference -3, manager godkender og markerer "Bogført i SAP"')

    await chef.page.getByRole('tab', { name: 'Til optællingsdokument' }).click()
    await chef.page.getByRole('button', { name: 'Hent dagens SAP-tal' }).click()
    await chef.page.getByText('SAP-tal hentet', { exact: false }).waitFor({ timeout: 30000 })
    await chef.page.getByRole('row', { name: /R162-0717/ }).getByText('2.455', { exact: true }).waitFor()
    console.log('ok - "Til optællingsdokument": dagens SAP-tal 2.458 + godkendt diff -3 = 2.455')

    // 6. SAP document: the manager creates and prints, an admin (role from the Manager Panel) enters the count, the manager posts.
    await approveAll(chef.page)
    await chef.page.getByRole('tab', { name: 'Til optællingsdokument' }).click()
    const sapDocs = chef.page.getByRole('region', { name: 'SAP-dokumenter' })
    await sapDocs.waitFor()
    assert.equal(await sapDocs.getByText(/Test-SAP/).count(), 0, 'produktion (PS4) viser ikke Test-SAP')
    const both = await clipboardWorks(chef.app)
    await chef.page.getByLabel('Vælg R092-0039 D000', { exact: true }).check()
    if (both) await chef.page.getByLabel('Vælg R133-0032 D000', { exact: true }).check()
    await sapDocs.getByRole('button', { name: both ? 'Opret SAP-dokument (2 af maks. 20)' : 'Opret SAP-dokument (1)' }).click()
    await chef.page.getByText('SAP-dokument 105900001 er oprettet').waitFor({ timeout: 30000 })
    await sapDocs.getByRole('button', { name: 'Print' }).click()
    await chef.page.getByText('SAP-dokument 105900001 er sendt til print').waitFor({ timeout: 30000 })
    await sapDocs.getByText('Venter på en admin').waitFor()
    await shot(chef.page, '05-sap-dokument')
    console.log(`ok - manageren opretter et SAP-dokument (${both ? '2 materialer' : '1 materiale – udklipsholder utilgængelig'}) og printer det (fake-SAP); næste trin venter på en admin`)

    await toFrontPage(chef.page)
    await chef.page.getByText('Manager Panel', { exact: true }).first().click()
    await chef.page.getByRole('button', { name: 'Åbn Administration' }).click()
    const card = chef.page.locator('[data-tool-roles="counts"]')
    await card.waitFor({ timeout: 20000 })
    await card.getByLabel('Optællingsrolle for Anna Andersen').selectOption('admin')
    await chef.page.getByText('Anna Andersen er nu admin i Optælling').waitFor()
    await card.screenshot({ path: path.join(evidence, '06-manager-panel-roller.jpg'), type: 'jpeg', quality: 80 })
    console.log('ok - manageren gør Anna til admin under Administration i Arbejdsværktøjer (via Manager Panel)')

    await openCount(anna.page, ACC_NAME)
    const annaDocs = anna.page.getByRole('region', { name: 'SAP-dokumenter' })
    for (let tries = 0; !(await annaDocs.getByRole('button', { name: 'Læg antal på' }).count()); tries++) {
      if (tries >= 20) throw new Error('"Læg antal på" kom ikke frem for admin')
      await openCount(anna.page, ACC_NAME)
      await anna.page.getByRole('tab', { name: 'Til optællingsdokument' }).click()
      await annaDocs.waitFor()
      await anna.page.waitForTimeout(1000)
    }
    await moduleNav(anna.page).getByText('Plant D301 · Admin').waitFor({ timeout: 70000 })
    await annaDocs.getByRole('button', { name: 'Læg antal på' }).click()
    await anna.page.getByText('Antal er lagt på SAP-dokument 105900001').waitFor({ timeout: 30000 })
    await annaDocs.getByText('Venter på bogføring (manager)').waitFor()
    await shot(anna.page, '07-antal-lagt-paa')
    console.log('ok - Anna har rollen admin i Optælling og lægger antal på dokumentet (fake-SAP); næste trin er bogføring')

    await chef.page.getByRole('button', { name: 'Tilbage', exact: true }).first().click()
    await openWarehouse(chef.page)
    await chef.page.getByRole('button', { name: new RegExp(ACC_NAME) }).click({ timeout: 20000 })
    await chef.page.getByRole('heading', { name: ACC_NAME }).waitFor()
    await chef.page.getByRole('tab', { name: 'Til optællingsdokument' }).click()
    await sapDocs.getByRole('button', { name: 'Bogfør', exact: true }).click()
    await chef.page.getByText('SAP-dokument 105900001 er bogført').waitFor({ timeout: 30000 })
    await sapDocs.getByText('mat.dok. 4900000001', { exact: false }).waitFor()
    await chef.page.getByRole('tab', { name: 'Godkendelse' }).click()
    const postedRow = chef.page.getByRole('row', { name: /R092-0039/ })
    for (let tries = 0; await postedRow.getByRole('button', { name: 'Bogført i SAP' }).count(); tries++) {
      if (tries >= 20) throw new Error('R092-0039 blev ikke markeret "Bogført i SAP" efter bogføringen')
      await chef.page.waitForTimeout(1000)
    }
    await postedRow.getByText('Bogført i SAP', { exact: true }).waitFor()
    await shot(chef.page, '08-bogfoert')
    console.log('ok - manageren bogfører (fake-SAP); materialedokumentet vises, og materialet står som "Bogført i SAP"')

    await chef.page.getByRole('button', { name: 'Afslut' }).click()
    await chef.page.getByText('Optællingen er afsluttet').first().waitFor()

    // 7. Import, report and closing the terminal count.
    await openCount(anna.page, COUNT_NAME)
    await anna.page.getByRole('tab', { name: 'Import' }).click()
    await anna.page.getByLabel('Sted *').fill('Palle 7')
    await anna.page.getByLabel('Materialedokument').fill('4900229137 2026 01')
    await anna.page.getByLabel('Materialedokument').press('Enter')
    await anna.page.getByText('SmartPOS P300 PCI PTS 6.x P2PE').waitFor({ timeout: 20000 })
    await anna.page.getByRole('button', { name: /^Importér 3 på Palle 7/ }).click()
    await anna.page.getByText('3 serienumre fra 4900229137 2026 01 importeret på Palle 7').waitFor()
    console.log('ok - import fra materialedokument (ZMS_REP for TCD)')

    await anna.page.getByRole('button', { name: 'Excel-rapport' }).click()
    await anna.page.getByText('Rapporten er gemt').waitFor({ timeout: 30000 })
    const reports = fs.readdirSync(reportsDir).filter(name => name.endsWith('.xlsx'))
    assert.equal(reports.length, 1)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(path.join(reportsDir, reports[0]))
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resumé', 'Differencer', 'Alle materialer', 'Serienumre', 'Skal flyttes', 'Tællelinjer'])
    console.log(`ok - Excel-rapport gemt i TCD\\lagerstyring\\rapporter: ${reports[0]}`)

    await anna.page.getByRole('button', { name: 'Afslut' }).click()
    await anna.page.getByText('Optællingen er afsluttet').first().waitFor()
    await chef.page.getByRole('button', { name: 'Tilbage til optællinger' }).click()
    await chef.page.getByRole('button', { name: new RegExp(COUNT_NAME) }).click({ timeout: 20000 })
    await chef.page.getByRole('heading', { name: COUNT_NAME }).waitFor()
    await approveAll(chef.page)
    console.log('ok - begge optællinger afsluttet og alle materialer godkendt')

    // 8. Lock the status: final reports, the Archive and "Vis i SAP".
    await chef.page.getByRole('button', { name: 'Tilbage til optællinger' }).click()
    await chef.page.getByRole('button', { name: 'Se detaljer' }).click()
    await chef.page.getByText('Alt er klar', { exact: false }).waitFor({ timeout: 30000 })
    await chef.page.getByRole('button', { name: 'Godkend og lås status' }).click()
    await chef.page.getByRole('button', { name: 'Godkend og lås', exact: true }).click()
    await chef.page.getByText(/^Version 1 · /).waitFor({ timeout: 30000 })
    const finalReport = fs.readdirSync(reportsDir).find(name => /^Status Q4 2026 endelig v1 .*\.xlsx$/.test(name))
    assert.ok(finalReport, 'endelig statusrapport v1 er gemt')
    const final = new ExcelJS.Workbook()
    await final.xlsx.readFile(path.join(reportsDir, finalReport))
    const summary = sheetRows(final.getWorksheet('Resumé'))
    assert.ok(summary.some(row => row[0] === COUNT_NAME) && summary.some(row => row[0] === ACC_NAME) && summary.some(row => row[0] === 'I alt'))
    await chef.page.getByTestId('diff-qty-percent').waitFor({ timeout: 30000 })
    await shot(chef.page, '09-status-laast')
    console.log(`ok - manager godkender og låser statussen; endelig rapport (${finalReport}) + rapport pr. optælling; % difference vises`)

    await chef.page.getByTestId('archive-materials').waitFor({ timeout: 30000 })
    await chef.page.getByRole('button', { name: '4900000001', exact: true }).click()
    await chef.page.getByText('Materialedokument 4900000001 er åbnet i SAP').waitFor({ timeout: 20000 })
    await chef.page.getByRole('button', { name: '105900001', exact: true }).click()
    await chef.page.getByText('SAP-dokument 105900001 er åbnet i SAP').waitFor({ timeout: 20000 })
    await shot(chef.page, '10-vis-i-sap')
    console.log('ok - den låste status viser SAP-dokument og materialedokument; "Vis i SAP" åbner dem (fake-SAP, kun visning)')

    await anna.page.getByRole('button', { name: 'Tilbage til optællinger' }).click()
    await anna.page.getByText('Venter på at en manager starter næste status').waitFor({ timeout: 30000 })
    await moduleNav(anna.page).getByRole('button', { name: 'Arkiv', exact: true }).click()
    await anna.page.getByText(STATUS, { exact: true }).waitFor({ timeout: 20000 })
    await anna.page.getByRole('button', { name: 'Se detaljer' }).click()
    await anna.page.getByTestId('archive-materials').waitFor({ timeout: 30000 })
    await shot(anna.page, '11-arkiv')
    console.log('ok - statussen ligger i Arkiv for medarbejderen med materialer og SAP-dokumenter')
  } finally {
    await anna.app.close().catch(() => {})
    await chef.app.close().catch(() => {})
  }
  const tcd = fs.readdirSync(path.join(root, 'TCD'))
  assert.equal(tcd.some(name => name.startsWith('count-') || name.startsWith('counts-')), false, 'Optællings data ligger aldrig i Hubbens teammappe')
  assert.equal(fs.existsSync(path.join(root, 'PIM', 'lagerstyring')), false, 'PIM får ingen lagerstyrings-mappe')
  console.log('ok - Optællings data ligger kun i TCD\\lagerstyring (og det fælles _lagerstyring), aldrig i Hubbens egne nøgler')
  console.log(`\nALLE TJEK OK. Skærmbilleder: ${evidence}`)
}

main().catch(error => {
  console.error('FEJL:', error)
  console.error(`Skærmbilleder: ${evidence}`)
  process.exit(1)
})
