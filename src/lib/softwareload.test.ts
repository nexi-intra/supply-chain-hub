import { describe, expect, it } from 'vitest'
import { outcomeLabel, previewGroups, sapRunErrorMessage, SOFTWARELOAD_TARGETS, summarizeTasks, targetLabel, TYPE_LABELS } from './softwareload'
import { setWarehouseLanguage } from './warehouse/text'
import type { SoftwareloadOutcome, SoftwareloadResult, SoftwareloadTask } from '@/types/warehouse'

const HOUR = 3_600_000
const result = (outcome: SoftwareloadOutcome): SoftwareloadResult => ({ material: 'M-0', from: 'D001', outcome, steps: [] })
const task = (overrides: Partial<SoftwareloadTask>): SoftwareloadTask => ({
  id: 'x', team: 'TRR', email: 'anna@example.test', name: 'Anna', type: 'sw+key', kif: false, target: 'D010', version: '1.0',
  startedAt: 0, endedAt: 0, pauses: [], pausedMs: 0, workedMs: HOUR, terminals: {}, results: {}, state: 'faerdig', ...overrides,
})
const terminals = (prefix: string, count: number, failed = false): SoftwareloadTask['terminals'] =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i}`, failed
    ? { at: 0, failed: { note: 'død', at: 0, by: { email: 'anna@example.test', name: 'Anna' } } }
    : { at: 0 }]))
const results = (prefix: string, count: number, outcome: SoftwareloadOutcome): SoftwareloadTask['results'] =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i}`, result(outcome)]))

describe('labels', () => {
  it('names the types and every outcome in both languages', () => {
    expect(TYPE_LABELS['sw+key']).toEqual({ da: 'Softwareload + keyload', en: 'Softwareload + keyload' })
    expect(outcomeLabel('to-target')).toEqual({ da: 'Flyttet til målet', en: 'Moved to target' })
    expect(outcomeLabel('interrupted')).toEqual({ da: 'Afbrudt', en: 'Interrupted' })
  })
})

describe('targets', () => {
  it('targetLabel shows SAP description and team', () => {
    expect(SOFTWARELOAD_TARGETS.map(item => item.sloc)).toEqual(['D000', 'D001', 'D002', 'D003', 'D004', 'D005', 'D006'])
    expect(targetLabel('D002')).toBe('D002 · Repair (TRR)')
    expect(targetLabel('D005')).toBe('D005 · SA \u2013 secure room (TCD)')
    expect(targetLabel('D000')).toBe('D000 · Central Warehous (TCD)')
    expect(targetLabel('D102')).toBe('D102')
    expect(targetLabel('')).toBe('')
  })
})

describe('previewGroups', () => {
  it('previewGroups sorts outcomes into the confirmation groups', () => {
    expect(previewGroups({
      a: 'to-target', b: 'to-blocked', c: 'to-d002', d: 'not-found', e: 'blocked-stock',
      f: 'skipped', g: 'manual', h: 'already-blocked', i: 'to-target', j: 'failed-sap',
    })).toEqual({
      toTarget: ['a', 'i'], toBlocked: ['b'], toD002: ['c'], notFound: ['d'], blockedStock: ['e'],
      skipped: ['f'], manual: ['g'], alreadyBlocked: ['h'],
    })
  })
})

describe('sapRunErrorMessage', () => {
  it('asks to check SAP, not to try again, when SAP may have posted without an answer', () => {
    expect(sapRunErrorMessage(new Error('Error: SAP_TIMEOUT'))).toBe('SAP svarede ikke i tide. Tjek i SAP før du fortsætter.')
    expect(sapRunErrorMessage(new Error('Error: SOFTWARELOAD_SAP_FAILED: Transfer i ZMS_PREP fejlede: unknown-result: SAPLSPO4/0300')))
      .toBe('Transfer i ZMS_PREP fejlede: unknown-result: SAPLSPO4/0300. Tjek i SAP før du fortsætter.')
    expect(sapRunErrorMessage(new Error('Error: SAP_NOT_READY: SAP er ikke klar'))).toBe('SAP er ikke klar')
    setWarehouseLanguage('en')
    try {
      expect(sapRunErrorMessage(new Error('Error: SAP_TIMEOUT'))).toBe('SAP did not answer in time. Check in SAP before you continue.')
    } finally {
      setWarehouseLanguage('da')
    }
  })
})

describe('summarizeTasks', () => {
  it('summarizeTasks: per person and type, failed counted apart and not in pace', () => {
    const summary = summarizeTasks([
      task({ id: 'a1', workedMs: HOUR, terminals: { ...terminals('a', 20), ...terminals('af', 1, true) },
        results: { ...results('a', 20, 'to-target'), af0: result('to-blocked') } }),
      task({ id: 'a2', workedMs: HOUR / 2, terminals: { ...terminals('b', 10), ...terminals('bf', 1, true) },
        results: { ...results('b', 10, 'to-target'), bf0: result('to-d002') } }),
      task({ id: 'a3', type: 'key', workedMs: HOUR, terminals: terminals('k', 3), results: results('k', 3, 'to-target') }),
      task({ id: 'b1', email: 'bo@example.test', name: 'Bo', type: 'sw', workedMs: HOUR, terminals: terminals('s', 5), results: results('s', 5, 'to-target') }),
      task({ id: 'ae', email: 'aeble@example.test', name: 'Æble', type: 'sw', workedMs: HOUR, terminals: terminals('e', 1), results: results('e', 1, 'skipped') }),
    ])
    expect(summary.map(row => [row.key, row.name, row.type, row.tasks, row.moved, row.failed, row.workedMs, row.perHour])).toEqual([
      ['anna@example.test|sw+key', 'Anna', 'sw+key', 2, 30, 2, 1.5 * HOUR, 20],
      ['anna@example.test|key', 'Anna', 'key', 1, 3, 0, HOUR, 3],
      ['bo@example.test|sw', 'Bo', 'sw', 1, 5, 0, HOUR, 5],
      ['aeble@example.test|sw', 'Æble', 'sw', 1, 0, 0, HOUR, 0],
    ])
  })

  it('summarizeTasks: zero worked time gives pace 0, not Infinity', () => {
    const [row] = summarizeTasks([task({ workedMs: 0, terminals: terminals('a', 4), results: results('a', 4, 'to-target') })])
    expect(row).toMatchObject({ moved: 4, workedMs: 0, perHour: 0 })
  })
})
