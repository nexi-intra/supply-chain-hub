// Creates physical inventory documents in SAP (MI31) with scripts/sap/pidoc-create.vbs. First a test run that creates
// nothing and must list exactly the chosen materials without errors; then the filled screen waits for the user's F8;
// then the new documents are looked up in MI22 by the unique reference CountPoint stamped on them.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { parseSapNumber, parseMi31Log, parseMi22, parseMi20 } = require('./core/sapParsers.cjs')
const { putOnClipboard, CLIPBOARD_REFUSED } = require('./clipboardText.cjs')
const { computeSapState, EXPECTED } = require('./sapState.cjs')

const TEST_TIMEOUT_MS = 3 * 60 * 1000
// "Tjek i SAP": its own session, MI22 and MI20.
const CHECK_TIMEOUT_MS = 3 * 60 * 1000
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

/** After a timeout the scripts read SAP back; when even that fails, nobody knows whether the user saved. */
function unknownState(name, detail) {
  console.error('CountPoint: PI document state unknown', name, detail)
  return writeError('PIDOC_UNKNOWN', 'Optælling ved ikke, om SAP har gemt. Tjek dokumentet i SAP (MI03).', { detail: String(detail ?? '').slice(0, 200) })
}

/**
 * pidoc-create.vbs answers that end before the user's F8 in MI31 (nothing can have been created): the checks before the
 * screen is handed over, a closed window that MI22 lists nothing for and that was never seen working ("cancelled"), and
 * no F8 in time. Every other failure comes after F8 (MI31's answer or the MI22 lookup, also the check of its reference
 * field, and "closed-unknown": a closed window seen working with nothing in MI22), so SAP may have created the documents.
 */
function beforeF8(error) {
  const text = String(error || '')
  if (/^field-not-set: .*IM_INVNU/.test(text)) return false
  return /^(arguments|invalid-mode|invalid-stock-type|out-dir-missing|sap-not-running|sap-busy|session-not-created|wrong-system|language-not-supported|no-access-mi31|multiple-selection-failed|mi31-screen-changed|cancelled|timeout)$/.test(text)
    || /^not-logged-in-/.test(text) || /^field-not-set: /.test(text)
}

