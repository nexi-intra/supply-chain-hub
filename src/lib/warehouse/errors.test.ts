import { describe, expect, it } from 'vitest'
import { danishCodes, errorCode, errorMaterials, errorMessage } from './errors'
import { setWarehouseLanguage } from './text'

describe('errorMaterials', () => {
  it('reads the materials listed at the end of the detail', () => {
    const error = new Error("Error invoking remote method 'warehouse:counts:doc-fetch': Error: DOC_STOCK_MISSING: Dagens SAP-tal har ingen linje. Tallene er ikke gemt. Gælder: INT4300-4921-0 D000, R162-0717 D003 blocked")
    expect(errorCode(error)).toBe('DOC_STOCK_MISSING')
    expect(errorMaterials(error)).toEqual(['INT4300-4921-0 D000', 'R162-0717 D003 blocked'])
    expect(errorMaterials(new Error('Error: PIDOC_ZERO_CONFIRM'))).toEqual([])
  })
})

describe('errorCode', () => {
  it('reads the code from an Electron IPC error', () => {
    const error = new Error("Error invoking remote method 'auth:login': Error: AUTH_CREDENTIALS")
    expect(errorCode(error)).toBe('AUTH_CREDENTIALS')
  })

  it('returns null when there is no code', () => {
    expect(errorCode(new Error('something broke'))).toBeNull()
    expect(errorCode(undefined)).toBeNull()
  })
})

describe('errorMessage', () => {
  it('gives a Danish explanation for known codes', () => {
    expect(errorMessage(new Error("Error invoking remote method 'warehouse:me': Error: WAREHOUSE_TEAM_NOT_ALLOWED"))).toMatch(/TCD og TRR/)
    expect(errorMessage(new Error('Error: AUTH_CONTEXT_CHANGED'))).toMatch(/hub/)
  })

  it('falls back for unknown errors', () => {
    expect(errorMessage(new Error('Error: SOMETHING_NEW'), 'fallback')).toBe('fallback')
  })

  it('uses the Danish detail that follows the code', () => {
    const error = new Error("Error invoking remote method 'counts:scan': Error: COUNT_NOT_MEMBER: Du deltager ikke i optællingen")
    expect(errorCode(error)).toBe('COUNT_NOT_MEMBER')
    expect(errorMessage(error)).toBe('Du deltager ikke i optællingen')
  })

  it('explains storage and SAP problems', () => {
    expect(errorMessage(new Error('Error: STORAGE_UNAVAILABLE'))).toMatch(/M:/)
    expect(errorMessage(new Error('Error: SAP_NOT_READY: SAP er ikke klar'))).toBe('SAP er ikke klar')
    expect(errorMessage(new Error('Error: SAP_TIMEOUT'))).toMatch(/SAP/)
  })

  it('a refused clipboard says nothing was copied, in Danish and English', () => {
    const refused = new Error("Error invoking remote method 'warehouse:clipboard:write': Error: CLIPBOARD_REFUSED")
    expect(errorMessage(refused)).toMatch(/^Windows afviste udklipsholderen, så intet blev kopieret/)
    setWarehouseLanguage('en')
    try {
      expect(errorMessage(refused)).toMatch(/^Windows refused the clipboard, so nothing was copied/)
      expect(errorMessage(new Error('Error: CLIPBOARD_REFUSED: Udklipsholderen virker ikke lige nu'))).toMatch(/^Windows refused the clipboard/)
    } finally {
      setWarehouseLanguage('da')
    }
  })

  it('in English the softwareload codes that carry the service\'s detail still show it', () => {
    setWarehouseLanguage('en')
    try {
      expect(errorMessage(new Error('Error: SOFTWARELOAD_SAP_FAILED: Transfer i ZMS_PREP fejlede: unknown-result'))).toBe('The SAP step failed: Transfer i ZMS_PREP fejlede: unknown-result')
      expect(errorMessage(new Error('Error: SOFTWARELOAD_INVALID: Vælg en lokation fra listen'))).toBe('Invalid details for the task: Vælg en lokation fra listen')
      expect(errorMessage(new Error('Error: SOFTWARELOAD_SAVE_FAILED: SAP har lavet materialedokument 4905204921, men'))).toMatch(/4905204921/)
      expect(errorMessage(new Error('Error: SOFTWARELOAD_SAP_FAILED'))).toBe('The SAP step failed. Try again.')
    } finally {
      setWarehouseLanguage('da')
    }
  })

  it('in English the Danish backend detail is never shown; every Danish code has an English text', () => {
    setWarehouseLanguage('en')
    try {
      expect(errorMessage(new Error('Error: COUNT_NOT_MEMBER: Du deltager ikke i optællingen'))).toBe('You are not taking part in the count. Ask to join.')
      expect(errorMessage(new Error('Error: SOMETHING_NEW: ukendt'))).toBe('Something unexpected went wrong. Try again.')
      expect(errorMessage(new Error('Error: SOMETHING_NEW'), 'Not saved')).toBe('Not saved')
      for (const code of danishCodes()) expect(errorMessage(new Error(`Error: ${code}`)), code).not.toMatch(/[æøåÆØÅ]|unexpected/)
    } finally {
      setWarehouseLanguage('da')
    }
  })
})
