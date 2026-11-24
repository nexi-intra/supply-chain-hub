import { describe, expect, it } from 'vitest'
import { drainScanQueue, dropOtherScanQueues, readScanQueue, scanQueueKey, writeScanQueue, type ScanJob } from './softwareloadScanQueue'

/** localStorage as the renderer has it, in memory. */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() { return items.size },
    key: index => [...items.keys()][index] ?? null,
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, String(value)) },
    removeItem: key => { items.delete(key) },
    clear: () => items.clear(),
  }
}

const codeError = (code: string) => new Error(`Error invoking remote method 'warehouse:softwareload:scan': Error: ${code}: detalje`)
const job = (serial: string, kind: ScanJob['kind'] = 'scan'): ScanJob => ({ kind, serial, at: 1 })

describe('scan queue in localStorage', () => {
  it('is kept per person and task, and an empty queue leaves nothing behind', () => {
    const storage = memoryStorage()
    writeScanQueue(storage, ' Anna@Example.test ', 't1', [job('A'), job('B', 'unscan')])
    expect(scanQueueKey('anna@example.test', 't1')).toBe('softwareload-scan-queue:anna@example.test:t1')
    expect(readScanQueue(storage, 'anna@example.test', 't1')).toEqual([job('A'), job('B', 'unscan')])
    expect(readScanQueue(storage, 'bo@example.test', 't1')).toEqual([])
    expect(readScanQueue(storage, 'anna@example.test', 't2')).toEqual([])
    writeScanQueue(storage, 'anna@example.test', 't1', [])
    expect(storage.length).toBe(0)
    storage.setItem(scanQueueKey('anna@example.test', 't1'), 'not json')
    expect(readScanQueue(storage, 'anna@example.test', 't1')).toEqual([])
  })

  it('drops the queues of the person\'s earlier tasks only', () => {
    const storage = memoryStorage()
    writeScanQueue(storage, 'anna@example.test', 'old', [job('A')])
    writeScanQueue(storage, 'anna@example.test', 't1', [job('B')])
    writeScanQueue(storage, 'bo@example.test', 'x', [job('C')])
    dropOtherScanQueues(storage, 'anna@example.test', 't1')
    expect([...Array(storage.length).keys()].map(index => storage.key(index)).sort()).toEqual([scanQueueKey('anna@example.test', 't1'), scanQueueKey('bo@example.test', 'x')])
  })
})

describe('drainScanQueue', () => {
  it('stops at an error it cannot judge, keeps the rest saved, and goes on later from there', async () => {
    const storage = memoryStorage()
    const jobs = [job('A'), job('B'), job('C')]
    const save = (left: ScanJob[]) => writeScanQueue(storage, 'anna@example.test', 't1', left)
    save(jobs)
    let driveUp = false
    const sent: string[] = []
    const send = async (item: ScanJob) => {
      if (item.serial === 'B' && !driveUp) throw codeError('STORAGE_UNAVAILABLE')
      sent.push(item.serial)
    }
    const first = await drainScanQueue(jobs, send, save, () => {})
    expect(first.stopped).toBeInstanceOf(Error)
    expect(readScanQueue(storage, 'anna@example.test', 't1').map(item => item.serial)).toEqual(['B', 'C'])
    driveUp = true
    const second = await drainScanQueue(readScanQueue(storage, 'anna@example.test', 't1'), send, save, () => {})
    expect(second.stopped).toBeNull()
    expect(sent).toEqual(['A', 'B', 'C'])
    expect(storage.length).toBe(0)
  })

  it('sends what is scanned while it runs, and saves it with the rest', async () => {
    const storage = memoryStorage()
    const jobs = [job('A')]
    const sent: string[] = []
    const saved: string[][] = []
    await drainScanQueue(jobs, async item => {
      if (item.serial === 'A') { jobs.push(job('B')); writeScanQueue(storage, 'anna@example.test', 't1', jobs) }
      sent.push(item.serial)
    }, left => saved.push(left.map(item => item.serial)), () => {})
    expect(sent).toEqual(['A', 'B'])
    expect(saved).toEqual([['B'], []])
  })

  it('drops a job only when the main process answers duplicate, invalid or not running', async () => {
    const outcomes: [string, string][] = []
    const answers: Record<string, string> = { A: 'SOFTWARELOAD_DUPLICATE', B: 'SOFTWARELOAD_INVALID', C: 'SOFTWARELOAD_NOT_RUNNING' }
    const left: ScanJob[][] = []
    const result = await drainScanQueue([job('A'), job('B'), job('C'), job('D')], async item => {
      if (answers[item.serial]) throw codeError(answers[item.serial])
    }, jobs => left.push(jobs), (item, outcome) => outcomes.push([item.serial, outcome]))
    expect(result.stopped).toBeNull()
    expect(outcomes).toEqual([['A', 'dropped'], ['B', 'dropped'], ['C', 'dropped'], ['D', 'saved']])
    expect(left[left.length - 1]).toEqual([])
  })
})
