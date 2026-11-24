const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ExcelJS = require('exceljs')
const { createStore } = require('../../store.cjs')
const { createLocationRepository } = require('./repository.cjs')
const { createLocationService } = require('./service.cjs')
const { readSheet, planImport } = require('./sheetImport.cjs')

const HEADER = ['Lokation 1/0', 'Alder - dage', 'Område', 'Placering', 'Type', 'Højde', 'SAP mat. No.', 'SAP Description', 'Antal', 'Dato', 'Leverandør mat. no.', 'Kommentarer']
const NOW = Date.UTC(2026, 9, 20)
const SAP = { 'R162-0717': 'Ethernet Cable RJ45 2m', 'R133-0032': 'Move3500 12V DC car charger', 'R162-0553': 'iPP USB cable', 'R133-0049': 'PSU 5V' }

/** A small sheet shaped like Placeringsark_*.xlsm: formulas with results, an #N/A area, a cell note. */
async function makeSheet(dir) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Data')
  sheet.addRow(HEADER)
  const row = (area, name, type, material = '', description = '', quantity = '', date = '', supplier = '', comment = '') => {
    const added = sheet.addRow([{ formula: 'IF(I2<>"",1,0)', result: quantity === '' ? 0 : 1 }, '', area, name, type, '', material, description, quantity, date || null, supplier, comment])
    return added
  }
  row({ formula: 'VLOOKUP(1,1,1)', result: 'A' }, 'A2.1', 'Palle', 'R162-0717', 'Ethernet 2m', 1120, new Date(Date.UTC(2024, 10, 7)), '', 'FAST PLADS')
  row('A', 'A2.4', 'Palle', 'R162-0717', 'Ethernet Cable RJ45 2m', 50, new Date(Date.UTC(2024, 10, 18)), '5000032337 2026 0001')
  row('H', 'H26', 'Hylde', 'R162-0717', '', 40, '', '', 'PLUK')
  row('H', 'H1', 'Hylde', 'R133-0032', '', 10, '', '', 'PLUK')
  row('H', 'H1', 'Hylde', 'R162-0553', '', '', '', '', 'PLUK')
  row('I', 'I8', 'Bord', 'R162-0717', '', '', '', '', 'PLUK')
  row('A', 'A17.1', 'Palle', '999-999', 'TERMINAL REOL', 0)
  row('C', 'C16.2', 'Palle')
  row({ formula: 'VLOOKUP(1,1,1)', result: { error: '#N/A' } }, 'K12', 'Reol 2', 'R999-9999', 'Ukendt', 5, '', '296200526', 'Sluse oppe - med skruer')
  row('F', 'F1.0', 'Palle', 'R133-0049', 'PSU', 300, new Date(Date.UTC(2026, 0, 1)))
  row('F', 'F1.0', 'Palle')
  row('F', 'F1.0', 'Palle')
  sheet.getCell('H3').note = 'incl. R133-0054 R162-0798'
  const file = path.join(dir, 'Placeringsark_20_10_2026_15_38.xlsx')
  await workbook.xlsx.writeFile(file)
  return file
}

