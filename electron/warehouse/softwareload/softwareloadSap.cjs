// Softwareload's SAP layer: serial lookup and Transfer in the cockpit (ZMS_REP for TCD, ZMS_PREP for TRR) and blocked
// stock (MIGO 344/343). Each call runs alone in its own SAP session (bridge.exclusive). Lists go to the cockpit via the
// clipboard; the user's text is put back afterwards.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { computeSapState, EXPECTED } = require('../sapState.cjs')
const { SOFTWARELOAD_WRITE_SYSTEMS } = require('../sapBridge.cjs')
const { parseSlLookup, parseSlErrors } = require('../core/sapParsers.cjs')
const { putOnClipboard, CLIPBOARD_REFUSED } = require('../clipboardText.cjs')
const { normalizeSerial } = require('../core/countState.cjs')
const { MATERIAL_PATTERN } = require('../core/snapshot.cjs')
const { normalizeSloc } = require('./core/planMoves.cjs')

const LOOKUP_CHUNK = 500
const TRANSFER_CHUNK = 200
const BLOCK_CHUNK = 20
const SCRIPT_TIMEOUT_MS = 5 * 60 * 1000
const MOVEMENT_TYPES = Object.freeze(['344', '343'])
const COCKPIT = Object.freeze({ rep: 'ZMS_REP', prep: 'ZMS_PREP' })
const ROWS_MISMATCH = 'SAP fandt ikke præcis de serienumre'

function sapError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code }, extra)
}

function lastJsonLine(output) {
  try {
    return JSON.parse(String(output).trim().split(/\r?\n/).pop())
  } catch {
    return null
  }
}

function uniqueSerials(serials) {
  return [...new Set((serials || []).map(normalizeSerial).filter(Boolean))]
}

/** A serial as the scripts compare it (SerialKey in the VBS): without leading zeros. */
const serialKey = serial => String(serial).replace(/^0+(?=.)/, '')

/** A failed script answer as an exception; `what` names the SAP step. */
function scriptFailure(result, what) {
  const error = String(result?.error || 'ukendt fejl').slice(0, 300)
  if (/^not-logged-in/.test(error)) return sapError('SAP_NOT_READY', `Du er ikke logget ind i ${error.slice('not-logged-in-'.length) || 'SAP'}`)
  if (/^no-access-/.test(error)) return sapError('SAP_NO_ACCESS', `Du har ikke adgang til ${error.slice('no-access-'.length).toUpperCase()} i SAP`)
  if (error === 'language-not-supported') return sapError('SOFTWARELOAD_SAP_LANGUAGE', 'Appen kan kun læse SAP\'s svar på engelsk. Log på SAP på engelsk (EN), og prøv igen. Der er ikke flyttet noget')
  return sapError('SOFTWARELOAD_SAP_FAILED', `${what} fejlede: ${error}`)
}

