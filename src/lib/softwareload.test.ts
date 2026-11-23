import { describe, expect, it } from 'vitest'
import { commentsFor, commentsOnTask, finishTitle, outcomeLabel, previewGroups, sapRunErrorMessage, SOFTWARELOAD_TARGETS, summarizeByMaterial, summarizeTasks, targetLabel, taskForMaterial, TYPE_LABELS } from './softwareload'
import { setWarehouseLanguage } from './warehouse/text'
import type { SoftwareloadComment, SoftwareloadOutcome, SoftwareloadResult, SoftwareloadTask } from '@/types/warehouse'

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

describe('finishTitle', () => {
  const moved = { ...result('to-target'), steps: [{ from: 'D001', to: 'D006', doc: '49', by: 'a', at: 0 }] }
  it('says "flyttet i SAP" only when something moved, and says so when not all did', () => {
    expect(finishTitle({ a: moved })).toBe('Opgaven er afsluttet og flyttet i SAP')
    expect(finishTitle({ a: moved, b: result('failed-sap') })).toBe('Opgaven er afsluttet. Noget er flyttet i SAP, men ikke alt')
    expect(finishTitle({ a: result('skipped'), b: result('not-found') })).toBe('Opgaven er afsluttet. Intet er flyttet i SAP')
    expect(finishTitle({})).toBe('Opgaven er afsluttet. Der var ingen terminaler at flytte')
    expect(finishTitle({ a: moved }, 'Anna')).toBe('Annas opgave er afsluttet og flyttet i SAP')
    setWarehouseLanguage('en')
    try {
      expect(finishTitle({ a: result('skipped') }, 'Anna')).toBe("Anna's task is finished. Nothing was moved in SAP")
    } finally {
      setWarehouseLanguage('da')
    }
  })
})

describe('summarizeTasks', () => {
  it('summarizeTasks: per person and type, the pace counts every terminal not marked failed, failed counted apart', () => {
    const summary = summarizeTasks([
      task({ id: 'a1', workedMs: HOUR, terminals: { ...terminals('a', 20), ...terminals('af', 1, true) },
        results: { ...results('a', 20, 'to-target'), af0: result('to-blocked') } }),
      task({ id: 'a2', workedMs: HOUR / 2, terminals: { ...terminals('b', 9), ...terminals('x', 1), ...terminals('bf', 1, true) },
        results: { ...results('b', 9, 'to-target'), x0: result('failed-sap'), bf0: result('to-d002') } }),
      task({ id: 'a3', type: 'key', workedMs: HOUR, terminals: terminals('k', 3), results: results('k', 3, 'to-target') }),
      task({ id: 'b1', email: 'bo@example.test', name: 'Bo', type: 'sw', workedMs: HOUR, terminals: terminals('s', 5), results: results('s', 5, 'to-target') }),
      task({ id: 'ae', email: 'aeble@example.test', name: 'Æble', type: 'sw', workedMs: HOUR, terminals: terminals('e', 1), results: results('e', 1, 'skipped') }),
    ])
    expect(summary.map(row => [row.key, row.name, row.type, row.tasks, row.moved, row.failed, row.sapFailed, row.workedMs, row.perHour])).toEqual([
      ['anna@example.test|sw+key', 'Anna', 'sw+key', 2, 30, 2, 1, 1.5 * HOUR, 20],
      ['anna@example.test|key', 'Anna', 'key', 1, 3, 0, 0, HOUR, 3],
      ['bo@example.test|sw', 'Bo', 'sw', 1, 5, 0, 0, HOUR, 5],
      ['aeble@example.test|sw', 'Æble', 'sw', 1, 1, 0, 0, HOUR, 1],
    ])
  })

  it('summarizeTasks: zero worked time gives pace 0, not Infinity', () => {
    const [row] = summarizeTasks([task({ workedMs: 0, terminals: terminals('a', 4), results: results('a', 4, 'to-target') })])
    expect(row).toMatchObject({ moved: 4, workedMs: 0, perHour: 0 })
  })
})

