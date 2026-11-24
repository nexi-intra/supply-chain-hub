// "Vis i SAP": opens a physical inventory document (MI03) or a material document (MB03, shown in MIGO) in a new SAP
// window with scripts/sap/sap-show.vbs. Display only; the script never saves or posts anything.
const { SAP_SYSTEMS } = require('./config.cjs')

const KINDS = Object.freeze(['mi03', 'mb03'])
const FAILURES = {
  'sap-not-running': 'SAP er ikke åbent',
  'sap-busy': 'SAP er optaget - prøv igen om lidt',
  'max-sessions': 'Der er allerede 6 SAP-vinduer åbne - luk et og prøv igen',
  'no-access-mi03': 'Du har ikke adgang til MI03 i SAP',
  'no-access-migo': 'Du har ikke adgang til MIGO i SAP',
  'migo-not-display': 'MIGO kunne ikke stilles i visning - dokumentet blev ikke åbnet',
}

function codeError(code, message) {
  return Object.assign(new Error(message || code), { code })
}

function createSapViewer({ bridge, runScript }) {
  async function show({ system, kind, docNo, year } = {}) {
    const request = { system: String(system || ''), kind: String(kind || ''), docNo: String(docNo || ''), year: String(year || '') }
    if (!SAP_SYSTEMS.includes(request.system) || !KINDS.includes(request.kind) || !/^\d{9,10}$/.test(request.docNo) || !/^\d{4}$/.test(request.year)) throw codeError('SAP_SHOW_INVALID', 'Dokumentet kan ikke vises i SAP')
    const output = await bridge.exclusive(() => runScript('sap-show', [request.system, request.kind, request.docNo, request.year], { timeoutMs: 120000 }))
    const result = JSON.parse(String(output).trim().split(/\r?\n/).pop())
    if (result.ok) return { ok: true }
    const error = String(result.error || '')
    if (error === `not-logged-in-${request.system}`) throw codeError('SAP_SHOW_FAILED', `Log på ${request.system} i SAP først`)
    throw codeError('SAP_SHOW_FAILED', FAILURES[error] || `SAP kunne ikke vise dokumentet (${error || 'ukendt fejl'})`)
  }
  return { show }
}

module.exports = { createSapViewer }
