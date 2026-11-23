// Creates physical inventory documents in SAP (MI31) with scripts/sap/pidoc-create.vbs. First a test run that creates
// nothing and must list exactly the chosen materials without errors; then the filled screen waits for the user's F8;
// then the new documents are looked up in MI22 by the unique reference CountPoint stamped on them.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { parseMi31Log, parseMi22, parseMi20 } = require('./core/sapParsers.cjs')
const { putOnClipboard, CLIPBOARD_REFUSED } = require('./clipboardText.cjs')

const TEST_TIMEOUT_MS = 3 * 60 * 1000
const WAIT_SECONDS = 15 * 60
const REFERENCE = /^[A-Z0-9]{4,16}$/

function writeError(code, message, extra = {}) {
  return Object.assign(new Error(`${code}: ${message}`), { code }, extra)
}

function lastJsonLine(output) {
  try {
    return JSON.parse(String(output).trim().split(/\r?\n/).pop())
  } catch {
    return null
  }
}

function scriptFailure(result, what) {
  const error = String(result?.error || 'ukendt fejl').slice(0, 200)
  if (error === 'cancelled') return writeError('PIDOC_CANCELLED', `SAP-vinduet blev lukket (${what}) – intet er gemt i SAP`)
  if (error === 'timeout') return writeError('PIDOC_TIMEOUT', `Der blev ikke trykket i SAP i tide (${what}) – intet er gemt. Prøv igen`)
  if (error === 'language-not-supported') return writeError('PIDOC_SAP_LANGUAGE', 'Log på SAP på engelsk (EN), og prøv igen')
  if (/^not-logged-in-/.test(error)) return writeError('SAP_NOT_READY', `Du er ikke logget ind i ${error.slice('not-logged-in-'.length)}`)
  if (/^no-access-/.test(error)) return writeError('SAP_NO_ACCESS', `Du har ikke adgang til ${error.slice('no-access-'.length).toUpperCase()} i SAP`)
  if (/^not-created/.test(error)) return writeError('PIDOC_NOT_CREATED', `SAP oprettede ikke dokumentet (${error})`)
  return writeError('PIDOC_SAP_FAILED', `${what} fejlede: ${error}`)
}

function checkDoc({ docNo, year }) {
  if (!/^\d{9,10}$/.test(String(docNo || '')) || !/^\d{4}$/.test(String(year || ''))) throw writeError('PIDOC_INVALID', 'Ugyldigt dokument')
}

