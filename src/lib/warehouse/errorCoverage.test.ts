import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'
import { setWarehouseLanguage } from './text'

// Every code the warehouse backend throws must reach the screen as a text, in Danish and in English (shared.md S4).
// Every code-shaped literal in the backend counts, so a code picked by a ternary or passed on in a variable is found too;
// the literals that are not error codes are listed below.
const ROOT = join(__dirname, '..', '..', '..')
const LITERAL = /(['"`])([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\1/g
const NOT_ERROR_CODES = new Set([
  // SAP transactions and export columns
  'ZMS_COUNT_SERIAL', 'ZMS_REP', 'ZMS_PREP', 'WERKS_LGORT', 'USER_STAT_TXT', 'USER_STAT', 'SNO_UNR', 'SNO_BLK', 'STOCK_TYPE_ICON', 'STOCK_TYPE', 'SESSION_MANAGER',
  // What stops a drawing from being published (shown in the publish panel, not thrown)
  'NAME_TWICE', 'SPECIAL_UNKNOWN', 'TYPE_REFUSED', 'NOT_EMPTY', 'NAME_TAKEN',
  // Notes on rows of the placement sheet import (shown in the import preview, not thrown)
  'AREA_FROM_NAME', 'UNKNOWN_TYPE', 'NOT_CHECKED', 'NOT_IN_SAP', 'DESCRIPTION_DIFFERS', 'MIXED_PLACE', 'ROW_SKIPPED', 'PALLET_PLACE_MANY',
  // An Error message without a code: the window gets UNEXPECTED_ERROR
  'CACHE_INVALID_KEY',
])

function backendFiles(folder: string): string[] {
  return readdirSync(folder).flatMap(name => {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) return backendFiles(path)
    return name.endsWith('.cjs') && !name.endsWith('.test.cjs') ? [path] : []
  })
}

function literals(): Map<string, string> {
  const found = new Map<string, string>()
  for (const file of backendFiles(join(ROOT, 'electron', 'warehouse'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(LITERAL)) if (!found.has(match[2])) found.set(match[2], relative(ROOT, file).replace(/\\/g, '/'))
  }
  return found
}

function thrownCodes(): Map<string, string> {
  const codes = new Map([...literals()].filter(([code]) => !NOT_ERROR_CODES.has(code)))
  // The Hub's secured IPC refuses a warehouse call before it reaches the module.
  for (const match of readFileSync(join(ROOT, 'electron', 'securedIpc.cjs'), 'utf8').matchAll(/'(AUTH_[A-Z_]+)'/g)) codes.set(match[1], 'electron/securedIpc.cjs')
  // The session check (authService.currentAsync) behind every warehouse call.
  for (const code of ['AUTH_REQUIRED', 'AUTH_CREDENTIALS', 'AUTH_PENDING', 'AUTH_REJECTED']) codes.set(code, 'electron/authService.cjs')
  return codes
}

function missing(language: 'da' | 'en'): string[] {
  setWarehouseLanguage(language)
  try {
    const unexpected = errorMessage(new Error('Error: SOMETHING_NEW'))
    return [...thrownCodes()].filter(([code]) => code !== 'UNEXPECTED_ERROR' && errorMessage(new Error(`Error: ${code}`)) === unexpected).map(([code, file]) => `${code} (${file})`)
  } finally {
    setWarehouseLanguage('da')
  }
}

describe('error texts for every backend code', () => {
  it('finds the codes the backend throws, also one chosen by a ternary, and the list of other literals is current', () => {
    const codes = thrownCodes()
    for (const code of ['LOCATION_FULL', 'CLAIM_TAKEN', 'SAP_FORMAT', 'TEAM_NOT_ALLOWED', 'AUTH_UNTRUSTED_WINDOW', 'JOURNAL_CLOSED', 'PIDOC_ZERO_CONFIRM']) expect(codes.has(code), code).toBe(true)
    const all = literals()
    expect([...NOT_ERROR_CODES].filter(code => !all.has(code)), 'no longer in the backend: remove from NOT_ERROR_CODES').toEqual([])
  })

  it('every code has a Danish text', () => {
    expect(missing('da')).toEqual([])
  })

  it('every code has an English text', () => {
    expect(missing('en')).toEqual([])
  })
})
