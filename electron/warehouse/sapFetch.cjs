// Fetches the plant's stock from SAP: MB52 (quantities and values) and IQ09 (serial numbers,
// unrestricted and blocked), one export after another in CountPoint's own SAP session.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { computeSapState, EXPECTED } = require('./sapState.cjs')
const { parseMb52, parseIq09, parseMatdoc, normalizeMatdoc, parseLongSerno, parseStockCheck, parseMm60 } = require('./core/sapParsers.cjs')
const { MATERIAL_PATTERN } = require('./core/snapshot.cjs')
const { normalizeSerial } = require('./core/countState.cjs')
const { materialKind } = require('./core/classify.cjs')
const { putOnClipboard, CLIPBOARD_REFUSED } = require('./clipboardText.cjs')

const EXPORT_TIMEOUT_MS = 4 * 60 * 1000
const LONG_CHUNK = 1000
const TEXT_CHUNK = 500
// A material document typed without year is looked for this many years back, besides this year.
const MATDOC_YEARS_BACK = 2
const EXPORTS = Object.freeze([
  { step: 'mb52', args: ['mb52'], file: 'mb52.txt' },
  { step: 'iq09-unrestricted', args: ['iq09'], file: 'iq09-01.txt', stockArg: '01', stockType: 'unrestricted' },
  { step: 'iq09-blocked', args: ['iq09'], file: 'iq09-07.txt', stockArg: '07', stockType: 'blocked' },
])

function fetchError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code }, extra)
}

/** The export file SAP wrote; SAP saying "ok" without the file (saved under another name) is a failed export. */
async function readExport(file) {
  try {
    return await fs.promises.readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') throw fetchError('SAP_EXPORT_FAILED', 'SAP gemte ikke eksportfilen. Prøv igen.')
    throw error
  }
}

function lastJsonLine(output) {
  try {
    return JSON.parse(String(output).trim().split(/\r?\n/).pop())
  } catch {
    return null
  }
}