function createPiDocWriter({ bridge, runScript, clipboard, system, tempRoot = os.tmpdir(), waitSeconds = WAIT_SECONDS }) {
  let writing = false

  async function exclusiveWrite(job) {
    if (writing) throw writeError('PIDOC_BUSY', 'Der er allerede et SAP-dokument i gang på denne PC')
    writing = true
    const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-pidoc-'))
    try {
      return await job(dir)
    } finally {
      writing = false
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  }

  /** ZMS_COUNT_SERIAL for one material: fill, Check (stops on errors), wait for "Update Count", verify. */
  async function enterSerials({ docNo, year, material, serials }, { onWaiting = () => {} } = {}) {
    checkDoc({ docNo, year })
    const list = [...new Set((serials || []).map(item => String(item).trim().toUpperCase()).filter(Boolean))]
    if (!list.length || list.some(item => !/^[A-Z0-9]{1,40}$/.test(item))) throw writeError('PIDOC_INVALID', 'Ugyldige serienumre')
    return exclusiveWrite(async dir => {
      await fs.promises.writeFile(path.join(dir, 'serials.txt'), list.join('\r\n'), 'utf8')
      onWaiting()
      const result = lastJsonLine(await runScript('pidoc-serials', [system, String(docNo), String(year), String(material).toUpperCase(), dir, 'serials.txt', 'errors.txt', String(waitSeconds)], { timeoutMs: (waitSeconds + 300) * 1000 }))
      if (result?.error === 'check-errors') {
        const errors = (await fs.promises.readFile(path.join(dir, 'errors.txt'), 'utf8').catch(() => '')).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(line => { const [serial, message] = line.split('\t'); return { serial, message: message || '' } })
        const shown = errors.slice(0, 5).map(item => `${item.serial}: ${item.message}`).join('; ')
        throw writeError('PIDOC_CHECK_ERRORS', `SAP's Check fandt ${errors.length} fejl på ${material} – intet er opdateret. ${shown}${errors.length > 5 ? ' …' : ''}`, { errors })
      }
      if (result?.error === 'cancelled') throw writeError('PIDOC_CANCELLED', 'SAP-vinduet blev lukket uden Update Count – intet er opdateret')
      if (result?.error === 'not-counted') throw writeError('PIDOC_NOT_COUNTED', `${material} står ikke som talt i SAP`)
      if (!result?.ok) throw scriptFailure(result, 'ZMS_COUNT_SERIAL')
      return { counted: Number(result.counted) || 0, serials: Number(result.serials) || 0, newSerials: Number(result.newSerials) || 0 }
    })
  }

  /** MI04: quantities per material (0 = Zero Count), wait for Save, verify. */
  async function enterCounts({ docNo, year, entries }, { onWaiting = () => {} } = {}) {
    checkDoc({ docNo, year })
    if (!entries?.length || entries.some(entry => !/^[A-Z0-9-]{1,40}$/i.test(entry.material) || !Number.isInteger(entry.qty) || entry.qty < 0)) throw writeError('PIDOC_INVALID', 'Ugyldige antal')
    return exclusiveWrite(async dir => {
      await fs.promises.writeFile(path.join(dir, 'count.txt'), entries.map(entry => `${entry.material.toUpperCase()}\t${entry.qty}`).join('\r\n'), 'utf8')
      onWaiting()
      const result = lastJsonLine(await runScript('pidoc-count', [system, String(docNo), String(year), dir, 'count.txt', String(waitSeconds)], { timeoutMs: (waitSeconds + 300) * 1000 }))
      if (result?.error === 'cancelled') throw writeError('PIDOC_CANCELLED', 'SAP-vinduet blev lukket uden Gem – intet er gemt')
      if (/^not-counted/.test(result?.error || '')) throw writeError('PIDOC_NOT_COUNTED', `SAP viser ikke de rigtige antal (${result.error.slice(13)})`)
      if (!result?.ok) throw scriptFailure(result, 'MI04')
      return { message: String(result.message || '') }
    })
  }

  async function run(dir, mode, { sloc, stockType, reference, materials }, file, timeoutMs) {
    const many = materials.length > 1
    if (many && !(await putOnClipboard(clipboard, materials.join('\r\n')))) throw writeError('CLIPBOARD_REFUSED', CLIPBOARD_REFUSED)
    const args = [system, mode, sloc, stockType, reference, dir, file, String(mode === 'test' ? 60 : waitSeconds), materials[0], ...(many ? ['clipboard'] : [])]
    return lastJsonLine(await runScript('pidoc-create', args, { timeoutMs }))
  }

  /** `onWaiting()` is called when the filled MI31 screen is waiting for the user's F8. */
  async function createDocument({ sloc, stockType, reference, materials }, { onWaiting = () => {} } = {}) {
    const request = { sloc: String(sloc || '').toUpperCase(), stockType, reference: String(reference || '').toUpperCase(), materials: [...new Set(materials.map(item => String(item).toUpperCase()))] }
    if (!/^[A-Z0-9]{4}$/.test(request.sloc) || !['unrestricted', 'blocked'].includes(stockType) || !REFERENCE.test(request.reference) || !request.materials.length) throw writeError('PIDOC_INVALID', 'Ugyldig forespørgsel')
    if (request.materials.length > 1 && !clipboard) throw writeError('PIDOC_SAP_FAILED', 'Udklipsholderen er ikke tilgængelig')
    if (writing) throw writeError('PIDOC_BUSY', 'Der er allerede et SAP-dokument i gang på denne PC')
    writing = true
    const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-pidoc-'))
    try {
      const log = await bridge.exclusive(async () => {
        const result = await run(dir, 'test', request, 'test.txt', TEST_TIMEOUT_MS)
        if (!result?.ok) throw scriptFailure(result, 'Prøvekørslen i MI31')
        return parseMi31Log(await fs.promises.readFile(path.join(dir, 'test.txt'), 'utf8'))
      })
      const listed = new Set(log.items.filter(item => item.sloc === request.sloc).map(item => item.material))
      const missing = request.materials.filter(material => !listed.has(material))
      if (log.errors > 0 || missing.length) {
        const problems = log.items.filter(item => item.message).map(item => `${item.material}: ${item.message}`)
        throw writeError('PIDOC_NOT_POSSIBLE', `SAP vil ikke oprette dokument for ${missing.join(', ') || 'alle materialer'}${problems.length ? ` (${problems.join('; ')})` : ''}. Der er ikke oprettet noget`, { missing, problems })
      }
      onWaiting()
      const result = await run(dir, 'create', request, 'mi22.txt', (waitSeconds + 120) * 1000)
      if (!result?.ok) throw scriptFailure(result, 'Oprettelsen i MI31')
      const found = parseMi22(await fs.promises.readFile(path.join(dir, 'mi22.txt'), 'utf8')).filter(doc => doc.physInvNo === request.reference && doc.sloc === request.sloc)
      const byDoc = new Map()
      for (const doc of found) {
        if (!byDoc.has(doc.docNo)) byDoc.set(doc.docNo, [])
        byDoc.get(doc.docNo).push(doc.material)
      }
      const created = [...byDoc].map(([docNo, list]) => ({ docNo, materials: [...new Set(list)] }))
      return { docs: created, missing: request.materials.filter(material => !found.some(doc => doc.material === material)) }
    } finally {
      writing = false
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  }

  /**
   * MI20 for several documents: they are ticked, the user presses "Post Difference" and Save. Which documents were really
   * posted is read from MI22 afterwards (no longer "Doc. Active"); SAP's messages give the material documents.
   */
  async function postDocuments({ docNos, year }, { onWaiting = () => {} } = {}) {
    const list = [...new Set((docNos || []).map(String))]
    if (!list.length || list.some(docNo => !/^\d{9,10}$/.test(docNo)) || !/^\d{4}$/.test(String(year || ''))) throw writeError('PIDOC_INVALID', 'Ugyldige dokumenter')
    if (list.length > 1 && !clipboard) throw writeError('PIDOC_SAP_FAILED', 'Udklipsholderen er ikke tilgængelig')
    return exclusiveWrite(async dir => {
      if (list.length > 1 && !(await putOnClipboard(clipboard, list.join('\r\n')))) throw writeError('CLIPBOARD_REFUSED', CLIPBOARD_REFUSED)
      onWaiting()
      const result = lastJsonLine(await runScript('pidoc-post', [system, String(year), dir, 'mi20.txt', 'mi22.txt', String(waitSeconds), list[0], ...(list.length > 1 ? ['clipboard'] : [])], { timeoutMs: (waitSeconds + 300) * 1000 }))
      if (!result?.ok) throw scriptFailure(result, 'Bogføringen i MI20')
      const differences = parseMi20(await fs.promises.readFile(path.join(dir, 'mi20.txt'), 'utf8')).filter(item => list.includes(item.docNo))
      const status = parseMi22(await fs.promises.readFile(path.join(dir, 'mi22.txt'), 'utf8')).filter(doc => list.includes(doc.docNo))
      const materialDocs = {}
      for (const match of String(result.screens || '').matchAll(/doc\.\s*(\d{9,10})\s+posted with m\.\s*doc\.\s*(\d+)/gi)) materialDocs[match[1]] = match[2]
      const posted = list.filter(docNo => status.some(doc => doc.docNo === docNo) && status.filter(doc => doc.docNo === docNo).every(doc => !/active/i.test(doc.status)))
      return { posted, open: list.filter(docNo => !posted.includes(docNo)), differences, materialDocs }
    })
  }

  /** MI02: the user deletes from the initial screen (waste bin). Deleted = SAP's message, and MI22 no longer lists it as active. */
  async function deleteDocument({ docNo, year, reference }, { onWaiting = () => {} } = {}) {
    checkDoc({ docNo, year })
    if (!REFERENCE.test(String(reference || '').toUpperCase())) throw writeError('PIDOC_INVALID', 'Dokumentet mangler CountPoints kode')
    return exclusiveWrite(async dir => {
      onWaiting()
      const result = lastJsonLine(await runScript('pidoc-delete', [system, String(docNo), String(year), String(reference).toUpperCase(), dir, 'mi22.txt', String(waitSeconds)], { timeoutMs: (waitSeconds + 300) * 1000 }))
      if (result?.error === 'not-countpoint-document') throw writeError('PIDOC_FORBIDDEN', `${docNo} er ikke oprettet af CountPoint – slet det i SAP selv`)
      if (result?.error === 'already-counted') throw writeError('PIDOC_FORBIDDEN', `Der er lagt antal på ${docNo} i SAP – det kan ikke slettes`)
      if (result?.error === 'already-deleted') return { deleted: true, message: 'Allerede slettet i SAP' }
      if (!result?.ok) throw scriptFailure(result, 'Sletningen i MI02')
      const listed = await fs.promises.readFile(path.join(dir, 'mi22.txt'), 'utf8').then(text => parseMi22(text)).catch(() => [])
      const stillActive = listed.some(doc => doc.docNo === String(docNo) && /active/i.test(doc.status))
      const deleted = /deleted/i.test(String(result.message || '')) && !stillActive
      if (!deleted) throw writeError('PIDOC_NOT_DELETED', `${docNo} er ikke slettet i SAP`)
      return { deleted, message: String(result.message || '') }
    })
  }

  /** MI21 to DK_EN1_WHL4. QS4 only makes the spool request (no paper); elsewhere "Print Now" like the guide. */
  async function printDocument({ docNo, year, sloc }, { onWaiting = () => {} } = {}) {
    const request = { docNo: String(docNo || ''), year: String(year || ''), sloc: String(sloc || '').toUpperCase() }
    if (!/^\d{9,10}$/.test(request.docNo) || !/^\d{4}$/.test(request.year) || !/^[A-Z0-9]{4}$/.test(request.sloc)) throw writeError('PIDOC_INVALID', 'Ugyldig forespørgsel')
    if (writing) throw writeError('PIDOC_BUSY', 'Der er allerede et SAP-dokument i gang på denne PC')
    writing = true
    try {
      onWaiting()
      const printNow = system === 'QS4' ? '0' : '1'
      const result = lastJsonLine(await runScript('pidoc-print', [system, request.docNo, request.year, request.sloc, printNow, String(waitSeconds)], { timeoutMs: (waitSeconds + 120) * 1000 }))
      if (result?.error === 'cancelled') throw writeError('PIDOC_CANCELLED', 'Udskriften blev annulleret – dokumentet er ikke printet')
      if (!result?.ok) throw scriptFailure(result, 'Udskriften i MI21')
      return { message: String(result.message || '') }
    } finally {
      writing = false
    }
  }

  return { createDocument, printDocument, enterSerials, enterCounts, postDocuments, deleteDocument }
}

module.exports = { createPiDocWriter }
