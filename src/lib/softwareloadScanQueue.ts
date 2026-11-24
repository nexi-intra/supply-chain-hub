// Scans of the running softwareload task wait in the renderer's localStorage until the main process has saved them,
// so a scan survives a drive that does not answer, a closed window or a restart. One queue per person and task.
import { errorCode } from './warehouse/errors'

export interface ScanJob {
  kind: 'scan' | 'unscan'
  serial: string
  /** When it was scanned on this PC (shown until the main process has it). */
  at: number
}

const PREFIX = 'softwareload-scan-queue:'
/** Answers after which a job is done with: it is already there, it can never be saved, or there is no task. */
const FINAL_CODES = ['SOFTWARELOAD_DUPLICATE', 'SOFTWARELOAD_INVALID', 'SOFTWARELOAD_NOT_RUNNING']

const person = (email: string) => email.trim().toLowerCase()
export const scanQueueKey = (email: string, taskId: string) => `${PREFIX}${person(email)}:${taskId}`

export function readScanQueue(storage: Storage, email: string, taskId: string): ScanJob[] {
  try {
    const saved = JSON.parse(storage.getItem(scanQueueKey(email, taskId)) || '[]') as unknown
    return Array.isArray(saved)
      ? saved.filter((item): item is ScanJob => (item?.kind === 'scan' || item?.kind === 'unscan') && typeof item.serial === 'string' && typeof item.at === 'number')
      : []
  } catch {
    return []
  }
}

/** Saves the jobs still to send; an empty queue removes the key. */
export function writeScanQueue(storage: Storage, email: string, taskId: string, jobs: ScanJob[]) {
  try {
    if (jobs.length) storage.setItem(scanQueueKey(email, taskId), JSON.stringify(jobs))
    else storage.removeItem(scanQueueKey(email, taskId))
  } catch { /* a full localStorage still leaves the queue in memory */ }
}

/** Removes the person's queues of other (earlier) tasks: those tasks are finished and cannot take the scans any more. */
export function dropOtherScanQueues(storage: Storage, email: string, taskId: string) {
  const own = `${PREFIX}${person(email)}:`
  const keep = scanQueueKey(email, taskId)
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key))
  for (const key of keys) if (key.startsWith(own) && key !== keep) storage.removeItem(key)
}

/**
 * Sends the jobs in order. A job leaves the queue when it is saved or when the answer is final (duplicate, invalid,
 * not running); any other error stops the run with the job still first, to be sent again later. The array is changed
 * in place, so jobs pushed onto it while it runs are sent too. `save` gets the jobs left after every job, `onResult`
 * hears what happened to each.
 */
export async function drainScanQueue(
  jobs: ScanJob[],
  send: (job: ScanJob) => Promise<unknown>,
  save: (left: ScanJob[]) => void,
  onResult: (job: ScanJob, outcome: 'saved' | 'dropped', error?: unknown) => void,
): Promise<{ stopped: unknown | null }> {
  while (jobs.length) {
    const job = jobs[0]
    try {
      await send(job)
      jobs.shift()
      save(jobs)
      onResult(job, 'saved')
    } catch (error) {
      if (!FINAL_CODES.includes(errorCode(error) ?? '')) return { stopped: error }
      jobs.shift()
      save(jobs)
      onResult(job, 'dropped', error)
    }
  }
  return { stopped: null }
}