function createSapFetcher({ bridge, runScript, tempRoot = os.tmpdir(), expected = EXPECTED, now = Date.now, clipboard = null, longChunk = LONG_CHUNK, textChunk = TEXT_CHUNK }) {
  let running = null

  async function exportOne(definition, dir) {
    const args = [...definition.args, dir, definition.file, ...(definition.stockArg ? [definition.stockArg] : [])]
    const result = lastJsonLine(await runScript('export', args, { timeoutMs: EXPORT_TIMEOUT_MS }))
    if (!result?.ok) throw fetchError('SAP_EXPORT_FAILED', `SAP-eksport (${definition.step}) fejlede: ${String(result?.error || 'ukendt fejl').slice(0, 200)}`)
    if (result.rows === 0) return ''
    return readExport(path.join(dir, definition.file))
  }

  async function run(onProgress, exports = EXPORTS) {
    const progress = step => { try { onProgress?.(step) } catch {} }
    progress('check')
    const state = computeSapState(lastJsonLine(await runScript('status')) || {}, expected)
    if (!state.ready) throw fetchError('SAP_NOT_READY', 'SAP er ikke klar', { sapState: state.state })
    const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-sap-'))
    try {
      let mb52 = []
      const serials = []
      for (const definition of exports) {
        progress(definition.step)
        const text = await exportOne(definition, dir)
        if (definition.step === 'mb52') {
          mb52 = text ? parseMb52(text) : []
          // D301 always has stock: an empty list is an export that went wrong (count.md C3), never "nothing in stock".
          if (!mb52.length) throw fetchError('SAP_EXPORT_EMPTY', 'MB52 gav ingen rækker for D301. Prøv igen.')
        } else if (text) serials.push(...parseIq09(text, definition.stockType))
      }
      const unrestrictedFetched = exports.some(definition => definition.step === 'iq09-unrestricted')
      // INT materials (classify.cjs: new and used terminals) are serial-managed: stock in MB52 means serials in IQ09.
      const terminalsInStock = mb52.some(row => ['new', 'used'].includes(materialKind(row.material)) && row.unrestricted > 0)
      if (unrestrictedFetched && terminalsInStock && !serials.some(row => row.stockType === 'unrestricted')) {
        throw fetchError('SAP_EXPORT_EMPTY', 'IQ09 gav ingen serienumre i fri lager, men MB52 har INT-materialer på lager. Prøv igen.')
      }
      progress('done')
      return { mb52, serials, sapUser: state.user, fetchedAt: now() }
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  }

  /** One fetch at a time; callers that arrive while it runs share the result. */
  function fetchPlant({ onProgress } = {}) {
    if (!running) running = bridge.exclusive(() => run(onProgress)).finally(() => { running = null })
    return running
  }

  /** MB52 only (no IQ09): what Placeringer needs for SAP's material descriptions. */
  function fetchStock({ onProgress } = {}) {
    return bridge.exclusive(() => run(onProgress, EXPORTS.filter(definition => definition.step === 'mb52')))
  }

  /**
   * Serial numbers of a material document: ZMS_REP for TCD (no ZMS_PREP access), ZMS_PREP for TRR.
   * Neither finds a document by its number alone (no error, just no rows), so a number without year is tried with
   * this year and then each of the MATDOC_YEARS_BACK years before; `document` is the attempt used, with its year.
   */
  function fetchMatdoc({ team, document }) {
    const normalized = normalizeMatdoc(document)
    if (!normalized) return Promise.reject(fetchError('MATDOC_INVALID', 'Skriv materialedokumentet som fx "4900229137" eller "4900229137 2026 01"'))
    const mode = team === 'TCD' ? 'rep' : 'prep'
    const transaction = mode === 'rep' ? 'ZMS_REP' : 'ZMS_PREP'
    const year = new Date(now()).getFullYear()
    const attempts = /^\d{10}$/.test(normalized) ? Array.from({ length: MATDOC_YEARS_BACK + 1 }, (_, back) => `${normalized} ${year - back}`) : [normalized]
    return bridge.exclusive(async () => {
      const state = computeSapState(lastJsonLine(await runScript('status')) || {}, expected)
      if (!state.ready) throw fetchError('SAP_NOT_READY', 'SAP er ikke klar', { sapState: state.state })
      const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-sap-'))
      try {
        let found = { document: attempts[attempts.length - 1], rows: [], transaction }
        for (const attempt of attempts) {
          await fs.promises.rm(path.join(dir, 'matdoc.txt'), { force: true })
          const result = lastJsonLine(await runScript('matdoc', [mode, dir, 'matdoc.txt', attempt], { timeoutMs: EXPORT_TIMEOUT_MS }))
          if (result?.error && /^no-access-/.test(result.error)) throw fetchError('SAP_NO_ACCESS', `Du har ikke adgang til ${transaction} i SAP`)
          if (!result?.ok) throw fetchError('SAP_EXPORT_FAILED', `Opslaget af materialedokumentet fejlede: ${String(result?.error || 'ukendt fejl').slice(0, 200)}`)
          const rows = result.rows === 0 ? [] : parseMatdoc(await readExport(path.join(dir, 'matdoc.txt')))
          if (rows.length) { found = { document: attempt, rows, transaction }; break }
        }
        return found
      } finally {
        await fs.promises.rm(dir, { recursive: true, force: true })
      }
    })
  }

  /**
   * Long serial numbers (SERGE) from SQ01 query ZMS_LONG_SERNO for one material in D301.
   * VBScript cannot write the clipboard, so the short serials are put there here and the script uploads them into the
   * query's multiple selection. The clipboard is overwritten.
   */
  function fetchLongSerials({ material, serials }) {
    const code = String(material || '').trim().toUpperCase()
    if (!MATERIAL_PATTERN.test(code)) return Promise.reject(fetchError('MATERIAL_INVALID', 'Ugyldigt materialenummer'))
    const wanted = [...new Set((serials || []).map(normalizeSerial).filter(Boolean))]
    if (!wanted.length) return Promise.resolve([])
    if (!clipboard) return Promise.reject(fetchError('SAP_EXPORT_FAILED', 'Udklipsholderen er ikke tilgængelig'))
    return bridge.exclusive(async () => {
      const state = computeSapState(lastJsonLine(await runScript('status')) || {}, expected)
      if (!state.ready) throw fetchError('SAP_NOT_READY', 'SAP er ikke klar', { sapState: state.state })
      const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-sap-'))
      try {
        const rows = []
        for (let start = 0; start < wanted.length; start += longChunk) {
          const chunk = wanted.slice(start, start + longChunk)
          await fs.promises.writeFile(path.join(dir, 'in.txt'), chunk.join('\r\n'), 'utf8')
          await fs.promises.rm(path.join(dir, 'longserno.txt'), { force: true })
          if (!(await putOnClipboard(clipboard, chunk.join('\r\n')))) throw fetchError('CLIPBOARD_REFUSED', CLIPBOARD_REFUSED)
          const result = lastJsonLine(await runScript('longserno', [dir, 'longserno.txt', 'in.txt', code], { timeoutMs: EXPORT_TIMEOUT_MS }))
          if (result?.error && /^no-access-/.test(result.error)) throw fetchError('SAP_NO_ACCESS', 'Du har ikke adgang til SQ01-forespørgslen ZMS_LONG_SERNO i SAP')
          if (!result?.ok) throw fetchError('SAP_EXPORT_FAILED', `Opslaget af lange serienumre fejlede: ${String(result?.error || 'ukendt fejl').slice(0, 200)}`)
          if (result.rows > 0) rows.push(...parseLongSerno(await readExport(path.join(dir, 'longserno.txt'))))
        }
        const asked = new Set(wanted)
        return rows.filter(row => row.long && asked.has(row.serial) && (!row.material || row.material === code))
      } finally {
        await fs.promises.rm(dir, { recursive: true, force: true })
      }
    })
  }

  /** SAP's own comparison ZMS_STOCK_SER_CHK2 for D301, differences only. */
  function fetchStockCheck() {
    return bridge.exclusive(async () => {
      const state = computeSapState(lastJsonLine(await runScript('status')) || {}, expected)
      if (!state.ready) throw fetchError('SAP_NOT_READY', 'SAP er ikke klar', { sapState: state.state })
      const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-sap-'))
      try {
        const result = lastJsonLine(await runScript('stockcheck', [dir, 'stockcheck.txt'], { timeoutMs: EXPORT_TIMEOUT_MS }))
        if (result?.error && /^no-access-/.test(result.error)) throw fetchError('SAP_NO_ACCESS', 'Du har ikke adgang til ZMS_STOCK_SER_CHK2 i SAP')
        if (!result?.ok) throw fetchError('SAP_EXPORT_FAILED', `ZMS_STOCK_SER_CHK2 fejlede: ${String(result?.error || 'ukendt fejl').slice(0, 200)}`)
        return result.rows === 0 ? [] : parseStockCheck(await readExport(path.join(dir, 'stockcheck.txt')))
      } finally {
        await fs.promises.rm(dir, { recursive: true, force: true })
      }
    })
  }

  /**
   * SAP's own material descriptions from MM60 (material list, no plant filter) for materials MB52 does not show
   * because they have no stock. Same clipboard upload as fetchLongSerials; the clipboard is overwritten. With
   * `useClipboard: false` (background lookups) each material is passed to the script as an argument instead.
   */
  function fetchMaterialTexts({ materials, useClipboard = true } = {}) {
    const wanted = [...new Set((materials || []).map(material => String(material || '').trim().toUpperCase()).filter(material => MATERIAL_PATTERN.test(material)))]
    if (!wanted.length) return Promise.resolve([])
    if (useClipboard && !clipboard) return Promise.reject(fetchError('SAP_EXPORT_FAILED', 'Udklipsholderen er ikke tilgængelig'))
    return bridge.exclusive(async () => {
      const state = computeSapState(lastJsonLine(await runScript('status')) || {}, expected)
      if (!state.ready) throw fetchError('SAP_NOT_READY', 'SAP er ikke klar', { sapState: state.state })
      const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-sap-'))
      try {
        const rows = []
        const size = useClipboard ? textChunk : 1
        for (let start = 0; start < wanted.length; start += size) {
          const chunk = wanted.slice(start, start + size)
          await fs.promises.writeFile(path.join(dir, 'in.txt'), chunk.join('\r\n'), 'utf8')
          await fs.promises.rm(path.join(dir, 'mm60.txt'), { force: true })
          if (useClipboard && !(await putOnClipboard(clipboard, chunk.join('\r\n')))) throw fetchError('CLIPBOARD_REFUSED', CLIPBOARD_REFUSED)
          const result = lastJsonLine(await runScript('mm60', [dir, 'mm60.txt', 'in.txt', ...(useClipboard ? [] : [chunk[0]])], { timeoutMs: EXPORT_TIMEOUT_MS }))
          if (result?.error && /^no-access-/.test(result.error)) throw fetchError('SAP_NO_ACCESS', 'Du har ikke adgang til MM60 i SAP')
          if (!result?.ok) throw fetchError('SAP_EXPORT_FAILED', `MM60 fejlede: ${String(result?.error || 'ukendt fejl').slice(0, 1000)}`)
          if (result.rows !== 0) rows.push(...parseMm60(await readExport(path.join(dir, 'mm60.txt'))))
        }
        const asked = new Set(wanted)
        return rows.filter(row => asked.has(row.material))
      } finally {
        await fs.promises.rm(dir, { recursive: true, force: true })
      }
    })
  }

  return { fetchPlant, fetchStock, fetchMatdoc, fetchLongSerials, fetchStockCheck, fetchMaterialTexts }
}

module.exports = { createSapFetcher, EXPORT_TIMEOUT_MS }