test('readSheet reads values, formula results and cell notes, and treats #N/A as empty', async () => {
  const file = await makeSheet(fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-')))
  const rows = await readSheet(file)
  assert.equal(rows.length, 12)
  assert.deepEqual([rows[0].name, rows[0].area, rows[0].type, rows[0].material, rows[0].quantity, rows[0].comment], ['A2.1', 'A', 'Palle', 'R162-0717', 1120, 'FAST PLADS'])
  assert.equal(new Date(rows[0].date).getUTCFullYear(), 2024)
  assert.equal(rows[1].cellNote, 'incl. R133-0054 R162-0798')
  assert.equal(rows[8].area, '', '#N/A is empty')
})

test('planImport turns PLUK in area I into stations, PLUK elsewhere into pick places, FAST into fixed reserve places and 999-999 into reserved', async () => {
  const rows = await readSheet(await makeSheet(fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'))))
  const plan = planImport(rows, { sapTexts: SAP, now: NOW })
  const at = Object.fromEntries(plan.locations.map(location => [location.id, location]))
  assert.deepEqual([at.I8.purpose, at.I8.fixedMaterials], ['station', ['R162-0717']])
  assert.deepEqual([at.H1.purpose, at.H1.fixedMaterials, at.H1.capacity], ['pick', ['R133-0032', 'R162-0553'], 2])
  assert.deepEqual([at['A2.1'].purpose, at['A2.1'].fixedMaterials], ['reserve', ['R162-0717']])
  assert.deepEqual([at['A17.1'].purpose, at['A17.1'].note], ['reserved', 'TERMINAL REOL'])
  assert.deepEqual([at['C16.2'].purpose, at['C16.2'].fixedMaterials], ['reserve', []])
  assert.deepEqual([at['F1.0'].capacity, at.K12.type], [1, 'Reol'], 'F1.0 is a pallet place in the fixture: one pallet, the rest kept with a warning')
  assert.ok(plan.warnings.some(warning => warning.name === 'F1.0' && warning.code === 'PALLET_PLACE_MANY'))
  assert.equal(plan.pick, undefined, 'pick places have no status')
})

test('pallets get quantity, date and the 49/50 number; other supplier numbers go to the note', async () => {
  const rows = await readSheet(await makeSheet(fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'))))
  const plan = planImport(rows, { sapTexts: { ...SAP, 'R999-9999': 'Kendt nu' }, now: NOW })
  const byPlace = Object.fromEntries(plan.pallets.map(pallet => [pallet.location, pallet]))
  assert.deepEqual(Object.keys(byPlace).sort(), ['A2.1', 'A2.4', 'F1.0', 'K12'], 'pick places, stations and reserved places get no pallets')
  assert.equal(byPlace['A2.4'].document, '5000032337 2026 0001')
  assert.equal(byPlace['A2.1'].receivedAt, Date.UTC(2024, 10, 7))
  assert.equal(byPlace['A2.1'].quantity, 1120)
  assert.match(byPlace.K12.note, /296200526/)
  assert.deepEqual(byPlace.K12.tags, ['Sluse oppe'])
  assert.match(byPlace.K12.note, /med skruer/)
  assert.match(byPlace['A2.4'].note, /incl\. R133-0054 R162-0798/)
  assert.equal(byPlace['F1.0'].receivedAt, Date.UTC(2026, 0, 1))
})

test('descriptions come from SAP only; a sheet description that differs is a warning, a material SAP does not know is NOT_IN_SAP and no pallet', async () => {
  const rows = await readSheet(await makeSheet(fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'))))
  const plan = planImport(rows, { sapTexts: SAP, now: NOW })
  const codes = plan.warnings.map(warning => `${warning.name}:${warning.code}`)
  assert.ok(codes.includes('A2.1:DESCRIPTION_DIFFERS'), 'Ethernet 2m ≠ Ethernet Cable RJ45 2m')
  assert.ok(!codes.includes('A2.4:DESCRIPTION_DIFFERS'))
  assert.ok(codes.includes('K12:NOT_IN_SAP'))
  assert.ok(!codes.some(code => code.startsWith('A17.1:NOT_IN_SAP')), '999-999 is a reserved place, not a material')
  assert.ok(!plan.pallets.some(pallet => pallet.material === 'R999-9999'))
  assert.equal(JSON.stringify({ locations: plan.locations, pallets: plan.pallets }).includes('Ethernet 2m"'), false, 'the sheet text is never stored')
})

test('rows on the same location become one place with that capacity; #N/A areas come from the name with a warning', async () => {
  const rows = await readSheet(await makeSheet(fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'))))
  const plan = planImport(rows, { sapTexts: SAP, now: NOW })
  assert.equal(plan.locations.filter(location => location.id === 'F1.0').length, 1)
  assert.equal(plan.locations.find(location => location.id === 'K12').area, 'K')
  assert.ok(plan.warnings.some(warning => warning.name === 'K12' && warning.code === 'AREA_FROM_NAME'))
  assert.deepEqual(plan.stats.byPurpose, { reserve: 5, pick: 2, station: 1, reserved: 1 })
  assert.equal(plan.stats.locations, 9)
})

test('applyImport refuses without SAP, refuses over existing data unless replace, and refuses after go-live', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'))
  const file = await makeSheet(dir)
  const store = createStore(path.join(dir, 'data'))
  let ids = 0
  const repo = createLocationRepository({ storeFor: () => store, now: () => NOW, newId: () => `id${++ids}` })
  let sapReady = false
  const learned = []
  const catalog = {
    describe: async () => ({}), learn: async () => {},
    describeFromSap: async materials => {
      if (!sapReady) throw Object.assign(new Error('SAP_NOT_READY'), { code: 'SAP_NOT_READY' })
      learned.push(...materials)
      return { texts: Object.fromEntries(materials.filter(material => SAP[material]).map(material => [material, SAP[material]])), unknown: materials.filter(material => !SAP[material]) }
    },
  }
  const service = createLocationService({ repo, catalog, fetcher: {}, isLocationAdmin: async user => user.role === 'manager', sheetSource: { find: () => file }, now: () => NOW, newId: () => `id${++ids}` })
  const MONA = { email: 'mona@x.test', fullName: 'Mona', role: 'manager', team: 'TCD' }
  await assert.rejects(service.previewImport({ ...MONA, role: 'user' }), { code: 'LOCATIONS_MANAGER_ONLY' })
  await assert.rejects(service.previewImport(MONA), { code: 'SAP_NOT_READY' })
  sapReady = true
  const steps = []
  const preview = await service.previewImport(MONA, { onProgress: step => steps.push(step) })
  assert.deepEqual(steps, ['sheet', 'plan', 'done'], 'the import tells how far it is (the fake catalog has no SAP steps)')
  assert.equal(preview.file, 'Placeringsark_20_10_2026_15_38.xlsx')
  assert.equal(preview.stats.locations, 9)
  assert.ok(learned.includes('R162-0717'))
  assert.deepEqual(await service.applyImport(MONA, { token: preview.token }), { locations: 9, pallets: 3 })
  const state = await repo.read('TCD')
  assert.equal(state.meta.importedFrom, 'Placeringsark_20_10_2026_15_38.xlsx')
  assert.ok(state.meta.shelvesMigratedAt, 'an imported sheet needs no shelf migration')
  assert.deepEqual(state.stock, {}, 'the fixture sheet has no lagerhylde rows')
  const imported = (await service.log(MONA, { type: 'import' })).events[0]
  assert.deepEqual([imported.canUndo, imported.change], [false, undefined], 'an import is in the log but cannot be undone')
  await assert.rejects(service.undo(MONA, { eventId: imported.id }), { code: 'UNDO_NOT_POSSIBLE' })
  assert.equal(state.pick, undefined)
  await assert.rejects(service.applyImport(MONA, { token: preview.token }), { code: 'PREVIEW_EXPIRED' }, 'a preview is used once')
  const again = await service.previewImport(MONA)
  await assert.rejects(service.applyImport(MONA, { token: again.token }), { code: 'LOCATIONS_NOT_EMPTY' })
  assert.deepEqual(await service.applyImport(MONA, { token: again.token, replace: true }), { locations: 9, pallets: 3 })
  await service.take({ ...MONA, role: 'user' }, { pallet: Object.keys((await repo.read('TCD')).pallets)[0] })
  const late = await service.previewImport(MONA)
  assert.equal(late.live, true)
  await assert.rejects(service.applyImport(MONA, { token: late.token, replace: true }), { code: 'LOCATIONS_LIVE' })
})

test('the real sheet imports without errors', { skip: !process.env.TCD_HUB_PLACEMENT_SHEET }, async () => {
  const rows = await readSheet(process.env.TCD_HUB_PLACEMENT_SHEET)
  const materials = [...new Set(rows.map(row => row.material).filter(Boolean))]
  const plan = planImport(rows, { sapTexts: Object.fromEntries(materials.map(material => [material, 'x'])), now: NOW })
  assert.ok(plan.stats.locations > 800, `${plan.stats.locations} places`)
  assert.ok(plan.pallets.length > 300, `${plan.pallets.length} pallets`)
  console.log(JSON.stringify(plan.stats))
})

test('no sheet row disappears silently: materials without quantity become fixed places, mixed places keep their pallets, the rest is warned about', () => {
  const at = (row, name, extra = {}) => ({ row, name, area: name.replace(/\d.*$/, ''), type: 'Palle', material: '', sheetDescription: '', quantity: null, date: null, supplier: '', comment: '', cellNote: '', ...extra })
  const rows = [
    at(2, 'A5.1', { material: 'R162-0717' }),
    at(3, 'H30', { type: 'Hylde', material: 'R162-0717', quantity: 5, comment: 'PLUK - bag reolen' }),
    at(4, 'H30', { type: 'Hylde', material: 'R133-0032', quantity: 7 }),
    at(5, 'A9.9', { material: '999-999', sheetDescription: 'TERMINAL REOL', comment: 'Til Jens' }),
    at(6, 'A9.9', { material: 'R133-0032', quantity: 3 }),
    at(7, 'C2.2', { quantity: 12 }),
    at(8, 'H31', { type: 'Hylde', material: 'R162-0717', quantity: 5, comment: 'PLUK', cellNote: 'kasse 2' }),
  ]
  const plan = planImport(rows, { sapTexts: SAP, now: NOW })
  const place = Object.fromEntries(plan.locations.map(location => [location.id, location]))
  assert.deepEqual([place['A5.1'].purpose, place['A5.1'].fixedMaterials], ['reserve', ['R162-0717']], 'material without quantity = fixed place')
  assert.deepEqual([place.H30.purpose, place.H30.fixedMaterials], ['reserve', ['R162-0717']], 'PLUK next to pallets: a reserve place that keeps them')
  assert.deepEqual([place['A9.9'].purpose, place['A9.9'].note], ['reserve', 'TERMINAL REOL · Til Jens'])
  assert.deepEqual(plan.pallets.map(pallet => `${pallet.location}:${pallet.material}:${pallet.quantity}`).sort(), ['A9.9:R133-0032:3'])
  assert.deepEqual(plan.stock.map(line => `${line.location}:${line.material}:${line.quantity}`).sort(), ['H30:R133-0032:7', 'H30:R162-0717:5'], 'a lagerhylde keeps its rows as stock')
  assert.match(plan.stock.find(line => line.location === 'H30' && line.material === 'R162-0717').note, /bag reolen/)
  assert.deepEqual(plan.warnings.filter(warning => warning.code === 'MIXED_PLACE').map(warning => warning.name).sort(), ['A9.9', 'H30'])
  assert.deepEqual(plan.warnings.filter(warning => warning.code === 'ROW_SKIPPED').map(warning => warning.row), [7])
  assert.deepEqual([place.H31.purpose, place.H31.note], ['pick', 'kasse 2'], 'a pure pick place keeps its comments as a note')
})

test('materials SAP could not be asked about are imported with a NOT_CHECKED warning instead of being dropped', () => {
  const rows = [{ row: 2, name: 'A1.1', area: 'A', type: 'Palle', material: 'R555-0001', sheetDescription: 'Kabel', quantity: 4, date: null, supplier: '', comment: '', cellNote: '' }]
  const plan = planImport(rows, { sapTexts: {}, unchecked: ['R555-0001'], now: NOW })
  assert.deepEqual(plan.pallets.map(pallet => pallet.material), ['R555-0001'])
  assert.deepEqual(plan.warnings.map(warning => warning.code), ['NOT_CHECKED'])
})

test('rows on a lagerhylde become summed stock, rack and shelf are read from the name, and a crowded pallet place is warned about', () => {
  const at = (row, name, extra = {}) => ({ row, name, area: name.replace(/\d.*$/, ''), type: 'Palle', material: '', sheetDescription: '', quantity: null, date: null, supplier: '', comment: '', cellNote: '', ...extra })
  const rows = [
    at(2, 'E9 H5', { type: 'Hylde', material: 'R162-0717', quantity: 10, supplier: '5000032337' }),
    at(3, 'E9 H5', { type: 'Hylde', material: 'R162-0717', quantity: 5 }),
    at(4, 'E9 H5', { type: 'Hylde', material: 'R133-0032', quantity: 7 }),
    at(5, 'A1.1', { material: 'R162-0717', quantity: 3 }),
    at(6, 'A1.1', { material: 'R162-0717', quantity: 4 }),
    at(7, 'F1.0', { type: 'Gulv', material: 'R162-0717', quantity: 4 }),
    at(8, 'F1.0', { type: 'Gulv', material: 'R162-0717', quantity: 4 }),
  ]
  const plan = planImport(rows, { sapTexts: SAP, now: NOW })
  const place = Object.fromEntries(plan.locations.map(location => [location.id, location]))
  assert.deepEqual(Object.fromEntries(plan.stock.map(line => [line.id, line.quantity])), { 'E9 H5|R162-0717': 15, 'E9 H5|R133-0032': 7 })
  assert.match(plan.stock.find(line => line.id === 'E9 H5|R162-0717').note, /5000032337/)
  assert.equal(plan.pallets.filter(pallet => pallet.location === 'E9 H5').length, 0)
  assert.deepEqual([place['E9 H5'].rack, place['E9 H5'].shelf], ['E9', 5])
  assert.deepEqual([place['A1.1'].capacity, place['F1.0'].capacity], [1, 0], 'the type decides the capacity')
  assert.equal(plan.pallets.filter(pallet => pallet.location === 'A1.1').length, 2, 'the sheet data is kept')
  assert.deepEqual(plan.warnings.filter(warning => warning.code === 'PALLET_PLACE_MANY').map(warning => warning.name), ['A1.1'])
  assert.equal(plan.stats.stock, 2)
})
