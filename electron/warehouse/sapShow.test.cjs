const test = require('node:test')
const assert = require('node:assert/strict')
const { createSapViewer } = require('./sapShow.cjs')

function setup(answer = '{"ok":true}') {
  const calls = []
  const bridge = { exclusive: job => job() }
  const viewer = createSapViewer({ bridge, runScript: async (name, args) => { calls.push([name, ...args]); return `noise\r\n${typeof answer === 'function' ? answer() : answer}` } })
  return { viewer, calls }
}

test('shows a document through the display script with system, kind, number and year', async () => {
  const { viewer, calls } = setup()
  assert.deepEqual(await viewer.show({ system: 'QS4', kind: 'mb03', docNo: '4905204847', year: '2026' }), { ok: true })
  assert.deepEqual(calls, [['sap-show', 'QS4', 'mb03', '4905204847', '2026']])
})

test('refuses unknown systems, kinds and malformed numbers without running SAP', async () => {
  const { viewer, calls } = setup()
  for (const request of [{ system: 'XS4', kind: 'mi03', docNo: '105000894', year: '2026' }, { system: 'QS4', kind: 'mi02', docNo: '105000894', year: '2026' }, { system: 'QS4', kind: 'mi03', docNo: '1050 0894', year: '2026' }, { system: 'QS4', kind: 'mi03', docNo: '105000894', year: '26' }]) {
    await assert.rejects(viewer.show(request), { code: 'SAP_SHOW_INVALID' })
  }
  assert.equal(calls.length, 0)
})

test('script failures become Danish messages', async () => {
  await assert.rejects(setup('{"ok":false,"error":"not-logged-in-PS4"}').viewer.show({ system: 'PS4', kind: 'mi03', docNo: '105000894', year: '2026' }), { code: 'SAP_SHOW_FAILED', message: 'Log på PS4 i SAP først' })
  await assert.rejects(setup('{"ok":false,"error":"max-sessions"}').viewer.show({ system: 'PS4', kind: 'mi03', docNo: '105000894', year: '2026' }), /6 SAP-vinduer/)
})
