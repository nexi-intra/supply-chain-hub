// Fetches the parcels from SAP with ZMS_CONS_INFO (read only) through the Hub's SAP queue. The script writes the list
// as UTF-16 text to a file and prints JSON lines; the last one is the answer ({ ok, rows } or { ok:false, error, sap }).
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { parseSapList } = require('./core/sapList.cjs')

const TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_TMP_DIR = path.join(os.tmpdir(), 'finlandsforsendelser')
// The same rule the SAP runner checks every argument against (sapBridge.cjs).
const SAFE_ARGUMENT = /^[A-Za-z0-9 _.:\\/-]{0,260}$/
const SAP_DATE = /^\d{2}\.\d{2}\.\d{4}$/

const MESSAGES = Object.freeze({
  'sap-not-running': 'SAP er ikke åben. Start SAP Logon, log på og prøv igen.',
  'not-logged-in': 'Du er ikke logget på det rigtige SAP-system. Log på og prøv igen.',
  'wrong-language': 'Log på SAP på engelsk (EN), og prøv igen.',
  'sap-busy': 'SAP er optaget i alle dine vinduer. Vent til SAP er færdig, og prøv igen.',
  'session-not-created': 'SAP åbnede ikke et nyt vindue. Luk et SAP-vindue (højst 6 ad gangen), og prøv igen.',
  'screen-changed': 'Startskærmen i ZMS_cons_info ser anderledes ud end ventet. Programmet skal rettes.',
  'no-rows': 'ZMS_cons_info fandt ingen leverancer i perioden.',
  'sap-error': 'SAP gav en fejl.',
  'no-output': 'SAP-scriptet svarede ikke.',
  timeout: 'SAP brugte mere end 10 minutter. Prøv igen.',
})

function sapErrorText(code, sapText) {
  const base = MESSAGES[code] || `Uventet fejl fra SAP-scriptet (${code}).`
  return sapText ? `${base} SAP skrev: "${sapText}"` : base
}

function sapFailed(text, extra = {}) {
  return Object.assign(new Error(`FINLAND_SAP_FAILED: ${text}`), { code: 'FINLAND_SAP_FAILED' }, extra)
}

function parseScriptOutput(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{'))
  if (!lines.length) return { ok: false, error: 'no-output' }
  try {
    return JSON.parse(lines[lines.length - 1])
  } catch {
    return { ok: false, error: 'no-output' }
  }
}

/** Runs ZMS_CONS_INFO for created dates `range.from`..`range.to` (dd.mm.yyyy) and returns the parsed parcels. */
async function fetchParcels({ bridge, runScript, system, salesOrg = 'F300', range, tmpDir = DEFAULT_TMP_DIR }) {
  if (!SAP_DATE.test(range?.from || '') || !SAP_DATE.test(range?.to || '')) throw sapFailed('Perioden skal være datoer som dd.mm.åååå.')
  const outFile = path.join(tmpDir, `zms-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tsv`)
  if (!SAFE_ARGUMENT.test(outFile)) throw sapFailed(`SAP-listen kan ikke gemmes i den midlertidige mappe (${tmpDir}), fordi stien har tegn, SAP-scriptet ikke må få.`)
  await fs.promises.mkdir(tmpDir, { recursive: true })
  return bridge.exclusive(async () => {
    try {
      let stdout
      try {
        stdout = await runScript('zms-cons-info', [outFile, system, salesOrg, range.from, range.to], { timeoutMs: TIMEOUT_MS })
      } catch (error) {
        if (error?.code === 'SAP_TIMEOUT') throw sapFailed(sapErrorText('timeout'), { sapCode: 'timeout' })
        if (error?.code === 'SAP_SCRIPT_FAILED') throw sapFailed(sapErrorText('no-output'), { sapCode: 'no-output' })
        throw error
      }
      const result = parseScriptOutput(stdout)
      if (!result.ok) throw sapFailed(sapErrorText(result.error, result.sap), { sapCode: result.error })
      let list
      try {
        list = await fs.promises.readFile(outFile)
      } catch (error) {
        if (error?.code === 'ENOENT') throw sapFailed(sapErrorText('no-output'), { sapCode: 'no-output' })
        throw error
      }
      try {
        return parseSapList(list)
      } catch (error) {
        throw sapFailed(error.message, { sapCode: 'columns-changed' })
      }
    } finally {
      await fs.promises.rm(outFile, { force: true })
    }
  })
}

module.exports = { fetchParcels, sapErrorText, parseScriptOutput, DEFAULT_TMP_DIR, MESSAGES }
