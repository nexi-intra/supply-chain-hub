import { describe, expect, it } from 'vitest'
import { danishCodes, errorCode, errorMaterials, errorMessage, scanErrorMessage } from './errors'
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
    expect(errorMessage(new Error('Error: STORAGE_UNAVAILABLE'))).toBe('Kan ikke nå data på M: lige nu. Prøv igen om lidt.')
    expect(errorMessage(new Error('Error: SAP_NOT_READY: SAP er ikke klar'))).toBe('SAP er ikke klar')
    expect(errorMessage(new Error('Error: SAP_TIMEOUT'))).toMatch(/SAP/)
  })

  it('only a scan in Optælling says scans are saved locally when M: is away', () => {
    const away = new Error("Error invoking remote method 'warehouse:counts:scan': Error: STORAGE_UNAVAILABLE")
    expect(errorMessage(away)).not.toMatch(/lokalt/)
    expect(scanErrorMessage(away)).toBe('Kan ikke nå data på M: lige nu. Scanninger gemmes lokalt og sendes, når forbindelsen er tilbage.')
    expect(scanErrorMessage(new Error('Error: COUNT_CLOSED: Optællingen er afsluttet'))).toBe('Optællingen er afsluttet')
    setWarehouseLanguage('en')
    try {
      expect(errorMessage(away)).toBe('The data on M: cannot be reached right now. Try again shortly.')
      expect(scanErrorMessage(away)).toBe('The data on M: cannot be reached right now. Scans are saved locally and sent when the connection is back.')
    } finally {
      setWarehouseLanguage('da')
    }
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

  it('a clock running in another hub names that hub in English too, and falls back without a hub', () => {
    const timeclock = new Error("Error invoking remote method 'warehouse:softwareload:start': Error: SOFTWARELOAD_TIMECLOCK_ELSEWHERE: Stempelkort kører i TCD. Stop det der først")
    const softwareload = new Error("Error invoking remote method 'warehouse:timeclock:start': Error: TIMECLOCK_SOFTWARELOAD_ELSEWHERE: Softwareload kører i TRR. Stop det der først")
    expect(errorMessage(timeclock)).toBe('Stempelkort kører i TCD. Stop det der først')
    setWarehouseLanguage('en')
    try {
      expect(errorMessage(timeclock)).toBe('Your time card is running in TCD. Stop it there first.')
      expect(errorMessage(softwareload)).toBe('Softwareload is running in TRR. Stop it there first.')
      expect(errorMessage(new Error('Error: TIMECLOCK_SOFTWARELOAD_ELSEWHERE'))).toBe('Softwareload is running in another hub. Stop it there first.')
    } finally {
      setWarehouseLanguage('da')
    }
  })

  it('in English the person, place and number in a Danish detail are kept (CLAIM_TAKEN and Placeringer)', () => {
    const en = (text: string) => errorMessage(new Error(`Error invoking remote method 'warehouse:x': Error: ${text}`))
    expect(en('CLAIM_TAKEN: Anna Holm tæller allerede område REOL 4')).toBe('Anna Holm tæller allerede område REOL 4')
    setWarehouseLanguage('en')
    try {
      expect(en('CLAIM_TAKEN: Anna Holm tæller allerede område REOL 4')).toBe('Anna Holm is already counting area REOL 4.')
      expect(en('CLAIM_TAKEN')).toBe('Someone else is already counting the area.')
      expect(en('LOCATION_FULL: A1.1 er fuld')).toBe('A1.1 is full.')
      expect(en('LOCATION_INACTIVE: A1.1 er deaktiveret')).toBe('A1.1 is deactivated.')
      expect(en('LOCATION_NOT_FOUND: Placeringen A9.9 findes ikke')).toBe('The location A9.9 does not exist.')
      expect(en('MATERIAL_MISMATCH: R162-0717 hører ikke til pluk-pladsen A2.4')).toBe('R162-0717 does not belong to the pick place A2.4.')
      expect(en('STOCK_TOO_LOW: Der er kun 5 stk. R162-0717 på E9 H5')).toBe('There are only 5 pcs of R162-0717 on E9 H5.')
      expect(en('LOCATION_NOT_EMPTY: Der står en palle på A2.4 – bekræft at den bliver pluk-pallen')).toBe('There is 1 pallet on A2.4. Confirm that it becomes the pick pallet.')
      expect(en('LOCATION_NOT_EMPTY: Der står 3 paller på A2.4 – bekræft at de bliver pluk-pallen')).toBe('There are 3 pallets on A2.4. Confirm that they become the pick pallet.')
      expect(en('LOCATION_NOT_EMPTY: Der står 2 materialer på E9 H5 – tøm hylden først')).toBe('There are 2 materials on E9 H5. Empty the shelf first.')
      expect(en('LOCATION_NOT_EMPTY: Der står 1 palle på E9 – flyt den først')).toBe('There is 1 pallet on E9. Move it first.')
      expect(en('UNDO_CONFLICT: Kan ikke fortrydes. Bo Jensen tog 5 stk. fra A1.1 kl. 10:32. Fortryd den først.')).toBe('Cannot be undone. Bo Jensen made a later change at 10:32. Undo that first.')
      expect(en('UNDO_CONFLICT: Kan ikke fortrydes. En anden flyttede pallen A1.1 → A1.2 kl. 23.11 10:32. Fortryd den først.')).toBe('Cannot be undone. Someone else made a later change at 23.11 10:32. Undo that first.')
      expect(en('UNDO_CONFLICT: Kan ikke fortrydes. A1.1 er en arbejdsstation.')).toBe('Cannot be undone. A1.1 is a work station.')
      expect(en('UNDO_CONFLICT: Kan ikke fortrydes. Noget er ændret siden.')).toBe('The action cannot be undone – something has changed since.')
      expect(en('APPROVAL_INVALID: R162-0717 er ikke godkendt')).toBe('R162-0717 is not approved.')
      expect(en('IMPORT_TOO_LARGE: Højst 5000 serienumre ad gangen')).toBe('At most 5000 serial numbers at a time.')
      expect(en('LOCATION_FULL: noget helt andet')).toBe('The location is full.')
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
      expect(errorMessage(new Error('Error: PIDOC_SAP_LANGUAGE: Log på SAP på engelsk (EN), og prøv igen'))).toBe('Log on to SAP in English (EN) and try again.')
      expect(errorMessage(new Error('Error: PIDOC_UNKNOWN: Optælling ved ikke, om SAP har gemt. Tjek dokumentet i SAP (MI03).'))).toBe('Stock count does not know whether SAP saved it. Check the document in SAP (MI03).')
      expect(errorMessage(new Error('Error: COUNT_NOT_MEMBER: Du deltager ikke i optællingen'))).toBe('You are not taking part in the count. Ask to join.')
      expect(errorMessage(new Error('Error: SOMETHING_NEW: ukendt'))).toBe('Something unexpected went wrong. Try again.')
      expect(errorMessage(new Error('Error: SOMETHING_NEW'), 'Not saved')).toBe('Not saved')
      for (const code of danishCodes()) expect(errorMessage(new Error(`Error: ${code}`)), code).not.toMatch(/[æøåÆØÅ]|unexpected/)
    } finally {
      setWarehouseLanguage('da')
    }
  })
})