describe('summarizeByMaterial', () => {
  const ofMaterial = (prefix: string, count: number, material: string): SoftwareloadTask['results'] =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i}`, { ...result('to-target'), material }]))

  it('summarizeByMaterial splits time by terminal count', () => {
    const summary = summarizeByMaterial([
      task({ id: 'a', workedMs: HOUR, terminals: { ...terminals('n', 6), ...terminals('r', 1), ...terminals('rf', 1, true) },
        results: { ...ofMaterial('n', 6, 'M-0'), ...ofMaterial('r', 1, 'M-R'), ...ofMaterial('rf', 1, 'm-r') } }),
      task({ id: 'b', workedMs: HOUR, terminals: terminals('s', 4), results: ofMaterial('s', 4, 'M-R') }),
      task({ id: 'c', workedMs: HOUR / 2, terminals: terminals('u', 2), results: {} }),
    ])
    expect(summary.map(row => [row.material, row.tasks, row.moved, row.failed, row.workedMs, row.perHour])).toEqual([
      ['', 1, 2, 0, HOUR / 2, 4],
      ['M-0', 1, 6, 0, 0.75 * HOUR, 8],
      ['M-R', 2, 5, 1, 1.25 * HOUR, 4],
    ])
  })

  it('taskForMaterial keeps only the material\'s terminals and their share of the time', () => {
    const mixed = task({ workedMs: HOUR, terminals: terminals('n', 3), results: { ...ofMaterial('n', 1, 'M-0'), n1: { ...result('to-target'), material: 'M-R' }, n2: { ...result('to-target'), material: 'M-R' } } })
    const part = taskForMaterial(mixed, 'm-r')!
    expect([Object.keys(part.terminals), Object.keys(part.results), part.workedMs]).toEqual([['n1', 'n2'], ['n1', 'n2'], (2 / 3) * HOUR])
    expect(taskForMaterial(mixed, 'M-X')).toBeNull()
  })
})

describe('commentsFor', () => {
  const by = { email: 'mona@example.test', name: 'Mona' }
  const comment = (id: string, fields: Partial<SoftwareloadComment>): SoftwareloadComment => ({ id, from: '2026-11-01', to: '2026-11-30', text: id, by, at: 0, ...fields })
  const both = comment('both', { material: 'M-R', version: 'v2' })
  const material = comment('material', { material: 'M-R' })
  const version = comment('version', { version: 'v1' })
  const whole = comment('whole', {})
  const all = [both, material, version, whole]
  const ids = (list: SoftwareloadComment[]) => list.map(item => item.id)

  it('commentsFor matches material and version, and empty fields match everything', () => {
    expect(ids(commentsFor(all, {}))).toEqual(['both', 'material', 'version', 'whole'])
    expect(ids(commentsFor(all, { material: '', version: '' }))).toEqual(['both', 'material', 'version', 'whole'])
    expect(ids(commentsFor(all, { material: 'm-r' }))).toEqual(['both', 'material', 'version', 'whole'])
    expect(ids(commentsFor(all, { material: 'M-0' }))).toEqual(['version', 'whole'])
    expect(ids(commentsFor(all, { version: 'v1' }))).toEqual(['material', 'version', 'whole'])
    expect(ids(commentsFor(all, { material: 'M-R', version: 'v2' }))).toEqual(['both', 'material', 'whole'])
    // Without a chosen material, a comment on one counts when that material is in the numbers shown.
    expect(ids(commentsFor(all, { material: ['M-0', 'M-R'], version: ['v1'] }))).toEqual(['material', 'version', 'whole'])
    expect(ids(commentsFor(all, { material: [] }))).toEqual(['version', 'whole'])
  })

  it('commentsOnTask marks a task started in the period with its material and version', () => {
    const loaded = task({ startedAt: new Date(2026, 10, 18, 7).getTime(), version: 'v2', results: { a: { ...result('to-target'), material: 'M-R' } } })
    expect(ids(commentsOnTask([...all, comment('december', { from: '2026-12-01', to: '2026-12-31' })], loaded))).toEqual(['both', 'material', 'whole'])
    expect(ids(commentsOnTask([comment('day', { from: '2026-11-18', to: '2026-11-18' })], loaded))).toEqual(['day'])
  })
})