function createPiDocWriter({ bridge, runScript, clipboard, system, expected = { system, client: EXPECTED.client }, tempRoot = os.tmpdir(), waitSeconds = WAIT_SECONDS }) {
  let writing = false

  /**
   * One write in the SAP queue: SAP is checked first, and the queue is held until the script says the user has SAP
   * ({"stage":"waiting"}; then `onWaiting()` is called) or ends, also when it fails. `work(onLine)` passes `onLine` to
   * the script that hands SAP to the user.
   */
  function inQueue(onWaiting, work) {
    return bridge.handOver(async release => {
      const state = computeSapState(lastJsonLine(await runScript('status')) || {}, expected)
      if (!state.ready) throw writeError('SAP_NOT_READY', 'SAP er ikke klar', { sapState: state.state })
      let handedOver = false
      return work(line => {
        if (line?.stage !== 'waiting' || handedOver) return
        handedOver = true
        release()
        onWaiting()
      })
    })
  }

  /** Wraps `onLine` and remembers whether the script has said {"stage":"waiting"}: from then on the user has SAP. */
  function watchHandOver(onLine = () => {}) {
    const watch = {
      handedOver: false,
      onLine: line => {
        if (line?.stage === 'waiting') watch.handedOver = true
        onLine(line)
      },
    }
    return watch
  }

  /** A script that hands SAP to the user: killed at the time limit after the hand-over, the user may have saved meanwhile. */
  async function runWaiting(name, args, options) {
    const watch = watchHandOver(options.onLine)
    try {
      return await runScript(name, args, { ...options, onLine: watch.onLine })
    } catch (error) {
      if (error?.code === 'SAP_TIMEOUT' && watch.handedOver) throw unknownState(name, error.code)
      throw error
    }
  }
  async function exclusiveWrite(onWaiting, job) {
    if (writing) throw writeError('PIDOC_BUSY', 'Der er allerede et SAP-dokument i gang på denne PC')
    writing = true
    const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-pidoc-'))
    try {
      return await inQueue(onWaiting, onLine => job(dir, onLine))
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
    return exclusiveWrite(onWaiting, async (dir, onLine) => {
      await fs.promises.writeFile(path.join(dir, 'serials.txt'), list.join('\r\n'), 'utf8')
      const result = lastJsonLine(await runWaiting('pidoc-serials', [system, String(docNo), String(year), String(material).toUpperCase(), dir, 'serials.txt', 'errors.txt', String(waitSeconds)], { timeoutMs: (waitSeconds + 300) * 1000, onLine }))
      if (result?.error === 'check-errors') {
        const errors = (await fs.promises.readFile(path.join(dir, 'errors.txt'), 'utf8').catch(() => '')).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(line => { const [serial, message] = line.split('\t'); return { serial, message: message || '' } })
        const shown = errors.slice(0, 5).map(item => `${item.serial}: ${item.message}`).join('; ')
        throw writeError('PIDOC_CHECK_ERRORS', `SAP's Check fandt ${errors.length} fejl på ${material} – intet er opdateret. ${shown}${errors.length > 5 ? ' …' : ''}`, { errors })
      }
      if (result?.error === 'cancelled') throw writeError('PIDOC_CANCELLED', 'SAP-vinduet blev lukket uden Update Count – intet er opdateret')
      if (result?.error === 'not-counted') throw writeError('PIDOC_NOT_COUNTED', `${material} står ikke som talt i SAP`)
      if (/^not-counted: /.test(result?.error || '')) {
        const counted = parseSapNumber(result.error.slice('not-counted: '.length))
        throw writeError('PIDOC_NOT_COUNTED', `SAP har talt ${Number.isNaN(counted) ? result.error.slice('not-counted: '.length) : counted} på ${material}, men der blev sendt ${list.length} serienumre. Tjek dokumentet i SAP (MI03)`, { counted })
      }
      if (!result?.ok && (result?.timedOut || result?.error === 'verify-failed')) throw unknownState('pidoc-serials', result?.error)
      if (!result?.ok) throw scriptFailure(result, 'ZMS_COUNT_SERIAL')
      return { counted: parseSapNumber(result.counted) || 0, serials: Number(result.serials) || 0, newSerials: Number(result.newSerials) || 0 }
    })
  }

  /** MI04: quantities per material (0 = Zero Count), wait for Save, verify. */
  async function enterCounts({ docNo, year, entries }, { onWaiting = () => {} } = {}) {
    checkDoc({ docNo, year })
    if (!entries?.length || entries.some(entry => !/^[A-Z0-9-]{1,40}$/i.test(entry.material) || !Number.isInteger(entry.qty) || entry.qty < 0)) throw writeError('PIDOC_INVALID', 'Ugyldige antal')
    return exclusiveWrite(onWaiting, async (dir, onLine) => {
      await fs.promises.writeFile(path.join(dir, 'count.txt'), entries.map(entry => `${entry.material.toUpperCase()}\t${entry.qty}`).join('\r\n'), 'utf8')
      const result = lastJsonLine(await runWaiting('pidoc-count', [system, String(docNo), String(year), dir, 'count.txt', String(waitSeconds)], { timeoutMs: (waitSeconds + 300) * 1000, onLine }))
      if (result?.error === 'cancelled') throw writeError('PIDOC_CANCELLED', 'SAP-vinduet blev lukket uden Gem – intet er gemt')
      if (/^not-counted/.test(result?.error || '')) throw writeError('PIDOC_NOT_COUNTED', `SAP viser ikke de rigtige antal (${result.error.slice(13)})`)
      if (!result?.ok && (result?.timedOut || result?.error === 'verify-failed')) throw unknownState('pidoc-count', result?.error)
      if (!result?.ok) throw scriptFailure(result, 'MI04')
      return { message: String(result.message || '') }
    })
  }

  async function run(dir, mode, { sloc, stockType, reference, materials }, file, timeoutMs, onLine) {
    const many = materials.length > 1
    if (many && !(await putOnClipboard(clipboard, materials.join('\r\n')))) throw writeError('CLIPBOARD_REFUSED', CLIPBOARD_REFUSED)
    const args = [system, mode, sloc, stockType, reference, dir, file, String(mode === 'test' ? 60 : waitSeconds), materials[0], ...(many ? ['clipboard'] : [])]
    return lastJsonLine(await runScript('pidoc-create', args, { timeoutMs, onLine }))
  }

  /** `onWaiting()` is called when the script says the filled MI31 screen is waiting for the user's F8. */
  async function createDocument({ sloc, stockType, reference, materials }, { onWaiting = () => {} } = {}) {
    const request = { sloc: String(sloc || '').toUpperCase(), stockType, reference: String(reference || '').toUpperCase(), materials: [...new Set(materials.map(item => String(item).toUpperCase()))] }
    if (!/^[A-Z0-9]{4}$/.test(request.sloc) || !['unrestricted', 'blocked'].includes(stockType) || !REFERENCE.test(request.reference) || !request.materials.length) throw writeError('PIDOC_INVALID', 'Ugyldig forespørgsel')
    if (request.materials.length > 1 && !clipboard) throw writeError('PIDOC_SAP_FAILED', 'Udklipsholderen er ikke tilgængelig')
    if (writing) throw writeError('PIDOC_BUSY', 'Der er allerede et SAP-dokument i gang på denne PC')
    writing = true
    const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-pidoc-'))
    let create
    try {
      // The test run and the start of the create run hold the SAP queue; it is handed on with the filled screen.
      const result = await inQueue(onWaiting, async onLine => {
        const tested = await run(dir, 'test', request, 'test.txt', TEST_TIMEOUT_MS)
        if (!tested?.ok) throw scriptFailure(tested, 'Prøvekørslen i MI31')
        const log = parseMi31Log(await fs.promises.readFile(path.join(dir, 'test.txt'), 'utf8'))
        const listed = new Set(log.items.filter(item => item.sloc === request.sloc).map(item => item.material))
        const missing = request.materials.filter(material => !listed.has(material))
        if (log.errors > 0 || missing.length) {
          const problems = log.items.filter(item => item.message).map(item => `${item.material}: ${item.message}`)
          throw writeError('PIDOC_NOT_POSSIBLE', `SAP vil ikke oprette dokument for ${missing.join(', ') || 'alle materialer'}${problems.length ? ` (${problems.join('; ')})` : ''}. Der er ikke oprettet noget`, { missing, problems })
        }
        // From the hand-over on SAP may create the documents: a failure after the user's F8 leaves that unknown. Before
        // the script says {"stage":"waiting"} the user does not have the screen, so nothing can have been created.
        create = watchHandOver(onLine)
        try {
          return await run(dir, 'create', request, 'mi22.txt', (waitSeconds + 120) * 1000, create.onLine)
        } catch (error) {
          if (error?.code !== 'SAP_TIMEOUT' && error?.code !== 'SAP_SCRIPT_FAILED') throw error
          if (!create.handedOver) throw writeError('PIDOC_SAP_FAILED', `Oprettelsen i MI31 stoppede, før SAP-skærmen blev givet til dig (${error.code}). Intet er oprettet`)
          // Killed at the time limit, or the script broke after the hand-over: the user may have pressed F8.
          throw unknownState('pidoc-create', error.code)
        }
      })
      if (!result?.ok && create.handedOver && !beforeF8(result?.error)) throw unknownState('pidoc-create', result?.error || 'no-answer')
      if (!result?.ok) throw scriptFailure(result, 'Oprettelsen i MI31')
      let found
      try {
        found = parseMi22(await fs.promises.readFile(path.join(dir, 'mi22.txt'), 'utf8')).filter(doc => doc.physInvNo === request.reference && doc.sloc === request.sloc)
      } catch (error) {
        throw unknownState('pidoc-create', error?.code || error?.message)
      }
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
   * posted is read from MI22 afterwards (no longer "Doc. Active"); SAP's messages give the material documents. MI22 is
   * filled with the interval lowest..highest number (the clipboard may have changed meanwhile), so its list is filtered
   * to the chosen documents.
   */
  async function postDocuments({ docNos, year }, { onWaiting = () => {} } = {}) {
    const list = [...new Set((docNos || []).map(String))]
    if (!list.length || list.some(docNo => !/^\d{9,10}$/.test(docNo)) || !/^\d{4}$/.test(String(year || ''))) throw writeError('PIDOC_INVALID', 'Ugyldige dokumenter')
    if (list.length > 1 && !clipboard) throw writeError('PIDOC_SAP_FAILED', 'Udklipsholderen er ikke tilgængelig')
    return exclusiveWrite(onWaiting, async (dir, onLine) => {
      if (list.length > 1 && !(await putOnClipboard(clipboard, list.join('\r\n')))) throw writeError('CLIPBOARD_REFUSED', CLIPBOARD_REFUSED)
      const numbers = list.map(BigInt)
      const low = String(numbers.reduce((a, b) => (b < a ? b : a)))
      const high = String(numbers.reduce((a, b) => (b > a ? b : a)))
      const result = lastJsonLine(await runWaiting('pidoc-post', [system, String(year), dir, 'mi20.txt', 'mi22.txt', String(waitSeconds), list[0], low, high, ...(list.length > 1 ? ['clipboard'] : [])], { timeoutMs: (waitSeconds + 300) * 1000, onLine }))
      // The screens are logged from the hand-over on: any failure after it (MI22 not read, a timeout, a closed window
      // without a session for MI22) leaves the user's posting unknown.
      if (!result?.ok && (result?.timedOut || result?.error === 'closed-unknown' || result?.screens)) throw unknownState('pidoc-post', result?.error)
      if (!result?.ok) throw scriptFailure(result, 'Bogføringen i MI20')
      // The user has posted by now: lists that cannot be read leave the posting unknown, never "intet er gemt".
      let differences
      let status
      try {
        differences = parseMi20(await fs.promises.readFile(path.join(dir, 'mi20.txt'), 'utf8')).filter(item => list.includes(item.docNo))
        status = parseMi22(await fs.promises.readFile(path.join(dir, 'mi22.txt'), 'utf8')).filter(doc => list.includes(doc.docNo))
      } catch (error) {
        throw unknownState('pidoc-post', error?.code || error?.message)
      }
      const materialDocs = {}
      for (const match of String(result.screens || '').matchAll(/doc\.\s*(\d{9,10})\s+posted with m\.\s*doc\.\s*(\d+)/gi)) materialDocs[match[1]] = match[2]
      const posted = list.filter(docNo => status.some(doc => doc.docNo === docNo) && status.filter(doc => doc.docNo === docNo).every(doc => !/active/i.test(doc.status)))
      // Not listed by MI22 at all (e.g. a wrong selection): nobody knows, so it is never reported as "open".
      const seen = new Set(status.map(doc => doc.docNo))
      return { posted, open: list.filter(docNo => seen.has(docNo) && !posted.includes(docNo)), unknown: list.filter(docNo => !seen.has(docNo)), differences, materialDocs }
    })
  }

  /** MI02: the user deletes from the initial screen (waste bin). Deleted = SAP's message, and MI22 no longer lists it as active. */
  async function deleteDocument({ docNo, year, reference }, { onWaiting = () => {} } = {}) {
    checkDoc({ docNo, year })
    if (!REFERENCE.test(String(reference || '').toUpperCase())) throw writeError('PIDOC_INVALID', 'Dokumentet mangler CountPoints kode')
    return exclusiveWrite(onWaiting, async (dir, onLine) => {
      const result = lastJsonLine(await runScript('pidoc-delete', [system, String(docNo), String(year), String(reference).toUpperCase(), dir, 'mi22.txt', String(waitSeconds)], { timeoutMs: (waitSeconds + 300) * 1000, onLine }))
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
      return await inQueue(onWaiting, async onLine => {
        const printNow = system === 'QS4' ? '0' : '1'
        const result = lastJsonLine(await runScript('pidoc-print', [system, request.docNo, request.year, request.sloc, printNow, String(waitSeconds)], { timeoutMs: (waitSeconds + 120) * 1000, onLine }))
        if (result?.error === 'cancelled') throw writeError('PIDOC_CANCELLED', 'Udskriften blev annulleret – dokumentet er ikke printet')
        if (!result?.ok) throw scriptFailure(result, 'Udskriften i MI21')
        return { message: String(result.message || '') }
      })
    } finally {
      writing = false
    }
  }

  /**
   * "Tjek i SAP" (read only): MI22 for the documents with `reference` and, with `docNo`, MI20 for that document. Runs in
   * the SAP queue after the same status check as the writes, but holds the queue to the end: nobody waits for the user.
   * `docs` are the documents MI22 lists with the reference (active: still "Doc. Active"); `counted` the materials MI20
   * lists as counted on `docNo`.
   */
  async function checkDocument({ reference, docNo = null, year }) {
    const request = { reference: String(reference || '').toUpperCase(), docNo: docNo === null || docNo === undefined || docNo === '' ? null : String(docNo), year: String(year || '') }
    if (!REFERENCE.test(request.reference) || (request.docNo !== null && !/^\d{9,10}$/.test(request.docNo)) || !/^\d{4}$/.test(request.year)) throw writeError('PIDOC_INVALID', 'Ugyldigt dokument')
    return bridge.exclusive(async () => {
      const state = computeSapState(lastJsonLine(await runScript('status')) || {}, expected)
      if (!state.ready) throw writeError('SAP_NOT_READY', 'SAP er ikke klar', { sapState: state.state })
      const dir = await fs.promises.mkdtemp(path.join(tempRoot, 'countpoint-pidoc-'))
      try {
        const result = lastJsonLine(await runScript('pidoc-check', [dir, 'mi22.txt', 'mi20.txt', request.year, request.reference, request.docNo || '-'], { timeoutMs: CHECK_TIMEOUT_MS }))
        if (!result?.ok) throw scriptFailure(result, 'Tjek i SAP')
        let rows
        let listed
        try {
          rows = result.mi22 === 'empty' ? [] : parseMi22(await fs.promises.readFile(path.join(dir, 'mi22.txt'), 'utf8')).filter(doc => doc.physInvNo === request.reference)
          listed = request.docNo === null || result.mi20 === 'empty' ? [] : parseMi20(await fs.promises.readFile(path.join(dir, 'mi20.txt'), 'utf8')).filter(item => item.docNo === request.docNo)
        } catch (error) {
          throw writeError('PIDOC_SAP_FAILED', `Tjek i SAP kunne ikke læse listerne (${error?.code || error?.message})`)
        }
        const byDoc = new Map()
        for (const row of rows) {
          if (!byDoc.has(row.docNo)) byDoc.set(row.docNo, { docNo: row.docNo, materials: [], active: false })
          const doc = byDoc.get(row.docNo)
          if (!doc.materials.includes(row.material)) doc.materials.push(row.material)
          if (/active/i.test(row.status)) doc.active = true
        }
        return { docs: [...byDoc.values()], counted: [...new Set(listed.map(item => item.material))] }
      } finally {
        await fs.promises.rm(dir, { recursive: true, force: true })
      }
    })
  }

  return { createDocument, printDocument, enterSerials, enterCounts, postDocuments, deleteDocument, checkDocument }
}

module.exports = { createPiDocWriter }
