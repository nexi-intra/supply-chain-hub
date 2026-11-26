const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { fetchParcels, sapErrorText, parseScriptOutput, DEFAULT_TMP_DIR } = require('./sap.cjs')

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'finland-sap-'))
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }))

const FIXTURE = path.join(__dirname, 'fixtures', 'zms-2026-11-24.tsv')
const RANGE = { from: '24.09.2026', to: '24.11.2026' }

function fakeBridge() {
  const bridge = { calls: 0, running: false }
  bridge.exclusive = async job => {
    bridge.calls++
    bridge.running = true
    try {
      return await job()
    } finally {
      bridge.running = false
    }
  }
  return bridge
}

// A runScript stand-in for zms-cons-info.vbs: `answer(args)` writes the list (or not) and returns stdout.
function fakeRunner(bridge, answer) {
  const calls = []
  const runScript = async (name, args, options) => {
    calls.push({ name, args, options, insideQueue: bridge.running })
    return answer(args)
  }
  return { runScript, calls }
}

test('fetches parcels through the SAP queue', async () => {
  const bridge = fakeBridge()
  const tmpDir = path.join(ROOT, 'fetch')
  const { runScript, calls } = fakeRunner(bridge, ([outFile]) => {
    fs.copyFileSync(FIXTURE, outFile)
    return 'Microsoft noise\r\n{"ok":true,"rows":1564}\r\n'
  })
  const parcels = await fetchParcels({ bridge, runScript, system: 'PS4', range: RANGE, tmpDir })
  assert.equal(bridge.calls, 1)
  assert.equal(parcels.length, 1564)
  assert.deepEqual(parcels.find(parcel => parcel.delivery === '82006464'), { delivery: '82006464', tracking: '00073215400717246984', orderType: 'ZRO', postalCode: '11130', country: 'FI', createdOn: '2026-09-24', shippedOn: '2026-09-24' })
  assert.equal(calls.length, 1)
  const [{ name, args, options, insideQueue }] = calls
  assert.equal(name, 'zms-cons-info')
  assert.ok(insideQueue, 'the script runs inside bridge.exclusive')
  assert.deepEqual(args.slice(1), ['PS4', 'F300', '24.09.2026', '24.11.2026'])
  assert.equal(path.dirname(args[0]), tmpDir)
  assert.match(args[0], /^[A-Za-z0-9 _.:\\/-]{0,260}$/)
  assert.deepEqual(options, { timeoutMs: 600000 })
  assert.deepEqual(fs.readdirSync(tmpDir), [], 'the list file is deleted')
})

test('the list file lives in the temp folder by default', () => {
  assert.equal(DEFAULT_TMP_DIR, path.join(os.tmpdir(), 'finlandsforsendelser'))
})

test('wrong language gives the Danish text', async () => {
  const bridge = fakeBridge()
  const tmpDir = path.join(ROOT, 'language')
  const { runScript } = fakeRunner(bridge, () => '{"ok":false,"error":"wrong-language","sap":""}\r\n')
  await assert.rejects(fetchParcels({ bridge, runScript, system: 'PS4', range: RANGE, tmpDir }), { code: 'FINLAND_SAP_FAILED', message: 'FINLAND_SAP_FAILED: Log på SAP på engelsk (EN), og prøv igen.' })
  assert.deepEqual(fs.readdirSync(tmpDir), [])
})

test("SAP's own message comes along, and an unknown code is named", () => {
  assert.equal(sapErrorText('sap-error', 'Enter a valid date'), 'SAP gav en fejl. SAP skrev: "Enter a valid date"')
  assert.match(sapErrorText('session-not-created'), /højst 6 ad gangen/)
  assert.match(sapErrorText('noget-nyt'), /noget-nyt/)
})

test("the script's last JSON line is read", () => {
  assert.deepEqual(parseScriptOutput('Microsoft noise\r\n{"ok":true,"rows":1564}\r\n'), { ok: true, rows: 1564 })
  assert.deepEqual(parseScriptOutput(''), { ok: false, error: 'no-output' })
})

test('a script that runs out of time gives the timeout text and leaves no file', async () => {
  const bridge = fakeBridge()
  const tmpDir = path.join(ROOT, 'timeout')
  const { runScript } = fakeRunner(bridge, ([outFile]) => {
    fs.writeFileSync(outFile, 'half')
    throw Object.assign(new Error('SAP_TIMEOUT'), { code: 'SAP_TIMEOUT' })
  })
  await assert.rejects(fetchParcels({ bridge, runScript, system: 'PS4', range: RANGE, tmpDir }), { code: 'FINLAND_SAP_FAILED', message: 'FINLAND_SAP_FAILED: SAP brugte mere end 10 minutter. Prøv igen.' })
  assert.deepEqual(fs.readdirSync(tmpDir), [])
})

test('ok without the list file says the script did not answer', async () => {
  const bridge = fakeBridge()
  const { runScript } = fakeRunner(bridge, () => '{"ok":true,"rows":3}')
  await assert.rejects(fetchParcels({ bridge, runScript, system: 'PS4', range: RANGE, tmpDir: path.join(ROOT, 'nofile') }), { code: 'FINLAND_SAP_FAILED', message: 'FINLAND_SAP_FAILED: SAP-scriptet svarede ikke.' })
})

test('a temp folder the SAP runner would refuse stops before SAP', async () => {
  const bridge = fakeBridge()
  const { runScript, calls } = fakeRunner(bridge, () => '{"ok":true,"rows":0}')
  await assert.rejects(fetchParcels({ bridge, runScript, system: 'PS4', range: RANGE, tmpDir: path.join(ROOT, 'Jørgen') }), error => error.code === 'FINLAND_SAP_FAILED' && /^FINLAND_SAP_FAILED: /.test(error.message))
  await assert.rejects(fetchParcels({ bridge, runScript, system: 'PS4', range: { from: '2026-09-24', to: '24.11.2026' }, tmpDir: path.join(ROOT, 'dates') }), { code: 'FINLAND_SAP_FAILED' })
  assert.equal(calls.length, 0)
})
