import { beforeEach, describe, expect, it } from 'vitest'
import { setWarehouseLanguage } from '@/lib/warehouse/text'
import type { MatdocTarget } from '@/types/warehouse'
import { reasonText, targetProblem } from './TeamMatdocImport'

const target = (patch: Partial<MatdocTarget>): MatdocTarget => ({ outcome: 'ok', countId: null, countName: null, sloc: null, stockType: null, groups: [], byCount: [], rows: [], unknown: 0, ...patch })

describe('targetProblem', () => {
  beforeEach(() => setWarehouseLanguage('da'))

  it('has no problem when the document belongs to one count', () => {
    expect(targetProblem(target({ outcome: 'ok', countId: 'c1', countName: 'D001', sloc: 'D001', stockType: 'unrestricted' }))).toBeNull()
  })

  it('shows where the serials are when they are in different places in SAP, and the unknown ones', () => {
    const problem = targetProblem(target({
      outcome: 'mixed',
      groups: [{ sloc: 'D001', stockType: 'unrestricted', count: 40 }, { sloc: 'D001', stockType: 'blocked', count: 2 }],
      unknown: 3,
    }))
    expect(problem).toEqual({
      title: 'Serienumrene ligger forskellige steder i SAP. Ret det i SAP, og slå op igen',
      lines: ['D001 Unblocked: 40', 'D001 Blocked: 2', 'Ukendte i de åbne optællingers SAP-tal: 3'],
    })
  })

  it('shows each count when the serials belong to several counts', () => {
    const problem = targetProblem(target({ outcome: 'several', byCount: [{ countId: 'a', countName: 'D000 terminaler', count: 5 }, { countId: 'b', countName: 'D000 tilbehør', count: 2 }] }))
    expect(problem?.title).toBe('Serienumrene hører til flere optællinger')
    expect(problem?.lines).toEqual(["'D000 terminaler': 5", "'D000 tilbehør': 2"])
  })

  it('counts the serials outside the open counts', () => {
    const rows = [
      { serial: 'A', material: 'M', sloc: 'D001', stockType: 'unrestricted' as const, countId: null, countName: null },
      { serial: 'B', material: 'M', sloc: 'D001', stockType: 'unrestricted' as const, countId: 'c1', countName: 'D001' },
      { serial: 'C', material: null, sloc: null, stockType: null, countId: null, countName: null },
    ]
    const problem = targetProblem(target({ outcome: 'outside', rows, byCount: [{ countId: 'c1', countName: 'D001', count: 1 }], unknown: 1 }))
    expect(problem?.title).toBe('Nogle serienumre hører ikke til nogen åben optælling')
    expect(problem?.lines).toEqual(['Uden for de åbne optællinger: 1', "'D001': 1", 'Ukendte i de åbne optællingers SAP-tal: 1'])
  })

  it('names the storage location and stock type nobody counts, in English too', () => {
    expect(targetProblem(target({ outcome: 'none', sloc: 'D002', stockType: 'blocked' }))?.title).toBe('Ingen åben optælling tæller D002 Blocked')
    setWarehouseLanguage('en')
    expect(targetProblem(target({ outcome: 'none', sloc: 'D002', stockType: 'blocked' }))?.title).toBe('No open count counts D002 Blocked')
    expect(targetProblem(target({ outcome: 'unknown', unknown: 4 }))).toEqual({ title: 'None of the serial numbers are in the SAP figures of the open counts', lines: [] })
  })

  it('says there are no open counts when the team has none', () => {
    expect(targetProblem(target({ outcome: 'unknown', unknown: 2 }), 0)).toEqual({ title: 'Der er ingen åbne optællinger', lines: [] })
    expect(targetProblem(target({ outcome: 'unknown', unknown: 2 }), 1)?.title).toBe('Ingen af serienumrene findes i de åbne optællingers SAP-tal')
  })
})

describe('reasonText', () => {
  beforeEach(() => setWarehouseLanguage('da'))

  it('tells why the import is not allowed', () => {
    expect(reasonText('not-member', 'D001 terminaler')).toBe("Du er ikke med i 'D001 terminaler'. Åbn optællingen og anmod om at være med")
    expect(reasonText('locked', 'D001')).toBe('Statussen er godkendt og låst')
    expect(reasonText('closed', 'D001')).toBe('Optællingen er afsluttet')
    expect(reasonText(null, 'D001')).toBeNull()
  })
})