function createSoftwareloadSap({ bridge, runScript, clipboard, system, expected = EXPECTED, tempRoot = os.tmpdir() }) {
  const writeEnabled = SOFTWARELOAD_WRITE_SYSTEMS.includes(system)

  /** One SAP job: status first, a temp folder, and the user's clipboard text restored on every path. */
  function job(work, { useClipboard }) {
    return bridge.exclusive(async () => {
      const state = computeSapState(lastJsonLine(await runScript('status')) || {}, expected)
      if (!state.ready) throw sapError('SAP_NOT_READY', 'SAP er ikke klar', { sapState: state.state })
      if (useClipboard && !clipboard) throw sapError('SOFTWARELOAD_SAP_FAILED', 'Udklipsholderen er ikke tilgængelig')
      const saved = useClipboard ? await clipboard.readText() : null
      const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-softwareload-'))
      try {
        return await work(dir)
      } finally {
        if (useClipboard) {
          try { await clipboard.writeText(saved ?? '') } catch {}
        }
        await fs.promises.rm(dir, { recursive: true, force: true })
      }
    })
  }

  async function putList(serials) {
    if (!(await putOnClipboard(clipboard, serials.join('\r\n')))) throw sapError('SOFTWARELOAD_SAP_FAILED', CLIPBOARD_REFUSED)
  }

  /**
   * Runs a cockpit script, first in the team's cockpit and, when the user has no access to it, once in the other.
   * `cockpit.modes[cockpit.index]` is kept so later chunks go straight to the one that works.
   */
  async function onCockpit(cockpit, run) {
    for (;;) {
      const mode = cockpit.modes[cockpit.index]
      const result = lastJsonLine(await run(mode))
      if (!/^no-access-/.test(String(result?.error || ''))) return { mode, result }
      if (cockpit.index + 1 >= cockpit.modes.length) throw sapError('SAP_NO_ACCESS', 'Du har hverken adgang til ZMS_REP eller ZMS_PREP i SAP')
      cockpit.index++
    }
  }

  const cockpitFor = team => ({ modes: team === 'TCD' ? ['rep', 'prep'] : ['prep', 'rep'], index: 0 })

  function requireWrite() {
    if (!writeEnabled) throw sapError('SOFTWARELOAD_WRITE_DISABLED', `Softwareload må ikke flytte i SAP-systemet ${system || '(ukendt)'}`)
  }

  /**
   * Where each serial stands in SAP; serials SAP does not know are simply missing from the answer. A row for a serial
   * that was not asked for means the clipboard changed under the script, so the answer is not used. Rows carry the
   * serial as asked (SAP shows numeric serials without leading zeros).
   */
  async function lookup({ team, serials }) {
    const wanted = uniqueSerials(serials)
    if (!wanted.length) return []
    return job(async dir => {
      const cockpit = cockpitFor(team)
      const rows = []
      for (let start = 0; start < wanted.length; start += LOOKUP_CHUNK) {
        const chunk = wanted.slice(start, start + LOOKUP_CHUNK)
        await fs.promises.rm(path.join(dir, 'lookup.txt'), { force: true })
        await putList(chunk)
        const { mode, result } = await onCockpit(cockpit, mode => runScript('sl-lookup', [mode, dir, 'lookup.txt', chunk[0]], { timeoutMs: SCRIPT_TIMEOUT_MS }))
        if (!result?.ok) throw scriptFailure(result, `Opslaget i ${COCKPIT[mode]}`)
        if (!(result.rows > 0)) continue
        const asked = new Map(chunk.map(serial => [serialKey(serial), serial]))
        for (const row of parseSlLookup(await fs.promises.readFile(path.join(dir, 'lookup.txt'), 'utf8'))) {
          const serial = asked.get(serialKey(row.serial))
          if (!serial) throw sapError('SOFTWARELOAD_SAP_FAILED', 'Udklipsholderen blev ændret undervejs. Prøv igen')
          rows.push({ ...row, serial })
        }
      }
      return rows
    }, { useClipboard: true })
  }

  /**
   * One Transfer in the cockpit: all serials move from `from` to `to` in one material document, or none of them move.
   * The script refuses (`from-mismatch`) when a row no longer stands on `from`, as the cockpit moves from where it is.
   */
  async function transfer({ team, serials, from, to }) {
    requireWrite()
    const list = uniqueSerials(serials)
    const source = normalizeSloc(from)
    const target = normalizeSloc(to)
    if (!list.length || list.length > TRANSFER_CHUNK || list.length !== (serials || []).length || !source || !target) throw sapError('SOFTWARELOAD_INVALID', `Transfer kræver 1-${TRANSFER_CHUNK} gyldige serienumre, hvor de står, og et lagersted`)
    return job(async dir => {
      await fs.promises.writeFile(path.join(dir, 'in.txt'), list.join('\r\n'), 'utf8')
      await putList(list)
      const { mode, result } = await onCockpit(cockpitFor(team), mode => runScript('sl-transfer', [system, mode, target, dir, 'in.txt', 'errors.txt', source], { timeoutMs: SCRIPT_TIMEOUT_MS }))
      if (result?.ok && /^\d+$/.test(String(result.doc || ''))) return { ok: true, doc: String(result.doc) }
      if (result?.error === 'rows-mismatch') return { ok: false, message: ROWS_MISMATCH }
      if (result?.error === 'from-mismatch') return { ok: false, message: `Står ikke længere på ${source} i SAP` }
      if (result?.error === 'sap-errors') {
        const errors = parseSlErrors(await fs.promises.readFile(path.join(dir, 'errors.txt'), 'utf8').catch(() => ''))
        return { ok: false, message: [...new Set(errors.map(error => error.message))].join('; ') || 'SAP afviste flytningen' }
      }
      if (/^sap: /.test(String(result?.error || ''))) return { ok: false, message: result.error.slice(5) }
      throw scriptFailure(result, `Transfer i ${COCKPIT[mode]}`)
    }, { useClipboard: true })
  }

  /** MIGO 344 (into blocked stock) or 343 (back to unrestricted) for serials of one material on D301/D000. */
  async function block({ material, serials, bwart = '344' }) {
    requireWrite()
    const code = String(material || '').trim().toUpperCase()
    const list = uniqueSerials(serials)
    if (!MATERIAL_PATTERN.test(code) || !MOVEMENT_TYPES.includes(String(bwart)) || !list.length || list.length > BLOCK_CHUNK || list.length !== (serials || []).length) {
      throw sapError('SOFTWARELOAD_INVALID', `MIGO kræver ét materiale, 1-${BLOCK_CHUNK} gyldige serienumre og bevægelsesart 344 eller 343`)
    }
    return job(async dir => {
      await fs.promises.writeFile(path.join(dir, 'in.txt'), list.join('\r\n'), 'utf8')
      const result = lastJsonLine(await runScript('sl-block', [system, dir, 'in.txt', code, String(bwart)], { timeoutMs: SCRIPT_TIMEOUT_MS }))
      if (result?.ok && /^\d+$/.test(String(result.doc || ''))) return { ok: true, doc: String(result.doc) }
      if (/^sap: /.test(String(result?.error || ''))) return { ok: false, message: result.error.slice(5) }
      throw scriptFailure(result, `MIGO ${bwart}`)
    }, { useClipboard: false })
  }

  return { writeEnabled, lookup, transfer, block }
}

module.exports = { createSoftwareloadSap, LOOKUP_CHUNK, TRANSFER_CHUNK, BLOCK_CHUNK }
