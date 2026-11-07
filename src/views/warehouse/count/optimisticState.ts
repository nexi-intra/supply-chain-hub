import type { Approval, Claim, CountLine, CountState, MaterialLock, Member } from '@/types/warehouse'

// A write to M: takes 15–90 s, so a count shows its own changes at once. Each change is an overlay laid over every
// state read from the drive until a read started after the write was done (that read already contains it). A failed
// write just drops its overlay: the screen goes back to what the drive says.

export type StatePatch = (state: CountState) => CountState

interface Overlay {
  apply: StatePatch
  settledAt: number | null
}

export interface Overlays {
  add: (apply: StatePatch) => Overlay
  settle: (overlay: Overlay, at: number) => void
  remove: (overlay: Overlay) => void
  /** A state read from the drive that was started at `startedAt` arrived: drop the overlays it already contains. */
  received: (startedAt: number) => void
  apply: (state: CountState) => CountState
  size: () => number
}

export function createOverlays(): Overlays {
  let overlays: Overlay[] = []
  return {
    add(apply) {
      const overlay = { apply, settledAt: null }
      overlays.push(overlay)
      return overlay
    },
    settle(overlay, at) { overlay.settledAt = at },
    remove(overlay) { overlays = overlays.filter(item => item !== overlay) },
    received(startedAt) { overlays = overlays.filter(item => item.settledAt === null || item.settledAt >= startedAt) },
    apply: state => overlays.reduce((current, overlay) => overlay.apply(current), state),
    size: () => overlays.length,
  }
}

export const withApprovals = (changes: Record<string, Approval>): StatePatch => state => ({ ...state, approvals: { ...state.approvals, ...changes } })

export const withMember = (member: Member): StatePatch => state => {
  const members = state.members.some(item => item.email === member.email) ? state.members.map(item => (item.email === member.email ? member : item)) : [...state.members, member]
  const me = member.email === state.me.email ? { ...state.me, status: member.status } : state.me
  return { ...state, members, me }
}

export const withClaim = (area: string, claim: Claim | null): StatePatch => state => {
  const exists = state.claims.some(item => item.area === area)
  const claims = !claim ? state.claims.filter(item => item.area !== area) : exists ? state.claims.map(item => (item.area === area ? claim : item)) : [...state.claims, claim]
  return { ...state, claims }
}

export const withMaterialLock = (material: string, change: (lock: MaterialLock | null) => MaterialLock | null): StatePatch => state => {
  const current = state.materialLocks.find(lock => lock.material === material) || null
  const next = change(current)
  if (next === current) return state
  if (!next) return { ...state, materialLocks: state.materialLocks.filter(lock => lock.material !== material) }
  return { ...state, materialLocks: current ? state.materialLocks.map(lock => (lock.material === material ? next : lock)) : [...state.materialLocks, next] }
}

/** The holder (or the owner) answers a request to count along: the asker becomes a helper or is turned away. */
export const answerRequest = (material: string, email: string, allow: boolean): StatePatch => withMaterialLock(material, lock => {
  const request = lock?.requests.find(item => item.email === email)
  if (!lock || !request) return lock
  return { ...lock, requests: lock.requests.filter(item => item.email !== email), helpers: allow ? [...lock.helpers.filter(item => item.email !== email), { email, name: request.name, at: Date.now() }] : lock.helpers }
})

/** Asks the holder to count along (shown as "Anmodning sendt"). */
export const askToCount = (material: string, person: { email: string; name: string }): StatePatch => withMaterialLock(material, lock => {
  if (!lock || lock.holder.email === person.email || lock.helpers.some(item => item.email === person.email) || lock.requests.some(item => item.email === person.email)) return lock
  return { ...lock, requests: [...lock.requests, { ...person, at: Date.now() }] }
})

/** Takes a free material for `person` (nothing changes when it is already theirs or someone else's). */
export const takeLock = (material: string, person: { email: string; name: string }): StatePatch => withMaterialLock(material, lock => lock || { material, holder: person, at: Date.now(), helpers: [], requests: [] })

/** Releases a material: a helper only leaves; the holder (or the owner/a manager) frees it for everyone. */
export const releaseLock = (material: string, email: string): StatePatch => withMaterialLock(material, lock => {
  if (!lock) return lock
  if (lock.holder.email !== email && lock.helpers.some(item => item.email === email)) return { ...lock, helpers: lock.helpers.filter(item => item.email !== email) }
  return null
})

export const withMeta = (changes: Partial<CountState['meta']>, me: Partial<CountState['me']> = {}): StatePatch => state => ({ ...state, meta: { ...state.meta, ...changes }, me: { ...state.me, ...me } })

const round2 = (value: number) => Math.round(value * 100) / 100

/** Moves the counted quantity of the line's row by `delta` (rows of materials outside SAP's list are left alone). */
function shiftRow(state: CountState, line: Pick<CountLine, 'material' | 'sloc' | 'stockType'>, delta: number): CountState['rows'] {
  if (!delta) return state.rows
  const index = state.rows.findIndex(row => row.material === line.material && row.stockType === line.stockType && (!line.sloc || row.sloc === line.sloc))
  if (index < 0) return state.rows
  const row = state.rows[index]
  const diff = row.diff + delta
  const rows = [...state.rows]
  rows[index] = { ...row, countedLines: row.countedLines + delta, counted: row.counted + delta, diff, valueDiff: row.unitPrice === null ? null : round2(diff * row.unitPrice) }
  return rows
}

/** A count line saved (new or changed): in the list of lines and in its row's counted quantity. */
export const withLine = (line: CountLine): StatePatch => state => {
  const previous = state.lines.find(item => item.lineId === line.lineId)
  const sloc = line.sloc || previous?.sloc || state.rows.find(row => row.material === line.material && row.stockType === line.stockType)?.sloc || ''
  const saved = { ...line, sloc }
  const lines = previous ? state.lines.map(item => (item.lineId === line.lineId ? saved : item)) : [saved, ...state.lines]
  const shifted = previous && (previous.sloc !== sloc || previous.stockType !== line.stockType)
    ? shiftRow({ ...state, rows: shiftRow(state, previous, -previous.qty) }, saved, saved.qty)
    : shiftRow(state, saved, saved.qty - (previous?.qty || 0))
  return { ...state, lines, rows: shifted }
}

export const withoutLine = (lineId: string): StatePatch => state => {
  const previous = state.lines.find(item => item.lineId === lineId)
  if (!previous) return state
  return { ...state, lines: state.lines.filter(item => item.lineId !== lineId), rows: shiftRow(state, previous, -previous.qty) }
}
