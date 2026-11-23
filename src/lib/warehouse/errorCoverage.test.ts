import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'
import { setWarehouseLanguage } from './text'

// Every code the warehouse backend throws must reach the screen as a text, in Danish and in English (shared.md S4).
const ROOT = join(__dirname, '..', '..', '..')
const CODE = "'([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)'"
const THROWN = [
  new RegExp(`\\b(?:codeError|fetchError|writeError|sapError)\\(\\s*${CODE}`, 'g'),
  new RegExp(`\\bcode:\\s*${CODE}`, 'g'),
  new RegExp(`\\.code\\s*=\\s*${CODE}`, 'g'),
]

function backendFiles(folder: string): string[] {
  return readdirSync(folder).flatMap(name => {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) return backendFiles(path)
    return name.endsWith('.cjs') && !name.endsWith('.test.cjs') ? [path] : []
  })
}

function thrownCodes(): Map<string, string> {
  const codes = new Map<string, string>()
  for (const file of backendFiles(join(ROOT, 'electron', 'warehouse'))) {
    const source = readFileSync(file, 'utf8')
    for (const pattern of THROWN) for (const match of source.matchAll(pattern)) if (!codes.has(match[1])) codes.set(match[1], relative(ROOT, file).replace(/\\/g, '/'))
  }
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
    return [...thrownCodes()].filter(([code]) => errorMessage(new Error(`Error: ${code}`)) === unexpected).map(([code, file]) => `${code} (${file})`)
  } finally {
    setWarehouseLanguage('da')
  }
}

describe('error texts for every backend code', () => {
  it('finds the codes the backend throws', () => {
    const codes = thrownCodes()
    for (const code of ['LOCATION_FULL', 'CLAIM_TAKEN', 'SAP_FORMAT', 'TEAM_NOT_ALLOWED', 'AUTH_UNTRUSTED_WINDOW', 'JOURNAL_CLOSED']) expect(codes.has(code), code).toBe(true)
  })

  it('every code has a Danish text', () => {
    expect(missing('da')).toEqual([])
  })

  it('every code has an English text', () => {
    expect(missing('en')).toEqual([])
  })
})
